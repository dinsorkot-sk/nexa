import { AccessError, EngineError, UserError, ValidationError, type Context, type Domain, type Env } from '../contracts/index.js';
import {
  evaluateExpression, parseExpression, runServerScript, type ExprValue, type SafeScriptBridge,
} from '../expr/index.js';
import { expressionContext } from '../orm/compute.js';
import type { EnvImpl } from '../orm/env.js';
import {
  assertSystem, assertWritable, ensureServiceTables, positiveInt, requireKey, requireModel, tenantDriver,
} from './common.js';

/** Odoo ir.actions.server equivalents. Field values and messages are NX-Expr; scripts run in QuickJS. */
export type ServerActionType = 'update_record' | 'create_record' | 'post_message' | 'multi' | 'script';

export interface ServerActionDef {
  key: string;
  name?: string;
  /** Model the action applies to (required except for `multi`/`script` actions run without records). */
  model?: string;
  type: ServerActionType;
  /** update_record / create_record: field name -> NX-Expr evaluated per record (`record`, helpers). */
  values?: Record<string, string>;
  /** create_record: model to create in (defaults to `model`). */
  targetModel?: string;
  /** post_message: NX-Expr producing the message text. */
  message?: string;
  /** multi: ordered child action keys. */
  children?: string[];
  /** script: sandboxed JavaScript (QuickJS). `records` = { model, ids }. */
  code?: string;
}

export interface ServerActionRunOptions {
  model?: string;
  ids?: readonly number[];
  context?: Partial<Context>;
}

export interface ServerActionLimits {
  /** Rows read or affected per top-level run (default 1000). */
  maxRows?: number;
  /** Nested action depth (multi / call_action), default 5. */
  maxDepth?: number;
  /** Wall clock budget per script, default 5000ms. */
  scriptTimeoutMs?: number;
  /** Receives internal (non-engine) host errors raised during scripts; defaults to console.error. */
  onHostError?: (actionKey: string, error: unknown) => void;
}

interface ResolvedServerAction {
  key: string; name: string; model: string | null; type: ServerActionType;
  values: Record<string, string>; targetModel: string | null; message: string | null; children: string[]; code: string | null;
}

interface RunState {
  rows: number; readonly maxRows: number; readonly maxDepth: number; readonly timeoutMs: number; readonly logs: string[];
  readonly onHostError: (actionKey: string, error: unknown) => void;
}

function logHostError(actionKey: string, error: unknown): void {
  console.error(`[nexa] server action '${actionKey}' failed in a host call`, error);
}

const TYPES = new Set<ServerActionType>(['update_record', 'create_record', 'post_message', 'multi', 'script']);
const MAX_SCRIPT = 50_000;
const MAX_IDS = 10_000;
/** The only text a script sees for an internal (non-engine) host failure. */
const HOST_FAILURE = 'Internal host operation failed (NX_HOST_ERROR)';

/**
 * Executes server actions in the caller's Env and transaction: every ORM operation applies the
 * caller's ACLs and record rules (no sudo path), rows are bounded, nesting is depth-limited and any
 * failure rolls the whole run back. Definitions are admin-only (base.group_system or superuser).
 */
export class ServerActionService {
  constructor(private readonly env: Env, private readonly limits: ServerActionLimits = {}) {}

  async define(def: ServerActionDef): Promise<void> {
    await assertSystem(this.env);
    const action = validateDefinition(this.env, def);
    await ensureServiceTables(this.env);
    const [table] = await tenantDriver(this.env).query<{ ok: boolean }>({ text: `SELECT to_regclass('nx_action') IS NOT NULL AS ok`, params: [] });
    if (table?.ok && (await tenantDriver(this.env).query({ text: `SELECT 1 FROM nx_action WHERE xml_id=$1`, params: [action.key] })).length) {
      throw new ValidationError(`Server action key '${action.key}' collides with a module action`);
    }
    const { key, name, model, type, ...definition } = action;
    await tenantDriver(this.env).query({
      text: `INSERT INTO nx_server_action(key,name,model,type,definition) VALUES($1,$2,$3,$4,$5::jsonb)
        ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name,model=EXCLUDED.model,type=EXCLUDED.type,definition=EXCLUDED.definition`,
      params: [key, name, model, type, JSON.stringify(definition)],
    });
  }

  /** Look up a definition (stored server action or a module `server` action with sandboxed code). */
  async resolve(ref: string | number): Promise<ResolvedServerAction | null> {
    return loadAction(this.env, ref);
  }

  async run(ref: string | number, options: ServerActionRunOptions = {}): Promise<ExprValue> {
    const maxRows = this.limits.maxRows ?? 1_000;
    const maxDepth = this.limits.maxDepth ?? 5;
    const timeoutMs = this.limits.scriptTimeoutMs ?? 5_000;
    positiveInt(maxRows, 'action row limit');
    positiveInt(maxDepth, 'action depth limit');
    const ids = recordIds(options.ids ?? []);
    if (options.model !== undefined) requireModel(options.model);
    const base = (options.context ? this.env.withContext(options.context) : this.env) as EnvImpl;
    // one row budget for the whole cascade, including automations fired by the actions' own writes
    const inherited = base.actionState as RunState | undefined;
    const state: RunState = inherited ?? { rows: 0, maxRows, maxDepth, timeoutMs, logs: [], onHostError: this.limits.onHostError ?? logHostError };
    const env = inherited ? base : base.withActionState(state);
    return env.transaction(async () => execute(env, ref, options.model ?? null, ids, [], state));
  }
}

function validateDefinition(env: Env, def: ServerActionDef): ResolvedServerAction {
  if (!def || typeof def !== 'object') throw new ValidationError('Invalid server action');
  requireKey(def.key, 'server action key');
  if (!TYPES.has(def.type)) throw new ValidationError(`Unknown server action type '${String(def.type)}'`);
  const name = def.name ?? def.key;
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new ValidationError('Server action name must contain 1 to 200 characters');
  const model = def.model ?? null;
  if (model !== null) knownModel(env, model);
  const out: ResolvedServerAction = {
    key: def.key, name, model, type: def.type, values: {}, targetModel: null, message: null, children: [], code: null,
  };
  switch (def.type) {
    case 'update_record':
    case 'create_record': {
      const target = def.type === 'create_record' ? def.targetModel ?? model : model;
      if (!target) throw new ValidationError(`Server action '${def.key}' needs a model`);
      const meta = knownModel(env, target);
      if (def.type === 'create_record') out.targetModel = target;
      const values = def.values ?? {};
      if (typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) {
        throw new ValidationError(`Server action '${def.key}' needs field values`);
      }
      for (const [field, source] of Object.entries(values)) {
        if (!meta.fields.has(field)) throw new ValidationError(`Server action '${def.key}': unknown field '${field}' on '${target}'`);
        checkExpression(source, `Server action '${def.key}' value '${field}'`);
      }
      out.values = { ...values };
      break;
    }
    case 'post_message':
      if (!model) throw new ValidationError(`Server action '${def.key}' needs a model`);
      checkExpression(def.message, `Server action '${def.key}' message`);
      out.message = def.message!;
      break;
    case 'multi':
      if (!Array.isArray(def.children) || !def.children.length || def.children.length > 50) {
        throw new ValidationError(`Server action '${def.key}' needs 1 to 50 child actions`);
      }
      for (const child of def.children) {
        requireKey(child, 'child action key');
        if (child === def.key) throw new ValidationError(`Server action '${def.key}' cannot contain itself`);
      }
      out.children = [...def.children];
      break;
    case 'script':
      if (typeof def.code !== 'string' || !def.code.trim() || def.code.length > MAX_SCRIPT) {
        throw new ValidationError(`Server action '${def.key}' needs code of at most ${MAX_SCRIPT} characters`);
      }
      out.code = def.code;
      break;
  }
  return out;
}

function checkExpression(source: unknown, where: string): void {
  if (typeof source !== 'string' || !source.trim()) throw new ValidationError(`${where} must be an NX-Expr string`);
  try { parseExpression(source); } catch (error) {
    throw new ValidationError(`${where}: ${error instanceof Error ? error.message : 'invalid expression'}`);
  }
}

function knownModel(env: Env, model: string) {
  requireModel(model);
  const registry = (env as EnvImpl).registry;
  if (!registry.models.has(model)) throw new ValidationError(`Unknown model '${model}'`);
  return registry.get(model);
}

function recordIds(value: unknown): number[] {
  const list = Array.isArray(value) ? value : [value];
  if (list.length > MAX_IDS) throw new ValidationError('Too many record ids');
  for (const id of list) if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Record ids must be positive integers');
  return [...new Set(list as number[])];
}

function plainValues(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function jsonValue(value: unknown): ExprValue {
  return value === undefined ? null : JSON.parse(JSON.stringify(value)) as ExprValue;
}

async function loadAction(env: Env, ref: string | number): Promise<ResolvedServerAction | null> {
  await ensureServiceTables(env);
  const db = tenantDriver(env);
  type Row = { key: string; name: string; model: string | null; type: ServerActionType; definition: Record<string, unknown> };
  let rows: Row[];
  if (typeof ref === 'number') {
    positiveInt(ref, 'server action id');
    rows = await db.query<Row>({ text: `SELECT key,name,model,type,definition FROM nx_server_action WHERE id=$1`, params: [ref] });
  } else {
    requireKey(ref, 'server action key');
    rows = await db.query<Row>({ text: `SELECT key,name,model,type,definition FROM nx_server_action WHERE key=$1`, params: [ref] });
    if (!rows.length) {
      const [table] = await db.query<{ ok: boolean }>({ text: `SELECT to_regclass('nx_action') IS NOT NULL AS ok`, params: [] });
      if (table?.ok) {
        const [ui] = await db.query<{ xml_id: string; name: string; model: string | null; code: string }>({
          text: `SELECT xml_id,name,model,code FROM nx_action WHERE xml_id=$1 AND type='server' AND code IS NOT NULL`, params: [ref],
        });
        if (ui) {
          return { key: ui.xml_id, name: ui.name, model: ui.model, type: 'script', values: {}, targetModel: null, message: null, children: [], code: ui.code };
        }
      }
    }
  }
  const [row] = rows;
  if (!row) return null;
  const d = row.definition ?? {};
  return {
    key: row.key, name: row.name, model: row.model, type: row.type,
    values: (d.values as Record<string, string>) ?? {}, targetModel: (d.targetModel as string | null) ?? null,
    message: (d.message as string | null) ?? null, children: (d.children as string[]) ?? [], code: (d.code as string | null) ?? null,
  };
}

function charge(state: RunState, rows: number): void {
  if (state.rows + rows > state.maxRows) throw new ValidationError('Server action row quota exceeded');
  state.rows += rows;
}

async function readRecord(env: Env, model: string, id: number): Promise<Record<string, ExprValue>> {
  const [row] = await env.model(model).browse(id).read();
  if (!row) throw new AccessError('Record is unavailable');
  return jsonValue(row) as Record<string, ExprValue>;
}

async function evaluateFor(env: Env, source: string, record: Record<string, ExprValue> | null): Promise<ExprValue> {
  const helpers = await expressionContext(env as EnvImpl);
  return evaluateExpression(source, record ? { ...record, record, ...helpers } : helpers);
}

async function evaluateValues(env: Env, values: Record<string, string>, record: Record<string, ExprValue> | null): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [field, source] of Object.entries(values)) out[field] = await evaluateFor(env, source, record);
  return out;
}

/** Post a chatter message as the current user: the record must be writable (ACL + record rules). */
export async function postMessage(env: Env, model: string, recordId: number, message: string): Promise<number> {
  if (typeof message !== 'string' || !message.trim()) throw new ValidationError('Chatter message cannot be empty');
  if (message.length > 100_000) throw new ValidationError('Chatter message is too long');
  requireModel(model);
  positiveInt(recordId, 'record id');
  await assertWritable(env, model, recordId);
  await ensureServiceTables(env);
  const [row] = await tenantDriver(env).query<{ id: number }>({
    text: `INSERT INTO nx_audit_log(model,record_id,event,uid,payload) VALUES($1,$2,'message',$3,$4::jsonb) RETURNING id`,
    params: [model, recordId, env.uid, JSON.stringify({ message })],
  });
  return row.id;
}

async function execute(
  env: Env, ref: string | number, model: string | null, ids: number[], stack: readonly string[], state: RunState,
): Promise<ExprValue> {
  if (stack.length >= state.maxDepth) throw new ValidationError('Server action nesting limit exceeded');
  const action = await loadAction(env, ref);
  if (!action) throw new ValidationError(`Unknown server action '${String(ref)}'`);
  if (stack.includes(action.key)) throw new ValidationError(`Server action '${action.key}' calls itself recursively`);
  if (action.model && model && action.model !== model) {
    throw new ValidationError(`Server action '${action.key}' applies to '${action.model}', not '${model}'`);
  }
  const target = action.model ?? model;
  if (ids.length && !target) throw new ValidationError('Records need a model');
  if (target) knownModel(env, target);
  if (ids.length) {
    // the records must exist and pass the caller's read rules before anything runs on them
    const visible = await env.model(target!).browse(ids).read(['id']);
    if (visible.length !== ids.length) throw new AccessError('Record is unavailable');
  }
  const inner = [...stack, action.key];
  switch (action.type) {
    case 'update_record': {
      if (!target) throw new ValidationError(`Server action '${action.key}' needs a model`);
      charge(state, ids.length);
      for (const id of ids) {
        const values = await evaluateValues(env, action.values, await readRecord(env, target, id));
        await env.model(target).browse(id).write(values);
      }
      return true;
    }
    case 'create_record': {
      const createIn = action.targetModel ?? target;
      if (!createIn) throw new ValidationError(`Server action '${action.key}' needs a model`);
      const sources = ids.length ? ids : [null];
      charge(state, sources.length);
      const created: number[] = [];
      for (const id of sources) {
        const values = await evaluateValues(env, action.values, id === null ? null : await readRecord(env, target!, id));
        created.push(...(await env.model(createIn).create(values)).ids);
      }
      return created;
    }
    case 'post_message': {
      if (!target) throw new ValidationError(`Server action '${action.key}' needs a model`);
      charge(state, ids.length);
      for (const id of ids) {
        const message = await evaluateFor(env, action.message ?? '', await readRecord(env, target, id));
        await postMessage(env, target, id, typeof message === 'string' ? message : JSON.stringify(message));
      }
      return true;
    }
    case 'multi': {
      let last: ExprValue = null;
      for (const child of action.children) last = await execute(env, child, target, ids, inner, state);
      return last;
    }
    case 'script':
      return runScript(env, action, target, ids, inner, state);
  }
}

async function runScript(
  env: Env, action: ResolvedServerAction, model: string | null, ids: number[], stack: readonly string[], state: RunState,
): Promise<ExprValue> {
  const remaining = state.maxRows - state.rows;
  if (remaining < 1) throw new ValidationError('Server action row quota exceeded');
  const live = (signal?: AbortSignal): void => {
    if (signal?.aborted) throw new ValidationError('Server action was aborted');
  };
  const records = (name: string) => { knownModel(env, name); return env.model(name); };
  const bridge: SafeScriptBridge = {
    async search(name, domain, options, signal) {
      live(signal);
      if (domain !== undefined && domain !== null && !Array.isArray(domain)) throw new ValidationError('search domain must be a list');
      const opts = options === undefined || options === null ? {} : plainValues(options, 'search options');
      const fields = opts.fields === undefined ? ['id'] : opts.fields;
      if (!Array.isArray(fields) || !fields.every((f) => typeof f === 'string')) throw new ValidationError('search fields must be a list of names');
      if (opts.order !== undefined && typeof opts.order !== 'string') throw new ValidationError('search order must be a string');
      if (opts.offset !== undefined && (typeof opts.offset !== 'number' || !Number.isSafeInteger(opts.offset) || opts.offset < 0)) {
        throw new ValidationError('search offset must be a non-negative integer');
      }
      const limit = typeof opts.limit === 'number' ? opts.limit : remaining;
      const rows = await records(name).searchRead((domain ?? []) as Domain, fields as string[], {
        limit, ...(opts.offset !== undefined ? { offset: opts.offset as number } : {}), ...(opts.order ? { order: opts.order as string } : {}),
      });
      live(signal);
      charge(state, rows.length);
      return jsonValue(rows);
    },
    async create(name, values, signal) {
      live(signal);
      const list = Array.isArray(values) ? values.map((v) => plainValues(v, 'create values')) : [plainValues(values, 'create values')];
      charge(state, list.length);
      const created = await records(name).create(list);
      live(signal);
      return [...created.ids];
    },
    async write(name, rawIds, values, signal) {
      live(signal);
      const target = recordIds(rawIds);
      charge(state, target.length);
      await records(name).browse(target).write(plainValues(values, 'write values'));
      live(signal);
      return true;
    },
    async unlink(name, rawIds, signal) {
      live(signal);
      const target = recordIds(rawIds);
      charge(state, target.length);
      await records(name).browse(target).unlink();
      live(signal);
      return true;
    },
    async message_post(name, rawIds, message, signal) {
      live(signal);
      const target = recordIds(rawIds);
      charge(state, target.length);
      for (const id of target) {
        await postMessage(env, name, id, message);
        live(signal);
      }
      return true;
    },
    async call(actionId, args, limits, signal) {
      live(signal);
      const opts = args === undefined || args === null ? {} : plainValues(args, 'call_action arguments');
      const callIds = opts.ids === undefined ? ids : recordIds(opts.ids);
      const before = state.rows;
      const value = await execute(env, actionId, model, callIds, stack, state);
      live(signal);
      const rowsConsumed = state.rows - before;
      if (rowsConsumed > limits.maxRows) throw new ValidationError('Server action row quota exceeded');
      return { value: jsonValue(value), rowsConsumed };
    },
    raise(message) {
      throw new UserError(String(message).slice(0, 2_000));
    },
    log(message) {
      if (state.logs.length < 100) state.logs.push(String(message).slice(0, 2_000));
    },
  };
  const prelude = `globalThis.records = Object.freeze({ model: ${JSON.stringify(model)}, ids: Object.freeze(${JSON.stringify(ids)}) });\n`;
  const code = action.code ?? '';
  if (code.length > MAX_SCRIPT) throw new ValidationError('Script size quota exceeded');
  // Engine errors keep their class (HTTP mapping) after crossing QuickJS. Any other host error is
  // replaced BEFORE it enters the sandbox: the script only ever sees HOST_FAILURE, so it cannot read,
  // return or rethrow driver/runtime text; the original goes to onHostError only.
  const hostErrors: Error[] = [];
  let hostFailed = false;
  const tracked = Object.fromEntries(Object.entries(bridge).map(([name, fn]) => [name, (...args: unknown[]) => {
    const remember = (error: unknown): never => {
      if (!(error instanceof EngineError)) {
        hostFailed = true;
        state.onHostError(action.key, error);
        throw new Error(HOST_FAILURE);
      }
      if (hostErrors.length < 100) hostErrors.push(error);
      throw error;
    };
    try {
      const out = (fn as (...a: unknown[]) => unknown)(...args);
      return out instanceof Promise ? out.catch(remember) : out;
    } catch (error) { return remember(error); }
  }])) as unknown as SafeScriptBridge;
  let result: ExprValue;
  try {
    result = await runServerScript(prelude + code, tracked, {
      timeoutMs: state.timeoutMs, maxRows: remaining, maxSourceLength: MAX_SCRIPT,
    });
  } catch (error) {
    if (error instanceof EngineError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const host = hostErrors.find((e) => e.message === message);
    if (host) throw host; // ACL denials, raise(), validation: keep class and text
    if (message.includes(HOST_FAILURE)) throw new UserError(`Server action '${action.key}' failed`);
    // errors thrown by the script's own code (and sandbox quota errors)
    throw new UserError(`Server action '${action.key}' failed: ${message.slice(0, 2_000)}`);
  }
  // an internal host failure may have aborted the database transaction: never commit past it
  if (hostFailed) throw new UserError(`Server action '${action.key}' failed`);
  return jsonValue(result);
}

/** Admin-defined button: an action or a model method, optionally guarded by an NX-Expr per record. */
export interface ButtonDef {
  model: string;
  action?: string;
  method?: string;
  /** NX-Expr that must evaluate to `true` for every target record (e.g. `state == 'draft'`). */
  guard?: string;
}
export interface ButtonCall { action?: string; method?: string; args?: unknown[] }

const METHOD = /^[a-z][a-zA-Z0-9_]{0,79}$/;

/** Buttons and state transitions (Odoo `type="action"` / `type="object"` buttons). */
export class ButtonService {
  constructor(private readonly env: Env, private readonly limits: ServerActionLimits = {}) {}

  async define(def: ButtonDef): Promise<void> {
    await assertSystem(this.env);
    knownModel(this.env, def.model);
    const { kind, ref } = buttonTarget(def);
    if (def.guard !== undefined) checkExpression(def.guard, 'Button guard');
    if (kind === 'action') {
      const action = await loadAction(this.env, ref);
      if (!action) throw new ValidationError(`Unknown server action '${ref}'`);
      if (action.model !== def.model) throw new ValidationError(`Server action '${ref}' does not apply to '${def.model}'`);
    }
    await ensureServiceTables(this.env);
    await tenantDriver(this.env).query({
      text: `INSERT INTO nx_button(model,kind,ref,guard) VALUES($1,$2,$3,$4) ON CONFLICT(model,kind,ref) DO UPDATE SET guard=EXCLUDED.guard`,
      params: [def.model, kind, ref, def.guard ?? null],
    });
  }

  /** Run a button on records as the caller. Rejects when a guard does not hold for every record. */
  async execute(model: string, rawIds: readonly number[], call: ButtonCall): Promise<ExprValue> {
    knownModel(this.env, model);
    const { kind, ref } = buttonTarget(call);
    const ids = recordIds(rawIds);
    if (!ids.length) throw new ValidationError('A button needs at least one record');
    const env = this.env;
    return env.transaction(async () => {
      const records = env.model(model);
      await records.checkAccess('read');
      const visible = await records.browse(ids).read(['id']);
      if (visible.length !== ids.length) throw new AccessError('Record is unavailable');
      await ensureServiceTables(env);
      const [button] = await tenantDriver(env).query<{ guard: string | null }>({
        text: `SELECT guard FROM nx_button WHERE model=$1 AND kind=$2 AND ref=$3`, params: [model, kind, ref],
      });
      if (kind === 'action' && !button) throw new AccessError(`Action '${ref}' is not a button of '${model}'`);
      if (button?.guard) {
        for (const id of ids) {
          if (await evaluateFor(env, button.guard, await readRecord(env, model, id)) !== true) {
            throw new UserError(`This operation is not allowed for record ${id} in its current state`);
          }
        }
      }
      if (kind === 'action') return new ServerActionService(env, this.limits).run(ref, { model, ids });
      return jsonValue(await records.browse(ids).call(ref, ...(call.args ?? [])));
    });
  }
}

function buttonTarget(call: { action?: string; method?: string }): { kind: 'action' | 'object'; ref: string } {
  if ((call.action === undefined) === (call.method === undefined)) throw new ValidationError('A button needs exactly one of action or method');
  if (call.action !== undefined) {
    requireKey(call.action, 'action key');
    return { kind: 'action', ref: call.action };
  }
  if (typeof call.method !== 'string' || !METHOD.test(call.method)) throw new ValidationError('Invalid method name');
  return { kind: 'object', ref: call.method };
}

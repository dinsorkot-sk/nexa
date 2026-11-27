import { AccessError, EngineError, UserError, ValidationError, type Context, type Domain, type Env } from '../contracts/index.js';
import {
  extractDependencies, parseExpression, runServerScript, type ExprValue, type SafeScriptBridge,
} from '../expr/index.js';
import { evaluateEnvExpression } from '../orm/expr-helpers.js';
import type { EnvImpl } from '../orm/env.js';
import { addFollowers, createMessage, mailInstalled, resolveSubtype, userPartner } from '../mail/message.js';
import { textToHtml } from '../mail/sanitize.js';
import {
  assertSystem, assertWritable, ensureServiceTables, positiveInt, requireKey, requireModel, tenantDriver,
} from './common.js';
import { TransitionService } from '../policy/transition.js';
import { MatchService } from '../policy/matching.js';
import { evaluateFor, jsonValue, readRecord, recordOrigin, relationalScope } from './record-scope.js';

/** Odoo ir.actions.server equivalents. Field values and messages are NX-Expr; scripts run in QuickJS. */
export type ServerActionType = 'update_record' | 'create_record' | 'post_message' | 'multi' | 'script' | 'call_method' | 'transition' | 'match' | 'unmatch';

/** create_record.lines: child rows created through a one2many of the created record, one per source item. */
export interface ServerActionLines {
  /** one2many field of the created model. */
  field: string;
  /** NX-Expr on the triggering record evaluating to a list (e.g. `record.x_line_ids`, a one2many/many2many field path or a list of objects). */
  source: string;
  /** child field -> NX-Expr evaluated per source item with `line` (the item) and `record` in scope. */
  values: Record<string, string>;
}

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
  /** create_record: build child rows from `record.<source>` (parent and children are created in one transaction). */
  lines?: ServerActionLines;
  /** create_record: transition the created records atomically, using the caller's access. */
  thenTransition?: string;
  /** call_method: model method run on the target records; must be registered with registerCallableMethod. */
  method?: string;
  /** call_method: NX-Expr arguments (`record` is in scope only when exactly one record is targeted). */
  args?: string[];
  /** transition: key of the `ir.transition` (of `model`) to run on the target records. */
  transition?: string;
  /** match/unmatch: key of the ir.match.rule on the model. */
  matchRule?: string;
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
  lines: ServerActionLines | null; thenTransition: string | null; method: string | null; args: string[]; transition: string | null; matchRule: string | null;
}

interface RunState {
  rows: number; readonly maxRows: number; readonly maxDepth: number; readonly timeoutMs: number; readonly logs: string[];
  readonly onHostError: (actionKey: string, error: unknown) => void;
}

function logHostError(actionKey: string, error: unknown): void {
  console.error(`[nexa] server action '${actionKey}' failed in a host call`, error);
}

const TYPES = new Set<ServerActionType>(['update_record', 'create_record', 'post_message', 'multi', 'script', 'call_method', 'transition', 'match', 'unmatch']);
/** Upper bound of child rows one create_record.lines mapping may create per created record. */
export const MAX_ACTION_LINES = 1000;
const MAX_CALL_ARGS = 20;
const CALLABLE_METHOD = /^[a-z][a-zA-Z0-9_]{0,79}$/;

const callableMethods = new Map<string, Set<string>>();

/**
 * Allowlist of model methods that `call_method` server actions may run. A module registers the
 * methods it intends to expose to no-code configuration (typically at module load, next to the
 * model's `methods`); anything not registered is refused at define time and at run time.
 * An allowlisted method must bound its own work (rows, loops): the action only charges the target rows.
 * It must also enforce its own write authorization: call_method only checks that the caller can read
 * the target records; the method decides what the caller may change.
 */
export function registerCallableMethod(model: string, method: string): void {
  requireModel(model);
  if (typeof method !== 'string' || !CALLABLE_METHOD.test(method)) throw new ValidationError('Invalid method name');
  let set = callableMethods.get(model);
  if (!set) { set = new Set(); callableMethods.set(model, set); }
  set.add(method);
}

export function isCallableMethod(model: string, method: string): boolean {
  return callableMethods.get(model)?.has(method) === true;
}
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
    // serialize with removeServerActionDefinitions: the referenced action cannot vanish before our row is stored
    await this.env.transaction(async () => { await lockActionReferences(this.env); await this.defineLocked(def); });
  }

  private async defineLocked(def: ServerActionDef): Promise<void> {
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
    lines: null, thenTransition: null, method: null, args: [], transition: null, matchRule: null,
  };
  if (def.thenTransition !== undefined) {
    if (def.type !== 'create_record') throw new ValidationError(`Server action '${def.key}': thenTransition only applies to create_record`);
    requireKey(def.thenTransition, 'transition key');
    out.thenTransition = def.thenTransition;
  }
  switch (def.type) {
    case 'update_record':
    case 'create_record': {
      const target = def.type === 'create_record' ? def.targetModel ?? model : model;
      if (!target) throw new ValidationError(`Server action '${def.key}' needs a model`);
      const meta = knownModel(env, target);
      if (def.type === 'create_record') out.targetModel = target;
      const values = def.values ?? {};
      if (def.lines !== undefined && def.type !== 'create_record') throw new ValidationError(`Server action '${def.key}': lines only apply to create_record`);
      if (typeof values !== 'object' || values === null || Array.isArray(values) || (!Object.keys(values).length && def.lines === undefined)) {
        throw new ValidationError(`Server action '${def.key}' needs field values`);
      }
      if (def.lines !== undefined) out.lines = validateLines(env, def.key, target, def.lines, values);
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
    case 'call_method': {
      if (!model) throw new ValidationError(`Server action '${def.key}' needs a model`);
      const meta = knownModel(env, model);
      if (typeof def.method !== 'string' || !CALLABLE_METHOD.test(def.method)) throw new ValidationError(`Server action '${def.key}' needs a valid method name`);
      if (!isCallableMethod(model, def.method)) throw new ValidationError(`Method '${model}.${def.method}' is not callable from server actions`);
      if (!meta.def.methods || !Object.hasOwn(meta.def.methods, def.method)) throw new ValidationError(`Model '${model}' has no method '${def.method}'`);
      const args = def.args ?? [];
      if (!Array.isArray(args) || args.length > MAX_CALL_ARGS) throw new ValidationError(`Server action '${def.key}' accepts at most ${MAX_CALL_ARGS} arguments`);
      args.forEach((a, i) => checkExpression(a, `Server action '${def.key}' argument ${i + 1}`));
      out.method = def.method;
      out.args = [...args];
      break;
    }
    case 'match':
    case 'unmatch':
      if (!model) throw new ValidationError(`Server action '${def.key}' needs a model`);
      requireKey(def.matchRule as string, 'matching rule key');
      out.matchRule = def.matchRule!;
      break;
    case 'transition':
      if (!model) throw new ValidationError(`Server action '${def.key}' needs a model`);
      requireKey(def.transition as string, 'transition key');
      out.transition = def.transition!;
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

function validateLines(env: Env, key: string, target: string, lines: ServerActionLines, parentValues: Record<string, string>): ServerActionLines {
  const where = `Server action '${key}' lines`;
  if (!lines || typeof lines !== 'object' || Array.isArray(lines)) throw new ValidationError(`${where} must be an object`);
  const field = typeof lines.field === 'string' ? knownModel(env, target).fields.get(lines.field) : undefined;
  if (!field) throw new ValidationError(`${where}: unknown field '${String(lines.field)}' on '${target}'`);
  if (field.type !== 'one2many' || !field.comodel) throw new ValidationError(`${where}: '${lines.field}' is not a one2many field`);
  const parentFields = knownModel(env, target).fields;
  if (parentFields.has('line') || parentFields.has('record')) throw new ValidationError(`${where}: model '${target}' has a field named 'line' or 'record', which would be shadowed`);
  if (Object.hasOwn(parentValues, lines.field)) throw new ValidationError(`${where}: '${lines.field}' cannot also be set in values`);
  checkExpression(lines.source, `${where} source`);
  const child = knownModel(env, field.comodel);
  const values = lines.values;
  if (typeof values !== 'object' || values === null || Array.isArray(values) || !Object.keys(values).length) throw new ValidationError(`${where} need child values`);
  for (const [name, source] of Object.entries(values)) {
    const childField = child.fields.get(name);
    if (!childField) throw new ValidationError(`${where}: unknown field '${name}' on '${field.comodel}'`);
    if (name === field.inverseName) throw new ValidationError(`${where}: '${name}' is the inverse field and is set automatically`);
    if (childField.readonly || childField.compute || childField.computeExpr || childField.store === false) {
      throw new ValidationError(`${where}: field '${name}' is readonly or computed`);
    }
    checkExpression(source, `${where} value '${name}'`);
  }
  return { field: lines.field, source: lines.source, values: { ...values } };
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

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function plainValues(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function lockOptions(value: unknown, label: string): { skipLocked?: boolean; nowait?: boolean } {
  const opts = value === undefined || value === null ? {} : plainValues(value, label);
  const out: { skipLocked?: boolean; nowait?: boolean } = {};
  for (const key of ['skipLocked', 'nowait'] as const) {
    if (opts[key] === undefined) continue;
    if (typeof opts[key] !== 'boolean') throw new ValidationError(`${label}: ${key} must be a boolean`);
    out[key] = opts[key] as boolean;
  }
  return out;
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
          return { key: ui.xml_id, name: ui.name, model: ui.model, type: 'script', values: {}, targetModel: null, message: null, children: [], code: ui.code, lines: null, thenTransition: null, method: null, args: [], transition: null, matchRule: null };
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
    lines: (d.lines as ServerActionLines | null) ?? null, method: (d.method as string | null) ?? null, args: (d.args as string[]) ?? [],
    thenTransition: (d.thenTransition as string | null) ?? null,
    transition: (d.transition as string | null) ?? null,
    matchRule: (d.matchRule as string | null) ?? null,
  };
}

function charge(state: RunState, rows: number): void {
  if (state.rows + rows > state.maxRows) throw new ValidationError('Server action row quota exceeded');
  state.rows += rows;
}

async function evaluateValues(
  env: Env, values: Record<string, string>, record: Record<string, ExprValue> | null, state: RunState,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [field, source] of Object.entries(values)) {
    if (UNSAFE_KEYS.has(field)) throw new ValidationError(`Invalid field name '${field}'`);
    const value = await evaluateFor(env, source, record, { charge: (rows) => charge(state, rows) });
    Object.defineProperty(out, field, { value, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

const SOURCE_FIELD = /^(?:record\.)?([A-Za-z_][A-Za-z0-9_]*)$/;
/**
 * Root x2many of a source that only filters or orders it, e.g. `record.x_item_ids.filtered('x_is_base')`.
 * mapped() and other calls may yield records of another model, so they are not matched. The `record.`
 * prefix is required so that a context name (e.g. `companies`) can never stand in for the field.
 */
const SOURCE_ROOT = /^record\.([A-Za-z_][A-Za-z0-9_]*)(?:\.(?:filtered|sorted)\((?:'[^']*'|"[^"]*")?\))+$/;

/** Evaluates a create_record.lines mapping into x2many create commands (rows charged, bounded, caller ACL). */
async function evaluateLines(
  env: Env, lines: ServerActionLines, sourceModel: string, record: Record<string, ExprValue>, state: RunState,
): Promise<unknown[]> {
  const registry = (env as EnvImpl).registry;
  const raw = await evaluateFor(env, lines.source, record, { charge: (rows) => charge(state, rows) });
  if (!Array.isArray(raw)) throw new ValidationError('Lines source must evaluate to a list');
  if (raw.length > MAX_ACTION_LINES) throw new ValidationError(`Lines source has more than ${MAX_ACTION_LINES} items`);
  if (!raw.length) return [];
  let items: Record<string, ExprValue>[];
  // top-level `line.<field>` names used by the line values
  const lineFields = new Set<string>();
  for (const source of Object.values(lines.values)) {
    try {
      for (const path of extractDependencies(source)) if (path.startsWith('line.')) lineFields.add(path.split('.')[1]!);
    } catch { /* not statically analysable: stored fields only */ }
  }
  /** Read source records as flat rows with the caller's access, keeping the source order. */
  const readRows = async (comodel: string, sourceIds: number[]): Promise<Record<string, ExprValue>[]> => {
    const ids = [...new Set(sourceIds)];
    charge(state, ids.length);
    const records = env.model(comodel).browse(ids);
    const rows = await records.read();
    if (rows.length !== ids.length) throw new AccessError('A source line is not readable');
    // read() returns stored fields only: also read the non-stored fields the line values name (e.g. `line.x_flag`)
    const comodelFields = registry.get(comodel).fields;
    const extra = [...lineFields].filter((name) => comodelFields.has(name) && !(name in rows[0]!));
    if (extra.length) {
      const more = new Map((await records.read(extra)).map((row) => [row.id as number, row]));
      for (const row of rows) for (const name of extra) row[name] = more.get(row.id as number)?.[name] ?? null;
    }
    const byId = new Map(rows.map((row) => {
      const flat = jsonValue(row) as Record<string, ExprValue>;
      recordOrigin.set(flat, { model: comodel, id: row.id as number });
      return [row.id as number, flat] as const;
    }));
    return sourceIds.map((id) => byId.get(id)!);
  };
  const x2many = (name: string | undefined) => {
    const field = name ? registry.get(sourceModel).fields.get(name) : undefined;
    return field && (field.type === 'one2many' || field.type === 'many2many') && field.comodel ? field.comodel : undefined;
  };
  if (raw.every((item) => typeof item === 'number')) {
    // untraversed x2many: a list of ids
    const comodel = x2many(SOURCE_FIELD.exec(lines.source.trim())?.[1]);
    if (!comodel) throw new ValidationError('Lines source must be a one2many/many2many field path or a list of objects');
    items = await readRows(comodel, raw as number[]);
  } else if (raw.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))) {
    // a filtered or sorted x2many holds only the fields the source read: reload its records in full (caller's access)
    const comodel = x2many(SOURCE_ROOT.exec(lines.source.trim())?.[1]);
    const objects = raw as Record<string, ExprValue>[];
    if (comodel && objects.every((item) => typeof item.id === 'number')) {
      const rows = await readRows(comodel, objects.map((item) => item.id as number));
      // read() returns stored columns only: keep the values the source already evaluated (e.g. non-stored computes)
      items = rows.map((row, i) => {
        for (const [key, value] of Object.entries(objects[i]!)) if (!(key in row)) row[key] = value;
        return row;
      });
    } else items = objects;
  } else throw new ValidationError('Lines source items must be record ids or objects');
  charge(state, items.length); // child rows created
  const commands: unknown[] = [];
  // same relation loader as parent values: `record.x_a.name` and `line.x_b.name` follow relations with the caller's access.
  // The parent scope is loaded once per value expression, not per line (rows are charged once).
  const charger = (rows: number) => charge(state, rows);
  const recordScopes = new Map<string, Record<string, ExprValue>>();
  const lineRelational = new Map<string, boolean>();
  for (const [name, source] of Object.entries(lines.values)) {
    if (UNSAFE_KEYS.has(name)) throw new ValidationError(`Invalid field name '${name}'`);
    recordScopes.set(name, await relationalScope(env, source, record, { charge: charger }));
    let relational = false;
    try { relational = extractDependencies(source).some((p) => p.startsWith('line.') && p.split('.').length > 2); } catch { /* not statically analysable */ }
    lineRelational.set(name, relational);
  }
  for (const line of items) {
    const values: Record<string, unknown> = {};
    for (const [name, source] of Object.entries(lines.values)) {
      if (lineRelational.get(name) && !recordOrigin.has(line)) {
        throw new ValidationError(`Lines value '${name}' follows a relation of 'line', which needs record ids as the lines source`);
      }
      const recordScope = recordScopes.get(name)!;
      const lineScope = await relationalScope(env, source, line, { charge: charger, prefix: 'line' });
      const value = await evaluateEnvExpression(env, source, { ...recordScope, record: recordScope, line: lineScope }, {});
      Object.defineProperty(values, name, { value, enumerable: true, writable: true, configurable: true });
    }
    commands.push({ op: 'create', values });
  }
  return commands;
}

/**
 * Post a chatter message as the current user: the record must be writable (ACL + record rules).
 * Returns the mail.message id when the mail module is installed, else the nx_audit_log id.
 */
export async function postMessage(env: Env, model: string, recordId: number, message: string): Promise<number> {
  if (typeof message !== 'string' || !message.trim()) throw new ValidationError('Chatter message cannot be empty');
  if (message.length > 100_000) throw new ValidationError('Chatter message is too long');
  requireModel(model);
  positiveInt(recordId, 'record id');
  await assertWritable(env, model, recordId);
  if (mailInstalled(env)) {
    // mail module installed: a real chatter message (plain text, escaped) instead of the audit log, with
    // the same semantics as MailThreadService.post (the author follows the document). The returned id is
    // a mail.message id and the post no longer appears in AuditService.history().
    const id = await createMessage(env, { model, resId: recordId, body: textToHtml(message), subtypeId: await resolveSubtype(env, 'mail.mt_comment') });
    const author = await userPartner(env);
    if (author !== null) await addFollowers(env, model, recordId, [author]);
    return id;
  }
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
        const values = await evaluateValues(env, action.values, await readRecord(env, target, id), state);
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
        const record = id === null ? null : await readRecord(env, target!, id);
        const values = await evaluateValues(env, action.values, record, state);
        if (action.lines) {
          if (!record) throw new ValidationError(`Server action '${action.key}' builds lines from a record`);
          const commands = await evaluateLines(env, action.lines, target!, record, state);
          Object.defineProperty(values, action.lines.field, { value: commands, enumerable: true, writable: true, configurable: true });
        }
        created.push(...(await env.model(createIn).create(values)).ids);
      }
      if (action.thenTransition) {
        charge(state, created.length);
        await new TransitionService(env).run(createIn, created, action.thenTransition);
      }
      return created;
    }
    case 'call_method': {
      if (!target || !action.method) throw new ValidationError(`Server action '${action.key}' needs a model and a method`);
      if (!isCallableMethod(target, action.method)) throw new ValidationError(`Method '${target}.${action.method}' is not callable from server actions`);
      const records = env.model(target);
      if (!ids.length) await records.checkAccess('read');
      charge(state, ids.length);
      const record = ids.length === 1 ? await readRecord(env, target, ids[0]!) : null;
      const args: unknown[] = [];
      for (const source of action.args) args.push(await evaluateFor(env, source, record, { charge: (rows) => charge(state, rows) }));
      // allowlisted methods must bound their own work: the action only charges the target rows
      const result = await records.browse(ids).call(action.method, ...args);
      try { return jsonValue(result); } catch { throw new ValidationError(`Method '${target}.${action.method}' returned a value that is not JSON-serializable`); }
    }
    case 'post_message': {
      if (!target) throw new ValidationError(`Server action '${action.key}' needs a model`);
      charge(state, ids.length);
      for (const id of ids) {
        const message = await evaluateFor(env, action.message ?? '', await readRecord(env, target, id), { readOnly: true, charge: (rows) => charge(state, rows) });
        await postMessage(env, target, id, typeof message === 'string' ? message : JSON.stringify(message));
      }
      return true;
    }
    case 'match':
    case 'unmatch': {
      if (!target || !action.matchRule) throw new ValidationError(`Server action '${action.key}' needs a model and matching rule`);
      charge(state, ids.length);
      const service = new MatchService(env);
      return jsonValue(await (action.type === 'match' ? service.match(target, ids, action.matchRule) : service.unmatch(target, ids, action.matchRule)));
    }
    case 'transition': {
      if (!target || !action.transition) throw new ValidationError(`Server action '${action.key}' needs a model and a transition`);
      charge(state, ids.length);
      return jsonValue(await new TransitionService(env).run(target, ids, action.transition));
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
    async lock(name, rawIds, options, signal) {
      live(signal);
      const target = recordIds(rawIds);
      charge(state, target.length);
      const locked = await records(name).browse(target).lock(lockOptions(options, 'lock options'));
      live(signal);
      return locked;
    },
    async claim(name, domain, options, signal) {
      live(signal);
      if (domain !== undefined && domain !== null && !Array.isArray(domain)) throw new ValidationError('claim domain must be a list');
      const opts = options === undefined || options === null ? {} : plainValues(options, 'claim options');
      if (opts.order !== undefined && typeof opts.order !== 'string') throw new ValidationError('claim order must be a string');
      // live budget: earlier bridge calls / nested actions in this run already consumed rows
      const left = state.maxRows - state.rows;
      if (left < 1) throw new ValidationError('Server action row quota exceeded');
      const limit = typeof opts.limit === 'number' ? opts.limit : left;
      if (!Number.isSafeInteger(limit) || limit < 1) throw new ValidationError('claim limit must be a positive integer');
      const claimed = await records(name).searchLocked((domain ?? []) as Domain, {
        ...lockOptions(opts, 'claim options'), limit: Math.min(limit, left, 1_000), ...(opts.order ? { order: opts.order as string } : {}),
      });
      live(signal);
      charge(state, claimed.ids.length);
      return [...claimed.ids];
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
    // serialize with removeServerActionDefinitions: the referenced action cannot vanish before our row is stored
    await this.env.transaction(async () => { await lockActionReferences(this.env); await this.defineLocked(def); });
  }

  private async defineLocked(def: ButtonDef): Promise<void> {
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
          if (await evaluateFor(env, button.guard, await readRecord(env, model, id), { readOnly: true }) !== true) {
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

// ---------- T25: ir.actions.server / ir.button records -> runtime rows (one-way sync helpers) ----------

/**
 * Removes stored server action definitions (admin-only). Fails while an automation rule, scheduled job,
 * button or multi action still refers to one of them, so live references never dangle.
 */
export async function removeServerActionDefinitions(env: Env, keys: readonly string[]): Promise<void> {
  if (!keys.length) return;
  await assertSystem(env);
  await ensureServiceTables(env);
  const db = tenantDriver(env);
  const list = [...new Set(keys)];
  await env.transaction(async () => {
  // same lock as every definition that stores a reference: check and delete are atomic with respect to them
  await lockActionReferences(env);
  const [ref] = await db.query<{ what: string; key: string }>({
    text: `SELECT 'automation rule ' || key AS what, action AS key FROM nx_automation WHERE action = ANY($1)
      UNION ALL SELECT 'scheduled job ' || key, action FROM nx_scheduled_job WHERE action = ANY($1)
      UNION ALL SELECT 'button on ' || model, ref FROM nx_button WHERE kind = 'action' AND ref = ANY($1)
      UNION ALL SELECT 'server action ' || s.key, c.child FROM nx_server_action s
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.definition->'children', '[]'::jsonb)) AS c(child)
        WHERE c.child = ANY($1) AND NOT (s.key = ANY($1))
      LIMIT 1`,
    params: [list],
  });
  if (ref) throw new ValidationError(`Server action '${ref.key}' is still used by ${ref.what}`);
  await db.query({ text: `DELETE FROM nx_server_action WHERE key = ANY($1)`, params: [list] });
  });
}

/**
 * Transaction-scoped advisory lock shared by everything that adds or removes references to stored
 * server actions (automation rules, scheduled jobs, buttons, multi actions, removal). Call inside
 * env.transaction(); it is held until that transaction ends.
 */
export async function lockActionReferences(env: Env): Promise<void> {
  await tenantDriver(env).query({ text: `SELECT pg_advisory_xact_lock(hashtext('nx.server_action_refs'))`, params: [] });
}

/** Removes button definitions (admin-only). Each entry names exactly one of `action` / `method`. */
export async function removeButtonDefinitions(env: Env, buttons: readonly { model: string; action?: string | null; method?: string | null }[]): Promise<void> {
  if (!buttons.length) return;
  await assertSystem(env);
  await ensureServiceTables(env);
  for (const button of buttons) {
    const kind = button.action ? 'action' : 'object';
    const ref = button.action || button.method;
    if (!ref) continue;
    await tenantDriver(env).query({ text: `DELETE FROM nx_button WHERE model=$1 AND kind=$2 AND ref=$3`, params: [button.model, kind, ref] });
  }
}

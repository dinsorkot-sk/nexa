import { AccessError, ValidationError, type AccessRule, type Env, type ModelDef, type Recordset } from '../contracts/index.js';
import { extractDependencies, parseExpression, type ExprValue } from '../expr/index.js';
import type { EnvImpl } from '../orm/env.js';
import { checkRecordRules, userSecurity } from '../security/access.js';
import { assertSystem } from '../services/common.js';
import { evaluateFor, readRecord } from '../services/record-scope.js';
import { nextFromRecord } from '../services/sequence.js';
import { policyIndex, type ModelPolicy } from './lifecycle.js';
import { withWriteToken } from './token.js';

/** ADR 0004 `ir.transition`: a named, atomic, guarded state change. */

export const transitionModels: ModelDef[] = [
  {
    name: 'ir.transition', origin: 'module', module: 'base', order: 'model asc, key asc', recName: 'name', description: 'Lifecycle Transition',
    fields: {
      model: { type: 'char', required: true, string: 'Model' },
      key: { type: 'char', required: true, string: 'Key' },
      name: { type: 'char', string: 'Name' },
      from: { type: 'json', string: 'From States', help: 'List of states the record may be in' },
      to: { type: 'char', required: true, string: 'To State' },
      already: { type: 'selection', selection: [['error', 'Error'], ['skip', 'Skip']], default: 'error', string: 'Already In Target' },
      groups: { type: 'json', string: 'Groups', help: 'List of group codes; the caller must be in one of them (narrows access only)' },
      guard: { type: 'text', help: 'NX-Expr that must be true' },
      checks: { type: 'json', string: 'Checks', help: 'List of {expr, message}; read-only, relational scope' },
      effects: {
        type: 'json', string: 'Effects',
        help: '[{type:sequence,field,code,date,company,when} | {type:set,values} | {type:child_set,field,values}]',
      },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'ir_transition_valid', check: checkTransitionRecords }],
  },
];

export const transitionAccess: AccessRule[] = [
  { model: 'ir.transition', group: 'base.group_system', perms: { read: true, write: true, create: true, unlink: true } },
];

interface Check { expr: string; message: string }
type Effect =
  | { type: 'sequence'; field: string; code: string; date?: string; company?: string; when?: string }
  | { type: 'set'; values: Record<string, string> }
  | { type: 'child_set'; field: string; values: Record<string, string> };

interface TransitionDef {
  model: string; key: string; from: string[]; to: string; already: 'error' | 'skip';
  groups: string[]; guard: string | null; checks: Check[]; effects: Effect[];
}

interface Row {
  id: number; model: string; key: string; from: unknown; to: string; already: string | null;
  groups: unknown; guard: string | null; checks: unknown; effects: unknown; active: boolean | null;
}

const MAX = 100;
const json = (v: unknown): unknown => { if (typeof v !== 'string') return v; try { return JSON.parse(v) as unknown; } catch { return undefined; } };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function list(v: unknown, what: string): unknown[] {
  const x = json(v ?? []);
  if (!Array.isArray(x) || x.length > MAX) throw new ValidationError(`Transition ${what} must be a list of at most ${MAX} entries`);
  return x;
}
function strings(v: unknown, what: string): string[] {
  const x = list(v, what);
  if (x.some((s) => typeof s !== 'string' || !s)) throw new ValidationError(`Transition ${what} must contain only names`);
  return x as string[];
}
function expr(source: unknown, what: string): string {
  if (typeof source !== 'string' || !source.trim()) throw new ValidationError(`Transition ${what} must be an NX-Expr string`);
  try { parseExpression(source); } catch (e) { throw new ValidationError(`Transition ${what}: ${e instanceof Error ? e.message : 'invalid expression'}`); }
  return source;
}
function values(v: unknown, what: string): Record<string, string> {
  if (!isObj(v) || !Object.keys(v).length) throw new ValidationError(`Transition ${what} needs a values object`);
  const out: Record<string, string> = {};
  for (const [k, s] of Object.entries(v)) out[k] = expr(s, `${what} '${k}'`);
  return out;
}

/** Strict parse + validation of one row against the live registry and lifecycle policy. */
function compile(env: EnvImpl, row: Row, policy: ModelPolicy | undefined): TransitionDef {
  const label = `Transition '${row.model}.${row.key}'`;
  const fail = (m: string): never => { throw new ValidationError(`${label}: ${m}`); };
  const meta = env.registry.models.get(row.model);
  if (!meta) return fail(`model '${row.model}' does not exist`);
  if (!policy?.stateField) return fail('the model has no lifecycle with a state field');
  const stateDef = meta.fields.get(policy.stateField)!;
  const states = new Set((stateDef.selection ?? []).map(([k]) => k));
  const from = strings(row.from, 'from');
  for (const s of [...from, row.to]) if (!states.has(s)) fail(`state '${s}' is not in the selection of '${policy.stateField}'`);
  const already = row.already === 'skip' ? 'skip' : 'error';
  const groups = strings(row.groups, 'groups');
  const known = (model: string, name: string): void => { if (!env.registry.get(model).fields.has(name)) fail(`unknown field '${name}' on '${model}'`); };
  const deps = (source: string, model: string, prefix: boolean): void => {
    let paths: string[];
    try { paths = extractDependencies(source); } catch { return; }
    for (const p of paths) {
      const parts = p.split('.');
      const root = prefix && parts[0] === 'line' ? parts[1] : parts[0];
      if (root && !(prefix && parts[0] === 'line' && parts.length === 1)) known(model, root);
    }
  };
  const guard = row.guard && row.guard.trim() ? expr(row.guard, 'guard') : null;
  if (guard) deps(guard, row.model, false);
  const checks: Check[] = list(row.checks, 'checks').map((c) => {
    if (!isObj(c) || typeof c.message !== 'string' || !c.message) return fail('every check needs expr and message');
    const e = expr(c.expr, 'check');
    deps(e, row.model, false);
    return { expr: e, message: c.message };
  });
  const effects: Effect[] = list(row.effects, 'effects').map((raw) => {
    if (!isObj(raw)) return fail('every effect must be an object');
    if (raw.type === 'sequence') {
      if (typeof raw.field !== 'string') return fail('sequence effect needs a field');
      known(row.model, raw.field);
      if (!policy.transitionOnly.has(raw.field) && !policy.engineFields.has(raw.field)) {
        fail(`sequence field '${raw.field}' must be transition_only or an engine field of the lifecycle`);
      }
      const e: Effect = { type: 'sequence', field: raw.field, code: expr(raw.code, 'sequence code') };
      for (const k of ['date', 'company', 'when'] as const) if (raw[k] !== undefined && raw[k] !== null) { e[k] = expr(raw[k], `sequence ${k}`); deps(e[k]!, row.model, false); }
      deps(e.code, row.model, false);
      return e;
    }
    if (raw.type === 'set') {
      const v = values(raw.values, 'set effect');
      for (const [k, s] of Object.entries(v)) { known(row.model, k); deps(s, row.model, false); }
      return { type: 'set', values: v };
    }
    if (raw.type === 'child_set') {
      const f = typeof raw.field === 'string' ? meta.fields.get(raw.field) : undefined;
      if (!f || f.type !== 'one2many' || !f.comodel || !f.inverseName) return fail('child_set field must be a one2many');
      const v = values(raw.values, 'child_set effect');
      for (const [k, s] of Object.entries(v)) { known(f.comodel, k); deps(s, f.comodel, false); }
      return { type: 'child_set', field: raw.field as string, values: v };
    }
    return fail('unknown effect type');
  });
  return { model: row.model, key: row.key, from, to: row.to, already, groups, guard, checks, effects };
}

export async function checkTransitionRecords(records: Recordset): Promise<void> {
  const env = records.env as EnvImpl;
  await assertSystem(env);
  const rows = await env.db.query<Row & { dup: boolean }>({
    text: `SELECT t.id, t.model, t.key, t."from", t.to, t.already, t.groups, t.guard, t.checks, t.effects, t.active,
        EXISTS (SELECT 1 FROM ir_transition o WHERE o.id <> t.id AND o.model = t.model AND o.key = t.key) AS dup
      FROM ir_transition t WHERE t.id = ANY($1) ORDER BY t.id`,
    params: [[...records.ids]],
  });
  const index = await policyIndex(env);
  for (const row of rows) {
    if (row.dup) throw new ValidationError(`Transition '${row.model}.${row.key}' already exists`);
    compile(env, row, index.get(row.model)?.policy);
  }
}

export interface TransitionResult { done: number[]; skipped: number[] }

export class TransitionService {
  constructor(private readonly env: Env) {}

  async run(model: string, rawIds: readonly number[], key: string): Promise<TransitionResult> {
    const env = this.env as EnvImpl;
    const ids = [...new Set(rawIds)].sort((a, b) => a - b);
    if (!ids.length) throw new ValidationError('A transition needs at least one record');
    return env.transaction(async () => {
      const index = await policyIndex(env);
      const policy = index.get(model)?.policy;
      const [row] = await env.sudo().model('ir.transition').search([['model', '=', model], ['key', '=', key]]).then((r) => r.read());
      if (!row || row.active === false) throw new ValidationError(`Unknown transition '${model}.${key}'`);
      const def = compile(env, row as unknown as Row, policy);
      const stateField = policy!.stateField!;

      if (!env.su) {
        const groups = (await userSecurity(env)).groups;
        if (def.groups.length && !def.groups.some((g) => groups.has(g))) throw new AccessError(`Transition '${key}' is not allowed for your groups`);
      }
      const records = env.model(model).browse(ids);
      await records.checkAccess('write');
      if ((await records.read(['id'])).length !== ids.length) throw new AccessError('Record is unavailable');
      if (!env.su) await checkRecordRules(env as Parameters<typeof checkRecordRules>[0], model, ids, 'write');

      // locks: parents ascending, then frozen / effect children ascending
      const meta = env.registry.get(model);
      const childFields = new Set<string>(def.effects.flatMap((e) => (e.type === 'child_set' ? [e.field] : [])));
      for (const lock of policy!.locks.values()) for (const f of lock.frozenChildren) childFields.add(f);
      const locked = await env.db.query<{ id: number }>({
        text: `SELECT id FROM "${meta.table}" WHERE id = ANY($1) ORDER BY id FOR UPDATE`, params: [ids],
      });
      if (locked.length !== ids.length) throw new AccessError('Record is unavailable');
      const children = new Map<string, number[]>();
      for (const f of [...childFields].sort()) {
        const fd = meta.fields.get(f)!;
        const cm = env.registry.get(fd.comodel!);
        const rows = await env.db.query<{ id: number }>({
          text: `SELECT id FROM "${cm.table}" WHERE "${fd.inverseName}" = ANY($1) ORDER BY id FOR UPDATE`, params: [ids],
        });
        children.set(f, rows.map((r) => Number(r.id)));
      }

      env.cache.invalidate(); // re-read under the locks: rows cached before them may be stale
      const done: number[] = []; const skipped: number[] = [];
      for (const id of ids) {
        const record = await readRecord(env, model, id);
        const state = record[stateField];
        if (state === def.to && def.already === 'skip') { skipped.push(id); continue; }
        if (typeof state !== 'string' || !def.from.includes(state)) {
          throw new ValidationError(`Cannot ${def.key} record ${id}: it is '${String(state)}', expected ${def.from.join(' or ')}`);
        }
        const ro = { readOnly: true };
        if (def.guard && (await evaluateFor(env, def.guard, record, ro)) !== true) {
          throw new ValidationError(`Transition '${def.key}' is not allowed for record ${id}`);
        }
        for (const c of def.checks) {
          if ((await evaluateFor(env, c.expr, record, ro)) !== true) throw new ValidationError(c.message);
        }
        const header: Record<string, unknown> = {};
        for (const e of def.effects) {
          if (e.type === 'sequence') {
            if (e.when && (await evaluateFor(env, e.when, record, ro)) !== true) continue;
            const code = await evaluateFor(env, e.code, record, ro);
            if (typeof code !== 'string' || !code) throw new ValidationError('Sequence code must evaluate to text');
            const date = e.date ? await evaluateFor(env, e.date, record, ro) : undefined;
            if (date !== undefined && date !== null && typeof date !== 'string') throw new ValidationError('Sequence date must be YYYY-MM-DD');
            // Date columns can reach NX-Expr as a JSON-serialized UTC midnight.
            // Keep the document's calendar date when selecting a sequence range.
            const sequenceDate = typeof date === 'string'
              ? date.replace(/T00:00:00\.000Z$/, '')
              : undefined;
            const companyId = e.company ? await evaluateFor(env, e.company, record, ro) : undefined;
            if (e.company && (typeof companyId !== 'number' || !Number.isSafeInteger(companyId) || companyId < 1)) {
              throw new ValidationError('Sequence company must evaluate to a positive company id');
            }
            const next = await nextFromRecord(env, code, {
              ...(sequenceDate ? { date: sequenceDate } : {}),
              ...(typeof companyId === 'number' ? { companyId } : {}),
            });
            if (next === null) throw new ValidationError(`No sequence '${code}'`);
            header[e.field] = next;
          } else if (e.type === 'set') {
            for (const [k, s] of Object.entries(e.values)) header[k] = await evaluateFor(env, s, record, ro);
          } else {
            const fd = meta.fields.get(e.field)!;
            const childIds = (children.get(e.field) ?? []).filter(() => true);
            const childModel = fd.comodel!;
            for (const cid of childIds) {
              const child = await readRecord(env, childModel, cid);
              if (child[fd.inverseName!] !== id) continue;
              const vals: Record<string, ExprValue> = {};
              for (const [k, s] of Object.entries(e.values)) vals[k] = await evaluateFor(env, s, child, ro);
              await withWriteToken(env, { op: 'write', model: childModel, ids: [cid], fields: Object.keys(vals) },
                () => env.model(childModel).browse(cid).write(vals));
            }
          }
        }
        const vals = { ...header, [stateField]: def.to };
        await withWriteToken(env, { op: 'write', model, ids: [id], fields: Object.keys(vals) },
          () => env.model(model).browse(id).write(vals));
        done.push(id);
      }
      return { done, skipped };
    });
  }
}

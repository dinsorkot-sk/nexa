import { ValidationError, type AccessRule, type FieldDef, type ModelDef, type Recordset, type Registry } from '../contracts/index.js';
import { extractDependencies, parseExpression, type ExprValue } from '../expr/index.js';
import { evaluateEnvExpression } from '../orm/expr-helpers.js';
import type { EnvImpl } from '../orm/env.js';
import { isColumn } from '../orm/registry.js';
import { userSecurity } from '../security/access.js';
import { assertSystem } from '../services/common.js';
import { jsonValue } from '../services/record-scope.js';
import { assertPolicyTarget, markPolicyDirty } from './lifecycle.js';

/*
 * ADR 0004 P3: `ir.date.lock` (period locks) and field ratchets.
 *
 * - `hard` binds EVERYONE: users, managers, the superuser, sudo envs and write tokens (transitions).
 * - `soft` binds everyone except the superuser / sudo envs and callers in `bypass_groups`. Internal
 *   sudo operations (stored recomputes, automations that sudo) therefore count as superuser for soft locks.
 * - `when`, `hard` and `soft` are trusted admin configuration (like record rules): they are evaluated
 *   with a sudo env so a caller's ACL gaps on company / settings records cannot weaken the lock or make
 *   it fail. Only the lock decision leaks (a refusal message names the model and the locked date).
 * - Expressions may follow many2one chains (`x_company_id.x_hard_lock_date`), not x2many fields.
 * - Both the old and the new values of a write are checked; a record without a date is never locked.
 *   Datetimes are compared by their UTC date.
 */

export class DateLockError extends ValidationError {}

export type DateLockOp = 'create' | 'write' | 'unlink';
const OPS: readonly DateLockOp[] = ['create', 'write', 'unlink'];
const MAX_PATHS = 16;
const MAX_DEPTH = 4;
const MAX_GROUPS = 50;

/** Compiled `ir.date.lock` row. */
export interface DateLock {
  readonly id: number | undefined;
  readonly model: string;
  readonly field: string;
  readonly when: string | null;
  readonly hard: string | null;
  readonly soft: string | null;
  readonly bypass: ReadonlySet<string>;
  readonly ops: ReadonlySet<DateLockOp>;
  /** field names the guard must read from the existing record (roots of every path, plus the date) */
  readonly reads: readonly string[];
  /** every dependency path of the three expressions */
  readonly paths: readonly string[];
}

export interface DateLockRow {
  id?: number;
  model: string;
  date: string;
  when: string | null;
  hard: string | null;
  soft: string | null;
  bypass_groups: unknown;
  ops: unknown;
  active?: boolean | null;
}

export const dateLockModels: ModelDef[] = [
  {
    name: 'ir.date.lock', origin: 'module', module: 'base', order: 'model asc, id asc', recName: 'model', description: 'Date Lock',
    fields: {
      model: { type: 'char', required: true, string: 'Model', help: 'Technical name of the model whose records are locked by date' },
      date: { type: 'char', required: true, string: 'Date Field', help: 'Stored date / datetime field of the model holding the record date' },
      when: { type: 'text', string: 'When', help: 'Optional NX-Expr; the lock only applies to records for which it is true (e.g. state == \'posted\')' },
      hard: { type: 'text', string: 'Hard Lock Date', help: 'NX-Expr yielding a date (e.g. x_company_id.x_hard_lock_date); records dated on or before it cannot be created, changed or deleted by anyone' },
      soft: { type: 'text', string: 'Soft Lock Date', help: 'NX-Expr yielding a date; like the hard lock, but the superuser and the bypass groups are exempt' },
      bypass_groups: { type: 'json', string: 'Bypass Groups', help: 'List of group codes exempt from the soft lock' },
      ops: { type: 'json', string: 'Operations', help: 'Subset of ["create","write","unlink"]; empty means all' },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'ir_date_lock_valid', check: checkDateLockRecords }],
  },
];

export const dateLockAccess: AccessRule[] = [
  { model: 'ir.date.lock', group: 'base.group_system', perms: { read: true, write: true, create: true, unlink: true } },
];

const json = (v: unknown): unknown => { if (typeof v !== 'string') return v; try { return JSON.parse(v) as unknown; } catch { return undefined; } };

function strings(v: unknown, what: string): string[] {
  const x = json(v ?? []);
  if (!Array.isArray(x) || x.length > MAX_GROUPS || x.some((s) => typeof s !== 'string' || !s)) {
    throw new ValidationError(`Date lock ${what} must be a list of at most ${MAX_GROUPS} names`);
  }
  return [...new Set(x as string[])];
}

/** Strict compile of one row against the registry; throws ValidationError on anything wrong. */
export function compileDateLock(registry: Registry, row: DateLockRow): DateLock {
  const label = `Date lock for '${row.model}'`;
  const fail = (m: string): never => { throw new ValidationError(`${label}: ${m}`); };
  const meta = assertPolicyTarget(registry, row.model, label);
  const f = meta.fields.get(row.date);
  if (!f) return fail(`unknown field '${row.date}'`);
  if ((f.type !== 'date' && f.type !== 'datetime') || f.delegated || !isColumn(f as FieldDef)) return fail(`'${row.date}' must be a stored date or datetime field`);
  const ops = strings(row.ops, 'ops');
  for (const o of ops) if (!OPS.includes(o as DateLockOp)) fail(`unknown operation '${o}'`);
  const bypass = strings(row.bypass_groups, 'bypass_groups');
  const exprs: Record<'when' | 'hard' | 'soft', string | null> = { when: null, hard: null, soft: null };
  const paths = new Set<string>([row.date]);
  for (const k of ['when', 'hard', 'soft'] as const) {
    const src = row[k];
    if (src === null || src === undefined || !String(src).trim()) continue;
    if (typeof src !== 'string') return fail(`${k} must be an NX-Expr string`);
    let deps: string[];
    try { parseExpression(src); deps = extractDependencies(src); } catch (e) {
      return fail(`${k}: ${e instanceof Error ? e.message : 'invalid expression'}`);
    }
    for (const p of deps) {
      const parts = p.split('.');
      let model = row.model;
      parts.forEach((part, i) => {
        const fd = registry.get(model).fields.get(part);
        if (!fd) return fail(`${k}: unknown field '${part}' on '${model}'`);
        if (i < parts.length - 1) {
          if (fd.type !== 'many2one' || !fd.comodel) return fail(`${k}: '${part}' is not a many2one; only many2one chains can be followed`);
          model = fd.comodel;
        }
      });
      if (parts.length > MAX_DEPTH) return fail(`${k}: path '${p}' is too deep`);
      paths.add(p);
    }
    exprs[k] = src;
  }
  if (!exprs.hard && !exprs.soft) return fail('needs a hard or a soft lock expression');
  if (paths.size > MAX_PATHS) return fail(`at most ${MAX_PATHS} field paths`);
  // a root used both bare and traversed would compare an object with an id
  for (const p of paths) {
    const parts = p.split('.');
    if (parts.length === 1 && [...paths].some((q) => q.startsWith(p + '.'))) fail(`'${p}' is used both as an id and as a record`);
  }
  return {
    id: row.id, model: row.model, field: row.date, ...exprs, bypass: new Set(bypass),
    ops: new Set(ops.length ? (ops as DateLockOp[]) : OPS), reads: [...new Set([...paths].map((p) => p.split('.')[0]!))], paths: [...paths],
  };
}

/** Constraint of `ir.date.lock`: system-only, strict compile, groups must exist. Drops the policy index. */
export async function checkDateLockRecords(records: Recordset): Promise<void> {
  const env = records.env as EnvImpl;
  await assertSystem(env);
  const rows = await env.db.query<DateLockRow>({
    text: `SELECT id, model, "date", "when", hard, soft, bypass_groups, ops, active FROM ir_date_lock WHERE id = ANY($1) ORDER BY id`,
    params: [[...records.ids]],
  });
  markPolicyDirty(env);
  for (const row of rows) {
    const lock = compileDateLock(env.registry, row);
    if (lock.bypass.size) {
      const found = await env.db.query<{ code: string }>({ text: `SELECT code FROM res_groups WHERE code = ANY($1)`, params: [[...lock.bypass]] });
      const known = new Set(found.map((g) => g.code));
      for (const g of lock.bypass) if (!known.has(g)) throw new ValidationError(`Date lock for '${row.model}': group '${g}' does not exist`);
    }
  }
}

// ---------- evaluation ----------

type Vals = Record<string, unknown>;
type Tree = Map<string, Tree>;

function dateOf(v: unknown): string | null {
  if (v === null || v === undefined || v === false || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

/** Loads the many2one chains the expressions follow, with a sudo env, into object values. */
async function scopeOf(env: EnvImpl, model: string, record: Vals, paths: readonly string[]): Promise<Record<string, ExprValue>> {
  const tree: Tree = new Map();
  for (const p of paths) {
    const parts = p.split('.');
    if (parts.length < 2) continue;
    let node = tree;
    for (const part of parts.slice(0, -1).concat(parts.slice(-1))) {
      if (!node.has(part)) node.set(part, new Map());
      node = node.get(part)!;
    }
  }
  const load = async (m: string, id: unknown, children: Tree): Promise<Record<string, ExprValue> | null> => {
    if (typeof id !== 'number') return null;
    const names = [...children.keys()].filter((n) => n !== 'id');
    const [row] = await env.model(m).browse(id).read(names.length ? names : ['id']);
    if (!row) return null;
    const out: Record<string, ExprValue> = { id };
    const meta = env.registry.get(m);
    for (const n of names) {
      const sub = children.get(n)!;
      out[n] = sub.size ? await load(meta.fields.get(n)!.comodel!, row[n], sub) : jsonValue(row[n]);
    }
    return out;
  };
  const meta = env.registry.get(model);
  const scope: Record<string, ExprValue> = {};
  for (const [k, v] of Object.entries(record)) scope[k] = jsonValue(v);
  for (const [root, sub] of tree) scope[root] = await load(meta.fields.get(root)!.comodel!, record[root], sub);
  return scope;
}

type Hit = { kind: 'hard' | 'soft'; date: string; limit: string; lock: DateLock };

async function evalDate(env: EnvImpl, lock: DateLock, scope: Record<string, ExprValue>, src: string, what: string): Promise<string | null> {
  const v = await evaluateEnvExpression(env, src, { ...scope, record: scope }, { readOnly: true });
  if (v === null || v === undefined || v === false || v === '') return null;
  const d = dateOf(v);
  if (!d) throw new DateLockError(`Date lock for '${lock.model}': ${what} did not evaluate to a date`);
  return d;
}

async function hitOf(env: EnvImpl, lock: DateLock, record: Vals): Promise<Hit | null> {
  const date = dateOf(record[lock.field]);
  if (!date) return null;
  const scope = await scopeOf(env, lock.model, record, lock.paths);
  if (lock.when && (await evaluateEnvExpression(env, lock.when, { ...scope, record: scope }, { readOnly: true })) !== true) return null;
  if (lock.hard) {
    const limit = await evalDate(env, lock, scope, lock.hard, 'hard');
    if (limit && date <= limit) return { kind: 'hard', date, limit, lock };
  }
  if (lock.soft) {
    const limit = await evalDate(env, lock, scope, lock.soft, 'soft');
    if (limit && date <= limit) return { kind: 'soft', date, limit, lock };
  }
  return null;
}

/** One record state to check: `id` set for an existing record (its row values are in `values`). */
export interface LockSubject { id?: number; values: Vals }

/**
 * Refuses the operation when a record state falls into a locked period. `subjects` are old states
 * (write / unlink) and new states (create / write); the caller built the new state of a write by
 * overlaying the written values on the old row.
 */
export async function enforceDateLocks(env: EnvImpl, locks: readonly DateLock[], op: DateLockOp, subjects: readonly LockSubject[]): Promise<void> {
  const sudo = env.sudo() as EnvImpl;
  let soft: Hit | undefined;
  for (const lock of locks) {
    if (!lock.ops.has(op)) continue;
    for (const s of subjects) {
      const hit = await hitOf(sudo, lock, s.values);
      if (!hit) continue;
      if (hit.kind === 'hard') {
        throw new DateLockError(`${lock.model}${s.id ? `(${s.id})` : ''}: dated ${hit.date}, on or before the hard lock date ${hit.limit}; ${op} refused`);
      }
      soft ??= hit;
    }
  }
  if (!soft || env.su) return;
  const groups = (await userSecurity(env)).groups;
  const bypassed = (h: Hit): boolean => [...h.lock.bypass].some((g) => groups.has(g));
  // every soft hit must be bypassed; recompute them (cheap, cached reads) to judge each one
  for (const lock of locks) {
    if (!lock.ops.has(op)) continue;
    for (const s of subjects) {
      const hit = await hitOf(sudo, lock, s.values);
      if (hit?.kind === 'soft' && !bypassed(hit)) {
        throw new DateLockError(`${lock.model}${s.id ? `(${s.id})` : ''}: dated ${hit.date}, on or before the soft lock date ${hit.limit}; ${op} refused`);
      }
    }
  }
}

/** Existing rows' values for the fields the locks read (locked FOR UPDATE in id order, trusted sudo read). */
export async function readLockRows(env: EnvImpl, model: string, ids: readonly number[], locks: readonly DateLock[]): Promise<LockSubject[]> {
  if (!ids.length) return [];
  const table = env.registry.get(model).table;
  if (table) {
    await env.db.query({ text: `SELECT id FROM "${table}" WHERE id = ANY($1) ORDER BY id FOR UPDATE`, params: [[...ids].sort((a, b) => a - b)] });
    env.cache.invalidate(model, ids);
  }
  const names = [...new Set(locks.flatMap((l) => l.reads))];
  const rows = await env.sudo().model(model).browse([...ids]).read(names);
  return rows.map((r) => ({ id: r.id as number, values: r as Vals }));
}

// ---------- ratchet ----------

const NUMERIC = new Set(['integer', 'float', 'monetary']);
function comparable(f: FieldDef, v: unknown): number | null {
  if (v === null || v === undefined || v === false || v === '') return null;
  if (NUMERIC.has(f.type)) { const n = Number(v); return Number.isNaN(n) ? null : n; }
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

/** Fields with `ratchet: 'up'` of a model (stored columns only). */
export function ratchetFields(registry: Registry, model: string): string[] {
  const out: string[] = [];
  for (const [name, f] of registry.get(model).fields) if (f.ratchet === 'up' && !f.delegated && isColumn(f as FieldDef)) out.push(name);
  return out;
}

export async function enforceRatchets(env: EnvImpl, model: string, fields: readonly string[], ids: readonly number[], vals: Vals): Promise<void> {
  const touched = fields.filter((n) => Object.hasOwn(vals, n));
  if (!touched.length || !ids.length) return;
  // Always read the floor after taking its row lock. The caller acquires any lifecycle parent locks
  // first; repeating FOR UPDATE here is safe and also covers models without a lifecycle/date policy.
  const table = env.registry.get(model).table;
  if (table) {
    await env.db.query({
      text: `SELECT id FROM "${table}" WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
      params: [[...ids].sort((a, b) => a - b)],
    });
    env.cache.invalidate(model, ids);
  }
  const meta = env.registry.get(model);
  const rows = await env.sudo().model(model).browse([...ids]).read(touched);
  for (const row of rows) {
    for (const n of touched) {
      const f = meta.fields.get(n)!;
      const before = comparable(f, row[n]);
      if (before === null) continue;
      const after = comparable(f, vals[n]);
      if (after === null || after < before) {
        throw new DateLockError(`${model}(${row.id as number}): '${n}' can only increase (it cannot be lowered or cleared)`);
      }
    }
  }
}

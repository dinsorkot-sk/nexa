import { ValidationError } from '../contracts/index.js';
import { evaluateEnvExpression } from '../orm/expr-helpers.js';
import { extractDependencies, parseExpression, type ExprValue } from '../expr/index.js';
import type { EnvImpl } from '../orm/env.js';
import { readRecord, relationalScope } from '../services/record-scope.js';
import { isColumn } from '../orm/registry.js';
import type { PolicyIndex } from './lifecycle.js';
import { withWriteToken } from './token.js';

/**
 * ADR 0004 amendment A1: the generic `balance` transition effect. It keeps keyed running balances
 * (any model with an `ir.lifecycle` whose delta fields are engine fields) and is domain-agnostic.
 *
 * Expression scope: bare names and `record.*` are the transitioned record, `line.*` is the child row
 * (the record itself when `from` is omitted), `balance.*` is the locked target row as it was BEFORE
 * the entry's delta (a new row reads as zeros). `key` and `when` see no `balance`. `into` also sees
 * `delta.<field>` (the values about to be added); `checks` see the row AFTER the update.
 */

export interface BalanceCheck { expr: string; message: string }
export interface BalanceEntry { key: Record<string, string>; deltas: Record<string, string>; when?: string }
export interface BalanceEffect {
  type: 'balance'; from?: string; target: string; entries: BalanceEntry[]; into?: Record<string, string>; checks: BalanceCheck[];
}

const MAX = 100;
const NUMERIC = new Set(['integer', 'float', 'monetary']);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function compileBalance(env: EnvImpl, raw: Record<string, unknown>, model: string, index: PolicyIndex, label: string): BalanceEffect {
  const fail = (m: string): never => { throw new ValidationError(`${label}: balance effect: ${m}`); };
  const meta = env.registry.get(model);
  let lineModel = model;
  let from: string | undefined;
  if (raw.from !== undefined && raw.from !== null) {
    const f = typeof raw.from === 'string' ? meta.fields.get(raw.from) : undefined;
    if (!f || f.type !== 'one2many' || !f.comodel || !f.inverseName) return fail('from must be a one2many field of the record');
    from = raw.from as string; lineModel = f.comodel;
  }
  const target = typeof raw.target === 'string' ? raw.target : '';
  const targetMeta = env.registry.models.get(target);
  if (!targetMeta) return fail(`target model '${target}' does not exist`);
  const entry = index.get(target);
  if (!entry?.policy || entry.broken) return fail(`target '${target}' needs an active ir.lifecycle`);
  const policy = entry.policy;
  const lineMeta = env.registry.get(lineModel);
  for (const [m, mm] of [[model, meta], [lineModel, lineMeta]] as const) {
    for (const n of ['balance', 'delta', 'line', 'record']) {
      if (mm.fields.has(n)) fail(`model '${m}' has a field named '${n}', which would shadow the expression variable of the same name`);
    }
  }
  const roots = (source: string, what: string, allow: { balance: boolean; delta: boolean }): void => {
    try { parseExpression(source); } catch (e) { fail(`${what}: ${e instanceof Error ? e.message : 'invalid expression'}`); }
    let paths: string[];
    try { paths = extractDependencies(source); } catch { return; }
    for (const p of paths) {
      const [root, name] = p.split('.');
      if (root === 'line' && name && !lineMeta.fields.has(name)) fail(`${what}: unknown field '${name}' on '${lineModel}'`);
      if (root === 'record' && name && !meta.fields.has(name)) fail(`${what}: unknown field '${name}' on '${model}'`);
      if (root === 'balance') {
        if (!allow.balance) fail(`${what}: 'balance' is not available here`);
        if (name && !targetMeta.fields.has(name)) fail(`${what}: unknown field '${name}' on '${target}'`);
      }
      if (root === 'delta' && !allow.delta) fail(`${what}: 'delta' is not available here`);
    }
  };
  const text = (v: unknown, what: string): string => {
    if (typeof v !== 'string' || !v.trim()) return fail(`${what} must be an NX-Expr string`);
    return v;
  };
  if (!Array.isArray(raw.entries) || !raw.entries.length || raw.entries.length > MAX) fail(`entries must be a list of 1 to ${MAX} items`);
  const entries: BalanceEntry[] = (raw.entries as unknown[]).map((e) => {
    if (!isObj(e) || !isObj(e.key) || !Object.keys(e.key).length || !isObj(e.deltas) || !Object.keys(e.deltas).length) {
      return fail('every entry needs a non-empty key and deltas object');
    }
    const key: Record<string, string> = {};
    for (const [k, s] of Object.entries(e.key)) {
      const kf = targetMeta.fields.get(k);
      if (!kf) fail(`unknown key field '${k}' on '${target}'`);
      if (!isColumn(kf as never) || kf!.type === 'one2many' || kf!.type === 'many2many') fail(`key field '${k}' must be a stored scalar or many2one field`);
      if (policy.engineFields.has(k) || policy.transitionOnly.has(k)) fail(`key field '${k}' cannot be an engine or transition-only field`);
      key[k] = text(s, `key '${k}'`); roots(key[k]!, `key '${k}'`, { balance: false, delta: false });
    }
    const deltas: Record<string, string> = {};
    for (const [k, s] of Object.entries(e.deltas)) {
      const f = targetMeta.fields.get(k);
      if (!f) fail(`unknown delta field '${k}' on '${target}'`);
      if (!NUMERIC.has(f!.type)) fail(`delta field '${k}' must be numeric`);
      if (!policy.engineFields.has(k)) fail(`delta field '${k}' must be an engine field of the '${target}' lifecycle`);
      if (k in key) fail(`field '${k}' cannot be both key and delta`);
      deltas[k] = text(s, `delta '${k}'`); roots(deltas[k]!, `delta '${k}'`, { balance: true, delta: false });
    }
    const keyNames = Object.keys(key);
    const unique = [...targetMeta.fields.values()].some((f) => f.unique && isColumn(f as never)
      && (keyNames.includes(f.name) || (!!f.compute || !!f.computeExpr) && keyNames.every((n) => (f.depends ?? []).some((d) => d === n || d.startsWith(n + '.')))));
    if (!unique) fail(`target '${target}' needs a stored unique field that is a key field or a stored computed field depending on every key field`);
    const out: BalanceEntry = { key, deltas };
    if (e.when !== undefined && e.when !== null) { out.when = text(e.when, 'when'); roots(out.when, 'when', { balance: false, delta: false }); }
    return out;
  });
  let into: Record<string, string> | undefined;
  if (raw.into !== undefined && raw.into !== null) {
    if (entries.length > 1) fail('into is only allowed with a single entry');
    if (!isObj(raw.into) || !Object.keys(raw.into).length) fail('into must be a non-empty object');
    into = {};
    for (const [k, s] of Object.entries(raw.into as Record<string, unknown>)) {
      if (!lineMeta.fields.has(k)) fail(`unknown into field '${k}' on '${lineModel}'`);
      into[k] = text(s, `into '${k}'`); roots(into[k]!, `into '${k}'`, { balance: true, delta: true });
    }
  }
  const rawChecks = raw.checks ?? [];
  if (!Array.isArray(rawChecks) || rawChecks.length > MAX) fail('checks must be a list');
  const checks = (rawChecks as unknown[]).map((c) => {
    if (!isObj(c) || typeof c.message !== 'string' || !c.message) return fail('every check needs expr and message');
    const expr = text(c.expr, 'check'); roots(expr, 'check', { balance: true, delta: false });
    return { expr, message: c.message };
  });
  return { type: 'balance', ...(from ? { from } : {}), target, entries, ...(into ? { into } : {}), checks };
}

type Scalar = string | number | boolean;
type Rec = Record<string, ExprValue>;

/** Per effect, record and line: the bucket id of each entry (null when the entry's `when` is false). */
export type BalancePlan = Map<string, (number | null)[]>;
export const planKey = (effect: number, record: number, line: number): string => `${effect}:${record}:${line}`;

/** Null numeric fields of a balance row read as 0 (new rows, nullable columns). */
function zeroFill(env: EnvImpl, target: string, row: Rec): Rec {
  for (const [name, f] of env.registry.get(target).fields) {
    if (NUMERIC.has(f.type) && (row[name] === null || row[name] === undefined)) row[name] = 0;
  }
  return row;
}

function roundTo(env: EnvImpl, target: string, field: string, value: number): number {
  const d = env.registry.get(target).fields.get(field)?.digits;
  const scale = Array.isArray(d) ? Number(d[1]) : 10;
  const f = 10 ** scale;
  return Math.round(value * f) / f;
}

async function evaluate(env: EnvImpl, source: string, record: Rec, line: Rec, extra: Record<string, ExprValue> = {}): Promise<ExprValue> {
  const recordScope = await relationalScope(env, source, record, {});
  const lineScope = await relationalScope(env, source, line, { prefix: 'line' });
  return evaluateEnvExpression(env, source, { ...recordScope, record: recordScope, line: lineScope, ...extra }, { readOnly: true });
}

const bucketSql = (table: string, fields: string[]): string =>
  `SELECT id FROM "${table}" WHERE ${fields.map((f, i) => `"${f}" = $${i + 1}`).join(' AND ')} ORDER BY id LIMIT 1`;

interface Wanted { target: string; fields: string[]; values: Scalar[] }

/**
 * Lock step 2b: evaluates every key of the whole run first, creates missing rows, then locks all rows
 * of each target model by ascending id. Call after the parent and child locks, before any effect runs.
 */
export async function lockBalances(
  env: EnvImpl, effects: readonly BalanceEffect[], model: string, ids: readonly number[],
  lines: (effect: BalanceEffect, id: number) => Promise<Rec[]>, index: PolicyIndex,
): Promise<BalancePlan> {
  const sudo = env.sudo() as EnvImpl;
  const wanted = new Map<string, Wanted>();
  const pending = new Map<string, string[]>();
  for (const id of ids) {
    const record = await readRecord(env, model, id);
    for (const [ei, effect] of effects.entries()) {
      for (const line of await lines(effect, id)) {
        const lineId = Number(line.id);
        const keys: string[] = [];
        for (const entry of effect.entries) {
          if (entry.when && (await evaluate(env, entry.when, record, line)) !== true) { keys.push(''); continue; }
          const fields = Object.keys(entry.key);
          const values: Scalar[] = [];
          for (const f of fields) {
            const v = await evaluate(env, entry.key[f]!, record, line);
            if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
              throw new ValidationError(`Balance key '${f}' on '${effect.target}' must evaluate to a value, not null`);
            }
            values.push(v);
          }
          const k = `${effect.target}|${JSON.stringify([fields, values])}`;
          if (!wanted.has(k)) wanted.set(k, { target: effect.target, fields, values });
          keys.push(k);
        }
        pending.set(planKey(ei, id, lineId), keys);
      }
    }
  }
  const found = new Map<string, number>();
  const stateOf = (target: string): Record<string, unknown> => {
    const p = index.get(target)?.policy;
    return p?.stateField && p.initialState ? { [p.stateField]: p.initialState } : {};
  };
  for (const [k, w] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const table = env.registry.get(w.target).table!;
    let [row] = await env.db.query<{ id: number }>({ text: bucketSql(table, w.fields), params: w.values });
    if (!row) {
      try {
        // the ORM wraps create in a savepoint, so losing a unique-key race only rolls this insert back
        await sudo.model(w.target).create({ ...Object.fromEntries(w.fields.map((f, i) => [f, w.values[i]])), ...stateOf(w.target) });
      } catch (e) {
        if (!(e instanceof ValidationError) || !/Duplicate value/.test(e.message)) throw e;
      }
      [row] = await env.db.query<{ id: number }>({ text: bucketSql(table, w.fields), params: w.values });
      if (!row) throw new ValidationError(`Balance row of '${w.target}' could not be created: give '${w.target}' a unique key over its key fields and defaults for its other required fields`);
    }
    found.set(k, Number(row.id));
  }
  const perModel = new Map<string, Set<number>>();
  for (const [k, id] of found) {
    const target = wanted.get(k)!.target;
    if (!perModel.has(target)) perModel.set(target, new Set());
    perModel.get(target)!.add(id);
  }
  for (const [target, set] of [...perModel].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const locked = await env.db.query<{ id: number }>({
      text: `SELECT id FROM "${env.registry.get(target).table}" WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
      params: [[...set].sort((a, b) => a - b)],
    });
    if (locked.length !== set.size) throw new ValidationError(`Balance rows of '${target}' are unavailable`);
  }
  const plan: BalancePlan = new Map();
  for (const [p, keys] of pending) plan.set(p, keys.map((k) => (k ? found.get(k)! : null)));
  return plan;
}

/** Applies one effect to one line: deltas onto the (already locked) balance rows, `into` onto the line. */
export async function applyBalance(
  env: EnvImpl, effect: BalanceEffect, buckets: readonly (number | null)[], record: Rec, line: Rec, lineModel: string,
): Promise<void> {
  const sudo = env.sudo() as EnvImpl;
  const target = effect.target;
  const intoValues: Record<string, unknown> = {};
  for (const [i, entry] of effect.entries.entries()) {
    const bucketId = buckets[i];
    if (bucketId === null || bucketId === undefined) continue;
    sudo.cache.invalidate();
    const before = zeroFill(env, target, await readRecord(sudo, target, bucketId));
    const deltas: Record<string, ExprValue> = {};
    const next: Record<string, unknown> = {};
    for (const [f, source] of Object.entries(entry.deltas)) {
      const d = await evaluate(env, source, record, line, { balance: before });
      if (typeof d !== 'number' || !Number.isFinite(d)) throw new ValidationError(`Balance delta '${f}' must evaluate to a number`);
      deltas[f] = d;
      next[f] = roundTo(env, target, f, Number(before[f]) + d);
    }
    for (const [f, source] of Object.entries(effect.into ?? {})) {
      intoValues[f] = await evaluate(env, source, record, line, { balance: before, delta: deltas });
    }
    await withWriteToken(env, { op: 'write', model: target, ids: [bucketId], fields: Object.keys(next) },
      () => sudo.model(target).browse(bucketId).write(next));
    // checks run per update (ADR 0004 A1), so each entry is validated against the row it just changed
    if (effect.checks.length) {
      sudo.cache.invalidate();
      const after = zeroFill(env, target, await readRecord(sudo, target, bucketId));
      for (const c of effect.checks) {
        if ((await evaluate(env, c.expr, record, line, { balance: after })) !== true) throw new ValidationError(c.message);
      }
    }
  }
  if (Object.keys(intoValues).length) {
    const lineId = Number(line.id);
    await withWriteToken(env, { op: 'write', model: lineModel, ids: [lineId], fields: Object.keys(intoValues) },
      () => env.model(lineModel).browse(lineId).write(intoValues));
  }
}

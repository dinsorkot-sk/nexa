import { EngineError, ValidationError, type ComputeFn, type ResolvedModel } from '../contracts/index.js';
import type { EnvImpl } from './env.js';
import type { RecordsetImpl } from './recordset.js';
import type { ResolvedField } from './registry.js';
import { createExpressionHelpers, extractDependencies, type ExprValue } from '../expr/index.js';
import { userSecurity } from '../security/access.js';
import { localClock } from './clock.js';
import { evaluateEnvExpression, registeredSyncHelpers, roundFieldValue } from './expr-helpers.js';

/**
 * Stored-compute dependency tracking (Odoo `@api.depends` triggers).
 *
 * For a stored computed field F on model M with dependency path p0.p1...pn, a change of field pk
 * on the model reached after k hops affects the M records found by
 *   search(M, [[p0...p(k-1), 'in', changedIds]])      (or the changed ids themselves when k = 0).
 * one2many hops are also triggered by their inverse many2one on the comodel.
 */
interface Trigger {
  field: string;          // field on the triggering model
  target: string;         // model M holding the computed field
  computed: string;       // computed field F
  prefix: string;         // path from M to the triggering model ('' = M itself)
}

const indexCache = new WeakMap<ReadonlyMap<string, ResolvedModel>, Map<string, Trigger[]>>();

function triggerIndex(models: ReadonlyMap<string, ResolvedModel>): Map<string, Trigger[]> {
  let idx = indexCache.get(models);
  if (idx) return idx;
  idx = new Map();
  const add = (model: string, t: Trigger) => {
    let list = idx!.get(model);
    if (!list) idx!.set(model, (list = []));
    list.push(t);
  };
  for (const m of models.values()) {
    for (const f of m.fields.values() as Iterable<ResolvedField>) {
      if (!isStoredComputed(f)) continue;
      for (const dep of f.depends ?? []) {
        const parts = dep.split('.');
        let cur = m;
        for (let k = 0; k < parts.length; k++) {
          const pf = cur.fields.get(parts[k])!;
          add(cur.name, { field: parts[k], target: m.name, computed: f.name, prefix: parts.slice(0, k).join('.') });
          if (pf.type === 'one2many' && pf.inverseName) {
            add(pf.comodel!, { field: pf.inverseName, target: m.name, computed: f.name, prefix: parts.slice(0, k + 1).join('.') });
          }
          if (pf.type === 'many2many') {
            // '*' fires only when comodel records are created/deleted ('all'): deletion drops relation rows
            add(pf.comodel!, { field: '*', target: m.name, computed: f.name, prefix: parts.slice(0, k + 1).join('.') });
          }
          if (k < parts.length - 1) cur = models.get(pf.comodel!)!;
        }
      }
    }
  }
  indexCache.set(models, idx);
  return idx;
}

export function isStoredComputed(f: ResolvedField): boolean {
  return !!(f.compute || f.computeExpr || f.related) && !!f.store;
}

export function isComputed(f: ResolvedField): boolean {
  return !!(f.compute || f.computeExpr || f.related);
}

/** target model -> computed field -> ids to recompute */
export type Todo = Map<string, Map<string, Set<number>>>;

export function mergeTodo(into: Todo, from: Todo): Todo {
  for (const [model, fields] of from) {
    let mf = into.get(model);
    if (!mf) into.set(model, (mf = new Map()));
    for (const [f, ids] of fields) {
      let s = mf.get(f);
      if (!s) mf.set(f, (s = new Set()));
      for (const id of ids) s.add(id);
    }
  }
  return into;
}

/** Records whose stored computed fields depend on `fields` ('all' = any field) of `ids` in `model`. */
export async function affected(env: EnvImpl, model: string, fields: ReadonlySet<string> | 'all', ids: readonly number[]): Promise<Todo> {
  const todo: Todo = new Map();
  if (ids.length === 0) return todo;
  const triggers = triggerIndex(env.registry.models).get(model) ?? [];
  const su = env.sudo() as EnvImpl;
  for (const t of triggers) {
    if (fields !== 'all' && !fields.has(t.field)) continue;
    const targetIds = t.prefix === '' ? ids : (await su.withContext({ activeTest: false }).model(t.target).search([[t.prefix, 'in', [...ids]]])).ids;
    if (targetIds.length) mergeTodo(todo, new Map([[t.target, new Map([[t.computed, new Set(targetIds)]])]]));
  }
  return todo;
}

/**
 * Each level follows one dependency hop; a hierarchy (e.g. complete_name via parent_id) needs one
 * level per tree depth, so the bound is generous and only stops genuine cycles.
 */
const MAX_CASCADE = 1000;

/**
 * Recompute and store the fields in `todo`, then follow triggers on the stored results.
 * Returns everything that was recomputed (model -> field -> ids), so callers can validate it.
 */
export async function recompute(env: EnvImpl, todo: Todo, done: Todo = new Map(), depth = 0): Promise<Todo> {
  if (todo.size === 0) return done;
  if (depth > MAX_CASCADE) throw new EngineError('Computed field dependencies do not settle (cycle?)');
  const su = env.sudo() as EnvImpl;
  const next: Todo = new Map();
  for (const [model, fields] of todo) {
    const meta = env.registry.get(model);
    const allIds = [...new Set([...fields.values()].flatMap((s) => [...s]))];
    // skip records deleted in the meantime
    const alive = new Set((await su.withContext({ activeTest: false }).model(model).search([['id', 'in', allIds]])).ids);
    for (const [fname, idSet] of fields) {
      const ids = [...idSet].filter((id) => alive.has(id));
      if (!ids.length) continue;
      const f = meta.fields.get(fname) as ResolvedField;
      const values = await computeValues(su.model(model).browse(ids) as RecordsetImpl, f);
      if (f.type === 'float' && typeof f.digits === 'string') {
        for (const [id, value] of values) values.set(id, await roundFieldValue(su, f, fname, value));
      }
      await (su.model(model) as RecordsetImpl).storeRaw(fname, values);
      mergeTodo(done, new Map([[model, new Map([[fname, new Set(ids)]])]]));
      mergeTodo(next, await affected(su, model, new Set([fname]), ids));
    }
  }
  return recompute(env, next, done, depth + 1);
}

/**
 * Before deleting `ids` of `model`: records the database will change through foreign keys
 * (ON DELETE CASCADE deletes, SET NULL clears) and what depends on them. Deleted records are
 * returned so they can be excluded from recomputation.
 */
export async function cascadeAffected(
  env: EnvImpl, model: string, ids: readonly number[],
): Promise<{ todo: Todo; deleted: Map<string, Set<number>> }> {
  const su = env.sudo() as EnvImpl;
  const todo: Todo = new Map();
  const deleted = new Map<string, Set<number>>();
  const queue: [string, number[]][] = [[model, [...ids]]];
  while (queue.length) {
    const [m, del] = queue.shift()!;
    const known = deleted.get(m) ?? new Set<number>();
    const fresh = del.filter((id) => !known.has(id));
    if (!fresh.length) continue;
    fresh.forEach((id) => known.add(id));
    deleted.set(m, known);
    mergeTodo(todo, await affected(su, m, 'all', fresh));
    for (const child of env.registry.models.values()) {
      if (!child.table) continue;
      for (const f of child.fields.values() as Iterable<ResolvedField>) {
        if (f.type !== 'many2one' || f.comodel !== m || !isColumnField(f)) continue;
        const rows = (await su.withContext({ activeTest: false }).model(child.name).search([[f.name, 'in', fresh]])).ids;
        if (!rows.length) continue;
        if ((f.ondelete ?? 'set null') === 'cascade') queue.push([child.name, [...rows]]);
        else if (f.ondelete !== 'restrict') mergeTodo(todo, await affected(su, child.name, new Set([f.name]), rows));
      }
    }
  }
  for (const [m, ids2] of deleted) todo.get(m)?.forEach((s) => ids2.forEach((id) => s.delete(id)));
  return { todo, deleted };
}

function isColumnField(f: ResolvedField): boolean {
  return !f.compute && !f.computeExpr && !f.related;
}

/** Evaluate a computed or related field for a batch of records. */
export async function computeValues(records: RecordsetImpl, f: ResolvedField): Promise<Map<number, unknown>> {
  if (f.related) return followPath(records, f.related);
  if (f.computeExpr) {
    const paths = f.depends ?? extractDependencies(f.computeExpr);
    const out = new Map<number, unknown>();
    for (const id of records.ids) {
      const record = await expressionRecord(records, id, paths);
      const value = await evaluateEnvExpression(records.env, f.computeExpr, { ...(record as Record<string, ExprValue>), record: record as ExprValue });
      if (!validExpressionValue(f, value)) throw new ValidationError(`Expression result has the wrong type for '${records.model}.${f.name}'`);
      out.set(id, value);
    }
    return out;
  }
  const meta = records.env.registry.get(records.model);
  const methods = meta.def.methods;
  const fn = (typeof f.compute === 'string'
    ? (methods && Object.hasOwn(methods, f.compute) ? methods[f.compute] : undefined)
    : f.compute) as ComputeFn | undefined;
  if (!fn) throw new EngineError(`No compute for '${records.model}.${f.name}'`);
  const raw = await fn(records);
  const map = raw instanceof Map ? raw : new Map(Object.entries(raw ?? {}).map(([k, v]) => [Number(k), v]));
  const out = new Map<number, unknown>();
  for (const id of records.ids) out.set(id, map.has(id) ? map.get(id) : null);
  return out;
}

function validExpressionValue(field: ResolvedField, value: ExprValue): boolean {
  if (value === null) return true;
  switch (field.type) {
    case 'boolean': return typeof value === 'boolean';
    case 'integer': return typeof value === 'number' && Number.isSafeInteger(value);
    case 'float': case 'monetary': return typeof value === 'number' && Number.isFinite(value);
    case 'many2one': return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
    case 'one2many': case 'many2many': return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isSafeInteger(item) && item > 0);
    case 'json': return true;
    default: return typeof value === 'string';
  }
}

/** Build only caller-readable dependency data; expression evaluation has no ORM or sudo bridge. */
export async function expressionRecord(records: RecordsetImpl, id: number, paths: readonly string[]): Promise<Record<string, unknown>> {
  type PathNode = { terminal: boolean; children: Map<string, PathNode> };
  if (paths.length > 64 || paths.some((path) => path.split('.').length > 16)) throw new EngineError('Expression dependency quota exceeded');
  const rootNode: PathNode = { terminal: false, children: new Map() };
  let nodeCount = 1;
  for (const path of paths) {
    let node = rootNode;
    for (const part of path.split('.')) {
      if (!node.children.has(part)) {
        if (++nodeCount > 256) throw new EngineError('Expression dependency quota exceeded');
        node.children.set(part, { terminal: false, children: new Map() });
      }
      node = node.children.get(part)!;
    }
    node.terminal = true;
  }
  const hydrate = async (model: string, ids: number[], tree: PathNode): Promise<Map<number, Record<string, unknown>>> => {
    if (ids.length > 1000) throw new EngineError('Expression relation row quota exceeded');
    const out = new Map(ids.map((recordId) => [recordId, {} as Record<string, unknown>]));
    if (!ids.length) return out;
    for (const [name, child] of tree.children) {
      const field = records.env.registry.get(model).fields.get(name);
      if (!field) throw new EngineError(`Unknown expression dependency '${model}.${name}'`);
      const rows = await records.env.model(model).browse(ids).read([name]);
      const values = new Map(rows.map((row) => [row.id as number, row[name]]));
      if (!child.children.size) {
        for (const recordId of ids) out.get(recordId)![name] = expressionScalar(field.type, values.get(recordId) ?? null);
        continue;
      }
      if (!field.comodel) throw new EngineError(`Expression dependency '${model}.${name}' is not relational`);
      const relationIds = new Map<number, number[]>();
      const allTargets = new Set<number>();
      for (const recordId of ids) {
        const value = values.get(recordId);
        const targets = field.type === 'many2one'
          ? typeof value === 'number' ? [value] : []
          : Array.isArray(value) ? value.filter((x): x is number => typeof x === 'number') : [];
        relationIds.set(recordId, targets);
        targets.forEach((target) => allTargets.add(target));
      }
      const nested = await hydrate(field.comodel, [...allTargets], child);
      for (const recordId of ids) {
        const targets = relationIds.get(recordId)!;
        const value = field.type === 'many2one'
          ? targets.length ? nested.get(targets[0]!) ?? null : null
          : targets.map((target) => nested.get(target) ?? {});
        out.get(recordId)![name] = value;
      }
    }
    return out;
  };
  return (await hydrate(records.model, [id], rootNode)).get(id)!;
}

/** Driver values that are not plain data (Date) become ISO strings: dates 'YYYY-MM-DD', datetimes full ISO. */
function expressionScalar(type: string, value: unknown): unknown {
  if (!(value instanceof Date)) return value;
  if (!Number.isFinite(value.getTime())) return null;
  return type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
}

export async function expressionContext(env: EnvImpl): Promise<Record<string, unknown>> {
  const security = env.su ? undefined : await userSecurity(env);
  const companies = security?.companyIds ?? env.companyIds;
  let context: unknown;
  try {
    const json = JSON.stringify(env.context);
    if (json && json.length <= 16_384) context = JSON.parse(json);
  } catch { /* omit values that cannot be safely represented as expression data */ }
  const clock = localClock(env);
  return {
    ...createExpressionHelpers(registeredSyncHelpers()),
    user: { id: env.uid, company_id: security?.companyId ?? companies[0] ?? null },
    company: { id: security?.companyId ?? companies[0] ?? false },
    companies: companies.map((id) => ({ id })),
    context: context && typeof context === 'object' ? context : {},
    // today and local_now follow the user's time zone (context.tz); now is the UTC instant
    today: clock.today,
    local_now: clock.localNow,
    now: new Date().toISOString(),
  };
}

/** Follow a many2one chain and read the final field (Odoo `related`). */
async function followPath(records: RecordsetImpl, path: string): Promise<Map<number, unknown>> {
  const parts = path.split('.');
  let model = records.model;
  let cur = new Map<number, number | null>(records.ids.map((id) => [id, id]));
  const su = records.env.sudo() as EnvImpl;
  for (let i = 0; i < parts.length - 1; i++) {
    const f = su.registry.get(model).fields.get(parts[i])!;
    if (f.type !== 'many2one') throw new EngineError(`related path '${path}' may only traverse many2one fields`);
    const targets = [...new Set([...cur.values()].filter((v): v is number => v !== null))];
    const rows = targets.length ? await su.model(model).browse(targets).read([parts[i]]) : [];
    const step = new Map(rows.map((r) => [r.id as number, (r[parts[i]] as number | null) ?? null]));
    cur = new Map([...cur].map(([id, v]) => [id, v === null ? null : step.get(v) ?? null]));
    model = f.comodel!;
  }
  const last = parts[parts.length - 1];
  const targets = [...new Set([...cur.values()].filter((v): v is number => v !== null))];
  const rows = targets.length ? await su.model(model).browse(targets).read([last]) : [];
  const vals = new Map(rows.map((r) => [r.id as number, r[last]]));
  const lastField = su.registry.get(model).fields.get(last)!;
  const empty = lastField.type === 'one2many' || lastField.type === 'many2many' ? [] : null;
  return new Map([...cur].map(([id, v]) => [id, v === null ? empty : vals.get(v) ?? empty]));
}

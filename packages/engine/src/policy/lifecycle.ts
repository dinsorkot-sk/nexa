import { ValidationError, type FieldDef, type Registry, type ResolvedModel } from '../contracts/index.js';
import { afterOutermostTransaction, currentTransactionRoot, type EnvImpl } from '../orm/env.js';
import { isColumn } from '../orm/registry.js';
import { isProtectedModel } from '../security/records.js';
import { compileDateLock, type DateLock, type DateLockRow } from './datelock.js';

/** What one state of a lifecycle locks. */
export interface StateLock {
  readonly writable: ReadonlySet<string>;
  readonly unlink: boolean;
  /** one2many fields of the locked model whose rows are frozen while the record is in these states */
  readonly frozenChildren: ReadonlySet<string>;
}

/** Compiled `ir.lifecycle` row. */
export interface ModelPolicy {
  readonly model: string;
  readonly stateField: string | null;
  readonly initialState: string | null;
  /** state -> lock; states not listed are unrestricted */
  readonly locks: ReadonlyMap<string, StateLock>;
  /** fields that change only under a write token (the state field is always one of them) */
  readonly transitionOnly: ReadonlySet<string>;
  readonly engineFields: ReadonlySet<string>;
}

/** A child model frozen by the lifecycle of a parent model. */
export interface ParentLink {
  readonly parentModel: string;
  /** one2many field on the parent */
  readonly field: string;
  /** many2one on the child pointing at the parent */
  readonly inverse: string;
  readonly policy: ModelPolicy;
}

export interface ModelEntry {
  policy?: ModelPolicy;
  readonly parents: ParentLink[];
  readonly dateLocks: DateLock[];
  /** An active policy row exists but is unusable: every write / create / unlink of the model is refused. */
  broken?: string;
}

/** A many2one whose database-level cascade / set null can change locked rows when its master is deleted. */
export interface Referrer {
  readonly model: string;
  readonly field: string;
  readonly cascade: boolean;
  readonly policy: ModelPolicy;
  /** set when the model is a frozen child: its rows are locked through this parent link */
  readonly via?: ParentLink;
}

export class PolicyIndex {
  readonly models = new Map<string, ModelEntry>();
  /** master model -> referrers whose rows a delete of the master would cascade into / null out */
  readonly referrers = new Map<string, Referrer[]>();
  get(model: string): ModelEntry | undefined { return this.models.get(model); }
  entry(model: string): ModelEntry {
    let e = this.models.get(model);
    if (!e) this.models.set(model, (e = { parents: [], dateLocks: [] }));
    return e;
  }
}

export interface LifecycleRow {
  id?: number;
  model: string;
  state_field: string | null;
  initial_state: string | null;
  locks: unknown;
  transition_only: unknown;
  engine_fields: unknown;
  active?: boolean | null;
}

const MAGIC = new Set(['id', 'create_date', 'write_date', 'create_uid', 'write_uid', 'parent_path']);
const MAX_ITEMS = 200;
const LOCK_KEYS = new Set(['states', 'writable', 'unlink', 'frozen_children']);

function json(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch { return undefined; }
}

function names(value: unknown, what: string, strict: boolean): string[] {
  if (value === null || value === undefined) return [];
  const list = json(value);
  if (!Array.isArray(list)) { if (strict) throw new ValidationError(`${what} must be a list of field names`); return []; }
  if (list.length > MAX_ITEMS) throw new ValidationError(`${what}: at most ${MAX_ITEMS} entries`);
  if (list.some((x) => typeof x !== 'string' || x === '')) {
    if (strict) throw new ValidationError(`${what} must contain only names`);
    return list.filter((x): x is string => typeof x === 'string' && x !== '');
  }
  return [...new Set(list as string[])];
}

/** Models a lifecycle may target (and freeze as children). */
export function assertPolicyTarget(registry: Registry, model: string, what: string): ResolvedModel {
  const meta = registry.models.get(model);
  if (!meta) throw new ValidationError(`${what}: model '${model}' does not exist`);
  if (meta.def.abstract || meta.def.transient || !meta.table) throw new ValidationError(`${what}: model '${model}' is not a concrete model`);
  if (isProtectedModel(model) || model.startsWith('mail.')) {
    throw new ValidationError(`${what}: '${model}' is a protected system model and cannot have a lifecycle`);
  }
  return meta;
}

/**
 * Compiles one `ir.lifecycle` row. Strict mode (saving a record) throws ValidationError on anything
 * wrong. Lenient mode (rebuilding the index, e.g. after a registry reload removed a field) drops the
 * parts that no longer exist, records every weakening in `problems` and returns null only when the
 * whole row is unusable; the caller then fails closed.
 */
export function compileLifecycle(registry: Registry, row: LifecycleRow, strict: boolean, problems: string[] = []): ModelPolicy | null {
  const label = `Lifecycle for '${row.model}'`;
  let meta: ResolvedModel;
  try { meta = assertPolicyTarget(registry, row.model, label); } catch (error) {
    if (strict) throw error;
    problems.push(error instanceof Error ? error.message : String(error));
    return null;
  }
  const fields = meta.fields;
  /** Plain, stored, user-writable fields only: delegated, related and computed fields cannot be guarded here. */
  const has = (name: string) => {
    const f = fields.get(name);
    return !!f && !MAGIC.has(name) && !f.delegated && !f.related && !f.compute && !f.computeExpr;
  };
  const fail = (message: string): null => {
    if (strict) throw new ValidationError(`${label}: ${message}`);
    problems.push(`${label}: ${message}`);
    return null;
  };

  const stateField = row.state_field ? row.state_field : null;
  let selection: Set<string> | null = null;
  if (stateField) {
    const f = fields.get(stateField);
    if (!f || f.type !== 'selection' || !f.selection?.length) return fail(`'${stateField}' must be a selection field of the model`);
    if (f.delegated || f.related || f.compute || f.computeExpr || !isColumn(f as FieldDef)) return fail(`state field '${stateField}' must be a stored, non-computed field`);
    selection = new Set(f.selection.map(([key]) => key));
  }
  if (!stateField) {
    if (row.initial_state) return fail('initial_state needs a state field');
  } else if (!row.initial_state || !selection!.has(row.initial_state)) {
    return fail(`initial_state must be one of the states of '${stateField}'`);
  }

  const checkNames = (list: string[], what: string): string[] => {
    const known: string[] = [];
    for (const name of list) {
      if (!has(name)) {
        if (strict) {
          throw new ValidationError(`${label}: ${what} '${name}' is not a plain stored field of the model (delegated, related and computed fields cannot be listed)`);
        }
        // a vanished writable field only makes the lock stricter; anything else weakens the policy
        if (what !== 'writable field') problems.push(`${label}: ${what} '${name}' no longer exists`);
        continue;
      }
      known.push(name);
    }
    return known;
  };
  const transitionOnly = new Set(checkNames(names(row.transition_only, 'transition_only', strict), 'transition_only field'));
  const engineFields = new Set(checkNames(names(row.engine_fields, 'engine_fields', strict), 'engine field'));
  if (stateField) transitionOnly.add(stateField);

  const rawLocks = json(row.locks ?? []);
  if (!Array.isArray(rawLocks)) return fail('locks must be a list');
  if (rawLocks.length > MAX_ITEMS) return fail(`at most ${MAX_ITEMS} locks`);
  if (rawLocks.length && !stateField) return fail('locks need a state field');
  const locks = new Map<string, StateLock>();
  for (const raw of rawLocks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('each lock must be an object');
    const lock = raw as Record<string, unknown>;
    if (Object.keys(lock).some((k) => !LOCK_KEYS.has(k))) return fail('a lock only accepts states, writable, unlink and frozen_children');
    if (lock.unlink !== undefined && typeof lock.unlink !== 'boolean') return fail('lock.unlink must be true or false');
    const states = names(lock.states, 'lock.states', strict);
    if (!states.length) return fail('every lock needs at least one state');
    for (const state of states) {
      if (!selection!.has(state)) {
        if (strict) return fail(`state '${state}' is not in the selection of '${stateField}'`);
        problems.push(`${label}: state '${state}' is no longer in the selection`);
        continue;
      }
      if (locks.has(state)) return fail(`state '${state}' is locked twice`);
    }
    const frozenChildren = checkNames(names(lock.frozen_children, 'lock.frozen_children', strict), 'frozen child field')
      .filter((name) => {
        const f = fields.get(name)!;
        const co = f.comodel ? registry.models.get(f.comodel) : undefined;
        const inverse = f.inverseName && co ? co.fields.get(f.inverseName) : undefined;
        const valid = f.type === 'one2many' && !!co && inverse?.type === 'many2one' && inverse.comodel === row.model;
        if (!valid) {
          if (strict) throw new ValidationError(`${label}: frozen child '${name}' must be a one2many with an inverse many2one`);
          problems.push(`${label}: frozen child '${name}' is no longer a one2many with an inverse many2one`);
          return false;
        }
        if (strict) assertPolicyTarget(registry, f.comodel!, `${label}: frozen child '${name}'`);
        return true;
      });
    const unlink = lock.unlink === true;
    if (unlink && frozenChildren.length) return fail('a lock cannot allow unlink and freeze children (deleting the parent would delete the frozen rows)');
    const writable = new Set(checkNames(names(lock.writable, 'lock.writable', strict), 'writable field'));
    for (const state of states) {
      if (selection!.has(state)) locks.set(state, { writable, unlink, frozenChildren: new Set(frozenChildren) });
    }
  }
  return { model: row.model, stateField, initialState: stateField ? row.initial_state : null, locks, transitionOnly, engineFields };
}

/**
 * Compiles all rows into a model-keyed index (child model -> parent links, referrers included).
 * An active row that cannot be compiled completely marks its model `broken` (fail closed) and warns.
 */
export function buildIndex(
  registry: Registry,
  rows: readonly LifecycleRow[],
  warn: (message: string) => void = (m) => console.warn(`[nexa] ${m}`),
  dateLockRows: readonly DateLockRow[] = [],
): PolicyIndex {
  const index = new PolicyIndex();
  for (const row of rows) {
    const problems: string[] = [];
    const policy = compileLifecycle(registry, row, false, problems);
    if (problems.length) {
      const message = `Lifecycle policy for '${row.model}' is unusable (${problems.join('; ')}); fix or remove the ir.lifecycle record`;
      warn(message);
      index.entry(row.model).broken = message;
    }
    if (!policy) continue;
    index.entry(policy.model).policy = policy;
  }
  for (const row of dateLockRows) {
    try {
      index.entry(row.model).dateLocks.push(compileDateLock(registry, row));
    } catch (error) {
      const message = `Date lock policy for '${row.model}' is unusable (${error instanceof Error ? error.message : String(error)}); fix or remove the ir.date.lock record`;
      warn(message);
      index.entry(row.model).broken ??= message;
    }
  }
  const refer = (master: string, r: Referrer): void => {
    const list = index.referrers.get(master);
    if (list) list.push(r); else index.referrers.set(master, [r]);
  };
  const referrersOf = (model: string, skip: string | undefined, make: (field: string, cascade: boolean) => Referrer, masterOf: (f: FieldDef) => string): void => {
    for (const f of registry.get(model).fields.values()) {
      if (f.type !== 'many2one' || f.delegated || !f.comodel || f.name === skip || f.store === false) continue;
      const od = f.ondelete ?? 'set null';
      if (od === 'restrict') continue;
      refer(masterOf(f), make(f.name, od === 'cascade'));
    }
  };
  for (const entry of [...index.models.values()]) {
    const policy = entry.policy;
    if (!policy) continue;
    const fields = registry.get(policy.model).fields;
    const seen = new Set<string>();
    for (const lock of policy.locks.values()) {
      for (const name of lock.frozenChildren) {
        if (seen.has(name)) continue;
        seen.add(name);
        const f = fields.get(name)!;
        index.entry(f.comodel!).parents.push({ parentModel: policy.model, field: name, inverse: f.inverseName!, policy });
      }
    }
    if (policy.locks.size) {
      referrersOf(policy.model, undefined, (field, cascade) => ({ model: policy.model, field, cascade, policy }), (f) => f.comodel!);
    }
  }
  for (const [model, entry] of index.models) {
    for (const link of entry.parents) {
      referrersOf(model, link.inverse, (field, cascade) => ({ model, field, cascade, policy: link.policy, via: link }), (f) => f.comodel!);
    }
  }
  return index;
}

// ---------- per-tenant cache ----------

interface Entry {
  index?: PolicyIndex;
  fingerprint?: string;
  tableOk: boolean;
  dateLockTableOk: boolean;
  /** transactions that changed ir.lifecycle / ir.date.lock and have not ended yet */
  pending: number;
  epoch: number;
  /** outermost transactions that already compared the fingerprint */
  checked: WeakSet<object>;
}
/** Keyed by the registry's model map: a registry reload swaps the map, which drops the index. */
const cache = new WeakMap<object, Entry>();
const EMPTY = new PolicyIndex();
const marked = new WeakMap<object, Set<Entry>>();

function entryFor(env: EnvImpl): Entry {
  const key = env.registry.models;
  let e = cache.get(key);
  if (!e) cache.set(key, (e = { tableOk: false, dateLockTableOk: false, pending: 0, epoch: 0, checked: new WeakSet() }));
  return e;
}

function loadRows(env: EnvImpl): Promise<LifecycleRow[]> {
  return env.db.query<LifecycleRow>({
    text: `SELECT id, model, state_field, initial_state, locks, transition_only, engine_fields, active
      FROM ir_lifecycle WHERE active IS TRUE ORDER BY id`,
    params: [],
  });
}

function loadDateLockRows(env: EnvImpl): Promise<DateLockRow[]> {
  return env.db.query<DateLockRow>({
    text: `SELECT id, model, "date", "when", hard, soft, bypass_groups, ops, active
      FROM ir_date_lock WHERE active IS TRUE ORDER BY id`,
    params: [],
  });
}

async function tableExists(env: EnvImpl, e: Entry): Promise<boolean> {
  if (e.tableOk) return true;
  const [row] = await env.db.query<{ ok: boolean }>({ text: `SELECT to_regclass('ir_lifecycle') IS NOT NULL AS ok`, params: [] });
  if (row?.ok) e.tableOk = true;
  return !!row?.ok;
}

async function dateLockTableExists(env: EnvImpl, e: Entry): Promise<boolean> {
  if (e.dateLockTableOk) return true;
  const [row] = await env.db.query<{ ok: boolean }>({ text: `SELECT to_regclass('ir_date_lock') IS NOT NULL AS ok`, params: [] });
  if (row?.ok) e.dateLockTableOk = true;
  return !!row?.ok;
}

export async function policyIndex(env: EnvImpl): Promise<PolicyIndex> {
  if (!env.registry.models.has('ir.lifecycle')) return EMPTY;
  const e = entryFor(env);
  if (e.pending > 0) {
    if (!(await tableExists(env, e))) return EMPTY;
    const dl = (await dateLockTableExists(env, e)) ? await loadDateLockRows(env) : [];
    return buildIndex(env.registry, await loadRows(env), undefined, dl);
  }
  const root = currentTransactionRoot();
  if (e.index && root && e.checked.has(root)) return e.index;
  if (!(await tableExists(env, e))) return EMPTY;
  const hasDateLocks = await dateLockTableExists(env, e);
  const [fp] = await env.db.query<{ fp: string }>({
    text: `SELECT count(*)::text || ':' || coalesce(max(id), 0)::text || ':' || coalesce(max(write_date)::text, '') || ':' || coalesce(sum(xmin::text::bigint), 0)::text AS fp FROM ir_lifecycle`,
    params: [],
  });
  const [dlFp] = hasDateLocks
    ? await env.db.query<{ fp: string }>({
      text: `SELECT count(*)::text || ':' || coalesce(max(id), 0)::text || ':' || coalesce(max(write_date)::text, '') || ':' || coalesce(sum(xmin::text::bigint), 0)::text AS fp FROM ir_date_lock`,
      params: [],
    })
    : [{ fp: '' }];
  const fingerprint = `${fp?.fp ?? ''}|${dlFp?.fp ?? ''}`;
  if (e.index && e.fingerprint === fingerprint) {
    if (root) e.checked.add(root);
    return e.index;
  }
  const epoch = e.epoch;
  const dl = hasDateLocks ? await loadDateLockRows(env) : [];
  const index = buildIndex(env.registry, await loadRows(env), undefined, dl);
  if (e.pending === 0 && e.epoch === epoch) {
    e.index = index;
    e.fingerprint = fingerprint;
    if (root) e.checked.add(root);
  }
  return index;
}

/**
 * An `ir.lifecycle` row was written or is about to be deleted by the current transaction. The cache
 * is bypassed until that transaction (the outermost ORM one) ends, and dropped when it does.
 */
export function markPolicyDirty(env: EnvImpl): void {
  const e = entryFor(env);
  const root = currentTransactionRoot();
  if (root && marked.get(root)?.has(e)) return;
  const done = (): void => {
    e.pending = Math.max(0, e.pending - 1);
    e.index = undefined;
    e.fingerprint = undefined;
    e.epoch += 1;
  };
  e.pending += 1;
  e.index = undefined;
  e.epoch += 1;
  if (!afterOutermostTransaction(done)) { done(); return; }
  let set = marked.get(root!);
  if (!set) marked.set(root!, (set = new Set()));
  set.add(e);
}

import { ConcurrencyError, ValidationError, type FieldDef, type ResolvedModel } from '../contracts/index.js';
import { defaultsProvider, type EnvImpl, type RecordGuards } from '../orm/env.js';
import { isColumn } from '../orm/registry.js';
import { assertSystem } from '../services/common.js';
import { markPolicyDirty, policyIndex, type ModelEntry, type ParentLink, type Referrer } from './lifecycle.js';
import { enforceDateLocks, enforceRatchets, ratchetFields, readLockRows } from './datelock.js';
import { takeWriteToken, type TokenGrant } from './token.js';

/*
 * Known limits (ADR 0004 P1, by design; see the ADR notes):
 * - A create token names the model and fields but not a record, so it is only as narrow as the
 *   one-shot rule: the first create of that model inside the token scope consumes it.
 * - Writes the ORM splits per id (monetary / delegated fields on several records) never match a
 *   multi-id token; they fail closed.
 * - Frozen children are one level: each model is frozen only by its own parent's lifecycle, not
 *   transitively through grandparents.
 * - Many2many rows are written from either side; a lock on the model owning the reverse side does not
 *   see writes made through the other side's field (only fields of the guarded model itself are checked).
 * - Module data loading and uninstall go through the ORM, so they are refused on locked records too
 *   (the policy applies to the superuser): an upgrade that rewrites a posted record fails closed.
 * - Database cascades are checked one level (see checkReferrers).
 */

/** A guarded operation was refused by an `ir.lifecycle` policy. */
export class LifecycleError extends ValidationError {}

type Vals = Record<string, unknown>;
type Field = FieldDef & { name: string; model: string };

const MAGIC = new Set(['id', 'create_date', 'write_date', 'create_uid', 'write_uid', 'parent_path']);
const MAX_ATTEMPTS = 3;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === false || v === '' || (Array.isArray(v) && v.length === 0);
}
function isX2many(f: Field): boolean { return f.type === 'one2many' || f.type === 'many2many'; }
/** A plain stored column the user can write (not delegated, not magic, not x2many). */
function scalarColumn(f: Field | undefined): f is Field {
  return !!f && !f.delegated && !MAGIC.has(f.name) && isColumn(f) && !isX2many(f);
}

/** Collects what a refused operation would need a token to cover. */
class Refusal {
  private readonly reasons = new Map<string, string>();
  private general: string | undefined;
  need(message: string, ...fields: string[]): void {
    this.general ??= message;
    for (const f of fields) if (!this.reasons.has(f)) this.reasons.set(f, message);
  }
  /** Throws unless the token covers every refused field (the message names the first uncovered one). */
  assert(grant: TokenGrant | undefined): void {
    if (this.general === undefined) return;
    if (grant) {
      const uncovered = [...this.reasons].find(([field]) => !grant.fields.has(field));
      if (!uncovered) return;
      throw new LifecycleError(uncovered[1]);
    }
    throw new LifecycleError(this.general);
  }
}

function mapLockError(err: unknown): unknown {
  const code = (err as { code?: string }).code;
  if (code === '55P03') return new ConcurrencyError('The record is locked by another operation; try again');
  if (code === '40P01') return new ConcurrencyError('Concurrent update conflict (deadlock); try again');
  return err;
}
async function lockErrors<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (err) { throw mapLockError(err); }
}

/**
 * Locks the parents' rows FOR NO KEY UPDATE (parents before children, ids ascending): a concurrent
 * transition of a parent takes FOR UPDATE, so it either waits for this operation or is seen by it.
 * NO KEY UPDATE (not SHARE) because two line edits of one document would otherwise both hold SHARE and
 * then deadlock when the stored-compute recompute updates the parent row; it serializes line edits per
 * document instead, still allows FK checks (FOR KEY SHARE) of other inserts, and the recompute's own
 * UPDATE needs the same lock level, so no upgrade happens. A NULL state counts as the initial state.
 */
async function lockParents(env: EnvImpl, want: Map<ParentLink, Set<number>>): Promise<Map<ParentLink, Map<number, string | null>>> {
  const out = new Map<ParentLink, Map<number, string | null>>();
  const links = [...want.keys()].sort((a, b) => (a.parentModel + a.field < b.parentModel + b.field ? -1 : 1));
  for (const link of links) {
    const ids = [...want.get(link)!].sort((a, b) => a - b);
    const states = new Map<number, string | null>();
    out.set(link, states);
    if (!ids.length) continue;
    const meta = env.registry.get(link.parentModel);
    const rows = await lockErrors(() => env.db.query<{ id: number; s: string | null }>({
      text: `SELECT t.id, COALESCE(t."${link.policy.stateField}", $2) AS s FROM "${meta.table}" t WHERE t.id = ANY($1) ORDER BY t.id FOR NO KEY UPDATE`,
      params: [ids, link.policy.initialState],
    }));
    for (const r of rows) states.set(Number(r.id), r.s);
  }
  return out;
}

function frozenBy(link: ParentLink, states: Map<ParentLink, Map<number, string | null>>, parentId: number | null | undefined): string | null {
  if (parentId === null || parentId === undefined) return null;
  const state = states.get(link)?.get(parentId);
  if (state === null || state === undefined) return null;
  return link.policy.locks.get(state)?.frozenChildren.has(link.field) ? state : null;
}

interface DiffSpec { name: string; value: unknown; always: boolean; json: boolean }
interface RowInfo { id: number; state: string | null; parents: ParentLink[]; parentIds: Map<ParentLink, number | null>; changed: Set<string> }

function diffSpecs(meta: ResolvedModel, vals: Vals, only?: ReadonlySet<string>): DiffSpec[] {
  const out: DiffSpec[] = [];
  for (const [name, value] of Object.entries(vals)) {
    const f = meta.fields.get(name) as Field | undefined;
    if (!scalarColumn(f) || (only && !only.has(name))) continue;
    const blank = value === null || value === undefined || (value === false && f.type !== 'boolean');
    out.push({
      name, always: !!f.translate, json: f.type === 'json',
      value: blank ? null : f.type === 'boolean' ? Boolean(value) : f.type === 'json' ? JSON.stringify(value) : value,
    });
  }
  return out;
}

/**
 * Reads the pre-state of `ids` under row locks (`FOR UPDATE ... ORDER BY id`), after the parents'
 * parent locks. The diff against `vals` runs in SQL (IS DISTINCT FROM), so unchanged values of a
 * full-record save are ignored. A diff that fails on bad input (cast errors) counts as changed; the
 * ORM validates the value properly afterwards.
 */
async function readLocked(
  env: EnvImpl, model: string, entry: ModelEntry, ids: readonly number[], diff: DiffSpec[], newParents: Map<ParentLink, number>,
): Promise<{ rows: RowInfo[]; parentStates: Map<ParentLink, Map<number, string | null>> }> {
  const meta = env.registry.get(model);
  const table = meta.table!;
  const policy = entry.policy;
  const stateCol = policy?.stateField && policy.locks.size ? policy.stateField : null;
  const links = entry.parents;
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const select = (withDiff: boolean): { text: string; params: unknown[] } => {
    const params: unknown[] = [sorted];
    const cols = ['t.id'];
    if (stateCol) { params.push(policy!.initialState); cols.push(`COALESCE(t."${stateCol}", $${params.length}) AS "__state"`); }
    links.forEach((l, i) => cols.push(`t."${l.inverse}" AS "__p${i}"`));
    if (withDiff) {
      diff.forEach((d, i) => {
        if (d.always) { cols.push(`true AS "__d${i}"`); return; }
        params.push(d.value);
        cols.push(`(t."${d.name}" IS DISTINCT FROM $${params.length}${d.json ? '::jsonb' : ''}) AS "__d${i}"`);
      });
    }
    return { text: `SELECT ${cols.join(', ')} FROM "${table}" t WHERE t.id = ANY($1) ORDER BY t.id FOR UPDATE`, params };
  };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let parentStates = new Map<ParentLink, Map<number, string | null>>();
    const want = new Map<ParentLink, Set<number>>(links.map((l) => [l, new Set<number>()]));
    if (links.length) {
      if (sorted.length) {
        const pre = await env.db.query<Record<string, unknown>>({
          text: `SELECT t.id, ${links.map((l, i) => `t."${l.inverse}" AS "__p${i}"`).join(', ')} FROM "${table}" t WHERE t.id = ANY($1) ORDER BY t.id`,
          params: [sorted],
        });
        for (const r of pre) links.forEach((l, i) => { const p = r[`__p${i}`]; if (p !== null && p !== undefined) want.get(l)!.add(Number(p)); });
      }
      for (const [l, p] of newParents) want.get(l)?.add(p);
      parentStates = await lockParents(env, want);
    }
    let raw: Record<string, unknown>[] = [];
    let diffOk = true;
    if (sorted.length) {
      try {
        const q = select(true);
        // savepoint: a cast error in the diff must not abort the surrounding transaction
        raw = diff.length
          ? await env.db.transaction((tx) => tx.query<Record<string, unknown>>({ text: q.text, params: q.params }))
          : await env.db.query<Record<string, unknown>>({ text: q.text, params: q.params });
      } catch (err) {
        const code = String((err as { code?: string }).code ?? '');
        if (!(code.startsWith('22') || code.startsWith('42'))) throw mapLockError(err);
        diffOk = false;
        const q = select(false);
        raw = await lockErrors(() => env.db.query<Record<string, unknown>>({ text: q.text, params: q.params }));
      }
    }
    const stable = raw.every((r) => links.every((l, i) => {
      const p = r[`__p${i}`];
      return p === null || p === undefined || want.get(l)!.has(Number(p));
    }));
    if (!stable) continue; // a child moved to another parent between the first read and the lock: retry
    const rows = raw.map((r): RowInfo => ({
      id: Number(r.id),
      state: stateCol ? (r.__state as string | null) : null,
      parents: links,
      parentIds: new Map(links.map((l, i) => [l, r[`__p${i}`] === null || r[`__p${i}`] === undefined ? null : Number(r[`__p${i}`])])),
      changed: new Set(diff.filter((d, i) => !diffOk || r[`__d${i}`] === true).map((d) => d.name)),
    }));
    return { rows, parentStates };
  }
  throw new ConcurrencyError('The record changed while it was being locked; try again');
}

/** True when a full-record save sends the same id list the record already has. */
async function x2manyUnchanged(env: EnvImpl, meta: ResolvedModel, name: string, ids: readonly number[], value: unknown): Promise<boolean> {
  if (!Array.isArray(value) || !value.every((x) => Number.isInteger(x))) return false;
  const f = meta.fields.get(name)!;
  const want = [...new Set(value as number[])].sort((a, b) => a - b).join(',');
  let rows: { owner: number; id: number }[];
  if (f.type === 'one2many') {
    const co = env.registry.get(f.comodel!);
    rows = await env.db.query({ text: `SELECT t."${f.inverseName}" AS owner, t.id FROM "${co.table}" t WHERE t."${f.inverseName}" = ANY($1)`, params: [[...ids]] });
  } else {
    rows = await env.db.query({ text: `SELECT r."${f.column1}" AS owner, r."${f.column2}" AS id FROM "${f.relationTable}" r WHERE r."${f.column1}" = ANY($1)`, params: [[...ids]] });
  }
  const byOwner = new Map<number, number[]>(ids.map((id) => [id, []]));
  for (const r of rows) byOwner.get(Number(r.owner))?.push(Number(r.id));
  return [...byOwner.values()].every((list) => list.sort((a, b) => a - b).join(',') === want);
}

const lockedMessage = (model: string, id: number, state: string, field: string) =>
  `${model}(${id}) is locked in state '${state}': field '${field}' cannot be changed`;

export const policyGuards: RecordGuards = {
  async beforeCreate(env, model, vals, effective) {
    const entry = (await policyIndex(env)).get(model);
    if (!entry) return;
    if (entry.broken) throw new LifecycleError(entry.broken);
    const meta = env.registry.get(model);
    // values injected by the caller's context (default_<field>) or by stored ir.default rows are the
    // caller's choice, not the field's own default: they count as explicitly supplied
    const stored = entry.policy && (entry.policy.transitionOnly.size || entry.policy.engineFields.size)
      ? await defaultsProvider()?.(env, model) : undefined;
    for (let i = 0; i < vals.length; i++) {
      const raw = vals[i]!;
      const eff = effective?.[i] ?? raw;
      const grant = takeWriteToken(env, 'create', model, []);
      const refusal = new Refusal();
      const policy = entry.policy;
      if (policy) {
        if (policy.stateField && eff[policy.stateField] !== policy.initialState) {
          refusal.need(`${model}: a new record must start in state '${policy.initialState}'`, policy.stateField);
        }
        for (const name of Object.keys(raw)) {
          if (name === policy.stateField || !meta.fields.has(name) || isBlank(raw[name])) continue;
          if (policy.transitionOnly.has(name)) refusal.need(`${model}: field '${name}' can only be set by a transition`, name);
          else if (policy.engineFields.has(name)) refusal.need(`${model}: field '${name}' is maintained by the engine`, name);
        }
        for (const name of [...policy.transitionOnly, ...policy.engineFields]) {
          if (name === policy.stateField || Object.hasOwn(raw, name) || isBlank(eff[name])) continue;
          if (Object.hasOwn(env.context, 'default_' + name) || stored?.has(name)) {
            refusal.need(`${model}: field '${name}' cannot be set through a context or stored default`, name);
          }
        }
      }
      if (entry.parents.length) {
        const want = new Map<ParentLink, Set<number>>();
        const newParents = new Map<ParentLink, number>();
        for (const link of entry.parents) {
          const p = eff[link.inverse];
          if (Number.isInteger(p) && (p as number) > 0) { want.set(link, new Set([p as number])); newParents.set(link, p as number); }
        }
        if (want.size) {
          const states = await lockParents(env, want);
          for (const [link, p] of newParents) {
            const state = frozenBy(link, states, p);
            if (state !== null) {
              refusal.need(`${model}: cannot add rows to ${link.parentModel}(${p}) in state '${state}' (its '${link.field}' are frozen)`,
                link.inverse, ...Object.keys(raw).filter((n) => !isBlank(raw[n])));
            }
          }
        }
      }
      refusal.assert(grant);
    }
    if (entry.dateLocks.length) {
      await enforceDateLocks(env, entry.dateLocks, 'create', vals.map((raw, i) => ({ values: effective?.[i] ?? raw })));
    }
  },

  async beforeWrite(env, model, ids, vals) {
    const entry = (await policyIndex(env)).get(model);
    if (entry?.broken) throw new LifecycleError(entry.broken);
    const ratchets = ratchetFields(env.registry, model);
    if (!entry) {
      if (ratchets.length) await enforceRatchets(env, model, ratchets, ids, vals);
      return;
    }
    const meta = env.registry.get(model);
    const policy = entry.policy;
    const grant = takeWriteToken(env, 'write', model, ids);
    const guarded = new Set<string>([...(policy?.transitionOnly ?? []), ...(policy?.engineFields ?? [])]);
    const lockedModel = !!policy && policy.locks.size > 0;
    const keys = Object.keys(vals).filter((k) => {
      const f = meta.fields.get(k) as Field | undefined;
      return !!f && !f.delegated && !MAGIC.has(k);
    });
    const touchesRatchet = keys.some((k) => ratchets.includes(k));
    if (lockedModel || entry.parents.length || keys.some((k) => guarded.has(k)) || touchesRatchet) {
      // Ratchet checks must observe the row after acquiring its lock. readLocked follows the global
      // parent-before-child order, and the lock remains held through the ORM write.
      const full = lockedModel || entry.parents.length > 0 || touchesRatchet;
      const diff = diffSpecs(meta, vals, full ? undefined : guarded);
      const x2m = keys.filter((k) => isX2many(meta.fields.get(k) as Field) && (full || guarded.has(k)));
      const newParents = new Map<ParentLink, number>();
      for (const link of entry.parents) {
        const p = vals[link.inverse];
        if (Number.isInteger(p) && (p as number) > 0) newParents.set(link, p as number);
      }
      const { rows, parentStates } = await readLocked(env, model, entry, ids, diff, newParents);
      if (ratchets.length) await enforceRatchets(env, model, ratchets, ids, vals);

      const changedX2m = new Set<string>();
      for (const k of x2m) if (!(await x2manyUnchanged(env, meta, k, rows.map((r) => r.id), vals[k]))) changedX2m.add(k);

      const refusal = new Refusal();
      for (const row of rows) {
        const lock = policy && row.state !== null ? policy.locks.get(row.state) : undefined;
        const changed = [...row.changed, ...changedX2m];
        for (const name of changed) {
          if (policy?.stateField === name) {
            refusal.need(`${model}(${row.id}): field '${name}' can only be changed by a transition`, name);
          } else if (policy?.transitionOnly.has(name)) {
            refusal.need(`${model}(${row.id}): field '${name}' can only be changed by a transition`, name);
          } else if (policy?.engineFields.has(name)) {
            refusal.need(`${model}(${row.id}): field '${name}' is maintained by the engine`, name);
          } else if (lock && !lock.writable.has(name) && !lock.frozenChildren.has(name)) {
            refusal.need(lockedMessage(model, row.id, row.state!, name), name);
          }
        }
        if (entry.parents.length && changed.length) {
          for (const link of entry.parents) {
            const targets = new Set<number>();
            const current = row.parentIds.get(link);
            if (current !== null && current !== undefined) targets.add(current);
            const moved = newParents.get(link);
            if (moved !== undefined && row.changed.has(link.inverse)) targets.add(moved);
            for (const p of targets) {
              const state = frozenBy(link, parentStates, p);
              if (state !== null) {
                refusal.need(`${model}(${row.id}): '${link.field}' of ${link.parentModel}(${p}) are frozen in state '${state}'`, ...changed);
              }
            }
          }
        }
      }
      refusal.assert(grant);
    }
    if (entry.dateLocks.length) {
      const oldRows = await readLockRows(env, model, ids, entry.dateLocks);
      const newRows = oldRows.map((r) => ({ id: r.id, values: { ...r.values, ...vals } }));
      await enforceDateLocks(env, entry.dateLocks, 'write', [...oldRows, ...newRows]);
    }
  },

  async beforeUnlink(env, model, ids) {
    if (model === 'ir.lifecycle' || model === 'ir.date.lock') {
      await assertSystem(env);
      markPolicyDirty(env);
      return;
    }
    const index = await policyIndex(env);
    const referrers = index.referrers.get(model);
    if (referrers) await checkReferrers(env, model, referrers, ids);
    const entry = index.get(model);
    if (!entry) return;
    if (entry.broken) throw new LifecycleError(entry.broken);
    const policy = entry.policy;
    const grant = takeWriteToken(env, 'unlink', model, ids);
    if ((policy && policy.locks.size > 0) || entry.parents.length) {
      const { rows, parentStates } = await readLocked(env, model, entry, ids, [], new Map());
      const refusal = new Refusal();
      for (const row of rows) {
        const lock = policy && row.state !== null ? policy.locks.get(row.state) : undefined;
        if (lock && !lock.unlink) refusal.need(`${model}(${row.id}) cannot be deleted in state '${row.state}'`);
        for (const link of entry.parents) {
          const p = row.parentIds.get(link);
          const state = frozenBy(link, parentStates, p);
          if (state !== null) refusal.need(`${model}(${row.id}): '${link.field}' of ${link.parentModel}(${p}) are frozen in state '${state}'`);
        }
      }
      refusal.assert(grant);
    }
    if (entry.dateLocks.length) {
      const oldRows = await readLockRows(env, model, ids, entry.dateLocks);
      await enforceDateLocks(env, entry.dateLocks, 'unlink', oldRows);
    }
  },

  async copyExcluded(env, model) {
    const policy = (await policyIndex(env)).get(model)?.policy;
    if (!policy) return undefined;
    return new Set([...(policy.stateField ? [policy.stateField] : []), ...policy.transitionOnly, ...policy.engineFields]);
  },
};

/**
 * Deleting a master record cascades / nulls many2one columns at the database level, bypassing the ORM
 * guards. Refuse when that would delete or change a row that is locked (or a frozen child of a locked
 * parent). Direct references only: a chain of cascades through unlocked intermediate rows is not followed.
 */
async function checkReferrers(env: EnvImpl, master: string, referrers: readonly Referrer[], ids: readonly number[]): Promise<void> {
  for (const r of referrers) {
    const table = env.registry.get(r.model).table!;
    const sf = r.policy.stateField!;
    let rows: { id: number }[];
    if (r.via) {
      const states = [...r.policy.locks].filter(([, l]) => l.frozenChildren.has(r.via!.field)).map(([s]) => s);
      if (!states.length) continue;
      const parent = env.registry.get(r.via.parentModel).table!;
      rows = await env.db.query({
        text: `SELECT t.id FROM "${table}" t JOIN "${parent}" p ON p.id = t."${r.via.inverse}"
          WHERE t."${r.field}" = ANY($1) AND COALESCE(p."${sf}", $2) = ANY($3) LIMIT 1`,
        params: [[...ids], r.policy.initialState, states],
      });
    } else {
      const states = [...r.policy.locks].filter(([, l]) => (r.cascade ? !l.unlink : !l.writable.has(r.field))).map(([s]) => s);
      if (!states.length) continue;
      rows = await env.db.query({
        text: `SELECT t.id FROM "${table}" t WHERE t."${r.field}" = ANY($1) AND COALESCE(t."${sf}", $2) = ANY($3) LIMIT 1`,
        params: [[...ids], r.policy.initialState, states],
      });
    }
    if (rows.length) {
      throw new LifecycleError(`${master} cannot be deleted: a locked ${r.model} record references it through '${r.field}' (${r.cascade ? 'delete' : 'clear'} cascade)`);
    }
  }
}

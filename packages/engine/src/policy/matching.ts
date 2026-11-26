import { AccessError, ConcurrencyError, ValidationError, type AccessRule, type Env, type ModelDef, type Recordset } from '../contracts/index.js';
import { parseExpression, type ExprValue } from '../expr/index.js';
import type { EnvImpl } from '../orm/env.js';
import { roundMonetary } from '../orm/decimal.js';
import { assertSystem } from '../services/common.js';
import { checkRecordRules } from '../security/access.js';
import { evaluateFor, readRecord } from '../services/record-scope.js';
import { assertPolicyTarget, policyIndex } from './lifecycle.js';
import { withWriteToken } from './token.js';

/** Generic, signed-amount reconciliation. Configuration names ordinary custom/module models. */
export const matchModels: ModelDef[] = [{
  name: 'ir.match.rule', origin: 'module', module: 'base', order: 'model asc, key asc', recName: 'key',
  fields: {
    model: { type: 'char', required: true }, key: { type: 'char', required: true },
    eligible: { type: 'text', required: true, help: 'Read-only NX-Expr predicate on each source record' },
    group_by: { type: 'json', help: 'Stored scalar field names whose values must agree' },
    amount_field: { type: 'char', required: true }, residual_field: { type: 'char', required: true },
    secondary_amount_field: { type: 'char' }, secondary_residual_field: { type: 'char' },
    rounding: { type: 'float', required: true, default: 0.01 }, secondary_rounding: { type: 'float', default: 0.01 },
    link: { type: 'json', required: true, help: '{model, positive_field, negative_field, amount_field, positive_secondary_field?, negative_secondary_field?}' },
    link_model: { type: 'char', unique: true, readonly: true, store: true, depends: ['link'], compute: async (records) => {
      const values = new Map<number, unknown>();
      for (const r of await records.read(['link'])) { const link = json(r.link); values.set(Number(r.id), obj(link) ? link.model : null); }
      return values;
    } },
    full: { type: 'json', help: '{model, field}: optional full-match model and many2one field on source rows' },
    lock_parents: { type: 'json', help: 'Many2one fields on source rows, locked before source rows' },
    active: { type: 'boolean', default: true },
  },
  constraints: [{ name: 'ir_match_rule_unique', sql: 'UNIQUE(model, key)' }, { name: 'ir_match_rule_valid', check: checkMatchRuleRecords }],
}];
export const matchAccess: AccessRule[] = [{ model: 'ir.match.rule', group: 'base.group_system', perms: { read: true, write: true, create: true, unlink: true } }];

interface Link { model: string; positive_field: string; negative_field: string; amount_field: string; positive_secondary_field?: string; negative_secondary_field?: string }
interface Full { model: string; field: string }
interface Rule { model: string; key: string; eligible: string; group_by: string[]; amount_field: string; residual_field: string; secondary_amount_field?: string; secondary_residual_field?: string; rounding: number; secondary_rounding: number; link: Link; full?: Full; lock_parents: string[] }
type Values = Record<string, unknown>;
const MAX_ROWS = 1000;
const obj = (v: unknown): v is Values => !!v && typeof v === 'object' && !Array.isArray(v);
function json(v: unknown): unknown { if (typeof v !== 'string') return v; try { return JSON.parse(v) as unknown; } catch { throw new ValidationError('Invalid matching JSON'); } }
function names(v: unknown): string[] {
  const a = json(v ?? []);
  if (!Array.isArray(a) || a.length > 100 || a.some((x) => typeof x !== 'string' || !x)) throw new ValidationError('Matching fields must be a list of names');
  return [...new Set(a as string[])];
}
function field(env: EnvImpl, model: string, name: unknown, types?: string[]) {
  const f = typeof name === 'string' ? env.registry.get(model).fields.get(name) : undefined;
  if (!f || f.store === false || f.delegated || f.compute || f.computeExpr || f.related || ['id', 'create_date', 'write_date', 'create_uid', 'write_uid'].includes(String(name)) || ['one2many', 'many2many'].includes(f.type) || (types && !types.includes(f.type))) throw new ValidationError(`Matching: invalid stored field '${String(name)}' on '${model}'`);
  return f;
}
async function compile(env: EnvImpl, row: Values): Promise<Rule> {
  const model = String(row.model); assertPolicyTarget(env.registry, model, 'Matching');
  if (typeof row.key !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(row.key)) throw new ValidationError('Invalid matching key');
  if (typeof row.eligible !== 'string' || !row.eligible.trim()) throw new ValidationError('Matching needs an eligible expression');
  try { parseExpression(row.eligible); } catch { throw new ValidationError('Invalid matching eligible expression'); }
  const group_by = names(row.group_by); group_by.forEach((n) => field(env, model, n));
  const lock_parents = names(row.lock_parents);
  lock_parents.forEach((n) => { const f = field(env, model, n, ['many2one']); if (f.comodel === model) throw new ValidationError('Matching cannot lock itself as a parent'); });
  const numeric = ['float', 'monetary', 'integer'];
  for (const k of ['amount_field', 'residual_field']) field(env, model, row[k], numeric);
  const secondary = !!row.secondary_amount_field || !!row.secondary_residual_field;
  if (secondary) for (const k of ['secondary_amount_field', 'secondary_residual_field']) field(env, model, row[k], numeric);
  const rounding = Number(row.rounding); const secondary_rounding = Number(row.secondary_rounding ?? 0.01);
  if (![rounding, secondary_rounding].every((n) => Number.isFinite(n) && n > 0)) throw new ValidationError('Matching rounding must be positive');
  const link = json(row.link);
  if (!obj(link) || typeof link.model !== 'string') throw new ValidationError('Matching needs a link mapping');
  assertPolicyTarget(env.registry, link.model, 'Matching link');
  if (link.model === model) throw new ValidationError('Matching link must use a separate model');
  for (const k of ['positive_field', 'negative_field']) { const f = field(env, link.model, link[k], ['many2one']); if (f.comodel !== model || f.ondelete !== 'restrict') throw new ValidationError('Matching endpoints must reference the source model with ondelete restrict'); }
  field(env, link.model, link.amount_field, numeric);
  const mapped = [link.positive_field, link.negative_field, link.amount_field];
  if (secondary) { for (const k of ['positive_secondary_field', 'negative_secondary_field']) { field(env, link.model, link[k], numeric); mapped.push(link[k]); } }
  if (new Set(mapped).size !== mapped.length) throw new ValidationError('Matching link fields must be distinct');
  const index = await policyIndex(env);
  const p = index.get(model)?.policy;
  if (!p?.stateField) throw new ValidationError('Matching source needs a lifecycle with frozen amount and grouping fields');
  const residuals = [row.residual_field, ...(secondary ? [row.secondary_residual_field] : [])];
  if (new Set([row.amount_field, ...residuals, ...(secondary ? [row.secondary_amount_field] : [])]).size !== (secondary ? 4 : 2)) throw new ValidationError('Matching amount and residual fields must be distinct');
  if (residuals.some((n) => !p?.engineFields.has(String(n)))) throw new ValidationError('Matching residuals must be lifecycle engine_fields');
  // Link rows cannot be edited/deleted independently of their residuals, even by the superuser.
  const sealed = (m: string): void => {
    const policy = index.get(m)?.policy;
    const state = policy?.initialState;
    const lock = state ? policy?.locks.get(state) : undefined;
    if (!policy?.stateField || !lock || [...policy.locks.values()].some((l) => l.unlink || l.writable.size) || policy.locks.size !== env.registry.get(m).fields.get(policy.stateField)?.selection?.length) throw new ValidationError(`Matching '${m}' needs a lifecycle locking every state against write and unlink`);
  };
  sealed(link.model);
  if (mapped.some((n) => !index.get(link.model as string)?.policy?.engineFields.has(String(n)))) throw new ValidationError('Matching link fields must be lifecycle engine_fields');
  const full = json(row.full);
  if (full !== null && full !== undefined) {
    if (!obj(full) || typeof full.model !== 'string' || typeof full.field !== 'string') throw new ValidationError('Invalid matching full mapping');
    assertPolicyTarget(env.registry, full.model, 'Matching full');
    if ([model, link.model].includes(full.model)) throw new ValidationError('Matching full must use a separate model');
    const f = field(env, model, full.field, ['many2one']);
    if (f.comodel !== full.model || f.ondelete !== 'restrict' || !p?.engineFields.has(full.field)) throw new ValidationError('Matching full field must be an engine many2one with ondelete restrict');
    sealed(full.model);
  }
  return { model, key: row.key, eligible: row.eligible, group_by, lock_parents, amount_field: String(row.amount_field), residual_field: String(row.residual_field), ...(secondary ? { secondary_amount_field: String(row.secondary_amount_field), secondary_residual_field: String(row.secondary_residual_field) } : {}), rounding, secondary_rounding, link: link as unknown as Link, ...(full ? { full: full as unknown as Full } : {}) };
}
export async function checkMatchRuleRecords(records: Recordset): Promise<void> {
  const env = records.env as EnvImpl; await assertSystem(env);
  await env.db.query({ text: `SELECT pg_advisory_xact_lock(hashtext('nx.match_rule_registration'))`, params: [] });
  for (const r of await records.read()) {
    const def = await compile(env, r);
    if (r.link_model !== def.link.model) throw new ValidationError('Matching link ownership does not agree with its definition');
    const managedFields = [def.residual_field, def.secondary_residual_field, def.full?.field].filter(Boolean);
    const conflicts = await env.db.query({
      text: `SELECT id FROM ir_match_rule WHERE id <> $1 AND model=$2 AND (residual_field = ANY($3) OR secondary_residual_field = ANY($3) OR "full"->>'field' = ANY($3)) LIMIT 1`,
      params: [Number(r.id), def.model, managedFields],
    });
    if (conflicts.length) throw new ValidationError('Matching residual fields or full-match fields are already owned by another rule');
  }
}

/**
 * Serialize metadata mutations against execution. The stored unique link_model is the ownership
 * boundary across all rules, including archived rules. Existing links prevent structural remapping
 * or deletion; after unmatching all rows, an administrator may safely revise or remove a rule.
 */
export async function matchingBeforeMutation(env: EnvImpl, ids: readonly number[], vals?: Values): Promise<void> {
  const rows = await env.db.query<Values>({ text: 'SELECT * FROM ir_match_rule WHERE id = ANY($1) ORDER BY id FOR UPDATE', params: [[...ids]] });
  const structural = ['model', 'group_by', 'amount_field', 'residual_field', 'secondary_amount_field', 'secondary_residual_field', 'rounding', 'secondary_rounding', 'link', 'full', 'lock_parents'];
  const canonical = (v: unknown): string => JSON.stringify(v, (_key, value: unknown) => obj(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  for (const row of rows) {
    if (vals && !structural.some((k) => Object.hasOwn(vals, k) && canonical(vals[k] === false ? null : vals[k]) !== canonical(row[k]))) continue;
    const link = json(row.link);
    if (!obj(link) || typeof link.model !== 'string' || !env.registry.models.has(link.model)) throw new ValidationError('Cannot safely inspect matching links');
    const found = await env.db.query({ text: `SELECT id FROM "${env.registry.get(link.model).table}" LIMIT 1`, params: [] });
    if (found.length) throw new ValidationError('Unmatch existing links before changing or deleting their matching rule');
  }
}

/** Decimal integer units prevent floating-point drift and make zero crossing impossible. */
function units(value: unknown, rounding: number): number {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) throw new ValidationError('Matching amounts must be finite numbers');
  const raw = n / rounding; const v = Math.round(raw);
  if (!Number.isSafeInteger(v) || Math.abs(raw - v) > 1e-7) throw new ValidationError('Matching amount is not a multiple of its rounding');
  return v;
}
function amount(value: number, rounding: number): number { return roundMonetary(value * rounding, rounding); }
interface Node { id: number; row: Values; original: number; remaining: number; secondaryOriginal?: number; secondaryRemaining?: number }
export interface MatchResult { links: number[]; full: number[] }

export class MatchService {
  constructor(private readonly env: Env) {}
  async run(model: string, ids: readonly number[], key: string): Promise<MatchResult> { return this.match(model, ids, key); }
  async match(model: string, rawIds: readonly number[], key: string): Promise<MatchResult> { return this.execute(model, rawIds, key, false); }
  /** Unmatching selected records removes all links in their connected component. */
  async unmatch(model: string, rawIds: readonly number[], key: string): Promise<MatchResult> { return this.execute(model, rawIds, key, true); }

  private async execute(model: string, rawIds: readonly number[], key: string, undo: boolean): Promise<MatchResult> {
    const env = this.env as EnvImpl;
    if (!rawIds.length || rawIds.length > MAX_ROWS || rawIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new ValidationError('Matching needs 1 to 1000 positive record ids');
    const selected = [...new Set(rawIds)].sort((a, b) => a - b);
    return env.transaction(async () => {
      const [row] = await env.db.query<Values>({ text: `SELECT * FROM ir_match_rule WHERE model=$1 AND key=$2 AND active=true FOR SHARE`, params: [model, key] });
      if (!row) throw new ValidationError(`Unknown matching rule '${model}.${key}'`);
      const def = await compile(env, row);
      const meta = env.registry.get(model); const lm = env.registry.get(def.link.model); const link = def.link;
      const component = async (): Promise<{ ids: number[]; links: Values[] }> => {
        const ids = new Set(selected); const found = new Map<number, Values>();
        for (;;) {
          const rows = await env.db.query<Values>({ text: `SELECT * FROM "${lm.table}" WHERE "${link.positive_field}" = ANY($1) OR "${link.negative_field}" = ANY($1) ORDER BY id`, params: [[...ids]] });
          const size = ids.size;
          for (const r of rows) { found.set(Number(r.id), r); ids.add(Number(r[link.positive_field])); ids.add(Number(r[link.negative_field])); }
          if (ids.size > MAX_ROWS) throw new ValidationError('Matching component exceeds 1000 rows');
          if (ids.size === size) return { ids: [...ids].sort((a, b) => a - b), links: [...found.values()] };
        }
      };
      const before = await component();
      // Include lifecycle parents even when the explicit list omitted them: ORM guards use them too.
      const policy = (await policyIndex(env)).get(model);
      const parentFields = [...new Set([...def.lock_parents, ...(policy?.parents.map((p) => p.inverse) ?? [])])];
      const pre = await env.db.query<Values>({ text: `SELECT * FROM "${meta.table}" WHERE id = ANY($1) ORDER BY id`, params: [before.ids] });
      const parents = new Map<string, Set<number>>();
      for (const name of parentFields) {
        const pm = meta.fields.get(name)!.comodel!;
        let set = parents.get(pm); if (!set) parents.set(pm, (set = new Set()));
        for (const r of pre) if (r[name] !== null) set.add(Number(r[name]));
      }
      for (const [pm, ids] of [...parents].sort(([a], [b]) => a.localeCompare(b))) await env.db.query({ text: `SELECT id FROM "${env.registry.get(pm).table}" WHERE id = ANY($1) ORDER BY id FOR UPDATE`, params: [[...ids].sort((a, b) => a - b)] });
      const locked = await env.db.query<Values>({ text: `SELECT * FROM "${meta.table}" WHERE id = ANY($1) ORDER BY id FOR UPDATE`, params: [before.ids] });
      if (locked.length !== before.ids.length) throw new AccessError('Matching record unavailable');
      for (const r of locked) for (const f of parentFields) if (r[f] !== null && !parents.get(meta.fields.get(f)!.comodel!)?.has(Number(r[f]))) throw new ConcurrencyError('Matching parent changed while locking; try again');
      const after = await component();
      if (after.ids.some((id) => !before.ids.includes(id))) throw new ConcurrencyError('Matching component changed while locking; try again');
      env.cache.invalidate();
      const records = env.model(model).browse(after.ids);
      await records.checkAccess('write');
      if ((await records.read(['id'])).length !== after.ids.length) throw new AccessError('Matching record unavailable');
      if (!env.su) await checkRecordRules(env as Parameters<typeof checkRecordRules>[0], model, after.ids, 'write');
      const nodes = new Map<number, Node>();
      for (const id of after.ids) {
        const r = await readRecord(env, model, id);
        const original = units(r[def.amount_field], def.rounding);
        const remaining = r[def.residual_field] === null ? original : units(r[def.residual_field], def.rounding);
        if (Math.sign(remaining) !== 0 && Math.sign(remaining) !== Math.sign(original) || Math.abs(remaining) > Math.abs(original)) throw new ValidationError('Invalid matching residual');
        const n: Node = { id, row: r, original, remaining };
        if (def.secondary_amount_field) {
          n.secondaryOriginal = units(r[def.secondary_amount_field], def.secondary_rounding);
          n.secondaryRemaining = r[def.secondary_residual_field!] === null ? n.secondaryOriginal : units(r[def.secondary_residual_field!], def.secondary_rounding);
          if (Math.abs(n.secondaryRemaining) > Math.abs(n.secondaryOriginal) || (n.secondaryRemaining !== 0 && Math.sign(n.secondaryRemaining) !== Math.sign(n.secondaryOriginal))) throw new ValidationError('Invalid secondary matching residual');
        }
        nodes.set(id, n);
      }
      const write = async (n: Node, extra: Values = {}): Promise<void> => {
        const vals: Values = { [def.residual_field]: amount(n.remaining, def.rounding), ...extra };
        if (def.secondary_residual_field) vals[def.secondary_residual_field] = amount(n.secondaryRemaining!, def.secondary_rounding);
        await withWriteToken(env, { op: 'write', model, ids: [n.id], fields: Object.keys(vals) }, () => env.model(model).browse(n.id).write(vals));
      };
      if (undo) {
        if (!after.links.length) return { links: [], full: [] };
        const fullIds = [...new Set([...nodes.values()].map((n) => def.full ? Number(n.row[def.full.field]) : 0).filter(Boolean))];
        for (const r of after.links) {
          const a = nodes.get(Number(r[link.positive_field]))!; const b = nodes.get(Number(r[link.negative_field]))!;
          const v = units(r[link.amount_field], def.rounding);
          if (v <= 0) throw new ValidationError('Invalid matching link amount');
          a.remaining += v; b.remaining -= v;
          if (def.secondary_residual_field) { a.secondaryRemaining! += units(r[link.positive_secondary_field!], def.secondary_rounding); b.secondaryRemaining! += units(r[link.negative_secondary_field!], def.secondary_rounding); }
        }
        for (const n of nodes.values()) {
          if (n.remaining !== n.original || n.secondaryRemaining !== n.secondaryOriginal) throw new ValidationError('Matching links do not agree with residuals');
          await write(n, def.full ? { [def.full.field]: null } : {});
        }
        const linkIds = after.links.map((r) => Number(r.id));
        await withWriteToken(env, { op: 'unlink', model: link.model, ids: linkIds }, () => env.model(link.model).browse(linkIds).unlink());
        if (def.full) for (const id of fullIds) await withWriteToken(env, { op: 'unlink', model: def.full.model, ids: [id] }, () => env.model(def.full!.model).browse(id).unlink());
        return { links: linkIds, full: fullIds };
      }
      const candidates = selected.map((id) => nodes.get(id)!);
      for (const n of candidates) {
        if ((await evaluateFor(env, def.eligible, n.row as Record<string, ExprValue>, { readOnly: true })) !== true) throw new ValidationError(`Record ${n.id} is not eligible for matching`);
        const sourcePolicy = policy!.policy!;
        const state = n.row[sourcePolicy.stateField!] ?? sourcePolicy.initialState;
        const lock = sourcePolicy.locks.get(String(state));
        const fixed = [def.amount_field, ...def.group_by, ...parentFields, ...(def.secondary_amount_field ? [def.secondary_amount_field] : [])];
        if (!lock || lock.unlink || fixed.some((f) => lock.writable.has(f))) throw new ValidationError(`Record ${n.id} must freeze its amounts, grouping and parents before matching`);
      }
      const result: MatchResult = { links: [], full: [] };
      const groups = new Map<string, Node[]>();
      for (const n of candidates) { const k = JSON.stringify(def.group_by.map((f) => n.row[f])); const group = groups.get(k) ?? []; group.push(n); groups.set(k, group); }
      for (const group of groups.values()) for (const a of group.filter((n) => n.remaining > 0)) for (const b of group.filter((n) => n.remaining < 0)) {
        const v = Math.min(a.remaining, -b.remaining); if (!v) continue;
        const vals: Values = { [link.positive_field]: a.id, [link.negative_field]: b.id, [link.amount_field]: amount(v, def.rounding) };
        if (def.secondary_residual_field) {
          // Each side consumes its own currency proportion; no exchange-difference rows are invented.
          for (const [n, f] of [[a, link.positive_secondary_field!], [b, link.negative_secondary_field!]] as const) {
            const numerator = BigInt(Math.abs(n.secondaryRemaining!)) * BigInt(v);
            const denominator = BigInt(Math.abs(n.remaining));
            const proportional = Number((2n * numerator + denominator) / (2n * denominator));
            const used = Math.abs(n.remaining) === v ? n.secondaryRemaining! : Math.sign(n.secondaryRemaining!) * Math.min(Math.abs(n.secondaryRemaining!), proportional);
            vals[f] = amount(used, def.secondary_rounding); n.secondaryRemaining! -= used;
          }
        }
        a.remaining -= v; b.remaining += v;
        const created = await withWriteToken(env, { op: 'create', model: link.model, fields: Object.keys(vals) }, () => env.model(link.model).create(vals));
        result.links.push(created.ids[0]!);
        await write(a); await write(b);
      }
      if (def.full && result.links.length) {
        // Rebuild components after inserts; unrelated input groups receive distinct full records.
        const allLinks = [...after.links, ...await env.db.query<Values>({ text: `SELECT * FROM "${lm.table}" WHERE id = ANY($1)`, params: [result.links] })];
        const unseen = new Set(nodes.keys());
        while (unseen.size) {
          const componentIds = new Set([unseen.values().next().value!]);
          for (;;) { const size = componentIds.size; for (const r of allLinks) if (componentIds.has(Number(r[link.positive_field])) || componentIds.has(Number(r[link.negative_field]))) { componentIds.add(Number(r[link.positive_field])); componentIds.add(Number(r[link.negative_field])); } if (size === componentIds.size) break; }
          componentIds.forEach((id) => unseen.delete(id));
          if (componentIds.size < 2 || ![...componentIds].every((id) => nodes.get(id)!.remaining === 0 && (nodes.get(id)!.secondaryRemaining ?? 0) === 0 && !nodes.get(id)!.row[def.full!.field])) continue;
          const fullId = (await withWriteToken(env, { op: 'create', model: def.full.model, fields: [] }, () => env.model(def.full!.model).create({}))).ids[0]!;
          result.full.push(fullId);
          for (const id of componentIds) await write(nodes.get(id)!, { [def.full.field]: fullId });
        }
      }
      return result;
    });
  }
}

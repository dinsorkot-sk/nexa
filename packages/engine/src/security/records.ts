import { ValidationError, type AccessOperation, type Domain, type Recordset } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { assertSystem } from '../services/common.js';
import { combine, resolveRuleDomain, userSecurity, type RuleIdentity } from './access.js';
import { validateRuleExpression } from './rule-expression.js';

/**
 * Access rights (`ir.model.access`) and record rules (`ir.rule`) managed as ordinary records.
 *
 * - The records are the source of truth for administrator-defined security only. They are synced
 *   one way into nx_access / nx_rule under the pseudo module {@link RECORDS_MODULE}, which no real
 *   module can be named (module names match /^[a-z][a-z0-9_]*$/), so module install / upgrade /
 *   uninstall never touch them and they never touch module-owned rows.
 * - Module-owned rows are not exposed as records, so they cannot be edited or deleted through the
 *   API. ACL rows are additive (OR), so an administrator row can only grant, never revoke.
 * - An ACL row always names a group (group_id is required): there is no "every user / public" row.
 * - Lock-out guard: neither ACL rows nor rules may target {@link isProtectedModel} models: res.users,
 *   res.groups, res.company, every `ir.*` model (including ir.model.access, ir.rule and
 *   ir.actions.report) and the mail models that expose or render cross-record content
 *   (mail.message, mail.followers, mail.tracking.value, mail.template). Rules on those models could
 *   hide users / groups / security records from base.group_system; ACL rows on them could hand
 *   security administration or other documents' content to non-system groups.
 * - Reference data models ({@link isReferenceModel}: res.lang, res.currency*, res.country*,
 *   mail.message.subtype, decimal.precision, uom.*) accept group rules but no global rules, which
 *   would hide reference data from every user, administrators included.
 * - Sync is serialized per tenant with a transaction-level advisory lock and runs DELETE, then
 *   SELECT of the active records, then INSERT, so concurrent admin transactions cannot resurrect
 *   revoked rows (the later one re-reads after the earlier one committed).
 * - Records whose model is not installed (e.g. its module was uninstalled) are skipped at the next
 *   sync; the records stay and apply again at a later sync once the model is installed again.
 * - Every change drops the env family's cached UserSecurity, so it applies to the rest of the
 *   transaction and to every later env / request.
 */
export const RECORDS_MODULE = '_records';

const OPS: AccessOperation[] = ['read', 'write', 'create', 'unlink'];
const PROTECTED = new Set([
  'res.users', 'res.groups', 'res.company', 'mail.message', 'mail.followers', 'mail.tracking.value', 'mail.template',
]);
const REFERENCE = new Set(['res.lang', 'mail.message.subtype', 'decimal.precision']);
/** Arbitrary constant key of the transaction-level advisory lock serializing the sync. */
const SYNC_LOCK_KEY = 7_340_118_221;

export function isProtectedModel(model: string): boolean {
  return PROTECTED.has(model) || model.startsWith('ir.');
}

export function isReferenceModel(model: string): boolean {
  return REFERENCE.has(model) || /^res\.(currency|country)(\.|$)/.test(model) || model.startsWith('uom.');
}

function syncable(env: EnvImpl, model: string): boolean {
  const meta = env.registry.models.get(model);
  return !!meta && !meta.def.abstract && !meta.def.transient && !!meta.table && !isProtectedModel(model);
}

function assertTargetModel(env: EnvImpl, model: string, what: string): void {
  const meta = env.registry.models.get(model);
  if (!meta) throw new ValidationError(`${what}: model '${model}' does not exist`);
  if (meta.def.abstract || meta.def.transient || !meta.table) {
    throw new ValidationError(`${what}: model '${model}' is not a concrete model`);
  }
  if (isProtectedModel(model)) {
    throw new ValidationError(`${what}: security of '${model}' is managed by modules only (protects administrator access and other documents' content)`);
  }
}

/** Parses a stored rule domain: a JSON domain (may use `{ "$ctx": ... }` placeholders) or an NX-Expr. */
export function parseRuleDomain(text: string | null): Domain | string {
  const source = (text ?? '').trim();
  if (source === '') return [];
  try {
    const value: unknown = JSON.parse(source);
    if (Array.isArray(value)) return value as Domain;
  } catch { /* not JSON: an NX-Expr domain expression */ }
  return source;
}

function invalidate(env: EnvImpl): void {
  env.security.promise = undefined;
}

// ---------- ir.model.access ----------

export async function checkAccessRecords(records: Recordset): Promise<void> {
  const env = records.env as EnvImpl;
  await assertSystem(env);
  const rows = await env.db.query<{ name: string; model_name: string; group_id: number | null }>({
    text: `SELECT name, model_name, group_id FROM ir_model_access WHERE id = ANY($1) ORDER BY id`, params: [[...records.ids]],
  });
  for (const row of rows) {
    assertTargetModel(env, row.model_name, `Access right '${row.name}'`);
    if (row.group_id === null) throw new ValidationError(`Access right '${row.name}': a group is required (no public access rights)`);
  }
  await syncSecurityRecords(env);
}

// ---------- ir.rule ----------

export async function checkRuleRecords(records: Recordset): Promise<void> {
  const env = records.env as EnvImpl;
  await assertSystem(env);
  const rel = env.registry.get('ir.rule').fields.get('group_ids')!;
  const rows = await env.db.query<{ name: string; model_name: string; domain_force: string | null; global: boolean } & Record<string, boolean>>({
    text: `SELECT r.name, r.model_name, r.domain_force, r.perm_read, r.perm_write, r.perm_create, r.perm_unlink,
        NOT EXISTS (SELECT 1 FROM "${rel.relationTable}" x WHERE x."${rel.column1}" = r.id) AS global
      FROM ir_rule r WHERE r.id = ANY($1) ORDER BY r.id`,
    params: [[...records.ids]],
  });
  const identity = await validationIdentity(env);
  for (const row of rows) {
    const label = `Record rule '${row.name}'`;
    assertTargetModel(env, row.model_name, label);
    if (row.global && isReferenceModel(row.model_name)) {
      throw new ValidationError(`${label}: '${row.model_name}' is reference data; only group rules are allowed on it`);
    }
    if (!OPS.some((op) => row[`perm_${op}`])) throw new ValidationError(`${label}: at least one operation must be selected`);
    await validateRuleDomain(env, row.model_name, parseRuleDomain(row.domain_force), label, identity);
  }
  await syncSecurityRecords(env);
}

/** The writing administrator's identity (companies, groups); a neutral one for superuser envs. */
async function validationIdentity(env: EnvImpl): Promise<RuleIdentity> {
  if (env.su) return { uid: env.uid, companyId: null, companyIds: [], groups: new Set() };
  const sec = await userSecurity(env);
  return { uid: sec.uid, companyId: sec.companyId, companyIds: sec.companyIds, groups: sec.groups };
}

/**
 * Resolves the domain for the writer's identity and runs it against the model (limit 1) inside a
 * savepoint, so unknown fields and SQL errors are reported without aborting the admin transaction.
 */
async function validateRuleDomain(
  env: EnvImpl, model: string, domain: Domain | string, label: string, identity: RuleIdentity,
): Promise<void> {
  try {
    if (typeof domain === 'string') validateRuleExpression(domain);
    const resolved = combine('&', [resolveRuleDomain(domain, identity)]);
    await env.sudo().withContext({ activeTest: false }).transaction((tx) => tx.model(model).search(resolved, { limit: 1 }));
  } catch (error) {
    throw new ValidationError(`${label}: invalid domain (${error instanceof Error ? error.message : String(error)})`);
  }
}

// ---------- sync ----------

interface Excluded { access?: readonly number[]; rule?: readonly number[] }

/** Replaces every administrator-defined row of nx_access / nx_rule from the records. */
export async function syncSecurityRecords(env: EnvImpl, excluded: Excluded = {}): Promise<void> {
  const db = env.db;
  // serialize concurrent syncs; held until the transaction ends
  await db.query({ text: `SELECT pg_advisory_xact_lock($1::bigint)`, params: [SYNC_LOCK_KEY] });
  if (env.registry.models.has('ir.model.access')) {
    await db.query({ text: `DELETE FROM nx_access WHERE module = $1`, params: [RECORDS_MODULE] });
    const models = [...env.registry.models.keys()].filter((m) => syncable(env, m));
    await db.query({
      text: `INSERT INTO nx_access (module, model, group_code, perm_read, perm_write, perm_create, perm_unlink)
        SELECT $1, a.model_name, g.code, COALESCE(a.perm_read, false), COALESCE(a.perm_write, false),
               COALESCE(a.perm_create, false), COALESCE(a.perm_unlink, false)
        FROM ir_model_access a JOIN res_groups g ON g.id = a.group_id
        WHERE a.active IS TRUE AND NOT (a.id = ANY($2)) AND a.model_name = ANY($3) ORDER BY a.id`,
      params: [RECORDS_MODULE, [...(excluded.access ?? [])], models],
    });
  }
  if (env.registry.models.has('ir.rule')) {
    const rel = env.registry.get('ir.rule').fields.get('group_ids')!;
    await db.query({ text: `DELETE FROM nx_rule WHERE module = $1`, params: [RECORDS_MODULE] });
    const rows = await db.query<{ id: number; model_name: string; domain_force: string | null; groups: string[] } & Record<string, boolean | null>>({
      text: `SELECT r.id, r.model_name, r.domain_force, r.perm_read, r.perm_write, r.perm_create, r.perm_unlink,
          ARRAY(SELECT g.code FROM "${rel.relationTable}" x JOIN res_groups g ON g.id = x."${rel.column2}"
                WHERE x."${rel.column1}" = r.id ORDER BY g.code) AS groups
        FROM ir_rule r WHERE r.active IS TRUE AND NOT (r.id = ANY($1)) ORDER BY r.id`,
      params: [[...(excluded.rule ?? [])]],
    });
    for (const r of rows) {
      if (!syncable(env, r.model_name)) continue;
      await db.query({
        text: `INSERT INTO nx_rule (module, name, model, groups, domain, perm_read, perm_write, perm_create, perm_unlink)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        params: [RECORDS_MODULE, `ir.rule.${r.id}`, r.model_name, r.groups, JSON.stringify(parseRuleDomain(r.domain_force)),
          ...OPS.map((op) => !!r[`perm_${op}`])],
      });
    }
  }
  invalidate(env);
}

/** Record hook: before deleting security records (or groups they reference). */
export async function securityRecordsBeforeUnlink(env: EnvImpl, model: string, ids: readonly number[]): Promise<void> {
  if (model === 'ir.model.access') { await assertSystem(env); await syncSecurityRecords(env, { access: ids }); return; }
  if (model === 'ir.rule') { await assertSystem(env); await syncSecurityRecords(env, { rule: ids }); return; }
  if (model === 'res.groups' && env.registry.models.has('ir.rule')) {
    // the relation row would cascade away silently and could turn a group rule into a global one
    const rel = env.registry.get('ir.rule').fields.get('group_ids')!;
    const [row] = await env.db.query<{ n: number }>({
      text: `SELECT count(*)::int AS n FROM "${rel.relationTable}" WHERE "${rel.column2}" = ANY($1)`, params: [[...ids]],
    });
    if (row && row.n > 0) throw new ValidationError('Groups used by record rules cannot be deleted; remove them from the rules first');
  }
}

/** Record hook: group codes are copied into nx_access / nx_rule, so a code change resyncs. */
export async function securityRecordsAfterWrite(env: EnvImpl, model: string, vals: Record<string, unknown>): Promise<void> {
  if (model === 'res.groups' && 'code' in vals && (env.registry.models.has('ir.model.access') || env.registry.models.has('ir.rule'))) {
    await syncSecurityRecords(env);
  }
}

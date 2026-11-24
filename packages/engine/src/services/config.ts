// Must stay first: automation.js installs the T19 record hooks at load; the wrapper at the bottom of
// this module chains them, so they have to exist before this module evaluates.
import './automation.js';
import { AccessError, ValidationError, type Domain, type Env, type Recordset } from '../contracts/index.js';
import { EnvImpl, SUPERUSER_ID, recordHooks, setDefaultsProvider, setRecordHooks } from '../orm/env.js';
import { userSecurity } from '../security/access.js';
import { assertSystem, ensureServiceTables, requireKey, tenantDriver } from './common.js';
import { AutomationRuleService, type AutomationTrigger } from './automation.js';
import { SchedulerService } from './index.js';
import { dropBacking, sequenceAfterWrite, sequenceBeforeWrite } from './sequence.js';

export { checkSequenceRanges, checkSequences, computeNumberNextActual } from './sequence.js';

const PARAM_KEY = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;
const MAGIC = new Set(['id', 'create_date', 'write_date', 'create_uid', 'write_uid', 'parent_path']);
const UNIT_MS = { seconds: 1_000, minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 } as const;
type IntervalType = keyof typeof UNIT_MS;

function registered(env: Env, model: string): boolean {
  return (env as EnvImpl).registry.models.has(model);
}
function requireRegistered(env: Env, model: string): void {
  if (!registered(env, model)) throw new ValidationError(`Model '${model}' is not installed (base module)`);
}
async function isSystem(env: Env): Promise<boolean> {
  if (env.su) return true;
  try { return (await userSecurity(env as Parameters<typeof userSecurity>[0])).groups.has('base.group_system'); } catch { return false; }
}

// ---------- ir.config_parameter ----------

export async function checkConfigParameters(records: Recordset): Promise<void> {
  const rows = await tenantDriver(records.env).query<{ key: string; value: string | null }>({
    text: `SELECT key, value FROM ir_config_parameter WHERE id = ANY($1)`, params: [[...records.ids]],
  });
  for (const row of rows) {
    if (!PARAM_KEY.test(row.key)) throw new ValidationError('Invalid parameter key');
    if (row.value !== null && row.value.length > 65_536) throw new ValidationError('Parameter value is too long');
  }
}

/**
 * Key/value system parameters stored as `ir.config_parameter` records. Writing requires
 * base.group_system; reading requires it too unless the parameter is flagged `is_public`.
 */
export class ConfigParameterService {
  constructor(private readonly env: Env) {}

  async get(key: string): Promise<string | null> {
    requireRegistered(this.env, 'ir.config_parameter');
    if (!PARAM_KEY.test(key)) throw new ValidationError('Invalid parameter key');
    const [row] = await tenantDriver(this.env).query<{ value: string | null; is_public: boolean | null }>({
      text: `SELECT value, is_public FROM ir_config_parameter WHERE key=$1`, params: [key],
    });
    if (row?.is_public) return row.value ?? null;
    if (!(await isSystem(this.env))) throw new AccessError('Only system administrators can read this parameter');
    return row?.value ?? null;
  }

  /** Sets (or with `null`, removes) a parameter through the ORM so ACLs and validation apply. */
  async set(key: string, value: string | null, options: { isPublic?: boolean } = {}): Promise<void> {
    requireRegistered(this.env, 'ir.config_parameter');
    await assertSystem(this.env);
    if (!PARAM_KEY.test(key)) throw new ValidationError('Invalid parameter key');
    if (value !== null && typeof value !== 'string') throw new ValidationError('Parameter values are strings');
    const model = this.env.model('ir.config_parameter');
    const existing = await model.search([['key', '=', key]]);
    if (value === null) { await existing.unlink(); return; }
    const vals: Record<string, unknown> = { value, ...(options.isPublic !== undefined ? { is_public: options.isPublic } : {}) };
    if (existing.ids.length) await existing.write(vals);
    else await model.create({ key, ...vals });
  }
}

// ---------- ir.default ----------

function defaultableField(env: Env, model: string, field: string): void {
  const registry = (env as EnvImpl).registry;
  if (!registry.models.has(model)) throw new ValidationError(`Unknown model '${model}'`);
  const meta = registry.get(model);
  if (meta.table === null) throw new ValidationError(`Model '${model}' has no records`);
  const def = meta.fields.get(field);
  if (!def || MAGIC.has(field)) throw new ValidationError(`Unknown field '${model}.${field}'`);
  if (def.compute || def.computeExpr || def.related || def.store === false) throw new ValidationError(`Field '${model}.${field}' cannot have a default`);
}

export async function checkDefaults(records: Recordset): Promise<void> {
  const rows = await tenantDriver(records.env).query<{ model_name: string; field_name: string; value_json: string; user_id: number | string | null; dup: boolean }>({
    text: `SELECT d.model_name, d.field_name, d.value_json, d.user_id,
        EXISTS (SELECT 1 FROM ir_default o WHERE o.id <> d.id AND o.model_name = d.model_name AND o.field_name = d.field_name
          AND o.user_id IS NOT DISTINCT FROM d.user_id AND o.company_id IS NOT DISTINCT FROM d.company_id) AS dup
      FROM ir_default d WHERE d.id = ANY($1)`,
    params: [[...records.ids]],
  });
  for (const row of rows) {
    defaultableField(records.env, row.model_name, row.field_name);
    if (row.dup) throw new ValidationError(`A default for '${row.model_name}.${row.field_name}' already exists in this scope`);
    if (row.value_json.length > 65_536) throw new ValidationError('Default value is too long');
    let value: unknown;
    try { value = JSON.parse(row.value_json); } catch { throw new ValidationError('Default value must be valid JSON'); }
    await validateDefaultValue(records.env, row.model_name, row.field_name, value);
    if (row.user_id !== null) await assertOwnerMayWrite(records.env as EnvImpl, Number(row.user_id), row.model_name, row.field_name);
  }
}

/** A user-scoped default may only target fields its owner can read and write (FieldDef.groups / writeGroups). */
async function assertOwnerMayWrite(env: EnvImpl, owner: number, model: string, field: string): Promise<void> {
  const def = env.registry.get(model).fields.get(field)!;
  const required = [def.groups, def.writeGroups].filter((g): g is string[] => Boolean(g?.length));
  if (!required.length || owner === SUPERUSER_ID) return;
  const ownerEnv = new EnvImpl({ tenant: env.tenant, uid: owner, registry: env.registry, db: env.db });
  let groups: ReadonlySet<string>;
  try { groups = (await userSecurity(ownerEnv)).groups; } catch { throw new AccessError(`Field '${model}.${field}' is restricted`); }
  for (const list of required) {
    if (!list.some((g) => groups.has(g))) throw new AccessError(`Field '${model}.${field}' is restricted`);
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

async function assertIdsExist(env: Env, comodel: string, ids: unknown[]): Promise<void> {
  if (ids.some((id) => !Number.isSafeInteger(id) || (id as number) <= 0)) throw new ValidationError('Relational defaults must be record ids');
  if (!ids.length) return;
  const table = (env as EnvImpl).registry.get(comodel).table!;
  const [row] = await tenantDriver(env).query<{ n: number }>({
    text: `SELECT count(*)::int AS n FROM "${table}" WHERE id = ANY($1)`, params: [[...new Set(ids)]],
  });
  if ((row?.n ?? 0) !== new Set(ids).size) throw new ValidationError(`Default refers to missing ${comodel} records`);
}

/** Checks a stored default against the field type (null/false means "empty" for every type). */
async function validateDefaultValue(env: Env, model: string, field: string, value: unknown): Promise<void> {
  const def = (env as EnvImpl).registry.get(model).fields.get(field)!;
  const bad = (): never => { throw new ValidationError(`Default value does not match the type of '${model}.${field}'`); };
  if (value === null || (value === false && def.type !== 'boolean')) return;
  switch (def.type) {
    case 'char': case 'text': case 'html': case 'reference':
      if (typeof value !== 'string') bad();
      return;
    case 'selection':
      if (typeof value !== 'string' || !(def.selection ?? []).some(([key]) => key === value)) bad();
      return;
    case 'integer':
      if (!Number.isSafeInteger(value)) bad();
      return;
    case 'float': case 'monetary':
      if (typeof value !== 'number' || !Number.isFinite(value)) bad();
      return;
    case 'boolean':
      if (typeof value !== 'boolean') bad();
      return;
    case 'date':
      if (typeof value !== 'string' || !DATE_ONLY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) bad();
      return;
    case 'datetime':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) bad();
      return;
    case 'json':
      return;
    case 'many2one':
      await assertIdsExist(env, def.comodel!, [value]);
      return;
    case 'many2many':
      if (!Array.isArray(value)) bad();
      await assertIdsExist(env, def.comodel!, value as unknown[]);
      return;
    default:
      bad();
  }
}

async function currentCompany(env: EnvImpl): Promise<number | null> {
  if (env.companyIds.length) return env.companyIds[0]!;
  const [row] = await env.db.query<{ company_id: number | string | null }>({
    text: `SELECT company_id FROM res_users WHERE id=$1`, params: [env.uid],
  }).catch(() => []);
  return row?.company_id == null ? null : Number(row.company_id);
}

/**
 * Resolved stored defaults of `model` for the env's user: user (+company) > company > global.
 * Invalid JSON rows are ignored. Returns undefined when ir.default is not installed.
 */
export async function storedDefaults(env: EnvImpl, model: string): Promise<ReadonlyMap<string, unknown> | undefined> {
  if (model === 'ir.default' || !env.registry.models.has('ir.default')) return undefined;
  const company = await currentCompany(env);
  const rows = await env.db.query<{ field_name: string; value_json: string }>({
    text: `SELECT field_name, value_json FROM ir_default
      WHERE model_name=$1 AND (user_id IS NULL OR user_id=$2) AND (company_id IS NULL OR company_id=$3::bigint)
      ORDER BY (user_id IS NULL), (company_id IS NULL), id`,
    params: [model, env.uid, company],
  });
  const out = new Map<string, unknown>();
  for (const row of rows) {
    if (out.has(row.field_name)) continue;
    try { out.set(row.field_name, JSON.parse(row.value_json)); } catch { /* ignore corrupt rows */ }
  }
  return out;
}

export type DefaultScope = 'user' | 'company' | 'global';
export interface DefaultScopeOptions { scope?: DefaultScope; companyId?: number }

/**
 * ir.default-like stored defaults. Users may manage their own user-scoped defaults; company and
 * global defaults require base.group_system (enforced by record rules on `ir.default`).
 */
export class DefaultService {
  constructor(private readonly env: Env) {}

  private async scopeDomain(model: string, field: string, options: DefaultScopeOptions): Promise<{ domain: Domain; vals: Record<string, unknown> }> {
    const scope = options.scope ?? 'user';
    let companyId: number | null = null;
    if (scope === 'company') {
      companyId = options.companyId ?? await currentCompany(this.env as EnvImpl);
      if (!companyId) throw new ValidationError('Company-scoped defaults need a company');
    } else if (options.companyId !== undefined) throw new ValidationError('Only company-scoped defaults take a company');
    if (!['user', 'company', 'global'].includes(scope)) throw new ValidationError('Unknown default scope');
    const userId = scope === 'user' ? this.env.uid : null;
    return {
      domain: [['model_name', '=', model], ['field_name', '=', field], ['user_id', '=', userId ?? false], ['company_id', '=', companyId ?? false]],
      vals: { model_name: model, field_name: field, user_id: userId, company_id: companyId },
    };
  }

  /** Stores a default value (JSON-serializable). Scope defaults to the current user. */
  async set(model: string, field: string, value: unknown, options: DefaultScopeOptions = {}): Promise<void> {
    requireRegistered(this.env, 'ir.default');
    defaultableField(this.env, model, field);
    if (value === undefined) throw new ValidationError('Default value is required');
    const json = JSON.stringify(value);
    if (json === undefined) throw new ValidationError('Default value must be JSON-serializable');
    const { domain, vals } = await this.scopeDomain(model, field, options);
    if ((options.scope ?? 'user') !== 'user') await assertSystem(this.env);
    else await assertOwnerMayWrite(this.env as EnvImpl, this.env.uid, model, field); // AccessError before the ORM wraps it
    const records = await this.env.model('ir.default').search(domain);
    if (records.ids.length) await records.write({ value_json: json });
    else await this.env.model('ir.default').create({ ...vals, value_json: json });
  }

  async remove(model: string, field: string, options: DefaultScopeOptions = {}): Promise<void> {
    requireRegistered(this.env, 'ir.default');
    const { domain } = await this.scopeDomain(model, field, options);
    if ((options.scope ?? 'user') !== 'user') await assertSystem(this.env);
    await (await this.env.model('ir.default').search(domain)).unlink();
  }

  /** The stored defaults that apply to the current user for `model` (context defaults excluded). */
  async get(model: string): Promise<Record<string, unknown>> {
    requireRegistered(this.env, 'ir.default');
    return Object.fromEntries(await storedDefaults(this.env as EnvImpl, model) ?? []);
  }
}

// ---------- ir.cron / ir.automation records -> runtime tables ----------

interface CronRow {
  key: string; interval_number: number; interval_type: IntervalType; nextcall: Date | null; action: string | null;
  builtin: string | null; user_id: number | string | null; active: boolean | null;
}

/** Validates ir.cron records through SchedulerService (admin-only, user/action checks) and stores the schedule. */
export async function checkCronRecords(records: Recordset, useNextcall: boolean): Promise<void> {
  const env = records.env;
  const rows = await tenantDriver(env).query<CronRow>({
    text: `SELECT key, interval_number, interval_type, nextcall, action, builtin, user_id, active FROM ir_cron WHERE id = ANY($1) ORDER BY id`,
    params: [[...records.ids]],
  });
  await ensureServiceTables(env);
  for (const row of rows) {
    requireKey(row.key, 'job key');
    const unit = UNIT_MS[row.interval_type];
    if (!unit || !Number.isSafeInteger(row.interval_number) || row.interval_number <= 0) throw new ValidationError('Interval must be a positive number');
    let nextRun: Date | undefined = useNextcall && row.nextcall ? new Date(row.nextcall) : undefined;
    if (!nextRun) {
      const [current] = await tenantDriver(env).query<{ next_run: Date }>({ text: `SELECT next_run FROM nx_scheduled_job WHERE key=$1`, params: [row.key] });
      nextRun = current?.next_run ? new Date(current.next_run) : row.nextcall ? new Date(row.nextcall) : undefined;
    }
    await new SchedulerService(env).schedule({
      key: row.key, intervalMs: row.interval_number * unit, enabled: row.active ?? false,
      ...(nextRun ? { nextRun } : {}),
      ...(row.action ? { action: row.action } : {}),
      ...(row.builtin ? { builtin: row.builtin as 'automation.on_time' } : {}),
      ...(row.user_id !== null ? { userId: Number(row.user_id) } : {}),
    });
  }
}

function parseDomain(text: string | null, label: string): Domain | undefined {
  if (text === null || text.trim() === '') return undefined;
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new ValidationError(`${label} must be a JSON domain`); }
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be a JSON domain`);
  return value as Domain;
}

/** Validates ir.automation records through AutomationRuleService.define (admin-only) and stores the rule. */
export async function checkAutomationRecords(records: Recordset): Promise<void> {
  const env = records.env;
  const rows = await tenantDriver(env).query<{
    key: string; model_name: string; trigger: AutomationTrigger; trigger_field_names: string | null; filter_pre_domain: string | null;
    filter_domain: string | null; action: string; date_field: string | null; delay_minutes: number | null; active: boolean | null;
  }>({
    text: `SELECT key, model_name, trigger, trigger_field_names, filter_pre_domain, filter_domain, action, date_field, delay_minutes, active
      FROM ir_automation WHERE id = ANY($1) ORDER BY id`,
    params: [[...records.ids]],
  });
  for (const row of rows) {
    const fields = (row.trigger_field_names ?? '').split(',').map((f) => f.trim()).filter(Boolean);
    const filterPre = parseDomain(row.filter_pre_domain, 'Pre-update filter');
    const filter = parseDomain(row.filter_domain, 'Filter');
    await new AutomationRuleService(env).define({
      key: row.key, model: row.model_name, trigger: row.trigger, action: row.action, enabled: row.active ?? false,
      delayMinutes: row.delay_minutes ?? 0,
      ...(fields.length ? { fields } : {}),
      ...(filterPre ? { filterPre } : {}),
      ...(filter ? { filter } : {}),
      ...(row.date_field ? { dateField: row.date_field } : {}),
    });
  }
}

const RUNTIME_TABLE: Record<string, string> = { 'ir.cron': 'nx_scheduled_job', 'ir.automation': 'nx_automation' };

async function removeRuntime(env: EnvImpl, model: string, ids: readonly number[]): Promise<void> {
  const runtime = RUNTIME_TABLE[model];
  if (!runtime) return;
  await assertSystem(env);
  await ensureServiceTables(env);
  const table = model === 'ir.cron' ? 'ir_cron' : 'ir_automation';
  await env.db.query({ text: `DELETE FROM ${runtime} WHERE key IN (SELECT key FROM ${table} WHERE id = ANY($1))`, params: [[...ids]] });
}

function secondsToInterval(ms: number): { interval_number: number; interval_type: IntervalType } {
  for (const type of ['weeks', 'days', 'hours', 'minutes', 'seconds'] as const) {
    if (ms % UNIT_MS[type] === 0) return { interval_number: ms / UNIT_MS[type], interval_type: type };
  }
  return { interval_number: Math.max(1, Math.ceil(ms / 1000)), interval_type: 'seconds' };
}

/**
 * Creates `ir.cron` / `ir.automation` records for jobs and rules that were defined through the
 * service APIs only, so they become visible and editable through the ORM. Admin-only.
 * Returns the number of records created.
 */
export async function importServiceConfigRecords(env: Env): Promise<number> {
  await assertSystem(env);
  await ensureServiceTables(env);
  const db = tenantDriver(env);
  let created = 0;
  if (registered(env, 'ir.cron')) {
    const jobs = await db.query<{ key: string; interval_ms: string | number; next_run: Date; enabled: boolean; action: string | null; builtin: string | null; user_id: string | number | null }>({
      text: `SELECT key, interval_ms, next_run, enabled, action, builtin, user_id FROM nx_scheduled_job j
        WHERE NOT EXISTS (SELECT 1 FROM ir_cron c WHERE c.key = j.key) ORDER BY id`, params: [],
    });
    for (const job of jobs) {
      await env.model('ir.cron').create({
        name: job.key, key: job.key, ...secondsToInterval(Number(job.interval_ms)), nextcall: new Date(job.next_run).toISOString(),
        active: job.enabled, action: job.action, builtin: job.builtin, user_id: job.user_id === null ? null : Number(job.user_id),
      });
      created += 1;
    }
  }
  if (registered(env, 'ir.automation')) {
    const rules = await db.query<{
      key: string; model: string; trigger: string; trigger_fields: string[]; filter_pre: unknown; filter: unknown; action: string;
      date_field: string | null; delay_minutes: number; enabled: boolean;
    }>({
      text: `SELECT key, model, trigger, trigger_fields, filter_pre, filter, action, date_field, delay_minutes, enabled FROM nx_automation a
        WHERE NOT EXISTS (SELECT 1 FROM ir_automation r WHERE r.key = a.key) ORDER BY id`, params: [],
    });
    for (const rule of rules) {
      await env.model('ir.automation').create({
        name: rule.key, key: rule.key, model_name: rule.model, trigger: rule.trigger,
        trigger_field_names: rule.trigger_fields.length ? rule.trigger_fields.join(',') : null,
        filter_pre_domain: rule.filter_pre === null ? null : JSON.stringify(rule.filter_pre),
        filter_domain: rule.filter === null ? null : JSON.stringify(rule.filter),
        action: rule.action, date_field: rule.date_field, delay_minutes: rule.delay_minutes, active: rule.enabled,
      });
      created += 1;
    }
  }
  return created;
}

// ---------- hook installation (runs once at module load, after the automation hooks) ----------

const previous = recordHooks();
if (!previous) throw new Error('Automation record hooks must be installed before the config hooks');
setRecordHooks({
  afterCreate: async (env, model, ids) => { await previous?.afterCreate(env, model, ids); },
  beforeWrite: async (env, model, ids, vals) => {
    if (RUNTIME_TABLE[model] && 'key' in vals) {
      const [row] = await env.db.query<{ n: number }>({
        text: `SELECT count(*)::int AS n FROM ${model === 'ir.cron' ? 'ir_cron' : 'ir_automation'} WHERE id = ANY($1) AND key IS DISTINCT FROM $2`,
        params: [[...ids], vals.key],
      });
      if (row && row.n > 0) throw new ValidationError('The key of a scheduled job or automation rule cannot be changed');
    }
    const sequence = await sequenceBeforeWrite(env, model, ids, vals);
    return { sequence, previous: await previous?.beforeWrite(env, model, ids, vals) };
  },
  afterWrite: async (env, model, ids, vals, state) => {
    const chained = state as { sequence?: Map<string, number>; previous?: unknown } | undefined;
    await sequenceAfterWrite(env, model, ids, vals, chained?.sequence);
    await previous?.afterWrite(env, model, ids, vals, chained?.previous);
  },
  beforeUnlink: async (env, model, ids) => {
    await previous?.beforeUnlink(env, model, ids);
    await removeRuntime(env, model, ids);
    await dropBacking(env, model, ids);
  },
});
setDefaultsProvider(storedDefaults);

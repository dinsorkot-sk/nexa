import { ValidationError, type Domain, type Env } from '../contracts/index.js';
import { setRecordHooks, type EnvImpl, type RecordHooks } from '../orm/env.js';
import { assertSystem, ensureServiceTables, requireKey, tenantDriver } from './common.js';
import { ServerActionService, lockActionReferences } from './actions.js';

/** Odoo base_automation triggers. */
export type AutomationTrigger = 'on_create' | 'on_write' | 'on_create_or_write' | 'on_unlink' | 'on_change_fields' | 'on_time';

export interface AutomationRuleDef {
  key: string;
  model: string;
  trigger: AutomationTrigger;
  /** Server action key run on the matching records (as the user who caused the event). */
  action: string;
  /** on_change_fields: the rule fires only when one of these fields changes value. */
  fields?: string[];
  /** Domain the records must match before the write (write triggers only). */
  filterPre?: Domain;
  /** Domain the records must match after the change (or at unlink / time evaluation). */
  filter?: Domain;
  /** on_time: date/datetime field and offset (minutes, may be negative). */
  dateField?: string;
  delayMinutes?: number;
  /** on_time: initial watermark (records due before it never fire). Defaults to now; kept on re-definition. */
  startAt?: Date;
  enabled?: boolean;
}

const SAME_SCHEDULE = `(nx_automation.model,nx_automation.trigger,nx_automation.date_field,nx_automation.delay_minutes)
  IS NOT DISTINCT FROM (EXCLUDED.model,EXCLUDED.trigger,EXCLUDED.date_field,EXCLUDED.delay_minutes)`;

const TRIGGERS = new Set<AutomationTrigger>(['on_create', 'on_write', 'on_create_or_write', 'on_unlink', 'on_change_fields', 'on_time']);
/** Distinct automation rules that may be nested in one call chain. */
export const MAX_AUTOMATION_DEPTH = 8;
/** Records per page (one server-action run each, so it must fit the default row budget). */
export const TIME_BATCH = 500;
/** Pages per rule and run; the remainder is picked up by the next run from the stored watermark. */
const MAX_TIME_PAGES = 20;

interface RuleRow {
  key: string; model: string; trigger: AutomationTrigger; trigger_fields: string[]; filter_pre: Domain | null; filter: Domain | null;
  action: string; date_field: string | null; delay_minutes: number; last_run: Date | null; last_id?: number | string | null; last_value?: string | null;
}

/** Data-driven automation rules. Definitions are admin-only; actions run with the triggering user's rights. */
export class AutomationRuleService {
  constructor(private readonly env: Env) {}

  async define(def: AutomationRuleDef): Promise<void> {
    // serialize with removeServerActionDefinitions: the referenced action cannot vanish before our row is stored
    await this.env.transaction(async () => { await lockActionReferences(this.env); await this.defineLocked(def); });
  }

  private async defineLocked(def: AutomationRuleDef): Promise<void> {
    await assertSystem(this.env);
    requireKey(def.key, 'automation key');
    if (!TRIGGERS.has(def.trigger)) throw new ValidationError(`Unknown automation trigger '${String(def.trigger)}'`);
    const registry = (this.env as EnvImpl).registry;
    if (!registry.models.has(def.model)) throw new ValidationError(`Unknown model '${def.model}'`);
    const meta = registry.get(def.model);
    const fields = def.fields ?? [];
    if (!Array.isArray(fields) || fields.some((f) => typeof f !== 'string' || !meta.fields.has(f))) {
      throw new ValidationError('Automation fields must name fields of the model');
    }
    if (def.trigger === 'on_change_fields' && !fields.length) throw new ValidationError('on_change_fields needs at least one field');
    for (const domain of [def.filterPre, def.filter]) {
      if (domain === undefined) continue;
      if (!Array.isArray(domain)) throw new ValidationError('Automation filters must be domains');
      await this.env.sudo().model(def.model).searchCount(domain); // compiles the domain (rejects unknown fields)
    }
    if (def.filterPre?.length && !['on_write', 'on_create_or_write', 'on_change_fields'].includes(def.trigger)) {
      throw new ValidationError('filterPre only applies to write triggers');
    }
    const delay = def.delayMinutes ?? 0;
    if (!Number.isSafeInteger(delay) || Math.abs(delay) > 5_256_000) throw new ValidationError('Automation delay must be an integer number of minutes');
    if (def.trigger === 'on_time') {
      const field = def.dateField ? meta.fields.get(def.dateField) : undefined;
      if (!field || !['date', 'datetime'].includes(field.type) || field.store === false) {
        throw new ValidationError('on_time needs a stored date or datetime field');
      }
    } else if (def.dateField !== undefined) throw new ValidationError('dateField only applies to on_time');
    const action = await new ServerActionService(this.env).resolve(def.action);
    if (!action) throw new ValidationError(`Unknown server action '${def.action}'`);
    if (action.model && action.model !== def.model) throw new ValidationError(`Server action '${def.action}' does not apply to '${def.model}'`);
    await ensureServiceTables(this.env);
    await tenantDriver(this.env).query({
      // Time rules start from "now": enabling one never replays history. The watermark survives a
      // re-definition unless what it measures (model, trigger, date field, delay) changed.
      text: `INSERT INTO nx_automation(key,model,trigger,trigger_fields,filter_pre,filter,action,date_field,delay_minutes,enabled,last_run)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
        ON CONFLICT(key) DO UPDATE SET model=EXCLUDED.model,trigger=EXCLUDED.trigger,trigger_fields=EXCLUDED.trigger_fields,
          filter_pre=EXCLUDED.filter_pre,filter=EXCLUDED.filter,action=EXCLUDED.action,date_field=EXCLUDED.date_field,
          delay_minutes=EXCLUDED.delay_minutes,enabled=EXCLUDED.enabled,
          last_run=CASE WHEN ${SAME_SCHEDULE} AND nx_automation.last_run IS NOT NULL THEN nx_automation.last_run ELSE EXCLUDED.last_run END,
          last_id=CASE WHEN ${SAME_SCHEDULE} AND nx_automation.last_run IS NOT NULL THEN nx_automation.last_id ELSE NULL END,
          last_value=CASE WHEN ${SAME_SCHEDULE} AND nx_automation.last_run IS NOT NULL THEN nx_automation.last_value ELSE NULL END`,
      params: [
        def.key, def.model, def.trigger, fields, def.filterPre ? JSON.stringify(def.filterPre) : null,
        def.filter ? JSON.stringify(def.filter) : null, def.action, def.dateField ?? null, delay, def.enabled ?? true,
        def.startAt ?? new Date(),
      ],
    });

  }

  /** Evaluate time-based rules now (normally called by a scheduled job). Admin-only when called directly. */
  async runTimeTriggers(now = new Date()): Promise<number> {
    await assertSystem(this.env);
    return runTimeAutomations(this.env, now);
  }
}

/**
 * Runs due `on_time` rules as `env`'s user. A record fires once, when date + delay passes: each rule keeps
 * a watermark (last_run, plus last_id as tie-breaker inside a partly processed instant). Records are
 * searched with the job user's own rights, so records it cannot see are skipped instead of failing the
 * batch. Every page commits on its own; a failing rule records last_error and the others still run.
 * Must not be wrapped in an outer transaction. Internal: the scheduler calls it for admin-configured jobs.
 */
export async function runTimeAutomations(env: Env, now: Date): Promise<number> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new ValidationError('Invalid time');
  await ensureServiceTables(env);
  const rules = await tenantDriver(env).query<RuleRow>({
    text: `SELECT key,model,trigger,trigger_fields,filter_pre,filter,action,date_field,delay_minutes,last_run,last_id,last_value
      FROM nx_automation WHERE enabled AND trigger='on_time' ORDER BY id`, params: [],
  });
  let fired = 0;
  const failed: string[] = [];
  for (const rule of rules) {
    try {
      fired += await runTimeRule(env as EnvImpl, rule, now);
      await tenantDriver(env).query({ text: `UPDATE nx_automation SET last_error=NULL WHERE key=$1`, params: [rule.key] });
    } catch (error) {
      failed.push(rule.key);
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Automation failed';
      await tenantDriver(env).query({ text: `UPDATE nx_automation SET last_error=$2 WHERE key=$1`, params: [rule.key, message] });
    }
  }
  if (failed.length) throw new ValidationError(`Time automations failed: ${failed.join(', ')}`);
  return fired;
}

async function runTimeRule(env: EnvImpl, rule: RuleRow, now: Date): Promise<number> {
  const registry = env.registry;
  if (!registry.models.has(rule.model) || !rule.date_field) return 0;
  const field = registry.get(rule.model).fields.get(rule.date_field);
  if (!field) return 0;
  const dateField = rule.date_field;
  const delayMs = rule.delay_minutes * 60_000;
  const toValue = (d: Date): string => {
    const iso = new Date(d.getTime() - delayMs).toISOString();
    return field.type === 'date' ? iso.slice(0, 10) : iso;
  };
  const table = registry.get(rule.model).table;
  // Two watermark forms: after a drained run, `last_run` (a "now" instant, compared as date + delay);
  // inside a partly processed page, the exact DB text of the last record's date (µs precision, never
  // round-tripped through a JS Date) plus its id as tie-breaker: (date, id) > (last_value, last_id).
  const lastRun = rule.last_run ? new Date(rule.last_run) : now;
  let lastValue = rule.last_value ?? null;
  let lastId = rule.last_id === null || rule.last_id === undefined ? null : Number(rule.last_id);
  const actor = env.withAutomation(rule.key);
  let processed = 0;
  for (let page = 0; page < MAX_TIME_PAGES; page++) {
    const window: Domain = lastValue !== null && lastId !== null
      ? ['|', [dateField, '>', lastValue], '&', [dateField, '=', lastValue], ['id', '>', lastId]]
      : [[dateField, '>', toValue(lastRun)]];
    const domain: Domain = [[dateField, '<=', toValue(now)], ...window, ...(rule.filter ?? [])];
    const drained = await env.transaction(async () => {
      const due = await actor.model(rule.model).search(domain, { limit: TIME_BATCH, order: `${dateField} asc, id asc` });
      if (due.ids.length) await new ServerActionService(actor).run(rule.action, { model: rule.model, ids: [...due.ids] });
      processed += due.ids.length;
      const full = due.ids.length >= TIME_BATCH;
      if (full) {
        const last = due.ids[due.ids.length - 1]!;
        const [row] = await tenantDriver(env).query<{ v: string }>({
          text: `SELECT "${dateField}"::text AS v FROM "${table}" WHERE id = $1`, params: [last],
        });
        lastValue = row!.v;
        lastId = last;
        await tenantDriver(env).query({ text: `UPDATE nx_automation SET last_value=$2, last_id=$3 WHERE key=$1`, params: [rule.key, lastValue, lastId] });
      } else {
        lastValue = null;
        lastId = null;
        await tenantDriver(env).query({
          text: `UPDATE nx_automation SET last_run=$2, last_value=NULL, last_id=NULL WHERE key=$1`, params: [rule.key, now],
        });
      }
      return !full;
    });
    if (drained) break;
  }
  return processed;
}

/**
 * Always read from the database (no process cache, so definitions are visible to every instance and
 * transaction at once): a catalog probe, then the (model, trigger) index lookup.
 */
async function rulesFor(env: EnvImpl, model: string, triggers: AutomationTrigger[]): Promise<RuleRow[]> {
  const [table] = await env.db.query<{ ok: boolean }>({ text: `SELECT to_regclass('nx_automation') IS NOT NULL AS ok`, params: [] });
  if (!table?.ok) return [];
  const rows = await env.db.query<RuleRow>({
    text: `SELECT key,model,trigger,trigger_fields,filter_pre,filter,action,date_field,delay_minutes,last_run
      FROM nx_automation WHERE enabled AND model=$1 AND trigger = ANY($2) ORDER BY id`,
    params: [model, triggers],
  });
  // a rule never re-triggers itself (directly or through other rules) within its own run
  const active = rows.filter((r) => !env.automationStack.includes(r.key));
  if (active.length && env.automationStack.length >= MAX_AUTOMATION_DEPTH) {
    throw new ValidationError('Automation nesting limit exceeded');
  }
  return active;
}

async function matching(env: EnvImpl, model: string, ids: readonly number[], domain: Domain | null): Promise<number[]> {
  if (!ids.length) return [];
  if (!domain?.length) return [...ids];
  const found = await env.sudo().withContext({ activeTest: false }).model(model).search([['id', 'in', [...ids]], ...domain]);
  const hit = new Set(found.ids);
  return ids.filter((id) => hit.has(id));
}

async function snapshot(env: EnvImpl, model: string, ids: readonly number[], fields: string[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const rows = await env.sudo().withContext({ activeTest: false }).model(model).browse([...ids]).read(fields);
  return new Map(rows.map((r) => [r.id as number, JSON.stringify(fields.map((f) => r[f] ?? null))]));
}

async function fire(env: EnvImpl, rule: RuleRow, ids: readonly number[]): Promise<void> {
  if (!ids.length) return;
  await new ServerActionService(env.withAutomation(rule.key)).run(rule.action, { model: rule.model, ids });
}

interface PendingWrite { rule: RuleRow; ids: number[]; before?: Map<number, string> }

/**
 * Event automation hooks. Actions always run as the triggering uid WITHOUT sudo, also when the
 * triggering write was an internal sudo write (e.g. engine bookkeeping on behalf of a user). If the
 * action needs rights that user lacks, it fails and rolls back the triggering operation as well, so
 * rules on models written through internal sudo paths must only use actions the users can perform.
 * Domains (filterPre/filter) are matched with sudo. on_change_fields only sees fields written
 * directly (not recomputed or delegated changes). Hooks are installed when this module is loaded.
 */
const hooks: RecordHooks = {
  async afterCreate(env, model, ids) {
    for (const rule of await rulesFor(env, model, ['on_create', 'on_create_or_write'])) {
      await fire(env, rule, await matching(env, model, ids, rule.filter));
    }
  },
  async beforeWrite(env, model, ids, vals) {
    const pending: PendingWrite[] = [];
    const changed = Object.keys(vals);
    for (const rule of await rulesFor(env, model, ['on_write', 'on_create_or_write', 'on_change_fields'])) {
      const watched = rule.trigger === 'on_change_fields' ? rule.trigger_fields.filter((f) => changed.includes(f)) : [];
      if (rule.trigger === 'on_change_fields' && !watched.length) continue;
      const pre = await matching(env, model, ids, rule.filter_pre);
      if (!pre.length) continue;
      pending.push({ rule, ids: pre, ...(watched.length ? { before: await snapshot(env, model, pre, rule.trigger_fields) } : {}) });
    }
    return pending.length ? pending : undefined;
  },
  async afterWrite(env, model, _ids, _vals, state) {
    for (const item of (state as PendingWrite[] | undefined) ?? []) {
      let ids = await matching(env, model, item.ids, item.rule.filter);
      if (item.before) {
        const after = await snapshot(env, model, ids, item.rule.trigger_fields);
        ids = ids.filter((id) => after.get(id) !== item.before!.get(id));
      }
      await fire(env, item.rule, ids);
    }
  },
  async beforeUnlink(env, model, ids) {
    for (const rule of await rulesFor(env, model, ['on_unlink'])) {
      await fire(env, rule, await matching(env, model, ids, rule.filter));
    }
  },
};

setRecordHooks(hooks);

import { AccessError, ValidationError, type Domain, type Env, type Recordset } from '../contracts/index.js';
import { withUserContext } from '../base/lang.js';
import type { EnvImpl } from '../orm/env.js';
import { checkRecordRules } from '../security/access.js';
import { assertReadable, assertWritable, positiveInt, requireModel } from '../services/common.js';
import { BusService, userChannel } from '../bus/service.js';
import { createMessage, mailInstalled, resolveSubtype, xmlRef } from './message.js';
import { escapeHtml, sanitizeHtml } from './sanitize.js';

export type ActivityState = 'overdue' | 'today' | 'planned';

/** Today's date (YYYY-MM-DD) in the env user's time zone (context tz wins, then res.users.tz, then UTC). */
export async function userToday(env: Env): Promise<string> {
  const scoped = await withUserContext(env);
  const tz = typeof scoped.context.tz === 'string' && scoped.context.tz ? scoped.context.tz : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function isoDay(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

export function activityState(deadline: string, today: string): ActivityState {
  return deadline < today ? 'overdue' : deadline === today ? 'today' : 'planned';
}

export function addDelay(day: string, count: number, unit: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (unit === 'weeks') d.setUTCDate(d.getUTCDate() + 7 * count);
  else if (unit === 'months') d.setUTCMonth(d.getUTCMonth() + count);
  else d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

/** mail.activity.state (non-stored): relative to the reading user's today. */
export async function computeActivityState(records: Recordset): Promise<Map<number, ActivityState | null>> {
  const today = await userToday(records.env);
  const rows = await records.env.sudo().model('mail.activity').browse([...records.ids]).read(['date_deadline']);
  return new Map(rows.map((r) => {
    const day = isoDay(r.date_deadline);
    return [r.id as number, day ? activityState(day, today) : null];
  }));
}

/** Activities on documents (superuser read; callers already passed the document's read check). */
async function documentActivities(env: Env, model: string, ids: readonly number[]): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  return env.sudo().model('mail.activity').searchRead(
    [['res_model', '=', model], ['res_id', 'in', [...ids]]], ['res_id', 'date_deadline', 'user_id'], { order: 'date_deadline asc, id asc' },
  );
}

/** mail.activity.mixin.activity_ids (non-stored). */
export async function computeActivityIds(records: Recordset): Promise<Map<number, number[]>> {
  const rows = await documentActivities(records.env, records.model, records.ids);
  const out = new Map<number, number[]>(records.ids.map((id) => [id, []]));
  for (const r of rows) out.get(r.res_id as number)?.push(r.id as number);
  return out;
}

/** mail.activity.mixin.activity_state: the most urgent state of the document's activities. */
export async function computeDocumentActivityState(records: Recordset): Promise<Map<number, ActivityState | null>> {
  const rows = await documentActivities(records.env, records.model, records.ids);
  const today = await userToday(records.env);
  const rank: Record<ActivityState, number> = { overdue: 0, today: 1, planned: 2 };
  const out = new Map<number, ActivityState | null>(records.ids.map((id) => [id, null]));
  for (const r of rows) {
    const day = isoDay(r.date_deadline);
    if (!day) continue;
    const state = activityState(day, today);
    const current = out.get(r.res_id as number);
    if (!current || rank[state] < rank[current]) out.set(r.res_id as number, state);
  }
  return out;
}

/**
 * Constraint of mail.activity: the document must exist and, for non-superusers, be writable by the
 * user creating the activity or moving it to another document (Odoo: scheduling = editing the document).
 */
export async function checkActivityDocument(records: Recordset): Promise<void> {
  const rows = await records.env.sudo().model('mail.activity').browse([...records.ids]).read(['res_model', 'res_id']);
  const registry = (records.env as EnvImpl).registry;
  for (const row of rows) {
    const model = row.res_model as string;
    const resId = row.res_id as number;
    if (typeof model !== 'string' || !registry.models.has(model) || !registry.get(model).table) throw new ValidationError('Activities need a document model');
    if (!Number.isSafeInteger(resId) || resId <= 0) throw new ValidationError('Activities need a document');
    if (!(await records.env.sudo().withContext({ activeTest: false }).model(model).search([['id', '=', resId]])).ids.length) {
      throw new ValidationError('The activity document does not exist');
    }
    if (!records.env.su) await assertWritable(records.env, model, resId);
  }
}

export interface ScheduleOptions {
  /** mail.activity.type id or external id (default `mail.mail_activity_data_todo`). */
  activityType?: number | string;
  summary?: string;
  note?: string;
  /** YYYY-MM-DD; defaults to today (user tz) + the type's delay. */
  dateDeadline?: string;
  /** Assignee (res.users id); defaults to the type's default user, else the caller. */
  userId?: number;
}

export interface ActivityRow { id: number; res_model: string; res_id: number; activity_type_id: number | null; summary: string | null; date_deadline: string | null; user_id: number | null; state: ActivityState | null }

function requireMail(env: Env): void {
  if (!mailInstalled(env)) throw new ValidationError('The mail module is not installed');
}

async function resolveType(env: Env, ref: number | string | undefined): Promise<number> {
  if (ref === undefined) return xmlRef(env, 'mail.mail_activity_data_todo', 'mail.activity.type');
  if (typeof ref === 'string') return xmlRef(env, ref.includes('.') ? ref : `mail.${ref}`, 'mail.activity.type');
  positiveInt(ref, 'activity type id');
  if (!(await env.sudo().model('mail.activity.type').search([['id', '=', ref]])).ids.length) throw new ValidationError('Unknown activity type');
  return ref;
}

/** Odoo mail.activity concepts: scheduling, marking done (with chaining) and "my activities". */
export class ActivityService {
  constructor(private readonly env: Env) {}

  /** Schedule an activity on a document: write access to the document is required. */
  async schedule(model: string, resId: number, options: ScheduleOptions = {}): Promise<number> {
    requireMail(this.env);
    requireModel(model);
    positiveInt(resId, 'record id');
    await assertWritable(this.env, model, resId);
    return this.env.transaction(async (env) => {
      const typeId = await resolveType(env, options.activityType);
      const [type] = await env.sudo().model('mail.activity.type').browse(typeId).read(['delay_count', 'delay_unit', 'default_user_id', 'summary']);
      let deadline = options.dateDeadline;
      if (deadline === undefined) deadline = addDelay(await userToday(env), Number(type!.delay_count ?? 0), String(type!.delay_unit ?? 'days'));
      else if (isoDay(deadline) !== deadline || Number.isNaN(Date.parse(deadline))) throw new ValidationError('Deadline must be a YYYY-MM-DD date');
      const userId = options.userId ?? (type!.default_user_id as number | null) ?? env.uid;
      positiveInt(userId, 'user id');
      const created = await env.model('mail.activity').create({
        res_model: model, res_id: resId, activity_type_id: typeId, summary: options.summary ?? type!.summary ?? null,
        note: options.note === undefined ? null : sanitizeHtml(options.note), date_deadline: deadline, user_id: userId,
      });
      return created.ids[0]!;
    });
  }

  /** Activities of a document (read access to the document is enough). */
  async list(model: string, resId: number): Promise<ActivityRow[]> {
    requireMail(this.env);
    requireModel(model);
    positiveInt(resId, 'record id');
    await assertReadable(this.env, model, resId);
    const ids = (await documentActivities(this.env, model, [resId])).map((r) => r.id as number);
    return this.rows(ids);
  }

  /** Activities assigned to the caller, optionally of one model / state (overdue first). */
  async mine(opts: { model?: string; state?: ActivityState } = {}): Promise<ActivityRow[]> {
    requireMail(this.env);
    if (opts.model !== undefined) requireModel(opts.model);
    const domain: Domain = [['user_id', '=', this.env.uid], ...(opts.model ? [['res_model', '=', opts.model] as const] : [])];
    const ids = (await this.env.sudo().model('mail.activity').search(domain, { order: 'date_deadline asc, id asc', limit: 1000 })).ids;
    const rows = await this.rows([...ids]);
    return opts.state ? rows.filter((r) => r.state === opts.state) : rows;
  }

  /**
   * Domain selecting documents of `model` with activities (optionally the caller's own / in a state),
   * for use in a normal (rule-checked) search of the document model.
   */
  async documentDomain(model: string, opts: { mine?: boolean; state?: ActivityState } = {}): Promise<Domain> {
    requireMail(this.env);
    requireModel(model);
    const domain: Domain = [['res_model', '=', model], ...(opts.mine ? [['user_id', '=', this.env.uid] as const] : [])];
    const rows = await this.env.sudo().model('mail.activity').searchRead(domain, ['res_id', 'date_deadline'], { limit: 10_000 });
    const today = await userToday(this.env);
    const ids = new Set<number>();
    for (const r of rows) {
      const day = isoDay(r.date_deadline);
      if (!opts.state || (day && activityState(day, today) === opts.state)) ids.add(r.res_id as number);
    }
    return [['id', 'in', [...ids]]];
  }

  /**
   * Mark activities done: needs write access to the activity (assignee, creator or admin by the
   * activity record rules) and read access to its document. Posts a "done" message on the document,
   * schedules the chained next activity type, then deletes the activity. Returns the posted message ids.
   */
  async done(activityIds: number[], feedback?: string): Promise<number[]> {
    requireMail(this.env);
    if (!Array.isArray(activityIds) || !activityIds.length || activityIds.length > 500) throw new ValidationError('Give 1 to 500 activity ids');
    const ids = [...new Set(activityIds.map((id) => positiveInt(id, 'activity id')))];
    if (feedback !== undefined && (typeof feedback !== 'string' || feedback.length > 10_000)) throw new ValidationError('Invalid feedback');
    return this.env.transaction(async (env) => {
      const records = env.model('mail.activity').browse(ids);
      await records.checkAccess('write');
      const visible = await records.read(['id']);
      if (visible.length !== ids.length) throw new AccessError('Activity is unavailable');
      await checkRecordRules(env as EnvImpl, 'mail.activity', ids, 'write');
      const su = env.sudo();
      const rows = await su.model('mail.activity').browse(ids).read(['res_model', 'res_id', 'activity_type_id', 'summary', 'note', 'user_id']);
      const subtype = await resolveSubtype(env, 'mail.mt_activities');
      const messages: number[] = [];
      for (const row of rows) {
        const model = row.res_model as string;
        const resId = row.res_id as number;
        await assertReadable(env, model, resId);
        const typeId = row.activity_type_id as number | null;
        const [type] = typeId ? await su.model('mail.activity.type').browse(typeId).read(['name', 'next_type_id']) : [undefined];
        const title = escapeHtml(String(type?.name ?? 'Activity')) + (row.summary ? `: ${escapeHtml(String(row.summary))}` : '');
        const body = `<p>${title} done</p>${feedback ? `<p>${escapeHtml(feedback)}</p>` : ''}${row.note ? `<div>${String(row.note)}</div>` : ''}`;
        messages.push(await createMessage(env, { model, resId, body, messageType: 'notification', subtypeId: subtype }));
        const next = type?.next_type_id as number | null | undefined;
        if (next) {
          const [nextType] = await su.model('mail.activity.type').browse(next).read(['delay_count', 'delay_unit', 'default_user_id', 'summary']);
          await su.model('mail.activity').create({
            res_model: model, res_id: resId, activity_type_id: next, summary: nextType!.summary ?? null,
            date_deadline: addDelay(await userToday(env), Number(nextType!.delay_count ?? 0), String(nextType!.delay_unit ?? 'days')),
            user_id: (nextType!.default_user_id as number | null) ?? (row.user_id as number | null) ?? env.uid,
          });
        }
      }
      // assignees learn the activity is done (ids only; delivered after commit)
      const bus = new BusService(env);
      for (const row of rows) {
        if (typeof row.user_id !== 'number') continue;
        await bus.publish(userChannel(row.user_id), 'mail.activity.done', { activity_id: row.id, model: row.res_model, res_id: row.res_id }, {
          record: [row.res_model as string, row.res_id as number],
        });
      }
      await su.model('mail.activity').browse(ids).unlink();
      return messages;
    });
  }

  private async rows(ids: number[]): Promise<ActivityRow[]> {
    if (!ids.length) return [];
    const su = this.env.sudo();
    const rows = await su.model('mail.activity').browse(ids).read(['res_model', 'res_id', 'activity_type_id', 'summary', 'date_deadline', 'user_id']);
    const today = await userToday(this.env);
    return rows.map((r) => {
      const day = isoDay(r.date_deadline);
      return {
        id: r.id as number, res_model: r.res_model as string, res_id: r.res_id as number, activity_type_id: (r.activity_type_id as number | null) ?? null,
        summary: (r.summary as string | null) ?? null, date_deadline: day, user_id: (r.user_id as number | null) ?? null,
        state: day ? activityState(day, today) : null,
      };
    });
  }
}

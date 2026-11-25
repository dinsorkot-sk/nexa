// Load order matters: the mail hooks chain onto the automation and config hooks; the bus hooks chain
// onto all of them, so import them first.
import '../mail/hooks.js';
import { recordHooks, setRecordHooks, type EnvImpl } from '../orm/env.js';
import { BUS_LIMITS } from './hub.js';
import { BusService, busNotifies, partnerChannel, recordChannel, userChannel } from './service.js';

const MAX_FOLLOWER_CHANNELS = 1_000;

function tableOf(env: EnvImpl, model: string): string | null {
  return env.registry.models.has(model) ? env.registry.get(model).table : null;
}

async function writeDates(env: EnvImpl, model: string, ids: readonly number[]): Promise<Map<number, string | null>> {
  const table = tableOf(env, model);
  if (!table || !ids.length) return new Map();
  const rows = await env.db.query<{ id: number; write_date: unknown }>({
    text: `SELECT id, write_date FROM "${table}" WHERE id = ANY($1)`, params: [[...ids]],
  });
  return new Map(rows.map((r) => [Number(r.id), r.write_date instanceof Date ? r.write_date.toISOString() : r.write_date == null ? null : String(r.write_date)]));
}

/**
 * `{model, id, op, write_date}` on the record channel of each record (never field values). Beyond
 * BUS_LIMITS.maxRecordEvents records, the rest get one model-level `record.reset` per chunk of channels
 * (`{model, op}`; delivered to explicit subscribers of those records with model read ACL).
 */
async function recordEvents(env: EnvImpl, model: string, ids: readonly number[], op: 'create' | 'write' | 'unlink'): Promise<void> {
  if (!busNotifies(model) || !ids.length) return;
  const max = BUS_LIMITS.maxRecordEvents;
  const list = ids.slice(0, max);
  const dates = op === 'unlink' ? new Map<number, string | null>() : await writeDates(env, model, list);
  const bus = new BusService(env);
  for (const id of list) {
    await bus.publish(recordChannel(model, id), 'record.changed', { model, id, op, write_date: dates.get(id) ?? null }, {
      record: [model, id], ...(op === 'unlink' ? { unlink: true } : {}),
    });
  }
  const rest = ids.slice(max);
  if (rest.length) await bus.publish(rest.map((id) => recordChannel(model, id)), 'record.reset', { model, op }, { model });
}

/** mail.message created: its document's channel and the partner channels of followers / recipients. */
async function messageEvents(env: EnvImpl, ids: readonly number[]): Promise<void> {
  const su = env.sudo();
  const rows = await su.model('mail.message').browse([...ids]).read(['model', 'res_id', 'subtype_id', 'partner_ids']);
  const bus = new BusService(env);
  for (const row of rows) {
    const model = row.model as string;
    const resId = row.res_id as number;
    if (typeof model !== 'string' || !Number.isSafeInteger(resId) || resId <= 0 || !env.registry.models.has(model)) continue;
    const subtype = typeof row.subtype_id === 'number' ? row.subtype_id : null;
    const [st] = subtype ? await su.model('mail.message.subtype').browse(subtype).read(['internal']) : [];
    const followers = await su.model('mail.followers').searchRead(
      [['res_model', '=', model], ['res_id', '=', resId]], ['partner_id', 'subtype_ids'], { limit: MAX_FOLLOWER_CHANNELS },
    );
    const partners = new Set<number>((row.partner_ids as number[] | undefined) ?? []);
    for (const f of followers) {
      if (typeof f.partner_id === 'number' && (subtype === null || ((f.subtype_ids as number[]) ?? []).includes(subtype))) partners.add(f.partner_id);
    }
    const channels = [recordChannel(model, resId), ...[...partners].slice(0, MAX_FOLLOWER_CHANNELS).map(partnerChannel)];
    await bus.publish(channels, 'mail.message.posted', { message_id: row.id, model, res_id: resId, subtype_id: subtype }, {
      record: [model, resId], internal: !!st?.internal,
    });
  }
}

/** mail.activity created: the assignee's user channel. */
async function activityEvents(env: EnvImpl, ids: readonly number[], type: 'mail.activity.scheduled'): Promise<void> {
  const rows = await env.sudo().model('mail.activity').browse([...ids]).read(['res_model', 'res_id', 'user_id']);
  const bus = new BusService(env);
  for (const row of rows) {
    if (typeof row.user_id !== 'number' || typeof row.res_model !== 'string' || typeof row.res_id !== 'number') continue;
    await bus.publish(userChannel(row.user_id), type, { activity_id: row.id, model: row.res_model, res_id: row.res_id }, {
      record: [row.res_model, row.res_id],
    });
  }
}

const previous = recordHooks();
if (!previous) throw new Error('Automation, config and mail record hooks must be installed before the bus hooks');

/**
 * Bus record hooks, chained after the mail hooks. Events are published inside the ORM transaction
 * (NOTIFY is transactional), so they reach subscribers only if the operation commits.
 */
setRecordHooks({
  afterCreate: async (env, model, ids) => {
    await previous.afterCreate(env, model, ids);
    if (model === 'mail.message') await messageEvents(env, ids);
    else if (model === 'mail.activity') await activityEvents(env, ids, 'mail.activity.scheduled');
    await recordEvents(env, model, ids, 'create');
  },
  beforeWrite: (env, model, ids, vals) => previous.beforeWrite(env, model, ids, vals),
  afterWrite: async (env, model, ids, vals, state) => {
    await previous.afterWrite(env, model, ids, vals, state);
    await recordEvents(env, model, ids, 'write');
  },
  beforeUnlink: async (env, model, ids) => {
    await previous.beforeUnlink(env, model, ids);
    await recordEvents(env, model, ids, 'unlink');
  },
});

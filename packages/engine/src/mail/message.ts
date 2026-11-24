import { AccessError, ValidationError, type Env } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { positiveInt, requireModel, tenantDriver } from '../services/common.js';
import { htmlText, sanitizeHtml } from './sanitize.js';

/**
 * Internal mail primitives shared by the thread service, the tracking hooks and the legacy
 * post_message path. Nothing here checks document access: callers do (see thread.ts).
 */

export const MAX_BODY = 200_000;
export const MAX_SUBJECT = 1_000;
export const MESSAGE_TYPES = ['comment', 'notification', 'email'] as const;
export type MessageType = typeof MESSAGE_TYPES[number];

/** The mail module is installed in the env's registry. */
export function mailInstalled(env: Env): boolean {
  return (env as EnvImpl).registry.models.has('mail.message');
}

/** The model inherits `mixin` (directly or through another model's `extends`). */
export function inherits(env: Env, model: string, mixin: string, seen = new Set<string>()): boolean {
  const registry = (env as EnvImpl).registry;
  if (seen.has(model) || !registry.models.has(model)) return false;
  seen.add(model);
  for (const parent of registry.get(model).def.extends ?? []) {
    if (parent === mixin) return true;
    if (parent !== model && inherits(env, parent, mixin, seen)) return true;
  }
  return false;
}

export function isThread(env: Env, model: string): boolean {
  return mailInstalled(env) && inherits(env, model, 'mail.thread');
}

/** The current user's partner (null for the superuser / users without a partner). */
export async function userPartner(env: Env, uid = env.uid): Promise<number | null> {
  const users = env.sudo().withContext({ activeTest: false }).model('res.users');
  if (!(await users.search([['id', '=', uid]])).ids.length) return null;
  const [row] = await users.browse(uid).read(['partner_id']);
  return typeof row?.partner_id === 'number' ? row.partner_id : null;
}

/** Resolve a subtype by id or external id (`mail.mt_note`, or `mt_note` within the mail module). */
export async function resolveSubtype(env: Env, ref: number | string | undefined, fallback = 'mail.mt_comment'): Promise<number> {
  const value = ref ?? fallback;
  if (typeof value === 'number') {
    positiveInt(value, 'subtype id');
    if (!(await env.sudo().model('mail.message.subtype').search([['id', '=', value]])).ids.length) throw new ValidationError('Unknown message subtype');
    return value;
  }
  return xmlRef(env, value.includes('.') ? value : `mail.${value}`, 'mail.message.subtype');
}

export async function xmlRef(env: Env, xmlId: string, model: string): Promise<number> {
  const [module, ...rest] = xmlId.split('.');
  const name = rest.join('.');
  if (!module || !name) throw new ValidationError(`Invalid external id '${xmlId}'`);
  const [row] = await tenantDriver(env).query<{ res_id: number | string }>({
    text: `SELECT res_id FROM nx_model_data WHERE module=$1 AND name=$2 AND model=$3`, params: [module, name, model],
  });
  if (!row) throw new ValidationError(`Unknown ${model} '${xmlId}'`);
  return Number(row.res_id);
}

export interface NewMessage {
  model: string;
  resId: number;
  /** Untrusted HTML: always sanitized here. */
  body: string;
  subject?: string | null;
  messageType?: MessageType;
  subtypeId: number;
  authorId?: number | null;
  partnerIds?: number[];
  attachmentIds?: number[];
  emailTo?: string | null;
  tracking?: TrackingValue[];
}

export interface TrackingValue {
  field: string; field_desc: string; field_type: string;
  old_value_char?: string | null; new_value_char?: string | null;
  old_value_integer?: number | null; new_value_integer?: number | null;
  old_value_float?: number | null; new_value_float?: number | null;
  old_value_datetime?: string | null; new_value_datetime?: string | null;
}

/** Validate ids of partners the caller can read (recipients / followers). */
export async function readablePartners(env: Env, ids: unknown): Promise<number[]> {
  if (ids === undefined || ids === null) return [];
  if (!Array.isArray(ids) || ids.length > 500) throw new ValidationError('Partner ids must be a list of at most 500 ids');
  const list = [...new Set(ids.map((id) => positiveInt(id as number, 'partner id')))];
  if (!list.length) return [];
  const visible = await env.model('res.partner').browse(list).read(['id']);
  if (visible.length !== list.length) throw new AccessError('Partner is unavailable');
  return list;
}

/** Attachments must already belong to the same document (nx_attachment rows). */
export async function documentAttachments(env: Env, model: string, resId: number, ids: unknown): Promise<number[]> {
  if (ids === undefined || ids === null) return [];
  if (!Array.isArray(ids) || ids.length > 100) throw new ValidationError('Attachment ids must be a list of at most 100 ids');
  const list = [...new Set(ids.map((id) => positiveInt(id as number, 'attachment id')))];
  if (!list.length) return [];
  const [table] = await tenantDriver(env).query<{ ok: boolean }>({ text: `SELECT to_regclass('nx_attachment') IS NOT NULL AS ok`, params: [] });
  const rows = table?.ok ? await tenantDriver(env).query<{ id: number | string }>({
    text: `SELECT id FROM nx_attachment WHERE id = ANY($1) AND model=$2 AND record_id=$3`, params: [list, model, resId],
  }) : [];
  if (rows.length !== list.length) throw new ValidationError('Attachments must belong to the same document');
  return list;
}

/** Create a message (and its tracking values) with superuser rights. Returns the message id. */
export async function createMessage(env: Env, msg: NewMessage): Promise<number> {
  requireModel(msg.model);
  positiveInt(msg.resId, 'record id');
  if (typeof msg.body !== 'string' || msg.body.length > MAX_BODY) throw new ValidationError('Message body is too long');
  const body = sanitizeHtml(msg.body);
  const subject = msg.subject === undefined || msg.subject === null ? null : String(msg.subject).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_SUBJECT);
  const type = msg.messageType ?? 'comment';
  if (!MESSAGE_TYPES.includes(type)) throw new ValidationError('Invalid message type');
  if (!msg.tracking?.length && !htmlText(body) && !msg.attachmentIds?.length && !subject) throw new ValidationError('Message cannot be empty');
  const su = env.sudo();
  const authorId = msg.authorId === undefined ? await userPartner(env) : msg.authorId;
  const created = await su.model('mail.message').create({
    model: msg.model, res_id: msg.resId, body, subject, message_type: type, subtype_id: msg.subtypeId,
    author_id: authorId, partner_ids: msg.partnerIds?.length ? [{ op: 'set', ids: msg.partnerIds }] : [],
    attachment_ids: msg.attachmentIds ?? [], email_to: msg.emailTo ? String(msg.emailTo).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 2000) || null : null, date: new Date(),
  });
  const id = created.ids[0]!;
  if (msg.tracking?.length) await su.model('mail.tracking.value').create(msg.tracking.map((t) => ({ ...t, message_id: id })));
  return id;
}

/** Add followers (idempotent). Subtypes default to the subtypes flagged `default`. */
export async function addFollowers(env: Env, model: string, resId: number, partnerIds: number[], subtypeIds?: number[]): Promise<void> {
  if (!partnerIds.length) return;
  const su = env.sudo();
  const subtypes = subtypeIds ?? (await su.model('mail.message.subtype').search([['default', '=', true]])).ids;
  const existing = await su.model('mail.followers').searchRead(
    [['res_model', '=', model], ['res_id', '=', resId], ['partner_id', 'in', partnerIds]], ['partner_id'],
  );
  const have = new Map(existing.map((row) => [row.partner_id as number, row.id as number]));
  for (const partner of partnerIds) {
    const id = have.get(partner);
    if (id !== undefined) {
      if (subtypeIds) await su.model('mail.followers').browse(id).write({ subtype_ids: [{ op: 'set', ids: subtypes }] });
      continue;
    }
    await su.model('mail.followers').create({
      res_model: model, res_id: resId, partner_id: partner, subtype_ids: [{ op: 'set', ids: [...subtypes] }],
    });
  }
}

/** Remove everything mail attaches to deleted documents (raw SQL: hooks of these tables do not apply). */
export async function purgeDocuments(env: Env, model: string, ids: readonly number[]): Promise<void> {
  if (!ids.length) return;
  const db = tenantDriver(env);
  for (const table of ['mail_message', 'mail_followers', 'mail_activity']) {
    const column = table === 'mail_message' ? 'model' : 'res_model';
    await db.query({ text: `DELETE FROM "${table}" WHERE "${column}"=$1 AND res_id = ANY($2)`, params: [model, [...ids]] });
  }
}

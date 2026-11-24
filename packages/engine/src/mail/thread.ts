import { ValidationError, type Env } from '../contracts/index.js';
import { hiddenFields } from '../security/access.js';
import type { EnvImpl } from '../orm/env.js';
import { assertReadable, assertWritable, nonNegativeInt, positiveInt, requireModel } from '../services/common.js';
import {
  addFollowers, createMessage, documentAttachments, mailInstalled, readablePartners, resolveSubtype, userPartner, type MessageType,
} from './message.js';
import { escapeHtml } from './sanitize.js';

export interface MessagePostOptions {
  /** HTML body; sanitized (allow-list) before storage. */
  body?: string;
  subject?: string;
  /** Subtype id or external id (default `mail.mt_comment`; `mail.mt_note` for internal notes). */
  subtype?: number | string;
  messageType?: Extract<MessageType, 'comment' | 'notification'>;
  /** Recipients (res.partner ids readable by the caller). */
  partnerIds?: number[];
  /** nx_attachment ids already attached to the same document. */
  attachmentIds?: number[];
}

export interface MessageRow {
  id: number; date: unknown; model: string; res_id: number; body: string; subject: string | null; message_type: string;
  subtype_id: number | null; subtype: string | null; internal: boolean; author_id: number | null; author: string | null;
  partner_ids: number[]; attachment_ids: number[]; tracking: Record<string, unknown>[];
}

export interface FollowerRow { id: number; partner_id: number; partner: string | null; subtype_ids: number[] }

function requireMail(env: Env): void {
  if (!mailInstalled(env)) throw new ValidationError('The mail module is not installed');
}

/**
 * Chatter of any document (Odoo mail.thread concepts). Access always follows the DOCUMENT:
 * reading messages/followers needs read access to it (ACL + record rules), posting and managing
 * other followers needs write access. Mail records themselves are only writable through here.
 */
export class MailThreadService {
  constructor(private readonly env: Env) {}

  async post(model: string, resId: number, options: MessagePostOptions): Promise<number> {
    requireMail(this.env);
    requireModel(model);
    positiveInt(resId, 'record id');
    if (!options || typeof options !== 'object') throw new ValidationError('Invalid message');
    if (options.messageType !== undefined && !['comment', 'notification'].includes(options.messageType)) throw new ValidationError('Invalid message type');
    await assertWritable(this.env, model, resId);
    const partnerIds = await readablePartners(this.env, options.partnerIds);
    const attachmentIds = await documentAttachments(this.env, model, resId, options.attachmentIds);
    const subtypeId = await resolveSubtype(this.env, options.subtype);
    const id = await createMessage(this.env, {
      model, resId, body: options.body ?? '', subject: options.subject ?? null, messageType: options.messageType ?? 'comment',
      subtypeId, partnerIds, attachmentIds,
    });
    // Odoo semantics: the author follows the document they wrote on
    const author = await userPartner(this.env);
    if (author !== null) await addFollowers(this.env, model, resId, [author]);
    return id;
  }

  /** Plain-text convenience: escaped into a paragraph. */
  async postText(model: string, resId: number, text: string, options: Omit<MessagePostOptions, 'body'> = {}): Promise<number> {
    if (typeof text !== 'string') throw new ValidationError('Message must be text');
    return this.post(model, resId, { ...options, body: `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>` });
  }

  /**
   * Messages of a document, newest first, with tracking values. Internal subtypes (notes) are NOT
   * filtered: every user is internal today; filter on `internal` once portal users exist.
   * Tracking values keep related display names read with superuser rights at write time (Odoo parity).
   */
  async messages(model: string, resId: number, opts: { limit?: number; offset?: number } = {}): Promise<MessageRow[]> {
    requireMail(this.env);
    requireModel(model);
    positiveInt(resId, 'record id');
    const limit = Math.min(nonNegativeInt(opts.limit ?? 100, 'limit'), 1000);
    const offset = nonNegativeInt(opts.offset ?? 0, 'offset');
    await assertReadable(this.env, model, resId);
    const su = this.env.sudo();
    const rows = await su.model('mail.message').searchRead(
      [['model', '=', model], ['res_id', '=', resId]],
      ['date', 'model', 'res_id', 'body', 'subject', 'message_type', 'subtype_id', 'author_id', 'partner_ids', 'attachment_ids', 'tracking_value_ids'],
      { limit, offset, order: 'date desc, id desc' },
    );
    const subtypeIds = [...new Set(rows.map((r) => r.subtype_id).filter((v): v is number => typeof v === 'number'))];
    const subtypes = new Map((subtypeIds.length ? await su.model('mail.message.subtype').browse(subtypeIds).read(['name', 'internal']) : [])
      .map((s) => [s.id as number, s]));
    const authorIds = [...new Set(rows.map((r) => r.author_id).filter((v): v is number => typeof v === 'number'))];
    const authors = new Map((authorIds.length ? await su.withContext({ activeTest: false }).model('res.partner').browse(authorIds).read(['display_name']) : [])
      .map((p) => [p.id as number, p.display_name as string]));
    const trackingIds = rows.flatMap((r) => (r.tracking_value_ids as number[]) ?? []);
    const tracking = trackingIds.length ? await su.model('mail.tracking.value').browse(trackingIds).read([
      'message_id', 'field', 'field_desc', 'field_type', 'old_value_char', 'new_value_char', 'old_value_integer', 'new_value_integer',
      'old_value_float', 'new_value_float', 'old_value_datetime', 'new_value_datetime',
    ]) : [];
    // tracked fields the caller may not read (field groups) are dropped from the tracking values
    const hidden = await hiddenFields(this.env as EnvImpl, model);
    return rows.map((r) => {
      const subtype = typeof r.subtype_id === 'number' ? subtypes.get(r.subtype_id) : undefined;
      return {
        id: r.id as number, date: r.date, model: r.model as string, res_id: r.res_id as number, body: (r.body as string) ?? '',
        subject: (r.subject as string | null) ?? null, message_type: r.message_type as string,
        subtype_id: (r.subtype_id as number | null) ?? null, subtype: (subtype?.name as string | undefined) ?? null, internal: !!subtype?.internal,
        author_id: (r.author_id as number | null) ?? null, author: typeof r.author_id === 'number' ? authors.get(r.author_id) ?? null : null,
        partner_ids: (r.partner_ids as number[]) ?? [], attachment_ids: Array.isArray(r.attachment_ids) ? r.attachment_ids as number[] : [],
        tracking: tracking.filter((t) => t.message_id === r.id && !hidden.has(t.field as string)),
      };
    });
  }

  async followers(model: string, resId: number): Promise<FollowerRow[]> {
    requireMail(this.env);
    requireModel(model);
    positiveInt(resId, 'record id');
    await assertReadable(this.env, model, resId);
    const su = this.env.sudo();
    const rows = await su.model('mail.followers').searchRead([['res_model', '=', model], ['res_id', '=', resId]], ['partner_id', 'subtype_ids']);
    const names = new Map((rows.length ? await su.withContext({ activeTest: false }).model('res.partner')
      .browse(rows.map((r) => r.partner_id as number)).read(['display_name']) : []).map((p) => [p.id as number, p.display_name as string]));
    return rows.map((r) => ({
      id: r.id as number, partner_id: r.partner_id as number, partner: names.get(r.partner_id as number) ?? null, subtype_ids: (r.subtype_ids as number[]) ?? [],
    }));
  }

  /**
   * Follow a document. Subscribing only yourself needs read access to it (Odoo semantics);
   * subscribing anyone else needs write access.
   */
  async subscribe(model: string, resId: number, partnerIds?: number[], subtypes?: (number | string)[]): Promise<void> {
    const { list } = await this.followerChange(model, resId, partnerIds);
    let subtypeIds: number[] | undefined;
    if (subtypes !== undefined) {
      if (!Array.isArray(subtypes) || subtypes.length > 50) throw new ValidationError('Subtypes must be a list');
      subtypeIds = [];
      for (const s of subtypes) subtypeIds.push(await resolveSubtype(this.env, s));
    }
    await addFollowers(this.env, model, resId, list, subtypeIds);
  }

  async unsubscribe(model: string, resId: number, partnerIds?: number[]): Promise<void> {
    const { list } = await this.followerChange(model, resId, partnerIds);
    if (!list.length) return;
    const su = this.env.sudo().model('mail.followers');
    const found = await su.search([['res_model', '=', model], ['res_id', '=', resId], ['partner_id', 'in', list]]);
    await found.unlink();
  }

  private async followerChange(model: string, resId: number, partnerIds?: number[]): Promise<{ list: number[] }> {
    requireMail(this.env);
    requireModel(model);
    positiveInt(resId, 'record id');
    const self = await userPartner(this.env);
    if (partnerIds === undefined) {
      if (self === null) throw new ValidationError('The current user has no partner');
      await assertReadable(this.env, model, resId);
      return { list: [self] };
    }
    if (!Array.isArray(partnerIds)) throw new ValidationError('Partner ids must be a list');
    const onlySelf = partnerIds.length > 0 && partnerIds.every((id) => id === self);
    if (onlySelf) await assertReadable(this.env, model, resId);
    else await assertWritable(this.env, model, resId);
    return { list: await readablePartners(this.env, partnerIds) };
  }
}


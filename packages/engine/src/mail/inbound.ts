import { AccessError, ValidationError, type Env } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { userSecurity } from '../security/access.js';
import { assertWritable, positiveInt, requireModel, tenantDriver } from '../services/common.js';
import { createMessage, isThread, mailInstalled, resolveSubtype } from './message.js';
import { escapeHtml } from './sanitize.js';

const MAX_ALIAS = 254;
const MAX_MESSAGE_ID = 254;
const MAX_FROM = 320;
const MAX_SUBJECT = 1_000;
const MAX_TEXT = 45_000;
const EMAIL_LOCAL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/i;
const EMAIL_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export interface MailAliasInput {
  alias: string;
  model: string;
  recordId: number;
}

export interface InboundMailInput {
  /** Envelope recipient from a trusted mail provider or parser. */
  alias: string;
  /** Stable Message-ID from the parsed message. */
  messageId: string;
  /** Untrusted sender label/address, never used to authorize delivery. */
  from: string;
  subject?: string | null;
  text: string;
}

interface AliasRow {
  alias: string;
  model: string;
  record_id: number;
  created_by: number;
  record_created_at: string;
}

interface ReceiptRow {
  id: number;
  model: string;
  record_id: number;
  record_created_at: string;
}

/** Tenant-local exact-address routing for inbound messages. */
export class MailAliasService {
  private readonly db: ReturnType<typeof tenantDriver>;

  constructor(private readonly env: Env) {
    this.db = tenantDriver(env);
  }

  async define(input: MailAliasInput): Promise<void> {
    await this.requireAdmin();
    this.requireMail();
    const alias = canonicalAlias(input.alias);
    requireModel(input.model);
    positiveInt(input.recordId, 'record id');
    const model = (this.env as EnvImpl).registry.models.get(input.model);
    if (!model?.table || model.def.transient || !isThread(this.env, input.model)) {
      throw new ValidationError('Inbound aliases need an existing mail thread');
    }
    await assertWritable(this.env, input.model, input.recordId);
    const [record] = await this.env.model(input.model).browse(input.recordId).read(['create_date']);
    if (!(record?.create_date instanceof Date)) throw new ValidationError('Inbound aliases need an existing document');
    const recordCreatedAt = record.create_date.toISOString();
    await this.ensureTables();
    await this.db.transaction(async (tx) => {
      await lockAlias(tx, alias);
      await tx.query({
        text: `INSERT INTO nx_mail_alias (alias, model, record_id, created_by, record_created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (alias) DO UPDATE SET model = EXCLUDED.model, record_id = EXCLUDED.record_id,
            created_by = EXCLUDED.created_by, record_created_at = EXCLUDED.record_created_at`,
        params: [alias, input.model, input.recordId, this.env.uid, recordCreatedAt],
      });
    });
  }

  async remove(aliasValue: string): Promise<boolean> {
    await this.requireAdmin();
    this.requireMail();
    const alias = canonicalAlias(aliasValue);
    await this.ensureTables();
    const rows = await this.db.transaction((tx) => {
      return lockAlias(tx, alias).then(() => tx.query<{ alias: string }>({
        text: 'DELETE FROM nx_mail_alias WHERE alias = $1 RETURNING alias',
        params: [alias],
      }));
    });
    return rows.length > 0;
  }

  async route(input: InboundMailInput): Promise<{ id: number; duplicate: boolean }> {
    await this.requireAdmin();
    this.requireMail();
    const alias = canonicalAlias(input.alias);
    const messageId = validateMessageId(input.messageId);
    const from = validateFrom(input.from);
    const subject = validateSubject(input.subject);
    if (typeof input.text !== 'string' || input.text.length > MAX_TEXT) throw new ValidationError('Inbound message is too large');
    await this.ensureTables();

    return this.env.transaction(async (tx) => {
      const driver = tenantDriver(tx);
      await lockAlias(driver, alias);
      const [mapping] = await driver.query<AliasRow>({
        text: 'SELECT alias, model, record_id, created_by, record_created_at FROM nx_mail_alias WHERE alias = $1',
        params: [alias],
      });
      if (!mapping) throw new ValidationError('Inbound alias is unavailable');
      const model = (tx as EnvImpl).registry.models.get(mapping.model);
      if (!model?.table || model.def.transient || !isThread(tx, mapping.model)) {
        throw new ValidationError('Inbound alias is unavailable');
      }

      // Re-check the mapped document under the current authenticated service user.
      await assertWritable(tx, mapping.model, mapping.record_id);
      const [record] = await tx.model(mapping.model).browse(mapping.record_id).read(['create_date']);
      if (!(record?.create_date instanceof Date) || record.create_date.toISOString() !== mapping.record_created_at) {
        throw new ValidationError('Inbound alias is unavailable');
      }
      const [existing] = await driver.query<ReceiptRow>({
        text: 'SELECT message_id AS id, model, record_id, record_created_at FROM nx_mail_inbound_receipt WHERE alias = $1 AND message_key = $2',
        params: [alias, messageId],
      });
      if (existing) {
        if (existing.model !== mapping.model || existing.record_id !== mapping.record_id ||
            existing.record_created_at !== mapping.record_created_at) {
          throw new ValidationError('Inbound alias is unavailable');
        }
        return { id: existing.id, duplicate: true };
      }

      const subtypeId = await resolveSubtype(tx, 'mail.mt_note');
      const body = `<p>From: ${escapeHtml(from)}</p>${input.text.length ? `<p>${escapeHtml(input.text).replace(/\r?\n/g, '<br>')}</p>` : ''}`;
      const id = await createMessage(tx, {
        model: mapping.model,
        resId: mapping.record_id,
        body,
        subject: subject ? `Inbound email: ${subject}` : 'Inbound email',
        messageType: 'email',
        subtypeId,
        authorId: null,
      });
      const [receipt] = await driver.query<ReceiptRow>({
        text: `INSERT INTO nx_mail_inbound_receipt (alias, message_key, message_id, model, record_id, record_created_at)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING message_id AS id`,
        params: [alias, messageId, id, mapping.model, mapping.record_id, mapping.record_created_at],
      });
      if (!receipt) throw new Error('Inbound receipt insert returned no row');
      return { id, duplicate: false };
    });
  }

  private requireMail(): void {
    if (!mailInstalled(this.env)) throw new ValidationError('The mail module is not installed');
  }

  private async requireAdmin(): Promise<void> {
    if (this.env.su) return;
    const security = await userSecurity(this.env as EnvImpl);
    if (!security.groups.has('base.group_system')) throw new AccessError('Only settings administrators can manage mail aliases');
  }

  private async ensureTables(): Promise<void> {
    const check = async (db: ReturnType<typeof tenantDriver>) => {
      const [row] = await db.query<{ alias_table: boolean; receipt_table: boolean }>({
        text: "SELECT to_regclass('nx_mail_alias') IS NOT NULL AS alias_table, to_regclass('nx_mail_inbound_receipt') IS NOT NULL AS receipt_table",
        params: [],
      });
      return !!row?.alias_table && !!row.receipt_table;
    };
    if (await check(this.db)) return;
    await this.db.transaction(async (tx) => {
      await tx.query({
        text: "SELECT pg_advisory_xact_lock(hashtext('nx.mail.inbound.schema'), hashtext('nx_mail_alias'))",
        params: [],
      });
      await tx.query({
        text: `CREATE TABLE IF NOT EXISTS nx_mail_alias (
          alias TEXT PRIMARY KEY,
          model TEXT NOT NULL,
          record_id INTEGER NOT NULL CHECK (record_id > 0),
          created_by INTEGER NOT NULL CHECK (created_by > 0),
          record_created_at TEXT NOT NULL
        )`,
        params: [],
      });
      await tx.query({
        text: `CREATE TABLE IF NOT EXISTS nx_mail_inbound_receipt (
          alias TEXT NOT NULL,
          message_key TEXT NOT NULL,
          message_id INTEGER NOT NULL,
          model TEXT NOT NULL,
          record_id INTEGER NOT NULL CHECK (record_id > 0),
          record_created_at TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (alias, message_key)
        )`,
        params: [],
      });
    });
    if (!(await check(this.db))) throw new Error('Mail alias tables were not initialized');
  }
}

async function lockAlias(db: ReturnType<typeof tenantDriver>, alias: string): Promise<void> {
  await db.query({
    text: "SELECT pg_advisory_xact_lock(hashtext('nx.mail.inbound'), hashtext($1::text))",
    params: [alias],
  });
}

function canonicalAlias(value: string): string {
  if (typeof value !== 'string') throw new ValidationError('Invalid inbound alias');
  const alias = value.trim().toLowerCase();
  if (alias.length > MAX_ALIAS || alias.length < 6) throw new ValidationError('Invalid inbound alias');
  const parts = alias.split('@');
  if (parts.length !== 2) throw new ValidationError('Invalid inbound alias');
  const [local, domain] = parts;
  if (!local || !EMAIL_LOCAL.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    throw new ValidationError('Invalid inbound alias');
  }
  const labels = domain!.split('.');
  if (labels.length < 2 || labels.some((label) => !EMAIL_LABEL.test(label))) throw new ValidationError('Invalid inbound alias');
  return alias;
}

function validateMessageId(value: string): string {
  if (typeof value !== 'string' || value.length > MAX_MESSAGE_ID || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ValidationError('Invalid inbound message id');
  }
  return value.trim();
}

function validateFrom(value: string): string {
  if (typeof value !== 'string' || value.length > MAX_FROM || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ValidationError('Invalid inbound sender');
  }
  return value.trim();
}

function validateSubject(value: string | null | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > MAX_SUBJECT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new ValidationError('Invalid inbound subject');
  }
  return value.trim();
}

import { randomUUID } from 'node:crypto';
import { ValidationError, type Env, type SqlDriver } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { assertSystem } from '../services/common.js';
import { mailInstalled } from './message.js';

const MAX_RECIPIENTS = 100;
const MAX_SUBJECT = 1000;
const MAX_BODY = 500_000;
const MAX_ATTEMPTS = 5;
const MAX_BATCH = 20;
const LEASE_SECONDS = 300;

export interface OutgoingMailInput {
  messageId: number;
  recipients: readonly string[];
  subject: string;
  bodyHtml: string;
}

export interface MailDelivery {
  messageId: string;
  recipients: [string];
  subject: string;
  bodyHtml: string;
}

export interface MailTransport {
  deliver(mail: MailDelivery): Promise<void>;
}

export type OutgoingMailState = 'pending' | 'sending' | 'sent' | 'failed';

interface QueueRow {
  id: number | string;
  messageId: string;
  recipient: string;
  subject: string;
  bodyHtml: string;
  attempts: number;
  state: OutgoingMailState;
  lease_token: string;
}

interface ClaimResult {
  jobs: QueueRow[];
  exhausted: number;
}

/**
 * Queue a message in the caller's transaction. The mail message itself remains the source of truth,
 * and a unique message_id makes hooks and retries safe to call more than once.
 */
export async function enqueueOutgoingMail(env: Env, input: OutgoingMailInput): Promise<number[]> {
  if (!mailInstalled(env)) throw new ValidationError('The mail module is not installed');
  validateInput(input);
  const db = driver(env);
  await ensureQueue(db);
  const recipients = [...new Set(input.recipients.map((value) => {
    const address = value.trim();
    const at = address.indexOf('@');
    return address.slice(0, at + 1) + address.slice(at + 1).toLowerCase();
  }))];
  const ids: number[] = [];
  for (const recipient of recipients) {
    const rows = await db.query<{ id: number | string }>({
      text: `INSERT INTO nx_mail_outgoing
        (message_id, recipient_key, stable_id, recipient, subject, body_html, state, attempts, next_attempt_at)
        VALUES ($1, $2, $3, $2, $4, $5, 'pending', 0, now())
        ON CONFLICT (message_id, recipient_key) DO UPDATE SET message_id = EXCLUDED.message_id
        RETURNING id`,
      params: [input.messageId, recipient, `<${randomUUID()}@nexa.local>`, input.subject, input.bodyHtml],
    });
    if (!rows[0]) throw new Error('Outgoing mail queue insert returned no row');
    ids.push(Number(rows[0].id));
  }
  return ids;
}

/** Processes a bounded batch, releasing database locks before calling the external transport. */
export class MailQueueService {
  constructor(private readonly env: Env, private readonly transport: MailTransport) {}

  async process(limit = 5): Promise<{ sent: number; deferred: number; failed: number }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) {
      throw new ValidationError(`Mail queue batch must be between 1 and ${MAX_BATCH}`);
    }
    if ((driver(this.env) as SqlDriver & { inTransaction?: boolean }).inTransaction) {
      throw new ValidationError('Outgoing mail must be processed outside a database transaction');
    }
    if (!mailInstalled(this.env)) throw new ValidationError('The mail module is not installed');
    await assertSystem(this.env);
    const db = driver(this.env);
    await ensureQueue(db);
    let sent = 0;
    let deferred = 0;
    let failed = 0;
    for (let index = 0; index < limit; index++) {
      const claim = await this.claim(db);
      failed += claim.exhausted;
      const [job] = claim.jobs;
      if (!job) break;
      try {
        await this.transport.deliver({
          messageId: job.messageId,
          recipients: [job.recipient],
          subject: job.subject,
          bodyHtml: job.bodyHtml,
        });
      } catch {
        const final = job.attempts >= MAX_ATTEMPTS;
        await db.query({
          text: `UPDATE nx_mail_outgoing SET state = $3, next_attempt_at = CASE WHEN $3 = 'pending'
                THEN now() + (LEAST(3600, 30 * power(2, GREATEST(0, attempts - 1))) * interval '1 second')
                ELSE next_attempt_at END,
              lease_token = NULL, lease_until = NULL, last_error = 'delivery_failed'
            WHERE id = $1 AND state = 'sending' AND lease_token = $2 RETURNING id`,
          params: [job.id, job.lease_token, final ? 'failed' : 'pending'],
        });
        if (final) failed++;
        else deferred++;
        continue;
      }
      const completed = await db.query<{ id: number }>({
          text: `UPDATE nx_mail_outgoing SET state = 'sent', sent_at = now(), lease_token = NULL,
              lease_until = NULL, last_error = NULL
            WHERE id = $1 AND state = 'sending' AND lease_token = $2 RETURNING id`,
          params: [job.id, job.lease_token],
        });
      if (completed.length) sent++;
      else deferred++;
    }
    return { sent, deferred, failed };
  }

  private async claim(db: SqlDriver): Promise<ClaimResult> {
    return db.transaction(async (tx) => {
      const exhausted = await tx.query<{ id: number }>({
        text: `UPDATE nx_mail_outgoing SET state = 'failed', lease_token = NULL, lease_until = NULL,
            last_error = 'delivery_failed'
          WHERE state = 'sending' AND lease_until <= now() AND attempts >= $1 RETURNING id`,
        params: [MAX_ATTEMPTS],
      });
      const rows = await tx.query<QueueRow>({
          text: `WITH candidates AS (
            SELECT id FROM nx_mail_outgoing
            WHERE (state = 'pending' AND next_attempt_at <= now())
              OR (state = 'sending' AND lease_until <= now() AND attempts < $1)
            ORDER BY next_attempt_at, id
          LIMIT 1 FOR UPDATE SKIP LOCKED
          )
          UPDATE nx_mail_outgoing AS q SET state = 'sending', attempts = q.attempts + 1,
            lease_token = gen_random_uuid()::text, lease_until = now() + ($2 * interval '1 second')
          FROM candidates c WHERE q.id = c.id
          RETURNING q.id, q.stable_id AS "messageId", q.recipient, q.subject, q.body_html AS "bodyHtml",
            q.attempts, q.state, q.lease_token`,
        params: [MAX_ATTEMPTS, LEASE_SECONDS],
      });
      return {
        jobs: rows.map((row) => ({ ...row, id: typeof row.id === 'string' ? Number(row.id) : row.id })),
        exhausted: exhausted.length,
      };
    });
  }
}

function driver(env: Env): SqlDriver {
  return (env as EnvImpl).db;
}

function validateInput(input: OutgoingMailInput): void {
  if (!input || !Number.isSafeInteger(input.messageId) || input.messageId <= 0) throw new ValidationError('Invalid outgoing mail message');
  if (!Array.isArray(input.recipients) || input.recipients.length < 1 || input.recipients.length > MAX_RECIPIENTS) {
    throw new ValidationError(`Outgoing mail must have 1 to ${MAX_RECIPIENTS} recipients`);
  }
  const address = /^[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
  if (!input.recipients.every((recipient) => typeof recipient === 'string' && recipient.trim().length <= 320 && address.test(recipient.trim()))) {
    throw new ValidationError('Invalid outgoing mail recipient');
  }
  if (typeof input.subject !== 'string' || input.subject.length > MAX_SUBJECT || /[\r\n\u0000]/.test(input.subject)) {
    throw new ValidationError('Invalid outgoing mail subject');
  }
  if (typeof input.bodyHtml !== 'string' || Buffer.byteLength(input.bodyHtml, 'utf8') > MAX_BODY) {
    throw new ValidationError('Outgoing mail body is too large');
  }
}

async function ensureQueue(db: SqlDriver): Promise<void> {
  const [probe] = await db.query<{ ready: boolean }>({
    text: `SELECT to_regclass('nx_mail_outgoing') IS NOT NULL AS ready`, params: [],
  });
  if (probe?.ready) return;
  await db.transaction(async (tx) => {
    await tx.query({ text: `SELECT pg_advisory_xact_lock(hashtext('nx.mail.outgoing.schema'))`, params: [] });
    const [lockedProbe] = await tx.query<{ ready: boolean }>({
      text: `SELECT to_regclass('nx_mail_outgoing') IS NOT NULL AS ready`, params: [],
    });
    if (lockedProbe?.ready) return;
      await tx.query({
        text: `CREATE TABLE IF NOT EXISTS nx_mail_outgoing (
          id BIGSERIAL PRIMARY KEY,
          message_id INTEGER NOT NULL REFERENCES mail_message(id) ON DELETE CASCADE,
          recipient_key TEXT NOT NULL,
          recipient TEXT NOT NULL,
          stable_id TEXT NOT NULL UNIQUE,
          subject TEXT NOT NULL,
          body_html TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'sent', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
          next_attempt_at TIMESTAMPTZ NOT NULL,
          lease_token TEXT,
          lease_until TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          sent_at TIMESTAMPTZ,
          last_error TEXT,
          UNIQUE (message_id, recipient_key)
        )`,
        params: [],
      });
      await tx.query({ text: `CREATE INDEX IF NOT EXISTS nx_mail_outgoing_ready_idx ON nx_mail_outgoing (state, next_attempt_at, id)`, params: [] });
  });
}

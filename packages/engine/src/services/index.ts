import { AccessError, ValidationError, type Env, type SqlDriver } from '../contracts/index.js';
import { checkRecordRules, userSecurity } from '../security/access.js';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const IDENTIFIER = /^[a-z][a-z0-9_.-]{0,127}$/;

/** Creates the tenant-local persistence used by the optional engine services. */
export async function ensureServiceTables(env: Env): Promise<void> {
  const driver = tenantDriver(env);
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_sequence (
      code TEXT PRIMARY KEY, next_number BIGINT NOT NULL DEFAULT 1,
      step INTEGER NOT NULL DEFAULT 1, padding INTEGER NOT NULL DEFAULT 5, prefix TEXT NOT NULL DEFAULT ''
    )`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_scheduled_job (
      id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, interval_ms BIGINT NOT NULL,
      next_run TIMESTAMPTZ NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_automation_rule (
      id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, model TEXT NOT NULL,
      event TEXT NOT NULL CHECK (event IN ('create','write','unlink')), enabled BOOLEAN NOT NULL DEFAULT TRUE
    )`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_audit_log (
      id BIGSERIAL PRIMARY KEY, model TEXT NOT NULL, record_id BIGINT NOT NULL,
      event TEXT NOT NULL, uid BIGINT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`, params: [] });
  await driver.query({ text: `CREATE INDEX IF NOT EXISTS nx_audit_log_record_idx ON nx_audit_log(model, record_id, id DESC)`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_attachment (
      id BIGSERIAL PRIMARY KEY, model TEXT NOT NULL, record_id BIGINT NOT NULL,
      name TEXT NOT NULL, mimetype TEXT NOT NULL, data BYTEA NOT NULL,
      uid BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`, params: [] });
}

export interface SequenceOptions { prefix?: string; padding?: number; step?: number }

/** Database-backed counter. Row locking keeps increments atomic across callers. */
export class SequenceService {
  constructor(private readonly env: Env) {}

  async next(code: string, options: SequenceOptions = {}): Promise<string> {
    requireKey(code, 'sequence code');
    const step = positiveInt(options.step ?? 1, 'sequence step');
    const padding = nonNegativeInt(options.padding ?? 5, 'sequence padding');
    const prefix = options.prefix ?? '';
    return this.env.transaction(async (env) => {
      await ensureServiceTables(env);
      await tenantDriver(env).query({
        text: `INSERT INTO nx_sequence(code, step, padding, prefix) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`,
        params: [code, step, padding, prefix],
      });
      const [row] = await tenantDriver(env).query<{ issued: number; step: number; padding: number; prefix: string }>({
        text: `UPDATE nx_sequence SET next_number = next_number + step WHERE code = $1 RETURNING next_number - step AS issued, step, padding, prefix`,
        params: [code],
      });
      return `${row.prefix}${String(row.issued).padStart(row.padding, '0')}`;
    });
  }
}

export interface ScheduledJob { key: string; intervalMs: number; nextRun?: Date; enabled?: boolean }
export interface ClaimedJob { id: number; key: string }

/** Stores schedules and claims due work. Handlers stay in application code, not persisted expressions. */
export class SchedulerService {
  constructor(private readonly env: Env) {}

  async schedule(job: ScheduledJob): Promise<void> {
    requireKey(job.key, 'job key');
    positiveInt(job.intervalMs, 'job interval');
    await assertSystem(this.env);
    await ensureServiceTables(this.env);
    await tenantDriver(this.env).query({
      text: `INSERT INTO nx_scheduled_job(key, interval_ms, next_run, enabled) VALUES ($1,$2,$3,$4)
        ON CONFLICT (key) DO UPDATE SET interval_ms=EXCLUDED.interval_ms, next_run=EXCLUDED.next_run, enabled=EXCLUDED.enabled, updated_at=now()`,
      params: [job.key, job.intervalMs, job.nextRun ?? new Date(), job.enabled ?? true],
    });
  }

  async claimDue(limit = 10, now = new Date()): Promise<ClaimedJob[]> {
    positiveInt(limit, 'claim limit');
    await ensureServiceTables(this.env);
    const rows = await tenantDriver(this.env).query<ClaimedJob>({
      text: `WITH due AS (SELECT id FROM nx_scheduled_job WHERE enabled AND next_run <= $1 ORDER BY next_run, id LIMIT $2 FOR UPDATE SKIP LOCKED)
        UPDATE nx_scheduled_job j SET next_run = $1::timestamptz + (j.interval_ms * interval '1 millisecond'), last_error = NULL, updated_at=now()
        FROM due WHERE j.id=due.id RETURNING j.id, j.key`,
      params: [now, limit],
    });
    return rows;
  }

  async recordFailure(key: string, error: unknown): Promise<void> {
    await ensureServiceTables(this.env);
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Job failed';
    await tenantDriver(this.env).query({ text: `UPDATE nx_scheduled_job SET last_error=$2, updated_at=now() WHERE key=$1`, params: [key, message] });
  }

  /** Claims and dispatches available handlers once. Failed handlers are recorded for inspection. */
  async runDue(handlers: ReadonlyMap<string, () => Promise<void>>, limit = 10, now = new Date()): Promise<{ completed: string[]; failed: string[] }> {
    const jobs = await this.claimDue(limit, now);
    const completed: string[] = [];
    const failed: string[] = [];
    for (const job of jobs) {
      const handler = handlers.get(job.key);
      if (!handler) {
        const error = new Error(`No handler registered for scheduled job '${job.key}'`);
        await this.recordFailure(job.key, error);
        failed.push(job.key);
        continue;
      }
      try {
        await handler();
        completed.push(job.key);
      } catch (error) {
        await this.recordFailure(job.key, error);
        failed.push(job.key);
      }
    }
    return { completed, failed };
  }
}

export type AutomationEvent = 'create' | 'write' | 'unlink';
export interface AutomationRule { key: string; model: string; event: AutomationEvent; enabled?: boolean }
export type AutomationHandler = (event: { model: string; recordId: number; values?: Record<string, unknown>; uid: number }) => Promise<void>;

/** Rules name registered application handlers; no database-provided code is evaluated. */
export class AutomationService {
  private readonly handlers = new Map<string, AutomationHandler>();
  constructor(private readonly env: Env) {}

  register(key: string, handler: AutomationHandler): void {
    requireKey(key, 'automation key');
    this.handlers.set(key, handler);
  }

  async define(rule: AutomationRule): Promise<void> {
    requireKey(rule.key, 'automation key');
    requireModel(rule.model);
    await assertSystem(this.env);
    await ensureServiceTables(this.env);
    await tenantDriver(this.env).query({
      text: `INSERT INTO nx_automation_rule(key,model,event,enabled) VALUES($1,$2,$3,$4)
        ON CONFLICT(key) DO UPDATE SET model=EXCLUDED.model,event=EXCLUDED.event,enabled=EXCLUDED.enabled`,
      params: [rule.key, rule.model, rule.event, rule.enabled ?? true],
    });
  }

  async trigger(model: string, event: AutomationEvent, recordId: number, values?: Record<string, unknown>): Promise<void> {
    requireModel(model);
    positiveInt(recordId, 'record id');
    await ensureServiceTables(this.env);
    const rules = await tenantDriver(this.env).query<{ key: string }>({
      text: `SELECT key FROM nx_automation_rule WHERE enabled AND model=$1 AND event=$2 ORDER BY id`, params: [model, event],
    });
    for (const rule of rules) {
      const handler = this.handlers.get(rule.key);
      if (!handler) continue;
      await handler({ model, recordId, ...(values ? { values } : {}), uid: this.env.uid });
    }
  }
}

export interface AuditEntry { id: number; model: string; record_id: number; event: string; uid: number; payload: Record<string, unknown>; created_at: Date }

/** Explicit audit and chatter APIs. Call within the same transaction as the business change. */
export class AuditService {
  constructor(private readonly env: Env) {}

  /** Internal system audit hook: callers are trusted engine code, so no record access check. Use post() for user chatter. */
  async log(model: string, recordId: number, event: string, payload: Record<string, unknown> = {}): Promise<number> {
    requireModel(model);
    positiveInt(recordId, 'record id');
    requireKey(event, 'audit event');
    await ensureServiceTables(this.env);
    const [row] = await tenantDriver(this.env).query<{ id: number }>({
      text: `INSERT INTO nx_audit_log(model,record_id,event,uid,payload) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id`,
      params: [model, recordId, event, this.env.uid, JSON.stringify(payload)],
    });
    return row.id;
  }

  async history(model: string, recordId: number, limit = 100): Promise<AuditEntry[]> {
    requireModel(model);
    positiveInt(recordId, 'record id');
    nonNegativeInt(limit, 'history limit');
    await assertReadable(this.env, model, recordId);
    await ensureServiceTables(this.env);
    return tenantDriver(this.env).query<AuditEntry>({
      text: `SELECT id,model,record_id,event,uid,payload,created_at FROM nx_audit_log WHERE model=$1 AND record_id=$2 ORDER BY id DESC LIMIT $3`,
      params: [model, recordId, limit],
    });
  }

  async post(model: string, recordId: number, message: string): Promise<number> {
    if (!message.trim()) throw new ValidationError('Chatter message cannot be empty');
    requireModel(model);
    positiveInt(recordId, 'record id');
    await assertWritable(this.env, model, recordId);
    return this.log(model, recordId, 'message', { message });
  }
}

export interface AttachmentInput { model: string; recordId: number; name: string; mimetype: string; data: Uint8Array }
export interface Attachment { id: number; model: string; record_id: number; name: string; mimetype: string; uid: number; created_at: Date }

/** Tenant-local binary attachments with a bounded payload and no public raw SQL surface. */
export class AttachmentService {
  constructor(private readonly env: Env) {}

  async add(input: AttachmentInput): Promise<number> {
    requireModel(input.model);
    positiveInt(input.recordId, 'record id');
    if (!input.name.trim() || input.name.length > 255) throw new ValidationError('Attachment name must contain 1 to 255 characters');
    if (!input.mimetype.trim() || input.mimetype.length > 255) throw new ValidationError('Invalid attachment MIME type');
    if (!(input.data instanceof Uint8Array) || input.data.byteLength > MAX_ATTACHMENT_BYTES) throw new ValidationError('Attachment must be at most 10 MiB');
    await assertWritable(this.env, input.model, input.recordId);
    await ensureServiceTables(this.env);
    const [row] = await tenantDriver(this.env).query<{ id: number }>({
      text: `INSERT INTO nx_attachment(model,record_id,name,mimetype,data,uid) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      params: [input.model, input.recordId, input.name, input.mimetype, input.data, this.env.uid],
    });
    return row.id;
  }

  async list(model: string, recordId: number): Promise<Attachment[]> {
    requireModel(model);
    positiveInt(recordId, 'record id');
    await assertReadable(this.env, model, recordId);
    await ensureServiceTables(this.env);
    return tenantDriver(this.env).query<Attachment>({
      text: `SELECT id,model,record_id,name,mimetype,uid,created_at FROM nx_attachment WHERE model=$1 AND record_id=$2 ORDER BY id DESC`,
      params: [model, recordId],
    });
  }

  async content(id: number): Promise<Uint8Array | null> {
    positiveInt(id, 'attachment id');
    await ensureServiceTables(this.env);
    const [row] = await tenantDriver(this.env).query<{ data: Uint8Array; model: string; record_id: number }>({ text: `SELECT data,model,record_id FROM nx_attachment WHERE id=$1`, params: [id] });
    if (row) await assertReadable(this.env, row.model, row.record_id);
    return row?.data ?? null;
  }
}

async function assertReadable(env: Env, model: string, recordId: number): Promise<void> {
  try {
    const rows = await env.model(model).browse(recordId).read(['id']);
    if (rows.length !== 1) throw new AccessError('Record is unavailable');
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('Record is unavailable');
  }
}

/** Record must exist, be visible, and be writable by the current user (ACL + record rules). */
async function assertWritable(env: Env, model: string, recordId: number): Promise<void> {
  await assertReadable(env, model, recordId);
  try {
    await env.model(model).browse(recordId).checkAccess('write');
    await checkRecordRules(env as Parameters<typeof checkRecordRules>[0], model, [recordId], 'write');
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('Record is unavailable');
  }
}

/** Configuration changes require superuser or base.group_system. */
async function assertSystem(env: Env): Promise<void> {
  if (env.su) return;
  let ok = false;
  try { ok = (await userSecurity(env as Parameters<typeof userSecurity>[0])).groups.has('base.group_system'); } catch { ok = false; }
  if (!ok) throw new AccessError('Only system administrators can change service configuration');
}

function requireModel(model: string): void {
  if (!IDENTIFIER.test(model)) throw new ValidationError('Invalid model name');
}
function requireKey(key: string, label: string): void {
  if (!IDENTIFIER.test(key)) throw new ValidationError(`Invalid ${label}`);
}
function positiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ValidationError(`${label} must be a positive integer`);
  return value;
}
function nonNegativeInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new ValidationError(`${label} must be a non-negative integer`);
  return value;
}

/** The concrete engine Env exposes its tenant driver internally while the public contract stays transport-neutral. */
function tenantDriver(env: Env): SqlDriver {
  return (env as Env & { db: SqlDriver }).db;
}


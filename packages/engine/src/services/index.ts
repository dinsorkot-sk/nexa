import { AccessError, ValidationError, type Env } from '../contracts/index.js';
import { userSecurity } from '../security/access.js';
import { EnvImpl, SUPERUSER_ID } from '../orm/env.js';
import {
  assertReadable, assertSystem, assertWritable, ensureServiceTables, nonNegativeInt, positiveInt, requireKey, requireModel, tenantDriver,
} from './common.js';
import { ServerActionService, lockActionReferences, postMessage } from './actions.js';
import { runTimeAutomations } from './automation.js';

export { ensureServiceTables } from './common.js';
export {
  ServerActionService, ButtonService, postMessage,
  type ServerActionDef, type ServerActionType, type ServerActionRunOptions, type ServerActionLimits, type ButtonDef, type ButtonCall,
} from './actions.js';
export { SequenceService, interpolateSequence, SEQUENCE_PLACEHOLDERS, type SequenceOptions } from './sequence.js';
export {
  ConfigParameterService, DefaultService, importServiceConfigRecords, storedDefaults, type DefaultScope, type DefaultScopeOptions,
} from './config.js';
export { AutomationRuleService, MAX_AUTOMATION_DEPTH, type AutomationRuleDef, type AutomationTrigger } from './automation.js';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Built-in job bodies that need no application handler. */
export type ScheduledBuiltin = 'automation.on_time';

export interface ScheduledJob {
  key: string; intervalMs: number; nextRun?: Date; enabled?: boolean;
  /** Server action run by the job (no records). Requires `userId`. */
  action?: string;
  /** Built-in body, e.g. evaluating time-based automation rules. Requires `userId`. */
  builtin?: ScheduledBuiltin;
  /**
   * Active user the action/builtin runs as. The superuser may only be configured by the superuser.
   * For `automation.on_time`, the due-record search uses this user's rights: records it cannot see are
   * skipped, and because the watermark moves past them they are never processed later (permanently).
   * Admins may configure any active non-superuser user here.
   */
  userId?: number;
}
export interface ClaimedJob { id: number; key: string }

/** Stores schedules and claims due work. Handlers stay in application code, or the job names a server action. */
export class SchedulerService {
  constructor(private readonly env: Env) {}

  async schedule(job: ScheduledJob): Promise<void> {
    // serialize with removeServerActionDefinitions: the referenced action cannot vanish before our row is stored
    await this.env.transaction(async () => { await lockActionReferences(this.env); await this.scheduleLocked(job); });
  }

  private async scheduleLocked(job: ScheduledJob): Promise<void> {
    requireKey(job.key, 'job key');
    positiveInt(job.intervalMs, 'job interval');
    await assertSystem(this.env);
    if (job.action !== undefined && job.builtin !== undefined) throw new ValidationError('A job runs either an action or a built-in');
    if (job.builtin !== undefined && job.builtin !== 'automation.on_time') throw new ValidationError('Unknown built-in job');
    if (job.action !== undefined || job.builtin !== undefined) {
      if (job.userId === undefined) throw new ValidationError('Action jobs need the user they run as');
      positiveInt(job.userId, 'job user');
      if (job.userId === SUPERUSER_ID && !this.env.su) throw new AccessError('Only the superuser can schedule jobs as the superuser');
      await jobEnv(this.env, job.userId); // must be an existing, active user
    } else if (job.userId !== undefined) throw new ValidationError('Only action jobs have a user');
    if (job.action !== undefined) {
      if (!(await new ServerActionService(this.env).resolve(job.action))) throw new ValidationError(`Unknown server action '${job.action}'`);
    }
    await ensureServiceTables(this.env);
    await tenantDriver(this.env).query({
      text: `INSERT INTO nx_scheduled_job(key, interval_ms, next_run, enabled, action, builtin, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (key) DO UPDATE SET interval_ms=EXCLUDED.interval_ms, next_run=EXCLUDED.next_run, enabled=EXCLUDED.enabled,
          action=EXCLUDED.action, builtin=EXCLUDED.builtin, user_id=EXCLUDED.user_id, updated_at=now()`,
      params: [job.key, job.intervalMs, job.nextRun ?? new Date(), job.enabled ?? true, job.action ?? null, job.builtin ?? null, job.userId ?? null],
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

  /**
   * Claims and dispatches available jobs once. Action jobs run in their own transaction as the
   * configured user; failures roll back and are recorded for inspection.
   */
  async runDue(handlers: ReadonlyMap<string, () => Promise<void>> = new Map(), limit = 10, now = new Date()): Promise<{ completed: string[]; failed: string[] }> {
    const jobs = await this.claimDue(limit, now);
    const completed: string[] = [];
    const failed: string[] = [];
    for (const job of jobs) {
      const [config] = await tenantDriver(this.env).query<{ action: string | null; builtin: string | null; user_id: number | string | null }>({
        text: `SELECT action, builtin, user_id FROM nx_scheduled_job WHERE id=$1`, params: [job.id],
      });
      if (config && (config.action !== null || config.builtin !== null)) {
        try {
          if (config.user_id === null) throw new ValidationError('Job has no configured user');
          const env = await jobEnv(this.env, Number(config.user_id));
          // time automations commit per rule page (one failing rule must not undo the others);
          // a server action is atomic on its own (ServerActionService.run is transactional)
          if (config.builtin === 'automation.on_time') await runTimeAutomations(env, now);
          else await new ServerActionService(env).run(config.action!);
          completed.push(job.key);
        } catch (error) {
          await this.recordFailure(job.key, error);
          failed.push(job.key);
        }
        continue;
      }
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

  /**
   * Chatter post (record must be writable). With the mail module installed it returns a mail.message id
   * and the post is read through MailThreadService.messages(), not history(); otherwise an audit entry id.
   */
  async post(model: string, recordId: number, message: string): Promise<number> {
    return postMessage(this.env, model, recordId, message);
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

/** Fresh env for a job's configured user; fails for unknown or archived users. */
async function jobEnv(base: Env, uid: number): Promise<EnvImpl> {
  const source = base as EnvImpl;
  const env = new EnvImpl({ tenant: source.tenant, uid, registry: source.registry, db: source.db });
  if (!env.su) await userSecurity(env);
  return env;
}

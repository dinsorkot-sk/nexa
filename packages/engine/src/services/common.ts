import { AccessError, ValidationError, type Env, type SqlDriver } from '../contracts/index.js';
import { checkRecordRules, userSecurity } from '../security/access.js';

export const IDENTIFIER = /^[a-z][a-z0-9_.-]{0,127}$/;

export async function assertReadable(env: Env, model: string, recordId: number): Promise<void> {
  try {
    const rows = await env.model(model).browse(recordId).read(['id']);
    if (rows.length !== 1) throw new AccessError('Record is unavailable');
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('Record is unavailable');
  }
}

/** Record must exist, be visible, and be writable by the current user (ACL + record rules). */
export async function assertWritable(env: Env, model: string, recordId: number): Promise<void> {
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
export async function assertSystem(env: Env): Promise<void> {
  if (env.su) return;
  let ok = false;
  try { ok = (await userSecurity(env as Parameters<typeof userSecurity>[0])).groups.has('base.group_system'); } catch { ok = false; }
  if (!ok) throw new AccessError('Only system administrators can change service configuration');
}

export function requireModel(model: string): void {
  if (!IDENTIFIER.test(model)) throw new ValidationError('Invalid model name');
}
export function requireKey(key: string, label: string): void {
  if (typeof key !== 'string' || !IDENTIFIER.test(key)) throw new ValidationError(`Invalid ${label}`);
}
export function positiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ValidationError(`${label} must be a positive integer`);
  return value;
}
export function nonNegativeInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new ValidationError(`${label} must be a non-negative integer`);
  return value;
}

/** The concrete engine Env exposes its tenant driver internally while the public contract stays transport-neutral. */
export function tenantDriver(env: Env): SqlDriver {
  return (env as Env & { db: SqlDriver }).db;
}

/** Bump whenever createServiceTables changes, so existing tenants re-run the (idempotent) DDL. */
export const SERVICE_SCHEMA_VERSION = 4;

/**
 * Creates the tenant-local persistence used by the optional engine services. One catalog query per call:
 * the schema version recorded on nx_service_ready (row + table comment, written last) proves the DDL of
 * this build committed; a rolled-back or older schema simply re-runs the idempotent statements.
 */
export async function ensureServiceTables(env: Env): Promise<void> {
  const driver = tenantDriver(env);
  const [probe] = await driver.query<{ v: string | null }>({
    text: `SELECT obj_description(to_regclass('nx_service_ready'), 'pg_class') AS v`, params: [],
  });
  if (Number(probe?.v ?? 0) >= SERVICE_SCHEMA_VERSION) return;
  await createServiceTables(driver);
  await driver.query({ text: `CREATE TABLE IF NOT EXISTS nx_service_ready (version INTEGER PRIMARY KEY)`, params: [] });
  await driver.query({ text: `INSERT INTO nx_service_ready(version) VALUES ($1) ON CONFLICT DO NOTHING`, params: [SERVICE_SCHEMA_VERSION] });
  await driver.query({ text: `COMMENT ON TABLE nx_service_ready IS '${SERVICE_SCHEMA_VERSION}'`, params: [] });
}

async function createServiceTables(driver: SqlDriver): Promise<void> {
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
  await driver.query({ text: `ALTER TABLE nx_scheduled_job ADD COLUMN IF NOT EXISTS action TEXT`, params: [] });
  await driver.query({ text: `ALTER TABLE nx_scheduled_job ADD COLUMN IF NOT EXISTS builtin TEXT`, params: [] });
  await driver.query({ text: `ALTER TABLE nx_scheduled_job ADD COLUMN IF NOT EXISTS user_id BIGINT`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_automation_rule (
      id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, model TEXT NOT NULL,
      event TEXT NOT NULL CHECK (event IN ('create','write','unlink')), enabled BOOLEAN NOT NULL DEFAULT TRUE
    )`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_server_action (
      id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, model TEXT,
      type TEXT NOT NULL CHECK (type IN ('update_record','create_record','post_message','multi','script','call_method')),
      definition JSONB NOT NULL DEFAULT '{}'::jsonb
    )`, params: [] });
  // tables created by an older build carry the narrower type CHECK: widen it once (single statement, advisory-locked)
  await driver.query({ text: `
    DO $nx$ DECLARE c RECORD; BEGIN
      PERFORM pg_advisory_xact_lock(hashtext('nx.service_schema.server_action_type'));
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'nx_server_action'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%call_method%'
      ) THEN
        FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'nx_server_action'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) ~ '(^|[^a-z_])type([^a-z_]|$)' LOOP
          EXECUTE format('ALTER TABLE nx_server_action DROP CONSTRAINT %I', c.conname);
        END LOOP;
        ALTER TABLE nx_server_action ADD CONSTRAINT nx_server_action_type_check
          CHECK (type IN ('update_record','create_record','post_message','multi','script','call_method'));
      END IF;
    END $nx$`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_automation (
      id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, model TEXT NOT NULL,
      trigger TEXT NOT NULL CHECK (trigger IN ('on_create','on_write','on_create_or_write','on_unlink','on_change_fields','on_time')),
      trigger_fields TEXT[] NOT NULL DEFAULT '{}', filter_pre JSONB, filter JSONB, action TEXT NOT NULL,
      date_field TEXT, delay_minutes INTEGER NOT NULL DEFAULT 0, last_run TIMESTAMPTZ,
      enabled BOOLEAN NOT NULL DEFAULT TRUE
    )`, params: [] });
  await driver.query({ text: `ALTER TABLE nx_automation ADD COLUMN IF NOT EXISTS last_id BIGINT`, params: [] });
  await driver.query({ text: `ALTER TABLE nx_automation ADD COLUMN IF NOT EXISTS last_error TEXT`, params: [] });
  await driver.query({ text: `ALTER TABLE nx_automation ADD COLUMN IF NOT EXISTS last_value TEXT`, params: [] });
  await driver.query({ text: `CREATE INDEX IF NOT EXISTS nx_automation_model_idx ON nx_automation(model, trigger)`, params: [] });
  await driver.query({ text: `
    CREATE TABLE IF NOT EXISTS nx_button (
      id BIGSERIAL PRIMARY KEY, model TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('action','object')),
      ref TEXT NOT NULL, guard TEXT, UNIQUE (model, kind, ref)
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

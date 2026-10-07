import { sql } from 'drizzle-orm';
import type { DbHandle } from './client';
import { auditLog, eventLog, metadataDefinitions, modules, recordLinks, records, systemSettings, tenants } from './schema';

export interface DatabaseCheck {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
}

const expectedTables = [
  'nexa_tenants',
  'nexa_system_settings',
  'nexa_modules',
  'nexa_metadata_definitions',
  'nexa_records',
  'nexa_record_links',
  'nexa_audit_log',
  'nexa_event_log',
] as const;

const requiredConstraints = [
  'nexa_audit_log_tenant_record_fk',
  'nexa_record_links_from_record_fk',
  'nexa_record_links_to_record_fk',
] as const;

const requiredMigrations = 4;
const tables = [tenants, systemSettings, modules, metadataDefinitions, records, recordLinks, auditLog, eventLog];

export async function checkDatabase(handle: DbHandle): Promise<DatabaseCheck> {
  const checks: DatabaseCheck['checks'] = [];
  try {
    await handle.db.execute(sql`select 1`);
    checks.push({ name: 'connectivity', ok: true });
  } catch (error) {
    checks.push({ name: 'connectivity', ok: false, detail: errorMessage(error) });
    return { ok: false, checks };
  }

  try {
    const migrationRows = await handle.db.execute(sql`select count(*)::int as count from drizzle.__drizzle_migrations`);
    const migrationCount = Number(migrationRows.rows[0]?.count ?? 0);
    if (migrationCount < requiredMigrations) {
      throw new Error(`Expected at least ${requiredMigrations} migrations, found ${migrationCount}`);
    }
    checks.push({ name: 'migrations', ok: true, detail: `${migrationCount} migration(s) applied` });
  } catch (error) {
    checks.push({ name: 'migrations', ok: false, detail: errorMessage(error) });
    return { ok: false, checks };
  }

  try {
    for (const table of tables) await handle.db.select().from(table).limit(0);
    const constraintRows = await handle.db.execute(sql`
      SELECT constraint_row.conname AS name, table_class.relname AS table_name
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS table_class ON table_class.oid = constraint_row.conrelid
      WHERE constraint_row.conname IN (${sql.join(requiredConstraints.map((name) => sql`${name}`), sql`, `)})
    `);
    const existingConstraints = new Set(constraintRows.rows.map((row) => String(row.name)));
    const missingConstraints = requiredConstraints.filter((name) => !existingConstraints.has(name));
    if (missingConstraints.length > 0) {
      throw new Error(`Missing tenant-safe constraints: ${missingConstraints.join(', ')}`);
    }
    checks.push({ name: 'schema', ok: true, detail: expectedTables.join(', ') });
  } catch (error) {
    checks.push({ name: 'schema', ok: false, detail: errorMessage(error) });
    return { ok: false, checks };
  }

  return { ok: checks.every((check) => check.ok), checks };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { Kysely, PostgresDialect, SqliteDialect } from 'kysely';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import type { PlatformDatabase } from '@nexa/core/db';

export function createPlatformDb(location?: string): Kysely<PlatformDatabase> {
  const loc = location ?? process.env.PLATFORM_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nexa_platform';
  if (loc.startsWith('postgres://') || loc.startsWith('postgresql://')) {
    const pool = new Pool({ connectionString: loc });
    return new Kysely<PlatformDatabase>({ dialect: new PostgresDialect({ pool }) });
  }
  const db = new Database(loc);
  return new Kysely<PlatformDatabase>({ dialect: new SqliteDialect({ database: db }) });
}
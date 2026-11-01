import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { TenantDatabase } from '@nexa/core';

const cache = new Map<string, Kysely<TenantDatabase>>();

export function getTenantDb(schemaName: string): Kysely<TenantDatabase> {
  const cached = cache.get(schemaName);
  if (cached) return cached;
  // SQLite file per tenant (dev). Production Postgres would use schema-qualified connection.
  const db = new Database(`${schemaName}.sqlite`);
  const kdb = new Kysely<TenantDatabase>({ dialect: new SqliteDialect({ database: db }) });
  cache.set(schemaName, kdb);
  return kdb;
}
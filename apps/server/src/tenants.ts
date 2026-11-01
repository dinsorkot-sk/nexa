import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { PlatformDatabase } from '@nexa/core';
import { PostgresDialectAdapter, SqliteDialectAdapter } from '@nexa/core';
import type { Tenant, TenantStatus } from '@nexa/types';

export async function lookupTenant(db: Kysely<PlatformDatabase>, slug: string): Promise<Tenant | null> {
  const row = await db.selectFrom('tenants').selectAll().where('slug', '=', slug).executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    schemaName: row.schema_name,
    dbConnection: row.db_connection,
    status: row.status as TenantStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function provisionTenant(
  db: Kysely<PlatformDatabase>,
  input: { slug: string; name: string; dialect: 'postgres' | 'sqlite' },
): Promise<Tenant> {
  const id = randomBytes(16).toString('hex');
  const schemaName = `t_${input.slug}`;
  const adapter = input.dialect === 'postgres' ? new PostgresDialectAdapter() : new SqliteDialectAdapter();
  await adapter.createTenantNamespace(schemaName);
  await db.insertInto('tenants').values({
    id,
    slug: input.slug,
    name: input.name,
    schema_name: schemaName,
    db_connection: null,
    status: 'active',
  }).execute();
  const row = await db.selectFrom('tenants').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    schemaName: row.schema_name,
    dbConnection: row.db_connection,
    status: row.status as TenantStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
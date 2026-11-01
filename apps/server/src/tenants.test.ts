import { describe, it, expect } from 'vitest';
import { createPlatformDb } from './platform-db';
import { provisionTenant, lookupTenant } from './tenants';

describe('tenant provisioning', () => {
  it('creates and looks up a tenant', async () => {
    const db = createPlatformDb(':memory:');
    // create tables
    await db.schema.createTable('users').ifNotExists()
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('email', 'text', (c) => c.notNull())
      .addColumn('name', 'text')
      .addColumn('password_hash', 'text', (c) => c.notNull())
      .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(new Date().toISOString()))
      .execute();
    await db.schema.createTable('tenants').ifNotExists()
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('slug', 'text', (c) => c.notNull().unique())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('schema_name', 'text', (c) => c.notNull())
      .addColumn('db_connection', 'text')
      .addColumn('status', 'text', (c) => c.notNull())
      .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(new Date().toISOString()))
      .addColumn('updated_at', 'text', (c) => c.notNull().defaultTo(new Date().toISOString()))
      .execute();
    await db.schema.createTable('memberships').ifNotExists()
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('user_id', 'text', (c) => c.notNull())
      .addColumn('tenant_id', 'text', (c) => c.notNull())
      .addColumn('role', 'text', (c) => c.notNull())
      .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(new Date().toISOString()))
      .execute();
    await db.schema.createTable('modules_registry').ifNotExists()
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('tenant_id', 'text', (c) => c.notNull())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('version', 'text', (c) => c.notNull())
      .addColumn('installed_at', 'text', (c) => c.notNull().defaultTo(new Date().toISOString()))
      .execute();
    await db.schema.createTable('sessions').ifNotExists()
      .addColumn('id', 'text', (c) => c.primaryKey())
      .addColumn('user_id', 'text', (c) => c.notNull())
      .addColumn('token', 'text', (c) => c.notNull())
      .addColumn('expires_at', 'text', (c) => c.notNull())
      .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(new Date().toISOString()))
      .execute();

    const t = await provisionTenant(db, { slug: 'acme', name: 'Acme', dialect: 'sqlite' });
    expect(t.slug).toBe('acme');
    expect(t.status).toBe('active');

    const found = await lookupTenant(db, 'acme');
    expect(found?.id).toBe(t.id);

    const missing = await lookupTenant(db, 'nope');
    expect(missing).toBeNull();
  });
});
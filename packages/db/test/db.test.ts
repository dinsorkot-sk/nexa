import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, seedDatabase, checkDatabase, createTenantContext, tenantRepository, SYSTEM_TENANT_ID } from '../src/index';
import { auditLog, tenants } from '../src/schema';

const handles: Array<ReturnType<typeof createDb>> = [];

function createTestDb() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  return handle;
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe('@nexa/db migrations, tenancy, seed, and checks', () => {
  it('applies migrations idempotently and reports schema health', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    await runMigrations(handle);

    const result = await checkDatabase(handle);
    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual(['connectivity', 'migrations', 'schema']);

    await handle.db.execute(sql.raw('DROP TABLE nexa_audit_log CASCADE'));
    const missingTableResult = await checkDatabase(handle);
    expect(missingTableResult.ok).toBe(false);
    expect(missingTableResult.checks.at(-1)).toMatchObject({ name: 'schema', ok: false });
  });

  it('seeds the system tenant and baseline settings idempotently', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    await seedDatabase(handle);
    await seedDatabase(handle);

    const tenantRows = await handle.db.select().from(tenants);
    expect(tenantRows).toHaveLength(1);
    expect(tenantRows[0].id).toBe(SYSTEM_TENANT_ID);
  });

  it('isolates records and links by tenant', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    await handle.db.insert(tenants).values([
      { id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' },
      { id: '00000000-0000-0000-0000-000000000002', slug: 'other', name: 'Other' },
    ]);

    const tenantA = tenantRepository(handle, createTenantContext(SYSTEM_TENANT_ID));
    const tenantB = tenantRepository(handle, createTenantContext('00000000-0000-0000-0000-000000000002'));
    const recordA = await tenantA.createRecord('vehicle', { name: 'A' });
    const recordB = await tenantB.createRecord('vehicle', { name: 'B' });

    expect(await tenantA.getRecord('vehicle', recordB.id)).toBeUndefined();
    expect(await tenantA.listRecords('vehicle')).toHaveLength(1);
    expect(recordA.version).toBe(1);
    const updated = await tenantA.updateRecord('vehicle', recordA.id, { name: 'A updated' });
    expect(updated?.version).toBe(2);
    expect(await tenantB.updateRecord('vehicle', recordA.id, { name: 'unauthorized' })).toBeUndefined();
    expect(await tenantB.deleteRecord('vehicle', recordA.id)).toBeUndefined();
    expect(await tenantA.getRecord('vehicle', recordA.id)).toMatchObject({ data: { name: 'A updated' } });
    const auditEntries = await handle.db.select().from(auditLog);
    expect(auditEntries.map((entry) => entry.action)).toEqual(['record.created', 'record.created', 'record.updated']);
    expect(auditEntries.every((entry) => entry.recordId !== null)).toBe(true);
    expect(auditEntries.filter((entry) => entry.action !== 'record.created').every((entry) => entry.tenantId.toLowerCase() === SYSTEM_TENANT_ID)).toBe(true);
    await expect(handle.db.insert(auditLog).values({
      tenantId: SYSTEM_TENANT_ID,
      action: 'record.updated',
      entityId: 'vehicle',
      recordId: recordB.id,
    })).rejects.toThrow();
    await expect(tenantA.createLink('related', recordA.id, recordB.id)).rejects.toThrow(/current tenant/);
    await tenantA.createLink('related', recordA.id, recordA.id);
    expect(await tenantA.listLinks('related', recordA.id)).toHaveLength(1);
    expect(await tenantB.listLinks('related', recordA.id)).toHaveLength(0);
  });

  it('rejects malformed tenant IDs before creating a repository', () => {
    expect(() => createTenantContext('not-a-uuid')).toThrow(/Invalid tenant ID/);
  });

  it('fails checks before migrations are applied', async () => {
    const handle = createTestDb();
    const result = await checkDatabase(handle);
    expect(result.ok).toBe(false);
  });
});

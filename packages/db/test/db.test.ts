import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, seedDatabase, checkDatabase, createTenantContext, tenantRepository, moduleRepository, ModuleConflictError, ModuleNotFoundError, SYSTEM_TENANT_ID } from '../src/index';
import { auditLog, modules, records, recordLinks, tenants } from '../src/schema';
import type { ModuleCreateInput } from '@nexa/meta';
import { ModuleDefinitionSchema } from '@nexa/meta';

const makeModuleInput = (overrides: Partial<ModuleCreateInput> = {}): ModuleCreateInput => ({
  id: 'fleet',
  owner: { id: 'user-1', type: 'user' },
  name: 'Fleet',
  version: '1.0.0',
  ...overrides,
  description: overrides.description ?? '',
  settings: overrides.settings ?? {},
  dependencies: overrides.dependencies ?? [],
});

function createTenantPair(handle: ReturnType<typeof createDb>) {
  const tenantId = SYSTEM_TENANT_ID;
  const otherTenantId = '00000000-0000-0000-0000-000000000002';
  return handle.db.insert(tenants).values([
    { id: tenantId, slug: 'system', name: 'System' },
    { id: otherTenantId, slug: 'other', name: 'Other' },
  ]).then(() => ({
    tenantId,
    otherTenantId,
    tenantA: moduleRepository(handle, createTenantContext(tenantId)),
    tenantB: moduleRepository(handle, createTenantContext(otherTenantId)),
  }));
}

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
  }, 15000);

  it('checks the tables the later migrations added', async () => {
    const handle = createTestDb();
    await runMigrations(handle);

    // The outbox and the automation runs arrived after the check was written; a missing one of them has to fail it.
    await handle.db.execute(sql.raw('DROP TABLE nexa_outbox CASCADE'));
    const missingOutbox = await checkDatabase(handle);
    expect(missingOutbox.ok).toBe(false);
    expect(missingOutbox.checks.at(-1)).toMatchObject({ name: 'schema', ok: false });
  }, 15000);

  it('persists module-scoped records, validates relation cardinality and applies onDelete atomically', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    await createTenantPair(handle);
    const repo = tenantRepository(handle, createTenantContext(SYSTEM_TENANT_ID));
    const moduleId = 'fleet';
    const source = await repo.createScopedRecord(moduleId, 'vehicle', { name: 'A' });
    const first = await repo.createScopedRecord(moduleId, 'part', { name: 'one' });
    const second = await repo.createScopedRecord(moduleId, 'part', { name: 'two' });
    const oneToMany = { id: 'parts', name: 'parts', sourceEntityId: 'vehicle', targetEntityId: 'part', type: 'oneToMany' as const, onDelete: 'restrict' as const };
    await repo.createRelationLink(moduleId, oneToMany, source.id, first.id);
    await repo.createRelationLink(moduleId, oneToMany, source.id, second.id);
    await expect(repo.createRelationLink(moduleId, oneToMany, source.id, second.id)).resolves.toBeDefined();
    await expect(repo.createRelationLink(moduleId, oneToMany, first.id, first.id)).rejects.toThrow(/endpoints/);
    await expect(repo.createRelationLink(moduleId, oneToMany, second.id, first.id)).rejects.toThrow(/endpoints/);
    await expect(repo.deleteScopedRecord(moduleId, 'vehicle', source.id, [oneToMany])).rejects.toThrow(/referenced/);
    expect(await repo.getScopedRecord(moduleId, 'vehicle', source.id)).toBeDefined();

    const cascading = { ...oneToMany, id: 'cascade-parts', type: 'manyToMany' as const, onDelete: 'cascade' as const };
    await repo.createRelationLink(moduleId, cascading, source.id, second.id);
    await expect(repo.deleteScopedRecord(moduleId, 'vehicle', source.id, [cascading])).resolves.toBeDefined();
    expect(await handle.db.select().from(recordLinks).where(eq(recordLinks.relationId, cascading.id))).toHaveLength(0);
    expect(await repo.getScopedRecord(moduleId, 'vehicle', source.id)).toBeUndefined();
    expect(await handle.db.select().from(records).where(eq(records.moduleId, moduleId))).toHaveLength(3);
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

  it('creates and reads tenant-scoped module definitions, and prevents tenant spoofing', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    const { tenantA, tenantB } = await createTenantPair(handle);
    const created = await tenantA.create(makeModuleInput());

    expect(created).toMatchObject({ id: 'fleet', tenantId: SYSTEM_TENANT_ID, status: 'draft', name: 'Fleet' });
    expect(ModuleDefinitionSchema.safeParse(created).success).toBe(true);
    expect(await tenantA.get('fleet')).toEqual(created);
    expect(await tenantB.get('fleet')).toBeUndefined();
    expect(await tenantA.list('draft')).toEqual([created]);
    expect(await tenantB.list()).toEqual([]);
    await expect(tenantA.create(makeModuleInput({ tenantId: 'spoofed' } as Partial<ModuleCreateInput>))).rejects.toThrow();
    await expect(tenantA.create(makeModuleInput())).rejects.toBeInstanceOf(ModuleConflictError);

    const rawRows = await handle.db.select().from(modules);
    expect(rawRows[0].tenantId).toBe(SYSTEM_TENANT_ID);
    expect(rawRows[0].definition).toMatchObject({ tenantId: SYSTEM_TENANT_ID });
  });

  it('updates draft modules and performs audited lifecycle transitions transactionally', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    const { tenantA, tenantB } = await createTenantPair(handle);
    const created = await tenantA.create(makeModuleInput());
    const updated = await tenantA.update('fleet', { name: 'Fleet Ops' }, 'user-1');
    expect(updated.name).toBe('Fleet Ops');
    await expect(tenantB.update('fleet', { name: 'Other' })).rejects.toBeInstanceOf(ModuleNotFoundError);

    const review = await tenantA.transition('fleet', 'review', 'user-1');
    expect(review.status).toBe('review');
    await expect(tenantA.transition('fleet', 'enabled')).rejects.toBeInstanceOf(ModuleConflictError);
    expect(await tenantA.get('fleet')).toEqual(review);

    const auditEntries = await handle.db.select().from(auditLog).orderBy(auditLog.occurredAt);
    expect(auditEntries.map((entry) => entry.action)).toEqual([
      'module.created', 'module.updated', 'module.status_changed',
    ]);
    expect(auditEntries.every((entry) => entry.tenantId.toLowerCase() === SYSTEM_TENANT_ID)).toBe(true);
    expect(auditEntries[2].changes).toEqual({ before: { status: 'draft' }, after: { status: 'review' } });
    expect(created.status).toBe('draft');
  });

  it('rejects edits outside editable lifecycle states and treats archive as terminal', async () => {
    const handle = createTestDb();
    await runMigrations(handle);
    const { tenantA } = await createTenantPair(handle);
    await tenantA.create(makeModuleInput());
    await tenantA.transition('fleet', 'review');
    await tenantA.transition('fleet', 'published');
    await expect(tenantA.update('fleet', { name: 'Cannot edit' })).rejects.toBeInstanceOf(ModuleConflictError);
    await tenantA.transition('fleet', 'archived');
    await expect(tenantA.transition('fleet', 'draft')).rejects.toBeInstanceOf(ModuleConflictError);
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

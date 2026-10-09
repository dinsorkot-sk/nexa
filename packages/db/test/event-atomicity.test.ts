import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDb,
  createTenantContext,
  moduleRepository,
  runMigrations,
  SYSTEM_TENANT_ID,
  tenantRepository,
} from '../src/index';
import { eventLog, records, tenants } from '../src/schema';
import type { DbHandle } from '../src/client';

const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';

const handles: DbHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function setup() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values([
    { id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' },
    { id: OTHER_TENANT_ID, slug: 'other', name: 'Other' },
  ]);
  const input = { id: 'fleet', owner: { id: 'user-1', type: 'user' as const }, name: 'Fleet', version: '1.0.0', description: '', settings: {}, dependencies: [] };
  await moduleRepository(handle, createTenantContext(SYSTEM_TENANT_ID)).create(input);
  return {
    handle,
    repo: tenantRepository(handle, createTenantContext(SYSTEM_TENANT_ID)),
    otherRepo: tenantRepository(handle, createTenantContext(OTHER_TENANT_ID)),
  };
}

describe('event atomicity with record writes', () => {
  it('commits the record and its event together', async () => {
    const { handle, repo } = await setup();
    const record = await repo.runInTransaction(async (tx) => {
      const created = await repo.createScopedRecord('fleet', 'vehicle', { name: 'Truck' }, undefined, [], tx);
      await repo.appendEvent({ eventType: 'record.created', moduleId: 'fleet', entityId: 'vehicle', recordId: created!.id }, tx);
      return created;
    });
    const events = await handle.db.select().from(eventLog).where(eq(eventLog.recordId, record!.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tenantId: SYSTEM_TENANT_ID, eventType: 'record.created', moduleId: 'fleet', entityId: 'vehicle' });
  });

  it('rolls back the event when the record write fails inside the same transaction', async () => {
    const { handle, repo } = await setup();
    await expect(repo.runInTransaction(async (tx) => {
      const created = await repo.createScopedRecord('fleet', 'vehicle', { name: 'Truck' }, undefined, [], tx);
      await repo.appendEvent({ eventType: 'record.created', moduleId: 'fleet', entityId: 'vehicle', recordId: created!.id }, tx);
      throw new Error('simulated failure after writes');
    })).rejects.toThrow('simulated failure after writes');
    expect(await handle.db.select().from(eventLog)).toHaveLength(0);
    expect(await handle.db.select().from(records)).toHaveLength(0);
  });

  it('writes standalone events outside any caller transaction', async () => {
    const { handle, repo } = await setup();
    await repo.appendEvent({ eventType: 'system.ping' });
    const rows = await handle.db.select().from(eventLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: SYSTEM_TENANT_ID, eventType: 'system.ping' });
  });

  it('scopes events to the repository tenant and never accepts a tenant from the caller', async () => {
    const { handle, otherRepo } = await setup();
    await otherRepo.appendEvent({ eventType: 'other.only' });
    const rows = await handle.db.select().from(eventLog);
    expect(rows.every((row) => row.tenantId === OTHER_TENANT_ID)).toBe(true);
  });
});

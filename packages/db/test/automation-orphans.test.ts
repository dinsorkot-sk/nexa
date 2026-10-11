import { afterEach, describe, expect, it } from 'vitest';
import { automationRepository, createDb, createTenantContext, organizationRepository, runMigrations, SYSTEM_TENANT_ID, tenants } from '../src/index';
import type { DbHandle } from '../src/index';

const handles: DbHandle[] = [];
afterEach(async () => { await Promise.all(handles.splice(0).map((handle) => handle.close())); });

async function setup() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const owner = await organizationRepository(handle).provisionForOwner({
    name: 'Acme', slug: 'acme', email: 'o@acme.test', passwordHash: 'h',
    sessionDigest: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60_000),
  });
  return { runs: automationRepository(handle, createTenantContext(owner.tenant.id)) };
}

describe('orphaned automation runs (Phase 17, Step G follow-up)', () => {
  it('closes only the running runs of the reclaimed job', async () => {
    const { runs } = await setup();
    const orphan = await runs.start({ moduleId: 'fleet', automationId: 'a', triggerType: 'record', correlationId: 'job-1' });
    const other = await runs.start({ moduleId: 'fleet', automationId: 'a', triggerType: 'record', correlationId: 'job-2' });
    const finished = await runs.start({ moduleId: 'fleet', automationId: 'a', triggerType: 'record', correlationId: 'job-1' });
    await runs.finish(finished.id, 'succeeded');

    expect(await runs.closeOrphans('job-1', 'worker stopped')).toBe(1);

    const all = (await runs.list('fleet')).items;
    expect(all.find((r) => r.id === orphan.id)).toMatchObject({ status: 'failed', lastError: 'worker stopped' });
    expect(all.find((r) => r.id === other.id)?.status).toBe('running');
    expect(all.find((r) => r.id === finished.id)?.status).toBe('succeeded');
  });

  it('is a no-op when a job has no running runs', async () => {
    const { runs } = await setup();
    expect(await runs.closeOrphans('nothing-here', 'x')).toBe(0);
  });
});

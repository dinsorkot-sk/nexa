import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, createTenantContext, outboxRepository, backoffDelayMs, outboxBackoffCapMs, outboxLeaseMs, organizationRepository, runMigrations, SYSTEM_TENANT_ID, tenantRepository, tenants } from '../src/index';
import type { DbHandle } from '../src/index';

const handles: DbHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function setup() {
  const handle = createDb({ dataDir: 'memory://' });
  handles.push(handle);
  await runMigrations(handle);
  await handle.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const owner = await organizationRepository(handle).provisionForOwner({
    name: 'Acme', slug: 'acme', email: 'owner@acme.test', passwordHash: 'h',
    sessionDigest: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60_000),
  });
  return { handle, tenantId: owner.tenant.id, outbox: outboxRepository(handle) };
}

describe('outbox repository (Phase 17, Step G)', () => {
  it('enqueues inside the caller transaction and rolls back with it', async () => {
    const { handle, tenantId, outbox } = await setup();
    const repo = tenantRepository(handle, createTenantContext(tenantId));
    await expect(repo.runInTransaction(async (tx) => {
      await outbox.enqueue(tx, { tenantId, kind: 'automation.dispatch', payload: { n: 1 }, dedupeKey: 'rollback-me' });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await outbox.listByStatus(['pending'])).toHaveLength(0);
  });

  it('commits the job together with the change that produced it', async () => {
    const { handle, tenantId, outbox } = await setup();
    const repo = tenantRepository(handle, createTenantContext(tenantId));
    await repo.runInTransaction(async (tx) => {
      await outbox.enqueue(tx, { tenantId, kind: 'automation.dispatch', payload: { n: 1 }, dedupeKey: 'commit-me' });
    });
    expect(await outbox.listByStatus(['pending'])).toHaveLength(1);
  });

  it('ignores a repeated dedupe key for the same tenant', async () => {
    const { handle, tenantId, outbox } = await setup();
    const tx = handle.db;
    const first = await outbox.enqueue(tx, { tenantId, kind: 'k', payload: {}, dedupeKey: 'same' });
    const second = await outbox.enqueue(tx, { tenantId, kind: 'k', payload: {}, dedupeKey: 'same' });
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(await outbox.listByStatus(['pending'])).toHaveLength(1);
  });

  it('never hands the same job to two concurrent workers', async () => {
    const { tenantId, outbox, handle } = await setup();
    for (let i = 0; i < 6; i += 1) await outbox.enqueue(handle.db, { tenantId, kind: 'k', payload: { i }, dedupeKey: `job-${i}` });
    const [a, b] = await Promise.all([outbox.claim({ limit: 4 }), outbox.claim({ limit: 4 })]);
    const ids = [...a, ...b].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(6);
  });

  it('reclaims a job whose lease expired, for a crashed worker', async () => {
    const { tenantId, outbox, handle } = await setup();
    await outbox.enqueue(handle.db, { tenantId, kind: 'k', payload: {}, dedupeKey: 'crash' });
    const start = new Date('2030-01-01T00:00:00Z');
    const first = await outbox.claim({ limit: 1, now: start });
    expect(first).toHaveLength(1);
    expect(await outbox.claim({ limit: 1, now: new Date(start.getTime() + 1000) })).toHaveLength(0);
    const reclaimed = await outbox.claim({ limit: 1, now: new Date(start.getTime() + outboxLeaseMs + 1) });
    expect(reclaimed.map((row) => row.id)).toEqual(first.map((row) => row.id));
  });

  it('refuses to complete a job whose lease expired and was reclaimed', async () => {
    const { tenantId, outbox, handle } = await setup();
    await outbox.enqueue(handle.db, { tenantId, kind: 'k', payload: {}, dedupeKey: 'stale' });
    const start = new Date('2030-01-01T00:00:00Z');
    const [stale] = await outbox.claim({ limit: 1, now: start });
    const late = new Date(start.getTime() + outboxLeaseMs + 1);
    expect(await outbox.complete({ tenantId, id: stale!.id, now: late })).toBe(false);
  });

  it('completes a job within its lease', async () => {
    const { tenantId, outbox, handle } = await setup();
    await outbox.enqueue(handle.db, { tenantId, kind: 'k', payload: {}, dedupeKey: 'ok' });
    const start = new Date('2030-01-01T00:00:00Z');
    const [row] = await outbox.claim({ limit: 1, now: start });
    expect(await outbox.complete({ tenantId, id: row!.id, now: new Date(start.getTime() + 1000) })).toBe(true);
    expect(await outbox.listByStatus(['done'])).toHaveLength(1);
  });

  it('backs off exponentially with a cap, then moves to dead after maxAttempts', async () => {
    const { tenantId, outbox, handle } = await setup();
    await outbox.enqueue(handle.db, { tenantId, kind: 'k', payload: {}, dedupeKey: 'retry', maxAttempts: 3 });
    let now = new Date('2030-01-01T00:00:00Z');
    const outcomes: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [row] = await outbox.claim({ limit: 1, now });
      outcomes.push(await outbox.fail({ tenantId, id: row!.id, error: `attempt ${attempt + 1}`, now }));
      now = new Date(now.getTime() + backoffDelayMs(attempt + 1) + 1);
    }
    expect(outcomes).toEqual(['retry', 'retry', 'dead']);
    expect(await outbox.listByStatus(['dead'])).toHaveLength(1);
  });

  it('caps backoff delay', () => {
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(30)).toBe(outboxBackoffCapMs);
  });

  it('keeps dead rows for inspection rather than deleting them', async () => {
    const { handle, tenantId, outbox } = await setup();
    await outbox.enqueue(handle.db, { tenantId, kind: 'k', payload: {}, dedupeKey: 'keep', maxAttempts: 1 });
    const now = new Date('2030-01-01T00:00:00Z');
    const [row] = await outbox.claim({ limit: 1, now });
    await outbox.fail({ tenantId, id: row!.id, error: 'final', now });
    const [kept] = await handle.db.execute(sql`select status, last_error from nexa_outbox where id = ${row!.id}`).then((r) => r.rows as Array<{ status: string; last_error: string }>);
    expect(kept).toMatchObject({ status: 'dead', last_error: 'final' });
  });
});

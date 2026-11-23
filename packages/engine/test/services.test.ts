import { afterEach, describe, expect, it } from 'vitest';
import {
  AttachmentService, AuditService, AutomationService, PgliteTenantManager, SchedulerService, SequenceService,
} from '../src/index.js';
import { AccessError } from '../src/contracts/index.js';

const managers: PgliteTenantManager[] = [];
async function env() {
  const manager = new PgliteTenantManager({ models: async () => [
    { name: 'sale.order', origin: 'module', fields: { name: { type: 'char' } } },
  ] });
  managers.push(manager);
  const tenant = await manager.open(`services${managers.length}`);
  const execution = tenant.env({ uid: 1 });
  await execution.model('sale.order').create({ name: 'SO-3' });
  return execution;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.closeAll()));
});

describe('engine services', () => {
  it('increments persistent sequences with configured formatting', async () => {
    const execution = await env();
    const sequences = new SequenceService(execution);
    expect(await sequences.next('sale.order', { prefix: 'SO-', padding: 5 })).toBe('SO-00001');
    expect(await sequences.next('sale.order')).toBe('SO-00002');
  });

  it('claims due jobs and records failures', async () => {
    const execution = await env();
    const scheduler = new SchedulerService(execution);
    await scheduler.schedule({ key: 'daily.sync', intervalMs: 60_000, nextRun: new Date('2026-01-01T00:00:00Z') });
    expect(await scheduler.claimDue(5, new Date('2026-01-02T00:00:00Z'))).toEqual([{ id: 1, key: 'daily.sync' }]);
    expect(await scheduler.claimDue(5, new Date('2026-01-02T00:00:00Z'))).toEqual([]);
    await scheduler.recordFailure('daily.sync', new Error('temporary'));
    const [row] = await execution.db.query<{ last_error: string }>({ text: 'SELECT last_error FROM nx_scheduled_job', params: [] });
    expect(row.last_error).toBe('temporary');
    await scheduler.schedule({ key: 'daily.ok', intervalMs: 60_000, nextRun: new Date('2026-01-01T00:00:00Z') });
    await scheduler.schedule({ key: 'daily.fail', intervalMs: 60_000, nextRun: new Date('2026-01-01T00:00:00Z') });
    const dispatched = await scheduler.runDue(new Map([
      ['daily.ok', async () => undefined],
      ['daily.fail', async () => { throw new Error('job failed'); }],
    ]), 5, new Date('2026-01-02T00:00:00Z'));
    expect(dispatched).toEqual({ completed: ['daily.ok'], failed: ['daily.fail'] });
  });

  it('runs registered automation handlers for matching rules', async () => {
    const execution = await env();
    const automation = new AutomationService(execution);
    const seen: number[] = [];
    automation.register('sale.notify', async ({ recordId }) => { seen.push(recordId); });
    await automation.define({ key: 'sale.notify', model: 'sale.order', event: 'create' });
    await automation.trigger('sale.order', 'create', 18, { name: 'SO-18' });
    expect(seen).toEqual([18]);
  });

  it('stores audit messages and tenant-local binary attachments', async () => {
    const execution = await env();
    const audit = new AuditService(execution);
    const id = await audit.post('sale.order', 1, 'Confirmed');
    expect(id).toBeGreaterThan(0);
    expect((await audit.history('sale.order', 1))[0]).toMatchObject({ event: 'message', uid: 1, payload: { message: 'Confirmed' } });

    const attachments = new AttachmentService(execution);
    const bytes = new Uint8Array([0, 1, 127, 255]);
    const attachmentId = await attachments.add({ model: 'sale.order', recordId: 1, name: 'proof.bin', mimetype: 'application/octet-stream', data: bytes });
    expect(await attachments.list('sale.order', 1)).toMatchObject([{ id: attachmentId, name: 'proof.bin', uid: 1 }]);
    expect([...((await attachments.content(attachmentId)) ?? [])]).toEqual([...bytes]);
  });

  it('rejects unprivileged users for chatter, attachments and rule changes', async () => {
    const admin = await env();
    const tenant = await managers[managers.length - 1].open(`services${managers.length}`);
    const user = tenant.env({ uid: 2 });
    await expect(new AutomationService(user).define({ key: 'sale.x', model: 'sale.order', event: 'create' })).rejects.toThrow(AccessError);
    await expect(new SchedulerService(user).schedule({ key: 'daily.x', intervalMs: 1, nextRun: new Date() })).rejects.toThrow(AccessError);
    await expect(new AuditService(user).post('sale.order', 1, 'hi')).rejects.toThrow(AccessError);
    await expect(new AttachmentService(user).add({ model: 'sale.order', recordId: 1, name: 'a', mimetype: 'text/plain', data: new Uint8Array(1) })).rejects.toThrow(AccessError);
    await expect(new AuditService(admin).post('sale.order', 999, 'missing')).rejects.toThrow(AccessError);
  });
});

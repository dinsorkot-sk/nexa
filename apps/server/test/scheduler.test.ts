import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { createApp } from '../hono/app';
import { runWorkerOnce } from '../hono/worker';
import { runSchedulerOnce } from '../hono/scheduler';

const handles: DbHandle[] = [];

type Api = ReturnType<typeof createApp>;
const jsonHeaders = { 'content-type': 'application/json', origin: 'http://localhost:3000' };

async function signup(api: Api, email: string) {
  const response = await api.request('/v1/auth/signup', {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({
      email,
      password: 'long-password',
      displayName: email,
      organization: { name: `${email} organization`, slug: email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
    }),
  });
  const cookie = /nexa_session=([0-9a-f]{64})/.exec(response.headers.get('set-cookie') ?? '')?.[1];
  return `nexa_session=${cookie}`;
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe('the scheduler', () => {
  it('enqueues a scheduled automation when its minute comes, once for that minute', async () => {
    const deliveries: string[] = [];
    const db = createDb({ dataDir: 'memory://' });
    handles.push(db);
    await runMigrations(db);
    await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const deps = { db, emailTransport: { async send(message: { to: string }) { deliveries.push(message.to); return {}; } } };
    const api = createApp(deps);
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/actions', 'POST', { id: 'note', moduleId: 'fleet', name: 'note', label: 'Note', kind: 'notification', config: { to: 'ops@example.com', subject: 'Hourly', body: 'the hourly report' } });
    const created = await call('/automations', 'POST', {
      id: 'hourly', moduleId: 'fleet', name: 'Hourly', enabled: true,
      trigger: { type: 'scheduled', cron: '0 * * * *', timezone: 'UTC' },
      actions: [{ actionId: 'note', input: {} }],
    });
    expect(created.status).toBe(201);

    // The minute the schedule names.
    expect(await runSchedulerOnce(db, new Date('2026-03-01T10:00:00.000Z'))).toBe(1);
    // The same minute cannot be enqueued twice, however often the scheduler runs.
    expect(await runSchedulerOnce(db, new Date('2026-03-01T10:00:30.000Z'))).toBe(0);
    // A minute the schedule does not name.
    expect(await runSchedulerOnce(db, new Date('2026-03-01T10:01:00.000Z'))).toBe(0);
    // The next minute it names.
    expect(await runSchedulerOnce(db, new Date('2026-03-01T11:00:00.000Z'))).toBe(1);

    // The worker delivers the scheduled runs.
    for (let pass = 0; pass < 10 && (await runWorkerOnce(db, deps)) > 0; pass += 1);
    expect(deliveries).toEqual(['ops@example.com', 'ops@example.com']);

    const runs = await call('/automations/hourly/runs', 'GET');
    const runList = await runs.json() as { items: Array<{ triggerType: string; status: string }> };
    expect(runList.items).toHaveLength(2);
    expect(runList.items[0]).toMatchObject({ triggerType: 'scheduled', status: 'succeeded' });
  });

  it('does not enqueue an automation that is switched off', async () => {
    const db = createDb({ dataDir: 'memory://' });
    handles.push(db);
    await runMigrations(db);
    await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const api = createApp({ db });
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/actions', 'POST', { id: 'note', moduleId: 'fleet', name: 'note', label: 'Note', kind: 'notification', config: { to: 'ops@example.com', subject: 'Hourly', body: 'the hourly report' } });
    await call('/automations', 'POST', {
      id: 'hourly', moduleId: 'fleet', name: 'Hourly', enabled: false,
      trigger: { type: 'scheduled', cron: '* * * * *', timezone: 'UTC' },
      actions: [{ actionId: 'note', input: {} }],
    });

    expect(await runSchedulerOnce(db, new Date('2026-03-01T10:00:00.000Z'))).toBe(0);
  });

  it('keeps a schedule in the time zone it was written in', async () => {
    const db = createDb({ dataDir: 'memory://' });
    handles.push(db);
    await runMigrations(db);
    await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const api = createApp({ db });
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/actions', 'POST', { id: 'note', moduleId: 'fleet', name: 'note', label: 'Note', kind: 'notification', config: { to: 'ops@example.com', subject: 'Hourly', body: 'the hourly report' } });
    await call('/automations', 'POST', {
      id: 'morning', moduleId: 'fleet', name: 'Morning', enabled: true,
      trigger: { type: 'scheduled', cron: '0 9 * * *', timezone: 'Asia/Bangkok' },
      actions: [{ actionId: 'note', input: {} }],
    });

    // Nine in Bangkok is two in UTC.
    expect(await runSchedulerOnce(db, new Date('2026-03-01T02:00:00.000Z'))).toBe(1);
    expect(await runSchedulerOnce(db, new Date('2026-03-01T09:00:00.000Z'))).toBe(0);
  });
});

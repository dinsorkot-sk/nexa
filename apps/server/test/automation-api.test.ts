import { afterEach, describe, expect, it } from 'vitest';
import { authRepository, createDb, createTenantContext, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { createApp } from '../hono/app';

const handles: DbHandle[] = [];

async function createTestApp(overrides: Parameters<typeof createApp>[0] = {}) {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  return createApp({ db, ...overrides });
}

type Api = ReturnType<typeof createApp>;
const jsonHeaders = { 'content-type': 'application/json' };

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

describe('automation HTTP surface', () => {
  it('creates an automation, fires it on record create, and records webhook runs', async () => {
    const deliveries: Array<{ url: string; body: unknown }> = [];
    const api = await createTestApp({
      webhookTransport: { async request(config) { deliveries.push({ url: config.url, body: null }); return { status: 200 }; } },
      emailTransport: { async send(message) { deliveries.push({ url: `mailto:${message.to}`, body: message }); return {}; } },
    });
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/actions', 'POST', { id: 'hook', moduleId: 'fleet', name: 'hook', label: 'Hook', kind: 'webhook', config: { url: 'https://example.com/hook' } });
    await call('/actions', 'POST', { id: 'note', moduleId: 'fleet', name: 'note', label: 'Note', kind: 'notification', config: { to: 'ops@example.com', subject: 'Created', body: 'vehicle created' } });

    const created = await call('/automations', 'POST', {
      id: 'on-create', moduleId: 'fleet', name: 'On create', enabled: true,
      trigger: { type: 'record', entityId: 'vehicle', operation: 'created' },
      actions: [{ actionId: 'hook', input: {} }, { actionId: 'note', input: {} }],
    });
    expect(created.status).toBe(201);
    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });

    await call('/entities/vehicle/records', 'POST', { data: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(deliveries.map((d) => d.url)).toEqual(['https://example.com/hook', 'mailto:ops@example.com']);

    const runs = await call('/automations/on-create/runs', 'GET');
    expect(runs.status).toBe(200);
    const runList = await runs.json() as { items: Array<{ automationId: string; status: string }> };
    expect(runList.items).toHaveLength(1);
    expect(runList.items[0]).toMatchObject({ automationId: 'on-create', status: 'succeeded' });
  });

  it('records a failed run with retries when the webhook target errors', async () => {
    let attempts = 0;
    const api = await createTestApp({
      webhookTransport: { async request() { attempts += 1; return { status: 500 }; } },
    });
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/actions', 'POST', { id: 'hook', moduleId: 'fleet', name: 'hook', label: 'Hook', kind: 'webhook', config: { url: 'https://example.com/hook' } });
    await call('/automations', 'POST', {
      id: 'on-create', moduleId: 'fleet', name: 'On create', enabled: true,
      trigger: { type: 'record', entityId: 'vehicle', operation: 'created' },
      actions: [{ actionId: 'hook', input: {} }],
      retry: { maxAttempts: 2 },
    });
    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });

    await call('/entities/vehicle/records', 'POST', { data: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(attempts).toBe(3); // initial + 2 retries

    const runs = await call('/automations/on-create/runs', 'GET');
    const runList = await runs.json() as { items: Array<{ status: string; attempts: number; lastError: string | null }> };
    expect(runList.items[0]).toMatchObject({ status: 'failed', attempts: 3 });
    expect(runList.items[0]!.lastError).toContain('500');
  });

  it('forbids a viewer from managing automations', async () => {
    const db = createDb({ dataDir: 'memory://' });
    handles.push(db);
    await runMigrations(db);
    await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const api = createApp({ db });
    const adminCookie = await signup(api, 'admin@example.com');
    const viewerCookie = await signup(api, 'viewer@example.com');
    const viewer = (await (await import('@nexa/db')).identityRepository(db).findUserByEmail('viewer@example.com'))[0]!;
    const auth = authRepository(db, createTenantContext(viewer.tenantId));
    await auth.removeRole(viewer.id, 'owner');
    await auth.assignRole(viewer.id, 'viewer');
    const adminHeaders = { ...jsonHeaders, cookie: adminCookie };
    await api.request('/v1/modules', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    const response = await api.request('/v1/modules/fleet/automations', {
      method: 'POST', headers: { ...jsonHeaders, cookie: viewerCookie },
      body: JSON.stringify({ id: 'x', name: 'x', trigger: { type: 'event', event: 'record.created' }, actions: [{ actionId: 'a', input: {} }] }),
    });
    expect(response.status).toBe(403);
  });
});

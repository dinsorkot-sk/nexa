import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { createApp } from '../hono/app';

const handles: DbHandle[] = [];

async function createTestApp() {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  return createApp({ db });
}

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

describe('audit and operations HTTP surface', () => {
  it('exposes filtered audit log, event log, and operational stats', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });

    const audit = await api.request('/v1/audit?action=entity.created&limit=10', { headers });
    expect(audit.status).toBe(200);
    const auditBody = await audit.json() as { items: Array<{ action: string }>; total: number };
    expect(auditBody.items.length).toBeGreaterThan(0);
    expect(auditBody.items.every((item) => item.action === 'entity.created')).toBe(true);

    const events = await api.request('/v1/events?limit=10', { headers });
    expect(events.status).toBe(200);
    const eventsBody = await events.json() as { items: unknown[]; total: number };
    expect(eventsBody.total).toBe(0);

    const stats = await api.request('/v1/operations/stats', { headers });
    expect(stats.status).toBe(200);
    expect(await stats.json()).toMatchObject({ modules: 1, failedAutomations: [] });

    const unauthenticated = await api.request('/v1/audit', { headers: jsonHeaders });
    expect(unauthenticated.status).toBe(401);
  });
});

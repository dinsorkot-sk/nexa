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

describe('report and dashboard HTTP surface', () => {
  it('creates a report, runs it over records, and wires a dashboard widget', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/entities/vehicle/fields', 'POST', { id: 'status', name: 'status', label: 'Status', type: 'select', options: { choices: [{ value: 'draft', label: 'Draft' }, { value: 'done', label: 'Done' }] } });
    await call('/entities/vehicle/fields', 'POST', { id: 'price', name: 'price', label: 'Price', type: 'number' });
    const reportCreated = await call('/reports', 'POST', {
      id: 'by-status', moduleId: 'fleet', name: 'By status', entityId: 'vehicle',
      groupBy: ['status'], aggregations: [{ operation: 'count' }, { operation: 'sum', fieldId: 'price' }],
      sort: [{ fieldId: 'status', direction: 'asc' }],
    });
    expect(reportCreated.status).toBe(201);
    const dashboards = await call('/dashboards', 'POST', {
      id: 'ops', moduleId: 'fleet', name: 'Ops',
      widgets: [{ id: 'w1', type: 'bar', reportId: 'by-status', title: 'By status', layout: { x: 0, y: 0, width: 6, height: 4 } }],
    });
    expect(dashboards.status).toBe(201);

    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });
    await call('/entities/vehicle/records', 'POST', { data: { status: 'draft', price: 10 } });
    await call('/entities/vehicle/records', 'POST', { data: { status: 'draft', price: 30 } });
    await call('/entities/vehicle/records', 'POST', { data: { status: 'done', price: 20 } });

    const run = await call('/reports/by-status/run', 'POST', {});
    expect(run.status).toBe(200);
    const result = await run.json() as { groups: Array<{ key: Record<string, unknown>; rowCount: number; aggregates: number[] }> };
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toMatchObject({ key: { status: 'done' }, rowCount: 1, aggregates: [1, 20] });
    expect(result.groups[1]).toMatchObject({ key: { status: 'draft' }, rowCount: 2, aggregates: [2, 40] });

    const list = await call('/dashboards', 'GET');
    expect(await list.json()).toMatchObject([{ id: 'ops' }]);
  });

  it('rejects a report referencing an unknown field and blocks deleting a report used by a dashboard', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (path: string, method: string, body?: unknown) => api.request(`/v1/modules/fleet${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    const bad = await call('/reports', 'POST', { id: 'r', moduleId: 'fleet', name: 'r', entityId: 'vehicle', aggregations: [{ operation: 'sum', fieldId: 'ghost' }] });
    expect(bad.status).toBe(409);

    await call('/entities/vehicle/fields', 'POST', { id: 'price', name: 'price', label: 'Price', type: 'number' });
    expect((await call('/reports', 'POST', { id: 'r', moduleId: 'fleet', name: 'r', entityId: 'vehicle', aggregations: [{ operation: 'sum', fieldId: 'price' }] })).status).toBe(201);
    await call('/dashboards', 'POST', { id: 'd', moduleId: 'fleet', name: 'd', widgets: [{ id: 'w', type: 'kpi', reportId: 'r', title: 'T', layout: { x: 0, y: 0, width: 2, height: 1 } }] });
    const deleted = await call('/reports/r', 'DELETE');
    expect(deleted.status).toBe(409);
  });
});

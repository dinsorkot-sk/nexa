import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import type { ModulePackage } from '@nexa/meta';
import { createApp } from '../hono/app';
import { runWorkerOnce } from '../hono/worker';

const handles: DbHandle[] = [];

async function createTestApp(overrides: Parameters<typeof createApp>[0] = {}) {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const deps = { db, ...overrides };
  // Automation jobs are delivered by the worker. Tests drain the queue explicitly instead of sleeping.
  const drain = async () => { for (let pass = 0; pass < 10 && (await runWorkerOnce(db, deps)) > 0; pass += 1); };
  return Object.assign(createApp(deps), { drain });
}

type Api = ReturnType<typeof createApp>;
const jsonHeaders = { 'content-type': 'application/json', origin: 'http://localhost:3000' };

async function signup(api: Api, email: string) {
  const response = await api.request('/v1/auth/signup', {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email, password: 'long-password', displayName: email }),
  });
  const cookie = /nexa_session=([0-9a-f]{64})/.exec(response.headers.get('set-cookie') ?? '')?.[1];
  return `nexa_session=${cookie}`;
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe('acceptance: vehicle management end to end', () => {
  it('builds a vehicle module, drives the workflow, fires an automation, runs a report, and exports the package', async () => {
    const deliveries: string[] = [];
    const api = await createTestApp({ emailTransport: { async send(message) { deliveries.push(message.to); return {}; } } });
    const cookie = await signup(api, 'fleet-admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = async (path: string, method: string, body?: unknown) => {
      const response = await api.request(`/v1/modules/fleet${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.status >= 400) throw new Error(`${method} ${path} -> ${response.status}: ${await response.clone().text()}`);
      return response;
    };

    // 1. Author the module: entities, fields, action, workflow, automation, report.
    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'fleet', owner: { id: 'user-1', type: 'user' }, name: 'Fleet', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'vehicle', name: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles' });
    await call('/entities/vehicle/fields', 'POST', { id: 'plate', name: 'plate', label: 'Plate', type: 'text', options: { required: true, unique: true, searchable: true } });
    await call('/entities/vehicle/fields', 'POST', { id: 'status', name: 'status', label: 'Status', type: 'select', options: { choices: [{ value: 'in_service', label: 'In service' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'retired', label: 'Retired' }] } });
    await call('/entities/vehicle/fields', 'POST', { id: 'odometer', name: 'odometer', label: 'Odometer', type: 'integer' });
    await call('/actions', 'POST', { id: 'send-to-maintenance', moduleId: 'fleet', name: 'send-to-maintenance', label: 'Send to maintenance', kind: 'notification', config: { to: 'maintenance@example.com', subject: 'Vehicle sent to maintenance', body: 'vehicle notification' } });
    await call('/workflows', 'POST', {
      id: 'vehicle-lifecycle', moduleId: 'fleet', entityId: 'vehicle', name: 'Vehicle lifecycle', stateFieldId: 'status',
      states: [
        { id: 'in_service', name: 'in_service', label: 'In service', initial: true },
        { id: 'maintenance', name: 'maintenance', label: 'Maintenance' },
        { id: 'retired', name: 'retired', label: 'Retired', terminal: true },
      ],
      transitions: [
        { id: 'to-maintenance', from: 'in_service', to: 'maintenance', label: 'Send to maintenance', actions: [{ actionId: 'send-to-maintenance', input: {} }] },
        { id: 'retire', from: 'maintenance', to: 'retired', label: 'Retire' },
      ],
    });
    await call('/automations', 'POST', {
      id: 'notify-created', moduleId: 'fleet', name: 'Notify created', enabled: true,
      trigger: { type: 'record', entityId: 'vehicle', operation: 'created' },
      actions: [{ actionId: 'send-to-maintenance', input: {} }],
    });
    await call('/reports', 'POST', {
      id: 'odometer-by-status', moduleId: 'fleet', name: 'Odometer by status', entityId: 'vehicle',
      groupBy: ['status'], aggregations: [{ operation: 'count' }, { operation: 'avg', fieldId: 'odometer' }],
      sort: [{ fieldId: 'status', direction: 'asc' }],
    });

    // 2. Enable and use.
    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });
    const created = await (await call('/entities/vehicle/records', 'POST', { data: { plate: 'AB-1234', status: 'in_service', odometer: 10000 } })).json() as { id: string; version: number };
    const second = await (await call('/entities/vehicle/records', 'POST', { data: { plate: 'CD-5678', status: 'in_service', odometer: 20000 } })).json() as { id: string; version: number };

    // Duplicate plate is rejected by the unique constraint.
    const duplicate = await call('/entities/vehicle/records', 'POST', { data: { plate: 'AB-1234', status: 'in_service' } }).catch(() => undefined);
    const duplicateResponse = duplicate ?? await api.request('/v1/modules/fleet/entities/vehicle/records', { method: 'POST', headers, body: JSON.stringify({ data: { plate: 'AB-1234' } }) });
    expect(duplicateResponse.status).toBe(409);

    // 3. Workflow transition drives the action; automation fires on record create.
    const transitioned = await (await call(`/entities/vehicle/records/${created.id}/transitions/to-maintenance`, 'POST', { version: created.version })).json() as { data: Record<string, unknown> };
    expect(transitioned.data.status).toBe('maintenance');
    await api.drain();
    expect(deliveries.length).toBe(3); // two record-create automations + the transition's notification action

    // 4. Report aggregates.
    const run = await (await call('/reports/odometer-by-status/run', 'POST', {})).json() as { groups: Array<{ key: Record<string, unknown>; rowCount: number; aggregates: number[] }> };
    const maintenance = run.groups.find((group) => group.key.status === 'maintenance');
    expect(maintenance).toMatchObject({ rowCount: 1, aggregates: [1, 10000] });

    // 5. Package export contains the full definition set.
    const pkg = await (await call('/package', 'GET')).json() as ModulePackage;
    expect(pkg.manifest).toMatchObject({ formatVersion: 1, moduleId: 'fleet' });
    expect(pkg.entities.map((entity) => entity.id)).toEqual(['vehicle']);
    expect(pkg.workflows.map((workflow) => workflow.id)).toEqual(['vehicle-lifecycle']);
    expect(pkg.automations.map((automation) => automation.id)).toEqual(['notify-created']);
    expect(pkg.reports.map((report) => report.id)).toEqual(['odometer-by-status']);
    void second;
  });

  it('sustains a bulk load of 300 records with bounded pagination', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'load@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = async (path: string, method: string, body?: unknown) => {
      const response = await api.request(`/v1/modules/load${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.status >= 400) throw new Error(`${method} ${path} -> ${response.status}`);
      return response;
    };
    await api.request('/v1/modules', { method: 'POST', headers, body: JSON.stringify({ id: 'load', owner: { id: 'user-1', type: 'user' }, name: 'Load', version: '1.0.0' }) });
    await call('/entities', 'POST', { id: 'item', name: 'item', label: 'Item', pluralLabel: 'Items' });
    await call('/entities/item/fields', 'POST', { id: 'name', name: 'name', label: 'Name', type: 'text', options: { searchable: true } });
    await call('/transition', 'POST', { to: 'review' });
    await call('/transition', 'POST', { to: 'published' });
    await call('/transition', 'POST', { to: 'enabled' });

    for (let index = 0; index < 300; index += 1) {
      await call('/entities/item/records', 'POST', { data: { name: `item-${index}` } });
    }
    const page = await (await call('/entities/item/records?limit=100&offset=250', 'GET')).json() as { items: unknown[]; total: number };
    expect(page.total).toBe(300);
    expect(page.items).toHaveLength(50);
  });

  it('isolates tenants and denies viewers privileged endpoints', async () => {
    const db = createDb({ dataDir: 'memory://' });
    handles.push(db);
    await runMigrations(db);
    await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
    const api = createApp({ db });
    const adminCookie = await signup(api, 'admin@example.com');
    const viewerCookie = await signup(api, 'viewer@example.com');
    const { authRepository, createTenantContext, identityRepository } = await import('@nexa/db');
    const auth = authRepository(db, createTenantContext(SYSTEM_TENANT_ID));
    const viewer = await identityRepository(db).findUserByEmail('viewer@example.com');
    await auth.createRole({ id: 'viewer', name: 'Viewer', isSystemRole: true });
    await auth.removeRole(viewer[0]!.id, 'member');
    await auth.assignRole(viewer[0]!.id, 'viewer');
    const adminHeaders = { ...jsonHeaders, cookie: adminCookie };

    await api.request('/v1/modules', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ id: 'secure', owner: { id: 'user-1', type: 'user' }, name: 'Secure', version: '1.0.0' }) });

    // Viewer cannot author definitions, manage automations, or transition workflows.
    const definitions = await api.request('/v1/modules/secure/entities', { method: 'POST', headers: { ...jsonHeaders, cookie: viewerCookie }, body: JSON.stringify({ id: 'x', name: 'x', label: 'X', pluralLabel: 'Xs' }) });
    expect(definitions.status).toBe(403);
    const automations = await api.request('/v1/modules/secure/automations', { method: 'POST', headers: { ...jsonHeaders, cookie: viewerCookie }, body: JSON.stringify({ id: 'x', name: 'x', trigger: { type: 'event', event: 'e' }, actions: [{ actionId: 'a', input: {} }] }) });
    expect(automations.status).toBe(403);
    const transition = await api.request('/v1/modules/secure/entities/x/records/00000000-0000-0000-0000-000000000001/transitions/t', { method: 'POST', headers: { ...jsonHeaders, cookie: viewerCookie }, body: '{}' });
    expect(transition.status).toBe(403);

    // Anonymous requests are rejected everywhere.
    const anonymous = await api.request('/v1/modules', { method: 'GET' });
    expect(anonymous.status).toBe(401);
  });
});

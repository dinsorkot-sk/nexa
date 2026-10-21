import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import type { FieldDefinition, RelationDefinition } from '@nexa/meta';
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

describe('metadata template HTTP surface', () => {
  it('installs a template into the tenant as a draft module', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (moduleId: string, path: string, method: string, body?: unknown) => api.request(`/v1/modules/${moduleId}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    const installed = await call('sales', '/from-template', 'POST', { templateId: 'crm' });
    expect(installed.status).toBe(201);
    await expect(installed.json()).resolves.toMatchObject({ imported: true, template: 'crm', module: { id: 'sales', status: 'draft' } });

    const entities = await call('sales', '/entities', 'GET');
    await expect(entities.json()).resolves.toMatchObject([{ id: 'account' }, { id: 'contact' }, { id: 'deal' }]);

    const fields = await call('sales', '/fields', 'GET');
    const definitions = await fields.json() as FieldDefinition[];
    // A definition id is unique per module, so the field ids carry the entity
    // they belong to. The name a field is shown under is untouched.
    expect(definitions.map((field) => field.id)).toContain('account.name');
    expect(definitions.map((field) => field.id)).toContain('contact.email');
    expect(definitions.find((field) => field.id === 'account.name')?.name).toBe('name');
    expect(definitions.find((field) => field.id === 'account.name')?.entityId).toBe('account');

    const relations = await call('sales', '/relations', 'GET');
    await expect(relations.json()).resolves.toMatchObject([{ id: 'account-contact' }, { id: 'account-deal' }]);
    const stored = await call('sales', '', 'GET');
    await expect(stored.json()).resolves.toMatchObject({ id: 'sales', status: 'draft' });
  });

  it('refuses an unknown template, a taken module id, and a body that is not a template request', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (moduleId: string, path: string, method: string, body?: unknown) => api.request(`/v1/modules/${moduleId}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    const unknown = await call('other', '/from-template', 'POST', { templateId: 'nope' });
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toMatchObject({ error: { code: 'INVALID_INPUT' } });

    const missing = await call('other', '/from-template', 'POST', {});
    expect(missing.status).toBe(400);

    await call('sales', '/from-template', 'POST', { templateId: 'inventory' });
    const again = await call('sales', '/from-template', 'POST', { templateId: 'inventory' });
    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toMatchObject({ error: { code: 'PACKAGE_CONFLICT' } });
  });

  it('names the module the caller chose, and keeps the relations of the template', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'admin@example.com');
    const headers = { ...jsonHeaders, cookie };
    const call = (moduleId: string, path: string, method: string, body?: unknown) => api.request(`/v1/modules/${moduleId}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });

    const named = await call('crm', '/from-template', 'POST', { templateId: 'crm', name: 'Sales CRM' });
    expect(named.status).toBe(201);
    await expect(named.json()).resolves.toMatchObject({ module: { id: 'crm', name: 'Sales CRM' } });

    const relations = await call('crm', '/relations', 'GET');
    const definitions = await relations.json() as RelationDefinition[];
    expect(definitions.map((relation) => relation.sourceEntityId)).toEqual(['account', 'account']);
    expect(definitions.map((relation) => relation.targetEntityId)).toEqual(['contact', 'deal']);
  });
});

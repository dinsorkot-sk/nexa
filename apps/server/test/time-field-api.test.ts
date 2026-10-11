import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { createApp } from '../hono/app';

const handles: DbHandle[] = [];
afterEach(async () => { await Promise.all(handles.splice(0).map((handle) => handle.close())); });

const origin = 'http://localhost:3000';
const json = { 'content-type': 'application/json', origin };

async function setup() {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  const api = createApp({ db });
  const signup = await api.request('/v1/auth/signup', {
    method: 'POST', headers: json,
    body: JSON.stringify({ email: 'o@acme.test', password: 'long-password', displayName: 'o', organization: { name: 'Acme', slug: 'acme' } }),
  });
  const cookie = `nexa_session=${/nexa_session=([0-9a-f]{64})/.exec(signup.headers.get('set-cookie') ?? '')?.[1]}`;
  const headers = { ...json, cookie };
  const call = (path: string, method: string, body?: unknown) => api.request(`/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  await call('/modules', 'POST', { id: 'hr', owner: { id: 'u1', type: 'user' }, name: 'HR', version: '1.0.0' });
  await call('/modules/hr/entities', 'POST', { id: 'shift', name: 'shift', label: 'Shift', pluralLabel: 'Shifts' });
  await call('/modules/hr/entities/shift/fields', 'POST', { id: 'starts', name: 'starts', label: 'Starts', type: 'time', options: {} });
  await call('/modules/hr/entities/shift/fields', 'POST', { id: 'note', name: 'note', label: 'Note', type: 'text', options: {} });
  for (const to of ['review', 'published', 'enabled']) await call('/modules/hr/transition', 'POST', { to });
  return { call, db };
}

describe('time fields over HTTP (Phase 19)', () => {
  it('stores HH:mm and HH:mm:ss exactly as sent', async () => {
    const { call } = await setup();
    const a = await call('/modules/hr/entities/shift/records', 'POST', { data: { starts: '14:30' } });
    expect(a.status).toBe(201);
    expect(((await a.json()) as { data: { starts: string } }).data.starts).toBe('14:30');
    const b = await call('/modules/hr/entities/shift/records', 'POST', { data: { starts: '08:05:09' } });
    expect(b.status).toBe(201);
    expect(((await b.json()) as { data: { starts: string } }).data.starts).toBe('08:05:09');
  });

  it('rejects a timestamp or an invalid time with 422 naming the field', async () => {
    const { call } = await setup();
    for (const starts of ['2026-10-11T14:30:00Z', '25:00', 'noon']) {
      const response = await call('/modules/hr/entities/shift/records', 'POST', { data: { starts } });
      expect(response.status, starts).toBe(422);
      expect(JSON.stringify(await response.json())).toContain('starts');
    }
  });

  it('lets a record that holds a legacy timestamp be edited without touching that field', async () => {
    const { call, db } = await setup();
    const created = await call('/modules/hr/entities/shift/records', 'POST', { data: { starts: '10:00', note: 'a' } });
    const record = (await created.json()) as { id: string; version: number };
    // Simulate data written before the rule: a full timestamp stored in the time field.
    await db.db.execute(`update nexa_records set data = jsonb_set(data, '{starts}', '"2026-10-11T14:30:00Z"') where id = '${record.id}'` as never);

    const edited = await call(`/modules/hr/entities/shift/records/${record.id}`, 'PATCH', { data: { note: 'b' }, version: record.version });
    expect(edited.status).toBe(200);
    const body = (await edited.json()) as { data: { starts: string; note: string } };
    expect(body.data).toMatchObject({ starts: '2026-10-11T14:30:00Z', note: 'b' });
  });
});

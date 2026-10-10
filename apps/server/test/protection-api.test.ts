import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations, SYSTEM_TENANT_ID, tenants } from '@nexa/db';
import type { DbHandle } from '@nexa/db';
import { createApp } from '../hono/app';

const handles: DbHandle[] = [];
const originalEnv = { ...process.env };

async function createTestApp(overrides: { maxBodyBytes?: number } = {}) {
  const db = createDb({ dataDir: 'memory://' });
  handles.push(db);
  await runMigrations(db);
  await db.db.insert(tenants).values({ id: SYSTEM_TENANT_ID, slug: 'system', name: 'System' });
  return createApp({ db, ...overrides });
}

type Api = Awaited<ReturnType<typeof createTestApp>>;
const allowed = 'http://localhost:3000';
const json = { 'content-type': 'application/json' };

async function signup(api: Api, email: string) {
  const response = await api.request('/v1/auth/signup', {
    method: 'POST', headers: { ...json, origin: allowed }, body: JSON.stringify({
      email, password: 'long-password', displayName: email,
      organization: { name: `${email} org`, slug: email.split('@')[0]! },
    }),
  });
  const cookie = /nexa_session=([0-9a-f]{64})/.exec(response.headers.get('set-cookie') ?? '')?.[1];
  return `nexa_session=${cookie}`;
}

afterEach(async () => {
  process.env = { ...originalEnv };
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe('production protections (Phase 17, Step F)', () => {
  it('rejects a cookie-bearing write whose Origin is not allowed', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'owner@acme.test');
    const response = await api.request('/v1/modules', {
      method: 'POST', headers: { ...json, cookie, origin: 'https://evil.example.test' }, body: JSON.stringify({ id: 'x', name: 'x' }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CSRF_REJECTED');
  });

  it('rejects a cookie-bearing write with no Origin header', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'owner@acme.test');
    const response = await api.request('/v1/modules', { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ id: 'x', name: 'x' }) });
    expect(response.status).toBe(403);
  });

  it('does not apply the origin check to requests without a session cookie', async () => {
    const api = await createTestApp();
    const response = await api.request('/v1/auth/login', {
      method: 'POST', headers: { ...json, origin: 'https://evil.example.test' }, body: JSON.stringify({ email: 'nobody@x.test', password: 'long-password' }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects a body that is not application/json on a cookie-bearing write', async () => {
    const api = await createTestApp();
    const cookie = await signup(api, 'owner@acme.test');
    const response = await api.request('/v1/modules', {
      method: 'POST', headers: { 'content-type': 'text/plain', cookie, origin: allowed, 'content-length': '2' }, body: '{}',
    });
    expect(response.status).toBe(415);
  });

  it('rejects an oversized body with 413', async () => {
    const api = await createTestApp({ maxBodyBytes: 64 });
    const response = await api.request('/v1/auth/signup', {
      method: 'POST', headers: { ...json, origin: allowed }, body: JSON.stringify({ email: 'big@x.test', password: 'long-password', padding: 'x'.repeat(200) }),
    });
    expect(response.status).toBe(413);
  });

  it('rate-limits repeated login attempts with 429 and Retry-After', async () => {
    const api = await createTestApp();
    const attempt = () => api.request('/v1/auth/login', {
      method: 'POST', headers: json, body: JSON.stringify({ email: 'nobody@x.test', password: 'long-password' }),
    });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).not.toBeNull();
  });

  it('sends security headers on responses', async () => {
    const api = await createTestApp();
    const response = await api.request('/v1/health');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBeTruthy();
  });

  it('uses the __Host- cookie prefix in production', async () => {
    process.env.NODE_ENV = 'production';
    const api = await createTestApp();
    const response = await api.request('/v1/auth/login', {
      method: 'POST', headers: json, body: JSON.stringify({ email: 'nobody@x.test', password: 'long-password' }),
    });
    expect(response.status).toBe(401);
    const { sessionCookieName } = await import('../hono/middleware/session');
    expect(sessionCookieName()).toBe('__Host-nexa_session');
  });

  it('reports ready when the database answers and unavailable when it does not', async () => {
    const api = await createTestApp();
    const ready = await api.request('/v1/ready');
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ status: 'ready' });

    const unavailable = createApp();
    const response = await unavailable.request('/v1/ready');
    expect(response.status).toBe(503);
  });
});

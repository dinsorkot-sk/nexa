import 'reflect-metadata';
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MailThreadService } from '@nexa/engine';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

const adminPassword = 'portal-test-admin-password';
let app: INestApplication;
let base: URL;
let engine: EngineService;
let adminToken: string;
let partnerId: number;

async function post(path: string, body?: unknown, token?: string) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : {} };
}

async function session() {
  const response = await post('auth/login', { tenant: 'alpha', login: 'admin', password: adminPassword });
  expect(response.status).toBe(200);
  return response.body.accessToken as string;
}

async function share(overrides: Record<string, unknown> = {}) {
  return post('portal/links', {
    model: 'res.partner', recordId: partnerId, fields: ['name', 'email'], ...overrides,
  }, adminToken);
}

function publicRead(token: string) {
  return post('portal/read', undefined, token);
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', 'alpha,beta');
  vi.stubEnv('NEXA_MODULES', 'base,contacts,mail');
  vi.stubEnv('NEXA_PORTAL_MODELS', 'res.partner');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  engine = app.get(EngineService);
  const auth = app.get(AuthService);
  const alpha = (await engine.tenant('alpha')).env({ uid: 1 });
  [partnerId] = (await alpha.model('res.partner').create({
    name: 'Portal Contact', email: 'portal@example.test',
  })).ids;
  await auth.provisionPassword('alpha', 'admin', adminPassword);
  adminToken = await session();
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('single-record portal links', () => {
  it('issues a bounded field projection and reads it without exposing internal fields', async () => {
    const issued = await share();
    expect(issued.status).toBe(201);
    expect(issued.body).toMatchObject({ id: expect.any(Number), expiresAt: expect.any(String) });
    const token = issued.body.token as string;
    expect(token).toMatch(/^nxp1\.alpha\.[A-Za-z0-9_-]{43}$/);

    const result = await publicRead(token);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      model: 'res.partner', id: partnerId,
      values: { name: 'Portal Contact', email: 'portal@example.test' }, messages: [],
    });
    expect((await post('model/res.partner/read', { ids: [partnerId], fields: ['name'] }, token)).status).toBe(401);
  });

  it('requires an enabled model and only explicitly shareable fields', async () => {
    expect((await share({ model: 'res.users' })).status).toBe(403);
    expect((await share({ fields: ['name', 'company_id'] })).status).toBe(422);
    expect((await share({ fields: ['password'] })).status).toBe(422);
  });

  it('requires a Settings login session to issue a link', async () => {
    const body = { model: 'res.partner', recordId: partnerId, fields: ['name'] };
    expect((await post('portal/links', body)).status).toBe(401);
    const root = (await engine.tenant('alpha')).env({ uid: 1 });
    const [companyId] = (await root.model('res.company').search([])).ids;
    const [groupId] = (await root.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
    const login = 'internal-portal-test';
    await root.model('res.users').create({
      name: login, login, company_id: companyId, group_ids: [{ op: 'set', ids: [groupId!] }],
    });
    await app.get(AuthService).provisionPassword('alpha', login, adminPassword);
    const auth = await post('auth/login', { tenant: 'alpha', login, password: adminPassword });
    expect(auth.status).toBe(200);
    expect((await post('portal/links', body, auth.body.accessToken as string)).status).toBe(403);
  });

  it('exposes only public comments when explicitly requested', async () => {
    const root = (await engine.tenant('alpha')).env({ uid: 1 });
    const thread = new MailThreadService(root);
    await thread.post('res.partner', partnerId, { body: '<p>Shared<img src="https://example.test/pixel"></p>' });
    await thread.post('res.partner', partnerId, { body: '<p>Internal</p>', subtype: 'mail.mt_note' });
    const issued = await share({ includeChatter: true });
    expect(issued.status).toBe(201);
    const result = await publicRead(issued.body.token as string);
    expect(result.status).toBe(200);
    expect(result.body.messages).toEqual([{ id: expect.any(Number), date: expect.any(String), subject: null, body: '<p>Shared</p>' }]);
  });

  it('keeps links isolated by tenant, expiry and revocation', async () => {
    const issued = await share();
    const token = issued.body.token as string;
    const [, , secret] = token.split('.');
    expect((await publicRead(`nxp1.beta.${secret}`)).status).toBe(404);
    expect((await publicRead(token)).status).toBe(200);

    const handle = await engine.tenant('alpha');
    const row = await handle.driver.query<{ token_hash: string }>({
      text: 'SELECT token_hash FROM nx_portal_token WHERE id = $1',
      params: [issued.body.id],
    });
    expect(row).toHaveLength(1);
    await handle.driver.query({
      text: "UPDATE nx_portal_token SET expires_at = now() - INTERVAL '1 second' WHERE id = $1",
      params: [issued.body.id],
    });
    expect((await publicRead(token)).status).toBe(404);
    expect(row[0]?.token_hash).toBe(createHash('sha256').update(secret).digest('hex'));

    const fresh = await share();
    expect((await post('portal/links/revoke', { id: fresh.body.id }, adminToken)).status).toBe(200);
    expect((await publicRead(fresh.body.token as string)).status).toBe(404);
  }, 30_000);

  it('invalidates a link when its record is deleted', async () => {
    const issued = await share();
    const token = issued.body.token as string;
    const root = (await engine.tenant('alpha')).env({ uid: 1 });
    await root.model('res.partner').browse(partnerId).unlink();
    expect((await publicRead(token)).status).toBe(404);
  });
});

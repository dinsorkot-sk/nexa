import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

const alphaPassword = 'test-alpha-password-unique';
const betaPassword = 'test-beta-password-unique';
const userPassword = 'test-user-password-unique';
let app: INestApplication;
let base: URL;
let auth: AuthService;
let engine: EngineService;
let alphaAdmin: number;
let userId: number;

async function post(path: string, body?: unknown, token?: string, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const content = await response.text();
  return { status: response.status, body: content ? JSON.parse(content) as Record<string, unknown> : {} };
}

const login = (tenant: string, user: string, password: string) =>
  post('auth/login', { tenant, login: user, password });

async function session(tenant: string, user: string, password: string): Promise<string> {
  const result = await login(tenant, user, password);
  expect(result).toMatchObject({ status: 200, body: { tokenType: 'Bearer', expiresAt: expect.any(String) } });
  expect(typeof result.body.accessToken).toBe('string');
  return result.body.accessToken as string;
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXA_DEV_AUTH', '1');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', 'alpha,beta');
  vi.stubEnv('NEXA_MODULES', 'base');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  auth = app.get(AuthService);
  engine = app.get(EngineService);

  const alpha = (await engine.tenant('alpha')).env({ uid: 1 });
  const beta = (await engine.tenant('beta')).env({ uid: 1 });
  [alphaAdmin] = (await alpha.model('res.users').search([['login', '=', 'admin']])).ids;
  const [companyId] = (await alpha.model('res.company').create({ name: 'Alpha company' })).ids;
  await beta.model('res.company').create({ name: 'Beta company' });
  const [groupId] = (await alpha.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  [userId] = (await alpha.model('res.users').create({
    name: 'API test user', login: 'member', company_id: companyId, group_ids: [groupId],
  })).ids;
  await auth.provisionPassword('alpha', 'admin', alphaPassword);
  await auth.provisionPassword('beta', 'admin', betaPassword);
  await auth.provisionPassword('alpha', 'member', userPassword);
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('tenant-bound authentication', () => {
  it('checks provisioned passwords and binds bearer identity to the tenant', async () => {
    const wrongPassword = await login('alpha', 'admin', betaPassword);
    expect(wrongPassword.status).toBe(401);
    expect(await login('alpha', 'no-such-login', alphaPassword)).toEqual(wrongPassword);
    expect(await login('unknown', 'admin', alphaPassword)).toEqual(wrongPassword);

    const headers = { 'x-nexa-tenant': 'beta', 'x-nexa-uid': String(alphaAdmin) };
    expect((await post('model/res.company/search_read', {}, undefined, headers)).status).toBe(401);
    const token = await session('alpha', 'admin', alphaPassword);
    const response = await post('model/res.company/search_read', { fields: ['name'] }, token, headers);
    expect(response.status).toBe(200);
    const names = (response.body.records as { name: string }[]).map((row) => row.name);
    expect(names).toContain('Alpha company');
    expect(names).not.toContain('Beta company');
    const betaToken = await session('beta', 'admin', betaPassword);
    const betaResponse = await post('model/res.company/search_read', { fields: ['name'] }, betaToken);
    expect(betaResponse).toMatchObject({ status: 200, body: { records: expect.arrayContaining([expect.objectContaining({ name: 'Beta company' })]) } });
  });

  it('uses user ACLs for API keys and supports revocation and session logout', async () => {
    const token = await session('alpha', 'member', userPassword);
    const result = await post('auth/api-keys', { name: 'integration', password: userPassword, expiresInDays: 1 }, token);
    expect([200, 201]).toContain(result.status);
    expect(result.body).toMatchObject({ id: expect.anything(), token: expect.any(String), expiresAt: expect.any(String) });
    const key = result.body.token as string;
    expect((await post('model/res.company/search_read', {}, key)).status).toBe(200);
    expect((await post('model/res.company/create', { values: { name: 'Unauthorized' } }, key)).status).toBe(403);
    expect([401, 403]).toContain((await post('auth/api-keys', { name: 'nested', password: userPassword }, key)).status);
    const adminToken = await session('alpha', 'admin', alphaPassword);
    expect([403, 404]).toContain((await post(`auth/api-keys/${String(result.body.id)}/revoke`, undefined, adminToken)).status);
    expect((await post('model/res.company/search_read', {}, key)).status).toBe(200);
    expect([200, 204]).toContain((await post(`auth/api-keys/${String(result.body.id)}/revoke`, undefined, token)).status);
    expect((await post('model/res.company/search_read', {}, key)).status).toBe(401);
    expect([200, 204]).toContain((await post('auth/logout', undefined, token)).status);
    expect((await post('model/res.company/search_read', {}, token)).status).toBe(401);
  });

  it('cannot issue an API key after the originating session is revoked during password verification', async () => {
    const token = await session('alpha', 'member', userPassword);
    const passwordHasher = auth as unknown as {
      hashPassword(password: string, salt: Buffer): Promise<Buffer>;
    };
    const hashPassword = passwordHasher.hashPassword.bind(passwordHasher);
    let start!: () => void;
    let continueVerification!: () => void;
    const started = new Promise<void>((resolve) => { start = resolve; });
    const resumed = new Promise<void>((resolve) => { continueVerification = resolve; });
    const spy = vi.spyOn(passwordHasher, 'hashPassword').mockImplementationOnce(async (password, salt) => {
      const hash = await hashPassword(password, salt);
      start();
      await resumed;
      return hash;
    });
    const issuing = post('auth/api-keys', { name: 'in-flight key', password: userPassword }, token);
    try {
      await Promise.race([started, issuing.then(() => { throw new Error('Key issuance did not reach password verification'); })]);
      expect((await post('auth/logout', undefined, token)).status).toBe(200);
    } finally {
      continueVerification();
      spy.mockRestore();
    }
    expect((await issuing).status).toBe(401);
  });

  it('invalidates isolated credentials on password rotation and rejects archived users', async () => {
    const token = await session('alpha', 'member', userPassword);
    const createdKey = await post('auth/api-keys', { name: 'rotation', password: userPassword }, token);
    expect([200, 201]).toContain(createdKey.status);
    const key = createdKey.body.token as string;
    const rotatedPassword = 'test-user-password-rotated';
    await auth.provisionPassword('alpha', 'member', rotatedPassword);
    for (const revoked of [token, key]) {
      expect((await post('model/res.company/search_read', {}, revoked)).status).toBe(401);
    }
    expect((await login('alpha', 'member', userPassword)).status).toBe(401);
    const fresh = await session('alpha', 'member', rotatedPassword);
    const unused = await session('alpha', 'member', rotatedPassword);
    const root = (await engine.tenant('alpha')).env({ uid: 1 });
    await root.model('res.users').browse(userId).write({ active: false });
    expect((await post('model/res.company/search_read', {}, fresh)).status).toBe(401);
    expect((await login('alpha', 'member', rotatedPassword)).status).toBe(401);
    await root.model('res.users').browse(userId).write({ active: true });
    expect((await post('model/res.company/search_read', {}, unused)).status).toBe(401);
  });

  it('protects the last active administrator without invalidating the current session', async () => {
    const token = await session('alpha', 'admin', alphaPassword);
    const archived = await post('model/res.users/write', { ids: [alphaAdmin], values: { active: false } }, token);
    expect(archived).toMatchObject({ status: 422, body: { error: { type: 'validation' } } });
    const deleted = await post('model/res.users/unlink', { ids: [alphaAdmin] }, token);
    expect(deleted).toMatchObject({ status: 422, body: { error: { type: 'validation' } } });
    expect((await post('model/res.company/search_read', {}, token)).status).toBe(200);
  });

  it('rejects an expired token and stores only its digest', async () => {
    const token = await session('alpha', 'admin', alphaPassword);
    const hash = createHash('sha256').update(token).digest('hex');
    const { driver } = await engine.tenant('alpha');
    const rows = await driver.query<{ token_hash: string }>({
      text: 'SELECT token_hash FROM nx_auth_token WHERE token_hash = $1 OR token_hash = $2',
      params: [hash, token],
    });
    expect(rows).toEqual([{ token_hash: hash }]);
    await driver.query({
      text: "UPDATE nx_auth_token SET expires_at = now() - INTERVAL '1 minute' WHERE token_hash = $1",
      params: [hash],
    });
    expect((await post('model/res.company/search_read', {}, token)).status).toBe(401);
  });

  it('preserves provisioned credentials after closing and reopening a tenant database', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexa-auth-'));
    const password = 'test-persistent-password';
    vi.stubEnv('NEXA_DATA_DIR', dir);
    const first = new EngineService();
    try {
      const firstAuth = new AuthService(first);
      await firstAuth.provisionPassword('beta', 'admin', password);
      const { token } = await firstAuth.login('beta', 'admin', password, 'first');
      await first.onModuleDestroy();

      const second = new EngineService();
      try {
        const secondAuth = new AuthService(second);
        await expect(secondAuth.authenticate(token)).resolves.toMatchObject({ tenant: 'beta', kind: 'session' });
        await expect(secondAuth.login('beta', 'admin', password, 'second')).resolves.toMatchObject({
          token: expect.any(String),
        });
      } finally {
        await second.onModuleDestroy();
      }
    } finally {
      await first.onModuleDestroy();
      vi.stubEnv('NEXA_DATA_DIR', ':memory:');
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('bounds repeated password rechecks to issue an API key', async () => {
    const token = await session('alpha', 'admin', alphaPassword);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await post('auth/api-keys', { name: 'limited', password: betaPassword }, token)).status).toBe(401);
    }
    expect((await post('auth/api-keys', { name: 'limited', password: alphaPassword }, token)).status).toBe(401);
  });
});

import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PgDriver } from '@nexa/engine';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { loadEngineConfig } from '../src/engine/config';
import { EngineService } from '../src/engine/engine.service';

describe('NEXA_DB configuration', () => {
  it('defaults to pglite and validates the postgres settings', () => {
    expect(loadEngineConfig({})).toMatchObject({ db: 'pglite', pgUrl: null });
    expect(() => loadEngineConfig({ NEXA_DB: 'mysql' })).toThrow(/NEXA_DB/);
    expect(() => loadEngineConfig({ NEXA_DB: 'postgres' })).toThrow(/NEXA_PG_URL is required/);
    expect(() => loadEngineConfig({ NEXA_DB: 'postgres', NEXA_PG_URL: 'not a url' })).toThrow(/valid URL/);
    expect(() => loadEngineConfig({ NEXA_DB: 'postgres', NEXA_PG_URL: 'mysql://h/db' })).toThrow(/postgres:\/\//);
    expect(loadEngineConfig({ NEXA_DB: 'postgres', NEXA_PG_URL: 'postgres://u:p@h:5432/postgres' }))
      .toMatchObject({ db: 'postgres', pgUrl: 'postgres://u:p@h:5432/postgres' });
  });
});

/**
 * Boots the API on a real PostgreSQL server. Needs NEXA_TEST_PG_URL (an admin URL whose role has
 * CREATEDB); the engine's `pnpm test:pg` harness can provide one. Skipped otherwise.
 */
const pgUrl = process.env.NEXA_TEST_PG_URL;
if (!pgUrl) console.warn('[api] skipping NEXA_DB=postgres smoke test: NEXA_TEST_PG_URL is not set');

describe.skipIf(!pgUrl)('API on PostgreSQL (NEXA_DB=postgres)', () => {
  const tenant = `apipg${randomBytes(4).toString('hex')}`;
  const password = 'pg-admin-password-unique';
  let app: INestApplication;
  let base: URL;

  async function post(path: string, body?: unknown, token?: string) {
    const response = await fetch(new URL(`/api/${path}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const content = await response.text();
    return { status: response.status, body: content ? JSON.parse(content) as Record<string, unknown> : {} };
  }

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXA_DB', 'postgres');
    vi.stubEnv('NEXA_PG_URL', pgUrl!);
    vi.stubEnv('NEXA_TENANTS', tenant);
    vi.stubEnv('NEXA_MODULES', 'base');
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    await app.listen(0, '127.0.0.1');
    base = new URL(await app.getUrl());
    const handle = await app.get(EngineService).tenant(tenant);
    expect(handle.driver).toBeInstanceOf(PgDriver);
    await app.get(AuthService).provisionPassword(tenant, 'admin', password);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('logs in and runs CRUD through the HTTP API', async () => {
    const login = await post('auth/login', { tenant, login: 'admin', password });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const created = await post('model/res.partner/create', { values: { name: 'PG partner' } }, token);
    expect(created.status).toBe(200);
    const found = await post('model/res.partner/search_read', { domain: [['name', '=', 'PG partner']], fields: ['name'] }, token);
    expect(found.status).toBe(200);
    const [row] = found.body.records as { id: number; name: string }[];
    expect(row!.name).toBe('PG partner');

    expect((await post('model/res.partner/write', { ids: [row!.id], values: { name: 'PG renamed' } }, token)).status).toBeLessThan(300);
    const read = await post('model/res.partner/read', { ids: [row!.id], fields: ['name', 'write_date'] }, token);
    expect(read.status).toBe(200);
    const [rec] = read.body.records as { name: string; write_date: string }[];
    expect(rec!.name).toBe('PG renamed');
    expect(rec!.write_date).toMatch(/Z$/);

    expect((await post('model/res.partner/unlink', { ids: [row!.id] }, token)).status).toBeLessThan(300);
    const gone = await post('model/res.partner/search_read', { domain: [['id', '=', row!.id]], fields: ['name'] }, token);
    expect(gone.body.records).toEqual([]);
  });
});

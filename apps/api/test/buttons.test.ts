import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ButtonService, ServerActionService } from '@nexa/engine';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

const adminPassword = 'button-admin-password-unique';
const memberPassword = 'button-member-password-unique';
let app: INestApplication;
let base: URL;
let engine: EngineService;
let companyId: number;
let lockedId: number;

async function post(path: string, body?: unknown, token?: string) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const content = await response.text();
  return { status: response.status, body: content ? JSON.parse(content) as Record<string, unknown> : {} };
}

async function session(login: string, password: string): Promise<string> {
  const result = await post('auth/login', { tenant: 'btn', login, password });
  expect(result.status).toBe(200);
  return result.body.accessToken as string;
}

async function companyName(id: number): Promise<string> {
  const [row] = await (await engine.tenant('btn')).env({ uid: 1 }).model('res.company').browse(id).read(['name']);
  return row!.name as string;
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', 'btn');
  vi.stubEnv('NEXA_MODULES', 'base');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  engine = app.get(EngineService);
  const auth = app.get(AuthService);
  const su = (await engine.tenant('btn')).env({ uid: 1 });
  [companyId] = (await su.model('res.company').create({ name: 'Acme' })).ids;
  [lockedId] = (await su.model('res.company').create({ name: 'Locked' })).ids;
  const [groupId] = (await su.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  await su.model('res.users').create({
    name: 'Button member', login: 'member', company_id: companyId, company_ids: [companyId, lockedId], group_ids: [groupId],
  });
  await new ServerActionService(su).define({
    key: 'btn.close', model: 'res.company', type: 'update_record', values: { name: "name + ' (closed)'" },
  });
  await new ButtonService(su).define({ model: 'res.company', action: 'btn.close', guard: "name != 'Locked'" });
  await auth.provisionPassword('btn', 'admin', adminPassword);
  await auth.provisionPassword('btn', 'member', memberPassword);
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('POST /api/model/:model/button', () => {
  it('requires authentication and a well-formed body', async () => {
    expect((await post('model/res.company/button', { ids: [companyId], action: 'btn.close' })).status).toBe(401);
    const token = await session('admin', adminPassword);
    expect((await post('model/res.company/button', { ids: [companyId] }, token)).status).toBe(400);
    expect((await post('model/res.company/button', { ids: [companyId], action: 'btn.close', method: 'x' }, token)).status).toBe(400);
    expect((await post('model/res.company/button', { ids: [], action: 'btn.close' }, token)).status).toBe(400);
  });

  it('runs a guarded action button as the authenticated user', async () => {
    const admin = await session('admin', adminPassword);
    const member = await session('member', memberPassword);

    // the member can see the company but has no write access: the action runs with their rights
    const denied = await post('model/res.company/button', { ids: [companyId], action: 'btn.close' }, member);
    expect(denied.status).toBe(403);
    expect(await companyName(companyId)).toBe('Acme');

    const ok = await post('model/res.company/button', { ids: [companyId], action: 'btn.close' }, admin);
    expect(ok).toEqual({ status: 200, body: { result: true } });
    expect(await companyName(companyId)).toBe('Acme (closed)');

    const guarded = await post('model/res.company/button', { ids: [lockedId], action: 'btn.close' }, admin);
    expect(guarded.status).toBe(422);
    expect(guarded.body).toMatchObject({ error: { type: 'user' } });
    expect(await companyName(lockedId)).toBe('Locked');

    // only registered action buttons can be invoked
    expect((await post('model/res.company/button', { ids: [companyId], action: 'btn.unknown' }, admin)).status).toBe(403);
  });
});

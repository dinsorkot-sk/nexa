import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureBodyParsers } from '../src/engine/body-limits';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

const adminPassword = 'dt-admin-password-unique';
const memberPassword = 'dt-member-password-unique';
let app: INestApplication;
let base: URL;
let admin: string;
let member: string;

interface ApiBody {
  [key: string]: unknown;
  ids?: number[]; id?: number; ok?: boolean; csv?: string; rows?: unknown; templates?: unknown[]; filters?: { id: number }[];
}

async function post(path: string, body?: unknown, token?: string) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const content = await response.text();
  return { status: response.status, body: content ? JSON.parse(content) as ApiBody : {} };
}

async function session(login: string, password: string): Promise<string> {
  const result = await post('auth/login', { tenant: 'dtx', login, password });
  expect(result.status).toBe(200);
  return result.body.accessToken as string;
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', 'dtx');
  vi.stubEnv('NEXA_MODULES', 'base,contacts');
  const nest = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, abortOnError: false, bodyParser: false });
  configureBodyParsers(nest);
  app = nest;
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  const engine = app.get(EngineService);
  const auth = app.get(AuthService);
  const su = (await engine.tenant('dtx')).env({ uid: 1 });
  const [companyId] = (await su.model('res.company').search([], { limit: 1 })).ids;
  const [groupId] = (await su.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  await su.model('res.users').create({ name: 'DT member', login: 'member', company_id: companyId, company_ids: [companyId], group_ids: [groupId] });
  await auth.provisionPassword('dtx', 'admin', adminPassword);
  await auth.provisionPassword('dtx', 'member', memberPassword);
  admin = await session('admin', adminPassword);
  member = await session('member', memberPassword);
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('import / export API', () => {
  it('requires authentication and validates bodies', async () => {
    expect((await post('model/res.partner/export', { fields: ['name'] })).status).toBe(401);
    expect((await post('model/res.partner/export', { fields: [] }, member)).status).toBe(400);
    expect((await post('model/res.partner/export', { fields: ['name'], extra: 1 }, member)).status).toBe(400);
    expect((await post('model/res.partner/import', { header: ['name'] }, member)).status).toBe(400);
    expect((await post('model/res.partner/import', { header: ['name'], rows: [], csv: 'name\n' }, member)).status).toBe(400);
    expect((await post('model/res.partner/import', { header: ['nope'], rows: [['x']] }, member)).status).toBe(422);
  });

  it('dry-runs, imports and exports as the caller', async () => {
    const header = ['id', 'name', 'Type', 'email'];
    const rows = [['p_one', 'One', 'Company', 'one@example.test'], ['p_two', 'Two', 'person', null]];
    const dry = await post('model/res.partner/import', { header, rows, dryRun: true }, member);
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ ok: true, dryRun: true, created: 2, ids: [] });

    const done = await post('model/res.partner/import', { csv: 'id,name,Type\r\np_one,One,Company\r\np_two,Two,person\r\n' }, member);
    expect(done.body).toMatchObject({ ok: true, created: 2 });
    const ids = done.body.ids!;

    const exported = await post('model/res.partner/export', { ids, fields: ['id', 'name', 'company_type'] }, member);
    expect(exported.status).toBe(200);
    expect(exported.body.rows).toEqual([['__import__.p_one', 'One', 'company'], ['__import__.p_two', 'Two', 'person']]);
    const csv = await post('model/res.partner/export', { domain: [['name', '=', 'One']], fields: ['name'], format: 'csv' }, member);
    expect(csv.body.csv).toBe('name\r\nOne\r\n');

    const bad = await post('model/res.partner/import', { header: ['name', 'company_type'], rows: [['Ok', 'person'], ['Bad', 'robot']] }, member);
    expect(bad.status).toBe(200);
    expect(bad.body).toMatchObject({ ok: false, ids: [], errors: [expect.objectContaining({ row: 2, field: 'company_type' })] });
    expect((await post('model/res.partner/search_count', { domain: [['name', '=', 'Ok']] }, member)).body).toEqual({ count: 0 });
  });

  it('accepts import bodies above the 100kb default while other routes keep it', async () => {
    const rows = Array.from({ length: 400 }, (_, i) => [`Bulk ${i} ${'x'.repeat(300)}`]);
    expect(JSON.stringify(rows).length).toBeGreaterThan(120_000);
    const big = await post('model/res.partner/import', { header: ['name'], rows, dryRun: true }, member);
    expect(big.status).toBe(200);
    expect(big.body).toMatchObject({ ok: true, dryRun: true, created: 400 });
    const other = await post('model/res.partner/search_count', { domain: [['name', '=', 'y'.repeat(9_000)]], pad: 'z'.repeat(200_000) }, member);
    expect(other.status).toBe(413);
  }, 60_000);

  it('applies ACLs to import', async () => {
    const res = await post('model/res.users/import', { header: ['name', 'login'], rows: [['X', 'x']] }, member);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });
});

describe('export templates and filters API', () => {
  it('manages per-user templates', async () => {
    const created = await post('model/res.partner/export_templates/create', { name: 'Basic', fields: ['name', 'email'] }, member);
    expect(created.status).toBe(200);
    expect((await post('model/res.partner/export_templates/list', {}, member)).body.templates).toHaveLength(1);
    expect((await post('model/res.partner/export_templates/list', {}, admin)).body.templates).toHaveLength(0);
    expect((await post(`export_templates/${created.body.id}/delete`, {}, admin)).status).toBe(403);
    expect((await post(`export_templates/${created.body.id}/delete`, {}, member)).status).toBe(200);
  });

  it('manages own filters; shared filters are admin-only', async () => {
    const mine = await post('model/res.partner/filters/create', { name: 'Companies', domain: [['company_type', '=', 'company']], isDefault: true }, member);
    expect(mine.status).toBe(200);
    expect((await post('model/res.partner/filters/create', { name: 'Shared', shared: true }, member)).status).toBe(403);
    expect((await post('model/res.partner/filters/create', { name: 'Bad', domain: [['nope', '=', 1]] }, member)).status).toBe(422);
    const shared = await post('model/res.partner/filters/create', { name: 'Shared', shared: true }, admin);
    expect(shared.status).toBe(200);
    const list = await post('model/res.partner/filters/list', {}, member);
    expect(list.body.filters!.map((f) => f.id)).toEqual([mine.body.id, shared.body.id]);
    expect((await post(`filters/${shared.body.id}/update`, { name: 'x' }, member)).status).toBe(403);
    expect((await post(`filters/${mine.body.id}/update`, { name: 'Firms', sort: 'name desc' }, member)).status).toBe(200);
    expect((await post(`filters/${mine.body.id}/delete`, {}, admin)).status).toBe(403);
    expect((await post(`filters/${mine.body.id}/delete`, {}, member)).status).toBe(200);
    expect((await post(`filters/${shared.body.id}/delete`, {}, admin)).status).toBe(200);
  });
});

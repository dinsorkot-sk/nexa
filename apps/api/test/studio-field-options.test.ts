import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

const TENANT = 'studioopts';
const adminPassword = 'studioopts-admin-password-unique';
const memberPassword = 'studioopts-member-password-unique';
let app: INestApplication;
let base: URL;
let admin: string;
let member: string;

async function post(path: string, body: unknown, token?: string) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const content = await response.text();
  return { status: response.status, body: (content ? JSON.parse(content) : {}) as Record<string, unknown> };
}
async function get(path: string, token: string) {
  const response = await fetch(new URL(`/api/${path}`, base), { headers: { authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
const ok = async (path: string, body: unknown, token = admin) => {
  const r = await post(path, body, token);
  if (r.status !== 200) throw new Error(`${path}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const field = (model: string, name: string, extra: Record<string, unknown>) =>
  post('studio/field', { model, name, ...extra }, admin);

async function session(login: string, password: string): Promise<string> {
  const result = await post('auth/login', { tenant: TENANT, login, password });
  expect(result.status).toBe(200);
  return result.body.accessToken as string;
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', TENANT);
  vi.stubEnv('NEXA_MODULES', 'base,mail');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  const engine = app.get(EngineService);
  const auth = app.get(AuthService);
  const su = (await engine.tenant(TENANT)).env({ uid: 1 });
  const [companyId] = (await su.model('res.company').search([], { limit: 1 })).ids;
  const [groupId] = (await su.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  await su.model('res.users').create({
    name: 'Opts member', login: 'member', company_id: companyId, company_ids: [companyId], group_ids: [groupId],
  });
  await auth.provisionPassword(TENANT, 'admin', adminPassword);
  await auth.provisionPassword(TENANT, 'member', memberPassword);
  admin = await session('admin', adminPassword);
  member = await session('member', memberPassword);
  for (const name of ['x_parent', 'x_child']) {
    await ok('studio/model', { name, description: name });
    await ok('model/ir.model.access/create', {
      values: { name: `${name} users`, model_name: name, group_id: groupId, perm_read: true, perm_write: true, perm_create: true, perm_unlink: true },
    });
  }
  await ok('studio/field', { model: 'x_parent', name: 'x_name', type: 'char' });
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('Studio field options over HTTP', () => {
  it('round-trips every option through the Studio listing', async () => {
    await ok('studio/field', { model: 'x_parent', name: 'x_note', type: 'char', default: 'hi', readonly: true, index: true, help: 'Note' });
    await ok('studio/field', { model: 'x_parent', name: 'x_level', type: 'integer', default: 3, ratchet: 'up' });
    await ok('studio/field', { model: 'x_parent', name: 'x_locked', type: 'char', writeGroups: ['base.group_system'] });
    await ok('studio/field', { model: 'x_parent', name: 'x_partner_id', type: 'many2one', comodel: 'res.partner', checkCompany: true, ondelete: 'restrict' });
    const models = (await get('studio/models', admin)).body.models as { name: string; fields: Record<string, unknown>[] }[];
    const fields = Object.fromEntries(models.find((m) => m.name === 'x_parent')!.fields.map((f) => [f.name as string, f]));
    expect(fields.x_note).toMatchObject({ default: 'hi', readonly: true, index: true, help: 'Note' });
    expect(fields.x_level).toMatchObject({ default: 3, ratchet: 'up' });
    expect(fields.x_locked).toMatchObject({ writeGroups: ['base.group_system'] });
    expect(fields.x_partner_id).toMatchObject({ checkCompany: true, ondelete: 'restrict' });
    const created = await ok('model/x_parent/create', { values: { x_name: 'p' } }, member);
    const id = (created.ids as number[])[0]!;
    const read = await ok('model/x_parent/read', { ids: [id], fields: ['x_note', 'x_level'] }, member);
    expect((read.records as Record<string, unknown>[] ?? read.result as Record<string, unknown>[])[0]).toMatchObject({ x_note: 'hi', x_level: 3 });
  });

  it('cascades x_child rows when the parent is deleted', async () => {
    await ok('studio/field', { model: 'x_child', name: 'x_parent_id', type: 'many2one', comodel: 'x_parent', ondelete: 'cascade' });
    const parent = ((await ok('model/x_parent/create', { values: { x_name: 'c' } }, member)).ids as number[])[0]!;
    await ok('model/x_child/create', { values: { x_parent_id: parent } }, member);
    await ok('model/x_parent/unlink', { ids: [parent] }, member);
    const count = await ok('model/x_child/search_count', { domain: [['x_parent_id', '=', parent]] }, admin);
    expect(count.count ?? count.result).toBe(0);
  });

  it('blocks writes to a writeGroups field for non-members', async () => {
    const parent = ((await ok('model/x_parent/create', { values: { x_name: 'w' } }, member)).ids as number[])[0]!;
    const denied = await post('model/x_parent/write', { ids: [parent], values: { x_locked: 'nope' } }, member);
    expect(denied.status).toBe(403);
    await ok('model/x_parent/write', { ids: [parent], values: { x_locked: 'fine' } }, admin);
  });

  it('refuses cascade on module-owned models but allows restrict', async () => {
    const cascade = await field('res.partner', 'x_casc_id', { type: 'many2one', comodel: 'x_parent', ondelete: 'cascade' });
    expect(cascade.status).toBeGreaterThanOrEqual(400);
    expect(cascade.status).toBeLessThan(500);
    expect(JSON.stringify(cascade.body)).toMatch(/module-owned/);
    expect((await field('res.partner', 'x_restrict_id', { type: 'many2one', comodel: 'x_parent', ondelete: 'restrict' })).status).toBe(200);
    const req = await field('x_parent', 'x_req_locked', { type: 'char', required: true, writeGroups: ['base.group_system'] });
    expect(req.status).toBeGreaterThanOrEqual(400);
    expect(req.status).toBeLessThan(500);
  });

  it('rejects invalid option combinations with 4xx', async () => {
    const bad = [
      { name: 'x_b1', type: 'char', ratchet: 'up' },
      { name: 'x_b2', type: 'char', ondelete: 'cascade' },
      { name: 'x_b3', type: 'char', checkCompany: true },
      { name: 'x_b4', type: 'char', writeGroups: ['no.such_group'] },
      { name: 'x_b5', type: 'integer', default: 'abc' },
      { name: 'x_b6', type: 'many2one', comodel: 'res.partner', default: 1 },
      { name: 'x_b7', type: 'char', ratchet: 'down' },
      { name: 'x_b8', type: 'many2one', comodel: 'res.partner', ondelete: 'nuke' },
      { name: 'x_b9', type: 'char', index: 'yes' },
    ];
    for (const b of bad) {
      const r = await field('x_parent', b.name, { ...b, name: b.name });
      expect(r.status, JSON.stringify(b)).toBeGreaterThanOrEqual(400);
      expect(r.status, JSON.stringify(b)).toBeLessThan(500);
    }
  });
});

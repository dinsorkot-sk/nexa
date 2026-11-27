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

  const client = (r: { status: number }) => r.status >= 400 && r.status < 500;

  it('unique: round-trips, refuses duplicates and allows nulls', async () => {
    await ok('studio/field', { model: 'x_parent', name: 'x_code', type: 'char', unique: true });
    const models = (await get('studio/models', admin)).body.models as { name: string; fields: Record<string, unknown>[] }[];
    expect(models.find((m) => m.name === 'x_parent')!.fields.find((f) => f.name === 'x_code')).toMatchObject({ unique: true });
    await ok('model/x_parent/create', { values: { x_name: 'u1', x_code: 'A-1' } }, member);
    const dup = await post('model/x_parent/create', { values: { x_name: 'u2', x_code: 'A-1' } }, member);
    expect(client(dup), JSON.stringify(dup)).toBe(true);
    expect(JSON.stringify(dup.body)).toMatch(/[Dd]uplicate/);
    await ok('model/x_parent/create', { values: { x_name: 'u3' } }, member);
    await ok('model/x_parent/create', { values: { x_name: 'u4' } }, member);
  });

  it('unique: refused on fields without a plain comparable column', async () => {
    const bad = [
      { name: 'x_u1', type: 'one2many', comodel: 'x_child', inverseName: 'x_parent_id' },
      { name: 'x_u2', type: 'many2many', comodel: 'res.partner' },
      { name: 'x_u3', type: 'boolean' },
      { name: 'x_u4', type: 'char', computeExpr: "'x'", store: true },
      { name: 'x_u5', type: 'char', translate: true },
      { name: 'x_u6', type: 'char', unique: 'yes' },
    ];
    for (const b of bad) {
      const r = await field('x_parent', b.name, { unique: true, ...b });
      expect(client(r), JSON.stringify([b, r])).toBe(true);
    }
  });

  it('unique: refuses a literal default or copy, and copy() skips a unique value', async () => {
    for (const b of [{ name: 'x_ud1', default: 'same' }, { name: 'x_ud2', copy: true }]) {
      const r = await field('x_parent', b.name, { type: 'char', unique: true, ...b });
      expect(client(r) && JSON.stringify(r.body), JSON.stringify(b)).toMatch(/is unique, so it cannot/);
    }
    const source = ((await ok('model/x_parent/create', { values: { x_name: 'orig', x_code: 'COPY-1' } }, member)).ids as number[])[0]!;
    // copied as the admin: x_parent also has a writeGroups field, and copy() writes it even when empty
    const copied = ((await ok('model/x_parent/copy', { id: source })).ids as number[])[0]!;
    const read = await ok('model/x_parent/read', { ids: [copied], fields: ['x_code'] }, member);
    expect(((read.records ?? read.result) as Record<string, unknown>[])[0]).toMatchObject({ x_code: null });
  });

  it('res.company: accepts optional lock-date fields enforced by writeGroups and ratchet', async () => {
    await ok('studio/field', { model: 'res.company', name: 'x_hard_lock', type: 'date', ratchet: 'up', writeGroups: ['base.group_system'] });
    const search = await ok('model/res.company/search_read', { fields: ['id'], limit: 1 });
    const company = ((search.records ?? search.result) as { id: number }[])[0]!.id;
    await ok('model/res.company/write', { ids: [company], values: { x_hard_lock: '2026-01-31' } });
    const lower = await post('model/res.company/write', { ids: [company], values: { x_hard_lock: '2026-01-01' } }, admin);
    expect(client(lower) && JSON.stringify(lower.body)).toMatch(/can only increase/);
    // only base.group_system can write res.company, so writeGroups is exercised with a group the admin lacks
    await ok('model/res.groups/create', { values: { name: 'Lock auditors', code: 'x_lock.auditor' } });
    await ok('studio/field', { model: 'res.company', name: 'x_audit_lock', type: 'date', writeGroups: ['x_lock.auditor'] });
    const denied = await post('model/res.company/write', { ids: [company], values: { x_audit_lock: '2026-01-31' } }, admin);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).toMatch(/read-only for you/);
    // every internal user still reads companies with the default field list
    const memberRead = await ok('model/res.company/read', { ids: [company] }, member);
    expect(String(((memberRead.records ?? memberRead.result) as Record<string, unknown>[])[0]!.x_hard_lock)).toMatch(/^2026-01-31/);
    // core code and the HTTP API still create companies without knowing the fields
    await ok('model/res.company/create', { values: { name: 'Studio second company' } });
    const su = (await app.get(EngineService).tenant(TENANT)).env({ uid: 1 });
    expect((await su.model('res.company').create({ name: 'Studio third company' })).ids).toHaveLength(1);
  });

  it('res.company: refuses required, unique, computed, checkCompany, restrict and x2many fields, mixins and views', async () => {
    const bad = [
      { name: 'x_c1', type: 'char', required: true, default: 'x' },
      { name: 'x_c2', type: 'char', unique: true },
      { name: 'x_c3', type: 'char', computeExpr: "'x'" },
      { name: 'x_c4', type: 'char', defaultExpr: "'x'" },
      { name: 'x_c5', type: 'many2many', comodel: 'res.partner' },
      { name: 'x_c6', type: 'one2many', comodel: 'x_child', inverseName: 'x_parent_id' },
      { name: 'x_c7', type: 'many2one', comodel: 'res.partner', checkCompany: true },
      { name: 'x_c8', type: 'many2one', comodel: 'res.partner', ondelete: 'restrict' },
    ];
    for (const b of bad) {
      const r = await field('res.company', b.name, b);
      expect(client(r) && JSON.stringify(r.body), JSON.stringify(b)).toMatch(/must be optional, non-unique/);
    }
    await ok('studio/field', { model: 'res.company', name: 'x_bank_partner_id', type: 'many2one', comodel: 'res.partner', ondelete: 'set null' });
    const mixin = await post('studio/mixin/attach', { model: 'res.company', mixin: 'mail.thread' }, admin);
    expect(client(mixin) && JSON.stringify(mixin.body)).toMatch(/cannot modify the model 'res.company'/);
    const view = await post('studio/view', { model: 'res.company', name: 'x_company_form', type: 'form', arch: { tag: 'form' } }, admin);
    expect(client(view) && JSON.stringify(view.body)).toMatch(/only be added to custom models/);
    // the other protected models stay closed to fields
    for (const model of ['res.users', 'res.groups', 'decimal.precision']) {
      const r = await field(model, 'x_note', { type: 'char' });
      expect(client(r) && JSON.stringify(r.body), model).toMatch(/cannot modify the model/);
    }
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

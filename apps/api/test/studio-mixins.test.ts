import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

const TENANT = 'studiomix';
const adminPassword = 'studiomix-admin-password-unique';
const memberPassword = 'studiomix-member-password-unique';
let app: INestApplication;
let base: URL;
let admin: string;
let member: string;

async function request(method: 'GET' | 'POST', path: string, body?: unknown, token?: string) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const content = await response.text();
  return { status: response.status, body: content ? JSON.parse(content) as Record<string, unknown> : {} };
}
const post = (path: string, body: unknown, token?: string) => request('POST', path, body, token);
const get = (path: string, token?: string) => request('GET', path, undefined, token);

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
    name: 'Studio member', login: 'member', company_id: companyId, company_ids: [companyId], group_ids: [groupId],
  });
  await auth.provisionPassword(TENANT, 'admin', adminPassword);
  await auth.provisionPassword(TENANT, 'member', memberPassword);
  admin = await session('admin', adminPassword);
  member = await session('member', memberPassword);
  expect((await post('studio/model', { name: 'x_ticket', description: 'Ticket' }, admin)).status).toBe(200);
  expect((await post('studio/field', { model: 'x_ticket', name: 'x_title', type: 'char', label: 'Title' }, admin)).status).toBe(200);
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('Studio mixins', () => {
  it('lists available abstract mixins for admins only', async () => {
    const list = await get('studio/mixins', admin);
    expect(list.status).toBe(200);
    const names = (list.body.available as { name: string }[]).map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(['mail.thread', 'mail.activity.mixin']));
    expect((await get('studio/mixins', member)).status).toBe(403);
  });

  it('rejects attach/detach from normal users and malformed requests', async () => {
    expect((await post('studio/mixin/attach', { model: 'x_ticket', mixin: 'mail.thread' }, member)).status).toBe(403);
    expect((await post('studio/mixin/detach', { model: 'x_ticket', mixin: 'mail.thread', confirmDestructive: true }, member)).status).toBe(403);
    expect((await post('studio/mixin/attach', { model: 'x_ticket', mixin: 'Mail Thread' }, admin)).status).toBe(400);
    expect((await post('studio/mixin/attach', { model: 'x_ticket', mixin: 'mail.thread', extra: 1 }, admin)).status).toBe(400);
    expect((await post('studio/mixin/attach', { model: 'x_ticket', mixin: 'mail.message' }, admin)).status).toBe(422);
    for (const mixin of ['mail-thread', 'mail/thread', 'mailxthread']) {
      expect((await post('studio/mixin/attach', { model: 'x_ticket', mixin }, admin)).status).toBe(400);
    }
  });

  it('authorizes before validating the body, so non-admins never see schema errors', async () => {
    for (const path of ['studio/mixin/attach', 'studio/mixin/detach', 'studio/field']) {
      const res = await post(path, { model: 'NOT VALID', bogus: true }, member);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toMatch(/model:|bogus/);
    }
  });

  it('refuses protected and abstract targets for mixins and fields', async () => {
    for (const model of ['res.users', 'res.groups', 'ir.actions.server', 'mail.message', 'mail.thread']) {
      expect((await post('studio/mixin/attach', { model, mixin: 'mail.activity.mixin' }, admin)).status).toBe(422);
    }
    expect((await post('studio/field', { model: 'res.users', name: 'x_nick', type: 'char' }, admin)).status).toBe(422);
    expect((await post('studio/field', { model: 'decimal.precision', name: 'x_nick', type: 'char' }, admin)).status).toBe(422);
    expect((await post('studio/field', { model: 'res.partner', name: 'x_nick', type: 'char' }, admin)).status).toBe(200);
  });

  it('rejects tracked fields on models without mail.thread', async () => {
    const res = await post('studio/field', { model: 'x_ticket', name: 'x_early', type: 'char', tracking: true }, admin);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('mail.thread');
  });

  it('attaches mail.thread and mail.activity.mixin, then posts, tracks and schedules through the API', async () => {
    const thread = await post('studio/mixin/attach', { model: 'x_ticket', mixin: 'mail.thread' }, admin);
    expect(thread.status).toBe(200);
    expect(Object.keys(thread.body.fields as object)).toEqual(expect.arrayContaining(['message_ids', 'x_title']));
    const activity = await post('studio/mixin/attach', { model: 'x_ticket', mixin: 'mail.activity.mixin' }, admin);
    expect(activity.status).toBe(200);
    expect(Object.keys(activity.body.fields as object)).toEqual(expect.arrayContaining(['activity_ids', 'activity_state']));
    expect((await post('studio/mixin/attach', { model: 'x_ticket', mixin: 'mail.thread' }, admin)).status).toBe(422);
    expect((await post('studio/field', { model: 'x_ticket', name: 'x_subject', type: 'char', label: 'Subject', tracking: true }, admin)).status).toBe(200);

    const listed = await get('studio/mixins', admin);
    expect(listed.body.attached).toEqual(expect.arrayContaining([
      { model: 'x_ticket', mixin: 'mail.thread' }, { model: 'x_ticket', mixin: 'mail.activity.mixin' },
    ]));

    const created = await post('model/x_ticket/create', { values: { x_title: 'First', x_subject: 'One' } }, admin);
    expect(created.status).toBe(200);
    const [id] = created.body.ids as number[];
    const posted = await post('model/x_ticket/call/message_post', { ids: [id], args: [{ body: 'Hello there' }] }, admin);
    expect(posted.status).toBe(200);
    expect((posted.body.result as number[]).length).toBe(1);

    expect((await post('model/x_ticket/write', { ids: [id], values: { x_subject: 'Two' } }, admin)).status).toBe(200);
    const messages = await post('model/mail.message/search_read', {
      domain: [['model', '=', 'x_ticket'], ['res_id', '=', id]], fields: ['body', 'tracking_value_ids'],
    }, admin);
    expect(messages.status).toBe(200);
    const records = messages.body.records as { body: string | null; tracking_value_ids: number[] }[];
    expect(records.some((m) => (m.body ?? '').includes('Hello there'))).toBe(true);
    const trackingIds = records.flatMap((m) => m.tracking_value_ids);
    expect(trackingIds.length).toBeGreaterThan(0);
    const tracking = await post('model/mail.tracking.value/read', { ids: trackingIds, fields: ['field'] }, admin);
    expect((tracking.body.records as { field: string }[]).map((t) => t.field)).toContain('x_subject');

    const deadline = new Date().toISOString().slice(0, 10);
    const scheduled = await post('model/mail.activity/create', {
      values: { res_model: 'x_ticket', res_id: id, summary: 'Follow up', date_deadline: deadline },
    }, admin);
    expect(scheduled.status).toBe(200);
    const read = await post('model/x_ticket/read', { ids: [id], fields: ['activity_ids', 'activity_state'] }, admin);
    const [ticket] = read.body.records as { activity_ids: number[]; activity_state: string }[];
    expect(ticket!.activity_ids).toEqual(scheduled.body.ids);
    expect(['today', 'planned', 'overdue']).toContain(ticket!.activity_state);
  });

  it('requires explicit confirmation to detach, then removes the mixin fields', async () => {
    const preview = await post('studio/mixin/detach', { model: 'x_ticket', mixin: 'mail.activity.mixin' }, admin);
    expect(preview.status).toBe(422);
    const message = (preview.body.error as { message: string }).message;
    expect(message).toContain('activity_ids');
    expect(message).toContain('activity_state');
    expect(message).not.toContain('message_ids');
    expect((await post('studio/mixin/detach', { model: 'x_ticket', mixin: 'mail.activity.mixin', confirmDestructive: false }, admin)).status).toBe(422);
    const detached = await post('studio/mixin/detach', { model: 'x_ticket', mixin: 'mail.activity.mixin', confirmDestructive: true }, admin);
    expect(detached.status).toBe(200);
    expect(Object.keys(detached.body.fields as object)).not.toContain('activity_state');
    const fields = await post('model/x_ticket/fields_get', {}, admin);
    expect(Object.keys(fields.body.fields as object)).not.toContain('activity_ids');
    expect(Object.keys(fields.body.fields as object)).toContain('message_ids');
    const listed = await get('studio/mixins', admin);
    expect(listed.body.attached).toEqual([{ model: 'x_ticket', mixin: 'mail.thread' }]);
    expect((await post('studio/mixin/detach', { model: 'x_ticket', mixin: 'mail.activity.mixin', confirmDestructive: true }, admin)).status).toBe(422);
  });
});

describe('Studio digits by precision name', () => {
  it('accepts an existing decimal.precision name and rounds with it', async () => {
    const added = await post('studio/field', { model: 'x_ticket', name: 'x_price', type: 'float', digits: 'Product Price' }, admin);
    expect(added.status).toBe(200);
    const models = await get('studio/models', admin);
    const ticket = (models.body.models as { name: string; fields: { name: string; digits?: unknown }[] }[]).find((m) => m.name === 'x_ticket')!;
    expect(ticket.fields.find((f) => f.name === 'x_price')!.digits).toBe('Product Price');
    const created = await post('model/x_ticket/create', { values: { x_title: 'Priced', x_price: 1.23456 } }, admin);
    expect(created.status).toBe(200);
    const read = await post('model/x_ticket/read', { ids: created.body.ids, fields: ['x_price'] }, admin);
    expect((read.body.records as { x_price: number }[])[0]!.x_price).toBe(1.23);
  });

  it('rejects unknown precision names and digits on non-float fields', async () => {
    expect((await post('studio/field', { model: 'x_ticket', name: 'x_bad', type: 'float', digits: 'No Such Precision' }, admin)).status).toBe(422);
    expect((await post('studio/field', { model: 'x_ticket', name: 'x_bad2', type: 'char', digits: 'Product Price' }, admin)).status).toBe(400);
    expect((await post('studio/field', { model: 'x_ticket', name: 'x_bad3', type: 'float', digits: [2, 4] }, admin)).status).toBe(400);
  });
});

import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MailThreadService } from '@nexa/engine';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { EngineService } from '../src/engine/engine.service';
import { SmtpMailService } from '../src/engine/smtp-mail.service';

const TENANT = 'mailtest';
let app: INestApplication;
let base: URL;
let engine: EngineService;
let adminId: number;
let memberId: number;
let partnerId: number;

async function post(path: string, body?: unknown, uid = adminId) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Nexa-Tenant': TENANT,
      'X-Nexa-Uid': String(uid),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : {} };
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', TENANT);
  vi.stubEnv('NEXA_MODULES', 'base,contacts,mail');
  vi.stubEnv('NEXA_DEV_AUTH', '1');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  engine = app.get(EngineService);

  const root = (await engine.tenant(TENANT)).env({ uid: 1 });
  const [companyId] = (await root.model('res.company').search([], { limit: 1 })).ids;
  const [userGroup] = (await root.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  const [admin] = (await root.model('res.users').search([['login', '=', 'admin']], { limit: 1 })).ids;
  adminId = admin!;
  const [member] = (await root.model('res.users').create({
    name: 'Mail queue member', login: 'mail-queue-member', company_id: companyId,
    group_ids: [{ op: 'set', ids: [userGroup!] }],
  })).ids;
  memberId = member!;
  [partnerId] = (await root.model('res.partner').create({
    name: 'Queue Recipient', email: 'queue-recipient@example.test',
  })).ids;

  expect((await post('studio/mixin/attach', { model: 'res.partner', mixin: 'mail.thread' })).status).toBe(200);
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('mail delivery and inbound aliases', () => {
  it('requires Settings for processing and delivers queued mail through the injected transport', async () => {
    const created = await post('model/mail.template/create', { values: {
      name: 'Partner update',
      model_name: 'res.partner',
      subject: 'Hello {{ name }}',
      body_html: '<p>{{ name }}</p>',
      email_to: 'email',
    } }, adminId);
    expect(created.status).toBe(200);
    const [templateId] = created.body.ids as number[];

    const requestId = '2e89bd82-75a4-4c8a-940f-6e1a4fd9cf0a';
    const queued = await post(`mail/templates/${templateId}/queue`, { recordId: partnerId, requestId }, adminId);
    expect(queued.status).toBe(201);
    expect(queued.body.messageId).toEqual(expect.any(Number));
    const edited = await post('model/mail.template/write', {
      ids: [templateId], values: { body_html: '{{ missing_field }}' },
    }, adminId);
    expect(edited.status).toBe(200);
    const retry = await post(`mail/templates/${templateId}/queue`, { recordId: partnerId, requestId }, adminId);
    expect(retry).toEqual(queued);

    const processingDenied = await post('mail/queue/process', { limit: 1 }, memberId);
    expect(processingDenied.status).toBe(403);

    const deliver = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(app.get(SmtpMailService), 'transportFor').mockReturnValue({ deliver });
    const processed = await post('mail/queue/process', { limit: 1 }, adminId);
    expect(processed).toMatchObject({ status: 200, body: { sent: 1, deferred: 0, failed: 0 } });
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({
      recipients: ['queue-recipient@example.test'],
      subject: 'Hello Queue Recipient',
      bodyHtml: '<p>Queue Recipient</p>',
    }));

    const handle = await engine.tenant(TENANT);
    const queueRows = await handle.driver.query<{ state: string; recipient: string }>({
      text: 'SELECT state, recipient FROM nx_mail_outgoing WHERE message_id = $1',
      params: [queued.body.messageId],
    });
    expect(queueRows).toEqual([{ state: 'sent', recipient: 'queue-recipient@example.test' }]);
  });

  it('rolls back the message when recipient validation rejects a rendered address', async () => {
    const [invalidPartner] = (await (await engine.tenant(TENANT)).env({ uid: 1 })
      .model('res.partner').create({ name: 'Invalid Recipient', email: 'not-an-address' })).ids;
    const created = await post('model/mail.template/create', { values: {
      name: 'Invalid recipient',
      model_name: 'res.partner',
      subject: 'Invalid recipient',
      body_html: '<p>{{ name }}</p>',
      email_to: 'email',
    } }, adminId);
    expect(created.status).toBe(200);
    const [templateId] = created.body.ids as number[];
    const before = await (await engine.tenant(TENANT)).driver.query<{ count: number }>({
      text: 'SELECT count(*)::int AS count FROM mail_message WHERE model = $1 AND res_id = $2',
      params: ['res.partner', invalidPartner],
    });
    const result = await post(`mail/templates/${templateId}/queue`, {
      recordId: invalidPartner,
      requestId: '37f43f16-b60c-44b2-9a02-c2881a3117f4',
    }, adminId);
    expect(result.status).toBe(422);
    const after = await (await engine.tenant(TENANT)).driver.query<{ count: number }>({
      text: 'SELECT count(*)::int AS count FROM mail_message WHERE model = $1 AND res_id = $2',
      params: ['res.partner', invalidPartner],
    });
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it('routes a trusted envelope alias exactly once and records an internal email note', async () => {
    const alias = 'orders@nexa.example.test';
    const mapping = await post('mail/aliases', {
      alias, model: 'res.partner', recordId: partnerId,
    }, adminId);
    expect(mapping.status).toBe(201);
    expect((await post('mail/aliases', {
      alias: 'orders+unknown@nexa.example.test', model: 'res.partner', recordId: partnerId,
    }, memberId)).status).toBe(403);

    const input = {
      alias: ' ORDERS@NEXA.EXAMPLE.TEST ',
      messageId: '<upstream-message-42@example.test>',
      from: 'outside@example.test',
      subject: 'Re: Order',
      text: '<script>alert(1)</script> Please review this order.',
    };
    const first = await post('mail/inbound', input, adminId);
    const repeated = await post('mail/inbound', input, adminId);
    expect(first).toMatchObject({ status: 200, body: { duplicate: false, id: expect.any(Number) } });
    expect(repeated).toEqual({ status: 200, body: { id: first.body.id, duplicate: true } });

    const root = (await engine.tenant(TENANT)).env({ uid: 1 });
    const messages = await new MailThreadService(root).messages('res.partner', partnerId);
    const inbound = messages.find((message) => message.id === first.body.id);
    expect(inbound).toMatchObject({
      message_type: 'email',
      internal: true,
      author_id: null,
      subject: 'Inbound email: Re: Order',
      body: '<p>From: outside@example.test</p><p>&lt;script&gt;alert(1)&lt;/script&gt; Please review this order.</p>',
    });
    expect(messages.filter((message) => message.body.includes('Please review this order'))).toHaveLength(1);
    expect((await post('mail/inbound', {
      ...input,
      alias: 'other@nexa.example.test',
      messageId: '<upstream-message-43@example.test>',
    }, adminId)).status).toBe(422);
  });

  it('does not let aliases route to documents the authenticated administrator cannot write', async () => {
    const result = await post('mail/aliases', {
      alias: 'missing@nexa.example.test', model: 'res.partner', recordId: 2_000_000_000,
    }, adminId);
    expect(result.status).toBe(403);
  });
});

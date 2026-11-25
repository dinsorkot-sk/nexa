import 'reflect-metadata';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MailThreadService } from '@nexa/engine';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { BusController } from '../src/engine/bus.controller';
import { EngineService } from '../src/engine/engine.service';

const TENANT = 'bustest';
const adminPassword = 'bus-test-admin-password';
let app: INestApplication;
let base: URL;
let engine: EngineService;
let bus: BusController;
let adminId: number;
let memberId: number;
let outsiderId: number;
let sharedPartnerId: number;
let partnerId: number;

interface SseEvent { id?: string; event: string; data: string }
interface SseClient {
  status: number;
  body: string;
  events: SseEvent[];
  comments: string[];
  close(): void;
  waitFor(pred: (events: SseEvent[]) => boolean, ms?: number): Promise<void>;
}

/** Minimal SSE client over node:http (no dependencies). Resolves once the response head arrives. */
function sse(path: string, headers: Record<string, string> = {}): Promise<SseClient> {
  return new Promise((resolve, reject) => {

    const client: SseClient = {
      status: 0, body: '', events: [], comments: [],
      close: () => req.destroy(),
      waitFor: async (pred, ms = 3_000) => {
        const end = Date.now() + ms;
        while (!pred(client.events) && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
        if (!pred(client.events)) throw new Error(`SSE condition not met; got ${JSON.stringify(client.events)}`);
      },
    };
    const req: ClientRequest = httpRequest(new URL(path, base), { headers: { accept: 'text/event-stream', ...headers } }, (res: IncomingMessage) => {
      client.status = res.statusCode ?? 0;
      res.setEncoding('utf8');
      let buffer = '';
      res.on('data', (chunk: string) => {
        client.body += chunk;
        buffer += chunk;
        let at: number;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const ev: SseEvent = { event: 'message', data: '' };
          let isEvent = false;
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) client.comments.push(line);
            else if (line.startsWith('id: ')) { ev.id = line.slice(4); isEvent = true; }
            else if (line.startsWith('event: ')) { ev.event = line.slice(7); isEvent = true; }
            else if (line.startsWith('data: ')) { ev.data += line.slice(6); isEvent = true; }
          }
          if (isEvent) client.events.push(ev);
        }
      });
      res.on('error', () => {});
      resolve(client);
    });
    req.on('error', (err) => (client.status ? undefined : reject(err)));
    req.end();
  });
}

const dev = (uid: number) => ({ 'X-Nexa-Tenant': TENANT, 'X-Nexa-Uid': String(uid) });
const posted = (events: SseEvent[]) => events.filter((e) => e.event === 'mail.message.posted');
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', TENANT);
  vi.stubEnv('NEXA_MODULES', 'base,contacts,mail');
  vi.stubEnv('NEXA_DEV_AUTH', '1');
  vi.stubEnv('NEXA_BUS_MAX_PER_USER', '2');
  vi.stubEnv('NEXA_BUS_HEARTBEAT_MS', '100');
  vi.stubEnv('NEXA_BUS_REAUTH_MS', '100');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  engine = app.get(EngineService);
  bus = app.get(BusController);

  const root = (await engine.tenant(TENANT)).env({ uid: 1 });
  const [companyId] = (await root.model('res.company').search([], { limit: 1 })).ids;
  const [userGroup] = (await root.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  const [companyB] = (await root.model('res.company').create({ name: 'Bus Company B' })).ids as [number];
  [adminId] = (await root.model('res.users').search([['login', '=', 'admin']], { limit: 1 })).ids as [number];
  [memberId] = (await root.model('res.users').create({
    name: 'Bus member', login: 'bus-member', company_id: companyB, company_ids: [{ op: 'set', ids: [companyB] }], group_ids: [{ op: 'set', ids: [userGroup!] }],
  })).ids as [number];
  [outsiderId] = (await root.model('res.users').create({
    name: 'Bus outsider', login: 'bus-outsider', company_id: companyId, group_ids: [{ op: 'set', ids: [userGroup!] }],
  })).ids as [number];
  // company B partner: readable by the member (company B), not by the outsider (company A only)
  [partnerId] = (await root.model('res.partner').create({ name: 'Followed Co', company_id: companyB })).ids as [number];
  [sharedPartnerId] = (await root.model('res.partner').create({ name: 'Shared Co' })).ids as [number];

  const attach = await fetch(new URL('/api/studio/mixin/attach', base), {
    method: 'POST', headers: { 'content-type': 'application/json', ...dev(adminId) },
    body: JSON.stringify({ model: 'res.partner', mixin: 'mail.thread' }),
  });
  expect(attach.status).toBe(200);
  await app.get(AuthService).provisionPassword(TENANT, 'admin', adminPassword);
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('GET /api/bus', () => {
  it('rejects unauthenticated and malformed credentials', async () => {
    expect((await sse('/api/bus')).status).toBe(401);
    expect((await sse('/api/bus', { authorization: 'Bearer nope' })).status).toBe(401);
    expect((await sse('/api/bus', { authorization: `Bearer nx1.${TENANT}.${'A'.repeat(43)}` })).status).toBe(401);
  });

  it('pushes message-posted events for followed records to readers only', async () => {
    const root = (await engine.tenant(TENANT)).env({ uid: 1 });
    const memberEnv = (await engine.tenant(TENANT)).env({ uid: memberId });
    await new MailThreadService(memberEnv).subscribe('res.partner', partnerId);
    // the outsider is made a follower although it cannot read the (company B) partner
    const [outsiderUser] = await root.model('res.users').browse(outsiderId).read(['partner_id']);
    await new MailThreadService(root).subscribe('res.partner', partnerId, [outsiderUser!.partner_id as number]);

    const member = await sse('/api/bus', dev(memberId));
    const outsider = await sse('/api/bus', dev(outsiderId));
    expect(member.status).toBe(200);
    expect(outsider.status).toBe(200);
    await member.waitFor((e) => e.some((x) => x.event === 'bus.ready'));
    await outsider.waitFor((e) => e.some((x) => x.event === 'bus.ready'));

    const messageId = await new MailThreadService(root).postText('res.partner', partnerId, 'secret body text');
    await member.waitFor((e) => posted(e).length === 1);
    await settle();
    const [event] = posted(member.events);
    expect(event!.id).toMatch(/^[0-9a-f]{12}:[0-9]+$/);
    expect(JSON.parse(event!.data)).toEqual({
      channel: expect.stringMatching(/^res\.partner,\d+$/),
      payload: { message_id: messageId, model: 'res.partner', res_id: partnerId, subtype_id: expect.any(Number) },
    });
    expect(member.body).not.toContain('secret body text');
    expect(posted(outsider.events)).toHaveLength(0);
    expect(outsider.comments.length).toBeGreaterThan(0); // heartbeats keep flowing

    // explicit record channels must be readable now
    expect((await sse('/api/bus?channel=res.groups,999999', dev(outsiderId))).status).toBe(403);
    // personal channels of others (and partners in general) cannot be subscribed explicitly
    expect((await sse(`/api/bus?channel=res.partner,${partnerId}`, dev(memberId))).status).toBe(400);
    member.close();
    outsider.close();
  });

  it('resumes from Last-Event-ID with a bearer session', async () => {
    const root = (await engine.tenant(TENANT)).env({ uid: 1 });
    const [admin] = await root.model('res.users').browse(adminId).read(['partner_id']);
    await new MailThreadService(root).subscribe('res.partner', sharedPartnerId, [admin!.partner_id as number]);
    const login = await fetch(new URL('/api/auth/login', base), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenant: TENANT, login: 'admin', password: adminPassword }),
    });
    const token = (await login.json() as { accessToken: string }).accessToken;
    const auth = { authorization: `Bearer ${token}` };
    const first = await sse('/api/bus', auth);
    expect(first.status).toBe(200);
    await first.waitFor((e) => e.some((x) => x.event === 'bus.ready'));
    await new MailThreadService(root).postText('res.partner', sharedPartnerId, 'one');
    await new MailThreadService(root).postText('res.partner', sharedPartnerId, 'two');
    await first.waitFor((e) => posted(e).length === 2);
    first.close();
    const resumed = await sse('/api/bus', { ...auth, 'last-event-id': posted(first.events)[0]!.id! });
    await resumed.waitFor((e) => posted(e).length === 1);
    expect(posted(resumed.events)[0]!.id).toBe(posted(first.events)[1]!.id);
    resumed.close();

    // a revoked credential ends the stream at the next re-authentication
    const live = await sse('/api/bus', auth);
    expect(live.status).toBe(200);
    await live.waitFor((e) => e.some((x) => x.event === 'bus.ready'));
    const logout = await fetch(new URL('/api/auth/logout', base), { method: 'POST', headers: auth });
    expect(logout.status).toBe(200);
    const end = Date.now() + 3_000;
    while (bus.connections(TENANT, adminId) !== 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    expect(bus.connections(TENANT, adminId)).toBe(0);
    live.close();
  });

  it('enforces channel validation and per-user connection limits with clean teardown', async () => {
    expect((await sse('/api/bus?channel=bogus', dev(memberId))).status).toBe(400);
    expect((await sse(`/api/bus?channel=res.users,${adminId}`, dev(memberId))).status).toBe(400);
    const tooMany = Array.from({ length: 51 }, (_, i) => `channel=res.partner,${i + 1}`).join('&');
    expect((await sse(`/api/bus?${tooMany}`, dev(memberId))).status).toBe(400);

    await new Promise((r) => setTimeout(r, 100));
    expect(bus.connections(TENANT, memberId)).toBe(0);
    const a = await sse('/api/bus', dev(memberId));
    const b = await sse('/api/bus', dev(memberId));
    expect([a.status, b.status]).toEqual([200, 200]);
    const c = await sse('/api/bus', dev(memberId));
    expect(c.status).toBe(429);
    expect(bus.connections(TENANT, memberId)).toBe(2);
    a.close();
    const end = Date.now() + 2_000;
    while (bus.connections(TENANT, memberId) !== 1 && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
    expect(bus.connections(TENANT, memberId)).toBe(1);
    const d = await sse('/api/bus', dev(memberId));
    expect(d.status).toBe(200);
    b.close();
    d.close();
  });
});

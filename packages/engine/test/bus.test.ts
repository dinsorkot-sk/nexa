import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, ModuleCatalog, PgliteTenantManager, ValidationError, baseModule, type Env, type ModuleManifest, type TenantHandle,
} from '../src/index.js';
import { ActivityService, MailThreadService, mailModule } from '../src/mail/index.js';
import {
  BUS_LIMITS, BusHub, BusService, registerBusModels, userChannel, type BusEvent, type BusSubscription,
} from '../src/bus/index.js';

const all = { read: true, write: true, create: true, unlink: true };
const readOnly = { read: true, write: false, create: false, unlink: false };

const testModule: ModuleManifest = {
  name: 'bus_test', version: '1.0.0', depends: ['mail'],
  models: [{
    name: 'x.doc', origin: 'module', extends: ['mail.thread', 'mail.activity.mixin'],
    fields: { name: { type: 'char', tracking: true }, secret: { type: 'char' }, shared: { type: 'boolean' } },
  }],
  access: [
    { model: 'x.doc', group: 'base.group_user', perms: all },
    { model: 'x.doc', group: 'base.group_portal', perms: readOnly },
  ],
  rules: [
    {
      name: 'x_doc_own_or_shared', model: 'x.doc', groups: ['base.group_user'], perms: all,
      domain: ['|', ['create_uid', '=', { $ctx: 'uid' } as never], ['shared', '=', true]],
    },
    { name: 'x_doc_portal_shared', model: 'x.doc', groups: ['base.group_portal'], perms: readOnly, domain: [['shared', '=', true]] },
  ],
};

let manager: PgliteTenantManager;
let h: TenantHandle;
let hub: BusHub;
let root: Env;
let alice: Env;
let aliceUid: number;
let bobUid: number;
let portalUid: number;
let adminUid: number;
let bobPartner: number;
let portalPartner: number;
const subs: BusSubscription[] = [];

const ref = async (xmlId: string): Promise<number> => {
  const [mod, name] = xmlId.split('.');
  const [row] = await h.driver.query<{ res_id: number }>({ text: 'SELECT res_id FROM nx_model_data WHERE module = $1 AND name = $2', params: [mod, name] });
  return Number(row!.res_id);
};
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
}
async function listen(uid: number, channels?: string[], lastEventId?: string): Promise<{ events: BusEvent[]; sub: BusSubscription }> {
  const events: BusEvent[] = [];
  const sub = await hub.subscribe(uid, { channels, lastEventId, onEvent: (e) => events.push(e) });
  subs.push(sub);
  return { events, sub };
}
const doc = async (env: Env, values: Record<string, unknown> = {}) => (await env.model('x.doc').create({ name: 'D', ...values })).ids[0]!;

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, mailModule, testModule]) });
  h = await manager.create('bus', ['bus_test']);
  hub = await BusHub.for(h);
  root = h.env({ uid: 1 });
  const company = await ref('base.main_company');
  const user = await ref('base.group_user');
  const create = async (login: string, groups: number[]) => (await root.model('res.users').create({
    name: login, login, company_id: company, company_ids: [company], group_ids: groups,
  })).ids[0]!;
  aliceUid = await create('alice', [user]);
  bobUid = await create('bob', [user]);
  portalUid = await create('portal', [await ref('base.group_portal')]);
  adminUid = await create('boss', [user, await ref('base.group_system')]);
  alice = h.env({ uid: aliceUid });
  const rows = await root.model('res.users').browse([bobUid, portalUid]).read(['partner_id']);
  bobPartner = rows[0]!.partner_id as number;
  portalPartner = rows[1]!.partner_id as number;
  BUS_LIMITS.decisionTtlMs = 0; // re-check access on every event in tests
}, 120_000);

afterAll(async () => {
  for (const s of subs) s.close();
  await hub?.close();
  await manager.closeAll();
});

describe('bus publish', () => {
  it('delivers only after the surrounding transaction commits', async () => {
    const { events } = await listen(aliceUid);
    await root.transaction(async (env) => {
      await new BusService(env).publish(userChannel(aliceUid), 'test.ping', { n: 1 });
      await tick(50);
      expect(events).toHaveLength(0);
    });
    await until(() => events.length > 0);
    expect(events.map((e) => [e.type, e.channel, e.payload])).toEqual([['test.ping', userChannel(aliceUid), { n: 1 }]]);
  });

  it('drops events of rolled back transactions and savepoints', async () => {
    const { events } = await listen(aliceUid);
    await expect(root.transaction(async (env) => {
      await new BusService(env).publish(userChannel(aliceUid), 'test.rolled', {});
      throw new Error('boom');
    })).rejects.toThrow('boom');
    await root.transaction(async (env) => {
      await expect(env.transaction(async (inner) => {
        await new BusService(inner).publish(userChannel(aliceUid), 'test.savepoint', {});
        throw new Error('inner');
      })).rejects.toThrow('inner');
      await new BusService(env).publish(userChannel(aliceUid), 'test.kept', {});
    });
    await until(() => events.length > 0);
    await tick(50);
    expect(events.map((e) => e.type)).toEqual(['test.kept']);
  });

  it('validates channels and refuses large payloads', async () => {
    const bus = new BusService(root);
    await expect(bus.publish('nope', 'x', {})).rejects.toBeInstanceOf(ValidationError);
    await expect(bus.publish(userChannel(aliceUid), 'Bad Type', {})).rejects.toBeInstanceOf(ValidationError);
    await expect(bus.publish(userChannel(aliceUid), 'x', { big: 'y'.repeat(8_000) })).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps personal channels and the broadcast channel to their owners', async () => {
    const a = await listen(aliceUid);
    const admin = await listen(adminUid);
    await new BusService(root).publish([userChannel(bobUid), 'broadcast'], 'test.private', {});
    await until(() => admin.events.length > 0);
    await tick(50);
    expect(admin.events.map((e) => e.channel)).toEqual(['broadcast']);
    expect(a.events).toHaveLength(0);
    await expect(hub.subscribe(aliceUid, { channels: [userChannel(bobUid)], onEvent: () => {} })).rejects.toBeInstanceOf(ValidationError);
    await expect(hub.subscribe(aliceUid, { channels: ['res.partner,1'], onEvent: () => {} })).rejects.toBeInstanceOf(ValidationError);
    await expect(hub.subscribe(aliceUid, { channels: ['x.doc,abc'], onEvent: () => {} })).rejects.toBeInstanceOf(ValidationError);
    await expect(hub.subscribe(1, { onEvent: () => {} })).rejects.toBeInstanceOf(AccessError);
    const many = Array.from({ length: BUS_LIMITS.maxRecordChannels + 1 }, (_, i) => `x.doc,${i + 1}`);
    await expect(hub.subscribe(aliceUid, { channels: many, onEvent: () => {} })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('access filtering at delivery', () => {
  it('sends posted messages to readers of the record and followers only', async () => {
    const id = await doc(alice);
    await expect(hub.subscribe(bobUid, { channels: [`x.doc,${id}`], onEvent: () => {} })).rejects.toBeInstanceOf(AccessError);
    // bob is made a follower although he cannot read the document
    await new MailThreadService(root).subscribe('x.doc', id, [bobPartner]);
    const a = await listen(aliceUid, [`x.doc,${id}`]);
    const b = await listen(bobUid);
    const messageId = await new MailThreadService(alice).postText('x.doc', id, 'top secret body');
    await until(() => a.events.length > 0);
    await tick(80);
    expect(a.events.map((e) => [e.type, e.payload])).toEqual([
      ['mail.message.posted', { message_id: messageId, model: 'x.doc', res_id: id, subtype_id: expect.any(Number) }],
    ]);
    expect(JSON.stringify(a.events)).not.toContain('top secret');
    expect(b.events).toHaveLength(0);
  });

  it('stops delivering once read access is lost', async () => {
    const id = await doc(alice, { shared: true });
    const b = await listen(bobUid, [`x.doc,${id}`]);
    await new MailThreadService(alice).postText('x.doc', id, 'one');
    await until(() => b.events.length > 0);
    await alice.model('x.doc').browse(id).write({ shared: false });
    await new MailThreadService(alice).postText('x.doc', id, 'two');
    await tick(150);
    expect(b.events).toHaveLength(1);
  });

  it('never delivers internal subtypes to portal users', async () => {
    const id = await doc(alice, { shared: true });
    await new MailThreadService(root).subscribe('x.doc', id, [portalPartner]);
    const p = await listen(portalUid, [`x.doc,${id}`]);
    const a = await listen(aliceUid, [`x.doc,${id}`]);
    await new MailThreadService(alice).postText('x.doc', id, 'internal note', { subtype: 'mail.mt_note' });
    await until(() => a.events.length > 0);
    await new MailThreadService(alice).postText('x.doc', id, 'public reply');
    await until(() => p.events.length > 0 && a.events.length > 1);
    await tick(50);
    expect(a.events).toHaveLength(2);
    expect(p.events).toHaveLength(1);
    expect(p.events[0]!.type).toBe('mail.message.posted');
    // a portal user cannot follow a document it cannot read
    const hidden = await doc(alice);
    await expect(hub.subscribe(portalUid, { channels: [`x.doc,${hidden}`], onEvent: () => {} })).rejects.toBeInstanceOf(AccessError);
  });

  it('announces record changes of opted-in models without field values', async () => {
    registerBusModels('x.doc');
    const id = await doc(alice);
    const a = await listen(aliceUid, [`x.doc,${id}`]);
    await alice.model('x.doc').browse(id).write({ secret: 'value-never-sent' });
    await until(() => a.events.some((e) => e.type === 'record.changed'));
    const change = a.events.find((e) => e.type === 'record.changed')!;
    expect(Object.keys(change.payload).sort()).toEqual(['id', 'model', 'op', 'write_date']);
    expect(change.payload).toMatchObject({ model: 'x.doc', id, op: 'write' });
    expect(JSON.stringify(a.events)).not.toContain('value-never-sent');
    await alice.model('x.doc').browse(id).unlink();
    await until(() => a.events.some((e) => e.payload.op === 'unlink'));
    expect(a.events.find((e) => e.payload.op === 'unlink')!.payload).toEqual({ model: 'x.doc', id, op: 'unlink', write_date: null });
  });

  it('notifies the assignee when activities are scheduled and done', async () => {
    const id = await doc(alice, { shared: true });
    const b = await listen(bobUid);
    const activity = await new ActivityService(alice).schedule('x.doc', id, { userId: bobUid, summary: 'call' });
    await until(() => b.events.length > 0);
    expect(b.events[0]).toMatchObject({ type: 'mail.activity.scheduled', channel: userChannel(bobUid), payload: { activity_id: activity, model: 'x.doc', res_id: id } });
    await new ActivityService(h.env({ uid: bobUid })).done([activity]);
    await until(() => b.events.some((e) => e.type === 'mail.activity.done'));
    expect(b.events.find((e) => e.type === 'mail.activity.done')!.payload).toEqual({ activity_id: activity, model: 'x.doc', res_id: id });
  });
});

describe('resume', () => {
  it('replays events after Last-Event-ID and resets on unknown ids', async () => {
    const first = await listen(aliceUid);
    const bus = new BusService(root);
    await bus.publish(userChannel(aliceUid), 'test.r1', {});
    await bus.publish(userChannel(aliceUid), 'test.r2', {});
    await until(() => first.events.length >= 2);
    const resumed = await listen(aliceUid, undefined, first.events[0]!.id);
    await until(() => resumed.events.length > 0);
    expect(resumed.events.map((e) => e.type)).toEqual(['test.r2']);
    const reset = await listen(aliceUid, undefined, '000000000000:1');
    expect(reset.events.map((e) => e.type)).toEqual(['bus.reset']);
  });
});

describe('robustness', () => {
  it('still sends a resumable bus.reset when the queue overflows while a batch is in flight', async () => {
    const { events, sub } = await listen(aliceUid);
    const saved = BUS_LIMITS.maxQueue;
    BUS_LIMITS.maxQueue = 2;
    try {
      const ping = { c: [userChannel(aliceUid)], t: 'test.flood', p: {} };
      // the first offer starts draining (awaiting its access check); the 4th overflows; no later events
      sub.offer(900_001, ping);
      sub.offer(900_002, ping);
      sub.offer(900_003, ping);
      sub.offer(900_004, ping);
    } finally {
      BUS_LIMITS.maxQueue = saved;
    }
    await until(() => events.some((e) => e.type === 'bus.reset'));
    const reset = events.find((e) => e.type === 'bus.reset')!;
    expect(reset.id).toMatch(/:900004$/);
    expect(events.filter((e) => e.type === 'test.flood').length).toBeLessThan(4);
  });

  it('replaces per-record events beyond the bulk limit with a model-level reset', async () => {
    registerBusModels('x.doc');
    const ids = [await doc(alice), await doc(alice), await doc(alice)];
    const a = await listen(aliceUid, ids.map((id) => `x.doc,${id}`));
    const b = await listen(bobUid);
    const saved = BUS_LIMITS.maxRecordEvents;
    BUS_LIMITS.maxRecordEvents = 1;
    try {
      await alice.model('x.doc').browse(ids).write({ name: 'bulk' });
    } finally {
      BUS_LIMITS.maxRecordEvents = saved;
    }
    await until(() => a.events.filter((e) => e.type === 'record.reset').length === 2);
    await tick(50);
    expect(a.events.filter((e) => e.type === 'record.changed').map((e) => e.payload.id)).toEqual([ids[0]]);
    expect(a.events.filter((e) => e.type === 'record.reset').map((e) => [e.channel, e.payload]))
      .toEqual([[`x.doc,${ids[1]}`, { model: 'x.doc', op: 'write' }], [`x.doc,${ids[2]}`, { model: 'x.doc', op: 'write' }]]);
    expect(b.events).toHaveLength(0);
  });

  it('gates raw record-channel publishes by the record and rejects ambiguous targets', async () => {
    const own = await doc(alice);
    const other = await doc(root);
    const a = await listen(aliceUid, [`x.doc,${own}`]);
    const bus = new BusService(root);
    await expect(bus.publish([`x.doc,${own}`, `x.doc,${other}`], 'test.multi', {})).rejects.toBeInstanceOf(ValidationError);
    await bus.publish(`x.doc,${own}`, 'test.raw', {});
    await until(() => a.events.some((e) => e.type === 'test.raw'));
    // malformed envelopes on the wire are ignored
    await h.driver.query({ text: 'SELECT pg_notify($1, $2)', params: ['nx_bus', JSON.stringify({ c: [1], t: 'test.bad', p: {} })] });
    await h.driver.query({ text: 'SELECT pg_notify($1, $2)', params: ['nx_bus', JSON.stringify({ c: [`x.doc,${own}`], t: 'Bad Type', p: {} })] });
    await bus.publish(`x.doc,${own}`, 'test.after', {});
    await until(() => a.events.some((e) => e.type === 'test.after'));
    expect(a.events.map((e) => e.type)).toEqual(['test.raw', 'test.after']);
  });
});

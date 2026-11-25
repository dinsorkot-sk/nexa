import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ConcurrencyError, ModuleCatalog, SchedulerService, SequenceService, ServerActionService, baseModule, type Env, type ModuleManifest, type TenantHandle,
} from '../../src/index.js';
import { AutomationRuleService } from '../../src/services/automation.js';
import { BusHub, BusService, userChannel, type BusEvent } from '../../src/bus/index.js';
import { PgDriver } from '../../src/driver/pg.js';
import { BUS_CHANNEL, PgNotifyTransport } from '../../src/bus/transport.js';
import type { PgTenantManager } from '../../src/tenant/pg.js';
import { gate, pgManager, pgUrl, secondDriver, settledWithin, sleep, uniquePrefix } from './helpers.js';

const all = { read: true, write: true, create: true, unlink: true };
const BLOCK_MS = 400; // how long a blocked transaction must stay pending to count as "waiting on a lock"

const pgModule: ModuleManifest = {
  name: 'pg_cc', version: '1.0.0', depends: ['base'],
  models: [
    {
      name: 'pg.node', origin: 'module',
      fields: { name: { type: 'char' }, parent_id: { type: 'many2one', comodel: 'pg.node' }, parent_path: { type: 'char', index: true } },
    },
    {
      name: 'pg.job', origin: 'module',
      fields: { name: { type: 'char' }, state: { type: 'char' }, note: { type: 'char' }, counter: { type: 'integer' }, due: { type: 'datetime' } },
    },
  ],
  access: [
    { model: 'pg.node', group: 'base.group_user', perms: all },
    { model: 'pg.job', group: 'base.group_user', perms: all },
  ],
};

/** Two parties that must both reach a point before either continues. */
function barrier(n: number): () => Promise<void> {
  let count = 0;
  let release!: () => void;
  const all = new Promise<void>((r) => (release = r));
  return async () => {
    if (++count === n) release();
    await all;
  };
}

describe.skipIf(!pgUrl)('real PostgreSQL: multi-connection concurrency', () => {
  let manager: PgTenantManager;
  let h: TenantHandle;
  let aliceUid: number;
  const prefix = uniquePrefix();
  /** a fresh env per concurrent worker (own record cache); each transaction gets its own pooled connection */
  const env = (): Env => h.env({ uid: 1 });
  const jobs = async (names: string[], extra: Record<string, unknown> = {}): Promise<number[]> => {
    const ids: number[] = [];
    for (const name of names) ids.push(...(await env().model('pg.job').create({ name, state: 'queued', ...extra })).ids);
    return ids;
  };

  beforeAll(async () => {
    manager = pgManager({ catalog: new ModuleCatalog([baseModule, pgModule]), dbPrefix: prefix, poolMax: 8 });
    h = await manager.create('cc', ['pg_cc']);
    const root = env();
    const [grp] = await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='group_user'`, params: [] });
    const [company] = await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='main_company'`, params: [] });
    [aliceUid] = (await root.model('res.users').create({
      name: 'Alice', login: 'alice', company_id: company!.res_id, company_ids: [company!.res_id], group_ids: [grp!.res_id],
    })).ids as [number];
  });
  afterAll(async () => { await manager?.closeAll(); });

  it('lock() waits for the holder; NOWAIT fails fast with ConcurrencyError; skipLocked skips', async () => {
    const [id] = await jobs(['lock-me']);
    const held = gate();
    const locked = gate();
    const a = env().transaction(async (tx) => {
      await tx.lock('pg.job', id!);
      locked.open();
      await held.wait;
    });
    await locked.wait;
    await expect(env().transaction((tx) => tx.lock('pg.job', id!, { nowait: true }))).rejects.toBeInstanceOf(ConcurrencyError);
    expect(await env().transaction((tx) => tx.lock('pg.job', id!, { skipLocked: true }))).toEqual([]);
    const b = env().transaction((tx) => tx.lock('pg.job', id!));
    expect(await settledWithin(b, BLOCK_MS)).toBe('pending');
    held.open();
    await a;
    await expect(b).resolves.toEqual([id]);
  });

  it('searchLocked (SKIP LOCKED) hands disjoint batches to concurrent workers', async () => {
    const ids = await jobs(Array.from({ length: 10 }, (_, i) => `q${i}`), { note: 'skip-batch' });
    const bothClaimed = barrier(2);
    const worker = () => env().transaction(async (tx) => {
      const batch = await tx.model('pg.job').searchLocked([['note', '=', 'skip-batch'], ['state', '=', 'queued']], { limit: 3, order: 'id asc' });
      await bothClaimed(); // both hold their row locks at the same time
      await batch.write({ state: 'done' });
      return [...batch.ids];
    });
    const [a, b] = await Promise.all([worker(), worker()]);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect(a.filter((x) => b.includes(x))).toEqual([]);

    // drain the rest with three competing workers: every job is processed exactly once
    const seen: number[] = [...a, ...b];
    const drain = async () => {
      for (;;) {
        const got = await env().transaction(async (tx) => {
          const batch = await tx.model('pg.job').searchLocked([['note', '=', 'skip-batch'], ['state', '=', 'queued']], { limit: 1 });
          await sleep(10);
          await batch.write({ state: 'done' });
          return [...batch.ids];
        });
        if (!got.length) return;
        seen.push(...got);
      }
    };
    await Promise.all([drain(), drain(), drain()]);
    expect([...seen].sort((x, y) => x - y)).toEqual(ids);
  });

  it('maps a real deadlock (40P01) to ConcurrencyError and lets the survivor commit', async () => {
    const [r1, r2] = await jobs(['dl1', 'dl2']);
    const firstLocks = barrier(2);
    const tx = (first: number, second: number) => env().transaction(async (t) => {
      await t.lock('pg.job', first);
      await firstLocks();
      await t.lock('pg.job', second);
      await t.model('pg.job').browse([first, second]).write({ note: `by ${first}` });
    });
    const results = await Promise.allSettled([tx(r1!, r2!), tx(r2!, r1!)]);
    const failed = results.filter((r) => r.status === 'rejected');
    expect(failed).toHaveLength(1);
    const reason = (failed[0] as PromiseRejectedResult).reason as Error;
    expect(reason).toBeInstanceOf(ConcurrencyError);
    expect(reason.message).toMatch(/deadlock/);
    const rows = await env().model('pg.job').browse([r1!, r2!]).read(['note']);
    expect(new Set(rows.map((r) => r.note)).size).toBe(1); // the survivor's write is complete
  });

  it('hierarchy advisory lock serializes concurrent moves: no A<->B cycle', async () => {
    const N = env().model('pg.node');
    const [a] = (await N.create({ name: 'A' })).ids;
    const [b] = (await N.create({ name: 'B' })).ids;
    const held = gate();
    const moved = gate();
    const first = env().transaction(async (tx) => {
      await tx.model('pg.node').browse(a!).write({ parent_id: b });
      moved.open();
      await held.wait;
    });
    await moved.wait;
    const second = env().transaction(async (tx) => tx.model('pg.node').browse(b!).write({ parent_id: a }));
    expect(await settledWithin(second, BLOCK_MS)).toBe('pending'); // waits on the advisory lock
    held.open();
    await first;
    await expect(second).rejects.toThrow(/cycle/);
    const rows = await env().model('pg.node').browse([a!, b!]).read(['parent_id', 'parent_path']);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(b!)!.parent_id).toBeFalsy();
    expect(String(byId.get(a!)!.parent_path)).toBe(`${b}/${a}/`);
  });

  it('checkWriteDate: the second of two concurrent writers holding the same copy gets ConcurrencyError', async () => {
    const [id] = await jobs(['occ']);
    const [row] = await env().model('pg.job').browse(id!).read(['write_date']);
    const stamp = row!.write_date as string;
    const held = gate();
    const wrote = gate();
    const first = env().transaction(async (tx) => {
      await tx.model('pg.job').browse(id!).write({ note: 'first' }, { checkWriteDate: { [id!]: stamp } });
      wrote.open();
      await sleep(5); // make the commit's write_date differ from the stamp beyond doubt
      await held.wait;
    });
    await wrote.wait;
    const second = env().model('pg.job').browse(id!).write({ note: 'second' }, { checkWriteDate: { [id!]: stamp } });
    expect(await settledWithin(second, BLOCK_MS)).toBe('pending'); // blocked on the row lock of the check
    held.open();
    await first;
    await expect(second).rejects.toBeInstanceOf(ConcurrencyError);
    const [after] = await env().model('pg.job').browse(id!).read(['note']);
    expect(after!.note).toBe('first');
  });

  it('sequences: no_gap serializes and never skips; standard never blocks and never duplicates', async () => {
    const root = env();
    await root.model('ir.sequence').create({ name: 'NG', code: 'pg.ng', implementation: 'no_gap', padding: 1 });
    await root.model('ir.sequence').create({ name: 'STD', code: 'pg.std', padding: 1 });
    const next = (code: string) => new SequenceService(env()).next(code);

    // no_gap: a holder blocks the next taker; a rollback hands the same number to the waiter
    const held = gate();
    const took = gate();
    const holder = env().transaction(async (tx) => {
      expect(await new SequenceService(tx).next('pg.ng')).toBe('1');
      took.open();
      await held.wait;
      throw new Error('roll back');
    });
    await took.wait;
    const waiter = next('pg.ng');
    expect(await settledWithin(waiter, BLOCK_MS)).toBe('pending');
    held.open();
    await expect(holder).rejects.toThrow('roll back');
    expect(await waiter).toBe('1');

    // standard: a holder does not block; its rollback leaves a gap (PostgreSQL sequence semantics)
    await next('pg.std'); // first draw creates the backing sequence
    const held2 = gate();
    const took2 = gate();
    const holder2 = env().transaction(async (tx) => {
      const n = await new SequenceService(tx).next('pg.std');
      took2.open();
      await held2.wait;
      return n;
    });
    await took2.wait;
    expect(await settledWithin(next('pg.std'), BLOCK_MS)).toMatchObject({ ok: true });
    held2.open();
    await holder2;

    // many concurrent takers: unique values; no_gap values are contiguous
    const ng = await Promise.all(Array.from({ length: 16 }, () => next('pg.ng')));
    const std = await Promise.all(Array.from({ length: 16 }, () => next('pg.std')));
    expect(new Set(ng).size).toBe(16);
    expect(new Set(std).size).toBe(16);
    expect(ng.map(Number).sort((x, y) => x - y)).toEqual(Array.from({ length: 16 }, (_, i) => i + 2));
  });

  it('scheduler: concurrent claimDue/runDue never run a job twice; on_time automation fires once per record', async () => {
    const root = env();
    const now = new Date('2030-01-01T00:00:00Z');
    const sched = new SchedulerService(root);
    for (let i = 0; i < 12; i++) await sched.schedule({ key: `pg.job${i}`, intervalMs: 3_600_000, nextRun: new Date('2029-12-31T00:00:00Z') });
    const claims = await Promise.all(Array.from({ length: 4 }, () => new SchedulerService(env()).claimDue(4, now)));
    const keys = claims.flat().map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Array.from({ length: 12 }, (_, i) => `pg.job${i}`).sort());

    // on_time automation via the built-in job: two scheduler workers race for it
    await new ServerActionService(root).define({ key: 'pg.bump', model: 'pg.job', type: 'update_record', values: { counter: '(counter or 0) + 1' } });
    await new AutomationRuleService(root).define({ key: 'pg.timed', model: 'pg.job', trigger: 'on_time', action: 'pg.bump', dateField: 'due', delayMinutes: 0 });
    const due = await jobs(['t1', 't2', 't3'], { note: 'timed', due: '2029-12-31T12:00:00.000Z' });
    await sched.schedule({ key: 'pg.on_time', intervalMs: 3_600_000, nextRun: new Date('2029-12-31T00:00:00Z'), builtin: 'automation.on_time', userId: 1 });
    const runs = await Promise.all([new SchedulerService(env()).runDue(new Map(), 10, now), new SchedulerService(env()).runDue(new Map(), 10, now)]);
    expect(runs.flatMap((r) => r.completed).filter((k) => k === 'pg.on_time')).toHaveLength(1);
    expect(runs.flatMap((r) => r.failed)).toEqual([]);
    const counters = await env().model('pg.job').browse(due).read(['counter']);
    expect(counters.map((c) => c.counter)).toEqual([1, 1, 1]);
  });

  it('bus: NOTIFY from another process is delivered only after commit and dropped on rollback', async () => {
    // a second manager = another API process with its own pools on the same tenant database
    const other = pgManager({ catalog: new ModuleCatalog([baseModule, pgModule]), dbPrefix: prefix });
    try {
      const h2 = await other.open('cc');
      expect(h2.driver).not.toBe(h.driver);
      const hub = await BusHub.for(h);
      const events: BusEvent[] = [];
      const sub = await hub.subscribe(aliceUid, { onEvent: (e) => events.push(e) });
      try {
        const publisher = h2.env({ uid: 1 });
        const held = gate();
        const sent = gate();
        const tx = publisher.transaction(async (t) => {
          await new BusService(t).publish(userChannel(aliceUid), 'pg.ping', { n: 1 });
          sent.open();
          await held.wait;
        });
        await sent.wait;
        await sleep(200);
        expect(events).toEqual([]); // not before commit
        held.open();
        await tx;
        await expect.poll(() => events.map((e) => e.type), { timeout: 5_000 }).toEqual(['pg.ping']);

        await expect(publisher.transaction(async (t) => {
          await new BusService(t).publish(userChannel(aliceUid), 'pg.rolled', {});
          await t.transaction(async (inner) => {
            await new BusService(inner).publish(userChannel(aliceUid), 'pg.inner', {});
            throw new Error('inner');
          }).catch(() => undefined);
          throw new Error('outer');
        })).rejects.toThrow('outer');
        await publisher.transaction(async (t) => {
          await t.transaction(async (inner) => {
            await new BusService(inner).publish(userChannel(aliceUid), 'pg.savepoint', {});
            throw new Error('sp');
          }).catch(() => undefined);
          await new BusService(t).publish(userChannel(aliceUid), 'pg.kept', {});
        });
        await expect.poll(() => events.map((e) => e.type), { timeout: 5_000 }).toEqual(['pg.ping', 'pg.kept']);
      } finally {
        sub.close();
      }
    } finally {
      await other.closeAll();
    }
  });

  it('bus: a lost LISTEN connection reconnects and resets every subscription', async () => {
    const hub = await BusHub.for(h);
    const events: BusEvent[] = [];
    const sub = await hub.subscribe(aliceUid, { onEvent: (e) => events.push(e) });
    try {
      await h.driver.query({
        text: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE query = 'LISTEN nx_bus' AND datname = current_database() AND pid <> pg_backend_pid()`, params: [],
      });
      await expect.poll(() => events.map((e) => e.type), { timeout: 10_000 }).toContain('bus.reset');
      // delivery resumes on the new connection
      await new BusService(env()).publish(userChannel(aliceUid), 'pg.after', {});
      await expect.poll(() => events.map((e) => e.type), { timeout: 5_000 }).toContain('pg.after');
    } finally {
      sub.close();
    }
  });

  it('bus: resuming from an id older than a listener outage yields bus.reset', async () => {
    const hub = await BusHub.for(h);
    const before: BusEvent[] = [];
    const first = await hub.subscribe(aliceUid, { onEvent: (e) => before.push(e) });
    await new BusService(env()).publish(userChannel(aliceUid), 'pg.pre_gap', {});
    await expect.poll(() => before.map((e) => e.type), { timeout: 5_000 }).toContain('pg.pre_gap');
    const lastSeen = before.find((e) => e.type === 'pg.pre_gap')!.id;
    first.close(); // the client is disconnected during the outage

    const watcher: BusEvent[] = [];
    const watch = await hub.subscribe(aliceUid, { onEvent: (e) => watcher.push(e) });
    try {
      await h.driver.query({
        text: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE query = 'LISTEN nx_bus' AND datname = current_database() AND pid <> pg_backend_pid()`, params: [],
      });
      await expect.poll(() => watcher.map((e) => e.type), { timeout: 10_000 }).toContain('bus.reset');
      await new BusService(env()).publish(userChannel(aliceUid), 'pg.post_gap', {});
      await expect.poll(() => watcher.map((e) => e.type), { timeout: 5_000 }).toContain('pg.post_gap');

      // resume with the pre-gap id: events in the ring are not enough, the outage may have lost some
      const resumed: BusEvent[] = [];
      const again = await hub.subscribe(aliceUid, { lastEventId: lastSeen, onEvent: (e) => resumed.push(e) });
      expect(resumed.map((e) => e.type)).toEqual(['bus.reset']);
      again.close();

      // resuming from the reset's own id (a client that saw it) replays normally
      const resetId = watcher.find((e) => e.type === 'bus.reset')!.id;
      const fine: BusEvent[] = [];
      const ok = await hub.subscribe(aliceUid, { lastEventId: resetId, onEvent: (e) => fine.push(e) });
      await expect.poll(() => fine.map((e) => e.type)).toContain('pg.post_gap');
      expect(fine.map((e) => e.type)).not.toContain('bus.reset');
      ok.close();
    } finally {
      watch.close();
    }
  });

  it('transport: raw NOTIFY across independent pools respects commit boundaries', async () => {
    const listener = await secondDriver(manager, 'cc');
    const publisher = await secondDriver(manager, 'cc');
    const transport = new PgNotifyTransport();
    const got: string[] = [];
    const stop = await transport.listen(listener, (e) => got.push(e));
    try {
      const held = gate();
      const tx = publisher.transaction(async () => {
        await transport.send(publisher, 'committed');
        await held.wait;
      });
      await sleep(150);
      expect(got).toEqual([]);
      held.open();
      await tx;
      await publisher.transaction(async () => {
        await transport.send(publisher, 'rolled');
        throw new Error('x');
      }).catch(() => undefined);
      await publisher.query({ text: `SELECT pg_notify($1, 'tail')`, params: [BUS_CHANNEL] });
      await expect.poll(() => got).toEqual(['committed', 'tail']);
    } finally {
      await stop();
      await listener.close();
      await publisher.close();
    }
  });

  it('timestamps: write_date written on one connection compares equal (UTC) on another', async () => {
    const [id] = await jobs(['utc'], { due: '2026-07-01T23:30:00.000Z' });
    const other = await secondDriver(manager, 'cc');
    try {
      const [r] = await other.query<{ due: Date; txt: string; tz: string }>({
        text: `SELECT due, due::text AS txt, current_setting('TimeZone') AS tz FROM pg_job WHERE id=$1`, params: [id],
      });
      expect(r!.tz).toBe('UTC');
      expect(r!.due.toISOString()).toBe('2026-07-01T23:30:00.000Z');
      const [read] = await env().model('pg.job').browse(id!).read(['due', 'write_date']);
      expect(new Date(read!.due as Date | string).toISOString()).toBe('2026-07-01T23:30:00.000Z');
      const [db] = await other.query<{ w: Date }>({ text: 'SELECT write_date AS w FROM pg_job WHERE id=$1', params: [id] });
      expect(new Date(read!.write_date as Date | string).getTime()).toBe(db!.w.getTime());
    } finally {
      await other.close();
    }
    expect(other).toBeInstanceOf(PgDriver);
  });
});

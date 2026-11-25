import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, ConcurrencyError, EngineError, MetadataStore, ModuleCatalog, PgliteTenantManager, ServerActionService, ValidationError, baseModule,
  evaluateExpression, type CompiledSql, type Env, type ModuleManifest, type SqlDriver, type TenantHandle,
} from '../src/index.js';
import { AutomationRuleService } from '../src/services/automation.js';
import { removeServerActionDefinitions } from '../src/services/actions.js';
import { EnvImpl } from '../src/orm/env.js';

const all = { read: true, write: true, create: true, unlink: true };

const testModule: ModuleManifest = {
  name: 'cc_test', version: '1.0.0', depends: ['base'],
  models: [
    {
      name: 'cc.node', origin: 'module',
      fields: { name: { type: 'char' }, parent_id: { type: 'many2one', comodel: 'cc.node' }, parent_path: { type: 'char', index: true } },
    },
    { name: 'cc.job', origin: 'module', fields: { name: { type: 'char' }, state: { type: 'char' }, note: { type: 'char' } } },
    { name: 'cc.mix', abstract: true, origin: 'module', fields: { cc_extra: { type: 'char' } } },
    { name: 'cc.plain', origin: 'module', fields: { name: { type: 'char' } } },
    { name: 'cc.doc', origin: 'module', fields: { name: { type: 'char' }, counter: { type: 'integer' } } },
  ],
  access: [
    { model: 'cc.node', group: 'base.group_user', perms: all },
    { model: 'cc.job', group: 'base.group_user', perms: all },
    { model: 'cc.doc', group: 'base.group_user', perms: all },
  ],
  rules: [{
    // users may read every job but only write jobs that are not frozen
    name: 'cc_job_write', model: 'cc.job', groups: ['base.group_user'],
    perms: { read: false, write: true, create: false, unlink: true }, domain: [['state', '!=', 'frozen']],
  }],
};

let manager: PgliteTenantManager;
let h: TenantHandle;
let root: Env;
let alice: Env;

/** Env whose driver records every SQL statement (same PGlite connection). */
function spyEnv(base: Env, fail?: (text: string) => string | undefined): { env: Env; log: string[] } {
  const log: string[] = [];
  const impl = base as EnvImpl;
  const wrap = (db: SqlDriver): SqlDriver => ({
    query: <T,>(sql: CompiledSql) => {
      log.push(sql.text);
      const code = fail?.(sql.text);
      if (code) return Promise.reject(Object.assign(new Error('simulated'), { code }));
      return db.query<T>(sql);
    },
    transaction: <T,>(fn: (tx: SqlDriver) => Promise<T>) => db.transaction((tx) => fn(wrap(tx))),
    close: () => db.close(),
    get inTransaction() { return (db as { inTransaction?: boolean }).inTransaction; },
  } as SqlDriver);
  const env = new EnvImpl({ tenant: impl.tenant, uid: impl.uid, companyIds: impl.companyIds, registry: impl.registry, db: wrap(impl.db) });
  return { env, log };
}

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, testModule]) });
  h = await manager.create('concurrency', ['cc_test']);
  root = h.env({ uid: 1 });
  const [row] = await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='group_user'`, params: [] });
  const [company] = await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='main_company'`, params: [] });
  const [uid] = (await root.model('res.users').create({
    name: 'Alice', login: 'alice', company_id: company!.res_id, company_ids: [company!.res_id], group_ids: [row!.res_id],
  })).ids;
  alice = h.env({ uid: uid! });
}, 120_000);

afterAll(async () => { await manager?.closeAll(); });

describe('NX-Expr prototype pollution hardening', () => {
  it('never lets __proto__ / constructor keys reach result objects', () => {
    const data = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "prototype": 2, "ok": 1}') as Record<string, unknown>;
    const out = evaluateExpression('data', { data: data as never }) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.keys(out)).toEqual(['ok']);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    // nested and inside arrays
    const nested = evaluateExpression('[data]', { data: { inner: data } as never }) as Record<string, Record<string, unknown>>[];
    expect(Object.getPrototypeOf(nested[0]!.inner)).toBe(Object.prototype);
    expect(Object.keys(nested[0]!.inner!)).toEqual(['ok']);
  });

  it('passes sanitized objects to helpers and still rejects forbidden paths', () => {
    let seen: unknown;
    const data = JSON.parse('{"__proto__": {"admin": true}}') as Record<string, unknown>;
    evaluateExpression('probe(data)', { data: data as never, probe: ((v: unknown) => { seen = v; return null; }) as never }, { helpers: ['probe'] });
    expect((seen as { admin?: unknown }).admin).toBeUndefined();
    expect(Object.getPrototypeOf(seen)).toBe(Object.prototype);
    expect(() => evaluateExpression('data.__proto__', { data: {} })).toThrow(/Forbidden/);
    expect(() => evaluateExpression('data.constructor', { data: {} })).toThrow(/Forbidden/);
  });

  it('rejects unsafe keys in server action value maps', async () => {
    const [id] = (await root.model('cc.job').create({ name: 'p' })).ids;
    const actions = new ServerActionService(root);
    const values = JSON.parse('{"__proto__": "1", "note": "\'x\'"}') as Record<string, string>;
    await expect(actions.define({ key: 'cc.proto', model: 'cc.job', type: 'update_record', values })).rejects.toThrow(/unknown field '__proto__'/);
    // a stored row that bypassed define (e.g. raw import) is still rejected when materialized
    await actions.define({ key: 'cc.proto', model: 'cc.job', type: 'update_record', values: { note: "'x'" } });
    await h.driver.query({ text: `UPDATE nx_server_action SET definition = jsonb_set(definition, '{values,__proto__}', '"1"') WHERE key = 'cc.proto'`, params: [] });
    await expect(actions.run('cc.proto', { model: 'cc.job', ids: [id!] })).rejects.toThrow(/Invalid field name '__proto__'/);
    const [row] = await root.model('cc.job').browse(id!).read(['note']);
    expect(row!.note).toBeNull();
    await removeServerActionDefinitions(root, ['cc.proto']);
  });
});

describe('hierarchy locking', () => {
  it('serializes parent moves with a per-table advisory lock and row locks', async () => {
    const N = root.model('cc.node');
    const [a] = (await N.create({ name: 'A' })).ids;
    const [b] = (await N.create({ name: 'B', parent_id: a })).ids;
    const [c] = (await N.create({ name: 'C' })).ids;
    const { env, log } = spyEnv(root);
    await env.model('cc.node').browse(b!).write({ parent_id: c });
    expect(log.some((q) => q.includes('pg_advisory_xact_lock') && q.includes('nx.parent_path'))).toBe(true);
    expect(log.some((q) => /FOR UPDATE OF t/.test(q) && q.includes('parent_parent_path'))).toBe(true);
    // lock is taken before the cycle validation reads the paths
    const lockAt = log.findIndex((q) => q.includes('nx.parent_path'));
    const updateAt = log.findIndex((q) => q.startsWith('UPDATE "cc_node"'));
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(lockAt).toBeLessThan(updateAt);
    const rows = await N.browse([b!, c!]).read(['parent_path']);
    expect(rows.find((r) => r.id === b)!.parent_path).toBe(`${c}/${b}/`);
    // sequential simulation of the classic race: A under B after B under A is a cycle
    await N.browse(c!).write({ parent_id: a });
    await expect(N.browse(a!).write({ parent_id: b })).rejects.toThrow(/cycle/);
  });
});

describe('row locks', () => {
  it('locks writable records FOR UPDATE inside a transaction', async () => {
    const J = root.model('cc.job');
    const [x, y] = (await J.create([{ name: 'x', state: 'open' }, { name: 'y', state: 'open' }])).ids;
    const { env, log } = spyEnv(alice);
    const locked = await env.transaction(async (tx) => tx.lock('cc.job', [x!, y!]));
    expect(locked).toEqual([x, y]);
    expect(log.some((q) => /FOR UPDATE OF t$/.test(q))).toBe(true);
    await env.transaction(async (tx) => tx.model('cc.job').browse(x!).lock({ nowait: true }));
    expect(log.some((q) => q.endsWith('FOR UPDATE OF t NOWAIT'))).toBe(true);
    await env.transaction(async (tx) => tx.model('cc.job').browse(x!).lock({ skipLocked: true }));
    expect(log.some((q) => q.endsWith('FOR UPDATE OF t SKIP LOCKED'))).toBe(true);
    await expect(env.transaction(async (tx) => tx.model('cc.job').browse(x!).lock({ skipLocked: true, nowait: true }))).rejects.toThrow(ValidationError);
  });

  it('refuses to lock outside a transaction', async () => {
    const [x] = (await root.model('cc.job').create({ name: 'solo' })).ids;
    await expect(alice.model('cc.job').browse(x!).lock()).rejects.toThrow(EngineError);
  });

  it('applies write record rules: never locks records the caller cannot write', async () => {
    const [frozen] = (await root.model('cc.job').create({ name: 'f', state: 'frozen' })).ids;
    const { env, log } = spyEnv(alice);
    await expect(env.transaction(async (tx) => tx.lock('cc.job', frozen!))).rejects.toThrow(AccessError);
    expect(log.some((q) => q.includes('FOR UPDATE'))).toBe(false);
    // superuser bypasses rules
    expect(await root.transaction(async (tx) => tx.lock('cc.job', frozen!))).toEqual([frozen]);
  });

  it('claims queue items with FOR UPDATE SKIP LOCKED, filtered by read and write rules', async () => {
    await root.model('cc.job').create([{ name: 'q1', state: 'queued' }, { name: 'q2', state: 'queued' }, { name: 'q3', state: 'queued' }]);
    const [frozenQueued] = (await root.model('cc.job').create({ name: 'qf', state: 'frozen', note: 'queue' })).ids;
    const { env, log } = spyEnv(alice);
    const claimed = await env.transaction(async (tx) => {
      const batch = await tx.model('cc.job').searchLocked(['|', ['state', '=', 'queued'], ['note', '=', 'queue']], { limit: 2, order: 'id asc' });
      await batch.write({ state: 'running' });
      return [...batch.ids];
    });
    expect(claimed).toHaveLength(2);
    expect(claimed).not.toContain(frozenQueued);
    const q = log.find((x) => x.includes('SKIP LOCKED'))!;
    expect(q).toMatch(/LIMIT 2 FOR UPDATE OF t SKIP LOCKED$/);
    // next claim sees only the remaining queued row (sequential simulation of a second worker)
    const rest = await alice.transaction(async (tx) => [...(await tx.model('cc.job').searchLocked([['state', '=', 'queued']], { limit: 10 })).ids]);
    expect(rest).toHaveLength(1);
    await expect(alice.transaction(async (tx) => tx.model('cc.job').searchLocked([], { limit: 0 }))).rejects.toThrow(ValidationError);
    await expect(alice.transaction(async (tx) => tx.model('cc.job').searchLocked([], { limit: 5000 }))).rejects.toThrow(ValidationError);
  });

  it('exposes lock and claim to server scripts, counted against the row budget', async () => {
    await root.model('cc.job').create([{ name: 's1', state: 'script' }, { name: 's2', state: 'script' }]);
    await new ServerActionService(root).define({ key: 'cc.claim', type: 'script', code: `
      const ids = env.model('cc.job').claim([['state', '=', 'script']], { limit: 5 });
      env.model('cc.job').lock(ids, { nowait: true });
      env.model('cc.job').write(ids, { state: 'claimed' });
      ids.length;
    ` });
    expect(await new ServerActionService(alice).run('cc.claim')).toBe(2);
    expect(await root.model('cc.job').searchCount([['state', '=', 'claimed']])).toBe(2);
    // claim 2 + lock 2 + write 2 = 6 rows > 5
    await root.model('cc.job').create([{ name: 's3', state: 'script' }, { name: 's4', state: 'script' }]);
    await expect(new ServerActionService(alice, { maxRows: 5 }).run('cc.claim')).rejects.toThrow(/row quota/);
    expect(await root.model('cc.job').searchCount([['state', '=', 'script']])).toBe(2);
    await new ServerActionService(root).define({ key: 'cc.badlock', type: 'script', code: `env.model('cc.job').lock([1], { nowait: 'yes' })` });
    await expect(new ServerActionService(alice).run('cc.badlock')).rejects.toThrow(/boolean/);
  });
});

describe('optimistic concurrency', () => {
  it('rejects writes when write_date changed since the client read it', async () => {
    const J = alice.model('cc.job');
    const [id] = (await J.create({ name: 'occ', state: 'open' })).ids;
    const [first] = await J.browse(id!).read(['write_date']);
    const stamp = first!.write_date as Date | string;
    await J.browse(id!).write({ note: 'mine' }, { checkWriteDate: { [id!]: stamp } });
    // stale copy now
    await expect(J.browse(id!).write({ note: 'stale' }, { checkWriteDate: { [id!]: stamp } })).rejects.toThrow(ConcurrencyError);
    const [after] = await J.browse(id!).read(['write_date', 'note']);
    expect(after!.note).toBe('mine');
    // ISO string and context form (keyed by model)
    const iso = new Date(after!.write_date as string).toISOString();
    await alice.withContext({ check_write_date: { 'cc.job': { [id!]: iso } } }).model('cc.job').browse(id!).write({ note: 'ctx' });
    await expect(alice.withContext({ check_write_date: { 'cc.job': { [id!]: iso } } }).model('cc.job').browse(id!).write({ note: 'x' }))
      .rejects.toThrow(ConcurrencyError);
    // ConcurrencyError is a ValidationError (existing API mapping keeps working)
    expect(new ConcurrencyError('x')).toBeInstanceOf(ValidationError);
    await expect(J.browse(id!).write({ note: 'x' }, { checkWriteDate: { [id!]: 'not a date' } })).rejects.toThrow(ValidationError);
    // the check reads under a row lock
    const { env, log } = spyEnv(alice);
    const [cur] = await J.browse(id!).read(['write_date']);
    await env.model('cc.job').browse(id!).write({ note: 'spy' }, { checkWriteDate: { [id!]: cur!.write_date as string } });
    expect(log.some((q) => q.includes('unnest(') && q.endsWith('FOR UPDATE OF t'))).toBe(true);
  });
});

describe('server action removal race', () => {
  it('checks references and deletes under one transaction-scoped lock', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'cc.used', model: 'cc.job', type: 'update_record', values: { note: "'u'" } });
    await new AutomationRuleService(root).define({ key: 'cc.rule', model: 'cc.job', trigger: 'on_create', action: 'cc.used' });
    const { env, log } = spyEnv(root);
    await expect(removeServerActionDefinitions(env, ['cc.used'])).rejects.toThrow(/still used/);
    expect(log.some((q) => q.includes('nx.server_action_refs'))).toBe(true);
    expect(await actions.resolve('cc.used')).not.toBeNull();
    // definitions that add references take the same lock
    const spy2 = spyEnv(root);
    await new AutomationRuleService(spy2.env).define({ key: 'cc.rule', model: 'cc.job', trigger: 'on_create', action: 'cc.used', enabled: false });
    expect(spy2.log.some((q) => q.includes('nx.server_action_refs'))).toBe(true);
  });
});

describe('addMixin', () => {
  it('computes the added fields under the metadata lock', async () => {
    const store = new MetadataStore((root as EnvImpl).db, (root as EnvImpl).registry, 'concurrency');
    await store.addMixin('cc.plain', 'cc.mix', { actor: root });
    expect((root as EnvImpl).registry.get('cc.plain').fields.has('cc_extra')).toBe(true);
    await expect(store.addMixin('cc.plain', 'cc.mix', { actor: root })).rejects.toThrow(/already inherits/);
  });
});

describe('review follow-ups', () => {
  it('takes the hierarchy advisory lock before any row lock (write, lock, searchLocked)', async () => {
    const N = root.model('cc.node');
    const [p] = (await N.create({ name: 'P' })).ids;
    const [k] = (await N.create({ name: 'K' })).ids;
    const [row] = await N.browse(k!).read(['write_date']);
    const { env, log } = spyEnv(root);
    await env.model('cc.node').browse(k!).write({ parent_id: p }, { checkWriteDate: { [k!]: row!.write_date as Date } });
    const advisory = log.findIndex((q) => q.includes('nx.parent_path'));
    const rowLock = log.findIndex((q) => q.includes('FOR UPDATE'));
    expect(advisory).toBeGreaterThanOrEqual(0);
    expect(advisory).toBeLessThan(rowLock);
    for (const run of [
      (tx: Env) => tx.model('cc.node').browse(k!).lock(),
      (tx: Env) => tx.model('cc.node').searchLocked([], { limit: 1 }),
    ]) {
      log.length = 0;
      await env.transaction(async (tx) => { await run(tx); });
      expect(log.findIndex((q) => q.includes('nx.parent_path'))).toBeLessThan(log.findIndex((q) => q.includes('FOR UPDATE')));
      expect(log.findIndex((q) => q.includes('nx.parent_path'))).toBeGreaterThanOrEqual(0);
    }
  });

  it('maps lock_not_available (55P03) and deadlock_detected (40P01) to ConcurrencyError', async () => {
    const [x] = (await root.model('cc.job').create({ name: 'busy' })).ids;
    const nowait = spyEnv(root, (q) => (q.includes('NOWAIT') ? '55P03' : undefined));
    await expect(nowait.env.transaction(async (tx) => tx.lock('cc.job', x!, { nowait: true }))).rejects.toThrow(ConcurrencyError);
    const dead = spyEnv(root, (q) => (q.startsWith('UPDATE "cc_job"') ? '40P01' : undefined));
    await expect(dead.env.model('cc.job').browse(x!).write({ note: 'd' })).rejects.toThrow(ConcurrencyError);
    const occ = spyEnv(root, (q) => (q.includes('unnest') ? '55P03' : undefined));
    const [r] = await root.model('cc.job').browse(x!).read(['write_date']);
    await expect(occ.env.model('cc.job').browse(x!).write({ note: 'o' }, { checkWriteDate: { [x!]: r!.write_date as Date } })).rejects.toThrow(ConcurrencyError);
  });

  it('consumes context.check_write_date at the top-level write only (automations may write the same record)', async () => {
    await new ServerActionService(root).define({ key: 'cc.bump', model: 'cc.doc', type: 'update_record', values: { counter: '(counter or 0) + 1' } });
    await new AutomationRuleService(root).define({ key: 'cc.bump_rule', model: 'cc.doc', trigger: 'on_write', triggerFields: ['name'], action: 'cc.bump' });
    const [id] = (await alice.model('cc.doc').create({ name: 'd0' })).ids;
    const [before] = await alice.model('cc.doc').browse(id!).read(['write_date']);
    await alice.withContext({ check_write_date: { 'cc.doc': { [id!]: before!.write_date as Date } } }).model('cc.doc').browse(id!).write({ name: 'd1' });
    const [after] = await alice.model('cc.doc').browse(id!).read(['name', 'counter']);
    expect(after).toMatchObject({ name: 'd1', counter: 1 });
  });

  it('compares write_date at full precision and requires an explicit offset', async () => {
    const [id] = (await root.model('cc.job').create({ name: 'micro' })).ids;
    await h.driver.query({ text: `UPDATE cc_job SET write_date = '2026-01-02 03:04:05.123456' WHERE id = $1`, params: [id] });
    const J = root.model('cc.job').browse(id!);
    const w = (ts: string) => J.write({ note: ts }, { checkWriteDate: { [id!]: ts } });
    const ms = async () => ((await J.read(['write_date']))[0]!.write_date as Date).toISOString(); // e.g. ...05.123Z
    const stamp = await ms();
    expect(stamp.endsWith('.123Z')).toBe(true);
    await expect(w(stamp.replace('.123Z', '.123457Z'))).rejects.toThrow(ConcurrencyError); // differs only in microseconds
    await expect(w(stamp.replace('.123Z', '.124Z'))).rejects.toThrow(ConcurrencyError);
    await expect(w(stamp.replace('Z', ''))).rejects.toThrow(/explicit offset/);
    await w(stamp.replace('.123Z', '.123456Z')); // exact microseconds
    await h.driver.query({ text: `UPDATE cc_job SET write_date = '2026-01-02 03:04:05.123456' WHERE id = $1`, params: [id] });
    await w(stamp.replace('Z', '+00:00')); // millisecond copy from read(), explicit offset
  });

  it('bounds script claims by the live row budget', async () => {
    await root.model('cc.job').create([1, 2, 3, 4].map((i) => ({ name: `b${i}`, state: 'budget' })));
    await new ServerActionService(root).define({ key: 'cc.budget', type: 'script', code: `
      env.model('cc.job').search([['state', '=', 'budget']], { limit: 2 });
      env.model('cc.job').claim([['state', '=', 'budget']], { limit: 5 }).length;
    ` });
    expect(await new ServerActionService(alice, { maxRows: 3 }).run('cc.budget')).toBe(1);
    await new ServerActionService(root).define({ key: 'cc.budget0', type: 'script', code: `
      env.model('cc.job').search([['state', '=', 'budget']], { limit: 3 });
      env.model('cc.job').claim([['state', '=', 'budget']]);
    ` });
    await expect(new ServerActionService(alice, { maxRows: 3 }).run('cc.budget0')).rejects.toThrow(/row quota/);
  });
});

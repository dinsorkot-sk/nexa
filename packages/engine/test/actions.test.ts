import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, AutomationRuleService, ButtonService, PgliteTenantManager, SchedulerService, ServerActionService, UserError, ValidationError,
  ensureSecurityTables, securityModels, writeModuleSecurity, writeModuleUi, type EnvImpl, type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  { name: 'act.order', origin: 'module', fields: {
    name: { type: 'char' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['done', 'Done'], ['cancel', 'Cancelled']], default: 'draft' },
    amount: { type: 'integer', default: 0 },
    counter: { type: 'integer', default: 0 },
    note: { type: 'char' },
    owner_id: { type: 'many2one', comodel: 'res.users' },
    deadline: { type: 'datetime' },
  }, methods: {
    action_cancel: async (records) => { await records.write({ state: 'cancel' }); return records.ids.length; },
  } },
  { name: 'act.log', origin: 'module', fields: { name: { type: 'char' }, order_id: { type: 'many2one', comodel: 'act.order' } } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;
let alice: Env;
let aliceUid: number;
let bobUid: number;
let seq = 0;

async function order(values: Record<string, unknown> = {}): Promise<number> {
  seq += 1;
  return (await root.model('act.order').create({ name: `O${seq}`, owner_id: aliceUid, ...values })).ids[0]!;
}
async function readOrder(id: number) {
  return (await tenant.env({ uid: 1 }).model('act.order').browse(id).read())[0]!;
}
async function logs(orderId: number) {
  return tenant.env({ uid: 1 }).model('act.log').searchRead([['order_id', '=', orderId]], ['name', 'create_uid']);
}

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('server-actions');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  const [company] = (await root.model('res.company').create({ name: 'Main' })).ids;
  const [group] = (await root.model('res.groups').create({ name: 'Users', code: 'test.user' })).ids;
  [aliceUid] = (await root.model('res.users').create({ name: 'Alice', login: 'alice', company_id: company, group_ids: [group] })).ids;
  [bobUid] = (await root.model('res.users').create({ name: 'Bob', login: 'bob', company_id: company, group_ids: [group] })).ids;
  await writeModuleSecurity(tenant.driver, 'act', [
    { model: 'act.order', group: 'test.user', perms: all },
    { model: 'act.log', group: 'test.user', perms: all },
  ], [
    { name: 'own_orders', model: 'act.order', groups: [], perms: all, domain: "[['owner_id', '=', user.id]]" },
  ]);
  alice = tenant.env({ uid: aliceUid });
  const actions = new ServerActionService(root);
  await actions.define({ key: 'act.confirm', model: 'act.order', type: 'update_record', values: { state: "'done'", amount: 'amount * 2' } });
  await actions.define({ key: 'act.log_it', model: 'act.order', type: 'create_record', targetModel: 'act.log',
    values: { name: "'log ' + name", order_id: 'record.id' } });
  await actions.define({ key: 'act.say', model: 'act.order', type: 'post_message', message: "'Hello ' + name" });
  await actions.define({ key: 'act.both', model: 'act.order', type: 'multi', children: ['act.confirm', 'act.log_it'] });
  await actions.define({ key: 'act.bump', model: 'act.order', type: 'update_record', values: { counter: 'counter + 1' } });
}, 60_000);

afterAll(() => mgr.closeAll());

describe('server actions', () => {
  it('updates, creates, posts and chains through multi actions as the caller', async () => {
    const id = await order({ amount: 21 });
    const actions = new ServerActionService(alice);
    expect(await actions.run('act.confirm', { model: 'act.order', ids: [id] })).toBe(true);
    expect(await readOrder(id)).toMatchObject({ state: 'done', amount: 42, write_uid: aliceUid });

    const created = await actions.run('act.log_it', { model: 'act.order', ids: [id] }) as number[];
    expect(created).toHaveLength(1);
    expect(await logs(id)).toEqual([expect.objectContaining({ name: `log O${seq}`, create_uid: aliceUid })]);

    await actions.run('act.say', { model: 'act.order', ids: [id] });
    const [message] = await tenant.driver.query<{ uid: number; payload: { message: string } }>({
      text: `SELECT uid, payload FROM nx_audit_log WHERE model='act.order' AND record_id=$1 AND event='message'`, params: [id],
    });
    expect(message).toMatchObject({ uid: aliceUid, payload: { message: `Hello O${seq}` } });

    const second = await order({ amount: 5 });
    await actions.run('act.both', { model: 'act.order', ids: [second] });
    expect(await readOrder(second)).toMatchObject({ state: 'done', amount: 10 });
    expect(await logs(second)).toHaveLength(1);
  });

  it('rejects invalid definitions and non-admin definers', async () => {
    const actions = new ServerActionService(root);
    await expect(actions.define({ key: 'act.bad', model: 'act.order', type: 'update_record', values: { nope: '1' } })).rejects.toThrow(ValidationError);
    await expect(actions.define({ key: 'act.bad', model: 'act.order', type: 'update_record', values: { name: '((' } })).rejects.toThrow(ValidationError);
    await expect(new ServerActionService(alice).define({ key: 'act.x', model: 'act.order', type: 'script', code: '1' })).rejects.toThrow(AccessError);
  });

  it('cannot act on records outside the caller record rules', async () => {
    const foreign = await order({ owner_id: bobUid });
    await expect(new ServerActionService(alice).run('act.confirm', { model: 'act.order', ids: [foreign] })).rejects.toThrow();
    expect((await readOrder(foreign)).state).toBe('draft');
  });

  it('runs scripts in the sandbox bound to the caller ACL, record rules and transaction', async () => {
    const mine = await order();
    const foreign = await order({ owner_id: bobUid });
    await new ServerActionService(root).define({ key: 'act.script', model: 'act.order', type: 'script', code: `
      const visible = env.model('act.order').search([], { fields: ['id', 'owner_id'] });
      env.model('act.order').write(records.ids, { note: 'scripted' });
      message_post('act.order', records.ids, 'from script');
      visible.map((row) => row.id);
    ` });
    const seen = await new ServerActionService(alice).run('act.script', { model: 'act.order', ids: [mine] }) as number[];
    expect(seen).toContain(mine);
    expect(seen).not.toContain(foreign);
    expect((await readOrder(mine)).note).toBe('scripted');

    await new ServerActionService(root).define({ key: 'act.steal', type: 'script', code: `
      env.model('act.order').write([${foreign}], { note: 'stolen' });
    ` });
    await expect(new ServerActionService(alice).run('act.steal')).rejects.toThrow();
    expect((await readOrder(foreign)).note).toBeNull();
    // the superuser path is the only one that may touch it
    await new ServerActionService(root).run('act.steal');
    expect((await readOrder(foreign)).note).toBe('stolen');
  });

  it('rolls back every write when the script fails', async () => {
    const id = await order();
    await new ServerActionService(root).define({ key: 'act.fail', model: 'act.order', type: 'script', code: `
      env.model('act.order').write(records.ids, { note: 'partial' });
      env.model('act.log').create({ name: 'orphan', order_id: records.ids[0] });
      raise('stop here');
    ` });
    await expect(new ServerActionService(alice).run('act.fail', { model: 'act.order', ids: [id] })).rejects.toThrow('stop here');
    expect((await readOrder(id)).note).toBeNull();
    expect(await logs(id)).toEqual([]);

    await new ServerActionService(root).define({ key: 'act.throw', model: 'act.order', type: 'script', code: `
      env.model('act.order').write(records.ids, { note: 'partial' });
      throw new Error('boom');
    ` });
    await expect(new ServerActionService(alice).run('act.throw', { model: 'act.order', ids: [id] })).rejects.toThrow('boom');
    expect((await readOrder(id)).note).toBeNull();
  });

  it('runs sandboxed code from module server actions and rolls back on timeout', async () => {
    await writeModuleUi(tenant.driver, 'act', (root as EnvImpl).registry.models, [], [
      { xmlId: 'srv_note', type: 'server', name: 'Note', model: 'act.order', code: "env.model('act.order').write(records.ids, { note: 'module' })" },
      { xmlId: 'srv_spin', type: 'server', name: 'Spin', model: 'act.order', code: "env.model('act.order').write(records.ids, { note: 'spin' }); while (true) {}" },
    ], []);
    await expect(writeModuleUi(tenant.driver, 'act2', (root as EnvImpl).registry.models, [], [
      { xmlId: 'bad', type: 'window', name: 'Bad', model: 'act.order', code: '1' },
    ], [])).rejects.toThrow(ValidationError);
    const id = await order();
    await new ServerActionService(alice).run('act.srv_note', { model: 'act.order', ids: [id] });
    expect((await readOrder(id)).note).toBe('module');
    await expect(new ServerActionService(alice, { scriptTimeoutMs: 200 }).run('act.srv_spin', { model: 'act.order', ids: [id] })).rejects.toThrow();
    expect((await readOrder(id)).note).toBe('module');
  });

  it('bounds recursion and rows', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'act.loop_a', model: 'act.order', type: 'multi', children: ['act.loop_b'] });
    await actions.define({ key: 'act.loop_b', model: 'act.order', type: 'multi', children: ['act.loop_a'] });
    const id = await order();
    await expect(new ServerActionService(alice).run('act.loop_a', { model: 'act.order', ids: [id] })).rejects.toThrow(/recursive|nesting/);

    await actions.define({ key: 'act.self', model: 'act.order', type: 'script', code: `call_action('act.self')` });
    await expect(new ServerActionService(alice).run('act.self', { model: 'act.order', ids: [id] })).rejects.toThrow(/recursive|nesting/);

    await actions.define({ key: 'act.nested', model: 'act.order', type: 'script', code: `call_action('act.bump'); call_action('act.bump', { ids: records.ids })` });
    await new ServerActionService(alice).run('act.nested', { model: 'act.order', ids: [id] });
    expect((await readOrder(id)).counter).toBe(2);

    const ids = [await order(), await order(), await order()];
    await expect(new ServerActionService(alice, { maxRows: 2 }).run('act.bump', { model: 'act.order', ids })).rejects.toThrow(/row quota/);
    for (const other of ids) expect((await readOrder(other)).counter).toBe(0);
  });
});

describe('automation rules', () => {
  it('fires on create with a post filter and does not re-trigger itself', async () => {
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.created', model: 'act.order', trigger: 'on_create', filter: [['amount', '>', 100]], action: 'act.log_it' });
    await rules.define({ key: 'auto.self', model: 'act.order', trigger: 'on_create_or_write', filter: [['name', '=like', 'SELF%']], action: 'act.bump' });
    try {
      const [small] = (await alice.model('act.order').create({ name: 'small', owner_id: aliceUid, amount: 1 })).ids;
      const [big] = (await alice.model('act.order').create({ name: 'big', owner_id: aliceUid, amount: 500 })).ids;
      expect(await logs(small!)).toEqual([]);
      expect(await logs(big!)).toEqual([expect.objectContaining({ name: 'log big', create_uid: aliceUid })]);

      // the rule's own write (counter + 1) must not fire the rule again
      const [self] = (await alice.model('act.order').create({ name: 'SELF1', owner_id: aliceUid })).ids;
      expect((await readOrder(self!)).counter).toBe(1);
      await alice.model('act.order').browse(self!).write({ note: 'touch' });
      expect((await readOrder(self!)).counter).toBe(2);
    } finally {
      await rules.define({ key: 'auto.created', model: 'act.order', trigger: 'on_create', action: 'act.log_it', enabled: false });
      await rules.define({ key: 'auto.self', model: 'act.order', trigger: 'on_write', action: 'act.bump', enabled: false });
    }
  });

  it('applies pre and post domains on write', async () => {
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.done', model: 'act.order', trigger: 'on_write',
      filterPre: [['state', '=', 'draft']], filter: [['state', '=', 'done']], action: 'act.log_it' });
    try {
      const id = await order();
      await alice.model('act.order').browse(id).write({ note: 'still draft' });
      expect(await logs(id)).toEqual([]);
      await alice.model('act.order').browse(id).write({ state: 'done' });
      expect(await logs(id)).toHaveLength(1);
      await alice.model('act.order').browse(id).write({ state: 'done', note: 'again' });
      expect(await logs(id)).toHaveLength(1);
    } finally {
      await rules.define({ key: 'auto.done', model: 'act.order', trigger: 'on_write', action: 'act.log_it', enabled: false });
    }
  });

  it('fires on_change_fields only when a watched value changes', async () => {
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.amount', model: 'act.order', trigger: 'on_change_fields', fields: ['amount'], action: 'act.log_it' });
    try {
      const id = await order({ amount: 3 });
      await alice.model('act.order').browse(id).write({ note: 'x' });
      await alice.model('act.order').browse(id).write({ amount: 3 });
      expect(await logs(id)).toEqual([]);
      await alice.model('act.order').browse(id).write({ amount: 4 });
      expect(await logs(id)).toHaveLength(1);
    } finally {
      await rules.define({ key: 'auto.amount', model: 'act.order', trigger: 'on_change_fields', fields: ['amount'], action: 'act.log_it', enabled: false });
    }
  });

  it('runs on_unlink before deletion and rolls back the unlink when the action fails', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'act.guard_unlink', model: 'act.order', type: 'script', code: `
      const rows = env.model('act.order').search([['id', 'in', records.ids]], { fields: ['state'] });
      if (rows.some((r) => r.state === 'done')) raise('Done orders cannot be deleted');
    ` });
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.unlink', model: 'act.order', trigger: 'on_unlink', action: 'act.guard_unlink' });
    try {
      const done = await order({ state: 'done' });
      const draft = await order();
      await expect(alice.model('act.order').browse(done).unlink()).rejects.toThrow(UserError);
      expect(await readOrder(done)).toMatchObject({ id: done });
      await alice.model('act.order').browse(draft).unlink();
      expect(await root.model('act.order').searchCount([['id', '=', draft]])).toBe(0);
    } finally {
      await rules.define({ key: 'auto.unlink', model: 'act.order', trigger: 'on_unlink', action: 'act.guard_unlink', enabled: false });
    }
  });

  it('keeps rule definition admin-only', async () => {
    await expect(new AutomationRuleService(alice).define({ key: 'auto.x', model: 'act.order', trigger: 'on_create', action: 'act.bump' }))
      .rejects.toThrow(AccessError);
    await expect(new AutomationRuleService(alice).runTimeTriggers()).rejects.toThrow(AccessError);
    await expect(new AutomationRuleService(root).define({ key: 'auto.x', model: 'act.order', trigger: 'on_time', action: 'act.bump', dateField: 'name' }))
      .rejects.toThrow(ValidationError);
  });
});

describe('scheduled actions', () => {
  it('evaluates time triggers from cron as the configured user, once per record', async () => {
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.overdue', model: 'act.order', trigger: 'on_time', dateField: 'deadline', delayMinutes: 60,
      filter: [['state', '=', 'draft']], action: 'act.bump', startAt: new Date('2026-01-01T00:00:00Z') });
    const scheduler = new SchedulerService(root);
    await scheduler.schedule({ key: 'cron.overdue', intervalMs: 60_000, nextRun: new Date('2026-01-01T00:00:00Z'), builtin: 'automation.on_time', userId: aliceUid });
    try {
      const overdue = await order({ deadline: '2026-01-01 08:00:00' });
      const recent = await order({ deadline: '2026-01-01 09:30:00' });
      const done = await order({ deadline: '2026-01-01 08:00:00', state: 'done' });
      const first = await scheduler.runDue(new Map(), 10, new Date('2026-01-01T10:00:00Z'));
      expect(first).toEqual({ completed: ['cron.overdue'], failed: [] });
      expect((await readOrder(overdue)).counter).toBe(1);
      expect((await readOrder(overdue)).write_uid).toBe(aliceUid);
      expect((await readOrder(recent)).counter).toBe(0);
      expect((await readOrder(done)).counter).toBe(0);
      await scheduler.runDue(new Map(), 10, new Date('2026-01-01T11:00:00Z'));
      expect((await readOrder(overdue)).counter).toBe(1);
      expect((await readOrder(recent)).counter).toBe(1);
    } finally {
      await scheduler.schedule({ key: 'cron.overdue', intervalMs: 60_000, enabled: false, builtin: 'automation.on_time', userId: aliceUid });
      await rules.define({ key: 'auto.overdue', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.bump', enabled: false });
    }
  });

  it('runs a server action as the job user and records failures with rollback', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'act.cron_log', type: 'script', code: `env.model('act.log').create({ name: 'cron-run' })` });
    await actions.define({ key: 'act.cron_fail', type: 'script', code: `env.model('act.log').create({ name: 'cron-fail' }); raise('nope')` });
    const scheduler = new SchedulerService(root);
    const at = new Date('2030-01-01T00:00:00Z');
    await scheduler.schedule({ key: 'cron.log', intervalMs: 60_000, nextRun: at, action: 'act.cron_log', userId: aliceUid });
    await scheduler.schedule({ key: 'cron.fail', intervalMs: 60_000, nextRun: at, action: 'act.cron_fail', userId: aliceUid });
    const result = await scheduler.runDue(undefined, 10, at);
    expect(result).toEqual({ completed: ['cron.log'], failed: ['cron.fail'] });
    expect(await root.model('act.log').searchRead([['name', '=', 'cron-run']], ['create_uid'])).toEqual([expect.objectContaining({ create_uid: aliceUid })]);
    expect(await root.model('act.log').searchCount([['name', '=', 'cron-fail']])).toBe(0);
    const [row] = await tenant.driver.query<{ last_error: string }>({ text: `SELECT last_error FROM nx_scheduled_job WHERE key='cron.fail'`, params: [] });
    expect(row!.last_error).toBe('nope');

    await expect(scheduler.schedule({ key: 'cron.nouser', intervalMs: 1, action: 'act.cron_log' })).rejects.toThrow(ValidationError);
    await root.model('res.users').browse(bobUid).write({ active: false });
    try {
      await expect(scheduler.schedule({ key: 'cron.bob', intervalMs: 1, action: 'act.cron_log', userId: bobUid })).rejects.toThrow(AccessError);
    } finally {
      await root.withContext({ activeTest: false }).model('res.users').browse(bobUid).write({ active: true });
    }
    await scheduler.schedule({ key: 'cron.log', intervalMs: 60_000, enabled: false, action: 'act.cron_log', userId: aliceUid });
    await scheduler.schedule({ key: 'cron.fail', intervalMs: 60_000, enabled: false, action: 'act.cron_fail', userId: aliceUid });
  });
});

describe('buttons', () => {
  it('executes guarded action and method buttons per record', async () => {
    const buttons = new ButtonService(root);
    await buttons.define({ model: 'act.order', action: 'act.confirm', guard: "state == 'draft'" });
    await buttons.define({ model: 'act.order', method: 'action_cancel', guard: "state != 'cancel'" });
    const id = await order({ amount: 2 });
    const asAlice = new ButtonService(alice);
    await asAlice.execute('act.order', [id], { action: 'act.confirm' });
    expect(await readOrder(id)).toMatchObject({ state: 'done', amount: 4 });
    await expect(asAlice.execute('act.order', [id], { action: 'act.confirm' })).rejects.toThrow(UserError);
    expect(await readOrder(id)).toMatchObject({ state: 'done', amount: 4 });

    expect(await asAlice.execute('act.order', [id], { method: 'action_cancel' })).toBe(1);
    await expect(asAlice.execute('act.order', [id], { method: 'action_cancel' })).rejects.toThrow(UserError);

    // a guard failing on one record rejects the whole batch
    const a = await order();
    const b = await order({ state: 'cancel' });
    await expect(asAlice.execute('act.order', [a, b], { method: 'action_cancel' })).rejects.toThrow(UserError);
    expect((await readOrder(a)).state).toBe('draft');

    // unregistered actions are not buttons; foreign records are invisible
    await expect(asAlice.execute('act.order', [a], { action: 'act.bump' })).rejects.toThrow(AccessError);
    const foreign = await order({ owner_id: bobUid });
    await expect(asAlice.execute('act.order', [foreign], { action: 'act.confirm' })).rejects.toThrow();
    await expect(new ButtonService(alice).define({ model: 'act.order', action: 'act.bump' })).rejects.toThrow(AccessError);
  });
});

describe('review fixes', () => {
  const at = (iso: string) => new Date(iso);

  it('isolates failing time rules, skips invisible records and records last_error', async () => {
    const actions = new ServerActionService(root);
    await actions.define({ key: 'act.time_fail', model: 'act.order', type: 'script', code: `raise('time rule broke')` });
    const rules = new AutomationRuleService(root);
    const start = at('2027-01-01T00:00:00Z');
    await rules.define({ key: 'auto.t_fail', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.time_fail',
      filter: [['name', '=like', 'TF%']], startAt: start });
    await rules.define({ key: 'auto.t_ok', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.bump',
      filter: [['name', '=like', 'TOK%']], startAt: start });
    const scheduler = new SchedulerService(root);
    await scheduler.schedule({ key: 'cron.t', intervalMs: 60_000, nextRun: start, builtin: 'automation.on_time', userId: aliceUid });
    try {
      await order({ name: 'TF1', deadline: '2027-01-01 01:00:00' });
      const mine = await order({ name: 'TOK1', deadline: '2027-01-01 01:00:00' });
      const foreign = await order({ name: 'TOK2', deadline: '2027-01-01 01:00:00', owner_id: bobUid });
      const result = await scheduler.runDue(undefined, 10, at('2027-01-01T02:00:00Z'));
      expect(result.failed).toEqual(['cron.t']);
      expect((await readOrder(mine)).counter).toBe(1);
      expect((await readOrder(foreign)).counter).toBe(0);
      const rows = await tenant.driver.query<{ key: string; last_error: string | null }>({
        text: `SELECT key, last_error FROM nx_automation WHERE key IN ('auto.t_fail','auto.t_ok') ORDER BY key`, params: [],
      });
      expect(rows).toEqual([{ key: 'auto.t_fail', last_error: 'time rule broke' }, { key: 'auto.t_ok', last_error: null }]);
    } finally {
      await scheduler.schedule({ key: 'cron.t', intervalMs: 60_000, enabled: false, builtin: 'automation.on_time', userId: aliceUid });
      await rules.define({ key: 'auto.t_fail', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.time_fail', enabled: false });
      await rules.define({ key: 'auto.t_ok', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.bump', enabled: false });
    }
  });

  it('drains more due records than one page, including ties on the same instant', async () => {
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.many', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.bump',
      filter: [['name', '=like', 'MANY%']], startAt: at('2028-01-01T00:00:00Z') });
    try {
      const values = Array.from({ length: 520 }, (_, i) => ({ name: `MANY${i}`, owner_id: aliceUid, deadline: '2028-01-01 01:00:00' }));
      const ids = (await root.model('act.order').create(values)).ids;
      expect(await rules.runTimeTriggers(at('2028-01-01T02:00:00Z'))).toBe(520);
      const fresh = tenant.env({ uid: 1 });
      expect(await fresh.model('act.order').searchCount([['id', 'in', [...ids]], ['counter', '=', 1]])).toBe(520);
      expect(await rules.runTimeTriggers(at('2028-01-01T03:00:00Z'))).toBe(0);
    } finally {
      await rules.define({ key: 'auto.many', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.bump', enabled: false });
    }
  }, 120_000);

  it('starts time rules at enable time and keeps the watermark on re-definition', async () => {
    const past = await order({ name: 'PAST', deadline: '2020-01-01 00:00:00' });
    const rules = new AutomationRuleService(root);
    const def = { key: 'auto.wm', model: 'act.order', trigger: 'on_time' as const, dateField: 'deadline', action: 'act.bump' };
    await rules.define({ ...def, filter: [['name', '=', 'PAST']] });
    try {
      expect(await rules.runTimeTriggers()).toBe(0);
      expect((await readOrder(past)).counter).toBe(0);
      const query = { text: `SELECT last_run FROM nx_automation WHERE key='auto.wm'`, params: [] };
      const [before] = await tenant.driver.query<{ last_run: Date }>(query);
      await rules.define({ ...def, filter: [['name', '=', 'PAST'], ['state', '=', 'draft']] });
      const [after] = await tenant.driver.query<{ last_run: Date }>(query);
      expect(after!.last_run).toEqual(before!.last_run);
      expect(await rules.runTimeTriggers()).toBe(0);
    } finally {
      await rules.define({ ...def, enabled: false });
    }
  });

  it('never runs automations as sudo for a sudo-triggered write', async () => {
    const foreign = await order({ owner_id: bobUid });
    const actions = new ServerActionService(root);
    await actions.define({ key: 'act.touch_foreign', model: 'act.order', type: 'script',
      code: `env.model('act.order').write([${foreign}], { note: 'escalated' })` });
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.sudo', model: 'act.order', trigger: 'on_create', filter: [['name', '=', 'SUDO']], action: 'act.touch_foreign' });
    try {
      await expect(alice.sudo().model('act.order').create({ name: 'SUDO', owner_id: aliceUid })).rejects.toThrow(AccessError);
      expect((await readOrder(foreign)).note).toBeNull();
    } finally {
      await rules.define({ key: 'auto.sudo', model: 'act.order', trigger: 'on_create', action: 'act.touch_foreign', enabled: false });
    }
  });

  it('hides internal host errors and keeps script-raised messages', async () => {
    const id = await order();
    const actions = new ServerActionService(root);
    await actions.define({ key: 'act.bad_sql', model: 'act.order', type: 'script',
      code: `env.model('act.order').search([['amount', '=', 'not-a-number']])` });
    const logged: unknown[] = [];
    const error = await new ServerActionService(alice, { onHostError: (_key, e) => logged.push(e) })
      .run('act.bad_sql', { model: 'act.order', ids: [id] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UserError);
    expect((error as Error).message).toBe("Server action 'act.bad_sql' failed");
    expect(logged).toHaveLength(1);
    await actions.define({ key: 'act.js_throw', model: 'act.order', type: 'script', code: `throw new Error('visible reason')` });
    await expect(new ServerActionService(alice).run('act.js_throw', { model: 'act.order', ids: [id] })).rejects.toThrow('visible reason');
  });

  it('shares one row budget across an automation cascade', async () => {
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.cascade', model: 'act.order', trigger: 'on_change_fields', fields: ['counter'],
      filter: [['name', '=', 'CASCADE']], action: 'act.log_it' });
    try {
      const id = await order({ name: 'CASCADE' });
      await expect(new ServerActionService(alice, { maxRows: 1 }).run('act.bump', { model: 'act.order', ids: [id] })).rejects.toThrow(/row quota/);
      expect((await readOrder(id)).counter).toBe(0);
      await new ServerActionService(alice, { maxRows: 2 }).run('act.bump', { model: 'act.order', ids: [id] });
      expect((await readOrder(id)).counter).toBe(1);
      expect(await logs(id)).toHaveLength(1);
    } finally {
      await rules.define({ key: 'auto.cascade', model: 'act.order', trigger: 'on_create', action: 'act.log_it', enabled: false });
    }
  });

  it('rejects server action keys that collide with module actions', async () => {
    await expect(new ServerActionService(root).define({ key: 'act.srv_note', model: 'act.order', type: 'script', code: '1' }))
      .rejects.toThrow(/collides/);
  });
});

describe('re-review fixes', () => {
  it('fires microsecond-precision time records exactly once across pages and runs', async () => {
    const rules = new AutomationRuleService(root);
    await rules.define({ key: 'auto.micro', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.bump',
      filter: [['name', '=like', 'MICRO%']], startAt: new Date('2029-01-01T00:00:00Z') });
    try {
      // all within one millisecond; pairs share the same microsecond (id tie-break)
      const values = Array.from({ length: 520 }, (_, i) => ({
        name: `MICRO${i}`, owner_id: aliceUid, deadline: `2029-01-01 01:00:00.123${String(i >> 1).padStart(3, '0')}`,
      }));
      const ids = (await root.model('act.order').create(values)).ids;
      const [sample] = await tenant.driver.query<{ v: string }>({ text: `SELECT deadline::text AS v FROM act_order WHERE id=$1`, params: [ids[3]] });
      expect(sample!.v).toContain('.123001');
      expect(await rules.runTimeTriggers(new Date('2029-01-01T02:00:00Z'))).toBe(520);
      expect(await rules.runTimeTriggers(new Date('2029-01-01T03:00:00Z'))).toBe(0);
      const fresh = tenant.env({ uid: 1 });
      expect(await fresh.model('act.order').searchCount([['id', 'in', [...ids]], ['counter', '=', 1]])).toBe(520);
    } finally {
      await rules.define({ key: 'auto.micro', model: 'act.order', trigger: 'on_time', dateField: 'deadline', action: 'act.bump', enabled: false });
    }
  }, 120_000);

  it('sees rule changes immediately: in-transaction, after rollback and after deletion', async () => {
    const rules = new AutomationRuleService(root);
    const id = await order({ name: 'LIVE' });
    // defined and used in one transaction that rolls back: visible inside, gone afterwards
    await expect(root.transaction(async (tx) => {
      await new AutomationRuleService(tx).define({ key: 'auto.live', model: 'act.order', trigger: 'on_write', filter: [['name', '=', 'LIVE']], action: 'act.log_it' });
      await tx.model('act.order').browse(id).write({ note: 'in tx' });
      expect(await tx.model('act.log').searchCount([['order_id', '=', id]])).toBe(1);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    await alice.model('act.order').browse(id).write({ note: 'after rollback' });
    expect(await logs(id)).toEqual([]);

    await rules.define({ key: 'auto.live', model: 'act.order', trigger: 'on_write', filter: [['name', '=', 'LIVE']], action: 'act.log_it' });
    await alice.model('act.order').browse(id).write({ note: 'fires' });
    expect(await logs(id)).toHaveLength(1);
    await tenant.driver.query({ text: `DELETE FROM nx_automation WHERE key='auto.live'`, params: [] });
    await alice.model('act.order').browse(id).write({ note: 'deleted' });
    expect(await logs(id)).toHaveLength(1);
  });

  it('never lets driver error text into the sandbox', async () => {
    const id = await order();
    const actions = new ServerActionService(root);
    await actions.define({ key: 'act.leak', model: 'act.order', type: 'script', code: `
      let text = '';
      try { env.model('act.order').search([['amount', '=', 'not-a-number']]); } catch (e) { text = String(e && e.message); }
      raise('seen: ' + text);
    ` });
    const logged: unknown[] = [];
    const seen = await new ServerActionService(alice, { onHostError: (_k, e) => logged.push(e) })
      .run('act.leak', { model: 'act.order', ids: [id] }).catch((e: unknown) => e);
    expect((seen as Error).message).toBe('seen: Internal host operation failed (NX_HOST_ERROR)');
    expect(logged).toHaveLength(1);
    expect(String((logged[0] as Error).message)).not.toContain('NX_HOST_ERROR');

    // swallowing the failure and finishing normally still fails the run (the transaction may be aborted)
    await actions.define({ key: 'act.swallow', model: 'act.order', type: 'script', code: `
      try { env.model('act.order').search([['amount', '=', 'x']]); } catch (e) { /* ignored */ }
      env.model('act.order').write(records.ids, { note: 'after failure' });
      'ok';
    ` });
    const swallowed = await new ServerActionService(alice, { onHostError: () => undefined })
      .run('act.swallow', { model: 'act.order', ids: [id] }).catch((e: unknown) => e);
    expect(swallowed).toBeInstanceOf(UserError);
    expect((swallowed as Error).message).toBe("Server action 'act.swallow' failed");
    expect((await readOrder(id)).note).toBeNull();
    await actions.define({ key: 'act.rethrow', model: 'act.order', type: 'script', code: `
      try { env.model('act.order').search([['amount', '=', 'x']]); } catch (e) { throw new Error('wrapped: ' + e.message); }
    ` });
    const error = await new ServerActionService(alice, { onHostError: () => undefined })
      .run('act.rethrow', { model: 'act.order', ids: [id] }).catch((e: unknown) => e);
    expect((error as Error).message).toBe("Server action 'act.rethrow' failed");
  });

  it('re-runs service DDL when the recorded schema version is older', async () => {
    await tenant.driver.query({ text: `ALTER TABLE nx_automation DROP COLUMN last_value`, params: [] });
    await tenant.driver.query({ text: `COMMENT ON TABLE nx_service_ready IS '1'`, params: [] });
    await new ServerActionService(root).resolve('act.bump'); // any service call ensures the schema
    const columns = await tenant.driver.query({
      text: `SELECT 1 FROM information_schema.columns WHERE table_name='nx_automation' AND column_name='last_value'`, params: [],
    });
    expect(columns).toHaveLength(1);
  });
});

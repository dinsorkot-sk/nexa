import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, PgliteTenantManager, ServerActionService, ensureSecurityTables, securityModels, writeModuleSecurity,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';
import { configAccess, configModels, configRules } from '../src/base/config-models.js';
import { baseModule } from '../src/base/manifest.js';
import {
  ConfigParameterService, DefaultService, SequenceService, SchedulerService, importServiceConfigRecords, interpolateSequence,
} from '../src/services/index.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  ...configModels,
  { name: 'cfg.order', origin: 'module', fields: {
    name: { type: 'char' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['done', 'Done']], default: 'draft' },
    note: { type: 'char', default: 'field default' },
    priority: { type: 'integer', default: 0 },
    deadline: { type: 'datetime' },
    reviewer_id: { type: 'many2one', comodel: 'res.users' },
    locked_note: { type: 'char', writeGroups: ['base.group_system'] },
  } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;
let admin: Env;
let alice: Env;
let aliceUid: number;
let companyA: number;
let companyB: number;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('config-records');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  [companyA] = (await root.model('res.company').create({ name: 'A' })).ids as number[];
  [companyB] = (await root.model('res.company').create({ name: 'B' })).ids as number[];
  const [user] = (await root.model('res.groups').create({ name: 'Users', code: 'base.group_user' })).ids;
  const [system] = (await root.model('res.groups').create({ name: 'Settings', code: 'base.group_system', implied_ids: [user] })).ids;
  const [adminUid] = (await root.model('res.users').create({
    name: 'Admin', login: 'adm', company_id: companyA, company_ids: [companyA, companyB], group_ids: [system],
  })).ids;
  [aliceUid] = (await root.model('res.users').create({
    name: 'Alice', login: 'alice', company_id: companyA, company_ids: [companyA, companyB], group_ids: [user],
  })).ids as number[];
  await writeModuleSecurity(tenant.driver, 'base', [...configAccess, { model: 'cfg.order', group: 'base.group_user', perms: all }], configRules);
  admin = tenant.env({ uid: adminUid! });
  alice = tenant.env({ uid: aliceUid });
}, 60_000);

afterAll(() => mgr.closeAll());

describe('base manifest', () => {
  it('ships the configuration models with system-only ACLs', () => {
    const names = baseModule.models!.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(['ir.sequence', 'ir.sequence.date_range', 'ir.config_parameter', 'ir.default', 'ir.cron', 'ir.automation']));
    expect(baseModule.access!.filter((a) => a.model === 'ir.config_parameter').map((a) => a.group)).toEqual(['base.group_system']);
  });
});

describe('sequences as records', () => {
  it('interpolates date placeholders and rejects unknown ones', () => {
    expect(interpolateSequence('%(year)s/%(y)s-%(month)s', { year: '2026', y: '26', month: '03' })).toBe('2026/26-03');
    expect(() => interpolateSequence('%(nope)s', {})).toThrow(/placeholder/);
  });

  it('reads prefix, suffix, padding and step from the record, in the user timezone', async () => {
    await admin.model('ir.sequence').create({
      name: 'Invoices', code: 'cfg.inv', prefix: 'INV/%(year)s/%(month)s/%(day)s/', suffix: '-%(h24)s', padding: 4, number_increment: 2,
    });
    const tokyo = alice.withContext({ tz: 'Asia/Tokyo' });
    const seq = new SequenceService(tokyo);
    // 2026-12-31 20:00 UTC is 2027-01-01 05:00 in Tokyo
    expect(await seq.next('cfg.inv', { date: new Date('2026-12-31T20:00:00Z') })).toBe('INV/2027/01/01/0001-05');
    expect(await new SequenceService(alice).next('cfg.inv', { date: new Date('2026-12-31T20:00:00Z') })).toBe('INV/2026/12/31/0003-20');
  });

  it('computes day-of-year, week-of-year and weekday', async () => {
    await admin.model('ir.sequence').create({ name: 'W', code: 'cfg.week', prefix: '%(doy)s|%(woy)s|%(weekday)s|%(h12)s|', padding: 1 });
    // 2024-01-01 is a Monday: doy 001, %W week 01, weekday 1
    expect(await new SequenceService(alice).next('cfg.week', { date: '2024-01-01' })).toBe('001|01|1|12|1');
  });

  it('prefers the company-specific sequence over the global one', async () => {
    await admin.model('ir.sequence').create({ name: 'Global', code: 'cfg.co', prefix: 'G', padding: 1 });
    await admin.model('ir.sequence').create({ name: 'B', code: 'cfg.co', prefix: 'B', padding: 1, company_id: companyB });
    const seq = new SequenceService(alice);
    expect(await seq.next('cfg.co')).toBe('G1');
    expect(await seq.next('cfg.co', { companyId: companyB })).toBe('B1');
    expect(await new SequenceService(tenant.env({ uid: aliceUid, companyIds: [companyB] })).next('cfg.co')).toBe('B2');
    await expect(admin.model('ir.sequence').create({ name: 'dup', code: 'cfg.co', company_id: companyB })).rejects.toThrow(/already exists/);
  });

  it('keeps no_gap counters on the record and rolls them back with the transaction', async () => {
    const rec = await admin.model('ir.sequence').create({ name: 'NG', code: 'cfg.ng', implementation: 'no_gap', padding: 2 });
    const seq = new SequenceService(alice);
    expect(await seq.next('cfg.ng')).toBe('01');
    await expect(alice.transaction(async (tx) => {
      await new SequenceService(tx).next('cfg.ng');
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await seq.next('cfg.ng')).toBe('02');
    expect((await rec.read(['number_next']))[0]!.number_next).toBe(3);
  });

  it('standard sequences restart when number_next is edited and never reuse numbers when switching implementation', async () => {
    const rec = await admin.model('ir.sequence').create({ name: 'Std', code: 'cfg.std', padding: 1 });
    const seq = new SequenceService(alice);
    expect(await seq.next('cfg.std')).toBe('1');
    expect(await seq.next('cfg.std')).toBe('2');
    await admin.model('ir.sequence').browse(rec.ids[0]!).write({ number_next: 10 });
    expect(await seq.next('cfg.std')).toBe('10');
    await admin.model('ir.sequence').browse(rec.ids[0]!).write({ implementation: 'no_gap' });
    expect(await seq.next('cfg.std')).toBe('11');
    await admin.model('ir.sequence').browse(rec.ids[0]!).write({ implementation: 'standard', number_increment: 5 });
    expect(await seq.next('cfg.std')).toBe('12');
    expect(await seq.next('cfg.std')).toBe('17');
  });

  it('uses per-year and per-month date-range sub-sequences', async () => {
    await admin.model('ir.sequence').create({
      name: 'Y', code: 'cfg.year', prefix: '%(range_year)s/', padding: 3, use_date_range: true, implementation: 'no_gap',
    });
    const seq = new SequenceService(alice);
    expect(await seq.next('cfg.year', { date: '2026-03-01' })).toBe('2026/001');
    expect(await seq.next('cfg.year', { date: '2026-11-30' })).toBe('2026/002');
    expect(await seq.next('cfg.year', { date: '2027-01-02' })).toBe('2027/001');
    const ranges = await root.model('ir.sequence.date_range').searchRead([['sequence_id.code', '=', 'cfg.year']], ['date_from', 'date_to']);
    expect(ranges).toHaveLength(2);

    await admin.model('ir.sequence').create({
      name: 'M', code: 'cfg.month', prefix: '%(range_y)s%(range_month)s-', padding: 1, use_date_range: true, date_range_period: 'month',
    });
    expect(await seq.next('cfg.month', { date: '2026-02-10' })).toBe('2602-1');
    expect(await seq.next('cfg.month', { date: '2026-02-28' })).toBe('2602-2');
    expect(await seq.next('cfg.month', { date: '2026-03-01' })).toBe('2603-1');
  });

  it('validates records and keeps the legacy call-time behaviour for unknown codes', async () => {
    await expect(admin.model('ir.sequence').create({ name: 'x', code: 'cfg.bad', prefix: '%(bogus)s' })).rejects.toThrow(/placeholder/);
    await expect(admin.model('ir.sequence').create({ name: 'x', code: 'cfg.bad', number_increment: 0 })).rejects.toThrow(/step/);
    await expect(alice.model('ir.sequence').create({ name: 'x', code: 'cfg.alice' })).rejects.toThrow(AccessError);
    expect(await new SequenceService(alice).next('cfg.legacy', { prefix: 'L-', padding: 3 })).toBe('L-001');
    expect(await new SequenceService(alice).next('cfg.legacy')).toBe('L-002');
  });
});

describe('sequence number reuse protection', () => {
  it('ignores unchanged number_next on full-record saves, rejects lower values and shows the actual next number', async () => {
    const rec = await admin.model('ir.sequence').create({ name: 'Save', code: 'cfg.save', padding: 1 });
    const id = rec.ids[0]!;
    const seq = new SequenceService(alice);
    expect(await seq.next('cfg.save')).toBe('1');
    expect(await seq.next('cfg.save')).toBe('2');
    expect((await admin.model('ir.sequence').browse(id).read(['number_next', 'number_next_actual']))[0])
      .toMatchObject({ number_next: 1, number_next_actual: 3 });
    // a client saving the whole form sends the stale stored number_next back
    await expect(admin.model('ir.sequence').browse(id).write({ name: 'Save 2', number_next: 1 })).rejects.toThrow(/lower than 3/);
    await admin.model('ir.sequence').browse(id).write({ name: 'Save 2', number_next: 3 });
    expect(await seq.next('cfg.save')).toBe('3');
    await admin.model('ir.sequence').browse(id).write({ number_next: 20 });
    expect(await seq.next('cfg.save')).toBe('20');
  });

  it('only allows companies the user may act for', async () => {
    const [other] = (await root.model('res.company').create({ name: 'C' })).ids;
    await admin.model('ir.sequence').create({ name: 'C', code: 'cfg.cmp', padding: 1 });
    await expect(new SequenceService(alice).next('cfg.cmp', { companyId: other! })).rejects.toThrow(AccessError);
    expect(await new SequenceService(root).next('cfg.cmp', { companyId: other! })).toBe('1');
  });
});

describe('config parameters', () => {
  it('is admin-writable, admin-readable and public only when flagged', async () => {
    const adminParams = new ConfigParameterService(admin);
    await adminParams.set('web.base.url', 'https://example.test');
    await adminParams.set('cfg.secret', 's3cret');
    await adminParams.set('cfg.public', 'yes', { isPublic: true });
    expect(await adminParams.get('cfg.secret')).toBe('s3cret');
    expect(await adminParams.get('cfg.missing')).toBeNull();

    const aliceParams = new ConfigParameterService(alice);
    expect(await aliceParams.get('cfg.public')).toBe('yes');
    await expect(aliceParams.get('cfg.secret')).rejects.toThrow(AccessError);
    await expect(aliceParams.get('cfg.missing')).rejects.toThrow(AccessError);
    await expect(aliceParams.set('cfg.secret', 'x')).rejects.toThrow(AccessError);
    await expect(alice.model('ir.config_parameter').searchRead([], ['key', 'value'])).rejects.toThrow(AccessError);

    expect((await admin.model('ir.config_parameter').searchRead([['key', '=', 'cfg.secret']], ['value']))[0]!.value).toBe('s3cret');
    await adminParams.set('cfg.secret', null);
    expect(await adminParams.get('cfg.secret')).toBeNull();
    await expect(admin.model('ir.config_parameter').create({ key: 'bad key!', value: 'x' })).rejects.toThrow(/key/);
  });
});

describe('ir.default', () => {
  it('applies context > user > company > global > field default in default_get and create', async () => {
    const adminDefaults = new DefaultService(admin);
    await adminDefaults.set('cfg.order', 'note', 'global', { scope: 'global' });
    expect(await alice.model('cfg.order').defaultGet(['note', 'state'])).toEqual({ note: 'global', state: 'draft' });

    await adminDefaults.set('cfg.order', 'note', 'company A', { scope: 'company', companyId: companyA });
    expect((await alice.model('cfg.order').defaultGet(['note'])).note).toBe('company A');
    const inB = tenant.env({ uid: aliceUid, companyIds: [companyB] });
    expect((await inB.model('cfg.order').defaultGet(['note'])).note).toBe('global');

    await new DefaultService(alice).set('cfg.order', 'note', 'mine');
    await new DefaultService(alice).set('cfg.order', 'priority', 7);
    expect(await alice.model('cfg.order').defaultGet(['note', 'priority'])).toEqual({ note: 'mine', priority: 7 });
    expect((await admin.model('cfg.order').defaultGet(['note'])).note).toBe('company A');
    expect((await alice.withContext({ default_note: 'ctx' }).model('cfg.order').defaultGet(['note'])).note).toBe('ctx');

    const created = await alice.model('cfg.order').create({ name: 'x' });
    expect((await created.read(['note', 'priority']))[0]).toMatchObject({ note: 'mine', priority: 7 });
    expect(await new DefaultService(alice).get('cfg.order')).toEqual({ note: 'mine', priority: 7 });

    await new DefaultService(alice).remove('cfg.order', 'note');
    expect((await alice.model('cfg.order').defaultGet(['note'])).note).toBe('company A');
  });

  it('lets users manage only their own defaults', async () => {
    const aliceDefaults = new DefaultService(alice);
    await expect(aliceDefaults.set('cfg.order', 'state', 'done', { scope: 'global' })).rejects.toThrow(AccessError);
    await expect(alice.model('ir.default').create({ model_name: 'cfg.order', field_name: 'state', value_json: '"done"' })).rejects.toThrow(AccessError);
    const [globalId] = (await admin.model('ir.default').search([['user_id', '=', false]])).ids;
    await expect(alice.model('ir.default').browse(globalId!).write({ value_json: '"hacked"' })).rejects.toThrow(AccessError);
    await expect(aliceDefaults.set('cfg.order', 'nope', 1)).rejects.toThrow(/Unknown field/);
    await expect(aliceDefaults.set('cfg.order', 'id', 1)).rejects.toThrow(/Unknown field/);
    await expect(alice.model('ir.default').create({
      model_name: 'cfg.order', field_name: 'state', value_json: '{bad', user_id: aliceUid,
    })).rejects.toThrow(/JSON/);
  });
});

describe('ir.default restrictions', () => {
  it('rejects user defaults on fields the owner cannot write and never applies them on create', async () => {
    await expect(new DefaultService(alice).set('cfg.order', 'locked_note', 'mine')).rejects.toThrow(AccessError);
    await expect(alice.model('ir.default').create({ model_name: 'cfg.order', field_name: 'locked_note', value_json: '"x"', user_id: aliceUid }))
      .rejects.toThrow(/restricted/);
    // even inserted behind the rules' back, a user-scoped default is not applied to a restricted field
    await root.db.query({
      text: `INSERT INTO ir_default(model_name, field_name, value_json, user_id, create_date, write_date) VALUES ('cfg.order','locked_note','"sneaky"',$1, now(), now())`,
      params: [aliceUid],
    });
    const created = await alice.model('cfg.order').create({ name: 'locked' });
    expect((await root.model('cfg.order').browse(created.ids[0]!).read(['locked_note']))[0]!.locked_note).toBeNull();
    await root.db.query({ text: `DELETE FROM ir_default WHERE field_name='locked_note'`, params: [] });

    await new DefaultService(admin).set('cfg.order', 'locked_note', 'admin only', { scope: 'global' });
    const byAlice = await alice.model('cfg.order').create({ name: 'a' });
    const byAdmin = await admin.model('cfg.order').create({ name: 'b' });
    const notes = await root.model('cfg.order').browse([byAlice.ids[0]!, byAdmin.ids[0]!]).read(['locked_note']);
    expect(notes.map((n) => n.locked_note)).toEqual([null, 'admin only']);
  });

  it('validates the stored value against the field type', async () => {
    const defaults = new DefaultService(alice);
    await expect(defaults.set('cfg.order', 'state', 'bogus')).rejects.toThrow(/type/);
    await expect(defaults.set('cfg.order', 'priority', '7')).rejects.toThrow(/type/);
    await expect(defaults.set('cfg.order', 'priority', 1.5)).rejects.toThrow(/type/);
    await expect(defaults.set('cfg.order', 'deadline', 'not a date')).rejects.toThrow(/type/);
    await expect(defaults.set('cfg.order', 'reviewer_id', 999_999)).rejects.toThrow(/missing/);
    await defaults.set('cfg.order', 'reviewer_id', aliceUid);
    await defaults.set('cfg.order', 'state', 'done');
    expect(await defaults.get('cfg.order')).toMatchObject({ reviewer_id: aliceUid, state: 'done' });
    await defaults.remove('cfg.order', 'state');
    await defaults.remove('cfg.order', 'reviewer_id');
  });
});

describe('cron jobs and automation rules as records', () => {
  it('validates and schedules ir.cron records, keeps edits in sync and removes jobs on unlink', async () => {
    await new ServerActionService(root).define({ key: 'cfg.noop', model: 'cfg.order', type: 'update_record', values: { priority: 'priority' } });
    await expect(alice.model('ir.cron').searchRead([], ['key'])).rejects.toThrow(AccessError);
    await expect(admin.model('ir.cron').create({ key: 'cfg.job', interval_number: 1, interval_type: 'hours', action: 'missing', user_id: aliceUid }))
      .rejects.toThrow(/Unknown server action/);
    await expect(admin.model('ir.cron').create({ key: 'cfg.job', interval_number: 1, interval_type: 'hours', action: 'cfg.noop' }))
      .rejects.toThrow(/user/);
    const job = await admin.model('ir.cron').create({
      key: 'cfg.job', interval_number: 2, interval_type: 'hours', action: 'cfg.noop', user_id: aliceUid, nextcall: '2026-01-01T00:00:00Z',
    });
    const runtime = async () => (await root.db.query<{ interval_ms: string; enabled: boolean; next_run: Date }>({
      text: `SELECT interval_ms, enabled, next_run FROM nx_scheduled_job WHERE key='cfg.job'`, params: [] }))[0];
    expect(await runtime()).toMatchObject({ interval_ms: expect.anything(), enabled: true });
    expect(Number((await runtime())!.interval_ms)).toBe(7_200_000);
    expect(new Date((await runtime())!.next_run).toISOString()).toBe('2026-01-01T00:00:00.000Z');

    await admin.model('ir.cron').browse(job.ids[0]!).write({ active: false, interval_type: 'minutes' });
    expect(await runtime()).toMatchObject({ enabled: false });
    expect(Number((await runtime())!.interval_ms)).toBe(120_000);
    expect(new Date((await runtime())!.next_run).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    await expect(admin.model('ir.cron').browse(job.ids[0]!).write({ key: 'cfg.other' })).rejects.toThrow(/cannot be changed/);

    await admin.model('ir.cron').browse(job.ids[0]!).unlink();
    expect(await runtime()).toBeUndefined();
  });

  it('validates ir.automation records through the automation service', async () => {
    await expect(alice.model('ir.automation').create({ key: 'cfg.auto', model_name: 'cfg.order', trigger: 'on_create', action: 'cfg.noop' }))
      .rejects.toThrow(AccessError);
    await expect(admin.model('ir.automation').create({ key: 'cfg.auto', model_name: 'nope.model', trigger: 'on_create', action: 'cfg.noop' }))
      .rejects.toThrow(/Unknown model/);
    await expect(admin.model('ir.automation').create({
      key: 'cfg.auto', model_name: 'cfg.order', trigger: 'on_create', action: 'cfg.noop', filter_domain: 'not json',
    })).rejects.toThrow(/JSON domain/);
    const rule = await admin.model('ir.automation').create({
      key: 'cfg.auto', model_name: 'cfg.order', trigger: 'on_change_fields', trigger_field_names: 'state, note', action: 'cfg.noop',
      filter_domain: JSON.stringify([['state', '=', 'done']]),
    });
    const [row] = await root.db.query<{ trigger_fields: string[]; filter: unknown; enabled: boolean }>({
      text: `SELECT trigger_fields, filter, enabled FROM nx_automation WHERE key='cfg.auto'`, params: [] });
    expect(row).toMatchObject({ trigger_fields: ['state', 'note'], filter: [['state', '=', 'done']], enabled: true });
    await admin.model('ir.automation').browse(rule.ids[0]!).write({ active: false });
    expect((await root.db.query<{ enabled: boolean }>({ text: `SELECT enabled FROM nx_automation WHERE key='cfg.auto'`, params: [] }))[0]!.enabled).toBe(false);
    await admin.model('ir.automation').browse(rule.ids[0]!).unlink();
    expect(await root.db.query({ text: `SELECT 1 FROM nx_automation WHERE key='cfg.auto'`, params: [] })).toEqual([]);
  });

  it('imports jobs defined through the service API as records', async () => {
    await new SchedulerService(admin).schedule({ key: 'cfg.api', intervalMs: 90_000, nextRun: new Date('2026-05-01T00:00:00Z') });
    await expect(importServiceConfigRecords(alice)).rejects.toThrow(AccessError);
    expect(await importServiceConfigRecords(admin)).toBeGreaterThanOrEqual(1);
    const [rec] = await admin.model('ir.cron').searchRead([['key', '=', 'cfg.api']], ['interval_number', 'interval_type', 'active']);
    expect(rec).toMatchObject({ interval_number: 90, interval_type: 'seconds', active: true });
    expect(await importServiceConfigRecords(admin)).toBe(0);
  });
});

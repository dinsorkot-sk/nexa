import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, PgliteTenantManager, ValidationError,
  ensureSecurityTables, securityModels, writeModuleSecurity,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';
import { configAccess, configModels, configRules } from '../src/base/config-models.js';
import { DateLockError } from '../src/policy/index.js';
import { TransitionService } from '../src/policy/transition.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  ...configModels,
  { name: 'dl.settings', origin: 'module', fields: {
    name: { type: 'char' },
    hard_lock_date: { type: 'date', ratchet: 'up' },
    soft_lock_date: { type: 'date' },
    seq_floor: { type: 'integer', ratchet: 'up' },
  } },
  { name: 'dl.move', origin: 'module', fields: {
    name: { type: 'char' },
    state: { type: 'selection', selection: [['draft', 'Draft'], ['posted', 'Posted']], default: 'draft' },
    date: { type: 'date' },
    posted_at: { type: 'datetime' },
    settings_id: { type: 'many2one', comodel: 'dl.settings' },
    amount: { type: 'float' },
  } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env; let admin: Env; let alice: Env; let adviser: Env;
let settingsId: number;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('dltest');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  await writeModuleSecurity(tenant.driver, 'base', [
    ...configAccess,
    { model: 'dl.settings', group: 'base.group_system', perms: all },
    { model: 'dl.move', group: 'base.group_user', perms: all },
    { model: 'dl.move', group: 'dl.group_adviser', perms: all },
  ], configRules);
  const [company] = (await root.model('res.company').create({ name: 'A' })).ids as [number];
  const [gSys] = (await root.model('res.groups').create({ name: 'System', code: 'base.group_system' })).ids as [number];
  const [gUser] = (await root.model('res.groups').create({ name: 'User', code: 'base.group_user' })).ids as [number];
  const [gAdv] = (await root.model('res.groups').create({ name: 'Adviser', code: 'dl.group_adviser' })).ids as [number];
  const mk = async (login: string, groupIds: number[]) => {
    const [uid] = (await root.model('res.users').create({
      name: login, login, company_id: company, company_ids: [{ op: 'set', ids: [company] }],
      group_ids: [{ op: 'set', ids: groupIds }],
    })).ids as [number];
    return tenant.env({ uid });
  };
  admin = await mk('dl_admin', [gSys, gUser]);
  alice = await mk('dl_alice', [gUser]);
  adviser = await mk('dl_adviser', [gUser, gAdv]);
  [settingsId] = (await admin.model('dl.settings').create({
    name: 'Main', hard_lock_date: '2026-01-31', soft_lock_date: '2026-02-28', seq_floor: 10,
  })).ids as [number];
});

afterAll(async () => { await mgr.closeAll(); });

describe('ir.date.lock validation', () => {
  it('requires base.group_system and rejects bad models, fields, expressions, x2many chains and groups', async () => {
    await expect(alice.model('ir.date.lock').create({
      model: 'dl.move', date: 'date', hard: "'2026-01-31'",
    })).rejects.toThrow(AccessError);
    await expect(admin.model('ir.date.lock').create({
      model: 'dl.nope', date: 'date', hard: "'2026-01-31'",
    })).rejects.toThrow(ValidationError);
    await expect(admin.model('ir.date.lock').create({
      model: 'dl.move', date: 'amount', hard: "'2026-01-31'",
    })).rejects.toThrow(/date or datetime/);
    await expect(admin.model('ir.date.lock').create({
      model: 'dl.move', date: 'date',
    })).rejects.toThrow(/hard or a soft/);
    await expect(admin.model('ir.date.lock').create({
      model: 'dl.move', date: 'date', hard: "'2026-01-31'", bypass_groups: ['dl.no_such_group'],
    })).rejects.toThrow(/does not exist/);
  });
});

describe('ir.date.lock enforcement', () => {
  it('enforces hard locks for everyone (superuser and transitions included) and soft locks except bypass_groups/su', async () => {
    const [lockId] = (await admin.model('ir.date.lock').create({
      model: 'dl.move', date: 'date',
      when: "state == 'posted'",
      hard: 'settings_id.hard_lock_date',
      soft: 'settings_id.soft_lock_date',
      bypass_groups: ['dl.group_adviser'],
    })).ids as [number];
    await admin.model('ir.lifecycle').create({
      model: 'dl.move', state_field: 'state', initial_state: 'draft',
      locks: [{ states: ['posted'], writable: ['date', 'name'], unlink: false }],
    });
    await admin.model('ir.transition').create({
      key: 'dl.post', model: 'dl.move', from: ['draft'], to: 'posted',
    });

    try {
      // Drafts are not matched by `when`: alice can create/edit in January
      const [m1] = (await alice.model('dl.move').create({ name: 'M1', date: '2026-01-15', settings_id: settingsId })).ids as [number];
      // Posting M1 transitions it into state='posted' with date <= hard_lock_date -> refused even for superuser / TransitionService!
      await expect(new TransitionService(root).run('dl.move', [m1], 'dl.post')).rejects.toThrow(DateLockError);

      // Soft lock (February): alice cannot post, adviser (bypass_groups) and root (su) can
      const [m2] = (await alice.model('dl.move').create({ name: 'M2', date: '2026-02-10', settings_id: settingsId })).ids as [number];
      await expect(new TransitionService(alice).run('dl.move', [m2], 'dl.post')).rejects.toThrow(DateLockError);
      await new TransitionService(adviser).run('dl.move', [m2], 'dl.post');

      // Posted in February: alice cannot edit or move it into January; adviser can edit in February, but NOT move into January (hard lock)
      await expect(alice.model('dl.move').browse(m2).write({ name: 'M2b' })).rejects.toThrow(DateLockError);
      await adviser.model('dl.move').browse(m2).write({ name: 'M2b' });
      await expect(adviser.model('dl.move').browse(m2).write({ date: '2026-01-20' })).rejects.toThrow(DateLockError);
      await expect(root.model('dl.move').browse(m2).write({ date: '2026-01-20' })).rejects.toThrow(DateLockError);

      // March: unrestricted for everyone
      const [m3] = (await alice.model('dl.move').create({ name: 'M3', date: '2026-03-05', settings_id: settingsId })).ids as [number];
      await new TransitionService(alice).run('dl.move', [m3], 'dl.post');
      // Moving a March posted move back into February (soft) or January (hard) is refused for alice
      await expect(alice.model('dl.move').browse(m3).write({ date: '2026-02-15' })).rejects.toThrow(DateLockError);
      await expect(root.model('dl.move').browse(m3).write({ date: '2026-01-15' })).rejects.toThrow(DateLockError);
    } finally {
      await admin.model('ir.date.lock').browse(lockId).unlink();
    }
  });

  it('supports ops filtering and datetime UTC date comparison', async () => {
    const [lockId] = (await admin.model('ir.date.lock').create({
      model: 'dl.move', date: 'posted_at', hard: "'2026-01-31'", ops: ['write', 'unlink'],
    })).ids as [number];
    try {
      // create is not in ops -> allowed even in January
      const [m] = (await alice.model('dl.move').create({ name: 'DT', posted_at: '2026-01-31T23:59:59.000Z' })).ids as [number];
      // write & unlink are refused
      await expect(alice.model('dl.move').browse(m).write({ name: 'DT2' })).rejects.toThrow(DateLockError);
      await expect(root.model('dl.move').browse(m).unlink()).rejects.toThrow(DateLockError);
    } finally {
      await admin.model('ir.date.lock').browse(lockId).unlink();
    }
  });
});

describe('ratchet: up', () => {
  it('allows increasing date and numeric values, refuses lowering or clearing them', async () => {
    await admin.model('dl.settings').browse(settingsId).write({ hard_lock_date: '2026-02-01', seq_floor: 11 });
    await expect(admin.model('dl.settings').browse(settingsId).write({ hard_lock_date: '2026-01-15' })).rejects.toThrow(DateLockError);
    await expect(root.model('dl.settings').browse(settingsId).write({ hard_lock_date: null })).rejects.toThrow(DateLockError);
    await expect(admin.model('dl.settings').browse(settingsId).write({ seq_floor: 10 })).rejects.toThrow(DateLockError);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, PgliteTenantManager, ValidationError, ensureSecurityTables, removeModuleSecurity, securityModels, writeModuleSecurity,
  type Env, type ModelDef, type TenantHandle,
} from '../src/index.js';

const all = { read: true, write: true, create: true, unlink: true };
const models: ModelDef[] = [
  ...securityModels,
  { name: 'rule.note', origin: 'module', fields: {
    name: { type: 'char' }, owner_id: { type: 'many2one', comodel: 'res.users' },
    company_id: { type: 'many2one', comodel: 'res.company' },
  } },
];

let mgr: PgliteTenantManager;
let tenant: TenantHandle;
let root: Env;
let uid: number;
let otherUid: number;
let c1: number;
let c2: number;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  tenant = await mgr.open('rule-expressions');
  await ensureSecurityTables(tenant.driver);
  root = tenant.env({ uid: 1 });
  [c1] = (await root.model('res.company').create({ name: 'One' })).ids;
  [c2] = (await root.model('res.company').create({ name: 'Two' })).ids;
  const [group] = (await root.model('res.groups').create({ name: 'Users', code: 'test.user' })).ids;
  [uid] = (await root.model('res.users').create({ name: 'Alice', login: 'alice', company_id: c1, company_ids: [c1, c2], group_ids: [group] })).ids;
  [otherUid] = (await root.model('res.users').create({ name: 'Other', login: 'other', company_id: c1 })).ids;
  await writeModuleSecurity(tenant.driver, 'rule_expr', [
    { model: 'rule.note', group: 'test.user', perms: all },
  ], [
    { name: 'owner_and_company', model: 'rule.note', groups: [], perms: all,
      domain: "[['owner_id', '=', user.id], ['company_id', 'in', companyIds]]" },
  ]);
  await root.model('rule.note').create([
    { name: 'mine-one', owner_id: uid, company_id: c1 },
    { name: 'mine-two', owner_id: uid, company_id: c2 },
    { name: 'other-owner', owner_id: otherUid, company_id: c1 },
  ]);
}, 60_000);

afterAll(() => mgr.closeAll());

describe('expression record rules', () => {
  it('persists in the existing JSONB domain column and evaluates narrow identity/company values', async () => {
    const result = await tenant.env({ uid, companyIds: [c1, c2] }).model('rule.note').searchRead([], ['name'], { order: 'id asc' });
    expect(result.map((row) => row.name)).toEqual(['mine-one', 'mine-two']);
  });

  it('treats an empty expression domain as TRUE, like a legacy JSON domain', async () => {
    await writeModuleSecurity(tenant.driver, 'rule_expr', [
      { model: 'rule.note', group: 'test.user', perms: all },
    ], [
      { name: 'unrestricted', model: 'rule.note', groups: [], perms: all, domain: '[]' },
    ]);
    try {
      const result = await tenant.env({ uid }).model('rule.note').searchRead([], ['name'], { order: 'id asc' });
      expect(result.map((row) => row.name)).toEqual(['mine-one', 'mine-two', 'other-owner']);
    } finally {
      await writeModuleSecurity(tenant.driver, 'rule_expr', [
        { model: 'rule.note', group: 'test.user', perms: all },
      ], [
        { name: 'owner_and_company', model: 'rule.note', groups: [], perms: all,
          domain: "[['owner_id', '=', user.id], ['company_id', 'in', companyIds]]" },
      ]);
    }
  });

  it('rejects helpers and arbitrary caller context at installation', async () => {
    await expect(writeModuleSecurity(tenant.driver, 'bad_rules', [], [
      { name: 'recursive', model: 'rule.note', groups: [], perms: all, domain: "search('rule.note', [])" },
    ])).rejects.toThrow(ValidationError);
    await expect(writeModuleSecurity(tenant.driver, 'bad_rules', [], [
      { name: 'context_leak', model: 'rule.note', groups: [], perms: all, domain: "[['name', '=', context.secret]]" },
    ])).rejects.toThrow(ValidationError);
  });

  it('fails closed when a valid expression returns an invalid domain', async () => {
    await writeModuleSecurity(tenant.driver, 'bad_runtime', [], [
      { name: 'bad_domain', model: 'rule.note', groups: [], perms: all, domain: "[['owner_id']]" },
    ]);
    try { await expect(tenant.env({ uid }).model('rule.note').search([])).rejects.toThrow(AccessError); }
    finally { await removeModuleSecurity(tenant.driver, 'bad_runtime'); }
  });

  it('fails closed when an any operator contains a malformed nested domain', async () => {
    await writeModuleSecurity(tenant.driver, 'bad_nested', [], [
      { name: 'bad_nested_domain', model: 'rule.note', groups: [], perms: all, domain: "[['id', 'any', [['name']]]]" },
    ]);
    try { await expect(tenant.env({ uid }).model('rule.note').search([])).rejects.toThrow(AccessError); }
    finally { await removeModuleSecurity(tenant.driver, 'bad_nested'); }
  });

  it('does not evaluate unrelated group rules, and fails closed for their members', async () => {
    const [specialGroup] = (await root.model('res.groups').create({ name: 'Special', code: 'test.special' })).ids;
    const [specialUid] = (await root.model('res.users').create({
      name: 'Special user', login: 'special', company_id: c1, group_ids: [specialGroup],
    })).ids;
    await writeModuleSecurity(tenant.driver, 'scoped_bad_rule', [
      { model: 'rule.note', group: null, perms: all },
    ], [
      { name: 'scoped_bad_domain', model: 'rule.note', groups: ['test.special'], perms: all, domain: "[['id', 'any', [['name']]]]" },
    ]);
    try {
      const unrelated = await tenant.env({ uid: otherUid }).model('rule.note').searchRead([], ['name']);
      expect(unrelated.map((row) => row.name)).toEqual(['other-owner']);
      await expect(tenant.env({ uid: specialUid }).model('rule.note').search([])).rejects.toThrow(AccessError);
    } finally { await removeModuleSecurity(tenant.driver, 'scoped_bad_rule'); }
  });
});

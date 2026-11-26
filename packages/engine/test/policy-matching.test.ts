import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessError, ButtonService, MatchService, PgliteTenantManager, ServerActionService, ensureSecurityTables, securityModels, writeModuleSecurity, type Env, type TenantHandle } from '../src/index.js';
import { configAccess, configModels, configRules } from '../src/base/config-models.js';
import { line, matchingAccess, matchingModels, matchingRule, setupMatching } from './matching-fixture.js';

let manager: PgliteTenantManager; let h: TenantHandle; let root: Env; let user: Env; let reader: Env;
const rows = (ids: number[]) => h.env({ uid: 1 }).model('mt.line').browse(ids).read();
beforeAll(async () => {
  manager = new PgliteTenantManager({ models: async () => [...securityModels, ...configModels, ...matchingModels] });
  h = await manager.open('matching'); await ensureSecurityTables(h.driver); root = h.env({ uid: 1 });
  const company = (await root.model('res.company').create({ name: 'C' })).ids[0]!;
  const group = (await root.model('res.groups').create({ name: 'User', code: 'base.group_user' })).ids[0]!;
  const ro = (await root.model('res.groups').create({ name: 'Reader', code: 'mt.reader' })).ids[0]!;
  const uid = (await root.model('res.users').create({ name: 'User', login: 'matching', company_id: company, company_ids: [company], group_ids: [group] })).ids[0]!;
  const rid = (await root.model('res.users').create({ name: 'Reader', login: 'matching-ro', company_id: company, company_ids: [company], group_ids: [ro] })).ids[0]!;
  await writeModuleSecurity(h.driver, 'base', [...configAccess, ...matchingAccess, ...matchingModels.map((m) => ({ model: m.name, group: 'mt.reader', perms: { read: true, write: false, create: false, unlink: false } }))], configRules);
  user = h.env({ uid }); reader = h.env({ uid: rid }); await setupMatching(root);
}, 60_000);
afterAll(() => manager?.closeAll());

describe('generic matching', () => {
  it('partially matches, completes a connected component and unmatches atomically', async () => {
    const a = await line(user, 10); const b = await line(user, -4); const c = await line(user, -6);
    const svc = new MatchService(user);
    const partial = await svc.match('mt.line', [a, b], 'settle');
    expect(partial.links).toHaveLength(1); expect(partial.full).toEqual([]);
    expect(await rows([a, b])).toMatchObject([{ residual: 6, secondary_residual: 12 }, { residual: 0, secondary_residual: 0 }]);
    expect(await svc.match('mt.line', [a, b], 'settle')).toEqual({ links: [], full: [] });
    const full = await svc.match('mt.line', [a, c], 'settle'); expect(full.full).toHaveLength(1);
    expect(await rows([a, b, c])).toMatchObject([0, 0, 0].map(() => ({ residual: 0, full_id: full.full[0] })));
    const undone = await svc.unmatch('mt.line', [b], 'settle'); expect(undone.links).toHaveLength(2);
    expect(await rows([a, b, c])).toMatchObject([{ residual: 10, secondary_residual: 20, full_id: null }, { residual: -4, secondary_residual: -8 }, { residual: -6, secondary_residual: -12 }]);
    expect(await svc.unmatch('mt.line', [b], 'settle')).toEqual({ links: [], full: [] });
  });
  it('keeps group keys separate, consumes decimal amounts exactly and never crosses zero', async () => {
    const a = await line(user, 0.3); const b = await line(user, -0.1); const c = await line(user, -0.2); const other = await line(user, -1, { bucket: 'B' });
    const r = await new MatchService(user).match('mt.line', [a, other, b, c], 'settle'); expect(r.links).toHaveLength(2);
    expect((await rows([a, b, c])).map((x) => x.residual)).toEqual([0, 0, 0]); expect((await rows([other]))[0]!.residual).toBeNull();
  });
  it('rejects eligibility failures and caller write ACL without mutation', async () => {
    const a = await line(user, 10); const b = await line(user, -10, { eligible: false });
    await expect(new MatchService(user).match('mt.line', [a, b], 'settle')).rejects.toThrow(/eligible/);
    await expect(new MatchService(reader).match('mt.line', [a], 'settle')).rejects.toBeInstanceOf(AccessError);
    expect((await rows([a]))[0]!.residual).toBeNull();
  });
  it('requires source write record rules for the whole connected component', async () => {
    const a = await line(user, 10); const b = await line(user, -4); const c = await line(user, -6);
    await new MatchService(user).match('mt.line', [a, b], 'settle');
    await h.driver.query({ text: `INSERT INTO nx_rule(module,name,model,groups,domain,perm_read,perm_write,perm_create,perm_unlink) VALUES('match_test','hide matched','mt.line','{}',$1::jsonb,false,true,false,false)`, params: [JSON.stringify([['id', '!=', b]])] });
    try { await expect(new MatchService(h.env({ uid: user.uid })).match('mt.line', [a, c], 'settle')).rejects.toBeInstanceOf(AccessError); }
    finally { await h.driver.query({ text: `DELETE FROM nx_rule WHERE module='match_test'`, params: [] }); }
  });
  it('protects rule metadata, residuals and link mutation even for root', async () => {
    await expect(user.model('ir.match.rule').create(matchingRule)).rejects.toBeInstanceOf(AccessError);
    const a = await line(user, 5); const b = await line(user, -5);
    await expect(root.model('mt.line').browse(a).write({ residual: 100 })).rejects.toThrow(/engine/);
    const r = await new MatchService(user).match('mt.line', [a, b], 'settle');
    await expect(root.model('mt.link').browse(r.links).write({ amount: 100 })).rejects.toThrow();
    await expect(root.model('mt.link').browse(r.links).unlink()).rejects.toThrow();
    await expect(root.model('mt.line').browse(a).unlink()).rejects.toThrow();
  });
  it('validates configuration and refuses unsupported rounding', async () => {
    await expect(root.model('ir.match.rule').create({ ...matchingRule, key: 'bad', residual_field: 'amount', link: { ...matchingRule.link, model: 'mt.otherlink' } })).rejects.toThrow(/distinct|engine/);
    const a = await line(user, 0.001); const b = await line(user, -1);
    await expect(new MatchService(user).match('mt.line', [a, b], 'settle')).rejects.toThrow(/rounding/);
  });
  it('refuses matching amounts or grouping fields that remain writable', async () => {
    const a = await line(user, 2); const b = await line(user, -2);
    const policy = await root.model('ir.lifecycle').search([['model', '=', 'mt.line']]);
    await policy.write({ locks: [{ states: ['locked'], writable: ['amount'], unlink: false }] });
    try { await expect(new MatchService(user).match('mt.line', [a, b], 'settle')).rejects.toThrow(/freeze/); }
    finally { await policy.write({ locks: [{ states: ['locked'], writable: [], unlink: false }] }); }
  });
  it('owns link models and residuals exclusively, including archived rules and secondary overlap', async () => {
    await expect(root.model('ir.match.rule').create({ ...matchingRule, key: 'duplicate_link' })).rejects.toThrow(/unique/);
    await expect(root.model('ir.match.rule').create({ ...matchingRule, key: 'duplicate_residual', link: { ...matchingRule.link, model: 'mt.otherlink' } })).rejects.toThrow(/residual fields.*owned/);
    await expect(root.model('ir.match.rule').create({ ...matchingRule, key: 'overlap_secondary', residual_field: 'secondary_residual', secondary_residual_field: 'spare_residual', link: { ...matchingRule.link, model: 'mt.otherlink' } })).rejects.toThrow(/residual fields.*owned/);
    await expect(root.model('ir.match.rule').create({ ...matchingRule, key: 'overlap_full', residual_field: 'spare_residual', secondary_amount_field: null, secondary_residual_field: null, link: { ...matchingRule.link, model: 'mt.otherlink' } })).rejects.toThrow(/full-match fields.*owned/);
    const rule = await root.model('ir.match.rule').search([['key', '=', 'settle']]);
    await rule.write({ active: false });
    try { await expect(root.model('ir.match.rule').create({ ...matchingRule, key: 'archived_owner' })).rejects.toThrow(/unique/); }
    finally { await rule.write({ active: true }); }
    await expect(rule.write({ rounding: 0.1 })).rejects.toThrow(/Unmatch/);
    await expect(rule.unlink()).rejects.toThrow(/Unmatch/);
  });
  it('runs match and unmatch through ORM actions and configured buttons', async () => {
    await root.model('ir.actions.server').create({ key: 'mt.match', model_name: 'mt.line', type: 'match', match_rule: 'settle' });
    await root.model('ir.actions.server').create({ key: 'mt.unmatch', model_name: 'mt.line', type: 'unmatch', match_rule: 'settle' });
    await root.model('ir.button').create({ model_name: 'mt.line', action: 'mt.match' });
    const a = await line(user, 7); const b = await line(user, -7);
    const buttons = new ButtonService(user);
    await buttons.execute('mt.line', [a, b], { action: 'mt.match' });
    expect((await rows([a]))[0]!.residual).toBe(0);
    await new ServerActionService(user).run('mt.unmatch', { model: 'mt.line', ids: [a] });
    expect((await rows([a]))[0]!.residual).toBe(7);
  });
  it('hard date locks also bind matching tokens and roll all changes back', async () => {
    await root.model('ir.date.lock').create({ model: 'mt.line', date: 'date', when: 'true', hard: "'2026-01-31'" });
    const a = await line(user, 9, { date: '2026-02-01' }); const b = await line(user, -9, { date: '2026-02-01' });
    const r = await new MatchService(user).match('mt.line', [a, b], 'settle');
    await h.driver.query({ text: `UPDATE mt_line SET date='2026-01-01' WHERE id=ANY($1)`, params: [[a, b]] });
    await expect(new MatchService(root).unmatch('mt.line', [a], 'settle')).rejects.toThrow(/lock/i);
    expect(await root.model('mt.link').browse(r.links).read()).toHaveLength(1);
    expect((await rows([a]))[0]!.residual).toBe(0);
  });
});

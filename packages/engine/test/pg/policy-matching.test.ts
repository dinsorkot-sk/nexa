import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MatchService, ModuleCatalog, baseModule, type Env, type ModuleManifest, type TenantHandle } from '../../src/index.js';
import type { PgTenantManager } from '../../src/tenant/pg.js';
import { line, matchingAccess, matchingModels, matchingRule, setupMatching } from '../matching-fixture.js';
import { gate, pgManager, pgUrl, settledWithin } from './helpers.js';

const module: ModuleManifest = { name: 'pg_match', version: '1.0.0', depends: ['base'], models: matchingModels, access: matchingAccess };
describe.skipIf(!pgUrl)('real PostgreSQL: concurrent matching', () => {
  let manager: PgTenantManager; let h: TenantHandle; let uid: number;
  const admin = (): Env => h.env({ uid });
  beforeAll(async () => {
    manager = pgManager({ catalog: new ModuleCatalog([baseModule, module]) }); h = await manager.create('match', ['pg_match']);
    uid = (await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name='user_admin'`, params: [] }))[0]!.res_id;
    await setupMatching(admin());
  }, 60_000);
  afterAll(async () => { await manager?.closeAll(); });

  it('serializes competing registrations of one residual across different link models', async () => {
    const def = { ...matchingRule, residual_field: 'spare_residual', secondary_amount_field: null, secondary_residual_field: null, full: null };
    const r = await Promise.allSettled([
      admin().model('ir.match.rule').create({ ...def, key: 'spare_a', link: { ...matchingRule.link, model: 'mt.otherlink' } }),
      admin().model('ir.match.rule').create({ ...def, key: 'spare_b', link: { ...matchingRule.link, model: 'mt.thirdlink' } }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const spare = await admin().model('ir.match.rule').search([['residual_field', '=', 'spare_residual']]);
    await spare.write({ rounding: 0.1 }); // no links: safe structural editing is allowed
    await spare.unlink();
  });

  it('serializes two matches on the same rows without double consumption', async () => {
    const a = await line(admin(), 10); const b = await line(admin(), -10);
    const entered = gate(); const hold = gate(); const e1 = admin();
    const first = e1.transaction(async () => { const result = await new MatchService(e1).match('mt.line', [a, b], 'settle'); entered.open(); await hold.wait; return result; });
    await entered.wait;
    const second = new MatchService(admin()).match('mt.line', [b, a], 'settle');
    try { expect(await settledWithin(second, 400)).toBe('pending'); } finally { hold.open(); }
    expect((await first).links).toHaveLength(1);
    expect(await second).toEqual({ links: [], full: [] });
    expect((await admin().model('mt.line').browse([a, b]).read()).map((r) => r.residual)).toEqual([0, 0]);
    expect((await admin().model('mt.link').search([['positive_id', '=', a]])).ids).toHaveLength(1);
  }, 40_000);
  it('serializes structural configuration edits with in-flight matching and preserves historic links', async () => {
    const a = await line(admin(), 3); const b = await line(admin(), -3);
    const entered = gate(); const hold = gate(); const e1 = admin();
    const first = e1.transaction(async () => { await new MatchService(e1).match('mt.line', [a, b], 'settle'); entered.open(); await hold.wait; });
    await entered.wait;
    const rule = await admin().model('ir.match.rule').search([['key', '=', 'settle']]);
    const editing = rule.write({ rounding: 0.1 });
    try { expect(await settledWithin(editing, 400)).toBe('pending'); } finally { hold.open(); }
    await first;
    await expect(editing).rejects.toThrow(/Unmatch/);
    expect((await admin().model('mt.line').browse([a, b]).read()).map((r) => r.residual)).toEqual([0, 0]);
  }, 40_000);
  it('competing negative rows cannot consume a positive residual twice', async () => {
    const a = await line(admin(), 10); const b = await line(admin(), -7); const c = await line(admin(), -8);
    const results = await Promise.allSettled([new MatchService(admin()).match('mt.line', [a, b], 'settle'), new MatchService(admin()).match('mt.line', [a, c], 'settle')]);
    // A newly discovered connected row causes a fail-closed retry rather than a lock-order violation.
    for (let i = 0; i < results.length; i++) if (results[i]!.status === 'rejected') await new MatchService(admin()).match('mt.line', [a, i === 0 ? b : c], 'settle');
    const records = await admin().model('mt.line').browse([a, b, c]).read();
    expect(records[0]!.residual).toBe(0); expect(Number(records[1]!.residual)).toBeLessThanOrEqual(0); expect(Number(records[2]!.residual)).toBeLessThanOrEqual(0);
    const links = await admin().model('mt.link').search([['positive_id', '=', a]]).then((r) => r.read());
    expect(links.reduce((sum, l) => sum + Number(l.amount), 0)).toBe(10);
  }, 40_000);
  it('locks configured parents before matching rows', async () => {
    const p = (await admin().model('mt.parent').create({ name: 'P' })).ids[0]!;
    const a = await line(admin(), 5, { parent_id: p }); const b = await line(admin(), -5, { parent_id: p });
    const entered = gate(); const hold = gate(); const e1 = admin();
    const holder = e1.transaction(async () => { await (e1 as unknown as { db: TenantHandle['driver'] }).db.query({ text: 'SELECT id FROM mt_parent WHERE id=$1 FOR UPDATE', params: [p] }); entered.open(); await hold.wait; });
    await entered.wait; const matching = new MatchService(admin()).match('mt.line', [a, b], 'settle');
    try { expect(await settledWithin(matching, 400)).toBe('pending'); } finally { hold.open(); }
    await holder; expect((await matching).links).toHaveLength(1);
  }, 40_000);
  it('serializes duplicate unmatches and restores residuals exactly once', async () => {
    const a = await line(admin(), 9); const b = await line(admin(), -9); await new MatchService(admin()).match('mt.line', [a, b], 'settle');
    const [r1, r2] = await Promise.all([new MatchService(admin()).unmatch('mt.line', [a], 'settle'), new MatchService(admin()).unmatch('mt.line', [b], 'settle')]);
    expect(r1.links.length + r2.links.length).toBe(1);
    expect((await admin().model('mt.line').browse([a, b]).read()).map((r) => r.residual)).toEqual([9, -9]);
  }, 40_000);
});

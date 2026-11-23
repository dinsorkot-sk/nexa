import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EngineError, MetadataStore, ModuleCatalog, type ModuleWarning, ModuleService, PgliteTenantManager, type ModuleManifest, type TenantHandle,
} from '../src/index.js';

const columns = async (h: TenantHandle, table: string) =>
  (await h.driver.query<{ column_name: string }>({
    text: `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, params: [table],
  })).map((r) => r.column_name);
const hasTable = async (h: TenantHandle, table: string) =>
  (await h.driver.query({ text: `SELECT 1 FROM information_schema.tables WHERE table_name = $1`, params: [table] })).length > 0;
const xmlIds = async (h: TenantHandle, module: string) =>
  (await h.driver.query<{ name: string }>({ text: `SELECT name FROM nx_model_data WHERE module = $1 ORDER BY name`, params: [module] }))
    .map((r) => r.name);

const base = (over: Partial<ModuleManifest> = {}): ModuleManifest => ({
  name: 'base', version: '1.0.0', depends: [],
  models: [
    { name: 'res.country', origin: 'module', fields: { code: { type: 'char', required: true } } },
    { name: 'res.partner', origin: 'module', fields: { name: { type: 'char', required: true } } },
    { name: 'res.partner.category', origin: 'module', fields: { name: { type: 'char' } } },
  ],
  data: [
    { xmlId: 'th', model: 'res.country', values: { code: 'TH' } },
    { xmlId: 'base.cat_vip', model: 'res.partner.category', values: { name: 'VIP' } },
    { xmlId: 'main_partner', model: 'res.partner', values: { name: 'Main' }, noUpdate: true },
  ],
  access: [{ model: 'res.partner', group: null, perms: { read: true, write: true, create: true, unlink: true } }],
  ...over,
});

const sale = (over: Partial<ModuleManifest> = {}): ModuleManifest => ({
  name: 'sale', version: '1.0.0', depends: ['base'],
  models: [
    {
      name: 'res.partner', extends: ['res.partner'], origin: 'module', fields: {
        customer_rank: { type: 'integer' },
        country_id: { type: 'many2one', comodel: 'res.country' },
        category_ids: { type: 'many2many', comodel: 'res.partner.category' },
      },
    },
    { name: 'sale.order', origin: 'module', fields: { partner_id: { type: 'many2one', comodel: 'res.partner', ondelete: 'cascade' } } },
    { name: 'sale.order.line', origin: 'module', fields: { order_id: { type: 'many2one', comodel: 'sale.order', ondelete: 'cascade' } } },
  ],
  data: [
    {
      xmlId: 'sale.partner_acme', model: 'res.partner',
      values: { name: 'Acme', country_id: { ref: 'base.th' }, category_ids: [{ ref: 'base.cat_vip' }] },
    },
    { xmlId: 'order1', model: 'sale.order', values: { partner_id: { ref: 'partner_acme' } } },
  ],
  access: [{ model: 'sale.order', group: null, perms: { read: true, write: true, create: true, unlink: false } }],
  ...over,
});

const managers: PgliteTenantManager[] = [];
afterEach(async () => { for (const m of managers.splice(0)) await m.closeAll(); });
const manager = (mods: ModuleManifest[]) => {
  const m = new PgliteTenantManager({ catalog: new ModuleCatalog(mods) });
  managers.push(m);
  return m;
};

describe('module catalog', () => {
  it('orders modules topologically and deterministically', () => {
    const c = new ModuleCatalog([
      { name: 'z', version: '1.0.0', depends: ['a'] },
      { name: 'b', version: '1.0.0', depends: [] },
      { name: 'a', version: '1.0.0', depends: [] },
      { name: 'c', version: '1.0.0', depends: ['z', 'b'] },
    ]);
    expect(c.order).toEqual(['a', 'b', 'z', 'c']);
    expect(c.withDependencies(['c'])).toEqual(['a', 'b', 'z', 'c']);
    expect(c.withDependents(['a'])).toEqual(['a', 'z', 'c']);
  });

  it('rejects cycles, unknown deps, bad names and versions', () => {
    expect(() => new ModuleCatalog([
      { name: 'a', version: '1.0.0', depends: ['b'] }, { name: 'b', version: '1.0.0', depends: ['a'] },
    ])).toThrow(/cycle/);
    expect(() => new ModuleCatalog([{ name: 'a', version: '1.0.0', depends: ['a'] }])).toThrow(/cycle/);
    expect(() => new ModuleCatalog([{ name: 'a', version: '1.0.0', depends: ['nope'] }])).toThrow(/unknown module/);
    expect(() => new ModuleCatalog([{ name: 'Bad-name', version: '1.0.0', depends: [] }])).toThrow(EngineError);
    expect(() => new ModuleCatalog([{ name: 'a', version: '1.0', depends: [] }])).toThrow(/version/);
    expect(() => new ModuleCatalog([{ name: 'a', version: '1.0.0', depends: [] }, { name: 'a', version: '1.0.0', depends: [] }]))
      .toThrow(/twice/);
  });

  it('tags model defs with their module', () => {
    const c = new ModuleCatalog([base()]);
    expect(c.get('base').models!.every((m) => m.module === 'base')).toBe(true);
  });
});

describe('module service', () => {
  it('installs sale with its dependency, extends models and loads data with refs', async () => {
    const mgr = manager([base(), sale()]);
    const h = await mgr.create('m1', ['sale']);
    const svc = ModuleService.for(h);
    expect((await svc.list()).map((m) => [m.name, m.state])).toEqual([['base', 'installed'], ['sale', 'installed']]);
    expect(h.registry.get('res.partner').fields.has('customer_rank')).toBe(true);
    expect(await columns(h, 'res_partner')).toContain('country_id');

    const env = h.env({ uid: 1 });
    const acme = await env.model('res.partner').search([['name', '=', 'Acme']]);
    const [row] = await acme.read(['country_id', 'category_ids']);
    const th = await env.model('res.country').search([['code', '=', 'TH']]);
    const vip = await env.model('res.partner.category').search([['name', '=', 'VIP']]);
    expect(row.country_id).toBe(th.ids[0]);
    expect(row.category_ids).toEqual(vip.ids);
    expect(await env.model('sale.order').searchCount([['partner_id', '=', acme.ids[0]]])).toBe(1);

    const access = await h.driver.query<{ module: string; model: string }>({
      text: `SELECT module, model FROM nx_access ORDER BY module`, params: [],
    });
    expect(access).toEqual([{ module: 'base', model: 'res.partner' }, { module: 'sale', model: 'sale.order' }]);

    // re-install is a no-op; data stays unique
    expect(await svc.install(['sale'])).toEqual([]);
    expect(await env.model('res.partner').searchCount([['name', '=', 'Acme']])).toBe(1);
  });

  it('upgrade runs migrate hooks in order, re-loads data, respects noUpdate, drops stale data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexa-mod-'));
    try {
      const v1 = new PgliteTenantManager({ rootDir: dir, catalog: new ModuleCatalog([base()]) });
      const h1 = await v1.create('up', ['base']);
      const e1 = h1.env({ uid: 1 });
      await (await e1.model('res.partner').search([['name', '=', 'Main']])).write({ name: 'Edited' });
      await (await e1.model('res.country').search([['code', '=', 'TH']])).write({ code: 'XX' });
      await v1.closeAll();

      const calls: string[] = [];
      const upgraded = base({
        version: '1.2.0',
        data: [
          { xmlId: 'th', model: 'res.country', values: { code: 'TH' } },
          { xmlId: 'main_partner', model: 'res.partner', values: { name: 'Main v2' }, noUpdate: true },
        ],
        hooks: {
          migrate: {
            '1.2.0': async (e) => { calls.push(`1.2.0:${e.su}`); },
            '1.0.0': async () => { calls.push('1.0.0'); },
            '1.1.0': async () => { calls.push('1.1.0'); },
            '2.0.0': async () => { calls.push('2.0.0'); },
          },
        },
      });
      const v2 = new PgliteTenantManager({ rootDir: dir, catalog: new ModuleCatalog([upgraded]) });
      const h = await v2.open('up');
      const svc = ModuleService.for(h);
      // the pending upgrade was applied at open, before the handle was returned
      expect(calls).toEqual(['1.1.0', '1.2.0:true']);
      const env = h.env({ uid: 1 });
      expect(await env.model('res.country').searchCount([['code', '=', 'TH']])).toBe(1); // overwritten
      expect(await env.model('res.partner').searchCount([['name', '=', 'Edited']])).toBe(1); // noupdate kept
      expect(await env.model('res.partner.category').searchCount([])).toBe(0); // stale record removed
      expect(await xmlIds(h, 'base')).toEqual(['main_partner', 'th']);
      expect((await svc.list())[0]).toMatchObject({ installedVersion: '1.2.0', state: 'installed' });

      // upgrading again at the same version: no hooks, idempotent data
      expect(await svc.upgrade(['base'])).toEqual({ modules: ['base'], installed: [], orphanColumns: [] });
      expect(calls).toHaveLength(2);
      expect(await env.model('res.country').searchCount([])).toBe(1);
      expect(await env.model('res.partner').searchCount([])).toBe(1);
      await v2.closeAll();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('uninstall cascades to dependents, needs allowDestructive, drops tables/columns, data and security', async () => {
    const mgr = manager([base(), sale()]);
    const h = await mgr.create('m4', ['sale']);
    const svc = ModuleService.for(h);
    await expect(svc.uninstall(['base'], { allowDestructive: false })).rejects.toThrow(/allowDestructive/);
    expect(h.registry.models.has('sale.order')).toBe(true);

    // uninstalling sale only: base data and tables survive
    expect(await svc.uninstall(['sale'], { allowDestructive: true })).toEqual(['sale']);
    expect(h.registry.models.has('sale.order')).toBe(false);
    expect(await hasTable(h, 'sale_order')).toBe(false);
    expect(await hasTable(h, 'sale_order_line')).toBe(false);
    expect(await hasTable(h, 'res_partner_res_partner_category_rel')).toBe(false);
    const cols = await columns(h, 'res_partner');
    expect(cols).not.toContain('customer_rank');
    expect(cols).not.toContain('country_id');
    expect(cols).toContain('name');
    const env = h.env({ uid: 1 });
    expect(await env.model('res.partner').searchCount([['name', '=', 'Acme']])).toBe(0);
    expect(await env.model('res.partner').searchCount([['name', '=', 'Main']])).toBe(1);
    expect(await xmlIds(h, 'sale')).toEqual([]);
    expect(await h.driver.query({ text: `SELECT 1 FROM nx_access WHERE module = 'sale'`, params: [] })).toHaveLength(0);

    // reinstall then uninstall base: cascades to sale (dependents first)
    await svc.install(['sale']);
    expect(await svc.uninstall(['base'], { allowDestructive: true })).toEqual(['sale', 'base']);
    expect(h.registry.models.size).toBe(0);
    expect(await hasTable(h, 'res_partner')).toBe(false);
    expect(await h.driver.query({ text: `SELECT 1 FROM nx_access`, params: [] })).toHaveLength(0);
    expect(await h.driver.query({ text: `SELECT 1 FROM nx_model_data`, params: [] })).toHaveLength(0);
    expect((await svc.list()).every((m) => m.state === 'uninstalled')).toBe(true);
  });

  it('rolls back everything and keeps the registry when postInit fails', async () => {
    const boom = sale({ hooks: { postInit: async (env) => {
      await env.model('sale.order').create({});
      throw new Error('boom');
    } } });
    const mgr = manager([base(), boom]);
    const h = await mgr.create('m5', ['base']);
    const before = h.registry.models;
    await expect(ModuleService.for(h).install(['sale'])).rejects.toThrow('boom');
    expect(h.registry.models).toBe(before);
    expect(await hasTable(h, 'sale_order')).toBe(false);
    expect(await columns(h, 'res_partner')).not.toContain('customer_rank');
    expect(await xmlIds(h, 'sale')).toEqual([]);
    expect(await h.driver.query({ text: `SELECT 1 FROM nx_access WHERE module = 'sale'`, params: [] })).toHaveLength(0);
    expect((await ModuleService.for(h).list()).find((m) => m.name === 'sale')!.state).toBe('uninstalled');
  });

  it('rejects refs to unknown records and data of other modules', async () => {
    const bad = sale({ data: [{ xmlId: 'x', model: 'sale.order', values: { partner_id: { ref: 'base.nope' } } }] });
    const mgr = manager([base(), bad]);
    const h = await mgr.create('m6', ['base']);
    await expect(ModuleService.for(h).install(['sale'])).rejects.toThrow(/unknown reference/);
    const other = sale({ data: [{ xmlId: 'base.hijack', model: 'res.partner', values: { name: 'x' } }] });
    const h2 = await manager([base(), other]).create('m6b', ['base']);
    await expect(ModuleService.for(h2).install(['sale'])).rejects.toThrow(/another module/);
  });

  it('isolates modules per tenant', async () => {
    const mgr = manager([base(), sale()]);
    const a = await mgr.create('iso_a', ['sale']);
    const b = await mgr.create('iso_b', ['base']);
    expect(a.registry.models.has('sale.order')).toBe(true);
    expect(b.registry.models.has('sale.order')).toBe(false);
    expect(await hasTable(b, 'sale_order')).toBe(false);
    expect((await ModuleService.for(b).list()).find((m) => m.name === 'sale')!.state).toBe('uninstalled');
  });
});

const withDir = async (fn: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), 'nexa-mod-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};
const diskManager = (dir: string, mods: ModuleManifest[], warnings?: ModuleWarning[]) => {
  const m = new PgliteTenantManager({ rootDir: dir, catalog: new ModuleCatalog(mods), onWarning: (_t, w) => warnings?.push(w) });
  managers.push(m);
  return m;
};
const closeLast = () => managers.pop()!.closeAll();
const fkCount = async (h: TenantHandle, table: string, column: string) =>
  (await h.driver.query({
    text: `SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
           WHERE c.contype = 'f' AND t.relname = $1 AND a.attname = $2`, params: [table, column],
  })).length;

describe('module system regressions', () => {
  it('opens a tenant whose installed module left the catalog (orphan) and can forget it', async () => {
    await withDir(async (dir) => {
      await diskManager(dir, [base(), sale()]).create('orph', ['sale']);
      await closeLast();
      const warnings: ModuleWarning[] = [];
      const h = await diskManager(dir, [base()], warnings).open('orph');
      expect(h.registry.models.has('sale.order')).toBe(false);
      expect(h.registry.get('res.partner').fields.has('customer_rank')).toBe(false);
      expect(await hasTable(h, 'sale_order')).toBe(true); // kept
      expect(warnings).toEqual([expect.objectContaining({ kind: 'orphan_module', module: 'sale' })]);
      const svc = ModuleService.for(h);
      expect((await svc.list()).find((m) => m.name === 'sale')).toMatchObject({ orphan: true, state: 'installed' });
      await expect(svc.uninstall(['sale'], { allowDestructive: true })).rejects.toThrow(/forceForget/);
      await svc.forceForget('sale');
      expect((await svc.list()).find((m) => m.name === 'sale')).toBeUndefined();
      expect(svc.warnings).toEqual([]);
      expect(await xmlIds(h, 'sale')).toEqual([]);
      expect(await h.driver.query({ text: `SELECT 1 FROM nx_access WHERE module = 'sale'`, params: [] })).toHaveLength(0);
      expect(await hasTable(h, 'sale_order')).toBe(true); // bookkeeping only
      await expect(svc.forceForget('base')).rejects.toThrow(/uninstall/);
    });
  }, 60_000);

  it('installs dependencies added by a new version at open; catalog rejects undeclared cross-module models', async () => {
    const crm: ModuleManifest = {
      name: 'crm', version: '1.0.0', depends: [],
      models: [{ name: 'crm.team', origin: 'module', fields: { name: { type: 'char' } } }],
    };
    await withDir(async (dir) => {
      await diskManager(dir, [base()]).create('deps', ['base']);
      await closeLast();
      const v2 = base({
        version: '1.1.0', depends: ['crm'],
        models: [...base().models!, {
          name: 'res.partner', extends: ['res.partner'], origin: 'module', fields: { team_id: { type: 'many2one', comodel: 'crm.team' } },
        }],
      });
      const h = await diskManager(dir, [v2, crm]).open('deps');
      expect((await ModuleService.for(h).list()).map((m) => [m.name, m.state, m.installedVersion]))
        .toEqual([['crm', 'installed', '1.0.0'], ['base', 'installed', '1.1.0']]);
      expect(await columns(h, 'res_partner')).toContain('team_id');
    });
    expect(() => new ModuleCatalog([base(), {
      name: 'x', version: '1.0.0', depends: [],
      models: [{ name: 'res.partner', extends: ['res.partner'], origin: 'module', fields: { y: { type: 'char' } } }],
    }])).toThrow(/without depending/);
    expect(() => new ModuleCatalog([base(), {
      name: 'x', version: '1.0.0', depends: [],
      models: [{ name: 'x.thing', origin: 'module', fields: { p: { type: 'many2one', comodel: 'res.partner' } } }],
    }])).toThrow(/without depending/);
  }, 60_000);

  it('a failing upgrade at open fails the open and leaves the database unchanged', async () => {
    await withDir(async (dir) => {
      await diskManager(dir, [base()]).create('fail', ['base']);
      await closeLast();
      const bad = base({
        version: '1.1.0',
        models: [...base().models!, { name: 'res.partner', extends: ['res.partner'], origin: 'module', fields: { vat: { type: 'char' } } }],
        hooks: { migrate: { '1.1.0': async () => { throw new Error('migrate failed'); } } },
      });
      await expect(diskManager(dir, [bad]).open('fail')).rejects.toThrow('migrate failed');
      const h = await diskManager(dir, [base()]).open('fail'); // the failed open closed its driver
      expect(await columns(h, 'res_partner')).not.toContain('vat');
      expect((await ModuleService.for(h).list())[0]).toMatchObject({ installedVersion: '1.0.0', state: 'installed' });
    });
  }, 60_000);

  it('an upgrade dropping fields relaxes NOT NULL and FKs on the kept columns and reports them', async () => {
    const inv = (version: string, models: ModuleManifest['models']): ModuleManifest => ({ name: 'inv', version, depends: ['base'], models });
    await withDir(async (dir) => {
      const h1 = await diskManager(dir, [base(), inv('1.0.0', [{
        name: 'inv.item', origin: 'module', fields: {
          name: { type: 'char', required: true },
          partner_id: { type: 'many2one', comodel: 'res.partner', required: true, ondelete: 'restrict' },
        },
      }])]).create('relax', ['inv']);
      const e1 = h1.env({ uid: 1 });
      const p = await e1.model('res.partner').create({ name: 'P' });
      await e1.model('inv.item').create({ name: 'old', partner_id: p.ids[0] });
      await h1.driver.query({ text: `ALTER TABLE inv_item ALTER COLUMN name SET NOT NULL`, params: [] });
      await closeLast();

      const warnings: ModuleWarning[] = [];
      const v2 = inv('2.0.0', [{ name: 'inv.item', origin: 'module', fields: { code: { type: 'char' } } }]);
      const h = await diskManager(dir, [base(), v2], warnings).open('relax');
      expect(warnings).toContainEqual(expect.objectContaining({ kind: 'orphan_columns', columns: ['inv_item.name', 'inv_item.partner_id'] }));
      expect(await columns(h, 'inv_item')).toEqual(expect.arrayContaining(['name', 'partner_id', 'code']));
      expect(await fkCount(h, 'inv_item', 'partner_id')).toBe(0);
      const env = h.env({ uid: 1 });
      await env.model('inv.item').create({ code: 'new' }); // no NOT NULL violation
      await env.model('res.partner').browse(p.ids[0]).unlink(); // no restrict FK left
      expect(await h.driver.query({ text: `SELECT 1 FROM inv_item WHERE name = 'old'`, params: [] })).toHaveLength(1);
    });
  }, 60_000);

  it('limits data refs to the module and its dependencies', async () => {
    const x: ModuleManifest = { name: 'x', version: '1.0.0', depends: ['base'], data: [{ xmlId: 'p', model: 'res.partner', values: { name: 'X' } }] };
    const y: ModuleManifest = {
      name: 'y', version: '1.0.0', depends: ['base'],
      models: [{ name: 'y.doc', origin: 'module', fields: { partner_id: { type: 'many2one', comodel: 'res.partner' } } }],
      data: [{ xmlId: 'd', model: 'y.doc', values: { partner_id: { ref: 'x.p' } } }],
    };
    const h = await manager([base(), x, y]).create('refs', ['x']);
    await expect(ModuleService.for(h).install(['y'])).rejects.toThrow(/not in 'y' or its dependencies/);
  });

  it('uninstall refuses while surviving records reference the module data', async () => {
    const core: ModuleManifest = {
      name: 'core', version: '1.0.0', depends: [],
      models: [{
        name: 'res.partner', origin: 'module',
        fields: { name: { type: 'char' }, parent_id: { type: 'many2one', comodel: 'res.partner', ondelete: 'cascade' } },
      }],
    };
    const ext: ModuleManifest = { name: 'ext', version: '1.0.0', depends: ['core'], data: [{ xmlId: 'acme', model: 'res.partner', values: { name: 'Acme' } }] };
    const h = await manager([core, ext]).create('inbound', ['ext']);
    const env = h.env({ uid: 1 });
    const acme = await env.model('res.partner').search([['name', '=', 'Acme']]);
    const child = await env.model('res.partner').create({ name: 'child', parent_id: acme.ids[0] });
    const svc = ModuleService.for(h);
    await expect(svc.uninstall(['ext'], { allowDestructive: true })).rejects.toThrow(/reference res.partner data/);
    expect(await env.model('res.partner').searchCount([])).toBe(2);
    expect((await svc.list()).find((m) => m.name === 'ext')!.state).toBe('installed');
    await child.unlink();
    expect(await svc.uninstall(['ext'], { allowDestructive: true })).toEqual(['ext']);
    expect(await env.model('res.partner').searchCount([])).toBe(0);
  });

  it('module and metadata changes share one lock and all survive when run concurrently', async () => {
    const h = await manager([base(), sale()]).create('lock', ['base']);
    const meta = MetadataStore.for(h);
    await Promise.all([
      meta.addField('res.partner', 'x_a', { type: 'char' }),
      ModuleService.for(h).install(['sale']),
      meta.addField('res.partner', 'x_b', { type: 'char' }),
    ]);
    const fields = h.registry.get('res.partner').fields;
    expect(['x_a', 'x_b', 'customer_rank'].every((f) => fields.has(f))).toBe(true);
    expect(await columns(h, 'res_partner')).toEqual(expect.arrayContaining(['x_a', 'x_b', 'customer_rank']));
  });

  it('uninstall drops tables with FK cycles between them', async () => {
    const cyc: ModuleManifest = {
      name: 'cyc', version: '1.0.0', depends: [],
      models: [
        { name: 'cyc.a', origin: 'module', fields: { b_id: { type: 'many2one', comodel: 'cyc.b' } } },
        { name: 'cyc.b', origin: 'module', fields: { a_id: { type: 'many2one', comodel: 'cyc.a' } } },
      ],
    };
    const h = await manager([cyc]).create('cycle', ['cyc']);
    const env = h.env({ uid: 1 });
    const a = await env.model('cyc.a').create({});
    const b = await env.model('cyc.b').create({ a_id: a.ids[0] });
    await a.write({ b_id: b.ids[0] });
    expect(await ModuleService.for(h).uninstall(['cyc'], { allowDestructive: true })).toEqual(['cyc']);
    expect(await hasTable(h, 'cyc_a')).toBe(false);
    expect(await hasTable(h, 'cyc_b')).toBe(false);
  });
});

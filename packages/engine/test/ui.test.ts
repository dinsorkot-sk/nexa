import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AccessError, ModuleCatalog, ModuleService, PgliteTenantManager, ValidationError, applyPatches, filterArch, getAction, getMenus, getView,
  securityModels, type Env, type ModuleManifest, type TenantHandle, type ViewNode,
} from '../src/index.js';

const all = { read: true, write: true, create: true, unlink: true };

const base: ModuleManifest = {
  name: 'base', version: '1.0.0', depends: [],
  models: securityModels,
  data: [
    { xmlId: 'main_company', model: 'res.company', values: { name: 'Main' } },
    { xmlId: 'group_user', model: 'res.groups', values: { name: 'User', code: 'base.group_user' } },
    { xmlId: 'group_manager', model: 'res.groups', values: { name: 'Manager', code: 'sale.group_manager' } },
    { xmlId: 'user_demo', model: 'res.users', values: { name: 'Demo', login: 'demo', company_id: { ref: 'main_company' }, group_ids: [{ ref: 'group_user' }] } },
  ],
  access: [{ model: 'res.company', group: null, perms: { read: true, write: false, create: false, unlink: false } }],
};

const sale: ModuleManifest = {
  name: 'sale', version: '1.0.0', depends: ['base'],
  models: [
    { name: 'sale.order', origin: 'module', fields: {
      name: { type: 'char', required: true },
      state: { type: 'selection', selection: [['draft', 'Draft'], ['done', 'Done']] },
      margin: { type: 'float', groups: ['sale.group_manager'] },
      note: { type: 'text' },
    } },
    { name: 'sale.report', origin: 'module', fields: { name: { type: 'char' } } },
  ],
  access: [
    { model: 'sale.order', group: 'base.group_user', perms: all },
    { model: 'sale.report', group: 'sale.group_manager', perms: all },
  ],
  views: [
    { xmlId: 'order_form', model: 'sale.order', type: 'form', arch: { tag: 'form', children: [
      { tag: 'group', attrs: { name: 'main' }, children: [
        { tag: 'field', attrs: { name: 'name' } },
        { tag: 'field', attrs: { name: 'margin' } },
      ] },
      { tag: 'group', attrs: { name: 'admin', groups: ['sale.group_manager'] }, children: [{ tag: 'field', attrs: { name: 'note' } }] },
    ] } },
    { xmlId: 'order_list', model: 'sale.order', type: 'list', arch: { tag: 'list', children: [{ tag: 'field', attrs: { name: 'name' } }] } },
  ],
  actions: [
    { xmlId: 'action_orders', type: 'window', name: 'Orders', model: 'sale.order', viewTypes: ['list', 'form'], domain: [['state', '!=', 'done']] },
    { xmlId: 'action_report', type: 'window', name: 'Report', model: 'sale.report' },
  ],
  menus: [
    { xmlId: 'menu_root', name: 'Sales', sequence: 5 },
    { xmlId: 'menu_orders', name: 'Orders', parent: 'menu_root', action: 'action_orders', sequence: 1 },
    { xmlId: 'menu_report', name: 'Reporting', parent: 'menu_root', action: 'action_report', sequence: 2 },
    { xmlId: 'menu_cfg', name: 'Configuration', parent: 'menu_root', sequence: 9, groups: ['sale.group_manager'] },
    { xmlId: 'menu_empty', name: 'Empty', sequence: 50 },
  ],
};

const saleExt: ModuleManifest = {
  name: 'sale_ext', version: '1.0.0', depends: ['sale'],
  views: [
    { xmlId: 'order_form_ext', model: 'sale.order', type: 'form', priority: 20, inherit: { from: 'sale.order_form', patches: [
      { target: 'field[name=name]', position: 'after', node: { tag: 'field', attrs: { name: 'state' } } },
      { target: 'field[name=name]', position: 'attributes', attrs: { placeholder: 'SO0001' } },
    ] } },
    { xmlId: 'order_form_ext2', model: 'sale.order', type: 'form', priority: 30, inherit: { from: 'order_form_ext', patches: [
      { target: 'field[name=state]', position: 'attributes', attrs: { widget: 'statusbar' } },
    ] } },
  ],
};

let mgr: PgliteTenantManager;
let h: TenantHandle;
let root: Env;
let demo: Env;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ catalog: new ModuleCatalog([base, sale, saleExt]) });
  h = await mgr.create('ui', ['sale_ext']);
  root = h.env({ uid: 1 });
  const [uid] = (await root.model('res.users').search([['login', '=', 'demo']])).ids;
  expect(uid).not.toBe(1); // id 1 is reserved for the superuser
  demo = h.env({ uid });
  expect(demo.su).toBe(false);
});
afterAll(() => mgr.closeAll());

const find = (n: ViewNode, pred: (n: ViewNode) => boolean): ViewNode | undefined =>
  pred(n) ? n : (n.children ?? []).map((c) => find(c, pred)).find(Boolean);
const field = (name: string) => (n: ViewNode) => n.tag === 'field' && n.attrs?.name === name;

describe('views', () => {
  it('applies inheritance chains in priority order and returns field metadata', async () => {
    const v = await getView(root, 'sale.order', 'form');
    expect(v.xmlId).toBe('sale.order_form');
    const main = find(v.arch, (n) => n.attrs?.name === 'main')!;
    expect(main.children!.map((c) => c.attrs?.name)).toEqual(['name', 'state', 'margin']);
    expect(find(v.arch, field('name'))!.attrs).toMatchObject({ placeholder: 'SO0001' });
    expect(find(v.arch, field('state'))!.attrs).toMatchObject({ widget: 'statusbar' });
    expect(v.fields.state).toMatchObject({ type: 'selection', selection: [['draft', 'Draft'], ['done', 'Done']], string: 'State' });
    expect(v.fields.name.required).toBe(true);
  });

  it('removes group-restricted nodes and fields for normal users', async () => {
    const v = await getView(demo, 'sale.order', 'form');
    expect(find(v.arch, field('margin'))).toBeUndefined();
    expect(find(v.arch, (n) => n.attrs?.name === 'admin')).toBeUndefined();
    expect(Object.keys(v.fields).sort()).toEqual(['name', 'state']);
  });

  it('generates default views when none are defined, and enforces read access', async () => {
    const v = await getView(root, 'sale.report', 'list');
    expect(v.xmlId).toBeNull();
    expect(v.arch.children!.map((c) => c.attrs?.name)).toEqual(['name']);
    const form = await getView(root, 'res.users', 'form');
    expect(find(form.arch, field('group_ids'))).toBeDefined();
    await expect(getView(demo, 'sale.report', 'list')).rejects.toThrow(AccessError);
  });
});

describe('actions and menus', () => {
  it('returns actions with defaults and checks the model ACL', async () => {
    expect(await getAction(demo, 'sale.action_orders')).toMatchObject({ name: 'Orders', model: 'sale.order', viewTypes: ['list', 'form'] });
    await expect(getAction(demo, 'sale.action_report')).rejects.toThrow(AccessError);
  });

  it('builds the menu tree per user: groups, action access, empty parents dropped', async () => {
    const names = (ms: Awaited<ReturnType<typeof getMenus>>): unknown => ms.map((m) => [m.name, names(m.children)]);
    expect(names(await getMenus(root))).toEqual([['Sales', [['Orders', []], ['Reporting', []]]]]);
    expect(names(await getMenus(demo))).toEqual([['Sales', [['Orders', []]]]]);
  });
});

describe('install-time validation', () => {
  it('rejects unknown fields, broken patch targets and dangling inheritance', async () => {
    const bad = (views: ModuleManifest['views']): ModuleManifest => ({ name: 'bad', version: '1.0.0', depends: ['sale'], views });
    const svc = ModuleService.for(h);
    await expect(svc.install(['bad'])).rejects.toThrow(); // not in catalog
    const m2 = new PgliteTenantManager({ catalog: new ModuleCatalog([base, sale, bad([
      { xmlId: 'v', model: 'sale.order', type: 'form', arch: { tag: 'form', children: [{ tag: 'field', attrs: { name: 'nope' } }] } },
    ])]) });
    const m3 = new PgliteTenantManager({ catalog: new ModuleCatalog([base, sale, bad([
      { xmlId: 'v', model: 'sale.order', type: 'form', inherit: { from: 'sale.order_form', patches: [{ target: 'field[name=note2]', position: 'after', node: { tag: 'label' } }] } },
    ])]) });
    try {
      await expect(m2.create('bad1', ['bad'])).rejects.toThrow(/unknown field 'nope'/);
      await expect(m3.create('bad2', ['bad'])).rejects.toThrow(/not found/);
    } finally {
      await m2.closeAll();
      await m3.closeAll();
    }
  });

  it('uninstalling a module removes its views and menus', async () => {
    await ModuleService.for(h).uninstall(['sale_ext'], { allowDestructive: true });
    const v = await getView(root, 'sale.order', 'form');
    expect(find(v.arch, field('state'))).toBeUndefined();
  });
});

describe('patch engine', () => {
  const arch: ViewNode = { tag: 'form', children: [{ tag: 'group', children: [{ tag: 'field', attrs: { name: 'a' } }] }] };
  it('supports replace/remove/inside and does not mutate the input', () => {
    const out = applyPatches(arch, [
      { target: 'group', position: 'inside', node: { tag: 'field', attrs: { name: 'b' } } },
      { target: 'field[name=a]', position: 'replace' },
    ], 't');
    expect(out.children![0].children!.map((c) => c.attrs?.name)).toEqual(['b']);
    expect(arch.children![0].children).toHaveLength(1);
    expect(() => applyPatches(arch, [{ target: 'field[name=a', position: 'replace' }], 't')).toThrow(ValidationError);
  });
});

describe('review regressions (T8)', () => {
  const tryInstall = async (extra: ModuleManifest) => {
    const m = new PgliteTenantManager({ catalog: new ModuleCatalog([base, sale, extra]) });
    try {
      return await m.create(`t${Math.random().toString(36).slice(2, 8)}`, [extra.name]).then(() => 'ok');
    } finally {
      await m.closeAll();
    }
  };

  it('#1 a module cannot define ids in another module namespace', async () => {
    await expect(tryInstall({ name: 'evil', version: '1.0.0', depends: ['sale'], menus: [{ xmlId: 'sale.menu_hijack', name: 'X' }] }))
      .rejects.toThrow(/another module's namespace/);
  });

  it('#2 string groups are rejected at install and fail closed at runtime', async () => {
    await expect(tryInstall({ name: 'loose', version: '1.0.0', depends: ['sale'], views: [
      { xmlId: 'v', model: 'sale.order', type: 'list', priority: 1, arch: { tag: 'list', children: [{ tag: 'field', attrs: { name: 'note', groups: 'sale.group_manager' } }] } },
    ] })).rejects.toThrow(/attrs.groups must be an array/);
    const out = filterArch({ tag: 'list', children: [{ tag: 'field', attrs: { name: 'n', groups: 'x' as never } }] }, () => true, new Set());
    expect(out!.children).toEqual([]);
  });

  it('#3 a patch targeting nodes of a group-restricted view does not break other users', async () => {
    const ext: ModuleManifest = { name: 'gx', version: '1.0.0', depends: ['sale'], views: [
      { xmlId: 'x', model: 'sale.order', type: 'form', priority: 20, groups: ['sale.group_manager'], inherit: { from: 'sale.order_form', patches: [
        { target: 'group[name=main]', position: 'after', node: { tag: 'group', attrs: { name: 'extra' } } },
      ] } },
      { xmlId: 'y', model: 'sale.order', type: 'form', priority: 30, inherit: { from: 'sale.order_form', patches: [
        { target: 'group[name=extra]', position: 'inside', node: { tag: 'field', attrs: { name: 'state' } } },
      ] } },
    ] };
    const m = new PgliteTenantManager({ catalog: new ModuleCatalog([base, sale, ext]) });
    try {
      const t = await m.create('g3', ['gx']);
      const su = t.env({ uid: 1 });
      const [uid] = (await su.model('res.users').search([['login', '=', 'demo']])).ids;
      expect(find((await getView(su, 'sale.order', 'form')).arch, field('state'))).toBeDefined();
      const v = await getView(t.env({ uid }), 'sale.order', 'form');
      expect(find(v.arch, (n) => n.attrs?.name === 'extra')).toBeUndefined();
    } finally {
      await m.closeAll();
    }
  });

  it('#4 an existing tenant with a real user at id 1 is reported and the sequence moves past it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexa-ui-'));
    const cat = () => new ModuleCatalog([base]);
    try {
      const m1 = new PgliteTenantManager({ rootDir: dir, catalog: cat() });
      const t1 = await m1.create('legacy', ['base']);
      // simulate a tenant created before the reservation: a real user row with id 1
      await t1.driver.query({ text: `INSERT INTO res_users (id, name, login, active, company_id) SELECT 1, 'Old', 'old', true, id FROM res_company LIMIT 1`, params: [] });
      await t1.driver.query({ text: `SELECT setval('res_users_id_seq', 1, false)`, params: [] });
      await m1.closeAll();
      const warnings: { kind: string }[] = [];
      const m2 = new PgliteTenantManager({ rootDir: dir, catalog: cat(), onWarning: (_t, w) => warnings.push(w) });
      const t2 = await m2.open('legacy');
      expect(warnings.map((w) => w.kind)).toContain('superuser_row');
      const su = t2.env({ uid: 1 });
      const [cid] = (await su.model('res.company').search([])).ids;
      const created = await su.model('res.users').create({ name: 'N', login: 'new', company_id: cid });
      expect(created.ids[0]).toBeGreaterThan(1);
      await m2.closeAll();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('resolved-arch validation', () => {
  it('rejects an attributes patch that renames a field to an unknown one', async () => {
    const m = new PgliteTenantManager({ catalog: new ModuleCatalog([base, sale, { name: 'ren', version: '1.0.0', depends: ['sale'], views: [
      { xmlId: 'r', model: 'sale.order', type: 'list', inherit: { from: 'sale.order_list', patches: [
        { target: 'field[name=name]', position: 'attributes', attrs: { name: 'ghost' } },
      ] } },
    ] }]) });
    try {
      await expect(m.create('ren', ['ren'])).rejects.toThrow(/unknown field 'ghost'/);
    } finally {
      await m.closeAll();
    }
  });
});

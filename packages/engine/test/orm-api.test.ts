import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgliteTenantManager, ValidationError, type Env, type ModelDef } from '../src/index.js';

const models: ModelDef[] = [
  { name: 'api.company', origin: 'module', fields: { name: { type: 'char', required: true } } },
  {
    name: 'api.partner', origin: 'module', recName: 'name',
    fields: {
      name: { type: 'char', required: true },
      active: { type: 'boolean', default: true },
      company_id: { type: 'many2one', comodel: 'api.company' },
    },
  },
  {
    name: 'api.item', origin: 'module', recName: 'name',
    fields: {
      name: { type: 'char', required: true },
      active: { type: 'boolean', default: true },
      category: { type: 'selection', selection: [['a', 'A'], ['b', 'B']] },
      amount: { type: 'float' },
      happened_at: { type: 'datetime' },
      partner_id: { type: 'many2one', comodel: 'api.partner', checkCompany: true },
      company_id: { type: 'many2one', comodel: 'api.company' },
    },
  },
  {
    name: 'api.folder', origin: 'module', recName: 'name',
    fields: {
      name: { type: 'char', required: true },
      parent_id: { type: 'many2one', comodel: 'api.folder', ondelete: 'set null' },
      parent_path: { type: 'char', readonly: true },
    },
  },
  { name: 'api.person', origin: 'module', fields: { name: { type: 'char', required: true } } },
  {
    name: 'api.staff', origin: 'module', delegates: { 'api.person': 'person_id' },
    fields: { person_id: { type: 'many2one', comodel: 'api.person', required: true, ondelete: 'restrict' } },
  },
  {
    name: 'api.order', origin: 'module',
    fields: {
      name: { type: 'char', required: true },
      lines: { type: 'one2many', comodel: 'api.line', inverseName: 'order_id' },
    },
  },
  {
    name: 'api.line', origin: 'module',
    fields: {
      name: { type: 'char', required: true },
      order_id: { type: 'many2one', comodel: 'api.order', required: true },
      subline_ids: { type: 'one2many', comodel: 'api.subline', inverseName: 'line_id' },
    },
  },
  { name: 'api.subline', origin: 'module', fields: { name: { type: 'char' }, line_id: { type: 'many2one', comodel: 'api.line', required: true } } },
];

let manager: PgliteTenantManager;
let env: Env;

beforeAll(async () => {
  manager = new PgliteTenantManager({ models: async () => models });
  env = (await manager.open('orm-api')).env({ uid: 1 });
}, 60_000);

afterAll(() => manager.closeAll());

describe('T16 ORM API', () => {
  it('supports display names, metadata, defaults and active_test', async () => {
    const model = env.model('api.item');
    const defaults = await env.withContext({ default_category: 'b' }).model('api.item').defaultGet(['category', 'active']);
    expect(defaults).toMatchObject({ category: 'b', active: true });
    const created = await env.withContext({ default_category: 'b' }).model('api.item').create({ name: 'Active item' });
    const [archived] = (await model.create({ name: 'Archived item', active: false })).ids;
    expect(await model.nameSearch('Active')).toEqual([{ id: created.ids[0], display_name: 'Active item' }]);
    expect(await model.searchCount([])).toBe(1);
    expect(await env.withContext({ activeTest: false }).model('api.item').searchCount([])).toBe(2);
    expect(await model.fieldsGet(['name', 'display_name'])).toMatchObject({
      name: { type: 'char', string: 'name' },
      display_name: { type: 'char', readonly: true },
    });
    expect((await model.browse(archived).read(['display_name']))[0].display_name).toBe('Archived item');
  });

  it('groups numeric, categorical and UTC date values under read rules', async () => {
    const model = env.model('api.item');
    await model.create([
      { name: 'One', category: 'a', amount: 2, happened_at: '2026-04-02T12:00:00Z' },
      { name: 'Two', category: 'a', amount: 3, happened_at: '2026-04-02T18:00:00Z' },
      { name: 'Three', category: 'b', amount: 7, happened_at: '2026-05-01T00:00:00Z' },
    ]);
    const groups = await model.readGroup([['name', 'in', ['One', 'Two', 'Three']]], ['category'], [
      { field: 'amount', op: 'sum' },
      { field: 'amount', op: 'avg' },
      { field: 'name', op: 'count' },
    ]);
    expect(groups).toEqual([
      { category: 'a', __count: 2, amount_sum: 5, amount_avg: 2.5, name_count: 2 },
      { category: 'b', __count: 1, amount_sum: 7, amount_avg: 7, name_count: 1 },
    ]);
    const months = await model.readGroup([['name', 'in', ['One', 'Two', 'Three']]], ['happened_at:month'], []);
    expect(months.map((row) => row['happened_at:month'])).toHaveLength(2);
    expect(await model.readGroup([['name', '=', 'missing']], [], [])).toEqual([{ __count: 0 }]);
  });

  it('copies one2many rows and gives delegated records a new parent', async () => {
    const order = env.model('api.order');
    const [sourceId] = (await order.create({
      name: 'Source',
      lines: [{ op: 'create', values: { name: 'Line' } }],
    })).ids;
    const copied = await order.browse(sourceId).copy({ name: 'Copy' });
    expect((await copied.read(['name', 'lines']))[0]).toMatchObject({ name: 'Copy' });
    expect((await env.model('api.line').searchRead([['order_id', '=', copied.ids[0]]], ['name']))).toEqual([
      expect.objectContaining({ name: 'Line' }),
    ]);

    const staff = env.model('api.staff');
    const [originalId] = (await staff.create({ name: 'Original' })).ids;
    const [original] = await staff.browse(originalId).read(['person_id', 'name']);
    const clone = await staff.browse(originalId).copy({ name: 'Cloned' });
    const [cloned] = await clone.read(['person_id', 'name']);
    expect(cloned.name).toBe('Cloned');
    expect(cloned.person_id).not.toBe(original.person_id);
    expect((await env.model('api.person').browse(original.person_id as number).read(['name']))[0].name).toBe('Original');
  });

  it('copies nested one2many records without moving the source descendants', async () => {
    const order = env.model('api.order');
    const [sourceId] = (await order.create({
      name: 'Nested source',
      lines: [{ op: 'create', values: { name: 'Line', subline_ids: [{ op: 'create', values: { name: 'Subline' } }] } }],
    })).ids;
    const clone = await order.browse(sourceId).copy({ name: 'Nested copy' });
    const lines = env.model('api.line');
    const [original] = await lines.searchRead([['order_id', '=', sourceId]], ['subline_ids']);
    const [copied] = await lines.searchRead([['order_id', '=', clone.ids[0]]], ['subline_ids']);
    expect(original.subline_ids).toHaveLength(1);
    expect(copied.subline_ids).toHaveLength(1);
    expect(copied.subline_ids).not.toEqual(original.subline_ids);
    expect(await env.model('api.subline').browse(copied.subline_ids as number[]).read(['name'])).toEqual([
      expect.objectContaining({ name: 'Subline' }),
    ]);
  });

  it('maintains hierarchy paths, checks company links and rejects hierarchy cycles', async () => {
    const folder = env.model('api.folder');
    const [root] = (await folder.create({ name: 'Root' })).ids;
    const [child] = (await folder.create({ name: 'Child', parent_id: root })).ids;
    expect((await folder.browse(child).read(['parent_path']))[0].parent_path).toBe(root + '/' + child + '/');
    await expect(folder.browse(root).write({ parent_id: child })).rejects.toBeInstanceOf(ValidationError);
    expect((await folder.browse(child).read(['parent_path']))[0].parent_path).toBe(root + '/' + child + '/');

    const [companyA, companyB] = (await env.model('api.company').create([{ name: 'A' }, { name: 'B' }])).ids;
    const [partner] = (await env.model('api.partner').create({ name: 'Partner', company_id: companyB })).ids;
    await expect(env.model('api.item').create({ name: 'Mismatch', company_id: companyA, partner_id: partner }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

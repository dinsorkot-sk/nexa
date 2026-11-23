import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EngineError, MetadataStore, PgliteTenantManager, ValidationError, applyMigration, indexName, planMigration,
  type ModelDef, type TenantHandle,
} from '../src/index.js';

const models: ModelDef[] = [
  { name: 'res.partner', origin: 'module', fields: { name: { type: 'char', required: true }, ref: { type: 'char', unique: true } } },
];

let mgr: PgliteTenantManager;
let h: TenantHandle;
let meta: MetadataStore;

beforeAll(async () => {
  mgr = new PgliteTenantManager({ models: async () => models });
  h = await mgr.open('t1');
  meta = MetadataStore.for(h);
}, 60_000);

afterAll(() => mgr.closeAll());

const env = () => h.env({ uid: 1 });
const columns = async (handle: TenantHandle, table: string) =>
  (await handle.driver.query<{ column_name: string }>({
    text: `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, params: [table],
  })).map((r) => r.column_name);

describe('metadata store', () => {
  it('creates a custom model usable end-to-end', async () => {
    await meta.createModel({
      name: 'x_book', description: 'Book', order: 'x_title asc',
      fields: {
        x_title: { type: 'char', required: true, string: 'Title' },
        x_pages: { type: 'integer', default: 100 },
        x_kind: { type: 'selection', selection: [['a', 'A'], ['b', 'B']] },
        x_partner_id: { type: 'many2one', comodel: 'res.partner', ondelete: 'set null' },
      },
    });
    const books = env().model('x_book');
    const rs = await books.create([{ x_title: 'B' }, { x_title: 'A', x_kind: 'b' }]);
    expect(rs.ids).toHaveLength(2);
    const rows = await books.searchRead([], ['x_title', 'x_pages', 'x_kind']);
    expect(rows.map((r) => r.x_title)).toEqual(['A', 'B']);
    expect(rows[0].x_pages).toBe(100);
    await rs.browse(rs.ids[0]).write({ x_title: 'C' });
    await rs.browse(rs.ids[1]).unlink();
    expect(await books.searchCount([])).toBe(1);

    const listed = await meta.list();
    const def = listed.find((d) => d.name === 'x_book')!;
    expect(def.origin).toBe('custom');
    expect(def.fields.x_kind.selection).toEqual([['a', 'A'], ['b', 'B']]);
    expect(def.fields.x_partner_id).toMatchObject({ comodel: 'res.partner', ondelete: 'set null' });
  });

  it('validates x_ prefix and duplicates', async () => {
    await expect(meta.createModel({ name: 'book' })).rejects.toThrow(ValidationError);
    await expect(meta.createModel({ name: 'x_bad', fields: { title: { type: 'char' } } })).rejects.toThrow(ValidationError);
    await expect(meta.createModel({ name: 'x_book' })).rejects.toThrow(/already exists/);
    await expect(meta.addField('res.partner', 'name2', { type: 'char' })).rejects.toThrow(ValidationError);
    await expect(meta.createModel({ name: 'x_evil"; drop table res_partner; --' })).rejects.toThrow(ValidationError);
  });

  it('adds a custom field to a module model', async () => {
    await meta.addField('res.partner', 'x_nickname', { type: 'char', index: true });
    expect(h.registry.get('res.partner').fields.has('x_nickname')).toBe(true);
    const p = await env().model('res.partner').create({ name: 'P', x_nickname: 'pp' });
    expect((await p.read(['x_nickname']))[0].x_nickname).toBe('pp');
    const idx = await h.driver.query({ text: `SELECT 1 FROM pg_indexes WHERE indexname = $1`, params: [indexName('res_partner', 'x_nickname', false)] });
    expect(idx).toHaveLength(1);
  });

  it('enforces unique (module and custom fields)', async () => {
    const partners = env().model('res.partner');
    await partners.create({ name: 'a', ref: 'R1' });
    await expect(partners.create({ name: 'b', ref: 'R1' })).rejects.toThrow();
    await meta.addField('x_book', 'x_isbn', { type: 'char', unique: true });
    await env().model('x_book').create({ x_title: 'Z', x_isbn: '1' });
    await expect(env().model('x_book').create({ x_title: 'Y', x_isbn: '1' })).rejects.toThrow();
  });

  it('refuses destructive removal without the flag, applies it with the flag', async () => {
    await meta.addField('x_book', 'x_tmp', { type: 'char' });
    await expect(meta.removeField('x_book', 'x_tmp', { allowDestructive: false })).rejects.toThrow(EngineError);
    expect(await columns(h, 'x_book')).toContain('x_tmp');
    expect(h.registry.get('x_book').fields.has('x_tmp')).toBe(true);
    await meta.removeField('x_book', 'x_tmp', { allowDestructive: true });
    expect(await columns(h, 'x_book')).not.toContain('x_tmp');
    expect(h.registry.get('x_book').fields.has('x_tmp')).toBe(false);
  });

  it('applyMigration refuses destructive plans unless allowed', async () => {
    await h.driver.query({ text: 'ALTER TABLE x_book ADD COLUMN legacy TEXT', params: [] });
    const plan = await planMigration(h.registry, h.driver);
    expect(plan.ops).toContainEqual(expect.objectContaining({ kind: 'drop_column', table: 'x_book', column: 'legacy', destructive: true }));
    await expect(applyMigration(plan, h.driver)).rejects.toThrow(/destructive/);
    expect(await columns(h, 'x_book')).toContain('legacy');
    await applyMigration(plan, h.driver, { allowDestructive: true });
    expect(await columns(h, 'x_book')).not.toContain('legacy');
  });

  it('rolls back metadata and keeps the registry when the reload fails', async () => {
    const before = h.registry.models;
    await expect(meta.addField('x_book', 'x_bad_id', { type: 'many2one', comodel: 'no.such' })).rejects.toThrow(/unknown model/);
    expect(h.registry.models).toBe(before);
    expect((await meta.list()).find((d) => d.name === 'x_book')!.fields.x_bad_id).toBeUndefined();
  });

  it('removes a custom model (destructive) and refuses when still referenced', async () => {
    await meta.createModel({ name: 'x_tag', fields: { x_name: { type: 'char' } } });
    await meta.addField('x_book', 'x_tag_id', { type: 'many2one', comodel: 'x_tag' });
    await expect(meta.removeModel('x_tag', { allowDestructive: true })).rejects.toThrow(/still referenced by x_book.x_tag_id/);
    expect(h.registry.models.has('x_tag')).toBe(true);
    await meta.removeField('x_book', 'x_tag_id', { allowDestructive: true });
    await expect(meta.removeModel('x_tag', { allowDestructive: false })).rejects.toThrow(EngineError);
    await meta.removeModel('x_tag', { allowDestructive: true });
    expect(h.registry.models.has('x_tag')).toBe(false);
    const t = await h.driver.query({ text: `SELECT 1 FROM information_schema.tables WHERE table_name = 'x_tag'`, params: [] });
    expect(t).toHaveLength(0);
  });

  it('isolates metadata per tenant', async () => {
    const h2 = await mgr.open('t2');
    expect(h2.registry.models.has('x_book')).toBe(false);
    expect(h2.registry.get('res.partner').fields.has('x_nickname')).toBe(false);
    expect(await columns(h2, 'res_partner')).not.toContain('x_nickname');
    expect(await MetadataStore.for(h2).list()).toEqual([]);
  });
});

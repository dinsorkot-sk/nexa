import { afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureMetadataTables } from '../src/metadata/store.js';
import { MetadataStore, PgliteTenantManager, applyMigration, ensureSecurityTables, planMigration, resolveModels, securityModels, syncSchema, writeModuleSecurity, type ModelDef } from '../src/index.js';

const definitions: ModelDef[] = [
  { name: 'x.item', origin: 'module', fields: {
    state: { type: 'selection', required: true, groups: ['private'], selection: [['draft', 'Draft'], ['done', 'Done']] },
    changed: { type: 'char', groups: ['private'], compute: () => ({}) },
    currency_id: { type: 'many2one', comodel: 'x.currency' }, fee: { type: 'monetary', currencyField: 'currency_id' }, wizard_id: { type: 'many2one', comodel: 'x.wizard' }, title: { type: 'char', translate: true }, required_title: { type: 'char', translate: true, required: true, default: 'Base' }, quantity: { type: 'float', digits: [8, 2] }, happened: { type: 'datetime' }, target: { type: 'reference', selection: [['x.target', 'Target']] },
  } },
  { name: 'x.item', origin: 'module', extends: ['x.item'], fields: {
    state: { type: 'selection', string: 'State', selectionAdd: [['done', 'Finished'], ['new', 'New']] },
    changed: { type: 'integer' },
  } },
  { name: 'x.target', origin: 'module', fields: { name: { type: 'char' } } },
  { name: 'x.wizard', origin: 'module', transient: true, fields: { name: { type: 'char' } } },
  { name: 'x.currency', origin: 'module', fields: { rounding: { type: 'float' } } },
  ...securityModels,
];
let manager: PgliteTenantManager | undefined;
afterAll(async () => manager?.closeAll());

const rootContext = (handle: import('../src/index.js').TenantHandle, lang: string) => handle.env({ uid: 1, context: { lang } });

describe('field model', () => {
  it('merges inherited attributes and extends selections without mutating the source', () => {
    const state = resolveModels(definitions).get('x.item')!.fields.get('state')!;
    expect(state).toMatchObject({ required: true, groups: ['private'], string: 'State', selection: [['draft', 'Draft'], ['done', 'Finished'], ['new', 'New']] });
    expect(resolveModels(definitions).get('x.item')!.fields.get('changed')).toMatchObject({ type: 'integer' });
    expect(resolveModels(definitions).get('x.item')!.fields.get('changed')).not.toHaveProperty('groups');
    expect(resolveModels(definitions).get('x.item')!.fields.get('changed')).not.toHaveProperty('compute');
    expect(definitions[0].fields.state.selection).toEqual([['draft', 'Draft'], ['done', 'Done']]);
    expect(() => resolveModels([{ name: 'x.bad', origin: 'module', fields: { x: { type: 'float', digits: [2, 3] } } }])).toThrow(/digits/);
  });

  it('reopens a tenant with legacy magic timestamps', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexa-fields-'));
    const opts = { rootDir: dir, models: async (): Promise<ModelDef[]> => [{ name: 'x.legacy', origin: 'module', fields: { name: { type: 'char' } } }] };
    const first = new PgliteTenantManager(opts);
    const second = new PgliteTenantManager(opts);
    try {
      const tenant = await first.open('legacy');
      await tenant.env({ uid: 1 }).model('x.legacy').create({ name: 'before' });
      await first.closeAll();
      const reopened = await second.open('legacy');
      expect(await reopened.env({ uid: 1 }).model('x.legacy').searchCount([])).toBe(1);
    } finally {
      await first.closeAll();
      await second.closeAll();
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('delegates parent fields atomically and enforces parent access', async () => {
    const defs: ModelDef[] = [
      ...securityModels,
      { name: 'x.parent', origin: 'module', fields: { name: { type: 'char', required: true }, code: { type: 'char' } } },
      { name: 'x.child', origin: 'module', delegates: { 'x.parent': 'parent_id' }, fields: {
        parent_id: { type: 'many2one', comodel: 'x.parent', required: true }, code: { type: 'char' }, required_local: { type: 'char', required: true },
      } },
    ];
    const m = new PgliteTenantManager({ models: async () => defs });
    try {
      const h = await m.open('delegation');
      const root = h.env({ uid: 1 });
      const parents = root.model('x.parent');
      const children = root.model('x.child');
      await expect(children.create({ name: 'Rolled back' })).rejects.toThrow(/required/);
      expect(await parents.searchCount([])).toBe(0);
      const child = await children.create({ name: 'Parent', code: 'Local', required_local: 'ok' });
      expect((await child.read(['name', 'code']))[0]).toMatchObject({ name: 'Parent', code: 'Local' });
      expect((await children.search([['name', '=', 'Parent']])).ids).toContain(child.ids[0]);
      await child.write({ name: 'Changed' });
      expect((await child.read(['name']))[0].name).toBe('Changed');
      const parentId = (await child.read(['parent_id']))[0].parent_id as number;
      await expect(children.create({ parent_id: parentId, name: 'Must roll back' })).rejects.toThrow(/required/);
      expect((await parents.browse(parentId).read(['name']))[0].name).toBe('Changed');
      const linked = await children.create({ parent_id: parentId, name: 'Shared', required_local: 'ok' });
      expect((await child.read(['name']))[0].name).toBe('Shared');
      await linked.unlink();
      await child.write({ name: 'Changed' });
      const company = await root.model('res.company').create({ name: 'Company' });
      const user = await root.model('res.users').create({ name: 'User', login: 'delegate-user', company_id: company.ids[0] });
      const perms = { read: true, create: true, write: true, unlink: true };
      await writeModuleSecurity(h.driver, 'delegation-test', [{ model: 'x.child', group: null, perms }], []);
      const userChild = h.env({ uid: user.ids[0] }).model('x.child');
      await expect(userChild.browse(child.ids[0]).read(['name'])).rejects.toThrow();
      await expect(userChild.search([['name', '=', 'Changed']])).rejects.toThrow();
      await expect(userChild.browse(child.ids[0]).write({ name: 'No' })).rejects.toThrow();
      await expect(userChild.create({ parent_id: parentId, required_local: 'ok' })).rejects.toThrow();
      await writeModuleSecurity(h.driver, 'delegation-test', [
        { model: 'x.child', group: null, perms }, { model: 'x.parent', group: null, perms },
      ], [{ name: 'visible-parent', model: 'x.parent', groups: [], perms, domain: [['name', '=', 'Visible']] }]);
      const restricted = h.env({ uid: user.ids[0] }).model('x.child');
      await expect(restricted.browse(child.ids[0]).read(['name'])).rejects.toThrow();
      expect((await restricted.search([['name', '=', 'Changed']])).ids).toEqual([]);
      await expect(restricted.create({ parent_id: parentId, required_local: 'ok' })).rejects.toThrow();
      await expect(parents.browse(parentId).unlink()).rejects.toThrow();
      expect((await child.read(['name']))[0].name).toBe('Changed');
      await child.unlink();
      expect((await parents.browse(parentId).read(['name']))[0].name).toBe('Changed');
      await h.driver.query({ text: 'ALTER TABLE x_child DROP CONSTRAINT x_child_parent_id_fkey', params: [] });
      await h.driver.query({ text: 'ALTER TABLE x_child ADD CONSTRAINT x_child_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES x_parent(id) ON DELETE SET NULL', params: [] });
      await expect(planMigration(h.registry, h.driver)).rejects.toThrow(/restricting foreign key/);
      await h.driver.query({ text: 'ALTER TABLE x_child DROP CONSTRAINT x_child_parent_id_fkey', params: [] });
      await h.driver.query({ text: 'ALTER TABLE x_parent ADD COLUMN alt INTEGER UNIQUE', params: [] });
      await h.driver.query({ text: 'ALTER TABLE x_child ADD CONSTRAINT x_child_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES x_parent(alt) ON DELETE RESTRICT', params: [] });
      await expect(planMigration(h.registry, h.driver)).rejects.toThrow(/restricting foreign key/);
      await h.driver.query({ text: 'ALTER TABLE x_child DROP CONSTRAINT x_child_parent_id_fkey', params: [] });
      await h.driver.query({ text: 'ALTER TABLE x_child ADD CONSTRAINT x_child_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES x_parent(id) ON DELETE RESTRICT NOT VALID', params: [] });
      await expect(planMigration(h.registry, h.driver)).rejects.toThrow(/restricting foreign key/);
    } finally { await m.closeAll(); }
  }, 60000);

  it('stores precision and timezones and detects precision migration', async () => {
    manager = new PgliteTenantManager({ models: async () => definitions });
    const h = await manager.open('fields');
    // Simulate a tenant created before field_options existed.
    await h.driver.query({ text: `ALTER TABLE nx_field DROP COLUMN field_options`, params: [] });
    await h.driver.query({ text: `INSERT INTO nx_field (model, name, ttype) VALUES ('x.item', 'x_legacy', 'char')`, params: [] });
    await ensureMetadataTables(h.driver);
    await ensureMetadataTables(h.driver);
    const metadata = MetadataStore.for(h);
    expect((await metadata.list()).find(d => d.name === 'x.item')!.fields.x_legacy.type).toBe('char');
    await expect(metadata.addField('x.item', 'x_bad', { type: 'float', digits: [2, 3] })).rejects.toThrow(/digits/);
    await expect(metadata.addField('x.item', 'x_bad', { type: 'char', translate: true, unique: true })).rejects.toThrow(/unique/);
    await expect(metadata.addField('x.item', 'x_bad', { type: 'integer', aggregator: 'bogus' as never })).rejects.toThrow(/aggregator/);
    await metadata.addField('x.item', 'x_cost', { type: 'float', digits: [7, 2], copy: false, aggregator: 'sum' });
    await metadata.addField('x.item', 'x_fee', { type: 'monetary', currencyField: 'currency_id' });
    expect((await metadata.list()).find(d => d.name === 'x.item')!.fields.x_fee.currencyField).toBe('currency_id');
    await metadata.addField('x.item', 'x_payload', { type: 'json' });
    await metadata.addField('x.item', 'x_label', { type: 'char', translate: true });
    expect((await metadata.list()).find(d => d.name === 'x.item')!.fields.x_label.translate).toBe(true);
    expect((await metadata.list()).find(d => d.name === 'x.item')!.fields.x_cost).toMatchObject({ digits: [7, 2], copy: false, aggregator: 'sum' });
    await h.registry.reload();
    expect(h.registry.get('x.item').fields.get('x_cost')).toMatchObject({ digits: [7, 2], copy: false, aggregator: 'sum' });
    const currency = await h.env({ uid: 1 }).model('x.currency').create([{ rounding: 0.05 }, { rounding: 0.01 }]);
    const target = await h.env({ uid: 1 }).model('x.target').create({ name: 'Referenced' });
    const items = h.env({ uid: 1 }).model('x.item');
    await expect(items.create({ state: 'new', target: 'x.target,99999' })).rejects.toThrow(/reference/);
    await expect(items.create({ state: 'new', target: 'x.item,1' })).rejects.toThrow(/reference/);
    const row = await items.create({ state: 'new', title: 'Hello', currency_id: currency.ids[0], fee: 1.025, target: `x.target,${target.ids[0]}`, quantity: 1.236, happened: '2026-11-24T12:00:00+07:00' });
    expect((await row.read(['fee']))[0].fee).toBe(1.05);
    await row.write({ fee: -1.025 });
    expect((await row.read(['fee']))[0].fee).toBe(-1.05);
    await row.write({ currency_id: currency.ids[1], fee: 1.025 });
    expect((await row.read(['fee']))[0].fee).toBe(1.03);
    await expect(row.write({ currency_id: null })).rejects.toThrow(/currency/);
    const batch = await items.create([{ state: 'new', currency_id: currency.ids[0], fee: 0 }, { state: 'new', currency_id: currency.ids[1], fee: 0 }]);
    await batch.write({ fee: 1.025 });
    expect((await batch.read(['fee'])).map(r => r.fee)).toEqual([1.05, 1.03]);
    const badCurrency = await h.env({ uid: 1 }).model('x.currency').create({ rounding: 0 });
    const invalid = await items.create({ state: 'new', currency_id: badCurrency.ids[0] });
    await expect(items.browse([...batch.ids, ...invalid.ids]).write({ fee: 2 })).rejects.toThrow(/rounding/);
    expect((await batch.read(['fee'])).map(r => r.fee)).toEqual([1.05, 1.03]);
    await batch.unlink();
    await invalid.unlink();
    const thai = rootContext(h, 'th_TH');
    await thai.model('x.item').browse(row.ids[0]).write({ title: 'สวัสดี' });
    expect((await thai.model('x.item').browse(row.ids[0]).read(['title']))[0].title).toBe('สวัสดี');
    await thai.model('x.item').browse(row.ids[0]).write({ title: null });
    expect((await thai.model('x.item').browse(row.ids[0]).read(['title']))[0].title).toBe('Hello');
    expect((await row.read(['title']))[0].title).toBe('Hello');
    await expect(thai.model('x.item').browse(row.ids[0]).write({ required_title: null })).rejects.toThrow(/required/);
    await thai.model('x.item').browse(row.ids[0]).write({ title: 'สวัสดี' });
    expect((await row.read(['title']))[0].title).toBe('Hello');
    expect((await thai.model('x.item').search([['title', '=', 'สวัสดี']])).ids).toContain(row.ids[0]);
    expect((await h.env({ uid: 1, context: { lang: 'fr_FR' } }).model('x.item').search([['title', '=', 'Hello']])).ids).toContain(row.ids[0]);
    const second = await items.create({ state: 'new', title: 'World' });
    expect((await items.search([], { order: 'title desc' })).ids.slice(0, 2)).toEqual([second.ids[0], row.ids[0]]);
    await expect(h.env({ uid: 1, context: { lang: "en'); DROP TABLE x_item;--" } }).model('x.item').search([], { order: 'title' })).rejects.toThrow(/language/);
    expect((await row.read(['quantity', 'target']))[0]).toMatchObject({ quantity: 1.24, target: `x.target,${target.ids[0]}` });
    await expect(row.write({ target: 'x.target,99999' })).rejects.toThrow(/reference/);
    await ensureSecurityTables(h.driver);
    const root = h.env({ uid: 1 });
    const company = await root.model('res.company').create({ name: 'Company' });
    const user = await root.model('res.users').create({ name: 'User', login: 'ref-user', company_id: company.ids[0] });
    const perms = { read: true, create: true, write: true, unlink: true };
    await writeModuleSecurity(h.driver, 'ref-test', [
      { model: 'x.item', group: null, perms }, { model: 'x.target', group: null, perms }, { model: 'x.wizard', group: null, perms },
    ], [
      { name: 'hidden-target', model: 'x.target', groups: [], perms, domain: [['name', '=', 'Visible']] },
      { name: 'translated-rule', model: 'x.item', groups: [], perms, domain: [['title', '=', 'Hello']] },
    ]);
    const asUser = h.env({ uid: user.ids[0] });
    expect((await asUser.model('x.item').search([])).ids).toContain(row.ids[0]);
    expect((await asUser.withContext({ lang: 'th_TH' }).model('x.item').search([])).ids).toContain(row.ids[0]);
    expect((await asUser.withContext({ lang: 'th_TH' }).model('x.item').browse(row.ids[0]).read(['title']))[0].title).toBe('สวัสดี');
    await asUser.withContext({ lang: 'th_TH' }).model('x.item').browse(row.ids[0]).write({ title: 'ไทย' });
    expect((await asUser.model('x.item').search([])).ids).toContain(row.ids[0]);
    await expect(asUser.model('x.item').browse(row.ids[0]).write({ fee: 3 })).rejects.toThrow();
    expect((await row.read(['fee']))[0].fee).toBe(1.03);
    await expect(asUser.model('x.item').browse(row.ids[0]).write({ target: `x.target,${target.ids[0]}` })).rejects.toThrow(/reference/);
    const other = await root.model('res.users').create({ name: 'Other', login: 'other-user', company_id: company.ids[0] });
    const mine = await asUser.model('x.wizard').create({ name: 'Mine' });
    const theirs = await h.env({ uid: other.ids[0] }).model('x.wizard').create({ name: 'Theirs' });
    expect((await asUser.model('x.wizard').search([])).ids).toEqual([...mine.ids]);
    await expect(asUser.model('x.wizard').browse(theirs.ids[0]).read()).rejects.toThrow(/another user/);
    await expect(asUser.model('x.wizard').browse(theirs.ids[0]).write({ name: 'No' })).rejects.toThrow(/another user/);
    await expect(asUser.model('x.wizard').browse(theirs.ids[0]).unlink()).rejects.toThrow(/another user/);
    await row.write({ wizard_id: theirs.ids[0] });
    expect((await asUser.model('x.item').search([['wizard_id.name', '=', 'Theirs']])).ids).not.toContain(row.ids[0]);
    await expect(asUser.model('x.wizard').vacuum(new Date())).rejects.toThrow(/superuser/);
    await h.driver.query({ text: `UPDATE x_wizard SET write_date = '2020-01-01' WHERE id = $1`, params: [theirs.ids[0]] });
    expect(await root.model('x.wizard').vacuum(new Date('2021-01-01T00:00:00Z'))).toBe(1);
    expect((await root.model('x.wizard').search([])).ids).toEqual([...mine.ids]);
    expect((await row.read(['target']))[0].target).toBe(`x.target,${target.ids[0]}`);
    const cols = await h.driver.query<{ column_name: string; data_type: string; numeric_precision: number; numeric_scale: number }>({ text: `SELECT column_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = 'x_item'`, params: [] });
    expect(cols.find(c => c.column_name === 'quantity')).toMatchObject({ data_type: 'numeric', numeric_precision: 8, numeric_scale: 2 });
    expect(cols.find(c => c.column_name === 'happened')?.data_type).toBe('timestamp with time zone');
    expect(cols.find(c => c.column_name === 'create_date')?.data_type).toBe('timestamp with time zone');
    expect(cols.find(c => c.column_name === 'write_date')?.data_type).toBe('timestamp with time zone');
    expect((await planMigration(h.registry, h.driver)).ops.filter(o => o.kind === 'alter_type')).toEqual([]);
    const updated = resolveModels([{ ...definitions[0], fields: { ...definitions[0].fields, quantity: { type: 'float', digits: [9, 3] } } }, definitions[1], ...definitions.slice(2)]);
    expect((await planMigration(updated, h.driver)).ops).toContainEqual(expect.objectContaining({ kind: 'alter_type', column: 'quantity', to: 'NUMERIC(9,3)', destructive: true }));
    const noDigits = resolveModels([{ ...definitions[0], fields: { ...definitions[0].fields, quantity: { type: 'float' } } }, definitions[1], ...definitions.slice(2)]);
    expect((await planMigration(noDigits, h.driver)).ops).toContainEqual(expect.objectContaining({ kind: 'alter_type', column: 'quantity', to: 'DOUBLE PRECISION', destructive: true }));

    await h.driver.query({ text: `ALTER TABLE x_item ALTER COLUMN title TYPE TEXT USING title->>'en_US'`, params: [] });
    await expect(syncSchema(h.registry, h.driver)).rejects.toThrow(/explicitly approved migration/);
    const translationPlan = await planMigration(h.registry, h.driver);
    const translationOps = translationPlan.ops.filter(o => o.kind === 'alter_type' && o.column === 'title');
    expect(translationOps).toHaveLength(1);
    await applyMigration({ ...translationPlan, ops: translationOps }, h.driver, { allowDestructive: true });
    expect((await h.driver.query<{ title: { en_US: string } }>({ text: 'SELECT title FROM x_item WHERE id = $1', params: [row.ids[0]] }))[0].title).toEqual({ en_US: 'Hello' });
    const untranslated = resolveModels([{ ...definitions[0], fields: { ...definitions[0].fields, title: { type: 'char' } } }, definitions[1], ...definitions.slice(2)]);
    const ambiguous = await planMigration(untranslated, h.driver);
    const ambiguousOps = ambiguous.ops.filter(o => o.kind === 'alter_type' && o.column === 'title');
    await expect(applyMigration({ ...ambiguous, ops: ambiguousOps }, h.driver, { allowDestructive: true })).rejects.toThrow(/classification/);
    await expect(syncSchema(untranslated, h.driver)).rejects.toThrow(/explicitly approved migration/);
    const reversePlan = await planMigration(untranslated, h.driver, { translatedFrom: ['x_item.title'] });
    const reverseOps = reversePlan.ops.filter(o => o.kind === 'alter_type' && o.column === 'title');
    await h.driver.query({ text: `UPDATE x_item SET title = '{"th_TH":"Thai"}'::jsonb WHERE id = $1`, params: [row.ids[0]] });
    await expect(applyMigration({ ...reversePlan, ops: reverseOps }, h.driver, { allowDestructive: true })).rejects.toThrow(/en_US/);
    await h.driver.query({ text: `UPDATE x_item SET title = '{"en_US":"Hello"}'::jsonb WHERE id = $1`, params: [row.ids[0]] });
    await applyMigration({ ...reversePlan, ops: reverseOps }, h.driver, { allowDestructive: true });
    expect((await h.driver.query<{ title: string }>({ text: 'SELECT title FROM x_item WHERE id = $1', params: [row.ids[0]] }))[0].title).toBe('Hello');
    await h.driver.query({ text: `UPDATE x_item SET x_payload = '{"a":1}'::jsonb WHERE id = $1`, params: [row.ids[0]] });
    const generic = resolveModels([{ ...definitions[0], fields: { ...definitions[0].fields, title: { type: 'char' }, x_payload: { type: 'char' } } }, definitions[1], ...definitions.slice(2)]);
    const genericPlan = await planMigration(generic, h.driver, { jsonFrom: ['x_item.x_payload'] });
    await applyMigration({ ...genericPlan, ops: genericPlan.ops.filter(o => o.kind === 'alter_type' && o.column === 'x_payload') }, h.driver, { allowDestructive: true });
    expect(JSON.parse((await h.driver.query<{ x_payload: string }>({ text: 'SELECT x_payload FROM x_item WHERE id = $1', params: [row.ids[0]] }))[0].x_payload)).toEqual({ a: 1 });

    await h.driver.query({ text: `ALTER TABLE x_item ALTER COLUMN happened TYPE TIMESTAMP WITHOUT TIME ZONE USING happened AT TIME ZONE 'UTC'`, params: [] });
    await h.driver.query({ text: `SET TIME ZONE 'Asia/Bangkok'`, params: [] });
    const migration = await planMigration(h.registry, h.driver);
    const timestampOps = migration.ops.filter(o => o.kind === 'alter_type' && o.column === 'happened');
    expect(timestampOps).toEqual([expect.objectContaining({ destructive: false })]);
    // naive -> timestamptz is lossless (UTC wall clock): applied without allowDestructive
    await applyMigration({ ...migration, ops: timestampOps }, h.driver);
    const instant = await h.driver.query<{ instant: string }>({ text: `SELECT to_char(happened AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS instant FROM x_item WHERE id = $1`, params: [row.ids[0]] });
    expect(instant[0].instant).toBe('2026-11-24 05:00:00');
  }, 60000);
});

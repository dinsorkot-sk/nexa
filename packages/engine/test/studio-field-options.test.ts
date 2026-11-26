import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessError, MetadataStore, ModuleCatalog, PgliteTenantManager, ValidationError, baseModule,
  type Env, type FieldDef, type TenantHandle,
} from '../src/index.js';

let manager: PgliteTenantManager;
let h: TenantHandle;
let root: Env;
let alice: Env;
let store: MetadataStore;
let companyA: number;
let companyB: number;

const ref = async (xmlId: string): Promise<number> => {
  const [mod, name] = xmlId.split('.');
  const [row] = await h.driver.query<{ res_id: number }>({ text: 'SELECT res_id FROM nx_model_data WHERE module = $1 AND name = $2', params: [mod, name] });
  return Number(row!.res_id);
};
const stored = async (model: string): Promise<Record<string, FieldDef>> =>
  (await store.list()).find((m) => m.name === model)!.fields;
const rejects = (model: string, name: string, def: FieldDef) => expect(store.addField(model, name, def)).rejects.toBeInstanceOf(ValidationError);

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule]) });
  h = await manager.create('studioopts', ['base']);
  root = h.env({ uid: 1 });
  store = MetadataStore.for(h);
  companyA = await ref('base.main_company');
  [companyB] = (await root.model('res.company').create({ name: 'Other Co' })).ids as [number];
  const user = await ref('base.group_user');
  const [aliceUid] = (await root.model('res.users').create({ name: 'Alice', login: 'alice', company_id: companyA, company_ids: [companyA], group_ids: [user] })).ids;
  alice = h.env({ uid: aliceUid! });
  const open = async (tx: { query: (q: { text: string; params: unknown[] }) => Promise<unknown> }, name: string) => {
    await tx.query({
      text: `INSERT INTO nx_access (module, model, group_code, perm_read, perm_write, perm_create, perm_unlink) VALUES ('studio', $1, 'base.group_user', true, true, true, true)`,
      params: [name],
    });
  };
  await store.createModel({ name: 'x_order', fields: { x_name: { type: 'char' } } }, (tx) => open(tx, 'x_order'));
  await store.createModel({
    name: 'x_line',
    fields: { x_order_id: { type: 'many2one', comodel: 'x_order', ondelete: 'cascade' }, x_name: { type: 'char' } },
  }, (tx) => open(tx, 'x_line'));
}, 120_000);

afterAll(async () => {
  await manager?.close?.();
});

describe('Studio field options', () => {
  it('persists every option and reapplies it from metadata', async () => {
    await store.addField('x_order', 'x_note', { type: 'char', default: 'hello', readonly: true, index: true, help: 'A note' });
    await store.addField('x_order', 'x_qty', { type: 'integer', default: 7, ratchet: 'up' });
    await store.addField('x_order', 'x_secret', { type: 'char', writeGroups: ['base.group_system'] });
    await store.addField('x_order', 'x_partner_id', { type: 'many2one', comodel: 'res.partner', checkCompany: true, ondelete: 'restrict' });
    const fields = await stored('x_order');
    expect(fields.x_note).toMatchObject({ default: 'hello', readonly: true, index: true, help: 'A note' });
    expect(fields.x_qty).toMatchObject({ default: 7, ratchet: 'up' });
    expect(fields.x_secret?.writeGroups).toEqual(['base.group_system']);
    expect(fields.x_partner_id).toMatchObject({ checkCompany: true, ondelete: 'restrict' });
    // the live registry (rebuilt from the same rows) carries them too
    const models = await h.registry.build();
    const live = models.get('x_order')!.fields;
    expect(live.get('x_qty')).toMatchObject({ ratchet: 'up', default: 7 });
    expect(live.get('x_partner_id')).toMatchObject({ checkCompany: true, ondelete: 'restrict' });
    expect(live.get('x_secret')?.writeGroups).toEqual(['base.group_system']);
  });

  it('applies the literal default on create', async () => {
    const [id] = (await root.model('x_order').create({ x_name: 'd' })).ids;
    const [row] = await root.model('x_order').browse(id!).read(['x_note', 'x_qty']);
    expect(row).toMatchObject({ x_note: 'hello', x_qty: 7 });
  });

  it('creates the index and the FK action in the schema', async () => {
    const idx = await h.driver.query({ text: `SELECT 1 FROM pg_indexes WHERE tablename = 'x_order' AND indexname LIKE '%x_note%'`, params: [] });
    expect(idx.length).toBe(1);
    const fk = await h.driver.query<{ a: string }>({
      text: `SELECT c.confdeltype AS a FROM pg_constraint c JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.conrelid = 'x_line'::regclass AND att.attname = 'x_order_id'`, params: [],
    });
    expect(fk[0]?.a).toBe('c');
  });

  it('cascades x_lines when the parent is deleted', async () => {
    const [order] = (await root.model('x_order').create({ x_name: 'p' })).ids;
    await root.model('x_line').create([{ x_order_id: order, x_name: 'a' }, { x_order_id: order, x_name: 'b' }]);
    await root.model('x_order').browse(order!).unlink();
    expect(await root.model('x_line').searchCount([['x_order_id', '=', order]])).toBe(0);
  });

  it('writeGroups blocks writers outside the group', async () => {
    const [id] = (await alice.model('x_order').create({ x_name: 'w' })).ids;
    await expect(alice.model('x_order').browse(id!).write({ x_secret: 's' })).rejects.toBeInstanceOf(AccessError);
    await root.model('x_order').browse(id!).write({ x_secret: 's' });
  });

  it('checkCompany rejects a many2one into another company', async () => {
    const [own] = (await root.model('res.partner').create({ name: 'Own', company_id: companyA })).ids;
    const [foreign] = (await root.model('res.partner').create({ name: 'Foreign', company_id: companyB })).ids;
    // bob may access both companies but works in company A (res.partner record rules also guard this path)
    const user = await ref('base.group_user');
    const [bobUid] = (await root.model('res.users').create({ name: 'Bob', login: 'bob', company_id: companyA, company_ids: [companyA, companyB], group_ids: [user] })).ids;
    const bob = h.env({ uid: bobUid! });
    await bob.model('x_order').create({ x_name: 'ok', x_partner_id: own });
    await expect(bob.model('x_order').create({ x_name: 'bad', x_partner_id: foreign })).rejects.toThrow(/another company|Record rules forbid/);
  });

  it('allows cascade only on custom owners, and writeGroups on required fields only with a default', async () => {
    await rejects('res.partner', 'x_casc_id', { type: 'many2one', comodel: 'x_order', ondelete: 'cascade' });
    await store.addField('res.partner', 'x_restrict_id', { type: 'many2one', comodel: 'x_order', ondelete: 'restrict' });
    await store.addField('res.partner', 'x_setnull_id', { type: 'many2one', comodel: 'x_order', ondelete: 'set null' });
    await rejects('x_order', 'x_req_locked', { type: 'char', required: true, writeGroups: ['base.group_system'] });
    await store.addField('x_order', 'x_req_locked_ok', { type: 'char', required: true, default: 'z', writeGroups: ['base.group_system'] });
  });

  it('rejects invalid combinations', async () => {
    await rejects('x_order', 'x_bad1', { type: 'char', ratchet: 'up' });
    await rejects('x_order', 'x_bad2', { type: 'integer', ratchet: 'down' as 'up' });
    await rejects('x_order', 'x_bad3', { type: 'char', ondelete: 'cascade' });
    await rejects('x_order', 'x_bad4', { type: 'many2one', comodel: 'res.partner', ondelete: 'nuke' as 'cascade' });
    await rejects('x_order', 'x_bad5', { type: 'char', checkCompany: true });
    await rejects('x_order', 'x_bad6', { type: 'char', writeGroups: ['no.such_group'] });
    await rejects('x_order', 'x_bad7', { type: 'integer', default: 'abc' });
    await rejects('x_order', 'x_bad8', { type: 'date', default: 'yesterday' });
    await rejects('x_order', 'x_bad9', { type: 'many2one', comodel: 'res.partner', default: 1 });
    await rejects('x_order', 'x_bad10', { type: 'char', index: 'yes' as unknown as boolean });
    await rejects('x_order', 'x_bad11', { type: 'selection', selection: [['a', 'A']], default: 'z' });
    expect((await stored('x_order')).x_bad1).toBeUndefined();
  });
});

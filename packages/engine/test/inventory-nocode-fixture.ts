import { MetadataStore, type Env, type FieldDef, type TenantHandle } from '../src/index.js';

/**
 * Test-only Studio configuration for inventory. No ModelDef, hook, method or script is installed:
 * everything is x_ metadata, ir.lifecycle, ir.transition (with `balance` effects) and buttons.
 */
export async function installInventoryProof(h: TenantHandle, admin: Env): Promise<void> {
  const store = MetadataStore.for(h);
  const userGroup = (await admin.model('res.groups').searchRead([['code', '=', 'base.group_user']], ['id']))[0]!.id;
  const model = async (name: string, fields: Record<string, FieldDef>) => {
    await store.createModel({ name, fields });
    await admin.model('ir.model.access').create({ name: `${name} users`, model_name: name, group_id: userGroup, perm_read: true, perm_write: true, perm_create: true, perm_unlink: true });
  };
  const states: [string, string][] = [['draft', 'Draft'], ['confirmed', 'Confirmed'], ['assigned', 'Reserved'], ['done', 'Done'], ['cancel', 'Cancelled']];
  await model('x_stock_location', {
    x_name: { type: 'char', required: true },
    x_usage: { type: 'selection', selection: [['internal', 'Internal'], ['supplier', 'Supplier'], ['customer', 'Customer'], ['inventory', 'Inventory loss']], default: 'internal' },
    x_allow_negative: { type: 'boolean', default: false },
  });
  await model('x_stock_product', { x_name: { type: 'char', required: true } });
  await model('x_stock_picking', { x_name: { type: 'char' }, x_state: { type: 'selection', selection: states, default: 'draft' } });
  await model('x_stock_move', {
    x_picking_id: { type: 'many2one', comodel: 'x_stock_picking', required: true, ondelete: 'cascade' },
    x_product_id: { type: 'many2one', comodel: 'x_stock_product', required: true },
    x_src_id: { type: 'many2one', comodel: 'x_stock_location', required: true },
    x_dest_id: { type: 'many2one', comodel: 'x_stock_location', required: true },
    x_qty: { type: 'float', required: true },
    x_reserved_qty: { type: 'float', default: 0 },
    x_state: { type: 'selection', selection: states, default: 'draft' },
  });
  await store.addField('x_stock_picking', 'x_move_ids', { type: 'one2many', comodel: 'x_stock_move', inverseName: 'x_picking_id' });
  await model('x_stock_quant', {
    x_product_id: { type: 'many2one', comodel: 'x_stock_product', required: true, ondelete: 'restrict' },
    x_location_id: { type: 'many2one', comodel: 'x_stock_location', required: true, ondelete: 'restrict' },
    x_quantity: { type: 'float', default: 0 },
    x_reserved: { type: 'float', default: 0 },
    x_key: { type: 'char', unique: true, computeExpr: "x_product_id + ':' + x_location_id", store: true },
    // Negative stock is decided per location: only internal locations without the flag are blocked.
    x_negative_ok: { type: 'boolean', computeExpr: "x_location_id.x_usage != 'internal' || x_location_id.x_allow_negative", store: true },
  });
  await admin.model('ir.lifecycle').create({ model: 'x_stock_quant', engine_fields: ['x_quantity', 'x_reserved'] });
  await admin.model('ir.lifecycle').create({
    model: 'x_stock_picking', state_field: 'x_state', initial_state: 'draft',
    locks: [{ states: ['done', 'cancel'], writable: [], unlink: false, frozen_children: ['x_move_ids'] }],
  });
  await admin.model('ir.lifecycle').create({
    model: 'x_stock_move', state_field: 'x_state', initial_state: 'draft', engine_fields: ['x_reserved_qty'],
    locks: [{ states: ['done', 'cancel'], writable: [], unlink: false }],
  });

  const key = (loc: string) => ({ x_product_id: 'line.x_product_id', x_location_id: loc });
  const internalSrc = "line.x_src_id.x_usage == 'internal'";
  const NEG = { expr: 'balance.x_quantity >= 0 || balance.x_negative_ok', message: 'Negative stock is not allowed at this location' };
  const move = { type: 'child_set', field: 'x_move_ids' };
  const tr = (k: string, from: string[], to: string, extra: Record<string, unknown>) =>
    admin.model('ir.transition').create({ model: 'x_stock_picking', key: k, from, to, ...extra });
  await tr('confirm', ['draft'], 'confirmed', { effects: [{ ...move, values: { x_state: "'confirmed'" } }] });
  // Partial reservation: reserve what is free, never more than still needed; the amount lands on the move.
  const want = '[[line.x_qty - line.x_reserved_qty, balance.x_quantity - balance.x_reserved].min(), 0].max()';
  await tr('reserve', ['confirmed', 'assigned'], 'assigned', { effects: [
    { type: 'balance', from: 'x_move_ids', target: 'x_stock_quant',
      entries: [{ key: key('line.x_src_id'), deltas: { x_reserved: want }, when: internalSrc }],
      into: { x_reserved_qty: `line.x_reserved_qty + ${want}` },
      checks: [{ expr: 'balance.x_reserved <= balance.x_quantity || balance.x_negative_ok', message: 'Cannot reserve more than on hand' }] },
    { ...move, values: { x_state: "'assigned'" } },
  ] });
  await tr('validate', ['draft', 'confirmed', 'assigned'], 'done', { already: 'skip', effects: [
    { type: 'balance', from: 'x_move_ids', target: 'x_stock_quant', entries: [
      { key: key('line.x_src_id'), deltas: { x_quantity: '-line.x_qty', x_reserved: '-line.x_reserved_qty' } },
      { key: key('line.x_dest_id'), deltas: { x_quantity: 'line.x_qty' } },
    ], checks: [NEG] },
    { ...move, values: { x_state: "'done'" } },
  ] });
  await tr('cancel', ['draft', 'confirmed', 'assigned'], 'cancel', { effects: [
    { type: 'balance', from: 'x_move_ids', target: 'x_stock_quant',
      entries: [{ key: key('line.x_src_id'), deltas: { x_reserved: '-line.x_reserved_qty' }, when: internalSrc }],
      into: { x_reserved_qty: '0' } },
    { ...move, values: { x_state: "'cancel'" } },
  ] });
  const action = async (k: string, transition: string) => {
    await admin.model('ir.actions.server').create({ key: k, model_name: 'x_stock_picking', type: 'transition', transition });
    await admin.model('ir.button').create({ model_name: 'x_stock_picking', action: k });
  };
  for (const t of ['confirm', 'reserve', 'validate', 'cancel']) await action(`stock.${t}`, t);
}

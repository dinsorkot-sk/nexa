import type { ModuleManifest, Recordset } from '../contracts/index.js';

const userAccess = { read: true, write: true, create: true, unlink: false };

const lineSubtotal = async (records: Recordset) => new Map(
  (await records.read(['quantity', 'unit_price'])).map((line) => [
    line.id as number,
    (line.quantity as number) * (line.unit_price as number),
  ]),
);

const orderTotal = async (records: Recordset) => {
  const totals = new Map<number, number>();
  for (const order of await records.read(['line_ids'])) {
    const lines = await records.env.model('sale.order.line').browse(order.line_ids as number[]).read(['subtotal']);
    totals.set(order.id as number, lines.reduce((sum, line) => sum + (line.subtotal as number), 0));
  }
  return totals;
};

/** End-to-end sales example built on contacts and the generic model API. */
export const salesLiteModule: ModuleManifest = {
  name: 'sales_lite',
  version: '1.0.0',
  summary: 'Simple quotations and sales orders',
  depends: ['contacts'],
  models: [
    {
      name: 'sale.order',
      description: 'Quotations and sales orders',
      origin: 'module',
      module: 'sales_lite',
      order: 'date_order desc',
      fields: {
        name: { type: 'char', string: 'Order Reference', required: true, index: true },
        partner_id: { type: 'many2one', string: 'Customer', comodel: 'res.partner', required: true, ondelete: 'restrict' },
        line_ids: { type: 'one2many', string: 'Order Lines', comodel: 'sale.order.line', inverseName: 'order_id' },
        date_order: { type: 'datetime', string: 'Order Date', default: () => new Date().toISOString() },
        state: { type: 'selection', string: 'Status', selection: [['draft', 'Quotation'], ['sent', 'Quotation Sent'], ['sale', 'Sales Order'], ['cancel', 'Cancelled']], default: 'draft', index: true },
        amount_total: { type: 'monetary', string: 'Total', readonly: true, store: true, depends: ['line_ids.subtotal'], compute: orderTotal },
        note: { type: 'text', string: 'Notes' },
      },
    },
    {
      name: 'sale.order.line',
      description: 'Products on a quotation or sales order',
      origin: 'module',
      module: 'sales_lite',
      fields: {
        order_id: { type: 'many2one', string: 'Order', comodel: 'sale.order', required: true, ondelete: 'cascade', index: true },
        name: { type: 'char', string: 'Description', required: true },
        quantity: { type: 'float', string: 'Quantity', default: 1 },
        unit_price: { type: 'monetary', string: 'Unit Price', default: 0 },
        subtotal: { type: 'monetary', string: 'Subtotal', readonly: true, store: true, depends: ['quantity', 'unit_price'], compute: lineSubtotal },
      },
    },
  ],
  access: [
    { model: 'sale.order', group: 'base.group_user', perms: userAccess },
    { model: 'sale.order.line', group: 'base.group_user', perms: userAccess },
  ],
  data: [
    { xmlId: 'order_demo', model: 'sale.order', noUpdate: true, values: { name: 'SO0001', partner_id: { ref: 'contacts.contact_nexa' }, state: 'sale', note: 'Implementation services' } },
    { xmlId: 'line_demo', model: 'sale.order.line', noUpdate: true, values: { order_id: { ref: 'order_demo' }, name: 'ERP implementation package', quantity: 1, unit_price: 125000 } },
  ],
  actions: [{ xmlId: 'action_orders', type: 'window', name: 'Quotations and Orders', model: 'sale.order', viewTypes: ['list', 'form'] }],
  menus: [{ xmlId: 'menu_sales', name: 'Sales', sequence: 30, action: 'action_orders' }],
  views: [
    { xmlId: 'view_orders_list', model: 'sale.order', type: 'list', arch: { tag: 'list', children: [
      { tag: 'field', attrs: { name: 'name' } }, { tag: 'field', attrs: { name: 'partner_id' } },
      { tag: 'field', attrs: { name: 'date_order' } }, { tag: 'field', attrs: { name: 'state' } }, { tag: 'field', attrs: { name: 'amount_total' } },
    ] } },
    { xmlId: 'view_orders_form', model: 'sale.order', type: 'form', arch: { tag: 'form', children: [
      { tag: 'header', children: [{ tag: 'field', attrs: { name: 'state', widget: 'statusbar' } }] },
      { tag: 'sheet', children: [
        { tag: 'group', children: [{ tag: 'field', attrs: { name: 'name' } }, { tag: 'field', attrs: { name: 'partner_id' } }, { tag: 'field', attrs: { name: 'date_order' } }] },
        { tag: 'group', children: [{ tag: 'field', attrs: { name: 'amount_total' } }, { tag: 'field', attrs: { name: 'note' } }] },
        { tag: 'group', attrs: { string: 'Order Lines' }, children: [{ tag: 'field', attrs: { name: 'line_ids' } }] },
      ] },
    ] } },
    { xmlId: 'view_order_lines_list', model: 'sale.order.line', type: 'list', arch: { tag: 'list', children: [
      { tag: 'field', attrs: { name: 'name' } }, { tag: 'field', attrs: { name: 'quantity' } },
      { tag: 'field', attrs: { name: 'unit_price' } }, { tag: 'field', attrs: { name: 'subtotal' } },
    ] } },
  ],
};

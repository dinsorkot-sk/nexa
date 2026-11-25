import { ValidationError, type Env, type ModuleManifest, type ModelDef, type Recordset } from '../contracts/index.js';
import { roundMonetary } from '../orm/decimal.js';

async function validateUnits(records: Recordset): Promise<void> {
  for (const row of await records.read(['factor', 'rounding'])) {
    const factor = Number(row.factor);
    const rounding = Number(row.rounding);
    if (!Number.isFinite(factor) || factor <= 0) throw new ValidationError('Unit factor must be a positive finite number');
    if (!Number.isFinite(rounding) || rounding <= 0) throw new ValidationError('Unit rounding must be a positive finite number');
  }
}

export const uomModels: ModelDef[] = [
  {
    name: 'uom.category', origin: 'module', module: 'uom', order: 'name asc', description: 'Unit of Measure Category',
    fields: {
      name: { type: 'char', required: true },
      unit_ids: { type: 'one2many', comodel: 'uom.uom', inverseName: 'category_id' },
    },
  },
  {
    name: 'uom.uom', origin: 'module', module: 'uom', order: 'category_id asc, name asc', description: 'Unit of Measure',
    fields: {
      name: { type: 'char', required: true },
      category_id: { type: 'many2one', comodel: 'uom.category', required: true, ondelete: 'cascade', index: true },
      factor: { type: 'float', required: true, default: 1, help: 'Units of reference per unit' },
      rounding: { type: 'float', required: true, default: 0.01 },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'uom_uom_valid', check: validateUnits, fields: ['factor', 'rounding'] }],
    methods: {
      convert_quantity(records, quantity, toId, round = true) {
        if (records.ids.length !== 1 || typeof quantity !== 'number' || typeof toId !== 'number' || typeof round !== 'boolean') {
          throw new ValidationError('Conversion requires one source unit, a quantity and a destination unit');
        }
        return convertQuantity(records.env, quantity, records.ids[0]!, toId, { round });
      },
    },
  },
];

export const uomAccess = [
  ...['uom.category', 'uom.uom'].flatMap((model) => [
    { model, group: 'base.group_user', perms: { read: true, write: false, create: false, unlink: false } },
    { model, group: 'base.group_system', perms: { read: true, write: true, create: true, unlink: true } },
  ]),
];

export const uomModule: ModuleManifest = {
  name: 'uom', version: '1.0.0', summary: 'Units of measure and quantity conversion', depends: ['base'],
  models: uomModels, access: uomAccess,
};

/** Convert a quantity using the units' reference factors; round to the destination increment by default. */
export async function convertQuantity(
  env: Env, quantity: number, fromId: number, toId: number, opts: { round?: boolean } = {},
): Promise<number> {
  if (!Number.isFinite(quantity)) throw new ValidationError('Quantity must be a finite number');
  if (![fromId, toId].every((id) => Number.isSafeInteger(id) && id > 0)) throw new ValidationError('Unit ids must be positive integers');
  const Unit = env.model('uom.uom');
  const [from, to] = await Promise.all([
    Unit.browse(fromId).read(['category_id', 'factor', 'active']),
    Unit.browse(toId).read(['category_id', 'factor', 'rounding', 'active']),
  ]);
  if (!from[0] || !to[0]) throw new ValidationError('Unit of measure not found');
  if (!from[0].active || !to[0].active) throw new ValidationError('Cannot convert using an inactive unit');
  if (from[0].category_id !== to[0].category_id) throw new ValidationError('Cannot convert units from different categories');
  const value = quantity * Number(from[0].factor) / Number(to[0].factor);
  if (!Number.isFinite(value)) throw new ValidationError('Converted quantity must be finite');
  if (opts.round === false) return value;
  const increment = Number(to[0].rounding);
  return roundMonetary(value, increment);
}

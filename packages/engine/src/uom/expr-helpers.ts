import { ValidationError, type Env } from '../contracts/index.js';
import type { ExprValue } from '../expr/index.js';
import type { EnvImpl } from '../orm/env.js';
import { registerExpressionHelper } from '../orm/expr-helpers.js';
import { convertQuantity } from './manifest.js';

function unitId(value: ExprValue | undefined, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new ValidationError(`${what} must be a unit of measure id`);
  return value;
}

/** Shared by the uom helpers: the module may be absent from a tenant even though the code is loaded. */
export function requireModels(env: Env, models: readonly string[], helper: string): void {
  for (const model of models) {
    if (!(env as EnvImpl).registry.models.has(model)) throw new ValidationError(`Expression helper '${helper}' requires the '${model}' model`);
  }
}

/**
 * NX-Expr `uom_convert(qty, from_uom, to_uom)`: Odoo `uom._compute_quantity`, rounded to the target
 * unit's rounding. Reads the units with the caller's access (impure: reads tenant data).
 */
registerExpressionHelper('uom_convert', {
  resolve: async (env, [qty, from, to]) => {
    requireModels(env, ['uom.uom'], 'uom_convert');
    const quantity = qty === null || qty === undefined ? 0 : qty;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) throw new ValidationError('uom_convert quantity must be a finite number');
    return convertQuantity(env, quantity, unitId(from, 'Source unit'), unitId(to, 'Target unit'));
  },
});

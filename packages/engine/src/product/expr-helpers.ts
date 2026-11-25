import { computeTaxes } from '../account-core/tax.js';
import { ValidationError, type Env } from '../contracts/index.js';
import type { ExprValue } from '../expr/index.js';
import type { EnvImpl } from '../orm/env.js';
import { registerExpressionHelper } from '../orm/expr-helpers.js';
import { userSecurity } from '../security/access.js';
import { requireModels } from '../uom/expr-helpers.js';
import { convertQuantity } from '../uom/manifest.js';
import { quoteProduct } from './index.js';

/**
 * NX-Expr access to the T30 pricing and tax primitives. Every helper runs with the CALLER's env
 * (ACL + record rules on pricelists, products, units, taxes and currencies; nothing is sudo), reads
 * tenant data and is therefore impure (rejected in stored computes). Each call is bounded by the
 * primitive's own limits (one product, at most 100 taxes) and by the expression helper call quota.
 */

function optionalId(value: ExprValue | undefined, what: string): number | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new ValidationError(`${what} must be a record id`);
  return value;
}
function requiredId(value: ExprValue | undefined, what: string): number {
  const id = optionalId(value, what);
  if (id === undefined) throw new ValidationError(`${what} is required`);
  return id;
}
function quantity(value: ExprValue | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError('Quantity must be a finite number');
  return value;
}

/** The caller's current company currency (read with the caller's access). */
async function companyCurrency(env: Env): Promise<number> {
  const companyId = (env as EnvImpl).companyIds?.[0] ?? (await userSecurity(env as EnvImpl)).companyId;
  if (!companyId) throw new ValidationError('No current company to select the currency');
  const [company] = await env.model('res.company').browse(companyId).read(['currency_id']);
  if (typeof company?.currency_id !== 'number') throw new ValidationError('The current company has no currency');
  return company.currency_id;
}

/**
 * `pricelist_price(pricelist_id, product_id, qty, date?, uom_id?)`: the unit price of
 * `product.pricelist.quote` (in the pricelist currency, per `uom_id` when given, else per the
 * product's unit). Without a pricelist it returns the product's list price.
 */
registerExpressionHelper('pricelist_price', {
  resolve: async (env, [pricelist, product, qty, date, uom]) => {
    requireModels(env, ['product.pricelist', 'product.product'], 'pricelist_price');
    const productId = requiredId(product, 'Product');
    const quoteQty = quantity(qty, 1);
    if (quoteQty < 0) throw new ValidationError('Pricing quantity must be nonnegative');
    if (date !== undefined && date !== null && typeof date !== 'string') throw new ValidationError('Pricing date must be an ISO date');
    const pricelistId = optionalId(pricelist, 'Pricelist');
    const uomId = optionalId(uom, 'Unit of measure');
    if (pricelistId === undefined) {
      const [variant] = await env.model('product.product').browse(productId).read(['product_tmpl_id']);
      if (!variant) throw new ValidationError('Product is unavailable');
      const [template] = await env.model('product.template').browse(variant.product_tmpl_id as number).read(['list_price', 'uom_id']);
      if (!template) throw new ValidationError('Product is unavailable');
      const price = Number(template.list_price);
      if (uomId === undefined || uomId === template.uom_id) return price;
      return price * await convertQuantity(env, 1, uomId, template.uom_id as number, { round: false });
    }
    const quote = await quoteProduct(env, pricelistId, {
      productId, quantity: quoteQty, ...(uomId !== undefined ? { uomId } : {}), ...(typeof date === 'string' ? { date: date.slice(0, 10) } : {}),
    });
    return quote.unitPrice;
  },
});

/**
 * `tax_compute(tax_ids, price_unit, qty, product_id?, partner_id?, currency_id?)` returns
 * `{untaxed, tax, total}` from `account.tax.compute`, rounded to the currency (default: the caller's
 * current company currency). product/partner are accepted for Odoo parity (fiscal positions and
 * product-specific taxes are not modelled yet); they are validated as ids but not read.
 */
registerExpressionHelper('tax_compute', {
  resolve: async (env, [taxes, priceUnit, qty, product, partner, currency]) => {
    requireModels(env, ['account.tax'], 'tax_compute');
    const taxIds = taxes === null || taxes === undefined ? [] : taxes;
    if (!Array.isArray(taxIds) || taxIds.length > 100 || !taxIds.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
      throw new ValidationError('tax_compute requires a list of at most 100 tax ids');
    }
    const unit = quantity(priceUnit, 0);
    const lineQty = quantity(qty, 1);
    optionalId(product, 'Product');
    optionalId(partner, 'Partner');
    const currencyId = optionalId(currency, 'Currency') ?? await companyCurrency(env);
    if (lineQty === 0) return { untaxed: 0, tax: 0, total: 0 };
    const result = await computeTaxes(env, unit, taxIds as number[], { currencyId, quantity: lineQty });
    return { untaxed: result.totalExcludingTax, tax: result.totalTax, total: result.totalIncludingTax };
  },
});

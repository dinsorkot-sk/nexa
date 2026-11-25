import { ValidationError, type Env, type ModelDef, type Recordset } from '../contracts/index.js';
import { currencyRound } from '../base/currency.js';

export type TaxAmountType = 'percent' | 'fixed';

export interface ComputedTax {
  id: number;
  name: string;
  base: number;
  amount: number;
  priceIncluded: boolean;
}

export interface TaxComputation {
  totalExcludingTax: number;
  totalTax: number;
  totalIncludingTax: number;
  taxes: ComputedTax[];
}

async function validateTaxes(records: Recordset): Promise<void> {
  for (const row of await records.read(['amount_type', 'amount', 'sequence'])) {
    const type = row.amount_type;
    const amount = Number(row.amount);
    const sequence = Number(row.sequence);
    if (type !== 'percent' && type !== 'fixed') throw new ValidationError('Tax amount type must be percent or fixed');
    if (!Number.isFinite(amount) || amount < 0 || (type === 'percent' && amount > 10000)) {
      throw new ValidationError('Tax amount must be finite and non-negative (percentage capped at 10000)');
    }
    if (!Number.isFinite(sequence)) throw new ValidationError('Tax sequence must be finite');
  }
}

/** Optional, jurisdiction-neutral tax configuration. Rates are supplied by the caller's data. */
export const taxModels: ModelDef[] = [{
  name: 'account.tax', origin: 'module', module: 'account_core', order: 'sequence asc, id asc', description: 'Tax',
  fields: {
    name: { type: 'char', required: true, string: 'Tax Name' },
    amount_type: { type: 'selection', required: true, default: 'percent', selection: [['percent', 'Percentage'], ['fixed', 'Fixed']] },
    amount: { type: 'float', required: true, default: 0, string: 'Amount' },
    sequence: { type: 'integer', required: true, default: 10 },
    price_include: { type: 'boolean', default: false, string: 'Included in Price' },
  },
  methods: {
    compute(records, unitAmount, currencyId, quantity = 1) {
      if (typeof unitAmount !== 'number' || typeof currencyId !== 'number' || typeof quantity !== 'number') {
        throw new ValidationError('Tax amount, currency id and quantity must be numbers');
      }
      return computeTaxes(records.env, unitAmount, records.ids, { currencyId, quantity });
    },
  },
  constraints: [{ name: 'account_tax_amount_valid', check: validateTaxes, fields: ['amount_type', 'amount', 'sequence'] }],
}];

/**
 * Compute taxes for a line amount and quantity using only records visible to `env`.
 * Amount is the unit price; negative prices naturally produce negative refund tax amounts.
 * Excluded taxes are independently computed on the same untaxed subtotal. At most one included
 * tax is supported, and included/excluded taxes cannot be mixed in a single call. Rounding is
 * applied per tax and to the final totals using the selected currency's rounding factor.
 */
export async function computeTaxes(
  env: Env,
  unitAmount: number,
  taxIds: readonly number[],
  options: { currencyId: number; quantity?: number },
): Promise<TaxComputation> {
  const quantity = options.quantity ?? 1;
  if (!Number.isFinite(unitAmount) || !Number.isFinite(quantity) || quantity <= 0) {
    throw new ValidationError('Tax amount must be finite and quantity must be positive and finite');
  }
  if (!Number.isSafeInteger(options.currencyId) || options.currencyId <= 0) throw new ValidationError('Currency id must be a positive integer');
  if (!Array.isArray(taxIds) || taxIds.length > 100) throw new ValidationError('Tax list must contain at most 100 ids');
  const uniqueIds = [...new Set(taxIds)];
  if (uniqueIds.length !== taxIds.length) throw new ValidationError('Tax ids must not contain duplicates');
  if (uniqueIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new ValidationError('Tax ids must be positive integers');
  const rows = uniqueIds.length
    ? await env.model('account.tax').browse(uniqueIds).read(['name', 'amount_type', 'amount', 'sequence', 'price_include'])
    : [];
  if (rows.length !== uniqueIds.length) throw new ValidationError('One or more requested taxes are unavailable');
  const taxes = rows.sort((a, b) => Number(a.sequence) - Number(b.sequence) || Number(a.id) - Number(b.id));
  const included = taxes.filter((tax) => Boolean(tax.price_include));
  if (included.length > 1 || (included.length && included.length !== taxes.length)) {
    throw new ValidationError('Tax calculation supports either excluded taxes or one included tax per line');
  }

  const gross = unitAmount * quantity;
  let untaxed: number;
  if (included.length === 1) {
    const tax = included[0]!;
    const amount = Number(tax.amount);
    if (tax.amount_type === 'percent') {
      untaxed = gross / (1 + amount / 100);
    } else {
      if (amount > Math.abs(unitAmount)) throw new ValidationError('Included fixed tax exceeds the absolute unit price');
      untaxed = gross - Math.sign(gross || 1) * amount * quantity;
    }
  } else {
    untaxed = gross;
  }
  const roundedGross = await currencyRound(env, gross, options.currencyId);
  const roundedUntaxed = await currencyRound(env, untaxed, options.currencyId);
  const computedTaxes: ComputedTax[] = [];
  for (const tax of taxes) {
    const isIncluded = Boolean(tax.price_include);
    const raw = isIncluded
      ? roundedGross - roundedUntaxed
      : tax.amount_type === 'percent'
        ? untaxed * Number(tax.amount) / 100
        : Math.sign(untaxed || 1) * Number(tax.amount) * quantity;
    computedTaxes.push({
      id: Number(tax.id), name: String(tax.name), base: roundedUntaxed,
      amount: await currencyRound(env, raw, options.currencyId), priceIncluded: isIncluded,
    });
  }
  const totalTax = await currencyRound(env, computedTaxes.reduce((sum, tax) => sum + tax.amount, 0), options.currencyId);
  return {
    totalExcludingTax: roundedUntaxed,
    totalTax,
    totalIncludingTax: included.length ? roundedGross : await currencyRound(env, roundedUntaxed + totalTax, options.currencyId),
    taxes: computedTaxes,
  };
}

import { currencyConvert, currencyRound, contextToday } from '../base/currency.js';
import { AccessError, ValidationError, type Domain, type Env, type ModelDef, type ModuleManifest, type Recordset } from '../contracts/index.js';
import { positiveInt } from '../services/common.js';
import { convertQuantity } from '../uom/index.js';
import './expr-helpers.js';

const models: ModelDef[] = [
  {
    name: 'product.template', origin: 'module',
    fields: {
      name: { type: 'char', required: true },
      uom_id: { type: 'many2one', comodel: 'uom.uom', required: true, ondelete: 'restrict' },
      currency_id: { type: 'many2one', comodel: 'res.currency', required: true, ondelete: 'restrict' },
      list_price: { type: 'monetary', currencyField: 'currency_id', required: true, default: 0 },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'product_price_nonnegative', sql: 'CHECK (list_price >= 0 AND list_price < 1e100)' }],
  },
  {
    name: 'product.product', origin: 'module', nameSearchFields: ['default_code'],
    fields: {
      name: { type: 'char', required: true },
      product_tmpl_id: { type: 'many2one', comodel: 'product.template', required: true, index: true, ondelete: 'restrict' },
      default_code: { type: 'char', required: true, unique: true },
      attributes: { type: 'json' },
      active: { type: 'boolean', default: true },
    },
    constraints: [{ name: 'product_sku_nonempty', sql: "CHECK (length(btrim(default_code)) BETWEEN 1 AND 120)" }],
  },
  {
    name: 'product.pricelist', origin: 'module',
    fields: {
      name: { type: 'char', required: true },
      currency_id: { type: 'many2one', comodel: 'res.currency', required: true, ondelete: 'restrict' },
      active: { type: 'boolean', default: true },
    },
    methods: { quote: quoteMethod },
  },
  {
    name: 'product.pricelist.item', origin: 'module',
    fields: {
      name: { type: 'char', required: true },
      pricelist_id: { type: 'many2one', comodel: 'product.pricelist', required: true, index: true, ondelete: 'cascade' },
      product_id: { type: 'many2one', comodel: 'product.product', ondelete: 'cascade' },
      product_tmpl_id: { type: 'many2one', comodel: 'product.template', ondelete: 'cascade' },
      min_quantity: { type: 'float', required: true, default: 0 },
      sequence: { type: 'integer', required: true, default: 10 },
      date_start: { type: 'date' },
      date_end: { type: 'date' },
      compute_price: { type: 'selection', selection: [['fixed', 'Fixed price'], ['percentage', 'Percentage discount']], required: true, default: 'fixed' },
      amount: { type: 'float', required: true },
      active: { type: 'boolean', default: true },
    },
    constraints: [
      { name: 'pricelist_item_scope', sql: 'CHECK (product_id IS NULL OR product_tmpl_id IS NULL)' },
      { name: 'pricelist_item_quantity', sql: 'CHECK (min_quantity >= 0 AND min_quantity < 1e100)' },
      { name: 'pricelist_item_dates', sql: 'CHECK (date_start IS NULL OR date_end IS NULL OR date_start <= date_end)' },
      { name: 'pricelist_item_amount', sql: "CHECK (amount >= 0 AND amount < 1e100 AND (compute_price <> 'percentage' OR amount <= 100))" },
    ],
  },
];

export const productModule: ModuleManifest = {
  name: 'product',
  version: '1.0.0',
  summary: 'Product templates, variants and pricelists',
  depends: ['uom'],
  models,
  access: models.flatMap(({ name: model }) => [
    { model, group: 'base.group_user', perms: { read: true, write: false, create: false, unlink: false } },
    { model, group: 'base.group_system', perms: { read: true, write: true, create: true, unlink: true } },
  ]),
};

export interface ProductQuoteInput {
  productId: number;
  quantity: number;
  uomId?: number;
  date?: string;
}

export interface ProductQuote {
  unitPrice: number;
  currencyId: number;
  uomId: number;
  ruleId: number | null;
}

async function readActive(env: Env, model: string, id: number, fields: string[]) {
  const [row] = await env.model(model).browse(id).read([...fields, 'active']);
  if (!row || row.active !== true) throw new AccessError('Pricing record is unavailable');
  return row;
}

/** Quote one variant, using the caller's access to products, rules, units and currencies. */
export async function quoteProduct(env: Env, pricelistId: number, input: ProductQuoteInput): Promise<ProductQuote> {
  positiveInt(pricelistId, 'pricelist id');
  if (!input || typeof input !== 'object') throw new ValidationError('A product quote object is required');
  positiveInt(input.productId, 'product id');
  if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new ValidationError('Pricing quantity must be a finite nonnegative number');
  }
  const date = input.date ?? contextToday(env);
  const parsed = new Date(date);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date.startsWith('0000-')) {
    throw new ValidationError('Pricing date must be a valid YYYY-MM-DD date');
  }
  return env.transaction(async (tx) => {
    const list = await readActive(tx, 'product.pricelist', pricelistId, ['currency_id']);
    const variant = await readActive(tx, 'product.product', input.productId, ['product_tmpl_id']);
    const templateId = variant.product_tmpl_id as number;
    const template = await readActive(tx, 'product.template', templateId, ['currency_id', 'list_price', 'uom_id']);
    const currencyId = list.currency_id as number;
    const sourceCurrencyId = template.currency_id as number;
    await readActive(tx, 'res.currency', currencyId, []);
    const baseUom = template.uom_id as number;
    const uomId = input.uomId === undefined ? baseUom : positiveInt(input.uomId, 'unit id');
    const multiplier = await convertQuantity(tx, 1, uomId, baseUom, { round: false });
    const baseQuantity = input.quantity * multiplier;
    if (!Number.isFinite(baseQuantity)) throw new ValidationError('Pricing quantity is too large');
    const common: Domain = [
      ['pricelist_id', '=', pricelistId], ['active', '=', true], ['min_quantity', '<=', baseQuantity],
      '|', ['date_start', '=', null], ['date_start', '<=', date],
      '|', ['date_end', '=', null], ['date_end', '>=', date],
    ];
    const candidates: Domain[] = [
      [['product_id', '=', input.productId]],
      [['product_tmpl_id', '=', templateId]],
      [['product_id', '=', null], ['product_tmpl_id', '=', null]],
    ];
    let rule;
    for (const scope of candidates) {
      [rule] = await tx.model('product.pricelist.item').searchRead(
        [...common, ...scope], ['compute_price', 'amount'], { order: 'sequence asc, min_quantity desc, id asc', limit: 1 },
      );
      if (rule) break;
    }
    let price = Number(rule?.amount);
    if (rule?.compute_price !== 'fixed') {
      if (sourceCurrencyId !== currencyId) await readActive(tx, 'res.currency', sourceCurrencyId, []);
      const listPrice = await currencyConvert(tx, Number(template.list_price), sourceCurrencyId, currencyId, { date, round: false });
      price = listPrice * (1 - Number(rule?.amount ?? 0) / 100);
    }
    const amount = price * multiplier;
    if (!Number.isFinite(amount)) throw new ValidationError('Price is too large');
    return { unitPrice: await currencyRound(tx, amount, currencyId), currencyId, uomId, ruleId: (rule?.id as number | undefined) ?? null };
  });
}

function quoteMethod(records: Recordset, ...args: unknown[]): Promise<ProductQuote> {
  const input = args[0];
  if (records.ids.length !== 1 || args.length !== 1 || !input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('quote requires one pricelist and a product quote object');
  }
  return quoteProduct(records.env, records.ids[0]!, input as ProductQuoteInput);
}

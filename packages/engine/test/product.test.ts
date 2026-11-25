import { afterAll, expect, it } from 'vitest';
import { ModuleCatalog, PgliteTenantManager, baseModule } from '../src/index.js';
import { productModule, quoteProduct } from '../src/product/index.js';
import { uomModule } from '../src/uom/index.js';

const manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, uomModule, productModule]) });
afterAll(() => manager.closeAll());

it('quotes variants with unit conversion, scope and date filtering, and currency rounding', async () => {
  const h = await manager.create('pricing', ['product']);
  const env = h.env({ uid: 1 });
  const add = async (model: string, values: Record<string, unknown>) => (await env.model(model).create(values)).ids[0]!;
  const [currencyId] = (await env.model('res.currency').search([['name', '=', 'USD']])).ids;
  const category_id = await add('uom.category', { name: 'Packages' });
  const unit = await add('uom.uom', { name: 'Item', category_id });
  const box = await add('uom.uom', { name: 'Box of 12', category_id, factor: 12 });
  const tmpl = await add('product.template', { name: 'Shirt', uom_id: unit, currency_id: currencyId, list_price: 20 });
  const productId = await add('product.product', { name: 'Blue shirt', product_tmpl_id: tmpl, default_code: 'BLUE', attributes: { color: 'Blue' } });
  const pricelist_id = await add('product.pricelist', { name: 'Retail', currency_id: currencyId });
  const generic = await add('product.pricelist.item', { name: 'General discount', pricelist_id, compute_price: 'percentage', amount: 10 });
  const bulk = await add('product.pricelist.item', { name: 'Bulk price', pricelist_id, product_tmpl_id: tmpl, min_quantity: 12, amount: 15 });
  const promo = await add('product.pricelist.item', {
    name: 'Blue sale', pricelist_id, product_id: productId, amount: 12.34, date_start: '2026-11-01', date_end: '2026-11-30',
  });
  expect(await quoteProduct(env, pricelist_id, { productId, quantity: 2, date: '2026-10-31' }))
    .toEqual({ unitPrice: 18, currencyId, uomId: unit, ruleId: generic });
  expect(await quoteProduct(env, pricelist_id, { productId, quantity: 1, uomId: box, date: '2026-12-01' }))
    .toEqual({ unitPrice: 180, currencyId, uomId: box, ruleId: bulk });
  expect(await env.model('product.pricelist').browse(pricelist_id).call('quote', { productId, quantity: 1, date: '2026-11-30' }))
    .toEqual({ unitPrice: 12.34, currencyId, uomId: unit, ruleId: promo });
  await expect(quoteProduct(env, pricelist_id, { productId, quantity: 1, date: '2026-02-30' })).rejects.toThrow(/date/);
  await expect(add('product.product', { name: 'Duplicate', product_tmpl_id: tmpl, default_code: 'BLUE' })).rejects.toThrow();
}, 60_000);

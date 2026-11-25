import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModuleCatalog } from '../src/modules/catalog.js';
import { PgliteTenantManager } from '../src/tenant/manager.js';
import { baseModule } from '../src/base/manifest.js';
import { accountCoreModule } from '../src/account-core/manifest.js';
import { computeTaxes } from '../src/account-core/tax.js';
import { ValidationError, type Env, type TenantHandle } from '../src/contracts/index.js';

let manager: PgliteTenantManager;
let handle: TenantHandle;
let env: Env;
let currencyId: number;

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, accountCoreModule]) });
  handle = await manager.create('tax-tests', ['account_core']);
  env = handle.env({ uid: 1 });
  currencyId = Number((await env.model('res.currency').searchRead([['name', '=', 'USD']], ['id']))[0]!.id);
}, 120_000);
afterAll(() => manager.closeAll());

describe('account core tax primitives', () => {
  it('computes excluded percentage and fixed taxes from the same base, rounded in currency', async () => {
    const ids = (await env.model('account.tax').create([
      { name: 'Sales', amount_type: 'percent', amount: 7.5, sequence: 10 },
      { name: 'Eco fee', amount_type: 'fixed', amount: 1.25, sequence: 20 },
    ])).ids as number[];
    const result = await computeTaxes(env, 10.005, ids, { currencyId, quantity: 2 });
    expect(result).toMatchObject({ totalExcludingTax: 20.01, totalTax: 4, totalIncludingTax: 24.01 });
    expect(result.taxes.map((tax) => tax.amount)).toEqual([1.5, 2.5]);
  });

  it('extracts one included percentage tax and preserves signed refunds', async () => {
    const [id] = (await env.model('account.tax').create({ name: 'Included', amount_type: 'percent', amount: 10, price_include: true })).ids;
    expect(await computeTaxes(env, 110, [id!], { currencyId })).toMatchObject({
      totalExcludingTax: 100, totalTax: 10, totalIncludingTax: 110,
    });
    expect(await computeTaxes(env, -110, [id!], { currencyId })).toMatchObject({
      totalExcludingTax: -100, totalTax: -10, totalIncludingTax: -110,
    });
    const [fixed] = (await env.model('account.tax').create({ name: 'Fixed included', amount_type: 'fixed', amount: 2, price_include: true })).ids;
    expect(await computeTaxes(env, 5, [fixed!], { currencyId, quantity: 2 })).toMatchObject({
      totalExcludingTax: 6, totalTax: 4, totalIncludingTax: 10,
    });
  });

  it('rejects unsupported included mixtures and invalid inputs/configuration', async () => {
    const [inc] = (await env.model('account.tax').create({ name: 'Included', amount_type: 'percent', amount: 10, price_include: true })).ids;
    const [exc] = (await env.model('account.tax').create({ name: 'Excluded', amount_type: 'percent', amount: 5 })).ids;
    await expect(computeTaxes(env, 100, [inc!, exc!], { currencyId })).rejects.toThrow(ValidationError);
    await expect(computeTaxes(env, Infinity, [], { currencyId })).rejects.toThrow(ValidationError);
    await expect(computeTaxes(env, 100, [], { currencyId, quantity: 0 })).rejects.toThrow(ValidationError);
    await expect(computeTaxes(env, 100, Array.from({ length: 101 }, (_, index) => index + 1), { currencyId })).rejects.toThrow(ValidationError);
    await expect(env.model('account.tax').create({ name: 'Invalid', amount_type: 'percent', amount: -1 })).rejects.toThrow(ValidationError);
  });

  it('exposes the calculation as an authenticated model method', async () => {
    const [id] = (await env.model('account.tax').create({ name: 'RPC tax', amount_type: 'percent', amount: 10 })).ids;
    const result = await env.model('account.tax').browse(id!).call('compute', 50, currencyId, 1) as { totalIncludingTax: number };
    expect(result.totalIncludingTax).toBe(55);
  });
});

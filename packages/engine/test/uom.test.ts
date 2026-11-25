import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessError, ModuleCatalog, PgliteTenantManager, ValidationError, baseModule, type Env, type TenantHandle } from '../src/index.js';
import { convertQuantity, uomModule } from '../src/uom/manifest.js';

let manager: PgliteTenantManager;
let tenant: TenantHandle;
let env: Env;

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, uomModule]) });
  tenant = await manager.create('uom-test', ['uom']);
  env = tenant.env({ uid: 1 });
}, 120_000);

afterAll(() => manager.closeAll());

describe('units of measure', () => {
  it('converts by reference factors and rounds to the target increment by default', async () => {
    const [category] = await env.model('uom.category').create({ name: 'Weight' }).then((r) => r.ids);
    const [kg] = await env.model('uom.uom').create({ name: 'kg', category_id: category, factor: 1, rounding: 0.01 }).then((r) => r.ids);
    const [g] = await env.model('uom.uom').create({ name: 'g', category_id: category, factor: 0.001, rounding: 1 }).then((r) => r.ids);

    expect(await convertQuantity(env, 1.234, kg!, g!, { round: false })).toBeCloseTo(1234);
    expect(await convertQuantity(env, 1.2344, kg!, g!)).toBe(1234);
    expect(await env.model('uom.uom').browse(kg!).call('convert_quantity', -0.0015, g!)).toBe(-2);
    expect(await convertQuantity(env, 1234, g!, kg!, { round: false })).toBeCloseTo(1.234);
  });

  it('rejects conversion between categories and invalid unit factors or rounding', async () => {
    const [weight] = (await env.model('uom.category').create({ name: 'Weight' })).ids;
    const [length] = (await env.model('uom.category').create({ name: 'Length' })).ids;
    const [kg] = (await env.model('uom.uom').create({ name: 'kg', category_id: weight })).ids;
    const [m] = (await env.model('uom.uom').create({ name: 'm', category_id: length })).ids;

    await expect(convertQuantity(env, 1, kg!, m!)).rejects.toThrow('different categories');
    await expect(env.model('uom.uom').create({ name: 'bad factor', category_id: weight, factor: 0 })).rejects.toThrow(ValidationError);
    await expect(env.model('uom.uom').create({ name: 'bad rounding', category_id: weight, rounding: Number.POSITIVE_INFINITY })).rejects.toThrow(ValidationError);
    await expect(convertQuantity(env, Number.NaN, kg!, kg!)).rejects.toThrow(ValidationError);
  });

  it('allows internal users to read but reserves changes for Settings', async () => {
    const company = (await env.model('res.company').search([], { limit: 1 })).ids[0]!;
    const [userId] = (await env.model('res.users').create({
      name: 'Internal', login: 'uom-internal', company_id: company,
      group_ids: [{ op: 'set', ids: [await groupId('base.group_user')] }],
    })).ids;
    const internal = tenant.env({ uid: userId! });
    expect(await internal.model('uom.category').searchCount([])).toBeGreaterThan(0);
    await expect(internal.model('uom.category').create({ name: 'Denied' })).rejects.toThrow(AccessError);
    const [unit] = (await internal.model('uom.uom').search([], { limit: 1 })).ids;
    await expect(internal.model('uom.uom').browse(unit!).write({ name: 'Denied' })).rejects.toThrow(AccessError);
  });
});

async function groupId(xmlId: string): Promise<number> {
  const [module, name] = xmlId.split('.');
  const [row] = await tenant.driver.query<{ res_id: number }>({
    text: 'SELECT res_id FROM nx_model_data WHERE module = $1 AND name = $2', params: [module!, name!],
  });
  return row!.res_id;
}

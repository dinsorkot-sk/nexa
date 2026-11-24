import type { Env } from '../contracts/index.js';
import type { EnvImpl } from '../orm/env.js';
import { currencyData } from './currency.js';

/**
 * base 1.1.0 (T21): backfill data for tenants installed before partners / currencies existed.
 * Runs before the module's data is (re)loaded, so the default currency is created here and
 * registered under its xmlid (noupdate) for the data loader to reuse.
 */
export async function migrateBase110(env: Env): Promise<void> {
  const all = env.sudo().withContext({ activeTest: false });

  // partners of companies and users (created by their ensure-partner constraint)
  for (const model of ['res.company', 'res.users']) {
    for (const id of (await all.model(model).search([['partner_id', '=', false]])).ids) {
      await all.model(model).browse(id).write({ partner_id: false });
    }
  }

  // stored computed fields and hierarchy paths of pre-existing partners
  const partners = all.model('res.partner');
  for (const type of ['company', 'person']) {
    const rows = await partners.search([['company_type', '=', type]]);
    if (rows.ids.length) await rows.write({ company_type: type });
  }
  const untyped = await partners.search([['company_type', '=', false]]);
  if (untyped.ids.length) await untyped.write({ company_type: 'person' });
  for (const id of (await partners.search([['parent_id', '=', false]])).ids) await partners.browse(id).write({ parent_id: false });

  // default company currency
  const companies = await all.model('res.company').search([['currency_id', '=', false]]);
  if (!companies.ids.length) return;
  const db = (env as EnvImpl).db;
  const [known] = await db.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module = 'base' AND name = 'USD'`, params: [] });
  let usd = known?.res_id;
  if (!usd) {
    usd = (await all.model('res.currency').search([['name', '=', 'USD']])).ids[0];
    if (!usd) {
      const values = currencyData.find((rec) => rec.model === 'res.currency' && rec.xmlId === 'USD')!.values;
      usd = (await all.model('res.currency').create(values)).ids[0];
    }
    await db.query({
      text: `INSERT INTO nx_model_data (module, name, model, res_id, noupdate) VALUES ('base', 'USD', 'res.currency', $1, true)
             ON CONFLICT (module, name) DO UPDATE SET res_id = EXCLUDED.res_id, noupdate = true`,
      params: [usd],
    });
  }
  await companies.write({ currency_id: usd });
}

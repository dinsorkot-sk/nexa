import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AccessError, DataExportService, DataImportService, ModuleCatalog, securityModels, configModels, PgliteTenantManager, ValidationError, baseModule, demoModules, type Env, type ModuleManifest, type TenantHandle,
} from '../src/index.js';
import {
  currencyCompareAmounts, currencyConvert, currencyIsZero, currencyRate, currencyRound, precisionGet, roundDigits, roundPrecision,
} from '../src/base/currency.js';
import { activateLang, withUserContext } from '../src/base/lang.js';
import { contextToday } from '../src/base/currency.js';

const moneyModule: ModuleManifest = {
  name: 'money_test', version: '1.0.0', depends: ['base'],
  models: [{
    name: 'x.money', origin: 'module',
    fields: {
      name: { type: 'char' },
      currency_id: { type: 'many2one', comodel: 'res.currency', required: true },
      amount: { type: 'monetary', currencyField: 'currency_id' },
    },
  }],
  access: [{ model: 'x.money', group: 'base.group_user', perms: { read: true, write: true, create: true, unlink: true } }],
};

let manager: PgliteTenantManager;
let h: TenantHandle;
let env: Env;
const ref = async (xmlId: string): Promise<number> => {
  const [mod, name] = xmlId.split('.');
  const [row] = await h.driver.query<{ res_id: number }>({ text: 'SELECT res_id FROM nx_model_data WHERE module = $1 AND name = $2', params: [mod, name] });
  return row.res_id;
};

beforeAll(async () => {
  manager = new PgliteTenantManager({ catalog: new ModuleCatalog([baseModule, ...demoModules, moneyModule]) });
  h = await manager.create('base-data', ['contacts', 'money_test']);
  env = h.env({ uid: 1 });
}, 120_000);

afterAll(() => manager.closeAll());

describe('reference data', () => {
  it('seeds countries, currencies, states, groups, languages and precisions', async () => {
    const all = env.withContext({ activeTest: false });
    expect(await all.model('res.country').searchCount([])).toBe(249);
    expect(await all.model('res.currency').searchCount([])).toBeGreaterThan(150);
    expect((await env.model('res.currency').searchRead([], ['name'])).map((c) => c.name)).toEqual(['EUR', 'USD']);
    expect(await env.model('res.country.state').searchCount([])).toBe(51);
    const [eu] = await env.model('res.country.group').searchRead([], ['name', 'country_ids']);
    expect(eu).toMatchObject({ name: 'European Union' });
    expect(eu.country_ids).toHaveLength(27);
    expect((await env.model('res.lang').searchRead([], ['code'])).map((l) => l.code)).toEqual(['en_US']);
    expect(await all.model('res.lang').searchCount([])).toBe(18);
    const [th] = await env.model('res.country').searchRead([['code', '=', 'TH']], ['phone_code', 'currency_id']);
    expect(th).toMatchObject({ phone_code: 66, currency_id: await ref('base.THB') });
    const places = await all.model('res.currency').searchRead([['name', 'in', ['JPY', 'BHD', 'USD']]], ['name', 'decimal_places', 'rounding']);
    expect(Object.fromEntries(places.map((c) => [c.name, [c.decimal_places, c.rounding]]))).toEqual({ BHD: [3, 0.001], JPY: [0, 1], USD: [2, 0.01] });
    expect(await precisionGet(env, 'Product Unit of Measure')).toBe(3);
  });

  it('marks reference data noUpdate and keeps security groups updatable', async () => {
    const rows = await h.driver.query<{ name: string; noupdate: boolean }>({
      text: `SELECT name, noupdate FROM nx_model_data WHERE module = 'base' AND name IN ('group_user', 'group_system', 'th', 'USD', 'lang_en_US')`, params: [],
    });
    expect(Object.fromEntries(rows.map((r) => [r.name, r.noupdate]))).toEqual({
      USD: true, group_system: false, group_user: false, lang_en_US: true, th: true,
    });
  });
});

describe('partners', () => {
  it('links companies and users to auto-created partners that follow their name', async () => {
    const [company] = await env.model('res.company').browse(await ref('base.main_company')).read(['partner_id', 'currency_id']);
    expect(company.currency_id).toBe(await ref('base.USD'));
    const [cp] = await env.model('res.partner').browse(company.partner_id as number).read(['name', 'is_company']);
    expect(cp).toMatchObject({ name: 'My Company', is_company: true });

    const [userId] = (await env.model('res.users').create({ name: 'Pat', login: 'pat', company_id: company.id })).ids;
    const [user] = await env.model('res.users').browse(userId).read(['partner_id', 'lang']);
    expect(user.lang).toBe('en_US');
    await env.model('res.users').browse(userId).write({ name: 'Pat Renamed' });
    expect((await env.model('res.partner').browse(user.partner_id as number).read(['name']))[0].name).toBe('Pat Renamed');
  });

  it('computes company/contact names, commercial entity, hierarchy and name search', async () => {
    const P = env.model('res.partner');
    const [acme] = (await P.create({ name: 'Acme', company_type: 'company', vat: 'TH0105551234567' })).ids;
    const [jo] = (await P.create({ name: 'Jo', parent_id: acme, email: 'jo@acme.test' })).ids;
    const [desk] = (await P.create({ name: 'Desk', parent_id: jo, type: 'invoice' })).ids;
    const rows = await P.browse([acme, jo, desk]).read(['display_name', 'commercial_partner_id', 'is_company']);
    expect(rows.map((r) => r.display_name)).toEqual(['Acme', 'Acme, Jo', 'Acme, Jo, Desk']);
    expect(rows.map((r) => r.commercial_partner_id)).toEqual([acme, acme, acme]);

    await P.browse(acme).write({ name: 'Acme Ltd' });
    expect((await P.browse(desk).read(['display_name']))[0].display_name).toBe('Acme Ltd, Jo, Desk');
    expect((await P.search([['id', 'child_of', acme]])).ids.sort()).toEqual([acme, jo, desk].sort());

    expect((await P.nameSearch('jo@acme')).map((r) => r.display_name)).toEqual(['Acme Ltd, Jo']);
    expect((await P.nameSearch('0105551234567')).map((r) => r.id)).toEqual([acme]);
    // demo contacts migrated onto the base model
    expect((await P.nameSearch('Mali')).map((r) => r.display_name)).toEqual(['Nexa Systems, Mali Chaiyaporn']);
  });

  it('validates state/country, language and time zone', async () => {
    const P = env.model('res.partner');
    const ca = await ref('base.state_us_ca');
    await expect(P.create({ name: 'Bad state', state_id: ca, country_id: await ref('base.th') })).rejects.toThrow(/state does not belong/);
    await P.create({ name: 'Good state', state_id: ca, country_id: await ref('base.us') });
    await expect(P.create({ name: 'Thai', lang: 'th_TH' })).rejects.toThrow(/not active/);
    await expect(P.create({ name: 'Tz', tz: 'Mars/Base' })).rejects.toThrow(ValidationError);
    await P.create({ name: 'Tz ok', tz: 'Asia/Bangkok' });
  });

  it('applies the multi-company rule to partners', async () => {
    const [other] = (await env.model('res.company').create({ name: 'Other Co' })).ids;
    const main = await ref('base.main_company');
    const [uid] = (await env.model('res.users').create({
      name: 'Member', login: 'member', company_id: main, company_ids: [main], group_ids: [await ref('base.group_user')],
    })).ids;
    const [hidden] = (await env.model('res.partner').create({ name: 'Other private', company_id: other })).ids;
    const [shared] = (await env.model('res.partner').create({ name: 'Shared one' })).ids;
    const member = h.env({ uid });
    const visible = (await member.model('res.partner').search([['id', 'in', [hidden, shared]]])).ids;
    expect(visible).toEqual([shared]);
    await expect(member.model('res.partner').create({ name: 'Sneaky', company_id: other })).rejects.toThrow(AccessError);
    await expect(member.model('res.users').browse(uid).write({ partner_id: shared })).rejects.toThrow(AccessError);
    // reference data is read-only for internal users
    await expect(member.model('res.currency').create({ name: 'ZZZ', symbol: 'z' })).rejects.toThrow(AccessError);
  });
});

describe('currencies', () => {
  it('rounds, compares and converts with company-specific rates preferred', async () => {
    const usd = await ref('base.USD');
    const eur = await ref('base.EUR');
    const jpy = await ref('base.JPY');
    const main = await ref('base.main_company');
    expect(await currencyRound(env, 1.005, usd)).toBe(1.01);
    expect(await currencyRound(env, 12.5, jpy)).toBe(13);
    expect(await currencyIsZero(env, 0.004, usd)).toBe(true);
    expect(await currencyIsZero(env, 0.005, usd)).toBe(false);
    expect(await currencyCompareAmounts(env, 1.001, 1.004, usd)).toBe(0);
    expect(await currencyCompareAmounts(env, 1, 1.02, { rounding: 0.01 })).toBe(-1);

    const Rate = env.model('res.currency.rate');
    await Rate.create([
      { currency_id: eur, name: '2026-01-01', rate: 0.9 },
      { currency_id: eur, name: '2026-06-01', rate: 0.8 },
      { currency_id: eur, name: '2026-03-01', rate: 0.5, company_id: main },
    ]);
    await expect(Rate.create({ currency_id: eur, name: '2026-01-01', rate: 2 })).rejects.toThrow(/one rate/);
    await expect(Rate.create({ currency_id: eur, name: '2026-02-01', rate: 0 })).rejects.toThrow(/positive/);
    expect(await currencyRate(env, eur, { date: '2025-12-31' })).toBe(1);
    expect(await currencyRate(env, eur, { date: '2026-07-01' })).toBe(0.8);
    expect(await currencyRate(env, eur, { date: '2026-02-01', companyId: main })).toBe(0.9);
    expect(await currencyRate(env, eur, { date: '2026-07-01', companyId: main })).toBe(0.5);
    expect(await currencyConvert(env, 100, usd, eur, { date: '2026-07-01' })).toBe(80);
    expect(await currencyConvert(env, 10, eur, usd, { date: '2026-07-01' })).toBe(12.5);
    expect(await currencyConvert(env, 10, eur, usd, { date: '2026-07-01', companyId: main })).toBe(20);
    expect(await currencyConvert(env, 1.234, usd, usd)).toBe(1.23);
  });

  it('rounds monetary fields by their currency on create and write', async () => {
    const M = env.model('x.money');
    const [id] = (await M.create({ name: 'a', currency_id: await ref('base.USD'), amount: 10.126 })).ids;
    expect((await M.browse(id).read(['amount']))[0].amount).toBe(10.13);
    await M.browse(id).write({ currency_id: await ref('base.JPY') });
    expect((await M.browse(id).read(['amount']))[0].amount).toBe(10);
    await M.browse(id).write({ amount: 99.5 });
    expect((await M.browse(id).read(['amount']))[0].amount).toBe(100);
  });

  it('resolves named decimal precisions at runtime', async () => {
    expect(await roundPrecision(env, 1.23456, 'Product Unit of Measure')).toBe(1.235);
    await (await env.model('decimal.precision').search([['name', '=', 'Product Price']])).write({ digits: 4 });
    expect(await roundPrecision(env, 1.23456, 'Product Price')).toBe(1.2346);
    expect(await precisionGet(env, 'Unknown usage')).toBe(2);
    expect(roundDigits(2.5, 0)).toBe(3);
    await expect(env.model('decimal.precision').create({ name: 'Bad', digits: 20 })).rejects.toThrow(ValidationError);
  });
});

describe('languages and translations', () => {
  it('activates languages and stores translatable values per context language with en_US fallback', async () => {
    expect(await activateLang(env, 'th_TH')).toBe(true);
    expect(await activateLang(env, 'xx_XX')).toBe(false);
    await expect((await env.model('res.lang').search([['code', '=', 'en_US']])).write({ active: false })).rejects.toThrow(/fallback/);

    const th = await ref('base.th');
    await env.withContext({ lang: 'th_TH' }).model('res.country').browse(th).write({ name: 'ประเทศไทย' });
    const name = async (lang?: string) => (await (lang ? env.withContext({ lang }) : env).model('res.country').browse(th).read(['name']))[0].name;
    expect(await name('th_TH')).toBe('ประเทศไทย');
    expect(await name()).toBe('Thailand');
    expect(await name('fr_FR')).toBe('Thailand');
    expect((await env.withContext({ lang: 'th_TH' }).model('res.country').search([['name', '=', 'ประเทศไทย']])).ids).toEqual([th]);
    expect((await env.model('res.country').search([['name', '=', 'ประเทศไทย']])).ids).toEqual([]);
  });

  it('feeds the user language and time zone into the environment context', async () => {
    await activateLang(env, 'th_TH');
    const [uid] = (await env.model('res.users').create({
      name: 'Somchai', login: 'somchai', company_id: await ref('base.main_company'), group_ids: [await ref('base.group_user')],
    })).ids;
    const user = h.env({ uid });
    await user.model('res.users').browse(uid).write({ lang: 'th_TH', tz: 'Asia/Bangkok' });
    await expect(user.model('res.users').browse(uid).write({ lang: 'de_DE' })).rejects.toThrow(/not active/);
    const ctx = (await withUserContext(user)).context;
    expect(ctx).toMatchObject({ lang: 'th_TH', tz: 'Asia/Bangkok' });
    expect((await withUserContext(user.withContext({ lang: 'en_US' }))).context.lang).toBe('en_US');
    const [partner] = await env.model('res.users').browse(uid).read(['partner_id']);
    expect(partner.partner_id).toEqual(expect.any(Number));
  });
});

describe('review follow-ups', () => {
  it('imports many2one partners by name and round-trips exports', async () => {
    const [acme] = (await env.model('res.partner').create({ name: 'Import Co', company_type: 'company', email: 'imp@co.test' })).ids;
    const imp = await new DataImportService(env).load('res.partner', ['name', 'parent_id'], [['Imported Contact', 'Import Co']]);
    expect(imp.ok).toBe(true);
    const [row] = await env.model('res.partner').browse(imp.ids[0]).read(['parent_id', 'display_name']);
    expect(row).toMatchObject({ parent_id: acme, display_name: 'Import Co, Imported Contact' });
    const exported = await new DataExportService(env).exportData('res.partner', ['name', 'parent_id'], { ids: imp.ids });
    expect(exported.rows[0][1]).toBe('Import Co');
    const again = await new DataImportService(env).load('res.partner', exported.header, exported.rows.map((r) => ['Second', r[1]]));
    expect(again.ok).toBe(true);
    expect((await env.model('res.partner').browse(again.ids[0]).read(['parent_id']))[0].parent_id).toBe(acme);
    const third = await new DataImportService(env).load('res.partner', ['name', 'parent_id'], [['Third', 'Import Co, Imported Contact']]);
    expect(third.ok).toBe(true);
    expect((await env.model('res.partner').nameSearch('imp@co.test')).map((r) => r.id)).toEqual([acme]);
  });

  it('protects user/company partners, syncs lang/tz, requires country for a state, blocks archiving used languages', async () => {
    await activateLang(env, 'th_TH');
    const main = await ref('base.main_company');
    const [uid] = (await env.model('res.users').create({
      name: 'Plain', login: 'plain', company_id: main, group_ids: [await ref('base.group_user')],
    })).ids;
    const [{ partner_id: own }] = await env.model('res.users').browse(uid).read(['partner_id']);
    const [{ partner_id: companyPartner }] = await env.model('res.company').browse(main).read(['partner_id']);
    const plain = h.env({ uid });
    await expect(plain.model('res.partner').browse(companyPartner as number).write({ email: 'x@y' })).rejects.toThrow(AccessError);
    await expect(plain.model('res.partner').browse(own as number).write({ name: 'Hijack' })).rejects.toThrow(AccessError);
    const [free] = (await plain.model('res.partner').create({ name: 'Free' })).ids;
    await plain.model('res.partner').browse(free).write({ email: 'free@x.test' });

    await plain.model('res.users').browse(uid).write({ lang: 'th_TH', tz: 'Asia/Bangkok' });
    expect((await h.env({ uid: 1 }).model('res.partner').browse(own as number).read(['lang', 'tz']))[0]).toMatchObject({ lang: 'th_TH', tz: 'Asia/Bangkok' });

    await expect(env.model('res.partner').create({ name: 'No country', state_id: await ref('base.state_us_ny') })).rejects.toThrow(/country/);
    const langs = await env.model('res.lang').search([['code', '=', 'th_TH']]);
    await expect(langs.write({ active: false })).rejects.toThrow(/still used/);
  });

  it('rejects parent cycles and keeps subtree paths after moves and deletes', async () => {
    const P = env.model('res.partner');
    const [a] = (await P.create({ name: 'Cyc A', company_type: 'company' })).ids;
    const [b] = (await P.create({ name: 'Cyc B', parent_id: a })).ids;
    const [c] = (await P.create({ name: 'Cyc C', parent_id: b })).ids;
    await expect(P.browse(a).write({ parent_id: c })).rejects.toThrow(ValidationError);
    await expect(P.browse(a).write({ parent_id: a })).rejects.toThrow(ValidationError);
    const [x] = (await P.create({ name: 'Cyc X', company_type: 'company' })).ids;
    await P.browse(b).write({ parent_id: x });
    const paths = async (ids: number[]) => (await h.driver.query<{ id: number; parent_path: string }>({
      text: 'SELECT id, parent_path FROM res_partner WHERE id = ANY($1) ORDER BY id', params: [ids],
    })).map((r) => r.parent_path);
    expect(await paths([a, b, c])).toEqual([`${a}/`, `${x}/${b}/`, `${x}/${b}/${c}/`]);
    expect((await P.browse(c).read(['display_name']))[0].display_name).toBe('Cyc X, Cyc B, Cyc C');
    expect((await P.search([['id', 'child_of', x]])).ids.length).toBe(3);
    await P.browse(c).unlink();
    expect((await P.search([['id', 'child_of', x]])).ids.length).toBe(2);
  });

  it('uses the context time zone for the default rate date', () => {
    const fmt = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    expect(contextToday(env.withContext({ tz: 'Pacific/Kiritimati' }))).toBe(fmt('Pacific/Kiritimati'));
    expect(contextToday(env.withContext({ tz: 'Etc/GMT+12' }))).toBe(fmt('Etc/GMT+12'));
    expect(contextToday(env)).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe('upgrade from the pre-T21 base and demo contacts', () => {
  it('moves res.partner to base and backfills partners, currency and computed fields', async () => {
    const newModels = new Set(['res.currency', 'res.currency.rate', 'decimal.precision', 'res.country', 'res.country.state', 'res.country.group', 'res.lang', 'res.partner']);
    const oldActions = baseModule.actions!.filter((a) => !newModels.has(a.model!));
    const oldBase: ModuleManifest = {
      ...baseModule, version: '1.0.0', hooks: {},
      models: [...securityModels, ...configModels],
      data: baseModule.data!.filter((d) => ['res.company', 'res.groups', 'res.users'].includes(d.model))
        .map((d) => d.xmlId === 'main_company' ? { ...d, values: { name: 'My Company' } } : d),
      access: baseModule.access!.filter((a) => !newModels.has(a.model)),
      rules: baseModule.rules!.filter((r) => !newModels.has(r.model)),
      actions: oldActions,
      menus: baseModule.menus!.filter((m) => !m.action || oldActions.some((a) => a.xmlId === m.action)),
    };
    const oldContacts: ModuleManifest = {
      ...demoModules[0], version: '1.0.0',
      models: [{
        name: 'res.partner', origin: 'module', module: 'contacts', order: 'name asc',
        fields: {
          name: { type: 'char', required: true, index: true },
          company_type: { type: 'selection', selection: [['person', 'Person'], ['company', 'Company']], default: 'person' },
          email: { type: 'char' }, phone: { type: 'char' }, active: { type: 'boolean', default: true },
        },
      }],
      access: [{ model: 'res.partner', group: 'base.group_user', perms: { read: true, write: true, create: true, unlink: false } }],
      data: [
        { xmlId: 'contact_nexa', model: 'res.partner', noUpdate: true, values: { name: 'Nexa Systems', company_type: 'company' } },
        { xmlId: 'contact_mali', model: 'res.partner', noUpdate: true, values: { name: 'Mali Chaiyaporn' } },
      ],
      views: demoModules[0].views!.map((v) => ({ ...v, arch: { tag: v.type, children: [{ tag: 'field', attrs: { name: 'name' } }] } })),
    };
    const dir = await mkdtemp(join(tmpdir(), 'nexa-t21-'));
    try {
      const v1 = new PgliteTenantManager({ rootDir: dir, catalog: new ModuleCatalog([oldBase, oldContacts]) });
      const h1 = await v1.create('up', ['contacts']);
      const e1 = h1.env({ uid: 1 });
      const [companyId] = (await e1.model('res.company').search([])).ids;
      await e1.model('res.users').create({ name: 'Old user', login: 'old', company_id: companyId });
      await v1.closeAll();

      const v2 = new PgliteTenantManager({ rootDir: dir, catalog: new ModuleCatalog([baseModule, ...demoModules]) });
      try {
        const h2 = await v2.open('up');
        const e2 = h2.env({ uid: 1 }).withContext({ activeTest: false });
        expect(h2.registry.get('res.partner').def.module).toBe('base');
        const usd = (await e2.model('res.currency').search([['name', '=', 'USD']])).ids;
        expect(usd).toHaveLength(1);
        const companies = await e2.model('res.company').searchRead([], ['partner_id', 'currency_id']);
        expect(companies.every((c) => typeof c.partner_id === 'number' && c.currency_id === usd[0])).toBe(true);
        const users = await e2.model('res.users').searchRead([], ['partner_id']);
        expect(users.length).toBeGreaterThan(1);
        expect(users.every((u) => typeof u.partner_id === 'number')).toBe(true);
        const [nexa] = await e2.model('res.partner').searchRead([['name', '=', 'Nexa Systems']], ['is_company', 'complete_name', 'commercial_partner_id', 'parent_path']);
        expect(nexa).toMatchObject({ is_company: true, complete_name: 'Nexa Systems', commercial_partner_id: nexa.id, parent_path: `${nexa.id as number}/` });
        expect(await e2.model('res.country').searchCount([])).toBe(249);
        const [mali] = await e2.model('res.partner').searchRead([['name', '=', 'Mali Chaiyaporn']], ['complete_name']);
        expect(mali.complete_name).toBe('Mali Chaiyaporn');
      } finally {
        await v2.closeAll();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

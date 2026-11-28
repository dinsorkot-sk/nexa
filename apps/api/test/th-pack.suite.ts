/**
 * Thai accounting starter pack (apps/api/packs/th-accounting.json): an administrator sets up an empty
 * tenant with one call (`POST /api/packs/th_accounting/apply`), re-applies it safely, and a clerk runs
 * the Thai Sales → tax invoice → payment (with WHT) → reconciliation and credit-note journeys.
 * Harness-only step: passwords are provisioned through AuthService (GAP-AUTH-1).
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

type Json = Record<string, unknown>;
interface Res { status: number; body: Json }

export function thPackSuite(pgUrl?: string): void {
  const TENANT = pgUrl ? `thpack_${Date.now().toString(36)}` : 'thpack';
  const PASSWORDS = { admin: 'thp-admin-password-unique', clerk: 'thp-clerk-password-unique' };
  let app: INestApplication;
  let base: URL;
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};

  async function call(method: 'GET' | 'POST', path: string, body: unknown, token: string): Promise<Res> {
    const response = await fetch(new URL(`/api/${path}`, base), {
      method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Json };
  }
  const post = (path: string, body: unknown, token = tokens.admin!) => call('POST', path, body, token);
  const ok = async (path: string, body: unknown, token = tokens.admin!) => {
    const res = await post(path, body, token);
    if (res.status !== 200) throw new Error(`${path}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 600)}`);
    return res.body;
  };
  const rejected = (res: Res, message: RegExp) => {
    expect(res.status, JSON.stringify(res.body)).toBeGreaterThanOrEqual(400);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(500);
    expect(JSON.stringify(res.body)).toMatch(message);
  };
  const create = async (model: string, values: Json, token = tokens.admin!) => ((await ok(`model/${model}/create`, { values }, token)).ids as number[])[0]!;
  const searchRead = async (model: string, domain: unknown[], fields: string[], token = tokens.clerk!) =>
    (await ok(`model/${model}/search_read`, { domain, fields, order: 'id' }, token)).records as Json[];
  const one = async (model: string, domain: unknown[], token = tokens.admin!) => (await searchRead(model, domain, ['id'], token))[0]!.id as number;
  const read = async (model: string, id: number, fields: string[]) => ((await ok(`model/${model}/read`, { ids: [id], fields }, tokens.clerk)).records as Json[])[0]!;
  const button = (model: string, recordIds: number[], action: string) => post(`model/${model}/button`, { ids: recordIds, action }, tokens.clerk);
  const apply = (token = tokens.admin!) => post('packs/th_accounting/apply', { params: { company: ids.company } }, token);

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'production');
    if (pgUrl) { vi.stubEnv('NEXA_DB', 'postgres'); vi.stubEnv('NEXA_PG_URL', pgUrl); } else { vi.stubEnv('NEXA_DB', 'pglite'); vi.stubEnv('NEXA_DATA_DIR', ':memory:'); }
    vi.stubEnv('NEXA_TENANTS', TENANT);
    vi.stubEnv('NEXA_MODULES', 'base,uom,product,account_core');
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    await app.listen(0, '127.0.0.1');
    base = new URL(await app.getUrl());
    expect(app.get(EngineService).config.db).toBe(pgUrl ? 'postgres' : 'pglite');
    const su = (await app.get(EngineService).tenant(TENANT)).env({ uid: 1 });
    const [mainCompany] = (await su.model('res.company').search([], { limit: 1, order: 'id' })).ids;
    const [groupUser] = (await su.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
    await su.model('res.users').create({ name: 'Clerk', login: 'clerk', company_id: mainCompany, company_ids: [mainCompany], group_ids: [groupUser] });
    const auth = app.get(AuthService);
    for (const [login, password] of Object.entries(PASSWORDS)) {
      await auth.provisionPassword(TENANT, login, password);
      const res = await fetch(new URL('/api/auth/login', base), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: TENANT, login, password }),
      });
      tokens[login] = ((await res.json()) as Json).accessToken as string;
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  describe(`Thai accounting starter pack over HTTP (${pgUrl ? 'PostgreSQL' : 'PGlite'})`, { timeout: 30_000 }, () => {
    it('lists the pack and its parameters for administrators only', async () => {
      const listed = await call('GET', 'packs', undefined, tokens.admin!);
      expect(listed.status).toBe(200);
      expect((listed.body.packs as Json[]).find((p) => p.name === 'th_accounting')).toMatchObject({ params: { company: { model: 'res.company' } } });
      expect((await call('GET', 'packs', undefined, tokens.clerk!)).status).toBe(403);
    });

    it('sets up a Thai company in one call, and re-applying changes nothing it does not own', async () => {
      const thb = await one('res.currency', [['name', '=', 'THB'], ['active', 'in', [true, false]]]);
      await ok('model/res.currency/write', { ids: [thb], values: { active: true } });
      ids.company = await create('res.company', { name: 'Thai Co., Ltd.', currency_id: thb });
      ids.thb = thb;
      const usd = await one('res.currency', [['name', '=', 'USD'], ['active', 'in', [true, false]]]);
      await ok('model/res.currency/write', { ids: [usd], values: { active: true } });
      const wrongCurrency = await create('res.company', { name: 'US Co.', currency_id: usd });
      // the administrator works in the new company too (packs run in the target company)
      const admin = await one('res.users', [['login', '=', 'admin']]);
      const mine = ((await ok('model/res.users/read', { ids: [admin], fields: ['company_ids'] })).records as Json[])[0]!.company_ids as number[];

      rejected(await apply(), /compan/i); // not yet one of the administrator's companies
      await ok('model/res.users/write', { ids: [admin], values: { company_ids: [...mine, ids.company, wrongCurrency], company_id: ids.company } });
      rejected(await apply(tokens.clerk!), /Studio|administrator/i);
      rejected(await post('packs/no_such_pack/apply', { params: { company: ids.company } }), /Unknown starter pack/);
      rejected(await post('packs/th_accounting/apply', { params: {} }), /parameter 'company' is required/);
      rejected(await post('packs/th_accounting/apply', { params: { company: wrongCurrency } }), /requires currency 'THB'/);

      const first = await ok('packs/th_accounting/apply', { params: { company: ids.company } });
      expect(first).toMatchObject({ pack: 'th_accounting', created: { models: 11 } });
      expect((first.created as Json).fields as number).toBeGreaterThan(60);
      expect((first.created as Json).records as number).toBeGreaterThan(50);

      const concurrent = await Promise.all([
        post('packs/th_accounting/apply', { params: { company: ids.company } }),
        post('packs/th_accounting/apply', { params: { company: ids.company } }),
      ]);
      for (const res of concurrent) expect(res.status).toBe(200);
      const second = await ok('packs/th_accounting/apply', { params: { company: ids.company } });
      expect(second).toMatchObject({ created: { models: 0, fields: 0, records: 0 } });
      // the starter chart and taxes (noupdate) keep administrator edits
      const revenue = await one('x_ledger_account', [['x_code', '=', '4000'], ['x_company_id', '=', ids.company]]);
      await ok('model/x_ledger_account/write', { ids: [revenue], values: { x_name: 'Service income' } });
      await ok('packs/th_accounting/apply', { params: { company: ids.company } });
      expect(((await ok('model/x_ledger_account/read', { ids: [revenue], fields: ['x_name'] })).records as Json[])[0]).toMatchObject({ x_name: 'Service income' });
      // a deleted pack record is recreated; invalid names never reach the file system
      const rule = await one('ir.rule', [['name', '=', 'x_payment companies']]);
      await ok('model/ir.rule/unlink', { ids: [rule] });
      expect(await ok('packs/th_accounting/apply', { params: { company: ids.company } })).toMatchObject({ created: { records: 1 } });
      for (const name of ['TH', 'th-accounting', '..']) expect((await post(`packs/${encodeURIComponent(name)}/apply`, { params: {} })).status).toBeGreaterThanOrEqual(400);
      // a company outside the administrator's companies is refused
      const other = await create('res.company', { name: 'Not mine', currency_id: ids.thb });
      rejected(await post('packs/th_accounting/apply', { params: { company: other } }), /may not access companies/);
      // the company was wired to its VAT tax and accounts
      expect(((await ok('model/res.company/read', { ids: [ids.company], fields: ['x_vat_tax_id', 'x_output_vat_account_id', 'x_wht_account_id'] })).records as Json[])[0])
        .toMatchObject({ x_vat_tax_id: expect.any(Number), x_output_vat_account_id: expect.any(Number), x_wht_account_id: expect.any(Number) });
    }, 180_000);

    it('lets a clerk issue a Thai tax invoice, receive a payment net of WHT and reconcile it', async () => {
      await ok('model/res.company/write', { ids: [ids.company], values: { x_vat: '0105500000002', x_branch: '00000' } });
      const clerk = await one('res.users', [['login', '=', 'clerk']]);
      await ok('model/res.users/write', { ids: [clerk], values: { company_id: ids.company, company_ids: [ids.company] } });
      const account = (code: string) => one('x_ledger_account', [['x_code', '=', code], ['x_company_id', '=', ids.company]], tokens.clerk);
      ids.receivable = await account('1100'); ids.revenue = await account('4000'); ids.bank = await account('1000');
      ids.vat = await one('account.tax', [['name', '=', 'VAT 7%']]);
      ids.buyer = await create('res.partner', { name: 'Buyer Co., Ltd.', x_vat: '0105500000001', x_branch: '00001', x_receivable_id: ids.receivable });

      const header = { x_company_id: ids.company, x_currency_id: ids.thb, x_company_currency_id: ids.thb, x_partner_id: ids.buyer, x_date: '2026-03-10' };
      const order = await create('x_sale_order', { ...header, x_line_ids: [
        { op: 'create', values: { x_name: 'Service', x_account_id: ids.revenue, x_qty: 2, x_price_unit: 500, x_tax_id: ids.vat } },
        { op: 'create', values: { x_name: 'Exempt goods', x_account_id: ids.revenue, x_qty: 1, x_price_unit: 100 } },
      ] }, tokens.clerk);
      expect((await button('x_sale_order', [order], 'th_acc.order_confirm')).status).toBe(200);
      expect((await button('x_sale_order', [order], 'th_acc.order_invoice')).status).toBe(200);
      ids.invoice = (await searchRead('x_invoice', [['x_order_id', '=', order]], ['id']))[0]!.id as number;
      expect((await button('x_invoice', [ids.invoice], 'th_acc.invoice_post')).status).toBe(200);
      expect(await read('x_invoice', ids.invoice, ['x_name', 'x_amount_untaxed', 'x_amount_tax', 'x_amount_total', 'x_payment_state']))
        .toMatchObject({ x_name: 'INV/2026/0001', x_amount_untaxed: 1100, x_amount_tax: 70, x_amount_total: 1170, x_payment_state: 'not_paid' });
      expect((await searchRead('x_ledger_move', [['x_invoice_id', '=', ids.invoice]], ['x_name']))[0]).toMatchObject({ x_name: 'JV/2026/0001' });

      const payment = await create('x_payment', { ...header, x_amount: 1170, x_wht_amount: 30, x_bank_account_id: ids.bank, x_receivable_id: ids.receivable }, tokens.clerk);
      rejected(await button('x_payment', [payment], 'th_acc.payment_post'), /not allowed for record \d+ in its current state/);
      expect((await button('x_payment', [payment], 'th_acc.payment_post_wht')).status).toBe(200);
      const ar = async (domain: unknown[]) => (await searchRead('x_ledger_line', [...domain, ['x_account_id', '=', ids.receivable]], ['id']))[0]!.id as number;
      const invoiceLine = await ar([['x_invoice_id', '=', ids.invoice]]);
      const paymentLine = await ar([['x_invoice_id', '=', false]]);
      expect((await button('x_ledger_line', [invoiceLine, paymentLine], 'th_acc.reconcile')).status).toBe(200);
      expect(await read('x_invoice', ids.invoice, ['x_payment_state'])).toMatchObject({ x_payment_state: 'paid' });
    });

    it('issues a credit note with a reason against an open invoice', async () => {
      const invoice = await create('x_invoice', { x_company_id: ids.company, x_currency_id: ids.thb, x_company_currency_id: ids.thb, x_partner_id: ids.buyer,
        x_date: '2026-03-11', x_receivable_id: ids.receivable,
        x_item_ids: [{ op: 'create', values: { x_name: 'Service', x_account_id: ids.revenue, x_amount: -1000, x_tax_id: ids.vat } }] }, tokens.clerk);
      expect((await button('x_invoice', [invoice], 'th_acc.invoice_post')).status).toBe(200);
      expect((await button('x_invoice', [invoice], 'th_acc.credit_note')).status).toBe(200);
      const note = (await searchRead('x_invoice', [['x_origin_id', '=', invoice]], ['id']))[0]!.id as number;
      rejected(await button('x_invoice', [note], 'th_acc.invoice_post'), /need the original invoice and a reason/);
      await ok('model/x_invoice/write', { ids: [note], values: { x_reason: 'Price correction' } }, tokens.clerk);
      expect((await button('x_invoice', [note], 'th_acc.invoice_post')).status).toBe(200);
      const posted = await read('x_invoice', note, ['x_name', 'x_amount_total']);
      expect(posted.x_name).toMatch(/^CN\/\d{4}\/0001$/);
      expect(posted.x_amount_total).toBe(-1070);
    });
  });
}

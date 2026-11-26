/**
 * T33 no-code proof: a Sales/CRM app built only through the surfaces a tenant administrator has
 * (Studio API, ir.* records, mail/report/product/uom/tax records, NX-Expr, sandboxed scripts) over
 * HTTP, then used by sales users. Platform modules (base, mail, report, uom, product, account_core)
 * are installed; no application module or engine code is written.
 *
 * Test-harness-only steps (not tenant configuration): user passwords are provisioned through
 * AuthService (there is no HTTP endpoint for it), the SMTP transport and the PDF renderer are stubbed,
 * and the scheduler tick is driven by calling SchedulerService.runDue (apps/api runs no worker loop).
 * Each is listed as a gap in docs/nocode-sales-proof.md. Steps blocked by a gap are it.todo with the
 * gap id in the title.
 */
import 'reflect-metadata';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SchedulerService } from '@nexa/engine';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';
import { ReportPdfService } from '../src/engine/report-pdf.service';
import { SmtpMailService } from '../src/engine/smtp-mail.service';

const TENANT = 'nocodesales';
const PASSWORDS = { admin: 'ncs-admin-password-unique', alice: 'ncs-alice-password-unique', bob: 'ncs-bob-password-unique' };
const ORDER = 'x_sale_order';
const LINE = 'x_sale_order_line';

type Json = Record<string, unknown>;
interface Res { status: number; body: Json }

let app: INestApplication;
let base: URL;
let engine: EngineService;
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};

async function call(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<Res> {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: Json = {};
  if (text) {
    try { parsed = JSON.parse(text) as Json; } catch { parsed = { raw: text.slice(0, 200) }; }
  }
  return { status: response.status, body: parsed };
}
const post = (path: string, body: unknown, token: string) => call('POST', path, body, token);

/** Assert a status, failing with the response body so gaps are visible in the test output. */
function expectStatus(res: Res, status = 200): Json {
  if (res.status !== status) throw new Error(`expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body).slice(0, 600)}`);
  return res.body;
}
/** A 4xx rejection whose error message matches (documents an engine limit). */
function expectRejected(res: Res, message: RegExp): void {
  expect(res.status, JSON.stringify(res.body)).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  expect(JSON.stringify(res.body)).toMatch(message);
}
async function ok(path: string, body: unknown, token = tokens.admin!): Promise<Json> {
  return expectStatus(await post(path, body, token));
}
async function create(model: string, values: Json, token = tokens.admin!): Promise<number> {
  return ((await ok(`model/${model}/create`, { values }, token)).ids as number[])[0]!;
}
async function read(model: string, id: number, fields: string[], token = tokens.admin!): Promise<Json> {
  return ((await ok(`model/${model}/read`, { ids: [id], fields }, token)).records as Json[])[0]!;
}
async function searchRead(model: string, domain: unknown[], fields: string[], token = tokens.admin!): Promise<Json[]> {
  return (await ok(`model/${model}/search_read`, { domain, fields }, token)).records as Json[];
}
async function studioField(model: string, name: string, def: Json): Promise<void> {
  await ok('studio/field', { model, name, ...def });
}
async function login(login: string, password: string): Promise<string> {
  return expectStatus(await post('auth/login', { tenant: TENANT, login, password }, '')).accessToken as string;
}

// ---- minimal SSE client (node:http, no dependency) ----
interface SseEvent { event: string; data: string }
interface SseClient { status: number; events: SseEvent[]; close(): void; waitFor(pred: (e: SseEvent[]) => boolean, ms?: number): Promise<void> }
function sse(path: string, token: string): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    const client: SseClient = {
      status: 0, events: [], close: () => req.destroy(),
      waitFor: async (pred, ms = 4_000) => {
        const end = Date.now() + ms;
        while (!pred(client.events) && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
        if (!pred(client.events)) throw new Error(`SSE condition not met; got ${JSON.stringify(client.events)}`);
      },
    };
    const req: ClientRequest = httpRequest(new URL(path, base), { headers: { accept: 'text/event-stream', authorization: `Bearer ${token}` } }, (res: IncomingMessage) => {
      client.status = res.statusCode ?? 0;
      res.setEncoding('utf8');
      let buffer = '';
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let at: number;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const ev: SseEvent = { event: 'message', data: '' };
          let isEvent = false;
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) { ev.event = line.slice(7); isEvent = true; }
            else if (line.startsWith('data: ')) { ev.data += line.slice(6); isEvent = true; }
          }
          if (isEvent) client.events.push(ev);
        }
      });
      res.on('error', () => {});
      resolve(client);
    });
    req.on('error', (err) => (client.status ? undefined : reject(err)));
    req.end();
  });
}

const today = () => new Date().toISOString().slice(0, 10);
const year = () => today().slice(0, 4);

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', TENANT);
  vi.stubEnv('NEXA_MODULES', 'base,mail,report,uom,product,account_core');
  vi.stubEnv('NEXA_BUS_HEARTBEAT_MS', '100');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  engine = app.get(EngineService);
  await engine.tenant(TENANT);
  // harness: the only admin credential of a fresh tenant comes from the provisioning CLI
  await app.get(AuthService).provisionPassword(TENANT, 'admin', PASSWORDS.admin);
  tokens.admin = await login('admin', PASSWORDS.admin);
  // harness: no real Chromium / SMTP in unit runs
  vi.spyOn(app.get(ReportPdfService), 'render').mockResolvedValue(new TextEncoder().encode('%PDF-1.7\n% stub\n%%EOF\n'));
}, 120_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe('T33 no-code Sales app, built over HTTP by an administrator', { timeout: 120_000 }, () => {
  it('sets up companies, sales users and master data through the generic API', async () => {
    const [company] = await searchRead('res.company', [], ['id', 'currency_id']);
    ids.companyA = company!.id as number;
    ids.companyB = await create('res.company', { name: 'Nexa Sales B' });
    const usd = await ok('model/res.currency/search_read', { domain: [['name', '=', 'USD']], fields: ['id', 'active'], context: { activeTest: false } });
    ids.usd = ((usd.records as Json[])[0]!).id as number;
    await ok('model/res.currency/write', { ids: [ids.usd], values: { active: true } });

    const group = async (code: string) => (await searchRead('res.groups', [['code', '=', code]], ['id']))[0]!.id as number;
    ids.groupUser = await group('base.group_user');
    ids.groupSystem = await group('base.group_system');
    // sales groups are plain res.groups records; salespeople get no Settings rights (GAP-ACL-1 closed)
    ids.groupSales = await create('res.groups', { name: 'Sales / User', code: 'x_sales.user', implied_ids: [{ op: 'set', ids: [ids.groupUser] }] });
    ids.groupSalesManager = await create('res.groups', {
      name: 'Sales / Manager', code: 'x_sales.manager', implied_ids: [{ op: 'set', ids: [ids.groupSales] }],
    });
    for (const [user, name] of [['alice', 'Alice Seller'], ['bob', 'Bob Seller']] as const) {
      ids[user] = await create('res.users', {
        name, login: user, company_id: ids.companyA, company_ids: [{ op: 'set', ids: [ids.companyA, ids.companyB] }],
        group_ids: [{ op: 'set', ids: [ids.groupSales] }],
      });
      // harness: GAP-AUTH-1 (no HTTP endpoint to set a password / invite a user)
      await app.get(AuthService).provisionPassword(TENANT, user, PASSWORDS[user]);
      tokens[user] = await login(user, PASSWORDS[user]);
    }
    ids.admin = (await searchRead('res.users', [['login', '=', 'admin']], ['id']))[0]!.id as number;

    // units, products, pricelist, taxes (T30 primitives configured as data)
    const unitCat = await create('uom.category', { name: 'Unit' });
    ids.uomUnit = await create('uom.uom', { name: 'Units', category_id: unitCat, factor: 1, rounding: 1 });
    ids.uomDozen = await create('uom.uom', { name: 'Dozens', category_id: unitCat, factor: 12, rounding: 1 });
    const tmplChair = await create('product.template', { name: 'Office Chair', uom_id: ids.uomUnit, currency_id: ids.usd, list_price: 120 });
    const tmplDesk = await create('product.template', { name: 'Standing Desk', uom_id: ids.uomUnit, currency_id: ids.usd, list_price: 450 });
    ids.chair = await create('product.product', { name: 'Office Chair', product_tmpl_id: tmplChair, default_code: 'CHAIR' });
    ids.desk = await create('product.product', { name: 'Standing Desk', product_tmpl_id: tmplDesk, default_code: 'DESK' });
    ids.pricelistVip = await create('product.pricelist', { name: 'VIP', currency_id: ids.usd });
    await create('product.pricelist.item', { name: 'VIP chair', pricelist_id: ids.pricelistVip, product_id: ids.chair, compute_price: 'fixed', amount: 100 });
    ids.vat7 = await create('account.tax', { name: 'VAT 7%', amount_type: 'percent', amount: 7 });

    // the platform primitive itself works through RPC (reference values for the no-code app below)
    const quote = await ok('model/product.pricelist/call/quote', { ids: [ids.pricelistVip], args: [{ productId: ids.chair, quantity: 2 }] });
    expect(quote.result).toMatchObject({ unitPrice: 100, currencyId: ids.usd });
    const taxes = await ok('model/account.tax/call/compute', { ids: [ids.vat7], args: [100, ids.usd, 2] });
    expect(taxes.result).toMatchObject({ totalExcludingTax: 200, totalTax: 14, totalIncludingTax: 214 });
  });

  it('models x_sale_order / x_sale_order_line with Studio: fields, mixins, tracking, precision, expressions', async () => {
    await ok('studio/model', { name: ORDER, description: 'Sales Order' });
    await ok('studio/model', { name: LINE, description: 'Sales Order Line' });
    // chatter + activities on the order (T24/T25 mixins), before tracked fields are added
    await ok('studio/mixin/attach', { model: ORDER, mixin: 'mail.thread' });
    await ok('studio/mixin/attach', { model: ORDER, mixin: 'mail.activity.mixin' });

    // partner pricelist lives on the partner (Studio field on a module model)
    await studioField('res.partner', 'x_pricelist_id', { type: 'many2one', comodel: 'product.pricelist', label: 'Pricelist' });

    // ---- order header ----
    // numbered from the ir.sequence on create (sequence_next, GAP-SEQ-1 closed)
    await studioField(ORDER, 'x_name', { type: 'char', label: 'Order Reference', defaultExpr: "sequence_next('x_sale.order')" });
    await studioField(ORDER, 'x_partner_id', { type: 'many2one', comodel: 'res.partner', label: 'Customer', required: true, tracking: true });
    await studioField(ORDER, 'x_date', { type: 'date', label: 'Order Date', defaultExpr: 'today' });
    await studioField(ORDER, 'x_state', {
      type: 'selection', label: 'Status', tracking: true, defaultExpr: "'draft'",
      selection: [['draft', 'Quotation'], ['sent', 'Quotation Sent'], ['sale', 'Sales Order'], ['done', 'Locked'], ['cancel', 'Cancelled']],
    });
    await studioField(ORDER, 'x_currency_id', { type: 'many2one', comodel: 'res.currency', label: 'Currency' });
    await studioField(ORDER, 'x_pricelist_id', { type: 'many2one', comodel: 'product.pricelist', label: 'Pricelist' });
    await studioField(ORDER, 'x_company_id', { type: 'many2one', comodel: 'res.company', label: 'Company', defaultExpr: 'company.id' });
    await studioField(ORDER, 'x_user_id', { type: 'many2one', comodel: 'res.users', label: 'Salesperson', defaultExpr: 'user.id' });
    await studioField(ORDER, 'x_note', { type: 'text', label: 'Terms and conditions' });
    // totals: maintained by a server action (see GAP-O2M-1 / GAP-COMP-1), stored and tracked
    for (const [name, label] of [['x_amount_untaxed', 'Untaxed Amount'], ['x_amount_tax', 'Taxes'], ['x_amount_total', 'Total']] as const) {
      await studioField(ORDER, name, { type: 'monetary', currencyField: 'x_currency_id', label, aggregator: 'sum', tracking: name === 'x_amount_total' });
    }

    // ---- order line ----
    await studioField(LINE, 'x_order_id', { type: 'many2one', comodel: ORDER, label: 'Order', required: true });
    await studioField(LINE, 'x_product_id', { type: 'many2one', comodel: 'product.product', label: 'Product', required: true });
    await studioField(LINE, 'x_name', { type: 'char', label: 'Description' });
    await studioField(LINE, 'x_qty', { type: 'float', label: 'Quantity', digits: 'Product Unit of Measure' });
    await studioField(LINE, 'x_uom_id', { type: 'many2one', comodel: 'uom.uom', label: 'Unit' });
    await studioField(LINE, 'x_price_unit', { type: 'float', label: 'Unit Price', digits: 'Product Price' });
    await studioField(LINE, 'x_discount', { type: 'float', label: 'Discount (%)', digits: 'Discount' });
    await studioField(LINE, 'x_tax_ids', { type: 'many2many', comodel: 'account.tax', label: 'Taxes' });
    // stored NX-Expr compute over local scalars (T18); pure round() is allowed in stored computes
    await studioField(LINE, 'x_price_subtotal', {
      type: 'float', label: 'Subtotal', store: true, computeExpr: 'round((x_qty or 0) * (x_price_unit or 0) * (1 - (x_discount or 0) / 100), 2)',
    });
    // non-stored compute may traverse relations (read with the caller's access)
    await studioField(LINE, 'x_product_code', { type: 'char', label: 'Internal Reference', computeExpr: 'x_product_id.default_code' });
    // line tax through the account.tax primitive (tax_compute, GAP-PRIM-1); non-stored because it reads tax records
    await studioField(LINE, 'x_price_tax', {
      type: 'float', label: 'Tax',
      computeExpr: "[tax_compute(x_tax_ids, (x_price_unit or 0) * (1 - (x_discount or 0) / 100), x_qty or 0, x_product_id, x_order_id.x_partner_id, x_order_id.x_currency_id)].sum('tax')",
    });
    // the order's lines (one2many, GAP-O2M-1 closed); the inverse must be a many2one back to the order
    expectRejected(await post('studio/field', { model: ORDER, name: 'x_bad_ids', type: 'one2many', comodel: LINE, inverseName: 'x_product_id' }, tokens.admin!), /must be a stored many2one/);
    expectRejected(await post('studio/field', { model: ORDER, name: 'x_bad_ids', type: 'one2many', comodel: LINE }, tokens.admin!), /inverse/);
    await studioField(ORDER, 'x_line_ids', { type: 'one2many', comodel: LINE, inverseName: 'x_order_id', label: 'Order Lines' });

    // model-level NX-Expr constraint (T18)
    await ok('studio/expressions', {
      model: LINE,
      // description from product as an onchange (probed below: the onchange draft still holds ids only, GAP-REL-1)
      onchange: { x_product_id: "[['x_name', x_product_id.name]]" },
      constraints: [{ name: 'x_discount_range', expression: '(x_discount or 0) >= 0 and (x_discount or 0) <= 100', fields: ['x_discount'], message: 'Discount must be between 0 and 100' }],
    });

    // ---- probes of what Studio cannot express (asserted so a fix flips the test) ----
    // GAP-COMP-1 closed (T35a): stored computes may depend on relational paths
    const storedRelational = await post('studio/field', {
      model: LINE, name: 'x_list_price', type: 'float', store: true, computeExpr: 'x_product_id.product_tmpl_id.list_price',
    }, tokens.admin!);
    expect(storedRelational.status, JSON.stringify(storedRelational.body)).toBe(200);
    // GAP-COMP-2 (kept): a precision NAME / currency is tenant data, so float_round / currency_round stay impure in stored computes
    expectRejected(await post('studio/field', {
      model: LINE, name: 'x_subtotal_cur', type: 'float', store: true, computeExpr: "float_round(x_qty * x_price_unit, 'Product Price')",
    }, tokens.admin!), /stored expression cannot use/);
    // GAP-SEARCH-1: search()/read_group() are reserved helper names (accepted at definition) but not
    // implemented for ORM expressions: reading such a field fails. Probed on a scratch model.
    await ok('studio/model', { name: 'x_probe', description: 'Probe' });
    await studioField('x_probe', 'x_line_count', { type: 'integer', computeExpr: `search('${LINE}', []).count()` });
    const probeId = await create('x_probe', {});
    // ... and the evaluation failure surfaces as an HTTP 500 (GAP-ERR-1), not a validation error
    expect((await post('model/x_probe/read', { ids: [probeId], fields: ['x_line_count'] }, tokens.admin!)).status).toBe(500);

    const fields = (await ok(`model/${ORDER}/fields_get`, {})).fields as Record<string, Json>;
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['message_ids', 'activity_ids', 'x_state', 'x_amount_total']));
  });

  it('grants the sales groups access rights and record rules as ir.model.access / ir.rule records (GAP-ACL-1, GAP-RULE-1)', async () => {
    for (const model of [ORDER, LINE]) {
      await create('ir.model.access', {
        name: `${model} sales user`, model_name: model, group_id: ids.groupSales, perm_read: true, perm_write: true, perm_create: true,
      });
      await create('ir.model.access', { name: `${model} sales manager`, model_name: model, group_id: ids.groupSalesManager, perm_unlink: true });
    }
    // salespeople see their own orders, managers all of them; every order is limited to the active companies
    await create('ir.rule', {
      name: 'Own orders', model_name: ORDER, group_ids: [{ op: 'set', ids: [ids.groupSales] }],
      domain_force: JSON.stringify([['x_user_id', '=', { $ctx: 'uid' }]]),
    });
    await create('ir.rule', { name: 'All orders', model_name: ORDER, group_ids: [{ op: 'set', ids: [ids.groupSalesManager] }], domain_force: '[]' });
    await create('ir.rule', { name: 'Order company', model_name: ORDER, domain_force: "[['x_company_id', 'in', companyIds]]" });
    await create('ir.rule', {
      name: 'Own order lines', model_name: LINE, group_ids: [{ op: 'set', ids: [ids.groupSales] }],
      domain_force: JSON.stringify([['x_order_id.x_user_id', '=', { $ctx: 'uid' }]]),
    });
    await create('ir.rule', { name: 'All order lines', model_name: LINE, group_ids: [{ op: 'set', ids: [ids.groupSalesManager] }], domain_force: '[]' });
    // invalid domains and lock-out attempts are refused
    expectRejected(await post('model/ir.rule/create', { values: { name: 'bad', model_name: ORDER, domain_force: '[["x_nope", "=", 1]]' } }, tokens.admin!), /invalid domain/);
    expectRejected(await post('model/ir.rule/create', { values: { name: 'lock', model_name: 'res.users', domain_force: '[["id", "=", 0]]' } }, tokens.admin!), /managed by modules/);
    // ... and salespeople cannot manage security
    expect((await post('model/ir.model.access/create', { values: { name: 'x', model_name: ORDER, perm_unlink: true } }, tokens.alice!)).status).toBe(403);
  });

  it('configures defaults, sequence, server actions, automations, buttons, cron, template and report as records', async () => {
    // ir.default: the order currency defaults to USD for everyone (company currency is not reachable from defaultExpr)
    await create('ir.default', { model_name: ORDER, field_name: 'x_currency_id', value_json: JSON.stringify(ids.usd) });
    // ir.sequence with a yearly date range, drawn by the x_name default (sequence_next)
    ids.sequence = await create('ir.sequence', {
      name: 'Sales Orders', code: 'x_sale.order', prefix: 'SO/%(year)s/', padding: 4, use_date_range: true, date_range_period: 'year',
    });

    const action = (values: Json) => create('ir.actions.server', values);
    // --- partner -> pricelist: declarative, the action expression follows the many2one (GAP-REL-1 closed) ---
    await action({
      key: 'ncs.order_pricelist', name: 'Pricelist from customer', model_name: ORDER, type: 'update_record',
      values_json: JSON.stringify({ x_pricelist_id: 'x_partner_id.x_pricelist_id' }),
    });
    // --- line defaults: description, unit and unit price from the pricelist primitive (GAP-PRIM-1 closed) ---
    await action({
      key: 'ncs.line_defaults', name: 'Line defaults from product', model_name: LINE, type: 'update_record', values_json: JSON.stringify({
        x_name: 'x_name or x_product_id.name',
        x_uom_id: 'x_uom_id or x_product_id.product_tmpl_id.uom_id',
        x_price_unit: 'x_price_unit or pricelist_price(x_order_id.x_pricelist_id, x_product_id, x_qty or 0, x_order_id.x_date, x_uom_id)',
      }),
    });
    // --- order totals from its lines: still a script, because a line change must write the order and stored
    //     relational computes are not allowed (GAP-COMP-1); the line tax comes from tax_compute (x_price_tax) ---
    await action({
      key: 'ncs.order_totals', name: 'Recompute order totals', model_name: LINE, type: 'script', code: `
        const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
        const orderIds = [...new Set(env.model('${LINE}').search([['id', 'in', records.ids]], { fields: ['x_order_id'] }).map((l) => l.x_order_id))];
        for (const orderId of orderIds) {
          const lines = env.model('${LINE}').search([['x_order_id', '=', orderId]], { fields: ['x_price_subtotal', 'x_price_tax'] });
          const untaxed = round2(lines.reduce((sum, line) => sum + (line.x_price_subtotal || 0), 0));
          const tax = round2(lines.reduce((sum, line) => sum + (line.x_price_tax || 0), 0));
          env.model('${ORDER}').write([orderId], { x_amount_untaxed: untaxed, x_amount_tax: tax, x_amount_total: round2(untaxed + tax) });
        }`,
    });
    // --- state machine: declarative actions (T19/T25) ---
    await action({ key: 'ncs.set_sale', name: 'Set confirmed', model_name: ORDER, type: 'update_record', values_json: JSON.stringify({ x_state: "'sale'" }) });
    await action({ key: 'ncs.confirm_note', name: 'Confirmation note', model_name: ORDER, type: 'post_message', message: "'Order confirmed. Total: ' + x_amount_total" });
    await action({ key: 'ncs.confirm', name: 'Confirm', model_name: ORDER, type: 'multi', child_keys: 'ncs.set_sale,ncs.confirm_note' });
    await action({ key: 'ncs.cancel', name: 'Cancel', model_name: ORDER, type: 'update_record', values_json: JSON.stringify({ x_state: "'cancel'" }) });
    await action({ key: 'ncs.mark_sent', name: 'Mark as sent', model_name: ORDER, type: 'update_record', values_json: JSON.stringify({ x_state: "'sent'" }) });
    // --- reminder activity for old quotations (create_record into mail.activity) ---
    await action({
      key: 'ncs.remind', name: 'Quotation follow-up', model_name: ORDER, type: 'create_record', target_model: 'mail.activity',
      values_json: JSON.stringify({ res_model: `'${ORDER}'`, res_id: 'id', summary: "'Follow up quotation'", date_deadline: 'today', user_id: 'x_user_id' }),
    });

    const rule = (values: Json) => create('ir.automation', values);
    await rule({ key: 'ncs.pricelist_on_create', model_name: ORDER, trigger: 'on_create', action: 'ncs.order_pricelist' });
    await rule({ key: 'ncs.pricelist_on_partner', model_name: ORDER, trigger: 'on_change_fields', trigger_field_names: 'x_partner_id', action: 'ncs.order_pricelist' });
    await rule({ key: 'ncs.line_defaults', model_name: LINE, trigger: 'on_create', action: 'ncs.line_defaults' });
    await rule({ key: 'ncs.line_totals', model_name: LINE, trigger: 'on_create_or_write', action: 'ncs.order_totals' });
    await rule({
      key: 'ncs.quotation_reminder', model_name: ORDER, trigger: 'on_time', action: 'ncs.remind', date_field: 'x_date',
      delay_minutes: 7 * 24 * 60, filter_domain: JSON.stringify([['x_state', 'in', ['draft', 'sent']]]),
    });
    await create('ir.cron', { key: 'ncs.time_rules', name: 'Time-based sales rules', interval_number: 1, interval_type: 'days', builtin: 'automation.on_time', user_id: ids.admin });

    const button = (values: Json) => create('ir.button', values);
    await button({ name: 'Confirm', model_name: ORDER, action: 'ncs.confirm', guard: "x_state in ['draft', 'sent']" });
    await button({ name: 'Cancel', model_name: ORDER, action: 'ncs.cancel', guard: "x_state in ['draft', 'sent', 'sale']" });
    await button({ name: 'Send by email', model_name: ORDER, action: 'ncs.mark_sent', guard: "x_state == 'draft'" });

    ids.template = await create('mail.template', {
      name: 'Sales: quotation', model_name: ORDER, email_to: 'x_partner_id.email',
      subject: 'Quotation {{ x_name or id }}',
      body_html: '<p>Dear {{ x_partner_id.name }},</p><p>Your quotation total is {{ x_amount_total | money(x_currency_id) }}.</p>'
        + '<ul>{% for line in x_line_ids %}<li>{{ line.x_name }} x {{ line.x_qty }}</li>{% endfor %}</ul>',
    });
    ids.report = await create('ir.actions.report', {
      name: 'Quotation / Order', model_name: ORDER,
      body_html: '<h1>Quotation {{ x_name or id }}</h1><p>{{ x_partner_id.name }}</p>'
        + '<table>{% for line in x_line_ids %}<tr><td>{{ line.x_name }}</td><td>{{ line.x_price_subtotal }}</td></tr>{% endfor %}</table>'
        + '<p>Untaxed {{ x_amount_untaxed }}</p><p>Taxes {{ x_amount_tax }}</p><p>Total {{ x_amount_total }}</p>',
    });
  });

  it('lets a salesperson create a quotation: defaults, partner pricelist, line pricing, subtotals and totals', async () => {
    const alice = tokens.alice!;
    ids.customer = await create('res.partner', { name: 'Acme Corp', email: 'buyer@acme.example', x_pricelist_id: ids.pricelistVip }, alice);
    ids.customer2 = await create('res.partner', { name: 'Globex', email: 'buyer@globex.example' }, alice);

    const defaults = (await ok(`model/${ORDER}/default_get`, { fields: ['x_state', 'x_user_id', 'x_company_id', 'x_currency_id', 'x_date'] }, alice)).values as Json;
    expect(defaults).toMatchObject({ x_state: 'draft', x_user_id: ids.alice, x_company_id: ids.companyA, x_currency_id: ids.usd, x_date: today() });

    ids.order = await create(ORDER, { x_partner_id: ids.customer }, alice);
    let order = await read(ORDER, ids.order, ['x_state', 'x_user_id', 'x_company_id', 'x_currency_id', 'x_pricelist_id', 'x_date'], alice);
    expect(order).toMatchObject({ x_state: 'draft', x_user_id: ids.alice, x_company_id: ids.companyA, x_currency_id: ids.usd, x_pricelist_id: ids.pricelistVip });
    // the order reference is drawn from the ir.sequence by the x_name default (GAP-SEQ-1 closed)
    expect((await read(ORDER, ids.order, ['x_name'], alice)).x_name).toBe(`SO/${year()}/0001`);

    // onchange probe: server actions now follow relations (GAP-REL-1), but the onchange draft is still flat,
    // so the product name is not reachable from an onchange expression (GAP-REL-2)
    const change = await ok(`model/${LINE}/onchange`, { values: { x_order_id: ids.order, x_product_id: ids.chair }, field: 'x_product_id' }, alice);
    // the handler runs but resolves the name to null (and would blank a typed description)
    expect(change.value).toEqual({ x_name: null });

    ids.line1 = await create(LINE, { x_order_id: ids.order, x_product_id: ids.chair, x_qty: 2, x_tax_ids: [{ op: 'set', ids: [ids.vat7] }] }, alice);
    ids.line2 = await create(LINE, { x_order_id: ids.order, x_product_id: ids.desk, x_qty: 1, x_discount: 10, x_tax_ids: [{ op: 'set', ids: [ids.vat7] }] }, alice);
    const line1 = await read(LINE, ids.line1, ['x_name', 'x_uom_id', 'x_price_unit', 'x_price_subtotal', 'x_product_code'], alice);
    expect(line1).toMatchObject({ x_name: 'Office Chair', x_uom_id: ids.uomUnit, x_price_unit: 100, x_price_subtotal: 200, x_product_code: 'CHAIR' });
    const line2 = await read(LINE, ids.line2, ['x_name', 'x_price_unit', 'x_price_subtotal'], alice);
    expect(line2).toMatchObject({ x_name: 'Standing Desk', x_price_unit: 450, x_price_subtotal: 405 });
    // the order lists its lines (one2many, GAP-O2M-1 closed)
    expect((await read(ORDER, ids.order, ['x_line_ids'], alice)).x_line_ids).toEqual([ids.line1, ids.line2]);

    order = await read(ORDER, ids.order, ['x_amount_untaxed', 'x_amount_tax', 'x_amount_total'], alice);
    expect(order).toEqual(expect.objectContaining({ x_amount_untaxed: 605, x_amount_tax: 42.35, x_amount_total: 647.35 }));

    // the line tax comes from the T30 tax primitive through tax_compute (GAP-PRIM-1 closed); same number as the RPC
    const reference = await ok('model/account.tax/call/compute', { ids: [ids.vat7], args: [405, ids.usd, 1] }, alice);
    expect(reference.result).toMatchObject({ totalTax: 28.35 });
    expect((await read(LINE, ids.line2, ['x_price_tax'], alice)).x_price_tax).toBe(28.35);

    // editing a line recomputes the stored subtotal and the order totals
    await ok(`model/${LINE}/write`, { ids: [ids.line1], values: { x_qty: 3 } }, alice);
    order = await read(ORDER, ids.order, ['x_amount_untaxed', 'x_amount_tax', 'x_amount_total'], alice);
    expect(order).toEqual(expect.objectContaining({ x_amount_untaxed: 705, x_amount_tax: 49.35, x_amount_total: 754.35 }));

    // NX-Expr constraint and named precision
    expectRejected(await post(`model/${LINE}/write`, { ids: [ids.line2], values: { x_discount: 150 } }, alice), /Discount must be between 0 and 100/);
    await ok(`model/${LINE}/write`, { ids: [ids.line2], values: { x_qty: 1.23456 } }, alice);
    expect((await read(LINE, ids.line2, ['x_qty'], alice)).x_qty).toBe(1.235);
    await ok(`model/${LINE}/write`, { ids: [ids.line2], values: { x_qty: 1 } }, alice);

    // a partner change refills the pricelist (on_change_fields automation) and is tracked in the chatter
    await ok(`model/res.partner/write`, { ids: [ids.customer2], values: { x_pricelist_id: ids.pricelistVip } }, tokens.admin!);
    await ok(`model/${ORDER}/write`, { ids: [ids.order], values: { x_partner_id: ids.customer2 } }, alice);
    await ok(`model/${ORDER}/write`, { ids: [ids.order], values: { x_partner_id: ids.customer } }, alice);
    // chatter internals are Settings-only for direct reads (GAP-MAIL-2): inspected as the administrator
    const tracked = await searchRead('mail.tracking.value', [['field', '=', 'x_partner_id']], ['new_value_char']);
    expect(tracked.map((t) => t.new_value_char)).toEqual(expect.arrayContaining(['Globex', 'Acme Corp']));
  });

  it('sends the quotation by email (template + T29 queue), prints it (T28) and runs the guarded state machine', async () => {
    const alice = tokens.alice!;
    // "Send by email" is two client calls: queue the template, then the guarded state button (GAP-ACT-1);
    // queueing a template mail is Settings-only, so the administrator queues it (GAP-MAIL-2)
    const queued = expectStatus(await post(`mail/templates/${ids.template}/queue`, { recordId: ids.order, requestId: '6f1c1d8e-3c55-4c1e-9d55-0e0a7d1c0a33' }, tokens.admin!), 201);
    expect(queued.messageId).toEqual(expect.any(Number));
    await ok(`model/${ORDER}/button`, { ids: [ids.order], action: 'ncs.mark_sent' }, alice);
    expect((await read(ORDER, ids.order, ['x_state'], alice)).x_state).toBe('sent');
    expectRejected(await post(`model/${ORDER}/button`, { ids: [ids.order], action: 'ncs.mark_sent' }, alice), /not allowed/);

    const deliver = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(app.get(SmtpMailService), 'transportFor').mockReturnValue({ deliver });
    expect(await ok('mail/queue/process', { limit: 5 })).toMatchObject({ sent: 1, failed: 0 });
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ recipients: ['buyer@acme.example'], subject: `Quotation SO/${year()}/0001` }));
    const sent = deliver.mock.calls[0]![0] as { bodyHtml: string };
    expect(sent.bodyHtml).toContain('Dear Acme Corp');
    expect(sent.bodyHtml).toContain('754.35');
    // the template lists the order lines through the one2many (GAP-O2M-1 closed)
    expect(sent.bodyHtml).toContain('<li>Office Chair x 3</li><li>Standing Desk x 1</li>');

    // print: HTML through the report action, PDF through the report endpoint (GAP-ACT-1: not a button)
    const html = await ok('model/ir.actions.report/call/render_html', { ids: [ids.report], args: [[ids.order]] }, alice);
    const content = ((html.result as Json[])[0]!).content as string;
    expect(content).toContain('Acme Corp');
    expect(content).toContain('Total 754.35');
    expect(content).toContain('<tr><td>Office Chair</td><td>300</td></tr><tr><td>Standing Desk</td><td>405</td></tr>');
    const pdf = await fetch(new URL(`/api/reports/${ids.report}/pdf`, base), {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${alice}` }, body: JSON.stringify({ recordId: ids.order }),
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
    expect(new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 5))).toBe('%PDF-');

    // Confirm: guard draft/sent, sets 'sale', posts a chatter note; state change is tracked
    await ok(`model/${ORDER}/button`, { ids: [ids.order], action: 'ncs.confirm' }, alice);
    expect((await read(ORDER, ids.order, ['x_state'], alice)).x_state).toBe('sale');
    expectRejected(await post(`model/${ORDER}/button`, { ids: [ids.order], action: 'ncs.confirm' }, alice), /not allowed/);
    const messages = await searchRead('mail.message', [['model', '=', ORDER], ['res_id', '=', ids.order]], ['body', 'tracking_value_ids']);
    expect(messages.some((m) => String(m.body).includes('Order confirmed. Total: 754.35'))).toBe(true);
    const stateTracking = await searchRead('mail.tracking.value', [['field', '=', 'x_state']], ['old_value_char', 'new_value_char']);
    expect(stateTracking).toEqual(expect.arrayContaining([
      expect.objectContaining({ old_value_char: 'Quotation', new_value_char: 'Quotation Sent' }),
      expect.objectContaining({ old_value_char: 'Quotation Sent', new_value_char: 'Sales Order' }),
    ]));
    const totalTracking = await searchRead('mail.tracking.value', [['field', '=', 'x_amount_total']], ['new_value_float']);
    expect(totalTracking.map((t) => t.new_value_float)).toContain(754.35);

    // Cancel from a confirmed order, then nothing else applies
    await ok(`model/${ORDER}/button`, { ids: [ids.order], action: 'ncs.cancel' }, alice);
    expect((await read(ORDER, ids.order, ['x_state'], alice)).x_state).toBe('cancel');
    expectRejected(await post(`model/${ORDER}/button`, { ids: [ids.order], action: 'ncs.confirm' }, alice), /not allowed/);
    expectRejected(await post(`model/${ORDER}/button`, { ids: [ids.order], action: 'ncs.cancel' }, alice), /not allowed/);
  });

  it('schedules a follow-up activity on quotations older than 7 days (on_time automation + ir.cron)', async () => {
    const bob = tokens.bob!;
    ids.bobOrder = await create(ORDER, { x_partner_id: ids.customer2 }, bob);
    await create(LINE, { x_order_id: ids.bobOrder, x_product_id: ids.desk, x_qty: 1 }, bob);
    expect((await read(ORDER, ids.bobOrder, ['x_user_id', 'x_amount_total'], bob))).toMatchObject({ x_user_id: ids.bob, x_amount_total: 450 });

    // harness: apps/api has no scheduler worker (GAP-CRON-1); this is the platform tick, 8 days later
    const handle = await engine.tenant(TENANT);
    const later = new Date(Date.now() + 8 * 24 * 3600 * 1000);
    const run = await new SchedulerService(handle.env({ uid: ids.admin! })).runDue(new Map(), 10, later);
    expect(run).toMatchObject({ completed: ['ncs.time_rules'], failed: [] });

    const activities = await searchRead('mail.activity', [['res_model', '=', ORDER]], ['res_id', 'user_id', 'summary'], tokens.admin!);
    expect(activities).toEqual([expect.objectContaining({ res_id: ids.bobOrder, user_id: ids.bob, summary: 'Follow up quotation' })]);
    const state = await read(ORDER, ids.bobOrder, ['activity_ids', 'activity_state'], bob);
    expect((state.activity_ids as number[]).length).toBe(1);
  });

  it('imports three orders with their lines through /import and exports them', async () => {
    const bob = tokens.bob!;
    // one file: the lines are nested under their order through the one2many (GAP-O2M-1 closed)
    const orders = expectStatus(await post(`model/${ORDER}/import`, {
      header: ['id', 'x_partner_id', 'x_note', 'x_line_ids/x_product_id', 'x_line_ids/x_qty', 'x_line_ids/x_tax_ids'],
      rows: [
        ['so_imp_1', 'Acme Corp', 'Imported 1', 'Office Chair', 2, 'VAT 7%'],
        ['so_imp_2', 'Globex', 'Imported 2', 'Standing Desk', 1, 'VAT 7%'],
        ['so_imp_3', 'Acme Corp', 'Imported 3', 'Office Chair', 1, null],
        ['', '', '', 'Standing Desk', 1, null],
      ],
    }, bob));
    expect(orders).toMatchObject({ ok: true, created: 7 });
    expect(orders.ids).toHaveLength(3);
    const orderIds = orders.ids as number[];
    const exported = await ok(`model/${ORDER}/export`, { ids: orderIds, fields: ['id', 'x_partner_id', 'x_user_id', 'x_state', 'x_amount_total'] }, bob);
    expect(exported.rows).toEqual([
      ['__import__.so_imp_1', 'Acme Corp', 'Bob Seller', 'draft', 214],
      ['__import__.so_imp_2', 'Globex', 'Bob Seller', 'draft', 481.5],
      ['__import__.so_imp_3', 'Acme Corp', 'Bob Seller', 'draft', 550],
    ]);
    const csv = await ok(`model/${LINE}/export`, { domain: [['x_order_id', 'in', orderIds]], fields: ['x_order_id/id', 'x_name', 'x_price_unit', 'x_price_subtotal'], format: 'csv' }, bob);
    expect(csv.csv).toContain('__import__.so_imp_1,Office Chair,100,200');
  });

  it('pushes a bus event to the salesperson when an order they follow gets a message', async () => {
    const alice = tokens.alice!;
    const [alicePartner] = await searchRead('res.users', [['id', '=', ids.alice!]], ['partner_id']);
    const followers = await searchRead('mail.followers', [['res_model', '=', ORDER], ['res_id', '=', ids.order!]], ['partner_id']); // GAP-MAIL-2: admin inspection
    expect(followers.map((f) => f.partner_id)).toContain(alicePartner!.partner_id);

    const stream = await sse('/api/bus', alice);
    expect(stream.status).toBe(200);
    try {
      await stream.waitFor((e) => e.some((x) => x.event === 'bus.ready'));
      // the manager comments on the order through the mail.thread mixin method
      await ok(`model/${ORDER}/call/message_post`, { ids: [ids.order], args: [{ body: 'Customer called about delivery' }] });
      await stream.waitFor((e) => e.some((x) => x.event === 'mail.message.posted'));
      const event = stream.events.find((x) => x.event === 'mail.message.posted')!;
      expect(JSON.parse(event.data)).toMatchObject({ payload: { model: ORDER, res_id: ids.order } });
    } finally {
      stream.close();
    }
  });

  it('salespeople see only their own orders, managers all; plain users none (GAP-ACL-1, GAP-RULE-1)', async () => {
    expect(await searchRead(ORDER, [['id', '=', ids.order!]], ['x_user_id'], tokens.bob!)).toEqual([]);
    expect((await post(`model/${ORDER}/write`, { ids: [ids.order!], values: { x_note: 'x' } }, tokens.bob!)).status).toBe(403);
    const mine = await searchRead(ORDER, [], ['x_user_id'], tokens.bob!);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((o) => o.x_user_id === ids.bob)).toBe(true);
    expect(await searchRead(LINE, [['x_order_id', '=', ids.order!]], ['id'], tokens.bob!)).toEqual([]);
    // a sales manager (no Settings rights either) sees every order of the company
    const all = (await searchRead(ORDER, [], ['x_user_id'])).length;
    await ok('model/res.users/write', { ids: [ids.bob], values: { group_ids: [{ op: 'set', ids: [ids.groupSalesManager] }] } });
    const managed = await searchRead(ORDER, [], ['x_user_id'], tokens.bob!);
    expect(managed.length).toBe(all);
    expect(managed.some((o) => o.x_user_id === ids.alice)).toBe(true);
    await ok('model/res.users/write', { ids: [ids.bob], values: { group_ids: [{ op: 'set', ids: [ids.groupSales] }] } });
    expect(await searchRead(ORDER, [['id', '=', ids.order!]], ['id'], tokens.bob!)).toEqual([]);
    // a plain internal user (no sales group) has no access right on the orders
    const plain = await create('res.users', {
      name: 'Carol Plain', login: 'carol', company_id: ids.companyA, company_ids: [{ op: 'set', ids: [ids.companyA] }],
      group_ids: [{ op: 'set', ids: [ids.groupUser] }],
    });
    expect(plain).toEqual(expect.any(Number));
    await app.get(AuthService).provisionPassword(TENANT, 'carol', 'ncs-carol-password-unique');
    const carol = await login('carol', 'ncs-carol-password-unique');
    expect((await post(`model/${ORDER}/search_read`, { fields: ['id'] }, carol)).status).toBe(403);
  });

  it('restricts orders to x_company_id in the current company (GAP-RULE-1 multi-company)', async () => {
    const alice = tokens.alice!;
    await ok('model/res.users/write', { ids: [ids.alice], values: { company_id: ids.companyB } });
    const orderB = await create(ORDER, { x_partner_id: ids.customer }, alice);
    const visible = async () => (await searchRead(ORDER, [['id', 'in', [ids.order!, orderB]]], ['id', 'x_company_id'], alice));
    expect(await visible()).toEqual([{ id: orderB, x_company_id: ids.companyB }]);
    await ok('model/res.users/write', { ids: [ids.alice], values: { company_id: ids.companyA } });
    expect(await visible()).toEqual([{ id: ids.order, x_company_id: ids.companyA }]);
  });

  it('numbers every order from the ir.sequence on create, imports included (GAP-SEQ-1)', async () => {
    const [seq] = await searchRead('ir.sequence', [['id', '=', ids.sequence!]], ['prefix', 'use_date_range']);
    expect(seq).toMatchObject({ prefix: 'SO/%(year)s/', use_date_range: true });
    const names = (await searchRead(ORDER, [], ['x_name'])).map((o) => o.x_name as string);
    expect(names.length).toBeGreaterThan(4);
    expect(names.every((name) => new RegExp(`^SO/${year()}/\\d{4}$`).test(name))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('edits lines inline on the order through the one2many (GAP-O2M-1)', async () => {
    const alice = tokens.alice!;
    const orderId = await create(ORDER, {
      x_partner_id: ids.customer,
      x_line_ids: [{ op: 'create', values: { x_product_id: ids.desk, x_qty: 2, x_tax_ids: [{ op: 'set', ids: [ids.vat7] }] } }],
    }, alice);
    let lines = (await read(ORDER, orderId, ['x_line_ids'], alice)).x_line_ids as number[];
    expect(lines).toHaveLength(1);
    expect(await read(LINE, lines[0]!, ['x_name', 'x_price_unit', 'x_price_subtotal'], alice)).toMatchObject({ x_name: 'Standing Desk', x_price_unit: 450, x_price_subtotal: 900 });
    await ok(`model/${ORDER}/write`, { ids: [orderId], values: { x_line_ids: [
      { op: 'update', id: lines[0], values: { x_qty: 1 } },
      { op: 'create', values: { x_product_id: ids.chair, x_qty: 1 } },
    ] } }, alice);
    lines = (await read(ORDER, orderId, ['x_line_ids'], alice)).x_line_ids as number[];
    expect(lines).toHaveLength(2);
    expect(await read(ORDER, orderId, ['x_amount_untaxed', 'x_amount_tax', 'x_amount_total'], alice))
      .toEqual(expect.objectContaining({ x_amount_untaxed: 550, x_amount_tax: 31.5, x_amount_total: 581.5 }));
    // deleting a line is a manager right (unlink is granted to Sales / Manager only)
    expect((await post(`model/${ORDER}/write`, { ids: [orderId], values: { x_line_ids: [{ op: 'delete', id: lines[1] }] } }, alice)).status).toBe(403);
    await ok(`model/${ORDER}/write`, { ids: [orderId], values: { x_line_ids: [{ op: 'delete', id: lines[1] }] } }, tokens.admin!);
    expect((await read(ORDER, orderId, ['x_line_ids'], alice)).x_line_ids).toEqual([lines[0]]);
    ids.inlineOrder = orderId;
  });

  it('prices a line per dozen through the pricelist primitive with unit-of-measure conversion (GAP-PRIM-1)', async () => {
    const alice = tokens.alice!;
    const line = await create(LINE, { x_order_id: ids.inlineOrder, x_product_id: ids.chair, x_qty: 1, x_uom_id: ids.uomDozen }, alice);
    // VIP fixed price 100 per unit -> 1200 per dozen; the description still comes from the product
    expect(await read(LINE, line, ['x_name', 'x_uom_id', 'x_price_unit', 'x_price_subtotal'], alice))
      .toMatchObject({ x_name: 'Office Chair', x_uom_id: ids.uomDozen, x_price_unit: 1200, x_price_subtotal: 1200 });
  });

  it('previews never draw numbers and onchange needs the model access (review)', async () => {
    // default_get omits the sequence default instead of burning a number
    const defaults = (await ok(`model/${ORDER}/default_get`, { fields: ['x_name', 'x_state'] }, tokens.alice!)).values as Json;
    expect(defaults).toEqual(expect.objectContaining({ x_state: 'draft' }));
    expect(defaults).not.toHaveProperty('x_name');
    // a user without access to the lines cannot run their onchange
    const carol = await login('carol', 'ncs-carol-password-unique');
    expect((await post(`model/${LINE}/onchange`, { values: { x_product_id: ids.chair }, field: 'x_product_id' }, carol)).status).toBe(403);
  });

  // ---- scenario steps blocked by engine/API gaps (see docs/nocode-sales-proof.md) ----
  it.todo('GAP-ACT-1: "Send by email" and "Print" as single ir.button records (no mail/report action type)');
});

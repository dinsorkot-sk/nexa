/**
 * T3a: Sales order → customer invoice → posted ledger entry → payment → reconciliation, configured by an
 * administrator over the public HTTP API only (Studio, generic model API, ir.* records, buttons), on the
 * generic ADR 0004 primitives. No accounting module, hook, ModelDef or script is installed.
 *
 * Harness-only step (not tenant configuration): passwords are provisioned through AuthService (GAP-AUTH-1).
 * Jurisdiction-neutral: no tax lines yet (Thai VAT/WHT follow in T3b).
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/engine/auth.service';
import { EngineService } from '../src/engine/engine.service';

const TENANT = 'nocodeacct';
const PASSWORDS = { admin: 'nca-admin-password-unique', clerk: 'nca-clerk-password-unique', clerk_th: 'nca-clerk-th-password-unique' };

type Json = Record<string, unknown>;
interface Res { status: number; body: Json }

let app: INestApplication;
let base: URL;
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};

async function post(path: string, body: unknown, token: string): Promise<Res> {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Json };
}
function expectStatus(res: Res, status = 200): Json {
  if (res.status !== status) throw new Error(`expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body).slice(0, 600)}`);
  return res.body;
}
function expectRejected(res: Res, message: RegExp): void {
  expect(res.status, JSON.stringify(res.body)).toBeGreaterThanOrEqual(400);
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(500);
  expect(JSON.stringify(res.body)).toMatch(message);
}
const ok = async (path: string, body: unknown, token = tokens.admin!) => expectStatus(await post(path, body, token));
const create = async (model: string, values: Json, token = tokens.admin!) =>
  ((await ok(`model/${model}/create`, { values }, token)).ids as number[])[0]!;
const read = async (model: string, id: number, fields: string[], token = tokens.admin!) =>
  ((await ok(`model/${model}/read`, { ids: [id], fields }, token)).records as Json[])[0]!;
const searchRead = async (model: string, domain: unknown[], fields: string[], token = tokens.admin!) =>
  (await ok(`model/${model}/search_read`, { domain, fields, order: 'id' }, token)).records as Json[];
const count = async (model: string, domain: unknown[] = [], token = tokens.admin!) =>
  (await ok(`model/${model}/search_count`, { domain }, token)).count as number;
const button = (model: string, recordIds: number[], action: string, token = tokens.clerk!) =>
  post(`model/${model}/button`, { ids: recordIds, action }, token);
const field = (model: string, name: string, def: Json) => ok('studio/field', { model, name, ...def });
const ref = async (model: string, domain: unknown[]) => ((await searchRead(model, domain, ['id']))[0]!).id as number;

/** Model + full CRUD for internal users; company isolation is added as ir.rule records below. */
async function studioModel(name: string, fields: [string, Json][]): Promise<void> {
  await ok('studio/model', { name, description: name });
  await create('ir.model.access', {
    name: `${name} users`, model_name: name, group_id: ids.groupUser,
    perm_read: true, perm_write: true, perm_create: true, perm_unlink: true,
  });
  for (const [fname, def] of fields) await field(name, fname, def);
}
async function action(key: string, model: string, values: Json, guard?: string): Promise<void> {
  await create('ir.actions.server', { key, model_name: model, ...values });
  if (guard !== undefined) await create('ir.button', { model_name: model, action: key, ...(guard ? { guard } : {}) });
}

const company = { type: 'many2one', comodel: 'res.company', required: true };
const currency = { type: 'many2one', comodel: 'res.currency', required: true };
const state = (states: [string, string][]) => ({ type: 'selection', selection: states, default: states[0]![0], required: true });
const docHeader: [string, Json][] = [
  ['x_company_id', company], ['x_currency_id', currency], ['x_company_currency_id', currency],
  ['x_partner_id', { type: 'many2one', comodel: 'res.partner', ondelete: 'restrict' }], ['x_date', { type: 'date', required: true }],
];
const headerValues = {
  x_company_id: 'record.x_company_id', x_currency_id: 'record.x_currency_id',
  x_company_currency_id: 'record.x_company_currency_id', x_partner_id: 'record.x_partner_id', x_date: 'record.x_date',
};
/** Ledger line mapping from a document item (`line`) of a document (`record`). */
const ledgerLineValues = (invoiceId: string) => ({
  x_company_id: 'record.x_company_id', x_currency_id: 'record.x_currency_id', x_company_currency_id: 'record.x_company_currency_id',
  x_partner_id: 'record.x_partner_id', x_account_id: 'line.x_account_id', x_amount_currency: 'line.x_amount', x_invoice_id: invoiceId,
  x_debit: 'line.x_amount > 0 ? currency_convert(line.x_amount, record.x_currency_id, record.x_company_currency_id, record.x_date, record.x_company_id) : 0',
  x_credit: 'line.x_amount < 0 ? -currency_convert(line.x_amount, record.x_currency_id, record.x_company_currency_id, record.x_date, record.x_company_id) : 0',
});

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXA_DATA_DIR', ':memory:');
  vi.stubEnv('NEXA_TENANTS', TENANT);
  vi.stubEnv('NEXA_MODULES', 'base,uom,product,account_core');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  base = new URL(await app.getUrl());
  // harness only: the clerk account and passwords (GAP-AUTH-1)
  const su = (await app.get(EngineService).tenant(TENANT)).env({ uid: 1 });
  const [mainCompany] = (await su.model('res.company').search([], { limit: 1, order: 'id' })).ids;
  const [groupUser] = (await su.model('res.groups').search([['code', '=', 'base.group_user']])).ids;
  await su.model('res.users').create({ name: 'Clerk', login: 'clerk', company_id: mainCompany, company_ids: [mainCompany], group_ids: [groupUser] });
  // moved to the Thai company by the administrator over HTTP (T3b)
  await su.model('res.users').create({ name: 'Thai clerk', login: 'clerk_th', company_id: mainCompany, company_ids: [mainCompany], group_ids: [groupUser] });
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

describe('T3a no-code Sales-to-ledger over HTTP', { timeout: 30_000 }, () => {
  it('configures the chart, ledger, documents, policies and buttons through Studio and ir.* records', async () => {
    ids.company = await ref('res.company', []);
    ids.groupUser = await ref('res.groups', [['code', '=', 'base.group_user']]);
    ids.usd = await ref('res.currency', [['name', '=', 'USD']]);
    ids.eur = await ref('res.currency', [['name', '=', 'EUR']]);
    await create('res.currency.rate', { currency_id: ids.eur, name: '2026-01-01', rate: 0.5 });

    // chart of accounts: a code is unique per company through a stored computed composite key
    await studioModel('x_ledger_account', [
      ['x_code', { type: 'char', required: true }], ['x_company_id', company],
      ['x_key', { type: 'char', unique: true, store: true, computeExpr: "x_code + ':' + x_company_id" }],
      ['x_active', { type: 'boolean', default: true }], ['x_deprecated', { type: 'boolean', default: false }],
      ['x_reconcile', { type: 'boolean', default: false }], ['x_partner_required', { type: 'boolean', default: false }],
    ]);
    // customer receivable account per partner; company lock dates (ratcheted, Settings-only)
    await field('res.partner', 'x_receivable_id', { type: 'many2one', comodel: 'x_ledger_account', ondelete: 'restrict' });
    await field('res.company', 'x_hard_lock', { type: 'date', ratchet: 'up', writeGroups: ['base.group_system'] });
    await field('res.company', 'x_soft_lock', { type: 'date', ratchet: 'up', writeGroups: ['base.group_system'] });

    await studioModel('x_sale_order', [...docHeader, ['x_state', state([['draft', 'Quotation'], ['sale', 'Sales order'], ['invoiced', 'Invoiced']])]]);
    await studioModel('x_sale_order_line', [
      ['x_order_id', { type: 'many2one', comodel: 'x_sale_order', required: true, ondelete: 'cascade' }],
      ['x_name', { type: 'char', required: true }], ['x_account_id', { type: 'many2one', comodel: 'x_ledger_account', required: true }],
      ['x_qty', { type: 'float', default: 1 }], ['x_price_unit', { type: 'float', default: 0 }],
      ['x_subtotal', { type: 'float', store: true, computeExpr: 'round(x_qty * x_price_unit, 2)' }],
      ['x_tax_id', { type: 'many2one', comodel: 'account.tax', ondelete: 'restrict' }],
    ]);
    await field('x_sale_order', 'x_line_ids', { type: 'one2many', comodel: 'x_sale_order_line', inverseName: 'x_order_id' });
    await field('x_sale_order', 'x_amount_total', { type: 'float', store: true, computeExpr: "x_line_ids.sum('x_subtotal')" });

    await studioModel('x_ledger_full', [['x_state', state([['locked', 'Locked']])]]);
    await studioModel('x_invoice', [...docHeader,
      ['x_state', state([['draft', 'Draft'], ['posted', 'Posted']])],
      ['x_order_id', { type: 'many2one', comodel: 'x_sale_order', ondelete: 'restrict' }],
      ['x_receivable_id', { type: 'many2one', comodel: 'x_ledger_account', required: true, checkCompany: true }],
    ]);
    await studioModel('x_invoice_item', [
      ['x_invoice_id', { type: 'many2one', comodel: 'x_invoice', required: true, ondelete: 'cascade' }],
      ['x_name', { type: 'char' }], ['x_account_id', { type: 'many2one', comodel: 'x_ledger_account', required: true }],
      ['x_amount', { type: 'float', required: true }],
      ['x_tax_id', { type: 'many2one', comodel: 'account.tax', ondelete: 'restrict' }],
      ['x_role', state([['base', 'Base'], ['tax', 'Tax'], ['receivable', 'Receivable']])],
      ['x_is_base', { type: 'boolean', store: true, computeExpr: "x_role == 'base'" }],
      ['x_is_tax', { type: 'boolean', store: true, computeExpr: "x_role == 'tax'" }],
    ]);
    await field('x_invoice', 'x_item_ids', { type: 'one2many', comodel: 'x_invoice_item', inverseName: 'x_invoice_id' });
    // an item is revenue unless it is the invoice receivable
    await field('x_invoice_item', 'x_is_revenue', { type: 'boolean', store: true, computeExpr: 'x_account_id != x_invoice_id.x_receivable_id' });
    await field('x_invoice', 'x_amount_total', { type: 'float', store: true, computeExpr: "-x_item_ids.filtered('x_is_revenue').sum('x_amount')" });

    await studioModel('x_ledger_move', [...docHeader,
      ['x_name', { type: 'char', unique: true }], ['x_ref', { type: 'char' }],
      ['x_state', state([['draft', 'Draft'], ['posted', 'Posted']])],
      ['x_invoice_id', { type: 'many2one', comodel: 'x_invoice', ondelete: 'restrict' }],
    ]);
    await studioModel('x_ledger_line', [
      ['x_state', state([['draft', 'Draft'], ['posted', 'Posted']])],
      ['x_move_id', { type: 'many2one', comodel: 'x_ledger_move', required: true, ondelete: 'cascade' }],
      ['x_account_id', { type: 'many2one', comodel: 'x_ledger_account', required: true, ondelete: 'restrict', checkCompany: true }],
      ['x_invoice_id', { type: 'many2one', comodel: 'x_invoice', ondelete: 'restrict' }],
      ['x_partner_id', { type: 'many2one', comodel: 'res.partner', ondelete: 'restrict' }],
      ['x_company_id', company], ['x_currency_id', currency], ['x_company_currency_id', currency],
      ['x_debit', { type: 'monetary', currencyField: 'x_company_currency_id', default: 0 }],
      ['x_credit', { type: 'monetary', currencyField: 'x_company_currency_id', default: 0 }],
      ['x_amount_currency', { type: 'monetary', currencyField: 'x_currency_id' }],
      ['x_balance', { type: 'monetary', store: true, computeExpr: 'float_round(x_debit - x_credit, 0.01)' }],
      ['x_match_amount', { type: 'monetary', currencyField: 'x_company_currency_id' }],
      ['x_residual', { type: 'float' }], ['x_residual_currency', { type: 'float' }],
      ['x_reconcilable', { type: 'boolean', store: true, computeExpr: 'x_account_id.x_reconcile' }],
      ['x_full_id', { type: 'many2one', comodel: 'x_ledger_full', ondelete: 'restrict' }],
      ['x_account_ok', { type: 'boolean', computeExpr: 'x_account_id.x_active && !x_account_id.x_deprecated && (!x_account_id.x_partner_required || x_partner_id != null)' }],
      ['x_company_ok', { type: 'boolean', computeExpr: 'x_account_id.x_company_id == x_company_id && x_move_id.x_company_id == x_company_id' }],
      ['x_currency_ok', { type: 'boolean', computeExpr: 'x_currency_id == x_move_id.x_currency_id && float_compare(x_balance, currency_convert(x_amount_currency, x_currency_id, x_company_currency_id, x_move_id.x_date, x_company_id), 0.01) == 0 && x_debit >= 0 && x_credit >= 0 && (x_debit == 0 || x_credit == 0)' }],
    ]);
    await field('x_ledger_move', 'x_line_ids', { type: 'one2many', comodel: 'x_ledger_line', inverseName: 'x_move_id' });
    await field('x_ledger_move', 'x_total', { type: 'monetary', store: true, computeExpr: "float_round(x_line_ids.sum('x_debit'), 0.01)" });
    await field('x_ledger_full', 'x_line_ids', { type: 'one2many', comodel: 'x_ledger_line', inverseName: 'x_full_id' });
    await studioModel('x_ledger_link', [
      ['x_state', state([['locked', 'Locked']])],
      ['x_positive_id', { type: 'many2one', comodel: 'x_ledger_line', required: true, ondelete: 'restrict' }],
      ['x_negative_id', { type: 'many2one', comodel: 'x_ledger_line', required: true, ondelete: 'restrict' }],
      ['x_amount', { type: 'float' }], ['x_positive_currency', { type: 'float' }], ['x_negative_currency', { type: 'float' }],
    ]);
    // the invoice reads its open amount from its reconcilable ledger lines
    await field('x_invoice', 'x_line_ids', { type: 'one2many', comodel: 'x_ledger_line', inverseName: 'x_invoice_id' });
    await field('x_invoice', 'x_residual', { type: 'float', computeExpr: "x_line_ids.filtered('x_reconcilable').sum('x_residual_currency')" });
    await field('x_invoice', 'x_payment_state', { type: 'char', computeExpr:
      "x_state != 'posted' ? 'not_paid' : (float_is_zero(x_residual, 0.01) ? 'paid' : (float_compare(abs(x_residual), abs(x_amount_total), 0.01) < 0 ? 'partial' : 'not_paid'))" });

    await studioModel('x_payment', [...docHeader,
      ['x_state', state([['draft', 'Draft'], ['posted', 'Posted']])],
      ['x_amount', { type: 'float', required: true }],
      ['x_bank_account_id', { type: 'many2one', comodel: 'x_ledger_account', required: true, checkCompany: true }],
      ['x_receivable_id', { type: 'many2one', comodel: 'x_ledger_account', required: true, checkCompany: true }],
    ]);
    await studioModel('x_payment_item', [
      ['x_payment_id', { type: 'many2one', comodel: 'x_payment', required: true, ondelete: 'cascade' }],
      ['x_account_id', { type: 'many2one', comodel: 'x_ledger_account', required: true }],
      ['x_amount', { type: 'float', required: true }],
    ]);
    await field('x_payment', 'x_item_ids', { type: 'one2many', comodel: 'x_payment_item', inverseName: 'x_payment_id' });

    // company isolation
    for (const model of ['x_ledger_account', 'x_sale_order', 'x_invoice', 'x_ledger_move', 'x_ledger_line', 'x_payment']) {
      await create('ir.rule', { name: `${model} companies`, model_name: model, domain_force: JSON.stringify([['x_company_id', 'in', { $ctx: 'company_ids' }]]) });
    }
    for (const [model, parent] of [['x_sale_order_line', 'x_order_id'], ['x_invoice_item', 'x_invoice_id'], ['x_payment_item', 'x_payment_id']]) {
      await create('ir.rule', { name: `${model} companies`, model_name: model, domain_force: JSON.stringify([[`${parent}.x_company_id`, 'in', { $ctx: 'company_ids' }]]) });
    }
    await create('ir.rule', { name: 'link companies', model_name: 'x_ledger_link', domain_force: JSON.stringify([
      ['x_positive_id.x_company_id', 'in', { $ctx: 'company_ids' }], ['x_negative_id.x_company_id', 'in', { $ctx: 'company_ids' }]]) });
    await create('ir.rule', { name: 'full companies', model_name: 'x_ledger_full', domain_force: JSON.stringify(['|',
      ['x_line_ids', '=', false], ['x_line_ids.x_company_id', 'in', { $ctx: 'company_ids' }]]) });

    // lifecycles: posted documents and entries are immutable
    await create('ir.lifecycle', { model: 'x_ledger_move', state_field: 'x_state', initial_state: 'draft', engine_fields: ['x_name'],
      locks: [{ states: ['posted'], writable: ['x_ref'], unlink: false, frozen_children: ['x_line_ids'] }] });
    await create('ir.lifecycle', { model: 'x_ledger_line', state_field: 'x_state', initial_state: 'draft',
      engine_fields: ['x_match_amount', 'x_residual', 'x_residual_currency', 'x_full_id'], locks: [{ states: ['posted'], writable: [], unlink: false }] });
    for (const model of ['x_ledger_full', 'x_ledger_link']) {
      await create('ir.lifecycle', { model, state_field: 'x_state', initial_state: 'locked', locks: [{ states: ['locked'], writable: [], unlink: false }],
        ...(model === 'x_ledger_link' ? { engine_fields: ['x_positive_id', 'x_negative_id', 'x_amount', 'x_positive_currency', 'x_negative_currency'] } : {}) });
    }
    for (const model of ['x_invoice', 'x_payment']) {
      await create('ir.lifecycle', { model, state_field: 'x_state', initial_state: 'draft', locks: [{ states: ['posted'], writable: [], unlink: false, frozen_children: ['x_item_ids'] }] });
    }
    await create('ir.date.lock', { model: 'x_ledger_move', date: 'x_date', when: "x_state == 'posted'", hard: 'x_company_id.x_hard_lock', soft: 'x_company_id.x_soft_lock', bypass_groups: ['base.group_system'] });
    await create('ir.sequence', { name: 'Journal', code: 'nca.journal', prefix: 'J/', padding: 4, implementation: 'no_gap' });

    // transitions
    await create('ir.transition', {
      model: 'x_ledger_move', key: 'post', from: ['draft'], to: 'posted', already: 'skip',
      checks: [
        { expr: "x_line_ids.count() >= 2 && float_is_zero(x_line_ids.sum('x_balance'), 0.01)", message: 'Unbalanced entry' },
        { expr: "x_line_ids.all('x_account_ok')", message: 'Invalid account or missing partner' },
        { expr: "x_line_ids.all('x_company_ok')", message: 'Company mismatch' },
        { expr: 'x_company_currency_id == x_company_id.currency_id', message: 'Company currency mismatch' },
        { expr: "x_line_ids.all('x_currency_ok')", message: 'Currency mismatch' },
      ],
      effects: [
        { type: 'sequence', field: 'x_name', code: "'nca.journal'", date: 'x_date', company: 'x_company_id' },
        { type: 'child_set', field: 'x_line_ids', values: { x_state: "'posted'", x_match_amount: 'x_balance', x_residual: 'x_balance', x_residual_currency: 'x_amount_currency' } },
      ],
    });
    for (const model of ['x_invoice', 'x_payment']) {
      await create('ir.transition', { model, key: 'post', from: ['draft'], to: 'posted', checks: [{ expr: 'x_item_ids.count() >= 2', message: 'Nothing to post' }] });
    }
    await create('ir.match.rule', {
      model: 'x_ledger_line', key: 'reconcile', eligible: "x_move_id.x_state == 'posted' && x_account_id.x_reconcile",
      group_by: ['x_account_id', 'x_company_id', 'x_partner_id', 'x_currency_id'],
      amount_field: 'x_match_amount', residual_field: 'x_residual', rounding: 0.01,
      secondary_amount_field: 'x_amount_currency', secondary_residual_field: 'x_residual_currency', secondary_rounding: 0.01,
      lock_parents: ['x_move_id'], full: { model: 'x_ledger_full', field: 'x_full_id' },
      link: { model: 'x_ledger_link', positive_field: 'x_positive_id', negative_field: 'x_negative_id', amount_field: 'x_amount', positive_secondary_field: 'x_positive_currency', negative_secondary_field: 'x_negative_currency' },
    });

    // Sales: confirm, then invoice the order lines as revenue items
    await action('nca.order_confirm', 'x_sale_order', { type: 'update_record', values_json: JSON.stringify({ x_state: "'sale'" }) }, "x_state == 'draft' && x_line_ids.count() > 0");
    await action('nca.order_create_invoice', 'x_sale_order', {
      type: 'create_record', target_model: 'x_invoice',
      values_json: JSON.stringify({ ...headerValues, x_order_id: 'record.id', x_receivable_id: 'record.x_partner_id.x_receivable_id' }),
      lines_field: 'x_item_ids', lines_source: 'record.x_line_ids',
      lines_values_json: JSON.stringify({ x_name: 'line.x_name', x_account_id: 'line.x_account_id', x_amount: '-line.x_subtotal', x_tax_id: 'line.x_tax_id' }),
    });
    await action('nca.order_mark_invoiced', 'x_sale_order', { type: 'update_record', values_json: JSON.stringify({ x_state: "'invoiced'" }) });
    await action('nca.order_invoice', 'x_sale_order', { type: 'multi', child_keys: 'nca.order_create_invoice,nca.order_mark_invoiced' }, "x_state == 'sale'");

    // Invoice posting: add the receivable item, create and post the entry, then post the invoice (one transaction)
    await action('nca.invoice_receivable', 'x_invoice', { type: 'create_record', target_model: 'x_invoice_item',
      values_json: JSON.stringify({ x_invoice_id: 'record.id', x_name: "'Receivable'", x_account_id: 'record.x_receivable_id', x_amount: "-record.x_item_ids.sum('x_amount')", x_role: "'receivable'" }) });
    await action('nca.invoice_entry', 'x_invoice', { type: 'create_record', target_model: 'x_ledger_move', then_transition: 'post',
      values_json: JSON.stringify({ ...headerValues, x_invoice_id: 'record.id' }),
      lines_field: 'x_line_ids', lines_source: 'record.x_item_ids', lines_values_json: JSON.stringify(ledgerLineValues('record.id')) });
    await action('nca.invoice_state', 'x_invoice', { type: 'transition', transition: 'post' });
    await action('nca.invoice_post', 'x_invoice', { type: 'multi', child_keys: 'nca.invoice_receivable,nca.invoice_entry,nca.invoice_state' }, "x_state == 'draft'");

    // Payment: bank debit and receivable credit items, posted entry, posted payment
    await action('nca.payment_bank', 'x_payment', { type: 'create_record', target_model: 'x_payment_item',
      values_json: JSON.stringify({ x_payment_id: 'record.id', x_account_id: 'record.x_bank_account_id', x_amount: 'record.x_amount' }) });
    await action('nca.payment_receivable', 'x_payment', { type: 'create_record', target_model: 'x_payment_item',
      values_json: JSON.stringify({ x_payment_id: 'record.id', x_account_id: 'record.x_receivable_id', x_amount: '-record.x_amount' }) });
    await action('nca.payment_entry', 'x_payment', { type: 'create_record', target_model: 'x_ledger_move', then_transition: 'post',
      values_json: JSON.stringify(headerValues),
      lines_field: 'x_line_ids', lines_source: 'record.x_item_ids', lines_values_json: JSON.stringify(ledgerLineValues('false')) });
    await action('nca.payment_state', 'x_payment', { type: 'transition', transition: 'post' });
    await action('nca.payment_post', 'x_payment', { type: 'multi', child_keys: 'nca.payment_bank,nca.payment_receivable,nca.payment_entry,nca.payment_state' }, "x_state == 'draft'");

    // Reconciliation on receivable lines
    await action('nca.reconcile', 'x_ledger_line', { type: 'match', match_rule: 'reconcile' }, '');
    await action('nca.unreconcile', 'x_ledger_line', { type: 'unmatch', match_rule: 'reconcile' }, '');

    // master data, entered by the clerk
    const account = (code: string, extra: Json = {}) => create('x_ledger_account', { x_code: code, x_company_id: ids.company, ...extra }, tokens.clerk);
    ids.receivable = await account('1100', { x_reconcile: true, x_partner_required: true });
    ids.revenue = await account('4000');
    ids.bank = await account('1000');
    expectRejected(await post('model/x_ledger_account/create', { values: { x_code: '4000', x_company_id: ids.company } }, tokens.clerk!), /[Dd]uplicate/);
    ids.partner = await create('res.partner', { name: 'Customer Co.', x_receivable_id: ids.receivable });
  }, 120_000);

  const header = () => ({ x_company_id: ids.company, x_currency_id: ids.eur, x_company_currency_id: ids.usd, x_partner_id: ids.partner, x_date: '2026-03-10' });
  async function salesOrder(lines: [string, number, number][]): Promise<number> {
    return create('x_sale_order', { ...header(), x_line_ids: lines.map(([name, qty, price]) => ({ op: 'create', values: { x_name: name, x_account_id: ids.revenue, x_qty: qty, x_price_unit: price } })) }, tokens.clerk);
  }
  async function invoiceFromOrder(order: number): Promise<number> {
    expectStatus(await button('x_sale_order', [order], 'nca.order_confirm'));
    expectStatus(await button('x_sale_order', [order], 'nca.order_invoice'));
    return (await searchRead('x_invoice', [['x_order_id', '=', order]], ['id'], tokens.clerk))[0]!.id as number;
  }
  async function pay(amount: number): Promise<number> {
    const payment = await create('x_payment', { ...header(), x_amount: amount, x_bank_account_id: ids.bank, x_receivable_id: ids.receivable }, tokens.clerk);
    expectStatus(await button('x_payment', [payment], 'nca.payment_post'));
    return payment;
  }
  const receivableLine = async (domain: unknown[]) =>
    (await searchRead('x_ledger_line', [...domain, ['x_account_id', '=', ids.receivable]], ['id'], tokens.clerk))[0]!.id as number;

  it('turns a confirmed sales order into a draft invoice of revenue items', async () => {
    const order = await salesOrder([['Consulting', 2, 30], ['Support', 1, 40]]);
    expect(await read('x_sale_order', order, ['x_amount_total'], tokens.clerk)).toMatchObject({ x_amount_total: 100 });
    expectRejected(await button('x_sale_order', [order], 'nca.order_invoice'), /not allowed for record \d+ in its current state/);
    ids.invoice = await invoiceFromOrder(order);
    expect(await read('x_sale_order', order, ['x_state'], tokens.clerk)).toMatchObject({ x_state: 'invoiced' });
    expect(await read('x_invoice', ids.invoice, ['x_state', 'x_amount_total', 'x_receivable_id', 'x_payment_state'], tokens.clerk))
      .toMatchObject({ x_state: 'draft', x_amount_total: 100, x_receivable_id: ids.receivable, x_payment_state: 'not_paid' });
    expect(await count('x_invoice_item', [['x_invoice_id', '=', ids.invoice]])).toBe(2);
  });

  it('posts the invoice: receivable item, numbered balanced entry in company currency, immutable afterwards', async () => {
    expectStatus(await button('x_invoice', [ids.invoice!], 'nca.invoice_post'));
    const [move] = await searchRead('x_ledger_move', [['x_invoice_id', '=', ids.invoice]], ['x_name', 'x_state', 'x_total'], tokens.clerk);
    expect(move).toMatchObject({ x_name: 'J/0001', x_state: 'posted', x_total: 200 });
    const lines = await searchRead('x_ledger_line', [['x_move_id', '=', move!.id]], ['x_account_id', 'x_debit', 'x_credit', 'x_amount_currency'], tokens.clerk);
    expect(lines.map((l) => [l.x_account_id, l.x_debit, l.x_credit])).toEqual([[ids.revenue, 0, 120], [ids.revenue, 0, 80], [ids.receivable, 200, 0]]);
    expect(await read('x_invoice', ids.invoice!, ['x_state', 'x_residual', 'x_payment_state'], tokens.clerk))
      .toMatchObject({ x_state: 'posted', x_residual: 100, x_payment_state: 'not_paid' });
    // the guard refuses a second posting; posted documents, items and lines cannot change
    expectRejected(await button('x_invoice', [ids.invoice!], 'nca.invoice_post'), /not allowed for record \d+ in its current state/);
    const item = (await searchRead('x_invoice_item', [['x_invoice_id', '=', ids.invoice]], ['id'], tokens.clerk))[0]!.id as number;
    expectRejected(await post('model/x_invoice_item/write', { ids: [item], values: { x_amount: -1 } }, tokens.clerk!), /are frozen in state 'posted'/);
    expectRejected(await post('model/x_ledger_line/write', { ids: [lines[0]!.id], values: { x_credit: 1 } }, tokens.admin!), /locked in state 'posted'/);
    expectRejected(await post('model/x_invoice/unlink', { ids: [ids.invoice] }, tokens.admin!), /cannot be deleted in state 'posted'/);
  });

  it('a failed posting rolls back the receivable item, the entry and the journal number', async () => {
    const deprecated = await create('x_ledger_account', { x_code: '4999', x_company_id: ids.company, x_deprecated: true }, tokens.clerk);
    const order = await salesOrder([['Old service', 1, 10]]);
    const invoice = await invoiceFromOrder(order);
    const item = (await searchRead('x_invoice_item', [['x_invoice_id', '=', invoice]], ['id'], tokens.clerk))[0]!.id as number;
    await ok('model/x_invoice_item/write', { ids: [item], values: { x_account_id: deprecated } }, tokens.clerk);
    const before = { moves: await count('x_ledger_move'), items: await count('x_invoice_item', [['x_invoice_id', '=', invoice]]) };
    expectRejected(await button('x_invoice', [invoice], 'nca.invoice_post'), /Invalid account or missing partner/);
    expect(await count('x_ledger_move')).toBe(before.moves);
    expect(await count('x_invoice_item', [['x_invoice_id', '=', invoice]])).toBe(before.items);
    expect(await read('x_invoice', invoice, ['x_state'], tokens.clerk)).toMatchObject({ x_state: 'draft' });
    // the next successful posting takes the next gap-free number
    await ok('model/x_invoice_item/write', { ids: [item], values: { x_account_id: ids.revenue } }, tokens.clerk);
    expectStatus(await button('x_invoice', [invoice], 'nca.invoice_post'));
    expect((await searchRead('x_ledger_move', [['x_invoice_id', '=', invoice]], ['x_name'], tokens.clerk))[0]).toMatchObject({ x_name: 'J/0002' });
  });

  it('payments reconcile the invoice partially, then fully, and unreconcile restores it', async () => {
    const invoiceLine = await receivableLine([['x_invoice_id', '=', ids.invoice]]);
    const p1 = await pay(40);
    const p1Line = await receivableLine([['x_move_id.x_partner_id', '=', ids.partner], ['x_invoice_id', '=', false], ['x_residual', '!=', 0]]);
    expectStatus(await button('x_ledger_line', [invoiceLine, p1Line], 'nca.reconcile'));
    expect(await read('x_invoice', ids.invoice!, ['x_residual', 'x_payment_state'], tokens.clerk)).toMatchObject({ x_residual: 60, x_payment_state: 'partial' });
    expect(await read('x_payment', p1, ['x_state'], tokens.clerk)).toMatchObject({ x_state: 'posted' });

    await pay(60);
    const p2Line = await receivableLine([['x_invoice_id', '=', false], ['x_residual', '!=', 0]]);
    expectStatus(await button('x_ledger_line', [invoiceLine, p2Line], 'nca.reconcile'));
    expect(await read('x_invoice', ids.invoice!, ['x_residual', 'x_payment_state'], tokens.clerk)).toMatchObject({ x_residual: 0, x_payment_state: 'paid' });

    expectStatus(await button('x_ledger_line', [p1Line], 'nca.unreconcile'));
    expect(await read('x_invoice', ids.invoice!, ['x_residual', 'x_payment_state'], tokens.clerk)).toMatchObject({ x_residual: 100, x_payment_state: 'not_paid' });
    // the residual itself is engine-owned
    expectRejected(await post('model/x_ledger_line/write', { ids: [invoiceLine], values: { x_residual: 0 } }, tokens.admin!), /maintained by the engine/);
  });

  it('company lock dates are Studio fields: hard lock blocks posting, soft lock binds non-admins, and they only increase', async () => {
    await ok('model/res.company/write', { ids: [ids.company], values: { x_hard_lock: '2026-01-31', x_soft_lock: '2026-02-28' } });
    const hard = await create('x_sale_order', { ...header(), x_date: '2026-01-15', x_line_ids: [{ op: 'create', values: { x_name: 'Jan', x_account_id: ids.revenue, x_qty: 1, x_price_unit: 5 } }] }, tokens.clerk);
    expectRejected(await button('x_invoice', [await invoiceFromOrder(hard)], 'nca.invoice_post', tokens.admin!), /on or before the hard lock date/);
    const soft = await create('x_sale_order', { ...header(), x_date: '2026-02-15', x_line_ids: [{ op: 'create', values: { x_name: 'Feb', x_account_id: ids.revenue, x_qty: 1, x_price_unit: 5 } }] }, tokens.clerk);
    const softInvoice = await invoiceFromOrder(soft);
    expectRejected(await button('x_invoice', [softInvoice], 'nca.invoice_post'), /on or before the soft lock date/);
    expectStatus(await button('x_invoice', [softInvoice], 'nca.invoice_post', tokens.admin!));
    expectRejected(await post('model/res.company/write', { ids: [ids.company], values: { x_hard_lock: '2026-01-01' } }, tokens.admin!), /can only increase/);
    expect((await post('model/res.company/write', { ids: [ids.company], values: { x_hard_lock: '2026-03-01' } }, tokens.clerk!)).status).toBe(403);
  });
});

/**
 * T3b: Thailand v1 (user, 2026-11-27) on the same generic primitives: output VAT 7% as a tax item,
 * full tax invoice data (13-digit tax IDs and branch for seller and buyer, gap-free document numbers
 * per document type), credit and debit notes referencing the original invoice with a reason, and
 * customer payments with withholding tax. Not a statutory-compliance claim: no e-Tax Invoice,
 * P.P.30 / P.N.D. filings, WHT certificates or Thai-language PDF layout.
 */
describe('T3b Thailand: VAT, tax invoice, credit/debit notes and WHT over HTTP', { timeout: 30_000 }, () => {
  const th: Record<string, number> = {};
  const thHeader = () => ({ x_company_id: th.company, x_currency_id: th.thb, x_company_currency_id: th.thb, x_partner_id: th.buyer, x_date: '2026-03-10' });
  async function thOrder(lines: [string, number, number, number?][], partner = th.buyer): Promise<number> {
    const order = await create('x_sale_order', { ...thHeader(), x_partner_id: partner, x_line_ids: lines.map(([name, qty, price, tax]) => ({
      op: 'create', values: { x_name: name, x_account_id: th.revenue, x_qty: qty, x_price_unit: price, ...(tax ? { x_tax_id: tax } : {}) },
    })) }, tokens.clerk_th);
    expectStatus(await button('x_sale_order', [order], 'nca.order_confirm', tokens.clerk_th));
    expectStatus(await button('x_sale_order', [order], 'nca.order_invoice', tokens.clerk_th));
    return (await searchRead('x_invoice', [['x_order_id', '=', order]], ['id'], tokens.clerk_th))[0]!.id as number;
  }
  const totals = (invoice: number) => read('x_invoice', invoice, ['x_name', 'x_state', 'x_amount_untaxed', 'x_amount_tax', 'x_amount_total', 'x_payment_state'], tokens.clerk_th);
  const ledger = async (invoice: number) => (await searchRead('x_ledger_line', [['x_invoice_id', '=', invoice]], ['x_account_id', 'x_debit', 'x_credit'], tokens.clerk_th))
    .map((l) => [l.x_account_id, l.x_debit, l.x_credit]);
  const arLine = async (domain: unknown[]) =>
    (await searchRead('x_ledger_line', [...domain, ['x_account_id', '=', th.receivable]], ['id'], tokens.clerk_th))[0]!.id as number;

  it('configures a Thai company, VAT 7%, tax IDs, document sequences and Thai posting buttons', async () => {
    th.thb = await ref('res.currency', [['name', '=', 'THB'], ['active', 'in', [true, false]]]);
    await ok('model/res.currency/write', { ids: [th.thb], values: { active: true } });
    th.vat = await create('account.tax', { name: 'VAT 7%', amount_type: 'percent', amount: 7 });
    th.zero = await create('account.tax', { name: 'VAT 0% (export)', amount_type: 'percent', amount: 0 });
    // tax identity of seller and buyer; Thai tax settings on the company
    for (const model of ['res.company', 'res.partner']) {
      await field(model, 'x_vat', { type: 'char', label: 'Tax ID' });
      await field(model, 'x_branch', { type: 'char', label: 'Branch (00000 = head office)' });
    }
    await field('res.company', 'x_vat_tax_id', { type: 'many2one', comodel: 'account.tax', ondelete: 'set null' });
    await field('res.company', 'x_output_vat_account_id', { type: 'many2one', comodel: 'x_ledger_account', ondelete: 'set null' });
    await field('res.company', 'x_wht_account_id', { type: 'many2one', comodel: 'x_ledger_account', ondelete: 'set null' });
    th.company = await create('res.company', { name: 'Thai Co., Ltd.', currency_id: th.thb, x_vat: '0105500000002', x_branch: '00000', x_vat_tax_id: th.vat });
    const clerkTh = await ref('res.users', [['login', '=', 'clerk_th']]);
    await ok('model/res.users/write', { ids: [clerkTh], values: { company_id: th.company, company_ids: [th.company] } });

    // invoice: document type, origin and reason for notes, Thai number; untaxed and VAT totals
    await field('x_invoice', 'x_type', state([['invoice', 'Tax invoice'], ['refund', 'Credit note'], ['debit', 'Debit note']]));
    await field('x_invoice', 'x_origin_id', { type: 'many2one', comodel: 'x_invoice', ondelete: 'restrict' });
    await field('x_invoice', 'x_reason', { type: 'char' });
    await field('x_invoice', 'x_name', { type: 'char', unique: true });
    await field('x_invoice', 'x_amount_untaxed', { type: 'float', store: true, computeExpr: "-x_item_ids.filtered('x_is_base').sum('x_amount')" });
    await field('x_invoice', 'x_amount_tax', { type: 'float', store: true, computeExpr: "-x_item_ids.filtered('x_is_tax').sum('x_amount')" });
    await field('x_payment', 'x_wht_amount', { type: 'float', default: 0 });
    await field('x_invoice_item', 'x_vat_taxed', { type: 'boolean', computeExpr: 'x_tax_id != null && x_tax_id == x_invoice_id.x_company_id.x_vat_tax_id' });
    // the document number is engine-owned (only the posting transition writes it)
    const lifecycle = await ref('ir.lifecycle', [['model', '=', 'x_invoice']]);
    await ok('model/ir.lifecycle/write', { ids: [lifecycle], values: { engine_fields: ['x_name'] } });
    for (const [code, prefix] of [['th.tax_invoice', 'INV/%(year)s/'], ['th.credit_note', 'CN/%(year)s/'], ['th.debit_note', 'DN/%(year)s/']]) {
      await create('ir.sequence', { name: code, code, prefix, padding: 4, implementation: 'no_gap', company_id: th.company });
    }
    await create('ir.transition', {
      model: 'x_invoice', key: 'post_th', from: ['draft'], to: 'posted',
      checks: [
        { expr: 'x_item_ids.count() >= 2', message: 'Nothing to post' },
        { expr: 'is_digits(x_company_id.x_vat, 13) && x_company_id.x_branch != null', message: 'Seller tax ID (13 digits) and branch are required' },
        { expr: 'is_digits(x_partner_id.x_vat, 13) && x_partner_id.x_branch != null', message: 'Buyer tax ID (13 digits) and branch are required' },
        { expr: "x_type == 'invoice' || (x_origin_id != null && x_reason != null)", message: 'Credit and debit notes need the original invoice and a reason' },
      ],
      effects: [{ type: 'sequence', field: 'x_name', date: 'x_date', company: 'x_company_id',
        code: "x_type == 'refund' ? 'th.credit_note' : (x_type == 'debit' ? 'th.debit_note' : 'th.tax_invoice')" }],
    });
    // posting: VAT item on the taxed base, then the generic receivable item, entry and state
    await action('nca.th_invoice_vat', 'x_invoice', { type: 'create_record', target_model: 'x_invoice_item',
      values_json: JSON.stringify({ x_invoice_id: 'record.id', x_name: "'VAT'", x_role: "'tax'", x_account_id: 'record.x_company_id.x_output_vat_account_id',
        x_amount: "[tax_compute([record.x_company_id.x_vat_tax_id.id], record.x_item_ids.filtered('x_vat_taxed').sum('x_amount'), 1, null, null, record.x_currency_id)].sum('tax')" }) });
    await action('nca.th_invoice_state', 'x_invoice', { type: 'transition', transition: 'post_th' });
    await action('nca.th_invoice_post', 'x_invoice', { type: 'multi', child_keys: 'nca.th_invoice_vat,nca.invoice_receivable,nca.invoice_entry,nca.th_invoice_state' }, "x_state == 'draft'");
    // credit note: a draft refund of the original base items, with their taxes
    await action('nca.th_credit_note', 'x_invoice', {
      type: 'create_record', target_model: 'x_invoice',
      values_json: JSON.stringify({ ...headerValues, x_date: 'today', x_type: "'refund'", x_origin_id: 'record.id', x_receivable_id: 'record.x_receivable_id' }),
      lines_field: 'x_item_ids', lines_source: "record.x_item_ids.filtered('x_is_base')",
      lines_values_json: JSON.stringify({ x_name: 'line.x_name', x_account_id: 'line.x_account_id', x_tax_id: 'line.x_tax_id', x_amount: '-line.x_amount' }),
    }, "x_state == 'posted' && x_type == 'invoice' && x_payment_state != 'paid'");
    // payment with withholding tax: bank gets the net, WHT is an asset, the receivable is cleared in full
    await action('nca.th_payment_bank', 'x_payment', { type: 'create_record', target_model: 'x_payment_item',
      values_json: JSON.stringify({ x_payment_id: 'record.id', x_account_id: 'record.x_bank_account_id', x_amount: 'record.x_amount - record.x_wht_amount' }) });
    await action('nca.th_payment_wht', 'x_payment', { type: 'create_record', target_model: 'x_payment_item',
      values_json: JSON.stringify({ x_payment_id: 'record.id', x_account_id: 'record.x_company_id.x_wht_account_id', x_amount: 'record.x_wht_amount' }) });
    await action('nca.th_payment_post', 'x_payment', { type: 'multi',
      child_keys: 'nca.th_payment_bank,nca.th_payment_wht,nca.payment_receivable,nca.payment_entry,nca.payment_state' }, "x_state == 'draft' && x_wht_amount > 0");

    // the generic buttons must not bypass the Thai rules
    const narrow = async (key: string, guard: string) => ok('model/ir.button/write', { ids: [await ref('ir.button', [['action', '=', key]])], values: { guard } });
    await narrow('nca.invoice_post', "x_state == 'draft' && x_company_id.x_vat_tax_id == null");
    await narrow('nca.payment_post', "x_state == 'draft' && x_wht_amount == 0");

    // Thai master data, entered by the Thai clerk (account codes may repeat across companies)
    const account = (code: string, extra: Json = {}) => create('x_ledger_account', { x_code: code, x_company_id: th.company, ...extra }, tokens.clerk_th);
    th.receivable = await account('1100', { x_reconcile: true, x_partner_required: true });
    th.revenue = await account('4000');
    th.bank = await account('1000');
    th.outputVat = await account('2201');
    th.wht = await account('1157');
    await ok('model/res.company/write', { ids: [th.company], values: { x_output_vat_account_id: th.outputVat, x_wht_account_id: th.wht } });
    th.buyer = await create('res.partner', { name: 'Buyer Co., Ltd.', x_vat: '0105500000001', x_branch: '00001', x_receivable_id: th.receivable });
    th.noTaxId = await create('res.partner', { name: 'Walk-in customer', x_receivable_id: th.receivable });
  }, 120_000);

  it('posts a full tax invoice: 7% VAT on taxed lines only, Thai number, VAT credited to output VAT', async () => {
    th.invoice = await thOrder([['Service', 2, 500, th.vat], ['Exempt goods', 1, 100], ['Export service', 1, 200, th.zero]]);
    expectStatus(await button('x_invoice', [th.invoice], 'nca.th_invoice_post', tokens.clerk_th));
    expect(await totals(th.invoice)).toMatchObject({ x_name: 'INV/2026/0001', x_state: 'posted', x_amount_untaxed: 1300, x_amount_tax: 70, x_amount_total: 1370, x_payment_state: 'not_paid' });
    expect(await ledger(th.invoice)).toEqual([[th.revenue, 0, 1000], [th.revenue, 0, 100], [th.revenue, 0, 200], [th.outputVat, 0, 70], [th.receivable, 1370, 0]]);
    expectRejected(await post('model/x_invoice/write', { ids: [th.invoice], values: { x_name: 'INV/2026/9999' } }, tokens.clerk_th!), /field 'x_name' is maintained by the engine/);
  });

  it('refuses a tax invoice without a valid buyer tax ID, and rolls back', async () => {
    const invoice = await thOrder([['Service', 1, 100, th.vat]], th.noTaxId);
    // the generic posting button is not offered for a VAT-registered company
    expectRejected(await button('x_invoice', [invoice], 'nca.invoice_post', tokens.clerk_th), /not allowed for record \d+ in its current state/);
    const moves = await count('x_ledger_move', [], tokens.clerk_th);
    expectRejected(await button('x_invoice', [invoice], 'nca.th_invoice_post', tokens.clerk_th), /Buyer tax ID \(13 digits\) and branch are required/);
    // the VAT and receivable items and the entry were rolled back
    expect(await count('x_ledger_move', [], tokens.clerk_th)).toBe(moves);
    expect(await count('x_invoice_item', [['x_invoice_id', '=', invoice]], tokens.clerk_th)).toBe(1);
    await ok('model/res.partner/write', { ids: [th.noTaxId], values: { x_vat: '010550000000', x_branch: '00000' } });
    expectRejected(await button('x_invoice', [invoice], 'nca.th_invoice_post', tokens.clerk_th), /Buyer tax ID/);
  });

  it('issues a credit note against the invoice with a reason, reverses VAT and settles both', async () => {
    expectStatus(await button('x_invoice', [th.invoice!], 'nca.th_credit_note', tokens.clerk_th));
    const note = (await searchRead('x_invoice', [['x_origin_id', '=', th.invoice], ['x_type', '=', 'refund']], ['id'], tokens.clerk_th))[0]!.id as number;
    expectRejected(await button('x_invoice', [note], 'nca.th_invoice_post', tokens.clerk_th), /need the original invoice and a reason/);
    await ok('model/x_invoice/write', { ids: [note], values: { x_reason: 'Service not delivered' } }, tokens.clerk_th);
    expectStatus(await button('x_invoice', [note], 'nca.th_invoice_post', tokens.clerk_th));
    expect(await totals(note)).toMatchObject({ x_amount_untaxed: -1300, x_amount_tax: -70, x_amount_total: -1370 });
    expect((await totals(note)).x_name).toMatch(/^CN\/\d{4}\/0001$/);
    expect(await ledger(note)).toEqual([[th.revenue, 1000, 0], [th.revenue, 100, 0], [th.revenue, 200, 0], [th.outputVat, 70, 0], [th.receivable, 0, 1370]]);
    expectStatus(await button('x_ledger_line', [await arLine([['x_invoice_id', '=', th.invoice]]), await arLine([['x_invoice_id', '=', note]])], 'nca.reconcile', tokens.clerk_th));
    expect(await totals(th.invoice!)).toMatchObject({ x_payment_state: 'paid' });
    expect(await totals(note)).toMatchObject({ x_payment_state: 'paid' });
    // a credit note cannot itself be credited, and a settled invoice cannot be credited again
    expectRejected(await button('x_invoice', [note], 'nca.th_credit_note', tokens.clerk_th), /not allowed for record \d+ in its current state/);
    expectRejected(await button('x_invoice', [th.invoice!], 'nca.th_credit_note', tokens.clerk_th), /not allowed for record \d+ in its current state/);
  });

  it('issues a debit note referencing the invoice with its own number series', async () => {
    const note = await create('x_invoice', { ...thHeader(), x_type: 'debit', x_origin_id: th.invoice, x_reason: 'Additional hours', x_receivable_id: th.receivable,
      x_item_ids: [{ op: 'create', values: { x_name: 'Extra service', x_account_id: th.revenue, x_amount: -200, x_tax_id: th.vat } }] }, tokens.clerk_th);
    expectStatus(await button('x_invoice', [note], 'nca.th_invoice_post', tokens.clerk_th));
    expect(await totals(note)).toMatchObject({ x_name: 'DN/2026/0001', x_amount_untaxed: 200, x_amount_tax: 14, x_amount_total: 214 });
  });

  it('records a customer payment net of 3% withholding tax and still settles the invoice in full', async () => {
    const invoice = await thOrder([['Consulting', 1, 1000, th.vat]]);
    expectStatus(await button('x_invoice', [invoice], 'nca.th_invoice_post', tokens.clerk_th));
    expect(await totals(invoice)).toMatchObject({ x_name: 'INV/2026/0002', x_amount_total: 1070 });
    const payment = await create('x_payment', { ...thHeader(), x_amount: 1070, x_wht_amount: 30, x_bank_account_id: th.bank, x_receivable_id: th.receivable }, tokens.clerk_th);
    // the generic payment button would book the gross amount to the bank: refused when WHT is withheld
    expectRejected(await button('x_payment', [payment], 'nca.payment_post', tokens.clerk_th), /not allowed for record \d+ in its current state/);
    expectStatus(await button('x_payment', [payment], 'nca.th_payment_post', tokens.clerk_th));
    const move = (await searchRead('x_ledger_line', [['x_account_id', '=', th.wht]], ['x_move_id', 'x_debit'], tokens.clerk_th))[0]!;
    expect(move.x_debit).toBe(30);
    const lines = await searchRead('x_ledger_line', [['x_move_id', '=', move.x_move_id]], ['x_account_id', 'x_debit', 'x_credit'], tokens.clerk_th);
    expect(lines.map((l) => [l.x_account_id, l.x_debit, l.x_credit])).toEqual([[th.bank, 1040, 0], [th.wht, 30, 0], [th.receivable, 0, 1070]]);
    const paymentAr = (lines.find((l) => l.x_account_id === th.receivable)!).id as number;
    expectStatus(await button('x_ledger_line', [await arLine([['x_invoice_id', '=', invoice]]), paymentAr], 'nca.reconcile', tokens.clerk_th));
    expect(await totals(invoice)).toMatchObject({ x_payment_state: 'paid' });
  });
});

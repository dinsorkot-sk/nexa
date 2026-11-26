import { MetadataStore, type Env, type FieldDef, type TenantHandle } from '../src/index.js';

/** Test-only Studio configuration. No accounting ModelDef, hook, method or script is installed. */
export async function installAccountingProof(h: TenantHandle, admin: Env): Promise<void> {
  const store = MetadataStore.for(h);
  const userGroup = (await admin.model('res.groups').searchRead([['code', '=', 'base.group_user']], ['id']))[0]!.id;
  const model = async (name: string, fields: Record<string, FieldDef>) => {
    await store.createModel({ name, fields });
    await admin.model('ir.model.access').create({ name: `${name} users`, model_name: name, group_id: userGroup, perm_read: true, perm_write: true, perm_create: true, perm_unlink: true });
  };
  const company: FieldDef = { type: 'many2one', comodel: 'res.company', required: true };
  const currency: FieldDef = { type: 'many2one', comodel: 'res.currency', required: true };
  await model('x_ledger_account', {
    x_code: { type: 'char', required: true, unique: true }, x_company_id: company,
    x_active: { type: 'boolean', default: true }, x_deprecated: { type: 'boolean', default: false },
    x_reconcile: { type: 'boolean', default: false }, x_partner_required: { type: 'boolean', default: false },
  });
  await model('x_ledger_full', { x_state: { type: 'selection', selection: [['locked', 'Locked']], default: 'locked' } });
  await model('x_ledger_move', {
    x_name: { type: 'char', unique: true }, x_ref: { type: 'char' },
    x_state: { type: 'selection', selection: [['draft', 'Draft'], ['posted', 'Posted']], default: 'draft' },
    x_date: { type: 'date', required: true }, x_company_id: company, x_currency_id: currency,
    x_company_currency_id: currency, x_partner_id: { type: 'many2one', comodel: 'res.partner' },
    x_reversed_id: { type: 'many2one', comodel: 'x_ledger_move', ondelete: 'restrict' },
  });
  await model('x_ledger_line', {
    x_state: { type: 'selection', selection: [['draft', 'Draft'], ['posted', 'Posted']], default: 'draft' },
    x_move_id: { type: 'many2one', comodel: 'x_ledger_move', required: true, ondelete: 'cascade' },
    x_account_id: { type: 'many2one', comodel: 'x_ledger_account', required: true, ondelete: 'restrict', checkCompany: true },
    x_partner_id: { type: 'many2one', comodel: 'res.partner', ondelete: 'restrict' },
    x_company_id: company, x_currency_id: currency, x_company_currency_id: currency,
    x_debit: { type: 'monetary', currencyField: 'x_company_currency_id', default: 0 },
    x_credit: { type: 'monetary', currencyField: 'x_company_currency_id', default: 0 },
    x_amount_currency: { type: 'monetary', currencyField: 'x_currency_id' },
    // This proof supports two-decimal currencies. Historical amounts keep that precision even
    // if a currency master changes later; currencyField would intentionally track its rounding.
    x_balance: { type: 'monetary', computeExpr: 'float_round(x_debit - x_credit, 0.01)', store: true },
    x_match_amount: { type: 'monetary', currencyField: 'x_company_currency_id' },
    x_account_ok: { type: 'boolean', computeExpr: 'x_account_id.x_active && !x_account_id.x_deprecated && (!x_account_id.x_partner_required || x_partner_id != null)' },
    x_company_ok: { type: 'boolean', computeExpr: 'x_account_id.x_company_id == x_company_id && x_move_id.x_company_id == x_company_id' },
    x_currency_ok: { type: 'boolean', computeExpr: 'x_currency_id == x_move_id.x_currency_id && x_company_currency_id == x_move_id.x_company_currency_id && float_compare(x_balance, currency_convert(x_amount_currency, x_currency_id, x_company_currency_id, x_move_id.x_date, x_company_id), 0.01) == 0 && x_debit >= 0 && x_credit >= 0 && (x_debit == 0 || x_credit == 0)' },
    x_residual: { type: 'float' }, x_residual_currency: { type: 'float' },
    x_full_id: { type: 'many2one', comodel: 'x_ledger_full', ondelete: 'restrict' },
  });
  await store.addField('x_ledger_move', 'x_line_ids', { type: 'one2many', comodel: 'x_ledger_line', inverseName: 'x_move_id' });
  await store.addField('x_ledger_move', 'x_total', { type: 'monetary', computeExpr: "float_round(x_line_ids.sum('x_debit'), 0.01)", store: true });
  await store.addField('x_ledger_full', 'x_line_ids', { type: 'one2many', comodel: 'x_ledger_line', inverseName: 'x_full_id' });
  await model('x_ledger_link', {
    x_state: { type: 'selection', selection: [['locked', 'Locked']], default: 'locked' },
    x_positive_id: { type: 'many2one', comodel: 'x_ledger_line', required: true, ondelete: 'restrict' },
    x_negative_id: { type: 'many2one', comodel: 'x_ledger_line', required: true, ondelete: 'restrict' },
    x_amount: { type: 'float' }, x_positive_currency: { type: 'float' }, x_negative_currency: { type: 'float' },
  });
  await model('x_invoice', {
    x_company_id: company, x_currency_id: currency, x_company_currency_id: currency,
    x_partner_id: { type: 'many2one', comodel: 'res.partner' }, x_date: { type: 'date', required: true },
  });
  await model('x_invoice_item', {
    x_invoice_id: { type: 'many2one', comodel: 'x_invoice', required: true, ondelete: 'cascade' },
    x_account_id: { type: 'many2one', comodel: 'x_ledger_account', required: true },
    x_amount: { type: 'float', required: true },
  });
  await store.addField('x_invoice', 'x_item_ids', { type: 'one2many', comodel: 'x_invoice_item', inverseName: 'x_invoice_id' });
  await store.addField('res.company', 'x_hard_lock', { type: 'date', ratchet: 'up', writeGroups: ['base.group_system'] });
  await store.addField('res.company', 'x_soft_lock', { type: 'date', ratchet: 'up', writeGroups: ['base.group_system'] });
  // Company ownership is custom metadata too. Studio's x_* naming requires explicit company rules.
  for (const name of ['x_ledger_account', 'x_ledger_move', 'x_ledger_line', 'x_invoice']) {
    await admin.model('ir.rule').create({ name: `${name} companies`, model_name: name, domain_force: JSON.stringify([['x_company_id', 'in', { $ctx: 'company_ids' }]]) });
  }
  await admin.model('ir.rule').create({ name: 'Invoice item companies', model_name: 'x_invoice_item', domain_force: JSON.stringify([['x_invoice_id.x_company_id', 'in', { $ctx: 'company_ids' }]]) });
  await admin.model('ir.rule').create({ name: 'Match link companies', model_name: 'x_ledger_link', domain_force: JSON.stringify([
    ['x_positive_id.x_company_id', 'in', { $ctx: 'company_ids' }], ['x_negative_id.x_company_id', 'in', { $ctx: 'company_ids' }],
  ]) });
  // Empty full markers exist only inside match/unmatch before assignment/after clearing.
  // They carry no accounting values; nonempty markers are visible only through owned lines.
  await admin.model('ir.rule').create({ name: 'Full match companies', model_name: 'x_ledger_full', domain_force: JSON.stringify(['|',
    ['x_line_ids', '=', false], ['x_line_ids.x_company_id', 'in', { $ctx: 'company_ids' }],
  ]) });
  await admin.model('ir.lifecycle').create({
    model: 'x_ledger_move', state_field: 'x_state', initial_state: 'draft', engine_fields: ['x_name'],
    locks: [{ states: ['posted'], writable: ['x_ref'], unlink: false, frozen_children: ['x_line_ids'] }],
  });
  await admin.model('ir.lifecycle').create({ model: 'x_ledger_line', state_field: 'x_state', initial_state: 'draft', locks: [{ states: ['posted'], writable: [], unlink: false }], engine_fields: ['x_match_amount', 'x_residual', 'x_residual_currency', 'x_full_id'] });
  for (const name of ['x_ledger_full', 'x_ledger_link']) await admin.model('ir.lifecycle').create({
    model: name, state_field: 'x_state', initial_state: 'locked',
    locks: [{ states: ['locked'], writable: [], unlink: false }],
    ...(name === 'x_ledger_link' ? { engine_fields: ['x_positive_id', 'x_negative_id', 'x_amount', 'x_positive_currency', 'x_negative_currency'] } : {}),
  });
  await admin.model('ir.date.lock').create({ model: 'x_ledger_move', date: 'x_date', when: "x_state == 'posted'", hard: 'x_company_id.x_hard_lock', soft: 'x_company_id.x_soft_lock', bypass_groups: ['base.group_system'] });
  await admin.model('ir.sequence').create({ name: 'Ledger', code: 'proof.ledger', prefix: 'J/', padding: 4, implementation: 'no_gap' });
  await admin.model('ir.transition').create({
    model: 'x_ledger_move', key: 'post', from: ['draft'], to: 'posted', already: 'skip',
    checks: [
      { expr: "x_line_ids.count() >= 2 && float_is_zero(x_line_ids.sum('x_balance'), 0.01)", message: 'Unbalanced entry' },
      { expr: "x_line_ids.all('x_account_ok')", message: 'Invalid account or missing partner' },
      { expr: "x_line_ids.all('x_company_ok')", message: 'Company mismatch' },
      { expr: 'x_company_currency_id == x_company_id.currency_id', message: 'Company currency mismatch' },
      { expr: "x_line_ids.all('x_currency_ok')", message: 'Currency mismatch' },
    ], effects: [
      { type: 'sequence', field: 'x_name', code: "'proof.ledger'", date: 'x_date', company: 'x_company_id' },
      { type: 'child_set', field: 'x_line_ids', values: { x_state: "'posted'", x_match_amount: 'x_balance', x_residual: 'x_balance', x_residual_currency: 'x_amount_currency' } },
    ],
  });
  await admin.model('ir.match.rule').create({
    model: 'x_ledger_line', key: 'reconcile', eligible: "x_move_id.x_state == 'posted' && x_account_id.x_reconcile",
    group_by: ['x_account_id', 'x_company_id', 'x_partner_id', 'x_currency_id'],
    amount_field: 'x_match_amount', residual_field: 'x_residual', rounding: 0.01,
    secondary_amount_field: 'x_amount_currency', secondary_residual_field: 'x_residual_currency', secondary_rounding: 0.01,
    lock_parents: ['x_move_id'], full: { model: 'x_ledger_full', field: 'x_full_id' },
    link: { model: 'x_ledger_link', positive_field: 'x_positive_id', negative_field: 'x_negative_id', amount_field: 'x_amount', positive_secondary_field: 'x_positive_currency', negative_secondary_field: 'x_negative_currency' },
  });
  const action = async (key: string, modelName: string, values: Record<string, unknown>, guard?: string) => {
    await admin.model('ir.actions.server').create({ key, model_name: modelName, ...values });
    await admin.model('ir.button').create({ model_name: modelName, action: key, ...(guard ? { guard } : {}) });
  };
  await action('proof.post', 'x_ledger_move', { type: 'transition', transition: 'post' });
  await action('proof.reconcile', 'x_ledger_line', { type: 'match', match_rule: 'reconcile' });
  await action('proof.unreconcile', 'x_ledger_line', { type: 'unmatch', match_rule: 'reconcile' });
  const parentValues = { x_company_id: 'record.x_company_id', x_currency_id: 'record.x_currency_id', x_company_currency_id: 'record.x_company_currency_id', x_partner_id: 'record.x_partner_id', x_date: 'record.x_date' };
  const createEntry = {
    type: 'create_record', target_model: 'x_ledger_move', then_transition: 'post', values_json: JSON.stringify(parentValues),
    lines_field: 'x_line_ids', lines_source: 'record.x_item_ids', lines_values_json: JSON.stringify({
      x_company_id: 'record.x_company_id', x_currency_id: 'record.x_currency_id', x_company_currency_id: 'record.x_company_currency_id',
      x_partner_id: 'record.x_partner_id', x_account_id: 'line.x_account_id', x_amount_currency: 'line.x_amount',
      x_debit: 'line.x_amount > 0 ? currency_convert(line.x_amount, record.x_currency_id, record.x_company_currency_id, record.x_date, record.x_company_id) : 0',
      x_credit: 'line.x_amount < 0 ? -currency_convert(line.x_amount, record.x_currency_id, record.x_company_currency_id, record.x_date, record.x_company_id) : 0',
    }),
  };
  await action('proof.invoice', 'x_invoice', createEntry);
  await action('proof.payment', 'x_invoice', createEntry);
  await action('proof.reverse', 'x_ledger_move', {
    type: 'create_record', target_model: 'x_ledger_move', then_transition: 'post',
    values_json: JSON.stringify({ ...parentValues, x_reversed_id: 'record.id' }),
    lines_field: 'x_line_ids', lines_source: 'record.x_line_ids', lines_values_json: JSON.stringify({
      x_company_id: 'line.x_company_id', x_currency_id: 'line.x_currency_id', x_company_currency_id: 'line.x_company_currency_id',
      x_partner_id: 'line.x_partner_id', x_account_id: 'line.x_account_id', x_debit: 'line.x_credit', x_credit: 'line.x_debit', x_amount_currency: '-line.x_amount_currency',
    }),
  }, "x_state == 'posted'");
}

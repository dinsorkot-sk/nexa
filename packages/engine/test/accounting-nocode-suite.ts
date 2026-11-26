import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessError, ButtonService, ServerActionService, ValidationError, type Env, type TenantHandle } from '../src/index.js';
import { installAccountingProof } from './accounting-nocode-fixture.js';

export function accountingProofSuite(open: () => Promise<{ h: TenantHandle; close: () => Promise<void> }>): void {
  let h: TenantHandle; let close: () => Promise<void>; let root: Env; let alice: Env; let admin: Env;
  let company: number; let otherCompany: number; let usd: number; let eur: number; let partner: number;
  let receivable: number; let income: number; let bank: number;
  const ref = async (name: string) => (await h.driver.query<{ res_id: number }>({ text: `SELECT res_id FROM nx_model_data WHERE module='base' AND name=$1`, params: [name] }))[0]!.res_id;
  const row = async (model: string, id: number) => (await h.env({ uid: 1 }).model(model).browse(id).read())[0]!;
  const button = (model: string, ids: number[], action: string, env = alice) => new ButtonService(env).execute(model, ids, { action });
  const draft = async (amount = 100, vals: Record<string, unknown> = {}, lineVals: Record<string, unknown> = {}) => {
    const common = { x_company_id: company, x_currency_id: eur, x_company_currency_id: usd, x_partner_id: partner };
    return (await alice.model('x_ledger_move').create({ ...common, x_date: '2026-03-10',
      x_line_ids: [
        { op: 'create', values: { ...common, x_account_id: receivable, x_debit: amount * 2, x_credit: 0, x_amount_currency: amount, ...lineVals } },
        { op: 'create', values: { ...common, x_account_id: income, x_debit: 0, x_credit: amount * 2, x_amount_currency: -amount } },
      ], ...vals,
    })).ids[0]!;
  };
  const invoice = async (amount = 100, account = income) => (await alice.model('x_invoice').create({
    x_company_id: company, x_currency_id: eur, x_company_currency_id: usd, x_partner_id: partner, x_date: '2026-03-10',
    x_item_ids: [
      { op: 'create', values: { x_account_id: receivable, x_amount: amount } },
      { op: 'create', values: { x_account_id: account, x_amount: -amount } },
    ],
  })).ids[0]!;
  const issue = async (source: number, action = 'proof.invoice'): Promise<number> => (await button('x_invoice', [source], action) as number[])[0]!;
  const lines = async (id: number) => (await h.env({ uid: 1 }).model('x_ledger_line').search([['x_move_id', '=', id]], { order: 'id' })).read();
  beforeAll(async () => {
    ({ h, close } = await open()); root = h.env({ uid: 1 });
    company = await ref('main_company'); usd = await ref('USD'); eur = await ref('EUR');
    admin = h.env({ uid: await ref('user_admin') });
    otherCompany = (await root.model('res.company').create({ name: 'Other', currency_id: usd })).ids[0]!;
    const uid = (await root.model('res.users').create({ name: 'Ledger clerk', login: 'ledger-proof', company_id: company, company_ids: [company], group_ids: [await ref('group_user')] })).ids[0]!;
    await installAccountingProof(h, admin);
    alice = h.env({ uid }); root = h.env({ uid: 1 }); admin = h.env({ uid: admin.uid });
    partner = (await root.model('res.partner').create({ name: 'Customer', company_id: company })).ids[0]!;
    await root.model('res.currency.rate').create({ currency_id: eur, name: '2026-01-01', rate: 0.5 });
    const createAccount = async (code: string, extra = {}) => (await alice.model('x_ledger_account').create({ x_code: code, x_company_id: company, ...extra })).ids[0]!;
    receivable = await createAccount('1100', { x_reconcile: true, x_partner_required: true });
    income = await createAccount('4000'); bank = await createAccount('1000');
  }, 180_000);
  afterAll(async () => { await close?.(); });

  describe('accounting assembled from Studio metadata and buttons', () => {
    it('I1/I4/I5: invoices convert and balance, number at posting, skip reposting and maintain the stored total', async () => {
      const id = await issue(await invoice());
      expect(await row('x_ledger_move', id)).toMatchObject({ x_state: 'posted', x_total: 200 });
      const number = (await row('x_ledger_move', id)).x_name;
      expect(number).toMatch(/^J\/\d{4}$/);
      expect(await lines(id)).toMatchObject([{ x_debit: 200, x_credit: 0, x_balance: 200, x_residual: 200, x_residual_currency: 100 }, { x_debit: 0, x_credit: 200, x_balance: -200, x_residual: -200, x_residual_currency: -100 }]);
      expect(await button('x_ledger_move', [id], 'proof.post')).toEqual({ done: [], skipped: [id] });
      expect((await row('x_ledger_move', id)).x_name).toBe(number);
    });
    it('I1/I4: a failed create-and-post rolls back parent, children and sequence, including earlier records in the batch', async () => {
      const good = await invoice(); const bad = await invoice();
      const [item] = (await alice.model('x_invoice_item').search([['x_invoice_id', '=', bad]])).ids;
      await alice.model('x_invoice_item').browse(item!).write({ x_amount: 101 });
      const count = await root.model('x_ledger_move').searchCount([]);
      const childCount = await root.model('x_ledger_line').searchCount([]);
      const sequence = (await root.model('ir.sequence').searchRead([['code', '=', 'proof.ledger']], ['number_next']))[0]!.number_next;
      await expect(button('x_invoice', [good, bad], 'proof.invoice')).rejects.toThrow('Unbalanced entry');
      expect(await root.model('x_ledger_move').searchCount([])).toBe(count);
      expect(await root.model('x_ledger_line').searchCount([])).toBe(childCount);
      expect((await root.model('ir.sequence').searchRead([['code', '=', 'proof.ledger']], ['number_next']))[0]!.number_next).toBe(sequence);
    });
    it('I2: posted headers and children stay frozen, root/context cannot bypass, and a reversal is a new posted entry', async () => {
      const id = await issue(await invoice()); const original = await row('x_ledger_move', id); const children = await lines(id);
      await alice.model('x_ledger_move').browse(id).write({ x_ref: 'External reference' });
      for (const env of [alice, root, root.withContext({ bypass: true, skip_lifecycle: true })]) {
        await expect(env.model('x_ledger_move').browse(id).write({ x_state: 'draft' })).rejects.toThrow();
        await expect(env.model('x_ledger_move').browse(id).unlink()).rejects.toThrow();
        await expect(env.model('x_ledger_line').browse(children[0]!.id as number).write({ x_debit: 999 })).rejects.toThrow();
        await expect(env.model('x_ledger_line').browse(children[0]!.id as number).unlink()).rejects.toThrow();
      }
      const reversed = (await button('x_ledger_move', [id], 'proof.reverse') as number[])[0]!;
      expect(await row('x_ledger_move', reversed)).toMatchObject({ x_state: 'posted', x_reversed_id: id });
      expect((await row('x_ledger_move', reversed)).x_name).not.toBe(original.x_name);
      expect((await lines(reversed)).map((l) => l.x_balance)).toEqual([-200, 200]);
      expect((await row('x_ledger_move', id)).x_state).toBe('posted');
    });
    it('I3: hard/soft date locks, bypass group, writeGroups and ratchet are configured as metadata', async () => {
      await admin.model('res.company').browse(company).write({ x_hard_lock: '2026-01-31', x_soft_lock: '2026-02-28' });
      const hard = await draft(100, { x_date: '2026-01-15' });
      await expect(button('x_ledger_move', [hard], 'proof.post', root)).rejects.toThrow(/hard.lock|locked/i);
      const soft = await draft(100, { x_date: '2026-02-15' });
      await expect(button('x_ledger_move', [soft], 'proof.post')).rejects.toThrow(/soft.lock|locked/i);
      await button('x_ledger_move', [soft], 'proof.post', admin);
      await expect(alice.model('res.company').browse(company).write({ x_hard_lock: '2026-03-01' })).rejects.toThrow();
      await expect(root.model('res.company').browse(company).write({ x_hard_lock: '2026-01-01' })).rejects.toThrow(/increase|ratchet/i);
    });
    it('I5/I6/I7: currency, account state, partner and company checks reject invalid drafts', async () => {
      const badCurrency = await draft(100, {}, { x_amount_currency: 90 });
      await expect(button('x_ledger_move', [badCurrency], 'proof.post')).rejects.toThrow('Currency mismatch');
      const wrongCurrencySource = await invoice();
      await alice.model('x_invoice').browse(wrongCurrencySource).write({ x_company_currency_id: eur });
      await expect(issue(wrongCurrencySource)).rejects.toThrow('Company currency mismatch');
      const noPartner = await draft(100, {}, { x_partner_id: null });
      await expect(button('x_ledger_move', [noPartner], 'proof.post')).rejects.toThrow('Invalid account or missing partner');
      const deprecated = (await alice.model('x_ledger_account').create({ x_code: '9999', x_company_id: company, x_deprecated: true })).ids[0]!;
      await expect(issue(await invoice(100, deprecated))).rejects.toThrow('Invalid account or missing partner');
      await expect(alice.model('x_invoice').create({ x_company_id: otherCompany, x_currency_id: eur, x_company_currency_id: usd, x_date: '2026-03-10' })).rejects.toBeInstanceOf(AccessError);
      const other = (await root.model('x_ledger_account').create({ x_code: 'OTHER', x_company_id: otherCompany })).ids[0]!;
      const wrong = await draft(); const [line] = await lines(wrong);
      await root.model('x_ledger_line').browse(line!.id as number).write({ x_account_id: other });
      await expect(button('x_ledger_move', [wrong], 'proof.post', root)).rejects.toThrow('Company mismatch');
    });
    it('I8: normal payment buttons reconcile partially, completely and undo, while refusing drafts and incompatible keys', async () => {
      const inv = await issue(await invoice());
      const p1 = await issue(await invoice(-40, bank), 'proof.payment'); const p2 = await issue(await invoice(-60, bank), 'proof.payment');
      const ar = async (id: number) => (await lines(id)).find((l) => l.x_account_id === receivable)!.id as number;
      const a = await ar(inv); const b = await ar(p1); const c = await ar(p2);
      await button('x_ledger_line', [a, b], 'proof.reconcile');
      expect(await row('x_ledger_line', a)).toMatchObject({ x_residual: 120, x_residual_currency: 60 });
      expect(await button('x_ledger_line', [a, b], 'proof.reconcile')).toEqual({ links: [], full: [] });
      await button('x_ledger_line', [a, c], 'proof.reconcile');
      for (const id of [a, b, c]) expect(await row('x_ledger_line', id)).toMatchObject({ x_residual: 0, x_residual_currency: 0 });
      await button('x_ledger_line', [b], 'proof.unreconcile');
      expect(await row('x_ledger_line', a)).toMatchObject({ x_residual: 200, x_residual_currency: 100, x_full_id: null });
      const draftId = await draft();
      await expect(button('x_ledger_line', [a, await ar(draftId)], 'proof.reconcile')).rejects.toBeInstanceOf(ValidationError);
      expect((await row('x_ledger_line', a)).x_residual).toBe(200);
      const wrongAccount = (await lines(p1)).find((l) => l.x_account_id === bank)!.id as number;
      await expect(button('x_ledger_line', [a, wrongAccount], 'proof.reconcile')).rejects.toThrow(/eligible/);
      await expect(root.model('x_ledger_line').browse(a).write({ x_residual: 999 })).rejects.toThrow();
    });
    it('I4/I5/I7: document company selects its rates and sequence even when another company is current', async () => {
      const uid = (await root.model('res.users').create({ name: 'Multi company', login: 'ledger-multi', company_id: company, company_ids: [company, otherCompany], group_ids: [await ref('group_user')] })).ids[0]!;
      const multi = h.env({ uid, companyIds: [company, otherCompany] });
      await root.model('res.currency.rate').create({ currency_id: eur, company_id: otherCompany, name: '2026-01-01', rate: 0.25 });
      await root.model('ir.sequence').create({ name: 'Other company ledger', code: 'proof.ledger', company_id: otherCompany, prefix: 'B/', padding: 4, implementation: 'no_gap' });
      const customer = (await root.model('res.partner').create({ name: 'Other customer', company_id: otherCompany })).ids[0]!;
      const [ar, sales] = (await multi.model('x_ledger_account').create([
        { x_code: 'B1100', x_company_id: otherCompany, x_reconcile: true, x_partner_required: true },
        { x_code: 'B4000', x_company_id: otherCompany },
      ])).ids;
      const globalBefore = (await root.model('ir.sequence').searchRead([['code', '=', 'proof.ledger'], ['company_id', '=', false]], ['number_next']))[0]!.number_next;
      const source = (await multi.model('x_invoice').create({ x_company_id: otherCompany, x_currency_id: eur, x_company_currency_id: usd, x_partner_id: customer, x_date: '2026-03-10',
        x_item_ids: [{ op: 'create', values: { x_account_id: ar, x_amount: 100 } }, { op: 'create', values: { x_account_id: sales, x_amount: -100 } }],
      })).ids[0]!;
      const [id] = await button('x_invoice', [source], 'proof.invoice', multi) as number[];
      expect(await row('x_ledger_move', id!)).toMatchObject({ x_company_id: otherCompany, x_total: 400, x_name: 'B/0001' });
      expect((await lines(id!)).map((l) => l.x_balance)).toEqual([400, -400]);
      expect((await root.model('ir.sequence').searchRead([['code', '=', 'proof.ledger'], ['company_id', '=', false]], ['number_next']))[0]!.number_next).toBe(globalBefore);
      const [reversal] = await button('x_ledger_move', [id!], 'proof.reverse', multi) as number[];
      expect((await row('x_ledger_move', reversal!)).x_name).toBe('B/0002');
      const item = (await root.model('x_invoice_item').search([['x_invoice_id', '=', source]])).ids[0]!;
      expect(await alice.model('x_invoice_item').searchCount([['id', '=', item]])).toBe(0);
      await expect(alice.model('x_invoice_item').browse(item).write({ x_amount: 999 })).rejects.toBeInstanceOf(AccessError);
      await expect(alice.model('x_invoice_item').browse(item).unlink()).rejects.toBeInstanceOf(AccessError);
      const a = (await lines(id!)).find((l) => l.x_account_id === ar)!.id as number;
      const b = (await lines(reversal!)).find((l) => l.x_account_id === ar)!.id as number;
      const matched = await button('x_ledger_line', [a, b], 'proof.reconcile', multi) as { links: number[]; full: number[] };
      expect(matched.links).toHaveLength(1); expect(matched.full).toHaveLength(1);
      expect(await alice.model('x_ledger_link').searchCount([['id', 'in', matched.links]])).toBe(0);
      expect(await alice.model('x_ledger_full').searchCount([['id', 'in', matched.full]])).toBe(0);
      await button('x_ledger_line', [a], 'proof.unreconcile', multi);
    });
    it('I2: changing currency master precision cannot rewrite posted historical amounts', async () => {
      const id = await issue(await invoice(0.03));
      const header = await row('x_ledger_move', id); const before = await lines(id);
      try {
        await root.model('res.currency').browse(usd).write({ rounding: 0.1 });
        expect(await row('x_ledger_move', id)).toMatchObject({ x_total: header.x_total, x_name: header.x_name, x_state: 'posted' });
        expect((await lines(id)).map((l) => [l.x_debit, l.x_credit, l.x_balance, l.x_match_amount])).toEqual(before.map((l) => [l.x_debit, l.x_credit, l.x_balance, l.x_match_amount]));
      } finally {
        await root.model('res.currency').browse(usd).write({ rounding: 0.01 });
      }
    });
    it('thenTransition is restricted to create_record and remains subject to caller permissions', async () => {
      await expect(new ServerActionService(admin).define({ key: 'proof.invalid', model: 'x_ledger_move', type: 'update_record', values: { x_ref: "'x'" }, thenTransition: 'post' })).rejects.toThrow(/only applies/);
      const uid = (await root.model('res.users').create({ name: 'Reader', login: 'proof-reader', company_id: company, company_ids: [company], group_ids: [] })).ids[0]!;
      const source = await invoice();
      await expect(button('x_invoice', [source], 'proof.invoice', h.env({ uid }))).rejects.toBeInstanceOf(AccessError);
    });
  });
}

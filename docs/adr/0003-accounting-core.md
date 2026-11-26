# ADR 0003: Accounting core primitive

Status: Superseded by ADR 0004 (user, 2026-11-26). Kept for invariants I1–I8.

## Context

Sales, Purchase and Expenses are built no-code (Studio models, server actions, buttons), but they must
produce legally meaningful accounting. The no-code layers cannot enforce double entry, immutability,
lock dates, gapless numbering or reconciliation. ADR 0002 makes rules like these, where correctness
matters, into built-in primitives that are configured by data. Today `account_core` only computes taxes.
Odoo 18 `account` is used as a concept reference only (LGPL-3, no copied code).

## Decision

A new engine module **`account`** (depends on `base` and `account_core`) adds the ledger primitive.
- **Invariants:** it owns every invariant in engine code, through record hooks and model methods. No-code
  apps only create draft documents and call named methods through buttons, server actions and expression
  helpers.
- **Taxes:** `account_core` keeps its tax contract. `account` adds optional fields to `account.tax`
  through `extends`; the change is additive only.
- **Money:** amounts are JS numbers rounded with `currencyRound`. Every balance check compares integer
  minor units.

### Models (key fields)
- **account.account:**
  - **Fields:** code, name, account_type, reconcile, deprecated, currency_id (optional),
    company_id (one company per account).
  - **account_type values:** receivable, payable, bank_cash, current_assets, non_current_assets,
    prepayments, fixed_assets, current_liabilities, non_current_liabilities, credit_card, equity, income,
    income_other, expense, depreciation, direct_cost, off_balance.
  - **Rules:** reconcile is forced true for receivable/payable. UNIQUE(company_id, code).
- **account.journal:**
  - **Fields:** name, code, type (sale|purchase|bank|cash|general), company_id, default_account_id,
    currency_id?, active, sequence_id.
  - **sequence_id:** created with the journal as a no_gap ir.sequence with yearly ranges and prefix
    `<CODE>/%(range_year)s/`.
  - **Rules:** UNIQUE(company_id, code).
- **account.move:**
  - **Fields:** name ('/' in draft), move_type (entry|out_invoice|out_refund|in_invoice|in_refund),
    state (draft|posted|cancel), date, invoice_date, invoice_date_due, invoice_payment_term_id,
    partner_id, journal_id, company_id, currency_id, line_ids, ref, narration, invoice_origin,
    origin_ref (reference), reversed_entry_id, payment_state (not_paid|partial|paid), and the code
    computes amount_untaxed/amount_tax/amount_total/amount_residual.
  - **Rules:** UNIQUE(company_id, journal_id, name) for posted moves.
- **account.move.line:**
  - **Fields:** move_id (cascade), parent_state (stored), company_id, journal_id, date, account_id,
    partner_id, name, display_type (product|tax|payment_term|line_section|line_note), debit, credit,
    balance (stored), currency_id, amount_currency, quantity, price_unit, discount, tax_ids, tax_line_id,
    tax_base_amount, price_subtotal, price_total, date_maturity, analytic_distribution (json, not
    validated in v1), reconciled, amount_residual, amount_residual_currency, full_reconcile_id.
  - **Maintained fields:** the reconcile engine maintains amount_residual, amount_residual_currency and
    full_reconcile_id. They are not computed.
- **account.payment.term / .line:** value percent|balance, value_amount, nb_days.
- **account.payment:** payment_type (inbound|outbound), partner_type, partner_id, amount, currency_id,
  date, journal_id (bank|cash), move_id, state, memo.
- **account.partial.reconcile / account.full.reconcile:** record the matched amounts in company
  currency and in each line's currency.
- **Extensions:**
  - **res.company:** fiscalyear_lock_date, hard_lock_date. Exchange-difference fields are reserved for
    v1.1.
  - **res.partner:** property_account_receivable_id, property_account_payable_id.
  - **account.tax:** company_id, type_tax_use, account_id, refund_account_id.

### Invariants (enforced by the engine)
- **I1 Balanced:** when a move is posted, the sum of line balances is exactly 0 in company-currency
  minor units.
- **I2 Immutable:**
  - **What can change after posting:** only ref, narration, invoice_origin and the fields the engine
    maintains.
  - **What is refused:** unlink and cancel of posted moves. A correction is made with a reversal.
  - **Internal bypass:** it is a module-private AsyncLocalStorage scope, never the context, so a
    client cannot forge it.
- **I3 Lock dates:** an accounting date on or before hard_lock_date is refused for everyone. An
  accounting date on or before fiscalyear_lock_date is refused unless the user is an
  account.group_account_manager.
- **I4 Numbering:** the name is drawn from the journal's no_gap sequence when the move is posted, inside
  the posting transaction. A rollback burns nothing.
- **I5 Currency:** debit and credit equal the converted amount_currency rounded in company currency. On
  an invoice, the receivable/payable line is the balancing plug.
- **I6 Accounts:** each account must be active, not deprecated and in the move's company. A
  receivable/payable line requires a partner.
- **I7 Company:** a move is consistent within one company, and that company must be in
  env.companyIds.
- **I8 Reconcile:** only posted lines can be reconciled. The lines must share the same account (with
  reconcile=true), company and partner, and have opposite signs. Residuals never cross zero and are only
  changed under lock.

### No-code surface
- **Model methods (buttons and RPC):**
  - **account.move:** action_post, reverse, button_cancel (draft only), register_payment,
    recompute_dynamic_lines.
  - **account.payment:** action_post, action_cancel.
  - **account.move.line:** reconcile, remove_move_reconcile.
  - **Reports:** trial_balance, partner_ledger.
- **Server actions:**
  - **create_record.lines:** a mapping that creates child rows from `record.<source>`.
  - **call_method:** a new type that runs an allowlisted model method with NX-Expr arguments, in the
    caller's env.
- **Expression helpers:** account_receivable, payment_term_due, partner_balance.

### Security and concurrency
- **Groups:**
  - group_account_invoice (Billing)
  - group_account_user (Accountant)
  - group_account_manager (Adviser)
  - The ACL rows are explicit, and every model has a company record rule.
- **Lock order:** moves → lines → sequence row → partial inserts, each sorted by id.
- **Idempotency:** posting and reconciling are idempotent, so retries and double clicks have no
  effect.
- **Testing:** both paths are tested on real PostgreSQL.

## Out of scope for v1
- **Taxes and localisation:** fiscal positions, tax repartition, tax groups, tax reports, closing and
  localisations, cash-basis taxes.
- **Bank and payments:** bank statements and statement reconciliation, bank sync, outstanding-payment
  accounts.
- **Posted-entry handling:** the hash chain, reset to draft, auto-post, recurring entries.
- **Currency:** exchange-difference entries are deferred to **v1.1**. In v1, a foreign-currency invoice
  must be paid in the same currency, and rate differences are not booked.
- **Payment terms:** advanced options (EOM, early-payment discounts).
- **Other:** assets and deferrals, analytic accounts, a chart shared across companies, EDI.

## Consequences
- **Benefit:** no-code Sales and Purchase can invoice without scripts, and the ledger rules live in one
  tested place.
- **Cost:** a new global record hook, which depends on import order and has a private bypass scope.
- **Cost:** residuals are maintained rather than computed, so tests must call verify_residuals().

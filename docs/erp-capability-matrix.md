# ERP capability matrix: Sales → invoice → ledger → payment

Date: 2026-11-27 (updated through T6). Readiness summary: [erp-readiness-sales-to-ledger.md](./erp-readiness-sales-to-ledger.md). Supersedes the status columns of
[gap-analysis-odoo.md](./gap-analysis-odoo.md) and [nocode-sales-proof.md](./nocode-sales-proof.md)
for this vertical; those two files are dated snapshots.

Scope: the first vertical in [team/BRIEF.md](../team/BRIEF.md). Odoo is a conceptual reference only.
No jurisdiction is selected yet, so nothing here is a statutory-compliance claim.

Legend: **Proven** = a passing test exercises it · **Engine-only** = proven through engine APIs,
not through the HTTP surface a tenant administrator uses · **Gap** = missing or unproven.

## Evidence run (2026-11-27, Node 24.22, PGlite and embedded PostgreSQL 17)

| Suite | Command | Result |
|---|---|---|
| Accounting proof, PGlite | `packages/engine`: `npx vitest run test/accounting-nocode.test.ts` | 9 passed |
| Accounting proof, real PostgreSQL | `packages/engine`: `npx vitest run -c vitest.pg.config.ts test/pg/accounting-nocode.test.ts` | 9 passed |
| Policy primitives + concurrency, real PostgreSQL | `packages/engine`: `npx vitest run -c vitest.pg.config.ts test/pg/policy-*.test.ts test/pg/concurrency.test.ts` | 30 passed |
| T3a + T3b (Thailand) over HTTP, PGlite | `apps/api`: `npx vitest run test/nocode-accounting.test.ts` | 12 passed |
| T3a + T3b (Thailand) over HTTP, real PostgreSQL | `apps/api`: `pnpm test:pg` | 12 passed |
| Sales proof over HTTP, PGlite | `apps/api`: `npx vitest run test/nocode-sales.test.ts` | 15 passed, 1 todo (GAP-ACT-1) |

Environment notes: the API suite needs `turbo run build --filter=@nexa/api^...` first (`@nexa/engine`
resolves to `dist`). The PostgreSQL suites skip silently unless `@embedded-postgres/linux-x64`'s
`postinstall` (symlink hydration) has run, or `NEXA_TEST_PG_URL` is set; pnpm blocks that script by
default. The repository declares Node 26; these runs used Node 24.

## Workflow steps

| # | Step | Generic surface | Status | Evidence |
|---|---|---|---|---|
| 1 | Companies, users, groups, partners, currencies, rates | generic model API | Proven (HTTP) | `nocode-sales.test.ts` setup; accounting suite `beforeAll` |
| 2 | Products, UoM, pricelist, taxes | T30 models via generic API | Proven (HTTP) | `nocode-sales.test.ts` setup |
| 3 | Sales order + lines model, chatter, tracking | `POST /api/studio/model`, `/studio/field`, `/studio/mixin/attach` | Proven (HTTP) | `nocode-sales.test.ts` "models x_sale_order…" |
| 4 | Access rights and company/own-record rules | `ir.model.access`, `ir.rule` records | Proven (HTTP) | `nocode-sales.test.ts` GAP-ACL-1/GAP-RULE-1 test |
| 5 | Order numbering | `sequence_next` in `defaultExpr` | Proven (HTTP) | `nocode-sales.test.ts` (`SO/<year>/NNNN`) |
| 6 | Line pricing, line tax, order totals | `pricelist_price`, `tax_compute`, stored relational compute | Proven (HTTP) | `nocode-sales.test.ts` quotation test |
| 7 | Confirm / cancel / mark sent | guarded `ir.button` + `update_record`/`multi` | Proven (HTTP) | `nocode-sales.test.ts` state machine |
| 8 | Send quotation email, print PDF as one button | — | **Gap** GAP-ACT-1 | `it.todo` at `apps/api/test/nocode-sales.test.ts:646` |
| 9 | **Sales order → customer invoice** | guarded `multi`: `create_record` with `lines` from `x_line_ids` + `update_record` | Proven (HTTP) | `apps/api/test/nocode-accounting.test.ts` (T3a) |
| 10 | Invoice tax lines → ledger tax account (Thailand: output VAT 7%) | VAT item from `tax_compute` on taxed base items, credited to the company's output-VAT account | Proven (HTTP) | `nocode-accounting.test.ts` T3b: VAT only on taxed lines, VAT reversed by credit notes |
| 11 | Ledger account, move, line models | Studio fields incl. `one2many`, stored monetary compute | Proven (HTTP) | T3a builds them with `POST /api/studio/model` and `/studio/field`; the engine fixture still uses `MetadataStore` |
| 12 | Unique move number and account code per company (I4 key) | Studio `unique`, stored computed composite key | Proven (HTTP) | T3a: `x_name` unique; `x_key = x_code:company` rejects a duplicate account code. Limits: a duplicate error can surface on a write to a dependency model; `copy()` needs new key inputs; an expression that renders empty parts collides |
| 13 | Lifecycle lock, post transition, checks | `ir.lifecycle`, `ir.transition` records | Proven (HTTP) | T3a creates them with the generic `model/:model/create` |
| 14 | Company lock dates (hard/soft, ratchet, writeGroups) | Studio fields on `res.company` + `ir.date.lock` | Proven (HTTP) | T3a lock-date test; field limits in `studio-field-options.test.ts` |
| 15 | Post invoice (I1 balance, I4 numbering, I5 currency, I6 accounts, I7 company) | `transition` action + button | Proven (engine, both DBs) | suite tests I1/I4/I5, I5/I6/I7, I4/I5/I7 |
| 16 | Rollback of failed batch incl. sequence | transition atomicity | Proven (engine, both DBs) | suite "a failed create-and-post rolls back…" |
| 17 | Immutability, reversal (I2) | `ir.lifecycle`, `create_record` + `thenTransition` | Proven (engine, both DBs) | suite I2 tests |
| 18 | Date locks (I3) | `ir.date.lock` | Proven (engine, both DBs) | suite I3 test |
| 19 | Payment entry | `x_payment` document; guarded `multi` creates bank and receivable items, posts the entry, posts the payment | Proven (HTTP) | T3a payment test. No journals, no payment methods, single currency per payment |
| 20 | Reconcile / unreconcile (I8) | `ir.match.rule`, `match`/`unmatch` actions | Proven (engine, both DBs) | suite I8 test |
| 21 | Invoice payment state (paid / partial) back on the invoice | non-stored compute over its reconcilable ledger lines' `x_residual_currency` | Proven (HTTP) | T3a: not_paid → partial → paid → not_paid after unreconcile |
| 22 | Concurrency (parallel post / match / lock edits) | row locks, lock order | Proven per primitive (real PostgreSQL); not on the assembled accounting fixture | `test/pg/policy-transition.test.ts` (two concurrent posts: one number, one skip), `policy-matching.test.ts` (no double consumption, duplicate unmatch), `policy-lifecycle.test.ts` (child writes vs lock transition), `policy-datelock.test.ts` (concurrent ratchet), `concurrency.test.ts` (no_gap sequence) |
| 24 | Thai full tax invoice data and numbering | Studio `x_vat`/`x_branch` on company and partner; `post_th` transition checks `is_digits(x_vat, 13)` and branch; per-type no-gap sequences INV/CN/DN | Proven (HTTP) | T3b; a missing or 12-digit buyer tax ID is refused and rolled back; the number is engine-owned |
| 25 | Credit and debit notes | credit note button copies base items negated with their taxes; posting requires the origin invoice and a reason; debit note created as a document of type `debit` | Proven (HTTP) | T3b: CN reverses revenue and VAT and settles the invoice by reconciliation |
| 26 | Customer payment with withholding tax | `x_wht_amount` on the payment; items: bank = amount − WHT, WHT asset, receivable −amount | Proven (HTTP) | T3b: 1,070 invoice paid as 1,040 bank + 30 WHT, invoice paid |
| 23 | End-user UI | — | **Gap** | `apps/web` is a starter page (`app/pages/index.vue`); every proven surface is HTTP or engine |

## Platform gaps carried from the Sales proof (status re-checked)

| ID | Status on `ea47369` | Pointer |
|---|---|---|
| GAP-ACT-1 | Open. `ServerActionType` has no `mail_template` / `report` type | `packages/engine/src/services/actions.ts:17` |
| GAP-CRON-1 | Open. `apps/api` never calls `SchedulerService.runDue` | `apps/api/src/engine/` |
| GAP-AUTH-1 | Open. HTTP auth routes are login, logout and API keys only; no set-password / invite | `engine.controller.ts` `auth/*` |
| GAP-MAIL-2 | Open. Template queue is Settings-only | `packages/engine/src/mail/template.ts` `queue` |
| GAP-REL-2 | Open. Onchange draft is flat | `packages/engine/src/orm/recordset.ts` `onchange` |
| GAP-SEARCH-1, GAP-ERR-1 | Open (asserted as probes) | `nocode-sales.test.ts:269-274` |
| GAP-COMP-1, GAP-O2M-1, GAP-SEQ-1, GAP-PRIM-1, GAP-REL-1, GAP-ACL-1, GAP-RULE-1 | Closed | see the snapshot doc |
| GAP-STUDIO-1 | Closed for this vertical (`default`, `readonly`, `ondelete`, `help`, `index`, `unique`) | `engine.controller.ts` `studioField` |

## What this means for the plan

- The ledger invariants are proven at engine level on both databases, and the untaxed seam Sales
  order → invoice → post → payment → reconcile → invoice status is proven over HTTP only (T3a).
  Thai v1 (VAT 7%, full tax invoice data and numbering, credit/debit notes, WHT on receipts) is proven
  over HTTP (T3b). The HTTP proof also passes on real PostgreSQL (T6). Remaining: a UI,
  and the excluded Thai items (e-Tax Invoice, P.P.30 / P.N.D. filings, WHT certificates, Thai PDF).
  T3b limits: VAT is posted only for lines taxed with the company VAT tax (other taxes, e.g. 0% export,
  post no tax line); the Thai posting button always adds a VAT item, which is zero when no line is
  taxed; the WHT payment button requires a WHT amount above zero; the tax ID format is checked, not its
  check digit; a credit note can be issued until the invoice is settled, so several drafts are possible;
  the generic T3a buttons are narrowed so they cannot post VAT-company invoices or WHT payments.
- Steps 12 and 14 are now available over HTTP (Studio `unique`; Studio fields on `res.company`,
  user decision 2026-11-27). The accounting proof still has to be rebuilt over HTTP to use them.
- Step 23 means "user-facing" currently means HTTP API; any UI claim needs separate scope.

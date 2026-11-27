# ERP capability matrix: Sales → invoice → ledger → payment

Date: 2026-11-27. Commit `ea47369` (main). Supersedes the status columns of
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
| 9 | **Sales order → customer invoice** | `create_record` + `lines` from `x_line_ids` | **Gap: not built** | No test links `x_sale_order` to `x_invoice`; the two proofs are separate fixtures |
| 10 | Invoice tax lines → ledger tax account | `tax_compute` in line mappings | **Gap: not built** | Proof invoice has untaxed `x_item_ids` (account, amount); ADR 0004 v1: one tax row per product row |
| 11 | Ledger account, move, line models | Studio fields incl. `one2many`, stored monetary compute | Engine-only | `accounting-nocode-fixture.ts` uses `MetadataStore.createModel/addField` |
| 12 | Unique move number (I4 key) | Studio field `unique` | Available (HTTP), not yet used by the accounting proof | `studio-field-options.test.ts` unique tests. Single-column only: a per-company key such as (code, company) is not expressible yet. Unique fields are not copied by default; a literal `default` is refused; a constant `defaultExpr` is accepted and would collide (use `sequence_next`) |
| 13 | Lifecycle lock, post transition, checks | `ir.lifecycle`, `ir.transition` records | Engine-only | Fixture creates them with `env.model(...).create`; generic `model/:model/create` has no `ir.*` filter but no HTTP test covers it |
| 14 | Company lock dates (hard/soft, ratchet, writeGroups) | Studio fields on `res.company` + `ir.date.lock` | Available (HTTP), not yet used by the accounting proof | `res.company` accepts optional, non-unique, non-computed, non-x2many Studio fields without `checkCompany` or `ondelete: restrict`; mixins and views stay refused. Every internal user can read these fields. Tested in `studio-field-options.test.ts` |
| 15 | Post invoice (I1 balance, I4 numbering, I5 currency, I6 accounts, I7 company) | `transition` action + button | Proven (engine, both DBs) | suite tests I1/I4/I5, I5/I6/I7, I4/I5/I7 |
| 16 | Rollback of failed batch incl. sequence | transition atomicity | Proven (engine, both DBs) | suite "a failed create-and-post rolls back…" |
| 17 | Immutability, reversal (I2) | `ir.lifecycle`, `create_record` + `thenTransition` | Proven (engine, both DBs) | suite I2 tests |
| 18 | Date locks (I3) | `ir.date.lock` | Proven (engine, both DBs) | suite I3 test |
| 19 | Payment entry | same `create_record` action on a payment-shaped `x_invoice` | Proven (engine), shape is provisional | `proof.payment` reuses the invoice model with negative amounts; no payment model/journal |
| 20 | Reconcile / unreconcile (I8) | `ir.match.rule`, `match`/`unmatch` actions | Proven (engine, both DBs) | suite I8 test |
| 21 | Invoice payment state (paid / partial) back on the invoice | stored relational compute over residuals | **Gap: not built** | No field derives invoice status from line residuals |
| 22 | Concurrency (parallel post / match / lock edits) | row locks, lock order | Proven per primitive (real PostgreSQL); not on the assembled accounting fixture | `test/pg/policy-transition.test.ts` (two concurrent posts: one number, one skip), `policy-matching.test.ts` (no double consumption, duplicate unmatch), `policy-lifecycle.test.ts` (child writes vs lock transition), `policy-datelock.test.ts` (concurrent ratchet), `concurrency.test.ts` (no_gap sequence) |
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

- The ledger invariants are proven at engine level on both databases. The remaining work is the
  **seam**: Sales order → invoice (with tax lines) → post → payment → invoice status, configured
  through HTTP surfaces only.
- Steps 12 and 14 are now available over HTTP (Studio `unique`; Studio fields on `res.company`,
  user decision 2026-11-27). The accounting proof still has to be rebuilt over HTTP to use them.
- Steps 9, 10, 21 are configuration work on existing primitives, but need the jurisdiction (T4)
  to fix tax behaviour.
- Step 23 means "user-facing" currently means HTTP API; any UI claim needs separate scope.

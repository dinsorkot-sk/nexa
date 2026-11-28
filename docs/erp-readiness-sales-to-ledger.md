# Readiness report: no-code Sales → ledger → payment (Thailand v1)

Date: 2026-11-27. Scope: the first ERP vertical in `team/BRIEF.md`, Thailand as the first jurisdiction.
Detailed step-by-step evidence: [erp-capability-matrix.md](./erp-capability-matrix.md).

## Verdict

**Ready as a tested platform proof over the HTTP API. Not ready for end users or production.**

A tenant administrator can configure the workflow from an empty tenant over the public HTTP API. The
configuration uses Studio and `ir.*` records only: no accounting module, hook or script. The proof passes
on both supported databases, embedded PGlite and real PostgreSQL.

Three things block production use:
- there is no end-user UI;
- several platform gaps remain (user invitation, scheduler worker, one-button email and print);
- nobody has reviewed the Thai behaviour against the law.

This is not a statutory-compliance claim.

## What is proven

The proof is `apps/api/test/nocode-accounting.suite.ts`, with 12 tests run on both databases.

| Area | Behaviour |
|---|---|
| Sales | Confirm a sales order, then invoice its lines. Guards stop double invoicing. |
| Posting | An invoice posts in one transaction: a receivable item, a balanced entry converted to company currency with a gap-free number, then the invoice state. A failure rolls everything back, including the number. |
| Immutability | Posted invoices, items, entries and lines cannot be edited or deleted. Residuals are engine-owned. |
| Lock dates | Hard and soft lock dates are company fields. They only increase and only Settings users can change them. The hard lock binds everyone. |
| Payments | A payment document posts bank and receivable lines. Reconcile and unreconcile move the invoice between not paid, partial and paid. |
| Thai VAT | 7% output VAT is posted only on lines taxed with the company VAT tax. Exempt and 0% lines get no VAT. |
| Thai tax invoice | Seller and buyer 13-digit tax IDs (a leading 0 is allowed) and branch are checked. INV, CN and DN have separate gap-free numbers that only the engine can write. |
| Credit and debit notes | A note needs the original invoice and a reason. A credit note reverses revenue and VAT and settles the invoice. A settled invoice cannot be credited again. |
| Withholding tax | A customer payment net of WHT books the net amount to the bank and the WHT as an asset, and clears the receivable in full. |
| Isolation | Company record rules and per-company account codes, through a composite unique key. |

The ledger invariants I1–I8 (ADR 0003, implemented per ADR 0004) are also covered by the engine-level
proof, together with concurrency tests on real PostgreSQL: concurrent posting, matching, lifecycle and
lock-date edits.

## How to run

```bash
pnpm install --frozen-lockfile
npx turbo run build --filter=@nexa/api^...
# on a fresh install, pnpm blocks embedded-postgres's postinstall; run it once:
node node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/scripts/hydrate-symlinks.js
cd apps/api
npx vitest run test/nocode-accounting.test.ts   # PGlite
pnpm test:pg                                     # real PostgreSQL (embedded, or NEXA_TEST_PG_URL)
```

Results at the time of writing (Node 24; the repository declares Node 26):

| Check | Result |
|---|---|
| Build, typecheck and lint (engine, api) | pass |
| Engine on PGlite | 561 passed |
| Engine on real PostgreSQL | 243 passed |
| API on PGlite | 102 passed, 1 skipped, 1 todo |
| HTTP accounting proof on real PostgreSQL | 12 passed |

## Gaps before end users (T5 assessment)

UX check: **not applicable yet**. `apps/web` is a starter page, so no screen exists to check against
`team/UX-STANDARD.md`. The only user-facing surface is the HTTP API. Its error responses are specific:
the proof asserts the messages for every refusal.

Gaps, in recommended order:

1. **UI.** There are no forms or lists for orders, invoices, payments or reconciliation. The UX
   standard (states, validation, accessibility, Thai number, date and currency formatting) applies
   once a UI exists.
2. **User onboarding (GAP-AUTH-1) — closed in T11.** A Settings administrator sets or resets another
   user's password with `POST /api/auth/users/:id/password`; a signed-in user changes their own with
   `POST /api/auth/password` (current password required). Both revoke the user's sessions and API keys.
   Still missing: an emailed invitation link.
3. **Scheduled jobs (GAP-CRON-1).** The API runs no scheduler worker.
4. **One-button email and print (GAP-ACT-1).** No server action type sends a mail template or
   renders a report.
5. **Error mapping (GAP-ERR-1) — closed in T11.** An expression that fails at run time now raises
   `ExpressionError` (a `ValidationError`) and returns HTTP 422.
6. **Pre-existing bugs found during this work, not fixed:**
   - `copy()` by a non-member fails on any model that has a `writeGroups` field.
   - HTTP returns `date` fields as ISO datetimes.

## Thai v1 limits

- **Excluded:** e-Tax Invoice / e-Receipt, P.P.30 and P.N.D. filings, WHT certificates, a Thai-language
  PDF layout, input VAT (purchases are out of scope).
- **Checks are partial:**
  - Tax IDs are checked for 13 digits, not for the check digit.
  - There is one VAT rate per company.
  - A credit note is allowed until the invoice is settled, so several drafts are possible and a partly
    paid invoice can be credited in full.
- **Zero VAT line:** the Thai posting button always adds a VAT item, which is zero when no line is taxed.
- **Configuration lives in a test.** The configuration is the proof's own fixture. A reusable Thai
  "starter pack" (data and records that an administrator imports) does not exist yet.

## Deferred (separate scope needed)

Purchases, inventory valuation, manufacturing, HR and payroll, bank feeds, EDI and other Odoo domains.
Odoo stays a conceptual reference, not a compatibility target.

## Recommended next step

Package the proof's configuration as an importable Thai starter pack, so a real tenant can be set up
without copying test code. Then start the UI for the invoice and payment journey.

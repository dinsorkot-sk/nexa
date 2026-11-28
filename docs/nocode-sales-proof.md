| GAP-REL-1 | **Closed for server actions and button guards (T34b); open for onchange (GAP-REL-2).** | The partner → pricelist and product → description rules are declarative `update_record` actions. The onchange `[['x_name', x_product_id.name]]` still returns `x_name: null` (asserted). | Done for actions: dotted paths of the expression that start at a relational field are loaded under the caller's access (64 paths, depth 16, 1000 rows per evaluation, also charged to the action row budget). A traversed many2one becomes an object with `id`; an untraversed one stays the raw id (`x_partner_id == 5` works); using one many2one both ways in one expression is refused (write `x_partner_id.id`). A related record hidden by ACL or a record rule raises AccessError (fail closed). x2many values only contain rule-visible records. Onchange still sees a flat draft (GAP-REL-2); onchange now checks the caller's create/write access first. | `packages/engine/src/services/actions.ts` `relationalScope`; `orm/recordset.ts` `onchange` || GAP-PRIM-1 | **Closed (T34b)** for NX-Expr. Helpers `pricelist_price(pricelist_id, product_id, qty, date?, uom_id?)`, `uom_convert(qty, from_uom, to_uom)` and `tax_compute(tax_ids, price_unit, qty, product_id?, partner_id?, currency_id?)` → `{untaxed, tax, total}`. | Line unit price is an `update_record` action calling `pricelist_price` (per-dozen pricing asserted); the line tax is a non-stored compute over `tax_compute`. The order totals are still a short script because of GAP-COMP-1 (it no longer re-implements tax math). | Done. All three run with the caller's env (ACL + record rules, no sudo), are impure (they read data) and are bounded by the primitives' limits and the helper call quota. `tax_compute` defaults to the current company currency; product/partner are validated but not used (no fiscal positions yet). NX-Expr has no property access on call results, so extract a part with `[tax_compute(...)].sum('tax')`. Not reachable from scripts (no bridge helper call). | `product/expr-helpers.ts`, `uom/expr-helpers.ts`; `product/index.ts` (`quoteProduct`); `account-core/tax.ts` (`computeTaxes`) || GAP-COMP-2 | **Kept by decision (T34b).** `float_round(…, 'Product Price')` and `currency_round` stay impure in stored computes (asserted). | The pure `round(x, 2)` is used. | A precision name and a currency are tenant data: a later change of `decimal.precision` or `res.currency.rounding` would not recompute stored values, so allowing them silently gives stale data. The literal-digits form (`float_round(x, 2)`) is deterministic but equals the already-pure `round(x, 2)`, so it adds no capability. The minimal safe extension, if wanted, is a static check in `orm/registry.ts` `containsExternalExpressionReference` that allows `float_round`/`float_compare`/`float_is_zero` when the digits argument is a numeric literal (outside the T34b scope). Named precision/currency in stored computes should wait for config-as-dependency recompute. | `packages/engine/src/expr/names.ts` (`PURE`); `orm/registry.ts` (`containsExternalExpressionReference`) || GAP-O2M-1 | **Closed (T34b).** Studio accepts `one2many`. | `x_line_ids` exists; lines are created/updated/deleted inline through the order, imported nested in one file, and listed by the template and the report (asserted). | Done. The API requires `comodel` and `inverseName`, refuses compute/default/required/store options, and checks that the comodel is concrete and the inverse is a stored many2one back to the model. | `apps/api/src/engine/engine.controller.ts` `studioField`, `createStudioField` || GAP-SEQ-1 | **Closed (T34b).** NX-Expr `sequence_next(code, company_id?)` (registered in `services/sequence.ts`) draws from `ir.sequence` like Odoo `next_by_code`. | `x_name` has `defaultExpr: "sequence_next('x_sale.order')"`; every order, imported ones included, gets `SO/<year>/NNNN` (asserted). | Done. Access: like `SequenceService`, drawing needs no ACL on `ir.sequence`; the company is the caller's current company, or an explicit one that must be among the caller's allowed companies. Impure (rejected in stored computes) and marked `sideEffects`: it runs only in create-time defaults and server-action / automation field values. Computed fields, constraints, onchange, button guards and action messages are read-only evaluations and refuse it; `default_get` omits such a default (no number is burned by a form preview). Unknown code returns null. Remaining: no script-bridge call (the bridge has no helper path). | `services/sequence.ts`; `orm/expr-helpers.ts` (`sideEffects`, `readOnly`) |# No-code proof: Sales app (T33)

> Snapshot. For the current status of the Sales → ledger vertical see [erp-capability-matrix.md](./erp-capability-matrix.md).

Date: 2026-11-25. Branch `feat/sales-nocode` (off `feat/postgres-driver` 9d5f98e).
Executable spec: `apps/api/test/nocode-sales.test.ts` (PGlite, in-memory). Result: **10 passed, 8 todo**.

## Claim under test

A tenant administrator can build a Sales/CRM app without writing a code module. They use only
the public HTTP API: Studio, `ir.*` records, mail/report/product/uom/tax records, NX-Expr and
sandboxed server scripts. Sales users then use the app. The installed modules are only platform
modules: `base, mail, report, uom, product, account_core`.

**Verdict: partly proven.** The data model, chatter, tracking, pricing, totals, taxes, state
machine, email, PDF, reminders, import/export and realtime all work over HTTP from an empty
tenant. Four gaps block a real deployment: no access rights, no record rules, no sequence draw and
no one2many. Several business rules need the sandboxed **script** layer (ADR 0002 layer 2).
Declarative surfaces cannot express them, and the scripts re-implement logic that T30 primitives
already provide.

## What was built and which surface each part uses

| Feature | Built with | Spec step |
|---|---|---|
| Companies, sales users, groups | generic model API (`res.company`, `res.users`, `res.groups`); salespeople are in a custom "Sales / User" group, not Settings | setup |
| Units, products, VIP pricelist + fixed item, VAT 7% | generic API on T30 models (`uom.*`, `product.*`, `account.tax`) | setup |
| `x_sale_order`, `x_sale_order_line` | `POST /api/studio/model` | models |
| Access rights for Sales / User and Sales / Manager | `ir.model.access` records (T34a) | access |
| Own orders / all orders / company rule | `ir.rule` records: JSON domain with `{"$ctx": "uid"}`, NX-Expr `[['x_company_id', 'in', companyIds]]` (T34a) | access |
| Chatter + activities on the order | `POST /api/studio/mixin/attach` (`mail.thread`, `mail.activity.mixin`) | models |
| Tracked state / customer / total | Studio field `tracking: true` | models, state machine |
| Partner pricelist | Studio field `x_pricelist_id` on `res.partner` | models |
| Date / state / company / salesperson defaults | Studio `defaultExpr` (`today`, `'draft'`, `company.id`, `user.id`) | quotation |
| Currency default | `ir.default` record (company currency is not reachable from `defaultExpr`) | config |
| Qty / price / discount precision | Studio `digits` by precision name (`Product Unit of Measure`, `Product Price`, `Discount`) | quotation |
| Line subtotal | Studio stored `computeExpr` with pure `round()` over local scalars | quotation |
| Product reference on the line | Studio non-stored `computeExpr` (`x_product_id.default_code`) | quotation |
| Discount 0..100 | `POST /api/studio/expressions` constraint | quotation |
| Pricelist from customer (on create and on partner change) | `ir.actions.server` (script) + `ir.automation` `on_create` / `on_change_fields` | quotation |
| Line description / unit / unit price | `ir.actions.server` (script) + `ir.automation` `on_create` | quotation |
| Order untaxed / tax / total | `ir.actions.server` (script) + `ir.automation` `on_create_or_write` on lines | quotation |
| Confirm (guard draft/sent, sets `sale`, posts a note) | `multi` action of `update_record` + `post_message`, `ir.button` with guard | state machine |
| Cancel / Mark sent | `update_record` actions, guarded `ir.button` records | state machine |
| Send by email | `mail.template` + `POST /api/mail/templates/:id/queue` + `POST /api/mail/queue/process` (T29) | state machine |
| Print quotation | `ir.actions.report` + `render_html` / `POST /api/reports/:id/pdf` (T28) | state machine |
| Reminder for quotations older than 7 days | `create_record` action into `mail.activity` + `ir.automation` `on_time` + `ir.cron` (`automation.on_time`) | reminders |
| Numbering | `ir.sequence` record `SO/%(year)s/` with a yearly date range (it can be defined, not drawn) | sequence |
| Import 3 orders + lines, export JSON/CSV | `POST /api/model/:m/import` and `/export` | import |
| Realtime | `GET /api/bus` SSE; the follower gets `mail.message.posted` | bus |

Steps that exist only in the test harness are not tenant configuration. Each one is a gap below:

- Passwords are provisioned through `AuthService` (GAP-AUTH-1).
- The SMTP transport and the Chromium PDF renderer are stubbed, as in the other API tests.
- The scheduler tick is driven by `SchedulerService.runDue` (GAP-CRON-1).

## Gap list (ranked)

### Blockers (the scenario step cannot be done, or is unsafe, with no-code)

| ID | Gap | Impact in this scenario | Required change | Pointers |
|---|---|---|---|---|
| GAP-ACL-1 | **Closed (T34a).** Access rights are `ir.model.access` records (system-only), synced to `nx_access` under the pseudo module `_records` (serialized by an advisory lock); a group is required (no public rows); module-owned rows are not exposed. | Salespeople are plain "Sales / User" members; Settings rights are no longer needed (asserted, plus a plain user still gets 403). | – | `packages/engine/src/security/records.ts`; `base/config-models.ts` |
| GAP-RULE-1 | **Closed (T34a).** Record rules are `ir.rule` records (system-only; groups or global; JSON or NX-Expr domain compiled against the model on save), synced to `nx_rule`. Rules and ACL rows on `res.users`, `res.groups`, `res.company`, `ir.*`, `mail.message`, `mail.followers`, `mail.tracking.value` and `mail.template` are refused (admin lock-out and content guard); reference data models (`res.lang`, `res.currency*`, `res.country*`, `mail.message.subtype`, `decimal.precision`, `uom.*`) take group rules only. Records for uninstalled models are skipped at the next sync. | Own orders / manager sees all / multi-company rule on `x_company_id` are asserted. | – | `packages/engine/src/security/records.ts`; `security/access.ts` |
| GAP-SEQ-1 | Nothing can draw from `ir.sequence` in no-code. There is no NX-Expr helper, no server action type and no script bridge call. | Order numbers `SO/2026/0001` are not assigned. `x_name` stays empty (asserted). | Add an impure async helper `sequence_next(code)`, allowed in `defaultExpr` and action values, that calls `nextFromRecord` (sequence configuration read with sudo, numbering per company). Optionally add a `next_sequence` bridge call for scripts. | `packages/engine/src/services/sequence.ts` (`nextFromRecord`, `SequenceService`); `orm/expr-helpers.ts` (`engineAsyncHelpers`); `expr/names.ts` (`ENGINE_HELPERS`) |
| GAP-O2M-1 | Studio cannot create `one2many` fields. The API schema enum leaves it out, but `MetadataStore` supports it. | The order has no `x_line_ids`. Lines cannot be edited inline or imported nested under the order. The template and the report cannot list lines. Totals cannot be expressed as `x_line_ids.sum(...)`. | Add `'one2many'` to the Studio field enum. Require `comodel` and `inverseName`, and check that the inverse is a many2one back to the model (a trivial API change). | `apps/api/src/engine/engine.controller.ts` `studioField` (type enum, about line 72); `packages/engine/src/metadata/store.ts` `FIELD_TYPES` |

### Workaround needed (done here, but through scripts or extra client calls)

| ID | Gap | Workaround used | Required change | Pointers |
|---|---|---|---|---|
| GAP-COMP-1 | Stored `computeExpr` may depend only on local, unrestricted scalar columns. Relational and one2many dependencies are rejected (asserted). | Order totals are written by script action `ncs.order_totals`, which an `on_create_or_write` line automation fires. A deleted line does not recompute totals (not covered). | Allow stored expression computes with relational / one2many dependencies through the existing dependency graph used by code computes, and recompute as superuser with deterministic helpers. | `packages/engine/src/orm/registry.ts` (stored dependency check, about lines 280-292); `orm/compute.ts` (`affected`, `computeValues`) |
| GAP-COMP-2 | `float_round(…, 'Product Price')` and `currency_round` are impure and rejected in stored computes (asserted). | The pure `round(x, 2)` is used, so the currency rounding and named precision are not applied. | Treat the precision name and currency as dependencies (snapshot), or allow the literal-digits form. | `packages/engine/src/expr/names.ts` (`PURE`); `orm/registry.ts` (`containsExternalExpressionReference`) |
| GAP-PRIM-1 | T30 primitives (`account.tax.compute`, `product.pricelist.quote`, `uom.uom.convert_quantity`) can be reached only by direct RPC (`/call`). They are not reachable from NX-Expr, declarative actions or the script bridge. | Scripts re-implement the fixed pricelist item lookup and percent/fixed tax math. The spec cross-checks them against the primitives. UoM conversion and percentage rules are not covered (todo). | Register async helpers (`pricelist_price`, `tax_compute`, `uom_convert`) through `registerExpressionHelper` in each module. Alternatively add an allowlisted `call_method` bridge call, run under the caller's ACL. | `packages/engine/src/orm/expr-helpers.ts` (`registerExpressionHelper`); `product/index.ts` (`quoteProduct`); `account-core/tax.ts` (`computeTaxes`); `uom/manifest.ts`; `expr/index.ts` (`SafeScriptBridge`); `services/actions.ts` `runScript` |
| GAP-REL-1 | Action expressions and onchange expressions see a **flat** record, where many2one fields are raw ids. Relational paths evaluate to `null`. | The partner → pricelist and product → description rules are scripts. The onchange `[['x_name', x_product_id.name]]` returns `x_name: null`, so it would blank a typed description (asserted). | Hydrate the dependency paths of the expression with `expressionRecord` (as `computeValues` does), under the caller's access. | `packages/engine/src/services/actions.ts` `readRecord` / `evaluateFor`; `orm/recordset.ts` `onchange` (draft passed raw); `orm/compute.ts` `expressionRecord` |
| GAP-ACT-1 | No server action type sends a mail template or renders a report. `ir.button` can run only actions or model methods. | "Send by email" means queueing the template endpoint and then the `ncs.mark_sent` button, so the client makes two non-atomic calls. "Print" is a direct report endpoint call. | Add action types `mail_template` (template id → `MailTemplateService.queue`) and `report` (returns a report action or download descriptor). | `packages/engine/src/services/actions.ts` (`ServerActionType`, `execute`); `base/config-models.ts` (`ir.actions.server` fields); `mail/template.ts`; `report/service.ts` |
| GAP-CRON-1 | `apps/api` does not run a scheduler worker. `ir.cron` records never fire unless something calls `SchedulerService.runDue`. | The test harness calls `runDue` with a time 8 days later. | Add a per-tenant interval worker in the Nest app (config flag), or an admin `POST /api/cron/run`. | `apps/api/src/engine/engine.module.ts`; `packages/engine/src/services/index.ts` `SchedulerService.runDue` |
| GAP-AUTH-1 | **Closed in T11.** No HTTP endpoint lets an admin set a password or invite a user. | The harness calls `AuthService.provisionPassword`. | Add an admin "set password / reset link" endpoint that respects the last-admin rules. | `apps/api/src/engine/auth.service.ts`; `auth-provision.ts` |
| GAP-MAIL-2 | Queueing a template mail (`POST /api/mail/templates/:id/queue`) and direct reads of `mail.message` / `mail.tracking.value` / `mail.followers` are Settings-only; there is no document-scoped chatter read endpoint for users. | The administrator queues the quotation mail and the spec inspects chatter internals as the administrator. | Let document writers queue templates (`MailTemplateService.queue` already checks the document) and add a document-scoped chatter read endpoint. | `packages/engine/src/mail/template.ts` `queue`; `mail/manifest.ts` `mailAccess`; `apps/api/src/engine/engine.controller.ts` |
| GAP-SEARCH-1 | `search` / `read_group` are reserved NX-Expr names and are accepted when a field is defined, but they are not implemented for ORM expressions. | The spec does not use them. A scratch-model probe fails at read time. | Implement them as caller-ACL async helpers with row quotas, or reject them when the field is defined. | `packages/engine/src/expr/names.ts` (`CORE_HELPERS`); `orm/expr-helpers.ts` |

### Nice to have

| ID | Gap | Pointers |
|---|---|---|
| GAP-ERR-1 | **Closed in T11.** A failing NX-Expr evaluation (for example an unavailable helper) returns HTTP **500** instead of 422 (asserted on the probe). | `apps/api/src/engine/errors.filter.ts`; `orm/expr-helpers.ts` |
| GAP-DEF-1 | `defaultExpr` sees only `company.id` and `user.id`. The company currency and the user's partner are unavailable, so `ir.default` is needed. | `orm/compute.ts` `expressionContext` |
| GAP-STUDIO-1 | Studio fields cannot set a literal `default`, `readonly`, `ondelete` (lines should cascade with the order), `help` or `index`. Studio menus always sit under Settings for `base.group_system`. | `apps/api/src/engine/engine.controller.ts` `studioField`, `createStudioModel` |
| GAP-TIME-1 | An `on_time` rule starts its watermark when it is created. Quotations that were already overdue then are never reminded. Day granularity. | `packages/engine/src/services/automation.ts` (`runTimeRule`, `startAt`) |
| GAP-TRACK-1 | Line changes (x2many) are not tracked in the order chatter. | `packages/engine/src/mail/hooks.ts` (`TRACKABLE`) |
| GAP-SCRIPT-1 | The script layer works, but it is JavaScript written by an admin. Most of this app's logic lives in three scripts. Each gap fixed above moves logic back to declarative records. | `services/actions.ts` |

## Evidence

- `npx vitest run test/nocode-sales.test.ts` (apps/api): 10 passed, 8 todo, about 12 s.
- The todo titles carry gap ids: GAP-SEQ-1, GAP-O2M-1 (x2), GAP-PRIM-1, GAP-ACT-1.
- Probes assert today's limits (Studio rejects one2many, stored relational computes and impure
  helpers; onchange cannot reach a relation; `search()` gives HTTP 500; a plain user gets 403; there
  is no rule isolation). When a gap is fixed, its probe fails and points at the test to convert.

# Gap analysis: Nexa engine core vs Odoo 18 (no-code target)

Date: 2026-11-24. Source: 3 read-only explorer reports (ORM, platform services, addon needs).
Goal: every Odoo feature, including business addons, is buildable **no-code** on the engine
(metadata + sandboxed expressions + data-defined actions). Backend only. Odoo is a concept
reference only (LGPL-3), no copied code.

Status: D done · P partial · M missing. Priority: P0 blocks most addons · P1 · P2.

## Key finding

Almost every P0 gap depends on one missing primitive: a **sandboxed expression language**
(decision D5). Compute, onchange, constraints, defaults, record-rule domains, server actions,
automation conditions, state-machine guards and templates are all code-only (JS functions)
today. They need a data-defined form.

## P0: blocks most business addons

| Area | Gap | Status |
|---|---|---|
| Expression sandbox (D5) | evaluator, helper library, dependency extraction, quotas | M |
| Field model | per-attribute merge on `_inherit` (today the whole FieldDef is replaced) → `selection_add`, studio edits | P |
| Field types | `float digits`/decimal precision (column is DOUBLE), monetary currency rounding, datetime tz (TIMESTAMP without tz), image + attachment storage, `reference`/`many2one_reference` | P/M |
| Field attrs | `translate` (JSONB per lang), `copy`, `aggregator`, `company_dependent`(P1) | M |
| Inheritance | `_inherits` delegation (`delegates` declared, not implemented); per-model mixin selection for custom models | M |
| ORM API | `display_name`/`recName`, `name_search`, `read_group` (granularity, aggregates), `fields_get`, `default_get` + `default_*` context, `copy()`, archiving with `active_test`, transient models/wizards, `check_company` | M |
| Context | `lang`, `tz`, `active_test`, `allowed_company_ids` declared but unused | P |
| No-code logic | expression compute/onchange/constraint/default; expression record-rule domains | M |
| Server actions | data-defined actions (update/create record, post message, call action, code expression) | M |
| Automation | condition domains (pre/post), field-change and time-based triggers, actions defined as data | P |
| State machines | declarative transitions + guards + buttons bound to actions | M |
| Sequences | date ranges, `%(year)s` prefix interpolation, per company, no-gap mode, config stored as records | P |
| Config as data | sequence/cron/automation as ORM models (editable through the generic API); `ir.config_parameter`; settings | M |
| Base data | `res.partner`, `res.currency` + rates, multi-company active-company context | M/P |
| Chatter | messages, followers, subtypes, field tracking | P |
| Templates | sandboxed template engine (interpolation, if/foreach, escaping, money/date formatting) | M |
| Auth | password hash, login/session/token, API keys, tenant from token, protect the last admin | M (dev headers only) |
| Data | group data `noUpdate` (an upgrade resets admin edits) | P |

## P1

inverse/search on computed fields; `parent_path` + cycle check + `_parent_name`; index types
(trigram); prefetch and partial cache invalidation; ir.default; decimal precision records;
languages/translations; countries; import (base_import) / export; cron calendar intervals,
run-as, worker loop, server action as handler; attachments filestore/GC; reports (template → PDF);
mail server + queue + inbound alias; activities; uom; portal tokens; bus/realtime (LISTEN/NOTIFY);
row-locking helpers for actions (stock); taxes/pricelist primitives (built-in recommended);
ownership tracking for module constraints and relations; registry invalidation across processes.

## P2

properties fields, char size/trim, precompute, domain ops `=?`/`not =like`/`any!`, saved filters,
ir.logging, autovacuum, db backup/restore API, barcodes, dashboards, webhooks, rating/utm/digest.

## Already in place (summary)

Basic field types, relations + x2many commands, compute/related/depends (code), `_inherit`
extension/prototype, abstract models, ACL + record rules + field groups + implied groups,
domain compiler (most operators, child_of/parent_of, any), JSON views + inheritance,
actions/menus, module lifecycle (graph, install/upgrade/uninstall, migrate, xmlid/noupdate),
simple services (sequence, scheduler, automation, audit/chatter, attachments), Studio API.

## Risks

- Column types (float → NUMERIC, timestamp → timestamptz): fix them **before** real tenants
  exist, because a later change needs destructive `alter_type` migrations.
- `delegates`, `transient` and `recName` are in the public contract but have no implementation.
- Complex rules (tax, pricelist, procurement) as pure expressions risk performance and
  correctness. Use a built-in primitive configured by data.

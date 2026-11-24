# ADR 0002: Two-layer expression language for no-code

Status: Accepted (user, 2026-11-24). Extends D4 in ADR 0001.

## Context

The goal is to support every Odoo feature no-code (see `docs/gap-analysis-odoo.md`). Compute,
onchange, constraint, default, record-rule domains, server actions, automation, state guards
and templates are all JS functions today, so a user can't create them from data.

## Decision

### Layer 1: Nexa Expression (NX-Expr)

A small DSL that we parse and interpret ourselves (no `eval`, no `Function`).

- **Used for:** computed fields, defaults, onchange, constraints, record-rule and field
  domains, state guards, automation conditions, view attrs, and interpolation in templates.
- **Syntax:** literals, arithmetic (decimal-safe for money), comparison, `and`/`or`/`not`,
  ternary, null-safe dotted paths across relations, `in`, and collection ops (`mapped`,
  `filtered`, `sum/min/max/count`, `sorted`, `any/all`).
- **Built-ins:** `user`, `company`, `companies`, `context`, `today`, `now`, `ref('xml.id')`,
  currency/float/uom/date helpers, `search`/`read_group` (always under the caller's ACL).
- **Pure:** no side effects. A static analyzer extracts field paths to derive `depends`
  automatically.
- **JS-portable:** the evaluator is shared code, so it can later run on the client for attrs.
- **Bounded:** step and time quotas, and a size limit on each expression.

### Layer 2: Server script

Multi-step logic for server actions, run in QuickJS-wasm (a separate isolate).

- **No I/O:** no network, filesystem or imports. The only API the script gets is a host
  bridge: `env.model(...).search/create/write/unlink`, `message_post`, `call action`,
  `raise`, `log`.
- **Security:** every bridge call goes through ACLs and record rules for the user running the
  action. `sudo` is allowed only for actions that an admin defined and flagged.
- **Limits:** CPU time, memory and the number of rows per call. Scripts run inside the
  caller's transaction.
- **Declarative actions first:** update record, create record, post message, run another
  action and webhook are all available without a script. A script is the last resort.

### Built-in primitives (code)

Complex rules where correctness and performance matter, such as tax computation, pricelist
resolution, procurement/route resolution and locking, are code-level primitives configured
by data. They are not pure expressions.

## Consequences

- T14 builds NX-Expr plus the sandbox. It needs a security review.
- `computeExpr` and `defaultExpr` hold NX-Expr without changing the meaning of
  existing compute method names and literal defaults. Onchange accepts a function
  or an expression returning field-value pairs. A constraint expression must return
  `true`. A record-rule expression must return a domain and sees only trusted
  user and company scope with a fixed rule locale.
- Stored expression computes use deterministic, unrestricted scalar dependencies on
  the same record. Non-stored expressions read dependencies with the caller's access.
  Expression constraints use local stored scalar fields so every relevant change
  runs the constraint in the same transaction.
- QuickJS adds a dependency: choose a version, check the license (MIT), and measure the
  memory per tenant.
- The sandbox runner accepts a trusted bridge. The server-action adapter must bind it to
  the caller's Env and transaction, enforce ACLs and record rules, bound affected rows,
  and settle pending calls when the abort signal fires. Action execution must roll the
  transaction back when the runner rejects.

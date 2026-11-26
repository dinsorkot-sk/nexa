# ADR 0004: Generic lifecycle, transition, date-lock and matching primitives — accounting is no-code

Status: Accepted (user, 2026-11-26). Supersedes ADR 0003.

## Context

ADR 0003 placed the ledger in a hard-coded `account` module. The user ruled that out: the engine core
must provide **generic primitives configured by metadata**. Accounting is then built **no-code** on
those primitives, the same way the Sales proof was built, and inventory and other domains reuse the
same primitives. The ADR 0003 invariants I1–I8 remain the requirements.

## Decision

- **No accounting models in engine code.** The engine has no `account` module and no accounting
  models. `account_core` keeps its tax contract unchanged.
- **Four admin-only record models.** These are `ir.*` models with system-only ACL, added to the
  protected-model list:
  - **`ir.lifecycle`** locks a record by its state.
    - Per state, it declares `writable` fields, whether `unlink` is allowed, and `frozen_children`.
    - It declares `transition_only` and `engine_fields`, and an `initial_state` that create must use.
    - These checks apply to the superuser as well. The only exception is a write token issued by a
      transition or a match.
  - **`ir.transition`** is a named, atomic state change. It has `from`/`to`, `groups` (which only
    narrow access), a `guard`, `checks` (NX-Expr, read-only, relational scope) and `effects` of type
    `sequence`, `set` and `child_set`.
    - Execution runs under row locks (parents first, ids ascending).
    - It is idempotent when `already: skip` is set.
    - The caller's own write ACL and record rules are required.
  - **`ir.date.lock`** locks a period. A record is locked when the `when` expression matches and
    `date <= hard` or `date <= soft`.
    - Only `bypass_groups` can get past a soft lock.
    - **Nobody, including the superuser and write tokens, gets past a hard lock.**
    - It applies to create, write, unlink and transitions.
  - **`ir.match.rule`** is generic matching and reconciliation. It defines `eligible`, `group_by`
    keys, the amount and residual fields, an optional secondary (currency) amount, opposite sides,
    link and full-match models, and `lock_parents`.
    - Residuals are maintained under lock and never cross zero.
    - Matching is idempotent, and `unmatch` is supported.
- **One guard slot.** `RecordGuards { beforeCreate, beforeWrite, beforeUnlink }` is added to the
  ORM. It is installed once, not chained, and it is called before hooks.
- **Write token.** It is created only by `TransitionService` and `MatchService`, matches the model,
  ids and fields exactly, and can be used once. It is not passed through the context.
- **New action types.** `transition`, `match` and `unmatch` are new `ir.actions.server` types, reached
  through `ir.button` and the button API.
- **Not new primitives.** Aggregate constraints are transition `checks` (for example
  `float_is_zero(x_line_ids.sum('x_balance'), rounding)`) or stored relational computes.
  Reversal is `create_record.lines` with swapped values plus `thenTransition`.
- **Studio field options.** Studio gains `writeGroups`, `ratchet: 'up'` (the value may only increase),
  `checkCompany`, `ondelete`, `default`, `index` and `readonly`. Until P3 ships the guard,
  `ratchet` is stored but not enforced, so lock-date invariants must not rely on it yet.
  `ondelete: cascade` is allowed only on custom-origin owner models.
- **Monetary rounding.** Stored monetary computes may use `currencyField`. `float_*` helpers with a
  value rounding become pure. This depends on T35a.

## Invariants mapping

| Invariant | How it is enforced |
|---|---|
| I1 Balanced | a `post` transition check, plus frozen lines |
| I2 Immutable | `ir.lifecycle`; corrections are made by reversal |
| I3 Lock dates | `ir.date.lock`; the hard lock applies to everyone; lock-date fields use `ratchet` and `writeGroups` |
| I4 Numbering | a `sequence` effect on a no_gap `ir.sequence`, plus a unique key column |
| I5 Currency | `currency_convert` in the line mappings, plus a post check |
| I6 Accounts | post checks |
| I7 Company | `checkCompany`, company `ir.rule`, and a post check |
| I8 Reconcile | `ir.match.rule` |

## Concurrency
- **Global lock order:**
  1. parents before children;
  2. within a model, ids ascending;
  3. then the `ir_sequence` row;
  4. then link inserts.
- **Testing:** concurrency is tested on real PostgreSQL (embedded-postgres).

## Decisions (user, 2026-11-26)
- The hard lock binds everyone, including the superuser.
- There is no import path for already-posted historical entries in v1. History is imported as
  drafts and posted through transitions.
- Primitives come before T35a; monetary/relational parts (P5) and the no-code proof follow T35a.
- Defaults:
  - Policy changes are audited, not sealed.
  - Transitions run with the caller's ACL, narrowed by `groups`.
  - There is one tax row per product row in v1.
  - An accounting seed pack comes later.

## Out of scope (v1)
- Everything ADR 0003 listed as out of scope.
- Tax grouping and repartition, and exchange differences (deferred to v1.1).
- Lot and serial tracking for inventory.

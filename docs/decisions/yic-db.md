# YIC Production Database Decision (Phase 0 gate)

Status: **OPEN** — must be closed before Phase 1 starts.

## Question
Which database will YIC run in production?

## Options
- **PostgreSQL** (recommended) — Tier 1 reference DB; transactional DDL; full feature set. No extra dialect work.
- **SQL Server** — Tier 2; transactional DDL; requires third dialect before the YIC milestone.
- **Oracle** — Tier 3; non-transactional DDL; requires third dialect + step-based migration; 30-char name limits; hardest.

## Impact
- If PostgreSQL: proceed with Phase 1 (Postgres + SQLite) as planned.
- If SQL Server or Oracle: a third dialect must be implemented before the YIC milestone (Phase 7). Phase 1 still starts with Postgres + SQLite; the third dialect is added in parallel.

## Fallback (if no answer within 2 weeks)
Start Phase 1 with Postgres + SQLite. Add the third dialect later without blocking. Record the eventual answer here when known.

## Decision
_(to be filled)_
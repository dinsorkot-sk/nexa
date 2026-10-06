# Nexa Plans — source of truth for phases

Product: metadata-driven business app platform (TS port of the LOGHOLIZON SRS).
Stack: Nuxt 4 in `apps/web`; standalone Hono API in `apps/server` under `/v1`; shadcn-vue; PostgreSQL + Drizzle (PGlite in dev).
Rule: one phase per version branch (v0.0.1, v0.0.2, ...), in order. Phase N uses branch v0.0.(N+1) because Phase 0 is v0.0.1.

| Phase | Branch | Scope | Status |
|---|---|---|---|
| 0 | v0.0.1 | Foundation: git, Nuxt 4, standalone Hono API at `/v1`, Tailwind + shadcn-vue utilities, Drizzle + PGlite, Vitest, ESLint, Turbo, CI | complete |
| 1 | v0.0.2 | Meta schemas (Zod) + module lifecycle state machine | todo |
| 2 | v0.0.3 | DB, migrations, tenancy, CLI migrate/seed/check | todo |
| 3 | v0.0.4 | Module registry and lifecycle (FR-1) | todo |
| 4 | v0.0.5 | Entity/Field/Relation engine (FR-2, FR-3) | todo |
| 5 | v0.0.6 | Dynamic CRUD/API (FR-4) | todo |
| 6 | v0.0.7 | Auth + RBAC (FR-7) | todo |
| 7 | v0.0.8 | Formula/validation/computed (FR-8) | todo |
| 8 | v0.0.9 | Module Builder UI (FR-6) | todo |
| 9 | v0.0.10 | Dynamic UI runtime, collab, import/export (FR-5) | todo |
| 10 | v0.0.11 | Linear workflow + actions/events (FR-9, FR-10) | todo |
| 11 | v0.0.12 | Automation + notification/webhook (FR-11, FR-12) | todo |
| 12 | v0.0.13 | Reports + dashboards (FR-13, FR-14) | todo |
| 13 | v0.0.14 | Versioning/upgrade + package import/export (FR-15, FR-16) | todo |
| 14 | v0.0.15 | Audit/observability + ops (FR-17, FR-18) | todo |
| 15 | v0.0.16 | Templates: inventory, crm, hr | todo |
| 16 | v0.0.17 | Acceptance: Vehicle Management, load/security, final gate | todo |

Full detail: the approved master plan (SRS adaptations, architecture notes). Do not add phases beyond this table.

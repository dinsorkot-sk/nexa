# Nexa Plans — source of truth for phases

Product: metadata-driven business app platform based on the supplied LOGHOLIZON SRS, adapted to Nexa's TypeScript stack.
Stack: Nuxt 4 in `apps/web`; standalone Hono API in `apps/server` under `/v1`; shadcn-vue; PostgreSQL + Drizzle (PGlite in dev).
Rule: one phase per version branch (`v0.0.1`, `v0.0.2`, ...), in order. Phase 0 uses `v0.0.1`; each later phase increments the patch version once. Do not begin a subsequent phase or create its branch until explicitly requested.

| Phase | Branch | Scope | Status |
|---|---|---|---|
| 0 | v0.0.1 | Foundation: Git, Nuxt 4, standalone Hono API at `/v1`, Tailwind + shadcn-vue utilities, Drizzle + PGlite, Vitest, ESLint, pnpm workspace, CI | complete |
| 1 | v0.0.2 | Meta schemas (Zod) + module lifecycle state machine | complete |
| 2 | v0.0.3 | DB, migrations, tenancy, CLI migrate/seed/check | complete |
| 3 | v0.0.4 | Module registry and lifecycle (FR-1) | complete |
| 4 | v0.0.5 | Entity/Field/Relation engine (FR-2, FR-3) | complete |
| 5 | v0.0.6 | Dynamic CRUD/API (FR-4) | complete | **Verified 2026-10-07:** full tests, typecheck, db:check and build pass. `pnpm lint` reports 0 errors and six pre-existing Vue formatting warnings in `apps/web/app.vue` plus its generated worktree copy. Build reports existing Tailwind nesting and Node deprecation warnings. Record rows with unresolved ownership retain `module_id = NULL`; do not expose caller-supplied `x-tenant-id` publicly before Phase 6 auth/RBAC.
| 6 | v0.0.7 | Auth + RBAC (FR-7) | todo |
| 7 | v0.0.8 | Formula/validation/computed (FR-8) | todo |
| 8 | v0.0.9 | Module Builder UI (FR-6) | todo |
| 9 | v0.0.10 | Dynamic UI runtime, collaboration, import/export (FR-5) | todo |
| 10 | v0.0.11 | Linear workflow + actions/events (FR-9, FR-10) | todo |
| 11 | v0.0.12 | Automation + notification/webhook (FR-11, FR-12) | todo |
| 12 | v0.0.13 | Reports + dashboards (FR-13, FR-14) | todo |
| 13 | v0.0.14 | Versioning/upgrade + package import/export (FR-15, FR-16) | todo |
| 14 | v0.0.15 | Audit/observability + operations (FR-17, FR-18) | todo |
| 15 | v0.0.16 | Metadata templates: inventory, CRM, HR | todo |
| 16 | v0.0.17 | Acceptance: Vehicle Management, load/security, final gate | todo |

Full functional requirements and acceptance criteria are in the user-provided LOGHOLIZON SRS v1.0, adapted to the decisions documented here. Do not add phases beyond this table.

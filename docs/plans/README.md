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
| 5 | v0.0.6 | Dynamic CRUD/API (FR-4) | complete | **Verified 2026-10-07:** full tests, typecheck, db:check and build pass. `pnpm lint` reports 0 errors and six pre-existing Vue formatting warnings in `apps/web/app.vue` plus its generated worktree copy. Build reports existing Tailwind nesting and Node deprecation warnings. Record rows with unresolved ownership retain `module_id = NULL`; do not expose caller-supplied `x-tenant-id` publicly before Phase 6 auth/RBAC. Deviation: phase 6 committed on v0.0.6 instead of fresh branch — recorded per phase 5 precedent.
| 6 | v0.0.6 | Auth + RBAC (FR-7) | complete | **Verified 2026-10-08:** full tests (172/172), typecheck, db:migrate + db:check and build pass (web build verified on Node 22.21.0; local default 22.17.0 is below Nuxt 4's requirement). `pnpm lint` reports 0 errors and 9 pre-existing Vue formatting warnings in `apps/web/app.vue`. Committed on `v0.0.6` per the Phase 5 branch-deviation precedent. |
| 7 | v0.0.7 | Formula/validation/computed (FR-8) | complete | **Verified 2026-10-08:** full tests (185/185), typecheck, db:check (7 migrations), lint (0 errors, same 9 pre-existing `app.vue` warnings) and build pass (web build verified on Node 22.21.0). Computed results are validated for required/finiteness/numeric bounds; formula cycles are now rejected at definition time as well as at record-write time; `formula`/`computed` creation requires a non-empty expression and `autoNumber` creation is rejected (generation deferred) at the schema, integrity and record layers. No new migration. |
| 8 | v0.0.8 | Module Builder UI (FR-6) | complete | **Verified 2026-10-08:** full serial test suite (192/192), typecheck, lint, build (Node 22.21.0) and db:check pass. Credentialed CORS uses explicit `CORS_ORIGINS`; Builder supports auth, module/entity/field/relation authoring and lifecycle-aware read-only states. Follow-up `7c1424f` moves `cn()` to its own module so node-env Vitest never parses `.vue` imports, and adds ESLint overrides for the Nuxt app. |
| 9 | v0.0.10 | Dynamic UI runtime, collaboration, import/export (FR-5) | complete | **Verified 2026-10-09:** typecheck (workspace), lint (0 errors, 747 pre-existing formatting warnings), full serial test suite (219/219), `pnpm build` on Node 22.21.0 and db:check (7 migrations) pass. Runtime under `/app` renders records from field metadata; record activity trail comes from the audit log with actor names and hidden-field redaction; collaboration is scoped to the activity trail plus 409 stale-write conflict surfacing; CSV import/export is client-side through existing record endpoints. No migration. |
| 10 | v0.0.11 | Linear workflow + actions/events (FR-9, FR-10) | todo |
| 11 | v0.0.12 | Automation + notification/webhook (FR-11, FR-12) | todo |
| 12 | v0.0.13 | Reports + dashboards (FR-13, FR-14) | todo |
| 13 | v0.0.14 | Versioning/upgrade + package import/export (FR-15, FR-16) | todo |
| 14 | v0.0.15 | Audit/observability + operations (FR-17, FR-18) | todo |
| 15 | v0.0.16 | Metadata templates: inventory, CRM, HR | todo |
| 16 | v0.0.17 | Acceptance: Vehicle Management, load/security, final gate | todo |

Full functional requirements and acceptance criteria are in the user-provided LOGHOLIZON SRS v1.0, adapted to the decisions documented here. Do not add phases beyond this table.

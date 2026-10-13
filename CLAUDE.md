# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Status

Nexa is a metadata-driven app platform. Backend hardening is the current focus. `apps/web` and `apps/cli` were intentionally removed on 2026-10-09 and may be reassembled after the backend is ready; do not assume those workspaces exist.

## Architecture

- `apps/server`: standalone Hono API server, versioned under `/v1`; `hono/app.ts` exports the app type for Hono RPC clients. Module endpoints require an authenticated session; active tenant scope is selected only through a membership verified by the server, never a caller-supplied header. Users are global identities with tenant-scoped organization memberships. Non-production signup creates an organization owner; production signup is disabled until email verification and abuse controls exist. Invitations and production onboarding remain incomplete. Definition endpoints live under `/v1/modules/:moduleId/{schema,entities,fields,relations}`. Enabled modules expose metadata-validated record CRUD at `/v1/modules/:moduleId/entities/:entityId/records`, including bounded filtering, sorting, search and relation links; hidden fields are omitted from responses and stale/unique/cardinality conflicts return 409.
- `packages/meta`: source of truth for Zod schemas and TS types for modules, entities, fields, views, workflows, permissions, and related metadata.
- `packages/engine`: server-side domain core, organised as plain subfolders (not a separate package): entity, query, permission, workflow, hooks.
- `packages/db`: Drizzle on PostgreSQL; PGlite is the local development default when `DATABASE_URL` is unset. It also owns the `db:migrate`, `db:seed`, and `db:check` commands, replacing the removed CLI workspace. Shared-schema tenancy scopes generic JSONB-backed records, metadata, and module definitions; use `tenantRepository` for tenant record/link access, `moduleRepository` for module lifecycle operations, and `definitionRepository` for a module's entity/field/relation definitions (stored in `nexa_metadata_definitions`, editable only while the module is draft/review, validated by `definition-integrity.ts` on every write). Migrations are forward-only under `packages/db/migrations`.
- `packages/ui`: shadcn-vue + Tailwind primitives and metadata-driven field/view renderers; keep those layers separate.
- `packages/auth` and `packages/sdk`: authentication utilities and typed API client.
- `templates/{inventory,crm,hr}`: metadata packages, not built-in domain logic. `integrations/*` provide workflow actions.

Path aliases (`@nexa/*`) are defined in `tsconfig.base.json`.

## Commands

Use pnpm 9.15.4 and Node.js `^22.21.0` (Nuxt 4 requirement).

```bash
pnpm install
pnpm dev          # Hono API server
pnpm dev:api      # Hono API server
pnpm db:migrate   # Apply forward-only DB migrations
pnpm db:seed      # Seed system tenant/settings
pnpm db:check     # Check connectivity, schema, migrations
pnpm build        # Workspace build
pnpm typecheck    # Workspace typecheck
pnpm test         # Vitest workspace tests
```

Run tests directly if Turbo cannot spawn child processes in the current shell:

```bash
./node_modules/.bin/vitest run
```

## Rules

- Keep the platform metadata-driven: no built-in Inventory/CRM/HR/Accounting logic in `engine` or reusable UI. Domain modules are data under `templates/` and use the same runtime as user-created modules.
- Define metadata shapes in `packages/meta` first; other packages consume those schemas/types rather than redefining them.
- Persistence and business rules belong in `packages/engine` / `packages/db`, never in Hono or Nuxt handlers. Keep routes thin: parse/validate with schemas from `meta`, call engine, map the response.
- Use parameterized queries and transactions. Migrations are forward-only; never edit an applied migration.
- Integrations are workflow actions, not special cases in the engine.
- Commit lockfiles. Do not commit `node_modules/`, `.nuxt/`, `.output/`, `dist/`, `.env*`, or `.data/`.

## UX/UI design documentation

- For any explicitly authorized UX/UI task, read [`docs/design.md`](docs/design.md) and [`docs/plans/ux-ui-redesign.md`](docs/plans/ux-ui-redesign.md) before proposing or implementing changes. Also follow `AGENTS.md` and the active sequence in [`docs/plans/README.md`](docs/plans/README.md).
- `docs/design.md` is the shared implementation reference for visual language, semantic tokens, typography, spacing, reusable components, responsive layouts, accessibility, localization, interaction states, implementation workflow, and definition of done.
- `docs/plans/ux-ui-redesign.md` is the UX improvement plan: goals, information architecture, scope, and suggested sequence. It does not override the active master plan.
- Backend hardening remains the current focus. Do not start a UX/UI phase, create a new branch, or reorder the master plan unless explicitly asked and permitted by the project workflow.
- `apps/web` and `apps/cli` were intentionally removed on 2026-10-09. Do not assume they exist or recreate them unless explicitly asked. Inspect current files, workspace configuration, and routes first.
- If UI work is authorized, reuse the current UI package, design tokens, localization, and metadata-driven renderers. Do not add a parallel component library, dead navigation, fabricated data, or domain-specific logic to generic platform UI.
- Before editing, inspect `git status --short` and preserve unrelated changes. After editing, run relevant tests/typecheck/lint/build gates supported by the current workspace and report exact results; never claim unrun checks passed.

## Git workflow

Follow `docs/plans/README.md` sequentially: one planned phase per version branch, run its applicable gates, review and commit/push before creating the next branch. Do not skip or reuse version branches, force-push, or add phases beyond the master plan. Do not begin the next phase or create its branch until explicitly asked by the user.

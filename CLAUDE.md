# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Status

Nexa is a metadata-driven app platform. Backend hardening is the current focus. `apps/web` and `apps/cli` were intentionally removed on 2026-10-09 and may be reassembled after the backend is ready; do not assume those workspaces exist.

## Architecture

- `apps/server`: standalone Hono API server, versioned under `/v1`; `hono/app.ts` exports the app type for Hono RPC clients. Module endpoints require an authenticated session; active tenant scope is selected only through a membership verified by the server, never a caller-supplied header. Users are global identities with tenant-scoped organization memberships. Non-production signup creates an organization owner; production signup is disabled until email verification and abuse controls exist. Invitations and production onboarding remain incomplete. Definition endpoints live under `/v1/modules/:moduleId/{schema,entities,fields,relations}`. Enabled modules expose metadata-validated record CRUD at `/v1/modules/:moduleId/entities/:entityId/records`, including bounded filtering, sorting, search and relation links; hidden fields are omitted from responses and stale/unique/cardinality conflicts return 409.
- `packages/meta`: source of truth for Zod schemas and TS types for modules, entities, fields, views, workflows, permissions, and related metadata.
- `packages/engine`: server-side domain core, organised as plain subfolders (not a separate package): entity, query, permission, workflow, hooks.
- `packages/db`: Drizzle on PostgreSQL; PGlite is the local development default when `DATABASE_URL` is unset. It also owns the `db:migrate`, `db:seed`, and `db:check` commands, replacing the removed CLI workspace. Shared-schema tenancy scopes generic JSONB-backed records, metadata, and module definitions; use `tenantRepository` for tenant record/link access, `moduleRepository` for module lifecycle operations, and `definitionRepository` for a module's entity/field/relation definitions (stored in `nexa_metadata_definitions`, editable only while the module is draft/review, validated by `definition-integrity.ts` on every write). Migrations are forward-only under `packages/db/migrations`.
- `packages/ui`: Nexa's own plain Vue 3 component library styled with Tailwind v4 and Reka UI for overlays (Phase 22 in [`docs/plans/README.md`](docs/plans/README.md)), built from the Figma mockup `D:\project\mockup\nexa.figcraft`. Tokens (Light/Dark) are CSS variables mirrored from the mockup. Components are prefixed `Nx`; the package has no Nuxt layer and no `@nuxt/ui` dependency.
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

## UX/UI

- UI components are hand-built in `packages/ui` with Tailwind and follow the Figma mockup. Use only token utilities (no hardcoded colors), support Light and Dark, and keep components keyboard accessible. `packages/ui` takes data as props and never calls the SDK. Do not add a second component library beyond Reka UI for overlays.
- Verify UI changes in the playground (`pnpm --filter @nexa/ui dev`), not only through tests.
- Follow the active phase sequence in [`docs/plans/README.md`](docs/plans/README.md). UI work does not authorize starting a new phase or branch by itself.
- `apps/web` and `apps/cli` were intentionally removed on 2026-10-09. Do not recreate them unless explicitly asked.

## Git workflow

Follow `docs/plans/README.md` sequentially: one planned phase per version branch, run its applicable gates, review and commit/push before creating the next branch. Do not skip or reuse version branches, force-push, or add phases beyond the master plan. Do not begin the next phase or create its branch until explicitly asked by the user.

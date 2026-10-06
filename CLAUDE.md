# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Status

Nexa is a metadata-driven app platform. The initial monorepo foundation is in place; product runtimes and metadata schemas remain to be implemented. Verify current code before assuming a package has functionality.

## Architecture

- `apps/web`: Nuxt 4 app for the Builder and end-user Runtime.
- `apps/server`: standalone Hono API server, versioned under `/v1`; `hono/app.ts` exports the app type for Hono RPC clients. It is run separately from Nuxt.
- `packages/meta`: source of truth for Zod schemas and TS types for modules, entities, fields, views, workflows, permissions, and related metadata.
- `packages/engine`: server-side domain core, organised as plain subfolders (not a separate package): entity, query, permission, workflow, hooks.
- `packages/db`: Drizzle on PostgreSQL; PGlite is the local development default when `DATABASE_URL` is unset. User-defined entities are intended to use generic JSONB-backed records rather than per-entity DDL.
- `packages/ui`: shadcn-vue + Tailwind primitives and metadata-driven field/view renderers; keep those layers separate.
- `packages/auth` and `packages/sdk`: authentication utilities and typed API client.
- `templates/{inventory,crm,hr}`: metadata packages, not built-in domain logic. `integrations/*` provide workflow actions.

Path aliases (`@nexa/*`) are defined in `tsconfig.base.json`.

## Commands

Use pnpm 9.15.4 and Node.js `^22.21.0` (Nuxt 4 requirement).

```bash
pnpm install
pnpm dev          # Nuxt app
pnpm dev:api      # Hono API server
pnpm build        # Turbo workspace build
pnpm typecheck    # Turbo workspace typecheck
pnpm test         # Turbo workspace tests
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

## Git workflow

Follow `docs/plans/README.md` sequentially: one planned phase per version branch, run its applicable gates, review and commit/push before creating the next branch. Do not skip or reuse version branches, force-push, or add phases beyond the master plan. Do not begin the next phase or create its branch until explicitly asked by the user.

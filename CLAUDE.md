# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Nexa is a metadata-driven app platform. The monorepo skeleton exists (pnpm workspace) but most packages are empty stubs (`export {}`); `apps/web` has no Nuxt config yet. Check what actually exists before assuming a package is implemented.

## Architecture

- `apps/web`: Nuxt app serving both the Builder (designer) and Runtime (end-user pages). API is a Hono app mounted inside Nitro via a catch-all handler (`server/api/[...].ts`), so Builder, Runtime and API deploy as one unit; split into `apps/api` later only if needed. Export the Hono app type so `packages/sdk` can use Hono RPC (`hc`).
- `packages/meta`: **Source of truth.** Zod schemas + TS types for Entity, Field, View, Workflow, Permission. Every other package derives from these.
- `packages/engine`: server-side core, organised as plain subfolders (not a package): `entity` (CRUD/validation/relation), `query` (filter/sort/aggregate -> SQL), `permission`, `workflow` (trigger -> condition -> action), `hooks` (custom logic insertion points).
- `packages/db`: Drizzle on PostgreSQL (PGlite in dev when `DATABASE_URL` is unset, data in `.data/`). User entities are stored as jsonb records in generic tables (no per-entity DDL); this package owns metadata tables and index management.
- `packages/ui`: renderer built on shadcn-vue + Tailwind: field components and table/form/kanban views driven by metadata. Keep shadcn primitives separate from the metadata-driven renderers.
- `packages/auth`, `packages/sdk` (API client for external use).
- `templates/{inventory,crm,hr}`: metadata packages (JSON/YAML), not code. Domain modules live here as data.
- `integrations/*`: excel, pdf, email, line, webhook — implemented as actions that workflows invoke.

Path aliases (`@nexa/*`) are defined in `tsconfig.base.json`.

## Commands

Use `pnpm` (workspace defined in `pnpm-workspace.yaml`).

```bash
pnpm install
pnpm dev          # runs @nexa/web
pnpm build        # pnpm -r build
pnpm typecheck    # pnpm -r typecheck
```

No test or lint tooling is configured yet; add it when introducing it and update this section.

## Rules

- Keep the platform metadata-driven: no built-in Inventory/CRM/HR/Accounting logic in `engine` or `ui`. Domain modules are template data under `templates/`, run through the same engine as user-created ones.
- Change entity/field/view/workflow/permission shapes in `packages/meta` first; other packages must consume those types rather than redefine them.
- Persistence and business rules belong in `packages/engine` / `packages/db`, never in Hono/Nitro handlers. Keep Hono route handlers thin: parse and validate (`@hono/zod-validator` with schemas from `meta`), call engine, map response.
- Use parameterized queries and transactions. Migrations are forward-only; never edit an applied migration.
- Integrations are workflow actions, not special cases in the engine.
- Commit lockfiles. Do not commit `node_modules/`, `.nuxt/`, `.output/`, `dist/`, `.env*`.

## Git workflow

Work proceeds in sequential version branches (`v0.0.1`, `v0.0.2`, ...), one planned phase per branch, following `docs/plans/README.md` (phase table and status). Run the relevant build/typecheck/test gates, commit, and push before creating the next branch from the completed one. Never skip versions, reuse a finished branch, or force-push. If a phase can't be completed safely, stop and report the blocker. The repo is not yet `git init`-ed.

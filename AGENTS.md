# Agent Instructions

## Project

Nuxt 4 + Nuxt UI 4 + NuxtHub SQLite ERP foundation. Follow the milestone plan in [`.hermes/plans/2026-09-03_2200-erp-milestone.md`](.hermes/plans/2026-09-03_2200-erp-milestone.md). Follow UI rules in [`design.md`](design.md).

## Commands

- Install: `pnpm install`
- Develop: `pnpm run dev`
- Build: `pnpm run build`
- Preview: `pnpm run preview`
- Test: `pnpm run test`
- Database: `pnpm run db:generate`, `pnpm run db:migrate`

Use pnpm only. `package.json` pins `pnpm@11.9.0`.

## Structure

- `app/pages/`: Nuxt routes and page UI
- `app/components/`: reusable UI components
- `app/composables/`: client-side state and logic
- `server/api/`: Nitro API handlers
- `server/db/`: Drizzle schemas and database code
- `tests/`: Vitest tests
- `.data/`: local SQLite runtime data; never commit

## Rules

- TypeScript only.
- Preserve metadata-driven design; avoid hardcoded ERP entities.
- Use Nuxt UI components where specified by `design.md`; prefer raw `<table>` over `UTable`.
- Use `USlideover` for contextual editing; avoid unnecessary modal/page navigation.
- Keep workflow linear and list-based; no drag-and-drop/canvas.
- Keep MVP scope: no auth, field-level permissions, D1, branching workflows, or multi-sheet Excel unless explicitly requested.
- Do not create `drizzle.config.ts`; use NuxtHub database commands.
- Validate trust-boundary input. Add focused tests for non-trivial logic.
- Run `pnpm run build` after configuration or production-impacting changes.

## Known Pitfalls

- `@nuxthub/db` is not an npm package; do not add it as a dependency. NuxtHub currently provides database integration through `@nuxthub/core`.
- SQLite is configured in `nuxt.config.ts` with `hub: { db: 'sqlite' }`.
- The current local database path is `.data/db/sqlite.db`; do not assume the plan's older `.data/hub/db.sqlite` path.
- `pnpm run test` may report no test files until tests are added.
- Nuxt may emit non-blocking rolldown declaration or Node export warnings during builds; distinguish warnings from failures.

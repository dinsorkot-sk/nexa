<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Language

- Respond to the user in Thai (ภาษาไทย) by default. Keep code, identifiers, file paths, commands, commit messages, and logs in their original form; translate only the prose. Switch to another language only when the user writes in it or explicitly asks.

## Nexa Backend

- Backend hardening is the current focus. `apps/web` and `apps/cli` were intentionally removed on 2026-10-09; do not recreate them unless explicitly asked. The UI and CLI may be reassembled after the backend is ready.
- `apps/server` is the Hono API under `/v1`. Protected routes derive active tenant scope from the session and a verified organization membership, not request headers. Users are global identities with tenant-scoped organization memberships. Signup creates an organization owner in non-production; public signup is disabled in production until email verification and abuse controls are implemented.
- `packages/meta` owns shared Zod schemas and types. `packages/db` owns Drizzle persistence, migrations, and the `db:migrate`, `db:seed`, and `db:check` commands. `packages/engine` contains server-side domain logic in source subfolders, not a separate workspace package. `packages/auth` and `packages/sdk` provide shared auth utilities and the typed API client. Integrations and templates are separate packages.
- Keep handlers thin: validate inputs with `packages/meta`, call engine or repository code, and map errors to HTTP responses. Keep persistence/business rules out of Hono routes. Scope data access through tenant-aware repositories.
- Migrations are forward-only under `packages/db/migrations`; never edit an applied migration. Follow [docs/plans/README.md](docs/plans/README.md) in order and do not start another phase or branch until explicitly asked.
- Preserve user changes in a dirty worktree. Before destructive operations, inspect status and obtain explicit approval where the requested scope is unclear.

## Commands

Use pnpm `9.15.4` and Node.js `^22.21.0`.

```bash
pnpm dev                 # Hono API server
pnpm db:migrate          # Apply forward-only DB migrations
pnpm db:seed             # Seed system tenant/settings
pnpm db:check            # Check connectivity, schema, migrations
pnpm typecheck
pnpm test
```

Vitest is configured at the repository root. If a package-scoped command cannot resolve workspace projects or parallel runs hit PGlite timeouts, run the focused server suite from the root:

```bash
pnpm exec vitest run --project @nexa/server --reporter=dot --testTimeout=30000 --maxWorkers=1
```

For detailed architecture and repository conventions, see [CLAUDE.md](CLAUDE.md). Historical phase scope and verification notes live in [docs/plans/README.md](docs/plans/README.md).

## UX/UI

- UI is built with Nuxt UI v4 through the `packages/ui` layer. Use its `U*` components, color tokens (`primary`/`neutral`), and locales; do not add custom design tokens or hand-built primitives.
- Follow the active phase sequence in `docs/plans/README.md`. UI work does not authorize starting a new phase or branch by itself.
- `apps/web` and `apps/cli` were intentionally removed on 2026-10-09. Do not recreate them unless explicitly asked.
- Preserve existing user changes. Check `git status --short` before editing, run applicable checks, and report what was changed and what remains unverified.

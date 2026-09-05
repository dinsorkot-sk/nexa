---
name: nuxthub-guidance
description: 'Use when explaining, configuring, developing, testing, migrating, or deploying NuxtHub features in Nuxt applications. Covers SQL database schema, queries, migrations, CLI, Blob uploads and SDK, Key-Value, Cache, pre-rendering, realtime WebSockets, environments, CI/CD, and environment variables using official NuxtHub documentation.'
argument-hint: 'Describe the NuxtHub feature, task, error, or deployment target.'
---

# NuxtHub Guidance

## Purpose

Provide authoritative, fact-checked NuxtHub guidance for this repository's Nuxt 4 application. Follow official NuxtHub documentation, preserve project constraints, and avoid deprecated patterns or unverified packages.

## When to Use

- Install, configure, or upgrade NuxtHub in a Nuxt project.
- Implement or troubleshoot SQL databases, schemas, queries, migrations, or the `nuxt db` CLI.
- Implement or troubleshoot Blob storage, file uploads, image serving, or the Blob SDK.
- Configure or use Key-Value (`kv`) storage or Cache storage.
- Implement route caching, pre-rendering, or realtime WebSockets.
- Manage local, preview, staging, and production environments.
- Set up CI/CD pipelines, remote migrations, and environment variables.
- Migrate away from deprecated NuxtHub patterns (`hubDatabase()`, NuxtHub Admin, `nuxthub deploy`).

## Official Documentation Map

Consult the relevant official guide before writing or changing code:

- **Getting Started & Platform**
  - [Installation](https://hub.nuxt.com/docs/getting-started/installation)
  - [Deploy Nuxt on a cloud provider](https://hub.nuxt.com/docs/getting-started/deploy)
  - [Migrating from v0.9 to v0.10](https://hub.nuxt.com/docs/getting-started/migration)
  - [Environments](https://hub.nuxt.com/docs/getting-started/environments)
- **SQL Database**
  - [Nuxt SQL Database](https://hub.nuxt.com/docs/database)
  - [Database Schema](https://hub.nuxt.com/docs/database/schema)
  - [Database Queries](https://hub.nuxt.com/docs/database/query)
  - [Database Migrations](https://hub.nuxt.com/docs/database/migrations)
  - [Database CLI](https://hub.nuxt.com/docs/database/cli)
- **Blob Storage**
  - [Nuxt Blob Storage](https://hub.nuxt.com/docs/blob)
  - [File Uploads](https://hub.nuxt.com/docs/blob/upload)
  - [Using the Blob SDK](https://hub.nuxt.com/docs/blob/usage)
- **Key-Value & Cache**
  - [KV Setup](https://hub.nuxt.com/docs/kv)
  - [Using KV SDK](https://hub.nuxt.com/docs/kv/usage)
  - [Cache Setup](https://hub.nuxt.com/docs/cache)
  - [Caching in Nuxt](https://hub.nuxt.com/docs/cache/usage)
- **Guides & Reference**
  - [Pre-rendering](https://hub.nuxt.com/docs/guides/pre-rendering)
  - [Realtime & WebSockets](https://hub.nuxt.com/docs/guides/realtime)
  - [CI/CD Deployment](https://hub.nuxt.com/docs/guides/ci-cd)
  - [Environment Variables Reference](https://hub.nuxt.com/docs/reference/environment-variables)

## Procedures by Feature Area

### 1. Project & Module Configuration
1. Read [`AGENTS.md`](../../../AGENTS.md), [`design.md`](../../../design.md), and [`.hermes/plans/2026-09-03_2200-erp-milestone.md`](../../../.hermes/plans/2026-09-03_2200-erp-milestone.md).
2. Configure modules in `nuxt.config.ts` under `hub`:
   - SQL: `hub: { db: 'sqlite' }` (or `postgresql` / `mysql` / object config).
   - Blob: `hub: { blob: true }` or driver options.
   - KV: `hub: { kv: true }` or driver options.
   - Cache: `hub: { cache: true }` or driver options.
3. Install dependencies with `pnpm install`.
4. Never add `@nuxthub/db` as a dependency in `package.json`; NuxtHub generates `@nuxthub/db` in `node_modules` during dev and build.

### 2. SQL Database & Drizzle
1. Define schema files under `server/db/schema.ts`, `server/db/schema.{dialect}.ts`, or `server/db/schema/*.ts`.
2. Do not create `drizzle.config.ts`; NuxtHub manages Drizzle configuration automatically.
3. Use `db` and `schema` auto-imported on the server, or import from `@nuxthub/db` (or legacy `hub:db`).
4. Generate migrations with `pnpm run db:generate` (`nuxt db generate`). Never author untracked manual migration files by hand unless using the custom migration CLI workflow.
5. In development and build, local SQLite migrations apply automatically to `.data/db/sqlite.db`.
6. Use `nuxt db` CLI commands for maintenance: `generate`, `migrate`, `mark-as-migrated`, `drop`, `drop-all`, `squash`, `sql`.

### 3. Blob Storage & File Uploads
1. For simple uploads, use `blob.handleUpload(event, options)` on the server and `useUpload(apiPath)` in Vue components.
2. For large files (>10MB), use `blob.handleMultipartUpload(event, options)` and `useMultipartUpload(apiPath)` with progress tracking.
3. Use server SDK methods on `blob` (or `@nuxthub/blob`): `put`, `get`, `head`, `del` / `delete`, `list`, `serve`.
4. Use `ensureBlob(file, { maxSize, types })` to enforce trust-boundary validation.
5. For optimized image delivery, combine `blob.serve()` routes with `@nuxt/image` (`provider: 'none'` in dev; provider set in `$production`).

### 4. KV Storage & Cache
1. Use **Cache** for recomputable data with automatic expiration; use **KV** for persistent state that must survive until explicitly deleted.
2. For Cache: use `cachedEventHandler` or `defineCachedFunction` with explicit `maxAge` and `getKey`. Normalize invalidation keys with `escapeKey()`.
3. For KV: use `kv.set(key, value, { ttl })`, `kv.get(key)`, `kv.has(key)`, `kv.del(key)`, `kv.clear(prefix)`, and `kv.keys(prefix)`.
4. Use `hub:kv` or `@nuxthub/kv` imports if explicit imports are required.

### 5. Pre-rendering & Realtime
1. Use `routeRules` in `nuxt.config.ts` or `defineRouteRules({ prerender: true })` in page components.
2. When deploying to Cloudflare Pages, observe the 100-route exclusion limit and configure `nitro.cloudflare.pages.routes.exclude`.
3. For WebSockets, enable `nitro: { experimental: { websocket: true } }`, implement handlers with `defineWebSocketHandler`, and connect on the client using `@vueuse/core` `useWebSocket`.

### 6. Environments, CI/CD, & Cloudflare D1
1. Maintain local development storage under `.data/` (`.data/db/sqlite.db`, `.data/blob/`, `.data/kv/`, `.data/cache/`). Never commit `.data/`.
2. Cloudflare D1 migrations cannot run during build in CI environments. In CI/CD:
   - Disable build-time migrations with `applyMigrationsDuringBuild: false`.
   - Apply migrations before deploy using Wrangler against the generated `.output/server/wrangler.json`.
   - Pattern: `wrangler d1 migrations apply DB --remote --config .output/server/wrangler.json && wrangler deploy`.
3. For PostgreSQL and MySQL in CI/CD, network access allows build-time migrations or dedicated migration jobs via `nuxt db migrate`.
4. Manage multi-environment deployments using `CLOUDFLARE_ENV` (e.g. `preview`, `staging`) and environment-specific bindings.

## Repository Facts

- Package manager: pnpm `11.9.0`.
- Nuxt version: `4.5.2` with Nuxt UI `4.11.0`.
- NuxtHub core: `@nuxthub/core`.
- Local SQLite database path: `.data/db/sqlite.db`.
- Project scripts: `dev`, `build`, `generate`, `preview`, `test`, `db:generate`, `db:migrate`, `db:seed`, `db:seed-pm`.
- Architecture boundaries: `app/pages/`, `app/components/`, `app/composables/`, `server/api/`, `server/db/`, `tests/`.
- Scope discipline: metadata-driven ERP foundation; no auth, field-level permissions, D1, branching workflows, or multi-sheet Excel unless explicitly requested.

## Quality Ceiling

Prefer native NuxtHub and Nitro features over bespoke wrappers. Keep diffs minimal. Verify builds with `pnpm run build` after changes. Link to official documentation and internal project docs rather than creating duplicate explanatory files.

# Nexa ERP

Open-source no-code/low-code ERP for wholesale and distribution businesses. Nexa starts with sales, purchasing, and inventory workflows for teams of 5–50 people.

## Current status

The repository now uses a pnpm monorepo layout with separate web and API apps plus shared package boundaries. It contains an initial Nuxt web shell and a Fastify health endpoint. ERP workflows, authentication, tenant enforcement, and SQLite persistence are not implemented yet. Do not use it with real customer data.

## Project structure

```text
apps/
  web/                 Nuxt + Nuxt UI frontend
  api/                 Fastify HTTP API
packages/
  contracts/           Shared API contracts
  core/                Domain types, rules, use cases, repository ports
  database/            SQLite schema, migrations, tenant-scoped repositories
  ui/                  Nexa-specific UI components and tokens
patches/               Reviewed pnpm dependency patches only
docs/                  Product, architecture, and delivery plan
```

The API should depend on `@nexa/core` and `@nexa/database`; the web app should call the API through `@nexa/contracts`. Keep database code out of the web and API route handlers. Add domain packages such as sales, purchasing, and inventory only after their boundaries are clear.

## Stack and deployment direction

- TypeScript
- Nuxt 4 and Nuxt UI for the web app
- Fastify as the initial, replaceable API adapter
- SQLite for the self-hosted first release
- pnpm workspaces for monorepo management and dependency patches
- Apache-2.0

Self-hosting is the first deployment target. SaaS is planned after tenant isolation, SQLite operations, and backup/restore behavior pass review.

## Requirements

- Node.js 22 or newer
- pnpm 12.8 or compatible

## Local development

```sh
pnpm install
pnpm dev
```

Run one app at a time:

```sh
pnpm dev:web
pnpm dev:api
```

Type-check and build workspace packages:

```sh
pnpm typecheck
pnpm build
```

The database driver and migration tool remain open implementation choices. Add them to `packages/database` after comparing SQLite deployment, migration, and licensing requirements.

## Project documents

- [Product brief](./docs/product-brief.md)
- [Architecture proposal](./docs/architecture.md)
- [Initial delivery plan](./docs/roadmap.md)

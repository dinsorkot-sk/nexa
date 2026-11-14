# Nexa Architecture Proposal

**Status:** Founder-approved baseline with open data-model decisions  
**Scope:** First usable ERP release plus an incremental no-code/low-code builder

## 1. Design goals

- Keep the first product operable by a small development team.
- Preserve clear boundaries between ERP domains and custom modules.
- Support self-hosted and hosted deployments from the same application code.
- Make tenant boundaries, permissions, and audit history explicit.
- Let module definitions evolve without silently losing customer data.
- Avoid executing arbitrary user code in the application process.

## 2. Repository and runtime boundaries

Use a pnpm workspace monorepo. Keep the browser app, HTTP API, domain core, transport contracts, and database adapter in separate projects with one-way dependencies.

```text
apps/
  web/                 Nuxt + Nuxt UI browser application
  api/                 Fastify HTTP API (initial adapter)
packages/
  contracts/           Shared versioned API request/response contracts
  core/                Domain rules, use cases, repository/service ports
  database/            SQLite connection, schema, migrations, repositories
  ui/                  Nexa UI components and tokens on top of Nuxt UI
patches/               Reviewed pnpm dependency patch files
```

Runtime dependency direction:

```text
apps/web -> packages/contracts <- apps/api -> packages/core <- packages/database
```

`apps/api` composes core use cases and database adapters. It must not embed SQL in route handlers. `apps/web` calls the HTTP API and must not open SQLite directly. `packages/core` must not import Nuxt, Fastify, or a database driver. The UI package must not contain business rules. Add separate domain packages for sales, purchasing, or inventory only when their ownership boundaries justify it.

Keep the API and web app separately runnable and deployable. Start without a background worker; add one when a real asynchronous job requirement appears. Dependency patches must be small, reviewed, documented, and removed after an upstream fix is available.

### Founder-approved stack direction and current implementation choices

- Language: TypeScript
- Frontend: Nuxt 4 + Nuxt UI in `apps/web`
- Backend: separate TypeScript API in `apps/api`; Fastify is the initial adapter and remains replaceable
- Shared contracts and domain core: `packages/contracts` and `packages/core`
- Database: SQLite adapter in `packages/database`
- Workspace and dependency patches: pnpm workspaces and `patches/`
- UI components: Nuxt UI
- Database for the self-hosted first release: SQLite
- Deployment order: self-hosted first; evaluate and deliver SaaS after operational and tenancy validation

SQLite driver/ORM remain implementation details to settle with the first persistence slice. Preserve a database access boundary so the core domain does not depend directly on a specific query library. The SaaS plan must include a load, durability, backup/restore, and concurrency review for the selected SQLite deployment topology; do not assume a horizontally scaled shared SQLite file without evidence.

## 3. Domain modules

Keep core business data relational and owned by a domain module:

- Identity and organizations
- Catalog
- Customers and suppliers
- Sales
- Purchasing
- Inventory
- Reporting and audit
- Custom module runtime and builder

Sales and purchasing documents should retain stable identifiers, explicit states, and append-only business events for stock-affecting actions. Inventory quantity should be explainable from movements; avoid treating an editable number as the only source of truth.

## 4. Custom module model (proposal)

Separate module **definitions** from module **records**:

- Definitions describe fields, types, validation, relationships, views, and workflow configuration.
- Definitions are versioned. A published version is immutable; edits create a new draft/version.
- Records carry organization/tenant ownership and the definition version used to validate them.
- Core ERP entities remain typed relational tables. Custom modules use a controlled metadata-driven storage path.
- A migration preview and validation step is required before a new definition version is published.

### Storage options requiring a decision

1. **Relational table per custom module:** strongest SQL constraints and reporting; requires schema migrations and careful change handling.
2. **JSONB record store with indexed metadata:** flexible and easier to deploy; cross-record constraints, joins, and reporting become harder.
3. **Hybrid:** metadata definitions with generated relational tables for published modules; most capable but adds migration and operations complexity.

**Recommendation for the first builder release:** prototype metadata-backed custom records using SQLite-compatible storage, while keeping core ERP tables relational. JSON validity/query support and typed references must be checked with the selected SQLite version and driver. Validate query, reporting, export, and migration needs before locking this choice. Do not let custom records replace core sales, purchasing, or inventory entities.

## 5. Tenancy and security boundary (founder approval required)

The founder approved a shared SQLite database with tenant keys as the initial direction. This is not permission to begin storing production customer data; the security review remains a release gate.

Alternatives remain relevant if security, backup, or SaaS operating requirements invalidate the shared-file direction:

- **Shared SQLite database and schema with tenant keys:** simple self-host installation and backups; every query, background job, and reference must enforce tenant scope, and concurrent-write/deployment constraints need review.
- **Schema per tenant:** stronger operational separation but migrations and cross-tenant operations become more complex.
- **Database per tenant:** strongest separation and backup flexibility; highest provisioning and upgrade burden.

**Initial implementation requirements:** derive tenant context from the authenticated membership; require tenant scope in repository APIs; use tenant-qualified keys and foreign keys; run each request/transaction with an explicit tenant context; test cross-tenant reads, writes, references, and background jobs. SQLite does not provide PostgreSQL-style row-level security, so the security review must assess whether application-level enforcement plus schema constraints is sufficient for the intended deployment. Keep a separate-database-per-tenant option available if the review finds shared-file isolation insufficient.

## 6. Authorization, audit, and workflow

- Use deny-by-default permission checks at the API boundary and domain operation level.
- Model roles and permissions around actions and resources; keep tenant membership explicit.
- Record actor, organization, timestamp, action, and relevant before/after references for sensitive changes.
- Keep workflow transitions explicit and validated by the owning module.
- Do not support arbitrary JavaScript, SQL, or shell execution in user workflows.
- Treat plugin and webhook credentials as secrets; define rotation and scope before external integrations.

These are design requirements for review, not a complete security specification.

## 7. API and extension points

- Version public APIs from the beginning.
- Use stable domain events for integrations, with delivery retries and idempotency keys.
- Expose webhooks and a documented extension API before promising a third-party plugin ecosystem.
- Keep internal events distinct from externally supported contracts.
- Avoid allowing extensions to bypass authorization, audit, or tenant boundaries.

## 8. Deployment and localization

- Build one deployable application that can run self-hosted or as a SaaS tenant service.
- Keep tenant provisioning and configuration explicit and repeatable.
- Document backups, restores, upgrades, and rollback expectations before calling a release self-host ready.
- Use translation catalogs and locale-aware formatting from the first UI screens.
- Keep currency, timezone, locale, and country compliance configuration separate.
- Country-specific accounting and tax behavior should be implemented as reviewed modules, not implicit global defaults.

## 9. Data lifecycle and upgrades

- Version module definitions and migration plans.
- Make destructive schema or data transformations previewable and recoverable.
- Require export paths for core and custom data.
- Define backup/restore acceptance criteria for self-host and SaaS separately.
- Do not promise zero-downtime upgrades until migration behavior is proven.

## 10. Architecture decision record queue

| ID | Decision | Current state | Required before |
|---|---|---|---|
| ADR-001 | Tenant isolation model | Shared SQLite database with tenant keys selected; security review required | Persisting production customer data |
| ADR-002 | Custom-module storage | Prototype and founder review | Builder data model implementation |
| ADR-003 | Technology stack | TypeScript + Nuxt + Nuxt UI + SQLite selected | Repository bootstrap |
| ADR-004 | SaaS and open-source sustainability model | Self-host first; SaaS later; commercial model open | SaaS-specific features and operations |
| ADR-005 | First country/localization pack | Open; English-first foundation | Country-specific behavior |

## 11. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Builder scope overwhelms ERP delivery | A full app platform is a large product by itself | Release in stages; keep the first release focused on one distribution workflow |
| Tenant data exposure | Shared tenant data has high impact if scope checks fail | Centralized tenant checks, tenant-qualified keys, cross-tenant tests, database constraints, and security review; SQLite has no row-level security |
| Custom schema changes lose data | User-defined modules evolve after records exist | Version definitions, preview migrations, preserve exports and recovery paths |
| Global scope expands compliance work | Accounting and tax rules vary by country | English-first core; defer statutory behavior to country modules |
| Open-source package conflicts | Dependencies and extensions may carry incompatible terms | Track licenses and review dependency compatibility before each release |
| Self-hosting burdens the team | Installation, upgrades, and backup support are ongoing work | Publish supported deployment path and test install/upgrade/restore workflows |

## 12. Review gates

Review gates before production or SaaS contracts are locked:

1. Complete security review of shared SQLite with tenant keys before production customer data.
2. Choose or authorize a prototype for custom-module storage.
3. Define SaaS topology and operational acceptance before starting SaaS delivery.


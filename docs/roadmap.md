# Nexa Initial Delivery Plan

This is a dependency-first plan for turning the founder direction into a reviewable and usable first release. Tasks are sequential where they define shared contracts. Parallel work should wait until module boundaries and tenant contracts are approved.

| ID | Task | Dependencies | Owner role | Acceptance criteria | Risk | Verification / expected output |
|---|---|---|---|---|---|---|
| NX-001 | Confirm product brief and first customer workflow | None | Founder + architect | Founder confirms target segment, workflow, and first release exclusions; set numeric success measures before first public release | High: scope is broad and user research is still a hypothesis | Product direction captured in `product-brief.md`; success measures remain open |
| NX-002 | Approve architecture contracts | NX-001 | Founder + architect | Stack and first deployment direction approved; tenant isolation accepted for initial self-host build with security review gate; custom-module storage deferred to prototype | High: tenant and data-model decisions are hard to reverse | Approved baseline in `architecture.md`; unresolved decisions remain explicit |
| NX-003 | Bootstrap monorepo and developer workflow | NX-002 | Implementer + integrator | Separate `apps/web` and `apps/api`; create `packages/core`, `contracts`, `database`, and `ui`; establish pnpm workspace, patches path, CI, contribution and license files | Medium: workspace boundaries and dependency resolution affect every contributor | A clean checkout can install dependencies and run app/package checks |
| NX-004 | Define core domain and API contracts | NX-003 | Architect + implementer | Core domain types and use-case ports do not depend on Nuxt, Fastify, or SQLite; web and API share versioned contracts | High: weak boundaries create circular dependencies and lock-in | Dependency review, typecheck, and contract compatibility checks |
| NX-005 | Implement SQLite persistence and tenant enforcement | NX-004 | Implementer + reviewer | SQLite schema and migrations live in `packages/database`; all repositories require tenant scope and use tenant-qualified constraints | High: shared SQLite has no row-level security | Migration checks and cross-tenant read/write/reference tests; security-review evidence before production data |
| NX-006 | Implement backend identity and API foundation | NX-005 | Implementer + reviewer | Fastify app composes core and database packages; versioned routes validate requests; identity and authorization are enforced centrally | High: API is the trust boundary for tenant data | API checks for unauthenticated, unauthorized, and cross-tenant requests |
| NX-007 | Implement catalog, sales, purchasing, and inventory use cases | NX-006 | Implementer + QA | Product, party, warehouse, order, receipt, and fulfillment operations use core rules and auditable stock movements | High: stock accuracy is central to ERP trust | Domain tests and documented purchase/sales inventory reconciliation scenarios |
| NX-008 | Build web workflows against the API | NX-007 | Implementer + QA | Nuxt screens use shared contracts and API endpoints for catalog, purchasing, sales, fulfillment, and basic reports | Medium | Browser workflow checks against the API; accessibility review |
| NX-009 | Deliver self-host operations | NX-008 | Implementer + integrator | Document and exercise install, configuration, database backup, restore, upgrade, and security review for tenant isolation | High: operators own local database and backups | Clean deployment and backup/restore exercise; security-review evidence |
| NX-010 | Prototype metadata-driven custom records and builder | NX-004, NX-009 | Architect + implementer + reviewer | Custom modules define fields/relations, validate records, export data, and evolve through versioned drafts; generated views/workflows follow | High: builder data model can become a platform rewrite | Prototype, migration/export evidence, query/reporting assessment; founder go/no-go |

## Ordering and gates

```text
NX-001 -> NX-002 -> NX-003 -> NX-004 -> NX-005 -> NX-006 -> NX-007 -> NX-008 -> NX-009
                     NX-004 + NX-009 -> NX-010
```

- NX-001 and NX-002 have founder direction captured; success metrics and custom-module storage remain open.
- NX-005 requires cross-tenant checks and a security review before storing production customer data.
- NX-009 must pass install/backup/restore and tenant-isolation review before self-host release.
- NX-010 requires a prototype and founder go/no-go before committing to a custom-module storage contract.
- Do not parallelize tasks that share tenant, identity, inventory, or module-schema contracts.

## Current checkpoint

- **Completed:** Product direction, TypeScript + Nuxt + Nuxt UI + SQLite stack direction, shared SQLite tenant-key approach, self-host-first order, and separate frontend/backend/package structure approved; initial monorepo shell created.
- **In progress:** NX-003 monorepo bootstrap and developer workflow; dependency installation and lockfile remain pending.
- **Founder review needed later:** custom-module storage prototype result, security review before production data, SaaS topology/business model, numeric success measures.
- **Environment blocker:** Node.js and package-manager executables are unavailable, so dependencies and lockfile could not be generated and workspace typecheck/build could not run.
- **Coordinator note:** Repository `teamctl.py` was not present in the environment when checked. No delegated agents or external task state were created; this initial pass is sequential because the bootstrap task has one shared project contract.

# ADR 0005: Starter packs: declarative, idempotent tenant setup over no-code surfaces

Status: Accepted (user chose the "Thai starter pack" phase, 2026-11-27). Builds on ADR 0004.

## Context

The Sales → ledger proofs (T3a/T3b) configure a tenant through roughly 200 HTTP calls kept in test
code. A real tenant needs the same configuration without copying test code. That configuration is
metadata and records, not code, so it should stay within the no-code surfaces ADR 0004 defines.

## Decision

- **Format.** A starter pack is a versioned JSON file shipped with the API (`apps/api/packs/`). It holds
  ordered `steps` of four kinds:
  - `model`: a Studio model;
  - `field`: a Studio field;
  - `record`: a record upserted by external id;
  - `update`: a write to an existing record.

  Values may use `$ref`, `$param`, `$search` and `$jsonText`. Packs are data only: no scripts and no
  code. The format is documented in `apps/api/packs/README.md`.
- **Surface.** Two endpoints, for Settings administrators only:
  - `GET /api/packs` lists the packs;
  - `POST /api/packs/:name/apply` applies one, with parameters such as `company`.
- **Same rules as manual setup.**
  - Models and fields use the operations behind `POST /api/studio/model` and `POST /api/studio/field`,
    now shared in `apps/api/src/engine/studio-ops.ts` with every check: protected models, the
    `res.company` field restrictions, one2many inverses and option rules.
  - Records go through the ORM with the caller's own rights in the target company, which must be one
    of the caller's allowed companies. ACLs, record rules, constraints and `ir.lifecycle` /
    `ir.date.lock` guards apply. Nothing runs as superuser.
- **Idempotent, not atomic.**
  - Existing models and fields are kept. A field that exists with another type is an error.
  - Records are bound to external ids `pack_<name>.<id>` (per company: `pack_<name>_c<company>.<id>`)
    through the new engine `ExternalIdService`, which is Settings-only and runs in the caller's
    transaction. On re-apply they are rewritten unless marked `noupdate`.
  - Applies of the same pack are serialized while they run in one API process. Each step commits
    independently, so a later failure does not rollback earlier steps.
  - Concurrent applies for the same pack and company are serialized in the API process. Pack files
    may declare an optional company-currency prerequisite under `requires.currency`.
  - Each step commits on its own, because schema changes rebuild the registry. After a failure, the
    administrator fixes the cause and applies again.
- **Proof.** `apps/api/test/th-pack.suite.ts` applies `th_accounting` to an empty tenant, re-applies it,
  and runs the Thai journeys. It runs on PGlite and on real PostgreSQL.

## Consequences

- A pack upgrade never removes or retypes fields or deletes records. Destructive changes stay manual
  Studio operations.
- No pack has been uninstalled yet; uninstall is not provided.
- Pack-created records are ordinary data: administrators can change them, and a re-apply restores
  everything not marked `noupdate`.
- Packs ship with the API release. Uploading third-party packs is out of scope: it would make pack
  content a trust boundary.

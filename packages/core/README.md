# @nexa/core

Own domain rules, use cases, and ports for persistence or external services. Keep this package independent of Nuxt, Fastify, and SQLite so it can be exercised without app infrastructure.

Tenant ownership and business invariants belong here. The database package implements repository ports defined by core; it must not redefine domain behavior.

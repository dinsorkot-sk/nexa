# @nexa/database

Own SQLite connection setup, schema, migrations, and repository implementations. Only the API composition layer should open the database. Repository methods must require a tenant scope; cross-tenant behavior must be covered by the security review and tests before production data is allowed.

The SQLite driver and migration toolkit are still open decisions. This package currently contains only the boundary placeholder.

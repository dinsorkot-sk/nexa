import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// embedded-postgres is a dev dependency of @nexa/engine only: use the engine's copy (its package folder)
const embeddedPostgres = fileURLToPath(new URL('../../packages/engine/node_modules/embedded-postgres', import.meta.url));

// HTTP proofs against real PostgreSQL. The engine's global setup starts one embedded server per run
// (or uses NEXA_TEST_PG_URL) and provides its admin URL as `pgUrl`.
export default defineConfig({
  resolve: { alias: { 'embedded-postgres': embeddedPostgres } },
  test: {
    include: ['test/pg/**/*.test.ts'],
    globalSetup: ['../../packages/engine/test/pg/global-setup.ts'],
    testTimeout: 60_000, hookTimeout: 180_000,
  },
});

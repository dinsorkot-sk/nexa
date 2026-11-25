import { defineConfig } from 'vitest/config';

/** Existing PGlite suites that also run unchanged against a real server (parity). */
const PARITY = ['orm', 'domain', 'security', 'relations', 'modules', 'timestamps', 'concurrency', 'bus', 'services', 'config'];

// Real PostgreSQL (embedded-postgres started once per run by test/pg/global-setup.ts).
export default defineConfig({
  test: {
    include: ['test/pg/**/*.test.ts', ...PARITY.map((f) => `test/${f}.test.ts`)],
    globalSetup: ['test/pg/global-setup.ts'],
    setupFiles: ['test/pg/parity-setup.ts'],
    testTimeout: 60_000, hookTimeout: 180_000, maxWorkers: 2, minWorkers: 1,
  },
});

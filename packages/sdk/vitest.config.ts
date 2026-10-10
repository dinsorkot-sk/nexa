import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // PGlite-backed tests bootstrap a fresh in-memory database per test; see root vitest.config.ts.
    testTimeout: 30_000,
  },
});

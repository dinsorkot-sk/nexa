import { defineConfig } from 'vitest/config';

// Opening a PGlite instance (one per tenant) takes a few seconds, more under parallel test files.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});

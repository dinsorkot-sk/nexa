import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The engine's tests sit next to the code they cover; see root vitest.config.ts.
    testTimeout: 30_000,
  },
});

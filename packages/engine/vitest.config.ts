import { defineConfig } from 'vitest/config';

// Each tenant is a PGlite (WASM Postgres) instance: slow to open and memory-hungry.
// Limit parallel workers so the per-process memory of embedded databases stays bounded.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 60_000, maxWorkers: 2, minWorkers: 1 },
});

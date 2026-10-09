import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // PGlite-backed tests bootstrap a fresh in-memory database (migrations + scrypt
    // password hashing) per test, which can exceed the default 5s under load.
    testTimeout: 30_000,
    projects: ['apps/*', 'packages/*', 'integrations/*', 'templates/*'],
  },
});

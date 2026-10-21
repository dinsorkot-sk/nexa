import { defineConfig } from 'vitest/config';

// The suite must give the same result whatever the shell says. The server reads NODE_ENV to decide whether signup
// is open and whether the session cookie is a __Host- one, and Vue's production build drops the devtools hook
// @vue/test-utils uses to record emitted events. A shell that exports NODE_ENV=production would otherwise fail a
// third of the suite.
//
// The value is set here as well as in `test.env` below, because the first one only reaches the test runtime: the
// transform pipeline reads NODE_ENV when the config is loaded, and a production pipeline externalises the node
// builtins the UI tests read their source from.
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: { NODE_ENV: 'test' },
    // PGlite-backed tests bootstrap a fresh in-memory database (migrations + scrypt
    // password hashing) per test, which can exceed the default 5s under load.
    testTimeout: 30_000,
    projects: ['apps/*', 'packages/*', 'integrations/*', 'templates/*'],
  },
});

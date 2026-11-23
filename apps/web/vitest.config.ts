import { defineConfig } from 'vitest/config'

// Unit tests for framework-free helpers only (app/utils); pages are verified by typecheck/build.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
})

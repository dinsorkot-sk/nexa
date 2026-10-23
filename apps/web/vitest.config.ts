import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The shell is a SPA and its pages run inside the Nuxt runtime, so only the composables have their
// own tests: `useApi`, `useEntity` and `useSession`, in a node environment with no Nuxt anywhere.
// The `~` alias resolves the way Nuxt's does, to the app directory, and the composables that only a
// Nuxt app provides (`api`, `ApiError`, `useState` reach `useSession` as auto-imports) come in
// through `vi.stubGlobal` in each test.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
});

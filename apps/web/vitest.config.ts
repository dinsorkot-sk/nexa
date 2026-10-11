import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'happy-dom',
  },
  resolve: {
    alias: {
      '@nexa/meta': fileURLToPath(new URL('../../packages/meta/src/index.ts', import.meta.url)),
      '@nexa/db': fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)),
      '@nexa/auth': fileURLToPath(new URL('../../packages/auth/src/index.ts', import.meta.url)),
      '@nexa/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
      '@nexa/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
    },
  },
});

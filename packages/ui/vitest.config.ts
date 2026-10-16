import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    testTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});

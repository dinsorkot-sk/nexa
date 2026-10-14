import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { defineConfig } from 'vitest/config';

// Components are mounted outside Nuxt, so the Nuxt UI Vite plugin supplies the styles and component transforms.
export default defineConfig({
  plugins: [vue(), ui()],
  test: {
    environment: 'happy-dom',
    testTimeout: 30_000,
  },
});

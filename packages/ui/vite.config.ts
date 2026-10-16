import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The playground is a plain Vite app that exercises the library the way an application would.
export default defineConfig({
  root: 'playground',
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5180,
  },
  resolve: {
    alias: {
      '@nexa/ui/styles.css': fileURLToPath(new URL('./src/styles/index.css', import.meta.url)),
    },
  },
});

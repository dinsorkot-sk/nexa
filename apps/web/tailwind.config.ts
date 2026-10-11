import type { Config } from 'tailwindcss';

/**
 * Extends the module's default content globs (apps/web/app/**) with the UI
 * package primitives so their classes survive the production CSS purge.
 */
export default {
  content: [
    '/mnt/d/project/nexa/apps/web/app/**/*.{vue,mjs,js,cjs,mts,ts,cts,tsx,jsx}',
    '../../packages/ui/src/**/*.{vue,ts}',
  ],
} satisfies Partial<Config>;

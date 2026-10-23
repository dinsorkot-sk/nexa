import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  {
    ignores: ['**/.nuxt/**', '**/.output/**', '**/dist/**', '**/node_modules/**'],
  },
  eslint.configs.recommended,
  // The Vue preset's rule blocks carry no `files` key, so they would judge every TypeScript file too — a Vue rule
  // complaining about a TypeScript test file. Scope them to the components they are about.
  ...vue.configs['flat/recommended'].map((config) => (config.files ? config : { ...config, files: ['**/*.vue'] })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: {
        defineNuxtConfig: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      // TypeScript reports an undefined name as TS2304, with the lib and the tsconfig in hand. ESLint's rule knows
      // neither, so it reports the DOM globals a TypeScript file is allowed to use.
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        RequestInfo: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        defineNuxtRouteMiddleware: 'readonly',
        definePageMeta: 'readonly',
        useRuntimeConfig: 'readonly',
        useState: 'readonly',
        useRoute: 'readonly',
        navigateTo: 'readonly',
        useApiClient: 'readonly',
        useAuth: 'readonly',
        ref: 'readonly',
        computed: 'readonly',
        reactive: 'readonly',
        defineProps: 'readonly',
        defineEmits: 'readonly',
        defineOptions: 'readonly',
        withDefaults: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
  },
  {
    // Nuxt resolves routes from file names, so page and layout files are single-word by design.
    files: ['apps/web/app/pages/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
];

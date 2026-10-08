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
  ...vue.configs['flat/recommended'],
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
    },
  },
  {
    files: ['apps/web/app/**/*.vue', 'apps/web/app/**/*.ts', 'apps/web/test/**/*.ts'],
    rules: {
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
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
];

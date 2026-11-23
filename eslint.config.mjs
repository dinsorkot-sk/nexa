import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['**/.nuxt/**', '**/.output/**', '**/dist/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
]

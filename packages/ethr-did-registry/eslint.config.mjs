import typescriptEslint from '@typescript-eslint/eslint-plugin'
import vitest from '@vitest/eslint-plugin'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

export default [
  prettierConfig,
  ...typescriptEslint.configs['flat/recommended'],
  {
    files: ['src/**/*.{js,ts}'],
    plugins: {
      vitest,
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      ...vitest.configs.recommended.rules,
      // expectTypeOf assertions are compile-time assertions — count them, or the
      // entry-surface tests (which are deliberately expect-only) fail expect-expect.
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expectTypeOf'] }],
    },
  },
  {
    files: ['scripts/**/*.{js,ts}'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
]

import js from '@eslint/js';
import globals from 'globals';
import typescript from 'typescript-eslint';

// Adapted from branchLeft/components' eslint.config.js. The React plugins are
// dropped (this package has no React), and the shared-config packages are not
// used: the eslint rule set is inlined from the public packages directly.
export default [
  {
    ignores: ['**/dist', '**/node_modules'],
  },
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
  ...typescript.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // Base no-unused-vars (from js.configs.recommended above) doesn't
      // understand TS-only constructs, so @typescript-eslint's version replaces it.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];

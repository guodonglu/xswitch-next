import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  { ignores: ['dist/**', 'mcp/dist/**', 'node_modules/**', 'test-results/**', '.xdev/**', 'build/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.serviceworker, ...globals.webextensions, chrome: 'readonly', __XSWITCH_PROJECT_PATH__: 'readonly' } },
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] } },
  { files: ['__tests__/**/*.ts'], languageOptions: { globals: { ...globals.vitest } } }
);

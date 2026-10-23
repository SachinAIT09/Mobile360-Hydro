// Root ESLint flat config for the whole monorepo. Each package runs `eslint . --max-warnings 0`
// from its own directory; ESLint walks up to this file, and the globs below are relative to it.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    'apps/mobile/.expo/**',
    'apps/mobile/dist/**',
    'tests/e2e/shots/**',
    'wireframes/**',
    '**/*.dc.html',
  ]),

  // TypeScript everywhere: ESLint recommended + typescript-eslint recommended (not type-checked).
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { warnOnUnsupportedTypeScriptVersion: false },
    },
  },

  // Plain JS (Expo/Metro config, Playwright scripts) is CommonJS running on Node.
  {
    files: ['**/*.{js,cjs}'],
    ignores: ['eslint.config.mjs', 'apps/api/**'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // apps/api is "type": "module", so its .js scripts are ESM.
    files: ['**/*.mjs', 'apps/api/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },

  // Globals per runtime.
  { files: ['apps/api/**', 'packages/shared/**', 'tests/**'], languageOptions: { globals: globals.node } },
  // Playwright fixtures must take a destructuring pattern as their first parameter, even when they need nothing.
  { files: ['tests/**'], rules: { 'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }] } },
  { files: ['apps/web/**'], languageOptions: { globals: globals.browser } },
  { files: ['apps/mobile/**'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    // Metro resolves static image assets through require(); allow it for images only (TS files, where the plugin is registered).
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-require-imports': ['error', { allow: ['\\.(png|jpg|gif|webp)$'] }] },
  },

  // React: hooks rules in both front ends, fast-refresh constraints in the Vite app only.
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/mobile/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite],
  },

  // NestJS: modules are intentionally empty decorated classes; `_`-prefixed args and caught errors may be unused.
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
]);

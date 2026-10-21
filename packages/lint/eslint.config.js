// @ts-check
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** The monorepo's lint rules (`pnpm lint` at the root). Types are checked by `pnpm typecheck`, not here. */
export default defineConfig([
  globalIgnores(['**/node_modules/', '**/dist/', '**/data/', 'playwright-report/', 'test-results/', 'apps/api/drizzle/']),
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // `_`-prefixed names are deliberately unused (omitting fields when destructuring, unused parameters).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      // `catch {}` around storage and parsing that may fail is deliberate.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Playwright fixtures without dependencies are written `async ({}, use) => …`.
    files: ['e2e/**'],
    rules: { 'no-empty-pattern': 'off' },
  },
  {
    files: ['apps/app/src/**/*.{ts,tsx}', 'apps/admin/src/**/*.{ts,tsx}', 'packages/*/src/**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Libraries, not Vite apps: shadcn components export their variants next to them.
    files: ['packages/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])

import type { DemoAccount } from '@pupitre/auth-ui'

/**
 * One-click sign-in on the login page, dev server only: `import.meta.env.DEV` is `false` in
 * `vite build`, so this list (and its passwords) is dropped from production bundles.
 * Accounts come from the fixtures (spec 015) and the admin bootstrap (spec 016); set
 * `VITE_DEMO_ADMIN_PASSWORD` when the API runs with another `ADMIN_PASSWORD`.
 */
export const demoAccounts: readonly DemoAccount[] | undefined = import.meta.env.DEV
  ? [
      { name: 'Élise Étudiante', role: 'student', identifier: 'etudiant', password: 'Student@1234' },
      { name: 'Marc Manager', role: 'manager', identifier: 'manager', password: 'Manager@1234' },
      {
        name: 'admin',
        role: 'admin',
        identifier: 'admin',
        password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD || 'Admin@1234',
      },
    ]
  : undefined

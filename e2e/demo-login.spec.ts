import { DatabaseSync } from 'node:sqlite'
import { request } from '@playwright/test'
import { API_DB_PATH, BASE_URL } from './env.ts'
import { expect, test } from './fixtures.ts'

/**
 * The e2e database has no fixtures: create the known accounts the demo buttons use (spec 015).
 * Idempotent, since tests run in parallel and repeated.
 */
async function ensureKnownUser(username: string, password: string, role: 'student' | 'manager') {
  const api = await request.newContext({ baseURL: BASE_URL })
  // Fails when the account already exists, which is fine.
  await api.post('/api/auth/sign-up/email', {
    data: { name: username, username, email: `${username}@pupitre.local`, password },
  })
  await api.dispose()
  const db = new DatabaseSync(API_DB_PATH, { timeout: 5000 })
  db.prepare('UPDATE user SET role = ? WHERE username = ?').run(role, username)
  db.close()
}

test.describe('demo login buttons (spec 015, dev only)', () => {
  test('the learner login page lists the demo accounts under the form', async ({ page }) => {
    await page.goto('/login')
    const demo = page.getByRole('region', { name: 'Comptes de démonstration' })
    await expect(demo.getByRole('button')).toHaveCount(3)
    await expect(demo.getByRole('button', { name: 'Se connecter en tant que Élise Étudiante' })).toContainText(
      'Étudiant',
    )
    await expect(demo.getByRole('button', { name: 'Se connecter en tant que Marc Manager' })).toBeVisible()
    await expect(demo.getByRole('button', { name: 'Se connecter en tant que admin' })).toBeVisible()
  })

  test('clicking the student account signs in and lands on the catalogue', async ({ page }) => {
    await ensureKnownUser('etudiant', 'Student@1234', 'student')
    await page.goto('/login')
    await page.getByRole('button', { name: 'Se connecter en tant que Élise Étudiante' }).click()

    await expect(page).toHaveURL(/\/courses$/)
    await expect(page.getByTestId('current-user')).toHaveText('etudiant')
  })

  test('clicking the manager account signs in as the manager', async ({ page }) => {
    await ensureKnownUser('manager', 'Manager@1234', 'manager')
    await page.goto('/login')
    await page.getByRole('button', { name: 'Se connecter en tant que Marc Manager' }).click()

    await expect(page).not.toHaveURL(/\/login/)
    expect((await (await page.request.get('/api/me')).json()).role).toBe('manager')
  })

  test('clicking the admin account signs in and lands on /admin', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Se connecter en tant que admin' }).click()

    await expect(page).toHaveURL(/\/admin\/?$/)
  })

  test('the admin login page has no demo accounts', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Comptes de démonstration' })).toHaveCount(0)
  })
})

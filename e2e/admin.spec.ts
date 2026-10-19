import { ADMIN_PASSWORD } from './env.ts'
import { expect, login, test } from './fixtures.ts'

test.describe('admin app (/admin/)', () => {
  test('the admin login ignores a redirect that would leave the site (security audit F2)', async ({ page }) => {
    // A signed-in admin is sent on at once: the target must stay on this origin.
    await page.goto('/admin/login')
    await login(page, 'admin', ADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/admin\/?$/)
    for (const target of ['/\t/evil.example', '/\n/evil.example', '/..//evil.example', '//evil.example']) {
      await page.goto(`/admin/login?redirect=${encodeURIComponent(target)}`)
      await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/admin\/?$/)
    }
    // A local path is still honoured, with its query.
    await page.goto(`/admin/login?redirect=${encodeURIComponent('/admin/users?role=manager')}`)
    await expect(page).toHaveURL(/\/admin\/users\?role=manager$/)
  })

  test('a signed-out visitor goes to the admin login page, then back to the admin app', async ({ page }) => {
    await page.goto('/admin/')
    await expect(page).toHaveURL(/\/admin\/login\?redirect=%2Fadmin%2F$/)

    await login(page, 'admin', ADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/admin\/?$/)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    await expect(page.getByTestId('current-user')).toHaveText('admin')
  })

  test('the admin login page is the shared one and lands admins on /admin', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.getByLabel('Identifiant ou e-mail')).toBeVisible()
    await login(page, 'admin@pupitre.local', ADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/admin\/?$/)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  })

  test('a session opened in the learner app is valid in the admin app, and back', async ({ page }) => {
    await page.goto('/login')
    await login(page, 'admin', ADMIN_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

    await page.getByRole('link', { name: 'Retour au catalogue' }).click()
    await expect(page).toHaveURL(/\/courses$/)
    await page.getByRole('link', { name: '⚙ Admin' }).click()
    await expect(page).toHaveURL(/\/admin\/?$/)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  })

  test('a student logging in on the admin login page lands on the catalogue', async ({ page, createUser }) => {
    const user = await createUser()
    await page.goto('/admin/login')
    await login(page, user.email, user.password)
    await expect(page).toHaveURL(/\/courses$/)
  })

  test('a non-admin opening the admin app sees "Accès refusé"', async ({ page, createUser }) => {
    const user = await createUser({ role: 'manager' })
    await page.goto('/admin/')
    await login(page, user.email, user.password)

    await expect(page).toHaveURL(/\/admin\/?$/)
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible()
    await page.getByRole('link', { name: 'Retour au catalogue' }).click()
    await expect(page).toHaveURL(/\/courses$/)
  })

  test('logging out of the admin app returns to the admin login page', async ({ page }) => {
    await page.goto('/admin/login')
    await login(page, 'admin', ADMIN_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

    await page.getByRole('button', { name: 'Déconnexion' }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })
})

test.describe('admin API (/api/admin/*)', () => {
  test('is admin-only, before routing', async ({ page, createUser }) => {
    expect((await page.request.get('/api/admin/anything')).status()).toBe(401)

    const user = await createUser({ role: 'manager' })
    await page.goto('/login')
    await login(page, user.email, user.password)
    await expect(page).toHaveURL(/\/courses$/)
    const forbidden = await page.request.get('/api/admin/anything')
    expect(forbidden.status()).toBe(403)
    expect(await forbidden.json()).toEqual({ error: 'Admin access required' })

    await page.context().clearCookies()
    await page.goto('/login')
    await login(page, 'admin', ADMIN_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    const notFound = await page.request.get('/api/admin/anything')
    expect(notFound.status()).toBe(404)
    expect(await notFound.json()).toEqual({ error: 'Not found' })
  })
})

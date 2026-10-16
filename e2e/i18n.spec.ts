import { ADMIN_PASSWORD } from './env.ts'
import { expect, test } from './fixtures.ts'

test.describe('localization (spec 018)', () => {
  test('French is the default language', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expect(page.getByLabel('Langue')).toHaveValue('fr')
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible()
  })

  test('switching to English translates the page, sets <html lang> and survives a reload', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Langue').selectOption('en')

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByLabel('Username or e-mail')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByLabel('Language')).toHaveValue('en')
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('a displayed error follows the language change', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Veuillez remplir tous les champs')

    await page.getByLabel('Langue').selectOption('en')
    await expect(page.getByRole('alert')).toHaveText('Please fill in all fields')
  })

  test('the choice is shared by the learner and admin apps', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Langue').selectOption('en')
    await page.getByLabel('Username or e-mail').fill('admin')
    await page.getByLabel('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // Landed in the admin app, still in English.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

    // Switch back to French in the admin app, then go to the learner app.
    await page.getByLabel('Language').selectOption('fr')
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    await page.getByRole('link', { name: 'Retour au catalogue' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible()
  })

  test('the access denied page is translated', async ({ page, createUser }) => {
    const user = await createUser()
    await page.goto('/admin/')
    await page.getByLabel('Langue').selectOption('en')
    await page.getByLabel('Username or e-mail').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to catalogue' })).toBeVisible()
  })
})

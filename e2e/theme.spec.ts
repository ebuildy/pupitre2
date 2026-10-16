import { expect, signIn, test } from './fixtures.ts'

test.describe('light / dark theme (spec 010)', () => {
  test('the toggle switches the theme, which survives a reload and is shared with the admin app', async ({
    page,
    createUser,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/courses')
    const html = page.locator('html')
    await expect(html).not.toHaveClass(/\bdark\b/)

    await page.getByRole('button', { name: 'Passer en mode sombre' }).click()
    await expect(html).toHaveClass(/\bdark\b/)
    await page.reload()
    await expect(html).toHaveClass(/\bdark\b/)
    await expect(page.getByRole('button', { name: 'Passer en mode clair' })).toBeVisible()

    // Same origin, same preference: the login page of the admin app is dark too.
    await page.goto('/admin/login')
    await expect(html).toHaveClass(/\bdark\b/)

    await page.goto('/courses')
    await page.getByRole('button', { name: 'Passer en mode clair' }).click()
    await expect(html).not.toHaveClass(/\bdark\b/)

    // Signed in, the header keeps the toggle.
    await signIn(page, await createUser())
    await expect(page.getByRole('button', { name: 'Passer en mode sombre' })).toBeVisible()
  })

  test('on a phone, the navigation is in a drawer', async ({ page, createUser }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await signIn(page, await createUser())
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden()

    await page.getByRole('button', { name: 'Menu' }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('link', { name: 'Mon XP' }).click()
    await expect(page).toHaveURL(/\/my-xp$/)
    await expect(drawer).toBeHidden()
  })
})

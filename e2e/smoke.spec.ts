import { expect, test } from '@playwright/test'

test('api health check is reachable through the app origin', async ({ request }) => {
  const res = await request.get('/health')
  expect(res.ok()).toBeTruthy()
  expect(await res.json()).toEqual({ status: 'ok' })
})

test('unknown api route returns the JSON error envelope', async ({ request }) => {
  const res = await request.get('/api/does-not-exist')
  expect(res.status()).toBe(404)
  expect(await res.json()).toEqual({ error: 'Not found' })
})

test('a visitor can sign up, sign out and sign back in', async ({ page }) => {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const password = 'Password123!'

  await page.goto('/login')
  await page.getByRole('button', { name: 'Créer un compte' }).click()
  await page.getByLabel('Nom').fill('Ada')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: "S'inscrire" }).click()

  await expect(page.getByTestId('current-user')).toHaveText('Ada')

  await page.getByRole('button', { name: 'Déconnexion' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByTestId('current-user')).toHaveCount(0)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByTestId('current-user')).toHaveText('Ada')
})

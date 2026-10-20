import { expect, test } from '@playwright/test'

test('the API answers through the app origin', async ({ request }) => {
  const res = await request.get('/api/settings/public')
  expect(res.ok()).toBeTruthy()
})

test('unknown api route returns the JSON error envelope', async ({ request }) => {
  const res = await request.get('/api/does-not-exist')
  expect(res.status()).toBe(404)
  expect(await res.json()).toEqual({ error: 'Not found' })
})

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

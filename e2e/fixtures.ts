import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { test as base, type Page, request } from '@playwright/test'
import type { Role } from '@pupitre/shared'
import { API_DB_PATH, BASE_URL } from './env.ts'

export type TestUser = { username: string; email: string; password: string; role: Role }

type Fixtures = {
  /** Creates a user through the real sign-up endpoint, then sets role / active flag in the database. */
  createUser: (opts?: { role?: Role; isActive?: boolean }) => Promise<TestUser>
}

export const test = base.extend<Fixtures>({
  createUser: async ({}, use) => {
    // The API writes to the same file concurrently: wait for its locks instead of failing.
    const db = new DatabaseSync(API_DB_PATH, { timeout: 5000 })
    await use(async ({ role = 'student', isActive = true } = {}) => {
      const id = randomUUID().slice(0, 8)
      const user: TestUser = {
        username: `user_${id}`,
        email: `user-${id}@example.test`,
        password: 'Password123!',
        role,
      }
      const api = await request.newContext({ baseURL: BASE_URL })
      const res = await api.post('/api/auth/sign-up/email', {
        data: { name: user.username, username: user.username, email: user.email, password: user.password },
      })
      if (!res.ok()) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`)
      await api.dispose()
      db.prepare('UPDATE user SET role = ?, is_active = ? WHERE email = ?').run(role, isActive ? 1 : 0, user.email)
      return user
    })
    db.close()
  },
})

export { expect } from '@playwright/test'

/** Fills and submits the shared login page (spec 023), in any frontend. */
export async function login(page: Page, identifier: string, password: string) {
  await page.getByLabel('Identifiant ou e-mail').fill(identifier)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

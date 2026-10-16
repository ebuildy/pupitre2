import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { type APIRequestContext, test as base, type Page, request } from '@playwright/test'
import type { AdminCategory, AdminCourse, CategoryCreateInput, CourseCreateInput, Role } from '@pupitre/shared'
import { ADMIN_PASSWORD, API_DB_PATH, BASE_URL } from './env.ts'

export type TestUser = { id: string; username: string; email: string; password: string; role: Role }

type Fixtures = {
  /** Creates a user through the real sign-up endpoint, then sets role / active flag in the database. */
  createUser: (opts?: { role?: Role; isActive?: boolean }) => Promise<TestUser>
  /** An API client signed in as the bootstrapped admin. */
  adminRequest: APIRequestContext
  /**
   * Creates a course through the admin API. Defaults: unique slug and title, published, public.
   * Put a unique token in the title to find it with the catalogue search.
   */
  createCourse: (input?: Partial<CourseCreateInput>) => Promise<AdminCourse>
  /** Creates a category through the admin API. Defaults: unique slug and title, top-level. */
  createCategory: (input?: Partial<CategoryCreateInput>) => Promise<AdminCategory>
}

/** A short random token for unique slugs, titles and categories. */
export function uid() {
  return randomUUID().slice(0, 8)
}

export const test = base.extend<Fixtures>({
  createUser: async ({}, use) => {
    // The API writes to the same file concurrently: wait for its locks instead of failing.
    const db = new DatabaseSync(API_DB_PATH, { timeout: 5000 })
    await use(async ({ role = 'student', isActive = true } = {}) => {
      const id = randomUUID().slice(0, 8)
      const user: Omit<TestUser, 'id'> = {
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
      const row = db.prepare('SELECT id FROM user WHERE email = ?').get(user.email) as { id: string }
      return { ...user, id: row.id }
    })
    db.close()
  },

  adminRequest: async ({}, use) => {
    const api = await request.newContext({ baseURL: BASE_URL })
    const res = await api.post('/api/auth/sign-in/username', { data: { username: 'admin', password: ADMIN_PASSWORD } })
    if (!res.ok()) throw new Error(`admin sign-in failed: ${res.status()} ${await res.text()}`)
    await use(api)
    await api.dispose()
  },

  createCourse: async ({ adminRequest }, use) => {
    await use(async (input = {}) => {
      const id = uid()
      const res = await adminRequest.post('/api/admin/courses', {
        data: {
          slug: `course-${id}`,
          title: `Course ${id}`,
          visibility: 'public',
          status: 'published',
          ...input,
        },
      })
      if (!res.ok()) throw new Error(`course creation failed: ${res.status()} ${await res.text()}`)
      return (await res.json()) as AdminCourse
    })
  },

  createCategory: async ({ adminRequest }, use) => {
    await use(async (input = {}) => {
      const id = uid()
      const res = await adminRequest.post('/api/admin/categories', {
        data: { slug: `cat-${id}`, title: `Cat ${id}`, ...input },
      })
      if (!res.ok()) throw new Error(`category creation failed: ${res.status()} ${await res.text()}`)
      return (await res.json()) as AdminCategory
    })
  },
})

import { expect } from '@playwright/test'

export { expect }

/** Logs in from the learner login page and waits until the user has landed (session cookie set). */
export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await login(page, user.email, user.password)
  await expect(page).not.toHaveURL(/\/login/)
}

/** Fills and submits the shared login page (spec 023), in any frontend. */
export async function login(page: Page, identifier: string, password: string) {
  await page.getByLabel('Identifiant ou e-mail').fill(identifier)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

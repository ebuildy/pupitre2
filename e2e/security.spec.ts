import type { APIRequestContext } from '@playwright/test'
import { apiClient, expect, login, test, type TestUser, uid } from './fixtures.ts'

type Operation = { security?: unknown[] }
type Document = { paths: Record<string, Record<string, Operation>> }
type Route = { method: string; path: string; url: string; isPublic: boolean }

/** An API client signed in as `user` (its own client IP, spec 009). */
async function signedIn(user: TestUser) {
  const api = await apiClient()
  const res = await api.post('/api/auth/sign-in/username', { data: { username: user.username, password: user.password } })
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`)
  return api
}

/** Every documented API operation, path parameters filled with a placeholder. */
async function documentedRoutes(): Promise<Route[]> {
  const api = await apiClient()
  const doc = (await (await api.get('/api/docs/openapi.json')).json()) as Document
  await api.dispose()
  return Object.entries(doc.paths)
    .filter(([path]) => path.startsWith('/api/'))
    .flatMap(([path, operations]) =>
      Object.entries(operations).map(([method, op]) => ({
        method: method.toUpperCase(),
        path,
        url: path.replace(/\{\w+\}/g, 'placeholder'),
        // Operations without their own `security` need the session cookie (the document's default).
        isPublic: Array.isArray(op.security) && op.security.length === 0,
      })),
    )
}

/** Calls `route` with an empty JSON body where it takes one; guards run before validation. */
function call(api: APIRequestContext, route: Route) {
  const withBody = ['POST', 'PUT', 'PATCH'].includes(route.method)
  return api.fetch(route.url, { method: route.method, maxRedirects: 0, ...(withBody ? { data: {} } : {}) })
}

/** Runs the calls a few at a time and returns the routes whose answer is not `expected`. */
async function unexpectedAnswers(api: APIRequestContext, routes: Route[], expected: { status: number; error: string }) {
  const wrong: string[] = []
  for (let i = 0; i < routes.length; i += 8) {
    await Promise.all(
      routes.slice(i, i + 8).map(async (route) => {
        const res = await call(api, route)
        const body = await res.json().catch(() => null)
        if (res.status() !== expected.status || body?.error !== expected.error) {
          wrong.push(`${route.method} ${route.path} → ${res.status()} ${JSON.stringify(body)?.slice(0, 80)}`)
        }
      }),
    )
  }
  return wrong
}

test.describe('Spec 001: API access control, every route', () => {
  test('the sweep covers the whole API surface', async () => {
    const routes = await documentedRoutes()
    expect(routes.filter((r) => r.path.startsWith('/api/admin/')).length).toBeGreaterThan(50)
    expect(routes.filter((r) => r.path.startsWith('/api/manager/')).length).toBeGreaterThan(10)
    expect(routes.filter((r) => !r.isPublic).length).toBeGreaterThan(100)
  })

  test('signed out, every route that needs a session answers 401', async () => {
    const routes = (await documentedRoutes()).filter((r) => !r.isPublic)
    const anonymous = await apiClient()
    expect(await unexpectedAnswers(anonymous, routes, { status: 401, error: 'Authentication required' })).toEqual([])
    await anonymous.dispose()
  })

  test('routes documented as public answer signed-out visitors', async () => {
    const routes = (await documentedRoutes()).filter((r) => r.isPublic && r.method === 'GET')
    const anonymous = await apiClient()
    for (const route of routes) {
      expect.soft((await call(anonymous, route)).status(), `${route.method} ${route.path}`).not.toBe(401)
    }
    await anonymous.dispose()
  })

  test('students and managers get 403 on every admin route', async ({ createUser }) => {
    const routes = (await documentedRoutes()).filter((r) => r.path.startsWith('/api/admin/'))
    for (const role of ['student', 'manager'] as const) {
      const api = await signedIn(await createUser({ role }))
      expect(await unexpectedAnswers(api, routes, { status: 403, error: 'Admin access required' }), role).toEqual([])
      await api.dispose()
    }
  })

  test('a student who manages no group gets 403 on every manager route but the scope', async ({ createUser }) => {
    const routes = (await documentedRoutes()).filter((r) => r.path.startsWith('/api/manager/') && r.path !== '/api/manager/scope')
    const api = await signedIn(await createUser())
    expect(await unexpectedAnswers(api, routes, { status: 403, error: 'Manager access required' })).toEqual([])
    const scope = await api.get('/api/manager/scope')
    expect(await scope.json()).toEqual({ groups: [], canManage: false })
    await api.dispose()
  })

  test('a student cannot run the trainer actions of in-person sessions', async ({ createUser, createCourse }) => {
    const course = await createCourse({ inPerson: true })
    const api = await signedIn(await createUser())
    const session = { courseId: course.id, title: 'Atelier', startsAt: new Date(Date.now() + 86_400_000).toISOString() }
    const forbidden = { error: 'Manager or admin access required' }
    const calls = [
      api.get('/api/sessions/courses'),
      api.post('/api/sessions', { data: session }),
      api.patch('/api/sessions/placeholder', { data: { title: 'x' } }),
      api.delete('/api/sessions/placeholder'),
      api.get('/api/sessions/placeholder/participants'),
      api.patch('/api/sessions/placeholder/participants/placeholder', { data: { attendance: 'present' } }),
    ]
    for (const res of await Promise.all(calls)) {
      expect(res.status(), res.url()).toBe(403)
      expect(await res.json()).toEqual(forbidden)
    }
    await api.dispose()
  })

  test('tricks on the admin path do not reach admin routes', async ({ createUser }) => {
    const api = await signedIn(await createUser())
    const variants = [
      '/api/admin/users',
      '/api/admin/users/',
      '/api//admin/users',
      '/api/admin//users',
      '/api/Admin/users',
      '/api/ADMIN/users',
      '/api/%61dmin/users',
      '/api/admin%2Fusers',
      '/api/admin/users%2F',
      '/api/admin/users;x',
      '/api/admin/users?role=admin',
      '/api/me/../admin/users',
      '/api/%2e%2e/api/admin/users',
    ]
    for (const path of variants) {
      const res = await api.get(path)
      expect([401, 403, 404], `${path} → ${res.status()}`).toContain(res.status())
      expect(await res.text(), path).not.toContain('@example.test')
    }
    await api.dispose()
  })
})

test.describe('Spec 001: accounts cannot raise their own privileges', () => {
  test('sign-up cannot choose the role or the active flag', async () => {
    const api = await apiClient()
    const id = uid()
    const res = await api.post('/api/auth/sign-up/email', {
      data: { name: `sneaky_${id}`, username: `sneaky_${id}`, email: `sneaky-${id}@example.test`, password: 'Password123!', role: 'admin', isActive: true },
    })
    // Refused outright, or accepted as a plain student: never an admin.
    if (res.ok()) {
      const me = await (await api.get('/api/me')).json()
      expect(me.role).toBe('student')
    } else {
      expect(res.status()).toBe(400)
    }
    expect((await api.get('/api/admin/users')).status()).not.toBe(200)
    await api.dispose()
  })

  test('a student cannot change their role through the profile or better-auth', async ({ createUser }) => {
    const api = await signedIn(await createUser())
    await api.patch('/api/me', { data: { role: 'admin', isActive: true, name: 'Toujours étudiant' } })
    const update = await api.post('/api/auth/update-user', { data: { role: 'admin' } })
    expect(update.ok()).toBe(false)
    const me = await (await api.get('/api/me')).json()
    expect(me).toMatchObject({ role: 'student', name: 'Toujours étudiant' })
    expect((await api.get('/api/admin/users')).status()).toBe(403)
    await api.dispose()
  })

  test('a deactivated account loses access at once, open sessions included', async ({ createUser, adminRequest }) => {
    const user = await createUser({ role: 'manager' })
    const api = await signedIn(user)
    expect((await api.get('/api/me')).status()).toBe(200)

    await adminRequest.patch(`/api/admin/users/${user.id}`, { data: { isActive: false } })
    expect((await api.get('/api/me')).status()).toBe(401)
    expect((await api.get('/api/manager/users')).status()).toBe(401)
    expect(await (await api.get('/api/auth/get-session')).json()).toBeNull()
    await api.dispose()
  })

  test('a demoted admin loses admin access at once', async ({ createUser, adminRequest }) => {
    const user = await createUser({ role: 'admin' })
    const api = await signedIn(user)
    expect((await api.get('/api/admin/stats')).status()).toBe(200)

    await adminRequest.patch(`/api/admin/users/${user.id}`, { data: { role: 'student' } })
    expect((await api.get('/api/admin/stats')).status()).toBe(403)
    await api.dispose()
  })
})

test.describe('Spec 140: a group manager stays inside their scope', () => {
  test('groups and members outside the managed groups are refused', async ({ createUser, createGroup, addMember }) => {
    const managed = await createGroup()
    const other = await createGroup()
    const manager = await createUser()
    const member = await createUser()
    const outsider = await createUser()
    await addMember(managed.id, manager.id, 'manager')
    await addMember(managed.id, member.id)
    await addMember(other.id, outsider.id)
    const api = await signedIn(manager)

    // In scope: allowed.
    expect((await api.get(`/api/manager/groups/${managed.id}/members`)).status()).toBe(200)
    expect((await api.get(`/api/manager/users/${member.id}/enrollments`)).status()).toBe(200)

    // Out of scope: 403, and nothing about the outsider leaks.
    const groupRefused = { error: 'Group not in manager scope' }
    const userRefused = { error: 'User not in manager scope' }
    const refusals: [Promise<Awaited<ReturnType<APIRequestContext['get']>>>, object][] = [
      [api.get(`/api/manager/groups/${other.id}/members`), groupRefused],
      [api.post(`/api/manager/groups/${other.id}/members`, { data: { userId: member.id } }), groupRefused],
      [api.delete(`/api/manager/groups/${other.id}/members/${outsider.id}`), groupRefused],
      [api.delete(`/api/manager/groups/${other.id}`), groupRefused],
      [api.post('/api/manager/groups', { data: { name: `sub-${uid()}`, parentId: other.id } }), groupRefused],
      [api.post(`/api/manager/groups/${managed.id}/members`, { data: { userId: outsider.id } }), userRefused],
      [api.get(`/api/manager/users/${outsider.id}/enrollments`), userRefused],
      [api.post(`/api/manager/users/${outsider.id}/enrollments`, { data: { courseId: 'placeholder' } }), userRefused],
      [api.delete(`/api/manager/users/${outsider.id}/enrollments/placeholder`), userRefused],
    ]
    for (const [request, error] of refusals) {
      const res = await request
      expect(res.status(), res.url()).toBe(403)
      expect(await res.json()).toEqual(error)
    }
    const users = await (await api.get('/api/manager/users')).json()
    expect(users.users.map((u: { id: string }) => u.id)).not.toContain(outsider.id)
    await api.dispose()
  })
})

test.describe('Specs 045, 053: content is only for those allowed to see it', () => {
  test('private and draft courses are hidden from learners who are not enrolled', async ({ createUser, createCourse, setModules }) => {
    const lesson = { slug: 'secret', name: 'Secret', type: 'text' as const, content: { kind: 'inline' as const, body: 'Contenu confidentiel' } }
    const privateCourse = await createCourse({ visibility: 'private' })
    const draft = await createCourse({ status: 'draft' })
    await setModules(privateCourse.id, [lesson])
    await setModules(draft.id, [lesson])
    const api = await signedIn(await createUser())

    for (const course of [privateCourse, draft]) {
      for (const res of [
        await api.get(`/api/courses/${course.slug}`),
        await api.get(`/api/courses/${course.slug}/modules`),
        await api.get(`/api/courses/${course.slug}/modules/secret`),
        await api.post(`/api/enrollments/${course.slug}`),
      ]) {
        expect(res.status(), res.url()).toBe(404)
        expect(await res.text()).not.toContain('Contenu confidentiel')
      }
    }
    const catalogue = await (await api.get(`/api/courses?search=${privateCourse.slug}`)).json()
    expect(catalogue.courses).toEqual([])
    await api.dispose()
  })

  test('a quiz never sends its answers or feedback before submission', async ({ createUser, createCourse, setModules }) => {
    const course = await createCourse()
    await setModules(course.id, [
      {
        slug: 'quiz',
        name: 'Quiz',
        type: 'quiz',
        content: {
          kind: 'inline',
          body: `questions:
  - id: single
    type: single
    question: Choisir
    answers:
      - { id: good, text: Bonne, correct: true }
      - { id: bad, text: Mauvaise }
    feedback: { wrong: "Indice secret", correct: "Bravo secret" }
  - id: order
    type: order
    question: Ordonner
    items: [{ id: a, text: A }, { id: b, text: B }]
    correctOrder: [a, b]
  - id: bool
    type: boolean
    question: Vrai ?
    correctAnswer: true
`,
        },
      },
    ])
    const api = await signedIn(await createUser())
    const res = await api.get(`/api/courses/${course.slug}/modules/quiz`)
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).not.toMatch(/"correct(Answer|Order)?"/)
    expect(text).not.toContain('secret')
    await api.dispose()
  })

  test('a public profile shows no e-mail, and deactivated users have none', async ({ createUser, adminRequest }) => {
    const user = await createUser()
    const anonymous = await apiClient()
    const profile = await anonymous.get(`/api/users/${user.id}`)
    expect(profile.status()).toBe(200)
    expect(await profile.text()).not.toContain(user.email)

    await adminRequest.patch(`/api/admin/users/${user.id}`, { data: { isActive: false } })
    expect((await anonymous.get(`/api/users/${user.id}`)).status()).toBe(404)
    await anonymous.dispose()
  })
})

test.describe('Spec 005: cross-origin requests', () => {
  test('other origins are not allowed to call the API with credentials', async ({ createUser }) => {
    const api = await signedIn(await createUser())
    const evil = 'https://evil.example'
    const res = await api.get('/api/me', { headers: { origin: evil } })
    expect(res.headers()['access-control-allow-origin']).not.toBe(evil)
    const preflight = await api.fetch('/api/admin/users', {
      method: 'OPTIONS',
      headers: { origin: evil, 'access-control-request-method': 'DELETE' },
    })
    expect(preflight.headers()['access-control-allow-origin']).not.toBe(evil)
    expect(preflight.headers()['access-control-allow-origin']).not.toBe('*')
    await api.dispose()
  })
})

test.describe('Spec 163: no account deletes itself', () => {
  test('an admin cannot delete, deactivate or demote their own account', async ({ createUser }) => {
    const admin = await createUser({ role: 'admin' })
    const api = await signedIn(admin)

    const deleted = await api.delete(`/api/admin/users/${admin.id}`)
    expect(deleted.status()).toBe(400)
    expect(await deleted.json()).toEqual({ error: 'You cannot delete your own account' })
    for (const data of [{ isActive: false }, { role: 'manager' }, { role: 'student' }]) {
      const res = await api.patch(`/api/admin/users/${admin.id}`, { data })
      expect(res.status(), JSON.stringify(data)).toBe(400)
      expect(await res.json()).toEqual({ error: 'You cannot remove your own admin access' })
    }
    expect(await (await api.get('/api/me')).json()).toMatchObject({ id: admin.id, role: 'admin', isActive: true })
    await api.dispose()
  })

  test('no role can delete its own account through better-auth', async ({ createUser }) => {
    for (const role of ['student', 'manager', 'admin'] as const) {
      const user = await createUser({ role })
      const api = await signedIn(user)
      // better-auth's self-deletion endpoint is not enabled (`user.deleteUser`).
      const res = await api.post('/api/auth/delete-user', { data: { password: user.password } })
      expect(res.status(), role).toBe(404)
      expect((await api.get('/api/me')).status(), role).toBe(200)
      await api.dispose()
    }
  })

  test('a manager cannot delete their own account, nor any other', async ({ createUser }) => {
    const manager = await createUser({ role: 'manager' })
    const other = await createUser()
    const api = await signedIn(manager)
    for (const id of [manager.id, other.id]) {
      const res = await api.delete(`/api/admin/users/${id}`)
      expect(res.status()).toBe(403)
    }
    expect((await api.get('/api/me')).status()).toBe(200)
    await api.dispose()
  })

  test("the admin app offers no delete button on the admin's own page", async ({ page, createUser }) => {
    const admin = await createUser({ role: 'admin' })
    const other = await createUser()
    await page.goto('/admin/login')
    await login(page, admin.username, admin.password)
    await expect(page).toHaveURL(/\/admin\/?$/)

    await page.goto(`/admin/users/${other.id}`)
    await expect(page.getByRole('heading', { name: other.username })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Supprimer', exact: true })).toBeVisible()

    await page.goto(`/admin/users/${admin.id}`)
    await expect(page.getByRole('heading', { name: admin.username })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Supprimer', exact: true })).toHaveCount(0)
  })
})

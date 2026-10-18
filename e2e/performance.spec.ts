import type { APIRequestContext } from '@playwright/test'
import type { ModuleInput } from '@pupitre/shared'
import { apiClient, expect, test, uid } from './fixtures.ts'

const lesson = (slug: string): ModuleInput => ({ slug, name: `Leçon ${slug}`, type: 'text', content: { kind: 'inline', body: '# Leçon' } })

/** SQL statements run by one request (`X-Query-Count`, enabled in e2e). */
async function queries(request: APIRequestContext, url: string) {
  const res = await request.get(url)
  expect(res.ok(), `${url}: ${res.status()}`).toBeTruthy()
  return Number(res.headers()['x-query-count'])
}

async function countAll(request: APIRequestContext, urls: string[]) {
  const counts: Record<string, number> = {}
  for (const url of urls) {
    await queries(request, url) // warm caches (settings…)
    counts[url] = await queries(request, url)
  }
  return counts
}

test.describe('performance invariants (spec 014)', () => {
  test('learner lists issue a constant number of queries as their items grow', async ({
    adminRequest,
    createCourse,
    createUser,
    setModules,
    createGroup,
    addMember,
  }) => {
    const token = uid()
    const user = await createUser()
    const learner = await apiClient()
    await learner.post('/api/auth/sign-in/email', { data: { email: user.email, password: user.password } })
    const detail = await createCourse({ title: `${token} détail` })
    await setModules(detail.id, [lesson('a')])
    await learner.post(`/api/enrollments/${detail.slug}`)

    // One of each item, then four.
    const addItems = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const course = await createCourse({ title: `${token} ${uid()}` })
        await setModules(course.id, [lesson('a')])
        await learner.post(`/api/enrollments/${course.slug}`)
        await learner.post(`/api/courses/${course.slug}/modules/a/complete`)
        const path = await (
          await adminRequest.post('/api/admin/paths', {
            data: { slug: `perf-${uid()}`, title: `Parcours ${uid()}`, kind: 'course', status: 'published', items: [course.id] },
          })
        ).json()
        await adminRequest.post(`/api/admin/paths/${path.id}/enrollments`, { data: { userId: user.id } })
        const group = await createGroup()
        await addMember(group.id, user.id)
      }
    }
    const urls = [
      `/api/courses?search=${token}`,
      '/api/my/courses',
      '/api/my/xp',
      '/api/my/paths',
      '/api/my/groups',
      '/api/my/badges',
      '/api/my/skills',
      '/api/leaderboard',
      `/api/courses/${detail.slug}`,
      `/api/courses/${detail.slug}/modules`,
    ]

    await addItems(1)
    const before = await countAll(learner, urls)
    await addItems(3)
    // A longer course too: its detail and module list stay constant.
    await setModules(detail.id, ['a', 'b', 'c', 'd'].map(lesson))
    for (const m of ['a', 'b', 'c']) await learner.post(`/api/courses/${detail.slug}/modules/${m}/complete`)
    expect(await countAll(learner, urls)).toEqual(before)
    await learner.dispose()
  })

  test('manager and admin lists issue a constant number of queries as members grow', async ({
    adminRequest,
    createCourse,
    createUser,
    createGroup,
    addMember,
  }) => {
    const group = await createGroup()
    const manager = await createUser()
    await addMember(group.id, manager.id, 'manager')
    const client = await apiClient()
    await client.post('/api/auth/sign-in/email', { data: { email: manager.email, password: manager.password } })
    const course = await createCourse()
    const path = await (
      await adminRequest.post('/api/admin/paths', {
        data: { slug: `perf-${uid()}`, title: `Parcours ${uid()}`, kind: 'course', status: 'published', items: [course.id] },
      })
    ).json()
    const addMembers = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const member = await createUser()
        await addMember(group.id, member.id)
        await client.post(`/api/manager/users/${member.id}/enrollments`, { data: { courseId: course.id } })
        await client.post(`/api/manager/paths/${path.id}/enrollments`, { data: { userId: member.id } })
      }
    }
    const managerUrls = ['/api/manager/users', '/api/manager/groups', '/api/manager/scope', `/api/manager/paths/${path.id}/enrollments`]
    const adminUrls = ['/api/admin/users', '/api/admin/groups', '/api/admin/courses', '/api/admin/paths', `/api/admin/paths/${path.id}/enrollments`]

    await addMembers(1)
    const before = { manager: await countAll(client, managerUrls), admin: await countAll(adminRequest, adminUrls) }
    await addMembers(3)
    expect({ manager: await countAll(client, managerUrls), admin: await countAll(adminRequest, adminUrls) }).toEqual(before)
    await client.dispose()
  })
})

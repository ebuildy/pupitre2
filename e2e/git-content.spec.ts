import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ADMIN_PASSWORD } from './env.ts'
import { expect, signIn, test, uid } from './fixtures.ts'

/** A local git repository (served over file://) with the given files on `main`. */
function makeRepo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), `pupitre-repo-${uid()}-`))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'e2e@example.test')
  git('config', 'user.name', 'e2e')
  const commit = (next: Record<string, string>) => {
    for (const [path, content] of Object.entries(next)) writeFileSync(join(dir, path), content)
    git('add', '-A')
    git('commit', '-q', '-m', 'update')
  }
  commit(files)
  return { url: `file://${dir}`, commit }
}

test.describe('git content (specs 064–066, 177)', () => {
  test('lessons are read from a git repository; clearing the cache shows pushed changes', async ({
    page,
    adminRequest,
    createCourse,
    createUser,
    setModules,
  }) => {
    const repo = makeRepo({ 'intro.md': '# Intro\n\nPremière version.' })
    const course = await createCourse()
    await setModules(course.id, [
      { slug: 'intro', name: 'Intro', type: 'text', content: { kind: 'source', repo: repo.url, ref: 'main', path: 'intro.md' } },
      { slug: 'missing', name: 'Absent', type: 'text', content: { kind: 'source', repo: repo.url, ref: 'main', path: 'nope.md' } },
    ])
    await signIn(page, await createUser())
    await page.request.post(`/api/enrollments/${course.slug}`)
    await page.goto(`/courses/${course.slug}/lessons/intro`)
    await expect(page.getByTestId('lesson-content')).toContainText('Première version.')

    // Within the TTL, the clone is reused…
    repo.commit({ 'intro.md': '# Intro\n\nDeuxième version.' })
    await page.reload()
    await expect(page.getByTestId('lesson-content')).toContainText('Première version.')
    // …until the course cache is cleared.
    const cleared = await (await adminRequest.post(`/api/admin/courses/${course.id}/cache/clear`)).json()
    expect(cleared).toEqual({ status: 'ok', reposCleared: 1 })
    await page.reload()
    await expect(page.getByTestId('lesson-content')).toContainText('Deuxième version.')

    // A missing file shows the "not available" placeholder.
    await page.request.post(`/api/courses/${course.slug}/modules/intro/complete`)
    await page.goto(`/courses/${course.slug}/lessons/missing`)
    await expect(page.getByText('⚠️ Ce contenu n’est pas encore disponible.')).toBeVisible()

    expect((await (await adminRequest.post('/api/admin/cache/clear')).json()).status).toBe('ok')
  })

  test('a module index in git is expanded into real modules when saved (spec 065)', async ({ adminRequest, createCourse }) => {
    const repo = makeRepo({
      'index.yaml': 'modules:\n  - {name: Bases, path: bases.md}\n  - {name: Quiz final, type: quiz, path: quiz.yaml, prerequisites: [bases]}\n',
      'bases.md': '# Bases',
      'quiz.yaml': 'questions:\n  - {id: a, type: boolean, question: "Vrai ?", correctAnswer: true}\n',
    })
    const course = await createCourse()
    const res = await adminRequest.put(`/api/admin/courses/${course.id}/modules`, {
      data: {
        modules: [{ slug: 'index', name: 'Index', type: 'modules', content: { kind: 'source', repo: repo.url, ref: 'main', path: 'index.yaml' } }],
      },
    })
    expect(res.ok()).toBeTruthy()
    const { modules } = await res.json()
    expect(modules.map((m: { slug: string; type: string }) => [m.slug, m.type])).toEqual([
      ['bases', 'text'],
      ['quiz-final', 'quiz'],
    ])
    expect(modules[1].prerequisites).toEqual(['bases'])
    expect(modules[0].content).toEqual({ kind: 'source', repo: repo.url, ref: 'main', path: 'bases.md' })

    const broken = await adminRequest.put(`/api/admin/courses/${course.id}/modules`, {
      data: { modules: [{ slug: 'i', name: 'Index', type: 'modules', content: { kind: 'source', repo: repo.url, ref: 'main', path: 'nope.yaml' } }] },
    })
    expect(broken.status()).toBe(400)
    expect((await broken.json()).error).toBe('Module index "Index": file unavailable')
  })

  test('admins clear the cache from the course page', async ({ page, createCourse, setModules }) => {
    const repo = makeRepo({ 'a.md': '# A' })
    const course = await createCourse()
    await setModules(course.id, [{ slug: 'a', name: 'A', type: 'text', content: { kind: 'source', repo: repo.url, ref: 'main', path: 'a.md' } }])
    await signIn(page, { email: 'admin', password: ADMIN_PASSWORD })
    await page.goto(`/admin/courses/${course.id}`)
    await page.getByRole('button', { name: '🗑 Cache' }).click()
    await expect(page.getByText(`Cache vidé pour ${course.slug}`)).toBeVisible()
    await page.getByRole('button', { name: 'Vider le cache de A' }).click()
    await expect(page.getByText('Cache module vidé')).toBeVisible()
  })
})

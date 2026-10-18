import type { LabConfigInput, ModuleInput } from '@pupitre/shared'
import { ADMIN_PASSWORD, GITLAB_PORT } from './env.ts'
import { apiClient, expect, signIn, test } from './fixtures.ts'

const gitlab = `http://localhost:${GITLAB_PORT}`

/** Describes the learner's project in the fake GitLab (e2e/fake-gitlab.mjs). */
async function fakeProject(project: Record<string, unknown>) {
  const res = await fetch(`${gitlab}/__fake/projects`, { method: 'POST', body: JSON.stringify(project) })
  if (!res.ok) throw new Error(`fake gitlab: ${res.status}`)
}

const labModule = (slug: string, lab: LabConfigInput, body = '# Lab'): ModuleInput => ({
  slug,
  name: `Lab ${slug}`,
  type: 'lab',
  lab,
  content: { kind: 'inline', body },
})

test.describe('labs (specs 090–095, 183)', () => {
  test('a learner validates the GitLab steps of a lab; the admin tracks the checks', async ({ page, createCourse, createUser, setModules }) => {
    const course = await createCourse()
    const params = { project: 'e-learning/{{username}}' }
    await setModules(course.id, [
      labModule(
        'git',
        {
          labUrl: 'https://gitlab.test/e-learning/{{username}}',
          provider: 'gitlab',
          steps: [
            { title: 'Créer une branche', checkType: 'gitlab_branch', checkParams: { ...params, pattern: '^feature/' } },
            { title: 'Ouvrir une merge request', checkType: 'gitlab_mr_open', checkParams: params },
          ],
        },
        '# Le lab\n\nCréez une branche.\n\n<!-- check:1 -->\n\nPuis ouvrez une MR.\n\n<!-- check:2 -->\n\nFin.',
      ),
    ])
    const user = await createUser()
    await signIn(page, user)
    await page.request.post(`/api/enrollments/${course.slug}`)
    await page.goto(`/courses/${course.slug}/lessons/git`)
    await expect(page.getByRole('link', { name: 'Ouvrir mon espace de travail ↗' })).toHaveAttribute(
      'href',
      `https://gitlab.test/e-learning/${user.username}`,
    )
    await expect(page.getByText('Une fois le lab terminé, revenez ici pour valider votre travail.')).toBeVisible()
    const first = page.getByTestId('lab-step-0')
    const second = page.getByTestId('lab-step-1')
    // The steps sit where their markers were.
    await expect(page.getByTestId('lesson-content')).toContainText(/Créez une branche\.\s*✔ Créer une branche.*Puis ouvrez une MR\./s)

    await first.getByRole('button', { name: 'Vérifier cette étape' }).click()
    await expect(first).toContainText('✗ Pas encore')
    await expect(first).toContainText(`Projet introuvable : e-learning/${user.username}`)

    await fakeProject({ path: `e-learning/${user.username}`, branches: ['feature/login'] })
    await first.getByRole('button', { name: 'Vérifier cette étape' }).click()
    await expect(first).toContainText('✓ Étape validée !')
    await expect(page.getByTestId('lab-progress')).toHaveText('1/2 étapes validées')

    await fakeProject({ path: `e-learning/${user.username}`, branches: ['feature/login'], mergeRequests: [{ title: 'Login', source_branch: 'feature/login' }] })
    await second.getByRole('button', { name: 'Vérifier cette étape' }).click()
    // Every step validated: the lab is done, back to the course (last module).
    await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}$`))
    await expect(page.getByTestId('module-git')).toContainText('✓ Vu')

    const admin = page.context().browser()!
    const adminPage = await admin.newPage({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.1' } })
    await signIn(adminPage, { email: 'admin', password: ADMIN_PASSWORD })
    await adminPage.goto('/admin/labs')
    await adminPage.getByRole('combobox', { name: 'Cours' }).selectOption({ label: course.title })
    await expect(adminPage.getByTestId('lab-stats')).toContainText('Total vérifications3')
    await expect(adminPage.getByTestId(`lab-check-${user.username}`)).toHaveCount(3)
    await expect(adminPage.getByTestId(`lab-check-${user.username}`).filter({ hasText: 'échoué' })).toContainText('Projet introuvable')
    await adminPage.close()
  })

  test('commit, pipeline and file checks', async ({ createCourse, createUser, setModules }) => {
    const course = await createCourse()
    const project = 'e-learning/{{username}}'
    await setModules(course.id, [
      labModule('ci', {
        provider: 'gitlab',
        steps: [
          { title: 'Conventional commit', checkType: 'gitlab_conventional_commit', checkParams: { project } },
          { title: 'Pipeline', checkType: 'gitlab_pipeline_passed', checkParams: { project } },
          { title: 'Fichier', checkType: 'gitlab_file_on_branch', checkParams: { project, branch: 'main', file: 'lab.py' } },
          { title: 'Commit sur la branche', checkType: 'gitlab_conventional_commit_on_branch', checkParams: { project, branch: 'dev' } },
          { title: 'Inconnu', checkType: 'gitlab_nope', checkParams: { project } },
        ],
      }),
    ])
    const user = await createUser()
    await fakeProject({
      path: `e-learning/${user.username}`,
      branches: ['dev'],
      mergeRequests: [{ title: 'MR', source_branch: 'dev', commits: ['wip'], pipeline: 'failed' }],
      commits: { dev: ['feat(api): add login'] },
      files: { main: ['lab.py'] },
    })
    const learner = await apiClient()
    await learner.post('/api/auth/sign-in/email', { data: { email: user.email, password: user.password } })
    await learner.post(`/api/enrollments/${course.slug}`)
    const check = async (i: number) => (await learner.post(`/api/courses/${course.slug}/modules/ci/steps/${i}/check`)).json()
    expect((await check(0)).allow).toBe(false)
    expect((await check(1)).violations).toEqual(['Le pipeline de la merge request n’a pas réussi'])
    expect((await check(2)).allow).toBe(true)
    expect((await check(3)).allow).toBe(true)
    expect((await check(4)).violations).toEqual(['Type de vérification inconnu : gitlab_nope'])
    await fakeProject({
      path: `e-learning/${user.username}`,
      branches: ['dev'],
      mergeRequests: [{ title: 'MR', source_branch: 'dev', commits: ['wip', 'fix: tests'], pipeline: 'success' }],
    })
    expect((await check(0)).allow).toBe(true)
    expect((await check(1)).allow).toBe(true)
    expect((await learner.post(`/api/courses/${course.slug}/modules/ci/steps/9/check`)).status()).toBe(404)
    expect((await learner.post(`/api/courses/${course.slug}/modules/ci/complete`)).status()).toBe(400)
    await learner.dispose()
  })

  test('local checks run in the desktop app and are reported; browsers get a link to the app', async ({
    page,
    adminRequest,
    createCourse,
    createUser,
    setModules,
  }) => {
    const course = await createCourse()
    await setModules(course.id, [
      labModule('local', { provider: 'local', steps: [{ title: 'Images podman', checkType: 'podman_images', checkParams: {} }] }),
    ])
    const user = await createUser()
    await signIn(page, user)
    await page.request.post(`/api/enrollments/${course.slug}`)
    await page.goto(`/courses/${course.slug}/lessons/local`)
    await expect(page.getByTestId('lab-step-0')).toContainText('Ce lab se vérifie dans Pupitre.')
    await expect(page.getByRole('link', { name: 'Ouvrir dans Pupitre →' })).toHaveAttribute('href', `pupitre://courses/${course.slug}/modules/local`)

    // Inside the desktop app (Tauri), the check runs locally and the result is recorded.
    await page.addInitScript(() => {
      ;(globalThis as unknown as { __TAURI__: unknown }).__TAURI__ = { core: { invoke: async () => ({ allow: true, violations: [] }) } }
    })
    await page.reload()
    await page.getByTestId('lab-step-0').getByRole('button', { name: 'Vérifier cette étape' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}$`))

    const { checks } = await (await adminRequest.get(`/api/admin/lab-checks?course=${course.id}`)).json()
    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({ allow: true, verified: false, step: 'Images podman' })
    expect((await page.request.post(`/api/courses/${course.slug}/modules/local/steps/0/check`)).status()).toBe(400)

    // Spec 183: lab checks export (admins only).
    const csv = await adminRequest.post('/api/admin/exports/download', {
      data: { category: 'labChecks', fields: ['username', 'courseSlug', 'result', 'verified'], filters: { course: course.slug } },
    })
    expect((await csv.text()).trim().split('\r\n')[1]).toBe(`${user.username};${course.slug};yes;no`)
  })
})

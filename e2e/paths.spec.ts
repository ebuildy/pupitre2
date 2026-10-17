import type { ModuleInput } from '@pupitre/shared'
import { ADMIN_PASSWORD } from './env.ts'
import { apiClient, expect, signIn, test, uid } from './fixtures.ts'

const admin = { email: 'admin', password: ADMIN_PASSWORD }

const lesson = (slug: string, skills: string[] = []): ModuleInput => ({
  slug,
  name: `Leçon ${slug}`,
  type: 'text',
  skills,
  content: { kind: 'inline', body: '# Leçon' },
})

const quiz = (slug: string, skills: string[]): ModuleInput => ({
  slug,
  name: `Quiz ${slug}`,
  type: 'quiz',
  skills,
  content: {
    kind: 'inline',
    body: 'passingScore: 50\nquestions:\n  - id: a\n    type: boolean\n    question: "Vrai ?"\n    correctAnswer: true\n',
  },
})

test.describe('admin paths (specs 126, 127)', () => {
  test('an admin creates a course path, orders its courses and enrolls a learner', async ({ page, createCourse, createUser }) => {
    const token = uid()
    const first = await createCourse({ title: `${token} premier` })
    const second = await createCourse({ title: `${token} second` })
    const learner = await createUser()

    await signIn(page, admin)
    await page.goto('/admin/paths')
    await page.getByRole('button', { name: '+ Nouveau parcours' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Titre').fill(`Parcours ${token}`)
    await dialog.getByLabel('Slug').fill(`parcours-${token}`)
    await dialog.getByRole('button', { name: 'Créer le parcours' }).click()
    await expect(page.getByRole('heading', { name: `Parcours ${token}` })).toBeVisible()

    const add = page.getByRole('combobox', { name: '— Ajouter un cours —' })
    await add.selectOption({ label: `${second.title} (${second.slug})` })
    await add.selectOption({ label: `${first.title} (${first.slug})` })
    await page.getByRole('button', { name: `Monter ${first.title}` }).click()
    const members = page.getByRole('list', { name: 'Éléments du parcours' })
    await expect(members.getByRole('listitem')).toHaveText([`1.${first.title}`, `2.${second.title}`])
    await members.locator('..').getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Parcours enregistré')).toBeVisible()

    await page.getByRole('combobox', { name: 'Rechercher un utilisateur' }).fill(learner.username)
    await page.getByRole('option').getByRole('button', { name: new RegExp(learner.username) }).click()
    await page.getByRole('button', { name: 'Inscrire' }).click()
    await expect(page.getByText('Utilisateur inscrit')).toBeVisible()
    await expect(page.getByTestId(`path-enrollment-${learner.username}`)).toContainText('0/2')

    const res = await page.request.get(`/api/admin/courses/${first.id}/enrollments`)
    const row = (await res.json()).enrollments.find((e: { userId: string }) => e.userId === learner.id)
    expect(row.sources).toEqual(['path'])
  })
})

test.describe('path access and progress (specs 122–125)', () => {
  test('enrollment gives access to private member courses; the roadmap follows completions', async ({
    page,
    adminRequest,
    createCourse,
    createUser,
    setModules,
  }) => {
    const token = uid()
    const first = await createCourse({ title: `${token} un`, visibility: 'private' })
    const second = await createCourse({ title: `${token} deux`, visibility: 'private' })
    await setModules(first.id, [lesson('a')])
    await setModules(second.id, [lesson('a')])
    const created = await (
      await adminRequest.post('/api/admin/paths', {
        data: { slug: `p-${token}`, title: `Parcours ${token}`, kind: 'course', status: 'published', items: [first.id, second.id] },
      })
    ).json()
    const learner = await createUser()
    await adminRequest.post(`/api/admin/paths/${created.id}/enrollments`, { data: { userId: learner.id } })

    await signIn(page, learner)
    // Spec 125: the private course is visible and the learner is enrolled.
    expect((await page.request.get(`/api/courses/${first.slug}`)).ok()).toBeTruthy()
    await page.getByRole('link', { name: 'Mes parcours' }).first().click()
    const card = page.getByTestId(`my-path-p-${token}`)
    await expect(card).toContainText('0/2')
    await card.click()
    await expect(page.getByTestId(`path-node-${first.slug}`)).toHaveAttribute('data-status', 'available')
    await expect(page.getByTestId(`path-node-${second.slug}`)).toHaveAttribute('data-status', 'locked')
    await expect(page.getByRole('link', { name: `${second.title} — Verrouillé` })).toHaveCount(0)

    await page.request.post(`/api/courses/${first.slug}/modules/a/complete`)
    await page.reload()
    await expect(page.getByTestId(`path-node-${first.slug}`)).toHaveAttribute('data-status', 'completed')
    await expect(page.getByTestId(`path-node-${second.slug}`)).toHaveAttribute('data-status', 'available')
    await page.getByRole('link', { name: `${second.title} — Disponible` }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${second.slug}$`))

    // Unenrolling removes only the path's access; progress stays.
    await adminRequest.delete(`/api/admin/paths/${created.id}/enrollments/${learner.id}`)
    expect((await page.request.get(`/api/courses/${second.slug}`)).status()).toBe(404)
  })

  test('removing a course from the path removes the access it gave', async ({ adminRequest, createCourse, createUser }) => {
    const token = uid()
    const kept = await createCourse({ visibility: 'private' })
    const dropped = await createCourse({ visibility: 'private' })
    const created = await (
      await adminRequest.post('/api/admin/paths', {
        data: { slug: `p-${token}`, title: token, status: 'published', items: [kept.id, dropped.id] },
      })
    ).json()
    const learner = await createUser()
    await adminRequest.post(`/api/admin/paths/${created.id}/enrollments`, { data: { userId: learner.id } })
    await adminRequest.patch(`/api/admin/paths/${created.id}`, { data: { items: [kept.id] } })
    const enrolled = async (courseId: string) =>
      (await (await adminRequest.get(`/api/admin/courses/${courseId}/enrollments`)).json()).enrollments.some(
        (e: { userId: string }) => e.userId === learner.id,
      )
    expect(await enrolled(kept.id)).toBe(true)
    expect(await enrolled(dropped.id)).toBe(false)
  })

  test('a skill path completes a skill when every quiz teaching it is passed', async ({
    adminRequest,
    createCourse,
    createUser,
    setModules,
  }) => {
    const token = uid()
    const first = `s1-${token}`
    const second = `s2-${token}`
    const course = await createCourse()
    await setModules(course.id, [lesson('l', [first]), quiz('q1', [first]), quiz('q2', [second])])
    const path = await (
      await adminRequest.post('/api/admin/paths', {
        data: { slug: `sp-${token}`, title: token, kind: 'skill', status: 'published', items: [first, second] },
      })
    ).json()
    const user = await createUser()
    await adminRequest.post(`/api/admin/paths/${path.id}/enrollments`, { data: { userId: user.id } })

    const learner = await apiClient()
    await learner.post('/api/auth/sign-in/email', { data: { email: user.email, password: user.password } })
    await learner.post(`/api/enrollments/${course.slug}`)
    const statuses = async () => {
      const mine = (await (await learner.get('/api/my/paths')).json()).paths.find((p: { slug: string }) => p.slug === `sp-${token}`)
      return mine.progress.map((p: { status: string }) => p.status)
    }
    expect(await statuses()).toEqual(['available', 'locked'])
    await learner.post(`/api/courses/${course.slug}/modules/l/complete`)
    await learner.post(`/api/courses/${course.slug}/modules/q1/submit`, { data: { answers: { a: { boolean: true } } } })
    expect(await statuses()).toEqual(['completed', 'available'])
    await learner.dispose()
  })

  test('the public path catalogue lists published paths with the skills of their courses', async ({
    page,
    adminRequest,
    createCourse,
    setModules,
  }) => {
    const token = uid()
    const course = await createCourse()
    await setModules(course.id, [lesson('a', [`skill-${token}`])])
    await adminRequest.post('/api/admin/paths', {
      data: { slug: `pub-${token}`, title: token, status: 'published', items: [course.id] },
    })
    await adminRequest.post('/api/admin/paths', { data: { slug: `draft-${token}`, title: token, items: [course.id] } })
    const { paths } = await (await page.request.get('/api/paths')).json()
    const slugs = paths.map((p: { slug: string }) => p.slug)
    expect(slugs).toContain(`pub-${token}`)
    expect(slugs).not.toContain(`draft-${token}`)
    const detail = await (await page.request.get(`/api/paths/pub-${token}`)).json()
    expect(detail.skills.map((s: { slug: string }) => s.slug)).toEqual([`skill-${token}`])
    expect((await page.request.get(`/api/paths/draft-${token}`)).status()).toBe(404)
  })
})

test.describe('manager path enrollments (spec 143)', () => {
  test('a manager enrolls a member of their group in a path', async ({
    page,
    adminRequest,
    createCourse,
    createGroup,
    createUser,
    addMember,
  }) => {
    const token = uid()
    const course = await createCourse()
    const path = await (
      await adminRequest.post('/api/admin/paths', {
        data: { slug: `mp-${token}`, title: `Parcours ${token}`, status: 'published', items: [course.id] },
      })
    ).json()
    const group = await createGroup()
    const manager = await createUser()
    const member = await createUser()
    const outsider = await createUser()
    await addMember(group.id, manager.id, 'manager')
    await addMember(group.id, member.id)

    await signIn(page, manager)
    await page.goto('/manager/paths')
    await page.getByRole('combobox', { name: 'Parcours :' }).selectOption({ label: `Parcours ${token}` })
    await page.getByRole('combobox', { name: 'Membre' }).selectOption({ label: member.username })
    await page.getByRole('button', { name: 'Inscrire' }).click()
    await expect(page.getByText('Membre inscrit au parcours')).toBeVisible()
    await expect(page.getByTestId(`manager-path-${member.username}`)).toContainText('0/1')

    const res = await page.request.post(`/api/manager/paths/${path.id}/enrollments`, { data: { userId: outsider.id } })
    expect(res.status()).toBe(403)

    await page.getByTestId(`manager-path-${member.username}`).getByRole('button', { name: 'Désinscrire' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Désinscrire' }).click()
    await expect(page.getByText('Membre désinscrit')).toBeVisible()
  })
})

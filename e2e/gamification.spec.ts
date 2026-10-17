import type { ModuleInput } from '@pupitre/shared'
import { ADMIN_PASSWORD } from './env.ts'
import { apiClient, expect, signIn, test, uid } from './fixtures.ts'

const lesson = (slug: string, skills: string[] = []): ModuleInput => ({
  slug,
  name: `Leçon ${slug}`,
  type: 'text',
  skills,
  content: { kind: 'inline', body: `# ${slug}\n\nContenu.` },
})

test.describe('badges (specs 106–109)', () => {
  test('completing a course awards its badge: course page, "Mes badges", public profile, avatar', async ({
    page,
    createUser,
    createCourse,
    setModules,
  }) => {
    const token = uid()
    const course = await createCourse({ title: `${token} badge`, badge: { name: `Badge ${token}`, icon: '🦄' } })
    await setModules(course.id, [lesson('a')])
    const user = await createUser()
    await signIn(page, user)

    await page.goto('/my-badges')
    const locked = page.getByRole('list', { name: 'À débloquer' })
    await expect(locked.getByText(`Badge ${token}`)).toBeVisible()

    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByTestId('course-badge')).toContainText(`Badge ${token}`)
    await expect(page.getByTestId('course-badge')).toContainText('Obtenu par 0 apprenant')
    await page.request.post(`/api/enrollments/${course.slug}`)
    const done = await page.request.post(`/api/courses/${course.slug}/modules/a/complete`)
    expect((await done.json()).courseCompleted).toBe(true)

    await page.reload()
    await expect(page.getByTestId('course-badge')).toContainText('✓ Badge obtenu')
    await expect(page.getByTestId('course-badge')).toContainText('Obtenu par 1 apprenant')

    await page.goto('/my-badges')
    const earned = page.getByRole('list', { name: 'Badges obtenus' })
    await expect(earned.getByText(`Badge ${token}`)).toBeVisible()
    await expect(earned).toContainText('Obtenu par 1 apprenant')
    await expect(page.getByRole('list', { name: 'À débloquer' }).getByText(`Badge ${token}`)).toHaveCount(0)

    // The badge icon can be picked as avatar; another emoji cannot.
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Modifier la photo de profil' }).click()
    await page.getByRole('button', { name: 'Choisir 🦄' }).click()
    await expect(page.getByText('Photo de profil mise à jour')).toBeVisible()
    expect((await (await page.request.get('/api/me')).json()).image).toBe('🦄')
    expect((await page.request.patch('/api/me', { data: { image: '🐙' } })).status()).toBe(400)

    await page.goto(`/users/${user.id}`)
    await expect(page.getByRole('list', { name: 'Badges obtenus' })).toContainText(`Badge ${token}`)
  })

  test('the badge leaderboard ranks learners by number of badges', async ({
    page,
    createUser,
    createCourse,
    setModules,
    adminRequest,
  }) => {
    const user = await createUser()
    const courses = await Promise.all(
      ['🥝', '🍋', '🍇'].map((icon) => createCourse({ badge: { name: `Fruit ${icon}`, icon } })),
    )
    for (const c of courses) {
      await setModules(c.id, [lesson('a')])
      await adminRequest.post(`/api/admin/courses/${c.id}/enrollments`, { data: { userId: user.id } })
      await adminRequest.post(`/api/admin/courses/${c.id}/completions`, { data: { userId: user.id } })
    }
    await page.goto('/leaderboard')
    await page.getByRole('tab', { name: 'Badges' }).click()
    const row = page.getByRole('list', { name: 'Badges' }).getByRole('listitem').filter({ hasText: user.username })
    await expect(row).toContainText('3 badges')
    await expect(row).toContainText('🥝 🍋 🍇')
  })

  test('the admin sets a course badge in the course form', async ({ page, createCourse }) => {
    const course = await createCourse()
    await signIn(page, { email: 'admin', password: ADMIN_PASSWORD })
    await page.goto(`/admin/courses/${course.id}`)
    await page.getByLabel('Nom du badge').fill('Explorateur')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('alert')).toHaveText('Le nom et l’icône (un emoji) vont ensemble')
    await page.getByLabel('Icône (emoji)').fill('🧭')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('status')).toContainText('mis à jour')
    const saved = await (await page.request.get(`/api/courses/${course.slug}`)).json()
    expect(saved.badge).toEqual({ name: 'Explorateur', icon: '🧭' })
  })
})

test.describe('skills (specs 042, 110–114)', () => {
  test('module skills show on the card, the course page and the skill page; completion sets a level', async ({
    page,
    createUser,
    createCourse,
    setModules,
  }) => {
    const skill = `skill-${uid()}`
    const beginner = await createCourse({ title: `${skill} débutant`, difficulty: 'beginner' })
    const advanced = await createCourse({ title: `${skill} avancé`, difficulty: 'advanced' })
    await setModules(beginner.id, [lesson('a', [skill]), lesson('b', [skill])])
    await setModules(advanced.id, [lesson('a', [skill])])
    const user = await createUser()
    await signIn(page, user)

    await page.goto(`/courses?search=${skill}`)
    const card = page.getByRole('listitem').filter({ hasText: `${skill} débutant` })
    await card.getByRole('link', { name: /🎯/ }).click()
    await expect(page).toHaveURL(new RegExp(`/skills/${skill}$`))
    await expect(page.getByRole('heading', { name: 'Débutant' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Avancé' })).toBeVisible()
    await expect(page.getByTestId(`skill-course-${beginner.slug}`)).toContainText('0/2 modules')

    await page.request.post(`/api/enrollments/${beginner.slug}`)
    await page.request.post(`/api/courses/${beginner.slug}/modules/a/complete`)
    await page.reload()
    await expect(page.getByTestId(`skill-course-${beginner.slug}`)).toContainText('1/2 modules')
    await expect(page.getByTestId(`skill-course-${beginner.slug}`).getByLabel('Terminé')).toHaveCount(1)

    // "En cours" before completion, then a level.
    await page.goto('/my-skills')
    await expect(page.getByTestId(`skill-${skill}`)).toContainText('En cours')
    await page.request.post(`/api/courses/${beginner.slug}/modules/b/complete`)
    await page.reload()
    await expect(page.getByTestId(`skill-${skill}`)).toContainText('Débutant')
    await expect(page.getByTestId(`skill-${skill}`)).toContainText('1/2 cours')

    // Spec 042: the catalogue filtered by the skill keeps courses at or above the learner's level.
    await page.goto(`/courses?skill=${skill}`)
    await expect(page.getByTestId('skill-filter')).toContainText('Cours adaptés à ton niveau')
    await expect(page.getByRole('link', { name: `${skill} avancé` })).toBeVisible()
    await page.getByRole('button', { name: '✕ Retirer le filtre' }).click()
    await expect(page.getByTestId('skill-filter')).toHaveCount(0)

    // Every course teaching the skill completed: master.
    await page.request.post(`/api/enrollments/${advanced.slug}`)
    await page.request.post(`/api/courses/${advanced.slug}/modules/a/complete`)
    await page.goto('/my-skills')
    await expect(page.getByTestId(`skill-${skill}`)).toContainText('★ Maître')
    await expect(page.getByTestId(`skill-${skill}`)).toContainText('2/2 cours')
  })

  test('an invalid skill slug is refused', async ({ page }) => {
    expect((await page.request.get('/api/skills/Not_Valid')).status()).toBe(400)
    expect((await page.request.get('/api/skills/does-not-exist')).status()).toBe(404)
  })
})

test.describe('progress (specs 043, 044, 052)', () => {
  test('cards, "Reprendre" and "Mes cours" show the progress', async ({ page, createUser, createCourse, setModules }) => {
    const token = uid()
    const course = await createCourse({ title: `${token} progress` })
    await setModules(course.id, [lesson('a'), lesson('b'), lesson('c'), lesson('d')])
    const user = await createUser()
    await signIn(page, user)
    await page.request.post(`/api/enrollments/${course.slug}`)
    await page.request.post(`/api/courses/${course.slug}/modules/a/complete`)

    await page.goto('/courses')
    await expect(page.getByTestId('continue-hero')).toContainText(course.title)
    await expect(page.getByTestId('continue-hero')).toContainText('1/4 modules · 25 %')

    await page.goto(`/courses?search=${token}`)
    await expect(page.getByRole('listitem').filter({ hasText: course.title })).toContainText('1/4 modules · 25 %')

    await page.goto('/my-courses')
    const stats = page.getByTestId('my-courses-stats')
    // Label then value in the DOM (the value is shown first).
    await expect(stats).toHaveText('cours inscrits1cours terminés0modules terminés1progression globale25 %')
    await expect(page.getByRole('link', { name: 'Continuer ▸' })).toBeVisible()
    await page.getByLabel('Statut').selectOption('completed')
    await expect(page.getByText('Aucun cours ne correspond à votre filtre.')).toBeVisible()
    await page.getByLabel('Statut').selectOption('inProgress')
    await expect(page.getByRole('link', { name: course.title })).toBeVisible()
  })
})

test.describe('admin leaderboard (spec 115)', () => {
  test('ranks learners by quiz score', async ({ page, createUser, createCourse, setModules }) => {
    const course = await createCourse()
    await setModules(course.id, [
      {
        slug: 'q',
        name: 'Quiz',
        type: 'quiz',
        content: {
          kind: 'inline',
          body: 'passingScore: 50\nquestions:\n  - id: a\n    type: boolean\n    question: "Vrai ?"\n    correctAnswer: true\n    points: 5\n',
        },
      },
    ])
    const user = await createUser()
    const learner = await apiClient()
    await learner.post('/api/auth/sign-in/email', { data: { email: user.email, password: user.password } })
    await learner.post(`/api/enrollments/${course.slug}`)
    const res = await learner.post(`/api/courses/${course.slug}/modules/q/submit`, { data: { answers: { a: { boolean: true } } } })
    expect((await res.json()).passed).toBe(true)
    await learner.dispose()

    await signIn(page, { email: 'admin', password: ADMIN_PASSWORD })
    await page.goto('/admin/leaderboard')
    await expect(page.getByRole('heading', { name: 'Classement général' })).toBeVisible()
    await expect(page.getByTestId(`admin-rank-${user.username}`)).toContainText('5 pts')
    await expect(page.getByTestId(`admin-rank-${user.username}`)).toContainText('1 cours · 1 modules validés')
  })
})

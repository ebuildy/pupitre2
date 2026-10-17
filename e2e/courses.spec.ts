import { expect, login, signIn, test, uid } from './fixtures.ts'

test.describe('catalogue (specs 040, 041)', () => {
  test('lists published public courses only', async ({ page, createCourse }) => {
    const token = uid()
    await createCourse({ title: `${token} public` })
    await createCourse({ title: `${token} private`, visibility: 'private' })
    await createCourse({ title: `${token} draft`, status: 'draft' })
    await createCourse({ title: `${token} archived`, status: 'archived' })

    await page.goto(`/courses?search=${token}`)
    await expect(page.getByRole('status')).toHaveText('1 cours')
    await expect(page.getByRole('link', { name: `${token} public` })).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(1)
  })

  test('search, difficulty and category filters combine, and live in the URL', async ({
    page,
    createCourse,
    createCategory,
  }) => {
    const token = uid()
    const a = await createCategory({ title: `Alpha ${token}` })
    const a1 = await createCategory({ title: `Alpha child ${token}`, parentId: a.id })
    const b = await createCategory({ title: `Beta ${token}` })
    await createCourse({ title: `${token} first`, categoryId: a1.id, difficulty: 'beginner' })
    await createCourse({ title: `${token} second`, categoryId: b.id, difficulty: 'advanced' })

    await page.goto('/courses')
    await page.getByLabel('Rechercher un cours').fill(token)
    await expect(page).toHaveURL(new RegExp(`search=${token}`))
    await expect(page.getByRole('status')).toHaveText('2 cours')

    // Chips are top-level categories; a parent includes its subcategories' courses.
    const chips = page.getByRole('group', { name: 'Catégories' })
    await expect(chips.getByRole('button')).toHaveText(['Tout', `Alpha ${token} 1`, `Beta ${token} 1`].map((t) => new RegExp(t)))
    await chips.getByRole('button', { name: new RegExp(`Alpha ${token}`) }).click()
    await expect(page.getByRole('status')).toHaveText('1 cours')
    await expect(page.getByRole('link', { name: `${token} first` })).toBeVisible()
    await expect(page.getByRole('listitem')).toContainText(`Alpha ${token} › Alpha child ${token}`)
    await expect(page).toHaveURL(new RegExp(`category=${a.slug}`))

    await page.getByLabel('Difficulté').selectOption('advanced')
    await expect(page.getByText('Aucun cours trouvé')).toBeVisible()

    await chips.getByRole('button', { name: 'Tout' }).click()
    await expect(page.getByRole('link', { name: `${token} second` })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('1 cours')

    await page.reload()
    await expect(page.getByLabel('Difficulté')).toHaveValue('advanced')
    await expect(page.getByLabel('Rechercher un cours')).toHaveValue(token)
  })

  test('search matches category titles, parents included; courses are sorted by title', async ({
    page,
    createCourse,
    createCategory,
  }) => {
    const token = uid()
    const parent = await createCategory({ title: `Famille ${token}` })
    const child = await createCategory({ title: 'Sous-famille', parentId: parent.id })
    await createCourse({ title: 'Zèbre', categoryId: child.id })
    await createCourse({ title: 'Élan', categoryId: parent.id })
    await createCourse({ title: 'avion', categoryId: child.id })

    await page.goto(`/courses?search=${token}`)
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['avion', 'Élan', 'Zèbre'])
  })
})

test.describe('enrollment (specs 045, 047, 052)', () => {
  test('a visitor enrolls from the course page after logging in, then unenrolls', async ({
    page,
    createUser,
    createCourse,
  }) => {
    const user = await createUser()
    const course = await createCourse({ description: 'Une description' })

    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByRole('heading', { name: course.title })).toBeVisible()
    await expect(page.getByText('Inscrivez-vous pour accéder aux modules.')).toBeVisible()

    await page.getByRole('button', { name: "S'inscrire au cours" }).click()
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await login(page, user.email, user.password)
    await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}$`))
    // The session reaches the page shortly after the redirect.
    await expect(page.getByTestId('current-user')).toHaveText(user.username)

    await page.getByRole('button', { name: "S'inscrire au cours" }).click()
    await expect(page.getByText(/^✓ Inscrit le/)).toBeVisible()

    await page.getByRole('link', { name: 'Mes cours' }).click()
    await expect(page.getByRole('link', { name: course.title })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('1 cours')

    await page.getByRole('link', { name: 'Détails' }).click()
    await page.getByRole('button', { name: 'Se désinscrire' }).click()
    await page.getByRole('button', { name: 'Confirmer la désinscription' }).click()
    await expect(page.getByRole('button', { name: "S'inscrire au cours" })).toBeVisible()

    await page.goto('/my-courses')
    await expect(page.getByText("Vous n'êtes inscrit à aucun cours")).toBeVisible()
  })

  test('the catalogue marks enrolled courses', async ({ page, createUser, createCourse }) => {
    const user = await createUser()
    const token = uid()
    const course = await createCourse({ title: `${token} enrolled` })
    await createCourse({ title: `${token} other` })

    await signIn(page, user)
    await page.goto(`/courses/${course.slug}`)
    await page.getByRole('button', { name: "S'inscrire au cours" }).click()
    await expect(page.getByText(/^✓ Inscrit le/)).toBeVisible()

    await page.goto(`/courses?search=${token}`)
    const cards = page.getByRole('listitem')
    await expect(cards.filter({ hasText: `${token} enrolled` }).getByText('Inscrit')).toBeVisible()
    await expect(cards.filter({ hasText: `${token} other` }).getByText('Inscrit')).toHaveCount(0)
  })

  test('a private course is hidden until an admin enrolls the learner', async ({
    page,
    createUser,
    createCourse,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse({ visibility: 'private' })

    await signIn(page, user)
    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByRole('heading', { name: 'Cours introuvable' })).toBeVisible()
    expect((await page.request.post(`/api/enrollments/${course.slug}`)).status()).toBe(404)

    const me = await (await page.request.get('/api/me')).json()
    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: me.id } })

    await page.reload()
    await expect(page.getByRole('heading', { name: course.title })).toBeVisible()
    await expect(page.getByText('Inscription gérée par un administrateur')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Se désinscrire' })).toHaveCount(0)
  })

  test('an archived course stays visible to enrolled learners but is closed to new enrollments', async ({
    page,
    createUser,
    createCourse,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse()
    await signIn(page, user)
    expect((await page.request.post(`/api/enrollments/${course.slug}`)).ok()).toBeTruthy()

    await adminRequest.patch(`/api/admin/courses/${course.id}`, { data: { status: 'archived' } })

    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByText('Ce cours est archivé.')).toBeVisible()
    await page.goto('/my-courses')
    await expect(page.getByRole('link', { name: course.title })).toBeVisible()

    const other = await createUser()
    await page.context().clearCookies()
    await signIn(page, other)
    expect((await page.request.post(`/api/enrollments/${course.slug}`)).status()).toBe(404)
  })

  test('enrollment API requires a session; drafts are not visible', async ({ request, createCourse }) => {
    const course = await createCourse({ status: 'draft' })
    expect((await request.post(`/api/enrollments/${course.slug}`)).status()).toBe(401)
    expect((await request.get(`/api/courses/${course.slug}`)).status()).toBe(404)
    expect((await request.get('/api/my/courses')).status()).toBe(401)
  })
})

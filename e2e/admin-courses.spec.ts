import { ADMIN_PASSWORD } from './env.ts'
import { expect, login, signIn, test, uid } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/login')
  await login(page, 'admin', ADMIN_PASSWORD)
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
})

test.describe('admin courses (specs 165–168)', () => {
  test('create, edit and delete a course', async ({ page }) => {
    const id = uid()
    await page.getByRole('link', { name: 'Cours', exact: true }).click()
    await page.getByRole('link', { name: '+ Nouveau cours' }).click()

    // Client-side validation
    await page.getByRole('button', { name: 'Créer le cours' }).click()
    await expect(page.getByRole('alert')).toHaveText('Le titre est requis')
    await page.getByLabel('Titre').fill(`Admin ${id}`)
    await page.getByLabel('Slug').fill('Not A Slug')
    await page.getByRole('button', { name: 'Créer le cours' }).click()
    await expect(page.getByRole('alert')).toHaveText('Slug invalide')

    await page.getByLabel('Slug').fill(`admin-${id}`)
    await page.getByLabel('Description').fill('Créé depuis les tests')
    await page.getByLabel('Difficulté').selectOption('intermediate')
    await page.getByLabel('Visibilité').selectOption('public')
    await page.getByLabel('Statut').selectOption('published')
    await page.getByRole('button', { name: 'Créer le cours' }).click()

    await expect(page.getByRole('status')).toHaveText(`Cours « admin-${id} » créé`)
    await expect(page.getByRole('heading', { name: 'Modifier le cours' })).toBeVisible()

    // The learner catalogue shows it.
    expect((await page.request.get(`/api/courses/admin-${id}`)).ok()).toBeTruthy()

    // Edit: title and slug (the slug can change, the id stays).
    await page.getByLabel('Titre').fill(`Admin ${id} v2`)
    await page.getByLabel('Slug').fill(`admin-${id}-v2`)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('status')).toHaveText(`Cours « admin-${id}-v2 » mis à jour`)

    // Listed with its badges.
    await page.getByRole('link', { name: '← Retour aux cours' }).click()
    await page.getByLabel('Rechercher un cours').fill(id)
    const row = page.getByRole('row').filter({ hasText: `Admin ${id} v2` })
    await expect(row).toContainText(`admin-${id}-v2`)
    await expect(row).toContainText('Intermédiaire')
    await expect(row).toContainText('Public')
    await expect(row).toContainText('Publié')

    // Delete, with confirmation.
    await row.getByRole('button', { name: 'Supprimer' }).click()
    await row.getByRole('button', { name: 'Confirmer la suppression' }).click()
    await expect(page.getByRole('status')).toHaveText(`Cours « Admin ${id} v2 » supprimé`)
    await expect(page.getByText('Aucun cours')).toBeVisible()
    expect((await page.request.get(`/api/courses/admin-${id}-v2`)).status()).toBe(404)
  })

  test('a slug already in use is refused', async ({ page, createCourse }) => {
    const existing = await createCourse()
    await page.goto('/admin/courses/new')
    await page.getByLabel('Titre').fill('Duplicate')
    await page.getByLabel('Slug').fill(existing.slug)
    await page.getByRole('button', { name: 'Créer le cours' }).click()
    await expect(page.getByRole('alert')).toHaveText('Course already exists')
  })

  test('drafts and private courses are listed for admins', async ({ page, createCourse }) => {
    const token = uid()
    await createCourse({ title: `${token} draft`, status: 'draft' })
    await createCourse({ title: `${token} private`, visibility: 'private' })
    await page.goto('/admin/courses')
    await page.getByLabel('Rechercher un cours').fill(token)
    await expect(page.getByRole('row').filter({ hasText: `${token} draft` })).toContainText('Brouillon')
    await expect(page.getByRole('row').filter({ hasText: `${token} private` })).toContainText('Privé')
  })
})

test.describe('admin course enrollments (spec 145)', () => {
  test('enroll a user by search, then remove them', async ({ page, createUser, createCourse }) => {
    const user = await createUser()
    const course = await createCourse({ visibility: 'private' })
    await page.goto(`/admin/courses/${course.id}`)

    await expect(page.getByRole('heading', { name: 'Inscriptions (0)' })).toBeVisible()
    await page.getByRole('button', { name: 'Inscrire' }).click()
    await expect(page.getByRole('alert')).toHaveText('Sélectionnez un utilisateur dans la liste')

    await page.getByRole('combobox', { name: 'Rechercher un utilisateur' }).fill(user.username)
    await page.getByRole('option').filter({ hasText: user.email }).getByRole('button').click()
    await page.getByRole('button', { name: 'Inscrire' }).click()

    await expect(page.getByRole('heading', { name: 'Inscriptions (1)' })).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: user.email })
    await expect(row).toContainText('Administrateur')

    await row.getByRole('button', { name: /Retirer/ }).click()
    await expect(page.getByRole('heading', { name: 'Inscriptions (0)' })).toBeVisible()
    await expect(page.getByText('Aucun inscrit')).toBeVisible()
  })

  test('shows self-enrolled learners', async ({ page, browser, createUser, createCourse }) => {
    const user = await createUser()
    const course = await createCourse()

    const learner = await browser.newPage()
    await signIn(learner, user)
    expect((await learner.request.post(`/api/enrollments/${course.slug}`)).ok()).toBeTruthy()
    await learner.close()

    await page.goto(`/admin/courses/${course.id}`)
    await expect(page.getByRole('row').filter({ hasText: user.email })).toContainText('Auto-inscription')
  })
})

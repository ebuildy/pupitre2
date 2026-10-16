import { ADMIN_PASSWORD } from './env.ts'
import { expect, login, test, uid } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/login')
  await login(page, 'admin', ADMIN_PASSWORD)
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
})

test.describe('admin categories (spec 040)', () => {
  test('create a category and a subcategory, rename, then delete them', async ({ page }) => {
    const id = uid()
    await page.getByRole('link', { name: 'Catégories', exact: true }).click()
    await page.getByRole('link', { name: '+ Nouvelle catégorie' }).click()

    await page.getByRole('button', { name: 'Créer la catégorie' }).click()
    await expect(page.getByRole('alert')).toHaveText('Le titre est requis')
    await page.getByLabel('Titre').fill(`Parent ${id}`)
    await page.getByLabel('Slug').fill('Not A Slug')
    await page.getByRole('button', { name: 'Créer la catégorie' }).click()
    await expect(page.getByRole('alert')).toHaveText('Slug invalide')
    await page.getByLabel('Slug').fill(`parent-${id}`)
    await page.getByRole('button', { name: 'Créer la catégorie' }).click()
    await expect(page.getByRole('status')).toHaveText(`Catégorie « parent-${id} » créée`)

    await page.getByRole('link', { name: '← Retour aux catégories' }).click()
    await page.getByRole('link', { name: '+ Nouvelle catégorie' }).click()
    await page.getByLabel('Titre').fill(`Child ${id}`)
    await page.getByLabel('Slug').fill(`child-${id}`)
    await page.getByLabel('Catégorie parente').selectOption({ label: `Parent ${id}` })
    await page.getByRole('button', { name: 'Créer la catégorie' }).click()
    await expect(page.getByRole('status')).toHaveText(`Catégorie « child-${id} » créée`)

    // Rename the parent: the child's path follows.
    await page.getByRole('link', { name: '← Retour aux catégories' }).click()
    await page.getByRole('row').filter({ hasText: `parent-${id}` }).getByRole('link', { name: 'Modifier' }).click()
    // A category can't be moved under itself or its subcategories.
    await expect(page.getByLabel('Catégorie parente').locator('option', { hasText: `Child ${id}` })).toHaveCount(0)
    await page.getByLabel('Titre').fill(`Renamed ${id}`)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('status')).toHaveText(`Catégorie « parent-${id} » mise à jour`)

    await page.getByRole('link', { name: '← Retour aux catégories' }).click()
    const parentRow = page.getByRole('row').filter({ hasText: `parent-${id}` })
    const childRow = page.getByRole('row').filter({ hasText: `child-${id}` })
    await expect(parentRow).toContainText(`Renamed ${id}`)

    // A category with subcategories can't be deleted.
    await parentRow.getByRole('button', { name: 'Supprimer' }).click()
    await parentRow.getByRole('button', { name: 'Confirmer la suppression' }).click()
    await expect(page.getByRole('alert')).toHaveText('Category has subcategories')

    await childRow.getByRole('button', { name: 'Supprimer' }).click()
    await childRow.getByRole('button', { name: 'Confirmer la suppression' }).click()
    await expect(page.getByRole('status')).toHaveText(`Catégorie « Child ${id} » supprimée`)
    await parentRow.getByRole('button', { name: 'Supprimer' }).click()
    await parentRow.getByRole('button', { name: 'Confirmer la suppression' }).click()
    await expect(page.getByRole('status')).toHaveText(`Catégorie « Renamed ${id} » supprimée`)
    await expect(parentRow).toHaveCount(0)
  })

  test('a category used by a course cannot be deleted', async ({ page, createCategory, createCourse }) => {
    const category = await createCategory()
    await createCourse({ categoryId: category.id })

    await page.goto('/admin/categories')
    const row = page.getByRole('row').filter({ hasText: category.slug })
    await expect(row).toContainText('1')
    await row.getByRole('button', { name: 'Supprimer' }).click()
    await row.getByRole('button', { name: 'Confirmer la suppression' }).click()
    await expect(page.getByRole('alert')).toHaveText('Category is used by courses')
  })

  test('a course is filed under a category from the course form', async ({ page, createCategory, createCourse }) => {
    const parent = await createCategory()
    const child = await createCategory({ parentId: parent.id })
    const course = await createCourse()

    await page.goto(`/admin/courses/${course.id}`)
    await page.getByLabel('Catégorie').selectOption({ label: `${parent.title} › ${child.title}` })
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('status')).toHaveText(`Cours « ${course.slug} » mis à jour`)

    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByText(`${parent.title} › ${child.title}`)).toBeVisible()
  })

  test('the API refuses cycles, duplicates and unknown parents', async ({ adminRequest, createCategory }) => {
    const parent = await createCategory()
    const child = await createCategory({ parentId: parent.id })

    const cycle = await adminRequest.patch(`/api/admin/categories/${parent.id}`, { data: { parentId: child.id } })
    expect(cycle.status()).toBe(400)
    const self = await adminRequest.patch(`/api/admin/categories/${parent.id}`, { data: { parentId: parent.id } })
    expect(self.status()).toBe(400)
    const duplicate = await adminRequest.post('/api/admin/categories', { data: { slug: parent.slug, title: 'x' } })
    expect(duplicate.status()).toBe(409)
    const orphan = await adminRequest.post('/api/admin/categories', { data: { slug: `x-${uid()}`, title: 'x', parentId: 'nope' } })
    expect(orphan.status()).toBe(400)
  })
})

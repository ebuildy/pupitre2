import type { APIRequestContext } from '@playwright/test'
import { ADMIN_PASSWORD } from './env.ts'
import { expect, login, signIn, test, uid } from './fixtures.ts'

/** Admin API helpers. */
function admin(api: APIRequestContext) {
  return {
    enroll: (courseId: string, userId: string) =>
      api.post(`/api/admin/courses/${courseId}/enrollments`, { data: { userId } }),
    complete: (courseId: string, userId: string) =>
      api.post(`/api/admin/courses/${courseId}/completions`, { data: { userId } }),
    uncomplete: (courseId: string, userId: string) => api.delete(`/api/admin/courses/${courseId}/completions/${userId}`),
    adjust: (userId: string, amount: number, reason = 'test') =>
      api.post(`/api/admin/users/${userId}/xp`, { data: { amount, reason } }),
  }
}

test.describe('XP (specs 103, 104, 105)', () => {
  test('a new learner has no XP yet', async ({ page, createUser }) => {
    await signIn(page, await createUser())
    await page.getByRole('link', { name: 'Mon XP' }).click()

    await expect(page.getByTestId('xp-total')).toHaveText('0')
    await expect(page.getByText('Niveau 1 — Novice')).toBeVisible()
    await expect(page.getByText('200 XP jusqu’au niveau 2 (Apprenant)')).toBeVisible()
    await expect(page.getByText("Aucun XP gagné pour l'instant.", { exact: false })).toBeVisible()
  })

  test('completing a course grants its XP once, and shows everywhere', async ({
    page,
    createUser,
    createCourse,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse({ completionXp: 250 })
    const api = admin(adminRequest)
    await api.enroll(course.id, user.id)

    await signIn(page, user)
    await page.goto('/my-xp')
    await expect(page.getByText(`${course.title}Compléter pour +250 XP`)).toBeVisible()

    expect((await api.complete(course.id, user.id)).ok()).toBeTruthy()
    // Idempotent: completing again earns nothing more.
    expect((await api.complete(course.id, user.id)).ok()).toBeTruthy()

    await page.reload()
    await expect(page.getByTestId('xp-total')).toHaveText('250')
    await expect(page.getByText('Niveau 2 — Apprenant')).toBeVisible()
    await expect(page.getByTestId('xp-history').getByRole('listitem')).toHaveCount(1)
    await expect(page.getByTestId('xp-history')).toContainText('Cours terminé')
    await expect(page.getByTestId('xp-history')).toContainText('+250 XP')

    await page.getByTestId('xp-history').getByRole('link', { name: course.title }).click()
    await expect(page.getByText(/^✓ Cours terminé le/)).toBeVisible()
    await expect(page.getByTestId('course-xp')).toContainText('+250 XP obtenus ✓')

    await page.goto('/my-courses')
    await expect(page.getByText(/^✓ Terminé le/)).toBeVisible()

    // Undoing the completion removes its XP.
    await api.uncomplete(course.id, user.id)
    await page.goto('/my-xp')
    await expect(page.getByTestId('xp-total')).toHaveText('0')
  })

  test('a deleted course keeps the XP it granted', async ({ page, createUser, createCourse, adminRequest }) => {
    const user = await createUser()
    const course = await createCourse()
    const api = admin(adminRequest)
    await api.enroll(course.id, user.id)
    await api.complete(course.id, user.id)
    await adminRequest.delete(`/api/admin/courses/${course.id}`)

    await signIn(page, user)
    await page.goto('/my-xp')
    await expect(page.getByTestId('xp-total')).toHaveText('200')
    await expect(page.getByTestId('xp-history')).toContainText(course.title)
  })

  test('completion requires an enrollment', async ({ createUser, createCourse, adminRequest }) => {
    const user = await createUser()
    const course = await createCourse()
    const res = await admin(adminRequest).complete(course.id, user.id)
    expect(res.status()).toBe(400)
    expect(await res.json()).toEqual({ error: 'User is not enrolled in this course' })
  })
})

test.describe('XP-gated enrollment (spec 049)', () => {
  test('self-enrollment needs enough XP; admins can enroll anyway', async ({
    page,
    createUser,
    createCourse,
    adminRequest,
  }) => {
    const token = uid()
    const user = await createUser()
    const course = await createCourse({ title: `${token} gated`, xpRequired: 100 })

    await page.goto(`/courses?search=${token}`)
    await expect(page.getByRole('listitem')).toContainText('⚡ 100 XP requis')
    await expect(page.getByRole('listitem')).toContainText('+200 XP')

    await signIn(page, user)
    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByText('⚡ 100 XP requis pour s’inscrire')).toBeVisible()
    await expect(page.getByText('Il vous manque 100 XP (vous en avez 0).')).toBeVisible()
    await expect(page.getByRole('button', { name: "S'inscrire au cours" })).toBeDisabled()
    const refused = await page.request.post(`/api/enrollments/${course.slug}`)
    expect(refused.status()).toBe(403)
    expect(await refused.json()).toEqual({ error: 'Not enough XP to enroll in this course' })

    await admin(adminRequest).adjust(user.id, 150, 'Bonus')
    await page.reload()
    await page.getByRole('button', { name: "S'inscrire au cours" }).click()
    await expect(page.getByText(/^✓ Inscrit le/)).toBeVisible()

    // Admin enrollment ignores the gate.
    const other = await createUser()
    expect((await admin(adminRequest).enroll(course.id, other.id)).ok()).toBeTruthy()
  })
})

test.describe('leaderboard', () => {
  test('ranks learners by XP and shows the viewer’s position; admins and inactive users are left out', async ({
    page,
    createUser,
    adminRequest,
  }) => {
    const api = admin(adminRequest)
    const first = await createUser()
    const second = await createUser()
    const inactive = await createUser({ isActive: false })
    const adminId = (await (await adminRequest.get('/api/me')).json()).id
    await api.adjust(first.id, 100_000)
    await api.adjust(second.id, 90_000)
    await api.adjust(inactive.id, 100_000)
    await api.adjust(adminId, 100_000)

    await page.goto('/leaderboard')
    const rows = page.getByRole('list', { name: 'Classement' }).getByRole('listitem')
    await expect(rows.filter({ hasText: first.username })).toBeVisible()
    const names = await rows.allTextContents()
    const firstIndex = names.findIndex((n) => n.includes(first.username))
    const secondIndex = names.findIndex((n) => n.includes(second.username))
    expect(firstIndex).toBeGreaterThanOrEqual(0)
    expect(secondIndex).toBeGreaterThan(firstIndex)
    expect(names.some((n) => n.includes(inactive.username))).toBeFalsy()
    await expect(rows.getByText('admin', { exact: true })).toHaveCount(0)

    // Undo the admin's XP so other tests see a clean admin.
    await api.adjust(adminId, -100_000)

    await signIn(page, second)
    await page.goto('/leaderboard')
    await expect(page.getByTestId('my-rank')).toHaveText(/^Votre position : #\d+ \(90\s000 XP\)$/)
    await expect(rows.filter({ hasText: second.username })).toHaveAttribute('aria-current', 'true')
  })
})

test.describe('admin: XP per user', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login')
    await login(page, 'admin', ADMIN_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  })

  test('adjust a user’s XP with a reason; the total can’t go negative', async ({ page, createUser }) => {
    const user = await createUser()
    await page.getByRole('link', { name: 'Utilisateurs' }).click()
    await page.getByLabel('Rechercher un utilisateur').fill(user.username)
    await page.getByRole('link', { name: user.username }).click()
    await expect(page.getByTestId('user-xp')).toHaveText('0 XP')

    await page.getByRole('button', { name: 'Appliquer' }).click()
    await expect(page.getByRole('alert')).toHaveText('Saisissez un nombre entier non nul')
    await page.getByLabel('Montant').fill('300')
    await page.getByRole('button', { name: 'Appliquer' }).click()
    await expect(page.getByRole('alert')).toHaveText('Le motif est requis')
    await page.getByLabel('Motif').fill('Animation d’un atelier')
    await page.getByRole('button', { name: 'Appliquer' }).click()
    await expect(page.getByRole('status')).toHaveText('XP mis à jour : 300 XP au total')
    await expect(page.getByTestId('user-xp')).toHaveText('300 XP')
    await expect(page.getByText('Niveau 2 — Apprenant')).toBeVisible()
    await expect(page.getByTestId('user-xp-history')).toContainText('Animation d’un atelier')

    await page.getByLabel('Montant').fill('-500')
    await page.getByLabel('Motif').fill('Trop')
    await page.getByRole('button', { name: 'Appliquer' }).click()
    await expect(page.getByRole('alert')).toHaveText('XP total cannot become negative')
    await expect(page.getByTestId('user-xp')).toHaveText('300 XP')
  })

  test('mark a course completed from its enrollment list, then undo', async ({
    page,
    createUser,
    createCourse,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse({ completionXp: 120 })
    await admin(adminRequest).enroll(course.id, user.id)

    await page.goto(`/admin/courses/${course.id}`)
    const row = page.getByRole('row').filter({ hasText: user.email })
    await row.getByRole('button', { name: 'Marquer comme terminé' }).click()
    await expect(row).toContainText('✓ Terminé le')

    await page.goto(`/admin/users/${user.id}`)
    await expect(page.getByTestId('user-xp')).toHaveText('120 XP')
    await expect(page.getByText(course.title).first()).toBeVisible()

    await page.goto(`/admin/courses/${course.id}`)
    await row.getByRole('button', { name: 'Annuler l’achèvement' }).click()
    await expect(row.getByRole('button', { name: 'Marquer comme terminé' })).toBeVisible()
  })

  test('course form sets the XP gate and the completion XP', async ({ page, createCourse }) => {
    const course = await createCourse()
    await page.goto(`/admin/courses/${course.id}`)
    await expect(page.getByLabel('XP à l’achèvement')).toHaveValue('200')
    await page.getByLabel('XP requis pour s’inscrire').fill('50')
    await page.getByLabel('XP à l’achèvement').fill('80')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('status')).toHaveText(`Cours « ${course.slug} » mis à jour`)

    const updated = await (await page.request.get(`/api/courses/${course.slug}`)).json()
    expect(updated).toMatchObject({ xpRequired: 50, completionXp: 80 })
  })
})

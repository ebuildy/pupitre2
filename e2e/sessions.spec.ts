import { ADMIN_PASSWORD } from './env.ts'
import { apiClient, expect, randomIp, signIn, test, uid } from './fixtures.ts'

const admin = { email: 'admin', password: ADMIN_PASSWORD }

/** Tomorrow at 10:00 local time, as a `datetime-local` value and as ISO. */
function tomorrowAt10() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { local: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`, iso: d.toISOString() }
}

async function signedInClient(user: { email: string; password: string }) {
  const api = await apiClient()
  await api.post('/api/auth/sign-in/email', { data: { email: user.email, password: user.password } })
  return api
}

test.describe('in-person sessions (specs 150–155)', () => {
  test('an admin schedules a session from the agenda; a learner books it from the course page', async ({
    page,
    browser,
    createCourse,
    createUser,
  }) => {
    const token = uid()
    const course = await createCourse({ title: `${token} présentiel`, inPerson: true })
    const learner = await createUser()

    await signIn(page, admin)
    await page.goto('/agenda')
    await page.getByRole('button', { name: '+ Nouvelle session' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Cours').selectOption({ label: course.title })
    await dialog.getByLabel('Titre').fill(`Atelier ${token}`)
    await dialog.getByLabel('Date et heure').fill(tomorrowAt10().local)
    await dialog.getByLabel('Lieu').fill('Salle 3B')
    await dialog.getByLabel('Capacité').fill('1')
    await dialog.getByRole('button', { name: 'Créer' }).click()
    await expect(page.getByText('Session enregistrée')).toBeVisible()
    const upcoming = page.getByRole('complementary', { name: 'Sessions à venir' })
    await expect(upcoming.getByTestId(`session-Atelier ${token}`)).toContainText('🪑 0/1 réservées')

    const learnerPage = await browser.newPage({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } })
    await signIn(learnerPage, learner)
    await learnerPage.goto(`/courses/${course.slug}`)
    await expect(learnerPage.getByRole('heading', { name: '📍 Sessions en présentiel' })).toBeVisible()
    const card = learnerPage.getByTestId(`session-Atelier ${token}`)
    await expect(card).toContainText('📍 Salle 3B')
    await card.getByRole('button', { name: 'Réserver une place' }).click()
    await expect(learnerPage.getByText('Place réservée')).toBeVisible()
    await expect(card).toContainText('✓ Réservé')
    await expect(card).toContainText('🪑 1/1 réservées')
    // Booking a public course enrolls the learner.
    expect((await (await learnerPage.request.get(`/api/courses/${course.slug}`)).json()).enrolled).toBe(true)

    // Attendance sheet.
    await page.reload()
    await page.getByRole('complementary', { name: 'Sessions à venir' }).getByTestId(`session-Atelier ${token}`).getByRole('link', { name: 'Feuille de présence' }).click()
    await expect(page.getByRole('heading', { name: `Feuille de présence — Atelier ${token}` })).toBeVisible()
    await page.getByLabel(`Présence ${learner.username}`).selectOption('present')
    await expect(page.getByText('Présence enregistrée')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel(`Présence ${learner.username}`)).toHaveValue('present')

    await card.getByRole('button', { name: 'Annuler la réservation' }).click()
    await expect(learnerPage.getByText('Réservation annulée')).toBeVisible()
    await expect(card).toContainText('🪑 0/1 réservées')
    await learnerPage.close()
  })

  test('a full session refuses more bookings; past and private sessions cannot be booked', async ({
    adminRequest,
    createCourse,
    createUser,
  }) => {
    const course = await createCourse({ inPerson: true })
    const privateCourse = await createCourse({ inPerson: true, visibility: 'private' })
    const create = async (courseId: string, startsAt: string, capacity: number | null) =>
      (await (await adminRequest.post('/api/sessions', { data: { courseId, title: `S ${uid()}`, startsAt, capacity } })).json()).id
    const full = await create(course.id, tomorrowAt10().iso, 1)
    const past = await create(course.id, new Date(Date.now() - 86_400_000).toISOString(), null)
    const hidden = await create(privateCourse.id, tomorrowAt10().iso, null)

    const first = await signedInClient(await createUser())
    const second = await signedInClient(await createUser())
    expect((await first.post(`/api/sessions/${full}/booking`)).ok()).toBeTruthy()
    // Booking twice is harmless.
    expect((await first.post(`/api/sessions/${full}/booking`)).ok()).toBeTruthy()
    const refused = await second.post(`/api/sessions/${full}/booking`)
    expect(refused.status()).toBe(409)
    expect((await refused.json()).error).toBe('Session is full')
    expect((await second.post(`/api/sessions/${past}/booking`)).status()).toBe(400)
    expect((await second.post(`/api/sessions/${hidden}/booking`)).status()).toBe(404)
    await first.dispose()
    await second.dispose()
  })

  test('sessions are only for in-person courses, and only trainers manage them', async ({
    adminRequest,
    createCourse,
    createGroup,
    createUser,
    addMember,
  }) => {
    const regular = await createCourse()
    const inPerson = await createCourse({ inPerson: true })
    const refused = await adminRequest.post('/api/sessions', {
      data: { courseId: regular.id, title: 'Nope', startsAt: tomorrowAt10().iso },
    })
    expect(refused.status()).toBe(400)

    const student = await signedInClient(await createUser())
    expect(
      (await student.post('/api/sessions', { data: { courseId: inPerson.id, title: 'Nope', startsAt: tomorrowAt10().iso } })).status(),
    ).toBe(403)
    await student.dispose()

    const group = await createGroup()
    const managerUser = await createUser()
    await addMember(group.id, managerUser.id, 'manager')
    const manager = await signedInClient(managerUser)
    const created = await manager.post('/api/sessions', {
      data: { courseId: inPerson.id, title: `Manager ${uid()}`, startsAt: tomorrowAt10().iso },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()
    expect((await manager.get(`/api/sessions/${id}/participants`)).ok()).toBeTruthy()
    expect((await manager.delete(`/api/sessions/${id}`)).ok()).toBeTruthy()
    await manager.dispose()
  })

  test('the agenda month grid navigates and shows sessions on their day', async ({ page, adminRequest, createCourse, createUser }) => {
    const course = await createCourse({ inPerson: true })
    const title = `Grille ${uid()}`
    const when = new Date()
    when.setMonth(when.getMonth() + 1, 15)
    when.setHours(9, 0, 0, 0)
    await adminRequest.post('/api/sessions', { data: { courseId: course.id, title, startsAt: when.toISOString() } })

    await signIn(page, await createUser())
    await page.goto('/agenda')
    const month = page.getByTestId('agenda-month')
    const current = await month.textContent()
    await page.getByRole('button', { name: 'Mois suivant' }).click()
    await expect(month).not.toHaveText(current!)
    const day = page.getByRole('gridcell', { name: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(when) })
    // The cell lists up to 3 sessions ("+N autres" beyond, other tests use the same month): check the day panel.
    await day.click()
    await expect(page.getByTestId(`session-${title}`)).toBeVisible()
    await page.getByRole('button', { name: "Aujourd'hui" }).click()
    await expect(month).toHaveText(current!)
    // Learners see no trainer controls.
    await expect(page.getByRole('button', { name: '+ Nouvelle session' })).toHaveCount(0)
  })
})

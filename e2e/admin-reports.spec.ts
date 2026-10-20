import { ADMIN_PASSWORD, API_PORT, PROBES_PORT } from './env.ts'
import { apiClient, expect, signIn, test, uid } from './fixtures.ts'

const admin = { email: 'admin', password: ADMIN_PASSWORD }

test.describe('admin dashboard and monitoring (specs 160, 161)', () => {
  test('the dashboard shows computed figures; monitoring lists the courses', async ({ page, adminRequest, createCourse }) => {
    const course = await createCourse({ title: `Supervision ${uid()}` })
    const stats = await (await adminRequest.get('/api/admin/stats')).json()
    expect(stats.courses).toBeGreaterThan(0)
    expect(stats).toHaveProperty('successRate')

    await signIn(page, admin)
    await page.goto('/admin/')
    await expect(page.getByTestId('stat-courses')).toContainText('Cours')
    await expect(page.getByTestId('stat-successRate')).toContainText('Taux de réussite')
    await page.getByRole('link', { name: 'Supervision', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Aperçu des cours' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: course.title })).toBeVisible()
  })
})

test.describe('CSV exports (spec 182)', () => {
  test('an admin previews and downloads a users export', async ({ page, createUser }) => {
    const user = await createUser({ role: 'manager' })
    await signIn(page, admin)
    await page.goto('/admin/exports')
    await page.getByRole('radio', { name: 'Utilisateurs' }).click()
    await page.getByRole('combobox', { name: 'Rôle' }).selectOption('manager')
    await page.getByRole('button', { name: 'Aperçu' }).click()
    const preview = page.getByTestId('export-preview')
    await expect(preview.getByRole('columnheader', { name: "Nom d'utilisateur" })).toBeVisible()
    await expect(preview).toContainText(/lignes? au total/)

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Télécharger le CSV' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^users-export-\d{4}-\d{2}-\d{2}\.csv$/)
    const csv = (await (await file.createReadStream()).toArray()).join('')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const [header, ...rows] = csv.slice(1).trim().split('\r\n')
    expect(header).toBe("Nom d'utilisateur;Email;Rôle;Actif;Inscrit le")
    expect(rows.some((r) => r.startsWith(`${user.username};${user.email};manager;yes;`))).toBe(true)
    expect(rows.every((r) => r.split(';')[2] === 'manager')).toBe(true)
  })

  test('manager exports only contain their members; errors are explicit', async ({ adminRequest, createGroup, createUser, addMember }) => {
    const group = await createGroup()
    const managerUser = await createUser()
    const member = await createUser()
    const outsider = await createUser()
    await addMember(group.id, managerUser.id, 'manager')
    await addMember(group.id, member.id)

    const manager = await apiClient()
    await manager.post('/api/auth/sign-in/email', { data: { email: managerUser.email, password: managerUser.password } })
    const res = await manager.post('/api/manager/exports/download', { data: { category: 'users', fields: ['username'] } })
    const usernames = (await res.text()).slice(1).trim().split('\r\n').slice(1)
    expect(usernames).toContain(member.username)
    expect(usernames).not.toContain(outsider.username)
    await manager.dispose()

    expect((await adminRequest.post('/api/admin/exports/preview', { data: { category: 'nope', fields: ['x'] } })).status()).toBe(400)
    const missing = await adminRequest.post('/api/admin/exports/preview', { data: { fields: ['x'] } })
    expect((await missing.json()).error).toContain('Catégorie requise')
    const student = await apiClient()
    expect((await student.get('/api/admin/exports/categories')).status()).toBe(401)
    await student.dispose()
  })
})

test.describe('health and metrics (spec 006)', () => {
  const probes = `http://localhost:${PROBES_PORT}`

  test('probes and Prometheus metrics answer on the probes port', async ({ request }) => {
    expect(await (await request.get(`${probes}/health`)).json()).toEqual({ status: 'ok' })
    expect(await (await request.get(`${probes}/ready`)).json()).toEqual({ status: 'ok' })
    await request.get('/api/settings/public')
    const metrics = await request.get(`${probes}/metrics`)
    expect(metrics.headers()['content-type']).toContain('text/plain')
    const text = await metrics.text()
    expect(text).toContain('# TYPE http_requests_total counter')
    expect(text).toMatch(/pupitre_active_users_total \d+/)
    // Web API traffic is counted by route pattern.
    expect(text).toMatch(/http_requests_total\{method="GET",route="\/api\/settings\/public",status="200"\} \d+/)
    expect((await request.get(`${probes}/api/settings/public`)).status()).toBe(404)
  })

  test('probes are not exposed on the web: neither through the app nor on the API port', async ({ request }) => {
    for (const path of ['/health', '/ready', '/metrics', '/api/health', '/api/metrics']) {
      // The API port answers 404; the web app (which may serve its own HTML page) never proxies them.
      const api = await request.get(`http://localhost:${API_PORT}${path}`)
      expect(api.status(), path).toBe(404)
      expect(await api.json()).toEqual({ error: 'Not found' })
      const web = await (await request.get(path)).text()
      expect(web, path).not.toContain('http_requests_total')
      expect(web, path).not.toContain('"status":"ok"')
    }
  })
})

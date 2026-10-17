import type { ModuleInput } from '@pupitre/shared'
import { ADMIN_PASSWORD } from './env.ts'
import { expect, signIn, test, uid } from './fixtures.ts'

const admin = { email: 'admin', password: ADMIN_PASSWORD }
/** A 1×1 transparent PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test.describe('media (specs 044, 062, 063)', () => {
  test('an uploaded image is served; image modules show it; remote media are copied locally', async ({
    page,
    adminRequest,
    createCourse,
    createUser,
    setModules,
  }) => {
    const upload = await adminRequest.post('/api/admin/media', {
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PNG } },
    })
    expect(upload.status()).toBe(201)
    const { url } = await upload.json()
    expect(url).toMatch(/^\/uploads\/[\w-]+\.png$/)
    const served = await page.request.get(url)
    expect(served.headers()['content-type']).toBe('image/png')
    expect((await page.request.get('/uploads/bad%20name.png')).status()).toBe(400)
    const refused = await adminRequest.post('/api/admin/media', {
      multipart: { file: { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') } },
    })
    expect(refused.status()).toBe(400)

    // A remote URL (here: the API itself) with `replicate` is downloaded and served locally.
    const remote = `http://localhost:3101${url}`
    const modules: ModuleInput[] = [
      { slug: 'img', name: 'Schéma', type: 'image', content: { kind: 'media', url } },
      { slug: 'copy', name: 'Copie', type: 'image', content: { kind: 'media', url: remote, replicate: true } },
    ]
    const course = await createCourse({ thumbnailUrl: url })
    await setModules(course.id, modules)
    const invalid = await adminRequest.put(`/api/admin/courses/${course.id}/modules`, {
      data: { modules: [{ slug: 'v', name: 'V', type: 'video', content: { kind: 'inline', body: 'x' } }] },
    })
    expect(invalid.status()).toBe(400)

    await signIn(page, await createUser())
    await page.request.post(`/api/enrollments/${course.slug}`)
    await page.goto(`/courses/${course.slug}/lessons/img`)
    await expect(page.getByTestId('module-image')).toHaveAttribute('src', url)
    await expect(page.getByTestId('module-image')).toHaveAttribute('alt', 'Schéma')

    await page.request.post(`/api/courses/${course.slug}/modules/img/complete`)
    const copied = (await (await page.request.get(`/api/courses/${course.slug}/modules/copy`)).json()).media.url
    expect(copied).toMatch(/^\/uploads\/[0-9a-f]{16}\.png$/)
    expect((await (await page.request.get(`/api/courses/${course.slug}/modules/copy`)).json()).media.url).toBe(copied)
    expect((await page.request.get(copied)).ok()).toBeTruthy()

    // Spec 044: the thumbnail on the catalogue card.
    await page.goto(`/courses?search=${encodeURIComponent(course.title)}`)
    await expect(page.getByRole('listitem').filter({ hasText: course.title }).locator('img')).toHaveAttribute('src', url)
  })

  test('an admin creates an image module by uploading a file in the module editor', async ({ page, createCourse }) => {
    const course = await createCourse()
    await signIn(page, admin)
    await page.goto(`/admin/courses/${course.id}`)
    await page.getByRole('button', { name: '+ Ajouter un module' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nom', { exact: true }).fill('Illustration')
    await dialog.getByLabel('Type').selectOption('image')
    await dialog.locator('input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByText('Fichier envoyé')).toBeVisible()
    await expect(dialog.getByLabel('URL du média')).toHaveValue(/^\/uploads\//)
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(page.getByTestId('module-row-illustration')).toContainText('/uploads/')
  })
})

test.describe('lesson rendering (specs 057, 060, 084)', () => {
  test('Mermaid diagrams are drawn; the reading mode is remembered; quiz text cannot be copied', async ({
    page,
    createCourse,
    createUser,
    setModules,
  }) => {
    const course = await createCourse({ title: `Rendu ${uid()}` })
    await setModules(course.id, [
      {
        slug: 'schema',
        name: 'Schéma',
        type: 'text',
        content: { kind: 'inline', body: '# Schéma\n\n```mermaid\ngraph TD\n  A[Client] --> B[Serveur]\n```\n\n## Suite\n\nTexte.' },
      },
      {
        slug: 'q',
        name: 'Quiz',
        type: 'quiz',
        inline: true,
        content: { kind: 'inline', body: 'questions:\n  - id: a\n    type: boolean\n    question: "Question secrète ?"\n    correctAnswer: true\n' },
      },
    ])
    await signIn(page, await createUser())
    await page.request.post(`/api/enrollments/${course.slug}`)
    await page.goto(`/courses/${course.slug}/lessons/schema`)
    await expect(page.locator('pre.mermaid svg')).toBeVisible()
    await expect(page.locator('pre.mermaid')).toContainText('Client')

    // Reading mode.
    const modulesNav = page.getByRole('complementary', { name: 'Modules' })
    await expect(modulesNav).toBeVisible()
    await page.getByRole('button', { name: 'Lecture focus' }).click()
    await expect(modulesNav).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Mode docs' })).toBeVisible()
    await expect(modulesNav).toHaveCount(0)
    await page.getByRole('button', { name: 'Mode docs' }).click()
    await expect(modulesNav).toBeVisible()

    // Anti-copy on quizzes.
    const prevented = await page.getByTestId('inline-quiz').evaluate((el) => {
      const event = new Event('copy', { bubbles: true, cancelable: true })
      el.querySelector('li')!.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(prevented).toBe(true)
  })
})

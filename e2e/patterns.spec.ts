import { ADMIN_PASSWORD } from './env.ts'
import { expect, randomIp, signIn, test, uid } from './fixtures.ts'

test.describe('markdown patterns (specs 061, 180, 181)', () => {
  test('an admin creates a pattern with a live preview; lessons render it with its CSS', async ({
    page,
    browser,
    createCourse,
    createUser,
    setModules,
  }) => {
    const name = `blink-${uid()}`
    await signIn(page, { email: 'admin', password: ADMIN_PASSWORD })
    await page.goto('/admin/patterns')
    await page.getByRole('button', { name: '+ Nouveau pattern' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nom').fill(name)
    await dialog.getByLabel('Label').fill('Clignotant')
    await dialog.getByLabel('HTML').fill(`<span class="md-pat-${name}">{{content}}</span>`)
    await dialog.getByLabel('CSS').fill(`.md-pat-${name} { font-weight: 900; }`)
    await dialog.getByLabel('Markdown personnalisé').fill(`Voici |||${name} du **texte**|||.`)
    await expect(dialog.getByTestId('pattern-preview').locator(`span.md-pat-${name} strong`)).toHaveText('texte')
    await dialog.getByRole('button', { name: 'Créer le pattern' }).click()
    await expect(page.getByText('Pattern créé')).toBeVisible()
    await expect(page.getByTestId(`pattern-${name}`)).toContainText('Clignotant')

    const course = await createCourse()
    await setModules(course.id, [
      {
        slug: 'a',
        name: 'A',
        type: 'text',
        content: {
          kind: 'inline',
          body: [
            `En ligne : |||${name} attention|||.`,
            '',
            `|||${name}`,
            'Un **bloc** entier.',
            '|||',
            '',
            '|||inconnu rien|||',
            '',
            '```',
            `|||${name} dans le code|||`,
            '```',
          ].join('\n'),
        },
      },
    ])
    const learner = await browser.newPage({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } })
    await signIn(learner, await createUser())
    await learner.request.post(`/api/enrollments/${course.slug}`)
    await learner.goto(`/courses/${course.slug}/lessons/a`)
    const content = learner.getByTestId('lesson-content')
    await expect(content.locator(`span.md-pat-${name}`)).toHaveCount(2)
    await expect(content.locator(`span.md-pat-${name}`).first()).toHaveText('attention')
    await expect(content.locator(`span.md-pat-${name} strong`)).toHaveText('bloc')
    await expect(content).toContainText('|||inconnu rien|||')
    await expect(content.locator('pre')).toContainText(`|||${name} dans le code|||`)
    await expect(content.locator(`span.md-pat-${name}`).first()).toHaveCSS('font-weight', '900')
    await learner.close()
  })

  test('a course pattern overrides the global one; names are unique per scope; config patterns are seeded', async ({
    page,
    adminRequest,
    createCourse,
    createUser,
    setModules,
  }) => {
    const name = `tag-${uid()}`
    const global = await adminRequest.post('/api/admin/patterns', { data: { name, label: 'G', html: '<b class="global">{{content}}</b>' } })
    expect(global.status()).toBe(201)
    expect((await adminRequest.post('/api/admin/patterns', { data: { name, label: 'G2', html: 'x' } })).status()).toBe(409)
    const course = await createCourse()
    const scoped = await adminRequest.post('/api/admin/patterns', {
      data: { name, label: 'C', html: '<i class="scoped">{{content}}</i>', courseId: course.id },
    })
    expect(scoped.status()).toBe(201)
    await setModules(course.id, [{ slug: 'a', name: 'A', type: 'text', content: { kind: 'inline', body: `|||${name} x|||` } }])
    await signIn(page, await createUser())
    await page.request.post(`/api/enrollments/${course.slug}`)
    const lesson = (await (await page.request.get(`/api/courses/${course.slug}/modules/a`)).json()).lesson
    expect(lesson.html).toContain('<i class="scoped">x</i>')

    const { patterns } = await (await adminRequest.get('/api/admin/patterns')).json()
    expect(patterns.find((p: { name: string }) => p.name === 'e2e-callout')).toMatchObject({ origin: 'config', label: 'Encadré' })
  })
})

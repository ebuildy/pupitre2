import type { ModuleInput } from '@pupitre/shared'
import { ADMIN_PASSWORD } from './env.ts'
import { expect, signIn, test, uid } from './fixtures.ts'

const admin = { email: 'admin', password: ADMIN_PASSWORD }

const lesson = (slug: string, name = `Leçon ${slug}`): ModuleInput => ({
  slug,
  name,
  type: 'text',
  content: { kind: 'inline', body: `# ${name}\n\nTexte.` },
})

test.describe('module editor (specs 171, 172)', () => {
  test('an admin adds, edits, reorders and deletes modules', async ({ page, adminRequest, createCourse }) => {
    const course = await createCourse()
    await signIn(page, admin)
    await page.goto(`/admin/courses/${course.id}`)

    const add = async (name: string, body: string, type?: 'quiz') => {
      await page.getByRole('button', { name: '+ Ajouter un module' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Nom', { exact: true }).fill(name)
      if (type) await dialog.getByLabel('Type').selectOption(type)
      await dialog.getByLabel(type ? 'Quiz (YAML)' : 'Contenu (markdown)').fill(body)
      await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
      await expect(page.getByText('Module ajouté').first()).toBeVisible()
      await expect(dialog).toBeHidden()
    }
    await add('Première leçon', '# Bonjour\n\nTexte.')
    await add('Le quiz', 'questions:\n  - id: a\n    type: boolean\n    question: "Vrai ?"\n    correctAnswer: true\n', 'quiz')
    await add('Deuxième leçon', 'Encore.')

    const list = page.getByRole('list', { name: /Modules/ })
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await page.getByRole('button', { name: 'Monter Deuxième leçon' }).click()
    await expect(page.getByText('Ordre des modules mis à jour')).toBeVisible()
    const slugs = async () =>
      ((await (await adminRequest.get(`/api/admin/courses/${course.id}/modules`)).json()).modules as { slug: string }[]).map((m) => m.slug)
    await expect.poll(slugs).toEqual(['premiere-lecon', 'deuxieme-lecon', 'le-quiz'])

    await page.getByRole('button', { name: 'Modifier Le quiz' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Masqué').check()
    await dialog.getByLabel('Compétences').fill('linux, Shell scripting')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Module mis à jour')).toBeVisible()
    await expect(page.getByTestId('module-row-le-quiz')).toContainText('masqué')
    const quiz = ((await (await adminRequest.get(`/api/admin/courses/${course.id}/modules`)).json()).modules as { slug: string; hidden: boolean; skills: string[] }[]).find((m) => m.slug === 'le-quiz')!
    expect(quiz.hidden).toBe(true)
    expect(quiz.skills).toEqual(['linux', 'shell-scripting'])

    // An invalid quiz is refused with the API's message.
    await page.getByRole('button', { name: 'Modifier Le quiz' }).click()
    await dialog.getByLabel('Quiz (YAML)').fill('questions: []')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await dialog.getByRole('button', { name: 'Annuler' }).click()

    await page.getByRole('button', { name: 'Supprimer Première leçon' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(page.getByText('Module « Première leçon » supprimé')).toBeVisible()
    await expect.poll(slugs).toEqual(['deuxieme-lecon', 'le-quiz'])
  })
})

test.describe('course definition (specs 169, 170)', () => {
  test('the definition round-trips and can replace the whole course', async ({ page, adminRequest, createCourse, createCategory, setModules }) => {
    const category = await createCategory()
    const required = await createCourse()
    const course = await createCourse({ categoryId: category.id, badge: { name: 'B', icon: '🎈' } })
    await setModules(course.id, [lesson('a'), lesson('b')])
    const res = await adminRequest.get(`/api/admin/courses/${course.id}/definition`)
    const definition = await res.json()
    expect(definition.slug).toBe(course.slug)
    expect(definition.spec).toMatchObject({ category: category.slug, badge: { name: 'B', icon: '🎈' } })
    expect(definition.spec.modules.map((m: { slug: string }) => m.slug)).toEqual(['a', 'b'])

    const put = await adminRequest.put(`/api/admin/courses/${course.id}/definition`, {
      data: {
        spec: {
          ...definition.spec,
          title: 'Nouveau titre',
          prerequisites: [{ course: required.slug }],
          modules: [definition.spec.modules[1]],
        },
      },
    })
    expect(put.ok()).toBeTruthy()
    const after = await put.json()
    expect(after.spec.title).toBe('Nouveau titre')
    expect(after.spec.prerequisites).toEqual([{ course: required.slug, minScore: null, modules: [] }])
    expect(after.spec.modules.map((m: { slug: string }) => m.slug)).toEqual(['b'])

    const invalid = await adminRequest.put(`/api/admin/courses/${course.id}/definition`, { data: { spec: { title: '' } } })
    expect(invalid.status()).toBe(400)

    await signIn(page, admin)
    await page.goto(`/admin/courses/${course.id}`)
    await page.getByRole('button', { name: '⎈ Définition' }).click()
    await expect(page.getByTestId('definition-json')).toContainText(`"slug": "${course.slug}"`)
  })
})

test.describe('markdown import and export (specs 173–176)', () => {
  const doc = (title: string) => `---
title: ${title}
difficulty: beginner
split: h2
---

# ${title}

## Qu'est-ce que Linux ?

Linux est un **noyau**.

\`\`\`bash
## pas un titre
ls
\`\`\`

## Quiz final

<!--pupitre
type: quiz
skills: [linux]
questions:
  - {id: q1, type: boolean, question: "Linux est un noyau ?", correctAnswer: true}
-->
`

  test('an admin previews then imports a course from the markdown dialog', async ({ page }) => {
    const token = uid()
    await signIn(page, admin)
    await page.goto('/admin/courses')
    await page.getByRole('button', { name: 'Importer du markdown' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Slug').fill(`import-${token}`)
    await dialog.getByLabel('Document').fill(doc(`Linux ${token}`))
    await dialog.getByRole('button', { name: 'Prévisualiser' }).click()
    const preview = dialog.getByTestId('import-preview')
    await expect(preview).toContainText(`Aperçu — import-${token}`)
    await expect(preview.getByRole('listitem')).toHaveCount(2)
    await expect(preview).toContainText("Qu'est-ce que Linux ?")
    await dialog.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.getByText('Import terminé : 2 modules')).toBeVisible()
    await expect(page.getByTestId('module-row-quiz-final')).toContainText('quiz')
  })

  test('import modes, errors, and a lossless export', async ({ adminRequest }) => {
    const token = uid()
    const slug = `md-${token}`
    const create = await adminRequest.post('/api/admin/courses/import', { data: { markdown: doc(`Cours ${token}`), slug } })
    expect(create.status()).toBe(201)
    const created = await create.json()
    expect(created).toMatchObject({ slug, mode: 'create', moduleCount: 2, warnings: [] })
    expect((await adminRequest.post('/api/admin/courses/import', { data: { markdown: doc('x'), slug } })).status()).toBe(409)

    const append = await adminRequest.post('/api/admin/courses/import', {
      data: { markdown: '## Annexe\n\nPlus.', slug, mode: 'append', split: 'h2' },
    })
    expect((await append.json()).moduleCount).toBe(3)
    const replace = await adminRequest.post('/api/admin/courses/import', {
      data: { markdown: 'Un seul module.', slug, mode: 'replace' },
    })
    expect((await replace.json()).moduleCount).toBe(1)
    expect((await adminRequest.post('/api/admin/courses/import', { data: { markdown: 'x', slug: `nope-${token}`, mode: 'replace' } })).status()).toBe(404)
    const unclosed = await adminRequest.post('/api/admin/courses/import', { data: { markdown: '---\ntitle: x\n', slug: `u-${token}` } })
    expect(unclosed.status()).toBe(400)
    expect((await unclosed.json()).error).toBe('frontmatter opened with --- is never closed')
    const preview = await adminRequest.post('/api/admin/courses/import/preview', { data: { markdown: doc('p'), slug: `p-${token}` } })
    expect((await preview.json()).modules).toHaveLength(2)
    expect((await adminRequest.get(`/api/courses/p-${token}`)).status()).toBe(404)

    // Export → import gives the same modules.
    const source = (await (await adminRequest.post('/api/admin/courses/import', { data: { markdown: doc(`Export ${token}`), slug: `src-${token}` } })).json()).id
    const exported = await adminRequest.get(`/api/admin/courses/${source}/export/markdown`)
    expect(exported.headers()['content-type']).toContain('text/markdown')
    expect(exported.headers()['content-disposition']).toContain(`src-${token}.md`)
    const markdown = await exported.text()
    const copy = (await (await adminRequest.post('/api/admin/courses/import', { data: { markdown, slug: `copy-${token}` } })).json()).id
    const modules = async (id: string) =>
      ((await (await adminRequest.get(`/api/admin/courses/${id}/modules`)).json()).modules as Record<string, unknown>[]).map(({ id: _, ...m }) => m)
    expect(await modules(copy)).toEqual(await modules(source))
  })
})

test.describe('course prerequisites (spec 050)', () => {
  test('content stays locked until the required module is done', async ({ page, adminRequest, createCourse, createUser, setModules }) => {
    const first = await createCourse({ title: `Prérequis ${uid()}` })
    await setModules(first.id, [lesson('a'), lesson('b')])
    const second = await createCourse()
    await setModules(second.id, [lesson('x')])
    const patch = await adminRequest.patch(`/api/admin/courses/${second.id}`, {
      data: { prerequisites: [{ courseId: first.id, modules: ['b'] }] },
    })
    expect((await patch.json()).prerequisites).toEqual([{ courseId: first.id, minScore: null, modules: ['b'] }])

    const user = await createUser()
    await signIn(page, user)
    await page.request.post(`/api/enrollments/${second.slug}`)
    await page.goto(`/courses/${second.slug}`)
    const box = page.getByTestId('prerequisites')
    await expect(box).toContainText('Prérequis non satisfaits')
    await expect(box).toContainText(first.title)
    await expect(box).toContainText('modules : Leçon b')
    const locked = await page.request.get(`/api/courses/${second.slug}/modules/x`)
    expect(locked.status()).toBe(403)
    expect((await locked.json()).error).toBe('Complete prerequisite courses first')

    await page.request.post(`/api/enrollments/${first.slug}`)
    await page.request.post(`/api/courses/${first.slug}/modules/a/complete`)
    await page.request.post(`/api/courses/${first.slug}/modules/b/complete`)
    await page.reload()
    await expect(page.getByTestId('prerequisites')).not.toContainText('non satisfaits')
    await expect(page.getByTestId('module-x')).toBeVisible()
  })
})

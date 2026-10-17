import type { ModuleInput } from '@pupitre/shared'
import { expect, signIn, test } from './fixtures.ts'

const lesson = (slug: string, name: string, body: string, extra: Partial<ModuleInput> = {}): ModuleInput => ({
  slug,
  name,
  type: 'text',
  content: { kind: 'inline', body },
  ...extra,
})

const quiz = (slug: string, name: string, yaml: string, extra: Partial<ModuleInput> = {}): ModuleInput => ({
  slug,
  name,
  type: 'quiz',
  content: { kind: 'inline', body: yaml },
  ...extra,
})

/** One question of each type (spec 076). */
const FULL_QUIZ = `
title: Quiz complet
passingScore: 100
questions:
  - id: single
    type: single
    question: Quelle commande liste les conteneurs ?
    answers:
      - { id: ps, text: "\`docker ps\`", correct: true }
      - { id: ls, text: "\`docker ls\`" }
    feedback:
      wrong: "Il faut utiliser docker ps."
  - id: multiple
    type: multiple
    question: Lesquels sont des runtimes de conteneurs ?
    answers:
      - { id: containerd, text: containerd, correct: true }
      - { id: crio, text: CRI-O, correct: true }
      - { id: nginx, text: nginx }
  - id: boolean
    type: boolean
    question: Un conteneur partage le noyau de l'hôte.
    correctAnswer: true
  - id: order
    type: order
    question: Dans l'ordre
    items:
      - { id: b, text: Deuxième }
      - { id: a, text: Premier }
    correctOrder: [a, b]
`

test.describe('course content (specs 053, 056, 067)', () => {
  test('a learner follows the lessons in order, passes the quiz and completes the course', async ({
    page,
    createUser,
    createCourse,
    setModules,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse({ completionXp: 100 })
    await setModules(course.id, [
      lesson(
        'intro',
        'Introduction',
        '# Introduction\n\n## Première partie\n\nDu **texte**.\n\n:::tip Astuce\nUn conseil utile.\n:::\n\n## Seconde partie\n\n```bash\necho bonjour\n```\n',
      ),
      lesson('suite', 'La suite', '# La suite\n\nEncore du texte.'),
      quiz('quiz', 'Quiz final', FULL_QUIZ),
    ])
    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: user.id } })

    await signIn(page, user)
    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByTestId('course-progress')).toHaveText('0/3 complétés')
    await expect(page.getByTestId('module-suite')).toContainText('Verrouillé')
    await expect(page.getByTestId('module-quiz')).toContainText('Verrouillé')
    await expect(page.getByTestId('module-suite').getByRole('link')).toHaveCount(0)

    await page.getByRole('link', { name: 'Commencer le cours ▸' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}/lessons/intro$`))
    const content = page.getByTestId('lesson-content')
    await expect(content.getByRole('heading', { name: 'Première partie' })).toBeVisible()
    await expect(content.getByText('💡 Astuce')).toBeVisible()
    await expect(content.locator('pre code')).toHaveText('echo bonjour\n')
    await expect(page.getByRole('complementary', { name: 'Sur cette page' }).getByRole('link')).toHaveText([
      'Première partie',
      'Seconde partie',
    ])

    await page.getByRole('button', { name: 'Suivant ▸' }).click()
    await expect(page).toHaveURL(/\/lessons\/suite$/)
    await page.getByRole('button', { name: 'Passer au quiz ▸' }).click()
    await expect(page).toHaveURL(/\/quiz\/quiz$/)
    await expect(page.getByText('4 questions')).toBeVisible()

    // Wrong answers first: failed, with the correction.
    await page.getByRole('radio', { name: 'docker ls' }).click()
    await page.getByRole('button', { name: 'Soumettre le quiz' }).click()
    const result = page.getByTestId('quiz-result')
    await expect(result.getByRole('heading', { name: '✗ Quiz échoué' })).toBeVisible()
    await expect(result).toContainText('Il faut utiliser docker ps.')
    await expect(result).toContainText('Bonne réponse : docker ps')

    // Then right: passed, course completed.
    await page.getByRole('button', { name: 'Recommencer' }).click()
    await page.getByRole('radio', { name: 'docker ps' }).click()
    await page.getByRole('checkbox', { name: 'containerd' }).click()
    await page.getByRole('checkbox', { name: 'CRI-O' }).click()
    await page.getByRole('radio', { name: 'Vrai' }).click()
    await page.getByRole('button', { name: 'Descendre' }).first().click()
    await page.getByRole('button', { name: 'Soumettre le quiz' }).click()
    await expect(result.getByRole('heading', { name: '✓ Quiz réussi !' })).toBeVisible()
    await expect(result).toContainText('Bravo, vous avez terminé ce cours !')

    await result.getByRole('link', { name: 'Retour au cours' }).click()
    await expect(page.getByText(/^✓ Cours terminé le/)).toBeVisible()
    await expect(page.getByTestId('course-progress')).toHaveText('3/3 complétés')
    await expect(page.getByTestId('module-quiz')).toContainText('✓ 4/4 pts')
    await expect(page.getByTestId('module-quiz')).toContainText('2 tentatives')

    // XP: 2 lessons × 10 + quiz 25 + course 100.
    await page.goto('/my-xp')
    await expect(page.getByTestId('xp-total')).toHaveText('145')
  })

  test('sources are read through the content loader; a missing file shows a placeholder', async ({
    page,
    createUser,
    createCourse,
    setModules,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse()
    const repo = 'https://git.example.com/pupitre/pupitre-linux.git'
    await setModules(course.id, [
      { slug: 'shell', name: 'Le shell', type: 'text', content: { kind: 'source', repo, ref: 'main', path: '01-shell.md' } },
      { slug: 'absent', name: 'Absent', type: 'text', content: { kind: 'source', repo, ref: 'main', path: 'nope.md' } },
    ])
    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: user.id } })

    await signIn(page, user)
    await page.goto(`/courses/${course.slug}/lessons/shell`)
    await expect(page.getByTestId('lesson-content').getByRole('heading', { name: 'Le shell', level: 1 })).toBeVisible()
    await expect(page.getByTestId('lesson-content').getByText('🚨 Prudence')).toBeVisible()
    await page.getByRole('button', { name: 'Suivant ▸' }).click()
    await expect(page.getByText('⚠️ Ce contenu n’est pas encore disponible.')).toBeVisible()
  })

  test('content is for enrolled learners; hidden modules are left out; prerequisites lock', async ({
    page,
    createUser,
    createCourse,
    setModules,
    adminRequest,
  }) => {
    const user = await createUser()
    // Private: a public course would enroll the learner on the first module opened (spec 048).
    const course = await createCourse({ visibility: 'private' })
    await setModules(course.id, [
      lesson('a', 'Module A', 'A'),
      lesson('secret', 'Secret', 'caché', { hidden: true }),
      lesson('b', 'Module B', 'B'),
      lesson('c', 'Module C', 'C', { prerequisites: ['b'] }),
    ])

    await signIn(page, user)
    expect((await page.request.get(`/api/courses/${course.slug}/modules`)).status()).toBe(404)

    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: user.id } })
    const list = await (await page.request.get(`/api/courses/${course.slug}/modules`)).json()
    expect(list.modules.map((m: { slug: string }) => m.slug)).toEqual(['a', 'b', 'c'])
    expect((await page.request.get(`/api/courses/${course.slug}/modules/secret`)).status()).toBe(404)
    expect((await page.request.get(`/api/courses/${course.slug}/modules/b`)).status()).toBe(403)

    // Done A then B: C (prerequisite B) opens.
    await page.request.post(`/api/courses/${course.slug}/modules/a/complete`)
    await page.request.post(`/api/courses/${course.slug}/modules/b/complete`)
    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByTestId('module-c').getByRole('link')).toBeVisible()
    await expect(page.getByTestId('course-progress')).toHaveText('2/3 complétés')
  })

  test('opening a module of a public course enrolls the learner (spec 048); the list alone does not', async ({
    page,
    createUser,
    createCourse,
    setModules,
  }) => {
    const course = await createCourse()
    await setModules(course.id, [lesson('a', 'Module A', 'A')])
    await signIn(page, await createUser())
    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByText('📭 Inscrivez-vous pour accéder aux modules.')).toBeVisible()
    expect((await page.request.get(`/api/courses/${course.slug}/modules`)).status()).toBe(403)
    expect((await page.request.get(`/api/courses/${course.slug}/modules/a`)).ok()).toBeTruthy()
    const detail = await (await page.request.get(`/api/courses/${course.slug}`)).json()
    expect(detail.enrolled).toBe(true)
  })
})

test.describe('inline quiz (spec 083)', () => {
  test('a mini-quiz at the bottom of the last lesson must be passed to finish the course', async ({
    page,
    createUser,
    createCourse,
    setModules,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse()
    await setModules(course.id, [
      lesson('lecon', 'Leçon', '# Leçon\n\nLe contenu.'),
      quiz('mini', 'Mini-quiz', 'questions:\n  - { id: q, type: boolean, question: "Vrai ?", correctAnswer: true }', { inline: true }),
    ])
    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: user.id } })

    await signIn(page, user)
    await page.goto(`/courses/${course.slug}`)
    await expect(page.getByTestId('module-lecon')).toContainText('🧩 Quiz à valider')
    await expect(page.getByTestId('module-mini')).toHaveCount(0)

    // The inline quiz URL leads to its lesson.
    await page.goto(`/courses/${course.slug}/quiz/mini`)
    await expect(page).toHaveURL(/\/lessons\/lecon$/)
    await expect(page.getByText('Validez le quiz ci-dessous pour terminer le cours.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Terminer la leçon ▸' })).toBeVisible()

    const mini = page.getByTestId('inline-quiz')
    await mini.getByRole('radio', { name: 'Vrai' }).click()
    await mini.getByRole('button', { name: 'Valider le quiz ▸' }).click()
    await expect(page.getByTestId('quiz-result')).toContainText('✓ Quiz réussi !')

    await page.getByRole('button', { name: 'Terminer le cours ▸' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}$`))
    await expect(page.getByText(/^✓ Cours terminé le/)).toBeVisible()
  })
})

test.describe('quiz attempts (specs 080, 081, 085)', () => {
  test('a wrong answer starts a cooldown; nothing is scored until it ends', async ({
    page,
    createUser,
    createCourse,
    setModules,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse()
    await setModules(course.id, [
      quiz(
        'quiz',
        'Quiz',
        'cooldown: { strategy: fixed, baseSeconds: 60 }\nquestions:\n  - { id: q, type: boolean, question: "Vrai ?", correctAnswer: true }',
      ),
    ])
    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: user.id } })

    await signIn(page, user)
    await page.goto(`/courses/${course.slug}/quiz/quiz`)
    await page.getByRole('radio', { name: 'Faux' }).click()
    await page.getByRole('button', { name: 'Soumettre le quiz' }).click()
    await expect(page.getByTestId('quiz-result')).toContainText('✗ Quiz échoué')
    await expect(page.getByRole('button', { name: 'Recommencer' })).toBeDisabled()

    const refused = await page.request.post(`/api/courses/${course.slug}/modules/quiz/submit`, {
      data: { answers: { q: { boolean: true } } },
    })
    expect(refused.status()).toBe(425)
    expect((await refused.json()).cooldowns.q).toMatchObject({ attempts: 1, locked: false })

    // The cooldown survives a reload.
    await page.reload()
    await expect(page.getByText(/^⏳ Réessayez dans \d+ s$/)).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Vrai' })).toBeDisabled()
  })

  test('reaching the maximum attempts locks a question until an admin resets it', async ({
    page,
    createUser,
    createCourse,
    setModules,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse()
    await setModules(course.id, [
      quiz(
        'quiz',
        'Quiz',
        'maxAttemptsPerQuestion: 1\nlockOnMaxAttempts: true\nquestions:\n  - { id: q, type: boolean, question: "Vrai ?", correctAnswer: true }',
      ),
    ])
    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: user.id } })

    await signIn(page, user)
    await page.request.post(`/api/courses/${course.slug}/modules/quiz/submit`, { data: { answers: { q: { boolean: false } } } })
    await page.goto(`/courses/${course.slug}/quiz/quiz`)
    await expect(page.getByText('🔒 Question verrouillée')).toBeVisible()

    // A locked question scores 0 whatever the answer.
    const locked = await (
      await page.request.post(`/api/courses/${course.slug}/modules/quiz/submit`, { data: { answers: { q: { boolean: true } } } })
    ).json()
    expect(locked).toMatchObject({ score: 0, passed: false })

    await adminRequest.delete(`/api/admin/users/${user.id}/quiz-attempts`)
    await page.reload()
    await expect(page.getByText('🔒 Question verrouillée')).toHaveCount(0)
    await page.getByRole('radio', { name: 'Vrai' }).click()
    await page.getByRole('button', { name: 'Soumettre le quiz' }).click()
    await expect(page.getByTestId('quiz-result')).toContainText('✓ Quiz réussi !')
  })

  test('learners never receive the correct answers before submitting', async ({
    page,
    createUser,
    createCourse,
    setModules,
    adminRequest,
  }) => {
    const user = await createUser()
    const course = await createCourse()
    await setModules(course.id, [quiz('quiz', 'Quiz', FULL_QUIZ)])
    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: user.id } })
    await signIn(page, user)

    const body = await (await page.request.get(`/api/courses/${course.slug}/modules/quiz`)).text()
    expect(body).not.toMatch(/"correct|correctAnswer|correctOrder|feedback|Il faut utiliser/)
  })
})

test.describe('admin module API', () => {
  test('rejects invalid quizzes and misplaced inline quizzes, and keeps progress across edits', async ({
    createCourse,
    adminRequest,
    setModules,
  }) => {
    const course = await createCourse()
    const put = (modules: ModuleInput[]) => adminRequest.put(`/api/admin/courses/${course.id}/modules`, { data: { modules } })

    const invalid = await put([quiz('q', 'Q', 'questions:\n  - { id: x, type: single, question: "?", answers: [{ id: a, text: A }, { id: b, text: B }] }')])
    expect(invalid.status()).toBe(400)
    expect((await invalid.json()).error).toContain('exactly one correct answer')

    const misplaced = await put([quiz('q', 'Q', FULL_QUIZ, { inline: true })])
    expect(misplaced.status()).toBe(400)

    await setModules(course.id, [lesson('a', 'A', 'a'), lesson('b', 'B', 'b')])
    const before = await (await adminRequest.get(`/api/admin/courses/${course.id}/modules`)).json()
    // Reordered and renamed: same ids.
    await setModules(course.id, [lesson('b', 'B renamed', 'b'), lesson('a', 'A', 'a')])
    const after = await (await adminRequest.get(`/api/admin/courses/${course.id}/modules`)).json()
    expect(after.modules.map((m: { slug: string }) => m.slug)).toEqual(['b', 'a'])
    expect(after.modules[0].id).toBe(before.modules[1].id)
  })
})

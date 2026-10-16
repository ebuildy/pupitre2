import {
  type CooldownError,
  type CourseModulesResponse,
  type ModuleCompleteResult,
  type ModuleDetail,
  type QuizResult,
  quizSubmitSchema,
  type Role,
} from '@pupitre/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ContentUnavailableError } from '../content/loader.ts'
import { renderMarkdown } from '../content/markdown.ts'
import { validate } from '../lib/validate.ts'
import { type AppEnv, requireAuth } from '../middleware/session.ts'
import { canView, findCourseBySlug, grantsFor } from '../services/courses.ts'
import {
  attemptStates,
  checkCourseCompletion,
  loadQuiz,
  markViewed,
  moduleBody,
  type ModuleState,
  moduleStates,
  quizView,
  submitQuiz,
  toSummary,
} from '../services/learning.ts'

/**
 * Course content is for enrolled learners (and admins). A course the user may not see is 404 (spec 046);
 * a visible course they are not enrolled in is 403.
 */
async function access(user: NonNullable<AppEnv['Variables']['user']>, slug: string | undefined) {
  const course = slug ? await findCourseBySlug(slug) : undefined
  if (!course) throw new HTTPException(404, { message: 'Course not found' })
  const isAdmin = user.role === 'admin'
  const enrolled = (await grantsFor(user.id, course.id)).length > 0
  if (!canView(course, user.role as Role, enrolled)) throw new HTTPException(404, { message: 'Course not found' })
  if (!isAdmin && !enrolled) throw new HTTPException(403, { message: 'Enroll in this course to access its content' })
  const states = await moduleStates(course.id, user.id, isAdmin)
  return { user, course, isAdmin, states }
}

function findModule(states: ModuleState[], slug: string) {
  const index = states.findIndex((s) => s.module.slug === slug)
  if (index < 0) throw new HTTPException(404, { message: 'Module not found' })
  const state = states[index]!
  if (state.locked) throw new HTTPException(403, { message: 'Module is locked' })
  return { state, index }
}

/** Specs 053, 056, 067, 075–083, under /api/courses/:slug/modules. */
export const moduleRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const { states } = await access(c.get('user')!, c.req.param('slug'))
    const counted = states.filter((s) => !s.module.hidden)
    return c.json<CourseModulesResponse>({
      modules: states.map(toSummary),
      progress: { done: counted.filter((s) => s.done).length, total: counted.length },
    })
  })
  .get('/:moduleSlug', async (c) => {
    const { user, states } = await access(c.get('user')!, c.req.param('slug'))
    const { state, index } = findModule(states, c.req.param('moduleSlug'))
    const m = state.module

    // Neighbours in the non-inline order; an inline quiz belongs to the lesson before it.
    const main = states.filter((s) => !s.module.inline)
    const mainIndex = main.indexOf(state)
    const before = states.slice(0, index).filter((s) => !s.module.inline).at(-1)
    const previous = m.inline ? before : main[mainIndex - 1]
    const nextState = m.inline ? main.find((s, i) => i > main.indexOf(before!)) : main[mainIndex + 1]

    let lesson: ModuleDetail['lesson'] = null
    let quiz: ModuleDetail['quiz'] = null
    if (m.type === 'quiz') {
      quiz = quizView(await loadQuiz(m), attemptStates(user.id, m.id))
    } else {
      try {
        lesson = { ...renderMarkdown(await moduleBody(m)), unavailable: false }
      } catch (err) {
        if (!(err instanceof ContentUnavailableError)) throw err
        lesson = { html: '', toc: [], unavailable: true }
      }
    }

    const following = states[index + 1]
    const inlineQuiz =
      !m.inline && following?.module.inline
        ? { module: toSummary(following), quiz: quizView(await loadQuiz(following.module), attemptStates(user.id, following.module.id)) }
        : null

    return c.json<ModuleDetail>({
      ...toSummary(state),
      lesson,
      quiz,
      inlineQuiz,
      hostSlug: m.inline ? (before?.module.slug ?? null) : null,
      previous: previous && !m.inline ? { slug: previous.module.slug, type: previous.module.type } : null,
      next: nextState
        ? { slug: nextState.module.slug, type: nextState.module.type, locked: nextState.locked && !state.done }
        : null,
    })
  })
  .post('/:moduleSlug/complete', async (c) => {
    const { user, course, states } = await access(c.get('user')!, c.req.param('slug'))
    const { state } = findModule(states, c.req.param('moduleSlug'))
    if (state.module.type === 'quiz') throw new HTTPException(400, { message: 'Quiz modules are completed by passing them' })
    markViewed(user.id, course, state.module)
    return c.json<ModuleCompleteResult>({ courseCompleted: await checkCourseCompletion(user.id, course) })
  })
  .post('/:moduleSlug/submit', validate('json', quizSubmitSchema), async (c) => {
    const { user, course, states } = await access(c.get('user')!, c.req.param('slug'))
    const { state } = findModule(states, c.req.param('moduleSlug'))
    const m = state.module
    if (m.type !== 'quiz') throw new HTTPException(400, { message: 'Module is not a quiz' })
    const doc = await loadQuiz(m)

    // Spec 080: nothing is scored while a question is cooling down.
    const view = quizView(doc, attemptStates(user.id, m.id))
    if (Object.values(view.cooldowns).some((cd) => cd.remainingSeconds > 0 && !cd.locked)) {
      return c.json<CooldownError>({ error: 'Cooldown active for some questions', cooldowns: view.cooldowns }, 425)
    }

    const result = submitQuiz(user.id, course, m, doc, c.req.valid('json').answers)
    const courseCompleted = result.passed ? await checkCourseCompletion(user.id, course) : false
    return c.json<QuizResult>({ ...result, courseCompleted })
  })

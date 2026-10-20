import {
  cooldownErrorSchema,
  courseModulesResponseSchema,
  type ModuleDetail,
  moduleCompleteResultSchema,
  moduleDetailSchema,
  type LabConfig,
  type LabStepCheckResponse,
  labStepCheckResponseSchema,
  labStepRecordSchema,
  POLICY_CHECK_TYPE,
  quizResultSchema,
  quizSubmitSchema,
  type Role,
} from '@pupitre/shared'
import { HTTPException } from 'hono/http-exception'
import { ContentUnavailableError } from '../content/loader.ts'
import { renderMarkdown } from '../content/markdown.ts'
import { $, createRoute, createRouter, errors, json, jsonBody, params } from '../lib/openapi.ts'
import { type AppEnv, requireAuth } from '../middleware/session.ts'
import { canSelfEnroll, canView, type Course, findCourseBySlug, grant, grantsFor } from '../services/courses.ts'
import { mediaUrlFor } from '../services/media.ts'
import { gitlabCheck, labView, markStepPlaceholders, placeSteps, recordCheck, resolvedStep } from '../services/labs.ts'
import { patternsFor } from '../services/patterns.ts'
import { effectiveLab, PolicyEngineError, policyCheck } from '../services/policy.ts'
import { prerequisiteViews } from '../services/prerequisites.ts'
import { totalXp } from '../services/xp.ts'
import {
  attemptStates,
  checkCourseCompletion,
  loadQuiz,
  markViewed,
  moduleBody,
  type Module,
  type ModuleState,
  moduleStates,
  quizView,
  submitQuiz,
  toSummary,
} from '../services/learning.ts'

/**
 * Course content is for enrolled learners (and admins). A course the user may not see is 404 (spec 046). Opening a
 * module of a public course the learner may join enrolls them (spec 048); otherwise 403. Unmet prerequisites (spec
 * 050) are 403 for non-admins.
 */
async function access(user: NonNullable<AppEnv['Variables']['user']>, slug: string | undefined, autoEnroll = true) {
  const course = slug ? await findCourseBySlug(slug) : undefined
  if (!course) throw new HTTPException(404, { message: 'Course not found' })
  const isAdmin = user.role === 'admin'
  let enrolled = (await grantsFor(user.id, course.id)).length > 0
  if (!canView(course, user.role as Role, enrolled)) throw new HTTPException(404, { message: 'Course not found' })
  if (autoEnroll && !isAdmin && !enrolled && canSelfEnroll(course) && (course.xpRequired === 0 || totalXp(user.id) >= course.xpRequired)) {
    await grant(user.id, course.id, 'auto', null)
    enrolled = true
  }
  if (!isAdmin && !enrolled) throw new HTTPException(403, { message: 'Enroll in this course to access its content' })
  if (!isAdmin && prerequisiteViews(user.id, course.id).some((p) => !p.met)) {
    throw new HTTPException(403, { message: 'Complete prerequisite courses first' })
  }
  const states = await moduleStates(course.id, user.id, isAdmin)
  return { user, course, isAdmin, states }
}

/** The learner's identity in lab parameters (`{{username}}`). */
function labUsername(user: { username?: string | null; email: string }) {
  return user.username ?? user.email.split('@')[0]!
}

async function labStep(m: Module, raw: string) {
  const config = await effectiveLab(m)
  if (!config) throw new HTTPException(400, { message: 'Module is not a lab' })
  const index = Number(raw)
  const step = Number.isInteger(index) ? config.steps[index] : undefined
  if (!step) throw new HTTPException(404, { message: 'Step not found' })
  return { config, step, index }
}

/** Records the result; once every step has passed, the lab is done (and maybe the course). */
async function recordStep(
  user: { id: string; email: string; username?: string | null },
  course: Course,
  m: Module,
  config: LabConfig,
  index: number,
  title: string,
  result: { allow: boolean; violations: string[] },
  verified: boolean,
): Promise<LabStepCheckResponse> {
  recordCheck({ userId: user.id, userEmail: user.email, moduleId: m.id, stepIndex: index, stepTitle: title, result, verified })
  const view = labView(config, m.id, user.id, labUsername(user))
  const completed = view.steps.every((s) => s.passed)
  let courseCompleted = false
  if (completed) {
    markViewed(user.id, course, m)
    courseCompleted = await checkCourseCompletion(user.id, course)
  }
  return { ...result, completed, courseCompleted }
}

function findModule(states: ModuleState[], slug: string) {
  const index = states.findIndex((s) => s.module.slug === slug)
  if (index < 0) throw new HTTPException(404, { message: 'Module not found' })
  const state = states[index]!
  if (state.locked) throw new HTTPException(403, { message: 'Module is locked' })
  return { state, index }
}

const tags = ['Course content']
const ACCESS = 'Content is for enrolled learners and admins: 403 when not enrolled or prerequisites are unmet.'

const listModules = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: "A course's modules",
  description: `With the learner's progress. Never enrolls. ${ACCESS}`,
  request: { params: params('slug') },
  responses: { 200: json(courseModulesResponseSchema), ...errors(401, 403, 404) },
})

const getModule = createRoute({
  method: 'get',
  path: '/{moduleSlug}',
  tags,
  summary: 'A module',
  description: `Lesson HTML, quiz (without answers), media or lab, and its neighbours. Opening a module of a public course the learner may join enrolls them (spec 048). ${ACCESS}`,
  request: { params: params('slug', 'moduleSlug') },
  responses: { 200: json(moduleDetailSchema), ...errors(401, 403, 404) },
})

const completeModule = createRoute({
  method: 'post',
  path: '/{moduleSlug}/complete',
  tags,
  summary: 'Mark a lesson as done',
  description: 'Quizzes are completed by passing them, labs with steps by validating their steps (400).',
  request: { params: params('slug', 'moduleSlug') },
  responses: { 200: json(moduleCompleteResultSchema), ...errors(400, 401, 403, 404) },
})

const checkLabStep = createRoute({
  method: 'post',
  path: '/{moduleSlug}/steps/{index}/check',
  tags,
  summary: 'Check a GitLab lab step',
  description: 'Spec 092: checked by the server against GitLab (or an OPA policy, spec 091); recorded as verified.',
  request: { params: params('slug', 'moduleSlug', 'index') },
  responses: { 200: json(labStepCheckResponseSchema), ...errors(400, 401, 403, 404, 502) },
})

const recordLabStep = createRoute({
  method: 'post',
  path: '/{moduleSlug}/steps/{index}/record',
  tags,
  summary: 'Record a local lab step',
  description: "Spec 093: the result of a check run by the desktop app on the learner's machine (not verified).",
  request: { params: params('slug', 'moduleSlug', 'index'), body: jsonBody(labStepRecordSchema) },
  responses: { 200: json(labStepCheckResponseSchema), ...errors(400, 401, 403, 404) },
})

const submitAnswers = createRoute({
  method: 'post',
  path: '/{moduleSlug}/submit',
  tags,
  summary: 'Submit quiz answers',
  description: 'Scored with the correct answers and feedback revealed. 425 while some questions are cooling down (spec 080).',
  request: { params: params('slug', 'moduleSlug'), body: jsonBody(quizSubmitSchema) },
  responses: {
    200: json(quizResultSchema),
    425: json(cooldownErrorSchema, 'Some questions are still cooling down'),
    ...errors(400, 401, 403, 404),
  },
})

/** Specs 053, 056, 067, 075–083, under /api/courses/:slug/modules. */
export const moduleRoutes = $(createRouter().use(requireAuth))
  .openapi(listModules, async (c) => {
    // The list never enrolls: the course page reads it, and must not re-enroll right after an unenrollment.
    const { states } = await access(c.get('user'), c.req.param('slug'), false)
    const counted = states.filter((s) => !s.module.hidden)
    return c.json({
      modules: states.map(toSummary),
      progress: { done: counted.filter((s) => s.done).length, total: counted.length },
    }, 200)
  })
  .openapi(getModule, async (c) => {
    const { user, course, states } = await access(c.get('user'), c.req.param('slug'))
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
    let media: ModuleDetail['media'] = null
    if (m.mediaUrl) {
      media = { url: await mediaUrlFor(m.mediaUrl, m.mediaReplicate) }
    } else if (m.type === 'quiz') {
      quiz = quizView(await loadQuiz(m), attemptStates(user.id, m.id))
    }
    const labConfig = await effectiveLab(m)
    if (!m.mediaUrl && m.type !== 'quiz') {
      try {
        const steps = labConfig?.steps.length ?? 0
        const rendered = renderMarkdown(steps ? markStepPlaceholders(await moduleBody(m)) : await moduleBody(m), patternsFor(course.id))
        lesson = { ...rendered, html: steps ? placeSteps(rendered.html, steps) : rendered.html, unavailable: false }
      } catch (err) {
        if (!(err instanceof ContentUnavailableError)) throw err
        lesson = { html: '', toc: [], unavailable: true, styles: '' }
      }
    }
    const lab = labConfig ? labView(labConfig, m.id, user.id, labUsername(user)) : null

    const following = states[index + 1]
    const inlineQuiz =
      !m.inline && following?.module.inline
        ? { module: toSummary(following), quiz: quizView(await loadQuiz(following.module), attemptStates(user.id, following.module.id)) }
        : null

    return c.json({
      ...toSummary(state),
      lesson,
      quiz,
      media,
      lab,
      inlineQuiz,
      hostSlug: m.inline ? (before?.module.slug ?? null) : null,
      previous: previous && !m.inline ? { slug: previous.module.slug, type: previous.module.type } : null,
      next: nextState
        ? { slug: nextState.module.slug, type: nextState.module.type, locked: nextState.locked && !state.done }
        : null,
    }, 200)
  })
  .openapi(completeModule, async (c) => {
    const { user, course, states } = await access(c.get('user'), c.req.param('slug'))
    const { state } = findModule(states, c.req.param('moduleSlug'))
    if (state.module.type === 'quiz') throw new HTTPException(400, { message: 'Quiz modules are completed by passing them' })
    // Spec 090: a lab with steps is completed by validating its steps.
    if (state.module.type === 'lab' && (await effectiveLab(state.module))?.steps.length) {
      throw new HTTPException(400, { message: 'Validate the lab steps to complete it' })
    }
    markViewed(user.id, course, state.module)
    return c.json({ courseCompleted: await checkCourseCompletion(user.id, course) }, 200)
  })
  // Spec 092: a GitLab step, checked by the server; recorded in the history (verified).
  .openapi(checkLabStep, async (c) => {
    const { user, course, states } = await access(c.get('user'), c.req.param('slug'))
    const { state } = findModule(states, c.req.param('moduleSlug'))
    const { config, step, index } = await labStep(state.module, c.req.param('index'))
    if (config.provider !== 'gitlab') throw new HTTPException(400, { message: 'Module does not have GitLab step checks' })
    const resolved = resolvedStep(step, labUsername(user))
    let result
    try {
      result =
        resolved.checkType === POLICY_CHECK_TYPE
          ? await policyCheck(state.module, resolved.checkParams)
          : await gitlabCheck(resolved.checkType, resolved.checkParams, labUsername(user))
    } catch (err) {
      // Spec 091: an engine or policy problem is the platform's, not the learner's; nothing is recorded.
      if (err instanceof PolicyEngineError || err instanceof ContentUnavailableError) {
        console.error('lab policy check failed', err)
        throw new HTTPException(502, { message: err instanceof PolicyEngineError ? err.message : 'Lab policy could not be read' })
      }
      console.error('lab check failed', err)
      throw new HTTPException(502, { message: 'GitLab could not be reached' })
    }
    return c.json(await recordStep(user, course, state.module, config, index, step.title, result, true), 200)
  })
  // Spec 093: a local step checked by the desktop app on the learner's machine (client-reported, not verified).
  .openapi(recordLabStep, async (c) => {
    const { user, course, states } = await access(c.get('user'), c.req.param('slug'))
    const { state } = findModule(states, c.req.param('moduleSlug'))
    const { config, step, index } = await labStep(state.module, c.req.param('index'))
    if (config.provider !== 'local') throw new HTTPException(400, { message: 'Module does not have local checks' })
    return c.json(await recordStep(user, course, state.module, config, index, step.title, c.req.valid('json'), false), 200)
  })
  .openapi(submitAnswers, async (c) => {
    const { user, course, states } = await access(c.get('user'), c.req.param('slug'))
    const { state } = findModule(states, c.req.param('moduleSlug'))
    const m = state.module
    if (m.type !== 'quiz') throw new HTTPException(400, { message: 'Module is not a quiz' })
    const doc = await loadQuiz(m)

    // Spec 080: nothing is scored while a question is cooling down.
    const view = quizView(doc, attemptStates(user.id, m.id))
    if (Object.values(view.cooldowns).some((cd) => cd.remainingSeconds > 0 && !cd.locked)) {
      return c.json({ error: 'Cooldown active for some questions', cooldowns: view.cooldowns }, 425)
    }

    const result = submitQuiz(user.id, course, m, doc, c.req.valid('json').answers)
    const courseCompleted = result.passed ? await checkCourseCompletion(user.id, course) : false
    return c.json({ ...result, courseCompleted }, 200)
  })

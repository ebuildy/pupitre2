import {
  type ModuleSummary,
  type QuestionCooldown,
  type QuestionResult,
  type QuizAnswer,
  type QuizDocument,
  type QuizQuestion,
  type QuizView,
  quizDocumentSchema,
  XP_AMOUNTS,
} from '@pupitre/shared'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { parse as parseYaml } from 'yaml'
import { contentLoader } from '../content/loader.ts'
import { renderFragment } from '../content/markdown.ts'
import { db } from '../db/index.ts'
import { courseModule, modulePrerequisite, moduleProgress, questionAttemptState, quizSubmission } from '../db/schema/index.ts'
import type { Course } from './courses.ts'
import { awardXp, completeCourse } from './xp.ts'

export type Module = typeof courseModule.$inferSelect
type Progress = typeof moduleProgress.$inferSelect
type AttemptState = typeof questionAttemptState.$inferSelect

// ─── Structure and state ──────────────────────────────────────────────────────

/** A course's modules in order, with their prerequisite ids. */
export async function loadModules(courseId: string) {
  const modules = await db
    .select()
    .from(courseModule)
    .where(eq(courseModule.courseId, courseId))
    .orderBy(asc(courseModule.position))
  const ids = modules.map((m) => m.id)
  const prereqRows = ids.length
    ? await db.select().from(modulePrerequisite).where(inArray(modulePrerequisite.moduleId, ids))
    : []
  const prerequisites = new Map<string, string[]>()
  for (const r of prereqRows) prerequisites.set(r.moduleId, [...(prerequisites.get(r.moduleId) ?? []), r.requiresModuleId])
  return { modules, prerequisites }
}

export type ModuleState = {
  module: Module
  progress: Progress | undefined
  done: boolean
  locked: boolean
}

/**
 * Specs 053–055, 083: the modules a user sees (hidden ones only for admins), each with its progress, `done` (quiz
 * passed / other viewed) and `locked`: prerequisites not done, or — for non-inline modules — the previous non-inline
 * module not done. Admins are never locked.
 */
export async function moduleStates(courseId: string, userId: string, isAdmin: boolean) {
  const { modules, prerequisites } = await loadModules(courseId)
  const visible = modules.filter((m) => isAdmin || !m.hidden)
  const progressRows = visible.length
    ? await db
        .select()
        .from(moduleProgress)
        .where(and(eq(moduleProgress.userId, userId), inArray(moduleProgress.moduleId, visible.map((m) => m.id))))
    : []
  const progress = new Map(progressRows.map((p) => [p.moduleId, p]))
  const isDone = (m: Module) => {
    const p = progress.get(m.id)
    return m.type === 'quiz' ? !!p?.passedAt : !!p?.viewedAt
  }
  const doneIds = new Set(visible.filter(isDone).map((m) => m.id))
  const visibleIds = new Set(visible.map((m) => m.id))

  let previousDone = true // the first module is always available
  const states: ModuleState[] = visible.map((m) => {
    const prereqsDone = (prerequisites.get(m.id) ?? []).every((id) => !visibleIds.has(id) || doneIds.has(id))
    const sequentialOk = m.inline || previousDone
    const state = { module: m, progress: progress.get(m.id), done: doneIds.has(m.id), locked: !isAdmin && !(prereqsDone && sequentialOk) }
    if (!m.inline) previousDone = state.done
    return state
  })
  return states
}

export function toSummary(s: ModuleState): ModuleSummary {
  const { module: m, progress: p } = s
  return {
    slug: m.slug,
    name: m.name,
    type: m.type,
    inline: m.inline,
    hidden: m.hidden,
    locked: s.locked,
    done: s.done,
    results:
      m.type === 'quiz'
        ? { bestScore: p?.bestScore ?? null, maxScore: p?.maxScore ?? null, attempts: p?.attempts ?? 0, passed: !!p?.passedAt }
        : null,
  }
}

/** Spec 068: every visible module done (inline quizzes included). A course without modules never completes. */
export function allDone(states: ModuleState[]) {
  const visible = states.filter((s) => !s.module.hidden)
  return visible.length > 0 && visible.every((s) => s.done)
}

// ─── Content ──────────────────────────────────────────────────────────────────

/** The module's raw body: text written in the platform, or the file read through the ContentLoader. */
export async function moduleBody(m: Module): Promise<string> {
  if (m.sourceRepo && m.sourcePath) {
    return contentLoader.read({ repo: m.sourceRepo, ref: m.sourceRef ?? 'main', path: m.sourcePath })
  }
  return m.body ?? ''
}

export class InvalidQuizError extends Error {}

/** Parses and validates a quiz document (YAML). */
export function parseQuiz(source: string): QuizDocument {
  let raw: unknown
  try {
    raw = parseYaml(source)
  } catch (err) {
    throw new InvalidQuizError(`Invalid quiz YAML: ${(err as Error).message}`)
  }
  const result = quizDocumentSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]!
    throw new InvalidQuizError(`Invalid quiz: ${issue.path.join('.')}: ${issue.message}`)
  }
  return result.data
}

export async function loadQuiz(m: Module): Promise<QuizDocument> {
  try {
    return parseQuiz(await moduleBody(m))
  } catch (err) {
    if (err instanceof InvalidQuizError) throw new HTTPException(500, { message: err.message })
    throw new HTTPException(502, { message: 'Failed to fetch quiz content' })
  }
}

function maxScoreOf(doc: QuizDocument) {
  return doc.questions.reduce((sum, q) => sum + q.points, 0)
}

/** Spec 085: questions without correct answers or feedback; markdown rendered to sanitized HTML. */
export function quizView(doc: QuizDocument, states: AttemptState[], now = new Date()): QuizView {
  return {
    title: doc.title ?? null,
    passingScore: doc.passingScore,
    maxScore: maxScoreOf(doc),
    questions: doc.questions.map((q) => ({
      key: q.id,
      type: q.type,
      prompt: renderFragment(q.question),
      points: q.points,
      ...(q.type === 'single' || q.type === 'multiple'
        ? { answers: q.answers.map((a) => ({ id: a.id, html: renderFragment(a.text, { inline: true }) })) }
        : {}),
      ...(q.type === 'order' ? { items: q.items.map((it) => ({ id: it.id, html: renderFragment(it.text, { inline: true }) })) } : {}),
    })),
    cooldowns: cooldownsOf(states, now),
  }
}

// ─── Attempts and cooldowns (specs 080, 081) ──────────────────────────────────

export function attemptStates(userId: string, moduleId: string) {
  return db
    .select()
    .from(questionAttemptState)
    .where(and(eq(questionAttemptState.userId, userId), eq(questionAttemptState.moduleId, moduleId)))
    .all()
}

export function cooldownsOf(states: AttemptState[], now = new Date()): Record<string, QuestionCooldown> {
  return Object.fromEntries(
    states
      .filter((s) => s.failedAttempts > 0 || s.locked)
      .map((s) => [
        s.questionKey,
        {
          remainingSeconds: s.cooldownUntil ? Math.max(0, Math.ceil((s.cooldownUntil.getTime() - now.getTime()) / 1000)) : 0,
          attempts: s.failedAttempts,
          locked: s.locked,
        },
      ]),
  )
}

/** Seconds to wait after the `attempts`-th failure. */
export function cooldownSeconds(cooldown: QuizDocument['cooldown'], attempts: number) {
  const { strategy, baseSeconds, multiplier, maxSeconds } = cooldown
  if (baseSeconds <= 0 || attempts <= 0) return 0
  const raw =
    strategy === 'fixed' ? baseSeconds : strategy === 'linear' ? baseSeconds * attempts : baseSeconds * multiplier ** (attempts - 1)
  return Math.max(0, maxSeconds > 0 ? Math.min(raw, maxSeconds) : raw)
}

// ─── Scoring (spec 077) ───────────────────────────────────────────────────────

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')
}

export function scoreQuestion(q: QuizQuestion, answer: QuizAnswer | undefined): { points: number; correctAnswer: QuestionResult['correctAnswer'] } {
  switch (q.type) {
    case 'single': {
      const correct = q.answers.find((a) => a.correct)!.id
      return { points: answer && 'single' in answer && answer.single === correct ? q.points : 0, correctAnswer: correct }
    }
    case 'multiple': {
      const correct = q.answers.filter((a) => a.correct).map((a) => a.id)
      const chosen = answer && 'multiple' in answer ? [...new Set(answer.multiple)] : []
      if (sameSet(chosen, correct)) return { points: q.points, correctAnswer: correct }
      if (!q.partialScoring.enabled || chosen.length === 0) return { points: 0, correctAnswer: correct }
      const right = chosen.filter((id) => correct.includes(id)).length
      const wrong = chosen.length - right
      const partial = Math.round((q.points * (right - wrong)) / correct.length)
      return { points: q.partialScoring.allowNegative ? partial : Math.max(0, partial), correctAnswer: correct }
    }
    case 'boolean':
      return {
        points: answer && 'boolean' in answer && answer.boolean === q.correctAnswer ? q.points : 0,
        correctAnswer: q.correctAnswer,
      }
    case 'order':
      return {
        points: answer && 'order' in answer && answer.order.join('\u0000') === q.correctOrder.join('\u0000') ? q.points : 0,
        correctAnswer: q.correctOrder,
      }
  }
}

/**
 * Scores a submission and records it, in one transaction: attempt states (a correct answer clears its state; a wrong
 * one counts a failure, sets the cooldown and may lock the question), progress (attempts, best score, first pass),
 * the submission itself, and the quiz XP on the first pass. Locked questions score 0 and stay in the maximum.
 */
export function submitQuiz(userId: string, course: Course, m: Module, doc: QuizDocument, answers: Record<string, QuizAnswer>) {
  const now = new Date()
  return db.transaction((tx) => {
    const states = new Map(attemptStates(userId, m.id).map((s) => [s.questionKey, s]))

    const results: QuestionResult[] = doc.questions.map((q) => {
      const locked = !!states.get(q.id)?.locked
      const { points, correctAnswer } = scoreQuestion(q, locked ? undefined : answers[q.id])
      const correct = points === q.points
      const feedback = correct ? q.feedback.correct : q.feedback.wrong
      return {
        key: q.id,
        correct,
        pointsEarned: points,
        pointsMax: q.points,
        correctAnswer,
        feedback: feedback ? renderFragment(feedback) : null,
        locked,
      }
    })

    for (const r of results) {
      if (r.locked) continue
      if (r.correct) {
        tx.delete(questionAttemptState)
          .where(
            and(
              eq(questionAttemptState.userId, userId),
              eq(questionAttemptState.moduleId, m.id),
              eq(questionAttemptState.questionKey, r.key),
            ),
          )
          .run()
        continue
      }
      const failedAttempts = (states.get(r.key)?.failedAttempts ?? 0) + 1
      const wait = cooldownSeconds(doc.cooldown, failedAttempts)
      const values = {
        failedAttempts,
        cooldownUntil: wait > 0 ? new Date(now.getTime() + wait * 1000) : null,
        locked: !!doc.maxAttemptsPerQuestion && doc.lockOnMaxAttempts && failedAttempts >= doc.maxAttemptsPerQuestion,
      }
      tx.insert(questionAttemptState)
        .values({ userId, moduleId: m.id, questionKey: r.key, ...values })
        .onConflictDoUpdate({
          target: [questionAttemptState.userId, questionAttemptState.moduleId, questionAttemptState.questionKey],
          set: values,
        })
        .run()
    }

    const score = results.reduce((sum, r) => sum + r.pointsEarned, 0)
    const maxScore = maxScoreOf(doc)
    const passed = maxScore > 0 && (score / maxScore) * 100 >= doc.passingScore

    const previous = tx
      .select()
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, userId), eq(moduleProgress.moduleId, m.id)))
      .get()
    const firstPass = passed && !previous?.passedAt
    tx.insert(moduleProgress)
      .values({ userId, moduleId: m.id, attempts: 1, bestScore: score, maxScore, passedAt: passed ? now : null })
      .onConflictDoUpdate({
        target: [moduleProgress.userId, moduleProgress.moduleId],
        set: {
          attempts: sql`${moduleProgress.attempts} + 1`,
          bestScore: sql`max(coalesce(${moduleProgress.bestScore}, 0), ${score})`,
          maxScore,
          passedAt: firstPass ? now : sql`${moduleProgress.passedAt}`,
          lastActivityAt: now,
        },
      })
      .run()

    tx.insert(quizSubmission).values({ userId, moduleId: m.id, answers, score, maxScore, passed, results }).run()

    if (firstPass) {
      awardXp(
        {
          userId,
          source: 'quiz',
          sourceKey: m.id,
          amount: XP_AMOUNTS.quiz,
          label: `${course.title} — ${m.name}`,
          courseId: course.id,
        },
        tx,
      )
    }

    return { score, maxScore, passed, passingScore: doc.passingScore, questionResults: results, cooldowns: cooldownsOf(attemptStates(userId, m.id), now) }
  })
}

/** Spec 067: a lesson is done once viewed; the lesson XP is earned once (awardXp is idempotent). */
export function markViewed(userId: string, course: Course, m: Module) {
  const now = new Date()
  db.transaction((tx) => {
    tx.insert(moduleProgress)
      .values({ userId, moduleId: m.id, viewedAt: now })
      .onConflictDoUpdate({
        target: [moduleProgress.userId, moduleProgress.moduleId],
        set: { viewedAt: sql`coalesce(${moduleProgress.viewedAt}, ${now.getTime()})`, lastActivityAt: now },
      })
      .run()
    awardXp(
      {
        userId,
        source: 'lesson',
        sourceKey: m.id,
        amount: XP_AMOUNTS.lesson,
        label: `${course.title} — ${m.name}`,
        courseId: course.id,
      },
      tx,
    )
  })
}

/** Spec 068: completes the course when every visible module is done. Returns whether this call completed it. */
export async function checkCourseCompletion(userId: string, course: Course) {
  const states = await moduleStates(course.id, userId, false)
  if (!allDone(states)) return false
  return completeCourse(userId, course, null)
}

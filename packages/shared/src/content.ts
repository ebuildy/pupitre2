import { z } from 'zod'
import { type SkillRef, skillSlugSchema } from './gamification.ts'

// ─── Modules (spec 191 "Module") ──────────────────────────────────────────────

/** All module types of the model; labs come with their feature. */
export const MODULE_TYPES = ['text', 'video', 'image', 'quiz', 'lab'] as const
export type ModuleType = (typeof MODULE_TYPES)[number]
export const SUPPORTED_MODULE_TYPES = ['text', 'quiz', 'video', 'image'] as const
export const MEDIA_MODULE_TYPES = ['video', 'image'] as const

/** A media URL: uploaded (`/uploads/<file>`) or remote (`http(s)://`). */
export const mediaUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v) || /^\/uploads\/[\w.-]+$/.test(v), 'Media URL must be http(s):// or /uploads/<file>')

/** Module slugs: letters (any script), digits, `-` and `_` (spec 185). Unique within a course. */
export const MODULE_SLUG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u

/**
 * Exactly one content source (spec 191): text written in the platform, a file in a repository, or a media URL (video
 * and image modules; `replicate` copies a remote file locally, spec 063).
 */
export const moduleContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inline'), body: z.string() }),
  z.object({ kind: z.literal('media'), url: mediaUrlSchema, replicate: z.boolean().default(false) }),
  z.object({
    kind: z.literal('source'),
    repo: z.string().trim().min(1),
    ref: z.string().trim().min(1).default('main'),
    path: z.string().trim().min(1),
  }),
])
export type ModuleContent = z.infer<typeof moduleContentSchema>

export const moduleInputSchema = z.object({
  slug: z.string().trim().regex(MODULE_SLUG_PATTERN, 'Invalid module slug').max(100),
  name: z.string().trim().min(1, 'Name is required').max(200),
  type: z.enum(SUPPORTED_MODULE_TYPES),
  hidden: z.boolean().default(false),
  /** Quizzes only: shown at the bottom of the preceding lesson (spec 083). */
  inline: z.boolean().default(false),
  /** Slugs of modules of the same course that must be done first (spec 054). */
  prerequisites: z.array(z.string()).default([]),
  /** Spec 110: skills taught (kebab-case tags, created on the fly). */
  skills: z.array(skillSlugSchema).max(20).default([]),
  /** A quiz's content is a quiz document (YAML, `quizDocumentSchema`); a text module's is markdown. */
  content: moduleContentSchema,
})
export type ModuleInput = z.input<typeof moduleInputSchema>

/** Replaces a course's module list, in order (admin API). Modules are matched by slug, so progress is kept. */
export const courseModulesSchema = z
  .object({ modules: z.array(moduleInputSchema).max(500) })
  .superRefine(({ modules }, ctx) => {
    const slugs = new Set<string>()
    modules.forEach((m, i) => {
      if (slugs.has(m.slug)) ctx.addIssue({ code: 'custom', path: ['modules', i, 'slug'], message: `Duplicate module slug "${m.slug}"` })
      slugs.add(m.slug)
      if (m.inline && m.type !== 'quiz') {
        ctx.addIssue({ code: 'custom', path: ['modules', i, 'inline'], message: 'Only quizzes can be inline' })
      }
      const media = (MEDIA_MODULE_TYPES as readonly string[]).includes(m.type)
      if (media !== (m.content.kind === 'media')) {
        ctx.addIssue({
          code: 'custom',
          path: ['modules', i, 'content'],
          message: media ? 'Video and image modules need a media URL' : 'Only video and image modules have a media URL',
        })
      }
      if (m.inline && (i === 0 || modules[i - 1]!.inline || modules[i - 1]!.type === 'quiz')) {
        ctx.addIssue({ code: 'custom', path: ['modules', i, 'inline'], message: 'An inline quiz must follow a lesson' })
      }
    })
    modules.forEach((m, i) => {
      for (const p of m.prerequisites) {
        if (p === m.slug || !slugs.has(p)) {
          ctx.addIssue({ code: 'custom', path: ['modules', i, 'prerequisites'], message: `Unknown prerequisite "${p}"` })
        }
      }
    })
  })
export type CourseModulesInput = z.input<typeof courseModulesSchema>

// ─── Quiz documents (specs 075–077, 080, 081) ─────────────────────────────────

const answerSchema = z.object({ id: z.string().min(1), text: z.string(), correct: z.boolean().default(false) })
const itemSchema = z.object({ id: z.string().min(1), text: z.string() })

const questionBase = {
  /** The author's key, unique within the quiz: it identifies the question (attempts, cooldowns). */
  id: z.string().min(1),
  /** Markdown. */
  question: z.string().min(1),
  points: z.number().int().min(1).default(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  feedback: z.object({ correct: z.string().optional(), wrong: z.string().optional() }).default({}),
}

export const quizQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    ...questionBase,
    type: z.literal('single'),
    answers: z.array(answerSchema).min(2),
  }),
  z.object({
    ...questionBase,
    type: z.literal('multiple'),
    answers: z.array(answerSchema).min(2),
    partialScoring: z.object({ enabled: z.boolean().default(false), allowNegative: z.boolean().default(false) }).default({
      enabled: false,
      allowNegative: false,
    }),
  }),
  z.object({ ...questionBase, type: z.literal('boolean'), correctAnswer: z.boolean() }),
  z.object({
    ...questionBase,
    type: z.literal('order'),
    items: z.array(itemSchema).min(2),
    correctOrder: z.array(z.string()).min(2),
  }),
])
export type QuizQuestion = z.output<typeof quizQuestionSchema>

export const COOLDOWN_STRATEGIES = ['fixed', 'linear', 'exponential'] as const

/** A quiz module's content (legacy YAML format, spec 075). */
export const quizDocumentSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    /** Percent needed to pass. */
    passingScore: z.number().min(0).max(100).default(80),
    /** Wait before retrying a wrong question (spec 080). `baseSeconds: 0` = no cooldown. */
    cooldown: z
      .object({
        strategy: z.enum(COOLDOWN_STRATEGIES).default('exponential'),
        baseSeconds: z.number().min(0).default(0),
        multiplier: z.number().min(1).default(2),
        maxSeconds: z.number().min(0).default(0),
      })
      .default({ strategy: 'exponential', baseSeconds: 0, multiplier: 2, maxSeconds: 0 }),
    /** Spec 081. */
    maxAttemptsPerQuestion: z.number().int().min(1).optional(),
    lockOnMaxAttempts: z.boolean().default(false),
    questions: z.array(quizQuestionSchema).min(1),
  })
  .superRefine((doc, ctx) => {
    const keys = new Set<string>()
    doc.questions.forEach((q, i) => {
      const at = (message: string) => ctx.addIssue({ code: 'custom', path: ['questions', i], message })
      if (keys.has(q.id)) at(`Duplicate question id "${q.id}"`)
      keys.add(q.id)
      if (q.type === 'single' && q.answers.filter((a) => a.correct).length !== 1) at(`"${q.id}": exactly one correct answer`)
      if (q.type === 'multiple' && !q.answers.some((a) => a.correct)) at(`"${q.id}": at least one correct answer`)
      if (q.type === 'order') {
        const ids = q.items.map((it) => it.id).sort()
        if (JSON.stringify(ids) !== JSON.stringify([...q.correctOrder].sort())) at(`"${q.id}": correctOrder must list every item once`)
      }
    })
  })
export type QuizDocument = z.output<typeof quizDocumentSchema>

/** Submitted answer, by question type (spec 076). */
export const quizAnswerSchema = z.union([
  z.object({ single: z.string() }),
  z.object({ multiple: z.array(z.string()) }),
  z.object({ boolean: z.boolean() }),
  z.object({ order: z.array(z.string()) }),
])
export type QuizAnswer = z.infer<typeof quizAnswerSchema>

export const quizSubmitSchema = z.object({ answers: z.record(z.string(), quizAnswerSchema) })

// ─── Learner API views ────────────────────────────────────────────────────────

export type ModuleSummary = {
  slug: string
  name: string
  type: ModuleType
  inline: boolean
  /** Only admins see hidden modules. */
  hidden: boolean
  /** Sequential order or prerequisites not met (never for admins). */
  locked: boolean
  /** Viewed (lesson) or passed (quiz). */
  done: boolean
  skills: SkillRef[]
  /** Quizzes: the learner's results so far. */
  results: { bestScore: number | null; maxScore: number | null; attempts: number; passed: boolean } | null
}

/** `GET /api/courses/:slug/modules` */
export type CourseModulesResponse = {
  modules: ModuleSummary[]
  progress: { done: number; total: number }
}

export type TocEntry = { id: string; text: string; level: 2 | 3 }

export type LessonView = {
  /** Sanitized HTML. */
  html: string
  toc: TocEntry[]
  /** The source could not be loaded; `html` is a placeholder (spec 064). */
  unavailable: boolean
}

export type QuestionCooldown = { remainingSeconds: number; attempts: number; locked: boolean }

export type QuizQuestionView = {
  key: string
  type: QuizQuestion['type']
  /** Sanitized HTML. Never includes correct answers or feedback (spec 085). */
  prompt: string
  points: number
  answers?: { id: string; html: string }[]
  items?: { id: string; html: string }[]
}

export type QuizView = {
  title: string | null
  passingScore: number
  maxScore: number
  questions: QuizQuestionView[]
  cooldowns: Record<string, QuestionCooldown>
}

/** `GET /api/courses/:slug/modules/:moduleSlug` */
export type ModuleDetail = ModuleSummary & {
  lesson: LessonView | null
  /** Video and image modules (spec 062); `url` is the local copy when replicated (063). */
  media: { url: string } | null
  quiz: QuizView | null
  /** A lesson followed by an inline quiz embeds it (spec 083). */
  inlineQuiz: { module: ModuleSummary; quiz: QuizView } | null
  /** An inline quiz is shown on this lesson. */
  hostSlug: string | null
  /** Neighbours in the visible, non-inline order. */
  previous: { slug: string; type: ModuleType } | null
  next: { slug: string; type: ModuleType; locked: boolean } | null
}

export type QuestionResult = {
  key: string
  correct: boolean
  pointsEarned: number
  pointsMax: number
  /** Revealed after submitting (spec 085): answer id(s), boolean, or order. */
  correctAnswer: string | string[] | boolean
  /** Sanitized HTML. */
  feedback: string | null
  locked: boolean
}

/** `POST …/submit` */
export type QuizResult = {
  score: number
  maxScore: number
  passed: boolean
  passingScore: number
  questionResults: QuestionResult[]
  cooldowns: Record<string, QuestionCooldown>
  /** This submission completed the course (spec 068). */
  courseCompleted: boolean
}

/** `POST …/complete` */
export type ModuleCompleteResult = { courseCompleted: boolean }

/** 425 body when some questions are still cooling down (spec 080). */
export type CooldownError = { error: string; cooldowns: Record<string, QuestionCooldown> }

// ─── Admin ────────────────────────────────────────────────────────────────────

export type AdminModule = {
  id: string
  slug: string
  name: string
  type: ModuleType
  hidden: boolean
  inline: boolean
  prerequisites: string[]
  skills: string[]
  content: ModuleContent
}

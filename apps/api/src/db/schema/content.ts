import { type LabConfig, MODULE_TYPES } from '@pupitre/shared'
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { course, createdAt } from './courses.ts'

function updatedAt() {
  return integer({ mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
}

/**
 * Spec 191 "Module": one element of a course, in order. Progress and attempts reference the id, so renaming,
 * moving or changing the slug keeps them. Exactly one content source: `body` (written in the platform) or
 * `sourceRepo` + `sourceRef` + `sourcePath` (a file read through the ContentLoader).
 */
export const courseModule = sqliteTable(
  'module',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text()
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    type: text({ enum: MODULE_TYPES }).notNull(),
    hidden: integer({ mode: 'boolean' }).notNull().default(false),
    inline: integer({ mode: 'boolean' }).notNull().default(false),
    body: text(),
    sourceRepo: text(),
    sourceRef: text(),
    sourcePath: text(),
    /** Video / image modules (spec 062): uploaded `/uploads/…` or remote URL; `mediaReplicate` copies it locally (063). */
    mediaUrl: text(),
    mediaReplicate: integer({ mode: 'boolean' }).notNull().default(false),
    /** Lab modules (spec 090): JSON `LabConfig` (workspace link, provider, steps). */
    lab: text({ mode: 'json' }).$type<LabConfig>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('module_course_slug_idx').on(t.courseId, t.slug), index('module_course_position_idx').on(t.courseId, t.position)],
)

/** Spec 054: `moduleId` is locked until `requiresModuleId` is done. Same course. */
export const modulePrerequisite = sqliteTable(
  'module_prerequisite',
  {
    moduleId: text()
      .notNull()
      .references(() => courseModule.id, { onDelete: 'cascade' }),
    requiresModuleId: text()
      .notNull()
      .references(() => courseModule.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.moduleId, t.requiresModuleId] })],
)

/** Spec 191 "ModuleProgress": at most one per (user, module). Done = viewed (lesson) or passed (quiz). */
export const moduleProgress = sqliteTable(
  'module_progress',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    moduleId: text()
      .notNull()
      .references(() => courseModule.id, { onDelete: 'cascade' }),
    viewedAt: integer({ mode: 'timestamp_ms' }),
    bestScore: integer(),
    maxScore: integer(),
    attempts: integer().notNull().default(0),
    /** First pass; never cleared. */
    passedAt: integer({ mode: 'timestamp_ms' }),
    lastActivityAt: updatedAt(),
  },
  (t) => [uniqueIndex('module_progress_user_module_idx').on(t.userId, t.moduleId)],
)

/** Spec 191 "QuizSubmission": every submission, kept as history. */
export const quizSubmission = sqliteTable(
  'quiz_submission',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    moduleId: text()
      .notNull()
      .references(() => courseModule.id, { onDelete: 'cascade' }),
    /** JSON: `{ [questionKey]: QuizAnswer }`. */
    answers: text({ mode: 'json' }).notNull(),
    score: integer().notNull(),
    maxScore: integer().notNull(),
    passed: integer({ mode: 'boolean' }).notNull(),
    /** JSON: the `QuestionResult[]` shown to the learner. */
    results: text({ mode: 'json' }).notNull(),
    submittedAt: createdAt(),
  },
  (t) => [index('quiz_submission_user_module_idx').on(t.userId, t.moduleId)],
)

/**
 * Spec 191 "QuestionAttemptState": retry state of one learner on one question (identified by its key within
 * the quiz). A correct answer deletes it; an admin can reset it.
 */
export const questionAttemptState = sqliteTable(
  'question_attempt_state',
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    moduleId: text()
      .notNull()
      .references(() => courseModule.id, { onDelete: 'cascade' }),
    questionKey: text().notNull(),
    failedAttempts: integer().notNull().default(0),
    cooldownUntil: integer({ mode: 'timestamp_ms' }),
    locked: integer({ mode: 'boolean' }).notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.moduleId, t.questionKey] })],
)

/**
 * Spec 094 / 191 "LabCheck": every verification of a lab step — by the server (`verified`, GitLab) or reported by the
 * learner's desktop app (local checks). Kept with the module; `userEmail` keeps who it was.
 */
export const labCheck = sqliteTable(
  'lab_check',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text().notNull(),
    moduleId: text()
      .notNull()
      .references(() => courseModule.id, { onDelete: 'cascade' }),
    stepIndex: integer(),
    stepTitle: text(),
    allow: integer({ mode: 'boolean' }).notNull(),
    violations: text({ mode: 'json' }).$type<string[]>().notNull(),
    verified: integer({ mode: 'boolean' }).notNull(),
    checkedAt: createdAt(),
  },
  (t) => [index('lab_check_user_module_idx').on(t.userId, t.moduleId), index('lab_check_checked_idx').on(t.checkedAt)],
)

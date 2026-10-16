import { XP_SOURCES } from '@pupitre/shared'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { course, createdAt } from './courses.ts'

/**
 * Spec 191 "CourseCompletion": at most one per (user, course). Kept when the course is deleted
 * (`courseId` becomes null, `courseTitle` keeps what was completed).
 */
export const courseCompletion = sqliteTable(
  'course_completion',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    courseId: text().references(() => course.id, { onDelete: 'set null' }),
    courseTitle: text().notNull(),
    /** The admin who marked it, when it was not earned by finishing the modules. */
    completedBy: text().references(() => user.id, { onDelete: 'set null' }),
    completedAt: createdAt(),
  },
  (t) => [uniqueIndex('course_completion_user_course_idx').on(t.userId, t.courseId)],
)

/**
 * Spec 191 "XPEvent" / spec 103: an XP gain (or admin correction), at most once per (user, source, sourceKey).
 * Total XP = sum of `amount`. Kept when the course is deleted (`label` keeps its title).
 */
export const xpEvent = sqliteTable(
  'xp_event',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: text({ enum: XP_SOURCES }).notNull(),
    /** What was earned: course id for `course`, lesson/module id later, a random id for `admin`. */
    sourceKey: text().notNull(),
    amount: integer().notNull(),
    /** Course title, or the admin's reason. */
    label: text().notNull(),
    courseId: text().references(() => course.id, { onDelete: 'set null' }),
    grantedBy: text().references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('xp_event_user_source_key_idx').on(t.userId, t.source, t.sourceKey),
    index('xp_event_user_idx').on(t.userId),
  ],
)

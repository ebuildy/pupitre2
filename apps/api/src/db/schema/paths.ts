import { COURSE_STATUSES, DIFFICULTIES, PATH_KINDS } from '@pupitre/shared'
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { course, createdAt } from './courses.ts'
import { skill } from './gamification.ts'

/** Spec 120 / 191 "Path" (parcours). */
export const learningPath = sqliteTable('learning_path', {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text().notNull().unique(),
  title: text().notNull(),
  description: text(),
  kind: text({ enum: PATH_KINDS }).notNull().default('course'),
  level: text({ enum: DIFFICULTIES }),
  status: text({ enum: COURSE_STATUSES }).notNull().default('draft'),
  createdAt: createdAt(),
  updatedAt: integer({ mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date()),
})

/** Ordered members: a course (course paths) or a skill (skill paths). */
export const pathItem = sqliteTable(
  'path_item',
  {
    pathId: text()
      .notNull()
      .references(() => learningPath.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    courseId: text().references(() => course.id, { onDelete: 'cascade' }),
    skillId: text().references(() => skill.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.pathId, t.position] }), index('path_item_course_idx').on(t.courseId)],
)

/** Spec 191 "PathEnrollment": by an admin or a manager. Course paths give `path` grants on their courses. */
export const pathEnrollment = sqliteTable(
  'path_enrollment',
  {
    pathId: text()
      .notNull()
      .references(() => learningPath.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    enrolledBy: text().references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.pathId, t.userId] }), index('path_enrollment_user_idx').on(t.userId)],
)

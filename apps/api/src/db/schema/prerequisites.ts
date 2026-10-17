import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { course } from './courses.ts'

/** Spec 050 / 191 "CoursePrerequisite": `courseId` requires `requiredCourseId` (score and/or modules). */
export const coursePrerequisite = sqliteTable(
  'course_prerequisite',
  {
    courseId: text()
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    requiredCourseId: text()
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    minScore: integer(),
    /** JSON: ids of modules of the required course that must be done. */
    moduleIds: text({ mode: 'json' }).$type<string[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.requiredCourseId] })],
)

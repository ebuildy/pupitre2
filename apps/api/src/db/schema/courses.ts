import { COURSE_STATUSES, COURSE_VISIBILITIES, DIFFICULTIES, ENROLLMENT_SOURCES } from '@pupitre/shared'
import { sql } from 'drizzle-orm'
import { type AnySQLiteColumn, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'

const timestamps = {
  createdAt: integer({ mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  updatedAt: integer({ mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date()),
}

/** Course categories, as a tree (`parentId`). Referenced by id: the slug can be changed by an admin. */
export const category = sqliteTable(
  'category',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text().notNull().unique(),
    title: text().notNull(),
    // `restrict`: a category with subcategories can't be deleted (the API answers 409 first).
    parentId: text().references((): AnySQLiteColumn => category.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [index('category_parent_idx').on(t.parentId)],
)

/** Spec 191 "Course". Referenced by id: the slug can be changed by an admin. */
export const course = sqliteTable(
  'course',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text().notNull().unique(),
    title: text().notNull(),
    description: text(),
    // `restrict`: a category still used by courses can't be deleted (the API answers 409 first).
    categoryId: text().references(() => category.id, { onDelete: 'restrict' }),
    difficulty: text({ enum: DIFFICULTIES }),
    visibility: text({ enum: COURSE_VISIBILITIES }).notNull().default('private'),
    status: text({ enum: COURSE_STATUSES }).notNull().default('draft'),
    ...timestamps,
  },
  (t) => [index('course_status_visibility_idx').on(t.status, t.visibility), index('course_category_idx').on(t.categoryId)],
)

/**
 * Spec 191 "Enrollment": a user is enrolled in a course while at least one grant exists.
 * One row per (user, course, source); the enrollment date is the oldest grant.
 */
export const enrollmentGrant = sqliteTable(
  'enrollment_grant',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    courseId: text()
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    source: text({ enum: ENROLLMENT_SOURCES }).notNull(),
    grantedBy: text().references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('enrollment_grant_user_course_source_idx').on(t.userId, t.courseId, t.source),
    index('enrollment_grant_course_idx').on(t.courseId),
  ],
)

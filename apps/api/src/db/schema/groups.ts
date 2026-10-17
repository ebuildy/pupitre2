import { MEMBERSHIP_ORIGINS, MEMBERSHIP_ROLES } from '@pupitre/shared'
import { type AnySQLiteColumn, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { user } from './auth.ts'
import { course, createdAt } from './courses.ts'

/**
 * Spec 130 / 191 "Group": a tree (`parentId`, at most 10 levels). Names are unique (case-insensitive).
 * Exactly one default group (`everyone`): every user is a member.
 */
export const userGroup = sqliteTable(
  'user_group',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    description: text(),
    /** `local`, or the identity provider that created it (SSO). */
    origin: text().notNull().default('local'),
    // `restrict`: the API refuses to delete a group with subgroups first.
    parentId: text().references((): AnySQLiteColumn => userGroup.id, { onDelete: 'restrict' }),
    isDefault: integer({ mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('user_group_name_idx').on(sql`lower(${t.name})`), index('user_group_parent_idx').on(t.parentId)],
)

/** Spec 191 "GroupMembership": `manager` members manage the group (spec 140). */
export const groupMembership = sqliteTable(
  'group_membership',
  {
    groupId: text()
      .notNull()
      .references(() => userGroup.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text({ enum: MEMBERSHIP_ROLES }).notNull().default('member'),
    origin: text({ enum: MEMBERSHIP_ORIGINS }).notNull().default('manual'),
    addedBy: text().references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_membership_user_idx').on(t.userId)],
)

/** Spec 135 / 191 "GroupCourseEnrollment": every member gets a `group` grant on the course. */
export const groupCourseEnrollment = sqliteTable(
  'group_course_enrollment',
  {
    groupId: text()
      .notNull()
      .references(() => userGroup.id, { onDelete: 'cascade' }),
    courseId: text()
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    enrolledBy: text().references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.courseId] }), index('group_course_enrollment_course_idx').on(t.courseId)],
)

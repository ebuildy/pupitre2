import { ATTENDANCES } from '@pupitre/shared'
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { course, createdAt } from './courses.ts'

/** Spec 150 / 191 "Session": a scheduled occurrence of an in-person course. */
export const courseSession = sqliteTable(
  'course_session',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text()
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    startsAt: integer({ mode: 'timestamp_ms' }).notNull(),
    endsAt: integer({ mode: 'timestamp_ms' }),
    location: text(),
    /** null = unlimited. */
    capacity: integer(),
    createdBy: text().references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date()),
  },
  (t) => [index('course_session_starts_idx').on(t.startsAt), index('course_session_course_idx').on(t.courseId)],
)

/** Spec 152 / 191 "Booking": one seat per user per session; deleted with the session. */
export const sessionBooking = sqliteTable(
  'session_booking',
  {
    sessionId: text()
      .notNull()
      .references(() => courseSession.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bookedAt: createdAt(),
    attendance: text({ enum: ATTENDANCES }).notNull().default('unknown'),
    markedBy: text().references(() => user.id, { onDelete: 'set null' }),
    markedAt: integer({ mode: 'timestamp_ms' }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] }), index('session_booking_user_idx').on(t.userId)],
)

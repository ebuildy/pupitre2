import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { course, createdAt } from './courses.ts'

/**
 * Spec 180 / 191 "MarkdownPattern": unique name per scope. `scope` is '' (global) or the course id (kept in sync with
 * `courseId`, which cascades when the course is deleted).
 */
export const markdownPattern = sqliteTable(
  'markdown_pattern',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    label: text().notNull(),
    description: text(),
    parameter: text(),
    html: text().notNull(),
    css: text(),
    courseId: text().references(() => course.id, { onDelete: 'cascade' }),
    scope: text().notNull().default(''),
    origin: text({ enum: ['admin', 'config'] }).notNull().default('admin'),
    createdBy: text().references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('markdown_pattern_scope_name_idx').on(t.scope, t.name)],
)

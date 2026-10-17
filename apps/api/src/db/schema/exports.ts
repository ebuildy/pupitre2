import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { createdAt } from './courses.ts'

/** Spec 191 "ExportRecord": every CSV download — who, what, which filters, how many rows. */
export const exportRecord = sqliteTable('export_record', {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text().references(() => user.id, { onDelete: 'set null' }),
  userEmail: text().notNull(),
  category: text().notNull(),
  fields: text({ mode: 'json' }).$type<string[]>().notNull(),
  filters: text({ mode: 'json' }).$type<Record<string, string>>().notNull(),
  rowCount: integer().notNull(),
  createdAt: createdAt(),
})

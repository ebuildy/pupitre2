import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { createdAt } from './courses.ts'

/** Spec 191 "MediaAsset": an uploaded or locally copied file, served at `/uploads/<filename>`. */
export const mediaAsset = sqliteTable('media_asset', {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  filename: text().notNull().unique(),
  contentType: text().notNull(),
  size: integer().notNull(),
  uploadedBy: text().references(() => user.id, { onDelete: 'set null' }),
  /** Copied from this remote URL (spec 063). */
  originalUrl: text().unique(),
  createdAt: createdAt(),
})

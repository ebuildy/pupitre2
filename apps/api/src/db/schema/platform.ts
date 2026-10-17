import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth.ts'
import { createdAt } from './courses.ts'

/** Spec 179 / 191 "PlatformSetting": only the values an admin changed; defaults live in `SETTINGS`. JSON value. */
export const platformSetting = sqliteTable('platform_setting', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }).notNull(),
  updatedBy: text().references(() => user.id, { onDelete: 'set null' }),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
})

/**
 * Spec 191 "AuditEvent": significant admin actions (role changes, deactivation, settings, deletions…).
 * `actorEmail` / `targetLabel` keep a snapshot, so the record survives the deletion of the user or object.
 */
export const auditEvent = sqliteTable(
  'audit_event',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: text().references(() => user.id, { onDelete: 'set null' }),
    actorEmail: text(),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    targetLabel: text(),
    details: text({ mode: 'json' }),
    createdAt: createdAt(),
  },
  (t) => [index('audit_event_created_idx').on(t.createdAt)],
)

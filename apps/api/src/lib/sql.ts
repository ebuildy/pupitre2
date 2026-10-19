import { type Column, type SQL, sql } from 'drizzle-orm'

/**
 * Case-insensitive equality computed by SQLite on both sides. Its `lower()` only folds ASCII (`É` stays `É`), unlike
 * `toLowerCase()`, and the unique `lower(name)` indexes use it: comparing with a JS-lowercased value misses "Équipe".
 */
export const sameName = (column: Column, value: string): SQL => sql`lower(${column}) = lower(${value})`

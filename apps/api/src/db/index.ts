import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { env } from '../env.ts'
import * as schema from './schema/index.ts'

if (env.DATABASE_URL !== ':memory:') {
  mkdirSync(dirname(env.DATABASE_URL), { recursive: true })
}

export const sqlite = new Database(env.DATABASE_URL)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('busy_timeout = 5000')

/** Spec 014: counts the statements run inside `queryCounter.run({ count: 0 }, …)`. */
export const queryCounter = new AsyncLocalStorage<{ count: number }>()

export const db = drizzle(sqlite, {
  schema,
  casing: 'snake_case',
  logger: env.QUERY_COUNT_HEADER
    ? {
        logQuery() {
          const store = queryCounter.getStore()
          if (store) store.count++
        },
      }
    : false,
})
export type DB = typeof db

import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db, sqlite } from './index.ts'

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export function runMigrations() {
  migrate(db, { migrationsFolder })
}

// `pnpm db:migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
  sqlite.close()
  console.log('migrations applied')
}

import { rmSync } from 'node:fs'
import { env } from '../env.ts'

/**
 * `pnpm db:seed`: apply migrations, ensure the admin, load the fixtures.
 * `pnpm db:reset`: same, after deleting the database file. Development only.
 */
const reset = process.argv.includes('--reset')

if (env.NODE_ENV === 'production') {
  console.error('Refusing to load fixtures with NODE_ENV=production.')
  process.exit(1)
}

if (reset) {
  if (env.DATABASE_URL === ':memory:') throw new Error('Nothing to reset for an in-memory database')
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${env.DATABASE_URL}${suffix}`, { force: true })
  console.log(`deleted ${env.DATABASE_URL}`)
}

// Imported after the reset: opening the database creates the file.
const { runMigrations } = await import('../db/migrate.ts')
const { ensureAdmin } = await import('../bootstrap/admin.ts')
const { seedFixtures } = await import('./index.ts')
const { sqlite } = await import('../db/index.ts')

runMigrations()
await ensureAdmin()
const summary = await seedFixtures()
sqlite.close()
console.log('fixtures loaded:', summary)
console.log('accounts: admin / Admin@1234 (unless ADMIN_PASSWORD), etudiant / Student@1234, manager / Manager@1234')

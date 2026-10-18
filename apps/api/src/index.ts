import { serve } from '@hono/node-server'
import app from './app.ts'
import { ensureAdmin } from './bootstrap/admin.ts'
import { sqlite } from './db/index.ts'
import { runMigrations } from './db/migrate.ts'
import { env } from './env.ts'
import { ensureDefaultMemberships } from './services/groups.ts'
import { seedPatterns } from './services/patterns.ts'

runMigrations()
await ensureAdmin()
if (env.SEED_DEV_DATA) {
  // Dynamic import: the fixtures (and faker, a dev dependency) are never loaded otherwise.
  const { seedFixtures } = await import('./fixtures/index.ts')
  console.log('fixtures loaded:', await seedFixtures())
}
// Spec 038: accounts created before the default group existed, or outside better-auth.
ensureDefaultMemberships()
// Spec 181: patterns shipped with the deployment.
const seeded = seedPatterns(env.PATTERNS_FILE)
if (seeded) console.log(`markdown patterns from ${env.PATTERNS_FILE}: ${seeded}`)

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      sqlite.close()
      process.exit(0)
    })
  })
}

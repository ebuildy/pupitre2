import { serve } from '@hono/node-server'
import app from './app.ts'
import { ensureAdmin } from './bootstrap/admin.ts'
import { sqlite } from './db/index.ts'
import { runMigrations } from './db/migrate.ts'
import { env } from './env.ts'
import { probes } from './probes.ts'
import { ensureDefaultMemberships } from './services/groups.ts'
import { seedPatterns } from './services/patterns.ts'
import { updateSettings } from './services/settings.ts'
import { bootstrapOidcSettings } from './services/sso.ts'

runMigrations()
await ensureAdmin()
if (env.SEED_DEV_DATA) {
  // Dynamic import: the fixtures (and faker, a dev dependency) are never loaded otherwise.
  const { seedFixtures } = await import('./fixtures/index.ts')
  console.log('fixtures loaded:', await seedFixtures())
}
// Spec 038: accounts created before the default group existed, or outside better-auth.
ensureDefaultMemberships()
// Spec 029: OIDC settings from the deployment (they win over admin edits).
if (bootstrapOidcSettings((values) => updateSettings(values, null))) console.log('OIDC settings bootstrapped from OIDC_*')
// Spec 181: patterns shipped with the deployment.
const seeded = seedPatterns(env.PATTERNS_FILE)
if (seeded) console.log(`markdown patterns from ${env.PATTERNS_FILE}: ${seeded}`)

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`)
})
// Spec 006: probes and metrics on their own port, not exposed to the web.
const probesServer = serve({ fetch: probes.fetch, port: env.PROBES_PORT, hostname: env.PROBES_HOST }, (info) => {
  console.log(`probes listening on http://${env.PROBES_HOST}:${info.port} (/health, /ready, /metrics)`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    probesServer.close()
    server.close(() => {
      sqlite.close()
      process.exit(0)
    })
  })
}

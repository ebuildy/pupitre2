import { serve } from '@hono/node-server'
import app from './app.ts'
import { sqlite } from './db/index.ts'
import { runMigrations } from './db/migrate.ts'
import { env } from './env.ts'

runMigrations()

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

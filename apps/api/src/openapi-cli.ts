// `pnpm openapi [file]`: writes the OpenAPI document of the API (default `openapi.json`), without starting the server.
import { writeFileSync } from 'node:fs'

// Building the routes opens the database: an empty in-memory one is enough.
process.env.DATABASE_URL ??= ':memory:'
const { default: app } = await import('./app.ts')
const { openApiDocument } = await import('./openapi.ts')

const file = process.argv[2] ?? 'openapi.json'
const document = openApiDocument(app)
writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`)
console.log(`${file}: ${Object.keys(document.paths ?? {}).length} paths`)

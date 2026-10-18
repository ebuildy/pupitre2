import { type ExportCategory, type ExportPreview, exportRequestSchema } from '@pupitre/shared'
import { type Context, Hono } from 'hono'
import { validate } from '../lib/validate.ts'
import type { AppEnv } from '../middleware/session.ts'
import { exportCategories, exportCsv, previewExport } from '../services/exports.ts'

/**
 * Spec 182, mounted at /api/admin/exports (`scope` null: everything) and /api/manager/exports (`scope`: the manager's
 * members, read from the manager middleware).
 */
export function exportRoutes(scope: (c: Context<AppEnv>) => string[] | null) {
  return new Hono<AppEnv>()
    .get('/categories', (c) => c.json<{ categories: ExportCategory[] }>({ categories: exportCategories(scope(c) !== null) }))
    .post('/preview', validate('json', exportRequestSchema), (c) => c.json<ExportPreview>(previewExport(c.req.valid('json'), scope(c))))
    .post('/download', validate('json', exportRequestSchema), (c) => {
      const { csv, filename } = exportCsv(c.req.valid('json'), scope(c), c.get('user')!)
      return c.body(csv, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      })
    })
}

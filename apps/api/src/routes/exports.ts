import { exportCategorySchema, exportPreviewSchema, exportRequestSchema } from '@pupitre/shared'
import type { Context } from 'hono'
import { z } from 'zod'
import { createRoute, createRouter, errors, json, jsonBody } from '../lib/openapi.ts'
import type { AppEnv } from '../middleware/session.ts'
import { exportCategories, exportCsv, previewExport } from '../services/exports.ts'

/**
 * Spec 182, mounted at /api/admin/exports (`scope` null: everything) and /api/manager/exports (`scope`: the manager's
 * members, read from the manager middleware). `tag` groups the routes in the OpenAPI document.
 */
export function exportRoutes(scope: (c: Context<AppEnv>) => string[] | null, tag: string) {
  const tags = [tag]
  const listCategories = createRoute({
    method: 'get',
    path: '/categories',
    tags,
    summary: 'What can be exported',
    responses: { 200: json(z.object({ categories: z.array(exportCategorySchema) })), ...errors(401, 403) },
  })
  const preview = createRoute({
    method: 'post',
    path: '/preview',
    tags,
    summary: 'Preview an export',
    description: 'The first rows of the CSV, with the total.',
    request: { body: jsonBody(exportRequestSchema) },
    responses: { 200: json(exportPreviewSchema), ...errors(400, 401, 403) },
  })
  const download = createRoute({
    method: 'post',
    path: '/download',
    tags,
    summary: 'Download an export',
    request: { body: jsonBody(exportRequestSchema) },
    responses: {
      200: { description: 'The CSV file (attachment)', content: { 'text/csv': { schema: z.string() } } },
      ...errors(400, 401, 403),
    },
  })

  return createRouter()
    .openapi(listCategories, (c) => c.json({ categories: exportCategories(scope(c) !== null) }, 200))
    .openapi(preview, (c) => c.json(previewExport(c.req.valid('json'), scope(c)), 200))
    .openapi(download, (c) => {
      const { csv, filename } = exportCsv(c.req.valid('json'), scope(c), c.get('user')!)
      return c.body(csv, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      })
    })
}

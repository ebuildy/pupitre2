import { z } from 'zod'
import { contentLoader } from '../../content/loader.ts'
import { ADMIN, createRoute, createRouter, errors, json } from '../../lib/openapi.ts'

export const cacheClearedSchema = z.object({ status: z.literal('ok'), reposCleared: z.number() }).meta({ id: 'CacheCleared' })

const clearCache = createRoute({
  method: 'post',
  path: '/clear',
  tags: ['Admin: content'],
  summary: 'Forget every git clone',
  description: 'Spec 177: course content is read again from the repositories.',
  responses: { 200: json(cacheClearedSchema), ...errors(...ADMIN) },
})

/** Spec 177: `POST /api/admin/cache/clear` forgets every git clone. */
export const adminCacheRoutes = createRouter().openapi(clearCache, async (c) => {
  const cleared = await contentLoader.clear()
  return c.json({ status: 'ok' as const, reposCleared: cleared }, 200)
})

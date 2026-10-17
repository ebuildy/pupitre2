import { Hono } from 'hono'
import { contentLoader } from '../../content/loader.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Spec 177: `POST /api/admin/cache/clear` forgets every git clone. */
export const adminCacheRoutes = new Hono<AppEnv>().post('/clear', async (c) => {
  const cleared = await contentLoader.clear()
  return c.json({ status: 'ok', reposCleared: cleared })
})

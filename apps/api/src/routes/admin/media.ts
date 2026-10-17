import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../../middleware/session.ts'
import { saveUpload } from '../../services/media.ts'

/** Spec 062 (the original had no upload endpoint): `POST /api/admin/media` multipart `file` → `{id, url, …}`. */
export const adminMediaRoutes = new Hono<AppEnv>().post('/', async (c) => {
  const body = await c.req.parseBody()
  const file = body.file
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'file is required' })
  return c.json(await saveUpload(file, c.get('user')!.id), 201)
})

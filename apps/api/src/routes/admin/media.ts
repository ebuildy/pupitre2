import { z } from 'zod'
import { ADMIN, createRoute, createRouter, errors, json } from '../../lib/openapi.ts'
import { saveUpload } from '../../services/media.ts'

const uploadSchema = z.object({
  file: z.custom<File>((v) => v instanceof File, 'Required').meta({ type: 'string', format: 'binary' }),
})

const upload = createRoute({
  method: 'post',
  path: '/',
  tags: ['Admin: content'],
  summary: 'Upload a media file',
  description: 'Spec 062: images and videos, served at `url` (`/uploads/<file>`). Size limit: `MEDIA_MAX_BYTES`.',
  request: { body: { required: true, content: { 'multipart/form-data': { schema: uploadSchema } } } },
  responses: {
    201: json(z.object({ id: z.string(), url: z.string(), contentType: z.string(), size: z.number() }), 'Uploaded'),
    ...errors(400, ...ADMIN),
  },
})

/** Spec 062 (the original had no upload endpoint): `POST /api/admin/media` multipart `file` → `{id, url, …}`. */
export const adminMediaRoutes = createRouter().openapi(upload, async (c) =>
  c.json(await saveUpload(c.req.valid('form').file, c.get('user')!.id), 201),
)

import { type AdminSettingsResponse, settingsUpdateSchema } from '@pupitre/shared'
import { Hono } from 'hono'
import { validate } from '../../lib/validate.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { adminSettings, settingChanges, updateSettings } from '../../services/settings.ts'

/** Spec 179, under /api/admin/settings. */
export const adminSettingsRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json<AdminSettingsResponse>({ settings: adminSettings(), changes: settingChanges() }))
  .put('/', validate('json', settingsUpdateSchema), (c) => {
    const actor = c.get('user')!
    updateSettings(c.req.valid('json'), actor)
    return c.json<AdminSettingsResponse>({ settings: adminSettings(), changes: settingChanges() })
  })

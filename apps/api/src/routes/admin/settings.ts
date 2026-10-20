import { adminSettingsResponseSchema, settingsUpdateSchema } from '@pupitre/shared'
import { ADMIN, createRoute, createRouter, errors, json, jsonBody } from '../../lib/openapi.ts'
import { adminSettings, settingChanges, updateSettings } from '../../services/settings.ts'

const tags = ['Admin: settings']

const getSettings = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'Platform settings',
  description: 'Spec 179: every setting (secrets as a placeholder), and the last change of each key an admin set.',
  responses: { 200: json(adminSettingsResponseSchema), ...errors(...ADMIN) },
})

const changeSettings = createRoute({
  method: 'put',
  path: '/',
  tags,
  summary: 'Change platform settings',
  description: 'Any subset of the keys; unknown keys are refused. Sending the secret placeholder back keeps the stored secret.',
  request: { body: jsonBody(settingsUpdateSchema) },
  responses: { 200: json(adminSettingsResponseSchema), ...errors(400, ...ADMIN) },
})

/** Spec 179, under /api/admin/settings. */
export const adminSettingsRoutes = createRouter()
  .openapi(getSettings, (c) => c.json({ settings: adminSettings(), changes: settingChanges() }, 200))
  .openapi(changeSettings, (c) => {
    const actor = c.get('user')!
    updateSettings(c.req.valid('json'), actor)
    return c.json({ settings: adminSettings(), changes: settingChanges() }, 200)
  })

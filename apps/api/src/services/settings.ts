import {
  type AdminSettingsResponse,
  defaultSettings,
  PUBLIC_SETTING_KEYS,
  type PublicSettings,
  SETTINGS,
  type SettingKey,
  type Settings,
  type SettingsUpdateInput,
} from '@pupitre/shared'
import { db } from '../db/index.ts'
import { platformSetting } from '../db/schema/index.ts'
import { audit } from './audit.ts'

// Settings are read on every sign-in / sign-up: kept in memory, reloaded after each change (one API process).
let cache: Settings | null = null

/** Spec 179: every setting, stored value or default. */
export function getSettings(): Settings {
  if (cache) return cache
  const settings = defaultSettings() as Record<SettingKey, unknown>
  for (const row of db.select().from(platformSetting).all()) {
    if (row.key in SETTINGS) settings[row.key as SettingKey] = row.value
  }
  cache = settings as Settings
  return cache
}

export function publicSettings(): PublicSettings {
  const all = getSettings()
  return Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, all[k]])) as PublicSettings
}

export function settingChanges(): AdminSettingsResponse['changes'] {
  const rows = db.select().from(platformSetting).all()
  return Object.fromEntries(
    rows.map((r) => [r.key, { updatedAt: r.updatedAt.toISOString(), updatedBy: r.updatedBy }]),
  )
}

/** Stores the changed values (who and when) and records an audit event. */
export function updateSettings(input: SettingsUpdateInput, actor: { id: string; email: string }) {
  const now = new Date()
  const before = getSettings()
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(input)) {
      tx.insert(platformSetting)
        .values({ key, value, updatedBy: actor.id, updatedAt: now })
        .onConflictDoUpdate({ target: platformSetting.key, set: { value, updatedBy: actor.id, updatedAt: now } })
        .run()
    }
  })
  cache = null
  const changed = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, { from: before[k as SettingKey], to: v }]),
  )
  audit(actor, 'settings.update', { type: 'settings' }, changed)
  return getSettings()
}

/** Tests and fixtures only: forget the cached values. */
export function resetSettingsCache() {
  cache = null
}

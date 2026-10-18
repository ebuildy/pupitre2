import {
  type AdminSettingsResponse,
  defaultSettings,
  PUBLIC_SETTING_KEYS,
  SECRET_PLACEHOLDER,
  SECRET_SETTING_KEYS,
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

/** Spec 179: what admins see — secrets replaced by the placeholder when set. */
export function adminSettings(): Settings {
  const all = { ...getSettings() } as Record<SettingKey, unknown>
  for (const k of SECRET_SETTING_KEYS) if (all[k]) all[k] = SECRET_PLACEHOLDER
  return all as Settings
}

/** Stores the changed values (who and when) and records an audit event. Secrets sent back masked are left as they are. */
export function updateSettings(rawInput: SettingsUpdateInput, actor: { id: string; email: string } | null) {
  const input = Object.fromEntries(
    Object.entries(rawInput).filter(([k, v]) => !(SECRET_SETTING_KEYS as string[]).includes(k) || v !== SECRET_PLACEHOLDER),
  ) as SettingsUpdateInput
  const now = new Date()
  const before = getSettings()
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(input)) {
      tx.insert(platformSetting)
        .values({ key, value, updatedBy: actor?.id ?? null, updatedAt: now })
        .onConflictDoUpdate({ target: platformSetting.key, set: { value, updatedBy: actor?.id ?? null, updatedAt: now } })
        .run()
    }
  })
  cache = null
  if (Object.keys(input).length === 0) return getSettings()
  const changed = Object.fromEntries(
    Object.entries(input).map(([k, v]) =>
      (SECRET_SETTING_KEYS as string[]).includes(k) ? [k, { changed: true }] : [k, { from: before[k as SettingKey], to: v }],
    ),
  )
  audit(actor, 'settings.update', { type: 'settings' }, changed)
  return getSettings()
}

/** Tests and fixtures only: forget the cached values. */
export function resetSettingsCache() {
  cache = null
}

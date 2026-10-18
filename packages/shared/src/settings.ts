import { z } from 'zod'

/**
 * Spec 179: platform settings editable by admins. Each key has a type and a default; the database only stores the
 * values an admin changed. `public` settings are readable by anyone (`GET /api/settings/public`).
 * Settings of features not built yet (OIDC, LDAP, GitLab) are added with those features.
 */
export const SETTINGS = {
  /** Spec 021 */
  registration_enabled: { type: 'boolean', default: true, public: true },
  registration_email_whitelist: { type: 'list', default: [] as string[], public: false },
  /** Spec 022 */
  password_min_length: { type: 'number', default: 8, public: true },
  password_require_uppercase: { type: 'boolean', default: false, public: true },
  password_require_number: { type: 'boolean', default: false, public: true },
  /** Spec 035 */
  profile_allow_username_change: { type: 'boolean', default: true, public: true },
  /** Spec 024 */
  sso_local_login_enabled: { type: 'boolean', default: true, public: true },
  /** Spec 092: GitLab instance of the lab checks (empty: the GITLAB_URL environment variable). */
  gitlab_url: { type: 'text', default: '', public: false },
} as const

export type SettingKey = keyof typeof SETTINGS
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[]

type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['type'] extends 'boolean'
  ? boolean
  : (typeof SETTINGS)[K]['type'] extends 'number'
    ? number
    : (typeof SETTINGS)[K]['type'] extends 'list'
      ? string[]
      : string

export type Settings = { [K in SettingKey]: SettingValue<K> }

type PublicKey = { [K in SettingKey]: (typeof SETTINGS)[K]['public'] extends true ? K : never }[SettingKey]

/** `GET /api/settings/public` */
export type PublicSettings = Pick<Settings, PublicKey>

export const PUBLIC_SETTING_KEYS = SETTING_KEYS.filter((k) => SETTINGS[k].public) as PublicKey[]

export function defaultSettings(): Settings {
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTINGS[k].default])) as Settings
}

/** `PUT /api/admin/settings`: any subset of the keys, with their typed value. Unknown keys are refused. */
export const settingsUpdateSchema = z
  .strictObject({
    registration_enabled: z.boolean(),
    registration_email_whitelist: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(100),
    password_min_length: z.number().int().min(1).max(128),
    password_require_uppercase: z.boolean(),
    password_require_number: z.boolean(),
    profile_allow_username_change: z.boolean(),
    sso_local_login_enabled: z.boolean(),
    gitlab_url: z.string().trim().max(500),
  } satisfies Record<SettingKey, z.ZodType>)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No setting to update')
export type SettingsUpdateInput = z.input<typeof settingsUpdateSchema>

/** `GET /api/admin/settings` */
export type AdminSettingsResponse = {
  settings: Settings
  /** Last change of each key an admin set. */
  changes: Partial<Record<SettingKey, { updatedAt: string; updatedBy: string | null }>>
}

export type PasswordRule = 'minLength' | 'uppercase' | 'number'

/** Spec 022: the rules of the policy, each with whether `password` satisfies it (for the live checklist too). */
export function passwordChecks(
  password: string,
  policy: Pick<Settings, 'password_min_length' | 'password_require_uppercase' | 'password_require_number'>,
) {
  const checks: { rule: PasswordRule; ok: boolean; min?: number }[] = [
    { rule: 'minLength', ok: password.length >= policy.password_min_length, min: policy.password_min_length },
  ]
  if (policy.password_require_uppercase) checks.push({ rule: 'uppercase', ok: /\p{Lu}/u.test(password) })
  if (policy.password_require_number) checks.push({ rule: 'number', ok: /\p{Nd}/u.test(password) })
  return checks
}

export const PASSWORD_RULE_MESSAGES: Record<PasswordRule, (min: number) => string> = {
  minLength: (min) => `Password must be at least ${min} characters`,
  uppercase: () => 'Password must contain at least one uppercase letter',
  number: () => 'Password must contain at least one number',
}

/** Spec 021: `true` when the whitelist is empty or the e-mail's domain is in it. */
export function emailDomainAllowed(email: string, whitelist: readonly string[]) {
  if (whitelist.length === 0) return true
  const domain = email.trim().toLowerCase().split('@').pop() ?? ''
  return whitelist.some((d) => d.trim().toLowerCase() === domain)
}

import { z } from 'zod'
import { POLICY_ENGINES } from './labs.ts'

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
  /** Spec 091: `none`, `server` (an OPA server at `opa_url`) or `cli` (the `opa` binary, OPA_BIN). */
  lab_policy_engine: { type: 'text', default: 'none', public: false },
  opa_url: { type: 'text', default: '', public: false },
  /** Spec 028: one OIDC provider configured from this page. */
  oidc_enabled: { type: 'boolean', default: false, public: true },
  /** Login button label ("Continuer avec …"). */
  oidc_name: { type: 'text', default: 'SSO', public: true },
  /** Discovery URL (`…/.well-known/openid-configuration`) or issuer URL. */
  oidc_provider_url: { type: 'text', default: '', public: false },
  /** Expected token issuer when it differs from the discovery host (split-horizon). */
  oidc_issuer_url: { type: 'text', default: '', public: false },
  /** Public origin of the callback (default: the app's URL). */
  oidc_redirect_base: { type: 'text', default: '', public: false },
  /** Browser-visible origin replacing the internal one in the authorize URL. */
  oidc_browser_base_url: { type: 'text', default: '', public: false },
  oidc_client_id: { type: 'text', default: '', public: false },
  oidc_client_secret: { type: 'secret', default: '', public: false },
  oidc_scopes: { type: 'text', default: 'openid email profile groups', public: false },
  oidc_group_claim: { type: 'text', default: 'groups', public: false },
  /** Spec 033: when set, members of these groups are admins and everyone else students. */
  oidc_group_admins: { type: 'list', default: [] as string[], public: false },
  /** Spec 030: LDAP / Active Directory. */
  ldap_enabled: { type: 'boolean', default: false, public: true },
  ldap_server_url: { type: 'text', default: '', public: false },
  ldap_bind_dn: { type: 'text', default: '', public: false },
  ldap_bind_password: { type: 'secret', default: '', public: false },
  ldap_user_base_dn: { type: 'text', default: '', public: false },
  ldap_user_filter: { type: 'text', default: '(mail=%s)', public: false },
  ldap_group_base_dn: { type: 'text', default: '', public: false },
  ldap_group_filter: { type: 'text', default: '(|(member=%s)(uniqueMember=%s)(memberUid=%s))', public: false },
} as const

/** Shown as this placeholder; sending it back leaves the stored secret unchanged. */
export const SECRET_PLACEHOLDER = '********'
export const SECRET_SETTING_KEYS = (Object.keys(SETTINGS) as (keyof typeof SETTINGS)[]).filter((k) => SETTINGS[k].type === 'secret')

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

function settingValueSchema(key: SettingKey) {
  const type = SETTINGS[key].type
  if (type === 'boolean') return z.boolean()
  if (type === 'number') return z.number()
  if (type === 'list') return z.array(z.string())
  return z.string()
}

function settingsObjectSchema<K extends SettingKey>(keys: readonly K[]) {
  return z.object(Object.fromEntries(keys.map((k) => [k, settingValueSchema(k)]))) as unknown as z.ZodType<Pick<Settings, K>>
}

/** `GET /api/settings/public` */
export const publicSettingsSchema = settingsObjectSchema(PUBLIC_SETTING_KEYS).meta({ id: 'PublicSettings' })
export const settingsSchema = settingsObjectSchema(SETTING_KEYS).meta({ id: 'Settings' })

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
    lab_policy_engine: z.enum(POLICY_ENGINES),
    opa_url: z.string().trim().max(500),
    oidc_enabled: z.boolean(),
    oidc_name: z.string().trim().max(100),
    oidc_provider_url: z.string().trim().max(500),
    oidc_issuer_url: z.string().trim().max(500),
    oidc_redirect_base: z.string().trim().max(500),
    oidc_browser_base_url: z.string().trim().max(500),
    oidc_client_id: z.string().trim().max(500),
    oidc_client_secret: z.string().max(2000),
    oidc_scopes: z.string().trim().max(500),
    oidc_group_claim: z.string().trim().max(100),
    oidc_group_admins: z.array(z.string().trim().min(1).max(200)).max(100),
    ldap_enabled: z.boolean(),
    ldap_server_url: z.string().trim().max(500),
    ldap_bind_dn: z.string().trim().max(500),
    ldap_bind_password: z.string().max(2000),
    ldap_user_base_dn: z.string().trim().max(500),
    ldap_user_filter: z.string().trim().max(500),
    ldap_group_base_dn: z.string().trim().max(500),
    ldap_group_filter: z.string().trim().max(500),
  } satisfies Record<SettingKey, z.ZodType>)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No setting to update')
export type SettingsUpdateInput = z.input<typeof settingsUpdateSchema>

/** `GET /api/admin/settings` */
export const adminSettingsResponseSchema = z
  .object({
    settings: settingsSchema,
    /** Last change of each key an admin set. */
    changes: z.partialRecord(z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]), z.object({ updatedAt: z.string(), updatedBy: z.string().nullable() })),
  })
  .meta({ id: 'AdminSettings' })
export type AdminSettingsResponse = z.infer<typeof adminSettingsResponseSchema>

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

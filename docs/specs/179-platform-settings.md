# 179 — Platform settings

| Field | Value |
| --- | --- |
| Area | Administration |
| Actors | Admin; everyone (public settings) |
| Related | [020](020-registration-and-password-policy.md), [035](035-profile.md) |

## Model

`SETTINGS` in `@pupitre/shared` lists every key with its type (`boolean`, `number`, `list`) and default. The
`platform_setting` table only stores values an admin changed (JSON value, who, when); each change also writes an
`audit_event` (`settings.update`, with before/after values). The API keeps the values in memory and reloads them after
each change.

| Key | Default | Public | Spec |
| --- | --- | --- | --- |
| `registration_enabled` | `true` | yes | 021 |
| `registration_email_whitelist` | `[]` | no | 021 |
| `password_min_length` | `8` (1–128) | yes | 022 |
| `password_require_uppercase` | `false` | yes | 022 |
| `password_require_number` | `false` | yes | 022 |
| `profile_allow_username_change` | `true` | yes | 035 |
| `sso_local_login_enabled` | `true` | yes | 024 |
| `gitlab_url` | `''` (then `GITLAB_URL`) | no | 092 |

OIDC (`oidc_*`) and LDAP (`ldap_*`) keys: [027](027-sso.md). Secret keys (`oidc_client_secret`, `ldap_bind_password`)
are returned as `********`; sending that placeholder back keeps the stored value.

## API

- `GET /api/settings/public` (anyone) → the public keys with typed values.
- `GET /api/admin/settings` → `{settings, changes: {key: {updatedAt, updatedBy}}}`.
- `PUT /api/admin/settings {key: value, …}` → any subset, typed values; unknown key, wrong type or empty body → 400.
  Returns the same shape as `GET`.

## UI — `/admin/settings` ("Paramètres", sidebar and dashboard)

Cards "📝 Inscription" (switch "Inscriptions ouvertes", "Domaines autorisés (whitelist)" as comma-separated text),
"🔑 Politique de mot de passe" (minimum length, uppercase, number), "👤 Profils utilisateurs" (username change),
"🔐 SSO & Authentification" (local login). Each setting shows "Modifié le …" once changed. "Enregistrer" (top and bottom)
is enabled only when something changed and sends only the changed keys; toast "Paramètres enregistrés".

## Differences from the original

- Typed values (booleans, numbers, lists) instead of strings; defaults are not stored.
- Changes are audited.

## Source

`packages/shared/src/settings.ts`, `apps/api/src/services/settings.ts`, `apps/api/src/services/audit.ts`,
`apps/api/src/db/schema/platform.ts`, `apps/api/src/routes/admin/settings.ts`, `apps/admin/src/routes/Settings.tsx`,
`e2e/global-settings.spec.ts`.

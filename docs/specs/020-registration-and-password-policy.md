# 020 — Registration, registration policy and password policy

| Field | Value |
| --- | --- |
| Area | Authentication |
| Actors | anonymous visitor; admin (configures) |
| Related | [179](179-platform-settings.md), [023](023-local-login.md), [009](009-rate-limiting.md) |

Covers the original 020 (local registration), 021 (registration policy), 022 (password policy) and 024 (local login
toggle).

## UI — registration section of the login page; `/register` (learner app, `RegisterPage` from `@pupitre/auth-ui`)

- Subtitle "Créez votre compte pour commencer". Fields "Nom d'utilisateur", "Email", "Mot de passe", "Confirmer le mot
  de passe". Under the password, a live checklist built from the public settings ("Au moins N caractères", "Au moins une
  majuscule", "Au moins un chiffre"), each ticked ✓ when satisfied. "Les mots de passe ne correspondent pas" while the
  confirmation differs.
- "Créer un compte" ("Création…" while pending). On success the user is signed in and lands on `/courses`.
- Errors: "Email ou nom d'utilisateur déjà utilisé", "L'inscription est réservée à certains domaines d'e-mail.",
  username too short / invalid characters, policy not met, "Trop de tentatives…" (429).
- Registration closed: card "🔒 Inscriptions fermées — Les nouvelles inscriptions sont désactivées par
  l'administrateur." and "Retour à la connexion".
- Signed in → redirected to `/courses` (or the login page's `redirect`).
- The form is the "Créer un compte avec un e-mail" section of the login page (both apps, spec 023), shown while
  registration is open; `/register` is that page with the section open.

## API

`POST /api/auth/sign-up/email {name, username, email, password}` (better-auth). Before better-auth runs, a hook checks,
in order:

1. `registration_enabled`, else 403 `New user registration is currently disabled.`
2. e-mail domain in `registration_email_whitelist` (when not empty; case-insensitive), else 403
   `Registration is restricted to specific email domains.`
3. username present and ≥ 3 characters, else 400 `Username must be at least 3 characters` (better-auth also limits it
   to 64 characters and letters, digits, `_`, `.`).
4. password policy, else 400 with the failing rule: `Password must be at least N characters`,
   `Password must contain at least one uppercase letter`, `Password must contain at least one number`.

E-mail or username already used → better-auth error (`USER_ALREADY_EXISTS…` / `USERNAME_IS_ALREADY_TAKEN`). The new
account is a `student`, active, signed in immediately.

The password policy also applies to `POST /api/auth/change-password` ([035](035-profile.md)).

## Local login toggle (original 024)

`sso_local_login_enabled = false`: `POST /api/auth/sign-in/email|username` answers 403
`Local login is disabled. Please sign in with SSO.` **except for admins**, and the login page shows "La connexion par
mot de passe est désactivée…" with the e-mail section titled "Connexion administrateur" (SSO open at first). The registration section is hidden.

## Acceptance criteria

- Successful registration signs the user in; a duplicate e-mail or username is refused.
- Closed registration: no link, closed card, API 403. Whitelist and password policy are enforced by the API, not only the UI.
- With local login disabled, learners are refused and admins can still sign in.

## Differences from the original

- Endpoint is better-auth's sign-up, not `POST /api/auth/register`; duplicate answers are better-auth's (422/400) instead of 409.
- Admins keep local login in SSO-only mode, so a broken identity provider cannot lock everyone out of the settings.
- Passwords are hashed by better-auth (scrypt) instead of bcrypt; default group and group enrollments come with groups (130, 038).

## Source

`apps/api/src/auth.ts` (`policyGuard`), `packages/shared/src/settings.ts`, `packages/auth-ui/src/RegisterPage.tsx`, `packages/auth-ui/src/RegisterForm.tsx`,
`packages/auth-ui/src/LoginPage.tsx`, `packages/auth-ui/src/PasswordChecklist.tsx`, `e2e/account.spec.ts`,
`e2e/global-settings.spec.ts`.

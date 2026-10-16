# 023 — Local login (username or e-mail + password)

| Field | Value |
| --- | --- |
| Area | Authentication |
| Actors | User with a local account |
| Related | [001](001-roles-and-permissions.md), [016](016-admin-bootstrap.md), [025](025-post-login-landing.md) |

## UI — `/login`

- Full-page card, outside the app shell: logo `pioupitre.png` + "pupitre".
- One field "identifiant ou e-mail", one field "mot de passe", button "Se connecter" ("Connexion…" and disabled while pending).
- Errors in a red banner (`role="alert"`):
  - an empty field → "Veuillez remplir tous les champs" (no request sent);
  - bad credentials → "Identifiant ou mot de passe incorrect";
  - any other error → the API message.
- A user already signed in is sent straight to their landing page ([025](025-post-login-landing.md)).

## Identifier

- Contains `@` → `POST /api/auth/sign-in/email {email, password}`.
- Otherwise → `POST /api/auth/sign-in/username {username, password}` (better-auth `username` plugin; usernames are unique and case-insensitive).

On success better-auth sets the session cookie and returns the user.

## Failures

All of the following answer 401 with the same code, so a response never reveals whether an account exists or is deactivated:

| Case | Code |
| --- | --- |
| unknown e-mail / wrong password | `INVALID_EMAIL_OR_PASSWORD` |
| unknown username / wrong password | `INVALID_USERNAME_OR_PASSWORD` |
| deactivated account, correct password | `INVALID_EMAIL_OR_PASSWORD` (session creation refused by a database hook) |

## Acceptance criteria

- A student logs in with their e-mail, or with their username, and lands on `/courses`.
- Wrong password, unknown account and deactivated account show the same message and stay on `/login`.
- Submitting with an empty field shows "Veuillez remplir tous les champs".

## Differences from the original

- Endpoints are better-auth's (`/api/auth/sign-in/email|username`) instead of `POST /api/auth/login`; no token in the response body.
- The error message is French and chosen by the UI from the error code.
- Not implemented yet: SSO / LDAP tabs, the "Pas encore de compte ? Créer un compte" link (registration), the local-login toggle (024), rate limiting (009), default group sync and `lastLoginAt`.

## Source

`apps/app/src/routes/Login.tsx`, `apps/app/src/lib/auth-client.ts`, `apps/api/src/auth.ts`, `e2e/login.spec.ts`.

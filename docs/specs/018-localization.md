# 018 — Localization

| Field | Value |
| --- | --- |
| Area | UI |
| Actors | everyone |
| Related | [004](004-frontends-and-routing.md) |

## Summary

Every frontend string comes from a translation catalogue (`@pupitre/i18n`, i18next +
react-i18next). French is the default and the reference language; English is the second.

## Languages and selection

- Supported: `fr` (default, fallback), `en`.
- A language selector (`<select>` labelled "Langue" / "Language", options named in their own language: "Français", "English") is shown on the login page and in the header of both frontends.
- The choice is stored in `localStorage.locale` and shared by both frontends (same origin). No stored value → French.
- `<html lang>` is set before first paint (inline script in `index.html`) and updated on every change.
- Switching applies immediately, without reload, including to an error banner already displayed.

## Catalogue

| Namespace | Content |
| --- | --- |
| `common` (default) | shell (sign in, log out, "⚙ Admin", back to catalogue), access denied, language selector, role and difficulty labels |
| `auth` | login page and its errors |
| `app` | learner app pages |
| `admin` | admin app shell and pages |

- Messages are TypeScript modules in `packages/i18n/src/locales/<lang>/index.ts`. `fr` is the reference; every other locale is checked with `satisfies Messages<typeof fr.<ns>>`, so a missing or extra key fails `pnpm typecheck`.
- `t()` keys are typed (i18next `CustomTypeOptions`): an unknown key fails `pnpm typecheck`.
- Components import `useTranslation` / `Trans` from `@pupitre/i18n` (one shared i18next instance).
- Dates and numbers: use i18next's built-in formatters in messages (`{{date, datetime}}`, `{{count, number}}`), which format for the current language (`fr-FR` style for French).

## Server messages

- Known API error codes are mapped to translated messages by the UI (e.g. `INVALID_EMAIL_OR_PASSWORD` → `auth:login.errors.invalidCredentials`).
- Other API error messages are displayed as returned (English).

## Acceptance criteria

- A first visit is in French with `<html lang="fr">`.
- Choosing English on the login page translates it at once, sets `<html lang="en">`, and is still English after reload and in the admin app.
- Choosing French in the admin app makes the learner app French too.

## Differences from the original

- The original UI was French-only with hard-coded strings; this implements its rebuild note (externalised strings, French default).

## Source

`packages/i18n/src/`, `packages/auth-ui/src/LoginPage.tsx`, `apps/*/src/main.tsx`, `apps/*/index.html`, `e2e/i18n.spec.ts`.

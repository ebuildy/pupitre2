# 025 — Post-login redirect and landing page

| Field | Value |
| --- | --- |
| Area | Authentication / UX |
| Related | [001](001-roles-and-permissions.md), [023](023-local-login.md) |

## Rules

- Protected pages redirect signed-out visitors to their app's login page (`/login` or `/admin/login`) with `?redirect=<origin-absolute path + query>`.
- After login (or when opening `/login` while signed in), `landingPath(role, redirect)` from `@pupitre/shared` decides where to go:
  - `redirect` is a local path — starts with `/`, and not with `//` or `/\` → go there;
  - otherwise admins → `/admin` (the admin app), everyone else → `/courses`.
- The target may belong to the other frontend: `useGoTo()` navigates client-side within the current app and does a full page load otherwise. The same rule applies from either login page (a student logging in on `/admin/login` lands on `/courses`).
- `/` and `/dashboard` redirect to `/courses`.

## Acceptance criteria

- Visiting `/my-courses?tab=done` signed out, then logging in, ends on `/my-courses?tab=done`.
- `redirect` values `//evil.example`, `/\evil.example` and `https://evil.example` are ignored (→ `/courses`).
- The admin lands on `/admin`, a student on `/courses`.

## Differences from the original

- Not implemented yet: SSO callback and post-registration redirects (no SSO or registration yet).

## Source

`packages/shared/src/index.ts`, `packages/auth-ui/src/LoginPage.tsx`, `packages/auth-ui/src/RequireAuth.tsx`, `packages/auth-ui/src/navigation.ts`.

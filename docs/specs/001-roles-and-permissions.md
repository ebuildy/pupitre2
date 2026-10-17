# 001 — Roles, account status and guards

| Field | Value |
| --- | --- |
| Area | Platform / authentication |
| Actors | Anonymous visitor, Student, Manager, Admin |
| Related | [016](016-admin-bootstrap.md), [023](023-local-login.md), [025](025-post-login-landing.md), [034](034-current-user.md) |

## Summary

Every account has exactly one platform role and an active flag. Both are columns of the
better-auth `user` table, declared as `additionalFields` with `input: false`: they can never be
set through sign-up or update-user, only by the server.

## Fields

| Field | Column | Values | Default |
| --- | --- | --- | --- |
| `role` | `role` | `student`, `manager`, `admin` (`ROLES` in `@pupitre/shared`) | `student` |
| `isActive` | `is_active` | boolean | `true` |

## Sessions

- Sessions are better-auth database sessions in an HttpOnly cookie (`better-auth.session_token`), same origin as the app (the app proxies `/api`).
- A deactivated user cannot create a session ([023](023-local-login.md)).
- A deactivated user's existing sessions are ignored: every `/api/*` route sees them as signed out, and `GET /api/auth/get-session` returns `null`.

## API guards

| Guard | Accepts | Rejects with |
| --- | --- | --- |
| public | anyone | — |
| `requireAuth` | an active session | 401 `Authentication required` |
| `requireRole('admin')` | admin | 401 if signed out, else 403 `Admin access required` |
| `requireRole('manager')` | manager | 403 `Manager access required` |
| `requireRole('manager', 'admin')` | manager or admin | 403 `Manager or admin access required` |

Errors use the `{ "error": "<message>" }` envelope.

Every `/api/admin/*` route is behind `requireRole('admin')`, applied before routing: a non-admin gets 401/403 even for an unknown path ([004](004-frontends-and-routing.md)).

## Page guards

`<RequireAuth roles?={[...]}>` wraps protected routes:

- signed out → redirect to the current app's login page (`/login` or `/admin/login`) with `?redirect=<origin-absolute path + query>`;
- signed in without one of `roles` → "Accès refusé" page with a "Retour au catalogue" button (→ `/courses`).

Current routes: `/my-courses` (any signed-in user), the whole admin app `/admin/*` (admin). `/courses` is public.

## Role-dependent UI

- Top bar shows "⚙ Admin" (→ `/admin`) for admins only.

## Acceptance criteria

- Sign-up with `role: "admin"` or `isActive: false` in the body creates a `student`, active account.
- A student opening `/admin` sees "Accès refusé".
- Deactivating a user (`is_active = 0`) makes their open session behave as signed out.

## Differences from the original

- Sessions are server-side (better-auth) instead of stateless JWTs; there is no `localStorage` token (the original's rebuild note).
- The role is read from the database on each request, so role changes apply immediately instead of at next login.
- Manager scope follows spec 191: a user manages the groups where their membership role is `manager` ([140](140-manager-space.md)); `/manager/**` is in the learner app. There is no internal service auth (one API).

## Source

`apps/api/src/auth.ts`, `apps/api/src/middleware/session.ts`, `apps/api/src/app.ts`,
`apps/api/src/routes/admin/index.ts`, `packages/auth-ui/src/RequireAuth.tsx`, `packages/shared/src/index.ts`.

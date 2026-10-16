# 026 — Logout

| Field | Value |
| --- | --- |
| Area | Authentication |
| Actors | signed-in user |

## Behaviour

- "Déconnexion" button in the top bar of both frontends (`signOutTo()` from `@pupitre/auth-ui`).
- Calls `POST /api/auth/sign-out`: the session row is deleted server-side and the cookie cleared.
- Then does a full page load of the app's login page (`/login`, or `/admin/login` from the admin app), which drops all client state (and avoids `/login` seeing a stale session and bouncing back).

## Acceptance criteria

- After logout the user is on `/login`; opening a protected page redirects to login again.
- `GET /api/me` with the old cookie returns 401.

## Differences from the original

- The session is revoked on the server (the original's JWT stayed valid until expiry).
- The drawer entry comes with the navigation shell (011).

## Source

`packages/auth-ui/src/auth-client.ts`, `apps/app/src/routes/Layout.tsx`, `apps/admin/src/routes/AdminLayout.tsx`.

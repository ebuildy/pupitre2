# 026 — Logout

| Field | Value |
| --- | --- |
| Area | Authentication |
| Actors | signed-in user |

## Behaviour

- "Déconnexion" button in the top bar.
- Calls `POST /api/auth/sign-out`: the session row is deleted server-side and the cookie cleared.
- Then does a full page load of `/login`, which drops all client state (and avoids `/login` seeing a stale session and bouncing back).

## Acceptance criteria

- After logout the user is on `/login`; opening a protected page redirects to login again.
- `GET /api/me` with the old cookie returns 401.

## Differences from the original

- The session is revoked on the server (the original's JWT stayed valid until expiry).
- The drawer entry comes with the navigation shell (011).

## Source

`apps/app/src/routes/Layout.tsx`.

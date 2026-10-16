# 034 — Current user ("me")

| Field | Value |
| --- | --- |
| Area | Account |
| Actors | signed-in user |
| Related | [001](001-roles-and-permissions.md) |

## API

`GET /api/me` (`requireAuth`) → `200`, type `MeResponse` in `@pupitre/shared`:

```json
{
  "id": "…",
  "username": "admin",
  "email": "admin@pupitre.local",
  "name": "admin",
  "role": "student|manager|admin",
  "image": "https://…|null",
  "isActive": true,
  "createdAt": "2026-10-16T16:23:49.025Z"
}
```

Signed out, or deactivated → 401 `{"error":"Authentication required"}`.

## Acceptance criteria

- Without a session → 401; with a manager's session → the manager's row with `role: "manager"`.

## Differences from the original

- Path is `/api/me`, not `/api/auth/me`: `/api/auth/*` belongs to better-auth.
- `avatarUrl` is better-auth's `image`; `bio` and `authProvider` come with the profile and SSO features.
- The web app reads the session with better-auth's `useSession()` (which includes `role`); `/api/me` is for API consumers.

## Source

`apps/api/src/routes/me.ts`.

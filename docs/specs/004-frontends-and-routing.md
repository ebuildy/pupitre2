# 004 — Frontends, routing and admin API prefix

| Field | Value |
| --- | --- |
| Area | Platform |
| Related | [001](001-roles-and-permissions.md), [023](023-local-login.md), [025](025-post-login-landing.md) |

## Summary

Two frontends and the API share one hostname, so the better-auth session cookie is valid
everywhere and links between frontends are plain paths.

| Path | Owner | Dev server |
| --- | --- | --- |
| `/api/*`, `/uploads/*` | API (`apps/api`) | `:3001` |
| `/admin`, `/admin/*` | admin app (`apps/admin`, Vite `base: '/admin/'`, router `basename: '/admin'`) | `:3002` |
| everything else | learner app (`apps/app`) | `:3000` |

In development the learner app's Vite server (`:3000`) is the entry point: it proxies `/api` and
`/uploads` to the API, and `/admin` (including the HMR websocket) to the admin app; `/admin` is
rewritten to `/admin/`. Production serving (reverse proxy or static hosting) must reproduce the
same table. The API's probes and metrics are on another port, never routed to the web ([006](006-health-and-metrics.md)).

## API prefixes

| Prefix | Used by | Guard |
| --- | --- | --- |
| `/api/auth/*` | both frontends, through `authClient` (`@pupitre/auth-ui`) | better-auth |
| `/api/admin/*` | admin app only, through `adminApi` (`hc<AdminAppType>('/api/admin')`) | `requireRole('admin')` on the whole prefix, before routing |
| other `/api/*` | learner app, through `api` (`hc<AppType>('/')`) | per route |

- Every endpoint the admin app needs lives under `/api/admin/*`, even when a learner endpoint returns similar data, so admin and learner traffic are always distinguishable (logs, rate limits, ingress rules).
- `AppType` and `AdminAppType` are separate: the learner app's client cannot see admin endpoints and vice versa.

## Shared login

`@pupitre/auth-ui` holds the login page, the better-auth client, `RequireAuth`, "Accès refusé",
`signOutTo()` and `useGoTo()`. Each frontend mounts `LoginPage` on its own `/login`
(`/login`, `/admin/login`). `redirect` values and landing paths are origin-absolute; `useGoTo()`
navigates client-side inside the current app and does a full page load across apps.

## Acceptance criteria

- Signed out, `/admin/` → `/admin/login?redirect=%2Fadmin%2F`; logging in as admin returns to the admin dashboard.
- Logging in on `/login` as admin opens the admin app; "Retour au catalogue" and "⚙ Admin" switch apps without logging in again.
- `/api/admin/<anything>`: 401 signed out, 403 `Admin access required` for a student or manager, normal routing (404 if unknown) for an admin.

## Differences from the original

- The original split `/api/*` between two backend services; here one API serves everything, and the prefix split is between frontends (`/api/admin/*` vs the rest).
- The original admin pages were part of the single frontend; here they are a separate app.

## Source

`apps/app/vite.config.ts`, `apps/admin/vite.config.ts`, `apps/admin/src/router.tsx`, `apps/api/src/app.ts`,
`apps/api/src/routes/admin/index.ts`, `apps/admin/src/lib/api.ts`, `packages/auth-ui/src/navigation.ts`.

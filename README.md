# pupitre

Rewrite of [pupitre](../../pupitre). Original functional specs: `../../pupitre/docs/spec`. Specs of this rewrite, as implemented: [`docs/specs`](docs/specs).

## Stack

| Path | What |
| --- | --- |
| `apps/api` | Hono on Node, Drizzle ORM + SQLite (better-sqlite3), better-auth |
| `apps/app` | Learner frontend, served at `/`: React 19 + Vite, React Router, Tailwind CSS v4, Hono RPC client |
| `apps/admin` | Admin frontend, served at `/admin/` (Vite `base`), same stack; only calls `/api/admin/*` |
| `packages/auth-ui` | Shared login page, better-auth client, `RequireAuth`, "Accès refusé", cross-app navigation |
| `packages/i18n` | i18next setup, French/English catalogues, typed keys, `LanguageSwitcher` |
| `packages/shared` | Wire types / schemas / helpers shared by every package |
| `e2e` | Playwright tests (they start both servers themselves) |

The browser only talks to one origin (spec 004): the learner app's Vite server proxies `/api/*` and `/health` to the API and `/admin/*` to the admin app's Vite server, so both frontends share the session cookie. See [docs/specs/004](docs/specs/004-frontends-and-routing.md).

## Getting started

```sh
pnpm install
pnpm exec playwright install chromium   # once
pnpm dev                                # http://localhost:3000 (admin: /admin/), api :3001, admin vite :3002
```

API config is read from env vars (and `apps/api/.env`, see `.env.example`). Migrations run at API startup, then the `admin` account (`admin@pupitre.local`) is ensured: password from `ADMIN_PASSWORD` / `ADMIN_PASSWORD_FILE`, else `Admin@1234` on first start only.

## Scripts

| Command | |
| --- | --- |
| `pnpm dev` | API (tsx watch) + app + admin (Vite) in parallel |
| `pnpm typecheck` | `tsc` across every package and the e2e tests |
| `pnpm build` | Production build of both frontends |
| `pnpm test:e2e` | Playwright (ports 3100 app / 3101 api / 3102 admin, fresh `apps/api/data/e2e.db`) |
| `pnpm db:generate` | Drizzle migration from schema changes (`apps/api/drizzle/`) |
| `pnpm db:migrate` | Apply migrations without starting the API |
| `pnpm auth:generate` | Regenerate `apps/api/src/db/schema/auth.ts` after changing better-auth plugins/config, then `pnpm db:generate` |

## Conventions

- Errors are `{ "error": "<message>" }` (spec 005); unknown routes return 404 in that shape.
- `c.var.user` / `c.var.session` are filled on every `/api/*` request (deactivated users count as signed out); guard routes with `requireAuth` or `requireRole('admin')`.
- Users have a `role` (`student` | `manager` | `admin`) and `isActive`, declared as better-auth `additionalFields` with `input: false`.
- Pages: wrap in `<RequireAuth roles={[...]}>` (redirects to the current app's `/login?redirect=…`, or shows "Accès refusé").
- e2e: use the `createUser({ role, isActive })` fixture from `e2e/fixtures.ts`.
- Learner endpoints: chain routers onto `routes` in `apps/api/src/app.ts` (`AppType`, client `api` in `apps/app/src/lib/api.ts`).
- Admin endpoints: chain routers onto `adminRoutes` in `apps/api/src/routes/admin/index.ts`. They live under `/api/admin/*`, are admin-only before routing, and are typed separately (`AdminAppType`, client `adminApi` in `apps/admin/src/lib/api.ts`).
- UI text: never hard-code it. Add the key to `packages/i18n/src/locales/fr/index.ts` (reference) and `en/index.ts`, then `const { t } = useTranslation('<ns>')` from `@pupitre/i18n` (spec 018). Missing translations or unknown keys fail `pnpm typecheck`.
- Pages use `useGoTo()` from `@pupitre/auth-ui` for origin-absolute paths: client-side within the current app, full page load across apps.

# pupitre

Rewrite of [pupitre](../../pupitre). Functional specs: `../../pupitre/docs/spec`.

## Stack

| Path | What |
| --- | --- |
| `apps/api` | Hono on Node, Drizzle ORM + SQLite (better-sqlite3), better-auth |
| `apps/app` | React 19 + Vite, React Router, Tailwind CSS v4, better-auth client, Hono RPC client |
| `packages/shared` | Wire types / schemas shared by both apps |
| `e2e` | Playwright tests (they start both servers themselves) |

The browser only talks to the app origin. `/api/*` and `/health` are proxied by Vite to the API (spec 004), so auth cookies are same-origin.

## Getting started

```sh
pnpm install
pnpm exec playwright install chromium   # once
pnpm dev                                # app http://localhost:3000, api http://localhost:3001
```

API config is read from env vars (and `apps/api/.env`, see `.env.example`). Migrations run at API startup.

## Scripts

| Command | |
| --- | --- |
| `pnpm dev` | API (tsx watch) + app (Vite) in parallel |
| `pnpm typecheck` | `tsc` across every package and the e2e tests |
| `pnpm build` | Production build of the app |
| `pnpm test:e2e` | Playwright (ports 3100/3101, fresh `apps/api/data/e2e.db`) |
| `pnpm db:generate` | Drizzle migration from schema changes (`apps/api/drizzle/`) |
| `pnpm db:migrate` | Apply migrations without starting the API |
| `pnpm auth:generate` | Regenerate `apps/api/src/db/schema/auth.ts` after changing better-auth plugins/config, then `pnpm db:generate` |

## Conventions

- Errors are `{ "error": "<message>" }` (spec 005); unknown routes return 404 in that shape.
- `c.var.user` / `c.var.session` are filled on every `/api/*` request; use `requireAuth` to guard a route.
- Chain feature routers onto `routes` in `apps/api/src/app.ts` so `AppType` exposes them to `api` in `apps/app/src/lib/api.ts`.

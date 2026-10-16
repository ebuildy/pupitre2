# AGENTS.md

Instructions for AI agents working on this repository. Read this first; `README.md` has the
human-oriented overview.

## Project

pupitre is an e-learning platform, rewritten from `../../pupitre` (Go + Astro). pnpm monorepo, Node 24,
TypeScript everywhere (`tsc` 7, strict, `.ts` extensions in relative imports).

| Path | What |
| --- | --- |
| `apps/api` | Hono on Node, Drizzle ORM + SQLite (better-sqlite3), better-auth |
| `apps/app` | Learner frontend at `/` (React 19, Vite, React Router, Tailwind v4) |
| `apps/admin` | Admin frontend at `/admin/` (same stack, Vite `base: '/admin/'`, router `basename: '/admin'`) |
| `packages/auth-ui` | Shared login page, better-auth client, `RequireAuth`, `AccessDenied`, `signOutTo`, `useGoTo` |
| `packages/ui` | Shared UI pieces: `unwrap`, course badges, category labels, `useDebouncedValue` |
| `packages/i18n` | i18next setup, `fr`/`en` catalogues, `LanguageSwitcher` |
| `packages/shared` | Types, constants and pure helpers used by API and frontends |
| `e2e` | Playwright tests |
| `docs/specs` | Specs of this rewrite, as implemented |

Everything is served on one origin (spec 004): the learner app's Vite server proxies `/api` and
`/health` to the API and `/admin` to the admin app. Never call the API on another origin.

## Workflow

1. **Specs first.** Before a feature, read the original specs in `../../pupitre/docs/spec/<NNN>-*.md`
   and the existing ones in `docs/specs/`. Ask the user about real choices (scope, product
   behaviour) instead of guessing.
2. **Branch per feature**: `git switch -c feat/<name>` from `master`.
3. Implement, with e2e tests (see below).
4. **Document** the behaviour as implemented in `docs/specs/<NNN>-<slug>.md`, same number as the
   original spec, ending with "Differences from the original" and "Source". Add it to
   `docs/specs/README.md` (sorted by number). Update `README.md` when commands or conventions change.
5. **Verify** before saying it is done: `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`
   (and `pnpm test:e2e --repeat-each 4` for new tests, to catch flakiness).
6. **Commit and merge only when the user asks**: commit on the feature branch, then
   `git switch master && git merge --ff-only feat/<name>`. The default branch is `master`. No remote yet.

## Commands

```sh
pnpm install
pnpm dev            # http://localhost:3000 (admin at /admin/), API :3001, admin Vite :3002
pnpm typecheck      # every package + e2e
pnpm build          # both frontends
pnpm test:e2e       # Playwright, starts its own servers (see below)
pnpm db:generate    # Drizzle migration from schema changes
pnpm db:seed        # load mock data into the dev database (pnpm db:reset: start from scratch)
pnpm auth:generate  # regenerate the better-auth schema after changing auth config/plugins
```

- New native dependency with a build script: allow it in `pnpm-workspace.yaml` (`allowBuilds`).
- The shell is zsh: quote globs and arguments like `'@pupitre/shared@workspace:*'`, and do not rely on
  word-splitting of unquoted variables (`$H`).
- Do not leave dev servers running; do not `pkill` broad patterns (the user may have their own Vite running).

## API (apps/api)

- Errors are always `{ "error": "<message>" }` (spec 005). Throw `HTTPException(status, { message })`; `onError` formats it.
- Auth: better-auth at `/api/auth/*`. Never hand-edit `src/db/schema/auth.ts`: change `src/auth.ts`, run
  `pnpm auth:generate`, then `pnpm db:generate --name <change>`.
- User fields that clients must not set (`role`, `isActive`) are `additionalFields` with `input: false`.
- Schema changes: edit `src/db/schema/*`, run `pnpm db:generate --name <change>`, commit the SQL. Migrations run at startup.
  drizzle-kit asks interactively about renames (fails without a TTY): split the change (add the new column, then drop the old
  one in a second generate) and put any data migration SQL at the end of the first file. Never edit a migration that
  may already be applied (anything merged into `master`).
- Validate inputs with `validate('json' | 'query', schema)` from `src/lib/validate.ts` (answers 400 `{ error }`). Shared
  request schemas and response types live in `@pupitre/shared`; type responses with `c.json<T>(...)`.
- Business queries go in `src/services/`, routes stay thin.
- Transactions: better-sqlite3 is synchronous, so `db.transaction(cb)` needs a **synchronous** callback using the
  `.all()` / `.get()` / `.run()` query methods (an `async` callback commits before its awaits run). See `services/xp.ts`.
- Schema columns: call the builder helpers (`createdAt()`, `timestamps()`) per table; never share a column builder
  object between tables (it keeps the column name of the first table).
- Anything a learner earns goes through `awardXp()` / `completeCourse()` (`services/xp.ts`): at most once per thing
  earned, history kept when the course is deleted (spec 103).
- Guards: `requireAuth`, `requireRole('admin' | 'manager', …)` from `src/middleware/session.ts`. `c.var.user` is
  `null` for signed-out and deactivated users.
- Learner endpoints: chain onto `routes` in `src/app.ts` (typed client `api` in `apps/app`).
- **Admin endpoints**: always under `/api/admin/*`, chained onto `adminRoutes` in `src/routes/admin/index.ts`
  (admin-only before routing, typed client `adminApi` in `apps/admin`). Never call learner endpoints from the
  admin app or the reverse; duplicate the endpoint under `/api/admin` if both need it.

## Frontends (apps/app, apps/admin)

- Data fetching: TanStack Query + the typed Hono clients (`api` / `adminApi`), unwrapped with `unwrap()` from
  `@pupitre/ui` (throws `ApiRequestError` with the API's `error` message). After a mutation, invalidate the affected
  query keys.
- Keep filters that users may want to share in the URL search params.
- Auth UI comes from `@pupitre/auth-ui`; do not reimplement login, guards or logout in an app.
- Protect pages with `<RequireAuth roles={[…]}>`.
- Paths that may cross apps (`/courses` ↔ `/admin/…`) are origin-absolute: navigate with `useGoTo()`, link
  with a plain `<a href>` (full page load). `<Link>` / `navigate()` only inside the current app.
- Logout: `signOutTo('/login')` (or `'/admin/login'`); it does a full page load on purpose.
- Tailwind: a package with components must be listed with `@source` in each app's `src/index.css`.
- Mock data (spec 015): `apps/api/src/fixtures` (faker, French locale, fixed seed). `pnpm dev` loads it; `pnpm db:seed`,
  `pnpm db:reset`. When a feature adds a table, add realistic fixtures for it, keeping them deterministic (seeded faker,
  fixed reference date, stable ordering before random picks) and idempotent (match by slug/e-mail, `onConflictDoNothing`).
  Known accounts: `etudiant` / `Student@1234`, `manager` / `Manager@1234`, `inactif` (deactivated).

## Localization (locales)

All UI text is translated (spec 018). **Never hard-code a user-visible string**, including
`aria-label`, `placeholder`, `title` and error messages.

- Catalogues: `packages/i18n/src/locales/fr/index.ts` (reference, default language) and
  `packages/i18n/src/locales/en/index.ts`. Add every key to **both**; `en` is checked with
  `satisfies Messages<typeof fr.<ns>>`, so a missing or extra key fails `pnpm typecheck`.
- Namespaces: `common` (default: shell, shared words, roles, difficulty), `auth`, `app` (learner pages),
  `admin` (admin pages). Add a namespace to both locales and to `namespaces` in `packages/i18n/src/i18n.ts`.
- In components: `import { useTranslation } from '@pupitre/i18n'` (never from `react-i18next` directly),
  `const { t } = useTranslation('app')`, `t('catalogue.title')`. To use another namespace's keys, list it:
  `useTranslation(['app', 'common'])` then `t('common:cancel')` (otherwise typecheck fails).
  Keys are typed: an unknown key fails typecheck.
- Write the French first, reusing the original app's wording (the original specs quote it), then the English.
- Interpolation `{{name}}`; plurals with `_one` / `_other` suffixes; dates and numbers with i18next formatters
  (`{{date, datetime}}`, `{{count, number}}`), never `toLocaleString()` with a hard-coded locale.
- Store translation **keys** in state, not translated strings, so text follows a language change.
- API errors: map known error codes to keys in the UI; display other API messages as returned.

## End-to-end tests (e2e)

Playwright is the only test runner. Every feature ships with e2e tests covering its acceptance criteria.

- `pnpm test:e2e` starts its own API (`:3101`, fresh `apps/api/data/e2e.db`, `ADMIN_PASSWORD` from `e2e/env.ts`),
  learner app (`:3100`) and admin app (`:3102`); it does not interfere with `pnpm dev`. Tests use relative URLs
  (`page.goto('/login')`, `page.goto('/admin/')`).
- Import `test`, `expect` and `login` from `./fixtures.ts`, never from another spec file.
- Users: `const user = await createUser({ role: 'manager', isActive: false })` creates a unique user through the
  real sign-up endpoint (password `user.password`). The bootstrapped admin is `admin` / `ADMIN_PASSWORD`.
- `await signIn(page, user)` logs in and waits until the session is set; use it before `page.goto(...)` or
  `page.request` calls (navigating away right after `login()` can cancel the sign-in).
- Courses and categories: `await createCategory({ title, parentId })`, `await createCourse({ categoryId, visibility, status, ... })` (admin API; defaults: unique slug/title, published,
  public). `adminRequest` is an API client signed in as admin.
- The catalogue is shared by parallel tests: put a `uid()` token in titles/categories and filter with `?search=<token>`.
- Tests run in parallel against one database: create your own users, never depend on data from another test,
  use unique values.
- Select by role and accessible name (`getByRole('button', { name: 'Se connecter' })`, `getByLabel(...)`),
  `data-testid` only when there is no accessible name. The default language is French, so assertions use the
  French catalogue text; test English explicitly (see `e2e/i18n.spec.ts`).
- API checks: `page.request` shares the page's cookies (`await page.request.get('/api/me')`).
- Use web-first assertions (`await expect(locator).toBeVisible()`, `toHaveURL`); no fixed waits.
- `toHaveURL` for admin app roots: `/\/admin\/?$/` (the router may drop the trailing slash).
- Direct database access from tests (`node:sqlite`) must open the file with a busy `timeout`.
- One spec file per area (`login`, `admin`, `i18n`, …); name tests after the behaviour, reference the spec number
  in `describe`.

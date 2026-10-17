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
| `packages/ui` | shadcn/ui components, pupitre theme (`globals.css`), page blocks, badges, `unwrap`, `ThemeToggle`, `LanguageSwitcher` |
| `packages/i18n` | i18next setup, `fr`/`en` catalogues |
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
- Course content (spec 053): module bodies come from `body` or a source read through `contentLoader` (`src/content/loader.ts`;
  fake loader = `apps/api/content-samples/<repo>/<path>`). Render markdown only with `renderMarkdown` / `renderFragment`
  (sanitized); the front end displays that HTML. Never put correct answers or feedback in a learner view before
  submission (`quizView`). Progress, attempts and submissions reference module ids. Quiz documents are validated by
  `quizDocumentSchema`; add sample quizzes there and check them with it.
- Course access is a set of `enrollment_grant` rows (source + `via`). Group grants are maintained by `services/groups.ts`
  (`addMember`, `removeMember`, `enrollGroup`, `unenrollGroup`); never insert or delete `group` grants elsewhere.
- Correlated subqueries in a one-table select: write the outer column qualified (`"user"."id"`), Drizzle drops the
  table name there.
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
- Report mutation results with toasts (spec 012): `toast.success(t('…'))` / `toast.error(err.message)`, `toast` from
  `@pupitre/ui`.
- Platform settings the UI needs before sign-in come from `usePublicSettings()` (`@pupitre/auth-ui`); a new setting is
  declared in `SETTINGS` and `settingsUpdateSchema` (`packages/shared/src/settings.ts`) and read with `getSettings()` in the API.
- Keep filters that users may want to share in the URL search params.
- Auth UI comes from `@pupitre/auth-ui`; do not reimplement login, guards or logout in an app.
- Protect pages with `<RequireAuth roles={[…]}>`.
- Paths that may cross apps (`/courses` ↔ `/admin/…`) are origin-absolute: navigate with `useGoTo()`, link
  with a plain `<a href>` (full page load). `<Link>` / `navigate()` only inside the current app.
- Logout: `signOutTo('/login')` (or `'/admin/login'`); it does a full page load on purpose.
- UI (spec 010): build with the shadcn/ui components of `packages/ui` (`@pupitre/ui/components/ui/<name>`) and the
  pupitre blocks (`PageHeader`, `EmptyState`, `LoadingState`, `ErrorState`, badges). Use theme tokens (`bg-primary`,
  `text-muted-foreground`, `border-border`, `bg-success-soft`, `text-xp`…), never raw palette colors (`zinc-500`,
  `blue-600`), so light and dark both work. Keep native `<select>` (`NativeSelect`) in forms.
- New shadcn component: `cd packages/ui && pnpm dlx shadcn@latest add <name>`. The CLI writes `import { cn } from "cn"`:
  replace it with `@pupitre/ui/lib/utils`. Editing generated components (variants…) is expected.
- Tailwind: `packages/ui/src/styles/globals.css` lists the shared packages with `@source`; a new package with
  components must be added there.
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
- Content: `await setModules(course.id, [...])` (admin API `PUT …/modules`) with inline bodies, or sources pointing at
  `content-samples` repos (e.g. `https://git.example.com/pupitre/pupitre-linux.git`).
- Groups: `await createGroup({ name?, parentId? })` and `await addMember(groupId, userId, 'member' | 'manager')` (admin API).
- Courses and categories: `await createCategory({ title, parentId })`, `await createCourse({ categoryId, visibility, status, ... })` (admin API; defaults: unique slug/title, published,
  public). `adminRequest` is an API client signed in as admin.
- The catalogue is shared by parallel tests: put a `uid()` token in titles/categories and filter with `?search=<token>`.
- Tests run in parallel against one database: create your own users, never depend on data from another test,
  use unique values.
- Select by role and accessible name (`getByRole('button', { name: 'Se connecter' })`, `getByLabel(...)`),
  `data-testid` only when there is no accessible name. The default language is French, so assertions use the
  French catalogue text; test English explicitly (see `e2e/i18n.spec.ts`).
- API checks: `page.request` shares the page's cookies (`await page.request.get('/api/me')`).
- In React effects, use a braced body: `useEffect(() => { window.scrollTo(0, 0) }, …)`. Scroll methods return a Promise in
  recent browsers, and an effect returning a non-function crashes React ("destroy is not a function").
- Tests that change platform settings (spec 179: registration, password policy, local login…) go in
  `e2e/global-settings.spec.ts`: the `global-settings` project runs it alone, after the other tests, one worker, and
  each test restores the defaults in `afterEach`. Run it alone with `pnpm test:e2e --project global-settings --no-deps`.
- Sign-in is rate-limited per client IP (spec 009): every test gets its own random `X-Forwarded-For`. A second page or
  API client must get one too: `browser.newPage({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } })`,
  `await apiClient()` (both from `./fixtures.ts`).
- Accessible names match by substring: use `exact: true` for short names (`{ name: 'Enregistrer', exact: true }`).
- Use web-first assertions (`await expect(locator).toBeVisible()`, `toHaveURL`); no fixed waits.
- `toHaveURL` for admin app roots: `/\/admin\/?$/` (the router may drop the trailing slash).
- Direct database access from tests (`node:sqlite`) must open the file with a busy `timeout`.
- One spec file per area (`login`, `admin`, `i18n`, …); name tests after the behaviour, reference the spec number
  in `describe`.

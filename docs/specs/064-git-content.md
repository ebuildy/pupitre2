# 064 — Git-sourced content, module index files and the git cache

| Field | Value |
| --- | --- |
| Area | Content |
| Actors | Admin (author), operator |
| Related | [053](053-course-content-and-quizzes.md), [169](169-course-authoring.md) |

Covers the original 064 (git-sourced content), 065 (module index files), 066 (git cache and credentials) and 177
(git cache administration).

## Loader (`CONTENT_LOADER`)

- `git`: module files (`repo`, `ref`, `path`) are read from shallow clones (`git clone --depth 1 --single-branch`; the
  `git` binary must be installed). `fake`: only `CONTENT_SAMPLES_DIR` (`content-samples/<repo name>/<path>`). `auto`
  (default): repositories present in `CONTENT_SAMPLES_DIR` are read from it, the others from git.
- Cache (`GIT_CACHE_DIR`, default `./data/git-cache`): one clone per URL + ref, reused for `GIT_CACHE_TTL_MINUTES`
  (default 10) then cloned again on next use; concurrent reads share one clone; a failed clone is not retried for 30 s;
  at most `GIT_CACHE_MAX_REPOS` (64) clones, least recently used evicted. Paths may not leave the repository (nor read
  `.git`).
- Credentials: `GIT_CREDENTIALS_PATH` YAML `credentials: [{url: "github.com/org/*", token: "…"}]` (first match wins;
  scheme and `git@` ignored; `*` does not cross `/`), else `GIT_TOKEN`. HTTP(S) basic auth `oauth2:<token>`. Tokens are
  redacted from errors. A missing credentials file is not an error.
- A file that cannot be read shows "⚠️ Ce contenu n'est pas encore disponible…" on the lesson page (053).

## Module index files (065)

A module of type `modules` points (git source) to a YAML list — or `{modules: […]}` — of `{name, path, type?, src?,
ref?, hidden?, prerequisites?, skills?, slug?, inline?}`; `src` / `ref` default to the index's. When the course is saved
(module list, definition or markdown import), the entry is replaced by those modules, which become real modules with
their own ids (spec 191: progress is kept on them). An unreadable or invalid index is refused: 400
`Module index "<name>": …`.

## Cache administration (177)

- `POST /api/admin/cache/clear` → every clone; `POST /api/admin/courses/:id/cache/clear` → the repositories used by
  the course's modules (`{status, reposCleared}`); `POST /api/admin/courses/:id/modules/:slug/cache/clear` → one module's.
- Admin: "🗑 Vider tout le cache" on the course list (confirmation "Vider tout le cache Git ?", toast "Cache global
  vidé"), "🗑 Cache" on the course page ("Cache vidé pour <slug>"), 🗑 on git modules ("Cache module vidé").

## Differences from the original

- Uses the git binary instead of a pure-Go client; `file://` repositories work (used by the tests).
- Module indexes are expanded at save time (real modules), not at each request.

## Source

`apps/api/src/content/git-loader.ts`, `apps/api/src/content/loader.ts`, `apps/api/src/services/modules-admin.ts`
(`expandModuleIndexes`), `apps/api/src/routes/admin/cache.ts`, `apps/api/src/routes/admin/courses.ts`,
`e2e/git-content.spec.ts`.

# 014 — Performance invariants

Non-functional requirements, as implemented in the API.

## Invariants

1. **No per-item I/O.** List endpoints run a constant number of SQL statements whatever the number of items: the
   catalogue, "Mes cours", XP history, "Mes parcours" (path progress is read for all paths in at most two queries,
   `completedItems()` in `services/paths.ts`), groups, badges, skills, leaderboard, the course page and its module list,
   the manager's members, groups, scope and path enrollments, and the admin lists (users, groups, courses, paths, path
   enrollments). Related rows are loaded with `IN (…)` batches (`courseExtras`, `enrolledCourseIds`, `completionsFor`,
   `pathItems`…).
2. **One progress read per request** for a course: the course page and module list read the learner's progress in
   batched queries, independent of the number of modules.
3. **Outbound HTTP**: every call goes through `httpFetch()` (`src/lib/http.ts`): 15 s timeout by default (10 s for OIDC
   discovery, 5 min for media replication). Node's fetch shares one pooled keep-alive agent. LDAP connections have a
   10 s connect and operation timeout.
4. **CSV exports stream**: the header is sent at once, then rows are read and written 1 000 at a time (`LIMIT/OFFSET`
   chunks, so the SQLite connection is never held between chunks).
5. **Bounded caches**: the git clone cache has a TTL and a maximum number of repositories (oldest evicted); failed
   clones are remembered for 30 s. OIDC discovery documents and JWKS are keyed by configured providers only. The LDAP
   rate limiter, keyed by client IP, drops expired entries once it holds more than 10 000 addresses. Settings are one
   cached object.
6. **Catalogue**: module counts and skills come from two aggregate queries over the listed courses (see differences).
7. **Coalesced duplicate work**: concurrent clones of the same repository and ref share one clone; concurrent media
   replications of the same URL share one download.

## Tests

With `QUERY_COUNT_HEADER=true` (set by the e2e config), every response carries `X-Query-Count`: the SQL statements run
while handling it (drizzle logger + `AsyncLocalStorage`). `e2e/performance.spec.ts` measures each list endpoint with one
item, adds three more (courses, completions, paths, groups, members, modules), and expects the same counts.

## Differences from the original

- Module counts and skills are not denormalised on the course row: SQLite aggregates them over the listed courses in
  two indexed queries per request, which keeps the catalogue at a constant query count without having to keep copies in
  sync.
- No catalogue cache: every catalogue request reads the database (fast enough in-process with SQLite), so there is no
  cache to bound.
- Query counts are checked through a response header in e2e tests, not by unit tests around the handlers.

## Source

- Original spec: `../../pupitre/docs/spec/014-performance-invariants.md`
- `apps/api/src/db/index.ts` (`queryCounter`), `apps/api/src/app.ts`, `apps/api/src/lib/http.ts`,
  `apps/api/src/services/exports.ts`, `apps/api/src/services/paths.ts`, `apps/api/src/content/git-loader.ts`,
  `apps/api/src/services/media.ts`
- Tests: `e2e/performance.spec.ts`

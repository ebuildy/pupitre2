# 005 — HTTP conventions and OpenAPI document

| Field | Value |
| --- | --- |
| Area | Platform |
| Code | `apps/api/src/app.ts`, `apps/api/src/lib/openapi.ts`, `apps/api/src/openapi.ts`, `packages/shared` |

## Rules

- **Error envelope**: every error is JSON `{ "error": "<message>" }` with an appropriate status, including unknown routes
  (404 `Not found`) and unexpected failures (500 `Internal server error`). Messages are user-displayable.
- **Validation**: request bodies, query strings and path parameters are validated with zod. A failure answers 400 with
  the first issue, prefixed with its field: `{ "error": "slug: Invalid slug" }`. A body of a media type the route
  does not declare (e.g. `text/plain` sent to a JSON route) is refused with 415 `Unsupported Media Type`, never let
  through unvalidated. Documents validated inside services (course definitions, markdown imports) fail like a request.
- **Success envelopes**: lists are wrapped in an object keyed by resource (`{ courses, total }`, `{ users }`); writes
  return the resource, `{ message }` or `{ id }`.
- **Body size**: 1 MB on `/api/*`, except media uploads (`POST /api/admin/media`, `MEDIA_MAX_BYTES`, 512 MB by
  default); over the limit: 413.
- **CORS**: origins from `CORS_ORIGINS` (default `http://localhost:3000`); methods GET/POST/PUT/PATCH/DELETE/OPTIONS;
  headers Accept/Authorization/Content-Type; credentials allowed; preflight max-age 300 s.
- **Status codes in use**: 200, 201 (creation), 302 (SSO redirects), 400, 401 (signed out), 403 (role, scope,
  enrollment, prerequisites, XP gate), 404, 409 (duplicate slug or name, full session, group with subgroups or
  members), 413, 415, 425 (quiz cooldown, with `cooldowns`), 429 (rate limit), 500, 502 (GitLab, OPA or identity provider
  failure), 503 (readiness).

## OpenAPI document

Every route of the API (better-auth's `/api/auth/*` aside) is declared with `@hono/zod-openapi`: method, path,
parameters, request body and every response, with zod schemas. The same declaration validates the request, types the
handler (its response body is checked against the declared schema at compile time) and types the frontends' Hono RPC
clients.

- `GET /api/docs/openapi.json`: the OpenAPI 3.1 document. `GET /api/docs/swagger`: Swagger UI on it, where "Try it out"
  uses the viewer's session. Both are public (no sign-in); the document lists the admin endpoints too, which stay
  admin-only.
- `pnpm openapi` writes the document to `apps/api/openapi.json` (git-ignored) without starting the server
  (`pnpm openapi -- <file>` for another path), for client generators and API tools.
- Operations are grouped by tag (`Courses`, `Me`, `Manager`, `Admin: courses`…), with a summary and a description
  that refers to the spec. Every operation has an `operationId` derived from its method and path
  (`GET /api/admin/courses/{id}` → `getAdminCoursesById`).
- Error responses use the `ApiError` component. Admin routes document 401 and 403.
- Authentication: the `session` security scheme, better-auth's `better-auth.session_token` cookie, required by default;
  routes open to signed-out visitors (catalogue, course page, skills, paths, leaderboards, public profile, public
  settings, sessions agenda, SSO, probes) declare no security.
- Response schemas live in `@pupitre/shared` next to the request schemas; the wire types the frontends import
  (`CourseDetail`, `ModuleDetail`…) are `z.infer` of them, and each named schema is a component of the document
  (`.meta({ id })`).

## Differences from the original

- The original had no API description. The OpenAPI document and its Swagger UI are new, and public.
- Validation messages name the field (`field: message`); a body of an undeclared media type is 415, not 400.
- Body size: one 1 MB limit (the original allowed 10 MB on course-service admin routes); media uploads have their own
  limit.
- No request ID or real-IP middleware beyond Hono's `requestId()` and the client IP header used by rate limiting
  ([009](009-rate-limiting.md)).

## Source

Original: `docs/spec/005-http-conventions.md` (`internal/httperr`, routers).

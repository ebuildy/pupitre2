# 061 — Markdown patterns

| Field | Value |
| --- | --- |
| Area | Content rendering / authoring |
| Actors | Admin (manage), learner (reads lessons) |
| Related | [053](053-course-content-and-quizzes.md), [169](169-course-authoring.md) |

Covers the original 061 (patterns in content), 180 (patterns administration) and 181 (seeding from configuration).

## Syntax

- Block: a line `|||name`, content lines, a line `|||` — the content is rendered as markdown.
- Inline: `|||name some text|||` — the text is rendered as inline markdown.
- `{{content}}` in the pattern's HTML is replaced by the rendered content. Unknown names, unclosed blocks and anything in
  fenced code stay as written.

## Rendering

Server-side, in `renderMarkdown`: patterns become placeholders, the markdown is rendered and sanitized as usual, then the
placeholders are replaced by the pattern HTML (trusted: written by admins) filled with the sanitized content. The lesson
response gets `styles`: the CSS of the patterns it uses, injected in a `<style>` on the lesson page. A lesson sees the
global patterns and its course's ones (same name: the course's wins).

## Model and API

- `markdown_pattern` (spec 191): `name` (`[a-z0-9_-]`, unique per scope), `label`, `description`, `parameter`, `html`,
  `css`, scope (global, or one course — deleted with it), `origin` (`admin` / `config`), timestamps.
- `/api/admin/patterns`: `GET`, `POST` (201; 409 `A pattern with this name already exists in this scope`), `PUT /:id`,
  `DELETE /:id`, `POST /preview {markdown, pattern?}` → `{html, styles}`.
- Spec 181: `PATTERNS_FILE` (YAML list, or `{patterns: […]}`) is upserted at API startup into the global scope with
  `origin: config`.

## UI — `/admin/patterns` ("Patterns markdown", sidebar and dashboard)

Table Nom (badge "configuration"), Label, Portée, Utilisation (`|||name …|||`), "Modifier", "Supprimer" (confirmation).
Dialog "Nouveau pattern" / "Modifier le pattern": Nom (`blink`), Label (`Clignotant`), Paramètre, Portée (Global or a
course), HTML (`{{content}}`), CSS, and a live "Aperçu" of "Markdown personnalisé" rendered by the API.

## Differences from the original

- Rendered by the API (the original rendered in the browser from `GET /api/patterns`), so no public pattern endpoint.
- Course-scoped patterns are used (the original's gap); the page is in the admin sidebar.
- Pattern JavaScript is not supported: running admin-authored scripts in learners' browsers is left out.

## Source

`apps/api/src/content/markdown.ts`, `apps/api/src/services/patterns.ts`, `apps/api/src/routes/admin/patterns.ts`,
`apps/admin/src/routes/Patterns.tsx`, `e2e/patterns.spec.ts`, `e2e/patterns.yaml`.

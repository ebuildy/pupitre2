# 169 — Course authoring: definition, module editor, markdown import and export

| Field | Value |
| --- | --- |
| Area | Authoring |
| Actors | Admin |
| Related | [053](053-course-content-and-quizzes.md), [165](165-admin-courses.md), [050](050-prerequisites-and-auto-enrollment.md) |

Covers the original 169 (definition API), 170 (definition viewer), 171 (module editor), 172 (module reorder), 173
(markdown document format), 174 (markdown import), 175 (import preview) and 176 (markdown export).

## Course definition (spec 169)

`{slug, spec}` — `spec`: `title`, `description`, `category` (slug), `difficulty`, `visibility`, `status`, `xpRequired`,
`completionXp`, `inPerson`, `badge {name, icon}`, `prerequisites [{course (slug), minScore?, modules? (slugs)}]`, and
`modules` (ordered, as in `PUT …/modules`: `slug`, `name`, `type`, `hidden`, `inline`, `prerequisites`, `skills`,
`content {kind: inline, body} | {kind: source, repo, ref, path}`).

- `GET /api/admin/courses/:id/definition` → round-trippable document.
- `PUT /api/admin/courses/:id/definition {slug?, spec}` → replaces everything (metadata and prerequisites in one
  transaction, then the modules, matched by slug so progress is kept). Invalid documents → 400 with the first issue.
- Viewer (170): "⎈ Définition" on the course page → dialog "Définition — <slug>" (JSON, "Copier", "Fermer").

## Module editor (specs 171, 172)

Course page, "Modules (n)": ordered list (⠿ handle for drag and drop, ↑ ↓, name, type badge, "masqué" / "inline",
source path or slug), "Modifier", "Supprimer" (confirmation "Supprimer le module « … » ?" — progress on it is deleted),
"+ Ajouter un module". The dialog edits name, slug (empty: derived from the name), type (Leçon / Quiz), content
("Écrit dans la plateforme" — markdown or quiz YAML, with ".md" file loader — or "Fichier d'un dépôt Git": URL, branche
/ tag, chemin), skills (comma-separated), prerequisite modules, "Masqué", "Inline" (quizzes). Every change saves the
whole list (`PUT …/modules`); toasts "Module ajouté", "Module mis à jour", "Module « … » supprimé", "Ordre des modules
mis à jour" (or "Erreur lors du réordonnancement" and reload). Invalid quizzes are refused with the API's message.

## Markdown document (spec 173)

- Optional YAML frontmatter with the `spec` keys (no `modules`) plus `slug` and `split` (`none`, `h1`…`h6`).
  Unterminated → 400 `frontmatter opened with --- is never closed`.
- Slug: request > frontmatter > derived from the title (accents folded). Split: request > frontmatter > `none`.
- Each ATX heading at the split level starts a module named by the heading; headings in fenced code never split. Text
  before the first one becomes an "Introduction" module unless it only holds the document title.
- A `<!--pupitre … -->` YAML block right under a heading sets `type`, `slug`, `src`/`ref`/`path` (git source), `hidden`,
  `inline`, `skills`, `prerequisites` and, for quizzes, the quiz document keys (`questions`, `passingScore`, `cooldown`,
  `maxAttemptsPerQuestion`, `lockOnMaxAttempts`, `title`, `description`).
- Warnings: no module produced; headings with `split: none`; markdown under a module whose content comes from elsewhere.

## Import (174, 175) and export (176)

- `POST /api/admin/courses/import {markdown, slug?, split?, mode}` → `{slug, id, mode, moduleCount, warnings}`.
  `create` (201; 409 if the slug exists), `replace` (new modules; the frontmatter, if any, also replaces the metadata,
  with a warning), `append` (modules added after the existing ones, slugs made unique, frontmatter ignored with a
  warning); unknown course → 404. `POST …/import/preview` resolves the same way and stores nothing: `{slug, mode,
  course, modules: [{name, slug, type, bytes, hidden, source, existing}], warnings}`.
- UI: "Importer du markdown" on the course list → dialog (Destination, Slug "depuis le frontmatter" or Cours cible,
  Découpage, Document with file loader and size, "Prévisualiser", "Importer"; preview table; warnings).
- `GET /api/admin/courses/:id/export/markdown[?split=hN]` → `text/markdown` attachment `<slug>.md`: sorted frontmatter,
  heading level = requested or the shallowest one no lesson body uses (so export → import is lossless), directives only
  for what markdown cannot express. "↓ MD" on the course page.

## Differences from the original

- References by slug in the document, ids in the database (renaming keeps progress); modules matched by slug on writes.
- Labs, video and image modules come with their features; lab steps are not in the format yet.
- The definition endpoints use the course id in the path (the slug can change).

## Source

`apps/api/src/services/definition.ts`, `apps/api/src/content/markdown-course.ts`, `apps/api/src/routes/admin/import.ts`,
`apps/api/src/routes/admin/courses.ts`, `packages/shared/src/definition.ts`, `apps/admin/src/routes/courses/`
(`ModulesPanel`, `DefinitionDialog`, `ImportDialog`), `e2e/authoring.spec.ts`.

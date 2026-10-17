# 120 — Learning paths (parcours)

| Field | Value |
| --- | --- |
| Area | Learning paths |
| Actors | Admin, group manager, learner |
| Related | [130](130-groups.md), [140](140-manager-space.md), [110](110-skills.md) |

Covers the original 120 (model), 121 (catalogue API), 122 (enrollment), 123 ("Mes parcours"), 124 (progression),
125 (path grants course access), 126 (admin management), 127 (admin enrollments) and 143 (manager path enrollments).

## Model (spec 191)

| Table | Content |
| --- | --- |
| `learning_path` | `slug` (spec 185), `title`, `description`, `kind` (`course` / `skill`), `level`, `status` (draft / published / archived) |
| `path_item` | ordered members: a course (course paths) or a skill (skill paths); no duplicates |
| `path_enrollment` | (path, user) once, `enrolledBy`, date |

- Learners are enrolled by admins and managers (no self-enrollment).
- **Access (spec 125)**: each user enrolled in a course path holds a `path` grant (`via` = path id) on every member
  course. Grants follow the path: adding / removing a course, changing the kind, unenrolling, archiving (which ends the
  path's enrollments) or deleting the path update them. Other grants and progress are never touched.

## Progression (spec 124)

- Course path: `completed` when the course is completed (from any context), `available` if first or the previous one
  is completed, else `locked`.
- Skill path: a skill is completed when every assessable (quiz) module teaching it, in published courses, is passed (a
  skill without any is never completed); same available / locked rule.
- Locking is advisory: access is governed by enrollment.

## API

- Public: `GET /api/paths` (published), `GET /api/paths/:slug` (404 `Path not found`); course paths show the union of
  their courses' skills.
- `GET /api/my/paths` → the learner's published paths with `progress: [{slug, title, status}]` and `completed`.
- Admin (`/api/admin/paths`): `GET` (`?search`), `POST {slug, title, description?, kind, level?, status, items}` (409
  `Path already exists`), `GET /:id`, `PATCH /:id`, `DELETE /:id`, `GET|POST /:id/enrollments`,
  `DELETE /:id/enrollments/:userId`. Items are course ids or skill slugs (skills created on the fly). Listing rows
  include each learner's progress. `GET /api/admin/skills` lists known skills (autocomplete).
- Manager (`/api/manager/paths`): published paths; `GET|POST /:id/enrollments`, `DELETE /:id/enrollments/:userId`, for
  users in scope only (403 otherwise).

## UI

- Admin `/admin/paths` ("Parcours"): search, table (title, slug, item count, type, level, status, learners),
  "+ Nouveau parcours" (Titre, Slug, Type "Suite de cours" / "Suite de compétences") → path page: settings (title, slug,
  description, type, level, status), "Éléments du parcours" (ordered list, ↑ ↓ ✕; "— Ajouter un cours —" with
  "Title (slug)", or a skill field with autocomplete), "Enregistrer"; "Inscriptions (n)" (user search + "Inscrire", table
  Utilisateur / Progression (x/y + status per item) / Inscrit le / "Désinscrire"); "Supprimer" with "Les inscriptions à ce
  parcours seront perdues.".
- Learner `/my-paths` ("Mes parcours"): "N parcours en cours", cards (level "Niveau n · …", type, title, description,
  progress "x/y"); empty "Aucun parcours en cours" + "Voir le catalogue". `/my-paths/:slug` ("◂ Mes parcours"): skill
  chips (course paths) and a winding road (SVG) with one numbered node per item — Terminé (green ✓), Disponible (blue,
  pulsing), Verrouillé (grey); available and completed nodes open the course or skill page, locked ones are not links.
- Manager `/manager/paths` ("Parcours" tab): "Parcours :" select, member select + "Inscrire" ("Membre inscrit au
  parcours"), table Membre / Progression / Inscrit le / "Désinscrire" (confirm "Désinscrire ce membre du parcours ?").

## Differences from the original

- Paths reference courses and skills by id; definitions are edited in a form, not as YAML.
- Unenrolling removes the course access the path gave (spec 191), instead of keeping direct enrollments.
- Enrollments are on the path page instead of a separate "Inscriptions" tab with a path select.
- No "return to the path" after finishing a course yet.

## Source

`apps/api/src/services/paths.ts`, `apps/api/src/routes/paths.ts`, `apps/api/src/routes/admin/paths.ts`,
`apps/api/src/routes/manager.ts`, `apps/api/src/db/schema/paths.ts`, `packages/shared/src/paths.ts`,
`apps/admin/src/routes/paths/`, `apps/app/src/routes/MyPaths.tsx`, `apps/app/src/routes/manager/ManagerPaths.tsx`,
`e2e/paths.spec.ts`.

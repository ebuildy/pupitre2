# 165 — Admin: courses, categories and enrollments

| Field | Value |
| --- | --- |
| Area | Administration |
| Actors | Admin |
| Related | [040](040-courses-and-catalogue.md), [045](045-course-page-and-enrollment.md), [004](004-frontends-and-routing.md) |

Covers the original 165 (list), 166 (create), 167 (edit), 168 (delete) and 145 (course enrollments). A first, basic
version; a richer admin comes later.

## API (`/api/admin`, admin only)

| Endpoint | Result |
| --- | --- |
| `GET /courses?search=` | `{courses: AdminCourse[], total}`: every course (any visibility or status) with `enrollmentCount`; search on title, slug, category title |
| `POST /courses` | `courseCreateSchema` body (with `categoryId?`) → 201 `AdminCourse`; 400 `slug: Invalid slug`, `title: Title is required`, `Unknown category`; 409 `Course already exists` |
| `GET /courses/:id` | `AdminCourse` or 404 `Course not found` |
| `PATCH /courses/:id` | any subset of the fields, including `slug` → `AdminCourse`; same 400/409 |
| `DELETE /courses/:id` | `{message: "Course deleted"}`; its enrollment grants are deleted with it |
| `GET /courses/:id/enrollments` | `{enrollments: [{userId, username, name, email, enrolledAt, sources}], total}` |
| `POST /courses/:id/enrollments {userId}` | adds an `admin` grant (any visibility or status) → `{message: "User enrolled"}`; 404 `User not found` |
| `DELETE /courses/:id/enrollments/:userId` | removes the `self` and `admin` grants → `{message: "User unenrolled"}` |
| `GET /categories` | `{categories: AdminCategory[], total}`: every category, flat, with `parentId`, `courseCount` (direct), `childCount` |
| `POST /categories` | `categoryCreateSchema` (`slug`, `title`, `parentId?`) → 201 `AdminCategory`; 400 invalid slug/title or `Unknown parent category`; 409 `Category already exists` |
| `GET /categories/:id` | `AdminCategory` or 404 `Category not found` |
| `PATCH /categories/:id` | any subset → `AdminCategory`; 400 `A category cannot be moved under itself or its subcategories`; same 400/409 |
| `DELETE /categories/:id` | `{message: "Category deleted"}`; 409 `Category has subcategories` or `Category is used by courses` (nothing is re-filed silently) |
| `GET /users/search?q=` | `{users: [{id, username, name, email}]}`, at most 10, case-insensitive on username, e-mail, name |

Admin URLs use **ids** (course and category slugs can change). Body schemas live in `@pupitre/shared`
(`courseCreateSchema`, `courseUpdateSchema`, `categoryCreateSchema`, `categoryUpdateSchema`).

## UI (admin app)

- Sidebar entries "Cours" and "Catégories".
- `/admin/courses`: title with count, "+ Nouveau cours", search "Rechercher un cours…", table (title + slug, category,
  difficulty, visibility Public/Privé, status Brouillon/Publié/Archivé, enrolled count) with "Modifier" and "Supprimer"
  (→ "Confirmer la suppression" / "Annuler"; then "Cours « … » supprimé").
- `/admin/courses/new`: form "Nouveau cours" — Titre*, Slug* (help text), Description, Catégorie (select of the tree, "Parent › Enfant", or "— Aucune —"), Difficulté, Visibilité
  (default Privé), Statut (default Brouillon); client checks "Le titre est requis", "Slug invalide"; API errors shown
  as returned. On success → the edit page with "Cours « slug » créé".
- `/admin/courses/:id`: same form ("Modifier le cours", "Enregistrer" → "Cours « slug » mis à jour") and the
  "Inscriptions (N)" section: user search "Rechercher un utilisateur…" with suggestions, "Inscrire" ("Sélectionnez un
  utilisateur dans la liste" if none chosen), table of enrolled users (name, e-mail, date, origin Auto-inscription /
  Administrateur) with "Retirer".
- `/admin/categories`: title with count, "+ Nouvelle catégorie", the tree as an indented table (title, slug, direct
  course count) with "Modifier" and "Supprimer" (→ "Confirmer la suppression"; API refusals shown as returned).
- `/admin/categories/new` and `/admin/categories/:id`: Titre*, Slug*, "Catégorie parente" ("— Aucune (catégorie
  principale) —" or any category except itself and its subcategories); "Catégorie « slug » créée / mise à jour".

## Acceptance criteria

- An admin creates, edits (including the slug) and deletes a course; deleted courses disappear from the catalogue.
- A duplicate slug is refused with "Course already exists".
- An admin enrolls a user in a private course and removes them.
- An admin creates a category and a subcategory, renames them, files a course under the subcategory, and can't delete a
  category that still has subcategories or courses; moving a category under itself or a subcategory is refused.

## Differences from the original

- Pages instead of an expanding row panel; no toasts yet (inline status messages).
- Slug editable; status and visibility editable in the form.
- Not yet: modules tab and editor (171), YAML/markdown import/export (169–176), cache actions, group enrollments (135).

## Source

`apps/api/src/routes/admin/courses.ts`, `apps/api/src/routes/admin/categories.ts`, `apps/admin/src/routes/courses/`,
`apps/admin/src/routes/categories/`, `apps/admin/src/lib/categories.ts`, `e2e/admin-courses.spec.ts`, `e2e/admin-categories.spec.ts`.

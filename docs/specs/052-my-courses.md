# 052 — "Mes cours"

| Field | Value |
| --- | --- |
| Area | Learner dashboard |
| Actors | signed-in learner |
| Related | [045](045-course-page-and-enrollment.md) |

## API

`GET /api/my/courses` (session) → `{ courses: [CourseSummary & { status, enrolledAt }] }`: every course the user
holds a grant on, drafts excluded, archived included.

## UI — `/my-courses` (signed-in only; top bar link "Mes cours")

- Title "Mes cours" + "Parcourir le catalogue".
- Text filter "Filtrer mes cours…" (title or description), count "N cours".
- Course cards sorted by title, with "Inscrit le …" (or "✓ Terminé le …" once completed, [103](103-xp.md)), an "Archivé" badge when relevant, and "Détails" (→ course page).
- Empty: "Vous n'êtes inscrit à aucun cours" + "Découvrir le catalogue"; filtered empty: "Aucun cours ne correspond à votre filtre.".

## Progress

- Stats: "cours inscrits", "cours terminés", "modules terminés", "progression globale" (modules done / visible modules).
- Status filter "Statut": Tous / Non commencés / En cours / Terminés.
- Cards show the progress bar and a "Commencer ▸" / "Continuer ▸" / "Revoir ▸" button next to "Détails".
- `GET /api/my/courses` adds `progress`, `moduleCount`, `skills`, `badge` and `lastActivityAt` to each course.

## Differences from the original

- Progress counts visible modules of every type (lessons and quizzes), not only labs.

## Source

`apps/api/src/routes/courses.ts`, `apps/app/src/routes/MyCourses.tsx`, `e2e/courses.spec.ts`.

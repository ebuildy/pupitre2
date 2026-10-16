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
- Course cards sorted by title, with "Inscrit le …", an "Archivé" badge when relevant, and "Détails" (→ course page).
- Empty: "Vous n'êtes inscrit à aucun cours" + "Découvrir le catalogue"; filtered empty: "Aucun cours ne correspond à votre filtre.".

## Differences from the original

- No progress yet: the stats row (enrolled / completed courses, completed modules, overall progress), the status filter, progress bars and "Commencer / Continuer / Revoir" come with modules and progress tracking.

## Source

`apps/api/src/routes/courses.ts`, `apps/app/src/routes/MyCourses.tsx`, `e2e/courses.spec.ts`.

# 050 — Course prerequisites and automatic enrollment

| Field | Value |
| --- | --- |
| Area | Course access |
| Related | [045](045-course-page-and-enrollment.md), [053](053-course-content-and-quizzes.md), [169](169-course-authoring.md) |

Covers the original 050 (cross-course prerequisites) and 048 (auto-enrollment in public courses).

## Prerequisites (050)

- `course_prerequisite` (spec 191): course → required course, optional `minScore`, optional module ids of the required
  course.
- A prerequisite holds when: the sum of the learner's best quiz scores in the required course ≥ `minScore` (if set),
  every listed module is done (if any), and — when neither is set — the learner made some progress in that course.
- Non-admins whose prerequisites do not all hold get 403 `Complete prerequisite courses first` on module, lesson,
  completion and quiz endpoints. Enrollment itself is not blocked.
- `GET /api/courses/:slug` adds `prerequisites: [{course, minScore, modules, met}]` and `prerequisitesMet`. The course
  page shows "Prérequis" with ✓ / ○ per course (links, "score ≥ n", "modules : …") and, while unmet, "Prérequis non
  satisfaits : terminez d'abord ces cours." instead of the modules.
- Admin: "Prérequis" panel on the course page (course, "Score minimum", "Modules à valider", "+ Ajouter un prérequis",
  "Enregistrer les prérequis"); `prerequisites` in the course create / update body and in the definition (169).

## Automatic enrollment (048)

Opening a module (lesson or quiz, completing it, submitting a quiz) of a public published course the learner is not
enrolled in enrolls them (`auto` grant), if they could self-enroll (XP gate included). The module list never enrolls
(the course page reads it), so it stays 403 for non-enrolled learners.

## Differences from the original

- Prerequisite modules are stored by id (renaming keeps them).
- Auto-enrollment is synchronous and respects the XP gate; the module list does not auto-enroll.

## Source

`apps/api/src/services/prerequisites.ts`, `apps/api/src/routes/modules.ts`, `apps/api/src/routes/courses.ts`,
`apps/admin/src/routes/courses/PrerequisitesPanel.tsx`, `apps/app/src/routes/CourseDetail.tsx`,
`e2e/authoring.spec.ts`, `e2e/content.spec.ts`.

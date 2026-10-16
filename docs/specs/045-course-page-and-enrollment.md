# 045 — Course page and enrollment

| Field | Value |
| --- | --- |
| Area | Enrollment |
| Actors | anyone; signed-in learner |
| Related | [040](040-courses-and-catalogue.md), [052](052-my-courses.md), [165](165-admin-courses.md) |

Covers the original 045 (course page) and 047 (self-enrollment and unenrollment).

## Enrollment model (spec 191)

A user is enrolled in a course while they hold at least one **grant** (table `enrollment_grant`, one row per
user, course and source). The enrollment date is the oldest grant.

| Source | Created by | Removed by |
| --- | --- | --- |
| `self` | the learner ("S'inscrire au cours") | the learner ("Se désinscrire"), or an admin |
| `admin` | an admin ([165](165-admin-courses.md)) | an admin |

Groups and paths will add their own sources; removing one source never removes the others. Grants are
deleted with the course or the user.

## API

| Endpoint | Auth | Result |
| --- | --- | --- |
| `GET /api/courses/:slug` | public | `CourseDetail`, or 404 if the user may not see it ([040](040-courses-and-catalogue.md)) |
| `POST /api/enrollments/:slug` | session | adds a `self` grant (idempotent) → `{message: "Enrolled successfully"}` |
| `DELETE /api/enrollments/:slug` | session | removes the `self` grant only → `{message: "Unenrolled successfully"}` |

- `POST` with less XP than the course's `xpRequired` → 403 `Not enough XP to enroll in this course` ([103](103-xp.md)).
- `POST` on a course the user can't see → 404; on a visible course that is not published + public (archived, or private and already enrolled) → 403 `Enrollment is not open for this course`.
- Signed out → 401.

`CourseDetail` = course card fields + `visibility`, `status` and
`enrollment: null | { enrolledAt, canUnenroll }`; `canUnenroll` is true when every grant is the learner's own.

## UI — `/courses/:slug`

- Left column: category icon, title, difficulty badge and category, description, then the enrollment area:
  - not enrolled → "S'inscrire au cours" (signed out → `/login?redirect=/courses/:slug`, back to the page after login);
  - enrolled → "✓ Inscrit le 16 octobre 2026", then "Se désinscrire" → "Confirmer la désinscription" / "Annuler";
  - enrolled by an admin → "Inscription gérée par un administrateur" (no unenroll button);
  - archived → "Ce cours est archivé.";
  - completed → "✓ Cours terminé le …"; XP card "⚡ XP de ce cours" ([103](103-xp.md));
  - XP-gated → "⚡ N XP requis pour s’inscrire", and when the user lacks XP "Il vous manque M XP (vous en avez K)." with the button disabled.
- Right column "Contenu du cours": for enrolled learners and admins, the progress block and the module list
  ([053](053-course-content-and-quizzes.md)); otherwise "📭 Inscrivez-vous pour accéder aux modules."; "Aucun contenu
  disponible pour le moment." for a course without modules.
- Unknown or hidden course → "😕 Cours introuvable" + "Retour au catalogue".

## Acceptance criteria

- A visitor clicking "S'inscrire au cours" logs in, comes back, enrolls, and sees the course in "Mes cours".
- Unenrolling removes it from "Mes cours".
- A private course is "Cours introuvable" until an admin enrolls the learner; then it is visible without an unenroll button.
- An archived course stays visible to enrolled learners; others can't see or enroll in it.

## Differences from the original

- Enrollment checks visibility and status (the original accepted any slug).
- The learner can unenroll from the UI (the original had only the API).
- Not yet: auto-enrollment on module access (048), prerequisites (050), badge card (106), sessions (152).

## Source

`apps/api/src/routes/courses.ts`, `apps/api/src/services/courses.ts`, `apps/app/src/routes/CourseDetail.tsx`, `e2e/courses.spec.ts`.

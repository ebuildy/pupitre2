# 110 — Skills, skill levels and the skill filter

| Field | Value |
| --- | --- |
| Area | Skills |
| Actors | author (admin), learner |
| Related | [106](106-badges.md), [040](040-courses-and-catalogue.md), [053](053-course-content-and-quizzes.md) |

Covers the original 110 (tagging), 111 (skill page), 112 (module status), 113 (levels), 114 ("Mes compétences") and
042 (catalogue skill filter).

## Model

- `skill` (slug kebab-case, label, description): created on the fly when a module references a new slug, with the label
  derived from the slug ("ci-cd" → "Ci Cd").
- `module_skill`: the skills a module teaches (`skills: [slug]` in the module list, `PUT /api/admin/courses/:id/modules`).
- A course's skills = union of its **visible** modules' skills, computed on read (no stored copy).
- `skill_level` (user, skill): `level` (`beginner` … `master`), `completedCourses`, `totalCourses`.

## Levels (spec 113)

At each course completion (inside `completeCourse()`), for every skill of the course: `totalCourses` = published courses
teaching it, `completedCourses` = those the learner completed; level = `master` when all are completed, else the
highest difficulty completed so far (a course without difficulty counts as beginner). Never decreases.

## API

- `GET /api/skills` → skills taught by published public courses, with course counts.
- `GET /api/skills/:slug` → `{skill, courses: [{slug, title, difficulty, enrolled, modules: [{slug, name, type, status}],
  done}], level}`; public; personal `status` when signed in: `completed`, `available` (first, or previous in the list
  completed), `locked`. Invalid slug → 400 `Invalid skill slug`, unknown → 404.
- `GET /api/my/skills` → `{skills: [levels…], inProgress: [skills of enrolled unfinished courses without a level]}`.
- `GET /api/courses?skill=<slug>` → courses teaching it; with a level, only difficulties ≥ that level; the response's
  `skillFilter` gives the skill and level.
- Course summaries and module summaries carry `skills: [{slug, label}]`.

## UI

- "🎯 Label" chips on course cards (3 at most), on the course page, and under module names; they open `/skills/:slug`.
- `/skills/:slug`: title "🎯 Label", intro "Ces cours contiennent des modules qui développent la compétence « … »",
  "Votre niveau : …", "Voir les cours adaptés à mon niveau"; courses grouped "Débutant", "Intermédiaire", "Avancé",
  "Autre", each with "x/y modules", a progress bar and its modules with their status. "← Retour" goes back in history.
- "🎯 Compétences" section of the profile (`/profile?tab=skills`; `/my-skills` redirects there): cards with the level ("Débutant" … "★ Maître", highlighted) and "x/y cours";
  dashed "En cours" cards; empty: "Aucune compétence pour l'instant" + "Découvrir le catalogue".
- Catalogue with `?skill=`: banner "🎯 Cours adaptés à ton niveau — <skill> (<niveau> et +)" (or "🎯 Cours qui développent
  « … »" without a level) and "✕ Retirer le filtre".

## Differences from the original

- Skills are entities with ids (renaming a label keeps references); course skills are computed, not stored.
- `/api/skills/:slug` merges the original module list (110) and the personal status (112).
- Skill editing in the admin comes with the module editor (171).

## Source

`apps/api/src/services/skills.ts`, `apps/api/src/routes/gamification.ts`, `apps/api/src/db/schema/gamification.ts`,
`packages/shared/src/gamification.ts`, `apps/app/src/routes/SkillPage.tsx`, `apps/app/src/routes/MySkills.tsx`,
`e2e/gamification.spec.ts`.

# 160 — Admin dashboard, monitoring and CSV exports

| Field | Value |
| --- | --- |
| Area | Administration / reporting |
| Actors | Admin; group manager (exports of their members) |
| Related | [106](106-badges.md) (leaderboards), [140](140-manager-space.md) |

Covers the original 160 (dashboard), 161 (monitoring) and 182 (CSV exports).

## Figures (160, 161)

`GET /api/admin/stats` → `{users, activeUsers, courses, publishedCourses, enrollments, completions, quizSubmissions,
successRate, badges, groups, paths, upcomingSessions}` — all computed (the original's lab / submission / success-rate
placeholders are real numbers; labs come with their feature). `GET /api/admin/stats/courses` → per course: category,
visibility, status, visible modules, enrolled learners, completions.

- `/admin` ("Tableau de bord"): stat cards, "Classement" top 5 (quiz score, spec 115) with "Voir tout →", shortcuts.
- `/admin/monitoring` ("Supervision"): stat cards, "Aperçu des cours" (Titre, Catégorie, Modules, Inscrits, Terminés,
  Accès), "Top 10 — Classement" with "🏆 Classement complet".

## CSV exports (182)

- `GET …/exports/categories`, `POST …/exports/preview {category, fields, filters}` (10 rows + total) and
  `POST …/exports/download {category, fields, filters, headers?}` → `<category>-export-<YYYY-MM-DD>.csv`, UTF-8 BOM, `;`
  separator, header row (the UI sends the translated column titles). Unknown or missing category → 400
  `Catégorie requise`.
- Under `/api/admin/exports` for admins (everything) and `/api/manager/exports` for group managers — **limited to the
  members of their groups** (the original's gap).
- Categories: Utilisateurs (created from/to, role, status), Inscriptions aux cours (enrolled from/to, course slug,
  source), Progression modules (course, activity from/to, passed), Tentatives quiz (course, submitted from/to, passed),
  Inscriptions aux parcours (enrolled from/to, path), Événements XP (earned from/to, source), Badges (awarded from/to),
  Réservations de sessions (sessions from/to, attendance). Dates are ISO 8601 (UTC), booleans `yes` / `no`.
- Every download is recorded in `export_record` (spec 191 "ExportRecord"): user, e-mail, category, fields, filters, rows.
- UI: `/admin/exports` ("Exports CSV") and the "Exports" tab of the manager space: 1. category cards, 2. "Champs"
  checkboxes ("Tout sélectionner" / "Réinitialiser"), 3. "Filtres", "Aperçu" (table, "N lignes au total") and
  "Télécharger le CSV".

## Differences from the original

- Lab checks export (183) comes with labs; no "Recalculer la progression" (184: nothing to resync).
- The CSV is built in memory (SQLite, one process) rather than streamed.

## Source

`apps/api/src/routes/admin/stats.ts`, `apps/api/src/services/exports.ts`, `apps/api/src/routes/exports.ts`,
`packages/ui/src/components/exports-panel.tsx`, `apps/admin/src/routes/{Dashboard,Monitoring,Exports}.tsx`,
`apps/admin/src/components/StatCards.tsx`, `e2e/admin-reports.spec.ts`.

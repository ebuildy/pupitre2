# 090 — Labs: step checks, local checks, history and tracking

| Field | Value |
| --- | --- |
| Area | Labs |
| Actors | learner, admin (author, trainer) |
| Related | [053](053-course-content-and-quizzes.md), [160](160-admin-dashboard-and-reports.md), [169](169-course-authoring.md) |

Covers the original 090 (lab module), 092 (GitLab step checks), 093 (local checks), 094 (history), 095 (admin tracking)
and 183 (lab checks export). Policy checks (091): see [091](091-lab-policy-checks.md). Not covered: 096 (the desktop app itself).

## Lab module

`type: lab` — instructions in markdown (written in the platform or a git file) and `lab` settings: `labUrl` (link to
the learner's workspace; `{{username}}` / `{{ .Username }}` replaced), `provider` (`gitlab` or `local`), ordered
`steps: [{title, checkType, checkParams}]`. In the markdown format (173): `labUrl`, `checkProvider`, `steps`.

- A `<!-- check:N -->` line (1-based) places step N; steps without a marker are appended at the end.
- Without steps, a lab is completed like a lesson. With steps, "Terminer" is replaced by "Une fois le lab terminé,
  revenez ici pour valider votre travail." and the lab is completed (XP, course completion) when every step has passed;
  the learner then moves on to the next module or back to the course. `POST …/complete` answers 400 for such labs.
- Each step: "✔ <title>", "Vérifier cette étape" ("Vérification…"), "✓ Étape validée !" or "✗ Pas encore" with the
  violations; "x/y étapes validées"; "Ouvrir mon espace de travail ↗".

## GitLab step checks (092)

`POST /api/courses/:slug/modules/:moduleSlug/steps/:index/check` — the API reads the learner's project through the
GitLab REST API (`gitlab_url` setting, else `GITLAB_URL`; `GITLAB_TOKEN`). `checkParams.project` is required; strings
get `{{username}}` replaced. Types: `gitlab_branch` (`pattern`), `gitlab_mr_open`, `gitlab_conventional_commit`
(a commit of an open MR by the learner), `gitlab_pipeline_passed`, `gitlab_commit_on_branch`,
`gitlab_conventional_commit_on_branch`, `gitlab_file_on_branch` (`file`, `branch`); `pattern` is a regular expression
on branch names; conventional commits: `feat|fix|chore|docs|style|refactor|test|perf|ci|build|revert`, optional
`(scope)` and `!`, then `: message`. Unknown type → violation `Type de vérification inconnu : <type>`. Unreachable
GitLab → 502.

## Local checks (093)

With `provider: local`, inside the desktop app (Tauri) the page calls `local_check(checkType, params)` and reports the
result to `POST …/steps/:index/record {allow, violations}` (stored as not verified). In a browser: "Ce lab se vérifie
dans Pupitre." with "Ouvrir dans Pupitre →" (`pupitre://courses/<slug>/modules/<module>`).

## History, tracking, export (094, 095, 183)

- `lab_check` (spec 191 "LabCheck"): learner (and e-mail snapshot), module, step index and title, result, violations,
  `verified` (server) or reported, date. Every check is recorded.
- `GET /api/admin/lab-checks?course=<id>` → most recent first.
- `/admin/labs` ("Suivi des labs"): course filter, "Actualiser", "N vérification(s) — M apprenant(s)", stats (Total
  vérifications, Labs validés, Labs échoués, Apprenants actifs), table (Apprenant, Cours, Lab + step, Statut —
  "déclaré par l'application" for local checks —, Violations, Vérifié le).
- CSV export category "Vérifications de labs" (`labChecks`, admins only: not offered to managers).

## Differences from the original

- No separate checker service: GitLab step checks run in the API; policy checks call an OPA server or binary (spec 091).
- Steps of every provider are recorded in the history; completion is automatic once all steps pass.
- Lab settings are structured fields of the module (editable in the module editor), not free definition keys.

## Source

`apps/api/src/services/labs.ts`, `apps/api/src/routes/modules.ts`, `apps/api/src/routes/admin/labs.ts`,
`packages/shared/src/labs.ts`, `apps/app/src/components/lab/LabContent.tsx`, `apps/admin/src/routes/Labs.tsx`,
`apps/admin/src/routes/courses/ModulesPanel.tsx`, `e2e/labs.spec.ts`, `e2e/fake-gitlab.mjs`.

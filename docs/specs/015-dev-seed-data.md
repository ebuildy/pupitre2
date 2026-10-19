# 015 — Mock data (fixtures)

| Field | Value |
| --- | --- |
| Area | Operations / DX |
| Actors | Developer, demo operator |
| Related | [016](016-admin-bootstrap.md), [040](040-courses-and-catalogue.md) |

## Summary

`apps/api/src/fixtures` fills a development database with realistic French data, generated with
[@faker-js/faker](https://fakerjs.dev) (French locale, fixed seed).

| Command | Effect |
| --- | --- |
| `pnpm dev` | loads the fixtures at API startup (`SEED_DEV_DATA=true`, set by the dev script unless already set in the shell) |
| `pnpm db:seed` | migrations + admin bootstrap + fixtures, then exits |
| `pnpm db:reset` | deletes the database file (`DATABASE_URL`), then the same as `db:seed` |

Both commands refuse to run with `NODE_ENV=production`. Faker is a dev dependency, loaded only when seeding.

## Content

| Data | Details |
| --- | --- |
| Categories | 11, in a tree: DevOps › Docker / Kubernetes / Git, Programmation › Python, Linux, Réseaux, Bases de données, Sécurité, Cloud |
| Courses | 9 hand-written ones with stable slugs (`linux-basics`, `docker-intro`, …; one private `internal-onboarding`, one draft `terraform-draft`, one archived `legacy-svn`), plus 44 generated from topic × title templates ("Premiers pas avec Helm", "Maîtriser Redis", …) with mixed difficulty, visibility and status |
| Users | known accounts below, 25 students and 3 managers with French names (`prenom.nom@example.com`) |
| Enrollments | each learner self-enrolled in 0–6 public courses; 4 students granted each private course by the admin |
| Modules ([053](053-course-content-and-quizzes.md)) | `docker-intro`, `linux-basics`, `git-essentials` read lessons and quizzes from `apps/api/content-samples/` (fake loader), `docker-intro` with an inline mini-quiz, a hidden module and a prerequisite; `kubernetes-basics` has a missing source (placeholder); every other course gets two template lessons and a template quiz. Only courses without modules get them. |
| Progress | per enrollment, in module order: about a third finished (course completed), some started, the rest untouched |
| XP ([103](103-xp.md)) | lesson, quiz and course XP matching the progress; three admin bonuses/corrections given to a few learners; advanced generated courses and `web-security` are XP-gated |

Known accounts:

| Login | Password | Role |
| --- | --- | --- |
| `admin` / `admin@pupitre.local` | `Admin@1234` (or `ADMIN_PASSWORD`, spec 016) | admin |
| `etudiant` / `etudiant@pupitre.local` | `Student@1234` | student |
| `manager` / `manager@pupitre.local` | `Manager@1234` | manager |
| `inactif` / `inactif@pupitre.local` | `Student@1234` | deactivated student (login refused) |

Generated students use `Student@1234`, generated managers `Manager@1234`.

## Demo login buttons

In dev only, the learner login page (`/login`) shows a "Comptes de démonstration" section under the accordion, with one
button per account: Élise Étudiante (`etudiant`), Marc Manager (`manager`) and `admin`. Each button shows the
account's name and role. Clicking it signs in with the same code as the e-mail form (whichever section is open), so
sign-in, errors and the landing redirect work exactly as with a manual login.

The SSO section adds "Comptes de démonstration Keycloak" (Élise, Marc and Ada Keycloak): the same accounts in the
Keycloak demo realm, signed in through Keycloak in one click (spec 027, `ssoDemoAccounts`).

- The list lives in `apps/app/src/lib/demo-accounts.ts`, behind `import.meta.env.DEV`. `vite build` removes it, so
  production bundles contain neither the buttons nor the passwords.
- The admin login page (`/admin/login`) has no demo buttons: `LoginPage` only shows them when it gets a
  `demoAccounts` prop.
- The admin button uses `Admin@1234`, or `VITE_DEMO_ADMIN_PASSWORD` when the API runs with another
  `ADMIN_PASSWORD`. The e2e config sets it.

## Rules

- **Deterministic**: the faker seed and the reference date are fixed, so two fresh databases get exactly the same data.
- **Idempotent**: categories and courses are matched by slug, users by e-mail, grants by (user, course, source);
  existing rows are never modified or duplicated. Re-running after editing a fixture does not update existing rows:
  use `pnpm db:reset`.
- e2e tests do not use the fixtures: they create their own data (`e2e/fixtures.ts`).

## Groups

`GROUPS` in `fixtures/data.ts`: "Ingénierie" (managed by `manager`) with "Équipe Plateforme" (where `etudiant` is, enrolled in a Kubernetes course) and "Équipe Produit", and "Support"; generated managers manage the leaf groups, generated students are spread over them. Created once, matched by name.

`IDP_MAPPINGS`: the groups of the Keycloak demo realm give their platform role (`pupitre-managers` → manager,
`pupitre-admins` → admin, spec 134); added when missing, an existing mapping of the same name is kept.

## Differences from the original

- One command and one variable (`SEED_DEV_DATA`) instead of `SEED_DEV_COURSES` (course-service) and `SEED_MOCK_DATA` (user-service).
- Generated data is reproducible (seeded) and includes categories, managers and an inactive account.
- New: one-click demo login buttons on the dev learner login page.

## Source

`apps/api/src/fixtures/data.ts` (curated data, templates, known accounts), `apps/api/src/fixtures/index.ts` (generation),
`apps/api/src/fixtures/cli.ts` (`db:seed`, `db:reset`), `apps/app/src/lib/demo-accounts.ts` and
`packages/auth-ui/src/LoginPage.tsx` (demo login buttons), `e2e/demo-login.spec.ts`.

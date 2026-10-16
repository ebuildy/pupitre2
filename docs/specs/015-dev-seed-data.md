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
| XP ([103](103-xp.md)) | about a third of the enrollments completed (with the course's completion XP); three admin bonuses/corrections given to a few learners; advanced generated courses and `web-security` are XP-gated |

Known accounts:

| Login | Password | Role |
| --- | --- | --- |
| `admin` / `admin@pupitre.local` | `Admin@1234` (or `ADMIN_PASSWORD`, spec 016) | admin |
| `etudiant` / `etudiant@pupitre.local` | `Student@1234` | student |
| `manager` / `manager@pupitre.local` | `Manager@1234` | manager |
| `inactif` / `inactif@pupitre.local` | `Student@1234` | deactivated student (login refused) |

Generated students use `Student@1234`, generated managers `Manager@1234`.

## Rules

- **Deterministic**: the faker seed and the reference date are fixed, so two fresh databases get exactly the same data.
- **Idempotent**: categories and courses are matched by slug, users by e-mail, grants by (user, course, source);
  existing rows are never modified or duplicated. Re-running after editing a fixture does not update existing rows:
  use `pnpm db:reset`.
- e2e tests do not use the fixtures: they create their own data (`e2e/fixtures.ts`).

## Differences from the original

- One command and one variable (`SEED_DEV_DATA`) instead of `SEED_DEV_COURSES` (course-service) and `SEED_MOCK_DATA` (user-service).
- Generated data is reproducible (seeded) and includes categories, managers and an inactive account.

## Source

`apps/api/src/fixtures/data.ts` (curated data, templates, known accounts), `apps/api/src/fixtures/index.ts` (generation),
`apps/api/src/fixtures/cli.ts` (`db:seed`, `db:reset`).

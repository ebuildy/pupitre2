# 140 — Manager space ("Mon espace")

| Field | Value |
| --- | --- |
| Area | Delegated administration |
| Actors | Group manager |
| Related | [130](130-groups.md), [001](001-roles-and-permissions.md) |

Covers the original 140 (scope), 141 ("Mes membres") and 142 ("Mes groupes"). Path enrollments (143): see [120](120-learning-paths.md).

## Scope

- A user's **scope** = the groups where their membership role is `manager`, plus every subgroup below them (never the
  default group); users in scope = members of those groups.
- The manager space is open to anyone who manages a group, and to platform `manager`s (empty scope until they manage one).
- Every endpoint checks the scope: 403 `User not in manager scope` / `Group not in manager scope`; without any managed
  group and not a platform manager: 403 `Manager access required`.

## API (`/api/manager`)

| Method | Path | |
| --- | --- | --- |
| GET | `/scope` | `{groups, canManage}` (any signed-in user; drives the "Mon espace" link) |
| GET | `/users` | members in scope with their groups (in scope) and number of enrolled courses |
| GET | `/users/:userId/enrollments` | the member's courses with their grant sources; `removable` when a manager grant exists |
| POST | `/users/:userId/enrollments {courseId}` | `manager` grant on a published course (public or private) |
| DELETE | `/users/:userId/enrollments/:courseId` | removes the manager grant only |
| GET | `/courses` | published courses |
| GET / POST | `/groups` | managed groups (tree) / create (`parentId` must be in scope); the creator becomes its manager |
| DELETE | `/groups/:id` | local group in scope, without subgroups and without `member`s |
| GET / POST / DELETE | `/groups/:id/members[/:userId]` | members; only users already in scope can be added (outside scope = admin action) |

## UI — `/manager` (learner app; "Mon espace" in the top bar)

- Tabs "Mes membres" and "Mes groupes".
- "Mes membres": table Membre (avatar, name, e-mail), Groupes, Cours inscrits, "Gérer les inscriptions" → dialog
  "Inscriptions — <name>": "Cours actuels" ("Retirer" for manager grants, "Inscription gérée ailleurs" otherwise),
  "Inscrire à un cours" ("Choisissez un cours", "Inscrire"); toasts "Inscrit avec succès", "Inscription retirée".
- "Mes groupes": tree; "+ Nouveau groupe" ("ex : equipe-frontend"), "+ sous-groupe", "Membres" (dialog: list,
  "Retirer", "Choisir un membre…" + "Ajouter"), "Supprimer" (confirmation).

## Differences from the original (fixes of its listed gaps)

- Managers cannot widen their scope (only users already in scope can be added) and cannot delete groups with members
  or subgroups.
- Scope includes subgroups of managed groups; managing is a membership role, not only the platform role.
- Session bookings / attendance and exports come with their features.

## Source

`apps/api/src/routes/manager.ts`, `apps/api/src/services/groups.ts`, `apps/app/src/routes/manager/`,
`apps/app/src/lib/manager.ts`, `e2e/groups.spec.ts`.

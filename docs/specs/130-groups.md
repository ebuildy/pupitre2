# 130 — Groups, memberships and group enrollments

| Field | Value |
| --- | --- |
| Area | Groups |
| Actors | Admin; any signed-in user ("Mes groupes") |
| Related | [140](140-manager-space.md), [162](162-admin-users.md), [165](165-admin-courses.md) |

Covers the original 130 (model), 131 (create, rename, delete), 132 (subgroups, move), 133 (membership),
135 (group course enrollment), 136 ("Mes groupes") and 038 (default group).

## Model (spec 191)

| Table | Content |
| --- | --- |
| `user_group` | `name` (unique, case-insensitive), `description`, `origin` (`local` or an identity provider), `parentId` (tree, at most 10 levels), `isDefault` |
| `group_membership` | (group, user) once; `role` `member` / `manager`; `origin` `manual` / `idp` / `default`; `addedBy` |
| `group_course_enrollment` | (group, course) once; `enrolledBy` |
| `enrollment_grant.via` | the group (or path) a `group` / `path` grant comes from |

- **Default group** `everyone` (spec 038): created on first need; every account joins it at creation, and existing
  accounts at API startup. It cannot be renamed, moved, deleted, left, or have managers; it is hidden from "Mes groupes"
  and from manager scope.
- **Group enrollment**: every member of a group enrolled in a course holds a `group` grant (`via` = group id). Grants are
  kept in sync immediately: adding a member grants the group's courses, removing a member removes the grants of that
  group, withdrawing the group removes only its grants (other grants — self, admin, another group — stay). Progress is
  never deleted. Direct members only (not members of subgroups).

## Admin API (`/api/admin/groups`)

| Method | Path | |
| --- | --- | --- |
| GET | `/` | `{groups: AdminGroup[]}` in tree order (`depth`, member, manager and course counts) |
| POST | `/ {name, description?, parentId?}` | 201 `{id}`; empty name 400 `name required`; duplicate 409 `A group with this name already exists`; deeper than 10 levels 400 |
| GET | `/:id` | `{group, ancestors}` |
| PATCH | `/:id {name?, description?, parentId?}` | rename / move (null = root); not local or default → 404 `Group not found or not a local group`; cycle or depth → 400 |
| DELETE | `/:id` | 409 `Cannot delete a group that has subgroups` / `…has members`; its course enrollments are withdrawn |
| GET | `/:id/members[?recursive=true]` | `{members: GroupMember[]}`; recursive includes subgroup members (with their group) |
| POST | `/:id/members {userId, role}` | add or change role (`member` / `manager`) |
| DELETE | `/:id/members/:userId` | remove (400 on the default group) |
| GET / POST / DELETE | `/:id/courses[/:courseId]` | group course enrollments; POST answers `{enrolled: <members newly enrolled>}` |

`GET /api/admin/courses/:id/groups` lists the groups enrolled in a course. Every change is audited (`group.*`).

## UI — admin

- `/admin/groups` ("Groupes"): table in tree order (indented, "↳"), badges "Par défaut" and "Manager × n", source,
  member and course counts; "+ Nouveau groupe" (dialog "Nouveau groupe local", "Nom du groupe", "ex : equipe-rh"),
  "+ sous-groupe" per row, "Supprimer" with confirmation "Supprimer le groupe « X » ? Cette action est irréversible.".
- `/admin/groups/:id`: breadcrumb path; card "Groupe" (name, description, "Groupe parent" with "Racine (aucun parent)"),
  "Membres (n)" (user search + "Rôle dans le groupe" + "Ajouter"; "Nommer manager" / "Retirer le rôle de manager";
  "Retirer"; checkbox "Inclure les membres des sous-groupes"), "Cours du groupe (n)" ("— Ajouter un cours —", "Retirer").
- Course page: "Groupes inscrits (n)" with "— Ajouter un groupe —" (name and member count) and "Retirer"; the
  enrollment list shows the origin "Groupe".

## UI — `/my-groups` ("Mes groupes")

`GET /api/my/groups` → the user's groups except `everyone`: name, path, description, role badge "Manager", "Cours du
groupe" (links), members (avatar chips linking to public profiles).

## Acceptance criteria

- Enrolling a group gives its members the course at once; withdrawing it keeps members enrolled another way.
- A group with subgroups or members cannot be deleted; a group cannot move under its own subgroup.
- Every new account is in `everyone`.

## Differences from the original

- Group grants are applied at once instead of at the member's next login.
- Group-manager is a membership role (spec 191) instead of "member of a group + platform role manager".
- SSO group sync and identity provider role mappings: [027](027-sso.md).

## Source

`apps/api/src/services/groups.ts`, `apps/api/src/routes/admin/groups.ts`, `apps/api/src/routes/groups.ts`,
`apps/api/src/db/schema/groups.ts`, `packages/shared/src/groups.ts`, `apps/admin/src/routes/groups/`,
`apps/admin/src/routes/courses/GroupEnrollmentsPanel.tsx`, `apps/app/src/routes/MyGroups.tsx`, `e2e/groups.spec.ts`.

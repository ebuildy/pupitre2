# 162 — Admin: users

| Field | Value |
| --- | --- |
| Area | Administration / users |
| Actors | Admin |
| Related | [103](103-xp.md), [130](130-groups.md) |

Covers the original 162 (user list) and 163 (edit, deactivate, delete).

## API (`/api/admin/users`)

- `GET /?search=&role=&status=active|inactive` → `{users: [{id, username, name, email, image, role, isActive, xp,
  enrolledCourses, createdAt}], total}` (first 200, by name).
- `GET /:id` → summary + XP history, completions, groups (with role), enrolled courses (with grant sources).
- `PATCH /:id {role?, isActive?}` → role ∈ student/manager/admin; deactivating closes the user's sessions at once.
  An admin cannot demote or deactivate themselves (400).
- `DELETE /:id` → every personal row cascades (memberships, grants, progress, submissions, XP…); 400 for one's own
  account. Role changes, (de)activation and deletion are audited (the audit keeps the e-mail).

## UI — `/admin/users`

- Search, "Rôle" and "Statut" filters, all kept in the URL.
- Table: Utilisateur (avatar, username, e-mail), Rôle (+ "Désactivé"), Niveau, XP, Cours, Inscrit le, Actions
  "Modifier" (dialog "Modifier — <username>": "Rôle", "Actif" switch; toast "Utilisateur mis à jour") and "Supprimer"
  (confirmation "Supprimer <username> ?"; toast "Utilisateur supprimé"; hidden on one's own row).
- `/admin/users/:id`: same actions, plus "Groupes" and "Cours inscrits" sections, XP, history and adjustments.

## Differences from the original

- Role changes apply on the next request (sessions read the role from the database); deactivation revokes sessions.
- No provider tabs yet (SSO comes later); filters by role and status instead.

## Source

`apps/api/src/routes/admin/users.ts`, `apps/admin/src/routes/users/`, `apps/admin/src/components/UserDialogs.tsx`,
`e2e/groups.spec.ts`.

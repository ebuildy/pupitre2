# 035 — Profile, change password and public profile

| Field | Value |
| --- | --- |
| Area | Account |
| Actors | signed-in user; anyone (public profile) |
| Related | [034](034-current-user.md), [020](020-registration-and-password-policy.md), [179](179-platform-settings.md) |

Covers the original 035 (edit profile), 036 (change password) and 037 (public user profile).

## UI — `/profile` ("Mon profil", reached from the avatar in the top bar)

- Layout: an overview card (avatar with "✏️ Modifier", username, role badge for managers and admins, e-mail, "Voir mon
  profil public"), then the sections as an accordion, one open at a time (it animates open and closed): "👤 Compte",
  "🗺️ Parcours", "🏅 Badges", "🎯 Compétences", "👥 Groupes", "🔒 Sécurité". The open section is in the URL
  (`/profile?tab=paths`; none: "Compte"; `?tab=` with no value: all closed). A section's content loads when it opens.
  Opening a section whose title ends up above the screen scrolls back to it.
- "Parcours", "Badges", "Compétences" and "Groupes" are the former "Mes parcours" ([120](120-learning-paths.md)),
  "Mes badges" ([106](106-badges.md)), "Mes compétences" ([110](110-skills.md)) and "Mes groupes" ([130](130-groups.md))
  pages; they have no top-bar link. `/my-paths`, `/my-badges`, `/my-skills` and `/my-groups` redirect to their section.
- Avatar dialog "Modifier la photo de profil": "URL externe" + "OK" (must start with `http://` or `https://`),
  "Retirer la photo". Toast "Photo de profil mise à jour". "Emoji de badge": the icons of earned badges ([106](106-badges.md)).
- "👤 Compte": read mode (Nom d'utilisateur, Nom affiché, Email, Bio); "Modifier" switches to a
  form (username — disabled with an explanation when `profile_allow_username_change` is off —, display name, bio
  "Dites-nous quelque chose sur vous…"), "Enregistrer" / "Annuler", toast "Profil mis à jour". The top bar follows.
- "🔒 Sécurité": "Utilisez un mot de passe fort d'au moins N caractères." and "Changer le mot de passe", which reveals
  "Mot de passe actuel", "Nouveau mot de passe" (with the policy checklist), "Confirmer le mot de passe", "Mettre à jour" /
  "Annuler". Errors "Mot de passe actuel incorrect", mismatch; toast "Mot de passe mis à jour". Accounts without a local
  password see a note that their identity provider manages it.
- Avatar rule everywhere (`UserAvatar`): `http(s)://` → image (initial while loading or on error), any other value →
  shown as text (emoji), none → first letter of the name.

## API

- `GET /api/me` adds `bio` and `hasPassword`.
- `PATCH /api/me {username?, name?, bio?, image?}` (`requireAuth`) → the updated `MeResponse`. Username: 403
  `Username changes are not allowed.` when the setting is off, 3–64 characters (letters, digits, `_`, `.`), 409
  `Username already taken` (case-insensitive). Empty `bio` / `image` clear them. E-mail and role are not editable.
- `POST /api/auth/change-password {currentPassword, newPassword}` (better-auth): wrong current password →
  `INVALID_PASSWORD`; policy enforced (400). Other sessions stay valid.
- `GET /api/users/:id` (public) → `{id, username, name, image, bio, xp, completedCourses, memberSince}`; no e-mail.
  Unknown or deactivated → 404.

## UI — `/users/:id`

Avatar, username, level badge, XP, number of completed courses, bio, "Membre depuis le …", "← Retour au classement".
Leaderboard rows link to it.

## Acceptance criteria

- Profile edits show at once in the top bar; a taken username is refused.
- A wrong current password is refused; after a change only the new password signs in.
- The public profile never exposes the e-mail; deactivated users have none.

## Differences from the original

- `PATCH /api/me` instead of `PUT /api/auth/profile`; display name is editable; `avatarUrl` is better-auth's `image`.
- Password change goes through better-auth; the original's "SSO account" error is replaced by hiding the form
  (`hasPassword`).
- The public profile also shows XP and completed courses.
- Paths, badges, skills and groups are sections of the profile (the original had separate pages in the top bar), and the
  profile's sections are an accordion instead of tabs.

## Source

`apps/api/src/routes/me.ts`, `apps/api/src/routes/users.ts`, `packages/shared/src/account.ts`,
`apps/app/src/routes/Profile.tsx`, `apps/app/src/routes/PublicProfile.tsx`, `packages/ui/src/components/user-avatar.tsx`,
`e2e/account.spec.ts`.

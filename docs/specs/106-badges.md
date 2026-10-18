# 106 — Course badges, "Mes badges" and leaderboards

| Field | Value |
| --- | --- |
| Area | Gamification |
| Actors | learner; anyone (leaderboard, profiles); admin |
| Related | [103](103-xp.md), [035](035-profile.md), [110](110-skills.md) |

Covers the original 106 (course badges), 107 ("Mes badges"), 108 (badge leaderboard), 109 (badge statistics) and
115 (admin score leaderboard).

## Model

- `course.badgeName` + `course.badgeIcon` (an emoji), both or neither; set in the admin course form (fieldset "Badge":
  "Nom du badge", "Icône (emoji)").
- `badge_award` (spec 191 "BadgeAward"): once per (user, course), with the badge name, icon and course title as awarded;
  kept (`courseId` → null) when the course is deleted. Awarded by `completeCourse()` together with the completion and
  its XP; removed when an admin undoes the completion.

## API

- `GET /api/my/badges` → `{earned: [{name, icon, course|null, courseTitle, earnedAt, earnedBy}], locked: [{name, icon,
  course, earnedBy}]}`; `locked` = published public courses with a badge not earned yet.
- `GET /api/users/:id/badges` (public) → `{badges}`; `GET /api/badges/:courseSlug` (public) → `{courseSlug, earnedBy}`.
- `GET /api/leaderboard/badges` (public) → top 20 active non-admin users by badge count (ties share a rank), with their
  icons. `GET /api/leaderboard` stays the XP ranking.
- `GET /api/admin/leaderboard` → learners by total quiz score (sum of best scores), with passed modules and enrolled
  courses (top 100, users with a score).

## UI

- Course page: card "Badge du cours" (icon greyed until earned, "✓ Badge obtenu", "Obtenu par N apprenants"); course
  cards show the badge icon before the title.
- "🏅 Badges" section of the profile (`/profile?tab=badges`; `/my-badges` redirects there): stats (badges obtenus, à débloquer, % complété), "Badges obtenus" (icon, name, course,
  date, rarity), "À débloquer" (greyed, "🔒 Non obtenu", link to the course).
- `/leaderboard`: tabs "XP" and "Badges" (🥇🥈🥉 for ranks 1–3, avatar, name → public profile, icons, "N badges").
- Public profile: "Badges obtenus". Profile avatar dialog: "Emoji de badge" — the icons of earned badges; any other emoji
  is refused (400 `Avatar emoji must come from an earned badge`).
- Admin `/admin/leaderboard` ("Classement général"): "#rank", avatar, name, "N cours · M modules validés", "X pts".

## Differences from the original

- Two leaderboards (XP and badges) instead of badges only.
- The admin leaderboard has no "Recalculer la progression" button: progress is never derived, nothing to resync (184).

## Source

`apps/api/src/services/badges.ts`, `apps/api/src/services/xp.ts` (`completeCourse`), `apps/api/src/routes/gamification.ts`,
`apps/api/src/routes/admin/leaderboard.ts`, `apps/app/src/routes/MyBadges.tsx`, `apps/app/src/routes/Leaderboard.tsx`,
`apps/admin/src/routes/Leaderboard.tsx`, `e2e/gamification.spec.ts`.

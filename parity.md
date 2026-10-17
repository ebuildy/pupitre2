# Parity with the original pupitre

Feature parity of this rewrite with the original specs (`../../pupitre/docs/spec/NNN-*.md`). One row per original spec.
The "Rewrite spec" column links the spec of this repo (`docs/specs/`) that documents it as implemented.

Status: ✅ done · 🟡 partial · ⬜ to do · ➖ not applicable to this architecture (reason given).

## Platform & cross-cutting

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 001 | Roles and permissions | ✅ | [001](docs/specs/001-roles-and-permissions.md) | |
| 002 | Session token (JWT) | ➖ | [001](docs/specs/001-roles-and-permissions.md) | better-auth server-side sessions replace JWTs |
| 003 | Browser session bridge and SSR guards | ➖ | [001](docs/specs/001-roles-and-permissions.md) | one cookie, no SSR; guards are `RequireAuth` |
| 004 | API routing, single hostname and BFF | ✅ | [004](docs/specs/004-frontends-and-routing.md) | single origin, no BFF needed |
| 005 | HTTP conventions | ✅ | [004](docs/specs/004-frontends-and-routing.md) | `{ error }` envelope, body limit, CORS |
| 006 | Health checks and metrics | 🟡 | | `/health` only; no `/ready`, no Prometheus |
| 007 | Service configuration | ✅ | | `apps/api/src/env.ts` |
| 008 | Service-to-service authentication | ➖ | | one API process, no internal services |
| 009 | Rate limiting | ✅ | [009](docs/specs/009-rate-limiting.md) | credential endpoints, per client IP |
| 010 | Light / dark theme | ✅ | [010](docs/specs/010-theme.md) | |
| 011 | Navigation shell | ✅ | [010](docs/specs/010-theme.md) | |
| 012 | Toast notifications | ✅ | [012](docs/specs/012-toast-notifications.md) | sonner |
| 013 | Batch lookup endpoints | ➖ | | needed only between services |
| 014 | Performance invariants | ⬜ | | |
| 015 | Dev seed data | ✅ | [015](docs/specs/015-dev-seed-data.md) | |
| 016 | Admin bootstrap | ✅ | [016](docs/specs/016-admin-bootstrap.md) | |
| 017 | Database and schema management | ✅ | | Drizzle migrations at startup (AGENTS.md) |
| 018 | Localization | ✅ | [018](docs/specs/018-localization.md) | French + English |

## Authentication & account

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 020 | Local registration | ✅ | [020](docs/specs/020-registration-and-password-policy.md) |  |
| 021 | Registration policy | ✅ | [020](docs/specs/020-registration-and-password-policy.md) |  |
| 022 | Password policy | ✅ | [020](docs/specs/020-registration-and-password-policy.md) |  |
| 023 | Local login | ✅ | [023](docs/specs/023-local-login.md) | |
| 024 | Local login toggle (SSO-only) | ✅ | [020](docs/specs/020-registration-and-password-policy.md) | admins keep local login in SSO-only mode |
| 025 | Post-login landing | ✅ | [025](docs/specs/025-post-login-landing.md) | |
| 026 | Logout | ✅ | [026](docs/specs/026-logout.md) | |
| 027 | OAuth provider login | ⬜ | | |
| 028 | Runtime-configured OIDC login | ⬜ | | |
| 029 | OIDC bootstrap from deployment config | ⬜ | | |
| 030 | LDAP login | ⬜ | | |
| 031 | SSO account linking | ⬜ | | |
| 032 | SSO group sync and role | ⬜ | | |
| 033 | OIDC authoritative admin groups | ⬜ | | |
| 034 | Current user | ✅ | [034](docs/specs/034-current-user.md) | |
| 035 | Edit profile | 🟡 | [035](docs/specs/035-profile.md) | emoji avatars from badges come with 106 |
| 036 | Change password | ✅ | [035](docs/specs/035-profile.md) |  |
| 037 | Public user profile | 🟡 | [035](docs/specs/035-profile.md) | badges come with 106 |
| 038 | Default group and group-enrollment sync | 🟡 | [130](docs/specs/130-groups.md) | default group done; grants applied at once (no login sync needed); SSO later |

## Catalogue & course consumption

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 040 | Course catalogue API | ✅ | [040](docs/specs/040-courses-and-catalogue.md) | |
| 041 | Catalogue page | ✅ | [040](docs/specs/040-courses-and-catalogue.md) | |
| 042 | Catalogue skill filter | ⬜ | | |
| 043 | Continue-learning hero | ⬜ | | |
| 044 | Course card | 🟡 | [040](docs/specs/040-courses-and-catalogue.md) | no progress bar, module count, thumbnail |
| 045 | Course detail page | ✅ | [045](docs/specs/045-course-page-and-enrollment.md) | |
| 046 | Course visibility | ✅ | [040](docs/specs/040-courses-and-catalogue.md) | target model (visibility + status) |
| 047 | Self-enrollment | ✅ | [045](docs/specs/045-course-page-and-enrollment.md) | |
| 048 | Auto-enrollment in public courses | ⬜ | | |
| 049 | XP-gated enrollment | ✅ | [103](docs/specs/103-xp.md) | |
| 050 | Course prerequisites | ⬜ | | |
| 052 | My courses page | 🟡 | [052](docs/specs/052-my-courses.md) | no progress bar |
| 053 | Module list and sequential locking | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 054 | Module prerequisites | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 055 | Hidden modules | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 056 | Lesson player | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 057 | Reading mode | ⬜ | | |
| 058 | Markdown rendering | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 059 | Admonitions | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 060 | Mermaid diagrams | ⬜ | | |
| 061 | Markdown patterns rendering | ⬜ | | |
| 062 | Video and image modules | ⬜ | | |
| 063 | Media replication | ⬜ | | |
| 064 | Git-sourced content | 🟡 | [053](docs/specs/053-course-content-and-quizzes.md) | fake loader only |
| 065 | Module index expansion | ⬜ | | |
| 066 | Git content cache and credentials | ⬜ | | |
| 067 | Lesson completion and navigation | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 068 | Course completion | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 069 | Lessons API | ➖ | [053](docs/specs/053-course-content-and-quizzes.md) | one module API serves lessons and quizzes |
| 070 | Legacy labs endpoints | ➖ | | compatibility aliases of the old services |

## Quizzes

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 075 | Quiz definition | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 076 | Quiz question types | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 077 | Quiz scoring | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 078 | Quiz feedback and review | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 079 | Quiz progress recording | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 080 | Quiz cooldowns | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 081 | Quiz max attempts and lock | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 082 | Quiz player page | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 083 | Inline mini-quiz | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 084 | Quiz anti-copy | ⬜ | | |
| 085 | Quiz answer confidentiality | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |

## Labs

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 090 | Lab module | ⬜ | | |
| 091 | Lab policy check (OPA on GitLab) | ⬜ | | |
| 092 | Lab step checks (GitLab) | ⬜ | | |
| 093 | Local checks (desktop app) | ⬜ | | |
| 094 | Lab check history | ⬜ | | |
| 095 | Admin lab tracking | ⬜ | | |
| 096 | Desktop companion app | ➖ | | separate Tauri app, out of this repo |

## Progress, XP, badges & skills

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 100 | Lesson progress tracking | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 101 | Module progress tracking | ✅ | [053](docs/specs/053-course-content-and-quizzes.md) | |
| 102 | Learner progress overview | ⬜ | | |
| 103 | XP awarding | ✅ | [103](docs/specs/103-xp.md) | |
| 104 | XP levels | ✅ | [103](docs/specs/103-xp.md) | |
| 105 | My XP page | ✅ | [103](docs/specs/103-xp.md) | |
| 106 | Course badges | ⬜ | | |
| 107 | My badges page | ⬜ | | |
| 108 | Badge leaderboard | 🟡 | [103](docs/specs/103-xp.md) | XP leaderboard; badges to do |
| 109 | Badge stats | ⬜ | | |
| 110 | Skill tagging | ⬜ | | |
| 111 | Skill page | ⬜ | | |
| 112 | Skill module status | ⬜ | | |
| 113 | Skill levels | ⬜ | | |
| 114 | My skills page | ⬜ | | |
| 115 | Admin score leaderboard | ⬜ | | |

## Learning paths

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 120 | Learning path model | ⬜ | | |
| 121 | Path catalogue API | ⬜ | | |
| 122 | Path enrollment | ⬜ | | |
| 123 | My paths page | ⬜ | | |
| 124 | Path progress rules | ⬜ | | |
| 125 | Path grants course access | ⬜ | | |
| 126 | Admin path management | ⬜ | | |
| 127 | Admin path enrollments | ⬜ | | |

## Groups

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 130 | Groups model | ✅ | [130](docs/specs/130-groups.md) |  |
| 131 | Admin group CRUD | ✅ | [130](docs/specs/130-groups.md) |  |
| 132 | Subgroups and move | ✅ | [130](docs/specs/130-groups.md) |  |
| 133 | Group membership | ✅ | [130](docs/specs/130-groups.md) |  |
| 134 | Group role mappings | ⬜ |  | IdP role mappings, with SSO |
| 135 | Group course enrollment | ✅ | [130](docs/specs/130-groups.md) | group grants applied immediately |
| 136 | My groups page | ✅ | [130](docs/specs/130-groups.md) |  |

## Manager & enrollment administration

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 140 | Manager scope | ✅ | [140](docs/specs/140-manager-space.md) | scope = managed groups + subgroups; gaps fixed |
| 141 | Manager members page | 🟡 | [140](docs/specs/140-manager-space.md) | path enrollments with paths (120) |
| 142 | Manager groups page | ✅ | [140](docs/specs/140-manager-space.md) |  |
| 143 | Manager paths page | ⬜ | | |
| 145 | Admin course enrollments | ✅ | [165](docs/specs/165-admin-courses.md) | |

## In-person sessions

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 150 | In-person courses and sessions | ⬜ | | |
| 151 | Session management | ⬜ | | |
| 152 | Session booking | ⬜ | | |
| 153 | My session bookings | ⬜ | | |
| 154 | Agenda | ⬜ | | |
| 155 | Session attendance | ⬜ | | |

## Administration & authoring

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 160 | Admin dashboard | 🟡 | | shortcut cards only, no stats |
| 161 | Admin monitoring | ⬜ | | |
| 162 | Admin user list | ✅ | [162](docs/specs/162-admin-users.md) | role/status filters instead of provider tabs |
| 163 | Admin user edit / deactivate / delete | ✅ | [162](docs/specs/162-admin-users.md) |  |
| 165 | Admin course list | ✅ | [165](docs/specs/165-admin-courses.md) | |
| 166 | Course create | ✅ | [165](docs/specs/165-admin-courses.md) | |
| 167 | Course edit metadata | 🟡 | [165](docs/specs/165-admin-courses.md) | no badge, in-person, prerequisites |
| 168 | Course delete | ✅ | [165](docs/specs/165-admin-courses.md) | |
| 169 | Course definition API | 🟡 | [053](docs/specs/053-course-content-and-quizzes.md) | `PUT …/modules` only |
| 170 | Course definition viewer | ⬜ | | |
| 171 | Module editor | ⬜ | | |
| 172 | Module reorder | ⬜ | | |
| 173 | Markdown document format | ⬜ | | |
| 174 | Markdown course import | ⬜ | | |
| 175 | Markdown import preview | ⬜ | | |
| 176 | Markdown course export | ⬜ | | |
| 177 | Git cache admin | ⬜ | | |
| 179 | Platform settings | 🟡 | [179](docs/specs/179-platform-settings.md) | OIDC/LDAP/GitLab keys come with their features |
| 180 | Admin markdown patterns | ⬜ | | |
| 181 | Pattern config seeding | ⬜ | | |
| 182 | CSV exports | ⬜ | | |
| 183 | Lab check CSV export | ⬜ | | |
| 184 | Admin progress sync | ➖ | | progress is computed from module ids, nothing to resync |
| 185 | Slug rules | ✅ | [040](docs/specs/040-courses-and-catalogue.md) | `SLUG_PATTERN` |

## Reference

| # | Feature | Status | Rewrite spec | Notes |
| --- | --- | --- | --- | --- |
| 190 | Current data model | ➖ | | replaced by 191 |
| 191 | Target data model | 🟡 | | built incrementally with each feature |

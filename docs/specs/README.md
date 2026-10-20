# Specs

Specs of the rewrite, as implemented. Numbering follows the original pupitre specs
(`../pupitre/docs/spec`) so each file can be compared with its source; every file has a
"Differences from the original" section.

| Spec | Title | Status |
| --- | --- | --- |
| [001](001-roles-and-permissions.md) | Roles, account status and guards | Implemented |
| [004](004-frontends-and-routing.md) | Frontends, routing and admin API prefix | Implemented |
| [005](005-http-conventions.md) | HTTP conventions (errors, validation, limits, CORS) and OpenAPI document | Implemented |
| [006](006-health-and-metrics.md) | Health, readiness and Prometheus metrics, on their own port | Implemented |
| [009](009-rate-limiting.md) | Rate limiting | Implemented |
| [010](010-theme.md) | Theme, light / dark mode and UI components | Implemented |
| [012](012-toast-notifications.md) | Toast notifications | Implemented |
| [014](014-performance-invariants.md) | Performance invariants (query counts, timeouts, streaming, bounded caches) | Implemented |
| [015](015-dev-seed-data.md) | Mock data (fixtures) | Implemented |
| [016](016-admin-bootstrap.md) | Admin account bootstrap | Implemented |
| [018](018-localization.md) | Localization (French default, English) | Implemented |
| [020](020-registration-and-password-policy.md) | Registration, registration policy, password policy, local login toggle | Implemented |
| [023](023-local-login.md) | Local login (username or e-mail + password) | Implemented |
| [025](025-post-login-landing.md) | Post-login redirect and landing page | Implemented |
| [026](026-logout.md) | Logout | Implemented |
| [027](027-sso.md) | SSO: OAuth / OIDC providers, LDAP, account linking, group sync and role mappings | Implemented |
| [034](034-current-user.md) | Current user (`GET /api/me`) | Implemented |
| [035](035-profile.md) | Profile, change password, public profile | Implemented (badge avatars with 106) |
| [040](040-courses-and-catalogue.md) | Courses, categories, visibility, catalogue, cards, "Reprendre" | Implemented |
| [045](045-course-page-and-enrollment.md) | Course page and enrollment | Implemented (no modules yet) |
| [050](050-prerequisites-and-auto-enrollment.md) | Course prerequisites and automatic enrollment | Implemented |
| [052](052-my-courses.md) | "Mes cours" | Implemented |
| [053](053-course-content-and-quizzes.md) | Course content, progress and quizzes | Implemented (fake content loader) |
| [061](061-markdown-patterns.md) | Markdown patterns (rendering, administration, seeding) | Implemented |
| [062](062-media.md) | Video and image modules, uploads, replication, thumbnails | Implemented |
| [064](064-git-content.md) | Git-sourced content, module index files, git cache | Implemented |
| [090](090-labs.md) | Labs: GitLab step checks, local checks, history, tracking, export | Implemented |
| [091](091-lab-policy-checks.md) | Lab checks by OPA / Rego policy (OPA server or opa binary) | Implemented |
| [103](103-xp.md) | XP, levels, course completion, XP gate and leaderboard | Implemented (completion marked by admins) |
| [106](106-badges.md) | Badges, "Mes badges", badge and admin leaderboards | Implemented |
| [110](110-skills.md) | Skills, levels, skill page, "Mes compétences", skill filter | Implemented |
| [120](120-learning-paths.md) | Learning paths: model, access, progress, admin, manager, "Mes parcours" | Implemented |
| [130](130-groups.md) | Groups, memberships, group enrollments, default group, "Mes groupes" | Implemented (SSO sync later) |
| [140](140-manager-space.md) | Manager space: scope, members, groups | Implemented (paths, sessions later) |
| [150](150-in-person-sessions.md) | In-person courses: sessions, booking, agenda, attendance | Implemented |
| [160](160-admin-dashboard-and-reports.md) | Admin dashboard, monitoring, CSV exports | Implemented |
| [162](162-admin-users.md) | Admin: users (list, edit, deactivate, delete) | Implemented |
| [165](165-admin-courses.md) | Admin: courses, categories and enrollments | Basic version |
| [169](169-course-authoring.md) | Course authoring: definition, module editor, markdown import / export | Implemented |
| [179](179-platform-settings.md) | Platform settings | Implemented (SSO keys with their features) |
| [191](191-data-model.md) | Data model: entities, tables and lifecycle rules | Implemented |

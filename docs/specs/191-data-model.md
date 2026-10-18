# 191 — Data model

The original's target data model, and where each entity lives in this rewrite (Drizzle schema in
`apps/api/src/db/schema/`, SQLite).

## General rules, as implemented

- **Identity**: every table has a random text id (`id`); references always use ids, never slugs, names or e-mails.
  Slugs (courses, paths, skills) can change without breaking anything.
- **Timestamps**: `createdAt` / `updatedAt` on entities (`timestamps()` helper), a date on events.
- **History**: `course_completion`, `badge_award` and `xp_event` keep a snapshot (course title…) and a nullable
  `course_id` (`set null`), so achievements survive the deletion of their course (spec 103).
- **Idempotency**: unique keys on what is earned (one completion per user and course, one badge award per user and
  badge, one XP event per user and source), enforced by `awardXp()` / `completeCourse()`.
- **Snapshots**: `audit_event.actorEmail` / `targetLabel` keep who and what, after deletions.
- **Ordered lists**: explicit `position` columns (modules, path items); quiz questions and lab steps keep their order
  in their document.

## Entities

| Original entity | Table(s) | Notes |
| --- | --- | --- |
| User | `user` | better-auth table, plus `role`, `isActive`, `username`, `bio` (`additionalFields`, `input: false` for role / status) |
| LoginIdentity | `account` | better-auth: `credential` (password), `sso-*` providers |
| SignInSession | `session` | better-auth |
| PlatformSetting | `platform_setting` | key / JSON value / updatedBy (spec 179) |
| Group, GroupMembership | `user_group`, `group_membership` | parent id, origin (`local`, `oidc`, `ldap`), default group; role `member` / `manager` |
| IdentityProviderGroupMapping | `idp_group_mapping` | spec 134 |
| Category | `category` | tree (spec 041) |
| Course | `course` | status, visibility, difficulty, XP required, auto-enroll; skills, module and enrollment counts are computed |
| Module | `module` | type, position, hidden, content source or inline body, lab configuration (JSON) |
| QuizQuestion | inside the module's quiz document | validated by `quizDocumentSchema` (spec 075) |
| LabStep | `module.lab` (JSON) | ordered steps with check type and parameters (spec 090) |
| Skill, Module ↔ Skill | `skill`, `module_skill` | |
| CoursePrerequisite, module prerequisite | `course_prerequisite`, `module_prerequisite` | |
| Session, Booking | `course_session`, `session_booking` | |
| Path, PathItem | `learning_path`, `path_item` | an item is a course or a skill |
| MarkdownPattern | `markdown_pattern` | scope global / course |
| MediaAsset | `media_asset` | files under `UPLOADS_DIR` |
| Enrollment | `enrollment_grant` | one row per grant source (`self`, `auto`, `admin`, `manager`, `group`, `path`) and `via` |
| GroupCourseEnrollment | `group_course_enrollment` | expands into `group` grants |
| PathEnrollment | `path_enrollment` | expands into `path` grants |
| ModuleProgress | `module_progress` | viewed / passed dates, best score |
| QuizSubmission, QuestionAttemptState | `quiz_submission`, `question_attempt_state` | |
| CourseCompletion | `course_completion` | |
| LabCheck | `lab_check` | spec 094 |
| XPEvent | `xp_event` | |
| BadgeAward | `badge_award` | once per user and course; the badge (name, icon) is defined on the course, the award keeps a copy |
| SkillLevel | `skill_level` | spec 113 |
| ExportRecord | `export_record` | spec 182 |
| AuditEvent | `audit_event` | actor e-mail snapshot |

## Lifecycle rules

- Archiving a course removes it from the catalogue and refuses new enrollments; progress, completions, badges and XP
  stay. Deleting it cascades to its content, sessions, bookings, grants and progress; earned XP and badges stay.
- Deleting a module cascades to its attempt states and progress; recorded completions stay.
- Deleting or archiving a path ends its path enrollments and their `path` grants; other grants stay.
- A group can be deleted only without members or subgroups; its `group` grants are withdrawn.
- Deleting a session deletes its bookings.
- A deactivated user cannot sign in; their data stays. Deleting a user cascades to their personal data; audit and
  export records keep the e-mail snapshot (`set null` on the user reference).

## Differences from the original

- Quiz questions and lab steps are not separate tables: they are ordered parts of the module's quiz document and lab
  JSON, validated on save. Answers and attempt states still reference the question id.
- An enrollment is a set of grants (one per source) rather than one row with a source, so removing one source (a
  group, a path) never removes access given by another.
- A badge is not a separate entity: it is the course's badge name and icon (spec 106), copied into the award.

## Source

- Original spec: `../../pupitre/docs/spec/191-target-data-model.md`
- `apps/api/src/db/schema/*.ts`, `apps/api/drizzle/` (migrations)

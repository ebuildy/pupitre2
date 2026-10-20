import { z } from 'zod'

// Building blocks of the wire schemas, imported by the other modules (kept apart to avoid import cycles).
// Response schemas carry `.meta({ id })`: the name of their component in the OpenAPI document.

/** Every API error is `{ error }` with a user-displayable message (spec 005). */
export const apiErrorSchema = z.object({ error: z.string() }).meta({ id: 'ApiError' })
export type ApiError = z.infer<typeof apiErrorSchema>

/** Acknowledgement of an action without a resource to return. */
export const messageSchema = z.object({ message: z.string() }).meta({ id: 'Message' })
export type MessageResponse = z.infer<typeof messageSchema>

/** Platform roles (spec 001). Every account has exactly one. */
export const ROLES = ['student', 'manager', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** `public`: listed and open to any signed-in user; `private`: granted access only (spec 191). */
export const COURSE_VISIBILITIES = ['public', 'private'] as const
export type CourseVisibility = (typeof COURSE_VISIBILITIES)[number]

/** `draft`: admins only; `published`; `archived`: no new enrollments, unlisted, history kept. */
export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const
export type CourseStatus = (typeof COURSE_STATUSES)[number]

export const categoryRefSchema = z.object({ slug: z.string(), title: z.string() }).meta({ id: 'CategoryRef' })
export type CategoryRef = z.infer<typeof categoryRefSchema>

export const skillRefSchema = z.object({ slug: z.string(), label: z.string() }).meta({ id: 'SkillRef' })
export type SkillRef = z.infer<typeof skillRefSchema>

/** Spec 113: expertise levels, in order. `master` = every course teaching the skill completed. */
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'master'] as const
export type SkillLevel = (typeof SKILL_LEVELS)[number]

export const badgeViewSchema = z.object({ name: z.string(), icon: z.string() }).meta({ id: 'Badge' })
export type Badge = z.infer<typeof badgeViewSchema>

export const MEMBERSHIP_ROLES = ['member', 'manager'] as const
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number]

/**
 * Why a user has access to a course (spec 191). `group` and `path` grants carry the group / path id (`via`) and are
 * kept in sync with memberships and group/path enrollments.
 */
export const ENROLLMENT_SOURCES = ['self', 'auto', 'admin', 'manager', 'group', 'path'] as const
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number]

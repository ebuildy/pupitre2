import { z } from 'zod'
import { categoryRefSchema, COURSE_STATUSES, COURSE_VISIBILITIES, MEMBERSHIP_ROLES, ROLES } from './common.ts'

/** What earned the XP (specs 103, 191). `lesson` and `quiz` come with modules. */
export const XP_SOURCES = ['lesson', 'quiz', 'course', 'admin'] as const
export type XpSource = (typeof XP_SOURCES)[number]

/** Spec 103 amounts; a course's completion XP is set per course (default `DEFAULT_COMPLETION_XP`). */
export const XP_AMOUNTS = { lesson: 10, quiz: 25 } as const
export const DEFAULT_COMPLETION_XP = 200

/** Spec 104. Names are translated (`common:levels.<key>`). */
export const XP_LEVELS = [
  { level: 1, key: 'novice', icon: '🌱', threshold: 0 },
  { level: 2, key: 'learner', icon: '📘', threshold: 200 },
  { level: 3, key: 'proficient', icon: '⚙️', threshold: 600 },
  { level: 4, key: 'expert', icon: '🔥', threshold: 1500 },
  { level: 5, key: 'master', icon: '🏆', threshold: 3500 },
] as const
export type XpLevel = (typeof XP_LEVELS)[number]

/** The level reached with `total` XP, and the next one (null at the top). */
export function xpLevel(total: number): { current: XpLevel; next: XpLevel | null } {
  let index = 0
  for (const [i, l] of XP_LEVELS.entries()) if (total >= l.threshold) index = i
  return { current: XP_LEVELS[index]!, next: XP_LEVELS[index + 1] ?? null }
}

export const xpEventViewSchema = z
  .object({
    source: z.enum(XP_SOURCES),
    amount: z.number(),
    /** Course title (as it was when earned) or the admin's reason. */
    label: z.string(),
    /** The course, when it still exists. */
    course: categoryRefSchema.nullable(),
    earnedAt: z.string(),
  })
  .meta({ id: 'XpEvent' })
export type XpEventView = z.infer<typeof xpEventViewSchema>

/** `GET /api/my/xp` (spec 104/105). */
export const myXpResponseSchema = z
  .object({
    total: z.number(),
    /** Most recent first. */
    history: z.array(xpEventViewSchema),
    /** Enrolled, not completed, still open: what is left to earn. */
    inProgress: z.array(z.object({ slug: z.string(), title: z.string(), completionXp: z.number() })),
  })
  .meta({ id: 'MyXp' })
export type MyXpResponse = z.infer<typeof myXpResponseSchema>

/** `GET /api/leaderboard` */
export const leaderboardResponseSchema = z
  .object({
    leaderboard: z.array(
      z.object({
        rank: z.number(),
        id: z.string(),
        username: z.string(),
        name: z.string(),
        image: z.string().nullable(),
        xp: z.number(),
      }),
    ),
    /** The signed-in user's own position, when they have XP (whether or not they are in the top). */
    me: z.object({ rank: z.number(), xp: z.number() }).nullable(),
  })
  .meta({ id: 'Leaderboard' })
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>

/** Admin manual adjustment (spec 191 "a manual adjustment by an admin"). */
export const xpAdjustmentSchema = z.object({
  amount: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((n) => n !== 0, 'Amount must not be 0'),
  reason: z.string().trim().min(1, 'Reason is required').max(200),
})
export type XpAdjustmentInput = z.input<typeof xpAdjustmentSchema>

export const adminUserSummarySchema = z
  .object({
    id: z.string(),
    username: z.string().nullable(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    role: z.enum(ROLES),
    isActive: z.boolean(),
    xp: z.number(),
    /** Spec 162: number of courses the user is enrolled in. */
    enrolledCourses: z.number(),
    createdAt: z.string(),
  })
  .meta({ id: 'AdminUserSummary' })
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>

export const adminUserDetailSchema = adminUserSummarySchema
  .extend({
    history: z.array(xpEventViewSchema),
    completions: z.array(z.object({ course: categoryRefSchema.nullable(), title: z.string(), completedAt: z.string() })),
    groups: z.array(z.object({ id: z.string(), name: z.string(), role: z.enum(MEMBERSHIP_ROLES), isDefault: z.boolean() })),
    courses: z.array(z.object({ id: z.string(), slug: z.string(), title: z.string(), sources: z.array(z.string()) })),
  })
  .meta({ id: 'AdminUserDetail' })
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>

/** `PATCH /api/admin/users/:id` (spec 163). */
export const adminUserUpdateSchema = z
  .object({
    role: z.enum(ROLES),
    isActive: z.boolean(),
  })
  .partial()
export type AdminUserUpdateInput = z.input<typeof adminUserUpdateSchema>

/** `GET /api/admin/stats` (specs 160, 161). */
export const adminStatsSchema = z
  .object({
    users: z.number(),
    activeUsers: z.number(),
    courses: z.number(),
    publishedCourses: z.number(),
    enrollments: z.number(),
    completions: z.number(),
    quizSubmissions: z.number(),
    /** Passed submissions / submissions, in %; null without submissions. */
    successRate: z.number().nullable(),
    badges: z.number(),
    groups: z.number(),
    paths: z.number(),
    upcomingSessions: z.number(),
  })
  .meta({ id: 'AdminStats' })
export type AdminStats = z.infer<typeof adminStatsSchema>

/** `GET /api/admin/stats/courses` (spec 161 "Aperçu des cours"). */
export const adminCourseOverviewSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    category: z.string().nullable(),
    visibility: z.enum(COURSE_VISIBILITIES),
    status: z.enum(COURSE_STATUSES),
    modules: z.number(),
    enrolled: z.number(),
    completions: z.number(),
  })
  .meta({ id: 'AdminCourseOverview' })
export type AdminCourseOverview = z.infer<typeof adminCourseOverviewSchema>

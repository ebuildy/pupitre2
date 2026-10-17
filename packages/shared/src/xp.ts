import { z } from 'zod'
import type { CategoryRef } from './courses.ts'

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

export type XpEventView = {
  source: XpSource
  amount: number
  /** Course title (as it was when earned) or the admin's reason. */
  label: string
  /** The course, when it still exists. */
  course: CategoryRef | null
  earnedAt: string
}

/** `GET /api/my/xp` (spec 104/105). */
export type MyXpResponse = {
  total: number
  /** Most recent first. */
  history: XpEventView[]
  /** Enrolled, not completed, still open: what is left to earn. */
  inProgress: { slug: string; title: string; completionXp: number }[]
}

/** `GET /api/leaderboard` */
export type LeaderboardResponse = {
  leaderboard: { rank: number; id: string; username: string; name: string; image: string | null; xp: number }[]
  /** The signed-in user's own position, when they have XP (whether or not they are in the top). */
  me: { rank: number; xp: number } | null
}

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

export type AdminUserSummary = {
  id: string
  username: string | null
  name: string
  email: string
  image: string | null
  role: 'student' | 'manager' | 'admin'
  isActive: boolean
  xp: number
  /** Spec 162: number of courses the user is enrolled in. */
  enrolledCourses: number
  createdAt: string
}

export type AdminUserDetail = AdminUserSummary & {
  history: XpEventView[]
  completions: { course: CategoryRef | null; title: string; completedAt: string }[]
  groups: { id: string; name: string; role: 'member' | 'manager'; isDefault: boolean }[]
  courses: { id: string; slug: string; title: string; sources: string[] }[]
}

/** `PATCH /api/admin/users/:id` (spec 163). */
export const adminUserUpdateSchema = z
  .object({
    role: z.enum(['student', 'manager', 'admin']),
    isActive: z.boolean(),
  })
  .partial()
export type AdminUserUpdateInput = z.input<typeof adminUserUpdateSchema>

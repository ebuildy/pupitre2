import { z } from 'zod'
import type { Difficulty } from './courses.ts'

// ─── Skills (specs 110–114) ───────────────────────────────────────────────────

/** Skill slugs: kebab-case tags (spec 110). */
export const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/
export const skillSlugSchema = z.string().trim().toLowerCase().regex(SKILL_SLUG_PATTERN, 'Invalid skill slug').max(60)

/** Default label of a skill created on the fly: "ci-cd" → "Ci Cd" (spec 111). */
export function skillLabel(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

export type SkillRef = { slug: string; label: string }

/** Spec 113: expertise levels, in order. `master` = every course teaching the skill completed. */
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'master'] as const
export type SkillLevel = (typeof SKILL_LEVELS)[number]
export const DIFFICULTY_ORDER: Record<Difficulty, number> = { beginner: 1, intermediate: 2, advanced: 3 }
export function skillLevelOrder(level: SkillLevel) {
  return SKILL_LEVELS.indexOf(level) + 1
}

/** `GET /api/my/skills` (spec 114). */
export type MySkillsResponse = {
  /** Skills with a recorded level, by label. */
  skills: (SkillRef & { level: SkillLevel; completedCourses: number; totalCourses: number; updatedAt: string })[]
  /** Skills of enrolled, unfinished courses without a level yet. */
  inProgress: SkillRef[]
}

export type SkillModuleStatus = 'completed' | 'available' | 'locked'

/** `GET /api/skills/:slug` (specs 110–112): courses teaching the skill; personal status when signed in. */
export type SkillDetail = {
  skill: SkillRef & { description: string | null }
  courses: {
    slug: string
    title: string
    difficulty: Difficulty | null
    enrolled: boolean
    modules: { slug: string; name: string; type: string; status: SkillModuleStatus | null }[]
    done: number
  }[]
  /** The viewer's level, if any. */
  level: SkillLevel | null
}

/** `GET /api/skills` */
export type SkillListResponse = { skills: (SkillRef & { courseCount: number })[] }

// ─── Badges (specs 106–109) ───────────────────────────────────────────────────

export const DEFAULT_BADGE_ICON = '🏅'

export const badgeSchema = z.object({
  name: z.string().trim().min(1, 'Badge name is required').max(100),
  /** An emoji. */
  icon: z
    .string()
    .trim()
    .min(1)
    .refine((v) => [...v].length <= 8 && !/[a-z0-9]/i.test(v), 'Badge icon must be an emoji'),
})
export type BadgeInput = z.input<typeof badgeSchema>

export type Badge = { name: string; icon: string }

export type EarnedBadge = Badge & {
  /** The course, when it still exists. */
  course: { slug: string; title: string } | null
  courseTitle: string
  earnedAt: string
  /** Number of learners holding this badge (rarity, spec 109). */
  earnedBy: number
}

/** `GET /api/my/badges` (spec 107). */
export type MyBadgesResponse = {
  earned: EarnedBadge[]
  /** Published public courses with a badge not earned yet. */
  locked: (Badge & { course: { slug: string; title: string }; earnedBy: number })[]
}

/** `GET /api/users/:id/badges` (spec 037). */
export type UserBadgesResponse = { badges: EarnedBadge[] }

/** `GET /api/leaderboard?by=badges` (spec 108). */
export type BadgeLeaderboardResponse = {
  leaderboard: { rank: number; id: string; username: string; image: string | null; count: number; icons: string[] }[]
}

/** `GET /api/admin/leaderboard` (spec 115). */
export type AdminLeaderboardResponse = {
  leaderboard: {
    rank: number
    id: string
    username: string
    email: string
    image: string | null
    totalScore: number
    passedModules: number
    enrolledCourses: number
  }[]
}

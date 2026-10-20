import { z } from 'zod'
import { badgeViewSchema, DIFFICULTIES, type Difficulty, SKILL_LEVELS, type SkillLevel, skillRefSchema } from './common.ts'

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

export const DIFFICULTY_ORDER: Record<Difficulty, number> = { beginner: 1, intermediate: 2, advanced: 3 }
export function skillLevelOrder(level: SkillLevel) {
  return SKILL_LEVELS.indexOf(level) + 1
}

/** `GET /api/my/skills` (spec 114). */
export const mySkillsResponseSchema = z
  .object({
    /** Skills with a recorded level, by label. */
    skills: z.array(
      skillRefSchema.extend({
        level: z.enum(SKILL_LEVELS),
        completedCourses: z.number(),
        totalCourses: z.number(),
        updatedAt: z.string(),
      }),
    ),
    /** Skills of enrolled, unfinished courses without a level yet. */
    inProgress: z.array(skillRefSchema),
  })
  .meta({ id: 'MySkills' })
export type MySkillsResponse = z.infer<typeof mySkillsResponseSchema>

export const SKILL_MODULE_STATUSES = ['completed', 'available', 'locked'] as const
export type SkillModuleStatus = (typeof SKILL_MODULE_STATUSES)[number]

/** `GET /api/skills/:slug` (specs 110–112): courses teaching the skill; personal status when signed in. */
export const skillDetailSchema = z
  .object({
    skill: skillRefSchema.extend({ description: z.string().nullable() }),
    courses: z.array(
      z.object({
        slug: z.string(),
        title: z.string(),
        difficulty: z.enum(DIFFICULTIES).nullable(),
        enrolled: z.boolean(),
        modules: z.array(
          z.object({ slug: z.string(), name: z.string(), type: z.string(), status: z.enum(SKILL_MODULE_STATUSES).nullable() }),
        ),
        done: z.number(),
      }),
    ),
    /** The viewer's level, if any. */
    level: z.enum(SKILL_LEVELS).nullable(),
  })
  .meta({ id: 'SkillDetail' })
export type SkillDetail = z.infer<typeof skillDetailSchema>

/** `GET /api/skills` */
export const skillListResponseSchema = z
  .object({ skills: z.array(skillRefSchema.extend({ courseCount: z.number() })) })
  .meta({ id: 'SkillList' })
export type SkillListResponse = z.infer<typeof skillListResponseSchema>

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

const courseLinkSchema = z.object({ slug: z.string(), title: z.string() })

export const earnedBadgeSchema = badgeViewSchema
  .extend({
    /** The course, when it still exists. */
    course: courseLinkSchema.nullable(),
    courseTitle: z.string(),
    earnedAt: z.string(),
    /** Number of learners holding this badge (rarity, spec 109). */
    earnedBy: z.number(),
  })
  .meta({ id: 'EarnedBadge' })
export type EarnedBadge = z.infer<typeof earnedBadgeSchema>

/** `GET /api/my/badges` (spec 107). */
export const myBadgesResponseSchema = z
  .object({
    earned: z.array(earnedBadgeSchema),
    /** Published public courses with a badge not earned yet. */
    locked: z.array(badgeViewSchema.extend({ course: courseLinkSchema, earnedBy: z.number() })),
  })
  .meta({ id: 'MyBadges' })
export type MyBadgesResponse = z.infer<typeof myBadgesResponseSchema>

/** `GET /api/users/:id/badges` (spec 037). */
export const userBadgesResponseSchema = z.object({ badges: z.array(earnedBadgeSchema) }).meta({ id: 'UserBadges' })
export type UserBadgesResponse = z.infer<typeof userBadgesResponseSchema>

/** `GET /api/badges/:courseSlug` (spec 109): rarity of a course badge. */
export const badgeRarityResponseSchema = z.object({ courseSlug: z.string(), earnedBy: z.number() }).meta({ id: 'BadgeRarity' })

/** `GET /api/leaderboard/badges` (spec 108). */
export const badgeLeaderboardResponseSchema = z
  .object({
    leaderboard: z.array(
      z.object({
        rank: z.number(),
        id: z.string(),
        username: z.string(),
        image: z.string().nullable(),
        count: z.number(),
        icons: z.array(z.string()),
      }),
    ),
  })
  .meta({ id: 'BadgeLeaderboard' })
export type BadgeLeaderboardResponse = z.infer<typeof badgeLeaderboardResponseSchema>

/** `GET /api/admin/leaderboard` (spec 115). */
export const adminLeaderboardResponseSchema = z
  .object({
    leaderboard: z.array(
      z.object({
        rank: z.number(),
        id: z.string(),
        username: z.string(),
        email: z.string(),
        image: z.string().nullable(),
        totalScore: z.number(),
        passedModules: z.number(),
        enrolledCourses: z.number(),
      }),
    ),
  })
  .meta({ id: 'AdminLeaderboard' })
export type AdminLeaderboardResponse = z.infer<typeof adminLeaderboardResponseSchema>

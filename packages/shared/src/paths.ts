import { z } from 'zod'
import { COURSE_STATUSES, type CourseStatus, DIFFICULTIES, type Difficulty, SLUG_PATTERN } from './courses.ts'
import { type SkillRef, skillSlugSchema } from './gamification.ts'

/** Spec 120: a sequence of courses, or a sequence of skills. */
export const PATH_KINDS = ['course', 'skill'] as const
export type PathKind = (typeof PATH_KINDS)[number]

export type PathItemStatus = 'completed' | 'available' | 'locked'

export const pathInputSchema = z.object({
  slug: z.string().trim().regex(SLUG_PATTERN, 'Invalid slug').max(100),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable()
    .optional(),
  kind: z.enum(PATH_KINDS).default('course'),
  level: z.enum(DIFFICULTIES).nullable().optional(),
  status: z.enum(COURSE_STATUSES).default('draft'),
  /** Ordered; course ids (course paths) or skill slugs (skill paths). No duplicates. */
  items: z
    .array(z.string().min(1))
    .max(100)
    .default([])
    .refine((items) => new Set(items).size === items.length, 'Duplicate path item'),
})
export type PathInput = z.input<typeof pathInputSchema>
export const pathUpdateSchema = pathInputSchema.partial()
export type PathUpdateInput = z.input<typeof pathUpdateSchema>
export { skillSlugSchema as pathSkillSchema }

export type PathItem =
  | { kind: 'course'; id: string; slug: string; title: string; status: CourseStatus }
  | { kind: 'skill'; id: string; slug: string; title: string }

export type AdminPath = {
  id: string
  slug: string
  title: string
  description: string | null
  kind: PathKind
  level: Difficulty | null
  status: CourseStatus
  items: PathItem[]
  enrollmentCount: number
  createdAt: string
  updatedAt: string
}

/** A learner's progress in a path (spec 124). */
export type PathProgressItem = { slug: string; title: string; status: PathItemStatus }

export type PathEnrollmentRow = {
  userId: string
  username: string | null
  name: string
  email: string
  enrolledAt: string
  completed: number
  total: number
  items: PathProgressItem[]
}

/** `GET /api/paths` and `/api/paths/:slug` (spec 121): published paths. */
export type PublicPath = {
  slug: string
  title: string
  description: string | null
  kind: PathKind
  level: Difficulty | null
  /** Course paths: the aggregated skills of the member courses. */
  skills: SkillRef[]
  items: { slug: string; title: string }[]
}

/** `GET /api/my/paths` (spec 123). */
export type MyPath = PublicPath & {
  enrolledAt: string
  progress: PathProgressItem[]
  completed: number
}

import { z } from 'zod'
import { COURSE_STATUSES, DIFFICULTIES, skillRefSchema } from './common.ts'
import { SLUG_PATTERN } from './courses.ts'
import { skillSlugSchema } from './gamification.ts'

/** Spec 120: a sequence of courses, or a sequence of skills. */
export const PATH_KINDS = ['course', 'skill'] as const
export type PathKind = (typeof PATH_KINDS)[number]

export const PATH_ITEM_STATUSES = ['completed', 'available', 'locked'] as const
export type PathItemStatus = (typeof PATH_ITEM_STATUSES)[number]

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

export const pathItemSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('course'), id: z.string(), slug: z.string(), title: z.string(), status: z.enum(COURSE_STATUSES) }),
    z.object({ kind: z.literal('skill'), id: z.string(), slug: z.string(), title: z.string() }),
  ])
  .meta({ id: 'PathItem' })
export type PathItem = z.infer<typeof pathItemSchema>

export const adminPathSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    kind: z.enum(PATH_KINDS),
    level: z.enum(DIFFICULTIES).nullable(),
    status: z.enum(COURSE_STATUSES),
    items: z.array(pathItemSchema),
    enrollmentCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'AdminPath' })
export type AdminPath = z.infer<typeof adminPathSchema>

/** A learner's progress in a path (spec 124). */
export const pathProgressItemSchema = z
  .object({ slug: z.string(), title: z.string(), status: z.enum(PATH_ITEM_STATUSES) })
  .meta({ id: 'PathProgressItem' })
export type PathProgressItem = z.infer<typeof pathProgressItemSchema>

export const pathEnrollmentRowSchema = z
  .object({
    userId: z.string(),
    username: z.string().nullable(),
    name: z.string(),
    email: z.string(),
    enrolledAt: z.string(),
    completed: z.number(),
    total: z.number(),
    items: z.array(pathProgressItemSchema),
  })
  .meta({ id: 'PathEnrollment' })
export type PathEnrollmentRow = z.infer<typeof pathEnrollmentRowSchema>

/** `GET /api/paths` and `/api/paths/:slug` (spec 121): published paths. */
export const publicPathSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    kind: z.enum(PATH_KINDS),
    level: z.enum(DIFFICULTIES).nullable(),
    /** Course paths: the aggregated skills of the member courses. */
    skills: z.array(skillRefSchema),
    items: z.array(z.object({ slug: z.string(), title: z.string() })),
  })
  .meta({ id: 'PublicPath' })
export type PublicPath = z.infer<typeof publicPathSchema>

/** `GET /api/my/paths` (spec 123). */
export const myPathSchema = publicPathSchema
  .extend({
    enrolledAt: z.string(),
    progress: z.array(pathProgressItemSchema),
    completed: z.number(),
  })
  .meta({ id: 'MyPath' })
export type MyPath = z.infer<typeof myPathSchema>

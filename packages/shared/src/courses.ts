import { z } from 'zod'
import {
  badgeViewSchema,
  categoryRefSchema,
  COURSE_STATUSES,
  COURSE_VISIBILITIES,
  DIFFICULTIES,
  ENROLLMENT_SOURCES,
  SKILL_LEVELS,
  skillRefSchema,
} from './common.ts'
import { badgeSchema } from './gamification.ts'

/** Spec 185. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional()

/** Admin create body for a category. */
export const categoryCreateSchema = z.object({
  slug: z.string().trim().regex(SLUG_PATTERN, 'Invalid slug').max(100),
  title: z.string().trim().min(1, 'Title is required').max(200),
  parentId: z.string().min(1).nullable().optional(),
})
export type CategoryCreateInput = z.input<typeof categoryCreateSchema>

export const categoryUpdateSchema = categoryCreateSchema.partial()
export type CategoryUpdateInput = z.input<typeof categoryUpdateSchema>

/** Spec 050: a course that must be completed first: some progress, a minimum quiz score, and/or passed modules. */
export const prerequisiteSchema = z.object({
  courseId: z.string().min(1),
  /** Sum of best quiz scores in that course. */
  minScore: z.number().int().min(0).max(100_000).nullable().optional(),
  /** Module slugs of that course that must be done. */
  modules: z.array(z.string().min(1)).max(100).optional(),
})
export type PrerequisiteInput = z.input<typeof prerequisiteSchema>

/** Admin create body for a course. Messages are English; the admin form validates first with translated messages. */
export const courseCreateSchema = z.object({
  slug: z.string().trim().regex(SLUG_PATTERN, 'Invalid slug').max(100),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: optionalText,
  categoryId: z.string().min(1).nullable().optional(),
  difficulty: z.enum(DIFFICULTIES).nullable().optional(),
  /** Spec 049: minimum XP to self-enroll; 0 = no gate. */
  xpRequired: z.number().int().min(0).max(1_000_000).optional(),
  /** Spec 191: XP granted on completion. */
  completionXp: z.number().int().min(0).max(100_000).optional(),
  visibility: z.enum(COURSE_VISIBILITIES).default('private'),
  status: z.enum(COURSE_STATUSES).default('draft'),
  /** Spec 106: awarded on completion. */
  badge: badgeSchema.nullable().optional(),
  /** Spec 150: in-person course, with sessions. */
  inPerson: z.boolean().optional(),
  /** Spec 050. */
  prerequisites: z.array(prerequisiteSchema).max(20).optional(),
  /** Spec 044: card image, uploaded (`/uploads/…`) or remote. */
  thumbnailUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => v === '' || /^https?:\/\//i.test(v) || /^\/uploads\/[\w.-]+$/.test(v), 'Invalid image URL')
    .transform((v) => v || null)
    .nullable()
    .optional(),
})
export type CourseCreateInput = z.input<typeof courseCreateSchema>

/** Admin update body: any subset of the create fields. */
export const courseUpdateSchema = courseCreateSchema
  .extend({
    visibility: z.enum(COURSE_VISIBILITIES),
    status: z.enum(COURSE_STATUSES),
  })
  .partial()
export type CourseUpdateInput = z.input<typeof courseUpdateSchema>

/** A course's category, with its ancestors from the root (for "DevOps › Docker"). */
export const courseCategorySchema = categoryRefSchema
  .extend({ ancestors: z.array(categoryRefSchema) })
  .meta({ id: 'CourseCategory' })
export type CourseCategory = z.infer<typeof courseCategorySchema>

const progressSchema = z.object({ done: z.number(), total: z.number() })

/** A course as shown to learners (catalogue card, course page). */
export const courseSummarySchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    category: courseCategorySchema.nullable(),
    difficulty: z.enum(DIFFICULTIES).nullable(),
    xpRequired: z.number(),
    completionXp: z.number(),
    /** Signed-in user is enrolled. Always `false` for anonymous visitors. */
    enrolled: z.boolean(),
    /** Signed-in user completed the course. */
    completed: z.boolean(),
    badge: badgeViewSchema.nullable(),
    inPerson: z.boolean(),
    thumbnailUrl: z.string().nullable(),
    /** Spec 110: union of the skills of its visible modules. */
    skills: z.array(skillRefSchema),
    moduleCount: z.number(),
    /** Enrolled users: visible modules done (spec 044). */
    progress: progressSchema.nullable(),
  })
  .meta({ id: 'CourseSummary' })
export type CourseSummary = z.infer<typeof courseSummarySchema>

/** `GET /api/courses` */
export const courseListResponseSchema = z
  .object({
    courses: z.array(courseSummarySchema),
    total: z.number(),
    /**
     * Top-level categories of the courses matching search + difficulty (before the category filter), for the chips.
     * `count` includes the courses of subcategories.
     */
    categories: z.array(categoryRefSchema.extend({ count: z.number() })),
    /** Spec 042: the `skill` filter, with the viewer's level in it ("Cours adaptés à ton niveau"). */
    skillFilter: skillRefSchema.extend({ level: z.enum(SKILL_LEVELS).nullable() }).nullable(),
  })
  .meta({ id: 'CourseList' })
export type CourseListResponse = z.infer<typeof courseListResponseSchema>

/** Spec 050, on the course page: each prerequisite and whether the viewer meets it. */
export const coursePrerequisiteViewSchema = z
  .object({
    course: z.object({ slug: z.string(), title: z.string() }),
    minScore: z.number().nullable(),
    modules: z.array(z.object({ slug: z.string(), name: z.string() })),
    met: z.boolean(),
  })
  .meta({ id: 'CoursePrerequisite' })
export type CoursePrerequisiteView = z.infer<typeof coursePrerequisiteViewSchema>

/** `GET /api/courses/:slug` */
export const courseDetailSchema = courseSummarySchema
  .extend({
    prerequisites: z.array(coursePrerequisiteViewSchema),
    /** Every prerequisite met (always true for admins and courses without any). */
    prerequisitesMet: z.boolean(),
    visibility: z.enum(COURSE_VISIBILITIES),
    status: z.enum(COURSE_STATUSES),
    enrollment: z
      .object({
        enrolledAt: z.string(),
        /** The learner can withdraw: every grant is their own. */
        canUnenroll: z.boolean(),
      })
      .nullable(),
    completedAt: z.string().nullable(),
    /** Signed-in user's total XP (for the enrollment gate), null when signed out. */
    userXp: z.number().nullable(),
  })
  .meta({ id: 'CourseDetail' })
export type CourseDetail = z.infer<typeof courseDetailSchema>

/** `GET /api/my/courses` */
export const myCoursesResponseSchema = z
  .object({
    courses: z.array(
      courseSummarySchema.extend({
        status: z.enum(COURSE_STATUSES),
        enrolledAt: z.string(),
        completedAt: z.string().nullable(),
        /** Last module viewed or quiz submitted. */
        lastActivityAt: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'MyCourses' })
export type MyCoursesResponse = z.infer<typeof myCoursesResponseSchema>

/** A course as shown to admins. */
export const adminCourseSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    categoryId: z.string().nullable(),
    category: courseCategorySchema.nullable(),
    difficulty: z.enum(DIFFICULTIES).nullable(),
    xpRequired: z.number(),
    completionXp: z.number(),
    visibility: z.enum(COURSE_VISIBILITIES),
    status: z.enum(COURSE_STATUSES),
    badge: badgeViewSchema.nullable(),
    inPerson: z.boolean(),
    thumbnailUrl: z.string().nullable(),
    prerequisites: z.array(z.object({ courseId: z.string(), minScore: z.number().nullable(), modules: z.array(z.string()) })),
    enrollmentCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'AdminCourse' })
export type AdminCourse = z.infer<typeof adminCourseSchema>

export const adminCourseEnrollmentSchema = z
  .object({
    userId: z.string(),
    username: z.string().nullable(),
    name: z.string(),
    email: z.string(),
    enrolledAt: z.string(),
    sources: z.array(z.enum(ENROLLMENT_SOURCES)),
    completedAt: z.string().nullable(),
  })
  .meta({ id: 'AdminCourseEnrollment' })
export type AdminCourseEnrollment = z.infer<typeof adminCourseEnrollmentSchema>

export const adminUserSearchResultSchema = z
  .object({ id: z.string(), username: z.string().nullable(), name: z.string(), email: z.string() })
  .meta({ id: 'AdminUserSearchResult' })
export type AdminUserSearchResult = z.infer<typeof adminUserSearchResultSchema>

export const adminCategorySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    parentId: z.string().nullable(),
    /** Courses directly in this category. */
    courseCount: z.number(),
    childCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'AdminCategory' })
export type AdminCategory = z.infer<typeof adminCategorySchema>

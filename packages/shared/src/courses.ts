import { z } from 'zod'

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** `public`: listed and open to any signed-in user; `private`: granted access only (spec 191). */
export const COURSE_VISIBILITIES = ['public', 'private'] as const
export type CourseVisibility = (typeof COURSE_VISIBILITIES)[number]

/** `draft`: admins only; `published`; `archived`: no new enrollments, unlisted, history kept. */
export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const
export type CourseStatus = (typeof COURSE_STATUSES)[number]

/** Why a user has access to a course. More sources (group, path, …) come with their features. */
export const ENROLLMENT_SOURCES = ['self', 'admin'] as const
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number]

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

/** Admin create body for a course. Messages are English; the admin form validates first with translated messages. */
export const courseCreateSchema = z.object({
  slug: z.string().trim().regex(SLUG_PATTERN, 'Invalid slug').max(100),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: optionalText,
  categoryId: z.string().min(1).nullable().optional(),
  difficulty: z.enum(DIFFICULTIES).nullable().optional(),
  visibility: z.enum(COURSE_VISIBILITIES).default('private'),
  status: z.enum(COURSE_STATUSES).default('draft'),
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

export type CategoryRef = { slug: string; title: string }

/** A course's category, with its ancestors from the root (for "DevOps › Docker"). */
export type CourseCategory = CategoryRef & { ancestors: CategoryRef[] }

/** A course as shown to learners (catalogue card, course page). */
export type CourseSummary = {
  slug: string
  title: string
  description: string | null
  category: CourseCategory | null
  difficulty: Difficulty | null
  /** Signed-in user is enrolled. Always `false` for anonymous visitors. */
  enrolled: boolean
}

/** `GET /api/courses` */
export type CourseListResponse = {
  courses: CourseSummary[]
  total: number
  /**
   * Top-level categories of the courses matching search + difficulty (before the category filter), for the chips.
   * `count` includes the courses of subcategories.
   */
  categories: (CategoryRef & { count: number })[]
}

/** `GET /api/courses/:slug` */
export type CourseDetail = CourseSummary & {
  visibility: CourseVisibility
  status: CourseStatus
  enrollment: null | {
    enrolledAt: string
    /** The learner can withdraw: every grant is their own. */
    canUnenroll: boolean
  }
}

/** `GET /api/my/courses` */
export type MyCoursesResponse = {
  courses: (CourseSummary & { status: CourseStatus; enrolledAt: string })[]
}

/** A course as shown to admins. */
export type AdminCourse = {
  id: string
  slug: string
  title: string
  description: string | null
  categoryId: string | null
  category: CourseCategory | null
  difficulty: Difficulty | null
  visibility: CourseVisibility
  status: CourseStatus
  enrollmentCount: number
  createdAt: string
  updatedAt: string
}

export type AdminCourseEnrollment = {
  userId: string
  username: string | null
  name: string
  email: string
  enrolledAt: string
  sources: EnrollmentSource[]
}

export type AdminUserSearchResult = {
  id: string
  username: string | null
  name: string
  email: string
}

export type AdminCategory = {
  id: string
  slug: string
  title: string
  parentId: string | null
  /** Courses directly in this category. */
  courseCount: number
  childCount: number
  createdAt: string
  updatedAt: string
}

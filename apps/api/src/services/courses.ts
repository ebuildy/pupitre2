import type { AdminCourse, CourseListResponse, CourseSummary, Difficulty, EnrollmentSource, Role } from '@pupitre/shared'
import { and, asc, count, eq, inArray, like, min, or, type SQL, sql } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { category, course, enrollmentGrant } from '../db/schema/index.ts'
import { type CategoryTree, ref } from './categories.ts'
import { courseExtras } from './skills.ts'

export type Course = typeof course.$inferSelect

/** Escapes `%`, `_` and `\` for a `LIKE … ESCAPE '\'` substring match. */
function containsPattern(search: string) {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

function textSearch(search: string | undefined, ...columns: Parameters<typeof like>[0][]) {
  const term = search?.trim()
  if (!term) return undefined
  const pattern = containsPattern(term)
  // SQLite LIKE is case-insensitive for ASCII.
  return or(...columns.map((col) => sql`${col} LIKE ${pattern} ESCAPE '\\'`))
}

export type CourseExtras = ReturnType<typeof courseExtras>

export function badgeOf(c: Course) {
  return c.badgeName && c.badgeIcon ? { name: c.badgeName, icon: c.badgeIcon } : null
}

/** `extras`: skills, module counts and progress of a batch of courses (`courseExtras`), loaded once per request. */
export function toSummary(
  c: Course,
  tree: CategoryTree,
  state: { enrolled: boolean; completed: boolean } = { enrolled: false, completed: false },
  extras?: CourseExtras,
): CourseSummary {
  const total = extras?.moduleCount.get(c.id) ?? 0
  return {
    slug: c.slug,
    title: c.title,
    description: c.description,
    category: tree.courseCategory(c.categoryId),
    difficulty: c.difficulty,
    xpRequired: c.xpRequired,
    completionXp: c.completionXp,
    ...state,
    badge: badgeOf(c),
    inPerson: c.inPerson,
    thumbnailUrl: c.thumbnailUrl,
    skills: extras?.skills.get(c.id) ?? [],
    moduleCount: total,
    progress: state.enrolled && extras ? { done: Math.min(extras.done.get(c.id) ?? 0, total), total } : null,
  }
}

export function toAdminCourse(
  c: Course,
  enrollmentCount: number,
  tree: CategoryTree,
  prerequisites: AdminCourse['prerequisites'] = [],
): AdminCourse {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    categoryId: c.categoryId,
    category: tree.courseCategory(c.categoryId),
    difficulty: c.difficulty,
    xpRequired: c.xpRequired,
    completionXp: c.completionXp,
    visibility: c.visibility,
    status: c.status,
    badge: badgeOf(c),
    inPerson: c.inPerson,
    thumbnailUrl: c.thumbnailUrl,
    prerequisites,
    enrollmentCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

/** Ids of the courses (among `courseIds`, or all) in which the user holds at least one grant. */
export async function enrolledCourseIds(userId: string, courseIds?: string[]) {
  if (courseIds && courseIds.length === 0) return new Set<string>()
  const rows = await db
    .selectDistinct({ courseId: enrollmentGrant.courseId })
    .from(enrollmentGrant)
    .where(
      and(eq(enrollmentGrant.userId, userId), courseIds ? inArray(enrollmentGrant.courseId, courseIds) : undefined),
    )
  return new Set(rows.map((r) => r.courseId))
}

/** Ids of the published courses teaching the skill `slug` through a visible module (spec 042). */
export function courseIdsWithSkill(slug: string) {
  const rows = db.all<{ id: string }>(sql`
    SELECT DISTINCT m.course_id AS id FROM module_skill ms
    JOIN module m ON m.id = ms.module_id AND m.hidden = 0
    JOIN skill s ON s.id = ms.skill_id
    WHERE s.slug = ${slug}`)
  return rows.map((r) => r.id)
}

/**
 * Spec 040: published public courses, filtered in SQL. `categories` are category slugs (OR); each one also
 * matches the courses of its subcategories. Unknown slugs match nothing.
 */
export async function listCatalogue(
  tree: CategoryTree,
  filters: { search?: string; difficulty?: Difficulty; categories?: string[]; courseIds?: string[]; minDifficulty?: number },
) {
  // A search term also matches every course filed under a category whose title contains it (subcategories included).
  const term = filters.search?.trim().toLocaleLowerCase()
  const matchingCategoryIds = term
    ? tree.all.filter((c) => c.title.toLocaleLowerCase().includes(term)).flatMap((c) => tree.subtreeIds(c.id))
    : []
  const search = textSearch(filters.search, course.title, course.description)
  const base: (SQL | undefined)[] = [
    eq(course.status, 'published'),
    eq(course.visibility, 'public'),
    search && matchingCategoryIds.length ? or(search, inArray(course.categoryId, matchingCategoryIds)) : search,
    filters.difficulty ? eq(course.difficulty, filters.difficulty) : undefined,
    // Spec 042: courses teaching a skill, at or above the learner's level.
    filters.courseIds ? (filters.courseIds.length ? inArray(course.id, filters.courseIds) : sql`0`) : undefined,
    filters.minDifficulty && filters.minDifficulty > 1
      ? inArray(course.difficulty, (['beginner', 'intermediate', 'advanced'] as const).slice(filters.minDifficulty - 1))
      : undefined,
  ]

  // Chip counts: per category, then rolled up to the top-level categories.
  const perCategory = await db
    .select({ categoryId: course.categoryId, count: count() })
    .from(course)
    .where(and(...base))
    .groupBy(course.categoryId)
  const rootCounts = new Map<string, number>()
  for (const row of perCategory) {
    const root = row.categoryId ? tree.rootOf(row.categoryId) : undefined
    if (root) rootCounts.set(root.id, (rootCounts.get(root.id) ?? 0) + row.count)
  }
  const chips: CourseListResponse['categories'] = [...rootCounts]
    .map(([id, n]) => ({ ...ref(tree.byId.get(id)!), count: n }))
    .sort((a, b) => a.title.localeCompare(b.title))

  let categoryFilter: SQL | undefined
  if (filters.categories?.length) {
    const ids = filters.categories.flatMap((slug) => {
      const found = tree.bySlug(slug)
      return found ? tree.subtreeIds(found.id) : []
    })
    categoryFilter = ids.length ? inArray(course.categoryId, ids) : sql`0`
  }

  const courses = await db
    .select()
    .from(course)
    .where(and(...base, categoryFilter))
    .orderBy(asc(course.title))

  return { courses, categories: chips }
}

export async function findCourseBySlug(slug: string) {
  return db.query.course.findFirst({ where: eq(course.slug, slug) })
}

export async function findCourseById(id: string) {
  return db.query.course.findFirst({ where: eq(course.id, id) })
}

/** The user's grants on one course, oldest first. */
export async function grantsFor(userId: string, courseId: string) {
  return db
    .select({ source: enrollmentGrant.source, createdAt: enrollmentGrant.createdAt })
    .from(enrollmentGrant)
    .where(and(eq(enrollmentGrant.userId, userId), eq(enrollmentGrant.courseId, courseId)))
    .orderBy(asc(enrollmentGrant.createdAt))
}

/**
 * Spec 046 / 191: who may see a course page.
 * Admins: everything. Others: published public courses, plus published or archived courses they are enrolled in.
 */
export function canView(c: Course, role: Role | undefined, enrolled: boolean) {
  if (role === 'admin') return true
  if (c.status === 'published' && c.visibility === 'public') return true
  return enrolled && c.status !== 'draft'
}

/** Self-enrollment is open on published public courses only. */
export function canSelfEnroll(c: Course) {
  return c.status === 'published' && c.visibility === 'public'
}

export const GRANT_TARGET = [enrollmentGrant.userId, enrollmentGrant.courseId, enrollmentGrant.source, enrollmentGrant.via]

/** Idempotent: one grant per (user, course, source, via). `via` is the group or path of `group` / `path` grants. */
export async function grant(
  userId: string,
  courseId: string,
  source: EnrollmentSource,
  grantedBy: string | null,
  via = '',
) {
  await db
    .insert(enrollmentGrant)
    .values({ userId, courseId, source, grantedBy, via })
    .onConflictDoNothing({ target: GRANT_TARGET })
}

/** Removes the user's grants of the given sources (all `via`). Progress is kept. */
export async function revoke(userId: string, courseId: string, sources: EnrollmentSource[]) {
  await db
    .delete(enrollmentGrant)
    .where(
      and(
        eq(enrollmentGrant.userId, userId),
        eq(enrollmentGrant.courseId, courseId),
        inArray(enrollmentGrant.source, sources),
      ),
    )
}

/** Spec 052: the user's enrolled courses (drafts excluded), with their enrollment date and last activity. */
export async function listMyCourses(userId: string) {
  const lastActivity = sql<number | null>`(
    SELECT max(p.last_activity_at) FROM module_progress p JOIN module m ON m.id = p.module_id
    WHERE p.user_id = ${userId} AND m.course_id = ${course.id}
  )`
  return db
    .select({ course, enrolledAt: min(enrollmentGrant.createdAt).mapWith(Number), lastActivity })
    .from(enrollmentGrant)
    .innerJoin(course, eq(course.id, enrollmentGrant.courseId))
    .where(and(eq(enrollmentGrant.userId, userId), inArray(course.status, ['published', 'archived'])))
    .groupBy(course.id)
    .orderBy(asc(course.title))
}

/** Spec 165: every course, with its enrollment count. */
export async function listAdminCourses(search?: string) {
  const enrollmentCount = sql<number>`(
    SELECT count(DISTINCT ${enrollmentGrant.userId}) FROM ${enrollmentGrant}
    WHERE ${enrollmentGrant.courseId} = ${course.id}
  )`.mapWith(Number)

  return db
    .select({ course, enrollmentCount })
    .from(course)
    .leftJoin(category, eq(category.id, course.categoryId))
    .where(textSearch(search, course.title, course.slug, category.title))
    .orderBy(asc(course.title))
}

export async function countEnrolled(courseId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(DISTINCT ${enrollmentGrant.userId})`.mapWith(Number) })
    .from(enrollmentGrant)
    .where(eq(enrollmentGrant.courseId, courseId))
  return row?.n ?? 0
}

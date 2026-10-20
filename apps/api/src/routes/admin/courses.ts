import {
  adminCourseEnrollmentSchema,
  type AdminCourseEnrollment,
  adminCourseSchema,
  adminModuleSchema,
  courseCreateSchema,
  courseDefinitionSchema,
  courseModulesSchema,
  courseSpecSchema,
  MARKDOWN_SPLITS,
  courseUpdateSchema,
  messageSchema,
  SLUG_PATTERN,
  type EnrollmentSource,
} from '@pupitre/shared'
import { and, asc, eq, isNotNull, max, min, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { course, courseCompletion, courseModule, enrollmentGrant, groupCourseEnrollment, groupMembership, user, userGroup } from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json, jsonBody, params } from '../../lib/openapi.ts'
import { cacheClearedSchema } from './cache.ts'
import {
  countEnrolled,
  findCourseById,
  grant,
  listAdminCourses,
  revoke,
  toAdminCourse,
} from '../../services/courses.ts'
import { CategoryTree } from '../../services/categories.ts'
import { adminModules, saveModules } from '../../services/modules-admin.ts'
import { adminPrerequisites, setPrerequisites } from '../../services/prerequisites.ts'
import { audit } from '../../services/audit.ts'
import { readDefinition, writeDefinition } from '../../services/definition.ts'
import { exportMarkdownCourse } from '../../content/markdown-course.ts'
import { contentLoader } from '../../content/loader.ts'
import { completeCourse, uncompleteCourse } from '../../services/xp.ts'

const NOT_FOUND = 'Course not found'
const SLUG_TAKEN = 'Course already exists'

function isUniqueViolation(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed: course\.slug/.test(String(err.cause ?? err.message))
}

/** 400 when `categoryId` is given and unknown. */
function checkCategory(tree: CategoryTree, categoryId: string | null | undefined) {
  if (categoryId && !tree.byId.has(categoryId)) throw new HTTPException(400, { message: 'Unknown category' })
}

/** Form fields → columns: the badge is stored as two columns. */
function courseValues<T extends { badge?: { name: string; icon: string } | null; prerequisites?: unknown }>({
  badge,
  prerequisites: _,
  ...rest
}: T) {
  return { ...rest, ...(badge !== undefined ? { badgeName: badge?.name ?? null, badgeIcon: badge?.icon ?? null } : {}) }
}

async function requireCourse(id: string) {
  const found = await findCourseById(id)
  if (!found) throw new HTTPException(404, { message: NOT_FOUND })
  return found
}

const tags = ['Admin: courses']
const id = params('id')
const userIdBody = jsonBody(z.object({ userId: z.string().min(1) }))
const modulesResponse = json(z.object({ modules: z.array(adminModuleSchema) }))

const list = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'Courses',
  description: 'Spec 165, with enrollment counts; `search` matches the title or the slug.',
  request: { query: z.object({ search: z.string().optional() }) },
  responses: { 200: json(z.object({ courses: z.array(adminCourseSchema), total: z.number() })), ...errors(400, ...ADMIN) },
})

const create = createRoute({
  method: 'post',
  path: '/',
  tags,
  summary: 'Create a course',
  description: 'Spec 166.',
  request: { body: jsonBody(courseCreateSchema) },
  responses: { 201: json(adminCourseSchema, 'Created'), ...errors(400, ...ADMIN, 409) },
})

const getOne = createRoute({
  method: 'get',
  path: '/{id}',
  tags,
  summary: 'A course',
  request: { params: id },
  responses: { 200: json(adminCourseSchema), ...errors(...ADMIN, 404) },
})

const update = createRoute({
  method: 'patch',
  path: '/{id}',
  tags,
  summary: 'Edit a course',
  description: 'Spec 167: any subset of the fields; `prerequisites` replaces the list.',
  request: { params: id, body: jsonBody(courseUpdateSchema) },
  responses: { 200: json(adminCourseSchema), ...errors(400, ...ADMIN, 404, 409) },
})

const remove = createRoute({
  method: 'delete',
  path: '/{id}',
  tags,
  summary: 'Delete a course',
  description: 'Spec 168: enrollments go with it; earned XP and completions are kept (spec 103).',
  request: { params: id },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404) },
})

const listEnrollments = createRoute({
  method: 'get',
  path: '/{id}/enrollments',
  tags,
  summary: 'Users with access to a course',
  description: 'Spec 145: each with the sources of their access.',
  request: { params: id },
  responses: {
    200: json(z.object({ enrollments: z.array(adminCourseEnrollmentSchema), total: z.number() })),
    ...errors(...ADMIN, 404),
  },
})

const enroll = createRoute({
  method: 'post',
  path: '/{id}/enrollments',
  tags,
  summary: 'Enroll a user',
  description: 'Spec 145: any course, private or not.',
  request: { params: id, body: userIdBody },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN, 404) },
})

const unenroll = createRoute({
  method: 'delete',
  path: '/{id}/enrollments/{userId}',
  tags,
  summary: 'Withdraw a user',
  description: "Removes the direct grants (the learner's own, automatic, admin and manager ones); group and path access stay.",
  request: { params: params('id', 'userId') },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404) },
})

const listGroups = createRoute({
  method: 'get',
  path: '/{id}/groups',
  tags,
  summary: 'Groups enrolled in a course',
  description: 'Spec 135; enroll or withdraw a group with `/api/admin/groups/{id}/courses`.',
  request: { params: id },
  responses: {
    200: json(
      z.object({ groups: z.array(z.object({ id: z.string(), name: z.string(), memberCount: z.number(), enrolledAt: z.string() })) }),
    ),
    ...errors(...ADMIN, 404),
  },
})

const clearCache = createRoute({
  method: 'post',
  path: '/{id}/cache/clear',
  tags,
  summary: "Forget a course's git clones",
  description: 'Spec 177: to see pushed changes before the cache expires.',
  request: { params: id },
  responses: { 200: json(cacheClearedSchema), ...errors(...ADMIN, 404) },
})

const clearModuleCache = createRoute({
  method: 'post',
  path: '/{id}/modules/{slug}/cache/clear',
  tags,
  summary: "Forget a module's git clone",
  request: { params: params('id', 'slug') },
  responses: { 200: json(cacheClearedSchema), ...errors(...ADMIN, 404) },
})

const exportMarkdown = createRoute({
  method: 'get',
  path: '/{id}/export/markdown',
  tags,
  summary: 'Export a course as markdown',
  description: 'Spec 176: one document with a frontmatter; `split`: the heading level modules start at.',
  request: { params: id, query: z.object({ split: z.enum(MARKDOWN_SPLITS).optional() }) },
  responses: {
    200: { description: 'The markdown file (attachment)', content: { 'text/markdown': { schema: z.string() } } },
    ...errors(400, ...ADMIN, 404),
  },
})

const getDefinition = createRoute({
  method: 'get',
  path: '/{id}/definition',
  tags,
  summary: 'A course as a portable document',
  description: 'Spec 169: metadata with references by slug, and its ordered modules. What `PUT` takes back.',
  request: { params: id },
  responses: { 200: json(courseDefinitionSchema), ...errors(...ADMIN, 404) },
})

const putDefinition = createRoute({
  method: 'put',
  path: '/{id}/definition',
  tags,
  summary: 'Replace a course with a document',
  description: 'Spec 169: metadata, prerequisites and modules, in one transaction; progress on kept modules stays.',
  request: { params: id, body: jsonBody(z.object({ slug: z.string().optional(), spec: courseSpecSchema })) },
  responses: { 200: json(courseDefinitionSchema), ...errors(400, ...ADMIN, 404, 409) },
})

const getModules = createRoute({
  method: 'get',
  path: '/{id}/modules',
  tags,
  summary: "A course's modules",
  request: { params: id },
  responses: { 200: modulesResponse, ...errors(...ADMIN, 404) },
})

const putModules = createRoute({
  method: 'put',
  path: '/{id}/modules',
  tags,
  summary: "Replace a course's modules",
  description: 'In order. Modules are matched by slug, so progress is kept.',
  request: { params: id, body: jsonBody(courseModulesSchema) },
  responses: { 200: modulesResponse, ...errors(400, ...ADMIN, 404) },
})

const complete = createRoute({
  method: 'post',
  path: '/{id}/completions',
  tags,
  summary: 'Mark a course completed for a user',
  description: 'The user must be enrolled (400); completion XP and badge are awarded once.',
  request: { params: id, body: userIdBody },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN, 404) },
})

const uncomplete = createRoute({
  method: 'delete',
  path: '/{id}/completions/{userId}',
  tags,
  summary: "Remove a user's completion",
  request: { params: params('id', 'userId') },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404) },
})

/** Specs 165–168 (course CRUD) and 145 (course enrollments), under /api/admin/courses. */
export const adminCourseRoutes = createRouter()
  .openapi(list, async (c) => {
    const rows = await listAdminCourses(c.req.valid('query').search)
    const tree = await CategoryTree.load()
    return c.json({
      courses: rows.map((r) => toAdminCourse(r.course, r.enrollmentCount, tree)),
      total: rows.length,
    }, 200)
  })
  .openapi(create, async (c) => {
    const input = c.req.valid('json')
    const tree = await CategoryTree.load()
    checkCategory(tree, input.categoryId)
    try {
      const created = db.transaction((tx) => {
        const row = tx.insert(course).values(courseValues(input)).returning().get()!
        if (input.prerequisites) setPrerequisites(tx, row.id, input.prerequisites)
        return row
      })
      return c.json(toAdminCourse(created, 0, tree, adminPrerequisites(created.id)), 201)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HTTPException(409, { message: SLUG_TAKEN })
      throw err
    }
  })
  .openapi(getOne, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    return c.json(
      toAdminCourse(found, await countEnrolled(found.id), await CategoryTree.load(), adminPrerequisites(found.id)),
      200,
    )
  })
  .openapi(update, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const input = c.req.valid('json')
    const tree = await CategoryTree.load()
    checkCategory(tree, input.categoryId)
    try {
      const updated = db.transaction((tx) => {
        const values = courseValues(input)
        const row = Object.keys(values).length
          ? tx.update(course).set(values).where(eq(course.id, found.id)).returning().get()!
          : found
        if (input.prerequisites) setPrerequisites(tx, found.id, input.prerequisites)
        return row
      })
      return c.json(toAdminCourse(updated, await countEnrolled(found.id), tree, adminPrerequisites(found.id)), 200)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HTTPException(409, { message: SLUG_TAKEN })
      throw err
    }
  })
  .openapi(remove, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    // Enrollment grants cascade.
    await db.delete(course).where(eq(course.id, found.id))
    return c.json({ message: 'Course deleted' }, 200)
  })

  // Spec 145
  .openapi(listEnrollments, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const rows = await db
      .select({
        userId: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        enrolledAt: min(enrollmentGrant.createdAt).mapWith(Number),
        sources: sql<string>`group_concat(DISTINCT ${enrollmentGrant.source})`,
        completedAt: max(courseCompletion.completedAt).mapWith(Number),
      })
      .from(enrollmentGrant)
      .innerJoin(user, eq(user.id, enrollmentGrant.userId))
      .leftJoin(
        courseCompletion,
        and(eq(courseCompletion.userId, enrollmentGrant.userId), eq(courseCompletion.courseId, found.id)),
      )
      .where(eq(enrollmentGrant.courseId, found.id))
      .groupBy(user.id)
      .orderBy(asc(user.name))

    const enrollments: AdminCourseEnrollment[] = rows.map((r) => ({
      ...r,
      enrolledAt: new Date(r.enrolledAt).toISOString(),
      sources: r.sources.split(',').sort() as EnrollmentSource[],
      completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    }))
    return c.json({ enrollments, total: enrollments.length }, 200)
  })
  .openapi(enroll, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const { userId } = c.req.valid('json')
    const target = await db.query.user.findFirst({ columns: { id: true }, where: eq(user.id, userId) })
    if (!target) throw new HTTPException(404, { message: 'User not found' })

    // Admins can enroll in any course, private or not (spec 145).
    await grant(target.id, found.id, 'admin', c.get('user')!.id)
    return c.json({ message: 'User enrolled' }, 200)
  })
  .openapi(unenroll, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    // Removes the direct grants (the learner's own, automatic, admin and manager ones). Group/path grants stay.
    await revoke(c.req.param('userId'), found.id, ['self', 'auto', 'admin', 'manager'])
    return c.json({ message: 'User unenrolled' }, 200)
  })

  // Spec 135: groups enrolled in the course (enroll / withdraw: /api/admin/groups/:id/courses).
  .openapi(listGroups, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const memberCount = sql<number>`(SELECT count(*) FROM ${groupMembership} WHERE ${groupMembership.groupId} = ${userGroup.id})`.mapWith(Number)
    const groups = db
      .select({ id: userGroup.id, name: userGroup.name, memberCount, enrolledAt: groupCourseEnrollment.createdAt })
      .from(groupCourseEnrollment)
      .innerJoin(userGroup, eq(userGroup.id, groupCourseEnrollment.groupId))
      .where(eq(groupCourseEnrollment.courseId, found.id))
      .orderBy(asc(userGroup.name))
      .all()
      .map((g) => ({ ...g, enrolledAt: g.enrolledAt.toISOString() }))
    return c.json({ groups }, 200)
  })

  // Spec 177: forget the git clones used by the course (or one module), to see pushed changes before the TTL.
  .openapi(clearCache, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const repos = db
      .selectDistinct({ repo: courseModule.sourceRepo, ref: courseModule.sourceRef })
      .from(courseModule)
      .where(and(eq(courseModule.courseId, found.id), isNotNull(courseModule.sourceRepo)))
      .all()
      .map((r) => ({ repo: r.repo!, ref: r.ref ?? 'main' }))
    await contentLoader.clear(repos)
    return c.json({ status: 'ok' as const, reposCleared: repos.length }, 200)
  })
  .openapi(clearModuleCache, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const m = db
      .select({ repo: courseModule.sourceRepo, ref: courseModule.sourceRef })
      .from(courseModule)
      .where(and(eq(courseModule.courseId, found.id), eq(courseModule.slug, c.req.param('slug'))))
      .get()
    if (!m) throw new HTTPException(404, { message: 'Module not found' })
    if (m.repo) await contentLoader.clear([{ repo: m.repo, ref: m.ref ?? 'main' }])
    return c.json({ status: 'ok' as const, reposCleared: m.repo ? 1 : 0 }, 200)
  })

  // Spec 176: markdown export.
  .openapi(exportMarkdown, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const { slug, spec } = await readDefinition(found)
    const markdown = exportMarkdownCourse(slug, spec, c.req.valid('query').split)
    c.header('Content-Disposition', `attachment; filename="${slug}.md"`)
    c.header('X-Content-Type-Options', 'nosniff')
    return c.body(markdown, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
  })

  // Spec 169: the whole course as a portable document.
  .openapi(getDefinition, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    return c.json(await readDefinition(found), 200)
  })
  .openapi(putDefinition, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const { slug, spec } = c.req.valid('json')
    if (slug !== undefined && !SLUG_PATTERN.test(slug)) throw new HTTPException(400, { message: 'Invalid slug' })
    await writeDefinition(slug ?? found.slug, spec, found)
    audit(c.get('user'), 'course.definition', { type: 'course', id: found.id, label: slug ?? found.slug })
    return c.json(await readDefinition((await findCourseById(found.id))!), 200)
  })

  // Module list (spec 169 style): read, and replace as a whole. The module editor UI comes later.
  .openapi(getModules, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    return c.json({ modules: await adminModules(found.id) }, 200)
  })
  .openapi(putModules, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    await saveModules(found.id, c.req.valid('json').modules)
    return c.json({ modules: await adminModules(found.id) }, 200)
  })

  // Course completion, marked by hand until modules exist (spec 068 will complete courses automatically).
  .openapi(complete, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    const { userId } = c.req.valid('json')
    const enrolled = await db.query.enrollmentGrant.findFirst({
      columns: { id: true },
      where: and(eq(enrollmentGrant.userId, userId), eq(enrollmentGrant.courseId, found.id)),
    })
    if (!enrolled) throw new HTTPException(400, { message: 'User is not enrolled in this course' })
    completeCourse(userId, found, c.get('user')!.id)
    return c.json({ message: 'Course completed' }, 200)
  })
  .openapi(uncomplete, async (c) => {
    const found = await requireCourse(c.req.param('id'))
    uncompleteCourse(c.req.param('userId'), found.id)
    return c.json({ message: 'Completion removed' }, 200)
  })

import {
  adminGroupSchema,
  COURSE_VISIBILITIES,
  groupCreateSchema,
  type GroupMember,
  groupMemberSchema,
  type ManagerMember,
  managerMemberCourseSchema,
  type ManagerMemberCourse,
  managerMemberSchema,
  managerScopeSchema,
  messageSchema,
  PATH_KINDS,
  pathEnrollmentRowSchema,
} from '@pupitre/shared'
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { course, enrollmentGrant, groupMembership, learningPath, pathEnrollment, user, userGroup } from '../db/schema/index.ts'
import { $, createRoute, createRouter, errors, json, jsonBody, params } from '../lib/openapi.ts'
import { type AppEnv, requireAuth } from '../middleware/session.ts'
import { audit } from '../services/audit.ts'
import { grant, revoke } from '../services/courses.ts'
import {
  addMember,
  createGroup,
  GroupTree,
  listGroups,
  listMembers,
  managedGroupIds,
  memberIdsOf,
  removeMember,
  requireGroup,
} from '../services/groups.ts'
import { enrollInPath, pathEnrollmentRows, requirePath, unenrollFromPath } from '../services/paths.ts'
import { exportRoutes } from './exports.ts'

type ManagerEnv = AppEnv & { Variables: { managed: string[] } }

/**
 * Spec 140: manager scope = the groups where the user is a `manager` (and the subgroups below them), and their
 * members. Open to platform managers and to anyone who manages a group; scope checks answer 403.
 */
const requireManager = createMiddleware<ManagerEnv>(async (c, next) => {
  const me = c.get('user')!
  const tree = GroupTree.load()
  const managed = [...new Set(managedGroupIds(me.id).flatMap((id) => tree.subtreeIds(id)))]
  if (managed.length === 0 && me.role !== 'manager') throw new HTTPException(403, { message: 'Manager access required' })
  c.set('managed', managed)
  await next()
})

function inScopeGroup(managed: string[], groupId: string) {
  if (!managed.includes(groupId)) throw new HTTPException(403, { message: 'Group not in manager scope' })
}

function inScopeUser(managed: string[], userId: string) {
  if (!memberIdsOf(managed).has(userId)) throw new HTTPException(403, { message: 'User not in manager scope' })
}

const tags = ['Manager']
/** Every route but the scope: open to platform managers and group managers, 403 for anyone else. */
const SCOPED = [401, 403] as const

const ref = { id: z.string(), slug: z.string(), title: z.string() }
const userIdBody = jsonBody(z.object({ userId: z.string().min(1, 'userId is required') }))

const getScope = createRoute({
  method: 'get',
  path: '/scope',
  tags,
  summary: 'What the signed-in user manages',
  description: 'Spec 140: the groups where the user is a manager, and the subgroups below them; empty for non-managers.',
  responses: { 200: json(managerScopeSchema), ...errors(401) },
})

const listScopeMembers = createRoute({
  method: 'get',
  path: '/users',
  tags,
  summary: 'Members in scope',
  description: 'Spec 141 "Mes membres": active users of the managed groups.',
  responses: { 200: json(z.object({ users: z.array(managerMemberSchema), total: z.number() })), ...errors(...SCOPED) },
})

const listMemberEnrollments = createRoute({
  method: 'get',
  path: '/users/{userId}/enrollments',
  tags,
  summary: "A member's courses and paths",
  request: { params: params('userId') },
  responses: {
    200: json(z.object({ courses: z.array(managerMemberCourseSchema), paths: z.array(z.object(ref)) })),
    ...errors(...SCOPED),
  },
})

const enrollMember = createRoute({
  method: 'post',
  path: '/users/{userId}/enrollments',
  tags,
  summary: 'Enroll a member in a course',
  description: 'Published courses, public or private.',
  request: { params: params('userId'), body: jsonBody(z.object({ courseId: z.string().min(1) })) },
  responses: { 200: json(messageSchema), ...errors(400, ...SCOPED, 404) },
})

const unenrollMember = createRoute({
  method: 'delete',
  path: '/users/{userId}/enrollments/{courseId}',
  tags,
  summary: 'Withdraw a member from a course',
  description: 'Only what a manager granted: self, admin, group and path access stay.',
  request: { params: params('userId', 'courseId') },
  responses: { 200: json(messageSchema), ...errors(...SCOPED) },
})

const listCourses = createRoute({
  method: 'get',
  path: '/courses',
  tags,
  summary: 'Courses a manager can enroll members in',
  responses: {
    200: json(z.object({ courses: z.array(z.object({ ...ref, visibility: z.enum(COURSE_VISIBILITIES) })) })),
    ...errors(...SCOPED),
  },
})

const listPaths = createRoute({
  method: 'get',
  path: '/paths',
  tags,
  summary: 'Published learning paths',
  responses: { 200: json(z.object({ paths: z.array(z.object({ ...ref, kind: z.enum(PATH_KINDS) })) })), ...errors(...SCOPED) },
})

const listPathEnrollments = createRoute({
  method: 'get',
  path: '/paths/{id}/enrollments',
  tags,
  summary: 'Members enrolled in a path',
  description: 'Spec 143: with their progress.',
  request: { params: params('id') },
  responses: { 200: json(z.object({ users: z.array(pathEnrollmentRowSchema) })), ...errors(...SCOPED, 404) },
})

const enrollMemberInPath = createRoute({
  method: 'post',
  path: '/paths/{id}/enrollments',
  tags,
  summary: 'Enroll a member in a path',
  request: { params: params('id'), body: userIdBody },
  responses: { 200: json(messageSchema), ...errors(400, ...SCOPED, 404) },
})

const unenrollMemberFromPath = createRoute({
  method: 'delete',
  path: '/paths/{id}/enrollments/{userId}',
  tags,
  summary: 'Withdraw a member from a path',
  request: { params: params('id', 'userId') },
  responses: { 200: json(messageSchema), ...errors(...SCOPED, 404) },
})

const listManagedGroups = createRoute({
  method: 'get',
  path: '/groups',
  tags,
  summary: 'Managed groups',
  description: 'Spec 142 "Mes groupes".',
  responses: { 200: json(z.object({ groups: z.array(adminGroupSchema) })), ...errors(...SCOPED) },
})

const createManagedGroup = createRoute({
  method: 'post',
  path: '/groups',
  tags,
  summary: 'Create a group',
  description: 'At the root, or under a managed group. The creator manages it.',
  request: { body: jsonBody(groupCreateSchema) },
  responses: { 201: json(z.object({ id: z.string(), message: z.string() }), 'Created'), ...errors(400, ...SCOPED, 409) },
})

const deleteManagedGroup = createRoute({
  method: 'delete',
  path: '/groups/{id}',
  tags,
  summary: 'Delete a group',
  description: 'Local groups without subgroups or learners only (409).',
  request: { params: params('id') },
  responses: { 200: json(messageSchema), ...errors(...SCOPED, 404, 409) },
})

const listGroupMembers = createRoute({
  method: 'get',
  path: '/groups/{id}/members',
  tags,
  summary: "A managed group's members",
  request: { params: params('id') },
  responses: { 200: json(z.object({ members: z.array(groupMemberSchema), total: z.number() })), ...errors(...SCOPED, 404) },
})

const addGroupMember = createRoute({
  method: 'post',
  path: '/groups/{id}/members',
  tags,
  summary: 'Add a member to a managed group',
  description: 'Only users already in scope; adding anyone else is an admin action (spec 191).',
  request: { params: params('id'), body: userIdBody },
  responses: { 200: json(messageSchema), ...errors(400, ...SCOPED, 404) },
})

const removeGroupMember = createRoute({
  method: 'delete',
  path: '/groups/{id}/members/{userId}',
  tags,
  summary: 'Remove a member from a managed group',
  description: 'A manager cannot leave a group they manage (400).',
  request: { params: params('id', 'userId') },
  responses: { 200: json(messageSchema), ...errors(400, ...SCOPED, 404) },
})

const scopeRoutes = $(createRouter<ManagerEnv>().use(requireAuth)).openapi(getScope, (c) => {
  const me = c.get('user')
  const tree = GroupTree.load()
  const managed = new Set(managedGroupIds(me.id).flatMap((id) => tree.subtreeIds(id)))
  return c.json({
    groups: listGroups(tree, managed),
    canManage: managed.size > 0 || me.role === 'manager',
  }, 200)
})

/** `/api/manager/*`, spec 140. */
export const managerRoutes = $(scopeRoutes.use(requireManager))

  // Spec 141: "Mes membres"
  .openapi(listScopeMembers, (c) => {
    const managed = c.get('managed')
    const ids = [...memberIdsOf(managed)]
    if (ids.length === 0) return c.json({ users: [], total: 0 }, 200)
    const tree = GroupTree.load()
    const memberships = db
      .select({ userId: groupMembership.userId, groupId: groupMembership.groupId })
      .from(groupMembership)
      .where(and(inArray(groupMembership.userId, ids), inArray(groupMembership.groupId, managed)))
      .all()
    const enrolled = sql<number>`(SELECT count(DISTINCT ${enrollmentGrant.courseId}) FROM ${enrollmentGrant} WHERE ${enrollmentGrant.userId} = "user"."id")`.mapWith(
      Number,
    )
    const rows = db
      .select({ id: user.id, username: user.username, name: user.name, email: user.email, image: user.image, enrolled })
      .from(user)
      .where(and(inArray(user.id, ids), eq(user.isActive, true)))
      .orderBy(asc(user.name))
      .all()
    const users: ManagerMember[] = rows.map(({ enrolled, ...u }) => ({
      ...u,
      enrolledCourses: enrolled,
      groups: memberships
        .filter((m) => m.userId === u.id)
        .map((m) => ({ id: m.groupId, name: tree.byId.get(m.groupId)?.name ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    return c.json({ users, total: users.length }, 200)
  })
  .openapi(listMemberEnrollments, (c) => {
    const userId = c.req.param('userId')
    inScopeUser(c.get('managed'), userId)
    const rows = db
      .select({
        courseId: course.id,
        slug: course.slug,
        title: course.title,
        sources: sql<string>`group_concat(DISTINCT ${enrollmentGrant.source})`,
      })
      .from(enrollmentGrant)
      .innerJoin(course, eq(course.id, enrollmentGrant.courseId))
      .where(and(eq(enrollmentGrant.userId, userId), ne(course.status, 'draft')))
      .groupBy(course.id)
      .orderBy(asc(course.title))
      .all()
    const courses: ManagerMemberCourse[] = rows.map((r) => {
      const sources = r.sources.split(',').sort()
      return { ...r, sources, removable: sources.includes('manager') }
    })
    // Spec 141: the member's published paths, next to their courses.
    const paths = db
      .select({ id: learningPath.id, slug: learningPath.slug, title: learningPath.title })
      .from(pathEnrollment)
      .innerJoin(learningPath, eq(learningPath.id, pathEnrollment.pathId))
      .where(and(eq(pathEnrollment.userId, userId), eq(learningPath.status, 'published')))
      .orderBy(asc(learningPath.title))
      .all()
    return c.json({ courses, paths }, 200)
  })
  .openapi(enrollMember, async (c) => {
    const userId = c.req.param('userId')
    inScopeUser(c.get('managed'), userId)
    const target = db.select().from(course).where(eq(course.id, c.req.valid('json').courseId)).get()
    // Managers enroll in published courses, public or private.
    if (!target || target.status !== 'published') throw new HTTPException(404, { message: 'Course not found' })
    await grant(userId, target.id, 'manager', c.get('user').id)
    return c.json({ message: 'Enrolled successfully' }, 200)
  })
  .openapi(unenrollMember, async (c) => {
    const userId = c.req.param('userId')
    inScopeUser(c.get('managed'), userId)
    // Only what a manager granted: self, admin, group and path access stay.
    await revoke(userId, c.req.param('courseId'), ['manager'])
    return c.json({ message: 'Enrollment removed' }, 200)
  })
  /** Courses a manager can enroll members in. */
  .openapi(listCourses, (c) => {
    const courses = db
      .select({ id: course.id, slug: course.slug, title: course.title, visibility: course.visibility })
      .from(course)
      .where(eq(course.status, 'published'))
      .orderBy(asc(course.title))
      .all()
    return c.json({ courses }, 200)
  })

  // Spec 182: CSV exports limited to the manager's members.
  .route('/exports', exportRoutes((c) => [...memberIdsOf((c as unknown as Context<ManagerEnv>).get('managed'))], 'Manager: exports'))

  // Spec 143: path enrollments of users in scope.
  .openapi(listPaths, (c) => {
    const paths = db
      .select({ id: learningPath.id, slug: learningPath.slug, title: learningPath.title, kind: learningPath.kind })
      .from(learningPath)
      .where(eq(learningPath.status, 'published'))
      .orderBy(asc(learningPath.title))
      .all()
    return c.json({ paths }, 200)
  })
  .openapi(listPathEnrollments, (c) => {
    const found = requirePath({ id: c.req.param('id') })
    return c.json({ users: pathEnrollmentRows(found, memberIdsOf(c.get('managed'))) }, 200)
  })
  .openapi(enrollMemberInPath, (c) => {
    const found = requirePath({ id: c.req.param('id') })
    if (found.status !== 'published') throw new HTTPException(404, { message: 'Path not found' })
    const { userId } = c.req.valid('json')
    inScopeUser(c.get('managed'), userId)
    enrollInPath(found.id, userId, c.get('user').id)
    return c.json({ message: 'User enrolled' }, 200)
  })
  .openapi(unenrollMemberFromPath, (c) => {
    const found = requirePath({ id: c.req.param('id') })
    const userId = c.req.param('userId')
    inScopeUser(c.get('managed'), userId)
    unenrollFromPath(found.id, userId)
    return c.json({ message: 'User unenrolled' }, 200)
  })

  // Spec 142: "Mes groupes"
  .openapi(listManagedGroups, (c) => c.json({ groups: listGroups(GroupTree.load(), new Set(c.get('managed'))) }, 200))
  .openapi(createManagedGroup, (c) => {
    const me = c.get('user')
    const input = c.req.valid('json')
    if (input.parentId) inScopeGroup(c.get('managed'), input.parentId)
    const created = createGroup(input)
    // The creator manages the new group.
    addMember(created.id, me.id, { role: 'manager', addedBy: me.id })
    audit(me, 'group.create', { type: 'group', id: created.id, label: created.name }, { by: 'manager' })
    return c.json({ id: created.id, message: 'Group created' }, 201)
  })
  .openapi(deleteManagedGroup, (c) => {
    const me = c.get('user')
    const groupId = c.req.param('id')
    inScopeGroup(c.get('managed'), groupId)
    const tree = GroupTree.load()
    const found = requireGroup(groupId, tree)
    if (found.origin !== 'local') throw new HTTPException(404, { message: 'Group not found or not a local group' })
    if ((tree.children.get(groupId) ?? []).length) throw new HTTPException(409, { message: 'Cannot delete a group that has subgroups' })
    const learners = db
      .select({ n: count() })
      .from(groupMembership)
      .where(and(eq(groupMembership.groupId, groupId), eq(groupMembership.role, 'member')))
      .get()
    if (learners && learners.n > 0) throw new HTTPException(409, { message: 'Cannot delete a group that has members' })
    db.transaction((tx) => {
      tx.delete(enrollmentGrant).where(and(eq(enrollmentGrant.source, 'group'), eq(enrollmentGrant.via, groupId))).run()
      tx.delete(userGroup).where(eq(userGroup.id, groupId)).run()
    })
    audit(me, 'group.delete', { type: 'group', id: found.id, label: found.name }, { by: 'manager' })
    return c.json({ message: 'Group deleted' }, 200)
  })
  .openapi(listGroupMembers, (c) => {
    const groupId = c.req.param('id')
    inScopeGroup(c.get('managed'), groupId)
    const members: GroupMember[] = listMembers([groupId], GroupTree.load())
    return c.json({ members, total: members.length }, 200)
  })
  // Adding someone outside the scope is an admin action (spec 191): only users already in scope.
  .openapi(addGroupMember, (c) => {
    const groupId = c.req.param('id')
    const managed = c.get('managed')
    inScopeGroup(managed, groupId)
    const { userId } = c.req.valid('json')
    inScopeUser(managed, userId)
    addMember(groupId, userId, { role: 'member', addedBy: c.get('user').id })
    return c.json({ message: 'Member added' }, 200)
  })
  .openapi(removeGroupMember, (c) => {
    const groupId = c.req.param('id')
    inScopeGroup(c.get('managed'), groupId)
    const userId = c.req.param('userId')
    if (userId === c.get('user').id) throw new HTTPException(400, { message: 'You cannot leave a group you manage' })
    removeMember(groupId, userId)
    return c.json({ message: 'Member removed' }, 200)
  })

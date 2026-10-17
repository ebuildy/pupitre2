import {
  groupCreateSchema,
  type GroupMember,
  type ManagerMember,
  type ManagerMemberCourse,
  type ManagerScope,
} from '@pupitre/shared'
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { course, enrollmentGrant, groupMembership, learningPath, user, userGroup } from '../db/schema/index.ts'
import { validate } from '../lib/validate.ts'
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

/** `/api/manager/*`, spec 140. */
export const managerRoutes = new Hono<ManagerEnv>()
  .use(requireAuth)
  .get('/scope', (c) => {
    const me = c.get('user')!
    const tree = GroupTree.load()
    const managed = new Set(managedGroupIds(me.id).flatMap((id) => tree.subtreeIds(id)))
    return c.json<ManagerScope>({
      groups: listGroups(tree, managed),
      canManage: managed.size > 0 || me.role === 'manager',
    })
  })
  .use(requireManager)

  // Spec 141: "Mes membres"
  .get('/users', (c) => {
    const managed = c.get('managed')
    const ids = [...memberIdsOf(managed)]
    if (ids.length === 0) return c.json<{ users: ManagerMember[]; total: number }>({ users: [], total: 0 })
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
    return c.json({ users, total: users.length })
  })
  .get('/users/:userId/enrollments', (c) => {
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
    return c.json({ courses })
  })
  .post('/users/:userId/enrollments', validate('json', z.object({ courseId: z.string().min(1) })), async (c) => {
    const userId = c.req.param('userId')
    inScopeUser(c.get('managed'), userId)
    const target = db.select().from(course).where(eq(course.id, c.req.valid('json').courseId)).get()
    // Managers enroll in published courses, public or private.
    if (!target || target.status !== 'published') throw new HTTPException(404, { message: 'Course not found' })
    await grant(userId, target.id, 'manager', c.get('user')!.id)
    return c.json({ message: 'Enrolled successfully' })
  })
  .delete('/users/:userId/enrollments/:courseId', async (c) => {
    const userId = c.req.param('userId')
    inScopeUser(c.get('managed'), userId)
    // Only what a manager granted: self, admin, group and path access stay.
    await revoke(userId, c.req.param('courseId'), ['manager'])
    return c.json({ message: 'Enrollment removed' })
  })
  /** Courses a manager can enroll members in. */
  .get('/courses', (c) => {
    const courses = db
      .select({ id: course.id, slug: course.slug, title: course.title, visibility: course.visibility })
      .from(course)
      .where(eq(course.status, 'published'))
      .orderBy(asc(course.title))
      .all()
    return c.json({ courses })
  })

  // Spec 182: CSV exports limited to the manager's members.
  .route('/exports', exportRoutes((c) => [...memberIdsOf((c as unknown as Context<ManagerEnv>).get('managed'))]))

  // Spec 143: path enrollments of users in scope.
  .get('/paths', (c) => {
    const paths = db
      .select({ id: learningPath.id, slug: learningPath.slug, title: learningPath.title, kind: learningPath.kind })
      .from(learningPath)
      .where(eq(learningPath.status, 'published'))
      .orderBy(asc(learningPath.title))
      .all()
    return c.json({ paths })
  })
  .get('/paths/:id/enrollments', (c) => {
    const found = requirePath({ id: c.req.param('id') })
    return c.json({ users: pathEnrollmentRows(found, memberIdsOf(c.get('managed'))) })
  })
  .post('/paths/:id/enrollments', validate('json', z.object({ userId: z.string().min(1) })), (c) => {
    const found = requirePath({ id: c.req.param('id') })
    if (found.status !== 'published') throw new HTTPException(404, { message: 'Path not found' })
    const { userId } = c.req.valid('json')
    inScopeUser(c.get('managed'), userId)
    enrollInPath(found.id, userId, c.get('user')!.id)
    return c.json({ message: 'User enrolled' })
  })
  .delete('/paths/:id/enrollments/:userId', (c) => {
    const found = requirePath({ id: c.req.param('id') })
    const userId = c.req.param('userId')
    inScopeUser(c.get('managed'), userId)
    unenrollFromPath(found.id, userId)
    return c.json({ message: 'User unenrolled' })
  })

  // Spec 142: "Mes groupes"
  .get('/groups', (c) => c.json({ groups: listGroups(GroupTree.load(), new Set(c.get('managed'))) }))
  .post('/groups', validate('json', groupCreateSchema), (c) => {
    const me = c.get('user')!
    const input = c.req.valid('json')
    if (input.parentId) inScopeGroup(c.get('managed'), input.parentId)
    const created = createGroup(input)
    // The creator manages the new group.
    addMember(created.id, me.id, { role: 'manager', addedBy: me.id })
    audit(me, 'group.create', { type: 'group', id: created.id, label: created.name }, { by: 'manager' })
    return c.json({ id: created.id, message: 'Group created' }, 201)
  })
  .delete('/groups/:id', (c) => {
    const me = c.get('user')!
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
    return c.json({ message: 'Group deleted' })
  })
  .get('/groups/:id/members', (c) => {
    const groupId = c.req.param('id')
    inScopeGroup(c.get('managed'), groupId)
    const members: GroupMember[] = listMembers([groupId], GroupTree.load())
    return c.json({ members, total: members.length })
  })
  // Adding someone outside the scope is an admin action (spec 191): only users already in scope.
  .post('/groups/:id/members', validate('json', z.object({ userId: z.string().min(1, 'userId is required') })), (c) => {
    const groupId = c.req.param('id')
    const managed = c.get('managed')
    inScopeGroup(managed, groupId)
    const { userId } = c.req.valid('json')
    inScopeUser(managed, userId)
    addMember(groupId, userId, { role: 'member', addedBy: c.get('user')!.id })
    return c.json({ message: 'Member added' })
  })
  .delete('/groups/:id/members/:userId', (c) => {
    const groupId = c.req.param('id')
    inScopeGroup(c.get('managed'), groupId)
    const userId = c.req.param('userId')
    if (userId === c.get('user')!.id) throw new HTTPException(400, { message: 'You cannot leave a group you manage' })
    removeMember(groupId, userId)
    return c.json({ message: 'Member removed' })
  })

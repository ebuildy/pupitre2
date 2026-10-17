import {
  type AdminGroup,
  type GroupCourse,
  groupCreateSchema,
  type GroupMember,
  groupUpdateSchema,
  membershipSchema,
} from '@pupitre/shared'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { groupMembership, user } from '../../db/schema/index.ts'
import { validate } from '../../lib/validate.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { audit } from '../../services/audit.ts'
import { findCourseById } from '../../services/courses.ts'
import {
  addMember,
  createGroup,
  deleteGroup,
  enrollGroup,
  GroupTree,
  listGroupCourses,
  listGroups,
  listMembers,
  removeMember,
  requireGroup,
  unenrollGroup,
  updateGroup,
} from '../../services/groups.ts'

function requireUser(id: string) {
  const found = db.select({ id: user.id }).from(user).where(eq(user.id, id)).get()
  if (!found) throw new HTTPException(404, { message: 'User not found' })
  return found
}

async function requireCourse(id: string) {
  const found = await findCourseById(id)
  if (!found) throw new HTTPException(404, { message: 'Course not found' })
  return found
}

/** Specs 130–133 and 135, under /api/admin/groups. */
export const adminGroupRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json<{ groups: AdminGroup[] }>({ groups: listGroups() }))
  .post('/', validate('json', groupCreateSchema), (c) => {
    const created = createGroup(c.req.valid('json'))
    audit(c.get('user'), 'group.create', { type: 'group', id: created.id, label: created.name })
    return c.json({ id: created.id, message: 'Group created' }, 201)
  })
  .get('/:id', (c) => {
    const tree = GroupTree.load()
    const found = requireGroup(c.req.param('id'), tree)
    return c.json({
      group: listGroups(tree, new Set([found.id]))[0]!,
      ancestors: tree.ancestors(found.id).map((g) => ({ id: g.id, name: g.name })),
    })
  })
  .patch('/:id', validate('json', groupUpdateSchema), (c) => {
    const updated = updateGroup(c.req.param('id'), c.req.valid('json'))
    audit(c.get('user'), 'group.update', { type: 'group', id: updated.id, label: updated.name }, c.req.valid('json'))
    return c.json({ message: 'Group updated' })
  })
  .delete('/:id', (c) => {
    const found = requireGroup(c.req.param('id'))
    deleteGroup(found.id)
    audit(c.get('user'), 'group.delete', { type: 'group', id: found.id, label: found.name })
    return c.json({ message: 'Group deleted' })
  })

  // Spec 133
  .get('/:id/members', validate('query', z.object({ recursive: z.stringbool().optional() })), (c) => {
    const tree = GroupTree.load()
    const found = requireGroup(c.req.param('id'), tree)
    const ids = c.req.valid('query').recursive ? tree.subtreeIds(found.id) : [found.id]
    const members = listMembers(ids, tree)
    return c.json<{ members: GroupMember[]; total: number }>({ members, total: members.length })
  })
  .post('/:id/members', validate('json', membershipSchema), (c) => {
    const found = requireGroup(c.req.param('id'))
    const { userId, role } = c.req.valid('json')
    requireUser(userId)
    if (found.isDefault && role === 'manager') {
      throw new HTTPException(400, { message: 'The default group has no managers' })
    }
    addMember(found.id, userId, { role, addedBy: c.get('user')!.id })
    audit(c.get('user'), 'group.member.add', { type: 'group', id: found.id, label: found.name }, { userId, role })
    return c.json({ message: 'Member added' })
  })
  .delete('/:id/members/:userId', (c) => {
    const found = requireGroup(c.req.param('id'))
    if (found.isDefault) throw new HTTPException(400, { message: 'Every user is a member of the default group' })
    const userId = c.req.param('userId')
    const membership = db
      .select({ userId: groupMembership.userId })
      .from(groupMembership)
      .where(and(eq(groupMembership.groupId, found.id), eq(groupMembership.userId, userId)))
      .get()
    if (!membership) throw new HTTPException(404, { message: 'Member not found' })
    removeMember(found.id, userId)
    audit(c.get('user'), 'group.member.remove', { type: 'group', id: found.id, label: found.name }, { userId })
    return c.json({ message: 'Member removed' })
  })

  // Spec 135: courses the group is enrolled in.
  .get('/:id/courses', (c) => {
    const found = requireGroup(c.req.param('id'))
    return c.json<{ courses: GroupCourse[] }>({ courses: listGroupCourses(found.id) })
  })
  .post('/:id/courses', validate('json', z.object({ courseId: z.string().min(1) })), async (c) => {
    const found = requireGroup(c.req.param('id'))
    const target = await requireCourse(c.req.valid('json').courseId)
    const enrolled = enrollGroup(found.id, target.id, c.get('user')!.id)
    audit(c.get('user'), 'group.course.enroll', { type: 'group', id: found.id, label: found.name }, { courseId: target.id })
    return c.json({ message: 'Group enrolled', enrolled })
  })
  .delete('/:id/courses/:courseId', async (c) => {
    const found = requireGroup(c.req.param('id'))
    const target = await requireCourse(c.req.param('courseId'))
    unenrollGroup(found.id, target.id)
    audit(c.get('user'), 'group.course.unenroll', { type: 'group', id: found.id, label: found.name }, { courseId: target.id })
    return c.json({ message: 'Group unenrolled' })
  })

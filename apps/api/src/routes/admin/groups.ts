import {
  adminGroupSchema,
  groupCourseSchema,
  groupCreateSchema,
  groupMemberSchema,
  groupUpdateSchema,
  membershipSchema,
  messageSchema,
} from '@pupitre/shared'
import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { groupMembership, user } from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json, jsonBody, params } from '../../lib/openapi.ts'
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

const tags = ['Admin: groups']

const listAll = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'Groups',
  description: 'Spec 130: every group (a tree), in tree order.',
  responses: { 200: json(z.object({ groups: z.array(adminGroupSchema) })), ...errors(...ADMIN) },
})

const create = createRoute({
  method: 'post',
  path: '/',
  tags,
  summary: 'Create a group',
  request: { body: jsonBody(groupCreateSchema) },
  responses: { 201: json(z.object({ id: z.string(), message: z.string() }), 'Created'), ...errors(400, ...ADMIN, 404, 409) },
})

const getOne = createRoute({
  method: 'get',
  path: '/{id}',
  tags,
  summary: 'A group, with its ancestors',
  request: { params: params('id') },
  responses: {
    200: json(z.object({ group: adminGroupSchema, ancestors: z.array(z.object({ id: z.string(), name: z.string() })) })),
    ...errors(...ADMIN, 404),
  },
})

const update = createRoute({
  method: 'patch',
  path: '/{id}',
  tags,
  summary: 'Edit or move a group',
  description: 'Spec 132: local groups only; `parentId` null moves it to the root.',
  request: { params: params('id'), body: jsonBody(groupUpdateSchema) },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN, 404, 409) },
})

const remove = createRoute({
  method: 'delete',
  path: '/{id}',
  tags,
  summary: 'Delete a group',
  request: { params: params('id') },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404, 409) },
})

const listGroupMembers = createRoute({
  method: 'get',
  path: '/{id}/members',
  tags,
  summary: "A group's members",
  description: 'Spec 133; `recursive`: with the members of the subgroups.',
  request: { params: params('id'), query: z.object({ recursive: z.stringbool().optional() }) },
  responses: { 200: json(z.object({ members: z.array(groupMemberSchema), total: z.number() })), ...errors(400, ...ADMIN, 404) },
})

const addGroupMember = createRoute({
  method: 'post',
  path: '/{id}/members',
  tags,
  summary: 'Add a member',
  description: 'The default group has no managers (400).',
  request: { params: params('id'), body: jsonBody(membershipSchema) },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN, 404) },
})

const removeGroupMember = createRoute({
  method: 'delete',
  path: '/{id}/members/{userId}',
  tags,
  summary: 'Remove a member',
  description: 'Every user is a member of the default group (400).',
  request: { params: params('id', 'userId') },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN, 404) },
})

const listCourses = createRoute({
  method: 'get',
  path: '/{id}/courses',
  tags,
  summary: 'Courses the group is enrolled in',
  description: 'Spec 135.',
  request: { params: params('id') },
  responses: { 200: json(z.object({ courses: z.array(groupCourseSchema) })), ...errors(...ADMIN, 404) },
})

const enrollInCourse = createRoute({
  method: 'post',
  path: '/{id}/courses',
  tags,
  summary: 'Enroll the group in a course',
  description: 'Its members get access; `enrolled`: members who had no access before.',
  request: { params: params('id'), body: jsonBody(z.object({ courseId: z.string().min(1) })) },
  responses: { 200: json(z.object({ message: z.string(), enrolled: z.number() })), ...errors(400, ...ADMIN, 404) },
})

const unenrollFromCourse = createRoute({
  method: 'delete',
  path: '/{id}/courses/{courseId}',
  tags,
  summary: 'Withdraw the group from a course',
  description: 'Removes the group grants; other access stays.',
  request: { params: params('id', 'courseId') },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404) },
})

/** Specs 130–133 and 135, under /api/admin/groups. */
export const adminGroupRoutes = createRouter()
  .openapi(listAll, (c) => c.json({ groups: listGroups() }, 200))
  .openapi(create, (c) => {
    const created = createGroup(c.req.valid('json'))
    audit(c.get('user'), 'group.create', { type: 'group', id: created.id, label: created.name })
    return c.json({ id: created.id, message: 'Group created' }, 201)
  })
  .openapi(getOne, (c) => {
    const tree = GroupTree.load()
    const found = requireGroup(c.req.param('id'), tree)
    return c.json({
      group: listGroups(tree, new Set([found.id]))[0]!,
      ancestors: tree.ancestors(found.id).map((g) => ({ id: g.id, name: g.name })),
    }, 200)
  })
  .openapi(update, (c) => {
    const updated = updateGroup(c.req.param('id'), c.req.valid('json'))
    audit(c.get('user'), 'group.update', { type: 'group', id: updated.id, label: updated.name }, c.req.valid('json'))
    return c.json({ message: 'Group updated' }, 200)
  })
  .openapi(remove, (c) => {
    const found = requireGroup(c.req.param('id'))
    deleteGroup(found.id)
    audit(c.get('user'), 'group.delete', { type: 'group', id: found.id, label: found.name })
    return c.json({ message: 'Group deleted' }, 200)
  })

  // Spec 133
  .openapi(listGroupMembers, (c) => {
    const tree = GroupTree.load()
    const found = requireGroup(c.req.param('id'), tree)
    const ids = c.req.valid('query').recursive ? tree.subtreeIds(found.id) : [found.id]
    const members = listMembers(ids, tree)
    return c.json({ members, total: members.length }, 200)
  })
  .openapi(addGroupMember, (c) => {
    const found = requireGroup(c.req.param('id'))
    const { userId, role } = c.req.valid('json')
    requireUser(userId)
    if (found.isDefault && role === 'manager') {
      throw new HTTPException(400, { message: 'The default group has no managers' })
    }
    addMember(found.id, userId, { role, addedBy: c.get('user')!.id })
    audit(c.get('user'), 'group.member.add', { type: 'group', id: found.id, label: found.name }, { userId, role })
    return c.json({ message: 'Member added' }, 200)
  })
  .openapi(removeGroupMember, (c) => {
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
    return c.json({ message: 'Member removed' }, 200)
  })

  // Spec 135: courses the group is enrolled in.
  .openapi(listCourses, (c) => {
    const found = requireGroup(c.req.param('id'))
    return c.json({ courses: listGroupCourses(found.id) }, 200)
  })
  .openapi(enrollInCourse, async (c) => {
    const found = requireGroup(c.req.param('id'))
    const target = await requireCourse(c.req.valid('json').courseId)
    const enrolled = enrollGroup(found.id, target.id, c.get('user')!.id)
    audit(c.get('user'), 'group.course.enroll', { type: 'group', id: found.id, label: found.name }, { courseId: target.id })
    return c.json({ message: 'Group enrolled', enrolled }, 200)
  })
  .openapi(unenrollFromCourse, async (c) => {
    const found = requireGroup(c.req.param('id'))
    const target = await requireCourse(c.req.param('courseId'))
    unenrollGroup(found.id, target.id)
    audit(c.get('user'), 'group.course.unenroll', { type: 'group', id: found.id, label: found.name }, { courseId: target.id })
    return c.json({ message: 'Group unenrolled' }, 200)
  })

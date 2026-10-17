import type { MyGroup } from '@pupitre/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db/index.ts'
import { course, groupCourseEnrollment, groupMembership, user, userGroup } from '../db/schema/index.ts'
import { type AppEnv, requireAuth } from '../middleware/session.ts'
import { GroupTree } from '../services/groups.ts'

/** Spec 136: the signed-in user's groups (not the default one), with their courses and members. */
export const myGroupRoutes = new Hono<AppEnv>().use(requireAuth).get('/', (c) => {
  const me = c.get('user')!
  const mine = db
    .select({ groupId: groupMembership.groupId, role: groupMembership.role })
    .from(groupMembership)
    .innerJoin(userGroup, eq(userGroup.id, groupMembership.groupId))
    .where(and(eq(groupMembership.userId, me.id), eq(userGroup.isDefault, false)))
    .all()
  const ids = mine.map((m) => m.groupId)
  if (ids.length === 0) return c.json<{ groups: MyGroup[] }>({ groups: [] })

  const tree = GroupTree.load()
  const courses = db
    .select({ groupId: groupCourseEnrollment.groupId, slug: course.slug, title: course.title })
    .from(groupCourseEnrollment)
    .innerJoin(course, eq(course.id, groupCourseEnrollment.courseId))
    .where(and(inArray(groupCourseEnrollment.groupId, ids), inArray(course.status, ['published', 'archived'])))
    .orderBy(asc(course.title))
    .all()
  const members = db
    .select({
      groupId: groupMembership.groupId,
      id: user.id,
      username: user.username,
      name: user.name,
      image: user.image,
      role: groupMembership.role,
    })
    .from(groupMembership)
    .innerJoin(user, eq(user.id, groupMembership.userId))
    .where(and(inArray(groupMembership.groupId, ids), eq(user.isActive, true)))
    .orderBy(asc(user.name))
    .all()

  const groups: MyGroup[] = mine
    .map(({ groupId, role }) => {
      const g = tree.byId.get(groupId)!
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        origin: g.origin,
        role,
        path: tree.ancestors(g.id).map((a) => a.name),
        courses: courses.filter((x) => x.groupId === g.id).map(({ slug, title }) => ({ slug, title })),
        members: members
          .filter((m) => m.groupId === g.id)
          .map((m) => ({ id: m.id, username: m.username ?? m.name, image: m.image, role: m.role })),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  return c.json({ groups })
})

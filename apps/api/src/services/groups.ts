import {
  type AdminGroup,
  DEFAULT_GROUP_NAME,
  GROUP_MAX_DEPTH,
  type GroupMember,
  type MembershipOrigin,
  type MembershipRole,
} from '@pupitre/shared'
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { sameName } from '../lib/sql.ts'
import { db } from '../db/index.ts'
import { course, enrollmentGrant, groupCourseEnrollment, groupMembership, user, userGroup } from '../db/schema/index.ts'
import { GRANT_TARGET } from './courses.ts'

export type Group = typeof userGroup.$inferSelect
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** The group tree, loaded in one query (groups are few). */
export class GroupTree {
  readonly byId: Map<string, Group>
  readonly children = new Map<string | null, Group[]>()

  constructor(readonly all: Group[]) {
    this.byId = new Map(all.map((g) => [g.id, g]))
    for (const g of [...all].sort((a, b) => a.name.localeCompare(b.name))) {
      const siblings = this.children.get(g.parentId) ?? []
      siblings.push(g)
      this.children.set(g.parentId, siblings)
    }
  }

  static load(tx: Pick<typeof db, 'select'> = db) {
    return new GroupTree(tx.select().from(userGroup).all())
  }

  /** Root = 0. */
  depth(id: string): number {
    let depth = 0
    for (let g = this.byId.get(id); g?.parentId; g = this.byId.get(g.parentId)) depth++
    return depth
  }

  /** Root first, without the group itself. */
  ancestors(id: string): Group[] {
    const out: Group[] = []
    for (let g = this.byId.get(this.byId.get(id)?.parentId ?? ''); g; g = this.byId.get(g.parentId ?? '')) out.unshift(g)
    return out
  }

  /** The group and every group below it. */
  subtreeIds(id: string): string[] {
    const out = [id]
    for (let i = 0; i < out.length; i++) for (const child of this.children.get(out[i]!) ?? []) out.push(child.id)
    return out
  }

  /** Levels below the group (a leaf = 0). */
  height(id: string): number {
    const kids = this.children.get(id) ?? []
    return kids.length ? 1 + Math.max(...kids.map((k) => this.height(k.id))) : 0
  }

  /** Depth-first, in tree order. */
  ordered(): Group[] {
    const out: Group[] = []
    const visit = (parentId: string | null) => {
      for (const g of this.children.get(parentId) ?? []) {
        out.push(g)
        visit(g.id)
      }
    }
    visit(null)
    return out
  }
}

function conflict(message: string): never {
  throw new HTTPException(409, { message })
}

function nameTaken(name: string, exceptId?: string) {
  const found = db
    .select({ id: userGroup.id })
    .from(userGroup)
    .where(sameName(userGroup.name, name))
    .get()
  return !!found && found.id !== exceptId
}

/** Spec 038: the `everyone` group, created on first need. */
export function defaultGroupId(tx: Pick<typeof db, 'select' | 'insert'> = db): string {
  const found = tx.select({ id: userGroup.id }).from(userGroup).where(eq(userGroup.isDefault, true)).get()
  if (found) return found.id
  const [created] = tx
    .insert(userGroup)
    .values({ name: DEFAULT_GROUP_NAME, description: 'Default group — all users are members automatically', isDefault: true })
    .returning({ id: userGroup.id })
    .all()
  return created!.id
}

/** Gives the user the `group` grants of every course the group is enrolled in. */
function grantGroupCourses(tx: Tx | typeof db, groupId: string, userIds: string[], grantedBy: string | null) {
  if (userIds.length === 0) return
  const courses = tx
    .select({ courseId: groupCourseEnrollment.courseId })
    .from(groupCourseEnrollment)
    .where(eq(groupCourseEnrollment.groupId, groupId))
    .all()
  const rows = courses.flatMap(({ courseId }) =>
    userIds.map((userId) => ({ userId, courseId, source: 'group' as const, via: groupId, grantedBy })),
  )
  if (rows.length) tx.insert(enrollmentGrant).values(rows).onConflictDoNothing({ target: GRANT_TARGET }).run()
}

/** Adds (or changes the role of) a membership and grants the group's courses. */
export function addMember(
  groupId: string,
  userId: string,
  opts: { role?: MembershipRole; origin?: MembershipOrigin; addedBy?: string | null } = {},
) {
  const { role = 'member', origin = 'manual', addedBy = null } = opts
  db.transaction((tx) => {
    tx.insert(groupMembership)
      .values({ groupId, userId, role, origin, addedBy })
      .onConflictDoUpdate({ target: [groupMembership.groupId, groupMembership.userId], set: { role } })
      .run()
    grantGroupCourses(tx, groupId, [userId], addedBy)
  })
}

/** Removes the membership and the grants it gave. Progress is kept. */
export function removeMember(groupId: string, userId: string) {
  db.transaction((tx) => {
    tx.delete(groupMembership).where(and(eq(groupMembership.groupId, groupId), eq(groupMembership.userId, userId))).run()
    tx.delete(enrollmentGrant)
      .where(
        and(eq(enrollmentGrant.userId, userId), eq(enrollmentGrant.source, 'group'), eq(enrollmentGrant.via, groupId)),
      )
      .run()
  })
}

/** Spec 038: every user is in the default group (new accounts, and existing ones at startup). */
export function ensureDefaultMemberships() {
  const groupId = defaultGroupId()
  const missing = db
    .select({ id: user.id })
    .from(user)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM ${groupMembership} WHERE ${groupMembership.groupId} = ${groupId} AND ${groupMembership.userId} = ${user.id})`,
    )
    .all()
  db.transaction((tx) => {
    for (const { id } of missing) {
      tx.insert(groupMembership).values({ groupId, userId: id, origin: 'default' }).onConflictDoNothing().run()
    }
    grantGroupCourses(
      tx,
      groupId,
      missing.map((m) => m.id),
      null,
    )
  })
  return missing.length
}

export function joinDefaultGroup(userId: string) {
  addMember(defaultGroupId(), userId, { origin: 'default' })
}

/** Spec 135: enrolls the group; current members get a grant now, future members when they join. */
export function enrollGroup(groupId: string, courseId: string, by: string) {
  return db.transaction((tx) => {
    tx.insert(groupCourseEnrollment).values({ groupId, courseId, enrolledBy: by }).onConflictDoNothing().run()
    const members = tx
      .select({ userId: groupMembership.userId })
      .from(groupMembership)
      .where(eq(groupMembership.groupId, groupId))
      .all()
      .map((m) => m.userId)
    const before = new Set(
      members.length
        ? tx
            .selectDistinct({ userId: enrollmentGrant.userId })
            .from(enrollmentGrant)
            .where(and(eq(enrollmentGrant.courseId, courseId), inArray(enrollmentGrant.userId, members)))
            .all()
            .map((r) => r.userId)
        : [],
    )
    grantGroupCourses(tx, groupId, members, by)
    return members.filter((m) => !before.has(m)).length
  })
}

/** Withdraws the group: only the grants it created go (members enrolled another way stay). */
export function unenrollGroup(groupId: string, courseId: string) {
  db.transaction((tx) => {
    tx.delete(groupCourseEnrollment)
      .where(and(eq(groupCourseEnrollment.groupId, groupId), eq(groupCourseEnrollment.courseId, courseId)))
      .run()
    tx.delete(enrollmentGrant)
      .where(
        and(eq(enrollmentGrant.courseId, courseId), eq(enrollmentGrant.source, 'group'), eq(enrollmentGrant.via, groupId)),
      )
      .run()
  })
}

export function requireGroup(id: string, tree = GroupTree.load()) {
  const found = tree.byId.get(id)
  if (!found) throw new HTTPException(404, { message: 'Group not found' })
  return found
}

/** Spec 131/132: name unique, parent exists, depth ≤ 10. */
export function createGroup(input: { name: string; description?: string | null; parentId?: string | null }) {
  const tree = GroupTree.load()
  if (input.parentId) {
    requireGroup(input.parentId, tree)
    if (tree.depth(input.parentId) + 1 >= GROUP_MAX_DEPTH) {
      throw new HTTPException(400, { message: `Groups cannot be nested more than ${GROUP_MAX_DEPTH} levels deep` })
    }
  }
  if (nameTaken(input.name)) conflict('A group with this name already exists')
  const [created] = db
    .insert(userGroup)
    .values({ name: input.name, description: input.description ?? null, parentId: input.parentId ?? null })
    .returning()
    .all()
  return created!
}

/** Rename, describe or move a local group (spec 132: no cycle, depth ≤ 10). The default group cannot change. */
export function updateGroup(id: string, input: { name?: string; description?: string | null; parentId?: string | null }) {
  const tree = GroupTree.load()
  const found = requireGroup(id, tree)
  if (found.origin !== 'local' || found.isDefault) {
    throw new HTTPException(404, { message: 'Group not found or not a local group' })
  }
  if (input.name !== undefined && nameTaken(input.name, id)) conflict('A group with this name already exists')
  if (input.parentId !== undefined && input.parentId !== found.parentId) {
    if (input.parentId) {
      requireGroup(input.parentId, tree)
      if (tree.subtreeIds(id).includes(input.parentId)) {
        throw new HTTPException(400, { message: 'A group cannot be moved under itself or one of its subgroups' })
      }
      if (tree.depth(input.parentId) + 1 + tree.height(id) >= GROUP_MAX_DEPTH) {
        throw new HTTPException(400, { message: `Groups cannot be nested more than ${GROUP_MAX_DEPTH} levels deep` })
      }
    }
  }
  const [updated] = db.update(userGroup).set(input).where(eq(userGroup.id, id)).returning().all()
  return updated!
}

/** Spec 131: only empty local groups without subgroups; their course enrollments are withdrawn. */
export function deleteGroup(id: string) {
  const tree = GroupTree.load()
  const found = requireGroup(id, tree)
  if (found.origin !== 'local' || found.isDefault) {
    throw new HTTPException(404, { message: 'Group not found or not a local group' })
  }
  if ((tree.children.get(id) ?? []).length) conflict('Cannot delete a group that has subgroups')
  const members = db.select({ n: count() }).from(groupMembership).where(eq(groupMembership.groupId, id)).get()
  if (members && members.n > 0) conflict('Cannot delete a group that has members')
  db.transaction((tx) => {
    tx.delete(enrollmentGrant).where(and(eq(enrollmentGrant.source, 'group'), eq(enrollmentGrant.via, id))).run()
    tx.delete(userGroup).where(eq(userGroup.id, id)).run()
  })
}

/** Rows of `/api/admin/groups`, in tree order. */
export function listGroups(tree = GroupTree.load(), only?: Set<string>): AdminGroup[] {
  const members = new Map(
    db
      .select({
        groupId: groupMembership.groupId,
        n: count(),
        managers: sql<number>`sum(${groupMembership.role} = 'manager')`.mapWith(Number),
      })
      .from(groupMembership)
      .groupBy(groupMembership.groupId)
      .all()
      .map((r) => [r.groupId, r]),
  )
  const courses = new Map(
    db
      .select({ groupId: groupCourseEnrollment.groupId, n: count() })
      .from(groupCourseEnrollment)
      .groupBy(groupCourseEnrollment.groupId)
      .all()
      .map((r) => [r.groupId, r.n]),
  )
  return tree
    .ordered()
    .filter((g) => !only || only.has(g.id))
    .map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      origin: g.origin,
      parentId: g.parentId,
      depth: tree.depth(g.id),
      isDefault: g.isDefault,
      memberCount: members.get(g.id)?.n ?? 0,
      managerCount: members.get(g.id)?.managers ?? 0,
      courseCount: courses.get(g.id) ?? 0,
      createdAt: g.createdAt.toISOString(),
    }))
}

/** Spec 133: members of the group, or of its whole subtree (`recursive`). */
export function listMembers(groupIds: string[], tree: GroupTree): GroupMember[] {
  if (groupIds.length === 0) return []
  return db
    .select({
      userId: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      image: user.image,
      role: groupMembership.role,
      origin: groupMembership.origin,
      groupId: groupMembership.groupId,
      addedAt: groupMembership.createdAt,
    })
    .from(groupMembership)
    .innerJoin(user, eq(user.id, groupMembership.userId))
    .where(inArray(groupMembership.groupId, groupIds))
    .orderBy(asc(user.name))
    .all()
    .map((r) => ({ ...r, groupName: tree.byId.get(r.groupId)?.name ?? '', addedAt: r.addedAt.toISOString() }))
}

export function listGroupCourses(groupId: string) {
  return db
    .select({
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      enrolledAt: groupCourseEnrollment.createdAt,
    })
    .from(groupCourseEnrollment)
    .innerJoin(course, eq(course.id, groupCourseEnrollment.courseId))
    .where(eq(groupCourseEnrollment.groupId, groupId))
    .orderBy(asc(course.title))
    .all()
    .map((r) => ({ ...r, enrolledAt: r.enrolledAt.toISOString() }))
}

/** Spec 140: the groups where the user is a `manager` (never the default group). */
export function managedGroupIds(userId: string) {
  return db
    .select({ id: groupMembership.groupId })
    .from(groupMembership)
    .innerJoin(userGroup, eq(userGroup.id, groupMembership.groupId))
    .where(and(eq(groupMembership.userId, userId), eq(groupMembership.role, 'manager'), eq(userGroup.isDefault, false)))
    .all()
    .map((r) => r.id)
}

/** Users who are members of at least one of `groupIds`. */
export function memberIdsOf(groupIds: string[]) {
  if (groupIds.length === 0) return new Set<string>()
  return new Set(
    db
      .selectDistinct({ userId: groupMembership.userId })
      .from(groupMembership)
      .where(inArray(groupMembership.groupId, groupIds))
      .all()
      .map((r) => r.userId),
  )
}

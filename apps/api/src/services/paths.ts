import type {
  AdminPath,
  PathEnrollmentRow,
  PathInput,
  PathItem,
  PathItemStatus,
  PathProgressItem,
  PathUpdateInput,
} from '@pupitre/shared'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import {
  course,
  courseCompletion,
  courseModule,
  enrollmentGrant,
  learningPath,
  moduleProgress,
  moduleSkill,
  pathEnrollment,
  pathItem,
  skill,
  user,
} from '../db/schema/index.ts'
import { GRANT_TARGET } from './courses.ts'
import { ensureSkills } from './skills.ts'

export type LearningPath = typeof learningPath.$inferSelect
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export function findPath(by: { id?: string; slug?: string }) {
  const where = by.id ? eq(learningPath.id, by.id) : eq(learningPath.slug, by.slug ?? '')
  return db.select().from(learningPath).where(where).get()
}

export function requirePath(by: { id?: string; slug?: string }) {
  const found = findPath(by)
  if (!found) throw new HTTPException(404, { message: 'Path not found' })
  return found
}

/** Ordered members of the paths, with their course or skill. */
export function pathItems(pathIds: string[]) {
  const out = new Map<string, PathItem[]>()
  if (pathIds.length === 0) return out
  const rows = db
    .select({
      pathId: pathItem.pathId,
      courseId: course.id,
      courseSlug: course.slug,
      courseTitle: course.title,
      courseStatus: course.status,
      skillId: skill.id,
      skillSlug: skill.slug,
      skillLabel: skill.label,
    })
    .from(pathItem)
    .leftJoin(course, eq(course.id, pathItem.courseId))
    .leftJoin(skill, eq(skill.id, pathItem.skillId))
    .where(inArray(pathItem.pathId, pathIds))
    .orderBy(asc(pathItem.pathId), asc(pathItem.position))
    .all()
  for (const r of rows) {
    const item: PathItem | null = r.courseId
      ? { kind: 'course', id: r.courseId, slug: r.courseSlug!, title: r.courseTitle!, status: r.courseStatus! }
      : r.skillId
        ? { kind: 'skill', id: r.skillId, slug: r.skillSlug!, title: r.skillLabel! }
        : null
    if (item) out.set(r.pathId, [...(out.get(r.pathId) ?? []), item])
  }
  return out
}

export function toAdminPath(p: LearningPath, items: PathItem[], enrollmentCount: number): AdminPath {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    kind: p.kind,
    level: p.level,
    status: p.status,
    items,
    enrollmentCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export function enrollmentCounts(pathIds: string[]) {
  if (pathIds.length === 0) return new Map<string, number>()
  return new Map(
    db
      .select({ pathId: pathEnrollment.pathId, n: sql<number>`count(*)` })
      .from(pathEnrollment)
      .where(inArray(pathEnrollment.pathId, pathIds))
      .groupBy(pathEnrollment.pathId)
      .all()
      .map((r) => [r.pathId, r.n]),
  )
}

/**
 * Spec 125 / 191: every user enrolled in a course path holds a `path` grant (via = path id) on each member course.
 * Brings the grants of the path in line with its members and enrollments (only the difference is written).
 */
function syncPathGrants(tx: Tx, pathId: string, grantedBy: string | null) {
  const path = tx.select().from(learningPath).where(eq(learningPath.id, pathId)).get()
  const courseIds =
    path && path.kind === 'course' && path.status !== 'archived'
      ? tx
          .select({ id: pathItem.courseId })
          .from(pathItem)
          .where(eq(pathItem.pathId, pathId))
          .all()
          .flatMap((r) => (r.id ? [r.id] : []))
      : []
  const userIds = tx
    .select({ id: pathEnrollment.userId })
    .from(pathEnrollment)
    .where(eq(pathEnrollment.pathId, pathId))
    .all()
    .map((r) => r.id)
  const wanted = new Set(userIds.flatMap((u) => courseIds.map((c) => `${u}|${c}`)))
  const existing = tx
    .select({ id: enrollmentGrant.id, userId: enrollmentGrant.userId, courseId: enrollmentGrant.courseId })
    .from(enrollmentGrant)
    .where(and(eq(enrollmentGrant.source, 'path'), eq(enrollmentGrant.via, pathId)))
    .all()
  const have = new Set(existing.map((g) => `${g.userId}|${g.courseId}`))
  const extra = existing.filter((g) => !wanted.has(`${g.userId}|${g.courseId}`)).map((g) => g.id)
  if (extra.length) tx.delete(enrollmentGrant).where(inArray(enrollmentGrant.id, extra)).run()
  const missing = [...wanted].filter((k) => !have.has(k))
  if (missing.length) {
    tx.insert(enrollmentGrant)
      .values(
        missing.map((k) => {
          const [userId, courseId] = k.split('|') as [string, string]
          return { userId, courseId, source: 'path' as const, via: pathId, grantedBy }
        }),
      )
      .onConflictDoNothing({ target: GRANT_TARGET })
      .run()
  }
}

function writeItems(tx: Tx, pathId: string, kind: 'course' | 'skill', items: string[]) {
  tx.delete(pathItem).where(eq(pathItem.pathId, pathId)).run()
  if (items.length === 0) return
  if (kind === 'course') {
    const known = new Set(
      tx.select({ id: course.id }).from(course).where(inArray(course.id, items)).all().map((r) => r.id),
    )
    const unknown = items.find((id) => !known.has(id))
    if (unknown) throw new HTTPException(400, { message: `Unknown course: ${unknown}` })
    tx.insert(pathItem)
      .values(items.map((courseId, position) => ({ pathId, position, courseId })))
      .run()
  } else {
    const ids = ensureSkills(items, tx)
    tx.insert(pathItem)
      .values(items.map((slug, position) => ({ pathId, position, skillId: ids.get(slug)! })))
      .run()
  }
}

function slugTaken(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed: learning_path\.slug/.test(String(err.cause ?? err.message))
}

/** Spec 126: create a path with its ordered members. */
export function createPath(input: PathInput & { kind: 'course' | 'skill'; items: string[] }) {
  try {
    return db.transaction((tx) => {
      const { items, ...fields } = input
      const created = tx.insert(learningPath).values(fields).returning().get()!
      writeItems(tx, created.id, created.kind, items)
      return created
    })
  } catch (err) {
    if (slugTaken(err)) throw new HTTPException(409, { message: 'Path already exists' })
    throw err
  }
}

/** Spec 126 / 191: edit; archiving ends the path enrollments. Grants follow the members. */
export function updatePath(id: string, input: PathUpdateInput & { items?: string[] }, actorId: string) {
  try {
    return db.transaction((tx) => {
      const { items, ...fields } = input
      const updated = Object.keys(fields).length
        ? tx.update(learningPath).set(fields).where(eq(learningPath.id, id)).returning().get()!
        : tx.select().from(learningPath).where(eq(learningPath.id, id)).get()!
      if (items !== undefined || fields.kind !== undefined) {
        const current =
          items ??
          tx
            .select({ courseId: pathItem.courseId, slug: skill.slug })
            .from(pathItem)
            .leftJoin(skill, eq(skill.id, pathItem.skillId))
            .where(eq(pathItem.pathId, id))
            .orderBy(asc(pathItem.position))
            .all()
            .map((r) => r.courseId ?? r.slug!)
        // Changing the kind drops members of the other kind.
        writeItems(tx, id, updated.kind, fields.kind && items === undefined ? [] : current)
      }
      if (updated.status === 'archived') tx.delete(pathEnrollment).where(eq(pathEnrollment.pathId, id)).run()
      syncPathGrants(tx, id, actorId)
      return updated
    })
  } catch (err) {
    if (slugTaken(err)) throw new HTTPException(409, { message: 'Path already exists' })
    throw err
  }
}

/** Deleting a path ends its enrollments and removes the grants they gave. */
export function deletePath(id: string) {
  db.transaction((tx) => {
    tx.delete(enrollmentGrant).where(and(eq(enrollmentGrant.source, 'path'), eq(enrollmentGrant.via, id))).run()
    tx.delete(learningPath).where(eq(learningPath.id, id)).run()
  })
}

/** Spec 122: idempotent; course paths give access to every member course. */
export function enrollInPath(pathId: string, userId: string, by: string) {
  db.transaction((tx) => {
    tx.insert(pathEnrollment).values({ pathId, userId, enrolledBy: by }).onConflictDoNothing().run()
    syncPathGrants(tx, pathId, by)
  })
}

/** Removes the path enrollment and the grants it gave; other grants and progress stay. */
export function unenrollFromPath(pathId: string, userId: string) {
  db.transaction((tx) => {
    tx.delete(pathEnrollment).where(and(eq(pathEnrollment.pathId, pathId), eq(pathEnrollment.userId, userId))).run()
    syncPathGrants(tx, pathId, null)
  })
}

/** Spec 112: a skill is completed when every assessable (quiz) module teaching it is passed; none = never. */
function completedSkills(userId: string, skillIds: string[]) {
  if (skillIds.length === 0) return new Set<string>()
  const rows = db
    .select({
      skillId: moduleSkill.skillId,
      total: sql<number>`count(*)`,
      passed: sql<number>`sum(${moduleProgress.passedAt} IS NOT NULL)`,
    })
    .from(moduleSkill)
    .innerJoin(courseModule, and(eq(courseModule.id, moduleSkill.moduleId), eq(courseModule.hidden, false)))
    .innerJoin(course, and(eq(course.id, courseModule.courseId), eq(course.status, 'published')))
    .leftJoin(moduleProgress, and(eq(moduleProgress.moduleId, courseModule.id), eq(moduleProgress.userId, userId)))
    .where(and(inArray(moduleSkill.skillId, skillIds), inArray(courseModule.type, ['quiz', 'lab'])))
    .groupBy(moduleSkill.skillId)
    .all()
  return new Set(rows.filter((r) => r.total > 0 && Number(r.passed) >= r.total).map((r) => r.skillId))
}

/** Spec 124: completed / available (first, or previous completed) / locked, for one learner. */
export function pathProgress(userId: string, kind: 'course' | 'skill', items: PathItem[]): PathProgressItem[] {
  let done: Set<string>
  if (kind === 'course') {
    const ids = items.map((i) => i.id)
    done = new Set(
      ids.length
        ? db
            .select({ id: courseCompletion.courseId })
            .from(courseCompletion)
            .where(and(eq(courseCompletion.userId, userId), inArray(courseCompletion.courseId, ids)))
            .all()
            .map((r) => r.id!)
        : [],
    )
  } else {
    done = completedSkills(
      userId,
      items.map((i) => i.id),
    )
  }
  let previousDone = true
  return items.map((i) => {
    const status: PathItemStatus = done.has(i.id) ? 'completed' : previousDone ? 'available' : 'locked'
    previousDone = done.has(i.id)
    return { slug: i.slug, title: i.title, status }
  })
}

/** Spec 122/127: the path's learners with their progress. `onlyUsers` restricts to a manager's scope. */
export function pathEnrollmentRows(path: LearningPath, onlyUsers?: Set<string>): PathEnrollmentRow[] {
  const items = pathItems([path.id]).get(path.id) ?? []
  const rows = db
    .select({
      userId: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      enrolledAt: pathEnrollment.createdAt,
    })
    .from(pathEnrollment)
    .innerJoin(user, eq(user.id, pathEnrollment.userId))
    .where(eq(pathEnrollment.pathId, path.id))
    .orderBy(asc(user.name))
    .all()
    .filter((r) => !onlyUsers || onlyUsers.has(r.userId))
  return rows.map((r) => {
    const progress = pathProgress(r.userId, path.kind, items)
    return {
      ...r,
      enrolledAt: r.enrolledAt.toISOString(),
      completed: progress.filter((p) => p.status === 'completed').length,
      total: progress.length,
      items: progress,
    }
  })
}

export function requireUser(id: string) {
  const found = db.select({ id: user.id }).from(user).where(eq(user.id, id)).get()
  if (!found) throw new HTTPException(404, { message: 'User not found' })
  return found
}

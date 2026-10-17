import type { XpEventView, XpSource } from '@pupitre/shared'
import { and, desc, eq, gt, inArray, ne, sql, sum } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { badgeAward, course, courseCompletion, user, xpEvent } from '../db/schema/index.ts'
import { updateSkillLevels } from './skills.ts'

// better-sqlite3 is synchronous: Drizzle transactions take a synchronous callback, so the helpers that may
// run inside one use the synchronous `.all()` / `.get()` / `.run()` query methods.
type Tx = Pick<typeof db, 'insert' | 'select' | 'delete'>

type CompletableCourse = {
  id: string
  title: string
  completionXp: number
  difficulty?: (typeof course.$inferSelect)['difficulty']
  badgeName?: string | null
  badgeIcon?: string | null
}

type XpInput = {
  userId: string
  source: XpSource
  sourceKey: string
  amount: number
  label: string
  courseId?: string | null
  grantedBy?: string | null
}

/**
 * Spec 103: records an XP gain at most once per (user, source, sourceKey). Returns whether it was new.
 * Lessons and quizzes will call it with `XP_AMOUNTS`; course completion goes through `completeCourse`.
 */
export function awardXp(input: XpInput, tx: Tx = db) {
  const inserted = tx
    .insert(xpEvent)
    .values(input)
    .onConflictDoNothing({ target: [xpEvent.userId, xpEvent.source, xpEvent.sourceKey] })
    .returning({ id: xpEvent.id })
    .all()
  return inserted.length > 0
}

export function totalXp(userId: string, tx: Tx = db) {
  const row = tx
    .select({ total: sum(xpEvent.amount).mapWith(Number) })
    .from(xpEvent)
    .where(eq(xpEvent.userId, userId))
    .get()
  return row?.total ?? 0
}

/** Admin adjustment (spec 191): refused when it would make the total negative. Returns the new total. */
export function adjustXp(userId: string, amount: number, reason: string, adminId: string) {
  return db.transaction((tx) => {
    const total = totalXp(userId, tx)
    if (total + amount < 0) return null
    awardXp(
      { userId, source: 'admin', sourceKey: crypto.randomUUID(), amount, label: reason, grantedBy: adminId },
      tx,
    )
    return total + amount
  })
}

/** Most recent first. */
export async function xpHistory(userId: string): Promise<XpEventView[]> {
  const rows = await db
    .select({
      source: xpEvent.source,
      amount: xpEvent.amount,
      label: xpEvent.label,
      createdAt: xpEvent.createdAt,
      courseSlug: course.slug,
      courseTitle: course.title,
    })
    .from(xpEvent)
    .leftJoin(course, eq(course.id, xpEvent.courseId))
    .where(eq(xpEvent.userId, userId))
    .orderBy(desc(xpEvent.createdAt))
  return rows.map((r) => ({
    source: r.source,
    amount: r.amount,
    label: r.label,
    course: r.courseSlug ? { slug: r.courseSlug, title: r.courseTitle! } : null,
    earnedAt: r.createdAt.toISOString(),
  }))
}

/**
 * Spec 068 / 191: records the completion and, in the same step, grants the completion XP, awards the badge (106) and
 * updates the skill levels (113). Idempotent: completing twice changes nothing. Returns whether it was new.
 */
export function completeCourse(userId: string, c: CompletableCourse, completedBy: string | null) {
  return db.transaction((tx) => {
    const inserted = tx
      .insert(courseCompletion)
      .values({ userId, courseId: c.id, courseTitle: c.title, completedBy })
      .onConflictDoNothing({ target: [courseCompletion.userId, courseCompletion.courseId] })
      .returning({ id: courseCompletion.id })
      .all()
    if (inserted.length === 0) return false
    if (c.completionXp > 0) {
      awardXp(
        {
          userId,
          source: 'course',
          sourceKey: c.id,
          amount: c.completionXp,
          label: c.title,
          courseId: c.id,
          grantedBy: completedBy,
        },
        tx,
      )
    }
    if (c.badgeName && c.badgeIcon) {
      tx.insert(badgeAward)
        .values({ userId, courseId: c.id, courseTitle: c.title, name: c.badgeName, icon: c.badgeIcon })
        .onConflictDoNothing({ target: [badgeAward.userId, badgeAward.courseId] })
        .run()
    }
    updateSkillLevels(tx, userId, c.id, c.difficulty ?? null)
    return true
  })
}

/** Admin correction of a wrong completion: removes it and the XP it granted. */
export function uncompleteCourse(userId: string, courseId: string) {
  db.transaction((tx) => {
    tx.delete(courseCompletion)
      .where(and(eq(courseCompletion.userId, userId), eq(courseCompletion.courseId, courseId)))
      .run()
    tx.delete(xpEvent)
      .where(and(eq(xpEvent.userId, userId), eq(xpEvent.source, 'course'), eq(xpEvent.sourceKey, courseId)))
      .run()
    tx.delete(badgeAward).where(and(eq(badgeAward.userId, userId), eq(badgeAward.courseId, courseId))).run()
  })
}

/** Completion dates of the user's completions among `courseIds`. */
export async function completionsFor(userId: string, courseIds: string[]) {
  if (courseIds.length === 0) return new Map<string, Date>()
  const rows = await db
    .select({ courseId: courseCompletion.courseId, completedAt: courseCompletion.completedAt })
    .from(courseCompletion)
    .where(and(eq(courseCompletion.userId, userId), inArray(courseCompletion.courseId, courseIds)))
  return new Map(rows.map((r) => [r.courseId!, r.completedAt]))
}

/** XP totals of active non-admin users with XP > 0, highest first, ranked 1, 1, 3… on ties. */
export async function xpRanking() {
  const total = sum(xpEvent.amount).mapWith(Number)
  const rows = await db
    .select({ userId: user.id, username: user.username, name: user.name, image: user.image, xp: total })
    .from(xpEvent)
    .innerJoin(user, eq(user.id, xpEvent.userId))
    .where(and(eq(user.isActive, true), ne(user.role, 'admin')))
    .groupBy(user.id)
    .having(gt(sql`sum(${xpEvent.amount})`, 0))
    .orderBy(desc(sql`sum(${xpEvent.amount})`), user.name)

  let rank = 0
  return rows.map((r, i) => {
    if (i === 0 || r.xp !== rows[i - 1]!.xp) rank = i + 1
    return { ...r, rank }
  })
}

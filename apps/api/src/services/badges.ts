import type { EarnedBadge } from '@pupitre/shared'
import { and, count, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { badgeAward, course, user } from '../db/schema/index.ts'

/** Spec 109: number of holders per course badge. */
export function badgeHolders(courseIds: string[]) {
  if (courseIds.length === 0) return new Map<string, number>()
  return new Map(
    db
      .select({ courseId: badgeAward.courseId, n: count() })
      .from(badgeAward)
      .where(inArray(badgeAward.courseId, courseIds))
      .groupBy(badgeAward.courseId)
      .all()
      .map((r) => [r.courseId!, r.n]),
  )
}

/** Spec 106: a user's badges, most recent first, with their rarity. */
export function earnedBadges(userId: string): EarnedBadge[] {
  const rows = db
    .select({
      name: badgeAward.name,
      icon: badgeAward.icon,
      courseId: badgeAward.courseId,
      courseTitle: badgeAward.courseTitle,
      awardedAt: badgeAward.awardedAt,
      slug: course.slug,
      title: course.title,
    })
    .from(badgeAward)
    .leftJoin(course, eq(course.id, badgeAward.courseId))
    .where(eq(badgeAward.userId, userId))
    .orderBy(desc(badgeAward.awardedAt))
    .all()
  const holders = badgeHolders(rows.flatMap((r) => (r.courseId ? [r.courseId] : [])))
  return rows.map((r) => ({
    name: r.name,
    icon: r.icon,
    course: r.slug ? { slug: r.slug, title: r.title! } : null,
    courseTitle: r.courseTitle,
    earnedAt: r.awardedAt.toISOString(),
    earnedBy: r.courseId ? (holders.get(r.courseId) ?? 1) : 1,
  }))
}

/** Spec 108: active non-admin users ranked by badge count (ties share a rank), with their badge icons. */
export function badgeRanking(limit: number) {
  const rows = db
    .select({ id: user.id, username: user.username, name: user.name, image: user.image, n: count() })
    .from(badgeAward)
    .innerJoin(user, eq(user.id, badgeAward.userId))
    .where(and(eq(user.isActive, true), ne(user.role, 'admin')))
    .groupBy(user.id)
    .orderBy(desc(count()), user.name)
    .limit(limit)
    .all()
  const icons = new Map<string, string[]>()
  if (rows.length) {
    for (const r of db
      .select({ userId: badgeAward.userId, icon: badgeAward.icon })
      .from(badgeAward)
      .where(inArray(badgeAward.userId, rows.map((x) => x.id)))
      .orderBy(badgeAward.awardedAt)
      .all()) {
      icons.set(r.userId, [...(icons.get(r.userId) ?? []), r.icon])
    }
  }
  let rank = 0
  return rows.map((r, i) => {
    if (i === 0 || r.n !== rows[i - 1]!.n) rank = i + 1
    return { rank, id: r.id, username: r.username ?? r.name, image: r.image, count: r.n, icons: icons.get(r.id) ?? [] }
  })
}

/** The emojis a user may pick as avatar (spec 035): icons of their badges. */
export function badgeIcons(userId: string) {
  return new Set(
    db
      .selectDistinct({ icon: badgeAward.icon })
      .from(badgeAward)
      .where(and(eq(badgeAward.userId, userId), isNotNull(badgeAward.icon)))
      .all()
      .map((r) => r.icon),
  )
}

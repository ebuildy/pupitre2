import { base, en, Faker, fr } from '@faker-js/faker'
import type { Role } from '@pupitre/shared'
import { asc, eq, inArray } from 'drizzle-orm'
import { auth } from '../auth.ts'
import { db } from '../db/index.ts'
import { category, course, courseCompletion, enrollmentGrant, user, xpEvent } from '../db/schema/index.ts'
import {
  CATEGORIES,
  COURSE_TEMPLATES,
  CURATED_COURSES,
  type CourseFixture,
  KNOWN_USERS,
  MANAGER_PASSWORD,
  STUDENT_PASSWORD,
  TOPICS,
  XP_BONUSES,
} from './data.ts'

/**
 * Spec 015: mock data for development and demos (`pnpm db:seed`, or `SEED_DEV_DATA=true` at API startup).
 *
 * - Deterministic: faker is seeded, so every run produces the same people, courses and enrollments.
 * - Idempotent: rows are matched by slug / e-mail and never duplicated; existing rows are left untouched.
 * - Never run it against production data.
 */
export async function seedFixtures({ students = 25, managers = 3 } = {}) {
  const faker = new Faker({ locale: [fr, en, base] })
  faker.seed(2026)
  // Generated dates are relative to a fixed day, not "now", so runs stay identical.
  const refDate = new Date('2026-09-01T09:00:00Z')

  // 1. Categories
  const categoryIds = new Map<string, string>()
  for (const c of CATEGORIES) {
    await db
      .insert(category)
      .values({ slug: c.slug, title: c.title, parentId: c.parent ? categoryIds.get(c.parent) : null })
      .onConflictDoNothing({ target: category.slug })
    const row = await db.query.category.findFirst({ columns: { id: true }, where: eq(category.slug, c.slug) })
    categoryIds.set(c.slug, row!.id)
  }

  // 2. Courses: curated, then generated from topics × templates.
  const generated: CourseFixture[] = Object.entries(TOPICS).flatMap(([cat, topics]) =>
    topics.flatMap((topic) =>
      faker.helpers.arrayElements(COURSE_TEMPLATES, 2).map((tpl) => {
        const title = tpl.title(topic)
        return {
          slug: slugify(title),
          title,
          description: tpl.description(topic),
          category: cat,
          difficulty: tpl.difficulty,
          // Advanced courses are XP-gated (spec 049) and pay more.
          ...(tpl.difficulty === 'advanced' ? { xpRequired: 400, completionXp: 300 } : {}),
          visibility: faker.helpers.weightedArrayElement([
            { value: 'public' as const, weight: 9 },
            { value: 'private' as const, weight: 1 },
          ]),
          status: faker.helpers.weightedArrayElement([
            { value: 'published' as const, weight: 17 },
            { value: 'draft' as const, weight: 2 },
            { value: 'archived' as const, weight: 1 },
          ]),
        }
      }),
    ),
  )
  const courseFixtures = [...CURATED_COURSES, ...generated]
  await db
    .insert(course)
    .values(
      courseFixtures.map(({ category: cat, ...c }) => ({
        ...c,
        categoryId: categoryIds.get(cat) ?? null,
        createdAt: faker.date.past({ years: 1, refDate }),
      })),
    )
    .onConflictDoNothing({ target: course.slug })
  const courses = await db
    .select({
      id: course.id,
      title: course.title,
      visibility: course.visibility,
      status: course.status,
      completionXp: course.completionXp,
    })
    .from(course)
    .where(
      inArray(
        course.slug,
        courseFixtures.map((c) => c.slug),
      ),
    )
    .orderBy(asc(course.slug)) // stable order: random picks below must not depend on row order

  // 3. Users: known accounts, then generated students and managers (French names).
  type UserFixture = { username: string; name: string; email: string; role: Role; password: string; isActive?: boolean }
  const usedUsernames = new Set<string>(KNOWN_USERS.map((u) => u.username))
  const person = (role: Role, password: string): UserFixture => {
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    // better-auth usernames: letters, digits, `_` and `.`, at most 30 characters.
    let username = slugify(`${firstName}.${lastName}`, '.').slice(0, 26)
    while (usedUsernames.has(username)) username = `${username}${faker.number.int(9)}`
    usedUsernames.add(username)
    return { username, name: `${firstName} ${lastName}`, email: `${username}@example.com`, role, password }
  }
  const userFixtures: UserFixture[] = [
    ...KNOWN_USERS,
    ...Array.from({ length: students }, () => person('student', STUDENT_PASSWORD)),
    ...Array.from({ length: managers }, () => person('manager', MANAGER_PASSWORD)),
  ]

  const ctx = await auth.$context
  const hashes = new Map<string, string>() // hashing is slow: once per distinct password
  const userIds: { id: string; role: Role; isActive: boolean; createdAt: Date }[] = []
  for (const u of userFixtures) {
    const createdAt = faker.date.past({ years: 1, refDate })
    const existing = await db.query.user.findFirst({
      columns: { id: true, createdAt: true },
      where: eq(user.email, u.email),
    })
    let row = existing
    if (!row) {
      if (!hashes.has(u.password)) hashes.set(u.password, await ctx.password.hash(u.password))
      const created = await ctx.internalAdapter.createUser(
        {
          email: u.email,
          name: u.name,
          username: u.username,
          displayUsername: u.username,
          emailVerified: true,
          role: u.role,
          isActive: u.isActive ?? true,
          createdAt,
          updatedAt: createdAt,
        },
        { method: 'admin' },
      )
      await ctx.internalAdapter.linkAccount({
        userId: created.id,
        providerId: 'credential',
        accountId: created.id,
        password: hashes.get(u.password)!,
      })
      row = { id: created.id, createdAt: created.createdAt }
    }
    userIds.push({ id: row.id, role: u.role, isActive: u.isActive ?? true, createdAt: row.createdAt })
  }

  // 4. Enrollments: learners pick public courses themselves; admins grant private ones.
  const admin = await db.query.user.findFirst({ columns: { id: true }, where: eq(user.role, 'admin') })
  const selfEnrollable = courses.filter((c) => c.visibility === 'public' && c.status !== 'draft')
  const privateCourses = courses.filter((c) => c.visibility === 'private' && c.status !== 'draft')
  const grants: (typeof enrollmentGrant.$inferInsert)[] = []
  for (const learner of userIds.filter((u) => u.role !== 'admin')) {
    for (const c of faker.helpers.arrayElements(selfEnrollable, { min: 0, max: 6 })) {
      grants.push({
        userId: learner.id,
        courseId: c.id,
        source: 'self',
        grantedBy: learner.id,
        createdAt: faker.date.between({ from: learner.createdAt, to: refDate }),
      })
    }
  }
  for (const c of privateCourses) {
    for (const learner of faker.helpers.arrayElements(userIds.filter((u) => u.role === 'student'), 4)) {
      grants.push({
        userId: learner.id,
        courseId: c.id,
        source: 'admin',
        grantedBy: admin?.id ?? null,
        createdAt: faker.date.between({ from: learner.createdAt, to: refDate }),
      })
    }
  }
  if (grants.length) {
    await db
      .insert(enrollmentGrant)
      .values(grants)
      .onConflictDoNothing({ target: [enrollmentGrant.userId, enrollmentGrant.courseId, enrollmentGrant.source] })
  }

  // 5. Completions (marked by an admin until modules exist) and their XP, then a few admin bonuses (specs 103, 191).
  const completions: (typeof courseCompletion.$inferInsert)[] = []
  const xp: (typeof xpEvent.$inferInsert)[] = []
  const coursesById = new Map(courses.map((c) => [c.id, c]))
  for (const g of grants) {
    const c = coursesById.get(g.courseId)!
    if (c.status === 'draft' || !faker.datatype.boolean({ probability: 0.35 })) continue
    const completedAt = faker.date.between({ from: g.createdAt!, to: refDate })
    completions.push({
      userId: g.userId,
      courseId: c.id,
      courseTitle: c.title,
      completedBy: admin?.id ?? null,
      completedAt,
    })
    xp.push({
      userId: g.userId,
      source: 'course',
      sourceKey: c.id,
      amount: c.completionXp,
      label: c.title,
      courseId: c.id,
      grantedBy: admin?.id ?? null,
      createdAt: completedAt,
    })
  }
  const learners = userIds.filter((u) => u.role !== 'admin' && u.isActive)
  for (const [i, bonus] of XP_BONUSES.entries()) {
    for (const learner of faker.helpers.arrayElements(learners, 3)) {
      xp.push({
        userId: learner.id,
        source: 'admin',
        // Stable key: re-running the fixtures doesn't add the bonus again.
        sourceKey: `fixture-bonus-${i}`,
        amount: bonus.amount,
        label: bonus.reason,
        grantedBy: admin?.id ?? null,
        createdAt: faker.date.between({ from: learner.createdAt, to: refDate }),
      })
    }
  }
  if (completions.length) {
    await db
      .insert(courseCompletion)
      .values(completions)
      .onConflictDoNothing({ target: [courseCompletion.userId, courseCompletion.courseId] })
  }
  if (xp.length) {
    await db
      .insert(xpEvent)
      .values(xp)
      .onConflictDoNothing({ target: [xpEvent.userId, xpEvent.source, xpEvent.sourceKey] })
  }

  return {
    categories: CATEGORIES.length,
    courses: courseFixtures.length,
    users: userFixtures.length,
    grants: grants.length,
    completions: completions.length,
    xpEvents: xp.length,
  }
}

/** Lowercase ASCII slug: accents folded, other characters → `sep`, collapsed and trimmed. */
function slugify(text: string, sep = '-') {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`\\${sep}+`, 'g'), sep)
    .replace(new RegExp(`^\\${sep}|\\${sep}$`, 'g'), '')
}

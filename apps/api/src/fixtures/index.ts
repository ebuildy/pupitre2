import { base, en, Faker, fr } from '@faker-js/faker'
import type { Role } from '@pupitre/shared'
import { courseModulesSchema, XP_AMOUNTS } from '@pupitre/shared'
import { asc, eq, inArray } from 'drizzle-orm'
import { auth } from '../auth.ts'
import { db } from '../db/index.ts'
import {
  category,
  course,
  courseCompletion,
  courseModule,
  enrollmentGrant,
  moduleProgress,
  user,
  userGroup,
  xpEvent,
} from '../db/schema/index.ts'
import { addMember, createGroup, enrollGroup, ensureDefaultMemberships } from '../services/groups.ts'
import { loadModules, moduleBody, parseQuiz } from '../services/learning.ts'
import { replaceModules } from '../services/modules-admin.ts'
import {
  CATEGORIES,
  COURSE_TEMPLATES,
  CURATED_COURSES,
  CURATED_MODULES,
  type CourseFixture,
  GROUPS,
  KNOWN_USERS,
  MANAGER_PASSWORD,
  STUDENT_PASSWORD,
  TOPICS,
  templateModules,
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
          topic,
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
      courseFixtures.map(({ category: cat, topic: _topic, ...c }) => ({
        ...c,
        categoryId: categoryIds.get(cat) ?? null,
        createdAt: faker.date.past({ years: 1, refDate }),
      })),
    )
    .onConflictDoNothing({ target: course.slug })
  const courses = await db
    .select({
      id: course.id,
      slug: course.slug,
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

  // 2b. Modules (spec 191): only for courses without any, so admin edits are kept.
  const fixtureBySlug = new Map(courseFixtures.map((c) => [c.slug, c]))
  for (const c of courses) {
    const existing = await db.select({ id: courseModule.id }).from(courseModule).where(eq(courseModule.courseId, c.id)).limit(1)
    if (existing.length) continue
    const fixture = fixtureBySlug.get(c.slug)!
    const modules = CURATED_MODULES[c.slug] ?? templateModules(fixture.topic ?? fixture.title, fixture.difficulty)
    replaceModules(c.id, courseModulesSchema.parse({ modules }).modules)
  }

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
      .onConflictDoNothing({ target: [enrollmentGrant.userId, enrollmentGrant.courseId, enrollmentGrant.source, enrollmentGrant.via] })
  }

  // 4b. Groups (spec 130): created once (matched by name); members and managers added when missing.
  ensureDefaultMemberships()
  const groupIds = new Map<string, string>()
  let newGroups = 0
  for (const g of GROUPS) {
    const found = db.select({ id: userGroup.id }).from(userGroup).where(eq(userGroup.name, g.name)).get()
    const id = found?.id ?? createGroup({ name: g.name, description: g.description, parentId: g.parent ? groupIds.get(g.parent) : null }).id
    if (!found) newGroups++
    groupIds.set(g.name, id)
  }
  if (newGroups > 0) {
    const knownManager = await db.query.user.findFirst({ columns: { id: true }, where: eq(user.username, 'manager') })
    const managers = userIds.filter((u) => u.role === 'manager' && u.id !== knownManager?.id)
    const students = userIds.filter((u) => u.role === 'student' && u.isActive)
    if (knownManager) addMember(groupIds.get('Ingénierie')!, knownManager.id, { role: 'manager', addedBy: admin?.id })
    for (const [i, name] of ['Équipe Plateforme', 'Équipe Produit', 'Support'].entries()) {
      const manager = managers[i % Math.max(managers.length, 1)]
      if (manager) addMember(groupIds.get(name)!, manager.id, { role: 'manager', addedBy: admin?.id })
    }
    // `etudiant` is in Équipe Plateforme; generated students are spread over the leaf groups.
    const etudiant = await db.query.user.findFirst({ columns: { id: true }, where: eq(user.username, 'etudiant') })
    if (etudiant) addMember(groupIds.get('Équipe Plateforme')!, etudiant.id, { addedBy: admin?.id })
    const leaves = ['Équipe Plateforme', 'Équipe Produit', 'Support']
    for (const learner of students) {
      addMember(groupIds.get(faker.helpers.arrayElement(leaves))!, learner.id, { addedBy: admin?.id })
    }
    // Spec 135: Équipe Plateforme follows the Kubernetes course (published curated course, if any).
    const k8s = courses.find((c) => c.slug.includes('kubernetes') && c.status === 'published') ?? courses.find((c) => c.status === 'published')
    if (k8s && admin) enrollGroup(groupIds.get('Équipe Plateforme')!, k8s.id, admin.id)
  }

  // 5. Progress (spec 191 "ModuleProgress"), in module order: about a third of the enrollments finished (every
  // module done, course completed), some started, the rest untouched; with their lesson, quiz and course XP.
  const completions: (typeof courseCompletion.$inferInsert)[] = []
  const progressRows: (typeof moduleProgress.$inferInsert)[] = []
  const xp: (typeof xpEvent.$inferInsert)[] = []
  const coursesById = new Map(courses.map((c) => [c.id, c]))
  const modulesByCourse = new Map<string, { id: string; name: string; type: string; maxScore: number }[]>()
  for (const c of courses) {
    const { modules } = await loadModules(c.id)
    const visible = []
    for (const m of modules.filter((x) => !x.hidden)) {
      let maxScore = 0
      if (m.type === 'quiz') {
        try {
          maxScore = parseQuiz(await moduleBody(m)).questions.reduce((sum, q) => sum + q.points, 0)
        } catch {
          continue // unreadable quiz: leave it out of the fixtures
        }
      }
      visible.push({ id: m.id, name: m.name, type: m.type, maxScore })
    }
    modulesByCourse.set(c.id, visible)
  }
  for (const g of grants) {
    const c = coursesById.get(g.courseId)!
    const modules = modulesByCourse.get(c.id) ?? []
    if (c.status === 'draft' || modules.length === 0) continue
    const roll = faker.number.float()
    const doneCount = roll < 0.35 ? modules.length : roll < 0.75 ? faker.number.int({ min: 1, max: modules.length - 1 }) : 0
    let at = g.createdAt!
    for (const m of modules.slice(0, doneCount)) {
      at = faker.date.between({ from: at, to: refDate })
      const label = `${c.title} — ${m.name}`
      if (m.type === 'quiz') {
        progressRows.push({ userId: g.userId, moduleId: m.id, attempts: faker.number.int({ min: 1, max: 3 }), bestScore: m.maxScore, maxScore: m.maxScore, passedAt: at, lastActivityAt: at })
        xp.push({ userId: g.userId, source: 'quiz', sourceKey: m.id, amount: XP_AMOUNTS.quiz, label, courseId: c.id, createdAt: at })
      } else {
        progressRows.push({ userId: g.userId, moduleId: m.id, viewedAt: at, lastActivityAt: at })
        xp.push({ userId: g.userId, source: 'lesson', sourceKey: m.id, amount: XP_AMOUNTS.lesson, label, courseId: c.id, createdAt: at })
      }
    }
    if (doneCount === modules.length) {
      completions.push({ userId: g.userId, courseId: c.id, courseTitle: c.title, completedAt: at })
      xp.push({ userId: g.userId, source: 'course', sourceKey: c.id, amount: c.completionXp, label: c.title, courseId: c.id, createdAt: at })
    }
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
  if (progressRows.length) {
    await db
      .insert(moduleProgress)
      .values(progressRows)
      .onConflictDoNothing({ target: [moduleProgress.userId, moduleProgress.moduleId] })
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
    groups: GROUPS.length,
    courses: courseFixtures.length,
    users: userFixtures.length,
    grants: grants.length,
    moduleProgress: progressRows.length,
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

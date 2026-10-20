import { type AdminCourseOverview, adminCourseOverviewSchema, adminStatsSchema } from '@pupitre/shared'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { ADMIN, createRoute, createRouter, errors, json } from '../../lib/openapi.ts'

const one = (query: ReturnType<typeof sql>) => Number(db.get<{ n: number | null }>(query)?.n ?? 0)

const tags = ['Admin: stats']

const getStats = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'Platform figures',
  description: 'Specs 160, 161: dashboard counters (admins are not counted as users).',
  responses: { 200: json(adminStatsSchema), ...errors(...ADMIN) },
})

const getCourseOverview = createRoute({
  method: 'get',
  path: '/courses',
  tags,
  summary: 'Course overview',
  description: 'Spec 161 "Aperçu des cours": every course with its modules, enrollments and completions.',
  responses: { 200: json(z.object({ courses: z.array(adminCourseOverviewSchema) })), ...errors(...ADMIN) },
})

/** Specs 160, 161: platform figures, computed (the original's placeholders are real numbers here). */
export const adminStatsRoutes = createRouter()
  .openapi(getStats, (c) => {
    const submissions = one(sql`SELECT count(*) AS n FROM quiz_submission`)
    const passed = one(sql`SELECT count(*) AS n FROM quiz_submission WHERE passed = 1`)
    return c.json({
      users: one(sql`SELECT count(*) AS n FROM user WHERE role != 'admin'`),
      activeUsers: one(sql`SELECT count(*) AS n FROM user WHERE role != 'admin' AND is_active = 1`),
      courses: one(sql`SELECT count(*) AS n FROM course`),
      publishedCourses: one(sql`SELECT count(*) AS n FROM course WHERE status = 'published'`),
      enrollments: one(sql`SELECT count(*) AS n FROM (SELECT DISTINCT user_id, course_id FROM enrollment_grant)`),
      completions: one(sql`SELECT count(*) AS n FROM course_completion`),
      quizSubmissions: submissions,
      successRate: submissions ? Math.round((passed / submissions) * 1000) / 10 : null,
      badges: one(sql`SELECT count(*) AS n FROM badge_award`),
      groups: one(sql`SELECT count(*) AS n FROM user_group WHERE is_default = 0`),
      paths: one(sql`SELECT count(*) AS n FROM learning_path`),
      upcomingSessions: one(sql`SELECT count(*) AS n FROM course_session WHERE starts_at >= ${Date.now()}`),
    }, 200)
  })
  .openapi(getCourseOverview, (c) => {
    const courses = db.all<AdminCourseOverview>(sql`
      SELECT c.id, c.slug, c.title, cat.title AS category, c.visibility, c.status,
        (SELECT count(*) FROM module m WHERE m.course_id = c.id AND m.hidden = 0) AS modules,
        (SELECT count(DISTINCT g.user_id) FROM enrollment_grant g WHERE g.course_id = c.id) AS enrolled,
        (SELECT count(*) FROM course_completion cc WHERE cc.course_id = c.id) AS completions
      FROM course c LEFT JOIN category cat ON cat.id = c.category_id
      ORDER BY enrolled DESC, c.title`)
    return c.json({ courses }, 200)
  })

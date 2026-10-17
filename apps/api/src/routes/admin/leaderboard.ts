import type { AdminLeaderboardResponse } from '@pupitre/shared'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../db/index.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Spec 115: learners ranked by total quiz score (sum of best scores), with passed modules and enrolled courses. */
export const adminLeaderboardRoutes = new Hono<AppEnv>().get('/', (c) => {
  const rows = db.all<{
    id: string
    username: string | null
    name: string
    email: string
    image: string | null
    totalScore: number
    passedModules: number
    enrolledCourses: number
  }>(sql`
    SELECT u.id, u.username, u.name, u.email, u.image,
      coalesce((SELECT sum(p.best_score) FROM module_progress p WHERE p.user_id = u.id), 0) AS totalScore,
      (SELECT count(*) FROM module_progress p WHERE p.user_id = u.id AND p.passed_at IS NOT NULL) AS passedModules,
      (SELECT count(DISTINCT g.course_id) FROM enrollment_grant g WHERE g.user_id = u.id) AS enrolledCourses
    FROM user u
    WHERE u.role != 'admin' AND u.is_active = 1
    ORDER BY totalScore DESC, passedModules DESC, u.name
    LIMIT 100`)
  const ranked = rows.filter((r) => r.totalScore > 0 || r.passedModules > 0)
  let rank = 0
  return c.json<AdminLeaderboardResponse>({
    leaderboard: ranked.map((r, i) => {
      if (i === 0 || r.totalScore !== ranked[i - 1]!.totalScore) rank = i + 1
      return { ...r, username: r.username ?? r.name, rank }
    }),
  })
})

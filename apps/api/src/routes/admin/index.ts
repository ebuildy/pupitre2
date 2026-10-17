import { Hono } from 'hono'
import { type AppEnv, requireRole } from '../../middleware/session.ts'
import { adminCacheRoutes } from './cache.ts'
import { adminCategoryRoutes } from './categories.ts'
import { adminCourseRoutes } from './courses.ts'
import { adminImportRoutes } from './import.ts'
import { adminGroupRoutes } from './groups.ts'
import { adminLeaderboardRoutes } from './leaderboard.ts'
import { adminMediaRoutes } from './media.ts'
import { adminPathRoutes } from './paths.ts'
import { adminSkillRoutes } from './skills.ts'
import { adminStatsRoutes } from './stats.ts'
import { exportRoutes } from '../exports.ts'
import { adminSettingsRoutes } from './settings.ts'
import { adminUserRoutes } from './users.ts'

/**
 * Every endpoint used by the admin app lives here, mounted at `/api/admin` (spec 004).
 * The guard runs before routing, so any `/api/admin/*` path answers 401/403 to non-admins.
 * Feature routers are chained below so `AdminAppType` carries their types to the admin app.
 */
export const adminRoutes = new Hono<AppEnv>()
  .use('*', requireRole('admin'))
  .route('/cache', adminCacheRoutes)
  .route('/categories', adminCategoryRoutes)
  .route('/courses/import', adminImportRoutes)
  .route('/courses', adminCourseRoutes)
  .route('/groups', adminGroupRoutes)
  .route('/leaderboard', adminLeaderboardRoutes)
  .route('/media', adminMediaRoutes)
  .route('/paths', adminPathRoutes)
  .route('/skills', adminSkillRoutes)
  .route('/stats', adminStatsRoutes)
  .route('/exports', exportRoutes(() => null))
  .route('/users', adminUserRoutes)
  .route('/settings', adminSettingsRoutes)

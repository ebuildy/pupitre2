import { asc } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../db/index.ts'
import { skill } from '../../db/schema/index.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Every known skill (autocomplete in the path and module editors). */
export const adminSkillRoutes = new Hono<AppEnv>().get('/', (c) =>
  c.json({ skills: db.select({ slug: skill.slug, label: skill.label }).from(skill).orderBy(asc(skill.slug)).all() }),
)

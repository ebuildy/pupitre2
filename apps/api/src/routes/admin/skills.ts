import { skillRefSchema } from '@pupitre/shared'
import { asc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { skill } from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json } from '../../lib/openapi.ts'

const listSkills = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin: paths'],
  summary: 'Every known skill',
  description: 'For autocomplete in the path and module editors.',
  responses: { 200: json(z.object({ skills: z.array(skillRefSchema) })), ...errors(...ADMIN) },
})

/** Every known skill (autocomplete in the path and module editors). */
export const adminSkillRoutes = createRouter().openapi(listSkills, (c) =>
  c.json({ skills: db.select({ slug: skill.slug, label: skill.label }).from(skill).orderBy(asc(skill.slug)).all() }, 200),
)

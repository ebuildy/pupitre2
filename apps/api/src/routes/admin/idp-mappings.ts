import { MEMBERSHIP_ROLES, ROLES } from '@pupitre/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { idpGroupMapping } from '../../db/schema/index.ts'
import { validate } from '../../lib/validate.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { audit } from '../../services/audit.ts'

const mappingSchema = z
  .object({
    groupName: z.string().trim().min(1, 'groupName is required').max(200),
    platformRole: z.enum(ROLES).nullable().optional(),
    membershipRole: z.enum(MEMBERSHIP_ROLES).nullable().optional(),
  })
  .refine((m) => m.platformRole || m.membershipRole, 'Choose a platform role or a group role')

/** Spec 134, under /api/admin/idp-mappings: group names from identity providers → roles (all three platform roles). */
export const adminIdpMappingRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json({ mappings: db.select().from(idpGroupMapping).orderBy(asc(idpGroupMapping.groupName)).all() }))
  // Upsert by group name (case-insensitive).
  .post('/', validate('json', mappingSchema), (c) => {
    const input = c.req.valid('json')
    const values = { groupName: input.groupName, platformRole: input.platformRole ?? null, membershipRole: input.membershipRole ?? null }
    const existing = db.select({ id: idpGroupMapping.id }).from(idpGroupMapping).where(eq(sql`lower(${idpGroupMapping.groupName})`, input.groupName.toLowerCase())).get()
    if (existing) db.update(idpGroupMapping).set(values).where(eq(idpGroupMapping.id, existing.id)).run()
    else db.insert(idpGroupMapping).values(values).run()
    audit(c.get('user'), 'idp.mapping.save', { type: 'idp-mapping', label: input.groupName }, values)
    return c.json({ message: 'Mapping saved' })
  })
  .delete('/:id', (c) => {
    const removed = db.delete(idpGroupMapping).where(eq(idpGroupMapping.id, c.req.param('id'))).run()
    if (removed.changes === 0) throw new HTTPException(404, { message: 'Mapping not found' })
    return c.json({ message: 'Mapping deleted' })
  })

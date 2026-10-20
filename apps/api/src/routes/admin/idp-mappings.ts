import { MEMBERSHIP_ROLES, messageSchema, ROLES } from '@pupitre/shared'
import { asc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { idpGroupMapping } from '../../db/schema/index.ts'
import { ADMIN, createRoute, createRouter, errors, json, jsonBody, params } from '../../lib/openapi.ts'
import { sameName } from '../../lib/sql.ts'
import { audit } from '../../services/audit.ts'

const mappingSchema = z
  .object({
    groupName: z.string().trim().min(1, 'groupName is required').max(200),
    platformRole: z.enum(ROLES).nullable().optional(),
    membershipRole: z.enum(MEMBERSHIP_ROLES).nullable().optional(),
  })
  .refine((m) => m.platformRole || m.membershipRole, 'Choose a platform role or a group role')

const idpMappingSchema = z
  .object({
    id: z.string(),
    groupName: z.string(),
    platformRole: z.enum(ROLES).nullable(),
    membershipRole: z.enum(MEMBERSHIP_ROLES).nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'IdpGroupMapping' })

const tags = ['Admin: identity providers']

const listMappings = createRoute({
  method: 'get',
  path: '/',
  tags,
  summary: 'Group mappings',
  description: 'Spec 134: group names from identity providers → platform role and/or group role.',
  responses: { 200: json(z.object({ mappings: z.array(idpMappingSchema) })), ...errors(...ADMIN) },
})

const saveMapping = createRoute({
  method: 'post',
  path: '/',
  tags,
  summary: 'Save a group mapping',
  description: 'Upsert by group name (case-insensitive).',
  request: { body: jsonBody(mappingSchema) },
  responses: { 200: json(messageSchema), ...errors(400, ...ADMIN) },
})

const deleteMapping = createRoute({
  method: 'delete',
  path: '/{id}',
  tags,
  summary: 'Delete a group mapping',
  request: { params: params('id') },
  responses: { 200: json(messageSchema), ...errors(...ADMIN, 404) },
})

/** Spec 134, under /api/admin/idp-mappings: group names from identity providers → roles (all three platform roles). */
export const adminIdpMappingRoutes = createRouter()
  .openapi(listMappings, (c) => c.json({ mappings: db.select().from(idpGroupMapping).orderBy(asc(idpGroupMapping.groupName)).all() }, 200))
  // Upsert by group name (case-insensitive).
  .openapi(saveMapping, (c) => {
    const input = c.req.valid('json')
    const values = { groupName: input.groupName, platformRole: input.platformRole ?? null, membershipRole: input.membershipRole ?? null }
    const existing = db.select({ id: idpGroupMapping.id }).from(idpGroupMapping).where(sameName(idpGroupMapping.groupName, input.groupName)).get()
    if (existing) db.update(idpGroupMapping).set(values).where(eq(idpGroupMapping.id, existing.id)).run()
    else db.insert(idpGroupMapping).values(values).run()
    audit(c.get('user'), 'idp.mapping.save', { type: 'idp-mapping', label: input.groupName }, values)
    return c.json({ message: 'Mapping saved' }, 200)
  })
  .openapi(deleteMapping, (c) => {
    const removed = db.delete(idpGroupMapping).where(eq(idpGroupMapping.id, c.req.param('id'))).run()
    if (removed.changes === 0) throw new HTTPException(404, { message: 'Mapping not found' })
    return c.json({ message: 'Mapping deleted' }, 200)
  })

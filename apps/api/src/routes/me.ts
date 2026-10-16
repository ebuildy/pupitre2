import type { MeResponse, Role } from '@pupitre/shared'
import { Hono } from 'hono'
import { requireAuth } from '../middleware/session.ts'

// Spec 034. Lives at /api/me because /api/auth/* belongs to better-auth.
export const meRoutes = new Hono().get('/', requireAuth, (c) => {
  const user = c.get('user')
  return c.json<MeResponse>({
    id: user.id,
    username: user.username ?? null,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    image: user.image ?? null,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  })
})

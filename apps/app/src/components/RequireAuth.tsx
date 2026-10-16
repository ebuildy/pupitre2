import type { Role } from '@pupitre/shared'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '../lib/auth-client.ts'
import { AccessDenied } from './AccessDenied.tsx'

/**
 * Page guard (spec 001): signed-out visitors go to `/login?redirect=<path>`,
 * signed-in users without one of `roles` see "Accès refusé".
 */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  if (isPending) return null
  if (!session) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  if (roles && !roles.includes(session.user.role as Role)) return <AccessDenied />
  return children
}

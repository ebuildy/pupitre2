import type { Role } from '@pupitre/shared'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { AccessDenied } from './AccessDenied.tsx'
import { useSession } from './auth-client.ts'
import { useBasename } from './navigation.ts'

/**
 * Page guard (spec 001): signed-out visitors go to this app's `/login?redirect=<path>`,
 * signed-in users without one of `roles` see "Accès refusé".
 */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { data: session, isPending } = useSession()
  const location = useLocation()
  const basename = useBasename()

  if (isPending) return null
  if (!session) {
    // `redirect` is origin-absolute so any app's login page can send the user back here.
    const redirect = encodeURIComponent(basename + location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  if (roles && !roles.includes(session.user.role as Role)) return <AccessDenied />
  return children
}

import { useCallback } from 'react'
import { useHref, useNavigate } from 'react-router'

/**
 * Frontends served on the same origin, by base path. The learner app owns `/`, i.e. every path
 * that no other app claims.
 */
export const APP_BASE_PATHS = ['/admin'] as const

function isUnder(path: string, base: string) {
  return path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`)
}

/** The current app's router basename (`''` for the learner app, `/admin` for the admin app). */
export function useBasename() {
  return useHref('/').replace(/\/$/, '')
}

/**
 * Navigates to an origin-absolute path (`/courses`, `/admin/users?x=1`): client-side when it
 * belongs to the current app, full page load when it belongs to another one.
 */
export function useGoTo() {
  const navigate = useNavigate()
  const basename = useBasename()

  return useCallback(
    (path: string, { replace = false } = {}) => {
      const owned = basename
        ? isUnder(path, basename)
        : !APP_BASE_PATHS.some((base) => isUnder(path, base))
      if (!owned) {
        if (replace) window.location.replace(path)
        else window.location.assign(path)
        return
      }
      navigate(path.slice(basename.length) || '/', { replace })
    },
    [navigate, basename],
  )
}

import type { Auth } from '@pupitre/api/auth'
import { inferAdditionalFields, usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Every frontend is served on the same origin, which proxies /api/auth to the API.
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
  plugins: [usernameClient(), inferAdditionalFields<Auth>()],
})

export const { useSession, signIn } = authClient

/** Spec 023: the login field accepts a username or an e-mail. */
export function signInWithIdentifier(identifier: string, password: string) {
  return identifier.includes('@')
    ? signIn.email({ email: identifier, password })
    : signIn.username({ username: identifier, password })
}

/**
 * Spec 026: revokes the session, then does a full page load of `loginPath` (origin-absolute),
 * which drops all client state and keeps the login page from seeing a stale session.
 */
export async function signOutTo(loginPath: string) {
  await authClient.signOut()
  window.location.assign(loginPath)
}

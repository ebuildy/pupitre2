import type { Auth } from '@pupitre/api/auth'
import { inferAdditionalFields, usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Same origin: /api/auth is proxied to the API.
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
  plugins: [usernameClient(), inferAdditionalFields<Auth>()],
})

export const { useSession, signIn, signOut } = authClient

/** Spec 023: the login field accepts a username or an e-mail. */
export function signInWithIdentifier(identifier: string, password: string) {
  return identifier.includes('@')
    ? signIn.email({ email: identifier, password })
    : signIn.username({ username: identifier, password })
}

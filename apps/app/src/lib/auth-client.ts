import { createAuthClient } from 'better-auth/react'

// Same origin: /api/auth is proxied to the API.
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
})

export const { useSession, signIn, signUp, signOut } = authClient

// Authentication UI shared by every frontend (learner app, admin app).
export { AccessDenied } from './AccessDenied.tsx'
export { authClient, signInWithIdentifier, signOutTo, useSession } from './auth-client.ts'
export { LoginPage } from './LoginPage.tsx'
export { APP_BASE_PATHS, useBasename, useGoTo } from './navigation.ts'
export { RequireAuth } from './RequireAuth.tsx'

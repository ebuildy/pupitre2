import { landingPath, ROLES, safeRedirectPath } from '@pupitre/shared'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { env } from '../env.ts'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { createRoute, createRouter, errors, json, jsonBody, params, PUBLIC } from '../lib/openapi.ts'
import { LdapNotConfiguredError, ldapAuthenticate, ldapProvider } from '../services/ldap.ts'
import {
  authorizationRequest,
  completeSsoLogin,
  demoLoginEnabled,
  fetchIdentity,
  findProvider,
  passwordGrantIdentity,
  readTransaction,
  SsoError,
  ssoProviders,
} from '../services/sso.ts'

const TX_COOKIE = 'pupitre_sso'
const secure = env.BETTER_AUTH_URL.startsWith('https://')
const fail = (code: string) => `/login?sso_error=${encodeURIComponent(code)}`

// Spec 009 for the LDAP form (better-auth's limiter only covers its own endpoints).
const attempts = new Map<string, number[]>()
function rateLimited(ip: string) {
  if (env.AUTH_RATE_LIMIT_REQUESTS === 0) return false
  const now = Date.now()
  const window = env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000
  // Spec 014: bounded, keys come from the client. Drop expired entries when it grows.
  if (attempts.size > 10_000) {
    for (const [key, times] of attempts) if (now - times[times.length - 1]! >= window) attempts.delete(key)
  }
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < window)
  recent.push(now)
  attempts.set(ip, recent)
  return recent.length > env.AUTH_RATE_LIMIT_REQUESTS
}

const tags = ['SSO']
const signedIn = json(z.object({ role: z.enum(ROLES) }), 'Signed in: the session cookie is set')
const loginFailed = 'Login failed: `?sso_error=<code>` on the login page'

const ldapLogin = createRoute({
  method: 'post',
  path: '/ldap/login',
  tags,
  security: PUBLIC,
  summary: 'Sign in with LDAP',
  description: 'Spec 030: LDAP / Active Directory, from the login form. Rate-limited per client IP (spec 009).',
  request: { body: jsonBody(z.object({ identifier: z.string().trim().min(1), password: z.string().min(1) })) },
  responses: { 200: signedIn, ...errors(400, 401, 403, 409, 429, 500) },
})

const listProviders = createRoute({
  method: 'get',
  path: '/providers',
  tags,
  security: PUBLIC,
  summary: 'Identity providers of the login page',
  responses: {
    200: json(
      z.object({
        providers: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(['oidc', 'github']), demoLogin: z.boolean() })),
      }),
    ),
  },
})

const demoLogin = createRoute({
  method: 'post',
  path: '/{provider}/demo-login',
  tags,
  security: PUBLIC,
  summary: 'One-click sign-in of the SSO demo',
  description: 'Spec 027, development only (`SSO_DEMO_PASSWORD_GRANT`; 404 otherwise): password grant on the provider.',
  request: {
    params: params('provider'),
    body: jsonBody(z.object({ username: z.string().trim().min(1), password: z.string().min(1) })),
  },
  responses: { 200: signedIn, ...errors(400, 401, 403, 404, 409, 429, 502) },
})

const authorize = createRoute({
  method: 'get',
  path: '/{provider}/authorize',
  tags,
  security: PUBLIC,
  summary: 'Start an SSO sign-in',
  description: 'Redirects to the identity provider. `redirect`: where to land after sign-in (a path of this site).',
  request: { params: params('provider'), query: z.object({ redirect: z.string().optional(), login_hint: z.string().optional() }) },
  responses: { 302: { description: `To the identity provider. ${loginFailed}` } },
})

const callback = createRoute({
  method: 'get',
  path: '/{provider}/callback',
  tags,
  security: PUBLIC,
  summary: 'SSO callback',
  description: 'Where the identity provider sends the browser back.',
  request: {
    params: params('provider'),
    query: z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }),
  },
  responses: { 302: { description: `Signed in: to the landing page. ${loginFailed}` } },
})

/** Specs 027–033, under /api/sso (better-auth owns /api/auth). */
export const ssoRoutes = createRouter()
  // Spec 030: LDAP / Active Directory, from the login form.
  .openapi(ldapLogin, async (c) => {
    const ip = (c.req.header(env.CLIENT_IP_HEADER) ?? '').split(',')[0]!.trim() || 'unknown'
    if (rateLimited(ip)) throw new HTTPException(429, { message: 'Too many requests' })
    const { identifier, password } = c.req.valid('json')
    try {
      const identity = await ldapAuthenticate(identifier, password)
      const { role, cookie } = await completeSsoLogin(ldapProvider(), identity)
      setCookie(c, cookie.name, cookie.value, { httpOnly: true, secure: cookie.attributes.secure ?? secure, sameSite: 'Lax', path: '/', maxAge: cookie.attributes.maxAge })
      return c.json({ role }, 200)
    } catch (err) {
      if (err instanceof LdapNotConfiguredError) throw new HTTPException(400, { message: 'LDAP not configured' })
      if (err instanceof SsoError) {
        const status = err.code === 'conflict' ? 409 : err.code === 'inactive' ? 403 : 401
        throw new HTTPException(status, { message: err.code === 'failed' ? 'Invalid email or password' : err.message })
      }
      console.error('ldap login failed', err)
      throw new HTTPException(500, { message: 'LDAP server call failed' })
    }
  })
  .openapi(listProviders, (c) =>
    c.json({ providers: ssoProviders().map((p) => ({ id: p.id, name: p.name, kind: p.kind, demoLogin: demoLoginEnabled(p) })) }, 200),
  )
  // Spec 027, SSO demo (development only, `SSO_DEMO_PASSWORD_GRANT`): the demo accounts' one-click sign-in.
  .openapi(demoLogin, async (c) => {
    if (!env.SSO_DEMO_PASSWORD_GRANT) throw new HTTPException(404, { message: 'Not found' })
    const ip = (c.req.header(env.CLIENT_IP_HEADER) ?? '').split(',')[0]!.trim() || 'unknown'
    if (rateLimited(ip)) throw new HTTPException(429, { message: 'Too many requests' })
    const { username, password } = c.req.valid('json')
    let identity
    try {
      identity = await passwordGrantIdentity(findProvider(c.req.param('provider')), username, password)
    } catch (err) {
      if (err instanceof SsoError && err.code === 'unknown_provider') throw new HTTPException(404, { message: 'Unknown provider' })
      if (err instanceof SsoError) throw new HTTPException(401, { message: 'Invalid email or password' })
      console.error('sso demo login failed', err)
      throw new HTTPException(502, { message: 'Identity provider unreachable' })
    }
    try {
      const { role, cookie } = await completeSsoLogin(findProvider(c.req.param('provider')), identity)
      setCookie(c, cookie.name, cookie.value, { httpOnly: true, secure: cookie.attributes.secure ?? secure, sameSite: 'Lax', path: '/', maxAge: cookie.attributes.maxAge })
      return c.json({ role }, 200)
    } catch (err) {
      if (err instanceof SsoError) throw new HTTPException(err.code === 'conflict' ? 409 : err.code === 'inactive' ? 403 : 401, { message: err.message })
      throw err
    }
  })
  .openapi(authorize, async (c) => {
    try {
      const provider = findProvider(c.req.param('provider'))
      const redirect = c.req.query('redirect')
      const { url, transaction } = await authorizationRequest(provider, {
        redirect: safeRedirectPath(redirect),
        loginHint: c.req.query('login_hint') || undefined,
      })
      setCookie(c, TX_COOKIE, transaction, { httpOnly: true, secure, sameSite: 'Lax', path: '/api/sso', maxAge: 600 })
      return c.redirect(url, 302)
    } catch (err) {
      console.error('sso authorize failed', err)
      return c.redirect(fail(err instanceof SsoError ? err.code : 'failed'), 302)
    }
  })
  .openapi(callback, async (c) => {
    const providerId = c.req.param('provider')
    const tx = getCookie(c, TX_COOKIE)
    deleteCookie(c, TX_COOKIE, { path: '/api/sso' })
    const error = c.req.query('error')
    if (error) return c.redirect(fail(error === 'access_denied' ? 'access_denied' : 'failed'), 302)
    try {
      const provider = findProvider(providerId)
      const transaction = await readTransaction(tx, c.req.query('state'), providerId)
      const code = c.req.query('code')
      if (!code) throw new SsoError('failed', 'missing code')
      const identity = await fetchIdentity(provider, code, transaction)
      const { role, cookie } = await completeSsoLogin(provider, identity)
      setCookie(c, cookie.name, cookie.value, {
        httpOnly: true,
        secure: cookie.attributes.secure ?? secure,
        sameSite: 'Lax',
        path: '/',
        maxAge: cookie.attributes.maxAge,
      })
      return c.redirect(landingPath(role, transaction.redirect), 302)
    } catch (err) {
      console.error('sso callback failed:', err instanceof Error ? err.message : err)
      return c.redirect(fail(err instanceof SsoError ? err.code : 'failed'), 302)
    }
  })

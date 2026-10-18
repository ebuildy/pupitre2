import { landingPath } from '@pupitre/shared'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { env } from '../env.ts'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { validate } from '../lib/validate.ts'
import { LdapNotConfiguredError, ldapAuthenticate, ldapProvider } from '../services/ldap.ts'
import type { AppEnv } from '../middleware/session.ts'
import {
  authorizationRequest,
  completeSsoLogin,
  fetchIdentity,
  findProvider,
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

/** Specs 027–033, under /api/sso (better-auth owns /api/auth). */
export const ssoRoutes = new Hono<AppEnv>()
  // Spec 030: LDAP / Active Directory, from the login form.
  .post('/ldap/login', validate('json', z.object({ identifier: z.string().trim().min(1), password: z.string().min(1) })), async (c) => {
    const ip = (c.req.header(env.CLIENT_IP_HEADER) ?? '').split(',')[0]!.trim() || 'unknown'
    if (rateLimited(ip)) throw new HTTPException(429, { message: 'Too many requests' })
    const { identifier, password } = c.req.valid('json')
    try {
      const identity = await ldapAuthenticate(identifier, password)
      const { role, cookie } = await completeSsoLogin(ldapProvider(), identity)
      setCookie(c, cookie.name, cookie.value, { httpOnly: true, secure: cookie.attributes.secure ?? secure, sameSite: 'Lax', path: '/', maxAge: cookie.attributes.maxAge })
      return c.json({ role })
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
  .get('/providers', (c) => c.json({ providers: ssoProviders().map(({ id, name, kind }) => ({ id, name, kind })) }))
  .get('/:provider/authorize', async (c) => {
    try {
      const provider = findProvider(c.req.param('provider'))
      const redirect = c.req.query('redirect')
      const { url, transaction } = await authorizationRequest(provider, {
        redirect: redirect && /^\/(?![/\\])/.test(redirect) ? redirect : null,
        loginHint: c.req.query('login_hint') || undefined,
      })
      setCookie(c, TX_COOKIE, transaction, { httpOnly: true, secure, sameSite: 'Lax', path: '/api/sso', maxAge: 600 })
      return c.redirect(url, 302)
    } catch (err) {
      console.error('sso authorize failed', err)
      return c.redirect(fail(err instanceof SsoError ? err.code : 'failed'), 302)
    }
  })
  .get('/:provider/callback', async (c) => {
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

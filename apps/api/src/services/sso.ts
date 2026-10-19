import { createHmac, randomBytes, createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { type Role, USERNAME_MAX } from '@pupitre/shared'
import { and, eq, or, sql } from 'drizzle-orm'
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, SignJWT } from 'jose'
import { parse as parseYaml } from 'yaml'
import { auth } from '../auth.ts'
import { db } from '../db/index.ts'
import { account, groupMembership, idpGroupMapping, user, userGroup } from '../db/schema/index.ts'
import { env } from '../env.ts'
import { addMember, joinDefaultGroup, removeMember } from './groups.ts'
import { getSettings } from './settings.ts'
import { httpFetch } from '../lib/http.ts'
import { sameName } from '../lib/sql.ts'

/** A sign-in provider: an OIDC issuer (GitLab, Google, Keycloak…) or GitHub (OAuth2 + its API). */
export type SsoProvider = {
  id: string
  name: string
  kind: 'oidc' | 'github'
  /** OIDC: discovery URL or issuer URL. */
  discoveryUrl: string
  /** Expected `iss` when it differs from the discovery document's (split-horizon, spec 028). */
  issuer: string | null
  clientId: string
  clientSecret: string
  scopes: string
  groupClaim: string
  /** Spec 033: authoritative admin groups (runtime OIDC provider only). */
  groupAdmins: string[]
  redirectBase: string
  browserBase: string | null
  /** GitHub: web and API origins (GitHub Enterprise, tests). */
  githubUrl: string
  githubApiUrl: string
}

export type SsoIdentity = {
  subject: string
  email: string
  name: string
  picture: string | null
  bio: string | null
  groups: string[]
}

export class SsoError extends Error {
  constructor(
    readonly code: 'access_denied' | 'state' | 'failed' | 'conflict' | 'inactive' | 'no_email' | 'unknown_provider',
    message?: string,
  ) {
    super(message ?? code)
  }
}

// ─── Providers ─────────────────────────────────────────────────────────────────

const DEFAULT_ISSUERS: Record<string, string> = { gitlab: 'https://gitlab.com', google: 'https://accounts.google.com' }

type FileProvider = {
  id: string
  name?: string
  type?: 'github' | 'gitlab' | 'google' | 'oidc'
  clientId?: string
  clientSecret?: string
  issuerUrl?: string
  scopes?: string
  groupClaim?: string
  githubUrl?: string
  githubApiUrl?: string
}

let fileProviders: SsoProvider[] | null = null

/** Spec 027: providers from `SSO_PROVIDERS_FILE`; secrets overridable by `SSO_<ID>_CLIENT_SECRET[_FILE]`. */
function loadFileProviders(): SsoProvider[] {
  if (fileProviders) return fileProviders
  fileProviders = []
  const file = env.SSO_PROVIDERS_FILE
  if (!file || !existsSync(file)) return fileProviders
  const doc = parseYaml(readFileSync(file, 'utf8')) as { providers?: FileProvider[] } | FileProvider[]
  for (const p of (Array.isArray(doc) ? doc : doc?.providers) ?? []) {
    if (!p?.id || !p.clientId) continue
    const key = `SSO_${p.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_CLIENT_SECRET`
    const secretFile = process.env[`${key}_FILE`]
    const secret = secretFile && existsSync(secretFile) ? readFileSync(secretFile, 'utf8').trim() : (process.env[key] ?? p.clientSecret ?? '')
    const type = p.type ?? (p.id === 'github' ? 'github' : 'oidc')
    fileProviders.push({
      id: p.id,
      name: p.name ?? p.id,
      kind: type === 'github' ? 'github' : 'oidc',
      discoveryUrl: p.issuerUrl ?? DEFAULT_ISSUERS[type] ?? '',
      issuer: null,
      clientId: p.clientId,
      clientSecret: secret,
      scopes: p.scopes ?? (type === 'github' ? 'user:email read:user' : 'openid email profile'),
      groupClaim: p.groupClaim ?? 'groups',
      groupAdmins: [],
      redirectBase: env.BETTER_AUTH_URL,
      browserBase: null,
      githubUrl: p.githubUrl ?? 'https://github.com',
      githubApiUrl: p.githubApiUrl ?? 'https://api.github.com',
    })
  }
  return fileProviders
}

/** Spec 028: the provider configured in the platform settings, when enabled and complete. */
function settingsProvider(): SsoProvider | null {
  const s = getSettings()
  if (!s.oidc_enabled || !s.oidc_provider_url || !s.oidc_client_id) return null
  return {
    id: 'oidc',
    name: s.oidc_name || 'SSO',
    kind: 'oidc',
    discoveryUrl: s.oidc_provider_url,
    issuer: s.oidc_issuer_url || null,
    clientId: s.oidc_client_id,
    clientSecret: s.oidc_client_secret,
    scopes: s.oidc_scopes || 'openid email profile',
    groupClaim: s.oidc_group_claim || 'groups',
    groupAdmins: s.oidc_group_admins,
    redirectBase: s.oidc_redirect_base || env.BETTER_AUTH_URL,
    browserBase: s.oidc_browser_base_url || null,
    githubUrl: '',
    githubApiUrl: '',
  }
}

export function ssoProviders(): SsoProvider[] {
  const runtime = settingsProvider()
  return [...(runtime ? [runtime] : []), ...loadFileProviders().filter((p) => p.id !== 'oidc')]
}

export function findProvider(id: string) {
  const found = ssoProviders().find((p) => p.id === id)
  if (!found) throw new SsoError('unknown_provider')
  return found
}

export const callbackUrl = (p: SsoProvider) => `${p.redirectBase.replace(/\/+$/, '')}/api/sso/${p.id}/callback`

// ─── OIDC discovery ────────────────────────────────────────────────────────────

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; userinfo_endpoint?: string; jwks_uri: string }
const discoveries = new Map<string, { at: number; doc: Discovery }>()
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

async function discover(p: SsoProvider): Promise<Discovery> {
  const url = p.discoveryUrl.includes('/.well-known/') ? p.discoveryUrl : `${p.discoveryUrl.replace(/\/+$/, '')}/.well-known/openid-configuration`
  const cached = discoveries.get(url)
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.doc
  const res = await httpFetch(url, { timeoutMs: 10_000 })
  if (!res.ok) throw new SsoError('failed', `OIDC discovery failed: HTTP ${res.status}`)
  const doc = (await res.json()) as Discovery
  discoveries.set(url, { at: Date.now(), doc })
  return doc
}

// ─── Authorization request ─────────────────────────────────────────────────────

const b64url = (buf: Buffer) => buf.toString('base64url')
const stateKey = () => new TextEncoder().encode(env.BETTER_AUTH_SECRET)

/**
 * Spec 027: the URL to send the browser to, and the signed transaction kept in a cookie (state, nonce, PKCE verifier,
 * where to go afterwards), valid 10 minutes.
 */
export async function authorizationRequest(p: SsoProvider, opts: { redirect: string | null; loginHint?: string }) {
  const state = b64url(randomBytes(24))
  const nonce = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const transaction = await new SignJWT({ p: p.id, s: state, n: nonce, v: verifier, r: opts.redirect })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(stateKey())
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: callbackUrl(p),
    scope: p.scopes,
    state,
  })
  let endpoint: string
  if (p.kind === 'github') {
    endpoint = `${p.githubUrl.replace(/\/+$/, '')}/login/oauth/authorize`
  } else {
    endpoint = (await discover(p)).authorization_endpoint
    params.set('nonce', nonce)
    params.set('code_challenge', challenge)
    params.set('code_challenge_method', 'S256')
    // Split-horizon: the API reaches the IdP on an internal host the browser cannot use.
    if (p.browserBase) endpoint = endpoint.replace(/^https?:\/\/[^/]+/, p.browserBase.replace(/\/+$/, ''))
  }
  if (opts.loginHint) params.set('login_hint', opts.loginHint)
  return { url: `${endpoint}?${params}`, transaction }
}

export async function readTransaction(token: string | undefined, state: string | undefined, providerId: string) {
  if (!token || !state) throw new SsoError('state')
  try {
    const { payload } = await jwtVerify(token, stateKey())
    if (payload.p !== providerId || payload.s !== state) throw new Error('mismatch')
    return { nonce: payload.n as string, verifier: payload.v as string, redirect: (payload.r as string | null) ?? null }
  } catch {
    throw new SsoError('state', 'Invalid or expired OAuth state')
  }
}

// ─── Code exchange and identity ────────────────────────────────────────────────

async function postForm(url: string, body: Record<string, string>) {
  const res = await httpFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || data.error) throw new SsoError('failed', `token exchange failed: ${String(data.error ?? res.status)}`)
  return data
}

function groupsOf(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.filter((g): g is string => typeof g === 'string')
  if (typeof claim === 'string') return claim.split(',').map((g) => g.trim()).filter(Boolean)
  return []
}

/** Spec 027 / 028: exchanges the code, verifies the ID token (or calls the GitHub API), returns who signed in. */
export async function fetchIdentity(p: SsoProvider, code: string, tx: { nonce: string; verifier: string }): Promise<SsoIdentity> {
  if (p.kind === 'github') {
    const tokens = await postForm(`${p.githubUrl.replace(/\/+$/, '')}/login/oauth/access_token`, {
      client_id: p.clientId,
      client_secret: p.clientSecret,
      code,
      redirect_uri: callbackUrl(p),
    })
    const headers = { Authorization: `Bearer ${String(tokens.access_token)}`, Accept: 'application/vnd.github+json' }
    const api = p.githubApiUrl.replace(/\/+$/, '')
    const profile = (await (await httpFetch(`${api}/user`, { headers })).json()) as Record<string, unknown>
    const emails = (await (await httpFetch(`${api}/user/emails`, { headers })).json()) as { email: string; primary: boolean; verified: boolean }[]
    const email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email
    if (!email) throw new SsoError('no_email', 'No verified email on the GitHub account')
    return {
      subject: String(profile.id),
      email,
      name: String(profile.name ?? profile.login ?? email),
      picture: (profile.avatar_url as string | undefined) ?? null,
      bio: (profile.bio as string | undefined) ?? null,
      groups: [],
    }
  }

  const doc = await discover(p)
  const tokens = await postForm(doc.token_endpoint, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(p),
    client_id: p.clientId,
    client_secret: p.clientSecret,
    code_verifier: tx.verifier,
  })
  return identityFromTokens(p, doc, tokens, tx.nonce)
}

/** Whether the login page may sign the SSO demo accounts in with this provider (dev only, spec 027). */
export const demoLoginEnabled = (p: SsoProvider) => env.SSO_DEMO_PASSWORD_GRANT && p.kind === 'oidc'

/**
 * Spec 027, SSO demo (development only): the resource owner password grant, so the demo buttons sign in through the
 * identity provider in one click. The ID token is verified like in the code flow, without a nonce (none is sent).
 */
export async function passwordGrantIdentity(p: SsoProvider, username: string, password: string): Promise<SsoIdentity> {
  if (!demoLoginEnabled(p)) throw new SsoError('unknown_provider')
  const doc = await discover(p)
  const tokens = await postForm(doc.token_endpoint, {
    grant_type: 'password',
    username,
    password,
    scope: p.scopes,
    client_id: p.clientId,
    client_secret: p.clientSecret,
  })
  return identityFromTokens(p, doc, tokens, null)
}

/** Verifies the ID token (JWKS, or HS256 with the client secret) and merges the UserInfo claims. */
async function identityFromTokens(p: SsoProvider, doc: Discovery, tokens: Record<string, unknown>, nonce: string | null): Promise<SsoIdentity> {
  const idToken = String(tokens.id_token ?? '')
  if (!idToken) throw new SsoError('failed', 'No ID token')
  const { alg } = decodeProtectedHeader(idToken)
  const options = { issuer: p.issuer ?? doc.issuer, audience: p.clientId }
  let claims: Record<string, unknown>
  try {
    if (alg?.startsWith('HS')) {
      claims = (await jwtVerify(idToken, new TextEncoder().encode(p.clientSecret), options)).payload
    } else {
      let keys = jwks.get(doc.jwks_uri)
      if (!keys) jwks.set(doc.jwks_uri, (keys = createRemoteJWKSet(new URL(doc.jwks_uri))))
      claims = (await jwtVerify(idToken, keys, options)).payload
    }
  } catch (err) {
    throw new SsoError('failed', `invalid ID token: ${(err as Error).message}`)
  }
  if (nonce !== null && claims.nonce !== nonce) throw new SsoError('failed', 'nonce mismatch')
  // UserInfo claims win over the ID token's (spec 028).
  if (doc.userinfo_endpoint && tokens.access_token) {
    const res = await httpFetch(doc.userinfo_endpoint, { headers: { Authorization: `Bearer ${String(tokens.access_token)}` } })
    if (res.ok) claims = { ...claims, ...((await res.json()) as Record<string, unknown>) }
  }
  const email = typeof claims.email === 'string' ? claims.email : ''
  if (!email) throw new SsoError('no_email', 'No email in OIDC token')
  return {
    subject: String(claims.sub),
    email,
    name: String(claims.name ?? claims.preferred_username ?? email),
    picture: (claims.picture as string | undefined) ?? null,
    bio: ((claims.about ?? claims.description ?? claims.bio) as string | undefined) ?? null,
    groups: groupsOf(claims[p.groupClaim]),
  }
}

// ─── Account provisioning and linking (spec 031) ───────────────────────────────

function deriveUsername(name: string) {
  const base =
    name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9_.]+/g, '_')
      .replace(/^[_.]+|[_.]+$/g, '')
      .slice(0, 32) || 'user'
  const taken = (u: string) => !!db.select({ id: user.id }).from(user).where(eq(user.username, u)).get()
  if (!taken(base)) return base
  for (;;) {
    const candidate = `${base.slice(0, USERNAME_MAX - 7)}_${randomBytes(3).toString('hex')}`
    if (!taken(candidate)) return candidate
  }
}

/** Known identity → that user; known e-mail without another login method → linked; else a new account. */
async function upsertUser(p: SsoProvider, identity: SsoIdentity) {
  const linked = db
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, p.id), eq(account.accountId, identity.subject)))
    .get()
  const refresh = { image: identity.picture ?? undefined, bio: identity.bio ?? undefined }
  if (linked) {
    if (refresh.image || refresh.bio) db.update(user).set(refresh).where(eq(user.id, linked.userId)).run()
    return linked.userId
  }
  const byEmail = db
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, identity.email.toLowerCase()))
    .get()
  const now = new Date()
  if (byEmail) {
    const other = db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, byEmail.id)).get()
    // Never take over an account that signs in another way (local password included).
    if (other && other.providerId !== p.id) {
      const method = other.providerId === 'credential' ? 'local' : other.providerId
      throw new SsoError('conflict', `an account with this email already exists with a different login method (${method})`)
    }
    db.insert(account).values({ id: crypto.randomUUID(), userId: byEmail.id, providerId: p.id, accountId: identity.subject, createdAt: now, updatedAt: now }).run()
    if (refresh.image || refresh.bio) db.update(user).set(refresh).where(eq(user.id, byEmail.id)).run()
    return byEmail.id
  }
  const ctx = await auth.$context
  const username = deriveUsername(identity.name)
  const created = await ctx.internalAdapter.createUser({
    email: identity.email.toLowerCase(),
    name: identity.name,
    username,
    displayUsername: username,
    emailVerified: true,
    image: identity.picture,
    bio: identity.bio,
    role: 'student',
    isActive: true,
  }, { method: 'sso-oidc', sso: { providerId: p.id } })
  db.insert(account).values({ id: crypto.randomUUID(), userId: created.id, providerId: p.id, accountId: identity.subject, createdAt: now, updatedAt: now }).run()
  joinDefaultGroup(created.id)
  return created.id
}

// ─── Groups and role (specs 032, 033, 134) ─────────────────────────────────────

/** The IdP's groups replace the user's IdP memberships; mappings give roles. Manual memberships are never touched. */
function syncGroups(p: SsoProvider, userId: string, groups: string[]) {
  const names = [...new Set(groups)]
  const current = db
    .select({ groupId: groupMembership.groupId, name: userGroup.name })
    .from(groupMembership)
    .innerJoin(userGroup, eq(userGroup.id, groupMembership.groupId))
    .where(and(eq(groupMembership.userId, userId), eq(groupMembership.origin, 'idp')))
    .all()
  const wanted = new Set(names.map((n) => n.toLowerCase()))
  for (const m of current) if (!wanted.has(m.name.toLowerCase())) removeMember(m.groupId, userId)

  const mappings = names.length
    ? db.select().from(idpGroupMapping).where(or(...names.map((n) => sameName(idpGroupMapping.groupName, n)))).all()
    : []
  const mappingOf = (name: string) => mappings.find((m) => m.groupName.toLowerCase() === name.toLowerCase())
  for (const name of names) {
    let group = db.select().from(userGroup).where(sameName(userGroup.name, name)).get()
    if (!group) group = db.insert(userGroup).values({ name, origin: p.id }).returning().get()!
    if (group.isDefault) continue
    const existing = db
      .select({ origin: groupMembership.origin })
      .from(groupMembership)
      .where(and(eq(groupMembership.groupId, group.id), eq(groupMembership.userId, userId)))
      .get()
    if (existing && existing.origin !== 'idp') continue
    addMember(group.id, userId, { role: mappingOf(name)?.membershipRole ?? 'member', origin: 'idp' })
  }

  const me = db.select({ role: user.role }).from(user).where(eq(user.id, userId)).get()!
  let role = me.role as Role
  if (p.groupAdmins.length) {
    // Spec 033: authoritative.
    const admins = new Set(p.groupAdmins.map((g) => g.toLowerCase()))
    role = names.some((n) => admins.has(n.toLowerCase())) ? 'admin' : 'student'
  } else {
    const mapped = names.map((n) => mappingOf(n)?.platformRole).filter((r): r is Role => !!r)
    if (mapped.includes('admin')) role = 'admin'
    else if (mapped.length && role !== 'admin') role = mapped.at(-1)!
  }
  if (role !== me.role) db.update(user).set({ role }).where(eq(user.id, userId)).run()
  return role
}

/** Specs 027–033: the account for this identity, synced, and a new session for it. */
export async function completeSsoLogin(p: SsoProvider, identity: SsoIdentity) {
  const userId = await upsertUser(p, identity)
  const found = db.select({ isActive: user.isActive }).from(user).where(eq(user.id, userId)).get()
  if (!found?.isActive) throw new SsoError('inactive')
  const role = syncGroups(p, userId, identity.groups)
  joinDefaultGroup(userId)
  const ctx = await auth.$context
  const session = await ctx.internalAdapter.createSession(userId)
  if (!session) throw new SsoError('failed', 'session not created')
  const signature = createHmac('sha256', ctx.secret).update(session.token).digest('base64')
  return { role, cookie: { name: ctx.authCookies.sessionToken.name, value: `${session.token}.${signature}`, attributes: ctx.authCookies.sessionToken.attributes } }
}

// ─── Deployment bootstrap (spec 029) ───────────────────────────────────────────

/** When OIDC_ENABLED, the OIDC_* variables overwrite the settings at startup (empty ones are skipped). */
export function bootstrapOidcSettings(update: (values: Record<string, unknown>) => void) {
  if (!env.OIDC_ENABLED) return false
  const secret =
    env.OIDC_CLIENT_SECRET_FILE && existsSync(env.OIDC_CLIENT_SECRET_FILE)
      ? readFileSync(env.OIDC_CLIENT_SECRET_FILE, 'utf8').trim()
      : env.OIDC_CLIENT_SECRET
  const values: Record<string, unknown> = {
    oidc_enabled: true,
    oidc_name: env.OIDC_NAME,
    oidc_provider_url: env.OIDC_PROVIDER_URL,
    oidc_issuer_url: env.OIDC_ISSUER_URL,
    oidc_client_id: env.OIDC_CLIENT_ID,
    oidc_client_secret: secret,
    oidc_scopes: env.OIDC_SCOPES,
    oidc_group_claim: env.OIDC_GROUP_CLAIM,
    oidc_group_admins: env.OIDC_GROUP_ADMINS?.split(',').map((g) => g.trim()).filter(Boolean),
    oidc_redirect_base: env.OIDC_REDIRECT_BASE,
    oidc_browser_base_url: env.OIDC_BROWSER_BASE_URL,
  }
  update(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== '')))
  return true
}

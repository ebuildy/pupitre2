// A tiny OpenID Connect provider (and GitHub OAuth stand-in) for the SSO tests (specs 027–033). Tests register who
// signs in with POST /__fake/users {hint, sub, email, name, groups, error?}; the API sends `login_hint=<hint>`.
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3104)
const issuer = `http://localhost:${port}`
const clients = { pupitre: 'e2e-secret', corp: 'corp-secret', gh: 'gh-secret' }
const users = new Map()
const codes = new Map()
const tokens = new Map()

const b64url = (v) => Buffer.from(v).toString('base64url')
function sign(claims, secret) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}
function redirect(res, location) {
  res.writeHead(302, { Location: location })
  res.end()
}
async function body(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw
}

createServer(async (req, res) => {
  const url = new URL(req.url, issuer)
  const path = url.pathname
  if (path === '/health') return send(res, 200, { ok: true })
  if (req.method === 'POST' && path === '/__fake/users') {
    const u = JSON.parse(await body(req))
    users.set(u.hint, u)
    return send(res, 200, { ok: true })
  }
  if (path === '/.well-known/openid-configuration') {
    return send(res, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
    })
  }
  if (path === '/authorize' || path === '/login/oauth/authorize') {
    const q = url.searchParams
    const user = users.get(q.get('login_hint') ?? '')
    const back = new URL(q.get('redirect_uri'))
    back.searchParams.set('state', q.get('state') ?? '')
    if (!user || user.error) {
      back.searchParams.set('error', user?.error ?? 'access_denied')
      return redirect(res, back.toString())
    }
    const code = randomBytes(12).toString('hex')
    codes.set(code, { user, nonce: q.get('nonce'), clientId: q.get('client_id'), challenge: q.get('code_challenge') })
    back.searchParams.set('code', code)
    return redirect(res, back.toString())
  }
  if (req.method === 'POST' && (path === '/token' || path === '/login/oauth/access_token')) {
    const form = new URLSearchParams(await body(req))
    const grant = codes.get(form.get('code'))
    codes.delete(form.get('code'))
    if (!grant || clients[grant.clientId] !== form.get('client_secret')) return send(res, 400, { error: 'invalid_grant' })
    if (grant.challenge) {
      const expected = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url')
      if (expected !== grant.challenge) return send(res, 400, { error: 'invalid_grant', error_description: 'PKCE' })
    }
    const access = randomBytes(12).toString('hex')
    tokens.set(access, grant.user)
    const now = Math.floor(Date.now() / 1000)
    const idToken = sign(
      { iss: issuer, aud: grant.clientId, sub: grant.user.sub, email: grant.user.email, name: grant.user.name, nonce: grant.nonce, groups: grant.user.groups ?? [], iat: now, exp: now + 300 },
      clients[grant.clientId],
    )
    return send(res, 200, { access_token: access, token_type: 'Bearer', id_token: idToken })
  }
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  const user = tokens.get(bearer)
  if (path === '/userinfo') return user ? send(res, 200, { sub: user.sub, email: user.email, picture: user.picture }) : send(res, 401, {})
  if (path === '/api/user') return user ? send(res, 200, { id: Number(user.sub), login: user.login ?? user.name, name: user.name, avatar_url: user.picture ?? null, bio: user.bio ?? null }) : send(res, 401, {})
  if (path === '/api/user/emails') return user ? send(res, 200, [{ email: user.email, primary: true, verified: true }]) : send(res, 401, {})
  send(res, 404, { error: 'not found' })
}).listen(port, () => console.log(`fake idp on ${port}`))

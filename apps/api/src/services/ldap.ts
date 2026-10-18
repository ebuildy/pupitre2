import { Client } from 'ldapts'
import { getSettings } from './settings.ts'
import { type SsoIdentity, SsoError, type SsoProvider } from './sso.ts'
import { env } from '../env.ts'

/** RFC 4515: values put in a search filter. */
export function escapeFilter(value: string) {
  return value.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

export class LdapNotConfiguredError extends Error {}

/** The provider used for group sync and account linking (spec 031). */
export const ldapProvider = (): SsoProvider => ({
  id: 'ldap',
  name: 'LDAP',
  kind: 'oidc',
  discoveryUrl: '',
  issuer: null,
  clientId: '',
  clientSecret: '',
  scopes: '',
  groupClaim: '',
  groupAdmins: [],
  redirectBase: env.BETTER_AUTH_URL,
  browserBase: null,
  githubUrl: '',
  githubApiUrl: '',
})

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined

/**
 * Spec 030: finds the user (service account bind when configured), binds as them with the password, reads the display
 * name and the groups. Bad credentials → `SsoError('failed')`.
 */
export async function ldapAuthenticate(identifier: string, password: string): Promise<SsoIdentity> {
  const s = getSettings()
  if (!s.ldap_enabled || !s.ldap_server_url || !s.ldap_user_base_dn) throw new LdapNotConfiguredError('LDAP not configured')
  const client = new Client({ url: s.ldap_server_url, timeout: 10_000, connectTimeout: 10_000 })
  try {
    if (s.ldap_bind_dn) await client.bind(s.ldap_bind_dn, s.ldap_bind_password)
    const filter = (s.ldap_user_filter || '(mail=%s)').split('%s').join(escapeFilter(identifier))
    const { searchEntries } = await client.search(s.ldap_user_base_dn, { scope: 'sub', filter, sizeLimit: 1 })
    const entry = searchEntries[0]
    if (!entry) throw new SsoError('failed', 'Invalid email or password')
    const userClient = new Client({ url: s.ldap_server_url, timeout: 10_000, connectTimeout: 10_000 })
    try {
      await userClient.bind(entry.dn, password)
    } catch {
      throw new SsoError('failed', 'Invalid email or password')
    } finally {
      await userClient.unbind().catch(() => {})
    }
    const mail = first(entry.mail) ?? (identifier.includes('@') ? identifier : '')
    if (!mail) throw new SsoError('no_email', 'No email on the LDAP entry')
    const name = first(entry.displayName) ?? first(entry.cn) ?? ([first(entry.givenName), first(entry.sn)].filter(Boolean).join(' ') || identifier)
    let groups: string[] = []
    if (s.ldap_group_base_dn) {
      const groupFilter = (s.ldap_group_filter || '(member=%s)').split('%s').join(escapeFilter(entry.dn))
      const res = await client.search(s.ldap_group_base_dn, { scope: 'sub', filter: groupFilter, attributes: ['cn'] })
      groups = res.searchEntries.map((g) => first(g.cn)).filter((g): g is string => !!g)
    }
    return { subject: entry.dn, email: mail, name, picture: null, bio: null, groups }
  } finally {
    await client.unbind().catch(() => {})
  }
}

// A small LDAP directory for the LDAP sign-in tests (spec 030), with an HTTP control port: tests add people with
// POST /__fake/people {uid, mail, cn, password, groups}. Service account: cn=reader,dc=pupitre,dc=test / reader-secret.
import { createServer as createHttpServer } from 'node:http'
import ldap from 'ldapjs'

const ldapPort = Number(process.env.LDAP_PORT ?? 3389)
const httpPort = Number(process.env.PORT ?? 3105)
const BASE = 'dc=pupitre,dc=test'
const READER = `cn=reader,${BASE}`
const people = new Map()
const groups = new Map()

function personEntry(p) {
  return { dn: `uid=${p.uid},ou=people,${BASE}`, attributes: { objectClass: ['inetOrgPerson'], uid: p.uid, mail: p.mail, cn: p.cn, displayName: p.cn } }
}

const server = ldap.createServer()
server.bind(BASE, (req, res, next) => {
  const dn = req.dn.toString().replace(/\s/g, '')
  const password = req.credentials
  if (dn === READER.replace(/\s/g, '') && password === 'reader-secret') return res.end()
  const person = [...people.values()].find((p) => personEntry(p).dn.replace(/\s/g, '') === dn)
  if (person && person.password === password) return res.end()
  return next(new ldap.InvalidCredentialsError())
})
server.search(BASE, (req, res) => {
  const base = req.dn.toString().replace(/\s/g, '')
  if (base.startsWith('ou=people')) {
    for (const p of people.values()) {
      const e = personEntry(p)
      if (req.filter.matches(e.attributes)) res.send(e)
    }
  } else if (base.startsWith('ou=groups')) {
    for (const [cn, members] of groups) {
      const e = { dn: `cn=${cn},ou=groups,${BASE}`, attributes: { objectClass: ['groupOfNames'], cn, member: [...members] } }
      if (req.filter.matches(e.attributes)) res.send(e)
    }
  }
  res.end()
})
server.listen(ldapPort, () => console.log(`fake ldap on ${ldapPort}`))

createHttpServer(async (req, res) => {
  if (req.url === '/health') return res.end('ok')
  if (req.method === 'POST' && req.url === '/__fake/people') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const p = JSON.parse(raw)
    people.set(p.uid, p)
    for (const g of p.groups ?? []) {
      if (!groups.has(g)) groups.set(g, new Set())
      groups.get(g).add(personEntry(p).dn)
    }
    return res.end('ok')
  }
  res.statusCode = 404
  res.end()
}).listen(httpPort)

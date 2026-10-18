// A tiny stand-in for the GitLab REST API used by lab step checks (spec 092). Tests describe a project with
// POST /__fake/projects; the API under test then reads it through /api/v4/… like a real GitLab.
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3103)
const byPath = new Map()
const byId = new Map()
let nextId = 1

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  if (req.method === 'POST' && url.pathname === '/__fake/projects') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const p = JSON.parse(raw)
    const existing = byPath.get(p.path)
    const project = { id: existing?.id ?? nextId++, defaultBranch: 'main', branches: [], mergeRequests: [], commits: {}, files: {}, ...p }
    byPath.set(p.path, project)
    byId.set(String(project.id), project)
    return send(res, 200, { id: project.id })
  }
  if (url.pathname === '/health') return send(res, 200, { ok: true })

  const parts = url.pathname.replace(/^\/api\/v4\/projects\//, '').split('/')
  if (!url.pathname.startsWith('/api/v4/projects/')) return send(res, 404, { message: 'not found' })
  const key = decodeURIComponent(parts[0])
  const project = byId.get(key) ?? byPath.get(key)
  if (!project) return send(res, 404, { message: '404 Project Not Found' })
  const rest = parts.slice(1).map(decodeURIComponent)

  if (rest.length === 0) return send(res, 200, { id: project.id, default_branch: project.defaultBranch })
  if (rest[0] === 'repository' && rest[1] === 'branches') {
    return send(res, 200, [project.defaultBranch, ...project.branches].map((name) => ({ name })))
  }
  if (rest[0] === 'repository' && rest[1] === 'commits') {
    const ref = url.searchParams.get('ref_name') ?? project.defaultBranch
    return send(res, 200, (project.commits[ref] ?? []).map((title) => ({ title, message: title })))
  }
  if (rest[0] === 'repository' && rest[1] === 'files') {
    const ref = url.searchParams.get('ref') ?? project.defaultBranch
    return (project.files[ref] ?? []).includes(rest[2]) ? send(res, 200, { file_path: rest[2] }) : send(res, 404, { message: '404 File Not Found' })
  }
  if (rest[0] === 'merge_requests') {
    const mrs = project.mergeRequests.map((m, i) => ({ iid: i + 1, ...m }))
    if (rest.length === 1) return send(res, 200, mrs.map(({ commits, pipeline, ...m }) => m))
    const mr = mrs.find((m) => String(m.iid) === rest[1])
    if (!mr) return send(res, 404, { message: 'not found' })
    if (rest[2] === 'commits') return send(res, 200, (mr.commits ?? []).map((title) => ({ title })))
    return send(res, 200, { ...mr, head_pipeline: mr.pipeline ? { status: mr.pipeline } : null })
  }
  send(res, 404, { message: 'not found' })
}).listen(port, () => console.log(`fake gitlab on ${port}`))

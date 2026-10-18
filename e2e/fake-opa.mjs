// A stand-in for an OPA server (spec 091), for the `server` policy engine, and the decision point of
// e2e/fake-opa-cli.mjs (the `cli` engine). It does not evaluate Rego: tests set the verdict for a learner's project
// (POST /__fake/answers {project, result}) and read what was evaluated (GET /__fake/calls?project=…).
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3106)
const policies = new Map() // package path → policy text
const answers = new Map() // project path → result
const calls = new Map() // project path → [{engine, policy, input}]

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw
}

function decide(engine, policy, input) {
  const project = input?.project?.pathWithNamespace ?? ''
  calls.set(project, [...(calls.get(project) ?? []), { engine, policy, input }])
  return answers.get(project) ?? { allow: false, violations: ['fake opa: no answer for this project'] }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  if (url.pathname === '/health') return send(res, 200, {})
  if (req.method === 'POST' && url.pathname === '/__fake/answers') {
    const { project, result } = JSON.parse(await body(req))
    answers.set(project, result)
    return send(res, 200, {})
  }
  if (req.method === 'GET' && url.pathname === '/__fake/calls') return send(res, 200, calls.get(url.searchParams.get('project')) ?? [])
  if (req.method === 'POST' && url.pathname === '/__fake/eval') {
    const { policy, input } = JSON.parse(await body(req))
    return send(res, 200, { result: decide('cli', policy, input) })
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/v1/policies/')) {
    const text = await body(req)
    const pkg = /^\s*package\s+([\w.]+)/m.exec(text)?.[1]
    if (!pkg) return send(res, 400, { code: 'invalid_parameter', message: 'error(s) occurred while compiling module(s)' })
    policies.set(pkg.replace(/\./g, '/'), text)
    return send(res, 200, {})
  }
  if (req.method === 'POST' && url.pathname.startsWith('/v1/data/')) {
    const policy = policies.get(url.pathname.slice('/v1/data/'.length))
    // Like OPA: an unknown document is an empty result, not an error.
    if (!policy) return send(res, 200, {})
    const { input } = JSON.parse(await body(req))
    return send(res, 200, { result: decide('server', policy, input) })
  }
  send(res, 404, { code: 'resource_not_found', message: 'not found' })
}).listen(port, () => console.log(`fake opa on ${port}`))

#!/usr/bin/env node
// A stand-in for the `opa` binary (spec 091, `cli` policy engine): `opa capabilities --current` and
// `opa eval --format json --capabilities f --data policy.rego --input input.json data.checker.lab`. The verdict comes
// from e2e/fake-opa.mjs (FAKE_OPA_URL).
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const option = (name) => args[args.indexOf(name) + 1]

if (args[0] === 'capabilities') {
  console.log(JSON.stringify({ builtins: [{ name: 'count' }, { name: 'contains' }, { name: 'http.send' }, { name: 'net.lookup_ip_addr' }, { name: 'opa.runtime' }] }))
  process.exit(0)
}
if (args[0] !== 'eval') {
  console.error(`unsupported command ${args[0]}`)
  process.exit(2)
}
const caps = JSON.parse(readFileSync(option('--capabilities'), 'utf8'))
if (caps.builtins.some((b) => b.name.startsWith('http.') || b.name.startsWith('net.') || b.name === 'opa.runtime')) {
  console.log(JSON.stringify({ errors: [{ message: 'network builtins must be disabled' }] }))
  process.exit(1)
}
if (args.at(-1) !== 'data.checker.lab') {
  console.log(JSON.stringify({ errors: [{ message: `unexpected query ${args.at(-1)}` }] }))
  process.exit(1)
}
const policy = readFileSync(option('--data'), 'utf8')
const input = JSON.parse(readFileSync(option('--input'), 'utf8'))
const res = await fetch(`${process.env.FAKE_OPA_URL}/__fake/eval`, { method: 'POST', body: JSON.stringify({ policy, input }) })
const { result } = await res.json()
console.log(JSON.stringify({ result: [{ expressions: [{ value: result, text: 'data.checker.lab' }] }] }))

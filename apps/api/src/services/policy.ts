import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { promisify } from 'node:util'
import { type LabCheckResult, type LabConfig, type LabStep, POLICY_CHECK_TYPE, type PolicyEngineKind } from '@pupitre/shared'
import { parse } from 'yaml'
import { z } from 'zod'
import { contentLoader } from '../content/loader.ts'
import { env } from '../env.ts'
import { httpFetch } from '../lib/http.ts'
import { gitlabClient, type MergeRequest, type Project } from './labs.ts'
import type { Module } from './learning.ts'
import { getSettings } from './settings.ts'

/** Spec 091: the policy package; its `allow` and `violations` rules give the verdict. */
const PACKAGE = 'checker.lab'
const MAX_INPUT_BYTES = 5 * 1024 * 1024

/** Evaluates a Rego policy (`package checker.lab`) against an input document. */
export interface PolicyEngine {
  evaluate(policy: string, input: unknown): Promise<LabCheckResult>
}

/** The policy cannot be evaluated (engine unreachable, invalid policy…): an error, not a learner's failure. */
export class PolicyEngineError extends Error {}

function verdict(value: unknown): LabCheckResult {
  if (!value || typeof value !== 'object') return { allow: false, violations: [] }
  const v = value as { allow?: unknown; violations?: unknown }
  return {
    allow: v.allow === true,
    violations: Array.isArray(v.violations) ? v.violations.filter((x): x is string => typeof x === 'string') : [],
  }
}

function requirePackage(policy: string) {
  const declared = /^\s*package\s+([\w.]+)/m.exec(policy)?.[1]
  if (declared !== PACKAGE) throw new PolicyEngineError(`The policy must declare "package ${PACKAGE}"`)
}

/**
 * An OPA server (REST API). Each policy is uploaded once under its own package, renamed from `checker.lab` to a name
 * derived from its hash, so policies of different labs never mix. Run the server with a capabilities file that
 * excludes `http.send`, `net.*` and `opa.runtime` (see the spec).
 */
export class OpaServerEngine implements PolicyEngine {
  /** Hashes already uploaded (bounded, spec 014). */
  private readonly uploaded = new Set<string>()

  constructor(private readonly url: string) {}

  async evaluate(policy: string, input: unknown): Promise<LabCheckResult> {
    requirePackage(policy)
    const id = `p${createHash('sha256').update(policy).digest('hex').slice(0, 24)}`
    const base = this.url.replace(/\/+$/, '')
    if (!this.uploaded.has(id)) {
      const renamed = policy.replace(/^(\s*package\s+)checker\.lab\b/m, `$1pupitre.labs.${id}`)
      const res = await this.call(`${base}/v1/policies/pupitre-${id}`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: renamed })
      if (!res.ok) throw new PolicyEngineError(`OPA refused the policy: ${await message(res)}`)
      if (this.uploaded.size >= 500) this.uploaded.clear()
      this.uploaded.add(id)
    }
    const res = await this.call(`${base}/v1/data/pupitre/labs/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    })
    if (!res.ok) throw new PolicyEngineError(`OPA evaluation failed: ${await message(res)}`)
    return verdict(((await res.json()) as { result?: unknown }).result)
  }

  private async call(url: string, init: RequestInit) {
    try {
      return await httpFetch(url, { ...init, timeoutMs: 10_000 })
    } catch (err) {
      throw new PolicyEngineError(`OPA server unreachable: ${(err as Error).message}`)
    }
  }
}

async function message(res: Response) {
  const text = await res.text()
  try {
    return (JSON.parse(text) as { message?: string }).message ?? text
  } catch {
    return text
  }
}

const run = promisify(execFile)

/**
 * The `opa` binary (`opa eval`), with the network builtins (`http.send`, `net.*`) and `opa.runtime` removed from its
 * capabilities, as the original checker did.
 */
export class OpaCliEngine implements PolicyEngine {
  private capabilities: Promise<string> | null = null

  constructor(private readonly bin: string) {}

  async evaluate(policy: string, input: unknown): Promise<LabCheckResult> {
    requirePackage(policy)
    const dir = await mkdtemp(join(tmpdir(), 'pupitre-opa-'))
    try {
      const policyFile = join(dir, 'check.rego')
      const inputFile = join(dir, 'input.json')
      await writeFile(policyFile, policy)
      await writeFile(inputFile, JSON.stringify(input))
      const caps = await this.restrictedCapabilities()
      const out = await this.exec(['eval', '--format', 'json', '--capabilities', caps, '--data', policyFile, '--input', inputFile, `data.${PACKAGE}`])
      const parsed = JSON.parse(out) as { result?: { expressions?: { value?: unknown }[] }[]; errors?: { message?: string }[] }
      if (parsed.errors?.length) throw new PolicyEngineError(`OPA evaluation failed: ${parsed.errors[0]?.message ?? 'error'}`)
      return verdict(parsed.result?.[0]?.expressions?.[0]?.value)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  /** `opa capabilities --current` without the network builtins, written once to a temporary file. */
  private restrictedCapabilities() {
    this.capabilities ??= (async () => {
      const current = JSON.parse(await this.exec(['capabilities', '--current'])) as { builtins?: { name: string }[] }
      current.builtins = (current.builtins ?? []).filter((b) => !b.name.startsWith('http.') && !b.name.startsWith('net.') && b.name !== 'opa.runtime')
      const file = join(await mkdtemp(join(tmpdir(), 'pupitre-opa-caps-')), 'capabilities.json')
      await writeFile(file, JSON.stringify(current))
      return file
    })().catch((err) => {
      this.capabilities = null
      throw err
    })
    return this.capabilities
  }

  private async exec(args: string[]) {
    try {
      const { stdout } = await run(this.bin, args, { timeout: 15_000, maxBuffer: 10 * 1024 * 1024 })
      return stdout
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message: string }
      // `opa eval` prints its errors as JSON on stdout with a non-zero exit code.
      if (e.stdout?.trim().startsWith('{')) return e.stdout
      throw new PolicyEngineError(`opa failed: ${e.stderr?.trim() || e.message}`)
    }
  }
}

let cached: { key: string; engine: PolicyEngine } | null = null

/** The engine chosen in the settings, or null (`none`). */
export function policyEngine(): PolicyEngine | null {
  const s = getSettings()
  const kind = s.lab_policy_engine as PolicyEngineKind
  const key = `${kind}|${s.opa_url}|${env.OPA_BIN}`
  if (cached?.key === key) return cached.engine
  let engine: PolicyEngine | null = null
  if (kind === 'server' && s.opa_url) engine = new OpaServerEngine(s.opa_url)
  if (kind === 'cli') engine = new OpaCliEngine(env.OPA_BIN)
  cached = engine ? { key, engine } : null
  return engine
}

// ─── Input: the learner's GitLab project ───────────────────────────────────────

/** The policy input, as documented for course authors (field names cannot change). */
export type GitLabState = {
  project: { id: string; name: string; pathWithNamespace: string; defaultBranch: string } | null
  mergedMrCount: number
  openMrs: { iid: number; title: string; sourceBranch: string; pipelineStatus: string; commits: { message: string }[] }[]
  files: Record<string, string>
}

export async function gitlabState(project: string, files: string[]): Promise<GitLabState> {
  const gl = gitlabClient()
  if (!gl) throw new PolicyEngineError('GitLab is not configured')
  const p = await gl.get<Project>(`/projects/${encodeURIComponent(project)}`)
  if (!p) return { project: null, mergedMrCount: 0, openMrs: [], files: {} }
  const open = (await gl.get<MergeRequest[]>(`/projects/${p.id}/merge_requests?state=opened&per_page=100`)) ?? []
  const merged = (await gl.get<unknown[]>(`/projects/${p.id}/merge_requests?state=merged&per_page=100`)) ?? []
  const openMrs = await Promise.all(
    open.map(async (mr) => {
      const [detail, commits] = await Promise.all([
        gl.get<MergeRequest>(`/projects/${p.id}/merge_requests/${mr.iid}`),
        gl.get<{ title: string; message?: string }[]>(`/projects/${p.id}/merge_requests/${mr.iid}/commits`),
      ])
      return {
        iid: mr.iid,
        title: mr.title,
        sourceBranch: mr.source_branch,
        pipelineStatus: detail?.head_pipeline?.status ?? '',
        commits: (commits ?? []).map((c) => ({ message: c.message ?? c.title })),
      }
    }),
  )
  const contents: Record<string, string> = {}
  for (const file of files) {
    const text = await gl.text(`/projects/${p.id}/repository/files/${encodeURIComponent(file)}/raw?ref=${encodeURIComponent(p.default_branch)}`)
    if (text !== null) contents[file] = text
  }
  return {
    project: { id: String(p.id), name: p.name ?? '', pathWithNamespace: p.path_with_namespace ?? project, defaultBranch: p.default_branch },
    mergedMrCount: merged.length,
    openMrs,
    files: contents,
  }
}

// ─── Policies and check.yaml, read from the lab's repository ───────────────────

/** Resolves `path` next to the module's content file; it may not leave the repository. */
function siblingSource(m: Module, path: string) {
  if (!m.sourceRepo || !m.sourcePath) throw new PolicyEngineError('Lab module has no git content configured')
  const resolved = posix.normalize(posix.join(posix.dirname(m.sourcePath), path))
  if (resolved.startsWith('..') || posix.isAbsolute(resolved)) throw new PolicyEngineError('Invalid policy path')
  return { repo: m.sourceRepo, ref: m.sourceRef ?? 'main', path: resolved }
}

const policyParamsSchema = z.object({
  project: z.string().trim().min(1),
  files: z.array(z.string().trim().min(1)).max(20).default([]),
  policy: z.string().trim().min(1),
})

/** Runs an `opa_policy` step for one learner (parameters already have their username). */
export async function policyCheck(m: Module, params: Record<string, unknown>): Promise<LabCheckResult> {
  const parsed = policyParamsSchema.safeParse(params)
  if (!parsed.success) return { allow: false, violations: ['Paramètres de la politique invalides (project, files, policy)'] }
  const engine = policyEngine()
  if (!engine) return { allow: false, violations: ['Moteur de politiques non configuré'] }
  const { project, files, policy } = parsed.data
  const source = await contentLoader.read(siblingSource(m, policy))
  const state = await gitlabState(project, files)
  if (!state.project) return { allow: false, violations: [`Projet introuvable : ${project}`] }
  if (JSON.stringify(state).length > MAX_INPUT_BYTES) throw new PolicyEngineError('Policy input too large')
  return engine.evaluate(source, state)
}

const checkYamlSchema = z.object({
  provider: z.literal('gitlab').default('gitlab'),
  project: z.string().trim().min(1),
  files: z.array(z.string()).default([]),
  policy: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200).optional(),
})

/**
 * The lab as checked: its configured steps, or, for a GitLab lab without steps whose content comes from git, the
 * single policy step described by `check.yaml` next to the content (the original's format).
 */
export async function effectiveLab(m: Module): Promise<LabConfig | null> {
  const config = m.type === 'lab' ? m.lab : null
  if (!config || config.steps.length > 0 || config.provider !== 'gitlab' || !m.sourceRepo || !m.sourcePath) return config
  let raw: unknown
  try {
    raw = parse(await contentLoader.read(siblingSource(m, 'check.yaml')))
  } catch {
    return config
  }
  const yaml = checkYamlSchema.safeParse(raw)
  if (!yaml.success) return config
  const step: LabStep = {
    title: yaml.data.title ?? 'Vérification du lab',
    checkType: POLICY_CHECK_TYPE,
    checkParams: { project: yaml.data.project, files: yaml.data.files, policy: yaml.data.policy },
  }
  return { ...config, steps: [step] }
}

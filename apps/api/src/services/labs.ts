import type { LabCheckResult, LabConfig, LabStep, LabView } from '@pupitre/shared'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { labCheck } from '../db/schema/index.ts'
import { env } from '../env.ts'
import { getSettings } from './settings.ts'
import { httpFetch } from '../lib/http.ts'

// ─── Templating ────────────────────────────────────────────────────────────────

/** `{{username}}` and the original's `{{ .Username }}`. */
export function substitute(value: string, username: string) {
  return value.replace(/\{\{\s*(\.Username|username)\s*\}\}/g, username)
}

function substituteParams(params: Record<string, unknown>, username: string) {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? substitute(v, username) : v]))
}

// ─── GitLab step checks (spec 092) ─────────────────────────────────────────────

const CONVENTIONAL = /^(feat|fix|chore|docs|style|refactor|test|perf|ci|build|revert)(\([^)]+\))?!?: .+/

export class GitLab {
  constructor(
    private readonly base: string,
    private readonly token: string | undefined,
  ) {}

  private request(path: string) {
    return httpFetch(`${this.base.replace(/\/+$/, '')}/api/v4${path}`, {
      headers: this.token ? { 'PRIVATE-TOKEN': this.token } : {},
    })
  }

  async get<T>(path: string): Promise<T | null> {
    const res = await this.request(path)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GitLab ${res.status}`)
    return (await res.json()) as T
  }

  /** A raw file, or null when it does not exist. */
  async text(path: string): Promise<string | null> {
    const res = await this.request(path)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GitLab ${res.status}`)
    return res.text()
  }
}

/** The configured GitLab instance (setting, else GITLAB_URL), or null. */
export function gitlabClient() {
  const base = getSettings().gitlab_url || env.GITLAB_URL
  return base ? new GitLab(base, env.GITLAB_TOKEN) : null
}

export type Project = { id: number; name?: string; path_with_namespace?: string; default_branch: string }
export type MergeRequest = { iid: number; title: string; source_branch: string; author?: { username: string }; head_pipeline?: { status: string } | null }

function matches(pattern: string | undefined, value: string) {
  if (!pattern) return true
  try {
    return new RegExp(pattern).test(value)
  } catch {
    return value.includes(pattern)
  }
}

/** Runs one GitLab check. Violation messages are learner-facing (French, as in the original). */
export async function gitlabCheck(checkType: string, params: Record<string, unknown>, username: string): Promise<LabCheckResult> {
  const gl = gitlabClient()
  if (!gl) return { allow: false, violations: ['Instance GitLab non configurée'] }
  const project = typeof params.project === 'string' ? params.project : ''
  if (!project) return { allow: false, violations: ['Paramètre « project » manquant'] }
  const p = await gl.get<Project>(`/projects/${encodeURIComponent(project)}`)
  if (!p) return { allow: false, violations: [`Projet introuvable : ${project}`] }
  const pattern = typeof params.pattern === 'string' ? params.pattern : undefined
  const branch = typeof params.branch === 'string' ? params.branch : undefined
  const fail = (message: string): LabCheckResult => ({ allow: false, violations: [message] })
  const ok: LabCheckResult = { allow: true, violations: [] }

  const openMrs = async () => {
    const mrs = (await gl.get<MergeRequest[]>(`/projects/${p.id}/merge_requests?state=opened&per_page=100`)) ?? []
    return mrs.filter((m) => matches(pattern, m.source_branch))
  }
  const branchCommits = async (ref: string) =>
    (await gl.get<{ title: string; message: string }[]>(`/projects/${p.id}/repository/commits?ref_name=${encodeURIComponent(ref)}&per_page=100`)) ?? []
  const targetBranch = async () => {
    if (branch) return branch
    const branches = (await gl.get<{ name: string }[]>(`/projects/${p.id}/repository/branches?per_page=100`)) ?? []
    return branches.find((b) => b.name !== p.default_branch && matches(pattern, b.name))?.name ?? null
  }

  switch (checkType) {
    case 'gitlab_branch': {
      const branches = (await gl.get<{ name: string }[]>(`/projects/${p.id}/repository/branches?per_page=100`)) ?? []
      return branches.some((b) => b.name !== p.default_branch && matches(pattern, b.name))
        ? ok
        : fail(pattern ? `Aucune branche ne correspond à « ${pattern} »` : 'Aucune branche créée')
    }
    case 'gitlab_mr_open':
      return (await openMrs()).length > 0 ? ok : fail('Aucune merge request ouverte')
    case 'gitlab_conventional_commit': {
      for (const mr of await openMrs()) {
        if (mr.author && mr.author.username !== username) continue
        const commits = (await gl.get<{ title: string }[]>(`/projects/${p.id}/merge_requests/${mr.iid}/commits`)) ?? []
        if (commits.some((c) => CONVENTIONAL.test(c.title))) return ok
      }
      return fail('Aucun commit au format Conventional Commits (ex. « feat: … ») dans une merge request ouverte')
    }
    case 'gitlab_pipeline_passed': {
      const mrs = await openMrs()
      if (mrs.length === 0) return fail('Aucune merge request ouverte')
      for (const mr of mrs) {
        const detail = await gl.get<MergeRequest>(`/projects/${p.id}/merge_requests/${mr.iid}`)
        if (detail?.head_pipeline?.status === 'success') return ok
      }
      return fail('Le pipeline de la merge request n’a pas réussi')
    }
    case 'gitlab_commit_on_branch': {
      const ref = await targetBranch()
      if (!ref) return fail('Branche introuvable')
      return (await branchCommits(ref)).length > 0 ? ok : fail(`Aucun commit sur la branche ${ref}`)
    }
    case 'gitlab_conventional_commit_on_branch': {
      const ref = await targetBranch()
      if (!ref) return fail('Branche introuvable')
      return (await branchCommits(ref)).some((c) => CONVENTIONAL.test(c.title))
        ? ok
        : fail(`Aucun commit au format Conventional Commits sur la branche ${ref}`)
    }
    case 'gitlab_file_on_branch': {
      const file = typeof params.file === 'string' ? params.file : ''
      if (!file) return fail('Paramètre « file » manquant')
      const ref = branch ?? (await targetBranch()) ?? p.default_branch
      const found = await gl.get<unknown>(`/projects/${p.id}/repository/files/${encodeURIComponent(file)}?ref=${encodeURIComponent(ref)}`)
      return found ? ok : fail(`Fichier ${file} absent de la branche ${ref}`)
    }
    default:
      return fail(`Type de vérification inconnu : ${checkType}`)
  }
}

/** A step of a lab, for one learner (parameters with their username). */
export function resolvedStep(step: LabStep, username: string): LabStep {
  return { ...step, checkParams: substituteParams(step.checkParams, username) }
}

// ─── History (spec 094) and state ──────────────────────────────────────────────

export function recordCheck(input: {
  userId: string
  userEmail: string
  moduleId: string
  stepIndex: number | null
  stepTitle: string | null
  result: LabCheckResult
  verified: boolean
}) {
  db.insert(labCheck)
    .values({ ...input, allow: input.result.allow, violations: input.result.violations })
    .run()
}

/** A lab for one learner: each step with its latest check; a step is passed once a check allowed it. */
export function labView(config: LabConfig, moduleId: string, userId: string, username: string): LabView {
  const checks = db
    .select()
    .from(labCheck)
    .where(and(eq(labCheck.userId, userId), eq(labCheck.moduleId, moduleId)))
    .orderBy(desc(labCheck.checkedAt))
    .all()
  return {
    labUrl: config.labUrl ? substitute(config.labUrl, username) : null,
    provider: config.provider,
    steps: config.steps.map((step, index) => {
      const mine = checks.filter((c) => c.stepIndex === index)
      const last = mine[0]
      return {
        index,
        title: step.title,
        checkType: step.checkType,
        checkParams: substituteParams(step.checkParams, username),
        passed: mine.some((c) => c.allow),
        lastCheck: last ? { allow: last.allow, violations: last.violations, checkedAt: last.checkedAt.toISOString() } : null,
      }
    }),
  }
}

// ─── Step markers ──────────────────────────────────────────────────────────────

const MARKER = /^\s*<!--\s*check:(\d+)\s*-->\s*$/

/** `<!-- check:N -->` lines become placeholders (N is 1-based, as written by authors). */
export function markStepPlaceholders(markdown: string) {
  return markdown
    .split('\n')
    .map((line) => {
      const m = MARKER.exec(line)
      return m ? `\nPUPITRESTEP${Number(m[1]) - 1}PUPITRE\n` : line
    })
    .join('\n')
}

/** After rendering: placeholders become `<div data-lab-step="i">`; steps without a marker are appended at the end. */
export function placeSteps(html: string, stepCount: number) {
  const placed = new Set<number>()
  let out = html.replace(/<p>PUPITRESTEP(\d+)PUPITRE<\/p>/g, (_, i: string) => {
    const n = Number(i)
    if (n < 0 || n >= stepCount || placed.has(n)) return ''
    placed.add(n)
    return `<div data-lab-step="${n}"></div>`
  })
  for (let i = 0; i < stepCount; i++) if (!placed.has(i)) out += `<div data-lab-step="${i}"></div>`
  return out
}

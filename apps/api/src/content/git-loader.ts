import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { parse as parseYaml } from 'yaml'
import { type ContentLoader, type ContentSource, ContentUnavailableError } from './loader.ts'

const exec = promisify(execFile)

export type GitLoaderOptions = {
  cacheDir: string
  /** A clone is reused for this long, then cloned again on next use (spec 066, default 10 min). */
  ttlMs: number
  maxRepos: number
  credentialsPath?: string
  token?: string
}

type Credential = { pattern: RegExp; token: string }

/** `github.com/org/*`: scheme and `git@` ignored; `*` does not cross `/`. */
function globToRegExp(glob: string) {
  const escaped = normalize(glob)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${escaped}$`)
}

function normalize(url: string) {
  return url
    .replace(/^[a-z+]+:\/\//i, '')
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^[^@/]+@/, '')
    .replace(/\.git$/, '')
}

/**
 * Spec 064 / 066: module files read from git repositories. Shallow clones (`git clone --depth 1`) cached per URL and
 * ref; concurrent requests share one clone; a failed clone is not retried for 30 s; the oldest clones are evicted beyond
 * `maxRepos`; tokens never appear in errors.
 */
export class GitContentLoader implements ContentLoader {
  private readonly entries = new Map<string, { dir: string; clonedAt: number; lastUsed: number }>()
  private readonly inflight = new Map<string, Promise<string>>()
  private readonly failures = new Map<string, { at: number; error: Error }>()
  private readonly credentials: Credential[]

  constructor(private readonly options: GitLoaderOptions) {
    this.credentials = []
    if (options.credentialsPath && existsSync(options.credentialsPath)) {
      const doc = parseYaml(readFileSync(options.credentialsPath, 'utf8')) as { credentials?: { url: string; token: string }[] }
      for (const c of doc?.credentials ?? []) this.credentials.push({ pattern: globToRegExp(c.url), token: c.token })
    }
  }

  private key(repo: string, ref: string) {
    return createHash('sha256').update(`${repo}#${ref}`).digest('hex').slice(0, 16)
  }

  private tokenFor(repo: string) {
    const target = normalize(repo)
    return this.credentials.find((c) => c.pattern.test(target))?.token ?? this.options.token
  }

  private redact(text: string, token: string | undefined) {
    return token ? text.split(token).join('***') : text
  }

  private async clone(repo: string, ref: string, key: string) {
    const failed = this.failures.get(key)
    if (failed && Date.now() - failed.at < 30_000) throw failed.error
    const token = this.tokenFor(repo)
    // HTTP(S) authentication: basic `oauth2:<token>`.
    const url = token && /^https?:\/\//i.test(repo) ? repo.replace(/^(https?:\/\/)/i, `$1oauth2:${encodeURIComponent(token)}@`) : repo
    const dir = join(this.options.cacheDir, key)
    const tmp = `${dir}.${process.pid}.${Date.now()}.tmp`
    await mkdir(this.options.cacheDir, { recursive: true })
    try {
      await exec('git', ['clone', '--quiet', '--depth', '1', '--single-branch', '--branch', ref, '--', url, tmp], {
        timeout: 120_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      })
      await rm(dir, { recursive: true, force: true })
      await rename(tmp, dir)
    } catch (err) {
      await rm(tmp, { recursive: true, force: true })
      const error = new Error(this.redact(err instanceof Error ? err.message : String(err), token))
      this.failures.set(key, { at: Date.now(), error })
      throw error
    }
    this.failures.delete(key)
    const now = Date.now()
    this.entries.set(key, { dir, clonedAt: now, lastUsed: now })
    await this.evict()
    return dir
  }

  private async evict() {
    while (this.entries.size > this.options.maxRepos) {
      const [oldest] = [...this.entries].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
      if (!oldest) return
      this.entries.delete(oldest[0])
      await rm(oldest[1].dir, { recursive: true, force: true })
    }
  }

  /** The checkout of `repo@ref`, fresh within the TTL. */
  private async checkout(repo: string, ref: string) {
    const key = this.key(repo, ref)
    const entry = this.entries.get(key)
    if (entry && Date.now() - entry.clonedAt < this.options.ttlMs && existsSync(entry.dir)) {
      entry.lastUsed = Date.now()
      return entry.dir
    }
    let pending = this.inflight.get(key)
    if (!pending) {
      pending = this.clone(repo, ref, key).finally(() => this.inflight.delete(key))
      this.inflight.set(key, pending)
    }
    return pending
  }

  async read(source: ContentSource) {
    let dir: string
    try {
      dir = await this.checkout(source.repo, source.ref)
    } catch (err) {
      throw new ContentUnavailableError(source, err)
    }
    const file = resolve(dir, source.path)
    if (!file.startsWith(resolve(dir) + sep) || file.includes(`${sep}.git${sep}`)) {
      throw new ContentUnavailableError(source, new Error('path outside the repository'))
    }
    try {
      return await readFile(file, 'utf8')
    } catch (err) {
      throw new ContentUnavailableError(source, err)
    }
  }

  /** Spec 177: forgets the clones of these repositories (all when omitted). Returns how many were cleared. */
  async clear(repos?: { repo: string; ref: string }[]) {
    const keys = repos ? [...new Set(repos.map((r) => this.key(r.repo, r.ref)))] : [...this.entries.keys()]
    let cleared = 0
    for (const key of keys) {
      const entry = this.entries.get(key)
      this.failures.delete(key)
      if (!entry) continue
      this.entries.delete(key)
      await rm(entry.dir, { recursive: true, force: true })
      cleared++
    }
    if (!repos) await rm(this.options.cacheDir, { recursive: true, force: true })
    return cleared
  }
}

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../env.ts'
import { GitContentLoader } from './git-loader.ts'

/** A file in a repository (spec 064). */
export type ContentSource = { repo: string; ref: string; path: string }

/** The source could not be read (missing file, unreachable repository…). */
export class ContentUnavailableError extends Error {
  constructor(source: ContentSource, cause?: unknown) {
    super(`Content unavailable: ${source.repo}@${source.ref}:${source.path}`, { cause })
    this.name = 'ContentUnavailableError'
  }
}

/** Reads module bodies stored outside the database. */
export interface ContentLoader {
  read(source: ContentSource): Promise<string>
  /** Spec 177: drops cached copies of these repositories (all when omitted); returns how many were cleared. */
  clear(repos?: { repo: string; ref: string }[]): Promise<number>
}

function repoName(repo: string) {
  return basename(repo.replace(/\/+$/, '')).replace(/\.git$/, '')
}

/**
 * Development stand-in for the git loader: `repo` is mapped to a folder of `CONTENT_SAMPLES_DIR` named after the
 * repository (`https://git.example.com/org/docker-intro.git` → `docker-intro/`), `path` is read inside it, and `ref`
 * is ignored. Paths may not leave the repository folder.
 */
export class FakeContentLoader implements ContentLoader {
  constructor(private readonly baseDir: string) {}

  /** The repository is one of the samples. */
  has(repo: string) {
    const name = repoName(repo)
    return !!name && existsSync(resolve(this.baseDir, name))
  }

  async clear() {
    return 0
  }

  async read(source: ContentSource) {
    const name = repoName(source.repo)
    const repoDir = resolve(this.baseDir, name)
    const file = resolve(repoDir, source.path)
    if (!name || !repoDir.startsWith(this.baseDir + sep) || !file.startsWith(repoDir + sep)) {
      throw new ContentUnavailableError(source, new Error('path outside the repository'))
    }
    try {
      return await readFile(file, 'utf8')
    } catch (err) {
      throw new ContentUnavailableError(source, err)
    }
  }
}

const DEFAULT_SAMPLES_DIR = fileURLToPath(new URL('../../content-samples', import.meta.url))

/** `auto`: repositories found in the samples folder are read from it, the others from git. */
class AutoContentLoader implements ContentLoader {
  constructor(
    private readonly fake: FakeContentLoader,
    private readonly git: GitContentLoader,
  ) {}

  read(source: ContentSource) {
    return this.fake.has(source.repo) ? this.fake.read(source) : this.git.read(source)
  }

  clear(repos?: { repo: string; ref: string }[]) {
    return this.git.clear(repos?.filter((r) => !this.fake.has(r.repo)))
  }
}

function createLoader(): ContentLoader {
  const fake = () => new FakeContentLoader(resolve(env.CONTENT_SAMPLES_DIR ?? DEFAULT_SAMPLES_DIR))
  const git = () =>
    new GitContentLoader({
      cacheDir: resolve(env.GIT_CACHE_DIR),
      ttlMs: env.GIT_CACHE_TTL_MINUTES * 60_000,
      maxRepos: env.GIT_CACHE_MAX_REPOS,
      credentialsPath: env.GIT_CREDENTIALS_PATH,
      token: env.GIT_TOKEN,
    })
  switch (env.CONTENT_LOADER) {
    case 'fake':
      return fake()
    case 'git':
      return git()
    case 'auto':
      return new AutoContentLoader(fake(), git())
  }
}

export const contentLoader: ContentLoader = createLoader()

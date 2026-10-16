import { readFile } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../env.ts'

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
}

/**
 * Development stand-in for the git loader: `repo` is mapped to a folder of `CONTENT_SAMPLES_DIR` named after the
 * repository (`https://git.example.com/org/docker-intro.git` → `docker-intro/`), `path` is read inside it, and `ref`
 * is ignored. Paths may not leave the repository folder.
 */
export class FakeContentLoader implements ContentLoader {
  constructor(private readonly baseDir: string) {}

  async read(source: ContentSource) {
    const repoName = basename(source.repo.replace(/\/+$/, '')).replace(/\.git$/, '')
    const repoDir = resolve(this.baseDir, repoName)
    const file = resolve(repoDir, source.path)
    if (!repoName || !repoDir.startsWith(this.baseDir + sep) || !file.startsWith(repoDir + sep)) {
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

function createLoader(): ContentLoader {
  switch (env.CONTENT_LOADER) {
    case 'fake':
      return new FakeContentLoader(resolve(env.CONTENT_SAMPLES_DIR ?? DEFAULT_SAMPLES_DIR))
    case 'git':
      throw new Error('CONTENT_LOADER=git is not implemented yet: use CONTENT_LOADER=fake')
  }
}

export const contentLoader: ContentLoader = createLoader()

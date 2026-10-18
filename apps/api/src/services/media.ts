import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { rename, rm, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { mediaAsset } from '../db/schema/index.ts'
import { env } from '../env.ts'
import { httpFetch } from '../lib/http.ts'

export const uploadsDir = resolve(env.UPLOADS_DIR)
mkdirSync(uploadsDir, { recursive: true })

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/ogg': '.ogv',
}

/** Spec 062: an admin upload (images and videos only), stored under a random name. */
export async function saveUpload(file: File, uploadedBy: string) {
  const ext = EXTENSIONS[file.type]
  if (!ext) throw new HTTPException(400, { message: 'Only images and videos can be uploaded' })
  if (file.size > env.MEDIA_MAX_BYTES) throw new HTTPException(413, { message: 'File too large' })
  const filename = `${crypto.randomUUID()}${ext}`
  await pipeline(Readable.fromWeb(file.stream() as never), createWriteStream(join(uploadsDir, filename)))
  const [asset] = await db
    .insert(mediaAsset)
    .values({ filename, contentType: file.type, size: file.size, uploadedBy })
    .returning()
  return { id: asset!.id, url: `/uploads/${filename}`, contentType: file.type, size: file.size }
}

const inflight = new Map<string, Promise<string>>()

async function download(url: string) {
  const existing = db.select().from(mediaAsset).where(eq(mediaAsset.originalUrl, url)).get()
  if (existing && existsSync(join(uploadsDir, existing.filename))) return `/uploads/${existing.filename}`

  const res = await httpFetch(url, { timeoutMs: 5 * 60_000 })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
  const ext = extname(new URL(url).pathname).slice(0, 8) || EXTENSIONS[contentType] || ''
  const filename = `${createHash('sha256').update(url).digest('hex').slice(0, 16)}${ext}`
  const target = join(uploadsDir, filename)
  const tmp = `${target}.${process.pid}.part`
  let size = 0
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length
      done(size > env.MEDIA_MAX_BYTES ? new Error('File too large') : null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(res.body as never), limit, createWriteStream(tmp))
    // Written aside, then renamed: a half-downloaded file is never served.
    await rename(tmp, target)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
  db.insert(mediaAsset)
    .values({ filename, contentType: contentType || 'application/octet-stream', size: (await stat(target)).size, originalUrl: url })
    .onConflictDoNothing()
    .run()
  return `/uploads/${filename}`
}

/**
 * Spec 063: the local copy of a remote media file, downloaded on first use; concurrent requests share one download.
 * If it fails, the remote URL is used (the original returned a broken local path).
 */
export async function mediaUrlFor(url: string, replicate: boolean) {
  if (!replicate || !/^https?:\/\//i.test(url)) return url
  let pending = inflight.get(url)
  if (!pending) {
    pending = download(url).finally(() => inflight.delete(url))
    inflight.set(url, pending)
  }
  try {
    return await pending
  } catch (err) {
    console.error(`media replication failed for ${url}:`, err)
    return url
  }
}

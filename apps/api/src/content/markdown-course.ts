import { type CourseSpec, type MarkdownSplit, MARKDOWN_SPLITS, type ModuleInput, SLUG_PATTERN } from '@pupitre/shared'
import { HTTPException } from 'hono/http-exception'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/**
 * Spec 173: a course as one markdown document. Optional YAML frontmatter (course spec keys + `slug` + `split`); each
 * heading at the split level starts a module named by its text; a `<!--pupitre … -->` YAML directive right under the
 * heading sets the module's other attributes. Renderers ignore HTML comments, so the file stays readable markdown.
 */

const QUIZ_KEYS = ['title', 'description', 'passingScore', 'cooldown', 'maxAttemptsPerQuestion', 'lockOnMaxAttempts', 'questions'] as const

function bad(message: string): never {
  throw new HTTPException(400, { message })
}

/** "Qu'est-ce que Linux ?" → "qu-est-ce-que-linux": accents folded, `[a-z0-9-]`, dashes collapsed. */
export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const FENCE = /^\s*(```|~~~)/

/** Lines with whether each one is inside a fenced code block. */
function scanLines(text: string) {
  let fence: string | null = null
  return text.split('\n').map((line) => {
    const m = FENCE.exec(line)
    const inCode = fence !== null
    if (m) fence = fence === null ? m[1]! : fence === m[1] ? null : fence
    return { line, inCode: inCode || !!m }
  })
}

function headingLevel(line: string) {
  const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
  return m ? { level: m[1]!.length, text: m[2]!.trim() } : null
}

type ParsedDocument = {
  slug: string
  split: MarkdownSplit
  /** Frontmatter course keys, if the document has a frontmatter. */
  spec: Omit<CourseSpec, 'modules'> | null
  modules: ModuleInput[]
  warnings: string[]
}

export function parseMarkdownCourse(markdown: string, opts: { slug?: string; split?: MarkdownSplit } = {}): ParsedDocument {
  const warnings: string[] = []
  let text = markdown.replace(/\r\n/g, '\n')
  let front: Record<string, unknown> | null = null
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 3)
    if (end < 0) bad('frontmatter opened with --- is never closed')
    try {
      front = (parseYaml(text.slice(4, end)) ?? {}) as Record<string, unknown>
    } catch (err) {
      bad(`frontmatter: ${(err as Error).message}`)
    }
    text = text.slice(text.indexOf('\n', end + 1) + 1)
  }

  const split = (opts.split ?? (front?.split as MarkdownSplit | undefined) ?? 'none') as MarkdownSplit
  if (!MARKDOWN_SPLITS.includes(split)) bad(`Unknown split "${split}" (none, h1…h6)`)

  const lines = scanLines(text)
  const firstHeading = lines.find((l) => !l.inCode && headingLevel(l.line))
  const title = (front?.title as string | undefined) ?? (firstHeading ? headingLevel(firstHeading.line)!.text : undefined)
  const slug = opts.slug || (front?.slug as string | undefined) || (title ? slugify(title) : '')
  if (!slug) bad('Cannot derive a slug: set slug in the frontmatter or a title')
  if (!SLUG_PATTERN.test(slug)) bad('Invalid slug')

  // Sections: the split headings, with the text before the first one.
  const level = split === 'none' ? 0 : Number(split.slice(1))
  const sections: { name: string | null; lines: string[] }[] = [{ name: null, lines: [] }]
  for (const l of lines) {
    const h = !l.inCode && level ? headingLevel(l.line) : null
    if (h && h.level === level) sections.push({ name: h.text, lines: [] })
    else sections.at(-1)!.lines.push(l.line)
  }
  if (split === 'none' && lines.some((l) => !l.inCode && headingLevel(l.line))) {
    warnings.push('The document has headings but split is "none": it becomes a single module (set split: h2 to cut it).')
  }

  const used = new Set<string>()
  const modules: ModuleInput[] = []
  sections.forEach((section, index) => {
    const body = section.lines.join('\n')
    if (index === 0) {
      const trimmed = body.trim()
      if (!trimmed) return
      // Text that is only the document title is not a module.
      if (split !== 'none' && /^#{1,6}\s+.+$/.test(trimmed) && headingLevel(trimmed)?.text === title) return
    }
    const name = section.name ?? (split === 'none' ? (title ?? 'Introduction') : 'Introduction')
    modules.push(toModule(name, body, used, warnings))
  })
  if (modules.length === 0) warnings.push('No module produced: the document is empty.')

  const spec = front
    ? (Object.fromEntries(Object.entries(front).filter(([k]) => k !== 'slug' && k !== 'split')) as Omit<CourseSpec, 'modules'>)
    : null
  if (spec && !spec.title && title) spec.title = title
  return { slug, split, spec, modules, warnings }
}

function toModule(name: string, body: string, used: Set<string>, warnings: string[]): ModuleInput {
  let directive: Record<string, unknown> = {}
  let rest = body.replace(/^\n+/, '')
  if (rest.startsWith('<!--pupitre')) {
    const end = rest.indexOf('-->')
    if (end < 0) bad(`Module "${name}": <!--pupitre directive is never closed`)
    try {
      directive = (parseYaml(rest.slice('<!--pupitre'.length, end)) ?? {}) as Record<string, unknown>
    } catch (err) {
      bad(`Module "${name}": ${(err as Error).message}`)
    }
    rest = rest.slice(end + 3)
  }
  const markdown = rest.trim()

  let slug = (directive.slug as string | undefined) ?? (slugify(name) || 'module')
  for (let i = 2; used.has(slug); i++) slug = `${(directive.slug as string | undefined) ?? slugify(name)}-${i}`
  used.add(slug)

  const type = (directive.type as ModuleInput['type'] | undefined) ?? 'text'
  const quiz = Object.fromEntries(QUIZ_KEYS.filter((k) => k in directive).map((k) => [k, directive[k]]))
  let content: ModuleInput['content']
  if ((type === 'video' || type === 'image') && directive.url) {
    content = { kind: 'media', url: String(directive.url), replicate: directive.replicate === true }
  } else if (directive.src || directive.path) {
    content = { kind: 'source', repo: String(directive.src ?? ''), ref: String(directive.ref ?? 'main'), path: String(directive.path ?? '') }
  } else if (type === 'quiz' && quiz.questions) {
    content = { kind: 'inline', body: stringifyYaml(quiz) }
  } else {
    content = { kind: 'inline', body: markdown }
  }
  if (content.kind !== 'inline' || type === 'quiz') {
    if (markdown) warnings.push(`Module "${name}": its content comes from elsewhere, the markdown under its heading is ignored.`)
  }
  return {
    slug,
    name,
    type,
    hidden: directive.hidden === true,
    inline: directive.inline === true,
    skills: (directive.skills as string[] | undefined) ?? [],
    prerequisites: (directive.prerequisites as string[] | undefined) ?? [],
    content,
    // Spec 090: the original's keys (`labUrl`, `checkProvider`, `steps`).
    lab:
      type === 'lab'
        ? {
            labUrl: (directive.labUrl as string | undefined) ?? null,
            provider: (directive.checkProvider as 'gitlab' | 'local' | undefined) ?? 'gitlab',
            steps: (directive.steps as { title: string; checkType: string; checkParams?: Record<string, unknown> }[] | undefined) ?? [],
          }
        : null,
  }
}

/** Spec 176: heading level = requested, else the shallowest one no module body uses (so export → import is lossless). */
function exportLevel(modules: ModuleInput[], requested?: MarkdownSplit) {
  if (requested && requested !== 'none') return Number(requested.slice(1))
  const used = new Set<number>()
  for (const m of modules) {
    if (m.content.kind !== 'inline' || m.type === 'quiz') continue
    for (const l of scanLines(m.content.body)) {
      const h = !l.inCode ? headingLevel(l.line) : null
      if (h) used.add(h.level)
    }
  }
  for (let level = 1; level <= 6; level++) if (!used.has(level)) return level
  return 1
}

function sortedKeys(obj: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined && obj[k] !== null)
      .map((k) => [k, obj[k]]),
  )
}

/** Spec 176: the course as a markdown document (frontmatter + one section per module). */
export function exportMarkdownCourse(slug: string, spec: CourseSpec, requested?: MarkdownSplit) {
  const modules = spec.modules ?? []
  const level = exportLevel(modules, requested)
  const { modules: _, ...meta } = spec
  const front = sortedKeys({
    ...meta,
    prerequisites: meta.prerequisites?.length ? meta.prerequisites : undefined,
    slug,
    split: `h${level}`,
  })
  const parts = [`---\n${stringifyYaml(front).trimEnd()}\n---\n`]
  for (const m of modules) {
    const directive: Record<string, unknown> = {}
    if (m.type !== 'text') directive.type = m.type
    if (m.slug !== slugify(m.name)) directive.slug = m.slug
    if (m.hidden) directive.hidden = true
    if (m.inline) directive.inline = true
    if (m.skills?.length) directive.skills = m.skills
    if (m.prerequisites?.length) directive.prerequisites = m.prerequisites
    if (m.lab) {
      if (m.lab.labUrl) directive.labUrl = m.lab.labUrl
      directive.checkProvider = m.lab.provider ?? 'gitlab'
      if (m.lab.steps?.length) directive.steps = m.lab.steps
    }
    let body = ''
    if (m.content.kind === 'media') {
      directive.url = m.content.url
      if (m.content.replicate) directive.replicate = true
    } else if (m.content.kind === 'source') {
      directive.src = m.content.repo
      directive.ref = m.content.ref
      directive.path = m.content.path
    } else if (m.type === 'quiz') {
      Object.assign(directive, parseYaml(m.content.body) ?? {})
    } else {
      body = m.content.body.trim()
    }
    const heading = `${'#'.repeat(level)} ${m.name.replace(/\s*\n\s*/g, ' ')}`
    const block = Object.keys(directive).length ? `<!--pupitre\n${stringifyYaml(directive).trimEnd()}\n-->` : ''
    parts.push([heading, block, body].filter(Boolean).join('\n\n') + '\n')
  }
  return parts.join('\n')
}

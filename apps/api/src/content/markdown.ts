import type { TocEntry } from '@pupitre/shared'
import hljs from 'highlight.js/lib/common'
import markdownIt, { type StateCore } from 'markdown-it'
import sanitizeHtml from 'sanitize-html'

/**
 * Spec 058: markdown → sanitized HTML, on the server. Raw HTML in the source is not rendered (`html: false`) and the
 * output is sanitized anyway. Fenced code is highlighted (highlight.js), h2/h3 get ids for the table of contents,
 * and admonitions (spec 059) are expanded.
 */
const md = markdownIt({
  html: false,
  linkify: true,
  highlight(code, lang) {
    // Spec 060: diagrams are drawn in the browser; the source stays readable if that fails.
    if (lang === 'mermaid') return `<pre class="mermaid">${escapeHtml(code)}</pre>`
    const language = lang && hljs.getLanguage(lang) ? lang : null
    const highlighted = language ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escapeHtml(code)
    return `<pre><code class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre>`
  },
})

type RenderEnv = { headingCount: number; toc: TocEntry[] }

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

// Heading ids `heading-N` (numbered over the whole document) and the TOC from h2/h3 (spec 056).
md.core.ruler.push('heading_ids', (state: StateCore) => {
  const env = state.env as RenderEnv
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.type !== 'heading_open') continue
    const id = `heading-${++env.headingCount}`
    token.attrSet('id', id)
    const level = Number(token.tag.slice(1))
    if (level === 2 || level === 3) {
      const text = tokens[i + 1]?.children?.map((child) => child.content).join('') ?? ''
      env.toc.push({ id, text, level })
    }
  }
})

const ADMONITIONS = { note: '📝', tip: '💡', info: 'ℹ️', warning: '⚠️', danger: '🚨', caution: '⚡' } as const
type AdmonitionType = keyof typeof ADMONITIONS

const OPEN = /^:::(note|tip|info|warning|danger|caution)(?:\[(.*)\]|[ \t]+(.*))?[ \t]*$/
const CLOSE = /^:::[ \t]*$/
const FENCE = /^[ \t]*(```|~~~)/

type Chunk = { kind: 'markdown'; text: string } | { kind: 'admonition'; type: AdmonitionType; title: string; body: string }

/** Spec 059: splits out `:::type Title … :::` blocks, ignoring markers inside fenced code. Unclosed = left as is. */
function splitAdmonitions(source: string): Chunk[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const chunks: Chunk[] = []
  let markdown: string[] = []
  let fence: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fenceMatch = FENCE.exec(line)
    if (fence) {
      // Inside fenced code: nothing is an admonition marker.
      if (fenceMatch?.[1] === fence) fence = null
      markdown.push(line)
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!
      markdown.push(line)
      continue
    }
    const open = OPEN.exec(line)
    if (!open) {
      markdown.push(line)
      continue
    }
    // Find the closing marker, outside fenced code inside the body.
    let inner: string | null = null
    let end = -1
    for (let j = i + 1; j < lines.length; j++) {
      const f = FENCE.exec(lines[j]!)
      if (f) inner = inner === f[1] ? null : (inner ?? f[1]!)
      else if (!inner && CLOSE.test(lines[j]!)) {
        end = j
        break
      }
    }
    if (end < 0) {
      markdown.push(line)
      continue
    }
    const type = open[1] as AdmonitionType
    chunks.push({ kind: 'markdown', text: markdown.join('\n') })
    markdown = []
    chunks.push({
      kind: 'admonition',
      type,
      title: (open[2] ?? open[3] ?? '').trim() || type[0]!.toUpperCase() + type.slice(1),
      body: lines.slice(i + 1, end).join('\n'),
    })
    i = end
  }
  chunks.push({ kind: 'markdown', text: markdown.join('\n') })
  return chunks
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'del', 's'],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
    '*': ['id'],
    code: ['class'],
    pre: ['class'],
    span: ['class'],
    div: ['class'],
    p: ['class'],
    th: ['style'],
    td: ['style'],
  },
  allowedClasses: {
    code: ['hljs', /^language-/],
    pre: ['mermaid'],
    span: [/^hljs-/],
    div: ['admonition', /^admonition-/],
    p: ['admonition-title'],
  },
  allowedStyles: { '*': { 'text-align': [/^(left|right|center)$/] } },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // External links open in a new tab.
    a: (tagName, attribs) =>
      /^https?:\/\//.test(attribs.href ?? '')
        ? { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }
        : { tagName, attribs },
  },
}

/** A markdown pattern (spec 061): admin-authored HTML with a `{{content}}` placeholder, and optional CSS. */
export type PatternDef = { name: string; html: string; css: string | null }

type Slot = { pattern: PatternDef; content: string; block: boolean }

const token = (i: number) => `PUPITREPATTERN${i}PUPITRE`
const BLOCK_OPEN = /^\|\|\|([a-z0-9][a-z0-9_-]*)\s*$/
const BLOCK_CLOSE = /^\|\|\|\s*$/
const INLINE = /\|\|\|([a-z0-9][a-z0-9_-]*) (.+?)\|\|\|/g

/**
 * Spec 061: replaces `|||name … |||` blocks (own lines) and `|||name text|||` inline uses of known patterns with
 * placeholders, outside fenced code. Unknown names and unclosed blocks are left as written.
 */
function extractPatterns(source: string, patterns: Map<string, PatternDef>) {
  const slots: Slot[] = []
  if (patterns.size === 0) return { text: source, slots }
  const lines = source.split('\n')
  const out: string[] = []
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const f = FENCE.exec(line)
    if (fence || f) {
      if (f) fence = fence === null ? f[1]! : fence === f[1] ? null : fence
      out.push(line)
      continue
    }
    const open = BLOCK_OPEN.exec(line)
    const pattern = open ? patterns.get(open[1]!) : undefined
    if (pattern) {
      const end = lines.findIndex((l, j) => j > i && BLOCK_CLOSE.test(l))
      if (end > 0) {
        slots.push({ pattern, content: lines.slice(i + 1, end).join('\n'), block: true })
        out.push('', token(slots.length - 1), '')
        i = end
        continue
      }
    }
    out.push(
      line.replace(INLINE, (match, name: string, content: string) => {
        const p = patterns.get(name)
        if (!p) return match
        slots.push({ pattern: p, content: content.trim(), block: false })
        return token(slots.length - 1)
      }),
    )
  }
  return { text: out.join('\n'), slots }
}

/** The pattern HTML is trusted (admins); the content inside it is rendered and sanitized like the rest. */
function fillPatterns(html: string, slots: Slot[]) {
  const fill = (i: number) => {
    const slot = slots[i]!
    const env: RenderEnv = { headingCount: 0, toc: [] }
    const inner = sanitizeHtml(slot.block ? md.render(slot.content, env) : md.renderInline(slot.content, env), SANITIZE)
    return slot.pattern.html.split('{{content}}').join(inner)
  }
  return html
    .replace(/<p>PUPITREPATTERN(\d+)PUPITRE<\/p>/g, (_, i: string) => fill(Number(i)))
    .replace(/PUPITREPATTERN(\d+)PUPITRE/g, (_, i: string) => fill(Number(i)))
}

/** A whole document: sanitized HTML, its table of contents, and the CSS of the patterns it uses. */
export function renderMarkdown(source: string, patterns: PatternDef[] = []): { html: string; toc: TocEntry[]; styles: string } {
  const env: RenderEnv = { headingCount: 0, toc: [] }
  const { text, slots } = extractPatterns(source, new Map(patterns.map((p) => [p.name, p])))
  const rendered = splitAdmonitions(text)
    .map((chunk) =>
      chunk.kind === 'markdown'
        ? md.render(chunk.text, env)
        : `<div class="admonition admonition-${chunk.type}"><p class="admonition-title">${ADMONITIONS[chunk.type]} ${escapeHtml(chunk.title)}</p>${md.render(chunk.body, env)}</div>`,
    )
    .join('')
  const html = fillPatterns(sanitizeHtml(rendered, SANITIZE), slots)
  const used = [...new Set(slots.map((s) => s.pattern))]
  return { html, toc: env.toc, styles: used.map((p) => p.css ?? '').filter(Boolean).join('\n') }
}

/** A short fragment (quiz question, answer, feedback): sanitized HTML, no TOC. */
export function renderFragment(source: string, { inline = false } = {}): string {
  const env: RenderEnv = { headingCount: 0, toc: [] }
  return sanitizeHtml(inline ? md.renderInline(source, env) : md.render(source, env), SANITIZE)
}

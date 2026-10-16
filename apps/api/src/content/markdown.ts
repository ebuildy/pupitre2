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
    span: ['class'],
    div: ['class'],
    p: ['class'],
    th: ['style'],
    td: ['style'],
  },
  allowedClasses: {
    code: ['hljs', /^language-/],
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

/** A whole document: sanitized HTML and its table of contents. */
export function renderMarkdown(source: string): { html: string; toc: TocEntry[] } {
  const env: RenderEnv = { headingCount: 0, toc: [] }
  const html = splitAdmonitions(source)
    .map((chunk) =>
      chunk.kind === 'markdown'
        ? md.render(chunk.text, env)
        : `<div class="admonition admonition-${chunk.type}"><p class="admonition-title">${ADMONITIONS[chunk.type]} ${escapeHtml(chunk.title)}</p>${md.render(chunk.body, env)}</div>`,
    )
    .join('')
  return { html: sanitizeHtml(html, SANITIZE), toc: env.toc }
}

/** A short fragment (quiz question, answer, feedback): sanitized HTML, no TOC. */
export function renderFragment(source: string, { inline = false } = {}): string {
  const env: RenderEnv = { headingCount: 0, toc: [] }
  return sanitizeHtml(inline ? md.renderInline(source, env) : md.render(source, env), SANITIZE)
}

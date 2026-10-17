import { useEffect, type RefObject } from 'react'

/**
 * Spec 060: draws the `pre.mermaid` blocks of rendered content. The library is loaded only when a page has one;
 * diagrams follow the light / dark theme; a block that fails to render keeps its source.
 */
export function useMermaid(container: RefObject<HTMLElement | null>, html: string | undefined) {
  useEffect(() => {
    const root = container.current
    const blocks = root ? [...root.querySelectorAll<HTMLElement>('pre.mermaid')] : []
    if (blocks.length === 0) return
    for (const b of blocks) b.dataset.source ??= b.textContent ?? ''
    let cancelled = false

    async function draw() {
      const mermaid = (await import('mermaid')).default
      const dark = document.documentElement.classList.contains('dark')
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' })
      for (const [i, b] of blocks.entries()) {
        if (cancelled) return
        try {
          const { svg } = await mermaid.render(`mermaid-${Date.now()}-${i}`, b.dataset.source ?? '')
          b.innerHTML = svg
          b.dataset.rendered = 'true'
        } catch {
          b.textContent = b.dataset.source ?? ''
        }
      }
    }
    void draw()
    const observer = new MutationObserver(() => void draw())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [container, html])
}

// WYSIWYG printing: every printed page is a clipped copy of the on-screen page sheet, so the
// browser's own pagination never disagrees with the editor's. Blocks far away from a page are
// replaced by a spacer of the same height to keep each copy small.

/** A clipped, non-editable copy of page `k` of the page view (for printing and page overviews). */
export function clonePage(pagesEl: HTMLElement, k: number, stride: number, widthPx: number, heightPx: number) {
  const scale = pagesEl.getBoundingClientRect().width / widthPx || 1
  const pm = pagesEl.querySelector<HTMLElement>('.pg-host .ProseMirror')
  const pmRect = pm?.getBoundingClientRect()
  const blocks = pm ? Array.from(pm.children as HTMLCollectionOf<HTMLElement>) : []
  const blockBoxes = blocks.map((el) => {
    const r = el.getBoundingClientRect()
    return { top: (r.top - pmRect!.top) / scale, bottom: (r.bottom - pmRect!.top) / scale, mt: parseFloat(getComputedStyle(el).marginTop) || 0 }
  })
  const hostTop = pm ? (pmRect!.top - pagesEl.getBoundingClientRect().top) / scale : 0
  const page = document.createElement('div')
  page.className = 'print-page'
  page.style.width = `${widthPx}px`
  page.style.height = `${heightPx}px`
  const clone = pagesEl.cloneNode(true) as HTMLElement
  clone.style.zoom = '1'
  clone.style.position = 'absolute'
  clone.style.left = '0'
  clone.style.top = `${-k * stride}px`
  clone.style.margin = '0'
  clone.classList.remove('is-hf-editing', 'has-markup')
  clone.querySelectorAll('.sheet').forEach((sheet, i) => i !== k && sheet.remove())
  clone.querySelectorAll('.markup-pane, .notes-measure, .draw-overlay, .vruler, .ink-overlay').forEach((el) => el.remove())
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))
  const clonePm = clone.querySelector<HTMLElement>('.pg-host .ProseMirror')
  if (clonePm) {
    // Window of the editor (in editor coordinates) that is visible on this page.
    const from = k * stride - hostTop - stride
    const to = (k + 1) * stride - hostTop + stride
    const children = Array.from(clonePm.children)
    let first = -1
    children.forEach((child, i) => {
      const box = blockBoxes[i]
      if (!box) return
      if (box.bottom < from || box.top > to) child.remove()
      else if (first === -1) first = i
    })
    if (first > 0) {
      const pad = document.createElement('div')
      pad.style.height = `${blockBoxes[first].top - blockBoxes[first].mt}px`
      clonePm.prepend(pad)
    }
  }
  page.appendChild(clone)
  return page
}

/** File › Print settings: which pages, how many copies, collated or not. */
export type PrintOptions = { range?: string; copies?: number; collate?: boolean; only?: 'all' | 'odd' | 'even' }

/**
 * Page numbers (1-based) of a range such as "1-3, 5, 8-" (an open end runs to the last page).
 * Returns null when the text is not a valid range.
 */
export function parsePageRange(text: string, pageCount: number): number[] | null {
  const out: number[] = []
  for (const part of text.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/)
    if (m) {
      const from = m[1] ? Number(m[1]) : 1
      const to = m[2] ? Number(m[2]) : pageCount
      if (from < 1 || to < from) return null
      for (let p = from; p <= Math.min(to, pageCount); p++) out.push(p)
    } else if (/^\d+$/.test(part)) {
      const p = Number(part)
      if (p < 1) return null
      if (p <= pageCount) out.push(p)
    } else return null
  }
  return out
}

/** The 0-based page indexes to print, in order, for the print options. */
export function printOrder(pageCount: number, options: PrintOptions = {}): number[] {
  let pages = options.range?.trim() ? (parsePageRange(options.range, pageCount) ?? []) : Array.from({ length: pageCount }, (_, i) => i + 1)
  if (options.only === 'odd') pages = pages.filter((p) => p % 2 === 1)
  if (options.only === 'even') pages = pages.filter((p) => p % 2 === 0)
  const copies = Math.max(1, Math.min(99, Math.round(options.copies ?? 1)))
  const order: number[] = []
  if (options.collate === false) for (const p of pages) for (let c = 0; c < copies; c++) order.push(p - 1)
  else for (let c = 0; c < copies; c++) for (const p of pages) order.push(p - 1)
  return order
}

export function printPages(pagesEl: HTMLElement, pageCount: number, stride: number, widthPx: number, heightPx: number, options: PrintOptions = {}) {
  const root = document.createElement('div')
  root.id = 'print-root'
  const copies = new Map<number, HTMLElement>()
  for (const k of printOrder(pageCount, options)) {
    const page = copies.get(k) ?? clonePage(pagesEl, k, stride, widthPx, heightPx)
    root.appendChild(copies.has(k) ? page.cloneNode(true) : page)
    copies.set(k, page)
  }
  document.body.appendChild(root)
  const style = document.createElement('style')
  style.textContent = `@page { size: ${widthPx / 96}in ${heightPx / 96}in; margin: 0; }`
  document.head.appendChild(style)
  const cleanup = () => {
    root.remove()
    style.remove()
    window.removeEventListener('afterprint', cleanup)
    window.removeEventListener('pointerdown', cleanup)
    window.removeEventListener('keydown', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // The print copy is hidden on screen; if a browser never fires afterprint, drop it on the next input.
  window.addEventListener('pointerdown', cleanup)
  window.addEventListener('keydown', cleanup)
}

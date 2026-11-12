import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

// Print layout: the document stays one ProseMirror editor, but spacer widgets are inserted where a
// page ends so the following line starts at the top of the next page sheet. Pages are drawn behind
// the editor by the React page view.
//
// Each layout pass (1) hides the spacers and measures the continuous text flow, (2) decides where the
// pages break (line granularity, widow/orphan control, keep-with-next, table rows, manual breaks) and
// (3) sizes the spacers from their real positions so every page body starts exactly where it should.

export type BreakKind = 'inline' | 'block' | 'row'
/**
 * `header`: position of a table's header row that repeats at the top of the next page.
 * `page`: the page the break starts (1 = second page). A table row that breaks across pages needs one
 * spacer per cell, all starting the same page.
 */
export type PageBreakInfo = { pos: number; kind: BreakKind; cols?: number; header?: number; page?: number }

export type PageGeometry = {
  /** Width of the text column in CSS px (used to derive the zoom factor). */
  contentWidth: number
  /** Distance from the top of one page sheet to the top of the next, in CSS px. */
  stride: number
  /** Offset of page `k`'s body from the top of its sheet, in CSS px. */
  bodyStart: (page: number) => number
  /** Height available for body text on page `k`, in CSS px. */
  bodyHeight: (page: number) => number
  widowControl: boolean
  /** Measured height of a footnote (by id); footnotes take space at the bottom of their page. */
  noteHeight?: (id: string) => number
  /** Height of the short separator line above the notes. */
  noteSeparator?: number
  /** Measured heights of the endnotes in document order; they follow the last paragraph. */
  endnoteHeights?: number[]
  /** Page number shown on the first page (decides even/odd section breaks). */
  firstPageNumber?: number
  /** Vertical alignment of the text on each page (Page Setup › Layout); "justify" shows as top. */
  verticalAlign?: 'top' | 'center' | 'bottom' | 'justify'
  /** Height of a page sheet (the rest of `stride` is the gap between sheets). */
  pageHeight?: number
}

/** Where an endnote (or the endnote separator) goes: page index and offset from the page body's top. */
export type NotePlacement = { page: number; top: number }
export type LayoutResult = { pages: number; breaks: PageBreakInfo[]; endnotes?: NotePlacement[]; endnoteSeparator?: NotePlacement | null }

type PluginState = { breaks: PageBreakInfo[]; decorations: DecorationSet }
type Metrics = { top: number; bottom: number; mt: number }
type Line = { start: number; top: number; bottom: number }

export const paginationKey = new PluginKey<PluginState>('pagination')

const CONTAINERS = new Set(['bulletList', 'orderedList', 'listItem', 'blockquote', 'taskList', 'taskItem'])
const EPS = 0.5

const sameBreaks = (a: PageBreakInfo[], b: PageBreakInfo[]) =>
  a.length === b.length &&
  a.every((x, i) => x.pos === b[i].pos && x.kind === b[i].kind && (x.cols ?? 0) === (b[i].cols ?? 0) && (x.header ?? -1) === (b[i].header ?? -1) && pageOf(x, i) === pageOf(b[i], i))

/** The page a break starts (breaks of a split table row share one). */
const pageOf = (b: PageBreakInfo, index: number) => b.page ?? index + 1

export class PaginationController {
  geometry: PageGeometry | null = null
  host: HTMLElement | null = null
  view: EditorView | null = null
  heights: number[] = []
  result: LayoutResult = { pages: 1, breaks: [] }
  onLayout: ((result: LayoutResult) => void) | null = null
  private frame = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private idle: ReturnType<typeof setTimeout> | undefined
  /** Duration of the last layout pass in ms; long documents re-layout only once typing pauses. */
  lastDuration = 0
  private observer: ResizeObserver | null = null

  attach(view: EditorView) {
    if (this.view === view) return
    this.view = view
    this.observer?.disconnect()
    // Images loading, fonts swapping in and table resizes all change heights without a transaction.
    this.observer = new ResizeObserver(() => this.schedule())
    this.observer.observe(view.dom)
    document.fonts?.addEventListener?.('loadingdone', this.schedule)
    this.schedule()
  }

  detach(view: EditorView) {
    if (this.view !== view) return
    this.observer?.disconnect()
    this.observer = null
    document.fonts?.removeEventListener?.('loadingdone', this.schedule)
    this.view = null
  }

  setGeometry(geometry: PageGeometry | null) {
    this.geometry = geometry
    this.schedule()
  }

  /** After a document change: at once in short documents, after a short pause in long ones. */
  scheduleEdit() {
    if (this.lastDuration < 12) return this.schedule()
    clearTimeout(this.idle)
    this.idle = setTimeout(() => this.schedule(), Math.min(400, 60 + this.lastDuration * 4))
  }

  schedule = () => {
    clearTimeout(this.idle)
    if (this.frame) return
    // Next frame normally; the timer covers hidden tabs, where animation frames are paused.
    const fire = () => {
      if (!this.frame) return
      cancelAnimationFrame(this.frame)
      clearTimeout(this.timer)
      this.frame = 0
      this.run()
    }
    this.frame = requestAnimationFrame(fire)
    this.timer = setTimeout(fire, 120)
  }

  /** Page index (0-based) of a document position. */
  pageOfPos(pos: number) {
    const breaks = this.result.breaks
    let lo = 0
    let hi = breaks.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (breaks[mid].pos <= pos) lo = mid + 1
      else hi = mid
    }
    return lo ? pageOf(breaks[lo - 1], lo - 1) : 0
  }

  /** Document position where page `k` (0-based) starts. */
  pageStart(k: number, docEnd: number) {
    if (k <= 0) return 1
    const i = this.result.breaks.findIndex((b, n) => pageOf(b, n) === k)
    return i < 0 ? docEnd : this.result.breaks[i].pos
  }

  /** Vertical alignment offsets of the pages' text (px); the first page's is the editor's top margin. */
  shifts: number[] = []

  /** Where page `k`'s text starts relative to the editor's top, with vertical alignment. */
  alignedOffset(k: number) {
    return this.bodyOffset(k) + (this.shifts[k] ?? 0) - (this.shifts[0] ?? 0)
  }

  /** Top of page `k`'s body relative to the editor's top, in CSS px. */
  bodyOffset(k: number) {
    const g = this.geometry
    return g ? k * g.stride + g.bodyStart(k) - g.bodyStart(0) : 0
  }

  run() {
    const { view, host } = this
    if (!view || view.isDestroyed || !host || !view.dom.isConnected) return
    const current = paginationKey.getState(view.state)
    if (!current) return
    if (!this.geometry) {
      if (current.breaks.length) view.dispatch(view.state.tr.setMeta(paginationKey, { breaks: [] }).setMeta('addToHistory', false))
      this.publish({ pages: 1, breaks: [] })
      return
    }
    const started = performance.now()
    host.classList.add('pg-measuring')
    let computed: { breaks: PageBreakInfo[]; estimates: number[]; endnotes: NotePlacement[]; endnoteSeparator: NotePlacement | null; extraPages: number; used: number[] }
    try {
      computed = computeBreaks(view, this.geometry, (k) => this.bodyOffset(k))
    } catch (error) {
      // A half-updated DOM (e.g. during an image swap) can make measuring fail; try again next frame.
      console.warn('Pagination failed', error)
      return
    } finally {
      host.classList.remove('pg-measuring')
    }
    if (!sameBreaks(current.breaks, computed.breaks)) {
      this.heights = computed.estimates
      view.dispatch(view.state.tr.setMeta(paginationKey, { breaks: computed.breaks }).setMeta('addToHistory', false))
    }
    // Centered or bottom-aligned pages: each page's text moves down by part of its free space.
    const align = this.geometry.verticalAlign
    const g = this.geometry
    this.shifts = computed.used.map((h, k) => (align === 'center' ? Math.max(0, (g.bodyHeight(k) - h) / 2) : align === 'bottom' ? Math.max(0, g.bodyHeight(k) - h) : 0))
    const first = `${this.shifts[0] ?? 0}px`
    if (view.dom.style.marginTop !== first) view.dom.style.marginTop = this.shifts[0] ? first : ''
    this.fixHeights(view)
    this.lastDuration = performance.now() - started
    const last = computed.breaks.length ? pageOf(computed.breaks[computed.breaks.length - 1], computed.breaks.length - 1) : 0
    this.publish({ pages: last + 1 + computed.extraPages, breaks: computed.breaks, endnotes: computed.endnotes, endnoteSeparator: computed.endnoteSeparator })
  }

  private publish(result: LayoutResult) {
    const changed =
      result.pages !== this.result.pages ||
      !sameBreaks(result.breaks, this.result.breaks) ||
      JSON.stringify([result.endnotes, result.endnoteSeparator]) !== JSON.stringify([this.result.endnotes, this.result.endnoteSeparator])
    this.result = result
    if (changed) this.onLayout?.(result)
  }

  /** Sizes every spacer so that its bottom edge lands exactly on the next page's body start. */
  private fixHeights(view: EditorView) {
    const g = this.geometry!
    const spacers = Array.from(view.dom.querySelectorAll<HTMLElement>('.pg-spacer'))
    if (!spacers.length) return
    const root = view.dom.getBoundingClientRect()
    const scale = root.width / g.contentWidth || 1
    const tops = spacers.map((s) => (s.getBoundingClientRect().top - root.top) / scale)
    let shift = 0
    // Spacers in the cells of a split table row sit side by side: they share the shift before them,
    // and the row grows by the largest change (later passes settle any remaining difference).
    let group = -1
    let base = 0
    let growth = 0
    spacers.forEach((el, n) => {
      const index = Number(el.dataset.index)
      if (index !== group) {
        shift = base + growth
        group = index
        base = shift
        growth = 0
      }
      const sized = el.tagName === 'TR' ? (el.querySelector<HTMLElement>('.pg-gap') ?? (el.firstElementChild as HTMLElement)) : el
      const current = parseFloat(sized.style.height) || 0
      const height = Math.max(0, this.alignedOffset(index + 1) - (tops[n] + base))
      growth = Math.max(growth, height - current)
      this.heights[Number(el.dataset.break)] = height
      if (Math.abs(height - current) > 0.25) sized.style.height = `${height}px`
      if (el.tagName !== 'TR') this.maskCell(el, root, scale, index, tops[n] + base, height)
    })
  }

  /**
   * A table row split across pages: inside a cell the spacer paints over the row's borders where
   * the row crosses the bottom margin, the gap between the sheets and the next top margin, and closes
   * the row with a border line on both pages, like the original draws it.
   */
  private maskCell(el: HTMLElement, root: DOMRect, scale: number, page: number, top: number, height: number) {
    const cell = el.closest<HTMLElement>('td, th')
    const g = this.geometry
    if (!cell || !g?.pageHeight) {
      el.classList.remove('pg-in-cell')
      return
    }
    // One band per split row, drawn by the cell whose text reaches lowest on the page.
    const row = cell.closest('tr')
    const lowest = row
      ? Array.from(row.querySelectorAll<HTMLElement>('.pg-spacer'))
          .filter((s) => s.closest('tr') === row && s.dataset.index === el.dataset.index)
          .reduce((a, b) => (b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a), el)
      : el
    if (lowest !== el) {
      el.classList.remove('pg-in-cell')
      return
    }
    const r = el.getBoundingClientRect()
    // The band covers the whole row: cells that already ended on this page continue to its bottom too.
    const c = (cell.closest('tr') ?? cell).getBoundingClientRect()
    const style = getComputedStyle(cell)
    // Sheet bottom of page `page` in editor coordinates (the editor starts at the first body top).
    const sheetBottom = page * g.stride + g.pageHeight - g.bodyStart(0) - (this.shifts[0] ?? 0)
    const above = Math.max(0, sheetBottom - top)
    const gap = g.stride - g.pageHeight
    el.classList.add('pg-in-cell')
    el.style.setProperty('--pg-l', `${(c.left - r.left) / scale - 2}px`)
    el.style.setProperty('--pg-r', `${(r.right - c.right) / scale - 2}px`)
    el.style.setProperty('--pg-above', `${Math.min(above, height)}px`)
    el.style.setProperty('--pg-gap', `${Math.min(gap, Math.max(0, height - above))}px`)
    el.style.setProperty('--pg-line', style.borderBottomStyle !== 'none' && parseFloat(style.borderBottomWidth) ? style.borderBottomColor : 'transparent')
    void root
  }
}

function spacer(b: PageBreakInfo, index: number, ctl: PaginationController) {
  const height = `${ctl.heights[index] ?? 0}px`
  const page = pageOf(b, index)
  let el: HTMLElement
  if (b.kind === 'row') {
    el = document.createElement('tr')
    const td = document.createElement('td')
    td.colSpan = b.cols ?? 1
    el.appendChild(td)
    const headerRow = b.header != null ? ctl.view?.nodeDOM(b.header) : null
    if (headerRow instanceof HTMLElement) {
      // Repeated header row: a copy of the table's first row at the top of the next page.
      const gap = document.createElement('div')
      gap.className = 'pg-gap'
      gap.style.height = height
      const table = document.createElement('table')
      const source = headerRow.closest('table')
      table.className = `${source?.className ?? ''} pg-header-copy`
      const colgroup = source?.querySelector('colgroup')
      if (colgroup) table.appendChild(colgroup.cloneNode(true))
      const body = document.createElement('tbody')
      body.appendChild(headerRow.cloneNode(true))
      table.appendChild(body)
      td.append(gap, table)
    } else td.style.height = height
  } else {
    el = document.createElement(b.kind === 'inline' ? 'span' : 'div')
    el.style.height = height
  }
  el.className = `pg-spacer pg-${b.kind}`
  el.dataset.index = String(page - 1)
  el.dataset.break = String(index)
  el.contentEditable = 'false'
  el.setAttribute('aria-hidden', 'true')
  return el
}

function decorations(doc: PMNode, breaks: PageBreakInfo[], ctl: PaginationController) {
  return DecorationSet.create(
    doc,
    breaks.map((b, i) =>
      Decoration.widget(b.pos, () => spacer(b, i, ctl), { side: -1, key: `pg-${i}-${b.kind}-${b.cols ?? 0}-${b.header ?? ''}-${pageOf(b, i)}`, ignoreSelection: true }),
    ),
  )
}

/** A mapped break is only kept while its position still makes sense for its kind. */
function validBreak(doc: PMNode, b: PageBreakInfo) {
  if (b.pos < 0 || b.pos > doc.content.size) return false
  const parent = doc.resolve(b.pos).parent
  if (b.kind === 'inline') return parent.isTextblock
  if (b.kind === 'row') return parent.type.name === 'table'
  return !parent.isTextblock && parent.type.name !== 'table'
}

function keepsWithNext(node: PMNode) {
  const explicit = node.attrs?.keepNext as boolean | null | undefined
  return explicit ?? node.type.name === 'heading'
}

function computeBreaks(view: EditorView, g: PageGeometry, bodyOffset: (k: number) => number) {
  const rootRect = view.dom.getBoundingClientRect()
  const scale = rootRect.width / g.contentWidth || 1
  // Columns are measured as one long column; `offset` corrects everything after them to the real,
  // balanced height.
  let offset = 0
  const Y = (v: number) => (v - rootRect.top) / scale + offset
  const breaks: PageBreakInfo[] = []
  const ys: number[] = []
  let page = 0
  let pageStart = 0
  let pageEnd = g.bodyHeight(0)
  /** Space taken by footnotes on the current page (already subtracted from pageEnd). */
  let noteSpace = 0
  let lastBottom = 0

  /** Continuous-flow y where each page's body starts. */
  const pageStarts: number[] = [0]
  const push = (pos: number, kind: BreakKind, y: number, cols?: number, forced = false) => {
    if (!forced && y <= pageStart + 1) return false
    page++
    breaks.push(cols ? { pos, kind, cols, page } : { pos, kind, page })
    ys.push(y)
    pageStart = y
    pageStarts[page] = y
    pageEnd = y + g.bodyHeight(page)
    noteSpace = 0
    return true
  }
  /** Another spacer for the page break just pushed (the other cells of a split table row). */
  const pushAlso = (pos: number, kind: BreakKind, y: number) => {
    breaks.push({ pos, kind, page })
    ys.push(y)
  }

  const doc = view.state.doc
  /** Space the footnotes referenced in [from, to) need on the current page (with the separator). */
  const noteCost = (from: number, to: number) => {
    if (!g.noteHeight) return 0
    let h = 0
    doc.nodesBetween(from, Math.min(to, doc.content.size), (node, pos) => {
      if (node.type.name === 'noteRef' && node.attrs.kind === 'footnote' && pos >= from && pos < to) h += g.noteHeight!(node.attrs.id)
    })
    return h ? h + (noteSpace ? 0 : (g.noteSeparator ?? 0)) : 0
  }
  const consume = (h: number) => {
    noteSpace += h
    pageEnd -= h
  }
  const hasFootnote = (node: PMNode) => {
    if (!g.noteHeight || node.isAtom) return false
    let found = false
    node.descendants((n) => {
      if (n.type.name === 'noteRef' && n.attrs.kind === 'footnote') found = true
      return !found
    })
    return found
  }

  const metrics = (el: HTMLElement): Metrics => {
    const r = el.getBoundingClientRect()
    return { top: Y(r.top), bottom: Y(r.bottom), mt: parseFloat(getComputedStyle(el).marginTop) || 0 }
  }

  const caret = (pos: number, end: number) => {
    const c = view.coordsAtPos(pos, pos < end ? 1 : -1)
    return { top: Y(c.top), bottom: Y(c.bottom) }
  }

  /** Line boxes of a textblock, found by binary searching caret positions. */
  const lines = (start: number, end: number, m: Metrics): Line[] => {
    const out: Line[] = [{ start, top: m.top, bottom: m.bottom }]
    let c = caret(start, end)
    for (let guard = 0; guard < 10000; guard++) {
      if (caret(end, end).top < c.bottom - 1) break
      let lo = out[out.length - 1].start + 1
      let hi = end
      let found = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (caret(mid, end).top >= c.bottom - 1) {
          found = mid
          hi = mid - 1
        } else lo = mid + 1
      }
      if (found < 0) break
      const next = caret(found, end)
      const prevBottom = view.coordsAtPos(found, -1).bottom
      const boundary = (Y(prevBottom) + next.top) / 2
      out[out.length - 1].bottom = boundary
      out.push({ start: found, top: boundary, bottom: m.bottom })
      c = next
    }
    return out
  }

  type Sibling = { pos: number; top: number; mt: number; keepNext: boolean; split: boolean }

  /** Breaks before a block, pulling preceding keep-with-next blocks (headings) along. */
  const breakBefore = (pos: number, y: number, prev: Sibling[]) => {
    let p = pos
    let yy = y
    for (let i = prev.length - 1; i >= 0; i--) {
      const s = prev[i]
      if (!s.keepNext || s.split || s.top - s.mt <= pageStart + 1) break
      p = s.pos
      yy = s.top - s.mt
    }
    return push(p, 'block', yy)
  }

  const splitText = (node: PMNode, pos: number, m: Metrics, before: (y: number) => boolean) => {
    const start = pos + 1
    const end = pos + node.nodeSize - 1
    if (end <= start) {
      before(m.top - m.mt)
      return
    }
    const ls = lines(start, end, m)
    const n = ls.length
    const widow = g.widowControl && node.attrs.widowControl !== false
    const lineEnd = (j: number) => (j + 1 < n ? ls[j + 1].start : end + 1)
    const costs: number[] = []
    let canMove = true
    if (node.attrs.keepLines && m.bottom - m.top <= g.bodyHeight(page + 1)) {
      canMove = false
      before(m.top - m.mt)
    }
    let i = 0
    for (let guard = 0; guard < n + 2; guard++) {
      let j = i
      // Lines stay on this page while they (and the footnotes they reference) fit.
      while (j < n) {
        const c = noteCost(ls[j].start, lineEnd(j))
        if (ls[j].bottom > pageEnd - c + EPS) break
        consume(c)
        costs[j] = c
        j++
      }
      if (j >= n) return
      const firstOverflow = j
      if (widow && n > 1) {
        if (j === n - 1 && j - 1 > i) j-- // keep at least two lines on the next page
        if (i === 0 && j === 1) j = 0 // never leave the first line alone at the bottom
      }
      // Lines moved back to the next page take their footnotes with them.
      const refund = (from: number) => {
        for (let k = from; k < firstOverflow; k++) consume(-(costs[k] ?? 0))
      }
      if (j === 0) {
        if (canMove) {
          canMove = false
          if (before(m.top - m.mt)) continue
        }
        j = Math.max(1, firstOverflow) // the paragraph already starts this page: split it
      }
      refund(Math.min(j, firstOverflow))
      if (j <= i) j = i + 1 // a single line taller than the page simply overflows
      if (j >= n || !push(ls[j].start, 'inline', ls[j].top)) return
      i = j
    }
  }

  type Unit = { pos: number; kind: BreakKind; top: number; bottom: number }
  /** Lines and blocks of every cell of a row, where the row may break across pages. */
  const cellUnits = (row: PMNode, rowPos: number) => {
    const cells: { units: Unit[]; from: number }[] = []
    row.forEach((cell, off) => {
      const cellPos = rowPos + 1 + off
      const units: Unit[] = []
      cell.forEach((child, coff) => {
        const p = cellPos + 1 + coff
        const el = view.nodeDOM(p)
        if (!(el instanceof HTMLElement)) return
        const cm = metrics(el)
        if (child.isTextblock && child.content.size) {
          lines(p + 1, p + child.nodeSize - 1, cm).forEach((l, i) => units.push(i === 0 ? { pos: p, kind: 'block', top: cm.top - cm.mt, bottom: l.bottom } : { pos: l.start, kind: 'inline', top: l.top, bottom: l.bottom }))
        } else units.push({ pos: p, kind: 'block', top: cm.top - cm.mt, bottom: cm.bottom })
      })
      cells.push({ units, from: 0 })
    })
    return cells
  }

  /** "Allow row to break across pages": the cells' text continues on the next page line by line. */
  const splitRow = (row: PMNode, rowPos: number, r: Metrics) => {
    const cells = cellUnits(row, rowPos)
    let split = false
    for (let guard = 0; guard < 100 && r.bottom > pageEnd + EPS; guard++) {
      const at: { cell: (typeof cells)[number]; k: number }[] = []
      for (const c of cells) {
        let k = c.from
        while (k < c.units.length && c.units[k].bottom <= pageEnd + EPS) k++
        // A line taller than the page cannot move on; the next one starts the new page.
        while (k < c.units.length && k === c.from && c.units[k].top <= pageStart + 1 && split) k++
        if (k < c.units.length) at.push({ cell: c, k })
      }
      if (!at.length) break
      // Nothing of the row fits on this page: move the whole row instead.
      if (!split && at.length === cells.filter((c) => c.units.length).length && at.every((a) => a.k === 0)) return false
      // The part of the row on the next page is as tall as the tallest rest of a cell.
      const rest = Math.max(...at.map((a) => a.cell.units[a.cell.units.length - 1].bottom - a.cell.units[a.k].top))
      const start = Math.max(pageStart + 1, r.bottom - rest)
      at.forEach((a, i) => {
        const u = a.cell.units[a.k]
        if (i === 0) push(u.pos, u.kind, start, undefined, true)
        else pushAlso(u.pos, u.kind, u.top)
        a.cell.from = a.k
      })
      split = true
    }
    return split
  }

  const splitTable = (node: PMNode, pos: number, m: Metrics, before: (y: number) => boolean) => {
    let cols = 0
    node.firstChild?.forEach((cell) => (cols += (cell.attrs.colspan as number) ?? 1))
    let canMove = true
    // "Repeat Header Rows": the first row is drawn again at the top of every following page.
    const headerPos = pos + 1
    const headerEl = node.attrs.repeatHeader ? view.nodeDOM(headerPos) : null
    const headerH = headerEl instanceof HTMLElement ? metrics(headerEl).bottom - metrics(headerEl).top : 0
    node.forEach((row, offset, index) => {
      const rowPos = pos + 1 + offset
      const el = view.nodeDOM(rowPos)
      if (!(el instanceof HTMLElement)) return
      const r = metrics(el)
      const c = noteCost(rowPos, rowPos + row.nodeSize)
      if (r.bottom <= pageEnd - c + EPS) {
        consume(c)
        return
      }
      const breakable = !row.attrs.cantSplit && !(index === 0 && headerH)
      const tall = r.bottom - r.top > g.bodyHeight(page + 1)
      if (index === 0 && canMove && !tall) {
        before(m.top - m.mt)
        canMove = false
        return
      }
      canMove = false
      // Rows break across pages (the default) when they do not fit; otherwise they move as a whole.
      if (breakable && (tall || r.top > pageStart + 1) && splitRow(row, rowPos, r)) return
      if (r.top <= pageStart + 1) return // a row taller than a page overflows
      if (push(rowPos, 'row', r.top, Math.max(1, cols)) && headerH && index > 0) {
        breaks[breaks.length - 1].header = headerPos
        pageEnd -= headerH
      }
      void row
    })
  }

  /** Columns fill page by page: each page gets a balanced chunk, separated by full-width spacers. */
  const splitColumns = (node: PMNode, pos: number, m: Metrics, before: (y: number) => boolean) => {
    const n = Math.max(1, node.attrs.count as number)
    const kids: { pos: number; top: number; bottom: number }[] = []
    node.forEach((_child, at) => {
      const p = pos + 1 + at
      const el = view.nodeDOM(p)
      if (!(el instanceof HTMLElement)) return
      const k = metrics(el)
      kids.push({ pos: p, top: k.top - k.mt, bottom: k.bottom })
    })
    const linearBottom = m.bottom
    let realTop = m.top
    let chunkStart = m.top
    const balanced = (from: number, to: number) => Math.max(0, to - from) / n
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]
      if (realTop + balanced(chunkStart, k.bottom) <= pageEnd + EPS) continue
      if (k.top <= chunkStart + 1) {
        if (i === 0 && realTop > pageStart + 1 && before(realTop - m.mt)) {
          i--
          continue
        }
        continue // a block taller than the page's columns overflows
      }
      const y = realTop + balanced(chunkStart, k.top)
      if (!push(k.pos, 'block', y)) continue
      realTop = y
      chunkStart = k.top
      i--
    }
    offset += realTop + balanced(chunkStart, linearBottom) - linearBottom
  }

  const place = (node: PMNode, pos: number, el: HTMLElement, m: Metrics, before: (y: number) => boolean) => {
    const name = node.type.name
    if (name === 'pageBreak') {
      push(pos + node.nodeSize, 'block', m.bottom, undefined, true)
      return
    }
    if (name === 'sectionBreak') {
      const kind = node.attrs.kind as string
      if (kind === 'continuous') return
      push(pos + node.nodeSize, 'block', m.bottom, undefined, true)
      // Even/odd page sections may need a blank page first.
      const number = page + (g.firstPageNumber ?? 1)
      if ((kind === 'evenPage' && number % 2 === 1) || (kind === 'oddPage' && number % 2 === 0)) push(pos + node.nodeSize, 'block', m.bottom, undefined, true)
      return
    }
    if (name === 'columns') return splitColumns(node, pos, m, before)
    if (node.attrs?.pageBreakBefore && m.top - m.mt > pageStart + 1) before(m.top - m.mt)
    if (m.bottom <= pageEnd + EPS && !hasFootnote(node)) return
    if (node.isTextblock) return splitText(node, pos, m, before)
    if (name === 'table') return splitTable(node, pos, m, before)
    if (CONTAINERS.has(name)) return walk(node, pos + 1, before)
    before(m.top - m.mt)
    void el
  }

  const walk = (parent: PMNode, start: number, delegate: ((y: number) => boolean) | null) => {
    const prev: Sibling[] = []
    parent.forEach((node, offset, index) => {
      const pos = start + offset
      const el = view.nodeDOM(pos)
      if (!(el instanceof HTMLElement)) return
      const m = metrics(el)
      const count = breaks.length
      const before = (y: number) => (index === 0 && delegate ? delegate(y) : breakBefore(pos, y, prev))
      place(node, pos, el, m, before)
      prev.push({ pos, top: m.top, mt: m.mt, keepNext: keepsWithNext(node), split: breaks.length > count })
    })
  }

  walk(view.state.doc, 0, null)
  const lastChild = view.state.doc.lastChild
  if (lastChild) {
    const el = view.nodeDOM(view.state.doc.content.size - lastChild.nodeSize)
    if (el instanceof HTMLElement) lastBottom = metrics(el).bottom
  }

  // Endnotes follow the last paragraph and continue on extra pages when they do not fit.
  const endnotes: NotePlacement[] = []
  let endnoteSeparator: NotePlacement | null = null
  let extraPages = 0
  if (g.endnoteHeights?.length) {
    let notePage = page
    let top = Math.max(0, lastBottom - pageStart) + 12
    let limit = pageEnd - pageStart
    const sep = g.noteSeparator ?? 0
    if (top + sep + g.endnoteHeights[0] > limit) {
      notePage++
      top = 0
      limit = g.bodyHeight(notePage)
    }
    endnoteSeparator = { page: notePage, top }
    top += sep
    for (const h of g.endnoteHeights) {
      if (top + h > limit && top > 0) {
        notePage++
        top = 0
        limit = g.bodyHeight(notePage)
      }
      endnotes.push({ page: notePage, top })
      top += h
    }
    extraPages = notePage - page
  }

  // First guess of the spacer heights; fixHeights() corrects them from the real positions.
  const estimates = ys.map((y, i) => {
    const p = breaks[i].page ?? i + 1
    return Math.max(0, bodyOffset(p) - (bodyOffset(p - 1) + (y - (pageStarts[p - 1] ?? 0))))
  })
  // Height of the text on each page (from its first line to its last), for vertical alignment.
  const used = pageStarts.map((start, k) => Math.max(0, (k < page ? ys[breaks.findIndex((b, i) => (b.page ?? i + 1) === k + 1)] : lastBottom) - start))
  return { breaks, estimates, endnotes, endnoteSeparator, extraPages, used }
}

export const Pagination = Extension.create<{ controller: PaginationController | null }>({
  name: 'pagination',

  addOptions() {
    return { controller: null }
  },

  addProseMirrorPlugins() {
    const ctl = this.options.controller
    if (!ctl) return []
    return [
      new Plugin<PluginState>({
        key: paginationKey,
        state: {
          init: () => ({ breaks: [], decorations: DecorationSet.empty }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(paginationKey) as { breaks: PageBreakInfo[] } | undefined
            if (meta) return { breaks: meta.breaks, decorations: decorations(state.doc, meta.breaks, ctl) }
            if (!tr.docChanged) return prev
            const breaks: PageBreakInfo[] = []
            for (const b of prev.breaks) {
              const mapped = tr.mapping.mapResult(b.pos, -1)
              const next = { ...b, pos: mapped.pos }
              if (!mapped.deleted && validBreak(state.doc, next)) breaks.push(next)
            }
            return { breaks, decorations: decorations(state.doc, breaks, ctl) }
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations,
          // Spacers are layout only: clicking them must not select or start a table drag.
          handleDOMEvents: {
            mousedown: (_view, event) => !!(event.target as HTMLElement).closest?.('.pg-spacer'),
          },
        },
        view: (view) => {
          ctl.attach(view)
          return {
            update: (v, prevState) => {
              // React's strict mode can remount the editor; always follow the live view.
              if (ctl.view !== v) ctl.attach(v)
              else if (v.state.doc !== prevState.doc) ctl.scheduleEdit()
            },
            destroy: () => ctl.detach(view),
          }
        },
      }),
    ]
  },
})

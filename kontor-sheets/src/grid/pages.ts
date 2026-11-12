// Page breaks from the page setup (automatic + manual) and the geometry of the Page Layout view,
// where every printed page is drawn as its own sheet of paper with margins and a gap.
import { MAX_COLS, MAX_ROWS } from '../model/address'
import type { Sheet } from '../model/sheet'
import { Geometry, type Pane } from './geometry'

export const PAPER_IN: Record<string, [number, number]> = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17], a4: [8.27, 11.69], a3: [11.69, 16.54] }

export type PageBreaks = { rows: number[]; cols: number[]; manualRows: Set<number>; manualCols: Set<number> }

/** Print scale (1 = 100 %): the page setup's scale, or the scale that fits the used range on the chosen number of pages. */
export function printScale(sheet: Sheet): number {
  const p = sheet.page
  if (!p.fitToPage) return p.scale / 100
  const [pw, ph] = PAPER_IN[p.paper] ?? PAPER_IN.letter
  const [w, h] = p.orientation === 'landscape' ? [ph, pw] : [pw, ph]
  const usableW = (w - p.margins.left - p.margins.right) * 96
  const usableH = (h - p.margins.top - p.margins.bottom) * 96
  const used = sheet.used()
  const totalW = sheet.cols.offset(Math.max(0, used.c) + 2)
  const totalH = sheet.rows.offset(Math.max(0, used.r) + 2)
  const wide = p.fitWide ?? 1
  const tall = p.fitTall ?? 0
  let scale = 1
  if (wide > 0) scale = Math.min(scale, (wide * usableW) / Math.max(1, totalW))
  if (tall > 0) scale = Math.min(scale, (tall * usableH) / Math.max(1, totalH))
  return Math.max(0.1, scale)
}

/** Where pages start (row/column indexes > 0), like printing would split the used range. */
export function computePageBreaks(sheet: Sheet, limitR?: number, limitC?: number): PageBreaks {
  const p = sheet.page
  const [pw, ph] = PAPER_IN[p.paper] ?? PAPER_IN.letter
  const [w, h] = p.orientation === 'landscape' ? [ph, pw] : [pw, ph]
  const scale = printScale(sheet)
  const usableW = ((w - p.margins.left - p.margins.right) * 96) / scale
  const usableH = ((h - p.margins.top - p.margins.bottom) * 96) / scale
  const used = sheet.used()
  const manualRows = new Set(sheet.x.rowBreaks)
  const manualCols = new Set(sheet.x.colBreaks)
  const lastR = Math.min(MAX_ROWS - 1, limitR ?? used.r + 1)
  const lastC = Math.min(MAX_COLS - 1, limitC ?? used.c + 1)
  const cols: number[] = []
  let acc = 0
  for (let c = 0; c <= lastC; c++) {
    const s = sheet.cols.size(c)
    if (c > 0 && (manualCols.has(c) || (acc + s > usableW + 0.5 && acc > 0))) {
      cols.push(c)
      acc = 0
    }
    acc += s
  }
  const rows: number[] = []
  acc = 0
  for (let r = 0; r <= lastR; r++) {
    const s = sheet.rows.size(r)
    if (r > 0 && (manualRows.has(r) || (acc + s > usableH + 0.5 && acc > 0))) {
      rows.push(r)
      acc = 0
    }
    acc += s
  }
  return { rows, cols, manualRows, manualCols }
}

function countBefore(list: number[], i: number) {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (list[m] <= i) lo = m + 1
    else hi = m
  }
  return lo
}

/** Geometry of the Page Layout view: cells are pushed apart at page breaks to make room for margins. */
export class PageGeometry extends Geometry {
  readonly breaks: PageBreaks
  readonly mt: number
  readonly mb: number
  readonly ml: number
  readonly mr: number
  readonly gap: number
  /** Unzoomed printable page size in px. */
  readonly pageW: number
  readonly pageH: number

  constructor(sheet: Sheet, zoomPct: number, width: number, height: number, sx: number, sy: number, digits: number) {
    super(sheet, zoomPct, width, height, sx, sy, digits)
    const z = this.z
    const p = sheet.page
    const [pw, ph] = PAPER_IN[p.paper] ?? PAPER_IN.letter
    const [w, h] = p.orientation === 'landscape' ? [ph, pw] : [pw, ph]
    this.pageW = w * 96
    this.pageH = h * 96
    this.mt = p.margins.top * 96 * z
    this.mb = p.margins.bottom * 96 * z
    this.ml = p.margins.left * 96 * z
    this.mr = p.margins.right * 96 * z
    // room for the rulers drawn above and left of each page
    this.gap = 26 * z
    this.frozenW = 0
    this.frozenH = 0
    const used = sheet.used()
    this.breaks = computePageBreaks(sheet, Math.max(used.r + 200, 400), Math.max(used.c + 40, 60))
  }

  override get bodyX() {
    return this.headerW
  }

  override get bodyY() {
    return this.headerH
  }

  private rowPage(r: number) {
    return countBefore(this.breaks.rows, r)
  }

  private colPage(c: number) {
    return countBefore(this.breaks.cols, c)
  }

  override colX(c: number): number {
    return this.headerW + this.gap + this.ml + this.sheet.cols.offset(c) * this.z + this.colPage(c) * (this.mr + this.gap + this.ml) - this.sx
  }

  override rowY(r: number): number {
    return this.headerH + this.gap + this.mt + this.sheet.rows.offset(r) * this.z + this.rowPage(r) * (this.mb + this.gap + this.mt) - this.sy
  }

  private search(target: number, count: number, pos: (i: number) => number) {
    let lo = 0
    let hi = count - 1
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1
      if (pos(m) <= target) lo = m
      else hi = m - 1
    }
    return lo
  }

  override colAt(x: number): number {
    if (x < this.headerW) return -1
    return this.search(x, MAX_COLS, (c) => this.colX(c))
  }

  override rowAt(y: number): number {
    if (y < this.headerH) return -1
    return this.search(y, MAX_ROWS, (r) => this.rowY(r))
  }

  override visibleRows(): [number, number] {
    return [Math.max(0, this.rowAt(this.headerH)), Math.min(MAX_ROWS - 1, this.rowAt(this.height) + 1)]
  }

  override visibleCols(): [number, number] {
    return [Math.max(0, this.colAt(this.headerW)), Math.min(MAX_COLS - 1, this.colAt(this.width) + 1)]
  }

  override panes(): Pane[] {
    const [r0, r1] = this.visibleRows()
    const [c0, c1] = this.visibleCols()
    return [{ r0, r1, c0, c1, x: this.headerW, y: this.headerH, w: Math.max(0, this.width - this.headerW), h: Math.max(0, this.height - this.headerH), frozenR: false, frozenC: false }]
  }

  override scrollFor(r: number, c: number): { sx: number; sy: number } {
    let { sx, sy } = this
    const top = this.rowY(r) + this.sy - this.headerH
    const bottom = top + this.rowH(r)
    const viewH = this.height - this.headerH
    if (top < sy) sy = Math.max(0, top - this.mt)
    else if (bottom > sy + viewH) sy = Math.max(0, bottom - viewH + this.mb)
    const left = this.colX(c) + this.sx - this.headerW
    const right = left + this.colW(c)
    const viewW = this.width - this.headerW
    if (left < sx) sx = Math.max(0, left - this.ml)
    else if (right > sx + viewW) sx = Math.max(0, Math.min(left, right - viewW + this.mr))
    return { sx, sy }
  }

  override extent(usedR: number, usedC: number): { w: number; h: number } {
    const r = Math.min(MAX_ROWS - 1, usedR + 60)
    const c = Math.min(MAX_COLS - 1, usedC + 20)
    const h = this.rowY(r) + this.sy - this.headerH + this.mb + this.gap
    const w = this.colX(c) + this.sx - this.headerW + this.mr + this.gap
    return { w: Math.max(w, this.sx + this.width * 2), h: Math.max(h, this.sy + this.height * 2) }
  }

  override toCanvas(px: number, py: number) {
    const c = this.sheet.cols.indexAt(Math.max(0, px))
    const r = this.sheet.rows.indexAt(Math.max(0, py))
    return { x: this.colX(c) + (px - this.sheet.cols.offset(c)) * this.z, y: this.rowY(r) + (py - this.sheet.rows.offset(r)) * this.z }
  }

  override toSheet(x: number, y: number) {
    const c = Math.max(0, this.colAt(x))
    const r = Math.max(0, this.rowAt(y))
    return { x: this.sheet.cols.offset(c) + (x - this.colX(c)) / this.z, y: this.sheet.rows.offset(r) + (y - this.rowY(r)) / this.z }
  }

  /** Page rectangles (canvas px) that intersect the view, with their page numbers. */
  pageRects(): { x: number; y: number; w: number; h: number; n: number; r0: number; c0: number }[] {
    const out: { x: number; y: number; w: number; h: number; n: number; r0: number; c0: number }[] = []
    const rowStarts = [0, ...this.breaks.rows]
    const colStarts = [0, ...this.breaks.cols]
    const pw = this.pageW * this.z
    const ph = this.pageH * this.z
    const cols = colStarts.length
    rowStarts.forEach((r0, i) => {
      const y = this.rowY(r0) - this.mt
      if (y > this.height || y + ph < this.headerH) return
      colStarts.forEach((c0, j) => {
        const x = this.colX(c0) - this.ml
        if (x > this.width || x + pw < this.headerW) return
        out.push({ x, y, w: pw, h: ph, n: i * cols + j + 1, r0, c0 })
      })
    })
    return out
  }
}

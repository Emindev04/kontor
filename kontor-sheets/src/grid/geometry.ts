// Layout of the visible grid: header sizes, frozen panes, visible rows/columns and hit testing.
import { MAX_COLS, MAX_ROWS } from '../model/address'
import type { Sheet } from '../model/sheet'

export const HEADER_H = 20
const OUTLINE_STEP = 16

function maxLevel(m: Record<number, number>) {
  let x = 0
  for (const v of Object.values(m)) if (v > x) x = v
  return x
}
const MAX_SCROLL_PX = 30_000_000

export type Pane = { r0: number; r1: number; c0: number; c1: number; x: number; y: number; w: number; h: number; frozenR: boolean; frozenC: boolean }

export class Geometry {
  z: number
  headerW: number
  headerH: number
  /** Outline gutters left of the row headers / above the column headers. */
  ow: number
  oh: number
  frozenW: number
  frozenH: number
  /** Scroll offsets of the unfrozen area, zoomed pixels. */
  sx: number
  sy: number

  constructor(
    readonly sheet: Sheet,
    zoomPct: number,
    readonly width: number,
    readonly height: number,
    sx: number,
    sy: number,
    rowHeaderDigits: number,
  ) {
    this.z = zoomPct / 100
    const show = sheet.showHeadings
    const rl = maxLevel(sheet.x.outline.rows)
    const cl = maxLevel(sheet.x.outline.cols)
    this.ow = rl ? Math.round((rl + 1) * OUTLINE_STEP * this.z) + 2 : 0
    this.oh = cl ? Math.round((cl + 1) * OUTLINE_STEP * this.z) + 2 : 0
    this.headerH = (show ? Math.round(HEADER_H * this.z) : 0) + this.oh
    this.headerW = (show ? Math.round(Math.max(26, rowHeaderDigits * 7 + 12) * this.z) : 0) + this.ow
    this.frozenW = sheet.cols.offset(sheet.freeze.cols) * this.z
    this.frozenH = sheet.rows.offset(sheet.freeze.rows) * this.z
    this.sx = sx
    this.sy = sy
  }

  get bodyX() {
    return this.headerW + this.frozenW
  }

  get bodyY() {
    return this.headerH + this.frozenH
  }

  colX(c: number): number {
    const s = this.sheet
    if (c < s.freeze.cols) return this.headerW + s.cols.offset(c) * this.z
    return this.bodyX + (s.cols.offset(c) - s.cols.offset(s.freeze.cols)) * this.z - this.sx
  }

  rowY(r: number): number {
    const s = this.sheet
    if (r < s.freeze.rows) return this.headerH + s.rows.offset(r) * this.z
    return this.bodyY + (s.rows.offset(r) - s.rows.offset(s.freeze.rows)) * this.z - this.sy
  }

  colW(c: number) {
    return this.sheet.cols.size(c) * this.z
  }

  rowH(r: number) {
    return this.sheet.rows.size(r) * this.z
  }

  /** First and last fully/partially visible unfrozen rows. */
  visibleRows(): [number, number] {
    const s = this.sheet
    const base = s.rows.offset(s.freeze.rows)
    const first = Math.max(s.freeze.rows, s.rows.indexAt(base + this.sy / this.z))
    const last = Math.min(MAX_ROWS - 1, s.rows.indexAt(base + (this.sy + Math.max(0, this.height - this.bodyY)) / this.z))
    return [first, last]
  }

  visibleCols(): [number, number] {
    const s = this.sheet
    const base = s.cols.offset(s.freeze.cols)
    const first = Math.max(s.freeze.cols, s.cols.indexAt(base + this.sx / this.z))
    const last = Math.min(MAX_COLS - 1, s.cols.indexAt(base + (this.sx + Math.max(0, this.width - this.bodyX)) / this.z))
    return [first, last]
  }

  panes(): Pane[] {
    const s = this.sheet
    const [r0, r1] = this.visibleRows()
    const [c0, c1] = this.visibleCols()
    const fr = s.freeze.rows
    const fc = s.freeze.cols
    const out: Pane[] = []
    const bodyW = Math.max(0, this.width - this.bodyX)
    const bodyH = Math.max(0, this.height - this.bodyY)
    if (fr && fc) out.push({ r0: 0, r1: fr - 1, c0: 0, c1: fc - 1, x: this.headerW, y: this.headerH, w: this.frozenW, h: this.frozenH, frozenR: true, frozenC: true })
    if (fr) out.push({ r0: 0, r1: fr - 1, c0, c1, x: this.bodyX, y: this.headerH, w: bodyW, h: this.frozenH, frozenR: true, frozenC: false })
    if (fc) out.push({ r0, r1, c0: 0, c1: fc - 1, x: this.headerW, y: this.bodyY, w: this.frozenW, h: bodyH, frozenR: false, frozenC: true })
    out.push({ r0, r1, c0, c1, x: this.bodyX, y: this.bodyY, w: bodyW, h: bodyH, frozenR: false, frozenC: false })
    return out
  }

  /** Column at canvas x, or -1 for the row header. */
  colAt(x: number): number {
    const s = this.sheet
    if (x < this.headerW) return -1
    if (x < this.bodyX) return Math.min(s.freeze.cols - 1, s.cols.indexAt((x - this.headerW) / this.z))
    return s.cols.indexAt(s.cols.offset(s.freeze.cols) + (x - this.bodyX + this.sx) / this.z)
  }

  rowAt(y: number): number {
    const s = this.sheet
    if (y < this.headerH) return -1
    if (y < this.bodyY) return Math.min(s.freeze.rows - 1, s.rows.indexAt((y - this.headerH) / this.z))
    return s.rows.indexAt(s.rows.offset(s.freeze.rows) + (y - this.bodyY + this.sy) / this.z)
  }

  /** Scroll position (zoomed px) that brings a cell into view, or null when it already is. */
  scrollFor(r: number, c: number): { sx: number; sy: number } {
    const s = this.sheet
    let { sx, sy } = this
    if (r >= s.freeze.rows) {
      const top = (s.rows.offset(r) - s.rows.offset(s.freeze.rows)) * this.z
      const bottom = top + this.rowH(r)
      const viewH = this.height - this.bodyY
      if (top < sy) sy = top
      else if (bottom > sy + viewH) sy = Math.max(0, bottom - viewH)
    }
    if (c >= s.freeze.cols) {
      const left = (s.cols.offset(c) - s.cols.offset(s.freeze.cols)) * this.z
      const right = left + this.colW(c)
      const viewW = this.width - this.bodyX
      if (left < sx) sx = left
      else if (right > sx + viewW) sx = Math.max(0, Math.min(left, right - viewW))
    }
    return { sx, sy }
  }

  /** Unzoomed sheet pixels → canvas coordinates. */
  toCanvas(px: number, py: number) {
    const x = px * this.z < this.frozenW ? this.headerW + px * this.z : this.headerW + px * this.z - this.sx
    const y = py * this.z < this.frozenH ? this.headerH + py * this.z : this.headerH + py * this.z - this.sy
    return { x, y }
  }

  /** Canvas coordinates → unzoomed sheet pixels. */
  toSheet(x: number, y: number) {
    const px = x < this.bodyX ? (x - this.headerW) / this.z : (x - this.headerW + this.sx) / this.z
    const py = y < this.bodyY ? (y - this.headerH) / this.z : (y - this.headerH + this.sy) / this.z
    return { x: px, y: py }
  }

  /** Size of the scrollable area (content plus room to keep scrolling), zoomed px. */
  extent(usedR: number, usedC: number): { w: number; h: number } {
    const s = this.sheet
    const [, lastR] = this.visibleRows()
    const [, lastC] = this.visibleCols()
    const rows = Math.min(MAX_ROWS, Math.max(usedR + 1, lastR) + 60)
    const cols = Math.min(MAX_COLS, Math.max(usedC + 1, lastC) + 20)
    const h = (s.rows.offset(rows) - s.rows.offset(s.freeze.rows)) * this.z
    const w = (s.cols.offset(cols) - s.cols.offset(s.freeze.cols)) * this.z
    return { w: Math.max(w, this.sx + this.width * 2), h: Math.max(h, this.sy + this.height * 2) }
  }
}

/** Browsers cap element sizes; very tall sheets map scroll pixels to content pixels by a factor. */
export function scrollScale(contentPx: number) {
  return contentPx > MAX_SCROLL_PX ? contentPx / MAX_SCROLL_PX : 1
}

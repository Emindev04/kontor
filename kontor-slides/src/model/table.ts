// Tables: style catalog, cell formatting resolution and structural operations (insert, delete,
// merge, split, distribute). All functions are pure and return new table elements.
import type { CellSide, ColorRef, Fill, Line, RichDoc, SlideElement, TableCell, TableElement, TableOptions, TableRow, TextAlign } from './types'
import { emptyDoc, isDocEmpty, setParaAll } from './richtext'

export const DEFAULT_CELL_MARGINS: [number, number, number, number] = [9.6, 4.8, 9.6, 4.8]
export const DEFAULT_ROW_H = 40
export const DEFAULT_TABLE_OPTS: TableOptions = { headerRow: true, totalRow: false, bandedRows: true, firstCol: false, lastCol: false, bandedCols: false }

// ---------- Styles ----------

type Part = { fill?: ColorRef | null; color?: ColorRef; bold?: boolean; borders?: Partial<Record<CellSide | 'insideH' | 'insideV', Line>> }

export type TableStyleDef = {
  id: string
  name: string
  family: 'Plain' | 'Light' | 'Medium' | 'Dark'
  whole: Part
  header?: Part
  total?: Part
  firstCol?: Part
  lastCol?: Part
  band?: Part
}

const ACCENTS: { slot: string; label: string }[] = [
  { slot: 'tx1', label: 'Text' },
  { slot: 'accent1', label: 'Accent 1' },
  { slot: 'accent2', label: 'Accent 2' },
  { slot: 'accent3', label: 'Accent 3' },
  { slot: 'accent4', label: 'Accent 4' },
  { slot: 'accent5', label: 'Accent 5' },
  { slot: 'accent6', label: 'Accent 6' },
]

const ln = (color: ColorRef, width = 1): Line => ({ color, width, dash: 'solid' })

function buildStyles(): TableStyleDef[] {
  const out: TableStyleDef[] = [
    { id: 'none', name: 'Plain – No Grid', family: 'Plain', whole: { fill: null, color: 'theme:tx1' } },
    {
      id: 'grid',
      name: 'Plain – Grid',
      family: 'Plain',
      whole: { fill: null, color: 'theme:tx1', borders: { t: ln('theme:tx1'), r: ln('theme:tx1'), b: ln('theme:tx1'), l: ln('theme:tx1'), insideH: ln('theme:tx1'), insideV: ln('theme:tx1') } },
    },
  ]
  for (const { slot, label } of ACCENTS) {
    const c = `theme:${slot}`
    out.push({
      id: `light-${slot}`,
      name: `Light Lines – ${label}`,
      family: 'Light',
      whole: { fill: null, color: 'theme:tx1', borders: { t: ln(c, 1), b: ln(c, 1) } },
      header: { bold: true, borders: { b: ln(c, 1) } },
      total: { bold: true, borders: { t: ln(c, 1) } },
      firstCol: { bold: true },
      lastCol: { bold: true },
      band: { fill: `${c}:l80` },
    })
    out.push({
      id: `lightgrid-${slot}`,
      name: `Light Grid – ${label}`,
      family: 'Light',
      whole: { fill: null, color: 'theme:tx1', borders: { t: ln(c), r: ln(c), b: ln(c), l: ln(c), insideH: ln(c), insideV: ln(c) } },
      header: { bold: true, borders: { b: ln(c, 2.25) } },
      total: { bold: true, borders: { t: ln(c, 2.25) } },
      firstCol: { bold: true },
      lastCol: { bold: true },
      band: { fill: `${c}:l80` },
    })
    out.push({
      id: `medium-${slot}`,
      name: `Medium Banded – ${label}`,
      family: 'Medium',
      whole: { fill: `${c}:l80`, color: 'theme:tx1', borders: { insideH: ln('theme:bg1'), insideV: ln('theme:bg1'), t: ln('theme:bg1'), b: ln('theme:bg1'), l: ln('theme:bg1'), r: ln('theme:bg1') } },
      header: { fill: c, color: 'theme:bg1', bold: true, borders: { b: ln('theme:bg1', 3) } },
      total: { fill: c, color: 'theme:bg1', bold: true, borders: { t: ln('theme:bg1', 3) } },
      firstCol: { fill: c, color: 'theme:bg1', bold: true },
      lastCol: { fill: c, color: 'theme:bg1', bold: true },
      band: { fill: `${c}:l60` },
    })
    out.push({
      id: `mediumgrid-${slot}`,
      name: `Medium Grid – ${label}`,
      family: 'Medium',
      whole: { fill: `${c}:l80`, color: 'theme:tx1', borders: { t: ln(c), r: ln(c), b: ln(c), l: ln(c), insideH: ln(c), insideV: ln(c) } },
      header: { fill: `${c}:l40`, bold: true },
      total: { bold: true, borders: { t: ln(c, 2.25) } },
      firstCol: { bold: true },
      lastCol: { bold: true },
      band: { fill: `${c}:l60` },
    })
    out.push({
      id: `dark-${slot}`,
      name: `Dark – ${label}`,
      family: 'Dark',
      whole: { fill: slot === 'tx1' ? 'theme:tx1:l25' : `${c}:d25`, color: 'theme:bg1', borders: { insideH: ln('theme:bg1', 0.75), insideV: ln('theme:bg1', 0.75) } },
      header: { fill: slot === 'tx1' ? 'theme:tx1' : `${c}:d50`, color: 'theme:bg1', bold: true, borders: { b: ln('theme:bg1', 2.25) } },
      total: { fill: slot === 'tx1' ? 'theme:tx1' : `${c}:d50`, color: 'theme:bg1', bold: true, borders: { t: ln('theme:bg1', 2.25) } },
      firstCol: { fill: slot === 'tx1' ? 'theme:tx1' : `${c}:d50`, color: 'theme:bg1', bold: true },
      lastCol: { fill: slot === 'tx1' ? 'theme:tx1' : `${c}:d50`, color: 'theme:bg1', bold: true },
      band: { fill: slot === 'tx1' ? 'theme:tx1:l40' : c },
    })
  }
  return out
}

export const TABLE_STYLES = buildStyles()
export const DEFAULT_TABLE_STYLE = 'medium-accent1'

export function tableStyle(id: string) {
  return TABLE_STYLES.find((s) => s.id === id) ?? TABLE_STYLES.find((s) => s.id === DEFAULT_TABLE_STYLE)!
}

export type CellLook = { fill: Fill; color: ColorRef; bold: boolean; borders: Record<CellSide, Line> }

/** Resolved formatting of one cell: table style, style options and explicit cell formatting. */
export function cellLook(t: TableElement, r: number, c: number): CellLook {
  const st = tableStyle(t.styleId)
  const cell = t.rows[r]?.cells[c]
  const span = { r: cell?.rowSpan ?? 1, c: cell?.colSpan ?? 1 }
  const nRows = t.rows.length
  const nCols = t.cols.length
  const isHeader = t.opts.headerRow && r === 0
  const isTotal = t.opts.totalRow && r + span.r - 1 === nRows - 1 && !(isHeader && nRows === 1)
  const isFirst = t.opts.firstCol && c === 0
  const isLast = t.opts.lastCol && c + span.c - 1 === nCols - 1
  const bodyRow = r - (t.opts.headerRow ? 1 : 0)
  const bodyCol = c - (t.opts.firstCol ? 1 : 0)
  const banded = (t.opts.bandedRows && bodyRow >= 0 && bodyRow % 2 === 0) || (t.opts.bandedCols && bodyCol >= 0 && bodyCol % 2 === 0)
  // Lowest priority first; later parts override earlier ones.
  const parts: Part[] = [st.whole]
  if (banded && st.band) parts.push(st.band)
  if (isFirst && st.firstCol) parts.push(st.firstCol)
  if (isLast && st.lastCol) parts.push(st.lastCol)
  if (isTotal && st.total) parts.push(st.total)
  if (isHeader && st.header) parts.push(st.header)
  let fill: ColorRef | null = null
  let color: ColorRef = 'theme:tx1'
  let bold = false
  const borders: Record<CellSide, Line> = { t: null, r: null, b: null, l: null }
  const top = r === 0
  const bottom = r + span.r >= nRows
  const left = c === 0
  const right = c + span.c >= nCols
  for (const p of parts) {
    if (p.fill !== undefined) fill = p.fill
    if (p.color) color = p.color
    if (p.bold !== undefined) bold = p.bold
    const b = p.borders
    if (!b) continue
    if (top ? b.t !== undefined : b.insideH !== undefined) borders.t = (top ? b.t : b.insideH) ?? null
    if (bottom ? b.b !== undefined : b.insideH !== undefined) borders.b = (bottom ? b.b : b.insideH) ?? null
    if (left ? b.l !== undefined : b.insideV !== undefined) borders.l = (left ? b.l : b.insideV) ?? null
    if (right ? b.r !== undefined : b.insideV !== undefined) borders.r = (right ? b.r : b.insideV) ?? null
    // Header/total borders apply to their own edge even inside the table.
    if (p === st.header && b.b) borders.b = b.b
    if (p === st.total && b.t) borders.t = b.t
  }
  const own = cell?.borders
  if (own) for (const side of ['t', 'r', 'b', 'l'] as CellSide[]) if (side in own) borders[side] = own[side] ?? null
  let fillOut: Fill = fill ? { type: 'solid', color: fill } : { type: 'none' }
  if (cell && cell.fill !== undefined) fillOut = cell.fill ?? { type: 'none' }
  return { fill: fillOut, color, bold, borders }
}

// ---------- Creation ----------

export function emptyCell(): TableCell {
  return { doc: emptyDoc() }
}

export function createTable(rows: number, cols: number, box: { x: number; y: number; w: number }, id: string, name: string, styleId = DEFAULT_TABLE_STYLE): TableElement {
  const colW = box.w / cols
  return {
    id,
    type: 'table',
    name,
    x: box.x,
    y: box.y,
    w: box.w,
    h: rows * DEFAULT_ROW_H,
    rot: 0,
    cols: Array.from({ length: cols }, () => colW),
    rows: Array.from({ length: rows }, () => ({ h: DEFAULT_ROW_H, cells: Array.from({ length: cols }, emptyCell) })),
    styleId,
    opts: { ...DEFAULT_TABLE_OPTS },
  }
}

/** Keeps w/h equal to the sum of column widths and row heights. */
export function syncSize(t: TableElement): TableElement {
  const w = t.cols.reduce((a, b) => a + b, 0)
  const h = t.rows.reduce((a, r) => a + r.h, 0)
  return Math.abs(w - t.w) > 0.01 || Math.abs(h - t.h) > 0.01 ? { ...t, w, h } : t
}

export function scaleTable(t: TableElement, w: number, h: number): TableElement {
  const sx = t.w ? w / t.w : 1
  const sy = t.h ? h / t.h : 1
  return { ...t, w, h, cols: t.cols.map((c) => Math.max(8, c * sx)), rows: t.rows.map((r) => ({ ...r, h: Math.max(8, r.h * sy) })) }
}

// ---------- Cell ranges ----------

export type CellRange = { r0: number; c0: number; r1: number; c1: number }

export function normRange(a: { r: number; c: number }, b: { r: number; c: number }): CellRange {
  return { r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) }
}

/** The merge origin covering a grid position. */
export function originOf(t: TableElement, r: number, c: number): { r: number; c: number } {
  for (let rr = r; rr >= 0; rr--) {
    for (let cc = c; cc >= 0; cc--) {
      const cell = t.rows[rr]?.cells[cc]
      if (!cell || cell.merged) continue
      if (rr + (cell.rowSpan ?? 1) > r && cc + (cell.colSpan ?? 1) > c) return { r: rr, c: cc }
    }
  }
  return { r, c }
}

/** Grows a range so that it contains every merged cell it touches. */
export function expandRange(t: TableElement, range: CellRange): CellRange {
  let { r0, c0, r1, c1 } = range
  let changed = true
  while (changed) {
    changed = false
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const o = originOf(t, r, c)
        const cell = t.rows[o.r].cells[o.c]
        const er = o.r + (cell.rowSpan ?? 1) - 1
        const ec = o.c + (cell.colSpan ?? 1) - 1
        if (o.r < r0 || o.c < c0 || er > r1 || ec > c1) {
          r0 = Math.min(r0, o.r)
          c0 = Math.min(c0, o.c)
          r1 = Math.max(r1, er)
          c1 = Math.max(c1, ec)
          changed = true
        }
      }
    }
  }
  return { r0, c0, r1, c1 }
}

export function fullRange(t: TableElement): CellRange {
  return { r0: 0, c0: 0, r1: t.rows.length - 1, c1: t.cols.length - 1 }
}

export function mapCells(t: TableElement, range: CellRange | null, fn: (cell: TableCell, r: number, c: number) => TableCell): TableElement {
  const rg = range ?? fullRange(t)
  return {
    ...t,
    rows: t.rows.map((row, r) =>
      r < rg.r0 || r > rg.r1 ? row : { ...row, cells: row.cells.map((cell, c) => (c < rg.c0 || c > rg.c1 || cell.merged ? cell : fn(cell, r, c))) },
    ),
  }
}

export function setCellAlign(t: TableElement, range: CellRange | null, align: TextAlign) {
  return mapCells(t, range, (cell) => ({ ...cell, doc: setParaAll(cell.doc, { align }) }))
}

// ---------- Rows and columns ----------

export function insertRow(t: TableElement, at: number, copyFrom = Math.max(0, Math.min(t.rows.length - 1, at - 1))): TableElement {
  const src = t.rows[copyFrom]
  const cells: TableCell[] = t.cols.map((_, c) => {
    const s = src?.cells[c]
    return { doc: emptyDoc(), fill: s?.fill, borders: s?.borders, anchor: s?.anchor, margins: s?.margins }
  })
  const rows = [...t.rows]
  // Rows inserted inside a vertical merge join it.
  if (at > 0 && at < t.rows.length) {
    for (let c = 0; c < t.cols.length; c++) {
      const below = t.rows[at].cells[c]
      if (below.merged) {
        const o = originOf(t, at, c)
        if (o.r < at) {
          const origin = rows[o.r].cells[o.c]
          if (o.c === c) rows[o.r] = { ...rows[o.r], cells: rows[o.r].cells.map((x, i) => (i === o.c ? { ...origin, rowSpan: (origin.rowSpan ?? 1) + 1 } : x)) }
          cells[c] = { ...cells[c], merged: true }
        }
      }
    }
  }
  rows.splice(at, 0, { h: src?.h ?? DEFAULT_ROW_H, cells })
  return syncSize({ ...t, rows })
}

export function insertCol(t: TableElement, at: number, copyFrom = Math.max(0, Math.min(t.cols.length - 1, at - 1))): TableElement {
  const width = t.cols[copyFrom] ?? 96
  let rows = t.rows.map((row) => {
    const s = row.cells[copyFrom]
    const cell: TableCell = { doc: emptyDoc(), fill: s?.fill, borders: s?.borders, anchor: s?.anchor, margins: s?.margins }
    return { ...row, cells: [...row.cells.slice(0, at), cell, ...row.cells.slice(at)] }
  })
  if (at > 0 && at < t.cols.length) {
    rows = rows.map((row, r) => {
      const right = t.rows[r].cells[at]
      if (!right.merged) return row
      const o = originOf(t, r, at)
      if (o.c >= at) return row
      return { ...row, cells: row.cells.map((x, i) => (i === at ? { ...x, merged: true } : x)) }
    })
    for (let r = 0; r < t.rows.length; r++) {
      const o = originOf(t, r, at)
      if (o.c < at && o.r === r && t.rows[r].cells[at].merged) {
        const origin = rows[o.r].cells[o.c]
        rows[o.r] = { ...rows[o.r], cells: rows[o.r].cells.map((x, i) => (i === o.c ? { ...origin, colSpan: (origin.colSpan ?? 1) + 1 } : x)) }
      }
    }
  }
  const cols = [...t.cols.slice(0, at), width, ...t.cols.slice(at)]
  return syncSize({ ...t, cols, rows })
}

/** Removes merges that cross a set of rows or columns before they are deleted. */
function unmergeTouching(t: TableElement, test: (r: number, c: number, cell: TableCell) => boolean): TableElement {
  let out = t
  t.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (!cell.merged && ((cell.rowSpan ?? 1) > 1 || (cell.colSpan ?? 1) > 1) && test(r, c, cell)) out = unmerge(out, r, c)
    }),
  )
  return out
}

export function deleteRows(t: TableElement, r0: number, r1: number): TableElement | null {
  if (r1 - r0 + 1 >= t.rows.length) return null
  const u = unmergeTouching(t, (r, _c, cell) => r <= r1 && r + (cell.rowSpan ?? 1) - 1 >= r0)
  return syncSize({ ...u, rows: u.rows.filter((_, i) => i < r0 || i > r1) })
}

export function deleteCols(t: TableElement, c0: number, c1: number): TableElement | null {
  if (c1 - c0 + 1 >= t.cols.length) return null
  const u = unmergeTouching(t, (_r, c, cell) => c <= c1 && c + (cell.colSpan ?? 1) - 1 >= c0)
  return syncSize({ ...u, cols: u.cols.filter((_, i) => i < c0 || i > c1), rows: u.rows.map((row) => ({ ...row, cells: row.cells.filter((_, i) => i < c0 || i > c1) })) })
}

// ---------- Merge and split ----------

export function mergeCells(t: TableElement, range: CellRange): TableElement {
  const rg = expandRange(t, range)
  if (rg.r0 === rg.r1 && rg.c0 === rg.c1) return t
  const docs: RichDoc[] = []
  for (let r = rg.r0; r <= rg.r1; r++) for (let c = rg.c0; c <= rg.c1; c++) {
    const cell = t.rows[r].cells[c]
    if (!cell.merged && !isDocEmpty(cell.doc)) docs.push(cell.doc)
  }
  const merged: RichDoc = docs.length ? { type: 'doc', content: docs.flatMap((d) => d.content) } : emptyDoc()
  return {
    ...t,
    rows: t.rows.map((row, r) =>
      r < rg.r0 || r > rg.r1
        ? row
        : {
            ...row,
            cells: row.cells.map((cell, c) => {
              if (c < rg.c0 || c > rg.c1) return cell
              if (r === rg.r0 && c === rg.c0) return { ...cell, doc: merged, merged: undefined, rowSpan: rg.r1 - rg.r0 + 1, colSpan: rg.c1 - rg.c0 + 1 }
              return { doc: emptyDoc(), merged: true, fill: cell.fill, borders: cell.borders }
            }),
          },
    ),
  }
}

export function unmerge(t: TableElement, r: number, c: number): TableElement {
  const cell = t.rows[r]?.cells[c]
  if (!cell) return t
  const rs = cell.rowSpan ?? 1
  const cs = cell.colSpan ?? 1
  return {
    ...t,
    rows: t.rows.map((row, rr) =>
      rr < r || rr >= r + rs
        ? row
        : { ...row, cells: row.cells.map((x, cc) => (cc < c || cc >= c + cs ? x : rr === r && cc === c ? { ...x, rowSpan: undefined, colSpan: undefined } : { ...x, merged: undefined })) },
    ),
  }
}

/** Split Cells: undoes a merge, or divides a cell into rows × columns. */
export function splitCell(t: TableElement, r: number, c: number, nRows: number, nCols: number): TableElement {
  const o = originOf(t, r, c)
  const cell = t.rows[o.r].cells[o.c]
  const rs = cell.rowSpan ?? 1
  const cs = cell.colSpan ?? 1
  let out = rs > 1 || cs > 1 ? unmerge(t, o.r, o.c) : t
  const addCols = Math.max(0, nCols - cs)
  const addRows = Math.max(0, nRows - rs)
  const blank = (from?: TableCell): TableCell => ({ doc: emptyDoc(), fill: from?.fill, borders: from?.borders, anchor: from?.anchor, margins: from?.margins })
  if (addCols) {
    const lastC = o.c + cs - 1
    const width = out.cols.slice(o.c, lastC + 1).reduce((a, b) => a + b, 0)
    const before = out
    const rows: TableRow[] = out.rows.map((row, rr) => {
      const inBlock = rr >= o.r && rr < o.r + rs
      const added = Array.from({ length: addCols }, () => (inBlock ? blank(row.cells[lastC]) : { doc: emptyDoc(), merged: true }))
      return { ...row, cells: [...row.cells.slice(0, lastC + 1), ...added, ...row.cells.slice(lastC + 1)] }
    })
    // Cells of the other rows stretch over the new columns.
    const seen = new Set<string>()
    for (let rr = 0; rr < rows.length; rr++) {
      if (rr >= o.r && rr < o.r + rs) continue
      const og = originOf(before, rr, lastC)
      const key = `${og.r}:${og.c}`
      if (seen.has(key)) continue
      seen.add(key)
      const x = rows[og.r].cells[og.c]
      rows[og.r] = { ...rows[og.r], cells: rows[og.r].cells.map((y, i) => (i === og.c ? { ...x, colSpan: (x.colSpan ?? 1) + addCols } : y)) }
    }
    const cols = [...out.cols.slice(0, lastC + 1), ...Array<number>(addCols).fill(0), ...out.cols.slice(lastC + 1)].map((w, i) => (i >= o.c && i < o.c + nCols ? width / nCols : w))
    out = { ...out, cols, rows }
  }
  if (addRows) {
    const lastR = o.r + rs - 1
    const blockCols = Math.max(cs, nCols)
    const height = out.rows.slice(o.r, lastR + 1).reduce((a, x) => a + x.h, 0)
    const before = out
    const added: TableRow[] = Array.from({ length: addRows }, () => ({
      h: 0,
      cells: out.cols.map((_, cc) => (cc >= o.c && cc < o.c + blockCols ? blank(out.rows[lastR].cells[cc]) : { doc: emptyDoc(), merged: true })),
    }))
    const rows = [...out.rows.slice(0, lastR + 1), ...added, ...out.rows.slice(lastR + 1)]
    const seen = new Set<string>()
    for (let cc = 0; cc < out.cols.length; cc++) {
      if (cc >= o.c && cc < o.c + blockCols) continue
      const og = originOf(before, lastR, cc)
      const key = `${og.r}:${og.c}`
      if (seen.has(key)) continue
      seen.add(key)
      const x = rows[og.r].cells[og.c]
      rows[og.r] = { ...rows[og.r], cells: rows[og.r].cells.map((y, i) => (i === og.c ? { ...x, rowSpan: (x.rowSpan ?? 1) + addRows } : y)) }
    }
    out = { ...out, rows: rows.map((row, i) => (i >= o.r && i < o.r + nRows ? { ...row, h: height / nRows } : row)) }
  }
  return syncSize(out)
}

export function distributeRows(t: TableElement, r0: number, r1: number): TableElement {
  const total = t.rows.slice(r0, r1 + 1).reduce((a, r) => a + r.h, 0)
  const each = total / (r1 - r0 + 1)
  return syncSize({ ...t, rows: t.rows.map((r, i) => (i >= r0 && i <= r1 ? { ...r, h: each } : r)) })
}

export function distributeCols(t: TableElement, c0: number, c1: number): TableElement {
  const total = t.cols.slice(c0, c1 + 1).reduce((a, b) => a + b, 0)
  const each = total / (c1 - c0 + 1)
  return syncSize({ ...t, cols: t.cols.map((w, i) => (i >= c0 && i <= c1 ? each : w)) })
}

// ---------- Borders ----------

export type BorderKind = 'none' | 'all' | 'outside' | 'inside' | 'top' | 'bottom' | 'left' | 'right' | 'insideH' | 'insideV'

/** Applies a border to a range like the Borders menu: both neighbours of a shared edge get the line. */
export function applyBorders(t: TableElement, range: CellRange, kind: BorderKind, pen: Line): TableElement {
  const rg = expandRange(t, range)
  const line = kind === 'none' ? null : pen
  const rows = t.rows.map((row) => ({ ...row, cells: row.cells.map((c) => ({ ...c, borders: { ...c.borders } })) }))
  const set = (r: number, c: number, side: CellSide, value: Line) => {
    if (r < 0 || c < 0 || r >= rows.length || c >= t.cols.length) return
    const o = originOf(t, r, c)
    rows[o.r].cells[o.c].borders![side] = value
  }
  for (let r = rg.r0; r <= rg.r1; r++) {
    for (let c = rg.c0; c <= rg.c1; c++) {
      const top = r === rg.r0
      const bottom = r === rg.r1
      const left = c === rg.c0
      const right = c === rg.c1
      const want = (side: CellSide) => {
        const outer = side === 't' ? top : side === 'b' ? bottom : side === 'l' ? left : right
        switch (kind) {
          case 'none':
          case 'all':
            return true
          case 'outside':
            return outer
          case 'inside':
            return !outer
          case 'top':
            return side === 't' && top
          case 'bottom':
            return side === 'b' && bottom
          case 'left':
            return side === 'l' && left
          case 'right':
            return side === 'r' && right
          case 'insideH':
            return (side === 't' && !top) || (side === 'b' && !bottom)
          case 'insideV':
            return (side === 'l' && !left) || (side === 'r' && !right)
        }
      }
      for (const side of ['t', 'r', 'b', 'l'] as CellSide[]) {
        if (!want(side)) continue
        set(r, c, side, line)
        if (side === 't') set(r - 1, c, 'b', line)
        if (side === 'b') set(r + 1, c, 't', line)
        if (side === 'l') set(r, c - 1, 'r', line)
        if (side === 'r') set(r, c + 1, 'l', line)
      }
    }
  }
  return { ...t, rows }
}

// ---------- Text ----------

export function tableText(t: TableElement) {
  return t.rows.map((row) => row.cells.filter((c) => !c.merged).map((c) => c.doc.content.map((p) => (p.content ?? []).map((n) => (n.type === 'text' ? n.text : '')).join('')).join(' ')).join('\t')).join('\n')
}

export function isTable(e: SlideElement | undefined | null): e is TableElement {
  return e?.type === 'table'
}

/** Cells in reading order (for Tab navigation). */
export function nextCell(t: TableElement, r: number, c: number, dir: 1 | -1): { r: number; c: number } | null {
  const order: { r: number; c: number }[] = []
  t.rows.forEach((row, rr) => row.cells.forEach((cell, cc) => !cell.merged && order.push({ r: rr, c: cc })))
  const o = originOf(t, r, c)
  const i = order.findIndex((p) => p.r === o.r && p.c === o.c)
  return order[i + dir] ?? null
}

export function rowsFromGrid(grid: string[][]): TableRow[] {
  return grid.map((row) => ({ h: DEFAULT_ROW_H, cells: row.map((text) => ({ doc: text ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } : emptyDoc() })) }))
}

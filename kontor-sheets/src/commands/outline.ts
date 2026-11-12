// Group / Ungroup outlines, showing outline levels, collapsing details and Subtotal.
import { MAX_COLS, MAX_ROWS, colName, type Range } from '../model/address'
import type { Sheet } from '../model/sheet'
import type { Doc } from './doc'
import { insertDelete } from './ops'

type Axis = 'row' | 'col'

export const OUTLINE_STEP = 16

export function maxLevel(sheet: Sheet, axis: Axis): number {
  let m = 0
  for (const v of Object.values(axis === 'row' ? sheet.x.outline.rows : sheet.x.outline.cols)) if (v > m) m = v
  return m
}

export function levelAt(sheet: Sheet, axis: Axis, i: number): number {
  return (axis === 'row' ? sheet.x.outline.rows : sheet.x.outline.cols)[i] ?? 0
}

function setLevels(doc: Doc, axis: Axis, from: number, to: number, delta: number, label: string) {
  const sheet = doc.sheet
  doc.transact(label, () => {
    doc.noteProps(sheet)
    const m = { ...(axis === 'row' ? sheet.x.outline.rows : sheet.x.outline.cols) }
    for (let i = from; i <= to; i++) {
      const v = Math.max(0, Math.min(7, (m[i] ?? 0) + delta))
      if (v) m[i] = v
      else delete m[i]
    }
    if (axis === 'row') sheet.x.outline = { ...sheet.x.outline, rows: m }
    else sheet.x.outline = { ...sheet.x.outline, cols: m }
    if (delta < 0) {
      // ungrouped rows/columns become visible again
      const ax = axis === 'row' ? sheet.rows : sheet.cols
      for (let i = from; i <= to; i++) ax.hidden.delete(i)
      ax.touch()
    }
  })
}

/** Data → Group. `axis` decides rows or columns for a cell selection. */
export function group(doc: Doc, axis: Axis, rg: Range = doc.activeRange): string | null {
  const from = axis === 'row' ? rg.r1 : rg.c1
  const to = axis === 'row' ? Math.min(rg.r2, Math.max(rg.r1, doc.sheet.used().r)) : Math.min(rg.c2, Math.max(rg.c1, doc.sheet.used().c))
  for (let i = from; i <= to; i++) if (levelAt(doc.sheet, axis, i) >= 7) return 'You cannot group more than seven levels.'
  setLevels(doc, axis, from, to, 1, 'Group')
  return null
}

export function ungroup(doc: Doc, axis: Axis, rg: Range = doc.activeRange) {
  const from = axis === 'row' ? rg.r1 : rg.c1
  const to = axis === 'row' ? Math.min(rg.r2, MAX_ROWS - 1) : Math.min(rg.c2, MAX_COLS - 1)
  setLevels(doc, axis, from, Math.min(to, from + 100000), -1, 'Ungroup')
}

export function clearOutline(doc: Doc) {
  const sheet = doc.sheet
  doc.transact('Clear Outline', () => {
    doc.noteProps(sheet)
    for (const k of Object.keys(sheet.x.outline.rows)) sheet.rows.hidden.delete(Number(k))
    for (const k of Object.keys(sheet.x.outline.cols)) sheet.cols.hidden.delete(Number(k))
    sheet.rows.touch()
    sheet.cols.touch()
    sheet.x.outline = { ...sheet.x.outline, rows: {}, cols: {} }
  })
}

/** Clicking an outline level button: show everything up to `level`. */
export function showLevel(doc: Doc, axis: Axis, level: number) {
  const sheet = doc.sheet
  doc.transact('Show Level', () => {
    doc.noteProps(sheet)
    const m = axis === 'row' ? sheet.x.outline.rows : sheet.x.outline.cols
    const ax = axis === 'row' ? sheet.rows : sheet.cols
    for (const [k, v] of Object.entries(m)) {
      if (v >= level) ax.hidden.add(Number(k))
      else ax.hidden.delete(Number(k))
    }
    ax.touch()
  })
}

/** The run of indexes with level ≥ `level` that a summary row/column at `summary` belongs to. */
export function groupRun(sheet: Sheet, axis: Axis, summary: number, level: number): [number, number] | null {
  const below = axis === 'row' ? sheet.x.outline.summaryBelow : sheet.x.outline.summaryRight
  const step = below ? -1 : 1
  let i = summary + step
  if (levelAt(sheet, axis, i) < level) return null
  let end = i
  while (end + step >= 0 && levelAt(sheet, axis, end + step) >= level && Math.abs(end - i) < 1_000_000) end += step
  return below ? [end, i] : [i, end]
}

/** The +/- button: hides or shows the details of a group. */
export function toggleGroup(doc: Doc, axis: Axis, summary: number, level: number) {
  const sheet = doc.sheet
  const run = groupRun(sheet, axis, summary, level)
  if (!run) return
  const ax = axis === 'row' ? sheet.rows : sheet.cols
  let anyVisible = false
  for (let i = run[0]; i <= run[1]; i++) if (!ax.hidden.has(i)) anyVisible = true
  doc.transact(anyVisible ? 'Hide Detail' : 'Show Detail', () => {
    doc.noteProps(sheet)
    for (let i = run[0]; i <= run[1]; i++) {
      if (anyVisible) ax.hidden.add(i)
      else ax.hidden.delete(i)
    }
    ax.touch()
  })
}

/** Buttons drawn in the outline gutter for indexes [from, to]: summary index, level, collapsed. */
export function outlineButtons(sheet: Sheet, axis: Axis, from: number, to: number): { at: number; level: number; collapsed: boolean; run: [number, number] }[] {
  const m = axis === 'row' ? sheet.x.outline.rows : sheet.x.outline.cols
  const below = axis === 'row' ? sheet.x.outline.summaryBelow : sheet.x.outline.summaryRight
  const ax = axis === 'row' ? sheet.rows : sheet.cols
  const keys = Object.keys(m).map(Number).sort((a, b) => a - b)
  if (!keys.length) return []
  const out: { at: number; level: number; collapsed: boolean; run: [number, number] }[] = []
  const maxL = maxLevel(sheet, axis)
  for (let L = 1; L <= maxL; L++) {
    // runs of consecutive indexes with level >= L
    let start = -1
    let prev = -2
    const flush = (end: number) => {
      if (start < 0) return
      const at = below ? end + 1 : start - 1
      if (at >= 0 && at >= from - 1 && at <= to + 1) {
        let collapsed = true
        for (let i = start; i <= end; i++) if (!ax.hidden.has(i)) collapsed = false
        out.push({ at, level: L, collapsed, run: [start, end] })
      }
    }
    for (const k of keys) {
      if ((m[k] ?? 0) < L) continue
      if (k !== prev + 1) {
        flush(prev)
        start = k
      }
      prev = k
    }
    flush(prev)
  }
  return out
}

// ---------- Subtotal ----------

export const SUBTOTAL_FNS: [number, string][] = [
  [9, 'Sum'], [3, 'Count'], [1, 'Average'], [4, 'Max'], [5, 'Min'], [6, 'Product'], [2, 'Count Numbers'], [7, 'StdDev'], [8, 'StdDevp'], [10, 'Var'], [11, 'Varp'],
]

/** Data → Subtotal: inserts a total row after each change in `byCol` and an outline. */
export function subtotal(doc: Doc, rg0: Range, byCol: number, fn: number, cols: number[], opts: { replace: boolean; below: boolean }) {
  const sheet = doc.sheet
  const rg = doc.boundToUsed(rg0)
  if (rg.r2 <= rg.r1) return 'Select a range with a header row and data.'
  const label = SUBTOTAL_FNS.find((f) => f[0] === fn)?.[1] ?? 'Total'
  doc.transact('Subtotal', () => {
    if (opts.replace) removeSubtotals(doc, rg)
    const r1 = rg.r1 + 1
    let r2 = Math.max(r1, sheet.used().r)
    r2 = Math.min(r2, rg.r2 + 100000)
    // find the actual last data row of the block
    let last = r1
    for (let r = r1; r <= r2; r++) if (sheet.hasValue(r, byCol)) last = r
    const groups: { start: number; end: number; key: string }[] = []
    let start = r1
    for (let r = r1 + 1; r <= last + 1; r++) {
      const a = String(doc.value(r - 1, byCol) ?? '')
      const b = r <= last ? String(doc.value(r, byCol) ?? '') : '\u0000end'
      if (a !== b) {
        groups.push({ start, end: r - 1, key: a })
        start = r
      }
    }
    // insert total rows from the bottom up so earlier indexes stay valid
    const levels: Record<number, number> = {}
    for (let gi = groups.length - 1; gi >= 0; gi--) insertDelete(doc, 'row', groups[gi].end + 1, 1)
    // recompute group positions after the insertions
    let shift = 0
    const placed = groups.map((gr) => {
      const s = gr.start + shift
      const e = gr.end + shift
      shift++
      return { ...gr, start: s, end: e, total: e + 1 }
    })
    for (const gr of placed) {
      doc.write(sheet, gr.total, byCol, { v: `${gr.key} ${label === 'Sum' ? 'Total' : label}`, s: doc.wb.styles.intern({ bold: true }) })
      for (const c of cols) doc.write(sheet, gr.total, c, { f: `SUBTOTAL(${fn},${colName(c)}${gr.start + 1}:${colName(c)}${gr.end + 1})`, s: doc.wb.styles.intern({ bold: true }) })
      for (let r = gr.start; r <= gr.end; r++) levels[r] = 2
      levels[gr.total] = 1
    }
    const grandRow = (placed[placed.length - 1]?.total ?? last) + 1
    insertDelete(doc, 'row', grandRow, 1)
    doc.write(sheet, grandRow, byCol, { v: label === 'Sum' ? 'Grand Total' : `Grand ${label}`, s: doc.wb.styles.intern({ bold: true }) })
    for (const c of cols) doc.write(sheet, grandRow, c, { f: `SUBTOTAL(${fn},${colName(c)}${r1 + 1}:${colName(c)}${grandRow})`, s: doc.wb.styles.intern({ bold: true }) })
    doc.noteProps(sheet)
    sheet.x.outline = { ...sheet.x.outline, rows: { ...sheet.x.outline.rows, ...levels }, summaryBelow: opts.below }
  })
  return null
}

export function removeSubtotals(doc: Doc, rg0: Range) {
  const sheet = doc.sheet
  const rg = doc.boundToUsed(rg0)
  doc.transact('Remove Subtotals', () => {
    for (let r = Math.min(sheet.used().r, rg.r2 + 1000); r > rg.r1; r--) {
      let isTotal = false
      for (let c = rg.c1; c <= rg.c2; c++) if (/^SUBTOTAL\(/i.test(sheet.get(r, c)?.f ?? '')) isTotal = true
      if (isTotal) insertDelete(doc, 'row', r, -1)
    }
    doc.noteProps(sheet)
    for (const k of Object.keys(sheet.x.outline.rows)) sheet.rows.hidden.delete(Number(k))
    sheet.rows.touch()
    sheet.x.outline = { ...sheet.x.outline, rows: {} }
  })
}

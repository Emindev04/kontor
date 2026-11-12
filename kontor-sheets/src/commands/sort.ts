// Sorting, current-region detection and Remove Duplicates.
import { MAX_COLS, MAX_ROWS, cellKey, type Cell, type Range } from '../model/address'
import type { CellData } from '../model/sheet'
import { CellError, type Scalar } from '../model/types'
import { shiftFormula } from '../engine/refs'
import { compareValues } from '../engine/values'
import type { Doc } from './doc'
import { blocked } from './review'

/** The block of non-empty cells around `cell` (Ctrl+A / Ctrl+Shift+*). */
export function currentRegion(doc: Doc, cell: Cell): Range {
  const sheet = doc.sheet
  let rg: Range = { r1: cell.r, c1: cell.c, r2: cell.r, c2: cell.c }
  const has = (r: number, c: number) => r >= 0 && c >= 0 && r < MAX_ROWS && c < MAX_COLS && sheet.hasValue(r, c)
  for (let guard = 0; guard < 10000; guard++) {
    let grown = false
    const { r1, c1, r2, c2 } = rg
    for (let c = c1 - 1; c <= c2 + 1; c++) {
      if (has(r1 - 1, c)) { rg = { ...rg, r1: r1 - 1 }; grown = true; break }
    }
    for (let c = rg.c1 - 1; c <= rg.c2 + 1; c++) {
      if (has(r2 + 1, c)) { rg = { ...rg, r2: r2 + 1 }; grown = true; break }
    }
    for (let r = rg.r1 - 1; r <= rg.r2 + 1; r++) {
      if (has(r, c1 - 1)) { rg = { ...rg, c1: c1 - 1 }; grown = true; break }
    }
    for (let r = rg.r1 - 1; r <= rg.r2 + 1; r++) {
      if (has(r, c2 + 1)) { rg = { ...rg, c2: c2 + 1 }; grown = true; break }
    }
    rg = { r1: Math.max(0, rg.r1), c1: Math.max(0, rg.c1), r2: Math.min(MAX_ROWS - 1, rg.r2), c2: Math.min(MAX_COLS - 1, rg.c2) }
    if (!grown) break
  }
  return rg
}

/** Guesses whether the first row is a header: text over numbers, or bold over plain. */
export function detectHeader(doc: Doc, rg: Range): boolean {
  if (rg.r2 <= rg.r1) return false
  let textOverOther = false
  let styled = false
  for (let c = rg.c1; c <= rg.c2; c++) {
    const top = doc.value(rg.r1, c)
    const below = doc.value(rg.r1 + 1, c)
    if (typeof top === 'string' && typeof below !== 'string' && below !== null) textOverOther = true
    if (doc.style(rg.r1, c).bold && !doc.style(rg.r1 + 1, c).bold) styled = true
    if (top === null) return false
  }
  return textOverOther || styled
}

export type SortKey = { index: number; desc: boolean; by?: 'value' | 'fill' | 'color'; list?: string[] }

/** The built-in custom lists offered by Sort > Order > Custom List. */
export const CUSTOM_LISTS: string[][] = [
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
]

function sortValue(v: Scalar): Scalar {
  return v
}

function cmp(a: Scalar, b: Scalar, caseSensitive: boolean): number {
  const ae = a === null || a === ''
  const be = b === null || b === ''
  if (ae && be) return 0
  if (ae) return 2
  if (be) return -2
  if (a instanceof CellError || b instanceof CellError) return a instanceof CellError ? (b instanceof CellError ? 0 : 1) : -1
  if (caseSensitive && typeof a === 'string' && typeof b === 'string') {
    const c = a.localeCompare(b, 'en', { sensitivity: 'variant', caseFirst: 'lower' })
    return Math.sign(c)
  }
  return compareValues(a, b)
}

/**
 * Sorts the rows (or columns) of `rg`. `index` in each key is the absolute column (or row) used for sorting.
 * Blank values always go last, whatever the order.
 */
export function sortRange(doc: Doc, rg0: Range, keys: SortKey[], opts: { header: boolean; caseSensitive?: boolean; byColumns?: boolean }) {
  if (blocked(doc, 'sort')) return
  const sheet = doc.sheet
  const rg = doc.boundToUsed(rg0)
  const byCols = !!opts.byColumns
  const start = byCols ? rg.c1 + (opts.header ? 1 : 0) : rg.r1 + (opts.header ? 1 : 0)
  const end = byCols ? rg.c2 : rg.r2
  if (end <= start) return
  type Line = { from: number; cells: (CellData | undefined)[]; keys: Scalar[]; colors: (string | undefined)[] }
  const lines: Line[] = []
  for (let i = start; i <= end; i++) {
    const cells: (CellData | undefined)[] = []
    if (byCols) for (let r = rg.r1; r <= rg.r2; r++) cells.push(sheet.get(r, i))
    else for (let c = rg.c1; c <= rg.c2; c++) cells.push(sheet.get(i, c))
    const kv = keys.map((k) => sortValue(byCols ? doc.value(k.index, i) : doc.value(i, k.index)))
    const colors = keys.map((k) => {
      const st = byCols ? doc.style(k.index, i) : doc.style(i, k.index)
      return k.by === 'fill' ? st.fill : k.by === 'color' ? st.color : undefined
    })
    lines.push({ from: i, cells, keys: kv, colors })
  }
  lines.sort((a, b) => {
    for (let k = 0; k < keys.length; k++) {
      let c: number
      if (keys[k].by === 'fill' || keys[k].by === 'color') {
        c = (a.colors[k] ? 0 : 1) - (b.colors[k] ? 0 : 1)
        if (c === 0 && a.colors[k] !== b.colors[k]) c = String(a.colors[k]).localeCompare(String(b.colors[k]))
      } else if (keys[k].list) {
        // custom list order; values not in the list go last
        const pos = (v: Scalar) => {
          const i = keys[k].list!.findIndex((x) => x.toLowerCase() === String(v ?? '').toLowerCase())
          return i < 0 ? Infinity : i
        }
        const pa = pos(a.keys[k])
        const pb = pos(b.keys[k])
        c = pa === pb ? cmp(a.keys[k], b.keys[k], !!opts.caseSensitive) : pa < pb ? -1 : 1
      } else c = cmp(a.keys[k], b.keys[k], !!opts.caseSensitive)
      if (c === 2 || c === -2) return c
      if (c) return keys[k].desc ? -c : c
    }
    return a.from - b.from
  })
  doc.transact('Sort', () => {
    lines.forEach((line, idx) => {
      const to = start + idx
      line.cells.forEach((d, j) => {
        const r = byCols ? rg.r1 + j : to
        const c = byCols ? to : rg.c1 + j
        let next = d
        if (d?.f !== undefined && line.from !== to) next = { ...d, f: shiftFormula(d.f, byCols ? 0 : to - line.from, byCols ? to - line.from : 0) }
        const cur = sheet.cells.get(cellKey(r, c))
        if (cur !== next) doc.write(sheet, r, c, next)
      })
    })
  })
}

/** Sort A→Z / Z→A from the Home and Data tabs: sorts the current region by the active column. */
export function quickSort(doc: Doc, desc: boolean) {
  const sel = doc.sel
  let rg = doc.activeRange
  const single = rg.r1 === rg.r2 && rg.c1 === rg.c2
  if (single) rg = currentRegion(doc, sel.active)
  const header = detectHeader(doc, rg)
  sortRange(doc, rg, [{ index: sel.active.c, desc }], { header })
  if (single) doc.selectRange(rg, sel.active)
}

/** Data → Remove Duplicates. Returns the number of removed rows. */
export function removeDuplicates(doc: Doc, rg0: Range, cols: number[], header: boolean): { removed: number; remaining: number } {
  const sheet = doc.sheet
  const rg = doc.boundToUsed(rg0)
  const start = rg.r1 + (header ? 1 : 0)
  const keep: number[] = []
  const seen = new Set<string>()
  for (let r = start; r <= rg.r2; r++) {
    const key = JSON.stringify(cols.map((c) => {
      const v = doc.value(r, c)
      return typeof v === 'string' ? v.toUpperCase() : v instanceof CellError ? v.code : v
    }))
    if (seen.has(key)) continue
    seen.add(key)
    keep.push(r)
  }
  const removed = rg.r2 - start + 1 - keep.length
  if (!removed) return { removed: 0, remaining: keep.length }
  doc.transact('Remove Duplicates', () => {
    const rows = keep.map((r) => {
      const cells: (CellData | undefined)[] = []
      for (let c = rg.c1; c <= rg.c2; c++) cells.push(sheet.get(r, c))
      return { r, cells }
    })
    for (let r = start; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) doc.write(sheet, r, c, undefined)
    rows.forEach((row, i) => {
      row.cells.forEach((d, j) => {
        const to = start + i
        const next = d?.f !== undefined && row.r !== to ? { ...d, f: shiftFormula(d.f, to - row.r, 0) } : d
        doc.write(sheet, to, rg.c1 + j, next)
      })
    })
  })
  return { removed, remaining: keep.length }
}

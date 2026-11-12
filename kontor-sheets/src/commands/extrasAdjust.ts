// Keeps sheet extras (tables, rules, notes, objects …) in place when rows/columns are inserted
// or deleted, and rewrites the formulas they contain together with the cell formulas.
import { MAX_COLS, MAX_ROWS, cellKey, keyCol, keyRow, type Range } from '../model/address'
import type { Sheet } from '../model/sheet'
import type { Workbook } from '../model/workbook'

type Axis = 'row' | 'col'

/** Shifts one range; returns null when it was deleted completely. */
export function shiftRange(rg: Range, axis: Axis, at: number, count: number): Range | null {
  let a = axis === 'row' ? rg.r1 : rg.c1
  let b = axis === 'row' ? rg.r2 : rg.c2
  const max = (axis === 'row' ? MAX_ROWS : MAX_COLS) - 1
  if (count > 0) {
    if (a >= at) a = Math.min(max, a + count)
    if (b >= at) b = Math.min(max, b + count)
  } else {
    const n = -count
    const end = at + n
    if (a >= at && b < end) return null
    a = a < at ? a : a >= end ? a - n : at
    b = b < at ? b : b >= end ? b - n : at - 1
  }
  return axis === 'row' ? { ...rg, r1: a, r2: b } : { ...rg, c1: a, c2: b }
}

function shiftIndex(i: number, at: number, count: number, max: number): number | null {
  if (i < at) return i
  if (count < 0 && i < at - count) return null
  const n = i + count
  return n < max ? n : null
}

function shiftKeyed<T>(m: Record<number, T>, axis: Axis, at: number, count: number): Record<number, T> {
  const out: Record<number, T> = {}
  for (const [ks, v] of Object.entries(m)) {
    const k = Number(ks)
    const r = keyRow(k)
    const c = keyCol(k)
    const x = shiftIndex(axis === 'row' ? r : c, at, count, axis === 'row' ? MAX_ROWS : MAX_COLS)
    if (x === null) continue
    out[axis === 'row' ? cellKey(x, c) : cellKey(r, x)] = v
  }
  return out
}

function shiftLevels(m: Record<number, number>, at: number, count: number, max: number): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [ks, v] of Object.entries(m)) {
    const x = shiftIndex(Number(ks), at, count, max)
    if (x !== null) out[x] = v
  }
  return out
}

/**
 * Adjusts the extras of `sheet` for an insert (count > 0) or delete (count < 0) at `at`.
 * Call before the axis sizes are shifted: object positions use the current row/column offsets.
 */
export function adjustExtras(sheet: Sheet, axis: Axis, at: number, count: number) {
  const x = sheet.x
  const max = axis === 'row' ? MAX_ROWS : MAX_COLS
  const shiftAll = (ranges: Range[]) => ranges.map((r) => shiftRange(r, axis, at, count)).filter((r): r is Range => !!r)
  x.tables = x.tables.filter((t) => {
    const before = t.range
    const nr = shiftRange(t.range, axis, at, count)
    if (!nr) return false
    t.range = nr
    if (axis === 'col') {
      // columns inserted/deleted inside a table add/remove table columns
      const w0 = before.c2 - before.c1 + 1
      const w1 = nr.c2 - nr.c1 + 1
      if (w1 > w0 && at > before.c1 && at <= before.c2 + 1) {
        const idx = at - before.c1
        const names = new Set(t.columns.map((c) => c.name.toUpperCase()))
        const added = []
        for (let i = 0, n = 1; i < w1 - w0; i++) {
          while (names.has(`COLUMN${n}`)) n++
          names.add(`COLUMN${n}`)
          added.push({ name: `Column${n}`, total: 'none' as const })
        }
        t.columns.splice(idx, 0, ...added)
      } else if (w1 < w0) {
        const from = Math.max(0, at - before.c1)
        t.columns.splice(from, w0 - w1)
      }
    }
    return true
  })
  if (x.autoFilter) {
    const nr = shiftRange(x.autoFilter.range, axis, at, count)
    x.autoFilter = nr ? { ...x.autoFilter, range: nr } : null
  }
  x.cf = x.cf.filter((r) => {
    r.ranges = shiftAll(r.ranges)
    return r.ranges.length > 0
  })
  x.validations = x.validations.filter((v) => {
    v.ranges = shiftAll(v.ranges)
    return v.ranges.length > 0
  })
  x.editRanges = x.editRanges.filter((e) => {
    const nr = shiftRange(e.range, axis, at, count)
    if (nr) e.range = nr
    return !!nr
  })
  x.notes = shiftKeyed(x.notes, axis, at, count)
  x.comments = shiftKeyed(x.comments, axis, at, count)
  if (axis === 'row') x.outline.rows = shiftLevels(x.outline.rows, at, count, max)
  else x.outline.cols = shiftLevels(x.outline.cols, at, count, max)
  x.sparklines = x.sparklines.filter((s) => {
    const i = shiftIndex(axis === 'row' ? s.r : s.c, at, count, max)
    if (i === null) return false
    if (axis === 'row') s.r = i
    else s.c = i
    return true
  })
  for (const p of x.pivots) {
    const i = shiftIndex(axis === 'row' ? p.r : p.c, at, count, max) ?? at
    if (axis === 'row') p.r = i
    else p.c = i
    if (p.output) p.output = shiftRange(p.output, axis, at, count) ?? undefined
  }
  const breaks = (list: number[]) => list.map((i) => shiftIndex(i, at, count, max)).filter((i): i is number => i !== null && i > 0)
  if (axis === 'row') {
    x.rowBreaks = breaks(x.rowBreaks)
    x.filtered = breaks(x.filtered)
  } else x.colBreaks = breaks(x.colBreaks)
  // floating objects move with the cells below/right of the change
  const ax = axis === 'row' ? sheet.rows : sheet.cols
  const p0 = ax.offset(at)
  const delta = count > 0 ? count * ax.def : -(ax.offset(at - count) - p0)
  for (const o of x.objects) {
    const pos = axis === 'row' ? o.anchor.y : o.anchor.x
    if (pos < p0) continue
    const next = count < 0 && pos < p0 - delta ? p0 : pos + delta
    if (axis === 'row') o.anchor = { ...o.anchor, y: next }
    else o.anchor = { ...o.anchor, x: next }
  }
}

/** Rewrites every formula stored in sheet extras (chart data, rule formulas, validation lists …). */
export function rewriteExtrasFormulas(wb: Workbook, fn: (f: string, host: Sheet) => string) {
  const safe = (f: string | undefined, host: Sheet) => {
    if (f === undefined || f === '') return f
    const body = f.startsWith('=') ? f.slice(1) : f
    const out = fn(body, host)
    return f.startsWith('=') ? '=' + out : out
  }
  for (const s of wb.sheets) {
    const x = s.x
    for (const o of x.objects) {
      if (o.kind !== 'chart') continue
      o.source = safe(o.source, s) ?? ''
      if (o.series) for (const se of o.series) {
        se.values = safe(se.values, s) ?? se.values
        se.categories = safe(se.categories, s)
        if (se.name && /!/.test(se.name)) se.name = safe(se.name, s)
      }
    }
    for (const r of x.cf) {
      if (r.type === 'cellIs') {
        r.f1 = safe(r.f1, s) ?? r.f1
        r.f2 = safe(r.f2, s)
      } else if (r.type === 'expression') r.formula = safe(r.formula, s) ?? r.formula
    }
    for (const v of x.validations) {
      if (v.type === 'list' && v.f1 && !v.f1.startsWith('=')) continue
      v.f1 = safe(v.f1, s)
      v.f2 = safe(v.f2, s)
    }
    for (const sp of x.sparklines) sp.source = safe(sp.source, s) ?? sp.source
    for (const p of x.pivots) p.source = safe(p.source, s) ?? p.source
  }
}

/**
 * Runs a column-width / row-height change and lets floating objects move and size with their cells
 * (the default placement in the original): each corner keeps its cell and its offset inside it.
 */
export function objectsFollowCells(sheet: Sheet, change: () => void) {
  const objs = sheet.x.objects
  if (!objs.length) {
    change()
    return
  }
  const corner = (px: number, ax: Sheet['cols']) => {
    const i = ax.indexAt(Math.max(0, px))
    return { i, off: Math.max(0, px - ax.offset(i)) }
  }
  const before = objs.map((o) => {
    const a = o.anchor
    return { x1: corner(a.x, sheet.cols), y1: corner(a.y, sheet.rows), x2: corner(a.x + a.w, sheet.cols), y2: corner(a.y + a.h, sheet.rows) }
  })
  change()
  const place = (p: { i: number; off: number }, ax: Sheet['cols']) => ax.offset(p.i) + Math.min(p.off, ax.size(p.i))
  objs.forEach((o, n) => {
    const b = before[n]
    const x = place(b.x1, sheet.cols)
    const y = place(b.y1, sheet.rows)
    const w = Math.max(1, place(b.x2, sheet.cols) - x)
    const h = Math.max(1, place(b.y2, sheet.rows) - y)
    if (x !== o.anchor.x || y !== o.anchor.y || w !== o.anchor.w || h !== o.anchor.h) o.anchor = { x, y, w, h }
  })
}

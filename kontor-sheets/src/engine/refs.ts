// Text-level reference rewriting: copying formulas, inserting/deleting rows and columns,
// moving cells and renaming sheets. Works on tokens, so spacing in formulas is preserved.
import { MAX_COLS, MAX_ROWS, colName, quoteSheet, type Range } from '../model/address'
import { tokenize, type RefEnd, type RefParts } from './tokenizer'

/** "Sheet1:Sheet3" or "'Jan 2026:Mar 2026'" (quoted as one unit). */
function quoteSheetSpan(a: string, b: string): string {
  const qa = quoteSheet(a)
  const qb = quoteSheet(b)
  return qa === a && qb === b ? `${a}:${b}` : `'${a.replace(/'/g, "''")}:${b.replace(/'/g, "''")}'`
}

export function refText(p: RefParts): string {
  const sheet = p.sheet === undefined ? '' : p.sheet2 !== undefined ? quoteSheetSpan(p.sheet, p.sheet2) + '!' : quoteSheet(p.sheet) + '!'
  const col = (e: RefEnd) => `${e.absC ? '$' : ''}${colName(e.col!)}`
  const row = (e: RefEnd) => `${e.absR ? '$' : ''}${e.row! + 1}`
  if (p.kind === 'cols') return `${sheet}${col(p.a)}:${col(p.b!)}`
  if (p.kind === 'rows') return `${sheet}${row(p.a)}:${row(p.b!)}`
  if (p.kind === 'cell') return `${sheet}${col(p.a)}${row(p.a)}`
  return `${sheet}${col(p.a)}${row(p.a)}:${col(p.b!)}${row(p.b!)}`
}

function normalizeParts(p: RefParts): RefParts {
  if (!p.b) return p
  const a = { ...p.a }
  const b = { ...p.b }
  if (a.col !== undefined && b.col !== undefined && a.col > b.col) {
    ;[a.col, b.col] = [b.col, a.col]
    ;[a.absC, b.absC] = [b.absC, a.absC]
  }
  if (a.row !== undefined && b.row !== undefined && a.row > b.row) {
    ;[a.row, b.row] = [b.row, a.row]
    ;[a.absR, b.absR] = [b.absR, a.absR]
  }
  return { ...p, a, b }
}

export function mapRefs(formula: string, fn: (p: RefParts) => RefParts | null): string {
  let out = ''
  for (const t of tokenize(formula)) {
    if (t.type === 'ref') {
      const r = fn(normalizeParts(t.ref!))
      out += r ? refText(r) : '#REF!'
    } else out += t.text
  }
  return out
}

/** Adjusts relative references for a formula copied by (dr, dc). */
export function shiftFormula(formula: string, dr: number, dc: number): string {
  if (dr === 0 && dc === 0) return formula
  return mapRefs(formula, (p) => {
    const ends = p.b ? [p.a, p.b] : [p.a]
    for (const e of ends) {
      if (e.row !== undefined && !e.absR) {
        e.row += dr
        if (e.row < 0 || e.row >= MAX_ROWS) return null
      }
      if (e.col !== undefined && !e.absC) {
        e.col += dc
        if (e.col < 0 || e.col >= MAX_COLS) return null
      }
    }
    return p
  })
}

const sameSheet = (a: string | undefined, b: string) => a !== undefined && a.toUpperCase() === b.toUpperCase()

/**
 * Rewrites references after rows/columns were inserted (count > 0) or deleted (count < 0)
 * at index `at` on sheet `target`. `host` is the sheet that contains the formula.
 */
export function adjustFormula(formula: string, host: string, target: string, axis: 'row' | 'col', at: number, count: number): string {
  return mapRefs(formula, (p) => {
    const sheet = p.sheet ?? host
    // 3-D references span several sheets and stay as they are, like in the original
    if (p.sheet2 !== undefined || !sameSheet(sheet, target)) return p
    if (axis === 'row' && p.kind === 'cols') return p
    if (axis === 'col' && p.kind === 'rows') return p
    const key = axis === 'row' ? 'row' : 'col'
    const max = axis === 'row' ? MAX_ROWS : MAX_COLS
    if (count > 0) {
      for (const e of p.b ? [p.a, p.b] : [p.a]) {
        if (e[key]! >= at) {
          e[key]! += count
          if (e[key]! >= max) {
            if (p.b && e === p.b) e[key] = max - 1
            else return null
          }
        }
      }
      return p
    }
    const n = -count
    const end = at + n
    if (!p.b) {
      const x = p.a[key]!
      if (x >= at && x < end) return null
      if (x >= end) p.a[key] = x - n
      return p
    }
    const x1 = p.a[key]!
    const x2 = p.b[key]!
    if (x1 >= at && x2 < end) return null
    p.a[key] = x1 < at ? x1 : x1 >= end ? x1 - n : at
    p.b[key] = x2 < at ? x2 : x2 >= end ? x2 - n : at - 1
    return p
  })
}

/** Rewrites references that point into `src` (on `srcSheet`) after those cells moved by (dr, dc) to `dstSheet`. */
export function moveRefs(formula: string, host: string, srcSheet: string, src: Range, dstSheet: string, dr: number, dc: number): string {
  return mapRefs(formula, (p) => {
    const sheet = p.sheet ?? host
    if (p.sheet2 !== undefined || !sameSheet(sheet, srcSheet) || p.kind === 'cols' || p.kind === 'rows') return p
    const b = p.b ?? p.a
    const inside = p.a.row! >= src.r1 && b.row! <= src.r2 && p.a.col! >= src.c1 && b.col! <= src.c2
    if (!inside) return p
    for (const e of p.b ? [p.a, p.b] : [p.a]) {
      e.row! += dr
      e.col! += dc
      if (e.row! < 0 || e.row! >= MAX_ROWS || e.col! < 0 || e.col! >= MAX_COLS) return null
    }
    if (p.sheet !== undefined || !sameSheet(dstSheet, host)) p.sheet = dstSheet
    return p
  })
}

export function renameSheetRefs(formula: string, oldName: string, newName: string): string {
  if (!formula.toUpperCase().includes(oldName.toUpperCase())) return formula
  return mapRefs(formula, (p) => {
    if (sameSheet(p.sheet, oldName)) p.sheet = newName
    if (sameSheet(p.sheet2, oldName)) p.sheet2 = newName
    return p
  })
}

export function deleteSheetRefs(formula: string, name: string): string {
  if (!formula.toUpperCase().includes(name.toUpperCase())) return formula
  return mapRefs(formula, (p) => (sameSheet(p.sheet, name) || sameSheet(p.sheet2, name) ? null : p))
}

/** Cycles the reference at `pos` through A1 → $A$1 → A$1 → $A1 (the F4 key). */
export function cycleAbsolute(text: string, pos: number): { text: string; start: number; end: number } | null {
  const body = text.startsWith('=') ? text.slice(1) : text
  const offset = text.length - body.length
  for (const t of tokenize(body)) {
    if (t.type !== 'ref') continue
    if (pos < t.start + offset || pos > t.end + offset) continue
    const p = t.ref!
    const ends = p.b ? [p.a, p.b] : [p.a]
    const state = (e: RefEnd) => (e.absC && e.absR ? 1 : !e.absC && e.absR ? 2 : e.absC && !e.absR ? 3 : 0)
    const nextState = (state(p.a) + 1) % 4
    for (const e of ends) {
      e.absC = nextState === 1 || nextState === 3
      e.absR = nextState === 1 || nextState === 2
      if (p.kind === 'cols') e.absR = false
      if (p.kind === 'rows') e.absC = false
    }
    const replaced = refText(p)
    const s = t.start + offset
    return { text: text.slice(0, s) + replaced + text.slice(t.end + offset), start: s, end: s + replaced.length }
  }
  return null
}

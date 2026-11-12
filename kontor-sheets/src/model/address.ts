export const MAX_ROWS = 1048576
export const MAX_COLS = 16384

/** Inclusive, normalized cell range (0-based). */
export type Range = { r1: number; c1: number; r2: number; c2: number }
export type Cell = { r: number; c: number }

export const cellKey = (r: number, c: number) => r * MAX_COLS + c
export const keyRow = (k: number) => Math.floor(k / MAX_COLS)
export const keyCol = (k: number) => k % MAX_COLS

export function colName(c: number): string {
  let s = ''
  let n = c + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Column letters to 0-based index, or -1 when invalid / beyond XFD. */
export function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) return -1
    n = n * 26 + (code - 64)
  }
  return n >= 1 && n <= MAX_COLS ? n - 1 : -1
}

export const cellName = (r: number, c: number) => `${colName(c)}${r + 1}`

export function rangeName(range: Range): string {
  const { r1, c1, r2, c2 } = range
  if (r1 === 0 && r2 === MAX_ROWS - 1) return `${colName(c1)}:${colName(c2)}`
  if (c1 === 0 && c2 === MAX_COLS - 1) return `${r1 + 1}:${r2 + 1}`
  if (r1 === r2 && c1 === c2) return cellName(r1, c1)
  return `${cellName(r1, c1)}:${cellName(r2, c2)}`
}

export function normalize(a: Cell, b: Cell): Range {
  return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) }
}

export const rangeOf = (r: number, c: number): Range => ({ r1: r, c1: c, r2: r, c2: c })
export const inRange = (rg: Range, r: number, c: number) => r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2
export const rangesIntersect = (a: Range, b: Range) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2
export const rangeSize = (rg: Range) => (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1)
export const sameRange = (a: Range, b: Range) => a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2
export const isFullCols = (rg: Range) => rg.r1 === 0 && rg.r2 === MAX_ROWS - 1
export const isFullRows = (rg: Range) => rg.c1 === 0 && rg.c2 === MAX_COLS - 1

export function intersect(a: Range, b: Range): Range | null {
  const r = { r1: Math.max(a.r1, b.r1), c1: Math.max(a.c1, b.c1), r2: Math.min(a.r2, b.r2), c2: Math.min(a.c2, b.c2) }
  return r.r1 <= r.r2 && r.c1 <= r.c2 ? r : null
}

export function union(a: Range, b: Range): Range {
  return { r1: Math.min(a.r1, b.r1), c1: Math.min(a.c1, b.c1), r2: Math.max(a.r2, b.r2), c2: Math.max(a.c2, b.c2) }
}

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/

export function parseCell(text: string): Cell | null {
  const m = CELL_RE.exec(text.trim())
  if (!m) return null
  const c = colIndex(m[1])
  const r = Number(m[2]) - 1
  if (c < 0 || r < 0 || r >= MAX_ROWS) return null
  return { r, c }
}

/** Parses "A1", "A1:B5", "A:C" or "3:7" (absolute markers allowed). */
export function parseRange(text: string): Range | null {
  const t = text.trim().replace(/\$/g, '')
  const parts = t.split(':')
  if (parts.length === 1) {
    const cell = parseCell(parts[0])
    return cell ? rangeOf(cell.r, cell.c) : null
  }
  if (parts.length !== 2) return null
  const [a, b] = parts
  if (/^[A-Za-z]{1,3}$/.test(a) && /^[A-Za-z]{1,3}$/.test(b)) {
    const c1 = colIndex(a)
    const c2 = colIndex(b)
    if (c1 < 0 || c2 < 0) return null
    return { r1: 0, r2: MAX_ROWS - 1, c1: Math.min(c1, c2), c2: Math.max(c1, c2) }
  }
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const r1 = Number(a) - 1
    const r2 = Number(b) - 1
    if (r1 < 0 || r2 < 0 || r1 >= MAX_ROWS || r2 >= MAX_ROWS) return null
    return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: 0, c2: MAX_COLS - 1 }
  }
  const ca = parseCell(a)
  const cb = parseCell(b)
  return ca && cb ? normalize(ca, cb) : null
}

/** Quotes a sheet name for use in a formula when needed. */
export function quoteSheet(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^(TRUE|FALSE)$/i.test(name) ? name : `'${name.replace(/'/g, "''")}'`
}

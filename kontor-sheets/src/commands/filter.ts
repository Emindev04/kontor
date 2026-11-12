// AutoFilter for plain ranges and tables: matching, hiding rows, value lists and sorting.
import { MAX_ROWS, type Range } from '../model/address'
import type { AutoFilter, DatePeriod, FilterOp, FilterSpec, TableDef } from '../model/extras'
import type { Sheet } from '../model/sheet'
import { CellError, type Scalar } from '../model/types'
import { jsDateToSerial } from '../model/dates'
import { cellView } from './display'
import type { Doc } from './doc'
import { currentRegion, sortRange } from './sort'
import { tableAt } from './objects'
import { tableRows } from '../engine/structured'

export type FilterTarget = { kind: 'table'; table: TableDef } | { kind: 'auto'; af: AutoFilter }

/** Header row, data rows and filters of a filter target. */
export function filterArea(t: FilterTarget): { header: number; r1: number; r2: number; c1: number; c2: number; filters: Record<number, FilterSpec> } {
  if (t.kind === 'table') {
    const rows = tableRows(t.table)
    return { header: rows.header, r1: rows.d1, r2: rows.d2, c1: t.table.range.c1, c2: t.table.range.c2, filters: t.table.filters }
  }
  const rg = t.af.range
  return { header: rg.r1, r1: rg.r1 + 1, r2: rg.r2, c1: rg.c1, c2: rg.c2, filters: t.af.filters }
}

/** Filter button under the given header cell, if any. */
export function filterButtonAt(sheet: Sheet, r: number, c: number): { target: FilterTarget; col: number } | null {
  for (const t of sheet.x.tables) {
    if (!t.header || !t.filterButton) continue
    if (r === t.range.r1 && c >= t.range.c1 && c <= t.range.c2) return { target: { kind: 'table', table: t }, col: c - t.range.c1 }
  }
  const af = sheet.x.autoFilter
  if (af && r === af.range.r1 && c >= af.range.c1 && c <= af.range.c2) return { target: { kind: 'auto', af }, col: c - af.range.c1 }
  return null
}

export function displayText(doc: Doc, sheet: Sheet, r: number, c: number): string {
  return cellView(doc, sheet, r, c, doc.wb.styles.get(sheet.styleId(r, c))).text
}

function wildcard(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '~' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i')
}

function testOp(op: FilterOp, value: Scalar, text: string, crit: string): boolean {
  const num = Number(crit)
  const numeric = crit.trim() !== '' && Number.isFinite(num) && typeof value === 'number'
  switch (op) {
    case 'eq': return numeric ? value === num : wildcard(crit).test(text)
    case 'ne': return numeric ? value !== num : !wildcard(crit).test(text)
    case 'gt': return numeric ? (value as number) > num : text.toLowerCase() > crit.toLowerCase()
    case 'ge': return numeric ? (value as number) >= num : text.toLowerCase() >= crit.toLowerCase()
    case 'lt': return numeric ? (value as number) < num : text.toLowerCase() < crit.toLowerCase()
    case 'le': return numeric ? (value as number) <= num : text.toLowerCase() <= crit.toLowerCase()
    case 'begins': return text.toLowerCase().startsWith(crit.toLowerCase())
    case 'notBegins': return !text.toLowerCase().startsWith(crit.toLowerCase())
    case 'ends': return text.toLowerCase().endsWith(crit.toLowerCase())
    case 'notEnds': return !text.toLowerCase().endsWith(crit.toLowerCase())
    case 'contains': return text.toLowerCase().includes(crit.toLowerCase())
    case 'notContains': return !text.toLowerCase().includes(crit.toLowerCase())
  }
}

/** Serial-day bounds [from, to) for a relative date period. */
export function periodBounds(p: DatePeriod, now = new Date()): [number, number] | null {
  const today = Math.floor(jsDateToSerial(now))
  const dow = (today + 6) % 7 // serial 1 (1900-01-01) was a Sunday → Sunday = 0
  const d = new Date(Date.UTC(1899, 11, 30) + today * 86400000)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const serial = (yy: number, mm: number, dd: number) => Math.round((Date.UTC(yy, mm, dd) - Date.UTC(1899, 11, 30)) / 86400000)
  switch (p) {
    case 'yesterday': return [today - 1, today]
    case 'today': return [today, today + 1]
    case 'tomorrow': return [today + 1, today + 2]
    case 'last7Days': return [today - 6, today + 1]
    case 'thisWeek': return [today - dow, today - dow + 7]
    case 'lastWeek': return [today - dow - 7, today - dow]
    case 'nextWeek': return [today - dow + 7, today - dow + 14]
    case 'thisMonth': return [serial(y, m, 1), serial(y, m + 1, 1)]
    case 'lastMonth': return [serial(y, m - 1, 1), serial(y, m, 1)]
    case 'nextMonth': return [serial(y, m + 1, 1), serial(y, m + 2, 1)]
    case 'thisYear': return [serial(y, 0, 1), serial(y + 1, 0, 1)]
    case 'lastYear': return [serial(y - 1, 0, 1), serial(y, 0, 1)]
    case 'nextYear': return [serial(y + 1, 0, 1), serial(y + 2, 0, 1)]
    default: return null
  }
}

type ColStats = { values: number[]; avg: number; threshold?: number }

function stats(doc: Doc, sheet: Sheet, c: number, r1: number, r2: number, spec: FilterSpec): ColStats {
  const values: number[] = []
  for (let r = r1; r <= r2; r++) {
    const v = doc.value(r, c, sheet)
    if (typeof v === 'number') values.push(v)
  }
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  let threshold: number | undefined
  if (spec.kind === 'top10' && values.length) {
    const sorted = values.slice().sort((a, b) => (spec.top ? b - a : a - b))
    const n = spec.percent ? Math.max(1, Math.floor((sorted.length * spec.n) / 100)) : Math.min(sorted.length, spec.n)
    threshold = sorted[n - 1]
  }
  return { values, avg, threshold }
}

export function matches(doc: Doc, sheet: Sheet, r: number, c: number, spec: FilterSpec, st: ColStats): boolean {
  const v = doc.value(r, c, sheet)
  const text = displayText(doc, sheet, r, c)
  switch (spec.kind) {
    case 'values':
      if (v === null || text === '') return spec.blanks
      return spec.values.includes(text)
    case 'custom': {
      const a = testOp(spec.c1.op, v, text, spec.c1.value)
      if (!spec.c2 || spec.c2.value === '') return a
      const b = testOp(spec.c2.op, v, text, spec.c2.value)
      return spec.and ? a && b : a || b
    }
    case 'top10':
      if (typeof v !== 'number' || st.threshold === undefined) return false
      return spec.top ? v >= st.threshold : v <= st.threshold
    case 'average':
      if (typeof v !== 'number') return false
      return spec.above ? v > st.avg : v < st.avg
    case 'color': {
      const style = doc.wb.styles.get(sheet.styleId(r, c))
      if (spec.fill !== undefined) return (style.fill ?? '') === spec.fill
      if (spec.font !== undefined) return (style.color ?? '#000000') === spec.font
      return true
    }
    case 'dynamic': {
      if (typeof v !== 'number') return false
      if (spec.period === 'aboveAverage') return v > st.avg
      if (spec.period === 'belowAverage') return v < st.avg
      const b = periodBounds(spec.period)
      return !!b && v >= b[0] && v < b[1]
    }
  }
}

export function sheetTargets(sheet: Sheet): FilterTarget[] {
  const out: FilterTarget[] = sheet.x.tables.map((table) => ({ kind: 'table', table }) as FilterTarget)
  if (sheet.x.autoFilter) out.push({ kind: 'auto', af: sheet.x.autoFilter })
  return out
}

/** Recomputes the rows hidden by all filters of a sheet. Call inside a transaction after noteProps. */
export function applyFilters(doc: Doc, sheet: Sheet) {
  const hide = new Set<number>()
  for (const t of sheetTargets(sheet)) {
    const a = filterArea(t)
    const cols = Object.entries(a.filters)
    if (!cols.length) continue
    const prepared = cols.map(([k, spec]) => {
      const c = a.c1 + Number(k)
      return { c, spec, st: stats(doc, sheet, c, a.r1, a.r2, spec) }
    })
    for (let r = a.r1; r <= a.r2; r++) {
      for (const p of prepared) {
        if (!matches(doc, sheet, r, p.c, p.spec, p.st)) {
          hide.add(r)
          break
        }
      }
    }
  }
  for (const r of sheet.x.filtered) if (!hide.has(r)) sheet.rows.hidden.delete(r)
  for (const r of hide) sheet.rows.hidden.add(r)
  sheet.x.filtered = [...hide].sort((a, b) => a - b)
  sheet.rows.touch()
}

/** Distinct display values of a filter column with counts (for the checklist). */
export function distinctValues(doc: Doc, sheet: Sheet, t: FilterTarget, col: number): { values: { text: string; num: number | null }[]; blanks: boolean } {
  const a = filterArea(t)
  const c = a.c1 + col
  const seen = new Map<string, number | null>()
  let blanks = false
  // values from rows visible under the *other* columns' filters
  const others = Object.entries(a.filters).filter(([k]) => Number(k) !== col)
  const prepared = others.map(([k, spec]) => ({ c: a.c1 + Number(k), spec, st: stats(doc, sheet, a.c1 + Number(k), a.r1, a.r2, spec) }))
  for (let r = a.r1; r <= Math.min(a.r2, a.r1 + 200000); r++) {
    if (sheet.rows.hidden.has(r) && !sheet.x.filtered.includes(r)) continue
    if (prepared.some((p) => !matches(doc, sheet, r, p.c, p.spec, p.st))) continue
    const v = doc.value(r, c, sheet)
    const text = displayText(doc, sheet, r, c)
    if (v === null || text === '') {
      blanks = true
      continue
    }
    if (!seen.has(text)) seen.set(text, typeof v === 'number' ? v : null)
  }
  const values = [...seen].map(([text, num]) => ({ text, num }))
  values.sort((x, y) => (x.num !== null && y.num !== null ? x.num - y.num : x.num !== null ? -1 : y.num !== null ? 1 : x.text.localeCompare(y.text, 'en', { sensitivity: 'base' })))
  return { values, blanks }
}

function setFilters(doc: Doc, t: FilterTarget, filters: Record<number, FilterSpec>, label: string) {
  const sheet = doc.sheet
  doc.transact(label, () => {
    doc.noteProps(sheet)
    if (t.kind === 'table') {
      const tb = sheet.x.tables.find((x) => x.id === t.table.id)
      if (tb) tb.filters = filters
    } else if (sheet.x.autoFilter) sheet.x.autoFilter.filters = filters
    applyFilters(doc, sheet)
  })
}

export function setColumnFilter(doc: Doc, t: FilterTarget, col: number, spec: FilterSpec | null) {
  const filters = { ...filterArea(t).filters }
  if (spec) filters[col] = spec
  else delete filters[col]
  setFilters(doc, t, filters, spec ? 'Filter' : 'Clear Filter')
}

export function clearFilters(doc: Doc, sheet = doc.sheet) {
  doc.transact('Clear Filters', () => {
    doc.noteProps(sheet)
    for (const t of sheet.x.tables) t.filters = {}
    if (sheet.x.autoFilter) sheet.x.autoFilter.filters = {}
    applyFilters(doc, sheet)
  })
}

export function reapplyFilters(doc: Doc, sheet = doc.sheet) {
  doc.transact('Reapply', () => {
    doc.noteProps(sheet)
    applyFilters(doc, sheet)
  })
}

export function hasActiveFilters(sheet: Sheet) {
  return sheetTargets(sheet).some((t) => Object.keys(filterArea(t).filters).length > 0)
}

/** Data → Filter (Ctrl+Shift+L): toggles filter buttons for the table or range around the active cell. */
export function toggleAutoFilter(doc: Doc): string | null {
  const sheet = doc.sheet
  const a = doc.sel.active
  const table = tableAt(sheet, a.r, a.c)
  if (table) {
    doc.transact('Filter', () => {
      doc.noteProps(sheet)
      const t = sheet.x.tables.find((x) => x.id === table.id)!
      t.filterButton = !t.filterButton
      if (!t.filterButton) t.filters = {}
      applyFilters(doc, sheet)
    })
    return null
  }
  if (sheet.x.autoFilter) {
    doc.transact('Filter', () => {
      doc.noteProps(sheet)
      sheet.x.autoFilter = null
      applyFilters(doc, sheet)
    })
    return null
  }
  let rg: Range = doc.activeRange
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(doc, a)
  rg = doc.boundToUsed(rg)
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2 && !sheet.hasValue(rg.r1, rg.c1)) return 'Select a cell in the range you want to filter, then try again.'
  if (rg.r2 >= MAX_ROWS - 1) rg = { ...rg, r2: Math.max(rg.r1 + 1, sheet.used().r) }
  doc.transact('Filter', () => {
    doc.noteProps(sheet)
    sheet.x.autoFilter = { range: rg, filters: {} }
  })
  return null
}

/** Sort from a filter drop-down: sorts the data rows of the target by one column. */
export function sortTarget(doc: Doc, t: FilterTarget, col: number, desc: boolean, by: 'value' | 'fill' | 'color' = 'value') {
  const a = filterArea(t)
  if (a.r2 <= a.r1) return
  const sheet = doc.sheet
  doc.transact('Sort', () => {
    sortRange(doc, { r1: a.r1, c1: a.c1, r2: a.r2, c2: a.c2 }, [{ index: a.c1 + col, desc, by }], { header: false })
    doc.noteProps(sheet)
    if (t.kind === 'table') {
      const tb = sheet.x.tables.find((x) => x.id === t.table.id)
      if (tb) tb.sort = { col, desc }
    } else if (sheet.x.autoFilter) sheet.x.autoFilter.sort = { col, desc }
    applyFilters(doc, sheet)
  })
}

export function isErrorValue(v: Scalar) {
  return v instanceof CellError
}

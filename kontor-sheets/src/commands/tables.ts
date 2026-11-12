// Tables (Format as Table / Insert Table): creation, options, totals, resizing, auto-expansion,
// calculated columns and the table style gallery.
import { cellKey, colName, type Range } from '../model/address'
import type { StylePatch } from '../model/style'
import type { TableColumn, TableDef, TotalFn } from '../model/extras'
import type { Sheet } from '../model/sheet'
import { columnRef, parseSpec, renameColumnInFormula, renameTableInFormula, resolveSpec, tableRows } from '../engine/structured'
import { shiftFormula } from '../engine/refs'
import type { Doc } from './doc'
import { customTableStyle } from '../model/tableStyles'
import { currentTheme } from '../model/theme'
import { insertCells, uniqueTableName } from './ops'
import { applyFilters } from './filter'
import { currentRegion, detectHeader } from './sort'

// ---------- styles ----------

/** Table style colors: dark gray, then the theme's six accents. */
const accents = () => ['#404040', ...currentTheme().colors.accents]

function tint(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t))
  return '#' + ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export type TableStyleSpec = {
  header: StylePatch
  band1?: string
  band2?: string
  body?: StylePatch
  total: StylePatch
  firstCol: StylePatch
  lastCol: StylePatch
  bandCol?: string
  inner?: string
  outer?: string
}

export const TABLE_STYLE_GROUPS: { group: 'Light' | 'Medium' | 'Dark'; count: number }[] = [
  { group: 'Light', count: 21 },
  { group: 'Medium', count: 28 },
  { group: 'Dark', count: 11 },
]

export const DEFAULT_TABLE_STYLE = 'TableStyleMedium2'

export function tableStyleLabel(id: string) {
  const m = /^TableStyle(Light|Medium|Dark)(\d+)$/.exec(id)
  return m ? `${m[1]} ${m[2]}` : id === 'none' ? 'None' : id
}

/** Formatting rules of a table style id like "TableStyleMedium2" (own colors). */
export function tableStyleSpec(id: string): TableStyleSpec | null {
  const own = customTableStyle(id)
  if (own) {
    const thin = (color: string) => ({ style: 'thin' as const, color })
    return { header: { bold: own.bold || undefined, fill: own.header, color: own.headerText, bb: thin(own.border) }, band1: own.band, total: { bold: true, bt: { style: 'double', color: own.border } }, firstCol: { bold: true }, lastCol: { bold: true }, bandCol: own.band, outer: own.border }
  }
  const m = /^TableStyle(Light|Medium|Dark)(\d+)$/.exec(id)
  if (!m) return null
  const n = Number(m[2]) - 1
  const a = accents()[n % 7]
  const v = Math.floor(n / 7)
  const thin = (color: string) => ({ style: 'thin' as const, color })
  const white = '#FFFFFF'
  if (m[1] === 'Light') {
    if (v === 0)
      return { header: { bold: true, bb: thin(a), color: n % 7 ? tint(a, -0.25) : '#000000' }, band1: tint(a, 0.82), body: { color: n % 7 ? tint(a, -0.25) : '#000000' }, total: { bold: true, bt: { style: 'double', color: a } }, firstCol: { bold: true }, lastCol: { bold: true }, bandCol: tint(a, 0.82), outer: a }
    if (v === 1)
      return { header: { bold: true, fill: a, color: white }, total: { bold: true, bt: { style: 'double', color: a } }, firstCol: { bold: true }, lastCol: { bold: true }, band1: undefined, inner: a, outer: a, bandCol: tint(a, 0.85) }
    return { header: { bold: true, bb: thin(a) }, band1: tint(a, 0.82), total: { bold: true, bt: { style: 'double', color: a } }, firstCol: { bold: true }, lastCol: { bold: true }, inner: a, outer: a, bandCol: tint(a, 0.82) }
  }
  if (m[1] === 'Medium') {
    if (v === 0)
      return { header: { bold: true, fill: a, color: white }, band1: tint(a, 0.8), total: { bold: true, bt: { style: 'double', color: a } }, firstCol: { bold: true }, lastCol: { bold: true }, bandCol: tint(a, 0.8), outer: tint(a, 0.4) }
    if (v === 1)
      return { header: { bold: true, fill: a, color: white }, band1: tint(a, 0.6), band2: tint(a, 0.8), total: { bold: true, fill: a, color: white }, firstCol: { bold: true, fill: a, color: white }, lastCol: { bold: true, fill: a, color: white }, inner: white, bandCol: tint(a, 0.6) }
    if (v === 2)
      return { header: { bold: true, fill: '#000000', color: white }, band1: tint(a, 0.6), band2: tint(a, 0.8), total: { bold: true, bt: { style: 'double', color: '#000000' } }, firstCol: { bold: true, fill: a, color: white }, lastCol: { bold: true, fill: a, color: white }, bandCol: tint(a, 0.6) }
    return { header: { bold: true, bb: { style: 'medium', color: a } }, band1: tint(a, 0.6), band2: tint(a, 0.8), total: { bold: true, bt: { style: 'double', color: a } }, firstCol: { bold: true }, lastCol: { bold: true }, inner: tint(a, 0.4), bandCol: tint(a, 0.6) }
  }
  if (v === 0)
    return { header: { bold: true, fill: '#000000', color: white, bb: { style: 'medium', color: white } }, band1: tint(a, -0.25), band2: a, body: { color: white }, total: { bold: true, fill: tint(a, -0.5), color: white }, firstCol: { bold: true, fill: tint(a, -0.5), color: white }, lastCol: { bold: true, fill: tint(a, -0.5), color: white }, bandCol: tint(a, -0.25) }
  return { header: { bold: true, fill: tint(a, -0.5), color: white }, band1: tint(a, 0.6), band2: tint(a, 0.8), total: { bold: true, fill: tint(a, -0.5), color: white }, firstCol: { bold: true }, lastCol: { bold: true }, bandCol: tint(a, 0.6) }
}

/** Style a table contributes to one cell (cell formatting wins over it). */
export function tableCellStyle(t: TableDef, r: number, c: number, bandIndex?: number): StylePatch | null {
  const spec = tableStyleSpec(t.style)
  if (!spec) return null
  const { header, d1, totals } = tableRows(t)
  const p: StylePatch = { ...(spec.body ?? {}) }
  const lastRow = t.range.r2
  if (spec.outer) {
    if (r === t.range.r1) p.bt = { style: 'thin', color: spec.outer }
    if (r === lastRow) p.bb = { style: 'thin', color: spec.outer }
  }
  if (spec.inner) {
    p.bb = p.bb ?? { style: 'thin', color: spec.inner }
    p.br = { style: 'thin', color: spec.inner }
    p.bl = { style: 'thin', color: spec.inner }
  }
  if (r === header) return { ...p, ...spec.header }
  if (r === totals) return { ...p, ...spec.total }
  const idx = bandIndex ?? r - d1
  if (t.bandRows && spec.band1) {
    if (idx % 2 === 0) p.fill = spec.band1
    else if (spec.band2) p.fill = spec.band2
  }
  if (t.bandCols && spec.bandCol && (c - t.range.c1) % 2 === 0) p.fill = spec.bandCol
  if (t.firstCol && c === t.range.c1) Object.assign(p, spec.firstCol)
  if (t.lastCol && c === t.range.c2) Object.assign(p, spec.lastCol)
  return p
}

// ---------- creation ----------

const TOTAL_CODES: Record<TotalFn, number> = { none: 0, average: 101, count: 103, countNums: 102, max: 104, min: 105, stdDev: 107, sum: 109, var: 110, custom: 0 }

export const TOTAL_LABELS: [TotalFn, string][] = [
  ['none', 'None'], ['average', 'Average'], ['count', 'Count'], ['countNums', 'Count Numbers'], ['max', 'Max'], ['min', 'Min'], ['sum', 'Sum'], ['stdDev', 'StdDev'], ['var', 'Var'], ['custom', 'More Functions…'],
]

export function totalFormula(t: TableDef, col: TableColumn): string | null {
  if (col.total === 'none') return null
  if (col.total === 'custom') return col.totalFormula ?? null
  return `SUBTOTAL(${TOTAL_CODES[col.total]},${columnRef(t.name, col.name)})`
}

function uniqueNames(raw: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  raw.forEach((r, i) => {
    let base = r.trim() || `Column${i + 1}`
    let name = base
    for (let k = 2; seen.has(name.toUpperCase()); k++) name = `${base}${k}`
    seen.add(name.toUpperCase())
    out.push(name)
    base = name
  })
  return out
}

/** Range a new table would use: the selection, or the current region around a single cell. */
export function suggestTableRange(doc: Doc): { range: Range; header: boolean } {
  let rg = doc.activeRange
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(doc, doc.sel.active)
  rg = doc.boundToUsed(rg)
  return { range: rg, header: detectHeader(doc, rg) || rg.r1 === rg.r2 }
}

export function createTable(doc: Doc, range: Range, hasHeader: boolean, style = DEFAULT_TABLE_STYLE): string | null {
  const sheet = doc.sheet
  for (const t of sheet.x.tables) if (t.range.r1 <= range.r2 && t.range.r2 >= range.r1 && t.range.c1 <= range.c2 && t.range.c2 >= range.c1) return 'A table cannot overlap another table.'
  if (sheet.merges.some((m) => m.r1 <= range.r2 && m.r2 >= range.r1 && m.c1 <= range.c2 && m.c2 >= range.c1)) return 'A table cannot contain merged cells. Unmerge them first.'
  let rg = { ...range }
  doc.transact('Format as Table', () => {
    if (!hasHeader) {
      insertCells(doc, 'down', { r1: rg.r1, c1: rg.c1, r2: rg.r1, c2: rg.c2 })
      rg = { ...rg, r2: rg.r2 + 1 }
    }
    const raw: string[] = []
    for (let c = rg.c1; c <= rg.c2; c++) {
      const v = hasHeader ? doc.value(rg.r1, c) : null
      raw.push(v === null || v === undefined ? '' : typeof v === 'object' ? v.code : String(v))
    }
    const names = uniqueNames(raw)
    names.forEach((name, i) => {
      const d = sheet.get(rg.r1, rg.c1 + i)
      if (d?.v !== name || d?.f !== undefined) doc.write(sheet, rg.r1, rg.c1 + i, { ...(d?.s ? { s: d.s } : {}), v: name })
    })
    if (rg.r2 === rg.r1) rg = { ...rg, r2: rg.r1 + 1 }
    doc.noteProps(sheet)
    const t: TableDef = {
      id: doc.wb.newObjectId(),
      name: uniqueTableName(doc),
      range: rg,
      header: true,
      totals: false,
      style,
      bandRows: true,
      bandCols: false,
      firstCol: false,
      lastCol: false,
      filterButton: true,
      columns: names.map((name) => ({ name, total: 'none' as TotalFn })),
      filters: {},
    }
    sheet.x.tables = [...sheet.x.tables, t]
    if (sheet.x.autoFilter && sheet.x.autoFilter.range.r1 <= rg.r2 && sheet.x.autoFilter.range.r2 >= rg.r1) sheet.x.autoFilter = null
    markStructural(doc)
  })
  return null
}

/** Formulas that refer to tables must be re-parsed when a table changes shape. */
function markStructural(doc: Doc) {
  doc.noteFull(doc.sheet)
}

export function updateTable(doc: Doc, id: number, fn: (t: TableDef, sheet: Sheet) => void, label = 'Table') {
  const sheet = doc.sheet
  doc.transact(label, () => {
    doc.noteFull(sheet)
    const t = sheet.x.tables.find((x) => x.id === id)
    if (t) fn(t, sheet)
  })
}

function writeTotals(doc: Doc, sheet: Sheet, t: TableDef) {
  const r = t.range.r2
  t.columns.forEach((col, i) => {
    const c = t.range.c1 + i
    const old = sheet.get(r, c)
    const f = totalFormula(t, col)
    if (f) doc.write(sheet, r, c, { ...(old?.s ? { s: old.s } : {}), f })
    else if (i === 0) doc.write(sheet, r, c, { ...(old?.s ? { s: old.s } : {}), v: col.totalLabel ?? 'Total' })
    else doc.write(sheet, r, c, old?.s ? { s: old.s } : undefined)
  })
}

export function setTotalsRow(doc: Doc, id: number, on: boolean) {
  const sheet = doc.sheet
  const t0 = sheet.x.tables.find((x) => x.id === id)
  if (!t0 || t0.totals === on) return
  doc.transact('Total Row', () => {
    const below = { r1: t0.range.r2 + 1, c1: t0.range.c1, r2: t0.range.r2 + 1, c2: t0.range.c2 }
    if (on) {
      let busy = false
      for (let c = below.c1; c <= below.c2; c++) if (sheet.hasValue(below.r1, c)) busy = true
      if (busy) insertCells(doc, 'down', below)
    }
    doc.noteFull(sheet)
    const t = sheet.x.tables.find((x) => x.id === id)!
    if (on) {
      t.range = { ...t.range, r2: t.range.r2 + 1 }
      t.totals = true
      if (t.columns.length > 1 && t.columns.every((c) => c.total === 'none')) t.columns[t.columns.length - 1].total = 'sum'
      writeTotals(doc, sheet, t)
    } else {
      for (let c = t.range.c1; c <= t.range.c2; c++) {
        const d = sheet.get(t.range.r2, c)
        doc.write(sheet, t.range.r2, c, d?.s ? { s: d.s } : undefined)
      }
      t.range = { ...t.range, r2: t.range.r2 - 1 }
      t.totals = false
    }
  })
}

export function setHeaderRow(doc: Doc, id: number, on: boolean) {
  const sheet = doc.sheet
  const t0 = sheet.x.tables.find((x) => x.id === id)
  if (!t0 || t0.header === on) return
  doc.transact('Header Row', () => {
    let headerRow = t0.range.r1 - 1
    let grow = false
    if (on) {
      let free = headerRow >= 0
      if (free) for (let c = t0.range.c1; c <= t0.range.c2; c++) if (sheet.hasValue(headerRow, c)) free = false
      if (!free) {
        insertCells(doc, 'down', { r1: t0.range.r1, c1: t0.range.c1, r2: t0.range.r1, c2: t0.range.c2 })
        headerRow = t0.range.r1
        grow = true
      }
    }
    doc.noteFull(sheet)
    const t = sheet.x.tables.find((x) => x.id === id)!
    if (on) {
      t.columns.forEach((col, i) => doc.write(sheet, headerRow, t.range.c1 + i, { v: col.name }))
      t.range = grow ? { ...t.range, r2: t.range.r2 + 1 } : { ...t.range, r1: headerRow }
      t.header = true
    } else {
      for (let c = t.range.c1; c <= t.range.c2; c++) {
        const d = sheet.get(t.range.r1, c)
        doc.write(sheet, t.range.r1, c, d?.s ? { s: d.s } : undefined)
      }
      t.range = { ...t.range, r1: t.range.r1 + 1 }
      t.header = false
      t.filterButton = false
      t.filters = {}
    }
    applyFilters(doc, sheet)
  })
}

export function setTotalFn(doc: Doc, id: number, col: number, fn: TotalFn, custom?: string) {
  updateTable(doc, id, (t, sheet) => {
    t.columns[col] = { ...t.columns[col], total: fn, totalFormula: fn === 'custom' ? custom : undefined }
    if (t.totals) writeTotals(doc, sheet, t)
  }, 'Total Row')
}

export function renameTable(doc: Doc, id: number, name: string): string | null {
  const n = name.trim()
  if (!/^[A-Za-z_\\][A-Za-z0-9_.\\]*$/.test(n) || /^[A-Za-z]{1,3}\d+$/.test(n) || /^[RrCc]$/.test(n)) return 'The name you entered is not valid. Names must start with a letter or underscore and cannot contain spaces or look like a cell reference.'
  const sheet = doc.sheet
  const t0 = sheet.x.tables.find((x) => x.id === id)
  if (!t0) return null
  for (const s of doc.wb.sheets) for (const t of s.x.tables) if (t.id !== id && t.name.toUpperCase() === n.toUpperCase()) return 'A table with this name already exists.'
  if (doc.wb.getName(n)) return 'A defined name with this name already exists.'
  const old = t0.name
  doc.transact('Rename Table', () => {
    for (const s of doc.wb.sheets) {
      doc.noteFull(s)
      for (const [k, d] of s.cells) if (d.f !== undefined && d.f.toUpperCase().includes(old.toUpperCase())) s.cells.set(k, { ...d, f: renameTableInFormula(d.f, old, n) })
    }
    const t = sheet.x.tables.find((x) => x.id === id)!
    t.name = n
  })
  return null
}

export function resizeTable(doc: Doc, id: number, range: Range): string | null {
  const sheet = doc.sheet
  const t0 = sheet.x.tables.find((x) => x.id === id)
  if (!t0) return null
  if (range.r1 !== t0.range.r1) return 'The headers must remain in the same row, and the resulting table range must overlap the original table range.'
  if (range.r2 <= range.r1) return 'A table must have at least one data row.'
  for (const t of sheet.x.tables) if (t.id !== id && t.range.r1 <= range.r2 && t.range.r2 >= range.r1 && t.range.c1 <= range.c2 && t.range.c2 >= range.c1) return 'A table cannot overlap another table.'
  doc.transact('Resize Table', () => {
    doc.noteFull(sheet)
    const t = sheet.x.tables.find((x) => x.id === id)!
    const cols: TableColumn[] = []
    const taken = new Set<string>()
    for (let c = range.c1; c <= range.c2; c++) {
      const i = c - t.range.c1
      let col = t.columns[i]
      if (!col) {
        const v = doc.value(range.r1, c)
        let name = v !== null && v !== '' ? String(v) : `Column${c - range.c1 + 1}`
        for (let k = 2; taken.has(name.toUpperCase()); k++) name = `${name}${k}`
        col = { name, total: 'none' }
        doc.write(sheet, range.r1, c, { ...(sheet.get(range.r1, c)?.s ? { s: sheet.get(range.r1, c)!.s } : {}), v: name })
      }
      taken.add(col.name.toUpperCase())
      cols.push(col)
    }
    t.columns = cols
    t.range = range
  })
  return null
}

export function convertToRange(doc: Doc, id: number) {
  const sheet = doc.sheet
  const t0 = sheet.x.tables.find((x) => x.id === id)
  if (!t0) return
  doc.transact('Convert to Range', () => {
    doc.noteFull(sheet)
    // bake the table style into the cells so the range keeps its look
    for (let r = t0.range.r1; r <= t0.range.r2; r++)
      for (let c = t0.range.c1; c <= t0.range.c2; c++) {
        const p = tableCellStyle(t0, r, c)
        if (!p) continue
        const d = sheet.get(r, c)
        const own = doc.wb.styles.get(d?.s)
        const s = doc.wb.styles.intern({ ...p, ...own })
        sheet.setRaw(cellKey(r, c), { ...(d ?? {}), s: s || undefined })
      }
    // structured references become normal references
    for (const s of doc.wb.sheets) {
      if (s !== sheet) doc.noteFull(s)
      for (const [k, d] of s.cells) {
        if (d.f === undefined || !d.f.includes('[') && !d.f.toUpperCase().includes(t0.name.toUpperCase())) continue
        s.cells.set(k, { ...d, f: structToA1(d.f, t0, sheet, s, Math.floor(k / 16384)) })
      }
    }
    sheet.x.tables = sheet.x.tables.filter((x) => x.id !== id)
    for (const r of sheet.x.filtered) sheet.rows.hidden.delete(r)
    sheet.x.filtered = []
    sheet.rows.touch()
  })
}

function structToA1(f: string, t: TableDef, tsheet: Sheet, host: Sheet, row: number): string {
  // evaluated lazily via the engine's resolver: rewrite to plain A1 text
  return f.replace(new RegExp(`(${t.name})?\\[(?:[^\\[\\]]|\\[[^\\]]*\\])*\\]`, 'gi'), (m, name) => {
    if (!name && !t) return m
    const inner = m.slice(name ? name.length : 0)
    const res = resolveForText(t, inner, row)
    if (!res) return '#REF!'
    const prefix = host !== tsheet ? `'${tsheet.name.replace(/'/g, "''")}'!` : ''
    const a = `$${colName(res.c1)}$${res.r1 + 1}`
    const b = `$${colName(res.c2)}$${res.r2 + 1}`
    const thisRow = /@/.test(inner)
    if (thisRow) return prefix + `${colName(res.c1)}${res.r1 + 1}`
    return prefix + (a === b ? a : `${a}:${b}`)
  })
}

function resolveForText(t: TableDef, spec: string, row: number) {
  const p = parseSpec(spec)
  return p ? resolveSpec(t, p, row) : null
}

// ---------- automatic behavior while typing ----------

/**
 * After a value was typed at (r, c): grows a table that ends right above or left of the cell,
 * renames columns typed into the header row, and fills calculated columns.
 */
export function afterTyping(doc: Doc, sheet: Sheet, r: number, c: number) {
  for (const t of sheet.x.tables) {
    const { header, d1, d2 } = tableRows(t)
    // header renamed
    if (r === header && c >= t.range.c1 && c <= t.range.c2) {
      const i = c - t.range.c1
      const v = doc.value(r, c, sheet)
      let name = v === null ? `Column${i + 1}` : String(typeof v === 'object' ? v.code : v)
      const taken = new Set(t.columns.filter((_, j) => j !== i).map((x) => x.name.toUpperCase()))
      for (let k = 2; taken.has(name.toUpperCase()); k++) name = `${name}${k}`
      const old = t.columns[i].name
      if (old === name) return
      doc.noteFull(sheet)
      t.columns = t.columns.map((col, j) => (j === i ? { ...col, name } : col))
      if (v === null || String(v) !== name) sheet.setRaw(cellKey(r, c), { ...(sheet.get(r, c) ?? {}), v: name })
      for (const s of doc.wb.sheets) {
        if (s !== sheet) doc.noteFull(s)
        for (const [k, d] of s.cells) {
          if (d.f === undefined || !d.f.includes('[')) continue
          const inside = s === sheet && Math.floor(k / 16384) >= t.range.r1 && Math.floor(k / 16384) <= t.range.r2 && k % 16384 >= t.range.c1 && k % 16384 <= t.range.c2
          const nf = renameColumnInFormula(d.f, t.name, old, name, inside)
          if (nf !== d.f) s.cells.set(k, { ...d, f: nf })
        }
      }
      return
    }
    // new row directly below (only when there is no total row)
    if (!t.totals && r === t.range.r2 + 1 && c >= t.range.c1 && c <= t.range.c2) {
      doc.noteFull(sheet)
      t.range = { ...t.range, r2: r }
      fillCalculated(doc, sheet, t, r)
      return
    }
    // new column directly right
    if (c === t.range.c2 + 1 && r >= t.range.r1 && r <= t.range.r2 && !sheet.x.tables.some((o) => o !== t && o.range.c1 === c && r >= o.range.r1 && r <= o.range.r2)) {
      doc.noteFull(sheet)
      let name = r === header ? String(doc.value(r, c, sheet) ?? '') : ''
      const taken = new Set(t.columns.map((x) => x.name.toUpperCase()))
      if (!name) {
        let n = t.columns.length + 1
        while (taken.has(`COLUMN${n}`)) n++
        name = `Column${n}`
      }
      for (let k = 2; taken.has(name.toUpperCase()); k++) name = `${name}${k}`
      t.columns = [...t.columns, { name, total: 'none' }]
      t.range = { ...t.range, c2: c }
      if (header >= 0 && sheet.get(header, c)?.v !== name) sheet.setRaw(cellKey(header, c), { ...(sheet.get(header, c) ?? {}), v: name })
      return
    }
    // calculated column: a formula typed into an otherwise empty column fills the column
    if (r >= d1 && r <= d2 && c >= t.range.c1 && c <= t.range.c2) {
      const d = sheet.get(r, c)
      const i = c - t.range.c1
      if (d?.f === undefined) return
      let empty = true
      for (let rr = d1; rr <= d2 && empty; rr++) if (rr !== r && sheet.hasValue(rr, c)) empty = false
      if (!empty || d2 === d1) return
      doc.noteFull(sheet)
      t.columns = t.columns.map((col, j) => (j === i ? { ...col, calc: shiftFormula(d.f!, d1 - r, 0) } : col))
      for (let rr = d1; rr <= d2; rr++) {
        if (rr === r) continue
        const old = sheet.get(rr, c)
        sheet.setRaw(cellKey(rr, c), { ...(old?.s ? { s: old.s } : {}), f: shiftFormula(d.f, rr - r, 0) })
      }
      return
    }
  }
}

function fillCalculated(doc: Doc, sheet: Sheet, t: TableDef, r: number) {
  const { d1 } = tableRows(t)
  t.columns.forEach((col, i) => {
    if (!col.calc) return
    const c = t.range.c1 + i
    if (sheet.hasValue(r, c)) return
    const old = sheet.get(r, c)
    sheet.setRaw(cellKey(r, c), { ...(old?.s ? { s: old.s } : {}), f: shiftFormula(col.calc, r - d1, 0) })
  })
  void doc
}

/** Insert > Table rows above / columns left inside a table (Home > Insert when in a table). */
export function insertTableRows(doc: Doc, id: number, at: number, count: number) {
  const sheet = doc.sheet
  const t0 = sheet.x.tables.find((x) => x.id === id)
  if (!t0) return
  doc.transact('Insert Table Rows', () => {
    insertCells(doc, 'down', { r1: at, c1: t0.range.c1, r2: at + count - 1, c2: t0.range.c2 })
    doc.noteFull(sheet)
    const t = sheet.x.tables.find((x) => x.id === id)!
    t.range = { ...t.range, r2: t.range.r2 + count }
    for (let r = at; r < at + count; r++) fillCalculated(doc, sheet, t, r)
  })
}

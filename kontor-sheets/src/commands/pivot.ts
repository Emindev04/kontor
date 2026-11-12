// PivotTables: summarizing a source range by row/column fields and writing the result into cells.
import { cellKey, colName, type Range } from '../model/address'
import type { DateUnit, PivotDef, PivotFn, PivotGroup } from '../model/extras'
import { MONTHS, serialToParts } from '../model/dates'
import { Matrix } from '../model/matrix'
import { parseFormula, type Node } from '../engine/parser'
import { evaluate } from '../engine/evaluator'
import type { Value } from '../engine/values'
import type { Sheet } from '../model/sheet'
import type { StylePatch } from '../model/style'
import { CellError, type Scalar } from '../model/types'
import { resolveRef } from '../charts/chartData'
import { displayText } from './filter'
import type { Doc } from './doc'
import { createTable, tableStyleSpec } from './tables'
import { t, tx } from '../i18n'

export const PIVOT_FNS: [PivotFn, string][] = [
  ['sum', tx('Sum')], ['count', tx('Count')], ['average', tx('Average')], ['max', tx('Max')], ['min', tx('Min')], ['product', tx('Product')], ['countNums', tx('Count Numbers')], ['stdDev', tx('StdDev')], ['var', tx('Var')],
]

export const fnLabel = (fn: PivotFn) => PIVOT_FNS.find((f) => f[0] === fn)?.[1] ?? fn

type CalcField = { refs: number[]; fn: (sums: number[]) => Scalar }

export type PivotSource = {
  fields: string[]
  rows: { values: Scalar[]; texts: string[] }[]
  fmts: (string | undefined)[]
  /** Sort rank of item texts per field (grouped items sort by period / range). */
  order?: (Map<string, number> | undefined)[]
  /** Calculated fields by field index. */
  calc?: Map<number, CalcField>
}

export function readSource(doc: Doc, p: Pick<PivotDef, 'source'> & Partial<Pick<PivotDef, 'groups' | 'calcFields'>>): PivotSource | null {
  const src = readRawSource(doc, p)
  if (!src) return null
  if (p.groups) applyGroups(src, p.groups)
  if (p.calcFields?.length) addCalcFields(doc, src, p.calcFields)
  return src
}

const UNIT_ORDER: DateUnit[] = ['years', 'quarters', 'months', 'days']
const UNIT_FIELD: Record<DateUnit, string> = { years: 'Years', quarters: 'Quarters', months: 'Months', days: 'Days' }

function unitLabel(u: DateUnit, serial: number): { text: string; rank: number } {
  const d = serialToParts(serial)
  const mon = MONTHS[d.m - 1].slice(0, 3)
  if (u === 'years') return { text: String(d.y), rank: d.y }
  if (u === 'quarters') return { text: `Qtr${Math.ceil(d.m / 3)}`, rank: Math.ceil(d.m / 3) }
  if (u === 'months') return { text: mon, rank: d.m }
  return { text: `${d.d}-${mon}`, rank: d.m * 100 + d.d }
}

/** Replaces item texts by their group and adds the coarser date periods as fields of their own. */
export function applyGroups(src: PivotSource, groups: Record<string, PivotGroup>) {
  src.order = src.order ?? src.fields.map(() => undefined)
  for (const [field, g] of Object.entries(groups)) {
    const i = src.fields.indexOf(field)
    if (i < 0) continue
    const order = new Map<string, number>()
    src.order[i] = order
    if (g.kind === 'number') {
      const step = g.step > 0 ? g.step : 1
      const whole = Number.isInteger(step) && Number.isInteger(g.start)
      for (const row of src.rows) {
        const v = row.values[i]
        if (typeof v !== 'number') continue
        let text: string
        let rank: number
        if (v < g.start) {
          text = `<${g.start}`
          rank = -Infinity
        } else if (v > g.end) {
          text = `>${g.end}`
          rank = Infinity
        } else {
          const lo = g.start + Math.floor((v - g.start) / step) * step
          const hi = whole ? lo + step - 1 : Math.round((lo + step) * 1e9) / 1e9
          text = `${Math.round(lo * 1e9) / 1e9}-${hi}`
          rank = lo
        }
        row.texts[i] = text
        order.set(text, rank)
      }
      continue
    }
    const units = UNIT_ORDER.filter((u) => g.units.includes(u))
    if (!units.length) continue
    const finest = units[units.length - 1]
    const extra = units.slice(0, -1).map((u) => {
      let name = UNIT_FIELD[u]
      for (let k = 2; src.fields.includes(name); k++) name = `${UNIT_FIELD[u]}${k}`
      src.fields.push(name)
      src.fmts.push(undefined)
      const map = new Map<string, number>()
      src.order!.push(map)
      return { u, map }
    })
    for (const row of src.rows) {
      const v = row.values[i]
      const isDate = typeof v === 'number' && v >= 1
      for (const e of extra) {
        if (!isDate) {
          row.values.push(null)
          row.texts.push('')
          continue
        }
        const l = unitLabel(e.u, v)
        row.values.push(l.text)
        row.texts.push(l.text)
        e.map.set(l.text, l.rank)
      }
      if (isDate) {
        const l = unitLabel(finest, v)
        row.texts[i] = l.text
        order.set(l.text, l.rank)
      }
    }
  }
}

/** Names of the period fields a date grouping adds (coarse to fine, without the grouped field itself). */
export function groupFieldNames(g: PivotGroup): string[] {
  if (g.kind !== 'date') return []
  const units = UNIT_ORDER.filter((u) => g.units.includes(u))
  return units.slice(0, -1).map((u) => UNIT_FIELD[u])
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Compiles "=Revenue/'Unit Count'" into a function of the referenced fields' sums. */
export function compileCalcField(doc: Doc, formula: string, fields: string[]): CalcField | null {
  let body = formula.trim().replace(/^=/, '')
  const refs = new Set<number>()
  body = body.replace(/'([^']+)'/g, (m, name: string) => {
    const i = fields.findIndex((f) => f.toUpperCase() === name.toUpperCase())
    if (i < 0) return m
    refs.add(i)
    return `_F${i}`
  })
  const byLength = fields.map((f, i) => [f, i] as const).sort((a, b) => b[0].length - a[0].length)
  for (const [f, i] of byLength) {
    if (!/^[A-Za-z_][\w.]*$/.test(f)) continue
    body = body.replace(new RegExp(`(?<![\\w.'"])${escapeRe(f)}(?![\\w.('"])`, 'gi'), () => {
      refs.add(i)
      return `_F${i}`
    })
  }
  let node: Node
  try {
    node = parseFormula(body)
  } catch {
    return null
  }
  const list = [...refs]
  const sheet = doc.sheet
  return {
    refs: list,
    fn: (sums) => {
      const vars = new Map<string, Value>(list.map((i) => [`_F${i}`, sums[i] ?? 0]))
      const v = evaluate(node, { host: doc.engine, sheet, r: 0, c: 0, scope: { vars, parent: null } })
      return v instanceof Matrix ? v.get(0, 0) : v instanceof CellError || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === null ? v : new CellError('#VALUE!')
    },
  }
}

function addCalcFields(doc: Doc, src: PivotSource, list: { name: string; formula: string }[]) {
  src.calc = src.calc ?? new Map()
  for (const cf of list) {
    if (src.fields.includes(cf.name)) continue
    const calc = compileCalcField(doc, cf.formula, src.fields)
    if (!calc) continue
    src.fields.push(cf.name)
    src.fmts.push(undefined)
    src.order?.push(undefined)
    for (const row of src.rows) {
      row.values.push(0)
      row.texts.push('')
    }
    src.calc.set(src.fields.length - 1, calc)
  }
}

function readRawSource(doc: Doc, p: Pick<PivotDef, 'source'>): PivotSource | null {
  const res = resolveRef(doc.wb, p.source)
  if (!res) return null
  const { sheet, range } = res
  const r2 = Math.min(range.r2, Math.max(range.r1, sheet.used().r))
  const fields: string[] = []
  for (let c = range.c1; c <= range.c2; c++) {
    const v = doc.value(range.r1, c, sheet)
    let name = v === null ? `Column${c - range.c1 + 1}` : String(typeof v === 'object' ? v.code : v)
    for (let k = 2; fields.includes(name); k++) name = `${name}${k}`
    fields.push(name)
  }
  const rows: PivotSource['rows'] = []
  for (let r = range.r1 + 1; r <= r2; r++) {
    const values: Scalar[] = []
    const texts: string[] = []
    let any = false
    for (let c = range.c1; c <= range.c2; c++) {
      const v = doc.value(r, c, sheet)
      values.push(v)
      texts.push(v === null ? '' : displayText(doc, sheet, r, c))
      if (v !== null) any = true
    }
    if (any) rows.push({ values, texts })
  }
  const fmts: (string | undefined)[] = []
  for (let c = range.c1; c <= range.c2; c++) fmts.push(doc.wb.styles.get(sheet.styleId(Math.min(range.r1 + 1, r2), c)).fmt)
  return { fields, rows, fmts }
}

/** Sums of the fields a calculated field reads; the formula runs on the sums. */
class CalcAgg {
  sums: number[] = []
  constructor(readonly calc: CalcField) {}
  addRow(values: Scalar[]) {
    for (const i of this.calc.refs) {
      const v = values[i]
      if (typeof v === 'number') this.sums[i] = (this.sums[i] ?? 0) + v
    }
  }
  result(): Scalar {
    return this.calc.fn(this.sums)
  }
}

class Agg {
  sum = 0
  count = 0
  nums = 0
  min = Infinity
  max = -Infinity
  prod = 1
  sq = 0
  add(v: Scalar) {
    if (v === null || v === '') return
    this.count++
    if (typeof v === 'number') {
      this.nums++
      this.sum += v
      this.sq += v * v
      this.prod *= v
      if (v < this.min) this.min = v
      if (v > this.max) this.max = v
    }
  }
  result(fn: PivotFn): Scalar {
    switch (fn) {
      case 'sum': return this.sum
      case 'count': return this.count
      case 'countNums': return this.nums
      case 'average': return this.nums ? this.sum / this.nums : new CellError('#DIV/0!')
      case 'max': return this.nums ? this.max : 0
      case 'min': return this.nums ? this.min : 0
      case 'product': return this.nums ? this.prod : 0
      case 'stdDev': return this.nums > 1 ? Math.sqrt((this.sq - (this.sum * this.sum) / this.nums) / (this.nums - 1)) : new CellError('#DIV/0!')
      case 'var': return this.nums > 1 ? (this.sq - (this.sum * this.sum) / this.nums) / (this.nums - 1) : new CellError('#DIV/0!')
    }
  }
}

const SEP = '\u0001'

function sortKeys(keys: string[][], src: PivotSource, fieldIdx: number[]): string[][] {
  const numeric = (field: number, text: string) => {
    const rank = src.order?.[field]?.get(text)
    if (rank !== undefined) return rank
    const row = src.rows.find((r) => r.texts[field] === text)
    const v = row?.values[field]
    return typeof v === 'number' ? v : null
  }
  return keys.sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue
      const na = numeric(fieldIdx[i], a[i])
      const nb = numeric(fieldIdx[i], b[i])
      if (na !== null && nb !== null) return na - nb
      if (a[i] === '(blank)') return 1
      if (b[i] === '(blank)') return -1
      return a[i].localeCompare(b[i], 'en', { sensitivity: 'base', numeric: true })
    }
    return 0
  })
}

/** A report cell; value cells carry the row and column items they summarize (for Show Details). */
export type PivotCell = { v: Scalar; style?: StylePatch; fmt?: string; drill?: { rk: string[]; ck: string[] } }

/** Computes the cell grid of a PivotTable (rows of cells, top-left at the pivot's anchor). */
export function computePivot(p: PivotDef, src: PivotSource): PivotCell[][] {
  const fi = (name: string) => src.fields.indexOf(name)
  const rowF = p.rows.map(fi).filter((i) => i >= 0)
  const colF = p.cols.map(fi).filter((i) => i >= 0)
  const vals = p.values.filter((v) => fi(v.field) >= 0)
  const filters = p.filters.filter((f) => fi(f.field) >= 0 && f.selected)
  const text = (row: PivotSource['rows'][number], i: number) => row.texts[i] || '(blank)'
  const slicers = Object.entries(p.slicerFilters ?? {}).filter(([f]) => fi(f) >= 0)
  const dates = Object.entries(p.dateFilters ?? {}).filter(([f]) => fi(f) >= 0)
  const inDates = (row: PivotSource['rows'][number]) =>
    dates.every(([f, d]) => {
      const v = row.values[fi(f)]
      return typeof v === 'number' && v >= d.start && v < d.end
    })
  const data = src.rows.filter((row) => filters.every((f) => f.selected!.includes(text(row, fi(f.field)))) && slicers.every(([f, items]) => items.includes(text(row, fi(f)))) && inDates(row))
  const spec = tableStyleSpec(p.style)
  const headStyle: StylePatch = spec ? { ...spec.header } : { bold: true }
  const totalStyle: StylePatch = { bold: true, ...(spec?.total ?? {}) }
  const subStyle: StylePatch = { bold: true }
  const out: PivotCell[][] = []
  // report filters on top
  for (const f of p.filters) {
    if (fi(f.field) < 0) continue
    out.push([{ v: f.field, style: { bold: true } }, { v: !f.selected ? '(All)' : f.selected.length === 1 ? f.selected[0] : '(Multiple Items)' }])
  }
  if (p.filters.length) out.push([])
  if (!vals.length && !rowF.length && !colF.length) {
    out.push([{ v: 'PivotTable', style: { bold: true } }], [{ v: 'Choose fields in the PivotTable Fields pane to build a report.' }])
    return out
  }
  // keys
  const rowKeys = new Map<string, string[]>()
  const colKeys = new Map<string, string[]>()
  const cells = new Map<string, (Agg | CalcAgg)[]>()
  const get = (rk: string, ck: string) => {
    const k = rk + SEP + SEP + ck
    let a = cells.get(k)
    if (!a) cells.set(k, (a = vals.map((v) => {
      const calc = src.calc?.get(fi(v.field))
      return calc ? new CalcAgg(calc) : new Agg()
    })))
    return a
  }
  for (const row of data) {
    const rk = rowF.map((i) => text(row, i))
    const ck = colF.map((i) => text(row, i))
    rowKeys.set(rk.join(SEP), rk)
    colKeys.set(ck.join(SEP), ck)
    // accumulate into every prefix (subtotals) and totals
    for (let a = 0; a <= rk.length; a++)
      for (let b = 0; b <= ck.length; b++) {
        const aggs = get(rk.slice(0, a).join(SEP) + `#${a}`, ck.slice(0, b).join(SEP) + `#${b}`)
        vals.forEach((v, i) => {
          const agg = aggs[i]
          if (agg instanceof CalcAgg) agg.addRow(row.values)
          else agg.add(row.values[fi(v.field)])
        })
      }
  }
  const rList = sortKeys([...rowKeys.values()], src, rowF)
  const cList = sortKeys([...colKeys.values()], src, colF)
  const value = (rk: string[], ck: string[], i: number): Scalar => {
    const a = cells.get(rk.join(SEP) + `#${rk.length}` + SEP + SEP + ck.join(SEP) + `#${ck.length}`)
    if (!a) return null
    const agg = a[i]
    const v = agg instanceof CalcAgg ? agg.result() : agg.result(vals[i].fn)
    const show = vals[i].showAs
    if (show === 'normal' || typeof v !== 'number') return v
    const base = show === 'pctGrand' ? value([], [], i) : show === 'pctCol' ? value([], ck, i) : value(rk, [], i)
    return typeof base === 'number' && base !== 0 ? v / base : new CellError('#DIV/0!')
  }
  const fmtOf = (i: number) => (vals[i].showAs !== 'normal' ? '0.00%' : vals[i].fmt ?? src.fmts[fi(vals[i].field)])
  const vName = (i: number) => vals[i].name ?? (src.calc?.has(fi(vals[i].field)) ? `Sum of ${vals[i].field}` : `${fnLabel(vals[i].fn)} of ${vals[i].field}`)
  const compact = p.layout === 'compact'
  const labelCols = compact ? 1 : Math.max(1, rowF.length)
  // column header rows
  const colLeaves: { ck: string[]; vi: number; total: boolean }[] = []
  const showColTotal = p.grandCols && colF.length > 0
  for (const ck of colF.length ? cList : [[]]) for (let i = 0; i < Math.max(1, vals.length); i++) colLeaves.push({ ck, vi: i, total: false })
  if (showColTotal) for (let i = 0; i < Math.max(1, vals.length); i++) colLeaves.push({ ck: [], vi: i, total: true })
  if (colF.length) {
    const top: PivotCell[] = [{ v: vals.length === 1 ? vName(0) : '', style: headStyle }]
    for (let k = 1; k < labelCols; k++) top.push({ v: '', style: headStyle })
    top.push({ v: 'Column Labels', style: headStyle })
    for (let k = 1; k < colLeaves.length; k++) top.push({ v: '', style: headStyle })
    out.push(top)
  }
  const header: PivotCell[] = []
  if (compact) header.push({ v: rowF.length ? 'Row Labels' : '', style: headStyle })
  else for (let k = 0; k < labelCols; k++) header.push({ v: rowF.length ? src.fields[rowF[k]] : '', style: headStyle })
  for (const leaf of colLeaves) {
    const label = leaf.total ? (vals.length > 1 ? `Total ${vName(leaf.vi)}` : 'Grand Total') : colF.length ? leaf.ck.join(' ') + (vals.length > 1 ? ` – ${vName(leaf.vi)}` : '') : vals.length ? vName(leaf.vi) : ''
    header.push({ v: label, style: headStyle })
  }
  out.push(header)
  // body rows
  const bodyRow = (rk: string[], label: (string | null)[], style: StylePatch | undefined, indent: number) => {
    const row: PivotCell[] = []
    if (compact) row.push({ v: label[label.length - 1] ?? '', style: { ...(style ?? {}), indent: indent || undefined } })
    else for (let k = 0; k < labelCols; k++) row.push({ v: label[k] ?? '', style })
    for (const leaf of colLeaves) row.push({ v: vals.length ? value(rk, leaf.ck, leaf.vi) : null, fmt: vals.length ? fmtOf(leaf.vi) : undefined, style, drill: vals.length ? { rk, ck: leaf.ck } : undefined })
    out.push(row)
  }
  const emitted = new Set<string>()
  const labelAt = (lvl: number, text: string) => {
    const label: string[] = []
    for (let k = 0; k < labelCols; k++) label.push('')
    label[compact ? 0 : lvl] = text
    return label
  }
  const hiddenBy = (key: string[]) => {
    for (let k = 1; k < key.length; k++) if (p.collapsed.includes(key.slice(0, k).join(SEP))) return true
    return false
  }
  for (const rk of rowF.length ? rList : [[]]) {
    for (let lvl = 0; lvl < rk.length - 1; lvl++) {
      const prefix = rk.slice(0, lvl + 1)
      const key = prefix.join(SEP)
      if (emitted.has(key)) continue
      emitted.add(key)
      if (hiddenBy(prefix)) continue
      const showValues = p.subtotals || p.collapsed.includes(key)
      bodyRow(prefix, labelAt(lvl, prefix[lvl]), subStyle, lvl)
      if (!showValues) {
        const last = out[out.length - 1]
        for (let k = labelCols; k < last.length; k++) last[k] = { v: null, style: subStyle }
      }
    }
    if (hiddenBy(rk)) continue
    const lvl = Math.max(0, rk.length - 1)
    bodyRow(rk, labelAt(lvl, rk[lvl] ?? ''), undefined, lvl)
  }
  if (p.grandRows && (rowF.length || !colF.length) && vals.length) bodyRow([], ['Grand Total'], totalStyle, 0)
  if (p.bandRows && spec?.band1) {
    const start = p.filters.length ? p.filters.filter((f) => fi(f.field) >= 0).length + 1 : 0
    const first = start + (colF.length ? 2 : 1)
    for (let i = first; i < out.length; i++) if ((i - first) % 2 === 0) for (const cell of out[i]) if (!cell.style?.fill) cell.style = { ...(cell.style ?? {}), fill: spec.band1 }
  }
  return out
}

/** Recomputes a PivotTable and writes it into its sheet (inside a transaction). */
export function writePivot(doc: Doc, sheet: Sheet, p: PivotDef): string | null {
  const src = readSource(doc, p)
  if (!src) return t('The PivotTable data source reference is not valid.')
  const grid = computePivot(p, src)
  // clear the previous output
  if (p.output) {
    for (let r = p.output.r1; r <= p.output.r2; r++)
      for (let c = p.output.c1; c <= p.output.c2; c++) if (sheet.cells.has(cellKey(r, c))) doc.write(sheet, r, c, undefined)
  }
  const h = grid.length
  const w = Math.max(1, ...grid.map((row) => row.length))
  grid.forEach((row, i) =>
    row.forEach((cell, j) => {
      const st: StylePatch = { ...(cell.style ?? {}) }
      if (cell.fmt) st.fmt = cell.fmt
      const s = Object.keys(st).length ? doc.wb.styles.intern(st) : 0
      if (cell.v === null && !s) return
      doc.write(sheet, p.r + i, p.c + j, { ...(cell.v !== null ? { v: cell.v } : {}), ...(s ? { s } : {}) })
    }),
  )
  p.output = { r1: p.r, c1: p.c, r2: p.r + Math.max(0, h - 1), c2: p.c + w - 1 }
  // fit the label column
  if (!sheet.cols.manual.has(p.c)) sheet.cols.manual.set(p.c, Math.max(sheet.cols.def, 120))
  sheet.cols.touch()
  return null
}

export function updatePivot(doc: Doc, id: number, fn: (p: PivotDef) => void, label = 'PivotTable') {
  const sheet = doc.wb.sheets.find((s) => s.x.pivots.some((p) => p.id === id))
  if (!sheet) return
  doc.transact(label, () => {
    doc.noteProps(sheet)
    const p = sheet.x.pivots.find((x) => x.id === id)!
    fn(p)
    writePivot(doc, sheet, p)
  })
}

export function refreshAllPivots(doc: Doc) {
  doc.transact(tx('Refresh All'), () => {
    for (const sheet of doc.wb.sheets) {
      if (!sheet.x.pivots.length) continue
      doc.noteProps(sheet)
      for (const p of sheet.x.pivots) writePivot(doc, sheet, p)
    }
  })
}

export function createPivot(doc: Doc, source: string, target: { sheet: Sheet | 'new'; r: number; c: number }): string | null {
  const src = readSource(doc, { source })
  if (!src || !src.fields.length) return t('The PivotTable field name is not valid. To create a PivotTable report, you must use data that is organized as a list with labeled columns.')
  let created: Sheet | null = null
  doc.transact(tx('Insert PivotTable'), () => {
    let sheet: Sheet
    if (target.sheet === 'new') {
      doc.noteWorkbook()
      const name = doc.wb.uniqueSheetName('Sheet')
      sheet = doc.wb.addSheet(name, doc.activeIndex)
      created = sheet
    } else sheet = target.sheet
    doc.noteProps(sheet)
    const id = doc.wb.newObjectId()
    const taken = new Set(doc.wb.sheets.flatMap((s) => s.x.pivots.map((p) => p.name)))
    let n = 1
    while (taken.has(`PivotTable${n}`)) n++
    const p: PivotDef = {
      id,
      name: `PivotTable${n}`,
      source,
      r: target.sheet === 'new' ? 2 : target.r,
      c: target.sheet === 'new' ? 0 : target.c,
      rows: [],
      cols: [],
      values: [],
      filters: [],
      grandRows: true,
      grandCols: true,
      subtotals: true,
      layout: 'compact',
      style: 'TableStyleLight16',
      bandRows: false,
      collapsed: [],
    }
    sheet.x.pivots = [...sheet.x.pivots, p]
    writePivot(doc, sheet, p)
    if (created) doc.activeIndex = doc.wb.sheets.indexOf(created)
    doc.sel = { ranges: [{ r1: p.r, c1: p.c, r2: p.r, c2: p.c }], active: { r: p.r, c: p.c }, anchor: { r: p.r, c: p.c }, head: { r: p.r, c: p.c } }
  })
  return null
}

export function deletePivot(doc: Doc, id: number) {
  const sheet = doc.wb.sheets.find((s) => s.x.pivots.some((p) => p.id === id))
  if (!sheet) return
  doc.transact(tx('Clear PivotTable'), () => {
    doc.noteProps(sheet)
    const p = sheet.x.pivots.find((x) => x.id === id)!
    if (p.output) for (let r = p.output.r1; r <= p.output.r2; r++) for (let c = p.output.c1; c <= p.output.c2; c++) if (sheet.cells.has(cellKey(r, c))) doc.write(sheet, r, c, undefined)
    sheet.x.pivots = sheet.x.pivots.filter((x) => x.id !== id)
  })
}

/** Distinct item texts of a field (for report filters). */
export function fieldItems(doc: Doc, p: PivotDef, field: string): string[] {
  const src = readSource(doc, p)
  if (!src) return []
  const i = src.fields.indexOf(field)
  const set = new Set<string>()
  for (const row of src.rows) set.add(row.texts[i] || '(blank)')
  return [...set].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

export function pivotSourceLabel(r: Range, sheet: Sheet) {
  return `${sheet.name}!$${colName(r.c1)}$${r.r1 + 1}:$${colName(r.c2)}$${r.r2 + 1}`
}

/** Groups the items of a field (dates by period, numbers by ranges); null removes the grouping. */
export function groupPivotField(doc: Doc, id: number, field: string, group: PivotGroup | null) {
  updatePivot(doc, id, (p) => {
    const old = p.groups?.[field]
    const oldExtra = old ? groupFieldNames(old) : []
    const groups = { ...(p.groups ?? {}) }
    if (group) groups[field] = group
    else delete groups[field]
    p.groups = Object.keys(groups).length ? groups : undefined
    // period fields of the old grouping leave the layout; the new ones go in front of the field
    const drop = (list: string[]) => list.filter((f) => !oldExtra.includes(f))
    p.rows = drop(p.rows)
    p.cols = drop(p.cols)
    p.filters = p.filters.filter((f) => !oldExtra.includes(f.field))
    p.values = p.values.filter((v) => !oldExtra.includes(v.field))
    const extra = group ? groupFieldNames(group) : []
    for (const list of [p.rows, p.cols]) {
      const at = list.indexOf(field)
      if (at >= 0) list.splice(at, 0, ...extra)
    }
  }, group ? tx('Group') : tx('Ungroup'))
}

export function setCalcField(doc: Doc, id: number, name: string, formula: string | null): string | null {
  const p = doc.wb.sheets.flatMap((s) => s.x.pivots).find((x) => x.id === id)
  if (!p) return null
  if (formula !== null) {
    const src = readSource(doc, { ...p, calcFields: (p.calcFields ?? []).filter((c) => c.name !== name) })
    if (!src) return t('The PivotTable data source reference is not valid.')
    if (src.fields.some((f) => f.toUpperCase() === name.toUpperCase()) && !(p.calcFields ?? []).some((c) => c.name === name)) return t('A field with this name already exists.')
    if (!compileCalcField(doc, formula, src.fields)) return t('There is a problem with this formula.')
  }
  updatePivot(doc, id, (x) => {
    const isNew = !(x.calcFields ?? []).some((c) => c.name === name)
    const list = (x.calcFields ?? []).filter((c) => c.name !== name)
    if (formula !== null) {
      list.push({ name, formula })
      // a new calculated field goes straight into the Values area, like in the original
      if (isNew && !x.values.some((v) => v.field === name)) x.values.push({ field: name, fn: 'sum', showAs: 'normal' })
    } else x.values = x.values.filter((v) => v.field !== name)
    x.calcFields = list.length ? list : undefined
  }, formula === null ? tx('Delete Calculated Field') : tx('Calculated Field'))
  return null
}

/**
 * Show Details (double-click on a value): copies the source rows behind a report value to a new
 * sheet as a table, like the original.
 */
export function drillDown(doc: Doc, sheet: Sheet, r: number, c: number): boolean {
  const p = sheet.x.pivots.find((x) => x.output && r >= x.output.r1 && r <= x.output.r2 && c >= x.output.c1 && c <= x.output.c2)
  if (!p) return false
  const src = readSource(doc, p)
  if (!src) return false
  const cell = computePivot(p, src)[r - p.r]?.[c - p.c]
  if (!cell?.drill) return false
  const fi = (name: string) => src.fields.indexOf(name)
  const rowF = p.rows.map(fi).filter((i) => i >= 0)
  const colF = p.cols.map(fi).filter((i) => i >= 0)
  const text = (row: PivotSource['rows'][number], i: number) => row.texts[i] || '(blank)'
  const { rk, ck } = cell.drill
  const rows = src.rows.filter(
    (row) =>
      rk.every((t, k) => text(row, rowF[k]) === t) &&
      ck.every((t, k) => text(row, colF[k]) === t) &&
      p.filters.every((f) => !f.selected || fi(f.field) < 0 || f.selected.includes(text(row, fi(f.field)))) &&
      Object.entries(p.slicerFilters ?? {}).every(([f, items]) => fi(f) < 0 || items.includes(text(row, fi(f)))),
  )
  const res = resolveRef(doc.wb, p.source)
  if (!res) return false
  const width = res.range.c2 - res.range.c1 + 1
  doc.transact(tx('Show Details'), () => {
    doc.noteWorkbook()
    const target = doc.wb.addSheet(doc.wb.uniqueSheetName('Sheet'), doc.activeIndex)
    doc.activeIndex = doc.wb.sheets.indexOf(target)
    for (let k = 0; k < width; k++) doc.write(target, 0, k, { v: src.fields[k] })
    rows.forEach((row, i) =>
      row.values.slice(0, width).forEach((v, k) => {
        if (v === null) return
        const fmt = src.fmts[k]
        doc.write(target, i + 1, k, { v, ...(fmt ? { s: doc.wb.styles.intern({ fmt }) } : {}) })
      }),
    )
    createTable(doc, { r1: 0, c1: 0, r2: Math.max(1, rows.length), c2: width - 1 }, true)
    doc.sel = { ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], active: { r: 0, c: 0 }, anchor: { r: 0, c: 0 }, head: { r: 0, c: 0 } }
  })
  return true
}

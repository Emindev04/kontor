// Data and view tools: Consolidate, Custom Views, links to places in the workbook, Get Data from
// files, Recommended PivotTables and Forecast Sheet.
import { MAX_COLS, MAX_ROWS, type Range } from '../model/address'
import type { CustomView } from '../model/workbook'
import type { Sheet } from '../model/sheet'
import { CellError, type Scalar } from '../model/types'
import { parseInput } from '../model/parseInput'
import { resolveRef, absRef } from '../charts/chartData'
import { etsFit } from '../engine/functions/forecast'
import { parseDelimited } from './clipboard'
import type { Doc } from './doc'
import { createTable } from './tables'
import { addObject, newChart } from './objects'
import { computePivot, createPivot, readSource, updatePivot } from './pivot'
import type { PivotDef } from '../model/extras'

// ---------------------------------------------------------------------
// Consolidate
// ---------------------------------------------------------------------

export type ConsolidateFn = 'sum' | 'count' | 'average' | 'max' | 'min' | 'product' | 'countNums' | 'stdDev' | 'stdDevp' | 'var' | 'varp'

export const CONSOLIDATE_FNS: [ConsolidateFn, string][] = [
  ['sum', 'Sum'], ['count', 'Count'], ['average', 'Average'], ['max', 'Max'], ['min', 'Min'], ['product', 'Product'], ['countNums', 'Count Numbers'],
  ['stdDev', 'StdDev'], ['stdDevp', 'StdDevp'], ['var', 'Var'], ['varp', 'Varp'],
]

function aggregate(fn: ConsolidateFn, vals: Scalar[]): Scalar {
  const nums = vals.filter((v): v is number => typeof v === 'number')
  const n = nums.length
  const sum = nums.reduce((a, b) => a + b, 0)
  const mean = n ? sum / n : 0
  const ss = nums.reduce((a, b) => a + (b - mean) * (b - mean), 0)
  switch (fn) {
    case 'sum': return sum
    case 'count': return vals.filter((v) => v !== null && v !== '').length
    case 'countNums': return n
    case 'average': return n ? mean : new CellError('#DIV/0!')
    case 'max': return n ? Math.max(...nums) : 0
    case 'min': return n ? Math.min(...nums) : 0
    case 'product': return n ? nums.reduce((a, b) => a * b, 1) : 0
    case 'stdDev': return n > 1 ? Math.sqrt(ss / (n - 1)) : new CellError('#DIV/0!')
    case 'stdDevp': return n ? Math.sqrt(ss / n) : new CellError('#DIV/0!')
    case 'var': return n > 1 ? ss / (n - 1) : new CellError('#DIV/0!')
    case 'varp': return n ? ss / n : new CellError('#DIV/0!')
  }
}

/**
 * Data > Consolidate: combines several ranges into one table at the active cell, matching rows and
 * columns by their labels (top row / left column) or by position.
 */
export function consolidate(doc: Doc, refs: string[], fn: ConsolidateFn, topLabels: boolean, leftLabels: boolean): string | null {
  const sources = refs.map((r) => resolveRef(doc.wb, r, doc.sheet))
  if (!sources.length) return 'Add at least one reference.'
  if (sources.some((s) => !s)) return 'A reference is not valid.'
  const rowKeys: string[] = []
  const colKeys: string[] = []
  const cells = new Map<string, Scalar[]>()
  const text = (v: Scalar) => (v === null ? '' : v instanceof CellError ? v.code : String(v))
  for (const src of sources) {
    const { sheet, range } = src!
    for (let r = range.r1 + (topLabels ? 1 : 0); r <= range.r2; r++) {
      const rk = leftLabels ? text(doc.value(r, range.c1, sheet)) : String(r - range.r1)
      if (leftLabels && rk === '') continue
      if (!rowKeys.includes(rk)) rowKeys.push(rk)
      for (let c = range.c1 + (leftLabels ? 1 : 0); c <= range.c2; c++) {
        const ck = topLabels ? text(doc.value(range.r1, c, sheet)) : String(c - range.c1)
        if (topLabels && ck === '') continue
        if (!colKeys.includes(ck)) colKeys.push(ck)
        const k = `${rk}\u0001${ck}`
        const list = cells.get(k) ?? []
        list.push(doc.value(r, c, sheet))
        cells.set(k, list)
      }
    }
  }
  const at = doc.sel.active
  const sheet = doc.sheet
  const r0 = at.r + (topLabels ? 1 : 0)
  const c0 = at.c + (leftLabels ? 1 : 0)
  if (r0 + rowKeys.length > MAX_ROWS || c0 + colKeys.length > MAX_COLS) return 'The destination is too close to the edge of the sheet.'
  doc.transact('Consolidate', () => {
    if (topLabels) colKeys.forEach((ck, j) => doc.write(sheet, at.r, c0 + j, { v: ck }))
    rowKeys.forEach((rk, i) => {
      if (leftLabels) doc.write(sheet, r0 + i, at.c, { v: rk })
      colKeys.forEach((ck, j) => {
        const vals = cells.get(`${rk}\u0001${ck}`)
        // text-only cells stay empty unless they are counted
        if (vals && (fn === 'count' || vals.some((v) => typeof v === 'number'))) doc.write(sheet, r0 + i, c0 + j, { v: aggregate(fn, vals) })
      })
    })
  })
  return null
}

// ---------------------------------------------------------------------
// Custom Views
// ---------------------------------------------------------------------

export function addCustomView(doc: Doc, name: string) {
  const s = doc.sheet
  const rg = doc.activeRange
  const view: CustomView = {
    name,
    sheet: s.id,
    zoom: s.zoom,
    sel: { ...rg },
    freeze: { ...s.freeze },
    hiddenRows: [...s.rows.hidden],
    hiddenCols: [...s.cols.hidden],
    showGrid: s.showGrid,
    showHeadings: s.showHeadings,
  }
  doc.wb.customViews = [...doc.wb.customViews.filter((v) => v.name.toUpperCase() !== name.toUpperCase()), view]
  doc.modified = true
  doc.emit()
}

export function showCustomView(doc: Doc, name: string): string | null {
  const v = doc.wb.customViews.find((x) => x.name === name)
  const sheet = v && doc.wb.sheetById(v.sheet)
  if (!v || !sheet) return 'The sheet of this view no longer exists.'
  doc.transact('Show View', () => {
    doc.noteProps(sheet)
    const setHidden = (axis: typeof sheet.rows, list: number[]) => {
      for (const i of [...axis.hidden]) axis.hidden.delete(i)
      for (const i of list) axis.hidden.add(i)
      axis.touch()
    }
    setHidden(sheet.rows, v.hiddenRows)
    setHidden(sheet.cols, v.hiddenCols)
  })
  doc.activeIndex = doc.wb.sheets.indexOf(sheet)
  sheet.zoom = v.zoom
  sheet.freeze = { ...v.freeze }
  sheet.showGrid = v.showGrid
  sheet.showHeadings = v.showHeadings
  doc.selectRange(v.sel)
  doc.emit()
  return null
}

export function deleteCustomView(doc: Doc, name: string) {
  doc.wb.customViews = doc.wb.customViews.filter((v) => v.name !== name)
  doc.modified = true
  doc.emit()
}

// ---------------------------------------------------------------------
// Links to places in the workbook
// ---------------------------------------------------------------------

/** "#'My Sheet'!A1", "#Sheet2!B3:C4" or "#Name" go to that place; anything else opens in a new tab. */
export function followLink(doc: Doc, link: string): string | null {
  if (!link.startsWith('#')) {
    window.open(link, '_blank', 'noopener')
    return null
  }
  const target = link.slice(1)
  const name = doc.wb.names.get(target.toUpperCase())
  const res = resolveRef(doc.wb, name ? name.ref : target, doc.sheet)
  if (!res) return 'Reference isn\'t valid.'
  doc.activeIndex = doc.wb.sheets.indexOf(res.sheet)
  doc.selectRange(res.range)
  doc.emit()
  return null
}

export function placeLink(sheet: Sheet, ref: string) {
  const name = /^[A-Za-z_][\w.]*$/.test(sheet.name) ? sheet.name : `'${sheet.name.replace(/'/g, "''")}'`
  return `#${name}!${ref.replace(/\$/g, '')}`
}

// ---------------------------------------------------------------------
// Get Data: text, JSON and web-page tables into a new sheet as a table
// ---------------------------------------------------------------------

export type DataSet = { name: string; rows: string[][] }

/** Tables found in a file: CSV/TXT (one), JSON (arrays of records) or HTML (every <table>). */
export function parseDataFile(name: string, text: string): DataSet[] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const base = name.replace(/\.[^.]+$/, '')
  if (ext === 'json') {
    const data = JSON.parse(text) as unknown
    const out: DataSet[] = []
    const visit = (v: unknown, label: string) => {
      if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
        const keys = [...new Set(v.flatMap((x) => Object.keys(x as object)))]
        out.push({ name: label, rows: [keys, ...v.map((x) => keys.map((k) => cellText((x as Record<string, unknown>)[k])))] })
      } else if (Array.isArray(v) && v.length && v.every((x) => Array.isArray(x))) {
        out.push({ name: label, rows: (v as unknown[][]).map((row) => row.map(cellText)) })
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const entries = Object.entries(v as Record<string, unknown>)
        if (entries.every(([, x]) => x === null || typeof x !== 'object')) out.push({ name: label, rows: [['Name', 'Value'], ...entries.map(([k, x]) => [k, cellText(x)])] })
        for (const [k, x] of entries) if (x && typeof x === 'object') visit(x, `${label}.${k}`)
      }
    }
    visit(data, base)
    return out
  }
  if (ext === 'html' || ext === 'htm') {
    const doc = new DOMParser().parseFromString(text, 'text/html')
    return [...doc.querySelectorAll('table')].map((t, i) => ({
      name: t.querySelector('caption')?.textContent?.trim() || `Table ${i + 1}`,
      rows: [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim())),
    })).filter((d) => d.rows.length)
  }
  if (ext === 'xml') {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    const root = doc.documentElement
    const records = [...root.children]
    if (!records.length) return []
    const keys = [...new Set(records.flatMap((r) => [...[...r.attributes].map((a) => a.name), ...[...r.children].map((c) => c.localName)]))]
    return [{ name: base, rows: [keys, ...records.map((r) => keys.map((k) => r.getAttribute(k) ?? [...r.children].find((c) => c.localName === k)?.textContent ?? ''))] }]
  }
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n')
  const sep = [',', ';', '\t', '|'].map((s) => [s, sample.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]
  return [{ name: base, rows: parseDelimited(text.replace(/^﻿/, ''), sep[1] > 1 ? sep[0] : ',') }]
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Loads a data set into a new sheet and formats it as a table. */
export function loadDataSet(doc: Doc, set: DataSet): string | null {
  const width = Math.max(1, ...set.rows.map((r) => r.length))
  if (!set.rows.length) return 'The file has no data.'
  doc.transact('Load Data', () => {
    doc.noteWorkbook()
    const base = set.name.split('.').pop()!.replace(/[\\/?*[\]:]/g, '_').slice(0, 28) || 'Query'
    const sheet = doc.wb.addSheet(doc.wb.sheetByName(base) ? doc.wb.uniqueSheetName(base) : base, doc.activeIndex + 1)
    doc.activeIndex = doc.wb.sheets.indexOf(sheet)
    set.rows.forEach((row, r) =>
      row.forEach((t, c) => {
        if (t === '') return
        const p = r === 0 ? null : parseInput(t)
        if (!p || p.kind === 'formula' || p.v === null) doc.write(sheet, r, c, { v: t })
        else doc.write(sheet, r, c, { v: p.v, ...(p.fmt ? { s: doc.wb.styles.intern({ fmt: p.fmt }) } : {}) })
      }),
    )
    createTable(doc, { r1: 0, c1: 0, r2: Math.max(1, set.rows.length - 1), c2: width - 1 }, true)
    doc.selectRange({ r1: 0, c1: 0, r2: 0, c2: 0 })
  })
  return null
}

// ---------------------------------------------------------------------
// Recommended PivotTables
// ---------------------------------------------------------------------

export type PivotSuggestion = { title: string; rows: string[]; values: PivotDef['values'] }

/** A handful of useful summaries of the source: each category field by each number field. */
export function recommendPivots(doc: Doc, source: string): PivotSuggestion[] {
  const src = readSource(doc, { source })
  if (!src) return []
  const isNum = src.fields.map((_, i) => src.rows.length > 0 && src.rows.filter((r) => r.values[i] !== null).every((r) => typeof r.values[i] === 'number'))
  const distinct = src.fields.map((_, i) => new Set(src.rows.map((r) => r.texts[i])).size)
  const cats = src.fields.filter((_, i) => !isNum[i] && distinct[i] > 1 && distinct[i] <= Math.max(50, src.rows.length / 2))
  const nums = src.fields.filter((_, i) => isNum[i])
  const out: PivotSuggestion[] = []
  for (const cat of cats)
    for (const num of nums) {
      out.push({ title: `Sum of ${num} by ${cat}`, rows: [cat], values: [{ field: num, fn: 'sum', showAs: 'normal' }] })
      if (out.length >= 8) return out
    }
  for (const cat of cats) if (out.length < 10) out.push({ title: `Count of ${cat}`, rows: [cat], values: [{ field: cat, fn: 'count', showAs: 'normal' }] })
  return out
}

export function previewPivot(doc: Doc, source: string, s: PivotSuggestion) {
  const src = readSource(doc, { source })
  if (!src) return []
  const p: PivotDef = { id: 0, name: 'Preview', source, r: 0, c: 0, rows: s.rows, cols: [], values: s.values, filters: [], grandRows: true, grandCols: true, subtotals: true, layout: 'compact', style: 'TableStyleLight16', bandRows: false, collapsed: [] }
  return computePivot(p, src).map((row) => row.map((c) => c.v))
}

export function insertRecommendedPivot(doc: Doc, source: string, s: PivotSuggestion): string | null {
  const err = createPivot(doc, source, { sheet: 'new', r: 0, c: 0 })
  if (err) return err
  const p = doc.sheet.x.pivots[doc.sheet.x.pivots.length - 1]
  updatePivot(doc, p.id, (x) => {
    x.rows = [...s.rows]
    x.values = s.values.map((v) => ({ ...v }))
  }, 'Insert PivotTable')
  return null
}

// ---------------------------------------------------------------------
// Forecast Sheet
// ---------------------------------------------------------------------

/**
 * Data > Forecast Sheet: copies the timeline and values to a new sheet, adds FORECAST.ETS
 * formulas (with confidence bounds) up to the forecast end and a line chart of all of it.
 */
export function createForecastSheet(doc: Doc, timeline: string, values: string, end: number, confidence: number, seasonality: number): string | null {
  const t = resolveRef(doc.wb, timeline, doc.sheet)
  const v = resolveRef(doc.wb, values, doc.sheet)
  if (!t || !v) return 'Select a timeline and a value range.'
  const read = (rg: Range, sheet: Sheet) => {
    const out: Scalar[] = []
    for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) out.push(doc.value(r, c, sheet))
    return out
  }
  let ts = read(t.range, t.sheet)
  let ys = read(v.range, v.sheet)
  const header = typeof ts[0] !== 'number' || typeof ys[0] !== 'number'
  const tName = header ? String(ts[0] ?? 'Timeline') : 'Timeline'
  const vName = header ? String(ys[0] ?? 'Values') : 'Values'
  if (header) {
    ts = ts.slice(1)
    ys = ys.slice(1)
  }
  if (ts.length !== ys.length || ts.length < 3 || ts.some((x) => typeof x !== 'number')) return 'The timeline must contain at least three numbers or dates, one for each value.'
  const nums = ts as number[]
  const model = etsFit(ys.map((y) => (typeof y === 'number' ? y : 0)), nums, seasonality)
  if (model instanceof CellError) return 'The forecast could not be computed for this data (the timeline needs a constant step).'
  const step = model.step
  const last = Math.max(...nums)
  if (!(end > last)) return 'The forecast end must be after the last timeline value.'
  // dates a month apart continue month by month
  const sorted = [...nums].sort((a, b) => a - b)
  const monthly = sorted.slice(1).every((x, i) => x - sorted[i] >= 28 && x - sorted[i] <= 31)
  const nextT = (k: number) => {
    if (!monthly) return last + k * step
    const d = new Date(Date.UTC(1899, 11, 30) + last * 86400000)
    return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000
  }
  let future = 0
  while (future < 10000 && nextT(future + 1) <= end + 1e-9) future++
  if (!future) future = 1
  const fmt = doc.wb.styles.get(t.sheet.styleId(t.range.r1 + (header ? 1 : 0), t.range.c1)).fmt
  const n = ts.length
  doc.transact('Forecast Sheet', () => {
    doc.noteWorkbook()
    const sheet = doc.wb.addSheet(doc.wb.uniqueSheetName('Forecast'), doc.activeIndex)
    doc.activeIndex = doc.wb.sheets.indexOf(sheet)
    const head = [tName, vName, `Forecast(${vName})`, `Lower Confidence Bound(${vName})`, `Upper Confidence Bound(${vName})`]
    head.forEach((h, c) => doc.write(sheet, 0, c, { v: h }))
    const tStyle = fmt ? doc.wb.styles.intern({ fmt }) : 0
    const num = doc.wb.styles.intern({ fmt: '0.00' })
    const tv = `$A$2:$A$${n + 1}`
    const yv = `$B$2:$B$${n + 1}`
    for (let i = 0; i < n; i++) {
      doc.write(sheet, i + 1, 0, { v: nums[i], ...(tStyle ? { s: tStyle } : {}) })
      if (ys[i] !== null) doc.write(sheet, i + 1, 1, { v: ys[i] as Scalar })
    }
    // the forecast starts at the last actual value so the lines connect
    doc.write(sheet, n, 2, { f: `B${n + 1}`, s: num })
    doc.write(sheet, n, 3, { f: `C${n + 1}`, s: num })
    doc.write(sheet, n, 4, { f: `C${n + 1}`, s: num })
    for (let k = 1; k <= future; k++) {
      const r = n + k
      doc.write(sheet, r, 0, { v: nextT(k), ...(tStyle ? { s: tStyle } : {}) })
      doc.write(sheet, r, 2, { f: `FORECAST.ETS(A${r + 1},${yv},${tv},${seasonality},1)`, s: num })
      doc.write(sheet, r, 3, { f: `C${r + 1}-FORECAST.ETS.CONFINT(A${r + 1},${yv},${tv},${confidence},${seasonality},1)`, s: num })
      doc.write(sheet, r, 4, { f: `C${r + 1}+FORECAST.ETS.CONFINT(A${r + 1},${yv},${tv},${confidence},${seasonality},1)`, s: num })
    }
    createTable(doc, { r1: 0, c1: 0, r2: n + future, c2: 4 }, true)
    for (let c = 0; c < 5; c++) sheet.cols.manual.set(c, c === 0 ? 96 : 150)
    sheet.cols.touch()
    const chart = newChart(doc, 'line', 'clustered', `${absRef(sheet, { r1: 0, c1: 0, r2: n + future, c2: 4 })}`, { title: { show: true, text: `${vName} forecast` } })
    chart.anchor = { x: 6 * 100 + 140, y: 24, w: 520, h: 300 }
    addObject(doc, chart, 'Forecast Sheet', sheet)
    doc.selectRange({ r1: 0, c1: 0, r2: 0, c2: 0 })
  })
  return null
}

// ---------------------------------------------------------------------
// Fill > Justify, Clear Comments and Notes
// ---------------------------------------------------------------------

/** Fill > Justify: rewraps the text of the selected column cells so each line fits the column width. */
export function fillJustify(doc: Doc): string | null {
  const rg = doc.activeRange
  const sheet = doc.sheet
  if (rg.c1 !== rg.c2 && rg.r1 === rg.r2) return 'Select cells in one column.'
  const words: string[] = []
  for (let r = rg.r1; r <= rg.r2; r++) {
    const v = doc.value(r, rg.c1, sheet)
    if (typeof v === 'number' || (sheet.get(r, rg.c1)?.f !== undefined)) return 'Cells with numbers or formulas cannot be justified.'
    if (typeof v === 'string' && v.trim()) words.push(...v.trim().split(/\s+/))
  }
  if (!words.length) return null
  const width = sheet.cols.offset(rg.c2 + 1) - sheet.cols.offset(rg.c1)
  const measure = (t: string) => doc.measure?.(t, doc.style(rg.r1, rg.c1)) ?? t.length * 7
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (line && measure(next) > width - 6) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  doc.transact('Justify', () => {
    for (let r = rg.r1; r <= Math.max(rg.r2, rg.r1 + lines.length - 1); r++) {
      const text = lines[r - rg.r1]
      const old = sheet.get(r, rg.c1)
      if (text !== undefined) doc.write(sheet, r, rg.c1, { ...(old ?? {}), v: text, f: undefined })
      else if (old) doc.write(sheet, r, rg.c1, { ...old, v: undefined })
    }
  })
  return null
}

export function clearNotesAndComments(doc: Doc) {
  const sheet = doc.sheet
  const keys = new Set<number>()
  for (const rg of doc.sel.ranges) {
    const b = doc.boundToUsed(rg)
    for (const k of [...Object.keys(sheet.x.notes), ...Object.keys(sheet.x.comments)].map(Number)) {
      const r = Math.floor(k / 16384)
      const c = k % 16384
      if (r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2) keys.add(k)
    }
  }
  if (!keys.size) return
  doc.transact('Clear Comments and Notes', () => {
    doc.noteProps(sheet)
    const notes = { ...sheet.x.notes }
    const comments = { ...sheet.x.comments }
    for (const k of keys) {
      delete notes[k]
      delete comments[k]
    }
    sheet.x.notes = notes
    sheet.x.comments = comments
  })
}

// ---------------------------------------------------------------------
// Check Accessibility
// ---------------------------------------------------------------------

export type A11yIssue = { level: 'Errors' | 'Warnings' | 'Tips'; rule: string; sheet: string; where: string; fix: string; go?: { sheet: number; r: number; c: number; obj?: number } }

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 1
  const ch = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Review > Check Accessibility: missing alternative text, tables without headers, merged cells, low contrast, default sheet names. */
export function checkAccessibility(doc: Doc): A11yIssue[] {
  const out: A11yIssue[] = []
  for (const sheet of doc.wb.sheets) {
    for (const o of sheet.x.objects) {
      const alt = 'alt' in o ? (o as { alt?: string }).alt : undefined
      if ((o.kind === 'picture' || o.kind === 'chart' || o.kind === 'shape') && !alt) out.push({ level: 'Errors', rule: 'Missing alternative text', sheet: sheet.name, where: o.name, fix: 'Add a description (right-click the object, Edit Alt Text).', go: { sheet: sheet.id, r: 0, c: 0, obj: o.id } })
    }
    for (const t of sheet.x.tables) if (!t.header) out.push({ level: 'Errors', rule: 'No header row in table', sheet: sheet.name, where: t.name, fix: 'Turn on Header Row in Table Design.', go: { sheet: sheet.id, r: t.range.r1, c: t.range.c1 } })
    for (const m of sheet.merges) out.push({ level: 'Warnings', rule: 'Merged cells', sheet: sheet.name, where: `${colLabel(m.c1)}${m.r1 + 1}:${colLabel(m.c2)}${m.r2 + 1}`, fix: 'Unmerge the cells; screen readers read merged cells poorly.', go: { sheet: sheet.id, r: m.r1, c: m.c1 } })
    let low = 0
    for (const [k, d] of sheet.cells) {
      if (low >= 20 || !d.s || d.v === undefined) continue
      const st = doc.wb.styles.get(d.s)
      if (!st.color && !st.fill) continue
      if (contrast(st.color ?? '#000000', st.fill ?? '#FFFFFF') < 4.5) {
        low++
        const r = Math.floor(k / 16384)
        const c = k % 16384
        out.push({ level: 'Warnings', rule: 'Hard-to-read text contrast', sheet: sheet.name, where: `${colLabel(c)}${r + 1}`, fix: 'Use a darker font color or a lighter fill.', go: { sheet: sheet.id, r, c } })
      }
    }
    if (/^Sheet\d+$/.test(sheet.name) && sheet.used().r >= 0) out.push({ level: 'Tips', rule: 'Default sheet name', sheet: sheet.name, where: sheet.name, fix: 'Give the sheet a meaningful name.', go: { sheet: sheet.id, r: 0, c: 0 } })
  }
  return out
}

function colLabel(c: number) {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

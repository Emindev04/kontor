// Turns a chart definition into plain data: categories and numeric series read from the cells.
import { colName, parseRange, quoteSheet, type Range } from '../model/address'
import type { ChartDef, ChartSeries, SeriesType } from '../model/extras'
import { formatValue } from '../model/numfmt'
import { numberSymbols, type NumberSymbols } from '../model/numberLocale'
import type { Sheet } from '../model/sheet'
import { CellError, type Scalar } from '../model/types'
import type { Workbook } from '../model/workbook'
import type { Engine } from '../engine/engine'

export type SeriesData = {
  name: string
  values: (number | null)[]
  /** Numeric x values (scatter charts). */
  xs?: (number | null)[]
  /** Display text of each value (data labels). */
  labels: string[]
  type: SeriesType
  secondary: boolean
  color?: string
  trendline?: ChartSeries['trendline']
}

export type ChartData = { categories: string[]; series: SeriesData[]; fmt?: string }

/** "Sheet 1!$A$1:$B$3" → sheet + range. Without a sheet the default sheet is used. */
export function resolveRef(wb: Workbook, text: string, fallback?: Sheet): { sheet: Sheet; range: Range } | null {
  const t = text.trim().replace(/^=/, '')
  const bang = t.lastIndexOf('!')
  let sheet = fallback
  let ref = t
  if (bang >= 0) {
    let name = t.slice(0, bang)
    if (name.startsWith("'") && name.endsWith("'")) name = name.slice(1, -1).replace(/''/g, "'")
    sheet = wb.sheetByName(name)
    ref = t.slice(bang + 1)
  }
  if (!sheet) return null
  const range = parseRange(ref.replace(/\$/g, ''))
  return range ? { sheet, range } : null
}

export const absRef = (sheet: Sheet, rg: Range) =>
  `${quoteSheet(sheet.name)}!$${colName(rg.c1)}$${rg.r1 + 1}${rg.r1 === rg.r2 && rg.c1 === rg.c2 ? '' : `:$${colName(rg.c2)}$${rg.r2 + 1}`}`

type Reader = { value: (s: Sheet, r: number, c: number) => Scalar; text: (s: Sheet, r: number, c: number) => string; fmt: (s: Sheet, r: number, c: number) => string | undefined }

/** Reads cells for charts. `sym` gives the number separators of `text` (the interface language's by default). */
export function makeReader(wb: Workbook, engine: Engine, sym: NumberSymbols = numberSymbols()): Reader {
  const fmt = (s: Sheet, r: number, c: number) => wb.styles.get(s.styleId(r, c)).fmt
  return {
    value: (s, r, c) => engine.display(s, r, c),
    fmt,
    text: (s, r, c) => {
      const v = engine.display(s, r, c)
      if (v === null) return ''
      if (v instanceof CellError) return v.code
      if (typeof v === 'number') return formatValue(v, fmt(s, r, c), 11, sym).text
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
      return String(v)
    },
  }
}

const isText = (v: Scalar) => typeof v === 'string' && v !== ''

/** Series a range turns into, like the original's automatic series detection. */
export function deriveSeries(wb: Workbook, engine: Engine, source: string, byRow: boolean | undefined, scatter = false): { series: ChartSeries[]; byRow: boolean } {
  const res = resolveRef(wb, source)
  if (!res) return { series: [], byRow: !!byRow }
  const { sheet, range } = res
  const rd = makeReader(wb, engine)
  const v = (r: number, c: number) => rd.value(sheet, r, c)
  const rows = range.r2 - range.r1 + 1
  const cols = range.c2 - range.c1 + 1
  let headerRow = false
  for (let c = range.c1; c <= range.c2; c++) if (isText(v(range.r1, c))) headerRow = true
  if (rows === 1) headerRow = false
  let headerCol = false
  for (let r = range.r1 + (headerRow ? 1 : 0); r <= range.r2; r++) if (isText(v(r, range.c1))) headerCol = true
  if (cols === 1) headerCol = false
  if (!headerCol && headerRow && v(range.r1, range.c1) === null && cols > 1) headerCol = true
  if (scatter && cols > 1 && !byRow) headerCol = true
  const dataRows = rows - (headerRow ? 1 : 0)
  const dataCols = cols - (headerCol ? 1 : 0)
  const inRows = byRow ?? dataCols > dataRows
  const series: ChartSeries[] = []
  const r0 = range.r1 + (headerRow ? 1 : 0)
  const c0 = range.c1 + (headerCol ? 1 : 0)
  if (!inRows) {
    const cats = headerCol ? absRef(sheet, { r1: r0, c1: range.c1, r2: range.r2, c2: range.c1 }) : undefined
    for (let c = c0; c <= range.c2; c++) {
      series.push({
        name: headerRow ? absRef(sheet, { r1: range.r1, c1: c, r2: range.r1, c2: c }) : `Series${series.length + 1}`,
        values: absRef(sheet, { r1: r0, c1: c, r2: range.r2, c2: c }),
        categories: cats,
      })
    }
  } else {
    const cats = headerRow ? absRef(sheet, { r1: range.r1, c1: c0, r2: range.r1, c2: range.c2 }) : undefined
    for (let r = r0; r <= range.r2; r++) {
      series.push({
        name: headerCol ? absRef(sheet, { r1: r, c1: range.c1, r2: r, c2: range.c1 }) : `Series${series.length + 1}`,
        values: absRef(sheet, { r1: r, c1: c0, r2: r, c2: range.c2 }),
        categories: cats,
      })
    }
  }
  return { series, byRow: inRows }
}

function cellsOf(wb: Workbook, text: string | undefined): { sheet: Sheet; cells: [number, number][] } | null {
  if (!text) return null
  const res = resolveRef(wb, text)
  if (!res) return null
  const { sheet, range } = res
  const cells: [number, number][] = []
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) {
      if (sheet.rows.hidden.has(r) || sheet.cols.hidden.has(c)) continue
      cells.push([r, c])
    }
  return { sheet, cells }
}

export function seriesName(wb: Workbook, engine: Engine, name: string | undefined, i: number): string {
  if (!name) return `Series${i + 1}`
  if (/!/.test(name)) {
    const res = cellsOf(wb, name)
    if (res && res.cells.length) {
      const rd = makeReader(wb, engine)
      return res.cells.map(([r, c]) => rd.text(res.sheet, r, c)).join(' ') || `Series${i + 1}`
    }
  }
  return name.replace(/^"|"$/g, '')
}

export function chartSeries(wb: Workbook, engine: Engine, chart: ChartDef): ChartSeries[] {
  if (chart.series) return chart.series
  return deriveSeries(wb, engine, chart.source, chart.byRow, chart.type === 'scatter').series
}

export function chartData(wb: Workbook, engine: Engine, chart: ChartDef): ChartData {
  const rd = makeReader(wb, engine)
  const list = chartSeries(wb, engine, chart)
  let categories: string[] = []
  let fmt: string | undefined
  const series: SeriesData[] = list.map((s, i) => {
    const vals = cellsOf(wb, s.values)
    const values: (number | null)[] = []
    const labels: string[] = []
    if (vals) {
      for (const [r, c] of vals.cells) {
        const v = rd.value(vals.sheet, r, c)
        values.push(typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : null)
        labels.push(typeof v === 'number' ? rd.text(vals.sheet, r, c) : '')
        if (fmt === undefined) fmt = rd.fmt(vals.sheet, r, c)
      }
    }
    let xs: (number | null)[] | undefined
    const cats = cellsOf(wb, s.categories)
    if (cats) {
      const texts = cats.cells.map(([r, c]) => rd.text(cats.sheet, r, c))
      if (i === 0 || !categories.length) categories = texts
      if (chart.type === 'scatter') xs = cats.cells.map(([r, c]) => {
        const v = rd.value(cats.sheet, r, c)
        return typeof v === 'number' ? v : null
      })
    }
    return {
      name: seriesName(wb, engine, s.name, i),
      values,
      xs,
      labels,
      type: s.type ?? (chart.type === 'line' ? 'line' : chart.type === 'area' ? 'area' : 'column'),
      secondary: !!s.secondary,
      color: s.color,
      trendline: s.trendline,
    }
  })
  const n = Math.max(0, ...series.map((s) => s.values.length))
  if (categories.length < n) for (let i = categories.length; i < n; i++) categories.push(String(i + 1))
  if (chart.type === 'scatter') for (const s of series) if (!s.xs) s.xs = s.values.map((_, i) => i + 1)
  return { categories: categories.slice(0, Math.max(n, 1)), series, fmt }
}

// Charts: defaults, sample data, colors, axis scaling and data-sheet helpers.
import type { ChartElement, ChartGrouping, ChartSeries, ChartType, ColorRef, ErrorBars, Trendline, TrendlineType } from './types'
import { t, tx } from '../i18n'

export const CHART_TYPES: { type: ChartType; label: string; groupings?: ChartGrouping[] }[] = [
  { type: 'column', label: tx('Column'), groupings: ['clustered', 'stacked', 'percent'] },
  { type: 'line', label: tx('Line'), groupings: ['clustered', 'stacked', 'percent'] },
  { type: 'pie', label: tx('Pie') },
  { type: 'doughnut', label: tx('Doughnut') },
  { type: 'bar', label: tx('Bar'), groupings: ['clustered', 'stacked', 'percent'] },
  { type: 'area', label: tx('Area'), groupings: ['clustered', 'stacked', 'percent'] },
  { type: 'scatter', label: tx('X Y (Scatter)') },
  { type: 'combo', label: tx('Combo') },
]

export function groupingLabel(type: ChartType, g: ChartGrouping) {
  if (type === 'line') return g === 'clustered' ? t('Line') : g === 'stacked' ? t('Stacked Line') : t('100% Stacked Line')
  if (type === 'area') return g === 'clustered' ? t('Area') : g === 'stacked' ? t('Stacked Area') : t('100% Stacked Area')
  if (type === 'bar') return g === 'clustered' ? t('Clustered Bar') : g === 'stacked' ? t('Stacked Bar') : t('100% Stacked Bar')
  if (type === 'column') return g === 'clustered' ? t('Clustered Column') : g === 'stacked' ? t('Stacked Column') : t('100% Stacked Column')
  return t(CHART_TYPES.find((ct) => ct.type === type)?.label ?? type)
}

/** The sample data the original inserts for a new chart. */
export function sampleData(type: ChartType): { categories: string[]; series: ChartSeries[] } {
  if (type === 'pie' || type === 'doughnut') return { categories: [t('1st Qtr'), t('2nd Qtr'), t('3rd Qtr'), t('4th Qtr')], series: [{ name: t('Sales'), values: [8.2, 3.2, 1.4, 1.2] }] }
  if (type === 'scatter') return { categories: ['0.7', '1.8', '2.6'], series: [{ name: t('Y-Values'), values: [2.7, 3.2, 0.8] }] }
  return {
    categories: [t('Category 1'), t('Category 2'), t('Category 3'), t('Category 4')],
    series: [
      { name: t('Series 1'), values: [4.3, 2.5, 3.5, 4.5] },
      { name: t('Series 2'), values: [2.4, 4.4, 1.8, 2.8], type: type === 'combo' ? 'column' : undefined },
      { name: t('Series 3'), values: [2, 2, 3, 5], type: type === 'combo' ? 'line' : undefined },
    ],
  }
}

export function createChart(type: ChartType, grouping: ChartGrouping, box: { x: number; y: number; w: number; h: number }, id: string, name: string): ChartElement {
  const data = sampleData(type)
  if (type === 'combo') data.series[0].type = 'column'
  return {
    id,
    type: 'chart',
    name,
    ...box,
    rot: 0,
    chartType: type,
    grouping,
    categories: data.categories,
    series: data.series,
    title: { show: true, text: type === 'pie' || type === 'doughnut' ? t('Sales') : t('Chart Title') },
    legend: { show: type !== 'scatter', pos: 'bottom' },
    dataLabels: false,
    axes: { cat: true, val: true },
    gridlines: { major: true, minor: false },
    style: 1,
    palette: 0,
    markers: false,
    smooth: false,
    fill: { type: 'none' },
    line: null,
  }
}

const ACCENTS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']

/** Series (or pie slice) color: palette 0 cycles the accents, then darker and lighter versions. */
export function seriesColor(chart: Pick<ChartElement, 'palette'>, index: number, count: number, explicit?: ColorRef | null): ColorRef {
  if (explicit) return explicit
  if (chart.palette >= 1 && chart.palette <= 6) {
    const base = `theme:${ACCENTS[chart.palette - 1]}`
    if (count <= 1) return base
    // Spread from darker to lighter shades of one accent.
    const t = index / Math.max(1, count - 1)
    const amount = Math.round(-50 + t * 110)
    return amount === 0 ? base : `${base}:${amount < 0 ? 'd' : 'l'}${Math.abs(amount)}`
  }
  if (chart.palette >= 7 && chart.palette <= 9) {
    const offset = (chart.palette - 7) * 2 + 1
    return `theme:${ACCENTS[(index + offset) % 6]}`
  }
  const cycle = Math.floor(index / 6)
  const slot = `theme:${ACCENTS[index % 6]}`
  return cycle === 0 ? slot : cycle % 2 ? `${slot}:d25` : `${slot}:l40`
}

export const CHART_PALETTES: { id: number; label: string; n?: number }[] = [
  { id: 0, label: tx('Colorful Palette 1') },
  { id: 7, label: tx('Colorful Palette 2') },
  { id: 8, label: tx('Colorful Palette 3') },
  { id: 9, label: tx('Colorful Palette 4') },
  ...ACCENTS.map((_, i) => ({ id: i + 1, label: tx('Monochromatic Palette {n}'), n: i + 1 })),
]

export type ChartStyleDef = { id: number; label: string; labels?: boolean; noGrid?: boolean; dark?: boolean; outline?: boolean; shadow?: boolean; gradient?: boolean; wide?: boolean }

export const CHART_STYLES: ChartStyleDef[] = [
  { id: 1, label: tx('Style 1') },
  { id: 2, label: tx('Style 2'), labels: true, noGrid: true, wide: true },
  { id: 3, label: tx('Style 3'), gradient: true },
  { id: 4, label: tx('Style 4'), outline: true, noGrid: true },
  { id: 5, label: tx('Style 5'), shadow: true },
  { id: 6, label: tx('Style 6'), dark: true },
  { id: 7, label: tx('Style 7'), dark: true, gradient: true, labels: true },
  { id: 8, label: tx('Style 8'), outline: true, wide: true, labels: true },
]

export function chartStyle(id: number) {
  return CHART_STYLES.find((s) => s.id === id) ?? CHART_STYLES[0]
}

// ---------- Axis scaling ----------

export function niceStep(range: number, target = 6) {
  if (!(range > 0)) return 1
  const raw = range / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
}

export function niceScale(min: number, max: number, fixedMin?: number | null, fixedMax?: number | null) {
  let lo = Math.min(0, min)
  let hi = Math.max(0, max)
  if (lo === hi) hi = lo + 1
  // Like the original, leave a little headroom above the largest value.
  if (fixedMax == null && hi > 0) hi += (hi - lo) * 0.05
  if (fixedMin == null && lo < 0) lo -= (hi - lo) * 0.05
  const step = niceStep(hi - lo)
  lo = fixedMin ?? Math.floor(lo / step + 1e-9) * step
  hi = fixedMax ?? Math.ceil(hi / step - 1e-9) * step
  if (hi <= lo) hi = lo + step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step)
  return { min: lo, max: hi, step, ticks }
}

export function formatTick(v: number, percent = false) {
  if (percent) return `${Math.round(v * 100)}%`
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${+(v / 1e6).toFixed(1)}M`
  if (abs >= 1e4) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return String(+v.toFixed(Math.max(0, 3 - Math.floor(Math.log10(abs || 1)))))
}

// ---------- Data sheet ----------

/** The data as a grid like the chart's worksheet: row 0 = series names, column 0 = categories. */
export function chartToGrid(c: Pick<ChartElement, 'categories' | 'series'>): string[][] {
  const header = ['', ...c.series.map((s) => s.name)]
  const rows = c.categories.map((cat, i) => [cat, ...c.series.map((s) => (s.values[i] === null || s.values[i] === undefined ? '' : String(s.values[i])))])
  return [header, ...rows]
}

export function gridToChart(grid: string[][], prev: ChartSeries[]): { categories: string[]; series: ChartSeries[] } {
  const header = grid[0] ?? ['']
  const body = grid.slice(1).filter((r) => r.some((v) => v.trim() !== ''))
  const series: ChartSeries[] = header.slice(1).map((name, i) => ({
    ...(prev[i] ?? {}),
    name: name || t('Series {n}', { n: i + 1 }),
    values: body.map((r) => {
      const v = parseFloat((r[i + 1] ?? '').replace(/,/g, ''))
      return Number.isFinite(v) ? v : null
    }),
  }))
  return { categories: body.map((r) => r[0] ?? ''), series }
}

/** Switch Row/Column: series become categories and vice versa. */
export function switchRowColumn(c: Pick<ChartElement, 'categories' | 'series'>): { categories: string[]; series: ChartSeries[] } {
  return {
    categories: c.series.map((s) => s.name),
    series: c.categories.map((cat, i) => ({ name: cat, values: c.series.map((s) => s.values[i] ?? null) })),
  }
}

// ---------- Trendlines ----------

/** Solves a small linear system (Gaussian elimination with partial pivoting). */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    if (Math.abs(m[p][c]) < 1e-12) return null
    ;[m[c], m[p]] = [m[p], m[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]
    }
  }
  return m.map((row, i) => row[n] / row[i])
}

const fmt = (v: number) => {
  const a = Math.abs(v)
  return a !== 0 && (a < 0.001 || a >= 1e6) ? v.toExponential(3) : String(Math.round(v * 10000) / 10000)
}

export type TrendFit = { at: (x: number) => number | null; equation: string; r2: number } | { points: [number, number][]; equation: ''; r2: null }

/** Fits a trendline to the points (x, y); null when the data does not allow it (e.g. log of ≤ 0). */
export function fitTrend(points: [number, number][], t: Trendline): TrendFit | null {
  const pts = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (pts.length < 2) return null
  if (t.type === 'movingAvg') {
    const p = Math.max(2, Math.min(pts.length, t.period ?? 2))
    const out: [number, number][] = []
    for (let i = p - 1; i < pts.length; i++) out.push([pts[i][0], pts.slice(i - p + 1, i + 1).reduce((a, q) => a + q[1], 0) / p])
    return { points: out, equation: '', r2: null }
  }
  const mean = pts.reduce((a, q) => a + q[1], 0) / pts.length
  const r2 = (at: (x: number) => number | null) => {
    let ssRes = 0
    let ssTot = 0
    for (const [x, y] of pts) {
      const f = at(x) ?? 0
      ssRes += (y - f) ** 2
      ssTot += (y - mean) ** 2
    }
    return ssTot ? 1 - ssRes / ssTot : 1
  }
  const linear = (data: [number, number][]) => {
    const n = data.length
    const sx = data.reduce((a, q) => a + q[0], 0)
    const sy = data.reduce((a, q) => a + q[1], 0)
    const sxx = data.reduce((a, q) => a + q[0] * q[0], 0)
    const sxy = data.reduce((a, q) => a + q[0] * q[1], 0)
    const den = n * sxx - sx * sx
    if (!den) return null
    const b = (n * sxy - sx * sy) / den
    return { a: (sy - b * sx) / n, b }
  }
  switch (t.type) {
    case 'linear': {
      const l = linear(pts)
      if (!l) return null
      const at = (x: number) => l.a + l.b * x
      return { at, equation: `y = ${fmt(l.b)}x ${l.a < 0 ? '-' : '+'} ${fmt(Math.abs(l.a))}`, r2: r2(at) }
    }
    case 'exponential': {
      if (pts.some(([, y]) => y <= 0)) return null
      const l = linear(pts.map(([x, y]) => [x, Math.log(y)]))
      if (!l) return null
      const at = (x: number) => Math.exp(l.a) * Math.exp(l.b * x)
      return { at, equation: `y = ${fmt(Math.exp(l.a))}e^${fmt(l.b)}x`, r2: r2(at) }
    }
    case 'logarithmic': {
      if (pts.some(([x]) => x <= 0)) return null
      const l = linear(pts.map(([x, y]) => [Math.log(x), y]))
      if (!l) return null
      const at = (x: number) => (x > 0 ? l.a + l.b * Math.log(x) : null)
      return { at, equation: `y = ${fmt(l.b)}ln(x) ${l.a < 0 ? '-' : '+'} ${fmt(Math.abs(l.a))}`, r2: r2(at) }
    }
    case 'power': {
      if (pts.some(([x, y]) => x <= 0 || y <= 0)) return null
      const l = linear(pts.map(([x, y]) => [Math.log(x), Math.log(y)]))
      if (!l) return null
      const at = (x: number) => (x > 0 ? Math.exp(l.a) * x ** l.b : null)
      return { at, equation: `y = ${fmt(Math.exp(l.a))}x^${fmt(l.b)}`, r2: r2(at) }
    }
    case 'polynomial': {
      const k = Math.max(2, Math.min(6, t.order ?? 2, pts.length - 1))
      const a = Array.from({ length: k + 1 }, (_, i) => Array.from({ length: k + 1 }, (_, j) => pts.reduce((s, q) => s + q[0] ** (i + j), 0)))
      const b = Array.from({ length: k + 1 }, (_, i) => pts.reduce((s, q) => s + q[1] * q[0] ** i, 0))
      const c = solve(a, b)
      if (!c) return null
      const at = (x: number) => c.reduce((s, ci, i) => s + ci * x ** i, 0)
      const terms = c
        .map((ci, i) => ({ ci, i }))
        .reverse()
        .map(({ ci, i }, n) => `${n ? (ci < 0 ? ' - ' : ' + ') : ci < 0 ? '-' : ''}${fmt(Math.abs(ci))}${i ? (i === 1 ? 'x' : `x^${i}`) : ''}`)
        .join('')
      return { at, equation: `y = ${terms}`, r2: r2(at) }
    }
  }
}

export const TRENDLINE_LABELS: Record<TrendlineType, string> = { linear: tx('Linear'), exponential: tx('Exponential'), logarithmic: tx('Logarithmic'), polynomial: tx('Polynomial'), power: tx('Power'), movingAvg: tx('Moving Average') }

/** Charts that can be drawn with a 3-D look. */
export const THREE_D_TYPES = new Set<ChartType>(['column', 'bar', 'pie'])

/** Minus and plus amounts of a series' error bar at one point. */
export function errorAmount(values: (number | null)[], i: number, eb: ErrorBars): [number, number] {
  const nums = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v))
  const v = values[i] ?? 0
  let amount = eb.value
  if (eb.type === 'percent') amount = (Math.abs(v) * eb.value) / 100
  else if (eb.type === 'stdDev' || eb.type === 'stdErr') {
    const n = nums.length
    const mean = nums.reduce((a, b) => a + b, 0) / (n || 1)
    const sd = n > 1 ? Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
    amount = eb.type === 'stdDev' ? sd * eb.value : sd / Math.sqrt(n || 1)
  }
  return [eb.dir === 'plus' ? 0 : amount, eb.dir === 'minus' ? 0 : amount]
}

export const ERROR_BAR_PRESETS: { label: string; bars: ErrorBars | null }[] = [
  { label: tx('None'), bars: null },
  { label: tx('Standard Error'), bars: { type: 'stdErr', value: 1, dir: 'both' } },
  { label: tx('Percentage (5%)'), bars: { type: 'percent', value: 5, dir: 'both' } },
  { label: tx('Standard Deviation'), bars: { type: 'stdDev', value: 1, dir: 'both' } },
]

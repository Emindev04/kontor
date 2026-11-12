// Draws a chart as an SVG string. The same output is used on the sheet, in thumbnails, when
// printing and when a chart is exported as a picture.
import { currentTheme } from '../model/theme'
import type { ChartDef } from '../model/extras'
import { formatValue } from '../model/numfmt'
import type { ChartData, SeriesData } from './chartData'

/** Own color palettes: 0 is the colorful default, 1-7 are monochromatic. */
export const PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Colorful', colors: ['#2E6FD8', '#F28C28', '#8D99AE', '#F2C12E', '#2FA6C8', '#4CAF50', '#1F3B73', '#B5562C', '#5C6B7A', '#A8841A'] },
  { name: 'Blue', colors: ['#1F4E9A', '#2E6FD8', '#5B92E5', '#8DB4EE', '#B9D1F5', '#163A73'] },
  { name: 'Orange', colors: ['#B8591A', '#F28C28', '#F5A85E', '#F8C493', '#FBDFC4', '#8A4313'] },
  { name: 'Green', colors: ['#2C6E31', '#4CAF50', '#78C47B', '#A4D8A6', '#CFEBD0', '#1F4F23'] },
  { name: 'Gray', colors: ['#3E4651', '#5C6B7A', '#8D99AE', '#B3BCCB', '#D6DCE5', '#2A3038'] },
  { name: 'Gold', colors: ['#8A6A10', '#C8A12A', '#F2C12E', '#F6D36E', '#FAE6A9', '#5E480B'] },
  { name: 'Teal', colors: ['#1B6E82', '#2FA6C8', '#62BEDA', '#96D5E7', '#C8EAF3', '#124A58'] },
  { name: 'Berry', colors: ['#7A1F52', '#B53A7E', '#CF6EA4', '#E2A0C5', '#F1D0E2', '#541538'] },
]

type StylePreset = { bg: string; plot: string; grid: string; text: string; border: string; labelsInside: boolean; gradient: boolean; outline: string | null; gridDash: boolean }

export const CHART_STYLES: StylePreset[] = [
  { bg: '#FFFFFF', plot: 'none', grid: '#D9D9D9', text: '#595959', border: '#D9D9D9', labelsInside: false, gradient: false, outline: null, gridDash: false },
  { bg: '#FFFFFF', plot: 'none', grid: 'none', text: '#404040', border: '#D9D9D9', labelsInside: true, gradient: false, outline: null, gridDash: false },
  { bg: '#FFFFFF', plot: 'none', grid: '#E5E5E5', text: '#595959', border: '#D9D9D9', labelsInside: false, gradient: true, outline: null, gridDash: true },
  { bg: '#F2F2F2', plot: '#FFFFFF', grid: '#D9D9D9', text: '#404040', border: '#BFBFBF', labelsInside: false, gradient: false, outline: '#FFFFFF', gridDash: false },
  { bg: '#FFFFFF', plot: '#F7F7F7', grid: '#FFFFFF', text: '#595959', border: '#D9D9D9', labelsInside: false, gradient: false, outline: null, gridDash: false },
  { bg: '#FFFFFF', plot: 'none', grid: '#D9D9D9', text: '#262626', border: '#7F7F7F', labelsInside: false, gradient: false, outline: '#262626', gridDash: false },
  { bg: '#404040', plot: 'none', grid: '#5E5E5E', text: '#F2F2F2', border: '#404040', labelsInside: false, gradient: false, outline: null, gridDash: false },
  { bg: '#1E2A3A', plot: 'none', grid: '#34445A', text: '#E8EDF3', border: '#1E2A3A', labelsInside: true, gradient: true, outline: null, gridDash: true },
]

const FONT = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif"

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Rough text width for layout (the SVG is rendered by the browser later). */
const textW = (s: string, size: number) => s.length * size * 0.52

function niceStep(range: number, ticks: number) {
  const raw = range / Math.max(1, ticks)
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
}

export function niceScale(min: number, max: number, ticks = 6): { min: number; max: number; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 0.2 }
  if (min === max) {
    if (min === 0) return { min: 0, max: 1, step: 0.2 }
    min = Math.min(0, min)
    max = Math.max(0, max)
  }
  const step = niceStep(max - min, ticks)
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step }
}

function fmtNum(v: number, fmt: string | undefined, percent = false) {
  if (percent) return `${Math.round(v * 100)}%`
  if (fmt && fmt !== 'General') return formatValue(v, fmt).text
  const a = Math.abs(v)
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`
  return (+v.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 6 })
}

type Box = { x: number; y: number; w: number; h: number }

export function seriesColors(chart: ChartDef, n: number): string[] {
  // the colorful palette follows the workbook theme's accents
  const pal = !chart.palette ? { name: 'Colorful', colors: [...currentTheme().colors.accents, ...PALETTES[0].colors.slice(6)] } : PALETTES[chart.palette] ?? PALETTES[0]
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const base = pal.colors[i % pal.colors.length]
    out.push(i < pal.colors.length ? base : shade(base, -0.25 * Math.floor(i / pal.colors.length)))
  }
  return out
}

function shade(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t))
  return '#' + ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')
}

/** Linear/exponential/logarithmic regression or moving average over (x, y) points. */
export function trend(kind: NonNullable<SeriesData['trendline']>, pts: [number, number][]): [number, number][] {
  if (pts.length < 2) return []
  if (kind === 'movingAverage') {
    const out: [number, number][] = []
    for (let i = 1; i < pts.length; i++) out.push([pts[i][0], (pts[i][1] + pts[i - 1][1]) / 2])
    return out
  }
  const tx = (x: number) => (kind === 'logarithmic' ? Math.log(x) : x)
  const ty = (y: number) => (kind === 'exponential' ? Math.log(y) : y)
  const use = pts.filter(([x, y]) => (kind !== 'logarithmic' || x > 0) && (kind !== 'exponential' || y > 0))
  if (use.length < 2) return []
  const n = use.length
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const [x, y] of use) {
    const a = tx(x)
    const b = ty(y)
    sx += a
    sy += b
    sxx += a * a
    sxy += a * b
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1)
  const icpt = (sy - slope * sx) / n
  const xs = pts.map((p) => p[0])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const out: [number, number][] = []
  for (let i = 0; i <= 24; i++) {
    const x = x0 + ((x1 - x0) * i) / 24
    if (kind === 'logarithmic' && x <= 0) continue
    const y = slope * tx(x) + icpt
    out.push([x, kind === 'exponential' ? Math.exp(y) : y])
  }
  return out
}

/** Histogram bins of a value list (square-root rule, nice bin width). */
export function histogramBins(values: number[]): { labels: string[]; counts: number[] } {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return { labels: [], counts: [] }
  const min = v[0]
  const max = v[v.length - 1]
  const bins = Math.max(1, Math.min(30, Math.round(Math.sqrt(v.length))))
  const width = max > min ? niceStep(max - min, bins) : 1
  const start = Math.floor(min / width) * width
  const count = Math.max(1, Math.ceil((max - start) / width + (max === start ? 1 : 0)))
  const counts = new Array(count).fill(0)
  for (const x of v) counts[Math.min(count - 1, Math.floor((x - start) / width))]++
  const labels = counts.map((_, i) => `[${+(start + i * width).toPrecision(6)}, ${+(start + (i + 1) * width).toPrecision(6)}${i === count - 1 ? ']' : ')'}`)
  return { labels, counts }
}

export function renderChartSVG(chart: ChartDef, data: ChartData, W: number, H: number): string {
  const st = CHART_STYLES[(chart.style || 1) - 1] ?? CHART_STYLES[0]
  const text = chart.fontColor ?? st.text
  const bg = chart.fill ?? st.bg
  const out: string[] = []
  const fs = 12
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" font-family="${FONT}" font-size="${fs}">`)
  out.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="${bg}" stroke="${chart.border ?? st.border}"/>`)
  if (st.gradient) out.push(`<defs><linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient></defs>`)

  let series = data.series
  let categories = data.categories
  const type = chart.type
  // histogram: derive bins from the first series
  if (type === 'histogram') {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
    const h = histogramBins(all)
    categories = h.labels
    series = [{ name: series[0]?.name ?? 'Frequency', values: h.counts, labels: h.counts.map(String), type: 'column', secondary: false }]
  }
  const colors = seriesColors(chart, Math.max(series.length, categories.length))
  series = series.map((s, i) => ({ ...s, color: s.color ?? colors[i] }))

  const box: Box = { x: 10, y: 8, w: W - 20, h: H - 16 }
  // title
  const titleText = chart.title.show ? chart.title.text ?? (series.length === 1 ? series[0].name : 'Chart Title') : ''
  if (titleText) {
    out.push(`<text x="${W / 2}" y="${box.y + 16}" text-anchor="middle" font-size="${fs + 4.5}" fill="${text}">${esc(titleText)}</text>`)
    if (!chart.title.overlay) {
      box.y += 28
      box.h -= 28
    }
  }
  // legend
  const pieLike = type === 'pie' || type === 'doughnut' || type === 'treemap'
  const legendItems = pieLike ? categories.map((c, i) => ({ name: c, color: colors[i % colors.length], line: false })) : type === 'waterfall' ? [
    { name: 'Increase', color: colors[0], line: false }, { name: 'Decrease', color: colors[1], line: false }, { name: 'Total', color: colors[2], line: false },
  ] : series.map((s) => ({ name: s.name, color: s.color!, line: s.type === 'line' || type === 'scatter' || type === 'radar' }))
  if (chart.legend !== 'none' && legendItems.length && !(type === 'histogram')) {
    const items = legendItems
    if (chart.legend === 'right' || chart.legend === 'left') {
      const lw = Math.min(box.w * 0.35, Math.max(...items.map((i) => textW(i.name, fs))) + 26)
      const lh = items.length * 18
      const lx = chart.legend === 'right' ? box.x + box.w - lw : box.x
      let ly = box.y + Math.max(0, (box.h - lh) / 2)
      for (const it of items) {
        out.push(legendKey(it, lx, ly))
        out.push(`<text x="${lx + 18}" y="${ly + 10}" fill="${text}">${esc(clip(it.name, lw - 20, fs))}</text>`)
        ly += 18
      }
      if (chart.legend === 'right') box.w -= lw + 8
      else {
        box.x += lw + 8
        box.w -= lw + 8
      }
    } else {
      const widths = items.map((i) => Math.min(textW(i.name, fs), 140) + 30)
      const rows: { items: typeof items; w: number }[] = [{ items: [], w: 0 }]
      items.forEach((it, i) => {
        const row = rows[rows.length - 1]
        if (row.w + widths[i] > box.w && row.items.length) rows.push({ items: [it], w: widths[i] })
        else {
          row.items.push(it)
          row.w += widths[i]
        }
      })
      const lh = rows.length * 18
      let ly = chart.legend === 'top' ? box.y : box.y + box.h - lh
      for (const row of rows) {
        let lx = box.x + (box.w - row.w) / 2
        for (const it of row.items) {
          out.push(legendKey(it, lx, ly))
          out.push(`<text x="${lx + 18}" y="${ly + 10}" fill="${text}">${esc(clip(it.name, 130, fs))}</text>`)
          lx += Math.min(textW(it.name, fs), 140) + 30
        }
        ly += 18
      }
      if (chart.legend === 'top') box.y += lh + 6
      box.h -= lh + 6
    }
  }

  if (!series.length || series.every((s) => s.values.every((v) => v === null))) {
    out.push(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${text}" opacity="0.7">No data to plot</text>`)
    out.push('</svg>')
    return out.join('')
  }

  if (type === 'funnel') drawFunnel(out, series[0], categories, colors[0], box, text, data.fmt)
  else if (type === 'treemap') drawTreemap(out, series[0], categories, colors, box, data.fmt)
  else if (type === 'boxWhisker') drawBoxes(out, series, box, text, data.fmt)
  else if (pieLike) drawPie(out, chart, series[0], categories, colors, box, text, st, data.fmt)
  else if (type === 'radar') drawRadar(out, chart, series, categories, box, text, st)
  else if (type === 'scatter') drawScatter(out, chart, series, box, text, st, data.fmt)
  else drawCategory(out, chart, series, categories, box, text, st, data.fmt)
  out.push('</svg>')
  return out.join('')
}

/** Funnel: centered bars, widest first, with their values. */
function drawFunnel(out: string[], s: SeriesData, categories: string[], color: string, box: Box, text: string, fmt?: string) {
  const vals = s.values.map((v) => (typeof v === 'number' ? v : 0))
  const max = Math.max(1e-9, ...vals.map(Math.abs))
  const labelW = Math.min(box.w * 0.3, Math.max(0, ...categories.map((c) => textW(c, 12))) + 10)
  const area = { x: box.x + labelW, w: box.w - labelW }
  const h = box.h / Math.max(1, vals.length)
  vals.forEach((v, i) => {
    const w = (Math.abs(v) / max) * area.w
    const x = area.x + (area.w - w) / 2
    const y = box.y + i * h + h * 0.08
    out.push(`<rect x="${x}" y="${y}" width="${Math.max(1, w)}" height="${h * 0.84}" fill="${color}"/>`)
    out.push(`<text x="${area.x + area.w / 2}" y="${y + h * 0.42 + 4}" text-anchor="middle" fill="#fff" font-size="11">${esc(fmtNum(v, fmt))}</text>`)
    out.push(`<text x="${box.x + labelW - 6}" y="${y + h * 0.42 + 4}" text-anchor="end" fill="${text}" font-size="11">${esc(clip(categories[i] ?? '', labelW - 8, 11))}</text>`)
  })
}

/** Treemap: rectangles sized by value (squarified slice-and-dice). */
function drawTreemap(out: string[], s: SeriesData, categories: string[], colors: string[], box: Box, fmt?: string) {
  const items = s.values.map((v, i) => ({ v: typeof v === 'number' && v > 0 ? v : 0, label: categories[i] ?? '', color: colors[i % colors.length] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
  const total = items.reduce((a, b) => a + b.v, 0)
  if (!total) return
  let rect = { ...box }
  let rest = total
  let i = 0
  while (i < items.length) {
    const horizontal = rect.w >= rect.h
    // take items into a row while the worst aspect ratio improves
    let row: typeof items = []
    let best = Infinity
    for (let j = i; j < items.length; j++) {
      const cand = [...row, items[j]]
      const sum = cand.reduce((a, b) => a + b.v, 0)
      const side = horizontal ? rect.h : rect.w
      const thick = ((sum / rest) * (horizontal ? rect.w : rect.h))
      const worst = Math.max(...cand.map((c) => {
        const len = (c.v / sum) * side
        return Math.max(len / thick, thick / len)
      }))
      if (worst > best) break
      best = worst
      row = cand
    }
    const sum = row.reduce((a, b) => a + b.v, 0)
    const thick = (sum / rest) * (horizontal ? rect.w : rect.h)
    let off = 0
    for (const c of row) {
      const len = (c.v / sum) * (horizontal ? rect.h : rect.w)
      const r = horizontal ? { x: rect.x, y: rect.y + off, w: thick, h: len } : { x: rect.x + off, y: rect.y, w: len, h: thick }
      out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${c.color}" stroke="#fff" stroke-width="2"/>`)
      if (r.w > 30 && r.h > 18) out.push(`<text x="${r.x + 5}" y="${r.y + 15}" fill="#fff" font-size="11">${esc(clip(c.label, r.w - 8, 11))}</text><text x="${r.x + 5}" y="${r.y + 29}" fill="#fff" font-size="10">${esc(fmtNum(c.v, fmt))}</text>`)
      off += len
    }
    rest -= sum
    rect = horizontal ? { x: rect.x + thick, y: rect.y, w: rect.w - thick, h: rect.h } : { x: rect.x, y: rect.y + thick, w: rect.w, h: rect.h - thick }
    i += row.length
  }
}

/** Box & whisker: quartiles (inclusive median), whiskers to the furthest points within 1.5 IQR, outliers and mean. */
function drawBoxes(out: string[], series: SeriesData[], box: Box, text: string, fmt?: string) {
  const stats = series.map((s) => {
    const v = s.values.filter((x): x is number => typeof x === 'number').sort((a, b) => a - b)
    const q = (p: number) => {
      if (!v.length) return 0
      const pos = (v.length - 1) * p
      const lo = Math.floor(pos)
      return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (pos - lo)
    }
    const q1 = q(0.25)
    const q3 = q(0.75)
    const iqr = q3 - q1
    const inside = v.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr)
    return { s, q1, q2: q(0.5), q3, lo: inside[0] ?? q1, hi: inside[inside.length - 1] ?? q3, out: v.filter((x) => !inside.includes(x)), mean: v.reduce((a, b) => a + b, 0) / Math.max(1, v.length) }
  })
  const all = stats.flatMap((x) => [x.lo, x.hi, ...x.out])
  const sc = niceScale(Math.min(...all), Math.max(...all))
  const axisW = 44
  const plot = { x: box.x + axisW, y: box.y, w: box.w - axisW, h: box.h - 18 }
  const Y = (v: number) => plot.y + plot.h - ((v - sc.min) / (sc.max - sc.min || 1)) * plot.h
  for (let v = sc.min; v <= sc.max + 1e-9; v += sc.step) {
    out.push(`<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e3e3e3"/>`)
    out.push(`<text x="${plot.x - 6}" y="${Y(v) + 4}" text-anchor="end" fill="${text}" font-size="11">${esc(fmtNum(v, fmt))}</text>`)
  }
  const slot = plot.w / Math.max(1, stats.length)
  stats.forEach((b, i) => {
    const cx = plot.x + slot * (i + 0.5)
    const w = Math.min(60, slot * 0.5)
    const color = b.s.color ?? '#4472C4'
    out.push(`<line x1="${cx}" x2="${cx}" y1="${Y(b.hi)}" y2="${Y(b.q3)}" stroke="${color}"/><line x1="${cx}" x2="${cx}" y1="${Y(b.q1)}" y2="${Y(b.lo)}" stroke="${color}"/>`)
    out.push(`<line x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${Y(b.hi)}" y2="${Y(b.hi)}" stroke="${color}"/><line x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${Y(b.lo)}" y2="${Y(b.lo)}" stroke="${color}"/>`)
    out.push(`<rect x="${cx - w / 2}" y="${Y(b.q3)}" width="${w}" height="${Math.max(1, Y(b.q1) - Y(b.q3))}" fill="${color}" fill-opacity="0.75" stroke="${color}"/>`)
    out.push(`<line x1="${cx - w / 2}" x2="${cx + w / 2}" y1="${Y(b.q2)}" y2="${Y(b.q2)}" stroke="#fff" stroke-width="2"/>`)
    out.push(`<text x="${cx}" y="${Y(b.mean) + 4}" text-anchor="middle" fill="#fff" font-size="12">×</text>`)
    for (const o of b.out) out.push(`<circle cx="${cx}" cy="${Y(o)}" r="3" fill="none" stroke="${color}"/>`)
    out.push(`<text x="${cx}" y="${plot.y + plot.h + 14}" text-anchor="middle" fill="${text}" font-size="11">${esc(clip(b.s.name, slot - 4, 11))}</text>`)
  })
}

function clip(s: string, w: number, fs: number) {
  const max = Math.max(3, Math.floor(w / (fs * 0.52)))
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function legendKey(it: { color: string; line: boolean }, x: number, y: number) {
  return it.line
    ? `<line x1="${x}" y1="${y + 6}" x2="${x + 14}" y2="${y + 6}" stroke="${it.color}" stroke-width="2.5"/><circle cx="${x + 7}" cy="${y + 6}" r="3" fill="${it.color}"/>`
    : `<rect x="${x + 2}" y="${y + 1}" width="10" height="10" fill="${it.color}"/>`
}

function axisTitle(out: string[], chart: ChartDef, box: Box, text: string, horizontalBars: boolean) {
  const xt = horizontalBars ? chart.axisTitles.y : chart.axisTitles.x
  const yt = horizontalBars ? chart.axisTitles.x : chart.axisTitles.y
  if (xt) {
    out.push(`<text x="${box.x + box.w / 2}" y="${box.y + box.h - 2}" text-anchor="middle" font-size="13" fill="${text}">${esc(xt)}</text>`)
    box.h -= 20
  }
  if (yt) {
    out.push(`<text transform="translate(${box.x + 12} ${box.y + box.h / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${text}">${esc(yt)}</text>`)
    box.x += 20
    box.w -= 20
  }
}

function drawCategory(out: string[], chart: ChartDef, series: SeriesData[], categories: string[], box: Box, text: string, st: StylePreset, fmt?: string) {
  const type = chart.type
  const horizontal = type === 'bar'
  const n = categories.length
  const percent = chart.grouping === 'percent' && type !== 'combo' && type !== 'waterfall' && type !== 'histogram'
  const stacked = (chart.grouping === 'stacked' || percent) && type !== 'combo' && type !== 'waterfall' && type !== 'histogram'
  axisTitle(out, chart, box, text, horizontal)
  // value range
  const primary = series.filter((s) => !s.secondary)
  const secondary = series.filter((s) => s.secondary)
  const totals = (list: SeriesData[]) => {
    let lo = 0
    let hi = 0
    if (type === 'waterfall') {
      let run = 0
      const s = list[0]
      s?.values.forEach((v, i) => {
        const isTotal = /total|net|sum|balance/i.test(categories[i] ?? '')
        if (isTotal) run = v ?? run
        else run += v ?? 0
        lo = Math.min(lo, run)
        hi = Math.max(hi, run, isTotal ? v ?? 0 : 0)
      })
      return { lo, hi }
    }
    for (let i = 0; i < n; i++) {
      if (stacked) {
        let pos = 0
        let neg = 0
        for (const s of list) {
          const v = s.values[i] ?? 0
          if (v >= 0) pos += v
          else neg += v
        }
        if (percent) {
          const t = pos - neg || 1
          pos /= t
          neg /= t
        }
        lo = Math.min(lo, neg)
        hi = Math.max(hi, pos)
      } else
        for (const s of list) {
          const v = s.values[i]
          if (v === null || v === undefined) continue
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
    }
    return { lo, hi }
  }
  const t1 = totals(primary.length ? primary : series)
  const allLine = series.every((s) => s.type === 'line')
  const lo1 = allLine && t1.lo > 0 ? t1.lo * 0.9 : t1.lo
  let sc = percent ? { min: Math.min(0, t1.lo), max: Math.max(t1.hi, 1), step: 0.1 } : niceScale(lo1, t1.hi)
  if (percent) sc.step = sc.max - sc.min > 1.5 ? 0.25 : 0.1
  // Format Axis options
  const va = percent ? undefined : chart.valueAxis
  const log = !!va?.log
  if (va && log) {
    const positives = series.flatMap((s) => s.values).filter((v): v is number => v !== null && v > 0)
    const minPos = positives.length ? Math.min(...positives) : 1
    const lo = va.min && va.min > 0 ? va.min : 10 ** Math.floor(Math.log10(minPos))
    const hi = va.max && va.max > lo ? va.max : 10 ** Math.max(Math.ceil(Math.log10(Math.max(t1.hi, lo * 10))), Math.log10(lo) + 1)
    sc = { min: lo, max: hi, step: 0 }
  } else if (va && (va.min !== undefined || va.max !== undefined || va.major !== undefined)) {
    const min = va.min ?? sc.min
    const max0 = va.max ?? sc.max
    const step = va.major && va.major > 0 ? va.major : va.min !== undefined || va.max !== undefined ? niceStep(Math.max(1e-9, max0 - min), 6) : sc.step
    sc = { min, max: Math.max(max0, min + step), step }
  }
  const ticks: number[] = []
  if (log) for (let v = sc.min; v <= sc.max * 1.0001; v *= 10) ticks.push(v)
  else for (let v = sc.min, k = 0; v <= sc.max + sc.step / 2 && k < 500; v += sc.step, k++) ticks.push(Math.abs(v) < sc.step * 1e-9 ? 0 : v)
  const tf = (v: number) => (log ? Math.log10(Math.max(v, sc.min)) : v)
  const sc2 = secondary.length ? niceScale(totals(secondary).lo, totals(secondary).hi) : null
  // axis label room
  const tickLabels: string[] = ticks.map((v) => fmtNum(v, va?.fmt ?? fmt, percent))
  const valLabelW = Math.max(...tickLabels.map((t) => textW(t, 11))) + 8
  const catLabelH = 18
  const plot: Box = horizontal
    ? { x: box.x + Math.min(box.w * 0.3, Math.max(...categories.map((c) => textW(c, 11))) + 10), y: box.y + 4, w: 0, h: box.h - catLabelH - 8 }
    : { x: box.x + (chart.axes.y ? valLabelW : 4), y: box.y + 6, w: 0, h: box.h - (chart.axes.x ? catLabelH : 4) - 8 }
  plot.w = box.x + box.w - plot.x - (sc2 ? valLabelW : 6)
  if (plot.w < 20 || plot.h < 20) return
  if (st.plot !== 'none') out.push(`<rect x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" fill="${st.plot}"/>`)
  const span = tf(sc.max) - tf(sc.min) || 1
  const frac = (v: number) => {
    const f = (tf(v) - tf(sc.min)) / span
    return va?.reverse ? 1 - f : f
  }
  const vpos = (v: number) => (horizontal ? plot.x + frac(v) * plot.w : plot.y + plot.h - frac(v) * plot.h)
  const vpos2 = sc2 ? (v: number) => plot.y + plot.h - ((v - sc2.min) / (sc2.max - sc2.min || 1)) * plot.h : vpos
  // gridlines and value axis labels
  const dash = st.gridDash ? ' stroke-dasharray="3 3"' : ''
  ticks.forEach((v, i) => {
    const p = vpos(v)
    if (chart.gridlines.major && st.grid !== 'none')
      out.push(horizontal ? `<line x1="${p}" y1="${plot.y}" x2="${p}" y2="${plot.y + plot.h}" stroke="${st.grid}"${dash}/>` : `<line x1="${plot.x}" y1="${p}" x2="${plot.x + plot.w}" y2="${p}" stroke="${st.grid}"${dash}/>`)
    if (chart.gridlines.minor && st.grid !== 'none' && i < ticks.length - 1) {
      const m = vpos(log ? v * Math.sqrt(10) : v + sc.step / 2)
      out.push(horizontal ? `<line x1="${m}" y1="${plot.y}" x2="${m}" y2="${plot.y + plot.h}" stroke="${st.grid}" opacity="0.45"/>` : `<line x1="${plot.x}" y1="${m}" x2="${plot.x + plot.w}" y2="${m}" stroke="${st.grid}" opacity="0.45"/>`)
    }
    if (chart.axes.y)
      out.push(horizontal ? `<text x="${p}" y="${plot.y + plot.h + 14}" text-anchor="middle" font-size="11" fill="${text}">${esc(tickLabels[i] ?? '')}</text>` : `<text x="${plot.x - 5}" y="${p + 4}" text-anchor="end" font-size="11" fill="${text}">${esc(tickLabels[i] ?? '')}</text>`)
  })
  if (sc2) {
    for (let v = sc2.min; v <= sc2.max + sc2.step / 2; v += sc2.step) out.push(`<text x="${plot.x + plot.w + 5}" y="${vpos2(v) + 4}" font-size="11" fill="${text}">${esc(fmtNum(v, fmt))}</text>`)
  }
  // category axis
  const band = (horizontal ? plot.h : plot.w) / Math.max(1, n)
  const cpos = (i: number) => (horizontal ? plot.y + band * i + band / 2 : plot.x + band * i + band / 2)
  const zero = vpos(Math.max(sc.min, Math.min(0, sc.max)))
  out.push(horizontal ? `<line x1="${zero}" y1="${plot.y}" x2="${zero}" y2="${plot.y + plot.h}" stroke="${st.border === '#1E2A3A' ? '#5E6E85' : '#BFBFBF'}"/>` : `<line x1="${plot.x}" y1="${zero}" x2="${plot.x + plot.w}" y2="${zero}" stroke="${st.border === '#1E2A3A' ? '#5E6E85' : '#BFBFBF'}"/>`)
  if (chart.gridlines.vertical && st.grid !== 'none')
    for (let i = 0; i <= n; i++) {
      const p = (horizontal ? plot.y : plot.x) + band * i
      out.push(horizontal ? `<line x1="${plot.x}" y1="${p}" x2="${plot.x + plot.w}" y2="${p}" stroke="${st.grid}"${dash}/>` : `<line x1="${p}" y1="${plot.y}" x2="${p}" y2="${plot.y + plot.h}" stroke="${st.grid}"${dash}/>`)
    }
  if (chart.axes.x) {
    const every = horizontal ? Math.max(1, Math.ceil(14 / band)) : Math.max(1, Math.ceil((Math.max(...categories.map((c) => textW(c, 11))) + 6) / band))
    categories.forEach((c, i) => {
      if (i % every) return
      out.push(horizontal ? `<text x="${plot.x - 5}" y="${cpos(i) + 4}" text-anchor="end" font-size="11" fill="${text}">${esc(clip(c, plot.x - box.x - 8, 11))}</text>` : `<text x="${cpos(i)}" y="${plot.y + plot.h + 14}" text-anchor="middle" font-size="11" fill="${text}">${esc(clip(c, band * every, 11))}</text>`)
    })
  }
  // bars
  const barSeries = type === 'histogram' || type === 'waterfall' ? series.slice(0, 1) : series.filter((s) => (type === 'combo' ? s.type === 'column' : type === 'column' || type === 'bar'))
  const gap = type === 'histogram' ? 0.02 : chart.gapWidth / 100
  const groupW = band / (1 + gap)
  const groupCount = stacked ? 1 : Math.max(1, barSeries.length)
  const bw = groupW / groupCount
  const stackPos = new Array(n).fill(0)
  const stackNeg = new Array(n).fill(0)
  const colTotals = categories.map((_, i) => series.reduce((s, se) => s + Math.abs(se.values[i] ?? 0), 0) || 1)
  const labels: string[] = []
  const labelText = (s: SeriesData, i: number, v: number) => (chart.dataLabels === 'percent' ? `${Math.round((v / colTotals[i]) * 100)}%` : chart.dataLabels === 'category' ? categories[i] : s.labels[i] || fmtNum(v, fmt))
  if (type === 'waterfall') {
    const s = series[0]
    let run = 0
    const cols = seriesColors(chart, 3)
    s.values.forEach((v0, i) => {
      const v = v0 ?? 0
      const isTotal = /total|net|sum|balance/i.test(categories[i] ?? '')
      const from = isTotal ? 0 : run
      const to = isTotal ? v : run + v
      run = to
      const color = isTotal ? cols[2] : v >= 0 ? cols[0] : cols[1]
      const x = cpos(i) - groupW / 2
      const y1 = vpos(Math.max(from, to))
      const y2 = vpos(Math.min(from, to))
      out.push(`<rect x="${x}" y="${y1}" width="${groupW}" height="${Math.max(1, y2 - y1)}" fill="${color}"${st.outline ? ` stroke="${st.outline}"` : ''}/>`)
      if (st.gradient) out.push(`<rect x="${x}" y="${y1}" width="${groupW}" height="${Math.max(1, y2 - y1)}" fill="url(#gl)"/>`)
      if (i < s.values.length - 1) out.push(`<line x1="${x + groupW}" y1="${vpos(to)}" x2="${x + band}" y2="${vpos(to)}" stroke="#8C8C8C" stroke-dasharray="2 2"/>`)
      if (chart.dataLabels !== 'none') labels.push(`<text x="${cpos(i)}" y="${y1 - 4}" text-anchor="middle" font-size="11" fill="${text}">${esc(fmtNum(v, fmt))}</text>`)
    })
  } else
    barSeries.forEach((s, si) => {
      s.values.forEach((v0, i) => {
        if (v0 === null) return
        let v = v0
        if (percent) {
          const tot = series.reduce((a, se) => a + Math.abs(se.values[i] ?? 0), 0) || 1
          v = v0 / tot
        }
        let a: number
        let b: number
        if (stacked) {
          if (v >= 0) {
            a = stackPos[i]
            stackPos[i] += v
            b = stackPos[i]
          } else {
            a = stackNeg[i]
            stackNeg[i] += v
            b = stackNeg[i]
          }
        } else {
          a = log ? sc.min : 0
          b = v
        }
        const off = stacked ? 0 : si * bw
        const start = cpos(i) - groupW / 2 + off
        const p1 = vpos(Math.min(a, b))
        const p2 = vpos(Math.max(a, b))
        const thick = Math.max(1, bw - (barSeries.length > 1 && !stacked ? 1 : 0))
        const rect = horizontal
          ? `x="${p1}" y="${start}" width="${Math.max(0.5, p2 - p1)}" height="${thick}"`
          : `x="${start}" y="${p2}" width="${thick}" height="${Math.max(0.5, p1 - p2)}"`
        out.push(`<rect ${rect} fill="${s.color}"${st.outline ? ` stroke="${st.outline}" stroke-width="0.75"` : ''}/>`)
        if (st.gradient) out.push(`<rect ${rect} fill="url(#gl)"/>`)
        if (chart.dataLabels !== 'none') {
          const t = labelText(s, i, v0)
          if (horizontal) labels.push(`<text x="${(st.labelsInside || stacked ? (p1 + p2) / 2 : p2 + 4)}" y="${start + thick / 2 + 4}" text-anchor="${st.labelsInside || stacked ? 'middle' : 'start'}" font-size="11" fill="${st.labelsInside || stacked ? '#fff' : text}">${esc(t)}</text>`)
          else labels.push(`<text x="${start + thick / 2}" y="${st.labelsInside || stacked ? (p1 + p2) / 2 + 4 : p2 - 4}" text-anchor="middle" font-size="11" fill="${st.labelsInside || stacked ? '#fff' : text}">${esc(t)}</text>`)
        }
      })
    })
  // areas and lines
  const lineSeries = series.filter((s) => (type === 'combo' ? s.type !== 'column' : type === 'line' || type === 'area'))
  const areaBase = new Array(n).fill(0)
  for (const s of lineSeries) {
    const pos = s.secondary ? vpos2 : vpos
    const isArea = type === 'area' || s.type === 'area'
    const pts: [number, number][] = []
    s.values.forEach((v0, i) => {
      if (v0 === null) return
      let v = v0
      if (percent) v = v0 / (series.reduce((a, se) => a + Math.abs(se.values[i] ?? 0), 0) || 1)
      if (stacked) {
        areaBase[i] += v
        v = areaBase[i]
      }
      pts.push([cpos(i), pos(v)])
    })
    if (!pts.length) continue
    const path = chart.smooth ? smoothPath(pts) : 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')
    if (isArea) {
      const base = pos(Math.max(sc.min, 0))
      out.push(`<path d="${path}L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z" fill="${s.color}" fill-opacity="${stacked ? 0.9 : 0.7}"/>`)
    } else out.push(`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`)
    if (!isArea && (chart.markers || type === 'combo')) for (const [x, y] of pts) out.push(`<circle cx="${x}" cy="${y}" r="3.2" fill="${s.color}" stroke="#fff" stroke-width="0.8"/>`)
    if (chart.dataLabels !== 'none')
      pts.forEach(([x, y], k) => {
        const i = s.values.findIndex((_, j) => s.values.slice(0, j + 1).filter((v) => v !== null).length === k + 1)
        labels.push(`<text x="${x}" y="${y - 7}" text-anchor="middle" font-size="11" fill="${text}">${esc(labelText(s, i, s.values[i] ?? 0))}</text>`)
      })
  }
  // error bars
  const eb = chart.errorBars
  if (eb && !stacked && type !== 'waterfall' && type !== 'histogram') {
    const barIndex = new Map(barSeries.map((s, i) => [s, i]))
    for (const s of series) {
      const vals = s.values.filter((v): v is number => v !== null)
      if (!vals.length) continue
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1)) : 0
      const pos = s.secondary ? vpos2 : vpos
      const bi = barIndex.get(s)
      s.values.forEach((v, i) => {
        if (v === null) return
        const amount = eb.type === 'fixed' ? eb.value : eb.type === 'percent' ? (Math.abs(v) * eb.value) / 100 : eb.type === 'stdDev' ? sd * (eb.value || 1) : sd / Math.sqrt(vals.length)
        const c = bi !== undefined ? cpos(i) - groupW / 2 + bi * bw + bw / 2 : cpos(i)
        const a = pos(v - amount)
        const b = pos(v + amount)
        const cap = Math.min(6, Math.max(3, bw / 4))
        out.push(
          horizontal
            ? `<path d="M${a},${c}H${b}M${a},${c - cap}V${c + cap}M${b},${c - cap}V${c + cap}" stroke="#404040" stroke-width="1" fill="none"/>`
            : `<path d="M${c},${a}V${b}M${c - cap},${a}H${c + cap}M${c - cap},${b}H${c + cap}" stroke="#404040" stroke-width="1" fill="none"/>`,
        )
      })
    }
  }
  // trendlines
  for (const s of series) {
    if (!s.trendline) continue
    const pts = s.values.map((v, i) => [i + 1, v] as [number, number | null]).filter((p): p is [number, number] => p[1] !== null)
    const t = trend(s.trendline, pts)
    if (t.length < 2) continue
    const pos = s.secondary ? vpos2 : vpos
    const d = 'M' + t.map(([x, y]) => `${(horizontal ? pos(y) : cpos(x - 1)).toFixed(1)},${(horizontal ? cpos(x - 1) : pos(y)).toFixed(1)}`).join('L')
    out.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-dasharray="5 3"/>`)
  }
  out.push(...labels)
}

function smoothPath(pts: [number, number][]) {
  if (pts.length < 3) return 'M' + pts.map((p) => p.join(',')).join('L')
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

function drawPie(out: string[], chart: ChartDef, s: SeriesData, categories: string[], colors: string[], box: Box, text: string, st: StylePreset, fmt?: string) {
  const vals = s.values.map((v) => Math.max(0, v ?? 0))
  const total = vals.reduce((a, b) => a + b, 0)
  if (!total) return
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const r = Math.max(10, Math.min(box.w, box.h) / 2 - 14)
  const inner = chart.type === 'doughnut' ? (r * chart.holeSize) / 100 : 0
  let a = -Math.PI / 2
  const labels: string[] = []
  vals.forEach((v, i) => {
    if (!v) return
    const da = (v / total) * Math.PI * 2
    const a2 = a + da
    const large = da > Math.PI ? 1 : 0
    const p = (ang: number, rad: number) => `${(cx + Math.cos(ang) * rad).toFixed(2)},${(cy + Math.sin(ang) * rad).toFixed(2)}`
    const color = s.color && vals.length === 1 ? s.color : colors[i % colors.length]
    let d: string
    if (da >= Math.PI * 2 - 1e-9) {
      d = `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0` + (inner ? `M${cx - inner},${cy}a${inner},${inner} 0 1,1 ${2 * inner},0a${inner},${inner} 0 1,1 ${-2 * inner},0` : '')
    } else if (inner) d = `M${p(a, r)}A${r},${r} 0 ${large} 1 ${p(a2, r)}L${p(a2, inner)}A${inner},${inner} 0 ${large} 0 ${p(a, inner)}Z`
    else d = `M${cx},${cy}L${p(a, r)}A${r},${r} 0 ${large} 1 ${p(a2, r)}Z`
    out.push(`<path d="${d}" fill="${color}" stroke="${st.outline ?? '#fff'}" stroke-width="1" fill-rule="evenodd"/>`)
    if (st.gradient) out.push(`<path d="${d}" fill="url(#gl)" fill-rule="evenodd"/>`)
    if (chart.dataLabels !== 'none') {
      const mid = a + da / 2
      const lr = inner ? (r + inner) / 2 : r * 0.65
      const t = chart.dataLabels === 'percent' ? `${Math.round((v / total) * 100)}%` : chart.dataLabels === 'category' ? categories[i] : s.labels[i] || fmtNum(v, fmt)
      labels.push(`<text x="${cx + Math.cos(mid) * lr}" y="${cy + Math.sin(mid) * lr + 4}" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">${esc(t)}</text>`)
    }
    a = a2
  })
  out.push(...labels)
  void text
}

function drawRadar(out: string[], chart: ChartDef, series: SeriesData[], categories: string[], box: Box, text: string, st: StylePreset) {
  const n = categories.length
  if (n < 3) return
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2 + 4
  const r = Math.max(10, Math.min(box.w, box.h) / 2 - 22)
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)))
  const sc = niceScale(0, max, 4)
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2
    const rr = (v / (sc.max || 1)) * r
    return [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]
  }
  for (let v = sc.step; v <= sc.max + 1e-9; v += sc.step) {
    const ring = categories.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ')
    out.push(`<polygon points="${ring}" fill="none" stroke="${st.grid === 'none' ? '#E5E5E5' : st.grid}"/>`)
  }
  categories.forEach((c, i) => {
    const [x, y] = pt(i, sc.max)
    out.push(`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${st.grid === 'none' ? '#E5E5E5' : st.grid}"/>`)
    const [lx, ly] = pt(i, sc.max * 1.12)
    out.push(`<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="11" fill="${text}">${esc(clip(c, 80, 11))}</text>`)
  })
  for (const s of series) {
    const pts = s.values.map((v, i) => pt(i, v ?? 0).map((x) => x.toFixed(1)).join(',')).join(' ')
    out.push(`<polygon points="${pts}" fill="${s.color}" fill-opacity="0.12" stroke="${s.color}" stroke-width="2"/>`)
    if (chart.markers) s.values.forEach((v, i) => {
      const [x, y] = pt(i, v ?? 0)
      out.push(`<circle cx="${x}" cy="${y}" r="3" fill="${s.color}"/>`)
    })
  }
}

function drawScatter(out: string[], chart: ChartDef, series: SeriesData[], box: Box, text: string, st: StylePreset, fmt?: string) {
  axisTitle(out, chart, box, text, false)
  const xs = series.flatMap((s) => (s.xs ?? []).filter((v): v is number => v !== null))
  const ys = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  if (!xs.length || !ys.length) return
  const sx = niceScale(Math.min(0, ...xs), Math.max(...xs))
  let sy = niceScale(Math.min(0, ...ys), Math.max(...ys))
  const va = chart.valueAxis
  if (va && (va.min !== undefined || va.max !== undefined || va.major !== undefined)) {
    const min = va.min ?? sy.min
    const max = va.max ?? sy.max
    const step = va.major && va.major > 0 ? va.major : niceStep(Math.max(1e-9, max - min), 6)
    sy = { min, max: Math.max(max, min + step), step }
  }
  const yl: string[] = []
  for (let v = sy.min; v <= sy.max + sy.step / 2; v += sy.step) yl.push(fmtNum(v, fmt))
  const plot: Box = { x: box.x + Math.max(...yl.map((t) => textW(t, 11))) + 8, y: box.y + 6, w: 0, h: box.h - 26 }
  plot.w = box.x + box.w - plot.x - 6
  if (plot.w < 20 || plot.h < 20) return
  const px = (v: number) => plot.x + ((v - sx.min) / (sx.max - sx.min || 1)) * plot.w
  const py = (v: number) => plot.y + plot.h - ((v - sy.min) / (sy.max - sy.min || 1)) * plot.h
  if (st.plot !== 'none') out.push(`<rect x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" fill="${st.plot}"/>`)
  let i = 0
  for (let v = sy.min; v <= sy.max + sy.step / 2; v += sy.step, i++) {
    if (chart.gridlines.major && st.grid !== 'none') out.push(`<line x1="${plot.x}" y1="${py(v)}" x2="${plot.x + plot.w}" y2="${py(v)}" stroke="${st.grid}"/>`)
    out.push(`<text x="${plot.x - 5}" y="${py(v) + 4}" text-anchor="end" font-size="11" fill="${text}">${esc(yl[i])}</text>`)
  }
  for (let v = sx.min; v <= sx.max + sx.step / 2; v += sx.step) {
    if (chart.gridlines.vertical && st.grid !== 'none') out.push(`<line x1="${px(v)}" y1="${plot.y}" x2="${px(v)}" y2="${plot.y + plot.h}" stroke="${st.grid}"/>`)
    out.push(`<text x="${px(v)}" y="${plot.y + plot.h + 14}" text-anchor="middle" font-size="11" fill="${text}">${esc(fmtNum(v, undefined))}</text>`)
  }
  out.push(`<line x1="${plot.x}" y1="${plot.y + plot.h}" x2="${plot.x + plot.w}" y2="${plot.y + plot.h}" stroke="#BFBFBF"/>`)
  for (const s of series) {
    const pts: [number, number][] = []
    s.values.forEach((v, k) => {
      const x = s.xs?.[k]
      if (v === null || x === null || x === undefined) return
      pts.push([x, v])
    })
    if (chart.smooth || chart.markers === false) {
      const d = 'M' + pts.sort((a, b) => a[0] - b[0]).map(([x, y]) => `${px(x)},${py(y)}`).join('L')
      out.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`)
    }
    for (const [x, y] of pts) out.push(`<circle cx="${px(x)}" cy="${py(y)}" r="3.5" fill="${s.color}"/>`)
    if (chart.dataLabels !== 'none') for (const [x, y] of pts) out.push(`<text x="${px(x)}" y="${py(y) - 6}" text-anchor="middle" font-size="10" fill="${text}">${esc(fmtNum(y, fmt))}</text>`)
    if (s.trendline) {
      const t = trend(s.trendline, pts)
      if (t.length > 1) out.push(`<path d="M${t.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('L')}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-dasharray="5 3"/>`)
    }
  }
}

/** A small preview of a chart type for galleries (no data needed). */
export function chartTypeIcon(type: string, grouping: string, color = '#2E6FD8'): string {
  const c2 = '#F28C28'
  const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30" width="40" height="30">${body}</svg>`
  switch (type) {
    case 'bar': return svg(`<rect x="4" y="4" width="22" height="5" fill="${color}"/><rect x="4" y="12" width="30" height="5" fill="${c2}"/><rect x="4" y="20" width="16" height="5" fill="${color}"/>`)
    case 'line': return svg(`<polyline points="3,24 12,14 21,18 30,6 37,10" fill="none" stroke="${color}" stroke-width="2.5"/><polyline points="3,26 12,22 21,24 30,16 37,20" fill="none" stroke="${c2}" stroke-width="2.5"/>`)
    case 'area': return svg(`<path d="M3,27 L3,18 L13,10 L23,15 L37,6 L37,27Z" fill="${color}" opacity="0.85"/>`)
    case 'pie': return svg(`<circle cx="20" cy="15" r="12" fill="${c2}"/><path d="M20,15 L20,3 A12,12 0 0 1 31.4,18.7Z" fill="${color}"/>`)
    case 'doughnut': return svg(`<circle cx="20" cy="15" r="12" fill="none" stroke="${c2}" stroke-width="7"/><path d="M20,3 A12,12 0 0 1 32,15" fill="none" stroke="${color}" stroke-width="7"/>`)
    case 'scatter': return svg([[8, 20], [14, 14], [20, 17], [26, 9], [32, 12], [11, 24]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}"/>`).join(''))
    case 'radar': return svg(`<polygon points="20,3 33,12 28,27 12,27 7,12" fill="none" stroke="#bbb"/><polygon points="20,8 29,13 25,23 14,22 11,13" fill="${color}" opacity="0.4" stroke="${color}"/>`)
    case 'histogram': return svg(`<rect x="4" y="18" width="7" height="9" fill="${color}"/><rect x="11" y="8" width="7" height="19" fill="${color}"/><rect x="18" y="4" width="7" height="23" fill="${color}"/><rect x="25" y="13" width="7" height="14" fill="${color}"/>`)
    case 'waterfall': return svg(`<rect x="4" y="12" width="6" height="15" fill="#8D99AE"/><rect x="12" y="6" width="6" height="6" fill="${color}"/><rect x="20" y="6" width="6" height="8" fill="${c2}"/><rect x="28" y="14" width="6" height="13" fill="#8D99AE"/>`)
    case 'funnel': return svg(`<rect x="5" y="4" width="30" height="5" fill="${color}"/><rect x="9" y="11" width="22" height="5" fill="${color}"/><rect x="13" y="18" width="14" height="5" fill="${color}"/><rect x="17" y="25" width="6" height="3" fill="${color}"/>`)
    case 'treemap': return svg(`<rect x="3" y="3" width="20" height="24" fill="${color}"/><rect x="24" y="3" width="13" height="14" fill="${c2}"/><rect x="24" y="18" width="13" height="9" fill="${color}" opacity="0.6"/>`)
    case 'boxWhisker': return svg(`<line x1="12" y1="4" x2="12" y2="26" stroke="${color}"/><rect x="7" y="9" width="10" height="11" fill="${color}"/><line x1="28" y1="7" x2="28" y2="25" stroke="${c2}"/><rect x="23" y="12" width="10" height="9" fill="${c2}"/>`)
    case 'combo': return svg(`<rect x="5" y="14" width="6" height="13" fill="${color}"/><rect x="17" y="9" width="6" height="18" fill="${color}"/><rect x="29" y="17" width="6" height="10" fill="${color}"/><polyline points="8,10 20,5 32,12" fill="none" stroke="${c2}" stroke-width="2.5"/>`)
    default:
      if (grouping === 'stacked') return svg(`<rect x="6" y="12" width="7" height="15" fill="${color}"/><rect x="6" y="6" width="7" height="6" fill="${c2}"/><rect x="17" y="16" width="7" height="11" fill="${color}"/><rect x="17" y="9" width="7" height="7" fill="${c2}"/><rect x="28" y="10" width="7" height="17" fill="${color}"/><rect x="28" y="4" width="7" height="6" fill="${c2}"/>`)
      if (grouping === 'percent') return svg(`<rect x="6" y="11" width="7" height="16" fill="${color}"/><rect x="6" y="3" width="7" height="8" fill="${c2}"/><rect x="17" y="15" width="7" height="12" fill="${color}"/><rect x="17" y="3" width="7" height="12" fill="${c2}"/><rect x="28" y="8" width="7" height="19" fill="${color}"/><rect x="28" y="3" width="7" height="5" fill="${c2}"/>`)
      return svg(`<rect x="4" y="12" width="5" height="15" fill="${color}"/><rect x="9" y="6" width="5" height="21" fill="${c2}"/><rect x="17" y="16" width="5" height="11" fill="${color}"/><rect x="22" y="10" width="5" height="17" fill="${c2}"/><rect x="30" y="8" width="5" height="19" fill="${color}"/><rect x="35" y="14" width="3" height="13" fill="${c2}"/>`)
  }
}

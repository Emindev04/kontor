import { Node, mergeAttributes } from '@tiptap/core'
import { DrawingView, drawingAttributes, wrapStyle, type DrawingRenderer } from './Drawing'

// Charts (Insert > Chart): data lives on the node, the picture is drawn as SVG. Saved as a real
// chart (with its data) in .docx files.

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter'
export type ChartStacking = 'none' | 'stacked' | 'percent'
export type ChartSeries = { name: string; values: (number | null)[]; color?: string }
export type ChartData = {
  chartType: ChartType
  stacking: ChartStacking
  title: string
  legend: 'bottom' | 'right' | 'top' | 'left' | 'none'
  dataLabels: boolean
  gridlines: boolean
  palette: string
  categories: string[]
  series: ChartSeries[]
}

export const CHART_PALETTES: Record<string, { label: string; colors: string[] }> = {
  colorful: { label: 'Colorful', colors: ['#2F6FC4', '#E3742F', '#9E9E9E', '#F2B705', '#4FA3D9', '#5FA84B'] },
  blue: { label: 'Monochromatic Blue', colors: ['#1F4E8C', '#2F6FC4', '#5B8FD6', '#8FB3E6', '#BCD2F1', '#DEE8F8'] },
  orange: { label: 'Monochromatic Orange', colors: ['#8A3C0F', '#C25718', '#E3742F', '#EE9D6B', '#F5C3A3', '#FAE1D1'] },
  green: { label: 'Monochromatic Green', colors: ['#2E5E22', '#447F33', '#5FA84B', '#8DC57E', '#BADDB1', '#DDEFD8'] },
  gray: { label: 'Monochromatic Gray', colors: ['#262626', '#4D4D4D', '#7A7A7A', '#A6A6A6', '#C9C9C9', '#E6E6E6'] },
}

export const DEFAULT_CHART: ChartData = {
  chartType: 'column',
  stacking: 'none',
  title: 'Chart Title',
  legend: 'bottom',
  dataLabels: false,
  gridlines: true,
  palette: 'colorful',
  categories: ['Category 1', 'Category 2', 'Category 3', 'Category 4'],
  series: [
    { name: 'Series 1', values: [4.3, 2.5, 3.5, 4.5] },
    { name: 'Series 2', values: [2.4, 4.4, 1.8, 2.8] },
    { name: 'Series 3', values: [2, 2, 3, 5] },
  ],
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function seriesColor(d: ChartData, i: number) {
  return d.series[i]?.color ?? (CHART_PALETTES[d.palette] ?? CHART_PALETTES.colorful).colors[i % 6]
}

/** Rounded axis maximum and tick step for a value range. */
function niceScale(min: number, max: number, ticks = 5) {
  if (max === min) max = min + 1
  const span = max - min
  const raw = span / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= ticks) ?? 10 * mag
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step }
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100))

/** SVG markup of a chart for a w × h box. */
export function chartSvg(d: ChartData, w: number, h: number) {
  const parts: string[] = []
  const font = `font-family="Calibri, Carlito, Arial, sans-serif"`
  let top = 8
  if (d.title) {
    parts.push(`<text x="${w / 2}" y="${top + 16}" text-anchor="middle" font-size="18" fill="#595959" ${font}>${esc(d.title)}</text>`)
    top += 30
  }
  const pie = d.chartType === 'pie' || d.chartType === 'doughnut'
  const legendItems = pie ? d.categories.map((c, i) => ({ name: c, color: seriesColor(d, i) })) : d.series.map((s, i) => ({ name: s.name, color: seriesColor(d, i) }))
  let bottom = h - 8
  let left = 8
  let right = w - 8
  if (d.legend !== 'none' && legendItems.length) {
    if (d.legend === 'bottom' || d.legend === 'top') {
      const widths = legendItems.map((it) => 18 + it.name.length * 6.5 + 12)
      const total = widths.reduce((a, b) => a + b, 0)
      let x = Math.max(8, (w - total) / 2)
      const y = d.legend === 'bottom' ? h - 14 : top + 6
      legendItems.forEach((it, i) => {
        parts.push(`<rect x="${x}" y="${y - 8}" width="9" height="9" fill="${it.color}"/><text x="${x + 13}" y="${y}" font-size="11" fill="#595959" ${font}>${esc(it.name)}</text>`)
        x += widths[i]
      })
      if (d.legend === 'bottom') bottom -= 24
      else top += 22
    } else {
      const lw = Math.min(w * 0.3, Math.max(...legendItems.map((it) => 22 + it.name.length * 6.5)))
      const x = d.legend === 'right' ? w - lw - 6 : 8
      let y = (top + bottom) / 2 - (legendItems.length * 18) / 2 + 9
      for (const it of legendItems) {
        parts.push(`<rect x="${x}" y="${y - 8}" width="9" height="9" fill="${it.color}"/><text x="${x + 13}" y="${y}" font-size="11" fill="#595959" ${font}>${esc(it.name)}</text>`)
        y += 18
      }
      if (d.legend === 'right') right -= lw + 10
      else left += lw + 10
    }
  }

  if (pie) {
    const values = (d.series[0]?.values ?? []).map((v) => Math.max(0, v ?? 0))
    const total = values.reduce((a, b) => a + b, 0) || 1
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2
    const r = Math.max(10, Math.min(right - left, bottom - top) / 2 - 6)
    const inner = d.chartType === 'doughnut' ? r * 0.5 : 0
    let angle = -Math.PI / 2
    values.forEach((v, i) => {
      const a2 = angle + (v / total) * Math.PI * 2
      const large = a2 - angle > Math.PI ? 1 : 0
      const p = (rad: number, rr: number) => `${cx + rr * Math.cos(rad)} ${cy + rr * Math.sin(rad)}`
      const path = inner
        ? `M${p(angle, r)} A${r} ${r} 0 ${large} 1 ${p(a2, r)} L${p(a2, inner)} A${inner} ${inner} 0 ${large} 0 ${p(angle, inner)} Z`
        : v >= total
          ? `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`
          : `M${cx} ${cy} L${p(angle, r)} A${r} ${r} 0 ${large} 1 ${p(a2, r)} Z`
      parts.push(`<path d="${path}" fill="${seriesColor(d, i)}" stroke="#fff" stroke-width="1.5"/>`)
      if (d.dataLabels && v) {
        const mid = (angle + a2) / 2
        const lr = inner ? (r + inner) / 2 : r * 0.65
        parts.push(`<text x="${cx + lr * Math.cos(mid)}" y="${cy + lr * Math.sin(mid) + 4}" text-anchor="middle" font-size="11" fill="#fff" ${font}>${fmt(v)}</text>`)
      }
      angle = a2
    })
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff" stroke="#d9d9d9"/>${parts.join('')}</svg>`
  }

  const n = d.categories.length
  const stacked = d.stacking !== 'none' && d.chartType !== 'scatter'
  const percent = d.stacking === 'percent'
  const values = d.series.map((s) => d.categories.map((_, i) => s.values[i] ?? null))
  let lo = 0
  let hi = 0
  if (stacked) {
    for (let i = 0; i < n; i++) {
      let pos = 0
      let neg = 0
      for (const s of values) {
        const v = s[i] ?? 0
        if (v >= 0) pos += v
        else neg += v
      }
      const total = percent ? Math.max(pos - neg, 1e-9) : 1
      hi = Math.max(hi, percent ? (pos / total) * 100 : pos)
      lo = Math.min(lo, percent ? (neg / total) * 100 : neg)
    }
  } else
    for (const s of values)
      for (const v of s) {
        if (v == null) continue
        hi = Math.max(hi, v)
        lo = Math.min(lo, v)
      }
  const scale = niceScale(lo, hi)
  const horizontal = d.chartType === 'bar'
  const axisLabelW = 36
  const plot = { x: left + (horizontal ? 70 : axisLabelW), y: top + 6, w: 0, h: 0 }
  plot.w = Math.max(10, right - plot.x - 6)
  plot.h = Math.max(10, bottom - plot.y - (horizontal ? 18 : 22))
  const valuePos = (v: number) => (horizontal ? plot.x + ((v - scale.min) / (scale.max - scale.min)) * plot.w : plot.y + plot.h - ((v - scale.min) / (scale.max - scale.min)) * plot.h)

  // Gridlines and value axis labels.
  for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) {
    const p = valuePos(v)
    const label = percent ? `${Math.round(v)}%` : fmt(v)
    if (horizontal) {
      if (d.gridlines) parts.push(`<line x1="${p}" y1="${plot.y}" x2="${p}" y2="${plot.y + plot.h}" stroke="#d9d9d9"/>`)
      parts.push(`<text x="${p}" y="${plot.y + plot.h + 14}" text-anchor="middle" font-size="10" fill="#595959" ${font}>${label}</text>`)
    } else {
      if (d.gridlines) parts.push(`<line x1="${plot.x}" y1="${p}" x2="${plot.x + plot.w}" y2="${p}" stroke="#d9d9d9"/>`)
      parts.push(`<text x="${plot.x - 6}" y="${p + 3.5}" text-anchor="end" font-size="10" fill="#595959" ${font}>${label}</text>`)
    }
  }
  const band = (horizontal ? plot.h : plot.w) / Math.max(1, n)
  // Category axis labels.
  d.categories.forEach((c, i) => {
    const mid = (horizontal ? plot.y + plot.h - (i + 0.5) * band : plot.x + (i + 0.5) * band)
    if (horizontal) parts.push(`<text x="${plot.x - 6}" y="${mid + 3.5}" text-anchor="end" font-size="10" fill="#595959" ${font}>${esc(c)}</text>`)
    else parts.push(`<text x="${mid}" y="${plot.y + plot.h + 15}" text-anchor="middle" font-size="10" fill="#595959" ${font}>${esc(c)}</text>`)
  })
  const zero = valuePos(Math.max(scale.min, 0))
  parts.push(horizontal ? `<line x1="${zero}" y1="${plot.y}" x2="${zero}" y2="${plot.y + plot.h}" stroke="#bfbfbf"/>` : `<line x1="${plot.x}" y1="${zero}" x2="${plot.x + plot.w}" y2="${zero}" stroke="#bfbfbf"/>`)

  const label = (x: number, y: number, v: number) => (d.dataLabels ? `<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#404040" ${font}>${fmt(v)}</text>` : '')

  if (d.chartType === 'column' || d.chartType === 'bar') {
    const groups = stacked ? 1 : values.length
    const gap = band * 0.35
    const barW = (band - gap) / Math.max(1, groups)
    for (let i = 0; i < n; i++) {
      let pos = 0
      let neg = 0
      const total = percent ? values.reduce((t, s) => t + Math.abs(s[i] ?? 0), 0) || 1 : 1
      values.forEach((s, si) => {
        const raw = s[i]
        if (raw == null) return
        const v = percent ? (raw / total) * 100 : raw
        let a: number
        let b: number
        if (stacked) {
          if (v >= 0) {
            a = pos
            pos += v
            b = pos
          } else {
            a = neg
            neg += v
            b = neg
          }
        } else {
          a = 0
          b = v
        }
        const p1 = valuePos(a)
        const p2 = valuePos(b)
        const offset = gap / 2 + (stacked ? 0 : si * barW)
        if (horizontal) {
          const y = plot.y + plot.h - (i + 1) * band + offset
          parts.push(`<rect x="${Math.min(p1, p2)}" y="${y}" width="${Math.abs(p2 - p1)}" height="${barW}" fill="${seriesColor(d, si)}"/>`)
          if (d.dataLabels) parts.push(`<text x="${Math.max(p1, p2) + 4}" y="${y + barW / 2 + 3.5}" font-size="10" fill="#404040" ${font}>${fmt(raw)}</text>`)
        } else {
          const x = plot.x + i * band + offset
          parts.push(`<rect x="${x}" y="${Math.min(p1, p2)}" width="${barW}" height="${Math.abs(p2 - p1)}" fill="${seriesColor(d, si)}"/>`)
          parts.push(label(x + barW / 2, Math.min(p1, p2) - 3, raw))
        }
      })
    }
  } else if (d.chartType === 'line' || d.chartType === 'area' || d.chartType === 'scatter') {
    const base = values.map(() => 0)
    const cum = d.categories.map(() => 0)
    values.forEach((s, si) => {
      const pts: [number, number][] = []
      s.forEach((raw, i) => {
        if (raw == null) return
        const total = percent ? values.reduce((t, ss) => t + Math.abs(ss[i] ?? 0), 0) || 1 : 1
        const v = (percent ? (raw / total) * 100 : raw) + (stacked ? cum[i] : 0)
        if (stacked) cum[i] = v
        pts.push([plot.x + (i + 0.5) * band, valuePos(v)])
      })
      void base
      const color = seriesColor(d, si)
      if (!pts.length) return
      const line = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x} ${y}`).join(' ')
      if (d.chartType === 'area') parts.push(`<path d="${line} L${pts[pts.length - 1][0]} ${zero} L${pts[0][0]} ${zero} Z" fill="${color}" fill-opacity="0.75"/>`)
      if (d.chartType !== 'scatter') parts.push(`<path d="${line}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round"/>`)
      if (d.chartType !== 'area') for (const [x, y] of pts) parts.push(`<circle cx="${x}" cy="${y}" r="${d.chartType === 'scatter' ? 4 : 2.5}" fill="${color}"/>`)
      if (d.dataLabels) s.forEach((raw, i) => raw != null && parts.push(label(plot.x + (i + 0.5) * band, valuePos(raw) - 6, raw)))
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff" stroke="#d9d9d9"/>${parts.join('')}</svg>`
}

const renderChart: DrawingRenderer = (node, box, { width, height }) => {
  box.className = 'drawing-box chart-box'
  box.innerHTML = chartSvg(node.attrs.data as ChartData, width, height)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chart: {
      insertChart: (data: ChartData) => ReturnType
    }
  }
}

export const Chart = Node.create<{ onEdit: ((pos: number) => void) | null }>({
  name: 'chart',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { onEdit: null }
  },

  addAttributes() {
    return {
      ...drawingAttributes({ width: 576, height: 336, wrap: 'inline' }),
      data: {
        default: DEFAULT_CHART,
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-chart') ?? '') as ChartData
          } catch {
            return DEFAULT_CHART
          }
        },
        renderHTML: (a) => ({ 'data-chart': JSON.stringify(a.data) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="chart"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const w = node.attrs.width ?? 576
    const h = node.attrs.height ?? 336
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'chart', class: 'drawing chart-static', style: `${wrapStyle(node.attrs)}; display: inline-block; width: ${w}px; height: ${h}px; background: url("data:image/svg+xml,${encodeURIComponent(chartSvg(node.attrs.data, w, h))}") no-repeat` })]
  },

  addNodeView() {
    return ({ node, view, getPos }) =>
      new DrawingView(node, view, getPos as () => number | undefined, renderChart, {
        className: 'chart',
        onDoubleClick: (_n, _v, gp) => {
          const pos = gp()
          if (pos != null) this.options.onEdit?.(pos)
        },
      })
  },

  addCommands() {
    return {
      insertChart:
        (data) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { data } }),
    }
  },
})

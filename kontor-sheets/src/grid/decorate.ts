// Per-render helpers that combine a cell's own style with table styles and conditional formats,
// and draw the extra in-cell graphics (data bars, icons, sparklines, filter buttons, markers).
import { cellKey, keyCol, keyRow } from '../model/address'
import type { IconSetId, Sparkline } from '../model/extras'
import type { Sheet } from '../model/sheet'
import type { Style } from '../model/style'
import type { Doc } from '../commands/doc'
import { cfEvaluator, type CFResult } from '../commands/cf'
import { tableCellStyle } from '../commands/tables'
import { resolveRef } from '../charts/chartData'

export type Decorator = {
  style: (r: number, c: number) => Style
  cf: (r: number, c: number) => CFResult | null
  spark: (r: number, c: number) => Sparkline | undefined
}

export function makeDecorator(doc: Doc, sheet: Sheet): Decorator {
  const styles = doc.wb.styles
  const evalCf = cfEvaluator(doc, sheet)
  const cfCache = new Map<number, CFResult | null>()
  const tables = sheet.x.tables
  // banding counts visible rows only (filtered tables keep alternating colors)
  const bands = new Map<number, Map<number, number> | null>()
  const bandIndex = (t: (typeof tables)[number], r: number) => {
    let m = bands.get(t.id)
    if (m === undefined) {
      const d1 = t.range.r1 + (t.header ? 1 : 0)
      const d2 = t.range.r2 - (t.totals ? 1 : 0)
      let any = false
      for (const h of sheet.rows.hidden) if (h >= d1 && h <= d2) any = true
      if (!any) m = null
      else {
        m = new Map()
        let i = 0
        for (let rr = d1; rr <= d2; rr++) if (!sheet.rows.hidden.has(rr)) m.set(rr, i++)
      }
      bands.set(t.id, m)
    }
    return m ? m.get(r) : undefined
  }
  const sparks = new Map<number, Sparkline>()
  for (const s of sheet.x.sparklines) sparks.set(cellKey(s.r, s.c), s)
  const cf = (r: number, c: number) => {
    if (!evalCf) return null
    const k = cellKey(r, c)
    let v = cfCache.get(k)
    if (v === undefined) cfCache.set(k, (v = evalCf(r, c)))
    return v
  }
  return {
    cf,
    spark: (r, c) => (sparks.size ? sparks.get(cellKey(r, c)) : undefined),
    style(r, c) {
      const base = styles.get(sheet.styleId(r, c))
      let t = null
      if (tables.length) {
        const tb = tables.find((x) => r >= x.range.r1 && r <= x.range.r2 && c >= x.range.c1 && c <= x.range.c2)
        if (tb) t = tableCellStyle(tb, r, c, bandIndex(tb, r))
      }
      const res = evalCf ? cf(r, c) : null
      if (!t && !res?.style && !res?.scale) return base
      const out: Style = { ...((t ?? {}) as Style), ...base }
      if (res?.scale) Object.assign(out, { fill: res.scale, pattern: undefined, gradient: undefined })
      const s = res?.style
      if (s) {
        if (s.fill) Object.assign(out, { fill: s.fill, pattern: undefined, gradient: undefined })
        if (s.color) out.color = s.color
        if (s.bold) out.bold = true
        if (s.italic) out.italic = true
        if (s.underline) out.underline = 'single'
        if (s.strike) out.strike = true
        if (s.fmt) out.fmt = s.fmt
        if (s.border) {
          const b = { style: 'thin' as const, color: s.border }
          out.bt = b
          out.bb = b
          out.bl = b
          out.br = b
        }
      }
      return out
    },
  }
}

// ---------- in-cell graphics ----------

export function drawDataBar(ctx: CanvasRenderingContext2D, bar: NonNullable<CFResult['bar']>, x: number, y: number, w: number, h: number) {
  const pad = 2
  const bx = x + pad + (w - pad * 2) * bar.start
  const bw = Math.max(1, (w - pad * 2) * (bar.end - bar.start))
  const by = y + pad
  const bh = h - pad * 2 - 1
  if (bar.gradient) {
    const g = ctx.createLinearGradient(bar.negative ? bx + bw : bx, 0, bar.negative ? bx : bx + bw, 0)
    g.addColorStop(0, bar.color)
    g.addColorStop(1, '#FFFFFF')
    ctx.fillStyle = g
  } else ctx.fillStyle = bar.color
  ctx.fillRect(bx, by, bw, bh)
  if (bar.border || bar.gradient) {
    ctx.strokeStyle = bar.color
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(bw) - 1, Math.round(bh) - 1)
  }
  if (bar.axis !== undefined) {
    // dashed axis at zero
    const ax = Math.round(x + pad + (w - pad * 2) * bar.axis) + 0.5
    ctx.save()
    ctx.strokeStyle = bar.axisColor ?? '#000000'
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(ax, y + 1)
    ctx.lineTo(ax, y + h - 1)
    ctx.stroke()
    ctx.restore()
  }
}

const GREEN = '#3BA55C'
const YELLOW = '#F2C12E'
const RED = '#E04B3A'
const GRAY = '#8C8C8C'
const BLACK = '#3A3A3A'

/** Draws icon `index` (0 = lowest) of an icon set into a square at (x, y). */
export function drawIcon(ctx: CanvasRenderingContext2D, set: IconSetId, index: number, count: number, x: number, y: number, s: number) {
  const cx = x + s / 2
  const cy = y + s / 2
  const r = s * 0.42
  const circle = (color: string, rim = false) => {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    if (rim) {
      ctx.strokeStyle = BLACK
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  const arrow = (angle: number, color: string) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.85, 0)
    ctx.lineTo(r * 0.3, 0)
    ctx.lineTo(r * 0.3, r)
    ctx.lineTo(-r * 0.3, r)
    ctx.lineTo(-r * 0.3, 0)
    ctx.lineTo(-r * 0.85, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  const tri = (up: boolean | null, color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    if (up === null) ctx.rect(cx - r * 0.7, cy - r * 0.2, r * 1.4, r * 0.4)
    else if (up) {
      ctx.moveTo(cx, cy - r * 0.7)
      ctx.lineTo(cx + r * 0.8, cy + r * 0.5)
      ctx.lineTo(cx - r * 0.8, cy + r * 0.5)
    } else {
      ctx.moveTo(cx, cy + r * 0.7)
      ctx.lineTo(cx + r * 0.8, cy - r * 0.5)
      ctx.lineTo(cx - r * 0.8, cy - r * 0.5)
    }
    ctx.closePath()
    ctx.fill()
  }
  const t = count === 1 ? 1 : index / (count - 1)
  const traffic = t >= 0.99 ? GREEN : t <= 0.01 ? RED : YELLOW
  switch (set) {
    case '3Arrows':
    case '4Arrows':
    case '5Arrows': {
      const ang = (1 - t) * Math.PI - Math.PI / 2 + Math.PI / 2
      arrow(ang, t >= 0.99 ? GREEN : t <= 0.01 ? RED : YELLOW)
      break
    }
    case '3ArrowsGray':
      arrow((1 - t) * Math.PI, GRAY)
      break
    case '3Triangles':
      tri(t >= 0.99 ? true : t <= 0.01 ? false : null, t >= 0.99 ? GREEN : t <= 0.01 ? RED : YELLOW)
      break
    case '3TrafficLights1':
      circle(traffic)
      break
    case '3TrafficLights2':
      circle(traffic, true)
      break
    case '4TrafficLights':
      circle(index === 3 ? GREEN : index === 2 ? YELLOW : index === 1 ? RED : BLACK)
      break
    case '4RedToBlack':
      circle(['#3A3A3A', '#9C9C9C', '#F4A6A0', RED][index] ?? RED)
      break
    case '3Signs':
      if (index === 2) circle(GREEN)
      else if (index === 1) {
        ctx.fillStyle = YELLOW
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r, cy + r * 0.8)
        ctx.lineTo(cx - r, cy + r * 0.8)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillStyle = RED
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r, cy)
        ctx.lineTo(cx, cy + r)
        ctx.lineTo(cx - r, cy)
        ctx.closePath()
        ctx.fill()
      }
      break
    case '3Symbols':
    case '3Symbols2': {
      const color = index === 2 ? GREEN : index === 1 ? YELLOW : RED
      if (set === '3Symbols') circle(color)
      ctx.strokeStyle = set === '3Symbols' ? '#FFFFFF' : color
      ctx.lineWidth = Math.max(1.5, s / 8)
      ctx.lineCap = 'round'
      ctx.beginPath()
      if (index === 2) {
        ctx.moveTo(cx - r * 0.5, cy)
        ctx.lineTo(cx - r * 0.1, cy + r * 0.4)
        ctx.lineTo(cx + r * 0.5, cy - r * 0.4)
      } else if (index === 1) {
        ctx.moveTo(cx, cy - r * 0.5)
        ctx.lineTo(cx, cy + r * 0.1)
        ctx.moveTo(cx, cy + r * 0.45)
        ctx.lineTo(cx, cy + r * 0.5)
      } else {
        ctx.moveTo(cx - r * 0.4, cy - r * 0.4)
        ctx.lineTo(cx + r * 0.4, cy + r * 0.4)
        ctx.moveTo(cx + r * 0.4, cy - r * 0.4)
        ctx.lineTo(cx - r * 0.4, cy + r * 0.4)
      }
      ctx.stroke()
      break
    }
    case '3Flags': {
      const color = index === 2 ? GREEN : index === 1 ? YELLOW : RED
      ctx.fillStyle = BLACK
      ctx.fillRect(cx - r * 0.6, cy - r, Math.max(1, s / 12), r * 2)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.55, cy - r)
      ctx.lineTo(cx + r, cy - r * 0.5)
      ctx.lineTo(cx - r * 0.55, cy)
      ctx.closePath()
      ctx.fill()
      break
    }
    case '3Stars': {
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 ? r * 0.45 : r
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fillStyle = index === 0 ? '#FFFFFF' : YELLOW
      ctx.strokeStyle = '#C99A06'
      ctx.lineWidth = 1
      ctx.fill()
      ctx.stroke()
      if (index === 1) {
        ctx.save()
        ctx.clip()
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(cx, y, s, s)
        ctx.restore()
        ctx.stroke()
      }
      break
    }
    case '4Rating':
    case '5Rating': {
      const bars = 4
      const filled = Math.round(t * bars)
      for (let i = 0; i < bars; i++) {
        const bh = ((i + 1) / bars) * r * 1.8
        ctx.fillStyle = i < filled ? '#3B6FC4' : '#C9D5EA'
        ctx.fillRect(cx - r + i * (r * 0.5), cy + r - bh, r * 0.38, bh)
      }
      break
    }
    case '5Quarters': {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.strokeStyle = BLACK
      ctx.lineWidth = 1
      ctx.stroke()
      if (t > 0) {
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2)
        ctx.closePath()
        ctx.fillStyle = BLACK
        ctx.fill()
      }
      break
    }
    case '5Boxes': {
      const filled = Math.round(t * 4)
      const q = r * 0.85
      const pos = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      pos.forEach(([dx, dy], i) => {
        ctx.fillStyle = i < filled ? '#3B6FC4' : '#C9D5EA'
        ctx.fillRect(cx + (dx < 0 ? -q : q * 0.1), cy + (dy < 0 ? -q : q * 0.1), q * 0.9, q * 0.9)
      })
      break
    }
  }
}

/** Draws a sparkline into the cell rectangle. */
export function drawSparkline(ctx: CanvasRenderingContext2D, doc: Doc, sp: Sparkline, x: number, y: number, w: number, h: number) {
  const res = resolveRef(doc.wb, sp.source, doc.sheet)
  if (!res) return
  const vals: (number | null)[] = []
  const { sheet, range } = res
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) {
      const v = doc.engine.display(sheet, r, c)
      vals.push(typeof v === 'number' ? v : null)
    }
  const nums = vals.filter((v): v is number => v !== null)
  if (!nums.length) return
  const pad = 3
  const lo = Math.min(0, ...nums)
  const hi = Math.max(...nums, lo + 1e-9)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = sp.type === 'line' ? max - min || 1 : hi - lo || 1
  const n = vals.length
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  if (sp.type === 'line') {
    const px = (i: number) => x + pad + ((w - pad * 2) * i) / Math.max(1, n - 1)
    const py = (v: number) => y + h - pad - ((v - min) / span) * (h - pad * 2)
    ctx.strokeStyle = sp.color
    ctx.lineWidth = 1.25
    ctx.beginPath()
    let started = false
    vals.forEach((v, i) => {
      if (v === null) return
      if (!started) ctx.moveTo(px(i), py(v))
      else ctx.lineTo(px(i), py(v))
      started = true
    })
    ctx.stroke()
    const mark = (i: number, color: string) => {
      const v = vals[i]
      if (v === null) return
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(px(i), py(v), 2, 0, Math.PI * 2)
      ctx.fill()
    }
    vals.forEach((v, i) => {
      if (v === null) return
      if (sp.markers) mark(i, sp.color)
      if (sp.negative && v < 0) mark(i, sp.negColor)
      if (sp.high && v === max) mark(i, '#3BA55C')
      if (sp.low && v === min) mark(i, '#E04B3A')
    })
    if (sp.first) mark(vals.findIndex((v) => v !== null), '#2E6FD8')
    if (sp.last) {
      let li = n - 1
      while (li >= 0 && vals[li] === null) li--
      if (li >= 0) mark(li, '#2E6FD8')
    }
  } else {
    const bw = (w - pad * 2) / n
    const zero = sp.type === 'winloss' ? y + h / 2 : y + h - pad - ((0 - lo) / span) * (h - pad * 2)
    vals.forEach((v, i) => {
      if (v === null) return
      const bx = x + pad + bw * i + bw * 0.12
      let top: number
      let bottom: number
      if (sp.type === 'winloss') {
        if (v === 0) return
        top = v > 0 ? y + pad : zero + 1
        bottom = v > 0 ? zero - 1 : y + h - pad
      } else {
        const vy = y + h - pad - ((v - lo) / span) * (h - pad * 2)
        top = Math.min(vy, zero)
        bottom = Math.max(vy, zero)
      }
      let color = v < 0 && (sp.negative || sp.type === 'winloss') ? sp.negColor : sp.color
      if (sp.high && v === max) color = '#3BA55C'
      if (sp.low && v === min) color = '#E04B3A'
      if (sp.first && i === vals.findIndex((x) => x !== null)) color = '#2E6FD8'
      ctx.fillStyle = color
      ctx.fillRect(bx, top, Math.max(1, bw * 0.76), Math.max(1, bottom - top))
    })
  }
  ctx.restore()
}

export function drawFilterButton(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, filtered: boolean, sort: 'asc' | 'desc' | null) {
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(x, y, s, s)
  ctx.strokeStyle = '#A6A6A6'
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(s) - 1, Math.round(s) - 1)
  ctx.fillStyle = '#404040'
  const cx = x + s / 2
  const cy = y + s / 2
  if (filtered) {
    // funnel
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.3, cy - s * 0.25)
    ctx.lineTo(cx + s * 0.3, cy - s * 0.25)
    ctx.lineTo(cx + s * 0.06, cy + s * 0.05)
    ctx.lineTo(cx + s * 0.06, cy + s * 0.3)
    ctx.lineTo(cx - s * 0.06, cy + s * 0.22)
    ctx.lineTo(cx - s * 0.06, cy + s * 0.05)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.22, cy - s * 0.08)
    ctx.lineTo(cx + s * 0.22, cy - s * 0.08)
    ctx.lineTo(cx, cy + s * 0.16)
    ctx.closePath()
    ctx.fill()
  }
  if (sort) {
    ctx.fillRect(x + s * 0.12, y + s * 0.2, 1, s * 0.6)
    ctx.beginPath()
    const ay = sort === 'asc' ? y + s * 0.2 : y + s * 0.8
    ctx.moveTo(x + s * 0.12 - 2, ay + (sort === 'asc' ? 3 : -3))
    ctx.lineTo(x + s * 0.12 + 0.5, ay)
    ctx.lineTo(x + s * 0.12 + 3, ay + (sort === 'asc' ? 3 : -3))
    ctx.fill()
  }
}

export function annotationKeys(sheet: Sheet) {
  return {
    notes: Object.keys(sheet.x.notes).map(Number).map((k) => ({ r: keyRow(k), c: keyCol(k) })),
    comments: Object.entries(sheet.x.comments).map(([k, t]) => ({ r: keyRow(Number(k)), c: keyCol(Number(k)), resolved: t.resolved })),
  }
}

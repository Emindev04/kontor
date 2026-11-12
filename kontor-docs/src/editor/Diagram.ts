import { Node, mergeAttributes } from '@tiptap/core'
import { DrawingView, drawingAttributes, wrapStyle, type DrawingRenderer } from './Drawing'
import { shapeSvg } from './Shape'

// Diagrams (Insert > Diagram): lists, processes, cycles, hierarchies, relationships, matrices and
// pyramids drawn from an outline of items. The items and the layout live on the node; the picture is
// computed from them, so changing the layout, colors or style redraws the whole diagram. Saved to
// .docx as a group of shapes.

export type DiagramLayout =
  | 'blockList'
  | 'bulletList'
  | 'process'
  | 'chevron'
  | 'cycle'
  | 'radial'
  | 'hierarchy'
  | 'venn'
  | 'matrix'
  | 'pyramid'
export type DiagramStyle = 'flat' | 'subtle' | 'outline' | 'gradient' | 'shadow'
export type DiagramItem = { text: string; level: number }
export type DiagramData = { layout: DiagramLayout; items: DiagramItem[]; colors: string; style: DiagramStyle }

export const DIAGRAM_LAYOUTS: { id: DiagramLayout; label: string; category: string; hint: string }[] = [
  { id: 'blockList', label: 'Block List', category: 'List', hint: 'Shows items of equal importance as a grid of blocks.' },
  { id: 'bulletList', label: 'Vertical Bullet List', category: 'List', hint: 'Shows groups of items, each with a heading bar and bullets.' },
  { id: 'process', label: 'Basic Process', category: 'Process', hint: 'Shows the steps of a process from left to right.' },
  { id: 'chevron', label: 'Chevron Process', category: 'Process', hint: 'Shows steps as arrows pointing forward, with details below.' },
  { id: 'cycle', label: 'Basic Cycle', category: 'Cycle', hint: 'Shows stages that repeat in a circle.' },
  { id: 'radial', label: 'Basic Radial', category: 'Cycle', hint: 'Shows parts around a central idea.' },
  { id: 'hierarchy', label: 'Organization Chart', category: 'Hierarchy', hint: 'Shows reporting lines or a tree of ideas; indent items to make them children.' },
  { id: 'venn', label: 'Basic Venn', category: 'Relationship', hint: 'Shows overlapping ideas.' },
  { id: 'matrix', label: 'Basic Matrix', category: 'Matrix', hint: 'Shows four parts of a whole in quadrants.' },
  { id: 'pyramid', label: 'Basic Pyramid', category: 'Pyramid', hint: 'Shows levels from the base to the top.' },
]

export const DIAGRAM_CATEGORIES = ['All', ...Array.from(new Set(DIAGRAM_LAYOUTS.map((l) => l.category)))]

export const DIAGRAM_COLORS: Record<string, { label: string; colors: string[] }> = {
  primary: { label: 'Primary Theme Color', colors: ['#2F6FC4'] },
  colorful: { label: 'Colorful Range', colors: ['#2F6FC4', '#E3742F', '#9E9E9E', '#F2B705', '#4FA3D9', '#5FA84B'] },
  blueRange: { label: 'Blue Range', colors: ['#1F4E8C', '#2F6FC4', '#5B8FD6', '#8FB3E6'] },
  orange: { label: 'Orange', colors: ['#E3742F'] },
  green: { label: 'Green', colors: ['#5FA84B'] },
  gray: { label: 'Dark Gray', colors: ['#595959'] },
}

export const DIAGRAM_STYLES: { id: DiagramStyle; label: string }[] = [
  { id: 'flat', label: 'Simple Fill' },
  { id: 'subtle', label: 'Subtle Fill' },
  { id: 'outline', label: 'Outline' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'shadow', label: 'Shadow' },
]

export const DEFAULT_ITEMS: Record<DiagramLayout, DiagramItem[]> = {
  blockList: ['Text', 'Text', 'Text', 'Text', 'Text'].map((text) => ({ text, level: 0 })),
  bulletList: [
    { text: 'Text', level: 0 },
    { text: 'Text', level: 1 },
    { text: 'Text', level: 1 },
    { text: 'Text', level: 0 },
    { text: 'Text', level: 1 },
  ],
  process: ['Text', 'Text', 'Text'].map((text) => ({ text, level: 0 })),
  chevron: [
    { text: 'Text', level: 0 },
    { text: 'Text', level: 1 },
    { text: 'Text', level: 0 },
    { text: 'Text', level: 1 },
    { text: 'Text', level: 0 },
    { text: 'Text', level: 1 },
  ],
  cycle: ['Text', 'Text', 'Text', 'Text', 'Text'].map((text) => ({ text, level: 0 })),
  radial: ['Text', 'Text', 'Text', 'Text', 'Text'].map((text, i) => ({ text, level: i ? 1 : 0 })),
  hierarchy: [
    { text: 'Text', level: 0 },
    { text: 'Text', level: 1 },
    { text: 'Text', level: 1 },
    { text: 'Text', level: 1 },
  ],
  venn: ['Text', 'Text', 'Text'].map((text) => ({ text, level: 0 })),
  matrix: ['Text', 'Text', 'Text', 'Text'].map((text) => ({ text, level: 0 })),
  pyramid: ['Text', 'Text', 'Text'].map((text) => ({ text, level: 0 })),
}

export const newDiagram = (layout: DiagramLayout): DiagramData => ({ layout, items: DEFAULT_ITEMS[layout].map((i) => ({ ...i })), colors: 'primary', style: 'flat' })

/** One shape of a laid-out diagram, in px from the diagram's top-left corner. */
export type DShape = {
  kind: string
  x: number
  y: number
  w: number
  h: number
  text: string
  fill: string | null
  stroke: string | null
  strokeWidth: number
  textColor: string
  fontSize: number
  textAlign: 'left' | 'center'
  vAlign: 'top' | 'middle'
  gradient?: boolean
  shadow?: boolean
  opacity?: number
  flip?: string
  /** Exact outline for shapes the presets can't draw (pyramid layers); `slant` is the .docx adjustment. */
  points?: [number, number][]
  slant?: number
  /** Index of the item the shape shows (for the text pane), or -1 for connectors. */
  item: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function mix(hex: string, white: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - white) + 255 * white)
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** Largest font (pt) at which `text` fits a w × h box, estimated from average glyph widths. */
function fitFont(text: string, w: number, h: number, max = 20) {
  const lines = text.split('\n')
  // No word may be wider than the box: words are not split.
  const longest = Math.max(1, ...text.split(/\s+/).map((word) => word.length))
  for (let px = (max * 4) / 3; px > 9; px -= 1) {
    if (longest * px * 0.6 > w * 0.86) continue
    const perLine = Math.max(1, Math.floor((w * 0.86) / (px * 0.55)))
    const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0)
    if (rows * px * 1.2 <= h * 0.84) return Math.round(px * 0.75 * 2) / 2
  }
  return 7
}

/** Items as a tree: each top-level item with the items indented under it. */
function groups(items: DiagramItem[]) {
  const out: { index: number; text: string; children: number[] }[] = []
  items.forEach((it, i) => {
    if (it.level === 0 || !out.length) out.push({ index: i, text: it.text, children: [] })
    else out[out.length - 1].children.push(i)
  })
  return out
}

/** Lays the diagram out in a w × h box. */
export function diagramShapes(d: DiagramData, w: number, h: number): DShape[] {
  const palette = (DIAGRAM_COLORS[d.colors] ?? DIAGRAM_COLORS.primary).colors
  const color = (i: number) => (palette.length === 1 ? palette[0] : palette[i % palette.length])
  const style = d.style
  const look = (i: number, kind: string, x: number, y: number, sw: number, sh: number, text: string, extra: Partial<DShape> = {}): DShape => {
    const c = color(i)
    const subtle = style === 'subtle'
    const outline = style === 'outline'
    return {
      kind,
      x,
      y,
      w: sw,
      h: sh,
      text,
      fill: outline ? '#FFFFFF' : subtle ? mix(c, 0.75) : c,
      stroke: outline || subtle ? c : '#FFFFFF',
      strokeWidth: outline ? 2 : 1,
      textColor: outline || subtle ? '#262626' : '#FFFFFF',
      fontSize: 12,
      textAlign: 'center',
      vAlign: 'middle',
      gradient: style === 'gradient',
      shadow: style === 'shadow',
      item: i,
      ...extra,
    }
  }
  const textBox = (i: number, x: number, y: number, sw: number, sh: number, text: string): DShape => ({
    kind: 'rectangle', x, y, w: sw, h: sh, text, fill: style === 'outline' ? null : mix(color(i), 0.85), stroke: style === 'outline' ? color(i) : null, strokeWidth: 1, textColor: '#262626', fontSize: 11, textAlign: 'left', vAlign: 'top', item: i,
  })
  const line = (x1: number, y1: number, x2: number, y2: number, arrow: boolean, c = '#8C8C8C'): DShape => ({
    kind: arrow ? 'arrowLine' : 'line',
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.max(1, Math.abs(x2 - x1)),
    h: Math.max(1, Math.abs(y2 - y1)),
    text: '',
    fill: null,
    stroke: c,
    strokeWidth: arrow ? 1.5 : 1,
    textColor: '#000000',
    fontSize: 11,
    textAlign: 'center',
    vAlign: 'middle',
    flip: `${x2 < x1 ? 'h' : ''}${y2 < y1 ? 'v' : ''}`,
    item: -1,
  })
  const bullets = (indexes: number[]) => indexes.map((i) => `• ${d.items[i].text}`).join('\n')
  const g = groups(d.items)
  const n = Math.max(1, g.length)
  const out: DShape[] = []
  const pad = 4

  switch (d.layout) {
    case 'blockList': {
      const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h / 1.6)))
      const rows = Math.ceil(n / cols)
      const gap = 10
      const bw = (w - gap * (cols - 1)) / cols
      const bh = (h - gap * (rows - 1)) / rows
      g.forEach((grp, k) => {
        const r = Math.floor(k / cols)
        const inRow = r === rows - 1 ? n - r * cols : cols
        const offset = ((cols - inRow) * (bw + gap)) / 2
        const text = [grp.text, ...grp.children.map((i) => `• ${d.items[i].text}`)].join('\n')
        out.push(look(k, 'rectangle', offset + (k % cols) * (bw + gap), r * (bh + gap), bw, bh, text))
      })
      break
    }
    case 'bulletList': {
      const subLines = g.reduce((s, grp) => s + grp.children.length, 0)
      const unit = h / (n * 1.6 + subLines + 0.0001)
      const bar = clamp(unit * 1.4, 24, 70)
      let y = 0
      g.forEach((grp, k) => {
        out.push(look(k, 'roundedRectangle', 0, y, w, bar, grp.text, { textAlign: 'left' }))
        y += bar + 2
        if (grp.children.length) {
          const th = Math.max(unit * grp.children.length, 18)
          out.push(textBox(k, pad * 4, y, w - pad * 4, th, bullets(grp.children)))
          y += th
        }
        y += unit * 0.2
      })
      const scale = y > h ? h / y : 1
      for (const s of out) {
        s.y *= scale
        s.h *= scale
      }
      break
    }
    case 'process': {
      const arrow = clamp(w / (n * 6), 14, 40)
      const bw = (w - (n - 1) * (arrow + 12)) / n
      const bh = clamp(bw * 0.6, 30, h)
      const y = (h - bh) / 2
      g.forEach((grp, k) => {
        const x = k * (bw + arrow + 12)
        out.push(look(k, 'roundedRectangle', x, y, bw, bh, [grp.text, ...grp.children.map((i) => `• ${d.items[i].text}`)].join('\n')))
        if (k < n - 1) out.push({ ...look(k, 'rightArrow', x + bw + 6, h / 2 - arrow * 0.6, arrow, arrow * 1.2, ''), fill: mix(color(k), 0.45), stroke: null, item: -1 })
      })
      break
    }
    case 'chevron': {
      const overlap = 0.12
      const cw = w / (n - (n - 1) * overlap)
      const hasDetail = g.some((grp) => grp.children.length)
      const ch = clamp(cw * 0.42, 24, hasDetail ? h * 0.38 : h)
      const y = hasDetail ? 0 : (h - ch) / 2
      g.forEach((grp, k) => {
        const x = k * cw * (1 - overlap)
        out.push(look(k, k === 0 ? 'pentagonArrow' : 'chevron', x, y, cw, ch, grp.text))
        if (grp.children.length) out.push(textBox(k, x + cw * 0.08, ch + 8, cw * 0.84, Math.max(20, h - ch - 8), bullets(grp.children)))
      })
      break
    }
    case 'cycle': {
      const size = clamp(Math.min(w, h) * (n <= 3 ? 0.36 : n <= 5 ? 0.3 : 0.24), 30, 160)
      const r = Math.min(w, h) / 2 - size / 2
      const cx = w / 2
      const cy = h / 2
      const at = (k: number) => [cx + r * Math.cos((2 * Math.PI * k) / n - Math.PI / 2), cy + r * Math.sin((2 * Math.PI * k) / n - Math.PI / 2)]
      g.forEach((grp, k) => {
        const [x, y] = at(k)
        out.push(look(k, 'ellipse', x - size / 2, y - size / 2, size, size, grp.text))
      })
      if (n > 1)
        g.forEach((_, k) => {
          const [x1, y1] = at(k)
          const [x2, y2] = at((k + 1) % n)
          const len = Math.hypot(x2 - x1, y2 - y1)
          const cut = size / 2 + 6
          if (len <= cut * 2) return
          const ux = (x2 - x1) / len
          const uy = (y2 - y1) / len
          out.push(line(x1 + ux * cut, y1 + uy * cut, x2 - ux * cut, y2 - uy * cut, true, mix(color(k), 0.2)))
        })
      break
    }
    case 'radial': {
      const center = g[0]
      const spokes = [...center.children, ...g.slice(1).map((grp) => grp.index)]
      const m = Math.max(1, spokes.length)
      const big = clamp(Math.min(w, h) * 0.32, 40, 180)
      const small = clamp(Math.min(w, h) * (m <= 4 ? 0.26 : m <= 6 ? 0.22 : 0.17), 28, 140)
      const r = Math.min(w, h) / 2 - small / 2
      const cx = w / 2
      const cy = h / 2
      spokes.forEach((i, k) => {
        const a = (2 * Math.PI * k) / m - Math.PI / 2
        const x = cx + r * Math.cos(a)
        const y = cy + r * Math.sin(a)
        out.push(line(cx + (big / 2) * Math.cos(a), cy + (big / 2) * Math.sin(a), x - (small / 2) * Math.cos(a), y - (small / 2) * Math.sin(a), false, mix(color(0), 0.3)))
        out.push(look(k + 1, 'ellipse', x - small / 2, y - small / 2, small, small, d.items[i].text, { item: i }))
      })
      out.push(look(0, 'ellipse', cx - big / 2, cy - big / 2, big, big, center.text, { item: center.index }))
      break
    }
    case 'hierarchy': {
      type T = { index: number; children: T[]; depth: number; leaves: number; start: number }
      const roots: T[] = []
      const stack: T[] = []
      d.items.forEach((it, index) => {
        const level = Math.min(it.level, stack.length)
        stack.length = level
        const node: T = { index, children: [], depth: level, leaves: 0, start: 0 }
        if (level === 0) roots.push(node)
        else stack[level - 1].children.push(node)
        stack.push(node)
      })
      let depth = 0
      const count = (t: T): number => {
        depth = Math.max(depth, t.depth)
        t.leaves = t.children.length ? t.children.reduce((s, c) => s + count(c), 0) : 1
        return t.leaves
      }
      const total = roots.reduce((s, t) => s + count(t), 0) || 1
      const colW = w / total
      const rowH = h / (depth + 1)
      const bw = clamp(colW * 0.86, 30, 200)
      const bh = clamp(rowH * 0.58, 22, 90)
      const place = (t: T, start: number) => {
        t.start = start
        let s = start
        for (const c of t.children) {
          place(c, s)
          s += c.leaves
        }
      }
      let s = 0
      for (const t of roots) {
        place(t, s)
        s += t.leaves
      }
      const center = (t: T) => (t.start + t.leaves / 2) * colW
      const top = (t: T) => t.depth * rowH + (rowH - bh) / 2
      const lineColor = '#8C8C8C'
      const walk = (t: T) => {
        out.push(look(t.depth, 'rectangle', center(t) - bw / 2, top(t), bw, bh, d.items[t.index].text, { item: t.index }))
        if (t.children.length) {
          const py = top(t) + bh
          const midY = py + (top(t.children[0]) - py) / 2
          out.push(line(center(t), py, center(t), midY, false, lineColor))
          const xs = t.children.map(center)
          if (xs.length > 1) out.push(line(Math.min(...xs), midY, Math.max(...xs), midY, false, lineColor))
          for (const c of t.children) {
            out.push(line(center(c), midY, center(c), top(c), false, lineColor))
            walk(c)
          }
        }
      }
      roots.forEach(walk)
      break
    }
    case 'venn': {
      const k = Math.min(n, 6)
      const r = n === 1 ? Math.min(w, h) / 2 : clamp(Math.min(w, h) / (k === 2 ? 2.4 : 2.9), 30, 300) * (k === 2 ? Math.min(1, w / h / 1.6) : 1)
      const off = n === 1 ? 0 : r * (k === 2 ? 0.62 : 0.66)
      const cx = w / 2
      const cy = h / 2
      g.slice(0, 6).forEach((grp, i) => {
        const a = k === 2 ? (i === 0 ? Math.PI : 0) : (2 * Math.PI * i) / k - Math.PI / 2
        const x = cx + off * Math.cos(a)
        const y = cy + off * Math.sin(a)
        out.push(look(i, 'ellipse', x - r, y - r, r * 2, r * 2, grp.text, { opacity: style === 'outline' ? 1 : 0.62, fill: style === 'outline' ? null : look(i, 'ellipse', 0, 0, 0, 0, '').fill, textColor: style === 'flat' || style === 'gradient' || style === 'shadow' ? '#FFFFFF' : '#262626' }))
      })
      break
    }
    case 'matrix': {
      const gap = 8
      const size = Math.min(w, h)
      const bw = (size - gap) / 2
      const ox = (w - size) / 2
      const oy = (h - size) / 2
      g.slice(0, 4).forEach((grp, k) => {
        out.push(look(k, 'roundedRectangle', ox + (k % 2) * (bw + gap), oy + Math.floor(k / 2) * (bw + gap), bw, bw, [grp.text, ...grp.children.map((i) => `• ${d.items[i].text}`)].join('\n')))
      })
      break
    }
    case 'pyramid': {
      const pw = Math.min(w, h * 1.15)
      const ox = (w - pw) / 2
      const layer = h / n
      g.forEach((grp, k) => {
        const yTop = k * layer
        const wt = (pw * k) / n
        const wb = (pw * (k + 1)) / n
        const x = ox + (pw - wb) / 2
        const inset = (wb - wt) / 2
        const pts: [number, number][] = k === 0 ? [[wb / 2, 0], [wb, layer - 2], [0, layer - 2]] : [[inset, 0], [wb - inset, 0], [wb, layer - 2], [0, layer - 2]]
        out.push(look(k, k === 0 ? 'triangle' : 'trapezoid', x, yTop, wb, layer - 2, grp.text, { points: pts, slant: k === 0 ? undefined : Math.round((inset / Math.min(wb, layer - 2)) * 100) }))
      })
      break
    }
  }
  // One font size per kind of text (main shapes, detail text), the largest that fits everywhere.
  const fit = (list: DShape[], max: number) => {
    if (!list.length) return
    const size = Math.min(...list.map((s) => fitFont(s.text || 'Text', s.points ? s.w * 0.6 : s.kind === 'ellipse' ? s.w * 0.72 : s.w, s.points ? s.h * 0.8 : s.kind === 'ellipse' ? s.h * 0.72 : s.h, max)))
    for (const s of list) s.fontSize = size
  }
  const main = out.filter((s) => s.text && s.vAlign === 'middle')
  fit(main, 18)
  fit(out.filter((s) => s.text && s.vAlign === 'top'), 14)
  return out
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** SVG picture of the diagram. */
export function diagramSvg(d: DiagramData, w: number, h: number) {
  const parts: string[] = []
  let id = 0
  for (const s of diagramShapes(d, w, h)) {
    if (s.kind === 'line' || s.kind === 'arrowLine') {
      const [x1, x2] = s.flip?.includes('h') ? [s.x + s.w, s.x] : [s.x, s.x + s.w]
      const [y1, y2] = s.flip?.includes('v') ? [s.y + s.h, s.y] : [s.y, s.y + s.h]
      const m = s.kind === 'arrowLine' ? `dm${++id}` : ''
      if (m) parts.push(`<defs><marker id="${m}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${s.stroke}"/></marker></defs>`)
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s.stroke}" stroke-width="${s.strokeWidth * (4 / 3)}"${m ? ` marker-end="url(#${m})"` : ''}/>`)
      continue
    }
    const opacity = s.opacity != null && s.opacity < 1 ? ` opacity="${s.opacity}"` : ''
    if (s.points) {
      const shadow = s.shadow ? ' style="filter:drop-shadow(3px 3px 3px rgba(0,0,0,.4))"' : ''
      parts.push(`<polygon points="${s.points.map(([px, py]) => `${s.x + px},${s.y + py}`).join(' ')}" fill="${s.fill ?? 'none'}" stroke="${s.stroke ?? 'none'}" stroke-width="${s.strokeWidth * (4 / 3)}"${opacity}${shadow}/>`)
    } else {
      const inner = shapeSvg({ kind: s.kind, fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth, dash: 'solid', gradient: s.gradient, shadow: s.shadow }, Math.max(1, s.w), Math.max(1, s.h))
      parts.push(`<g transform="translate(${s.x} ${s.y})"${opacity}>${inner}</g>`)
    }
    if (s.text) {
      const inset = s.kind === 'ellipse' ? 0.14 : s.points ? 0.2 : 0.04
      const top = s.points && s.item >= 0 && s.kind === 'triangle' ? s.h * 0.35 : 0
      const style = `width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:${s.vAlign === 'top' ? 'flex-start' : 'center'};text-align:${s.textAlign};padding:${s.vAlign === 'top' ? 4 : 2}px ${Math.max(4, s.w * inset)}px;padding-top:${top + (s.vAlign === 'top' ? 4 : 2)}px;color:${s.textColor};font:${s.fontSize}pt/1.15 Calibri,Carlito,Arial,sans-serif;white-space:pre-line;overflow:hidden;word-break:break-word`
      parts.push(`<foreignObject x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"><div xmlns="http://www.w3.org/1999/xhtml" style="${style}">${esc(s.text)}</div></foreignObject>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible">${parts.join('')}</svg>`
}

/** The outline in the text pane: one item per line, indented with tabs by level. */
export const itemsToText = (items: DiagramItem[]) => items.map((i) => `${'\t'.repeat(i.level)}${i.text}`).join('\n')

export function textToItems(text: string): DiagramItem[] {
  const items: DiagramItem[] = []
  for (const raw of text.split('\n')) {
    const m = raw.match(/^([\t ]*)(.*)$/)!
    const indent = m[1].replace(/ {2}/g, '\t').replace(/ /g, '').length
    const level = Math.min(indent, items.length ? items[items.length - 1].level + 1 : 0)
    items.push({ text: m[2], level })
  }
  return items.length ? items : [{ text: '', level: 0 }]
}

/** Outline edits from the Create Graphic group, for the item at `index`. */
export function editItems(items: DiagramItem[], index: number, action: 'after' | 'before' | 'above' | 'below' | 'promote' | 'demote' | 'up' | 'down' | 'delete'): { items: DiagramItem[]; index: number } {
  const list = items.map((i) => ({ ...i }))
  const i = clamp(index, 0, list.length - 1)
  const cur = list[i] ?? { text: '', level: 0 }
  // The item and the items indented under it move together.
  const end = (k: number) => {
    let e = k + 1
    while (e < list.length && list[e].level > list[k].level) e++
    return e
  }
  switch (action) {
    case 'after': {
      const at = end(i)
      list.splice(at, 0, { text: '', level: cur.level })
      return { items: list, index: at }
    }
    case 'before':
      list.splice(i, 0, { text: '', level: cur.level })
      return { items: list, index: i }
    case 'above': {
      // A new parent: the item and everything under it move one level down.
      const e = end(i)
      list.splice(i, 0, { text: '', level: cur.level })
      for (let k = i + 1; k <= e; k++) list[k].level++
      return { items: list, index: i }
    }
    case 'below':
      list.splice(i + 1, 0, { text: '', level: cur.level + 1 })
      return { items: list, index: i + 1 }
    case 'promote':
      if (cur.level > 0) for (let k = i; k < end(i); k++) list[k].level--
      return { items: list, index: i }
    case 'demote':
      if (i > 0 && cur.level <= list[i - 1].level) for (let k = i, e = end(i); k < e; k++) list[k].level++
      return { items: list, index: i }
    case 'up': {
      let p = i - 1
      while (p >= 0 && list[p].level > cur.level) p--
      if (p < 0 || list[p].level !== cur.level) return { items: list, index: i }
      const block = list.splice(i, end(i) - i)
      list.splice(p, 0, ...block)
      return { items: list, index: p }
    }
    case 'down': {
      const e = end(i)
      if (e >= list.length || list[e].level !== cur.level) return { items: list, index: i }
      const nextEnd = end(e)
      const block = list.splice(i, e - i)
      list.splice(nextEnd - block.length, 0, ...block)
      return { items: list, index: nextEnd - block.length }
    }
    case 'delete': {
      if (list.length <= 1) return { items: [{ text: '', level: 0 }], index: 0 }
      list.splice(i, 1)
      for (let k = i; k < list.length && k > 0 && list[k].level > list[k - 1].level + 1; k++) list[k].level--
      if (list[0]) list[0].level = 0
      return { items: list, index: Math.min(i, list.length - 1) }
    }
  }
}

/** Shape node attributes for one diagram shape (Convert to Shapes, .docx groups). */
export function shapeAttrsOf(s: DShape): Record<string, unknown> {
  return {
    kind: s.kind,
    width: Math.max(1, Math.round(s.w)),
    height: Math.max(1, Math.round(s.h)),
    fill: s.fill,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    dash: 'solid',
    text: s.text,
    textColor: s.textColor,
    fontSize: s.fontSize,
    textAlign: s.textAlign,
    vAlign: s.vAlign,
    gradient: !!s.gradient,
    shadow: !!s.shadow,
    ...(s.flip ? { flip: s.flip } : {}),
    ...(s.slant != null ? { adjustments: { slant: s.slant } } : {}),
  }
}

export const DEFAULT_DIAGRAM = newDiagram('blockList')

/** Namespace of the custom XML part that keeps diagram outlines in .docx files. */
export const DIAGRAM_NS = 'urn:kontor:diagrams'

const renderDiagram: DrawingRenderer = (node, box, { width, height }) => {
  box.className = 'drawing-box diagram-box'
  box.innerHTML = diagramSvg(node.attrs.data as DiagramData, width, height)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagram: {
      insertDiagram: (layout: DiagramLayout) => ReturnType
    }
  }
}

export const Diagram = Node.create<{ onEdit: ((pos: number) => void) | null }>({
  name: 'diagram',
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
      ...drawingAttributes({ width: 576, height: 320, wrap: 'inline' }),
      data: {
        default: DEFAULT_DIAGRAM,
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-diagram') ?? '') as DiagramData
          } catch {
            return DEFAULT_DIAGRAM
          }
        },
        renderHTML: (a) => ({ 'data-diagram': JSON.stringify(a.data) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="diagram"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const w = node.attrs.width ?? 576
    const h = node.attrs.height ?? 320
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram', class: 'drawing diagram-static', style: `${wrapStyle(node.attrs)}; display: inline-block; width: ${w}px; height: ${h}px; background: url("data:image/svg+xml,${encodeURIComponent(diagramSvg(node.attrs.data, w, h))}") no-repeat` })]
  },

  addNodeView() {
    return ({ node, view, getPos }) =>
      new DrawingView(node, view, getPos as () => number | undefined, renderDiagram, {
        className: 'diagram',
        onDoubleClick: (_n, _v, gp) => {
          const pos = gp()
          if (pos != null) this.options.onEdit?.(pos)
        },
      })
  },

  addCommands() {
    return {
      insertDiagram:
        (layout) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { data: newDiagram(layout) } }),
    }
  },
})

/** The text pane's current line: the item that Add Shape, Promote, Move Up … act on. */
export const diagramCursor = { index: 0 }

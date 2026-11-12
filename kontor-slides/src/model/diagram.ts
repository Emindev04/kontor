// Diagrams: an outline of text nodes laid out as shapes (lists, processes, cycles, hierarchies …).
// The shapes are generated on the fly from the outline, so editing the text re-lays out the graphic.
import type { ColorRef, DiagramElement, DiagramLayout, DiagramNode, Effects, Line, Para, ShapeElement } from './types'
import { DEFAULT_INSET } from './factory'
import { tx } from '../i18n'

export type DiagramCategory = 'List' | 'Process' | 'Cycle' | 'Hierarchy' | 'Relationship' | 'Matrix' | 'Pyramid'

export const DIAGRAM_LAYOUTS: { id: DiagramLayout; label: string; category: DiagramCategory; description: string }[] = [
  { id: 'basicList', label: tx('Basic Block List'), category: 'List', description: tx('Shows non-sequential or grouped blocks of information.') },
  { id: 'verticalList', label: tx('Vertical Bullet List'), category: 'List', description: tx('Shows blocks of text with bullet points below each heading.') },
  { id: 'process', label: tx('Basic Process'), category: 'Process', description: tx('Shows a progression or sequential steps in a task, process or workflow.') },
  { id: 'chevron', label: tx('Basic Chevron Process'), category: 'Process', description: tx('Shows a progression, a timeline or sequential steps.') },
  { id: 'stepUp', label: tx('Step Up Process'), category: 'Process', description: tx('Shows steps that build on each other, from low to high.') },
  { id: 'cycle', label: tx('Basic Cycle'), category: 'Cycle', description: tx('Shows a continuing sequence of stages in a circular flow.') },
  { id: 'radial', label: tx('Basic Radial'), category: 'Cycle', description: tx('Shows the relationship to a central idea.') },
  { id: 'hierarchy', label: tx('Organization Chart'), category: 'Hierarchy', description: tx('Shows hierarchical information or reporting relationships.') },
  { id: 'venn', label: tx('Basic Venn'), category: 'Relationship', description: tx('Shows overlapping or interconnected relationships.') },
  { id: 'target', label: tx('Basic Target'), category: 'Relationship', description: tx('Shows containment, gradations or hierarchical relationships.') },
  { id: 'matrix', label: tx('Basic Matrix'), category: 'Matrix', description: tx('Shows the relationship of components to a whole in quadrants.') },
  { id: 'pyramid', label: tx('Basic Pyramid'), category: 'Pyramid', description: tx('Shows proportional, interconnected or hierarchical relationships.') },
]

export const DIAGRAM_COLORS: { id: string; label: string; n?: number }[] = [
  { id: 'primary', label: tx('Primary Theme Colors') },
  { id: 'colorful', label: tx('Colorful – Accent Colors') },
  { id: 'colorful2', label: tx('Colorful Range – Accent Colors 2 to 3') },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `accent${n}`, label: tx('Colored Fill – Accent {n}'), n })),
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `range${n}`, label: tx('Gradient Range – Accent {n}'), n })),
  { id: 'outline', label: tx('Colored Outline – Accent 1') },
  { id: 'dark', label: tx('Dark Fill') },
]

export const DIAGRAM_STYLES: { id: string; label: string }[] = [
  { id: 'flat', label: tx('Simple Fill') },
  { id: 'white', label: tx('White Outline') },
  { id: 'subtle', label: tx('Subtle Effect') },
  { id: 'moderate', label: tx('Moderate Effect') },
  { id: 'intense', label: tx('Intense Effect') },
  { id: 'polished', label: tx('Polished') },
]

let nid = 0
export function nodeId() {
  nid = (nid + 1) % 1e6
  return `n${Date.now().toString(36)}${nid.toString(36)}`
}

export function defaultNodes(layout: DiagramLayout): DiagramNode[] {
  const t = (text = '') => ({ id: nodeId(), text, level: 0 })
  const c = (text = '', level = 1) => ({ id: nodeId(), text, level })
  switch (layout) {
    case 'hierarchy':
      return [t(), c(), c(), c()]
    case 'verticalList':
      return [t(), c(), c(), t(), c(), c()]
    case 'venn':
    case 'cycle':
    case 'target':
      return [t(), t(), t()]
    case 'matrix':
      return [t(), t(), t(), t()]
    case 'radial':
      return [t(), c(), c(), c(), c()]
    case 'pyramid':
      return [t(), t(), t()]
    case 'basicList':
      return [t(), t(), t(), t(), t()]
    default:
      return [t(), t(), t()]
  }
}

export function createDiagram(layout: DiagramLayout, box: { x: number; y: number; w: number; h: number }, id: string, name: string): DiagramElement {
  return { id, type: 'diagram', name, ...box, rot: 0, layout, nodes: defaultNodes(layout), colors: 'primary', style: 'flat' }
}

// ---------- Outline helpers ----------

export type OutlineItem = { node: DiagramNode; children: DiagramNode[] }

/** Top-level items with their sub-points (any deeper level). */
export function topLevel(nodes: DiagramNode[]): OutlineItem[] {
  const out: OutlineItem[] = []
  for (const n of nodes) {
    if (n.level <= 0 || !out.length) out.push({ node: { ...n, level: 0 }, children: [] })
    else out[out.length - 1].children.push(n)
  }
  return out
}

type TreeNode = { node: DiagramNode; children: TreeNode[] }

export function tree(nodes: DiagramNode[]): TreeNode[] {
  const roots: TreeNode[] = []
  const stack: TreeNode[] = []
  for (const n of nodes) {
    const t: TreeNode = { node: n, children: [] }
    while (stack.length && stack[stack.length - 1].node.level >= n.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(t)
    else roots.push(t)
    stack.push(t)
  }
  return roots
}

// ---------- Colors and styles ----------

const ACC = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']

function nodeFill(d: DiagramElement, i: number, n: number): { fill: ColorRef; text: ColorRef; line?: ColorRef } {
  const c = d.colors
  if (c === 'colorful') return { fill: `theme:${ACC[(i + 1) % 6]}`, text: 'theme:bg1' }
  if (c === 'colorful2') return { fill: `theme:${ACC[1 + (i % 2)]}`, text: 'theme:bg1' }
  if (c === 'outline') return { fill: 'theme:bg1', text: 'theme:tx1', line: 'theme:accent1' }
  if (c === 'dark') return { fill: 'theme:tx1:l25', text: 'theme:bg1' }
  const acc = /^accent(\d)$/.exec(c)
  if (acc) return { fill: `theme:accent${acc[1]}`, text: 'theme:bg1' }
  const range = /^range(\d)$/.exec(c)
  if (range) {
    const t = n <= 1 ? 0 : i / (n - 1)
    const amount = Math.round(t * 60)
    return { fill: amount ? `theme:accent${range[1]}:l${amount}` : `theme:accent${range[1]}`, text: amount > 45 ? 'theme:tx1' : 'theme:bg1' }
  }
  return { fill: 'theme:accent1', text: 'theme:bg1' }
}

function styleLook(d: DiagramElement, base: ReturnType<typeof nodeFill>): { line: Line; effects?: Effects } {
  const st = d.style
  const outline: Line = base.line ? { color: base.line, width: 2, dash: 'solid' } : null
  switch (st) {
    case 'white':
      return { line: outline ?? { color: 'theme:bg1', width: 2, dash: 'solid' } }
    case 'subtle':
      return { line: outline ?? { color: 'theme:bg1', width: 1, dash: 'solid' }, effects: { shadow: { color: '#000000', alpha: 0.25, blur: 3, dist: 2, angle: 90 } } }
    case 'moderate':
      return { line: outline, effects: { shadow: { color: '#000000', alpha: 0.4, blur: 5, dist: 3, angle: 90 } } }
    case 'intense':
      return { line: outline ?? { color: 'theme:bg1', width: 2.5, dash: 'solid' }, effects: { shadow: { color: '#000000', alpha: 0.5, blur: 8, dist: 4, angle: 90 } } }
    case 'polished':
      return { line: outline, effects: { shadow: { color: '#000000', alpha: 0.35, blur: 4, dist: 2, angle: 90 }, reflection: true } }
    default:
      return { line: outline ?? { color: 'theme:bg1', width: 1, dash: 'solid' } }
  }
}

// ---------- Layout ----------

const PT = 96 / 72

function fitSize(items: { text: string[]; w: number; h: number }[], max = 65) {
  let size = max
  for (const it of items) {
    const inner = Math.max(10, it.w - 20)
    const innerH = Math.max(10, it.h - 12)
    let s = max
    while (s > 8) {
      const cpl = Math.max(1, Math.floor(inner / (s * PT * 0.52)))
      const lines = it.text.reduce((a, t) => a + Math.max(1, Math.ceil((t.length || 1) / cpl)) * (t.startsWith('•') ? 0.85 : 1), 0)
      const longest = Math.max(0, ...it.text.flatMap((t) => t.split(/\s+/)).map((w) => w.length))
      if (lines * s * PT * 1.2 <= innerH && longest * s * PT * 0.52 <= inner) break
      s -= 1
    }
    size = Math.min(size, s)
  }
  return Math.max(8, size)
}

type Box = { x: number; y: number; w: number; h: number }

let shapeSeq = 0

function shape(d: DiagramElement, prst: string, b: Box, index: number, count: number, paras: { text: string; bullet?: boolean }[] | null, size: number, extra: Partial<ShapeElement> = {}): ShapeElement {
  const look = nodeFill(d, index, count)
  const st = styleLook(d, look)
  const content: Para[] = (paras ?? []).map((p) => ({
    type: 'paragraph',
    attrs: { align: p.bullet ? 'left' : 'center', bullet: p.bullet ? '•' : 'none', level: p.bullet ? 1 : 0 },
    content: p.text ? [{ type: 'text', text: p.text, marks: [{ type: 'textStyle', attrs: { fontSize: p.bullet ? Math.max(8, Math.round(size * 0.78)) : size, color: look.text } }] }] : undefined,
  }))
  return {
    id: `${d.id}-s${shapeSeq++ % 100000}`,
    type: 'shape',
    name: 'Diagram Shape',
    prst,
    ...b,
    rot: 0,
    fill: { type: 'solid', color: look.fill, alpha: d.layout === 'venn' ? 0.5 : undefined },
    line: st.line,
    effects: st.effects,
    text: paras ? { doc: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }, anchor: 'middle', autofit: 'none', wrap: true, inset: [...DEFAULT_INSET] } : undefined,
    ...extra,
  }
}

function arrowShape(d: DiagramElement, prst: string, b: Box, rot = 0): ShapeElement {
  return { id: `${d.id}-a${shapeSeq++ % 100000}`, type: 'shape', name: 'Arrow', prst, ...b, rot, fill: { type: 'solid', color: 'theme:accent1:l40' }, line: null }
}

function connector(d: DiagramElement, x1: number, y1: number, x2: number, y2: number): ShapeElement {
  return { id: `${d.id}-c${shapeSeq++ % 100000}`, type: 'shape', name: 'Connector', prst: 'line', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), rot: 0, flipH: x2 < x1 !== y2 < y1 ? true : undefined, fill: { type: 'none' }, line: { color: 'theme:accent1:d25', width: 1.5, dash: 'solid' } }
}

const label = (n: DiagramNode) => n.text

/** Generates the shapes of a diagram in diagram-local coordinates. */
export function diagramShapes(d: DiagramElement): ShapeElement[] {
  shapeSeq = 0
  const W = d.w
  const H = d.h
  const items = topLevel(d.nodes)
  const n = Math.max(1, items.length)
  const out: ShapeElement[] = []
  const textLines = (it: OutlineItem) => [label(it.node), ...it.children.map((c) => `\u2022 ${c.text}`)]
  const toParas = (it: OutlineItem): { text: string; bullet?: boolean }[] => [{ text: label(it.node) }, ...it.children.map((c) => ({ text: c.text, bullet: true }))]

  switch (d.layout) {
    case 'basicList': {
      const cols = n <= 3 ? n : n === 4 ? 2 : Math.ceil(Math.sqrt(n * (W / Math.max(1, H))))
      const rows = Math.ceil(n / cols)
      const gapX = (W / cols) * 0.1
      const bw = (W - gapX * (cols - 1)) / cols
      const bh = Math.min(bw * 0.6, (H - gapX * (rows - 1)) / rows)
      const top = (H - (bh * rows + gapX * (rows - 1))) / 2
      const boxes = items.map((_, i) => {
        const r = Math.floor(i / cols)
        const inRow = Math.min(cols, n - r * cols)
        const left = (W - (bw * inRow + gapX * (inRow - 1))) / 2
        return { x: left + (i % cols) * (bw + gapX), y: top + r * (bh + gapX), w: bw, h: bh }
      })
      const size = fitSize(items.map((it, i) => ({ text: textLines(it), ...boxes[i] })))
      items.forEach((it, i) => out.push(shape(d, 'rect', boxes[i], i, n, toParas(it), size)))
      break
    }
    case 'verticalList': {
      const gap = 8
      const unit = (H - gap * (n - 1)) / Math.max(1, items.reduce((a, it) => a + 1 + it.children.length * 0.55, 0))
      let y = 0
      const boxes = items.map((it) => {
        const head = { x: 0, y, w: W, h: unit }
        const body = { x: W * 0.04, y: y + unit, w: W * 0.96, h: unit * 0.55 * it.children.length }
        y += unit + body.h + gap
        return { head, body }
      })
      const size = fitSize(items.map((it, i) => ({ text: [label(it.node)], ...boxes[i].head })), 40)
      items.forEach((it, i) => {
        out.push(shape(d, 'roundRect', boxes[i].head, i, n, [{ text: label(it.node) }], size))
        if (it.children.length) {
          const body = shape(d, 'rect', boxes[i].body, i, n, it.children.map((c) => ({ text: c.text, bullet: true })), Math.round(size * 0.9 / 0.78), { fill: { type: 'solid', color: nodeFill(d, i, n).fill, alpha: 0.2 }, line: null })
          body.text!.doc.content.forEach((p) => p.content?.forEach((r) => r.type === 'text' && r.marks?.forEach((m) => m.type === 'textStyle' && (m.attrs.color = 'theme:tx1'))))
          body.text!.anchor = 'top'
          out.push(body)
        }
      })
      break
    }
    case 'process':
    case 'chevron': {
      const chevron = d.layout === 'chevron'
      const arrowW = chevron ? 0 : (W / n) * 0.22
      const gap = chevron ? -(W / n) * 0.08 : (W / n) * 0.06
      const bw = chevron ? (W - gap * (n - 1)) / n : (W - (arrowW + gap * 2) * (n - 1)) / n
      const bh = Math.min(H, chevron ? bw * 0.4 : bw * 0.6)
      const y = (H - bh) / 2
      const boxes = items.map((_, i) => ({ x: i * (bw + (chevron ? gap : arrowW + gap * 2)), y, w: bw, h: bh }))
      const size = fitSize(items.map((it, i) => ({ text: textLines(it), ...boxes[i], w: boxes[i].w * (chevron ? 0.6 : 1) })))
      items.forEach((it, i) => {
        out.push(shape(d, chevron ? 'chevron' : 'roundRect', boxes[i], i, n, toParas(it), size))
        if (!chevron && i < n - 1) out.push(arrowShape(d, 'rightArrow', { x: boxes[i].x + bw + gap, y: H / 2 - arrowW * 0.6, w: arrowW, h: arrowW * 1.2 }))
      })
      break
    }
    case 'stepUp': {
      const bw = W / n
      const boxes = items.map((_, i) => {
        const h = (H * (i + 1)) / n
        return { x: i * bw, y: H - h, w: bw * 0.92, h }
      })
      const size = fitSize(items.map((it, i) => ({ text: textLines(it), ...boxes[i], h: Math.min(boxes[i].h, H / n) })))
      items.forEach((it, i) => {
        const s = shape(d, 'rect', boxes[i], i, n, toParas(it), size)
        s.text!.anchor = 'top'
        out.push(s)
      })
      break
    }
    case 'cycle': {
      const R = Math.min(W, H) / 2
      const r = Math.min(R * 0.36, (Math.PI * R) / Math.max(n, 2) / 1.1)
      const orbit = R - r
      const cx = W / 2
      const cy = H / 2
      const pos = items.map((_, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2
        return { x: cx + Math.cos(a) * orbit, y: cy + Math.sin(a) * orbit, a }
      })
      const size = fitSize(items.map((it) => ({ text: textLines(it), w: r * 1.5, h: r * 1.5 })))
      items.forEach((it, i) => {
        out.push(shape(d, 'ellipse', { x: pos[i].x - r, y: pos[i].y - r, w: r * 2, h: r * 2 }, i, n, toParas(it), size))
        const mid = pos[i].a + Math.PI / n
        const aw = r * 0.55
        out.push(arrowShape(d, 'rightArrow', { x: cx + Math.cos(mid) * orbit - aw / 2, y: cy + Math.sin(mid) * orbit - aw * 0.35, w: aw, h: aw * 0.7 }, ((mid + Math.PI / 2) * 180) / Math.PI))
      })
      break
    }
    case 'radial': {
      const center = items[0]
      const others = d.nodes.slice(1).filter((x) => x.level > 0)
      const cx = W / 2
      const cy = H / 2
      const R = Math.min(W, H) / 2
      const m = Math.max(1, others.length)
      const r = Math.min(R * 0.3, (Math.PI * R) / Math.max(m, 2) / 1.6)
      const cr = Math.min(R * 0.36, r * 1.4)
      const orbit = R - r
      const size = fitSize([{ text: [label(center?.node ?? { id: '', text: '', level: 0 })], w: cr * 1.5, h: cr * 1.5 }, ...others.map((o) => ({ text: [o.text], w: r * 1.5, h: r * 1.5 }))])
      others.forEach((o, i) => {
        const a = -Math.PI / 2 + (i / m) * Math.PI * 2
        const x = cx + Math.cos(a) * orbit
        const y = cy + Math.sin(a) * orbit
        out.push(connector(d, cx + Math.cos(a) * cr, cy + Math.sin(a) * cr, x - Math.cos(a) * r, y - Math.sin(a) * r))
        out.push(shape(d, 'ellipse', { x: x - r, y: y - r, w: r * 2, h: r * 2 }, i + 1, m + 1, [{ text: o.text }], size))
      })
      out.push(shape(d, 'ellipse', { x: cx - cr, y: cy - cr, w: cr * 2, h: cr * 2 }, 0, m + 1, [{ text: center ? label(center.node) : '' }], size))
      break
    }
    case 'hierarchy': {
      const roots = tree(d.nodes)
      const depth = (t: TreeNode): number => 1 + Math.max(0, ...t.children.map(depth))
      const leaves = (t: TreeNode): number => (t.children.length ? t.children.reduce((a, c) => a + leaves(c), 0) : 1)
      const levels = Math.max(1, ...roots.map(depth))
      const totalLeaves = Math.max(1, roots.reduce((a, r) => a + leaves(r), 0))
      const colW = W / totalLeaves
      const rowH = H / levels
      const bw = Math.min(colW * 0.86, rowH * 2.2)
      const bh = Math.min(rowH * 0.62, bw * 0.62)
      const boxes: { t: TreeNode; b: Box; parent?: Box }[] = []
      const place = (t: TreeNode, lvl: number, start: number, parent?: Box) => {
        const span = leaves(t)
        const cxp = (start + span / 2) * colW
        const b = { x: cxp - bw / 2, y: lvl * rowH + (rowH - bh) / 2, w: bw, h: bh }
        boxes.push({ t, b, parent })
        let s = start
        for (const c of t.children) {
          place(c, lvl + 1, s, b)
          s += leaves(c)
        }
      }
      let start = 0
      for (const r of roots) {
        place(r, 0, start)
        start += leaves(r)
      }
      const size = fitSize(boxes.map((x) => ({ text: [x.t.node.text], ...x.b })), 40)
      for (const x of boxes) {
        if (!x.parent) continue
        const midY = x.parent.y + x.parent.h + (x.b.y - x.parent.y - x.parent.h) / 2
        const px = x.parent.x + x.parent.w / 2
        const cxb = x.b.x + x.b.w / 2
        out.push(connector(d, px, x.parent.y + x.parent.h, px, midY))
        out.push(connector(d, Math.min(px, cxb), midY, Math.max(px, cxb), midY))
        out.push(connector(d, cxb, midY, cxb, x.b.y))
      }
      boxes.forEach((x, i) => out.push(shape(d, 'rect', x.b, Math.min(x.t.node.level, 5), 6, [{ text: x.t.node.text }], size)))
      break
    }
    case 'venn': {
      const R = Math.min(W, H)
      const r = n === 1 ? R / 2 : n === 2 ? Math.min(W / 3.2, H / 2) : R * 0.3
      const cx = W / 2
      const cy = H / 2
      const orbit = n === 1 ? 0 : r * 0.62
      const size = fitSize(items.map((it) => ({ text: textLines(it), w: r * 1.2, h: r * 0.9 })))
      items.forEach((it, i) => {
        const a = n === 2 ? (i === 0 ? Math.PI : 0) : -Math.PI / 2 + (i / n) * Math.PI * 2
        const x = cx + Math.cos(a) * orbit
        const y = cy + Math.sin(a) * orbit
        out.push(shape(d, 'ellipse', { x: x - r, y: y - r, w: r * 2, h: r * 2 }, i, n, toParas(it), size))
      })
      break
    }
    case 'target': {
      const R = Math.min(W, H) / 2
      const cx = H < W ? R : W / 2
      const cy = H / 2
      const size = fitSize(items.map(() => ({ text: ['M'], w: R / n, h: R / n })), 28)
      items.forEach((_, i) => {
        const r = R * (1 - i / n)
        out.push(shape(d, 'ellipse', { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, i, n, null, size))
      })
      // Labels to the right of the rings.
      const lx = cx + R + 12
      items.forEach((it, i) => {
        const ly = cy - R + (R * (i + 0.5)) / n - 14
        const s = shape(d, 'rect', { x: lx, y: ly, w: Math.max(40, W - lx), h: 28 }, i, n, [{ text: label(it.node) }], size, { fill: { type: 'none' }, line: null, effects: undefined })
        s.text!.doc.content.forEach((p) => {
          p.attrs = { ...p.attrs, align: 'left' }
          p.content?.forEach((r) => r.type === 'text' && r.marks?.forEach((m) => m.type === 'textStyle' && (m.attrs.color = 'theme:tx1')))
        })
        out.push(s)
        out.push(connector(d, cx, ly + 14, lx, ly + 14))
      })
      break
    }
    case 'matrix': {
      const S = Math.min(W, H)
      const x0 = (W - S) / 2
      const q = S / 2 - 4
      const four = items.slice(0, 4)
      const size = fitSize(four.map((it) => ({ text: textLines(it), w: q, h: q })))
      four.forEach((it, i) => out.push(shape(d, 'roundRect', { x: x0 + (i % 2) * (q + 8), y: Math.floor(i / 2) * (q + 8) + (H - S) / 2, w: q, h: q }, i, 4, toParas(it), size)))
      break
    }
    case 'pyramid': {
      const S = Math.min(W, H * 1.15)
      const x0 = (W - S) / 2
      const sh = H / n
      const size = fitSize(items.map((it, i) => ({ text: [label(it.node)], w: (S * (i + 0.5)) / n, h: sh })))
      items.forEach((it, i) => {
        const bw = (S * (i + 1)) / n
        const b = { x: x0 + (S - bw) / 2, y: i * sh, w: bw, h: sh - 2 }
        if (i === 0) out.push(shape(d, 'triangle', b, i, n, [{ text: label(it.node) }], size))
        else {
          const inset = S / n / 2
          out.push(shape(d, 'trapezoid', b, i, n, [{ text: label(it.node) }], size, { adj: [(inset / Math.min(b.w, b.h)) * 100000] }))
        }
      })
      break
    }
  }
  return out
}

// ---------- Outline editing ----------

export function addNode(nodes: DiagramNode[], afterId: string | null, where: 'after' | 'before' | 'above' | 'below'): { nodes: DiagramNode[]; id: string } {
  const i = afterId ? nodes.findIndex((n) => n.id === afterId) : nodes.length - 1
  const cur = nodes[i]
  const id = nodeId()
  if (!cur) return { nodes: [...nodes, { id, text: '', level: 0 }], id }
  let end = i + 1
  while (end < nodes.length && nodes[end].level > cur.level) end++
  if (where === 'after') return { nodes: [...nodes.slice(0, end), { id, text: '', level: cur.level }, ...nodes.slice(end)], id }
  if (where === 'before') return { nodes: [...nodes.slice(0, i), { id, text: '', level: cur.level }, ...nodes.slice(i)], id }
  if (where === 'below') return { nodes: [...nodes.slice(0, end), { id, text: '', level: cur.level + 1 }, ...nodes.slice(end)], id }
  // Above: a new parent at the current level; the node and its subtree move one level down.
  const moved = nodes.slice(i, end).map((n) => ({ ...n, level: n.level + 1 }))
  return { nodes: [...nodes.slice(0, i), { id, text: '', level: cur.level }, ...moved, ...nodes.slice(end)], id }
}

export function changeNodeLevel(nodes: DiagramNode[], id: string, delta: number): DiagramNode[] {
  const i = nodes.findIndex((n) => n.id === id)
  if (i < 0) return nodes
  const cur = nodes[i]
  const prev = nodes[i - 1]
  const next = Math.max(0, Math.min((prev?.level ?? -1) + 1, cur.level + delta))
  if (next === cur.level) return nodes
  let end = i + 1
  while (end < nodes.length && nodes[end].level > cur.level) end++
  const d = next - cur.level
  return nodes.map((n, j) => (j >= i && j < end ? { ...n, level: Math.max(0, n.level + d) } : n))
}

export function moveNode(nodes: DiagramNode[], id: string, dir: -1 | 1): DiagramNode[] {
  const i = nodes.findIndex((n) => n.id === id)
  if (i < 0) return nodes
  const level = nodes[i].level
  let end = i + 1
  while (end < nodes.length && nodes[end].level > level) end++
  const block = nodes.slice(i, end)
  const rest = [...nodes.slice(0, i), ...nodes.slice(end)]
  if (dir < 0) {
    let j = i - 1
    while (j >= 0 && nodes[j].level > level) j--
    if (j < 0 || nodes[j].level < level) return nodes
    return [...rest.slice(0, j), ...block, ...rest.slice(j)]
  }
  if (end >= nodes.length || nodes[end].level < level) return nodes
  let k = end + 1
  while (k < nodes.length && nodes[k].level > level) k++
  const at = k - block.length
  return [...rest.slice(0, at), ...block, ...rest.slice(at)]
}

/** Text of a bullet list converted to diagram nodes (Convert to SmartArt). */
export function nodesFromParagraphs(paras: { text: string; level: number }[]): DiagramNode[] {
  return paras.filter((p) => p.text.trim()).map((p) => ({ id: nodeId(), text: p.text.trim(), level: p.level }))
}

/** The diagram as a plain group of shapes (Convert to Shapes, and the .pptx export). */
export function diagramToGroup(d: DiagramElement): import('./types').GroupElement {
  const children = diagramShapes(d).map((s, i) => ({ ...s, id: `${d.id}-g${i}`, name: `${s.name} ${i + 1}` }))
  return { id: d.id, type: 'group', name: d.name, x: d.x, y: d.y, w: d.w, h: d.h, rot: d.rot, children, anim: d.anim, alt: d.alt, link: d.link }
}

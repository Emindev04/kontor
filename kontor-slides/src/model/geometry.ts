import type { GroupElement, SlideElement } from './types'
import { LINE_SHAPES } from './shapes'

export type Box = { x: number; y: number; w: number; h: number }
export type Pt = { x: number; y: number }
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const HANDLE_DIR: Record<Handle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
}

const rad = (deg: number) => (deg * Math.PI) / 180

export function rotate(p: Pt, c: Pt, deg: number): Pt {
  const a = rad(deg)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) }
}

export function center(b: Box): Pt {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

export function corners(el: Box & { rot?: number }): Pt[] {
  const c = center(el)
  return [
    { x: el.x, y: el.y },
    { x: el.x + el.w, y: el.y },
    { x: el.x + el.w, y: el.y + el.h },
    { x: el.x, y: el.y + el.h },
  ].map((p) => rotate(p, c, el.rot ?? 0))
}

/** Axis-aligned bounds of a (possibly rotated) element. */
export function bounds(el: Box & { rot?: number }): Box {
  if (!el.rot) return { x: el.x, y: el.y, w: el.w, h: el.h }
  const pts = corners(el)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function union(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 }
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const r = Math.max(...boxes.map((b) => b.x + b.w))
  const btm = Math.max(...boxes.map((b) => b.y + b.h))
  return { x, y, w: r - x, h: btm - y }
}

export function contains(outer: Box, inner: Box) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

export function intersects(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// ---------- Resizing ----------

/** New frame after dragging handle `h` of a (possibly rotated) element to point `p`. */
export function resizeTo(el: Box & { rot: number }, h: Handle, p: Pt, opts: { keepRatio: boolean; fromCenter: boolean }): Box {
  const [hx, hy] = HANDLE_DIR[h]
  const c = center(el)
  const a = rad(el.rot)
  const ux = { x: Math.cos(a), y: Math.sin(a) }
  const uy = { x: -Math.sin(a), y: Math.cos(a) }
  const anchorLocal = opts.fromCenter ? { x: 0, y: 0 } : { x: (-hx * el.w) / 2, y: (-hy * el.h) / 2 }
  const anchor = { x: c.x + ux.x * anchorLocal.x + uy.x * anchorLocal.y, y: c.y + ux.y * anchorLocal.x + uy.y * anchorLocal.y }
  const d = { x: p.x - anchor.x, y: p.y - anchor.y }
  const lx = d.x * ux.x + d.y * ux.y
  const ly = d.x * uy.x + d.y * uy.y
  const k = opts.fromCenter ? 2 : 1
  let w = hx ? Math.max(1, lx * hx * k) : el.w
  let hh = hy ? Math.max(1, ly * hy * k) : el.h
  if (opts.keepRatio && el.w > 0 && el.h > 0) {
    if (hx && hy) {
      const s = Math.max(w / el.w, hh / el.h)
      w = el.w * s
      hh = el.h * s
    } else if (hx) hh = (el.h * w) / el.w
    else w = (el.w * hh) / el.h
  }
  return frameFrom(el, hx, hy, w, hh, opts.fromCenter)
}

/** Applies a new size to an element keeping the edge opposite to handle (hx, hy) fixed. */
export function frameFrom(el: Box & { rot: number }, hx: number, hy: number, w: number, h: number, fromCenter = false): Box {
  const c = center(el)
  if (fromCenter) return { x: c.x - w / 2, y: c.y - h / 2, w, h }
  const a = rad(el.rot)
  const ux = { x: Math.cos(a), y: Math.sin(a) }
  const uy = { x: -Math.sin(a), y: Math.cos(a) }
  const ax = (-hx * el.w) / 2
  const ay = (-hy * el.h) / 2
  const anchor = { x: c.x + ux.x * ax + uy.x * ay, y: c.y + ux.y * ax + uy.y * ay }
  const ox = hx ? (hx * w) / 2 : 0
  const oy = hy ? (hy * h) / 2 : 0
  const nc = { x: anchor.x + ux.x * ox + uy.x * oy, y: anchor.y + ux.y * ox + uy.y * oy }
  return { x: nc.x - w / 2, y: nc.y - h / 2, w, h }
}

// ---------- Lines ----------

export function isLineElement(el: SlideElement) {
  return el.type === 'shape' && LINE_SHAPES.has(el.prst)
}

export function lineEnds(el: Box & { rot: number; flipH?: boolean; flipV?: boolean }): [Pt, Pt] {
  const c = center(el)
  const start = { x: el.flipH ? el.x + el.w : el.x, y: el.flipV ? el.y + el.h : el.y }
  const end = { x: el.flipH ? el.x : el.x + el.w, y: el.flipV ? el.y : el.y + el.h }
  return [rotate(start, c, el.rot), rotate(end, c, el.rot)]
}

export function frameFromEnds(a: Pt, b: Pt) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), flipH: b.x < a.x, flipV: b.y < a.y, rot: 0 }
}

// ---------- Rotation ----------

export function angleTo(c: Pt, p: Pt) {
  const deg = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90
  return ((deg % 360) + 360) % 360
}

export function normAngle(deg: number) {
  return Math.round((((deg % 360) + 360) % 360) * 100) / 100
}

// ---------- Snapping ----------

export type Guide = { axis: 'x' | 'y'; pos: number; from: number; to: number }

export function snapBox(box: Box, targets: Box[], slide: { w: number; h: number }, threshold: number) {
  const xs = [box.x, box.x + box.w / 2, box.x + box.w]
  const ys = [box.y, box.y + box.h / 2, box.y + box.h]
  const lines: { axis: 'x' | 'y'; pos: number; span: [number, number] }[] = [
    { axis: 'x', pos: 0, span: [0, slide.h] },
    { axis: 'x', pos: slide.w / 2, span: [0, slide.h] },
    { axis: 'x', pos: slide.w, span: [0, slide.h] },
    { axis: 'y', pos: 0, span: [0, slide.w] },
    { axis: 'y', pos: slide.h / 2, span: [0, slide.w] },
    { axis: 'y', pos: slide.h, span: [0, slide.w] },
  ]
  for (const t of targets) {
    for (const x of [t.x, t.x + t.w / 2, t.x + t.w]) lines.push({ axis: 'x', pos: x, span: [t.y, t.y + t.h] })
    for (const y of [t.y, t.y + t.h / 2, t.y + t.h]) lines.push({ axis: 'y', pos: y, span: [t.x, t.x + t.w] })
  }
  let best = { x: { d: threshold + 1, line: null as null | (typeof lines)[number] }, y: { d: threshold + 1, line: null as null | (typeof lines)[number] } }
  for (const l of lines) {
    const own = l.axis === 'x' ? xs : ys
    for (const v of own) {
      const d = l.pos - v
      const slot = best[l.axis]
      if (Math.abs(d) < Math.abs(slot.d)) best = { ...best, [l.axis]: { d, line: l } }
    }
  }
  const dx = Math.abs(best.x.d) <= threshold ? best.x.d : 0
  const dy = Math.abs(best.y.d) <= threshold ? best.y.d : 0
  const moved = { ...box, x: box.x + dx, y: box.y + dy }
  const guides: Guide[] = []
  if (dx && best.x.line) guides.push({ axis: 'x', pos: best.x.line.pos, from: Math.min(best.x.line.span[0], moved.y), to: Math.max(best.x.line.span[1], moved.y + moved.h) })
  if (dy && best.y.line) guides.push({ axis: 'y', pos: best.y.line.pos, from: Math.min(best.y.line.span[0], moved.x), to: Math.max(best.y.line.span[1], moved.x + moved.w) })
  // Show guides for exact matches too (e.g. after snapping in a previous frame).
  if (!dx && best.x.line && Math.abs(best.x.d) < 0.01) guides.push({ axis: 'x', pos: best.x.line.pos, from: Math.min(best.x.line.span[0], moved.y), to: Math.max(best.x.line.span[1], moved.y + moved.h) })
  if (!dy && best.y.line && Math.abs(best.y.d) < 0.01) guides.push({ axis: 'y', pos: best.y.line.pos, from: Math.min(best.y.line.span[0], moved.x), to: Math.max(best.y.line.span[1], moved.x + moved.w) })
  return { dx, dy, guides }
}

// ---------- Groups ----------

export function makeGroup(els: SlideElement[], id: string, name: string): GroupElement {
  const box = union(els.map(bounds))
  return {
    id,
    type: 'group',
    name,
    ...box,
    rot: 0,
    children: els.map((e) => ({ ...e, x: e.x - box.x, y: e.y - box.y })),
  }
}

/** Children converted back to slide coordinates. */
export function ungroup(g: GroupElement): SlideElement[] {
  const gc = center(g)
  return g.children.map((child) => {
    const local = { x: g.x + child.x + child.w / 2, y: g.y + child.y + child.h / 2 }
    const c = rotate(local, gc, g.rot)
    return { ...child, x: c.x - child.w / 2, y: c.y - child.h / 2, rot: normAngle(child.rot + g.rot) } as SlideElement
  })
}

/** Scales a group's children to a new group size. */
export function scaleGroup(g: GroupElement, w: number, h: number): GroupElement {
  const sx = g.w ? w / g.w : 1
  const sy = g.h ? h / g.h : 1
  const scale = (e: SlideElement): SlideElement => {
    const next = { ...e, x: e.x * sx, y: e.y * sy, w: e.w * sx, h: e.h * sy } as SlideElement
    if (next.type === 'group') next.children = next.children.map((c) => ({ ...c, x: c.x * sx, y: c.y * sy, w: c.w * sx, h: c.h * sy }) as SlideElement)
    if (next.type === 'ink') next.points = next.points.map(([x, y]) => [x * sx, y * sy])
    if (next.type === 'table') {
      next.cols = next.cols.map((c) => c * sx)
      next.rows = next.rows.map((r) => ({ ...r, h: r.h * sy }))
    }
    return next
  }
  return { ...g, w, h, children: g.children.map(scale) }
}

/** All leaf elements in slide coordinates (used by export). */
export function flatten(elements: SlideElement[]): SlideElement[] {
  return elements.flatMap((e) => (e.type === 'group' ? flatten(ungroup(e)) : [e]))
}

/** Rescales ink points when an ink element is resized. */
export function scaleInk<T extends SlideElement>(el: T, box: Box): T {
  if (el.type !== 'ink' || !el.w || !el.h) return { ...el, ...box }
  const sx = box.w / el.w
  const sy = box.h / el.h
  return { ...el, ...box, points: el.points.map(([x, y]) => [x * sx, y * sy]) }
}

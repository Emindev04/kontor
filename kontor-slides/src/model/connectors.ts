// Connectors that stay glued to shapes: a line's start or end can be attached to one of four
// connection sites (top, right, bottom, left) of another object; when that object moves, resizes
// or rotates, the line follows.
import type { Presentation, ShapeElement, SlideElement } from './types'
import { center, frameFromEnds, isLineElement, lineEnds, rotate, type Pt } from './geometry'

export type Glue = { id: string; site: number }

/** The connection sites of an object in slide coordinates: top, right, bottom, left. */
export function connectionSites(el: SlideElement): Pt[] {
  const c = center(el)
  const pts = [
    { x: el.x + el.w / 2, y: el.y },
    { x: el.x + el.w, y: el.y + el.h / 2 },
    { x: el.x + el.w / 2, y: el.y + el.h },
    { x: el.x, y: el.y + el.h / 2 },
  ]
  return el.rot ? pts.map((p) => rotate(p, c, el.rot)) : pts
}

/** Objects a connector can glue to (not lines, not hidden). */
export function canGlueTo(el: SlideElement) {
  return !el.hidden && !isLineElement(el) && el.type !== 'ink'
}

/** The nearest connection site within `radius` of `p`, ignoring `excludeId`. */
export function nearestSite(elements: SlideElement[], p: Pt, radius: number, excludeId?: string): (Glue & { pt: Pt }) | null {
  let best: (Glue & { pt: Pt }) | null = null
  let bd = radius
  for (const el of elements) {
    if (el.id === excludeId || !canGlueTo(el)) continue
    connectionSites(el).forEach((pt, site) => {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y)
      if (d <= bd) {
        bd = d
        best = { id: el.id, site, pt }
      }
    })
  }
  return best
}

/** Puts glued connector ends back on their sites. Returns the same array when nothing changed. */
export function rerouteConnectors(elements: SlideElement[]): SlideElement[] {
  if (!elements.some((e) => e.type === 'shape' && e.conn)) return elements
  const byId = new Map(elements.map((e) => [e.id, e]))
  let changed = false
  const out = elements.map((el) => {
    if (el.type !== 'shape' || !el.conn) return el
    const [a, b] = lineEnds(el)
    const site = (g: Glue | null | undefined, fallback: Pt) => {
      const target = g ? byId.get(g.id) : undefined
      return target ? (connectionSites(target)[g!.site] ?? fallback) : fallback
    }
    const start = site(el.conn.start, a)
    const end = site(el.conn.end, b)
    // Glue to objects that no longer exist is dropped.
    const conn = { start: el.conn.start && byId.has(el.conn.start.id) ? el.conn.start : null, end: el.conn.end && byId.has(el.conn.end.id) ? el.conn.end : null }
    const near = (p: Pt, q: Pt) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01
    const connSame = conn.start === el.conn.start && conn.end === el.conn.end
    if (near(start, a) && near(end, b) && connSame) return el
    changed = true
    const frame = frameFromEnds(start, end)
    const next: ShapeElement = { ...el, ...frame, conn: conn.start || conn.end ? conn : undefined }
    return next
  })
  return changed ? out : elements
}

/** Reroutes connectors on every slide whose objects changed between `prev` and `next`. */
export function withConnectors(next: Presentation, prev: Presentation): Presentation {
  if (next === prev) return next
  let slides = next.slides
  next.slides.forEach((s, i) => {
    if (prev.slides.includes(s)) return
    const els = rerouteConnectors(s.elements)
    if (els !== s.elements) {
      if (slides === next.slides) slides = [...next.slides]
      slides[i] = { ...s, elements: els }
    }
  })
  return slides === next.slides ? next : { ...next, slides }
}

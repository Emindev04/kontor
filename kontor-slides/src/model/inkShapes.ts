// Ink to Shape: recognizes a drawn stroke as a line, triangle, rectangle, ellipse or polygon.
import { simplify, type Pt2 } from './pathPoints'

export type InkShape = { prst: 'line' | 'triangle' | 'rect' | 'ellipse' | 'pentagon' | 'hexagon'; x: number; y: number; w: number; h: number; flipH?: boolean; flipV?: boolean }

const dist = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** The shape a stroke looks like, or null when it is not clearly one. */
export function recognizeInk(points: Pt2[]): InkShape | null {
  if (points.length < 3) return null
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = Math.max(...xs) - x
  const h = Math.max(...ys) - y
  const diag = Math.hypot(w, h)
  if (diag < 8) return null
  let length = 0
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i])
  const first = points[0]
  const last = points[points.length - 1]
  // Nearly straight: a line from the first to the last point.
  if (dist(first, last) / length > 0.92) return { prst: 'line', x, y, w, h, flipH: last[0] < first[0], flipV: last[1] < first[1] }
  // Closed figures end near where they started.
  if (dist(first, last) > diag * 0.25) return null
  const ring = [...points.slice(0, -1), first]
  const corners = simplify(ring, diag * 0.07)
  let n = corners.length - 1
  // Merge a corner that sits on the straight line between its neighbors (start/end overlap).
  if (n >= 3) {
    const pts = corners.slice(0, -1)
    const straight = pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length]
      const b = pts[(i + 1) % pts.length]
      return Math.abs(dist(a, p) + dist(p, b) - dist(a, b)) < diag * 0.03
    })
    n -= straight.length
  }
  // Round figures: the distance to the center hardly varies relative to the box.
  const cx = x + w / 2
  const cy = y + h / 2
  const radial = points.map(([px, py]) => Math.hypot((px - cx) / (w / 2 || 1), (py - cy) / (h / 2 || 1)))
  const mean = radial.reduce((a, b) => a + b, 0) / radial.length
  const spread = Math.sqrt(radial.reduce((a, b) => a + (b - mean) ** 2, 0) / radial.length)
  if (n >= 6 || (spread < 0.09 && n !== 3 && n !== 4)) return { prst: 'ellipse', x, y, w, h }
  if (n === 3) return { prst: 'triangle', x, y, w, h, flipV: isPointingDown(points, cy) }
  if (n === 4) return spread < 0.06 ? { prst: 'ellipse', x, y, w, h } : { prst: 'rect', x, y, w, h }
  if (n === 5) return { prst: 'pentagon', x, y, w, h }
  return null
}

/** A triangle whose single tip is at the bottom. */
function isPointingDown(points: Pt2[], cy: number) {
  const below = points.filter((p) => p[1] > cy).length
  return below < points.length * 0.4
}

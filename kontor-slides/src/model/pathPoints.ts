// Turns SVG path data into point lists (for Edit Points and free-form shapes) and simplifies drawn strokes.

export type Pt2 = [number, number]
export type SubPath = { pts: Pt2[]; closed: boolean }

const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) out.push(m[1] ?? Number(m[2]))
  return out
}

function cubic(p0: Pt2, p1: Pt2, p2: Pt2, p3: Pt2, steps: number): Pt2[] {
  const out: Pt2[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]])
  }
  return out
}

function quad(p0: Pt2, p1: Pt2, p2: Pt2, steps: number): Pt2[] {
  const out: Pt2[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]])
  }
  return out
}

/** SVG elliptical arc (endpoint form) sampled into points, following the SVG implementation notes. */
function arc(p0: Pt2, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Pt2, steps: number): Pt2[] {
  if (!rx || !ry) return [p1]
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const phi = (phiDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (p0[0] - p1[0]) / 2
  const dy = (p0[1] - p1[1]) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (den || 1)))
  const cx1 = (coef * rx * y1) / ry
  const cy1 = (-coef * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  const n = Math.max(2, Math.ceil((Math.abs(dt) / (Math.PI / 2)) * steps))
  const out: Pt2[] = []
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos])
  }
  out[out.length - 1] = p1
  return out
}

/** Points of every subpath of an SVG path. Straight segments are exact; curves are sampled. */
export function pathToPoints(d: string, curveSteps = 10): SubPath[] {
  const tokens = tokenize(d)
  const subs: SubPath[] = []
  let cur: SubPath | null = null
  let p: Pt2 = [0, 0]
  let start: Pt2 = [0, 0]
  let lastCtrl: Pt2 | null = null
  let lastQ: Pt2 | null = null
  let cmd = ''
  let i = 0
  const num = () => Number(tokens[i++])
  const push = (pts: Pt2[]) => {
    if (!cur) {
      cur = { pts: [p], closed: false }
      subs.push(cur)
    }
    cur.pts.push(...pts)
  }
  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') cmd = tokens[i++] as string
    else if (!cmd) {
      i++
      continue
    }
    const rel = cmd === cmd.toLowerCase()
    const base: Pt2 = rel ? p : [0, 0]
    switch (cmd.toUpperCase()) {
      case 'M': {
        const q: Pt2 = [base[0] + num(), base[1] + num()]
        cur = { pts: [q], closed: false }
        subs.push(cur)
        p = q
        start = q
        cmd = rel ? 'l' : 'L'
        lastCtrl = lastQ = null
        break
      }
      case 'L': {
        const q: Pt2 = [base[0] + num(), base[1] + num()]
        push([q])
        p = q
        lastCtrl = lastQ = null
        break
      }
      case 'H': {
        const q: Pt2 = [(rel ? p[0] : 0) + num(), p[1]]
        push([q])
        p = q
        lastCtrl = lastQ = null
        break
      }
      case 'V': {
        const q: Pt2 = [p[0], (rel ? p[1] : 0) + num()]
        push([q])
        p = q
        lastCtrl = lastQ = null
        break
      }
      case 'C': {
        const c1: Pt2 = [base[0] + num(), base[1] + num()]
        const c2: Pt2 = [base[0] + num(), base[1] + num()]
        const q: Pt2 = [base[0] + num(), base[1] + num()]
        push(cubic(p, c1, c2, q, curveSteps))
        p = q
        lastCtrl = c2
        lastQ = null
        break
      }
      case 'S': {
        const c1: Pt2 = lastCtrl ? [2 * p[0] - lastCtrl[0], 2 * p[1] - lastCtrl[1]] : p
        const c2: Pt2 = [base[0] + num(), base[1] + num()]
        const q: Pt2 = [base[0] + num(), base[1] + num()]
        push(cubic(p, c1, c2, q, curveSteps))
        p = q
        lastCtrl = c2
        lastQ = null
        break
      }
      case 'Q': {
        const c: Pt2 = [base[0] + num(), base[1] + num()]
        const q: Pt2 = [base[0] + num(), base[1] + num()]
        push(quad(p, c, q, curveSteps))
        p = q
        lastQ = c
        lastCtrl = null
        break
      }
      case 'T': {
        const c: Pt2 = lastQ ? [2 * p[0] - lastQ[0], 2 * p[1] - lastQ[1]] : p
        const q: Pt2 = [base[0] + num(), base[1] + num()]
        push(quad(p, c, q, curveSteps))
        p = q
        lastQ = c
        lastCtrl = null
        break
      }
      case 'A': {
        const rx = num()
        const ry = num()
        const rot = num()
        const large = num() !== 0
        const sweep = num() !== 0
        const q: Pt2 = [base[0] + num(), base[1] + num()]
        push(arc(p, rx, ry, rot, large, sweep, q, Math.max(3, Math.round(curveSteps / 2))))
        p = q
        lastCtrl = lastQ = null
        break
      }
      case 'Z': {
        if (cur) {
          const c = cur as SubPath
          c.closed = true
          // Drop a duplicated closing point.
          const a = c.pts[0]
          const b = c.pts[c.pts.length - 1]
          if (c.pts.length > 1 && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) c.pts.pop()
        }
        p = start
        cur = null
        lastCtrl = lastQ = null
        break
      }
      default:
        i++
    }
  }
  return subs.filter((s) => s.pts.length > 1)
}

function segDist(p: Pt2, a: Pt2, b: Pt2) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Ramer–Douglas–Peucker simplification of a drawn stroke. */
export function simplify(pts: Pt2[], tolerance = 1): Pt2[] {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let max = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const dist = segDist(pts[i], pts[a], pts[b])
      if (dist > max) {
        max = dist
        idx = i
      }
    }
    if (idx >= 0 && max > tolerance) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** Index of the segment of `pts` nearest to `p` and the distance to it. */
export function nearestSegment(pts: Pt2[], p: Pt2, closed: boolean): { index: number; dist: number } {
  let best = { index: -1, dist: Infinity }
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const dist = segDist(p, pts[i], pts[(i + 1) % pts.length])
    if (dist < best.dist) best = { index: i, dist }
  }
  return best
}

export function numbersIn(s: string) {
  return (s.match(NUM) ?? []).map(Number)
}

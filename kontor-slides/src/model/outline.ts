// Free-form outlines with Bézier curves: vertices (rings) plus optional control handles per vertex.
// Used by Edit Points, the Curve/Scribble tools, rendering and the .pptx custom geometry.

export type P2 = [number, number]
/** How a vertex's two handles move together: smooth (mirrored), straight (same line), corner (free). */
export type PointType = 'smooth' | 'straight' | 'corner'
/** Control handles of one vertex: `i` shapes the segment coming in, `o` the segment going out. */
export type VertexHandles = { i?: P2; o?: P2; t?: PointType }
export type Outline = { rings: P2[][]; handles: (VertexHandles | null)[][] }

export function emptyHandles(rings: P2[][]): (VertexHandles | null)[][] {
  return rings.map((r) => r.map(() => null))
}

/** Handles aligned with the rings (missing entries become null). */
export function normHandles(rings: P2[][], handles: (VertexHandles | null)[][] | undefined): (VertexHandles | null)[][] {
  return rings.map((r, ri) => r.map((_, i) => handles?.[ri]?.[i] ?? null))
}

export function hasCurves(handles: (VertexHandles | null)[][] | undefined) {
  return !!handles?.some((r) => r.some((h) => h && (h.i || h.o)))
}

const sc = (p: P2, sx: number, sy: number): P2 => [p[0] * sx, p[1] * sy]

export function scaleOutline(o: Outline, sx: number, sy: number): Outline {
  if (sx === 1 && sy === 1) return o
  return {
    rings: o.rings.map((r) => r.map((p) => sc(p, sx, sy))),
    handles: o.handles.map((r) => r.map((h) => (h ? { ...h, i: h.i && sc(h.i, sx, sy), o: h.o && sc(h.o, sx, sy) } : null))),
  }
}

export function translateOutline(o: Outline, dx: number, dy: number): Outline {
  const mv = (p: P2): P2 => [p[0] + dx, p[1] + dy]
  return {
    rings: o.rings.map((r) => r.map(mv)),
    handles: o.handles.map((r) => r.map((h) => (h ? { ...h, i: h.i && mv(h.i), o: h.o && mv(h.o) } : null))),
  }
}

type Seg = { a: P2; b: P2; c1: P2 | null; c2: P2 | null }

/** Segments of one ring (the closing segment included when closed). */
export function segments(o: Outline, ri: number, closed: boolean): Seg[] {
  const r = o.rings[ri]
  const h = o.handles[ri] ?? []
  const out: Seg[] = []
  const n = closed ? r.length : r.length - 1
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % r.length
    const c1 = h[k]?.o ?? null
    const c2 = h[j]?.i ?? null
    out.push({ a: r[k], b: r[j], c1: c1 || c2 ? (c1 ?? r[k]) : null, c2: c1 || c2 ? (c2 ?? r[j]) : null })
  }
  return out
}

const f = (n: number) => (Math.round(n * 100) / 100).toString()

/** SVG path data of an outline. */
export function outlinePath(o: Outline, open: boolean): string {
  return o.rings
    .map((r, ri) => {
      if (!r.length) return ''
      const parts = [`M${f(r[0][0])} ${f(r[0][1])}`]
      for (const s of segments(o, ri, !open)) parts.push(s.c1 && s.c2 ? `C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.b[0])} ${f(s.b[1])}` : `L${f(s.b[0])} ${f(s.b[1])}`)
      return parts.join(' ') + (open ? '' : ' Z')
    })
    .join(' ')
}

export function bezierAt(a: P2, c1: P2, c2: P2, b: P2, t: number): P2 {
  const u = 1 - t
  return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]
}

/** Points along the outline (curves sampled), e.g. for bounds and hit testing. */
export function sampleOutline(o: Outline, open: boolean, steps = 16): P2[][] {
  return o.rings.map((r, ri) => {
    if (!r.length) return []
    const pts: P2[] = [r[0]]
    for (const s of segments(o, ri, !open)) {
      if (s.c1 && s.c2) for (let i = 1; i <= steps; i++) pts.push(bezierAt(s.a, s.c1, s.c2, s.b, i / steps))
      else pts.push(s.b)
    }
    return pts
  })
}

export function outlineBounds(o: Outline, open: boolean) {
  const pts = sampleOutline(o, open).flat()
  if (!pts.length) return null
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function segDist(p: P2, a: P2, b: P2) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return { dist: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t }
}

/** The point of the outline nearest to `p`: ring, segment index, curve parameter and distance. */
export function nearestOnOutline(o: Outline, p: P2, open: boolean) {
  let best = { ring: -1, seg: -1, t: 0, dist: Infinity }
  o.rings.forEach((_, ri) => {
    segments(o, ri, !open).forEach((s, k) => {
      if (s.c1 && s.c2) {
        let prev = s.a
        for (let i = 1; i <= 24; i++) {
          const q = bezierAt(s.a, s.c1, s.c2, s.b, i / 24)
          const hit = segDist(p, prev, q)
          if (hit.dist < best.dist) best = { ring: ri, seg: k, t: (i - 1 + hit.t) / 24, dist: hit.dist }
          prev = q
        }
      } else {
        const hit = segDist(p, s.a, s.b)
        if (hit.dist < best.dist) best = { ring: ri, seg: k, t: hit.t, dist: hit.dist }
      }
    })
  })
  return best
}

const lerp = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Inserts a vertex on segment `seg` of ring `ri` at parameter t; curves are split exactly (de Casteljau). */
export function splitSegment(o: Outline, ri: number, seg: number, t: number, open: boolean): Outline {
  const r = o.rings[ri]
  const h = [...(o.handles[ri] ?? r.map(() => null))]
  const s = segments(o, ri, !open)[seg]
  if (!s) return o
  const j = (seg + 1) % r.length
  let pt: P2
  let newH: VertexHandles | null = null
  if (s.c1 && s.c2) {
    const p01 = lerp(s.a, s.c1, t)
    const p12 = lerp(s.c1, s.c2, t)
    const p23 = lerp(s.c2, s.b, t)
    const p012 = lerp(p01, p12, t)
    const p123 = lerp(p12, p23, t)
    pt = lerp(p012, p123, t)
    h[seg] = { ...(h[seg] ?? {}), o: p01 }
    h[j] = { ...(h[j] ?? {}), i: p23 }
    newH = { i: p012, o: p123, t: 'smooth' }
  } else pt = lerp(s.a, s.b, t)
  const at = seg + 1
  return {
    rings: o.rings.map((x, i) => (i === ri ? [...x.slice(0, at), pt, ...x.slice(at)] : x)),
    handles: o.handles.map((x, i) => (i === ri ? [...h.slice(0, at), newH, ...h.slice(at)] : x)),
  }
}

export function deletePoint(o: Outline, ri: number, index: number): Outline {
  return {
    rings: o.rings.map((r, i) => (i === ri ? r.filter((_, k) => k !== index) : r)),
    handles: o.handles.map((r, i) => (i === ri ? r.filter((_, k) => k !== index) : r)),
  }
}

/** Moves a vertex together with its handles. */
export function moveVertex(o: Outline, ri: number, index: number, to: P2): Outline {
  const from = o.rings[ri][index]
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const mv = (p: P2 | undefined) => p && ([p[0] + dx, p[1] + dy] as P2)
  return {
    rings: o.rings.map((r, i) => (i === ri ? r.map((p, k) => (k === index ? to : p)) : r)),
    handles: o.handles.map((r, i) => (i === ri ? r.map((h, k) => (k === index && h ? { ...h, i: mv(h.i), o: mv(h.o) } : h)) : r)),
  }
}

/** Moves one handle; the opposite handle follows the vertex's point type. */
export function moveHandle(o: Outline, ri: number, index: number, which: 'i' | 'o', to: P2): Outline {
  const v = o.rings[ri][index]
  const h = { ...(o.handles[ri][index] ?? {}) }
  h[which] = to
  const other = which === 'i' ? 'o' : 'i'
  const t = h.t ?? 'corner'
  const opp = h[other]
  if (opp && t !== 'corner') {
    const dx = to[0] - v[0]
    const dy = to[1] - v[1]
    const len = Math.hypot(dx, dy) || 1
    const keep = t === 'smooth' ? len : Math.hypot(opp[0] - v[0], opp[1] - v[1])
    h[other] = [v[0] - (dx / len) * keep, v[1] - (dy / len) * keep]
  }
  return { ...o, handles: o.handles.map((r, i) => (i === ri ? r.map((x, k) => (k === index ? h : x)) : r)) }
}

/** Neighbours of a vertex (wrapping when the ring is closed). */
function neighbours(r: P2[], index: number, open: boolean) {
  const n = r.length
  const prev = index > 0 ? r[index - 1] : open ? null : r[n - 1]
  const next = index < n - 1 ? r[index + 1] : open ? null : r[0]
  return { prev, next }
}

/** Smooth handles through a vertex, along the line from its previous to its next neighbour (Catmull-Rom). */
function smoothHandles(r: P2[], index: number, open: boolean, tension = 1 / 6): VertexHandles {
  const v = r[index]
  const { prev, next } = neighbours(r, index, open)
  const a = prev ?? v
  const b = next ?? v
  const dx = (b[0] - a[0]) * tension
  const dy = (b[1] - a[1]) * tension
  return { i: prev ? [v[0] - dx, v[1] - dy] : undefined, o: next ? [v[0] + dx, v[1] + dy] : undefined, t: 'smooth' }
}

/** Smooth Point / Straight Point / Corner Point (vertex context menu). */
export function setPointType(o: Outline, ri: number, index: number, t: PointType, open: boolean): Outline {
  const r = o.rings[ri]
  const v = r[index]
  const cur = o.handles[ri][index]
  let h: VertexHandles
  if (t === 'corner') h = { ...(cur ?? {}), t }
  else if (!cur?.i && !cur?.o) h = { ...smoothHandles(r, index, open), t }
  else {
    // Line the handles up through the vertex, using the outgoing direction.
    const base = cur.o ?? (cur.i ? ([2 * v[0] - cur.i[0], 2 * v[1] - cur.i[1]] as P2) : v)
    const dx = base[0] - v[0]
    const dy = base[1] - v[1]
    const len = Math.hypot(dx, dy) || 1
    const lo = Math.hypot((cur.o ?? base)[0] - v[0], (cur.o ?? base)[1] - v[1])
    const li = cur.i ? Math.hypot(cur.i[0] - v[0], cur.i[1] - v[1]) : lo
    const avg = (lo + li) / 2
    const [ri2, ro2] = t === 'smooth' ? [avg, avg] : [li, lo]
    h = { t, o: [v[0] + (dx / len) * ro2, v[1] + (dy / len) * ro2], i: [v[0] - (dx / len) * ri2, v[1] - (dy / len) * ri2] }
  }
  return { ...o, handles: o.handles.map((x, i) => (i === ri ? x.map((y, k) => (k === index ? h : y)) : x)) }
}

/** Straight Segment / Curved Segment (segment context menu). */
export function setSegmentCurved(o: Outline, ri: number, seg: number, curved: boolean): Outline {
  const r = o.rings[ri]
  const j = (seg + 1) % r.length
  const h = [...o.handles[ri]]
  if (curved) {
    h[seg] = { ...(h[seg] ?? {}), o: lerp(r[seg], r[j], 1 / 3) }
    h[j] = { ...(h[j] ?? {}), i: lerp(r[seg], r[j], 2 / 3) }
  } else {
    if (h[seg]) h[seg] = { ...h[seg]!, o: undefined }
    if (h[j]) h[j] = { ...h[j]!, i: undefined }
  }
  return { ...o, handles: o.handles.map((x, i) => (i === ri ? h : x)) }
}

/** Smooth curve through drawn points (Curve tool, smoothed scribbles). */
export function smoothThrough(pts: P2[], closed: boolean): (VertexHandles | null)[] {
  return pts.map((_, i) => smoothHandles(pts, i, !closed))
}

/** Whether a segment between two vertices is curved. */
export function isCurved(o: Outline, ri: number, seg: number, open: boolean) {
  const s = segments(o, ri, !open)[seg]
  return !!(s?.c1 && s.c2)
}

/** Cubic segments approximating an SVG elliptical arc (endpoint form), at most 90° each. */
function arcToCubics(p0: P2, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: P2): [P2, P2, P2][] {
  if (!rx || !ry) return [[p0, p1, p1]]
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
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9))
  const step = dt / n
  const k = (4 / 3) * Math.tan(step / 4)
  const at = (t: number): P2 => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]
  const der = (t: number): P2 => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos]
  const out: [P2, P2, P2][] = []
  for (let i = 0; i < n; i++) {
    const a = t1 + step * i
    const b = a + step
    const pa = at(a)
    const pb = i === n - 1 ? p1 : at(b)
    const da = der(a)
    const db = der(b)
    out.push([[pa[0] + k * da[0], pa[1] + k * da[1]], [pb[0] - k * db[0], pb[1] - k * db[1]], pb])
  }
  return out
}

/** Vertices and Bézier handles of an SVG path, keeping curves (arcs and quadratics become cubics). */
export function pathToOutline(d: string): { outline: Outline; closed: boolean[] } {
  const tokens: (string | number)[] = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) tokens.push(m[1] ?? Number(m[2]))
  const rings: P2[][] = []
  const handles: (VertexHandles | null)[][] = []
  const closed: boolean[] = []
  let ring: P2[] | null = null
  let hs: (VertexHandles | null)[] = []
  let p: P2 = [0, 0]
  let start: P2 = [0, 0]
  let lastC: P2 | null = null
  let lastQ: P2 | null = null
  let cmd = ''
  let i = 0
  const num = () => Number(tokens[i++])
  const begin = (q: P2) => {
    ring = [q]
    hs = [null]
    rings.push(ring)
    handles.push(hs)
    closed.push(false)
  }
  const cubicTo = (c1: P2, c2: P2, q: P2) => {
    if (!ring) begin(p)
    hs[hs.length - 1] = { ...(hs[hs.length - 1] ?? {}), o: c1 }
    ring!.push(q)
    hs.push({ i: c2 })
  }
  const lineTo = (q: P2) => {
    if (!ring) begin(p)
    ring!.push(q)
    hs.push(null)
  }
  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') cmd = tokens[i++] as string
    else if (!cmd) {
      i++
      continue
    }
    const rel = cmd === cmd.toLowerCase()
    const b: P2 = rel ? p : [0, 0]
    switch (cmd.toUpperCase()) {
      case 'M': {
        const q: P2 = [b[0] + num(), b[1] + num()]
        begin(q)
        p = start = q
        cmd = rel ? 'l' : 'L'
        lastC = lastQ = null
        break
      }
      case 'L': {
        const q: P2 = [b[0] + num(), b[1] + num()]
        lineTo(q)
        p = q
        lastC = lastQ = null
        break
      }
      case 'H': {
        const q: P2 = [(rel ? p[0] : 0) + num(), p[1]]
        lineTo(q)
        p = q
        lastC = lastQ = null
        break
      }
      case 'V': {
        const q: P2 = [p[0], (rel ? p[1] : 0) + num()]
        lineTo(q)
        p = q
        lastC = lastQ = null
        break
      }
      case 'C': {
        const c1: P2 = [b[0] + num(), b[1] + num()]
        const c2: P2 = [b[0] + num(), b[1] + num()]
        const q: P2 = [b[0] + num(), b[1] + num()]
        cubicTo(c1, c2, q)
        p = q
        lastC = c2
        lastQ = null
        break
      }
      case 'S': {
        const c1: P2 = lastC ? [2 * p[0] - lastC[0], 2 * p[1] - lastC[1]] : p
        const c2: P2 = [b[0] + num(), b[1] + num()]
        const q: P2 = [b[0] + num(), b[1] + num()]
        cubicTo(c1, c2, q)
        p = q
        lastC = c2
        lastQ = null
        break
      }
      case 'Q':
      case 'T': {
        const c: P2 = cmd.toUpperCase() === 'Q' ? [b[0] + num(), b[1] + num()] : lastQ ? [2 * p[0] - lastQ[0], 2 * p[1] - lastQ[1]] : p
        const q: P2 = [b[0] + num(), b[1] + num()]
        cubicTo([p[0] + (2 / 3) * (c[0] - p[0]), p[1] + (2 / 3) * (c[1] - p[1])], [q[0] + (2 / 3) * (c[0] - q[0]), q[1] + (2 / 3) * (c[1] - q[1])], q)
        p = q
        lastQ = c
        lastC = null
        break
      }
      case 'A': {
        const rx = num()
        const ry = num()
        const rot = num()
        const large = num() !== 0
        const sweep = num() !== 0
        const q: P2 = [b[0] + num(), b[1] + num()]
        for (const [c1, c2, e] of arcToCubics(p, rx, ry, rot, large, sweep, q)) cubicTo(c1, c2, e)
        p = q
        lastC = lastQ = null
        break
      }
      case 'Z': {
        if (ring) {
          const r = ring as P2[]
          closed[closed.length - 1] = true
          // Merge a closing point that repeats the start (its incoming handle moves to the start point).
          const a = r[0]
          const z = r[r.length - 1]
          if (r.length > 1 && Math.abs(a[0] - z[0]) < 1e-6 && Math.abs(a[1] - z[1]) < 1e-6) {
            r.pop()
            const last = hs.pop()
            if (last?.i) hs[0] = { ...(hs[0] ?? {}), i: last.i }
          }
        }
        p = start
        ring = null
        lastC = lastQ = null
        break
      }
      default:
        i++
    }
  }
  const keep = rings.map((r) => r.length > 1)
  return { outline: { rings: rings.filter((_, k) => keep[k]), handles: handles.filter((_, k) => keep[k]) }, closed: closed.filter((_, k) => keep[k]) }
}

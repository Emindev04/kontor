import { t, tx } from '../i18n'
// Preset shape geometry. Names follow the OOXML `prst` values so shapes survive .pptx round trips.
// Each generator returns SVG paths for a box of w × h pixels.

export type ShapePath = { d: string; fill: 'norm' | 'darken' | 'lighten' | 'none'; stroke?: boolean; evenOdd?: boolean }
export type Geometry = { paths: ShapePath[]; /** Text area as [left, top, right, bottom] in px. */ text?: [number, number, number, number] }

export type ShapeCategory = 'Lines' | 'Rectangles' | 'Basic Shapes' | 'Block Arrows' | 'Equation Shapes' | 'Flowchart' | 'Stars and Banners' | 'Callouts' | 'Action Buttons'

export type ShapePreset = {
  id: string
  prst: string
  label: string
  category: ShapeCategory
  /** Open shapes (lines, arcs, brackets) are drawn with stroke only. */
  open?: boolean
  /** Line ends applied when inserting from the gallery. */
  head?: 'triangle'
  tail?: 'triangle'
}

const f = (n: number) => Math.round(n * 100) / 100

function poly(pts: [number, number][], close = true) {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ') + (close ? ' Z' : '')
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M${f(cx - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`
}

function rectPath(x: number, y: number, w: number, h: number) {
  return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])
}

function roundRectPath(x: number, y: number, w: number, h: number, r: number[]) {
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, w / 2, h / 2)))
  return [
    `M${f(x + tl)} ${f(y)}`,
    `L${f(x + w - tr)} ${f(y)}`,
    tr ? `A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}` : '',
    `L${f(x + w)} ${f(y + h - br)}`,
    br ? `A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}` : '',
    `L${f(x + bl)} ${f(y + h)}`,
    bl ? `A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}` : '',
    `L${f(x)} ${f(y + tl)}`,
    tl ? `A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}` : '',
    'Z',
  ].join(' ')
}

/** Points of a polygon or star scaled to fill the box exactly. */
function fitted(pts: [number, number][], w: number, h: number): [number, number][] {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const sx = w / (Math.max(...xs) - minX || 1)
  const sy = h / (Math.max(...ys) - minY || 1)
  return pts.map(([x, y]) => [(x - minX) * sx, (y - minY) * sy])
}

function regular(n: number, w: number, h: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    pts.push([Math.cos(a), Math.sin(a)])
  }
  return poly(fitted(pts, w, h))
}

function star(n: number, inner: number, w: number, h: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const r = i % 2 ? inner : 1
    pts.push([w / 2 + (Math.cos(a) * r * w) / 2, h / 2 + (Math.sin(a) * r * h) / 2])
  }
  return poly(pts)
}

/** Polygon given in a 0..1 unit square. */
function unit(pts: [number, number][], w: number, h: number, close = true) {
  return poly(
    pts.map(([x, y]) => [x * w, y * h]),
    close,
  )
}

const only = (d: string, extra: Partial<ShapePath> = {}): Geometry => ({ paths: [{ d, fill: 'norm', ...extra }] })
const open = (d: string): Geometry => ({ paths: [{ d, fill: 'none' }] })

type Gen = (w: number, h: number, adj: number[]) => Geometry

const GEN: Record<string, Gen> = {
  // Lines and connectors
  line: (w, h) => open(`M0 0 L${f(w)} ${f(h)}`),
  straightConnector1: (w, h) => open(`M0 0 L${f(w)} ${f(h)}`),
  bentConnector3: (w, h) => open(`M0 0 L${f(w / 2)} 0 L${f(w / 2)} ${f(h)} L${f(w)} ${f(h)}`),
  curvedConnector3: (w, h) => open(`M0 0 C${f(w / 2)} 0 ${f(w / 2)} ${f(h)} ${f(w)} ${f(h)}`),
  arc: (w, h) => open(`M${f(w / 2)} 0 A${f(w / 2)} ${f(h / 2)} 0 0 1 ${f(w)} ${f(h / 2)}`),
  // Drawing tools in the gallery (Freeform: Shape and Freeform: Scribble); only their icons use these.
  curve: (w, h) => open(`M${f(w * 0.05)} ${f(h * 0.8)} C${f(w * 0.2)} ${f(h * 0.1)} ${f(w * 0.45)} ${f(h * 0.1)} ${f(w * 0.55)} ${f(h * 0.5)} S${f(w * 0.85)} ${f(h * 0.95)} ${f(w * 0.95)} ${f(h * 0.2)}`),
  freeform: (w, h) => open(`M${f(w * 0.1)} ${f(h * 0.9)} L${f(w * 0.3)} ${f(h * 0.15)} L${f(w * 0.55)} ${f(h * 0.6)} L${f(w * 0.75)} ${f(h * 0.2)} L${f(w * 0.9)} ${f(h * 0.85)}`),
  scribble: (w, h) => open(`M${f(w * 0.05)} ${f(h * 0.7)} C${f(w * 0.25)} ${f(h * -0.1)} ${f(w * 0.4)} ${f(h * 1.1)} ${f(w * 0.55)} ${f(h * 0.45)} S${f(w * 0.85)} ${f(h * 0.1)} ${f(w * 0.95)} ${f(h * 0.5)}`),

  // Rectangles
  rect: (w, h) => only(rectPath(0, 0, w, h)),
  roundRect: (w, h, a) => {
    const r = (Math.min(w, h) * (a[0] ?? 16667)) / 100000
    return { paths: [{ d: roundRectPath(0, 0, w, h, [r, r, r, r]), fill: 'norm' }], text: [r * 0.29, r * 0.29, w - r * 0.29, h - r * 0.29] }
  },
  snip1Rect: (w, h, a) => {
    const s = (Math.min(w, h) * (a[0] ?? 16667)) / 100000
    return only(poly([[0, 0], [w - s, 0], [w, s], [w, h], [0, h]]))
  },
  snip2SameRect: (w, h) => {
    const s = Math.min(w, h) * 0.16667
    return only(poly([[s, 0], [w - s, 0], [w, s], [w, h], [0, h], [0, s]]))
  },
  snip2DiagRect: (w, h) => {
    const s = Math.min(w, h) * 0.16667
    return only(poly([[0, 0], [w - s, 0], [w, s], [w, h], [s, h], [0, h - s]]))
  },
  snipRoundRect: (w, h) => {
    const s = Math.min(w, h) * 0.16667
    return only(`M${f(s)} 0 L${f(w - s)} 0 L${f(w)} ${f(s)} L${f(w)} ${f(h)} L0 ${f(h)} L0 ${f(s)} A${f(s)} ${f(s)} 0 0 1 ${f(s)} 0 Z`)
  },
  round1Rect: (w, h) => {
    const r = Math.min(w, h) * 0.16667
    return only(roundRectPath(0, 0, w, h, [0, r, 0, 0]))
  },
  round2SameRect: (w, h) => {
    const r = Math.min(w, h) * 0.16667
    return only(roundRectPath(0, 0, w, h, [r, r, 0, 0]))
  },
  round2DiagRect: (w, h) => {
    const r = Math.min(w, h) * 0.16667
    return only(roundRectPath(0, 0, w, h, [r, 0, r, 0]))
  },

  // Basic shapes
  ellipse: (w, h) => ({ paths: [{ d: ellipsePath(w / 2, h / 2, w / 2, h / 2), fill: 'norm' }], text: [w * 0.146, h * 0.146, w * 0.854, h * 0.854] }),
  triangle: (w, h, a) => {
    const x = (w * (a[0] ?? 50000)) / 100000
    return { paths: [{ d: poly([[x, 0], [w, h], [0, h]]), fill: 'norm' }], text: [w * 0.25, h * 0.5, w * 0.75, h] }
  },
  rtTriangle: (w, h) => ({ paths: [{ d: poly([[0, 0], [w, h], [0, h]]), fill: 'norm' }], text: [w * 0.08, h * 0.5, w * 0.58, h * 0.92] }),
  parallelogram: (w, h, a) => {
    const x = (Math.min(w, h) * (a[0] ?? 25000)) / 100000
    return only(poly([[x, 0], [w, 0], [w - x, h], [0, h]]))
  },
  trapezoid: (w, h, a) => {
    const x = (Math.min(w, h) * (a[0] ?? 25000)) / 100000
    return only(poly([[x, 0], [w - x, 0], [w, h], [0, h]]))
  },
  diamond: (w, h) => ({ paths: [{ d: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), fill: 'norm' }], text: [w / 4, h / 4, (w * 3) / 4, (h * 3) / 4] }),
  pentagon: (w, h) => only(regular(5, w, h)),
  hexagon: (w, h) => {
    const x = Math.min(w, h) * 0.25
    return only(poly([[0, h / 2], [x, 0], [w - x, 0], [w, h / 2], [w - x, h], [x, h]]))
  },
  heptagon: (w, h) => only(regular(7, w, h)),
  octagon: (w, h) => {
    const x = Math.min(w, h) * 0.29289
    return only(poly([[x, 0], [w - x, 0], [w, x], [w, h - x], [w - x, h], [x, h], [0, h - x], [0, x]]))
  },
  decagon: (w, h) => only(regular(10, w, h)),
  dodecagon: (w, h) => only(regular(12, w, h)),
  pie: (w, h) => only(`M${f(w / 2)} ${f(h / 2)} L${f(w)} ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 1 ${f(w / 2)} 0 Z`),
  chord: (w, h) => {
    const p1 = [w / 2 + (w / 2) * Math.cos(Math.PI / 4), h / 2 + (h / 2) * Math.sin(Math.PI / 4)]
    const p2 = [w / 2 + (w / 2) * Math.cos(-Math.PI / 2), h / 2 + (h / 2) * Math.sin(-Math.PI / 2)]
    return only(`M${f(p1[0])} ${f(p1[1])} A${f(w / 2)} ${f(h / 2)} 0 1 1 ${f(p2[0])} ${f(p2[1])} Z`)
  },
  teardrop: (w, h) => only(`M0 ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 0 1 ${f(w / 2)} 0 L${f(w)} 0 L${f(w)} ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 1 0 ${f(h / 2)} Z`),
  frame: (w, h) => {
    const t = Math.min(w, h) * 0.125
    return only(rectPath(0, 0, w, h) + ' ' + rectPath(t, t, w - 2 * t, h - 2 * t), { evenOdd: true })
  },
  halfFrame: (w, h) => {
    const t = Math.min(w, h) * 0.3333
    return only(poly([[0, 0], [w, 0], [w - t * (w / h > 1 ? 1 : w / h), t], [t, t], [t, h - t * (h / w > 1 ? 1 : h / w)], [0, h]]))
  },
  corner: (w, h) => {
    const t = Math.min(w, h) * 0.5
    return only(poly([[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]]))
  },
  diagStripe: (w, h) => only(poly([[0, h * 0.5], [w * 0.5, 0], [w, 0], [0, h]])),
  plus: (w, h, a) => {
    const t = (Math.min(w, h) * (a[0] ?? 25000)) / 100000
    return only(poly([[t, 0], [w - t, 0], [w - t, t], [w, t], [w, h - t], [w - t, h - t], [w - t, h], [t, h], [t, h - t], [0, h - t], [0, t], [t, t]]))
  },
  plaque: (w, h) => {
    const r = Math.min(w, h) * 0.16667
    return only(`M${f(r)} 0 L${f(w - r)} 0 A${f(r)} ${f(r)} 0 0 0 ${f(w)} ${f(r)} L${f(w)} ${f(h - r)} A${f(r)} ${f(r)} 0 0 0 ${f(w - r)} ${f(h)} L${f(r)} ${f(h)} A${f(r)} ${f(r)} 0 0 0 0 ${f(h - r)} L0 ${f(r)} A${f(r)} ${f(r)} 0 0 0 ${f(r)} 0 Z`)
  },
  can: (w, h) => {
    const ry = Math.min(h * 0.25, Math.min(w, h) * 0.25) / 2
    const body = `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 0 ${f(w)} ${f(ry)} L${f(w)} ${f(h - ry)} A${f(w / 2)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z`
    return { paths: [{ d: body, fill: 'norm' }, { d: ellipsePath(w / 2, ry, w / 2, ry), fill: 'lighten' }], text: [0, ry * 2, w, h - ry] }
  },
  cube: (w, h) => {
    const d = Math.min(w, h) * 0.25
    return {
      paths: [
        { d: poly([[0, d], [w - d, d], [w - d, h], [0, h]]), fill: 'norm' },
        { d: poly([[0, d], [d, 0], [w, 0], [w - d, d]]), fill: 'lighten' },
        { d: poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]]), fill: 'darken' },
      ],
      text: [0, d, w - d, h],
    }
  },
  bevel: (w, h) => {
    const d = Math.min(w, h) * 0.125
    return {
      paths: [
        { d: rectPath(d, d, w - 2 * d, h - 2 * d), fill: 'norm' },
        { d: poly([[0, 0], [w, 0], [w - d, d], [d, d]]), fill: 'lighten' },
        { d: poly([[w, 0], [w, h], [w - d, h - d], [w - d, d]]), fill: 'darken' },
        { d: poly([[0, h], [d, h - d], [w - d, h - d], [w, h]]), fill: 'darken' },
        { d: poly([[0, 0], [d, d], [d, h - d], [0, h]]), fill: 'lighten' },
      ],
      text: [d, d, w - d, h - d],
    }
  },
  donut: (w, h) => {
    const t = Math.min(w, h) * 0.25
    return only(ellipsePath(w / 2, h / 2, w / 2, h / 2) + ' ' + ellipsePath(w / 2, h / 2, w / 2 - t, h / 2 - t), { evenOdd: true })
  },
  noSmoking: (w, h) => {
    const t = Math.min(w, h) * 0.18
    const rx = w / 2 - t
    const ry = h / 2 - t
    const a = Math.PI / 4
    const k = 0.18
    const bar = poly([
      [w / 2 + rx * Math.cos(-a - k), h / 2 + ry * Math.sin(-a - k)],
      [w / 2 + rx * Math.cos(-a + k), h / 2 + ry * Math.sin(-a + k)],
      [w / 2 + rx * Math.cos(Math.PI - a - k), h / 2 + ry * Math.sin(Math.PI - a - k)],
      [w / 2 + rx * Math.cos(Math.PI - a + k), h / 2 + ry * Math.sin(Math.PI - a + k)],
    ])
    return { paths: [{ d: ellipsePath(w / 2, h / 2, w / 2, h / 2) + ' ' + ellipsePath(w / 2, h / 2, rx, ry), fill: 'norm', evenOdd: true }, { d: bar, fill: 'norm' }] }
  },
  blockArc: (w, h) => {
    const t = Math.min(w, h) * 0.25
    return only(`M0 ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 0 1 ${f(w)} ${f(h / 2)} L${f(w - t)} ${f(h / 2)} A${f(w / 2 - t)} ${f(h / 2 - t)} 0 0 0 ${f(t)} ${f(h / 2)} Z`)
  },
  foldedCorner: (w, h) => {
    const d = Math.min(w, h) * 0.16667
    return { paths: [{ d: poly([[0, 0], [w, 0], [w, h - d], [w - d, h], [0, h]]), fill: 'norm' }, { d: poly([[w - d, h], [w - d * 0.8, h - d * 0.8], [w, h - d]]), fill: 'darken' }] }
  },
  smileyFace: (w, h) => ({
    paths: [
      { d: ellipsePath(w / 2, h / 2, w / 2, h / 2), fill: 'norm' },
      { d: ellipsePath(w * 0.35, h * 0.38, w * 0.05, h * 0.05) + ' ' + ellipsePath(w * 0.65, h * 0.38, w * 0.05, h * 0.05), fill: 'darken' },
      { d: `M${f(w * 0.28)} ${f(h * 0.66)} Q${f(w / 2)} ${f(h * 0.86)} ${f(w * 0.72)} ${f(h * 0.66)}`, fill: 'none' },
    ],
  }),
  heart: (w, h) =>
    only(`M${f(w / 2)} ${f(h * 0.25)} C${f(w / 2)} ${f(-h * 0.08)} ${f(-w * 0.3)} ${f(h * 0.08)} ${f(w / 2)} ${f(h)} C${f(w * 1.3)} ${f(h * 0.08)} ${f(w / 2)} ${f(-h * 0.08)} ${f(w / 2)} ${f(h * 0.25)} Z`),
  lightningBolt: (w, h) =>
    only(unit([[0.39, 0], [0.62, 0.28], [0.53, 0.33], [0.79, 0.57], [0.7, 0.62], [1, 1], [0.38, 0.69], [0.49, 0.64], [0.13, 0.43], [0.27, 0.36], [0, 0.18]], w, h)),
  sun: (w, h) => {
    const rays: string[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      const s = 0.12
      const p = (r: number, da: number): [number, number] => [w / 2 + (Math.cos(a + da) * r * w) / 2, h / 2 + (Math.sin(a + da) * r * h) / 2]
      rays.push(poly([p(1, 0), p(0.68, s), p(0.68, -s)]))
    }
    return { paths: [{ d: ellipsePath(w / 2, h / 2, w * 0.25, h * 0.25), fill: 'norm' }, { d: rays.join(' '), fill: 'norm' }], text: [w * 0.32, h * 0.32, w * 0.68, h * 0.68] }
  },
  moon: (w, h) => only(`M${f(w)} 0 A${f(w)} ${f(h / 2)} 0 0 0 ${f(w)} ${f(h)} A${f(w * 0.5)} ${f(h / 2)} 0 0 1 ${f(w)} 0 Z`),
  cloud: (w, h) => {
    const n = 9
    const pts: [number, number][] = []
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
      pts.push([w / 2 + (Math.cos(a) * w * 0.42), h / 2 + (Math.sin(a) * h * 0.38)])
    }
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n]
      const prev = pts[i - 1]
      const r = Math.hypot(p[0] - prev[0], p[1] - prev[1]) * 0.62
      d += ` A${f(r)} ${f(r)} 0 0 1 ${f(p[0])} ${f(p[1])}`
    }
    return { paths: [{ d: d + ' Z', fill: 'norm' }], text: [w * 0.15, h * 0.2, w * 0.85, h * 0.8] }
  },
  bracketPair: (w, h) => {
    const r = Math.min(w, h) * 0.16667
    return open(
      `M${f(r)} ${f(h)} A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)} L0 ${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 M${f(w - r)} 0 A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} L${f(w)} ${f(h - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)}`,
    )
  },
  bracePair: (w, h) => {
    const r = Math.min(w, h) * 0.08333
    const b = (x: number, dir: number) =>
      `M${f(x + dir * 2 * r)} 0 Q${f(x + dir * r)} 0 ${f(x + dir * r)} ${f(r)} L${f(x + dir * r)} ${f(h / 2 - r)} Q${f(x + dir * r)} ${f(h / 2)} ${f(x)} ${f(h / 2)} Q${f(x + dir * r)} ${f(h / 2)} ${f(x + dir * r)} ${f(h / 2 + r)} L${f(x + dir * r)} ${f(h - r)} Q${f(x + dir * r)} ${f(h)} ${f(x + dir * 2 * r)} ${f(h)}`
    return open(b(0, 1) + ' ' + b(w, -1))
  },
  leftBracket: (w, h) => open(`M${f(w)} ${f(h)} A${f(w)} ${f(w)} 0 0 1 0 ${f(h - w)} L0 ${f(w)} A${f(w)} ${f(w)} 0 0 1 ${f(w)} 0`),
  rightBracket: (w, h) => open(`M0 0 A${f(w)} ${f(w)} 0 0 1 ${f(w)} ${f(w)} L${f(w)} ${f(h - w)} A${f(w)} ${f(w)} 0 0 1 0 ${f(h)}`),
  leftBrace: (w, h) => open(`M${f(w)} 0 Q${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.1)} L${f(w / 2)} ${f(h * 0.4)} Q${f(w / 2)} ${f(h / 2)} 0 ${f(h / 2)} Q${f(w / 2)} ${f(h / 2)} ${f(w / 2)} ${f(h * 0.6)} L${f(w / 2)} ${f(h * 0.9)} Q${f(w / 2)} ${f(h)} ${f(w)} ${f(h)}`),
  rightBrace: (w, h) => open(`M0 0 Q${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.1)} L${f(w / 2)} ${f(h * 0.4)} Q${f(w / 2)} ${f(h / 2)} ${f(w)} ${f(h / 2)} Q${f(w / 2)} ${f(h / 2)} ${f(w / 2)} ${f(h * 0.6)} L${f(w / 2)} ${f(h * 0.9)} Q${f(w / 2)} ${f(h)} 0 ${f(h)}`),

  // Block arrows
  rightArrow: (w, h) => {
    const t = h * 0.25
    const head = Math.min(w, h * 0.5) || 0
    return only(poly([[0, t], [w - head, t], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h - t], [0, h - t]]))
  },
  leftArrow: (w, h) => {
    const t = h * 0.25
    const head = Math.min(w, h * 0.5)
    return only(poly([[w, t], [head, t], [head, 0], [0, h / 2], [head, h], [head, h - t], [w, h - t]]))
  },
  upArrow: (w, h) => {
    const t = w * 0.25
    const head = Math.min(h, w * 0.5)
    return only(poly([[t, h], [t, head], [0, head], [w / 2, 0], [w, head], [w - t, head], [w - t, h]]))
  },
  downArrow: (w, h) => {
    const t = w * 0.25
    const head = Math.min(h, w * 0.5)
    return only(poly([[t, 0], [w - t, 0], [w - t, h - head], [w, h - head], [w / 2, h], [0, h - head], [t, h - head]]))
  },
  leftRightArrow: (w, h) => {
    const t = h * 0.25
    const head = Math.min(w / 2, h * 0.5)
    return only(poly([[0, h / 2], [head, 0], [head, t], [w - head, t], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h - t], [head, h - t], [head, h]]))
  },
  upDownArrow: (w, h) => {
    const t = w * 0.25
    const head = Math.min(h / 2, w * 0.5)
    return only(poly([[w / 2, 0], [w, head], [w - t, head], [w - t, h - head], [w, h - head], [w / 2, h], [0, h - head], [t, h - head], [t, head], [0, head]]))
  },
  quadArrow: (w, h) => {
    const s = Math.min(w, h)
    const t = s * 0.1125
    const hd = s * 0.225
    const hw = s * 0.225
    const cx = w / 2
    const cy = h / 2
    return only(
      poly([
        [cx, 0], [cx + hw, hd], [cx + t, hd], [cx + t, cy - t], [w - hd, cy - t], [w - hd, cy - hw], [w, cy], [w - hd, cy + hw], [w - hd, cy + t], [cx + t, cy + t], [cx + t, h - hd], [cx + hw, h - hd],
        [cx, h], [cx - hw, h - hd], [cx - t, h - hd], [cx - t, cy + t], [hd, cy + t], [hd, cy + hw], [0, cy], [hd, cy - hw], [hd, cy - t], [cx - t, cy - t], [cx - t, hd], [cx - hw, hd],
      ]),
    )
  },
  chevron: (w, h) => {
    const d = Math.min(w, h * 0.5)
    return only(poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]))
  },
  homePlate: (w, h) => {
    const d = Math.min(w, h * 0.5)
    return only(poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h]]))
  },
  notchedRightArrow: (w, h) => {
    const t = h * 0.25
    const head = Math.min(w, h * 0.5)
    return only(poly([[0, t], [w - head, t], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h - t], [0, h - t], [head * 0.5, h / 2]]))
  },
  stripedRightArrow: (w, h) => {
    const t = h * 0.25
    const head = Math.min(w, h * 0.5)
    const s = h * 0.0625
    return {
      paths: [
        { d: poly([[s * 5, t], [w - head, t], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h - t], [s * 5, h - t]]), fill: 'norm' },
        { d: rectPath(0, t, s, h - 2 * t) + ' ' + rectPath(s * 2, t, s * 2, h - 2 * t), fill: 'norm' },
      ],
    }
  },
  bentArrow: (w, h) => {
    const t = Math.min(w, h) * 0.25
    const head = Math.min(w, h) * 0.25
    return only(`M0 ${f(h)} L0 ${f(head + t)} Q0 ${f(head - t / 2)} ${f(t * 1.5)} ${f(head - t / 2)} L${f(w - head)} ${f(head - t / 2)} L${f(w - head)} 0 L${f(w)} ${f(head)} L${f(w - head)} ${f(head * 2)} L${f(w - head)} ${f(head + t / 2)} L${f(t * 1.5)} ${f(head + t / 2)} Q${f(t)} ${f(head + t / 2)} ${f(t)} ${f(head + t)} L${f(t)} ${f(h)} Z`)
  },
  uturnArrow: (w, h) => {
    const t = Math.min(w, h) * 0.25
    const r = Math.min(w * 0.4, h * 0.4)
    const hx = w - t * 1.5
    return only(
      `M0 ${f(h)} L0 ${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 L${f(hx - r + t / 2)} 0 A${f(r - t / 2)} ${f(r - t / 2)} 0 0 1 ${f(hx + t / 2)} ${f(r - t / 2)} L${f(hx + t / 2)} ${f(h * 0.6)} L${f(w)} ${f(h * 0.6)} L${f(hx)} ${f(h)} L${f(hx - t * 1.5)} ${f(h * 0.6)} L${f(hx - t / 2)} ${f(h * 0.6)} L${f(hx - t / 2)} ${f(r)} A${f(Math.max(1, r - t * 1.5))} ${f(Math.max(1, r - t * 1.5))} 0 0 0 ${f(hx - r)} ${f(t)} L${f(r)} ${f(t)} A${f(r - t)} ${f(r - t)} 0 0 0 ${f(t)} ${f(r)} L${f(t)} ${f(h)} Z`,
    )
  },

  // Equation shapes
  mathPlus: (w, h) => {
    const t = Math.min(w, h) * 0.1176
    const m = Math.min(w, h) * 0.12
    return only(poly([[w / 2 - t, m], [w / 2 + t, m], [w / 2 + t, h / 2 - t], [w - m, h / 2 - t], [w - m, h / 2 + t], [w / 2 + t, h / 2 + t], [w / 2 + t, h - m], [w / 2 - t, h - m], [w / 2 - t, h / 2 + t], [m, h / 2 + t], [m, h / 2 - t], [w / 2 - t, h / 2 - t]]))
  },
  mathMinus: (w, h) => {
    const t = h * 0.1176
    return only(rectPath(w * 0.12, h / 2 - t, w * 0.76, 2 * t))
  },
  mathMultiply: (w, h) => {
    const s = Math.min(w, h)
    const t = s * 0.083
    const r = s * 0.36
    const cross: [number, number][] = [[-t, -r], [t, -r], [t, -t], [r, -t], [r, t], [t, t], [t, r], [-t, r], [-t, t], [-r, t], [-r, -t], [-t, -t]]
    const c = Math.SQRT1_2
    return only(poly(cross.map(([x, y]) => [w / 2 + (x - y) * c, h / 2 + (x + y) * c])))
  },
  mathDivide: (w, h) => {
    const t = h * 0.1176
    const r = Math.min(w, h) * 0.1
    return only(rectPath(w * 0.12, h / 2 - t / 1.4, w * 0.76, (2 * t) / 1.4) + ' ' + ellipsePath(w / 2, h * 0.24, r, r) + ' ' + ellipsePath(w / 2, h * 0.76, r, r))
  },
  mathEqual: (w, h) => {
    const t = h * 0.1176
    return only(rectPath(w * 0.12, h * 0.5 - t * 1.6, w * 0.76, t * 1.3) + ' ' + rectPath(w * 0.12, h * 0.5 + t * 0.3, w * 0.76, t * 1.3))
  },
  mathNotEqual: (w, h) => {
    const t = h * 0.1176
    return {
      paths: [
        { d: rectPath(w * 0.12, h * 0.5 - t * 1.6, w * 0.76, t * 1.3) + ' ' + rectPath(w * 0.12, h * 0.5 + t * 0.3, w * 0.76, t * 1.3), fill: 'norm' },
        { d: poly([[w * 0.58, h * 0.1], [w * 0.68, h * 0.13], [w * 0.42, h * 0.9], [w * 0.32, h * 0.87]]), fill: 'norm' },
      ],
    }
  },

  // Flowchart
  flowChartProcess: (w, h) => only(rectPath(0, 0, w, h)),
  flowChartAlternateProcess: (w, h) => {
    const r = Math.min(w, h) * 0.16667
    return only(roundRectPath(0, 0, w, h, [r, r, r, r]))
  },
  flowChartDecision: (w, h) => ({ paths: [{ d: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), fill: 'norm' }], text: [w / 4, h / 4, (w * 3) / 4, (h * 3) / 4] }),
  flowChartInputOutput: (w, h) => only(poly([[w * 0.2, 0], [w, 0], [w * 0.8, h], [0, h]])),
  flowChartPredefinedProcess: (w, h) => ({
    paths: [
      { d: rectPath(0, 0, w, h), fill: 'norm' },
      { d: `M${f(w * 0.125)} 0 L${f(w * 0.125)} ${f(h)} M${f(w * 0.875)} 0 L${f(w * 0.875)} ${f(h)}`, fill: 'none' },
    ],
    text: [w * 0.125, 0, w * 0.875, h],
  }),
  flowChartInternalStorage: (w, h) => ({
    paths: [
      { d: rectPath(0, 0, w, h), fill: 'norm' },
      { d: `M${f(w * 0.2)} 0 L${f(w * 0.2)} ${f(h)} M0 ${f(h * 0.2)} L${f(w)} ${f(h * 0.2)}`, fill: 'none' },
    ],
  }),
  flowChartDocument: (w, h) => only(`M0 0 L${f(w)} 0 L${f(w)} ${f(h * 0.83)} C${f(w * 0.75)} ${f(h * 0.7)} ${f(w * 0.45)} ${f(h * 1.08)} 0 ${f(h * 0.92)} Z`),
  flowChartMultidocument: (w, h) => ({
    paths: [
      { d: poly([[w * 0.1, h * 0.1], [w * 0.1, 0], [w, 0], [w, h * 0.7], [w * 0.92, h * 0.7]], false), fill: 'none' },
      { d: poly([[w * 0.05, h * 0.15], [w * 0.05, h * 0.07], [w * 0.95, h * 0.07], [w * 0.95, h * 0.77], [w * 0.88, h * 0.77]], false), fill: 'none' },
      { d: `M0 ${f(h * 0.14)} L${f(w * 0.88)} ${f(h * 0.14)} L${f(w * 0.88)} ${f(h * 0.85)} C${f(w * 0.66)} ${f(h * 0.74)} ${f(w * 0.4)} ${f(h * 1.08)} 0 ${f(h * 0.93)} Z`, fill: 'norm' },
    ],
  }),
  flowChartTerminator: (w, h) => {
    const r = Math.min(h / 2, w / 2)
    return only(roundRectPath(0, 0, w, h, [r, r, r, r]))
  },
  flowChartPreparation: (w, h) => only(poly([[w * 0.2, 0], [w * 0.8, 0], [w, h / 2], [w * 0.8, h], [w * 0.2, h], [0, h / 2]])),
  flowChartManualInput: (w, h) => only(poly([[0, h * 0.2], [w, 0], [w, h], [0, h]])),
  flowChartManualOperation: (w, h) => only(poly([[0, 0], [w, 0], [w * 0.8, h], [w * 0.2, h]])),
  flowChartConnector: (w, h) => GEN.ellipse(w, h, []),
  flowChartOffpageConnector: (w, h) => only(poly([[0, 0], [w, 0], [w, h * 0.8], [w / 2, h], [0, h * 0.8]])),
  flowChartPunchedCard: (w, h) => only(poly([[w * 0.2, 0], [w, 0], [w, h], [0, h], [0, h * 0.2]])),
  flowChartSummingJunction: (w, h) => ({
    paths: [
      { d: ellipsePath(w / 2, h / 2, w / 2, h / 2), fill: 'norm' },
      { d: `M${f(w * 0.146)} ${f(h * 0.146)} L${f(w * 0.854)} ${f(h * 0.854)} M${f(w * 0.854)} ${f(h * 0.146)} L${f(w * 0.146)} ${f(h * 0.854)}`, fill: 'none' },
    ],
  }),
  flowChartOr: (w, h) => ({
    paths: [
      { d: ellipsePath(w / 2, h / 2, w / 2, h / 2), fill: 'norm' },
      { d: `M${f(w / 2)} 0 L${f(w / 2)} ${f(h)} M0 ${f(h / 2)} L${f(w)} ${f(h / 2)}`, fill: 'none' },
    ],
  }),
  flowChartCollate: (w, h) => only(poly([[0, 0], [w, 0], [0, h], [w, h]])),
  flowChartSort: (w, h) => ({ paths: [{ d: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), fill: 'norm' }, { d: `M0 ${f(h / 2)} L${f(w)} ${f(h / 2)}`, fill: 'none' }] }),
  flowChartExtract: (w, h) => only(poly([[w / 2, 0], [w, h], [0, h]])),
  flowChartMerge: (w, h) => only(poly([[0, 0], [w, 0], [w / 2, h]])),
  flowChartDelay: (w, h) => only(`M0 0 L${f(w / 2)} 0 A${f(w / 2)} ${f(h / 2)} 0 0 1 ${f(w / 2)} ${f(h)} L0 ${f(h)} Z`),
  flowChartMagneticDisk: (w, h) => GEN.can(w, h, []),
  flowChartDisplay: (w, h) => only(`M0 ${f(h / 2)} L${f(w / 6)} 0 L${f((w * 5) / 6)} 0 A${f(w / 6)} ${f(h / 2)} 0 0 1 ${f((w * 5) / 6)} ${f(h)} L${f(w / 6)} ${f(h)} Z`),

  // Stars and banners
  star4: (w, h) => only(star(4, 0.25, w, h)),
  star5: (w, h) => only(star(5, 0.382, w, h)),
  star6: (w, h) => only(star(6, 0.577, w, h)),
  star7: (w, h) => only(star(7, 0.692, w, h)),
  star8: (w, h) => only(star(8, 0.765, w, h)),
  star10: (w, h) => only(star(10, 0.85, w, h)),
  star12: (w, h) => only(star(12, 0.75, w, h)),
  star16: (w, h) => only(star(16, 0.75, w, h)),
  star24: (w, h) => only(star(24, 0.75, w, h)),
  star32: (w, h) => only(star(32, 0.75, w, h)),
  irregularSeal1: (w, h) =>
    only(
      unit(
        [
          [0.5, 0.27], [0.67, 0], [0.66, 0.25], [0.85, 0.21], [0.77, 0.34], [0.98, 0.38], [0.82, 0.48], [1, 0.62], [0.78, 0.6], [0.84, 0.84], [0.65, 0.67], [0.61, 0.91], [0.49, 0.69], [0.39, 1],
          [0.36, 0.72], [0.22, 0.82], [0.26, 0.64], [0.01, 0.68], [0.17, 0.54], [0, 0.4], [0.21, 0.35], [0.02, 0.11], [0.34, 0.29], [0.39, 0.11],
        ],
        w,
        h,
      ),
    ),
  wave: (w, h) => {
    const a = h * 0.125
    return only(`M0 ${f(a)} C${f(w / 3)} ${f(-a)} ${f((w * 2) / 3)} ${f(a * 3)} ${f(w)} ${f(a)} L${f(w)} ${f(h - a)} C${f((w * 2) / 3)} ${f(h + a)} ${f(w / 3)} ${f(h - a * 3)} 0 ${f(h - a)} Z`)
  },
  doubleWave: (w, h) => {
    const a = h * 0.0625
    return only(
      `M0 ${f(a)} C${f(w / 6)} ${f(-a)} ${f(w / 3)} ${f(a * 3)} ${f(w / 2)} ${f(a)} C${f((w * 2) / 3)} ${f(-a)} ${f((w * 5) / 6)} ${f(a * 3)} ${f(w)} ${f(a)} L${f(w)} ${f(h - a)} C${f((w * 5) / 6)} ${f(h + a)} ${f((w * 2) / 3)} ${f(h - a * 3)} ${f(w / 2)} ${f(h - a)} C${f(w / 3)} ${f(h + a)} ${f(w / 6)} ${f(h - a * 3)} 0 ${f(h - a)} Z`,
    )
  },
  ribbon2: (w, h) => {
    const e = w / 8
    const fold = h / 4
    return {
      paths: [
        { d: poly([[0, fold], [e * 1.5, fold], [e * 1.5, h], [0, h], [e * 0.6, (h + fold) / 2]]), fill: 'darken' },
        { d: poly([[w, fold], [w - e * 1.5, fold], [w - e * 1.5, h], [w, h], [w - e * 0.6, (h + fold) / 2]]), fill: 'darken' },
        { d: rectPath(e, 0, w - 2 * e, h - fold), fill: 'norm' },
      ],
      text: [e, 0, w - e, h - fold],
    }
  },

  // Callouts
  wedgeRectCallout: (w, h) => only(poly([[0, 0], [w, 0], [w, h * 0.75], [w * 0.58, h * 0.75], [w * 0.29, h], [w * 0.42, h * 0.75], [0, h * 0.75]])),
  wedgeRoundRectCallout: (w, h) => {
    const r = Math.min(w, h * 0.75) * 0.16667
    const b = h * 0.75
    return only(`M${f(r)} 0 L${f(w - r)} 0 A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} L${f(w)} ${f(b - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(b)} L${f(w * 0.58)} ${f(b)} L${f(w * 0.29)} ${f(h)} L${f(w * 0.42)} ${f(b)} L${f(r)} ${f(b)} A${f(r)} ${f(r)} 0 0 1 0 ${f(b - r)} L0 ${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`)
  },
  wedgeEllipseCallout: (w, h) => {
    const ry = h * 0.4
    const cy = ry
    const a1 = Math.PI * 0.62
    const a2 = Math.PI * 0.72
    const p1 = [w / 2 + (w / 2) * Math.cos(a1), cy + ry * Math.sin(a1)]
    const p2 = [w / 2 + (w / 2) * Math.cos(a2), cy + ry * Math.sin(a2)]
    return only(`M${f(p1[0])} ${f(p1[1])} A${f(w / 2)} ${f(ry)} 0 1 0 ${f(p2[0])} ${f(p2[1])} L${f(w * 0.2)} ${f(h)} Z`)
  },
  cloudCallout: (w, h) => {
    const c = GEN.cloud(w, h * 0.8, [])
    return {
      paths: [...c.paths, { d: ellipsePath(w * 0.25, h * 0.86, w * 0.045, h * 0.035) + ' ' + ellipsePath(w * 0.18, h * 0.96, w * 0.025, h * 0.02), fill: 'norm' }],
      text: [w * 0.15, h * 0.16, w * 0.85, h * 0.64],
    }
  },
  borderCallout1: (w, h) => ({
    paths: [
      { d: rectPath(0, 0, w, h * 0.7), fill: 'norm' },
      { d: `M${f(w * 0.1)} ${f(h * 0.7)} L${f(-w * 0.05)} ${f(h)}`, fill: 'none' },
    ],
    text: [0, 0, w, h * 0.7],
  }),
}

/** Action buttons: a framed button with an icon (navigation is set as the object's link). */
function actionButton(icon: (w: number, h: number, s: number, cx: number, cy: number) => string) {
  return (w: number, h: number) => {
    const s = Math.min(w, h) * 0.35
    const cx = w / 2
    const cy = h / 2
    return { paths: [{ d: poly([[0, 0], [w, 0], [w, h], [0, h]]), fill: 'norm' as const }, { d: icon(w, h, s, cx, cy), fill: 'darken' as const }] }
  }
}

const ACTION_GEN: Record<string, ReturnType<typeof actionButton>> = {
  actionButtonBlank: actionButton(() => 'M0 0'),
  actionButtonBackPrevious: actionButton((_w, _h, s, cx, cy) => poly([[cx + s, cy - s], [cx + s, cy + s], [cx - s, cy]])),
  actionButtonForwardNext: actionButton((_w, _h, s, cx, cy) => poly([[cx - s, cy - s], [cx - s, cy + s], [cx + s, cy]])),
  actionButtonBeginning: actionButton((_w, _h, s, cx, cy) => `${poly([[cx + s, cy - s], [cx + s, cy + s], [cx - s * 0.6, cy]])} ${poly([[cx - s, cy - s], [cx - s * 0.7, cy - s], [cx - s * 0.7, cy + s], [cx - s, cy + s]])}`),
  actionButtonEnd: actionButton((_w, _h, s, cx, cy) => `${poly([[cx - s, cy - s], [cx - s, cy + s], [cx + s * 0.6, cy]])} ${poly([[cx + s * 0.7, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx + s * 0.7, cy + s]])}`),
  actionButtonHome: actionButton((_w, _h, s, cx, cy) => poly([[cx, cy - s], [cx + s, cy], [cx + s * 0.7, cy], [cx + s * 0.7, cy + s], [cx - s * 0.7, cy + s], [cx - s * 0.7, cy], [cx - s, cy]])),
  actionButtonReturn: actionButton((_w, _h, s, cx, cy) => `M${f(cx + s)} ${f(cy - s * 0.6)} L${f(cx + s)} ${f(cy + s * 0.4)} L${f(cx - s * 0.4)} ${f(cy + s * 0.4)} L${f(cx - s * 0.4)} ${f(cy + s)} L${f(cx - s)} ${f(cy + s * 0.1)} L${f(cx - s * 0.4)} ${f(cy - s * 0.8)} L${f(cx - s * 0.4)} ${f(cy - s * 0.2)} L${f(cx + s * 0.6)} ${f(cy - s * 0.2)} L${f(cx + s * 0.6)} ${f(cy - s * 0.6)} Z`),
}
Object.assign(GEN, ACTION_GEN)

/** Slide show link of each action button. */
export const ACTION_LINKS: Record<string, string> = { actionButtonBackPrevious: '#prev', actionButtonForwardNext: '#next', actionButtonBeginning: '#first', actionButtonEnd: '#last', actionButtonHome: '#first', actionButtonReturn: '#prev' }

export const SHAPE_PRESETS: ShapePreset[] = [
  { id: 'line', prst: 'line', label: tx('Line'), category: 'Lines', open: true },
  { id: 'lineArrow', prst: 'line', label: tx('Line Arrow'), category: 'Lines', open: true, tail: 'triangle' },
  { id: 'lineDoubleArrow', prst: 'line', label: tx('Line Arrow: Double'), category: 'Lines', open: true, head: 'triangle', tail: 'triangle' },
  { id: 'bentConnector3', prst: 'bentConnector3', label: tx('Connector: Elbow'), category: 'Lines', open: true },
  { id: 'bentConnectorArrow', prst: 'bentConnector3', label: tx('Connector: Elbow Arrow'), category: 'Lines', open: true, tail: 'triangle' },
  { id: 'curvedConnector3', prst: 'curvedConnector3', label: tx('Connector: Curved'), category: 'Lines', open: true },
  { id: 'curvedConnectorArrow', prst: 'curvedConnector3', label: tx('Connector: Curved Arrow'), category: 'Lines', open: true, tail: 'triangle' },
  { id: 'curve', prst: 'curve', label: tx('Curve'), category: 'Lines', open: true },
  { id: 'freeform', prst: 'freeform', label: tx('Freeform: Shape'), category: 'Lines', open: true },
  { id: 'scribble', prst: 'scribble', label: tx('Freeform: Scribble'), category: 'Lines', open: true },
  { id: 'arc', prst: 'arc', label: tx('Arc'), category: 'Basic Shapes', open: true },
  ...(
    [
      ['rect', tx('Rectangle')], ['roundRect', tx('Rectangle: Rounded Corners')], ['snip1Rect', tx('Rectangle: Single Corner Snipped')], ['snip2SameRect', tx('Rectangle: Top Corners Snipped')],
      ['snip2DiagRect', tx('Rectangle: Diagonal Corners Snipped')], ['snipRoundRect', tx('Rectangle: Top Corners One Rounded and One Snipped')], ['round1Rect', tx('Rectangle: Single Corner Rounded')],
      ['round2SameRect', tx('Rectangle: Top Corners Rounded')], ['round2DiagRect', tx('Rectangle: Diagonal Corners Rounded')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label, category: 'Rectangles' as const })),
  ...(
    [
      ['ellipse', tx('Oval')], ['triangle', tx('Isosceles Triangle')], ['rtTriangle', tx('Right Triangle')], ['parallelogram', tx('Parallelogram')], ['trapezoid', tx('Trapezoid')], ['diamond', tx('Diamond')],
      ['pentagon', tx('Regular Pentagon')], ['hexagon', tx('Hexagon')], ['heptagon', tx('Heptagon')], ['octagon', tx('Octagon')], ['decagon', tx('Decagon')], ['dodecagon', tx('Dodecagon')], ['pie', tx('Partial Circle')],
      ['chord', tx('Chord')], ['teardrop', tx('Teardrop')], ['frame', tx('Frame')], ['halfFrame', tx('Half Frame')], ['corner', tx('L-Shape')], ['diagStripe', tx('Diagonal Stripe')], ['plus', tx('Cross')],
      ['plaque', tx('Plaque')], ['can', tx('Cylinder')], ['cube', tx('Cube')], ['bevel', tx('Rectangle: Beveled')], ['donut', tx('Circle: Hollow')], ['noSmoking', tx('"No" Symbol')], ['blockArc', tx('Block Arc')],
      ['foldedCorner', tx('Rectangle: Folded Corner')], ['smileyFace', tx('Smiley Face')], ['heart', tx('Heart')], ['lightningBolt', tx('Lightning Bolt')], ['sun', tx('Sun')], ['moon', tx('Moon')], ['cloud', tx('Cloud')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label, category: 'Basic Shapes' as const })),
  ...(
    [
      ['bracketPair', tx('Double Bracket')], ['bracePair', tx('Double Brace')], ['leftBracket', tx('Left Bracket')], ['rightBracket', tx('Right Bracket')], ['leftBrace', tx('Left Brace')], ['rightBrace', tx('Right Brace')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label, category: 'Basic Shapes' as const, open: true })),
  ...(
    [
      ['rightArrow', tx('Arrow: Right')], ['leftArrow', tx('Arrow: Left')], ['upArrow', tx('Arrow: Up')], ['downArrow', tx('Arrow: Down')], ['leftRightArrow', tx('Arrow: Left-Right')], ['upDownArrow', tx('Arrow: Up-Down')],
      ['quadArrow', tx('Arrow: Quad')], ['bentArrow', tx('Arrow: Bent')], ['uturnArrow', tx('Arrow: U-Turn')], ['stripedRightArrow', tx('Arrow: Striped Right')], ['notchedRightArrow', tx('Arrow: Notched Right')],
      ['homePlate', tx('Arrow: Pentagon')], ['chevron', tx('Arrow: Chevron')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label, category: 'Block Arrows' as const })),
  ...(
    [
      ['mathPlus', tx('Plus Sign')], ['mathMinus', tx('Minus Sign')], ['mathMultiply', tx('Multiplication Sign')], ['mathDivide', tx('Division Sign')], ['mathEqual', tx('Equal')], ['mathNotEqual', tx('Not Equal')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label, category: 'Equation Shapes' as const })),
  ...(
    [
      ['flowChartProcess', tx('Process')], ['flowChartAlternateProcess', tx('Alternate Process')], ['flowChartDecision', tx('Decision')], ['flowChartInputOutput', tx('Data')],
      ['flowChartPredefinedProcess', tx('Predefined Process')], ['flowChartInternalStorage', tx('Internal Storage')], ['flowChartDocument', tx('Document')], ['flowChartMultidocument', tx('Multidocument')],
      ['flowChartTerminator', tx('Terminator')], ['flowChartPreparation', tx('Preparation')], ['flowChartManualInput', tx('Manual Input')], ['flowChartManualOperation', tx('Manual Operation')],
      ['flowChartConnector', tx('Connector')], ['flowChartOffpageConnector', tx('Off-page Connector')], ['flowChartPunchedCard', tx('Card')], ['flowChartSummingJunction', tx('Summing Junction')],
      ['flowChartOr', tx('Or')], ['flowChartCollate', tx('Collate')], ['flowChartSort', tx('Sort')], ['flowChartExtract', tx('Extract')], ['flowChartMerge', tx('Merge')], ['flowChartDelay', tx('Delay')],
      ['flowChartMagneticDisk', tx('Magnetic Disk')], ['flowChartDisplay', tx('Display')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label: `Flowchart: ${label}`, category: 'Flowchart' as const })),
  ...(
    [
      ['irregularSeal1', tx('Explosion')], ['star4', tx('Star: 4 Points')], ['star5', tx('Star: 5 Points')], ['star6', tx('Star: 6 Points')], ['star7', tx('Star: 7 Points')], ['star8', tx('Star: 8 Points')],
      ['star10', tx('Star: 10 Points')], ['star12', tx('Star: 12 Points')], ['star16', tx('Star: 16 Points')], ['star24', tx('Star: 24 Points')], ['star32', tx('Star: 32 Points')], ['ribbon2', tx('Ribbon: Tilted Up')],
      ['wave', tx('Wave')], ['doubleWave', tx('Double Wave')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label, category: 'Stars and Banners' as const })),
  ...(
    [
      ['wedgeRectCallout', tx('Speech Bubble: Rectangle')], ['wedgeRoundRectCallout', tx('Speech Bubble: Rectangle with Corners Rounded')], ['wedgeEllipseCallout', tx('Speech Bubble: Oval')],
      ['cloudCallout', tx('Thought Bubble: Cloud')], ['borderCallout1', tx('Callout: Line')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label, category: 'Callouts' as const })),
  ...(
    [
      ['actionButtonBackPrevious', tx('Action Button: Go Back or Previous')], ['actionButtonForwardNext', tx('Action Button: Go Forward or Next')], ['actionButtonBeginning', tx('Action Button: Go to Beginning')],
      ['actionButtonEnd', tx('Action Button: Go to End')], ['actionButtonHome', tx('Action Button: Go Home')], ['actionButtonReturn', tx('Action Button: Return')], ['actionButtonBlank', tx('Action Button: Blank')],
    ] as const
  ).map(([prst, label]) => ({ id: prst, prst, label, category: 'Action Buttons' as const })),
]

export const SHAPE_CATEGORIES: ShapeCategory[] = ['Lines', 'Rectangles', 'Basic Shapes', 'Block Arrows', 'Equation Shapes', 'Flowchart', 'Stars and Banners', 'Callouts', 'Action Buttons']

/** Gallery headings of the shape categories. */
export const SHAPE_CATEGORY_LABELS: Record<ShapeCategory, string> = {
  Lines: tx('Lines'),
  Rectangles: tx('Rectangles'),
  'Basic Shapes': tx('Basic Shapes'),
  'Block Arrows': tx('Block Arrows'),
  'Equation Shapes': tx('Equation Shapes'),
  Flowchart: tx('Flowchart'),
  'Stars and Banners': tx('Stars and Banners'),
  Callouts: tx('Callouts'),
  'Action Buttons': tx('Action Buttons'),
}

/** The shape's name in the interface language (as shown in the galleries). */
export function presetTitle(preset: Pick<ShapePreset, 'label'>) {
  const flow = /^Flowchart: (.*)$/.exec(preset.label)
  return flow ? t('Flowchart: {name}', { name: t(flow[1]) }) : t(preset.label)
}

export const OPEN_SHAPES = new Set(['line', 'straightConnector1', 'bentConnector3', 'curvedConnector3', 'arc', 'bracketPair', 'bracePair', 'leftBracket', 'rightBracket', 'leftBrace', 'rightBrace'])

/** Shapes drawn as a line between two corner points (resized by their end points). */
export const LINE_SHAPES = new Set(['line', 'straightConnector1', 'bentConnector3', 'curvedConnector3'])
/** Gallery entries that start a drawing tool instead of inserting a preset shape. */
export const DRAW_TOOLS = new Set(['curve', 'freeform', 'scribble'])

export function hasGeometry(prst: string) {
  return prst in GEN
}

export function geometry(prst: string, w: number, h: number, adj: number[] = []): Geometry {
  const gen = GEN[prst] ?? GEN.rect
  return gen(Math.max(w, 0.01), Math.max(h, 0.01), adj)
}

export function presetLabel(prst: string) {
  return SHAPE_PRESETS.find((p) => p.prst === prst)?.label ?? prst
}

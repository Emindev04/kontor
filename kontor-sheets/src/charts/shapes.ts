import { tx } from '../i18n'
// Preset shapes drawn as SVG paths. Ids match the file format's preset geometry names so
// shapes survive a save and reopen.
export type ShapeDef = { id: string; label: string; group: 'Lines' | 'Rectangles' | 'Basic Shapes' | 'Block Arrows' | 'Flowchart' | 'Stars' | 'Callouts'; line?: boolean }

export const SHAPES: ShapeDef[] = [
  { id: 'line', label: tx('Line'), group: 'Lines', line: true },
  { id: 'straightConnector1', label: tx('Arrow'), group: 'Lines', line: true },
  { id: 'doubleArrowLine', label: tx('Double Arrow'), group: 'Lines', line: true },
  { id: 'rect', label: tx('Rectangle'), group: 'Rectangles' },
  { id: 'roundRect', label: tx('Rectangle: Rounded Corners'), group: 'Rectangles' },
  { id: 'snip1Rect', label: tx('Rectangle: Single Corner Snipped'), group: 'Rectangles' },
  { id: 'frame', label: tx('Frame'), group: 'Rectangles' },
  { id: 'ellipse', label: tx('Oval'), group: 'Basic Shapes' },
  { id: 'triangle', label: tx('Isosceles Triangle'), group: 'Basic Shapes' },
  { id: 'rtTriangle', label: tx('Right Triangle'), group: 'Basic Shapes' },
  { id: 'parallelogram', label: tx('Parallelogram'), group: 'Basic Shapes' },
  { id: 'trapezoid', label: tx('Trapezoid'), group: 'Basic Shapes' },
  { id: 'diamond', label: tx('Diamond'), group: 'Basic Shapes' },
  { id: 'pentagon', label: tx('Regular Pentagon'), group: 'Basic Shapes' },
  { id: 'hexagon', label: tx('Hexagon'), group: 'Basic Shapes' },
  { id: 'octagon', label: tx('Octagon'), group: 'Basic Shapes' },
  { id: 'plus', label: tx('Cross'), group: 'Basic Shapes' },
  { id: 'donut', label: tx('Circle: Hollow'), group: 'Basic Shapes' },
  { id: 'noSmoking', label: tx('"Not Allowed" Symbol'), group: 'Basic Shapes' },
  { id: 'can', label: tx('Cylinder'), group: 'Basic Shapes' },
  { id: 'cube', label: tx('Cube'), group: 'Basic Shapes' },
  { id: 'heart', label: tx('Heart'), group: 'Basic Shapes' },
  { id: 'lightningBolt', label: tx('Lightning Bolt'), group: 'Basic Shapes' },
  { id: 'moon', label: tx('Moon'), group: 'Basic Shapes' },
  { id: 'smileyFace', label: tx('Smiley Face'), group: 'Basic Shapes' },
  { id: 'cloud', label: tx('Cloud'), group: 'Basic Shapes' },
  { id: 'rightArrow', label: tx('Arrow: Right'), group: 'Block Arrows' },
  { id: 'leftArrow', label: tx('Arrow: Left'), group: 'Block Arrows' },
  { id: 'upArrow', label: tx('Arrow: Up'), group: 'Block Arrows' },
  { id: 'downArrow', label: tx('Arrow: Down'), group: 'Block Arrows' },
  { id: 'leftRightArrow', label: tx('Arrow: Left-Right'), group: 'Block Arrows' },
  { id: 'upDownArrow', label: tx('Arrow: Up-Down'), group: 'Block Arrows' },
  { id: 'chevron', label: tx('Arrow: Chevron'), group: 'Block Arrows' },
  { id: 'homePlate', label: tx('Arrow: Pentagon'), group: 'Block Arrows' },
  { id: 'flowChartProcess', label: tx('Flowchart: Process'), group: 'Flowchart' },
  { id: 'flowChartAlternateProcess', label: tx('Flowchart: Alternate Process'), group: 'Flowchart' },
  { id: 'flowChartDecision', label: tx('Flowchart: Decision'), group: 'Flowchart' },
  { id: 'flowChartInputOutput', label: tx('Flowchart: Data'), group: 'Flowchart' },
  { id: 'flowChartPredefinedProcess', label: tx('Flowchart: Predefined Process'), group: 'Flowchart' },
  { id: 'flowChartDocument', label: tx('Flowchart: Document'), group: 'Flowchart' },
  { id: 'flowChartTerminator', label: tx('Flowchart: Terminator'), group: 'Flowchart' },
  { id: 'flowChartConnector', label: tx('Flowchart: Connector'), group: 'Flowchart' },
  { id: 'star4', label: tx('Star: 4 Points'), group: 'Stars' },
  { id: 'star5', label: tx('Star: 5 Points'), group: 'Stars' },
  { id: 'star6', label: tx('Star: 6 Points'), group: 'Stars' },
  { id: 'star8', label: tx('Star: 8 Points'), group: 'Stars' },
  { id: 'wedgeRectCallout', label: tx('Speech Bubble: Rectangle'), group: 'Callouts' },
  { id: 'wedgeRoundRectCallout', label: tx('Speech Bubble: Rectangle with Corners Rounded'), group: 'Callouts' },
  { id: 'wedgeEllipseCallout', label: tx('Speech Bubble: Oval'), group: 'Callouts' },
]

const poly = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + 'Z'

function star(n: number, w: number, h: number, inner: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const r = i % 2 ? inner : 1
    pts.push([w / 2 + (Math.cos(a) * r * w) / 2, h / 2 + (Math.sin(a) * r * h) / 2])
  }
  return poly(pts)
}

function regular(n: number, w: number, h: number, rot = -Math.PI / 2) {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n
    pts.push([w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2])
  }
  return poly(pts)
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, ccw = false) =>
  `M${cx - rx},${cy}a${rx},${ry} 0 1,${ccw ? 0 : 1} ${2 * rx},0a${rx},${ry} 0 1,${ccw ? 0 : 1} ${-2 * rx},0Z`

/** SVG path for a preset at the given size. Extra details (faces, cube edges) come back in `extra`. */
export function shapePath(id: string, w: number, h: number): { d: string; extra?: string; open?: boolean } {
  const m = Math.min(w, h)
  switch (id) {
    case 'line':
    case 'straightConnector1':
    case 'doubleArrowLine':
      return { d: `M0,0L${w},${h}`, open: true }
    case 'rect':
    case 'flowChartProcess':
      return { d: `M0,0H${w}V${h}H0Z` }
    case 'roundRect':
    case 'flowChartAlternateProcess': {
      const r = m * 0.16
      return { d: `M${r},0H${w - r}Q${w},0 ${w},${r}V${h - r}Q${w},${h} ${w - r},${h}H${r}Q0,${h} 0,${h - r}V${r}Q0,0 ${r},0Z` }
    }
    case 'snip1Rect': {
      const s = m * 0.18
      return { d: poly([[0, 0], [w - s, 0], [w, s], [w, h], [0, h]]) }
    }
    case 'frame': {
      const t = m * 0.12
      return { d: `M0,0H${w}V${h}H0Z M${t},${t}V${h - t}H${w - t}V${t}Z` }
    }
    case 'ellipse':
    case 'flowChartConnector':
      return { d: ellipse(w / 2, h / 2, w / 2, h / 2) }
    case 'triangle':
      return { d: poly([[w / 2, 0], [w, h], [0, h]]) }
    case 'rtTriangle':
      return { d: poly([[0, 0], [w, h], [0, h]]) }
    case 'parallelogram':
    case 'flowChartInputOutput':
      return { d: poly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]]) }
    case 'trapezoid':
      return { d: poly([[w * 0.25, 0], [w * 0.75, 0], [w, h], [0, h]]) }
    case 'diamond':
    case 'flowChartDecision':
      return { d: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) }
    case 'pentagon':
      return { d: regular(5, w, h) }
    case 'hexagon':
      return { d: poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]) }
    case 'octagon': {
      const a = 0.29
      return { d: poly([[w * a, 0], [w * (1 - a), 0], [w, h * a], [w, h * (1 - a)], [w * (1 - a), h], [w * a, h], [0, h * (1 - a)], [0, h * a]]) }
    }
    case 'plus': {
      const a = 0.25
      return { d: poly([[w * a, 0], [w * (1 - a), 0], [w * (1 - a), h * a], [w, h * a], [w, h * (1 - a)], [w * (1 - a), h * (1 - a)], [w * (1 - a), h], [w * a, h], [w * a, h * (1 - a)], [0, h * (1 - a)], [0, h * a], [w * a, h * a]]) }
    }
    case 'donut':
      return { d: ellipse(w / 2, h / 2, w / 2, h / 2) + ellipse(w / 2, h / 2, w * 0.3, h * 0.3, true) }
    case 'noSmoking': {
      const d = ellipse(w / 2, h / 2, w / 2, h / 2) + ellipse(w / 2, h / 2, w * 0.36, h * 0.36, true)
      return { d, extra: `M${w * 0.25},${h * 0.25}L${w * 0.75},${h * 0.75}` }
    }
    case 'can': {
      const ry = h * 0.12
      return { d: `M0,${ry}A${w / 2},${ry} 0 0,1 ${w},${ry}V${h - ry}A${w / 2},${ry} 0 0,1 0,${h - ry}Z`, extra: `M0,${ry}A${w / 2},${ry} 0 0,0 ${w},${ry}` }
    }
    case 'cube': {
      const s = m * 0.25
      return { d: poly([[s, 0], [w, 0], [w, h - s], [w - s, h], [0, h], [0, s]]), extra: `M0,${s}H${w - s}V${h}M${w - s},${s}L${w},0` }
    }
    case 'heart':
      return { d: `M${w / 2},${h * 0.28}C${w / 2},${h * 0.05} ${w * 0.02},${-h * 0.02} ${w * 0.02},${h * 0.32}C${w * 0.02},${h * 0.58} ${w * 0.32},${h * 0.72} ${w / 2},${h}C${w * 0.68},${h * 0.72} ${w * 0.98},${h * 0.58} ${w * 0.98},${h * 0.32}C${w * 0.98},${-h * 0.02} ${w / 2},${h * 0.05} ${w / 2},${h * 0.28}Z` }
    case 'lightningBolt':
      return { d: poly([[w * 0.38, 0], [w * 0.62, h * 0.32], [w * 0.52, h * 0.36], [w * 0.82, h * 0.64], [w * 0.7, h * 0.68], [w, h], [w * 0.36, h * 0.74], [w * 0.48, h * 0.7], [w * 0.14, h * 0.44], [w * 0.26, h * 0.4], [0, h * 0.14]]) }
    case 'moon':
      return { d: `M${w},0A${w},${h / 2} 0 0,0 ${w},${h}A${w * 0.55},${h / 2} 0 0,1 ${w},0Z` }
    case 'smileyFace':
      return {
        d: ellipse(w / 2, h / 2, w / 2, h / 2),
        extra: `${ellipse(w * 0.34, h * 0.38, w * 0.05, h * 0.05)}${ellipse(w * 0.66, h * 0.38, w * 0.05, h * 0.05)}M${w * 0.28},${h * 0.62}Q${w / 2},${h * 0.82} ${w * 0.72},${h * 0.62}`,
      }
    case 'cloud':
      return { d: `M${w * 0.2},${h * 0.85}C${-w * 0.05},${h * 0.85} ${-w * 0.02},${h * 0.5} ${w * 0.17},${h * 0.48}C${w * 0.1},${h * 0.2} ${w * 0.4},${h * 0.08} ${w * 0.5},${h * 0.25}C${w * 0.58},${h * 0.02} ${w * 0.88},${h * 0.08} ${w * 0.84},${h * 0.38}C${w * 1.04},${h * 0.42} ${w * 1.02},${h * 0.85} ${w * 0.8},${h * 0.85}Z` }
    case 'rightArrow':
      return { d: poly([[0, h * 0.25], [w * 0.62, h * 0.25], [w * 0.62, 0], [w, h / 2], [w * 0.62, h], [w * 0.62, h * 0.75], [0, h * 0.75]]) }
    case 'leftArrow':
      return { d: poly([[w, h * 0.25], [w * 0.38, h * 0.25], [w * 0.38, 0], [0, h / 2], [w * 0.38, h], [w * 0.38, h * 0.75], [w, h * 0.75]]) }
    case 'upArrow':
      return { d: poly([[w * 0.25, h], [w * 0.25, h * 0.38], [0, h * 0.38], [w / 2, 0], [w, h * 0.38], [w * 0.75, h * 0.38], [w * 0.75, h]]) }
    case 'downArrow':
      return { d: poly([[w * 0.25, 0], [w * 0.25, h * 0.62], [0, h * 0.62], [w / 2, h], [w, h * 0.62], [w * 0.75, h * 0.62], [w * 0.75, 0]]) }
    case 'leftRightArrow':
      return { d: poly([[0, h / 2], [w * 0.22, 0], [w * 0.22, h * 0.25], [w * 0.78, h * 0.25], [w * 0.78, 0], [w, h / 2], [w * 0.78, h], [w * 0.78, h * 0.75], [w * 0.22, h * 0.75], [w * 0.22, h]]) }
    case 'upDownArrow':
      return { d: poly([[w / 2, 0], [w, h * 0.22], [w * 0.75, h * 0.22], [w * 0.75, h * 0.78], [w, h * 0.78], [w / 2, h], [0, h * 0.78], [w * 0.25, h * 0.78], [w * 0.25, h * 0.22], [0, h * 0.22]]) }
    case 'chevron':
      return { d: poly([[0, 0], [w * 0.7, 0], [w, h / 2], [w * 0.7, h], [0, h], [w * 0.3, h / 2]]) }
    case 'homePlate':
      return { d: poly([[0, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [0, h]]) }
    case 'flowChartPredefinedProcess':
      return { d: `M0,0H${w}V${h}H0Z`, extra: `M${w * 0.12},0V${h}M${w * 0.88},0V${h}` }
    case 'flowChartDocument':
      return { d: `M0,0H${w}V${h * 0.82}C${w * 0.7},${h * 0.62} ${w * 0.35},${h * 1.08} 0,${h * 0.86}Z` }
    case 'flowChartTerminator': {
      const r = h / 2
      return { d: `M${r},0H${w - r}A${r},${r} 0 0,1 ${w - r},${h}H${r}A${r},${r} 0 0,1 ${r},0Z` }
    }
    case 'star4':
      return { d: star(4, w, h, 0.38) }
    case 'star5':
      return { d: star(5, w, h, 0.42) }
    case 'star6':
      return { d: star(6, w, h, 0.55) }
    case 'star8':
      return { d: star(8, w, h, 0.7) }
    case 'wedgeRectCallout':
      return { d: poly([[0, 0], [w, 0], [w, h * 0.78], [w * 0.45, h * 0.78], [w * 0.22, h], [w * 0.28, h * 0.78], [0, h * 0.78]]) }
    case 'wedgeRoundRectCallout': {
      const r = m * 0.12
      const b = h * 0.78
      return { d: `M${r},0H${w - r}Q${w},0 ${w},${r}V${b - r}Q${w},${b} ${w - r},${b}H${w * 0.45}L${w * 0.22},${h}L${w * 0.28},${b}H${r}Q0,${b} 0,${b - r}V${r}Q0,0 ${r},0Z` }
    }
    case 'wedgeEllipseCallout':
      return { d: `M${w * 0.3},${h * 0.8}A${w / 2},${h * 0.4} 0 1,1 ${w * 0.45},${h * 0.8}L${w * 0.18},${h}Z` }
    default:
      return { d: `M0,0H${w}V${h}H0Z` }
  }
}

/** Complete SVG markup for a shape object (used on the sheet, in galleries and when printing). */
export function shapeSVG(o: { shape: string; fill: string | null; line: string | null; lineWidth: number }, w: number, h: number): string {
  const p = shapePath(o.shape, w, h)
  const lw = o.lineWidth
  const pad = lw / 2 + (o.shape.includes('Arrow') || o.shape === 'straightConnector1' ? 6 : 0)
  const isLine = p.open
  const marker =
    o.shape === 'straightConnector1' || o.shape === 'doubleArrowLine'
      ? `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10Z" fill="${o.line ?? '#000'}"/></marker></defs>`
      : ''
  const ends = o.shape === 'straightConnector1' ? ' marker-end="url(#ah)"' : o.shape === 'doubleArrowLine' ? ' marker-start="url(#ah)" marker-end="url(#ah)"' : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible">` +
    marker +
    `<path d="${p.d}" fill="${isLine ? 'none' : o.fill ?? 'none'}" fill-rule="evenodd" stroke="${o.line ?? 'none'}" stroke-width="${lw}" vector-effect="non-scaling-stroke"${ends}/>` +
    (p.extra ? `<path d="${p.extra}" fill="none" stroke="${o.line ?? '#00000066'}" stroke-width="${lw}" vector-effect="non-scaling-stroke"/>` : '') +
    '</svg>'
  )
}

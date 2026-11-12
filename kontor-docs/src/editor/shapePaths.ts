// Preset shapes: SVG outlines for a w × h box. The ids are the preset names the file format uses
// (via the docx library), so shapes keep their geometry when saved.

export type ShapeGroup = 'Lines' | 'Rectangles' | 'Basic Shapes' | 'Block Arrows' | 'Equation Shapes' | 'Flowchart' | 'Stars and Banners' | 'Callouts'

type PathFn = (w: number, h: number) => string
type Preset = { label: string; group: ShapeGroup; path: PathFn; /** Extra strokes drawn without fill (details, inner lines). */ detail?: PathFn; line?: boolean }

const f = (n: number) => Math.round(n * 100) / 100

function polygon(points: [number, number][]) {
  return `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`
}

function regular(n: number, w: number, h: number, rotate = -Math.PI / 2) {
  return polygon(Array.from({ length: n }, (_, i) => {
    const a = rotate + (i * 2 * Math.PI) / n
    return [w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)] as [number, number]
  }))
}

function star(n: number, inner: number, w: number, h: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const r = i % 2 ? inner : 1
    pts.push([w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)])
  }
  return polygon(pts)
}

const ellipse = (cx: number, cy: number, rx: number, ry: number) => `M${f(cx - rx)} ${f(cy)} a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0 a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0 Z`
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${f(x + r)} ${f(y)} H${f(x + w - r)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V${f(y + h - r)} Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H${f(x + r)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`

const arrowRight: PathFn = (w, h) => {
  const hl = Math.min(w * 0.5, h * 0.5)
  return polygon([[0, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [0, h * 0.75]])
}
const arrowDown: PathFn = (w, h) => {
  const hl = Math.min(w * 0.5, h * 0.5)
  return polygon([[w * 0.25, 0], [w * 0.75, 0], [w * 0.75, h - hl], [w, h - hl], [w / 2, h], [0, h - hl], [w * 0.25, h - hl]])
}
const mirrorX = (fn: PathFn): PathFn => (w, h) => fn(w, h).replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${f(w - Number(x))} ${y}`)
const mirrorY = (fn: PathFn): PathFn => (w, h) => fn(w, h).replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${x} ${f(h - Number(y))}`)

const cloud: PathFn = (w, h) =>
  `M${f(w * 0.25)} ${f(h * 0.85)} C${f(w * 0.02)} ${f(h * 0.85)} ${f(w * 0.02)} ${f(h * 0.5)} ${f(w * 0.16)} ${f(h * 0.45)} C${f(w * 0.08)} ${f(h * 0.2)} ${f(w * 0.35)} ${f(h * 0.08)} ${f(w * 0.45)} ${f(h * 0.22)} C${f(w * 0.55)} ${f(h * 0.02)} ${f(w * 0.82)} ${f(h * 0.08)} ${f(w * 0.8)} ${f(h * 0.32)} C${f(w * 1.02)} ${f(h * 0.35)} ${f(w * 1.0)} ${f(h * 0.72)} ${f(w * 0.82)} ${f(h * 0.78)} C${f(w * 0.8)} ${f(h * 0.98)} ${f(w * 0.55)} ${f(h * 1.0)} ${f(w * 0.48)} ${f(h * 0.86)} C${f(w * 0.4)} ${f(h * 0.98)} ${f(w * 0.28)} ${f(h * 0.95)} ${f(w * 0.25)} ${f(h * 0.85)} Z`

const wave = (w: number, h: number, d: number) =>
  `M0 ${f(h * d)} C${f(w * 0.33)} ${f(-h * d)} ${f(w * 0.66)} ${f(h * d * 3)} ${f(w)} ${f(h * d)} V${f(h * (1 - d))} C${f(w * 0.66)} ${f(h * (1 + d))} ${f(w * 0.33)} ${f(h * (1 - d * 3))} 0 ${f(h * (1 - d))} Z`

export const SHAPES: Record<string, Preset> = {
  line: { label: 'Line', group: 'Lines', path: (w, h) => `M0 0 L${w} ${h}`, line: true },
  arrowLine: { label: 'Line Arrow', group: 'Lines', path: (w, h) => `M0 0 L${w} ${h}`, line: true },
  doubleArrowLine: { label: 'Line Arrow: Double', group: 'Lines', path: (w, h) => `M0 0 L${w} ${h}`, line: true },

  rectangle: { label: 'Rectangle', group: 'Rectangles', path: (w, h) => `M0 0 H${w} V${h} H0 Z` },
  roundedRectangle: { label: 'Rectangle: Rounded Corners', group: 'Rectangles', path: (w, h) => roundRect(0, 0, w, h, Math.min(w, h) * 0.1667) },
  snippedCornerRectangle: { label: 'Rectangle: Single Corner Snipped', group: 'Rectangles', path: (w, h) => { const s = Math.min(w, h) * 0.1667; return polygon([[0, 0], [w - s, 0], [w, s], [w, h], [0, h]]) } },
  topSnippedCornersRectangle: { label: 'Rectangle: Top Corners Snipped', group: 'Rectangles', path: (w, h) => { const s = Math.min(w, h) * 0.1667; return polygon([[s, 0], [w - s, 0], [w, s], [w, h], [0, h], [0, s]]) } },
  topRoundedCornersRectangle: { label: 'Rectangle: Top Corners Rounded', group: 'Rectangles', path: (w, h) => { const r = Math.min(w, h) * 0.1667; return `M${r} 0 H${f(w - r)} Q${w} 0 ${w} ${r} V${h} H0 V${r} Q0 0 ${r} 0 Z` } },

  ellipse: { label: 'Oval', group: 'Basic Shapes', path: (w, h) => ellipse(w / 2, h / 2, w / 2, h / 2) },
  triangle: { label: 'Isosceles Triangle', group: 'Basic Shapes', path: (w, h) => polygon([[w / 2, 0], [w, h], [0, h]]) },
  rightTriangle: { label: 'Right Triangle', group: 'Basic Shapes', path: (w, h) => polygon([[0, 0], [w, h], [0, h]]) },
  parallelogram: { label: 'Parallelogram', group: 'Basic Shapes', path: (w, h) => polygon([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]]) },
  trapezoid: { label: 'Trapezoid', group: 'Basic Shapes', path: (w, h) => polygon([[w * 0.25, 0], [w * 0.75, 0], [w, h], [0, h]]) },
  diamond: { label: 'Diamond', group: 'Basic Shapes', path: (w, h) => polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) },
  pentagon: { label: 'Regular Pentagon', group: 'Basic Shapes', path: (w, h) => regular(5, w, h) },
  hexagon: { label: 'Hexagon', group: 'Basic Shapes', path: (w, h) => polygon([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]) },
  heptagon: { label: 'Heptagon', group: 'Basic Shapes', path: (w, h) => regular(7, w, h) },
  octagon: { label: 'Octagon', group: 'Basic Shapes', path: (w, h) => { const c = 0.29; return polygon([[w * c, 0], [w * (1 - c), 0], [w, h * c], [w, h * (1 - c)], [w * (1 - c), h], [w * c, h], [0, h * (1 - c)], [0, h * c]]) } },
  decagon: { label: 'Decagon', group: 'Basic Shapes', path: (w, h) => regular(10, w, h) },
  dodecagon: { label: 'Dodecagon', group: 'Basic Shapes', path: (w, h) => regular(12, w, h) },
  cross: { label: 'Cross', group: 'Basic Shapes', path: (w, h) => polygon([[w * 0.25, 0], [w * 0.75, 0], [w * 0.75, h * 0.25], [w, h * 0.25], [w, h * 0.75], [w * 0.75, h * 0.75], [w * 0.75, h], [w * 0.25, h], [w * 0.25, h * 0.75], [0, h * 0.75], [0, h * 0.25], [w * 0.25, h * 0.25]]) },
  donut: { label: 'Circle: Hollow', group: 'Basic Shapes', path: (w, h) => `${ellipse(w / 2, h / 2, w / 2, h / 2)} ${ellipse(w / 2, h / 2, w / 4, h / 4)}` },
  noSymbol: { label: '"No" Symbol', group: 'Basic Shapes', path: (w, h) => `${ellipse(w / 2, h / 2, w / 2, h / 2)} ${ellipse(w / 2, h / 2, w * 0.36, h * 0.36)}`, detail: (w, h) => `M${f(w * 0.25)} ${f(h * 0.25)} L${f(w * 0.75)} ${f(h * 0.75)}` },
  frame: { label: 'Frame', group: 'Basic Shapes', path: (w, h) => { const t = Math.min(w, h) * 0.125; return `M0 0 H${w} V${h} H0 Z M${t} ${t} V${f(h - t)} H${f(w - t)} V${t} Z` } },
  lShape: { label: 'L-Shape', group: 'Basic Shapes', path: (w, h) => polygon([[0, 0], [w * 0.5, 0], [w * 0.5, h * 0.5], [w, h * 0.5], [w, h], [0, h]]) },
  cylinder: { label: 'Cylinder', group: 'Basic Shapes', path: (w, h) => { const ry = h * 0.12; return `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 1 ${w} ${f(ry)} V${f(h - ry)} A${f(w / 2)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z` }, detail: (w, h) => { const ry = h * 0.12; return `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 0 ${w} ${f(ry)}` } },
  cube: { label: 'Cube', group: 'Basic Shapes', path: (w, h) => { const d = Math.min(w, h) * 0.25; return polygon([[d, 0], [w, 0], [w, h - d], [w - d, h], [0, h], [0, d]]) }, detail: (w, h) => { const d = Math.min(w, h) * 0.25; return `M0 ${f(d)} H${f(w - d)} L${w} 0 M${f(w - d)} ${f(d)} V${h}` } },
  foldedCorner: { label: 'Folded Corner', group: 'Basic Shapes', path: (w, h) => { const s = Math.min(w, h) * 0.17; return polygon([[0, 0], [w, 0], [w, h - s], [w - s, h], [0, h]]) }, detail: (w, h) => { const s = Math.min(w, h) * 0.17; return `M${f(w - s)} ${h} L${f(w - s * 0.8)} ${f(h - s * 0.8)} L${w} ${f(h - s)}` } },
  heart: { label: 'Heart', group: 'Basic Shapes', path: (w, h) => `M${f(w / 2)} ${f(h * 0.25)} C${f(w * 0.5)} ${f(-h * 0.05)} ${f(-w * 0.1)} ${f(h * 0.05)} ${f(w * 0.08)} ${f(h * 0.45)} L${f(w / 2)} ${h} L${f(w * 0.92)} ${f(h * 0.45)} C${f(w * 1.1)} ${f(h * 0.05)} ${f(w * 0.5)} ${f(-h * 0.05)} ${f(w / 2)} ${f(h * 0.25)} Z` },
  lightningBolt: { label: 'Lightning Bolt', group: 'Basic Shapes', path: (w, h) => polygon([[w * 0.39, 0], [w * 0.62, h * 0.29], [w * 0.53, h * 0.33], [w * 0.8, h * 0.6], [w * 0.7, h * 0.64], [w, h], [w * 0.47, h * 0.7], [w * 0.57, h * 0.65], [w * 0.2, h * 0.42], [w * 0.31, h * 0.37], [0, h * 0.16]]) },
  sun: { label: 'Sun', group: 'Basic Shapes', path: (w, h) => `${ellipse(w / 2, h / 2, w * 0.25, h * 0.25)} ${star(8, 0.62, w, h).replace(/Z$/, 'Z')}` },
  moon: { label: 'Moon', group: 'Basic Shapes', path: (w, h) => `M${f(w * 0.75)} 0 A${f(w * 0.75)} ${f(h / 2)} 0 1 0 ${f(w * 0.75)} ${h} A${f(w * 0.5)} ${f(h / 2)} 0 1 1 ${f(w * 0.75)} 0 Z` },
  cloud: { label: 'Cloud', group: 'Basic Shapes', path: cloud },
  smileyFace: { label: 'Smiley Face', group: 'Basic Shapes', path: (w, h) => ellipse(w / 2, h / 2, w / 2, h / 2), detail: (w, h) => `${ellipse(w * 0.35, h * 0.38, w * 0.05, h * 0.05)} ${ellipse(w * 0.65, h * 0.38, w * 0.05, h * 0.05)} M${f(w * 0.28)} ${f(h * 0.62)} Q${f(w / 2)} ${f(h * 0.82)} ${f(w * 0.72)} ${f(h * 0.62)}` },
  teardrop: { label: 'Teardrop', group: 'Basic Shapes', path: (w, h) => `M${w} 0 V${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 1 ${f(w / 2)} 0 Z` },
  leftBracket: { label: 'Left Bracket', group: 'Basic Shapes', path: (w, h) => `M${w} 0 Q0 0 0 ${f(h * 0.1)} V${f(h * 0.9)} Q0 ${h} ${w} ${h}`, line: true },
  rightBracket: { label: 'Right Bracket', group: 'Basic Shapes', path: (w, h) => `M0 0 Q${w} 0 ${w} ${f(h * 0.1)} V${f(h * 0.9)} Q${w} ${h} 0 ${h}`, line: true },
  leftBrace: { label: 'Left Brace', group: 'Basic Shapes', path: (w, h) => `M${w} 0 Q${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.1)} V${f(h * 0.4)} Q${f(w / 2)} ${f(h / 2)} 0 ${f(h / 2)} Q${f(w / 2)} ${f(h / 2)} ${f(w / 2)} ${f(h * 0.6)} V${f(h * 0.9)} Q${f(w / 2)} ${h} ${w} ${h}`, line: true },
  rightBrace: { label: 'Right Brace', group: 'Basic Shapes', path: (w, h) => `M0 0 Q${f(w / 2)} 0 ${f(w / 2)} ${f(h * 0.1)} V${f(h * 0.4)} Q${f(w / 2)} ${f(h / 2)} ${w} ${f(h / 2)} Q${f(w / 2)} ${f(h / 2)} ${f(w / 2)} ${f(h * 0.6)} V${f(h * 0.9)} Q${f(w / 2)} ${h} 0 ${h}`, line: true },

  rightArrow: { label: 'Arrow: Right', group: 'Block Arrows', path: arrowRight },
  leftArrow: { label: 'Arrow: Left', group: 'Block Arrows', path: mirrorX(arrowRight) },
  downArrow: { label: 'Arrow: Down', group: 'Block Arrows', path: arrowDown },
  upArrow: { label: 'Arrow: Up', group: 'Block Arrows', path: mirrorY(arrowDown) },
  leftRightArrow: { label: 'Arrow: Left-Right', group: 'Block Arrows', path: (w, h) => { const hl = Math.min(w * 0.3, h * 0.5); return polygon([[0, h / 2], [hl, 0], [hl, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [hl, h * 0.75], [hl, h]]) } },
  upDownArrow: { label: 'Arrow: Up-Down', group: 'Block Arrows', path: (w, h) => { const hl = Math.min(h * 0.3, w * 0.5); return polygon([[w / 2, 0], [w, hl], [w * 0.75, hl], [w * 0.75, h - hl], [w, h - hl], [w / 2, h], [0, h - hl], [w * 0.25, h - hl], [w * 0.25, hl], [0, hl]]) } },
  quadArrow: { label: 'Arrow: Quad', group: 'Block Arrows', path: (w, h) => { const a = 0.2; const b = 0.4; return polygon([[0.5, 0], [0.5 + a, a], [0.5 + a / 2, a], [0.5 + a / 2, b + a / 2], [1 - a, b + a / 2], [1 - a, 0.5 - a], [1, 0.5], [1 - a, 0.5 + a], [1 - a, 0.5 + a / 2], [0.5 + a / 2, 0.5 + a / 2], [0.5 + a / 2, 1 - a], [0.5 + a, 1 - a], [0.5, 1], [0.5 - a, 1 - a], [0.5 - a / 2, 1 - a], [0.5 - a / 2, 0.5 + a / 2], [a, 0.5 + a / 2], [a, 0.5 + a], [0, 0.5], [a, 0.5 - a], [a, b + a / 2], [0.5 - a / 2, b + a / 2], [0.5 - a / 2, a], [0.5 - a, a]].map(([x, y]) => [x * w, y * h] as [number, number])) } },
  chevron: { label: 'Arrow: Chevron', group: 'Block Arrows', path: (w, h) => { const d = Math.min(w * 0.5, h * 0.5); return polygon([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]) } },
  pentagonArrow: { label: 'Arrow: Pentagon', group: 'Block Arrows', path: (w, h) => { const d = Math.min(w * 0.5, h * 0.5); return polygon([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h]]) } },
  notchedRightArrow: { label: 'Arrow: Notched Right', group: 'Block Arrows', path: (w, h) => { const hl = Math.min(w * 0.5, h * 0.5); return polygon([[0, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [0, h * 0.75], [hl * 0.5, h / 2]]) } },
  stripedRightArrow: { label: 'Arrow: Striped Right', group: 'Block Arrows', path: (w, h) => { const hl = Math.min(w * 0.5, h * 0.5); return `${polygon([[w * 0.12, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [w * 0.12, h * 0.75]])} M0 ${f(h * 0.25)} H${f(w * 0.03)} V${f(h * 0.75)} H0 Z M${f(w * 0.06)} ${f(h * 0.25)} H${f(w * 0.09)} V${f(h * 0.75)} H${f(w * 0.06)} Z` } },
  uTurnArrow: { label: 'Arrow: U-Turn', group: 'Block Arrows', path: (w, h) => { const t = Math.min(w, h) * 0.25; return `M0 ${h} V${f(h * 0.4)} A${f(w * 0.4)} ${f(h * 0.4)} 0 0 1 ${f(w * 0.8)} ${f(h * 0.4)} V${f(h * 0.55)} H${w} L${f(w * 0.8 - t / 2)} ${f(h * 0.85)} L${f(w * 0.6 - t)} ${f(h * 0.55)} H${f(w * 0.8 - t)} V${f(h * 0.4)} A${f(w * 0.4 - t)} ${f(h * 0.4 - t)} 0 0 0 ${t} ${f(h * 0.4)} V${h} Z` } },

  mathPlus: { label: 'Plus Sign', group: 'Equation Shapes', path: (w, h) => polygon([[w * 0.38, h * 0.12], [w * 0.62, h * 0.12], [w * 0.62, h * 0.38], [w * 0.88, h * 0.38], [w * 0.88, h * 0.62], [w * 0.62, h * 0.62], [w * 0.62, h * 0.88], [w * 0.38, h * 0.88], [w * 0.38, h * 0.62], [w * 0.12, h * 0.62], [w * 0.12, h * 0.38], [w * 0.38, h * 0.38]]) },
  mathMinus: { label: 'Minus Sign', group: 'Equation Shapes', path: (w, h) => polygon([[w * 0.12, h * 0.38], [w * 0.88, h * 0.38], [w * 0.88, h * 0.62], [w * 0.12, h * 0.62]]) },
  mathMultiply: { label: 'Multiplication Sign', group: 'Equation Shapes', path: (w, h) => polygon([[0.2, 0.12], [0.5, 0.38], [0.8, 0.12], [0.88, 0.2], [0.62, 0.5], [0.88, 0.8], [0.8, 0.88], [0.5, 0.62], [0.2, 0.88], [0.12, 0.8], [0.38, 0.5], [0.12, 0.2]].map(([x, y]) => [x * w, y * h] as [number, number])) },
  mathDivide: { label: 'Division Sign', group: 'Equation Shapes', path: (w, h) => `${polygon([[w * 0.12, h * 0.42], [w * 0.88, h * 0.42], [w * 0.88, h * 0.58], [w * 0.12, h * 0.58]])} ${ellipse(w / 2, h * 0.24, w * 0.09, h * 0.09)} ${ellipse(w / 2, h * 0.76, w * 0.09, h * 0.09)}` },
  mathEqual: { label: 'Equal', group: 'Equation Shapes', path: (w, h) => `${polygon([[w * 0.12, h * 0.25], [w * 0.88, h * 0.25], [w * 0.88, h * 0.42], [w * 0.12, h * 0.42]])} ${polygon([[w * 0.12, h * 0.58], [w * 0.88, h * 0.58], [w * 0.88, h * 0.75], [w * 0.12, h * 0.75]])}` },
  mathNotEqual: { label: 'Not Equal', group: 'Equation Shapes', path: (w, h) => `${polygon([[w * 0.12, h * 0.25], [w * 0.88, h * 0.25], [w * 0.88, h * 0.42], [w * 0.12, h * 0.42]])} ${polygon([[w * 0.12, h * 0.58], [w * 0.88, h * 0.58], [w * 0.88, h * 0.75], [w * 0.12, h * 0.75]])} ${polygon([[w * 0.58, h * 0.08], [w * 0.7, h * 0.12], [w * 0.42, h * 0.92], [w * 0.3, h * 0.88]])}` },

  flowChartProcess: { label: 'Flowchart: Process', group: 'Flowchart', path: (w, h) => `M0 0 H${w} V${h} H0 Z` },
  flowChartAlternateProcess: { label: 'Flowchart: Alternate Process', group: 'Flowchart', path: (w, h) => roundRect(0, 0, w, h, Math.min(w, h) * 0.17) },
  flowChartDecision: { label: 'Flowchart: Decision', group: 'Flowchart', path: (w, h) => polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) },
  flowChartInputOutput: { label: 'Flowchart: Data', group: 'Flowchart', path: (w, h) => polygon([[w * 0.2, 0], [w, 0], [w * 0.8, h], [0, h]]) },
  flowChartPredefinedProcess: { label: 'Flowchart: Predefined Process', group: 'Flowchart', path: (w, h) => `M0 0 H${w} V${h} H0 Z`, detail: (w, h) => `M${f(w * 0.125)} 0 V${h} M${f(w * 0.875)} 0 V${h}` },
  flowChartInternalStorage: { label: 'Flowchart: Internal Storage', group: 'Flowchart', path: (w, h) => `M0 0 H${w} V${h} H0 Z`, detail: (w, h) => `M${f(w * 0.2)} 0 V${h} M0 ${f(h * 0.2)} H${w}` },
  flowChartDocument: { label: 'Flowchart: Document', group: 'Flowchart', path: (w, h) => `M0 0 H${w} V${f(h * 0.83)} C${f(w * 0.75)} ${f(h * 0.7)} ${f(w * 0.25)} ${f(h * 1.1)} 0 ${f(h * 0.9)} Z` },
  flowChartTerminator: { label: 'Flowchart: Terminator', group: 'Flowchart', path: (w, h) => roundRect(0, 0, w, h, Math.min(h / 2, w / 2)) },
  flowChartPreparation: { label: 'Flowchart: Preparation', group: 'Flowchart', path: (w, h) => polygon([[w * 0.2, 0], [w * 0.8, 0], [w, h / 2], [w * 0.8, h], [w * 0.2, h], [0, h / 2]]) },
  flowChartManualInput: { label: 'Flowchart: Manual Input', group: 'Flowchart', path: (w, h) => polygon([[0, h * 0.2], [w, 0], [w, h], [0, h]]) },
  flowChartManualOperation: { label: 'Flowchart: Manual Operation', group: 'Flowchart', path: (w, h) => polygon([[0, 0], [w, 0], [w * 0.8, h], [w * 0.2, h]]) },
  flowChartConnector: { label: 'Flowchart: Connector', group: 'Flowchart', path: (w, h) => ellipse(w / 2, h / 2, w / 2, h / 2) },
  flowChartOffpageConnector: { label: 'Flowchart: Off-page Connector', group: 'Flowchart', path: (w, h) => polygon([[0, 0], [w, 0], [w, h * 0.8], [w / 2, h], [0, h * 0.8]]) },
  flowChartPunchedCard: { label: 'Flowchart: Card', group: 'Flowchart', path: (w, h) => polygon([[w * 0.2, 0], [w, 0], [w, h], [0, h], [0, h * 0.2]]) },
  flowChartSummingJunction: { label: 'Flowchart: Summing Junction', group: 'Flowchart', path: (w, h) => ellipse(w / 2, h / 2, w / 2, h / 2), detail: (w, h) => `M${f(w * 0.15)} ${f(h * 0.15)} L${f(w * 0.85)} ${f(h * 0.85)} M${f(w * 0.85)} ${f(h * 0.15)} L${f(w * 0.15)} ${f(h * 0.85)}` },
  flowChartOr: { label: 'Flowchart: Or', group: 'Flowchart', path: (w, h) => ellipse(w / 2, h / 2, w / 2, h / 2), detail: (w, h) => `M${f(w / 2)} 0 V${h} M0 ${f(h / 2)} H${w}` },
  flowChartCollate: { label: 'Flowchart: Collate', group: 'Flowchart', path: (w, h) => polygon([[0, 0], [w, 0], [0, h], [w, h]]) },
  flowChartSort: { label: 'Flowchart: Sort', group: 'Flowchart', path: (w, h) => polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), detail: (w, h) => `M0 ${f(h / 2)} H${w}` },
  flowChartExtract: { label: 'Flowchart: Extract', group: 'Flowchart', path: (w, h) => polygon([[w / 2, 0], [w, h], [0, h]]) },
  flowChartMerge: { label: 'Flowchart: Merge', group: 'Flowchart', path: (w, h) => polygon([[0, 0], [w, 0], [w / 2, h]]) },
  flowChartDelay: { label: 'Flowchart: Delay', group: 'Flowchart', path: (w, h) => `M0 0 H${f(w / 2)} A${f(w / 2)} ${f(h / 2)} 0 0 1 ${f(w / 2)} ${h} H0 Z` },
  flowChartMagneticDisk: { label: 'Flowchart: Magnetic Disk', group: 'Flowchart', path: (w, h) => { const ry = h * 0.15; return `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 1 ${w} ${f(ry)} V${f(h - ry)} A${f(w / 2)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z` }, detail: (w, h) => { const ry = h * 0.15; return `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 0 ${w} ${f(ry)}` } },
  flowChartDisplay: { label: 'Flowchart: Display', group: 'Flowchart', path: (w, h) => `M0 ${f(h / 2)} L${f(w * 0.17)} 0 H${f(w * 0.83)} A${f(w * 0.17)} ${f(h / 2)} 0 0 1 ${f(w * 0.83)} ${h} H${f(w * 0.17)} Z` },

  star4: { label: 'Star: 4 Points', group: 'Stars and Banners', path: (w, h) => star(4, 0.38, w, h) },
  star5: { label: 'Star: 5 Points', group: 'Stars and Banners', path: (w, h) => star(5, 0.38, w, h) },
  star6: { label: 'Star: 6 Points', group: 'Stars and Banners', path: (w, h) => star(6, 0.5, w, h) },
  star7: { label: 'Star: 7 Points', group: 'Stars and Banners', path: (w, h) => star(7, 0.5, w, h) },
  star8: { label: 'Star: 8 Points', group: 'Stars and Banners', path: (w, h) => star(8, 0.62, w, h) },
  star10: { label: 'Star: 10 Points', group: 'Stars and Banners', path: (w, h) => star(10, 0.68, w, h) },
  star12: { label: 'Star: 12 Points', group: 'Stars and Banners', path: (w, h) => star(12, 0.74, w, h) },
  star16: { label: 'Star: 16 Points', group: 'Stars and Banners', path: (w, h) => star(16, 0.8, w, h) },
  star24: { label: 'Star: 24 Points', group: 'Stars and Banners', path: (w, h) => star(24, 0.84, w, h) },
  star32: { label: 'Star: 32 Points', group: 'Stars and Banners', path: (w, h) => star(32, 0.86, w, h) },
  wave: { label: 'Wave', group: 'Stars and Banners', path: (w, h) => wave(w, h, 0.12) },
  doubleWave: { label: 'Double Wave', group: 'Stars and Banners', path: (w, h) => wave(w, h, 0.07) },

  rectangularCallout: { label: 'Speech Bubble: Rectangle', group: 'Callouts', path: (w, h) => polygon([[0, 0], [w, 0], [w, h * 0.75], [w * 0.4, h * 0.75], [w * 0.15, h], [w * 0.25, h * 0.75], [0, h * 0.75]]) },
  roundedRectangularCallout: { label: 'Speech Bubble: Rectangle with Corners Rounded', group: 'Callouts', path: (w, h) => { const r = Math.min(w, h * 0.75) * 0.15; const b = h * 0.75; return `M${r} 0 H${f(w - r)} Q${w} 0 ${w} ${r} V${f(b - r)} Q${w} ${f(b)} ${f(w - r)} ${f(b)} H${f(w * 0.4)} L${f(w * 0.15)} ${h} L${f(w * 0.25)} ${f(b)} H${r} Q0 ${f(b)} 0 ${f(b - r)} V${r} Q0 0 ${r} 0 Z` } },
  ellipticalCallout: { label: 'Speech Bubble: Oval', group: 'Callouts', path: (w, h) => `M${f(w * 0.25)} ${f(h * 0.7)} A${f(w / 2)} ${f(h * 0.38)} 0 1 1 ${f(w * 0.4)} ${f(h * 0.76)} L${f(w * 0.12)} ${h} Z` },
  cloudCallout: { label: 'Thought Bubble: Cloud', group: 'Callouts', path: (w, h) => `${cloud(w, h * 0.82)} ${ellipse(w * 0.2, h * 0.9, w * 0.05, h * 0.04)} ${ellipse(w * 0.1, h * 0.97, w * 0.03, h * 0.025)}` },
}

export const SHAPE_GROUPS: ShapeGroup[] = ['Lines', 'Rectangles', 'Basic Shapes', 'Block Arrows', 'Equation Shapes', 'Flowchart', 'Stars and Banners', 'Callouts']

export const shapesIn = (group: ShapeGroup) => Object.entries(SHAPES).filter(([, p]) => p.group === group).map(([id, p]) => ({ id, ...p }))

/** The file format's preset geometry names (prstGeom) for import. */
export const PRESET_FROM_OOXML: Record<string, string> = {
  line: 'line', straightConnector1: 'arrowLine', rect: 'rectangle', roundRect: 'roundedRectangle', snip1Rect: 'snippedCornerRectangle', snip2SameRect: 'topSnippedCornersRectangle', round2SameRect: 'topRoundedCornersRectangle',
  ellipse: 'ellipse', triangle: 'triangle', rtTriangle: 'rightTriangle', parallelogram: 'parallelogram', trapezoid: 'trapezoid', diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', heptagon: 'heptagon', octagon: 'octagon', decagon: 'decagon', dodecagon: 'dodecagon',
  plus: 'cross', donut: 'donut', noSmoking: 'noSymbol', frame: 'frame', corner: 'lShape', can: 'cylinder', cube: 'cube', foldedCorner: 'foldedCorner', heart: 'heart', lightningBolt: 'lightningBolt', sun: 'sun', moon: 'moon', cloud: 'cloud', smileyFace: 'smileyFace', teardrop: 'teardrop',
  leftBracket: 'leftBracket', rightBracket: 'rightBracket', leftBrace: 'leftBrace', rightBrace: 'rightBrace',
  rightArrow: 'rightArrow', leftArrow: 'leftArrow', upArrow: 'upArrow', downArrow: 'downArrow', leftRightArrow: 'leftRightArrow', upDownArrow: 'upDownArrow', quadArrow: 'quadArrow', chevron: 'chevron', homePlate: 'pentagonArrow', notchedRightArrow: 'notchedRightArrow', stripedRightArrow: 'stripedRightArrow', uturnArrow: 'uTurnArrow',
  mathPlus: 'mathPlus', mathMinus: 'mathMinus', mathMultiply: 'mathMultiply', mathDivide: 'mathDivide', mathEqual: 'mathEqual', mathNotEqual: 'mathNotEqual',
  flowChartProcess: 'flowChartProcess', flowChartAlternateProcess: 'flowChartAlternateProcess', flowChartDecision: 'flowChartDecision', flowChartInputOutput: 'flowChartInputOutput', flowChartPredefinedProcess: 'flowChartPredefinedProcess', flowChartInternalStorage: 'flowChartInternalStorage', flowChartDocument: 'flowChartDocument', flowChartTerminator: 'flowChartTerminator', flowChartPreparation: 'flowChartPreparation', flowChartManualInput: 'flowChartManualInput', flowChartManualOperation: 'flowChartManualOperation', flowChartConnector: 'flowChartConnector', flowChartOffpageConnector: 'flowChartOffpageConnector', flowChartPunchedCard: 'flowChartPunchedCard', flowChartSummingJunction: 'flowChartSummingJunction', flowChartOr: 'flowChartOr', flowChartCollate: 'flowChartCollate', flowChartSort: 'flowChartSort', flowChartExtract: 'flowChartExtract', flowChartMerge: 'flowChartMerge', flowChartDelay: 'flowChartDelay', flowChartMagneticDisk: 'flowChartMagneticDisk', flowChartDisplay: 'flowChartDisplay',
  star4: 'star4', star5: 'star5', star6: 'star6', star7: 'star7', star8: 'star8', star10: 'star10', star12: 'star12', star16: 'star16', star24: 'star24', star32: 'star32', wave: 'wave', doubleWave: 'doubleWave',
  wedgeRectCallout: 'rectangularCallout', wedgeRoundRectCallout: 'roundedRectangularCallout', wedgeEllipseCallout: 'ellipticalCallout', cloudCallout: 'cloudCallout',
}

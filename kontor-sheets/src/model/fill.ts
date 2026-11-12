// Pattern and gradient cell fills (Format Cells > Fill: Pattern Style, Pattern Color, Fill Effects).
// Patterns use the file format's names; each is an 8×8 pixel tile drawn in the pattern color over
// the background color.
import { tx } from '../i18n'
import type { Style } from './style'

export type PatternType =
  | 'darkGray' | 'mediumGray' | 'lightGray' | 'gray125' | 'gray0625'
  | 'darkHorizontal' | 'darkVertical' | 'darkDown' | 'darkUp' | 'darkGrid' | 'darkTrellis'
  | 'lightHorizontal' | 'lightVertical' | 'lightDown' | 'lightUp' | 'lightGrid' | 'lightTrellis'

/** Two-color gradient: linear at an angle (0 = left to right, 90 = top to bottom) or from the center. */
export type Gradient = { kind: 'linear' | 'path'; angle: number; from: string; to: string }

export const PATTERNS: { id: PatternType; label: string }[] = [
  { id: 'darkGray', label: tx('75% Gray') },
  { id: 'mediumGray', label: tx('50% Gray') },
  { id: 'lightGray', label: tx('25% Gray') },
  { id: 'gray125', label: tx('12.5% Gray') },
  { id: 'gray0625', label: tx('6.25% Gray') },
  { id: 'darkHorizontal', label: tx('Horizontal Stripe') },
  { id: 'darkVertical', label: tx('Vertical Stripe') },
  { id: 'darkDown', label: tx('Reverse Diagonal Stripe') },
  { id: 'darkUp', label: tx('Diagonal Stripe') },
  { id: 'darkGrid', label: tx('Diagonal Crosshatch') },
  { id: 'darkTrellis', label: tx('Thick Diagonal Crosshatch') },
  { id: 'lightHorizontal', label: tx('Thin Horizontal Stripe') },
  { id: 'lightVertical', label: tx('Thin Vertical Stripe') },
  { id: 'lightDown', label: tx('Thin Reverse Diagonal Stripe') },
  { id: 'lightUp', label: tx('Thin Diagonal Stripe') },
  { id: 'lightGrid', label: tx('Thin Horizontal Crosshatch') },
  { id: 'lightTrellis', label: tx('Thin Diagonal Crosshatch') },
]

export const GRADIENT_STYLES: { id: string; label: string; kind: Gradient['kind']; angle: number }[] = [
  { id: 'horizontal', label: tx('Horizontal'), kind: 'linear', angle: 90 },
  { id: 'vertical', label: tx('Vertical'), kind: 'linear', angle: 0 },
  { id: 'diagonalUp', label: tx('Diagonal up'), kind: 'linear', angle: 45 },
  { id: 'diagonalDown', label: tx('Diagonal down'), kind: 'linear', angle: 135 },
  { id: 'fromCenter', label: tx('From center'), kind: 'path', angle: 0 },
]

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]
const GRAY: Partial<Record<PatternType, number>> = { darkGray: 0.75, mediumGray: 0.5, lightGray: 0.25, gray125: 0.125, gray0625: 0.0625 }

/** Whether pixel (x, y) of the 8×8 tile is drawn in the pattern color. */
export function patternPixel(type: PatternType, x: number, y: number): boolean {
  const gray = GRAY[type]
  if (gray !== undefined) return type === 'gray0625' ? x % 4 === 0 && y % 4 === 0 : type === 'gray125' ? y % 2 === 0 && (x + (y % 4 === 2 ? 2 : 0)) % 4 === 0 : BAYER[y % 4][x % 4] < gray * 16
  const m = (n: number) => ((n % 4) + 4) % 4
  switch (type) {
    case 'darkHorizontal': return m(y) < 2
    case 'lightHorizontal': return m(y) === 0
    case 'darkVertical': return m(x) < 2
    case 'lightVertical': return m(x) === 0
    case 'darkDown': return m(x - y) < 2
    case 'lightDown': return m(x - y) === 0
    case 'darkUp': return m(x + y) < 2
    case 'lightUp': return m(x + y) === 0
    case 'darkGrid': return m(x - y) === 0 || m(x + y) === 0 || m(x - y) === 1
    case 'lightGrid': return m(x) === 0 || m(y) === 0
    case 'darkTrellis': return (x + y) % 2 === 0 || m(y) === 0
    case 'lightTrellis': return m(x - y) === 0 || m(x + y) === 0
    default: return false
  }
}

/** The 8×8 tile as an SVG image (used for print, HTML export and the dialog preview). */
export function patternSvg(type: PatternType, color: string, background: string): string {
  let rects = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (patternPixel(type, x, y)) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${background}"/><g fill="${color}">${rects}</g></svg>`
}

/** CSS background for a style with a pattern or gradient fill (undefined for plain or no fill). */
export function fillCss(st: Pick<Style, 'fill' | 'pattern' | 'patternColor' | 'gradient'>): string | undefined {
  if (st.gradient) {
    const g = st.gradient
    return g.kind === 'path' ? `radial-gradient(circle, ${g.from}, ${g.to})` : `linear-gradient(${g.angle + 90}deg, ${g.from}, ${g.to})`
  }
  if (st.pattern) return `url("data:image/svg+xml,${encodeURIComponent(patternSvg(st.pattern, st.patternColor ?? '#000000', st.fill ?? '#FFFFFF'))}")`
  return undefined
}

const tiles = new Map<string, CanvasPattern | null>()

/** Paints a cell's fill (solid, pattern or gradient) on a canvas. Returns false when the cell has no fill. */
export function paintFill(ctx: CanvasRenderingContext2D, st: Style, x: number, y: number, w: number, h: number): boolean {
  if (st.gradient) {
    const g = st.gradient
    let grad: CanvasGradient
    if (g.kind === 'path') grad = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2)
    else {
      const a = (g.angle * Math.PI) / 180
      const cx = x + w / 2
      const cy = y + h / 2
      const len = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2
      grad = ctx.createLinearGradient(cx - Math.cos(a) * len, cy - Math.sin(a) * len, cx + Math.cos(a) * len, cy + Math.sin(a) * len)
    }
    grad.addColorStop(0, g.from)
    grad.addColorStop(1, g.to)
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)
    return true
  }
  if (st.pattern) {
    const color = st.patternColor ?? '#000000'
    const bg = st.fill ?? '#FFFFFF'
    const key = `${st.pattern}|${color}|${bg}`
    let tile = tiles.get(key)
    if (tile === undefined) {
      tile = null
      const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
      const c2 = canvas?.getContext('2d')
      if (canvas && c2) {
        canvas.width = 8
        canvas.height = 8
        c2.fillStyle = bg
        c2.fillRect(0, 0, 8, 8)
        c2.fillStyle = color
        for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) if (patternPixel(st.pattern, px, py)) c2.fillRect(px, py, 1, 1)
        tile = ctx.createPattern(canvas, 'repeat')
      }
      tiles.set(key, tile)
    }
    ctx.fillStyle = tile ?? bg
    ctx.fillRect(x, y, w, h)
    return true
  }
  if (st.fill) {
    ctx.fillStyle = st.fill
    ctx.fillRect(x, y, w, h)
    return true
  }
  return false
}

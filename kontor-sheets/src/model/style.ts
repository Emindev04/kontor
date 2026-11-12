export type HAlign = 'general' | 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed'
export type VAlign = 'top' | 'middle' | 'bottom' | 'justify' | 'distributed'
export type BorderStyle =
  | 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double' | 'hair'
  | 'mediumDashed' | 'dashDot' | 'mediumDashDot' | 'dashDotDot' | 'mediumDashDotDot' | 'slantDashDot'
export type Border = { style: BorderStyle; color: string }
export type Underline = 'single' | 'double' | 'singleAccounting' | 'doubleAccounting'

export interface Style {
  font?: string
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: Underline
  strike?: boolean
  color?: string
  script?: 'superscript' | 'subscript'
  /** Background color (also the background of a pattern fill). */
  fill?: string
  /** Pattern fill drawn in `patternColor` over `fill`. */
  pattern?: import('./fill').PatternType
  patternColor?: string
  /** Gradient fill (Fill Effects); replaces the solid and pattern fill. */
  gradient?: import('./fill').Gradient
  h?: HAlign
  v?: VAlign
  wrap?: boolean
  shrink?: boolean
  indent?: number
  /** -90…90 degrees, or 255 for vertical stacked text. */
  rotate?: number
  fmt?: string
  bt?: Border
  bb?: Border
  bl?: Border
  br?: Border
  /** Diagonal borders: down (top-left → bottom-right) and up. */
  bdd?: Border
  bdu?: Border
  locked?: boolean
  hideFormula?: boolean
}

export type StylePatch = { [K in keyof Style]?: Style[K] | undefined }

export const DEFAULT_FONT = 'Calibri'
export const DEFAULT_SIZE = 11
export const FONT_STACK = (font: string) => `"${font}", ${font === 'Calibri' || font === 'Calibri Light' ? 'Carlito, ' : ''}"Segoe UI", Arial, sans-serif`

function canon(s: Style): string {
  const keys = Object.keys(s).sort() as (keyof Style)[]
  return JSON.stringify(keys.map((k) => [k, s[k]]))
}

function clean(s: StylePatch): Style {
  const out: Style = {}
  for (const k of Object.keys(s) as (keyof Style)[]) {
    const v = s[k]
    if (v === undefined || v === null || v === false) continue
    if (k === 'indent' && v === 0) continue
    if (k === 'rotate' && v === 0) continue
    if (k === 'fmt' && v === 'General') continue
    if (k === 'h' && v === 'general') continue
    if (k === 'v' && v === 'bottom') continue
    if (k === 'font' && v === DEFAULT_FONT) continue
    if (k === 'size' && v === DEFAULT_SIZE) continue
    if (k === 'locked') continue
    ;(out as Record<string, unknown>)[k] = v
  }
  if (s.locked === false) out.locked = false
  return out
}

/** Interned, immutable cell styles shared by all sheets. Id 0 is the default style. */
export class StyleTable {
  private list: Style[] = [Object.freeze({})]
  private ids = new Map<string, number>([[canon({}), 0]])

  get(id: number | undefined): Style {
    return this.list[id ?? 0] ?? this.list[0]
  }

  intern(style: StylePatch): number {
    const s = clean(style)
    const key = canon(s)
    let id = this.ids.get(key)
    if (id === undefined) {
      id = this.list.length
      this.list.push(Object.freeze(s))
      this.ids.set(key, id)
    }
    return id
  }

  patch(id: number | undefined, patch: StylePatch): number {
    return this.intern({ ...this.get(id), ...patch })
  }

  get size() {
    return this.list.length
  }
}

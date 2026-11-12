import { Axis } from './axis'
import { MAX_COLS, MAX_ROWS, cellKey, keyCol, keyRow, type Range } from './address'
import type { Matrix } from './matrix'
import type { Scalar } from './types'
import type { Style } from './style'
import { emptyExtras, type SheetExtras } from './extras'

/** Font settings of one run of rich text, on top of the cell style. */
export type RunStyle = {
  bold?: boolean
  italic?: boolean
  underline?: Style['underline'] | 'none'
  strike?: boolean
  color?: string
  size?: number
  font?: string
  script?: Style['script']
}

export type RichRun = { t: string; s?: RunStyle }

/** Stored cell content. Treat as immutable: replace instead of mutating. */
export interface CellData {
  /** Literal value (number, text, boolean or error). */
  v?: Scalar
  /** Formula without the leading "=". */
  f?: string
  /** Style id in the workbook style table. */
  s?: number
  /** Cached result from an imported file (used when a function is unknown). */
  cache?: Scalar
  /** Hyperlink target. */
  link?: string
  /** Text with mixed formatting; `v` holds the same text without formatting. */
  rich?: RichRun[]
}

export type PageSetup = {
  orientation: 'portrait' | 'landscape'
  paper: 'letter' | 'legal' | 'a4' | 'a3' | 'tabloid'
  /** Inches. */
  margins: { top: number; bottom: number; left: number; right: number; header: number; footer: number }
  printGridlines: boolean
  printHeadings: boolean
  printArea?: string
  printTitleRows?: string
  printTitleCols?: string
  /** Sheet background picture (image id in the workbook); shown on screen, not printed. */
  background?: string
  fitToPage: boolean
  /** Scale to Fit page counts when fitToPage is on (0 = automatic). */
  fitWide?: number
  fitTall?: number
  scale: number
  centerH: boolean
  centerV: boolean
  header?: string
  footer?: string
}

export const DEFAULT_PAGE: PageSetup = {
  orientation: 'portrait',
  paper: 'letter',
  margins: { top: 0.75, bottom: 0.75, left: 0.7, right: 0.7, header: 0.3, footer: 0.3 },
  printGridlines: false,
  printHeadings: false,
  fitToPage: false,
  scale: 100,
  centerH: false,
  centerV: false,
}

export type InkStroke = { points: number[]; color: string; width: number; highlighter: boolean }

export const DEFAULT_COL_WIDTH = 64
export const DEFAULT_ROW_HEIGHT = 20

export class Sheet {
  cells = new Map<number, CellData>()
  readonly cols = new Axis(DEFAULT_COL_WIDTH, MAX_COLS)
  readonly rows = new Axis(DEFAULT_ROW_HEIGHT, MAX_ROWS)
  colStyle = new Map<number, number>()
  rowStyle = new Map<number, number>()
  merges: Range[] = []
  freeze = { rows: 0, cols: 0 }
  tabColor?: string
  hidden = false
  showGrid = true
  showHeadings = true
  showFormulas = false
  showZeros = true
  zoom = 100
  gridColor?: string
  page: PageSetup = structuredClone(DEFAULT_PAGE)
  /** Ink strokes from the Draw tab, in unzoomed sheet pixels. */
  ink: InkStroke[] = []
  /** Charts, tables, filters, conditional formats, validation, notes, protection, outline … */
  x: SheetExtras = emptyExtras()

  // ----- computed by the engine -----
  /** Formula results (top-left value for spilled arrays). */
  calc = new Map<number, Scalar>()
  /** Full result of spilling formulas, by anchor key. */
  spills = new Map<number, { matrix: Matrix; rows: number; cols: number }>()
  /** Covered cell key → anchor key for spilled ranges (anchor itself excluded). */
  spillOwner = new Map<number, number>()

  private usedCache: { r: number; c: number } | null = null

  constructor(
    public id: number,
    public name: string,
  ) {}

  get(r: number, c: number): CellData | undefined {
    return this.cells.get(cellKey(r, c))
  }

  setRaw(key: number, data: CellData | undefined) {
    if (!data || (data.v === undefined && data.f === undefined && !data.s && data.link === undefined)) this.cells.delete(key)
    else this.cells.set(key, data)
    this.usedCache = null
  }

  touchUsed() {
    this.usedCache = null
  }

  /** Last used row/column (content, styles or spilled values), -1 when empty. */
  used(): { r: number; c: number } {
    if (this.usedCache) return this.usedCache
    let r = -1
    let c = -1
    for (const k of this.cells.keys()) {
      const rr = keyRow(k)
      const cc = keyCol(k)
      if (rr > r) r = rr
      if (cc > c) c = cc
    }
    for (const k of this.spillOwner.keys()) {
      const rr = keyRow(k)
      const cc = keyCol(k)
      if (rr > r) r = rr
      if (cc > c) c = cc
    }
    this.usedCache = { r, c }
    return this.usedCache
  }

  /** True when the cell holds content (not just a style) or a spilled value. */
  hasValue(r: number, c: number): boolean {
    const key = cellKey(r, c)
    const d = this.cells.get(key)
    if (d && (d.f !== undefined || (d.v !== undefined && d.v !== null && d.v !== ''))) return true
    return this.spillOwner.has(key)
  }

  mergeAt(r: number, c: number): Range | undefined {
    for (const m of this.merges) if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m
    return undefined
  }

  /** Style id that applies to a cell: own style, else row style, else column style. */
  styleId(r: number, c: number): number {
    const d = this.cells.get(cellKey(r, c))
    if (d?.s !== undefined) return d.s
    return this.rowStyle.get(r) ?? this.colStyle.get(c) ?? 0
  }
}

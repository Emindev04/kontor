// Sheet-level features that live next to the cell grid: floating objects (charts, pictures, shapes),
// tables, filters, conditional formatting, data validation, notes and comments, protection,
// outline groups, sparklines, PivotTables, page breaks and scenarios.
// Everything here is plain data so it can be cloned for undo and stored as JSON.
import type { Range } from './address'
import type { Scalar } from './types'

/** Position and size in unzoomed sheet pixels (0,0 = top-left corner of cell A1). */
export type Anchor = { x: number; y: number; w: number; h: number }

// ---------- charts ----------

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'radar' | 'combo' | 'histogram' | 'waterfall' | 'funnel' | 'treemap' | 'boxWhisker'
export type ChartGrouping = 'clustered' | 'stacked' | 'percent'
export type SeriesType = 'column' | 'line' | 'area'
export type Trendline = 'linear' | 'exponential' | 'logarithmic' | 'movingAverage'

export interface ChartSeries {
  /** Series name: a reference ("Sheet1!$B$1") or literal text. */
  name?: string
  /** Values reference, e.g. "Sheet1!$B$2:$B$13". */
  values: string
  /** Category (x) labels or x values for scatter charts. */
  categories?: string
  /** Series type in combo charts. */
  type?: SeriesType
  color?: string
  secondary?: boolean
  trendline?: Trendline
}

export interface ChartDef {
  kind: 'chart'
  id: number
  /** Objects with the same group id move and select together (Group). */
  group?: number
  name: string
  anchor: Anchor
  type: ChartType
  grouping: ChartGrouping
  markers: boolean
  smooth: boolean
  /** Data range the chart was made from ("Sheet1!$A$1:$C$13"); series are derived from it unless `series` is set. */
  source: string
  /** Series come from rows instead of columns. */
  byRow: boolean
  series?: ChartSeries[]
  title: { show: boolean; text?: string; overlay?: boolean }
  legend: 'right' | 'top' | 'bottom' | 'left' | 'none'
  dataLabels: 'none' | 'value' | 'percent' | 'category'
  axisTitles: { x?: string; y?: string }
  axes: { x: boolean; y: boolean }
  gridlines: { major: boolean; minor: boolean; vertical: boolean }
  /** Chart style preset (1-8) and color palette (0 = colorful, 1-7 = monochromatic). */
  style: number
  palette: number
  holeSize: number
  gapWidth: number
  fill?: string
  border?: string
  fontColor?: string
  /** On its own chart sheet instead of floating over cells. */
  chartSheet?: boolean
  /** Value axis options (Format Axis): bounds, major unit, logarithmic scale, reverse order, number format. */
  valueAxis?: { min?: number; max?: number; major?: number; log?: boolean; reverse?: boolean; fmt?: string }
  /** Error bars on every series. */
  errorBars?: { type: 'stdErr' | 'percent' | 'stdDev' | 'fixed'; value: number }
  /** Format Data Point: fill colors of single points, keyed "series:point" (0-based). */
  pointColors?: Record<string, string>
  /** Chart Elements > Data Table: the values in a table under the plot area. */
  dataTable?: boolean
}

// ---------- pictures, shapes and text boxes ----------

export interface PictureObj {
  kind: 'picture'
  id: number
  /** Objects with the same group id move and select together (Group). */
  group?: number
  name: string
  anchor: Anchor
  /** Key into Workbook.images. */
  image: string
  alt?: string
  rotation: number
  border?: string
}

export interface ShapeObj {
  kind: 'shape'
  id: number
  /** Objects with the same group id move and select together (Group). */
  group?: number
  name: string
  anchor: Anchor
  /** Preset id from SHAPES (grid/shapes.ts). */
  shape: string
  fill: string | null
  line: string | null
  lineWidth: number
  text: string
  textColor: string
  fontSize: number
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  vAlign: 'top' | 'middle' | 'bottom'
  rotation: number
  textBox?: boolean
  /** WordArt-like text effects. */
  effect?: 'shadow' | 'outline' | 'glow'
}

/** A slicer: buttons that filter a table column or a PivotTable field. */
export interface SlicerObj {
  kind: 'slicer'
  id: number
  /** Objects with the same group id move and select together (Group). */
  group?: number
  name: string
  anchor: Anchor
  caption: string
  source: { type: 'table'; table: string; column: string } | { type: 'pivot'; pivot: number; field: string }
  /** Selected items; null = all items (no filter). */
  selected: string[] | null
  /** Button columns. */
  columns: number
  /** Color of the selected buttons. */
  color: string
  multi?: boolean
  /** A Timeline instead of buttons: filters a PivotTable date field by a range of periods. */
  timeline?: { level: DateUnit; start: number | null; end: number | null }
}

export type SheetObject = ChartDef | PictureObj | ShapeObj | SlicerObj

// ---------- filters ----------

export type FilterOp = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'begins' | 'notBegins' | 'ends' | 'notEnds' | 'contains' | 'notContains'

export type FilterSpec =
  | { kind: 'values'; values: string[]; blanks: boolean }
  | { kind: 'custom'; and: boolean; c1: { op: FilterOp; value: string }; c2?: { op: FilterOp; value: string } }
  | { kind: 'top10'; top: boolean; percent: boolean; n: number }
  | { kind: 'average'; above: boolean }
  | { kind: 'color'; fill?: string; font?: string }
  | { kind: 'dynamic'; period: DatePeriod }

export type SortState = { col: number; desc: boolean } | null

export interface AutoFilter {
  range: Range
  /** Filter per column offset inside the range. */
  filters: Record<number, FilterSpec>
  sort?: SortState
}

// ---------- tables ----------

export type TotalFn = 'none' | 'sum' | 'average' | 'count' | 'countNums' | 'max' | 'min' | 'stdDev' | 'var' | 'custom'

export interface TableColumn {
  name: string
  total: TotalFn
  /** Formula for "custom" totals, or the label shown in the first total cell. */
  totalFormula?: string
  totalLabel?: string
  /** Calculated column formula (without "="), filled into new rows. */
  calc?: string
}

export interface TableDef {
  id: number
  name: string
  /** Whole table including header and total rows. */
  range: Range
  header: boolean
  totals: boolean
  style: string
  bandRows: boolean
  bandCols: boolean
  firstCol: boolean
  lastCol: boolean
  filterButton: boolean
  columns: TableColumn[]
  filters: Record<number, FilterSpec>
  sort?: SortState
}

// ---------- conditional formatting ----------

export type CFStyle = { fill?: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; border?: string; fmt?: string }
export type CFValue = { type: 'min' | 'max' | 'num' | 'percent' | 'percentile' | 'formula' | 'auto'; value?: number | string }
export type CellOp = 'greaterThan' | 'lessThan' | 'between' | 'notBetween' | 'equal' | 'notEqual' | 'greaterThanOrEqual' | 'lessThanOrEqual'
export type DatePeriod = 'yesterday' | 'today' | 'tomorrow' | 'last7Days' | 'lastWeek' | 'thisWeek' | 'nextWeek' | 'lastMonth' | 'thisMonth' | 'nextMonth' | 'lastYear' | 'thisYear' | 'nextYear' | 'aboveAverage' | 'belowAverage'

export type CFCondition =
  | { type: 'cellIs'; op: CellOp; f1: string; f2?: string }
  | { type: 'text'; op: 'contains' | 'notContains' | 'beginsWith' | 'endsWith'; text: string }
  | { type: 'date'; period: DatePeriod }
  | { type: 'duplicate' }
  | { type: 'unique' }
  | { type: 'top'; bottom: boolean; rank: number; percent: boolean }
  | { type: 'average'; above: boolean; equal: boolean; std?: number }
  | { type: 'blanks' }
  | { type: 'noBlanks' }
  | { type: 'errors' }
  | { type: 'noErrors' }
  | { type: 'expression'; formula: string }
  | { type: 'dataBar'; color: string; gradient: boolean; min: CFValue; max: CFValue; showValue: boolean; border?: boolean; axis?: 'auto' | 'middle' | 'none'; negColor?: string; axisColor?: string }
  | { type: 'colorScale'; stops: { v: CFValue; color: string }[] }
  | { type: 'iconSet'; set: IconSetId; reverse: boolean; showValue: boolean; thresholds: CFValue[] }

export type IconSetId =
  | '3Arrows' | '3ArrowsGray' | '4Arrows' | '5Arrows' | '3Triangles' | '3TrafficLights1' | '3TrafficLights2' | '3Signs' | '4TrafficLights'
  | '3Symbols' | '3Symbols2' | '3Flags' | '3Stars' | '4Rating' | '5Rating' | '5Quarters' | '5Boxes' | '4RedToBlack'

export type CFRule = CFCondition & { id: number; ranges: Range[]; priority: number; stop: boolean; style?: CFStyle }
/** A rule before it gets an id and a priority. */
export type NewCFRule = CFCondition & { ranges: Range[]; stop: boolean; style?: CFStyle; priority?: number }

// ---------- data validation ----------

export type ValidationType = 'any' | 'whole' | 'decimal' | 'list' | 'date' | 'time' | 'textLength' | 'custom'

export interface Validation {
  id: number
  ranges: Range[]
  type: ValidationType
  op: CellOp
  f1?: string
  f2?: string
  allowBlank: boolean
  dropdown: boolean
  showInput: boolean
  inputTitle?: string
  inputMessage?: string
  showError: boolean
  errorStyle: 'stop' | 'warning' | 'information'
  errorTitle?: string
  errorMessage?: string
}

// ---------- notes, comments, protection ----------

export interface Note {
  text: string
  author: string
  visible: boolean
  w: number
  h: number
}

export interface CommentThread {
  resolved: boolean
  items: { author: string; text: string; date: string }[]
}

export type SheetPermission =
  | 'selectLocked' | 'selectUnlocked' | 'formatCells' | 'formatColumns' | 'formatRows' | 'insertColumns' | 'insertRows' | 'insertHyperlinks'
  | 'deleteColumns' | 'deleteRows' | 'sort' | 'autoFilter' | 'pivotTables' | 'objects' | 'scenarios'

export interface SheetProtection {
  /** Hash of the password, empty when there is none. */
  hash: string
  allow: Partial<Record<SheetPermission, boolean>>
}

export interface EditRange {
  title: string
  range: Range
  hash: string
}

// ---------- outline, sparklines, PivotTables, scenarios ----------

export interface Outline {
  /** Outline level (1-7) per row / column index. */
  rows: Record<number, number>
  cols: Record<number, number>
  summaryBelow: boolean
  summaryRight: boolean
}

export interface Sparkline {
  id: number
  group: number
  type: 'line' | 'column' | 'winloss'
  /** Data reference ("Sheet1!B2:M2"). */
  source: string
  r: number
  c: number
  color: string
  negColor: string
  markers: boolean
  high: boolean
  low: boolean
  first: boolean
  last: boolean
  negative: boolean
}

export type PivotFn = 'sum' | 'count' | 'average' | 'max' | 'min' | 'product' | 'countNums' | 'stdDev' | 'var'
export type PivotShowAs = 'normal' | 'pctGrand' | 'pctCol' | 'pctRow'

export interface PivotDef {
  id: number
  name: string
  /** Source data reference including the header row. */
  source: string
  /** Top-left output cell. */
  r: number
  c: number
  rows: string[]
  cols: string[]
  values: { field: string; fn: PivotFn; name?: string; showAs: PivotShowAs; fmt?: string }[]
  filters: { field: string; selected: string[] | null }[]
  grandRows: boolean
  grandCols: boolean
  subtotals: boolean
  layout: 'compact' | 'outline' | 'tabular'
  style: string
  bandRows: boolean
  collapsed: string[]
  /** Cells written by the last refresh (cleared before the next one). */
  output?: Range
  /** Grouping of field items: dates by period, numbers by ranges. */
  groups?: Record<string, PivotGroup>
  /** Item filters set by slicers (field → visible items); not shown in the report. */
  slicerFilters?: Record<string, string[]>
  /** Calculated fields: formulas over other fields ("=Revenue/Units"), summarized from their sums. */
  calcFields?: { name: string; formula: string }[]
  /** Date ranges set by timelines (field → [start, end) as date serials). */
  dateFilters?: Record<string, { start: number; end: number }>
}

export type DateUnit = 'years' | 'quarters' | 'months' | 'days'
export type PivotGroup = { kind: 'date'; units: DateUnit[] } | { kind: 'number'; start: number; end: number; step: number }

export interface Scenario {
  name: string
  /** Changing cells ("$B$1:$B$3"). */
  cells: string
  values: Scalar[]
  comment: string
}

export interface SheetExtras {
  objects: SheetObject[]
  tables: TableDef[]
  autoFilter: AutoFilter | null
  cf: CFRule[]
  validations: Validation[]
  notes: Record<number, Note>
  comments: Record<number, CommentThread>
  protection: SheetProtection | null
  editRanges: EditRange[]
  outline: Outline
  sparklines: Sparkline[]
  pivots: PivotDef[]
  rowBreaks: number[]
  colBreaks: number[]
  scenarios: Scenario[]
  /** Rows hidden by a filter (kept apart from manually hidden rows). */
  filtered: number[]
}

export const emptyExtras = (): SheetExtras => ({
  objects: [],
  tables: [],
  autoFilter: null,
  cf: [],
  validations: [],
  notes: {},
  comments: {},
  protection: null,
  editRanges: [],
  outline: { rows: {}, cols: {}, summaryBelow: true, summaryRight: true },
  sparklines: [],
  pivots: [],
  rowBreaks: [],
  colBreaks: [],
  scenarios: [],
  filtered: [],
})

/** Simple, non-cryptographic password hash (the file format's legacy sheet-protection hash). */
export function passwordHash(pw: string): string {
  if (!pw) return ''
  let h = 0
  for (let i = pw.length - 1; i >= 0; i--) {
    h = ((h >> 14) & 0x01) | ((h << 1) & 0x7fff)
    h ^= pw.charCodeAt(i)
  }
  h = ((h >> 14) & 0x01) | ((h << 1) & 0x7fff)
  h ^= pw.length
  h ^= 0xce4b
  return h.toString(16).toUpperCase().padStart(4, '0')
}

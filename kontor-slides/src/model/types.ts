import type { VertexHandles } from './outline'
// Presentation data model. Coordinates are CSS pixels at 96 dpi on the slide
// (a 16:9 slide is 1280 × 720), font sizes are points.

/** '#RRGGBB', 'theme:<slot>' or 'theme:<slot>:<variant>' (variant: l80 l60 l40 d25 d50 …). */
export type ColorRef = string

export type ThemeSlot = 'bg1' | 'tx1' | 'bg2' | 'tx2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hlink'

export type GradientStop = { pos: number; color: ColorRef; alpha?: number }

export type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: ColorRef; alpha?: number }
  | { type: 'gradient'; kind: 'linear' | 'radial'; angle: number; stops: GradientStop[] }
  | { type: 'picture'; src: string; tile?: boolean; alpha?: number }
  /** Preset pattern (OOXML names such as 'pct20', 'ltDnDiag'), see model/patterns.ts. */
  | { type: 'pattern'; preset: string; fg: ColorRef; bg: ColorRef }

export type Dash = 'solid' | 'sysDot' | 'sysDash' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot'
export type ArrowHead = 'none' | 'triangle' | 'arrow' | 'stealth' | 'diamond' | 'oval'

export type Line = {
  color: ColorRef
  /** Width in points. */
  width: number
  dash: Dash
  alpha?: number
  head?: ArrowHead
  tail?: ArrowHead
  /** Compound line: double, thick-thin, thin-thick or triple (OOXML names). */
  compound?: 'sng' | 'dbl' | 'thickThin' | 'thinThick' | 'tri'
  /** Sketched line style (hand-drawn look). */
  sketch?: 'curved' | 'freehand' | 'scribble' | null
} | null

export type Shadow = {
  color: ColorRef
  alpha: number
  /** Blur radius in points. */
  blur: number
  /** Distance in points. */
  dist: number
  /** Direction in degrees (0 = right, 90 = down). */
  angle: number
} | null

export type Effects = {
  shadow?: Shadow
  glow?: { color: ColorRef; size: number; alpha: number } | null
  softEdge?: number
  reflection?: boolean
  /** Shadow inside the shape's edge. */
  innerShadow?: Shadow
  /** Top bevel preset (OOXML names: circle, relaxedInset, cross, coolSlant, angle, softRound, convex, slope, divot, riblet, hardEdge, artDeco). */
  bevel?: string | null
  /** 3-D rotation around the x and y axes in degrees, with or without perspective. */
  rot3d?: { x: number; y: number; perspective?: boolean } | null
}

// ---------- Rich text (stored as ProseMirror JSON, see editor/schema.ts) ----------

export type TextAlign = 'left' | 'center' | 'right' | 'justify' | 'distributed'

export type ParaAttrs = {
  align?: TextAlign | null
  level?: number
  /** null = inherit from the placeholder, 'none', a bullet character, or 'num:<scheme>'. */
  bullet?: string | null
  /** Bullet size in percent of the text (Bullets and Numbering dialog). */
  bulletSize?: number | null
  bulletColor?: ColorRef | null
  /** First number of a numbered list. */
  startAt?: number | null
  /** Multiple of single line spacing (1 = single). */
  lineHeight?: number | null
  spaceBefore?: number | null
  spaceAfter?: number | null
  /** Exact line spacing in points (overrides lineHeight). */
  lineExact?: number | null
  /** Indentation before text in px (overrides the list level indent). */
  indent?: number | null
  /** First line indent in px; negative values make a hanging indent. */
  firstLine?: number | null
}

export type Mark =
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'superscript' | 'subscript' }
  | { type: 'highlight'; attrs: { color: string } }
  | { type: 'link'; attrs: { href: string } }
  | {
      type: 'textStyle'
      attrs: {
        fontFamily?: string | null
        fontSize?: number | null
        color?: ColorRef | null
        letterSpacing?: number | null
        shadow?: boolean | null
        caps?: 'all' | 'small' | null
        /** Underline style other than a plain single line (OOXML names: dbl, heavy, dotted, dash, wavy …). */
        uStyle?: string | null
        /** Underline color (otherwise the text color). */
        uColor?: ColorRef | null
        /** Double strikethrough. */
        strike2?: boolean | null
        /** Baseline offset in percent of the font size (superscript > 0, subscript < 0). */
        baseline?: number | null
        /** Equalize character height (all characters as tall as capitals). */
        equalize?: boolean | null
        /** Text glow color and size (pt). */
        glow?: ColorRef | null
        glowSize?: number | null
      }
    }

export type Inline =
  | { type: 'text'; text: string; marks?: Mark[] }
  | { type: 'hardBreak'; marks?: Mark[] }
  | { type: 'field'; attrs: { kind: 'slidenum' | 'date' }; marks?: Mark[] }

export type Para = { type: 'paragraph'; attrs?: ParaAttrs; content?: Inline[] }
export type RichDoc = { type: 'doc'; content: Para[] }

export type TextBody = {
  doc: RichDoc
  anchor: 'top' | 'middle' | 'bottom'
  autofit: 'none' | 'shrink' | 'resize'
  wrap: boolean
  /** Insets in px: left, top, right, bottom. */
  inset: [number, number, number, number]
  vert?: 'horz' | 'vert' | 'vert270' | 'stacked'
  columns?: number
  /** Space between text columns in px (default 0.25 in). */
  colSpacing?: number
  /** Font scale computed by "Shrink text on overflow" (1 = no shrink). */
  fontScale?: number
  /** Line spacing reduction (0–0.2) computed by "Shrink text on overflow"; also reduces paragraph spacing. */
  lnSpcReduction?: number
  /** WordArt-style text fill/outline (applies to the whole body). */
  textFill?: ColorRef | null
  textOutline?: { color: ColorRef; width: number } | null
  /** Text Effects > Reflection: a mirrored copy of the text below it. */
  textReflection?: boolean
  /** Text Effects > Transform: text warp preset (OOXML names such as textArchUp, textWave1). */
  warp?: string | null
}

// ---------- Elements ----------

export type PlaceholderStyle =
  | 'title'
  | 'ctrTitle'
  | 'subTitle'
  | 'sectionTitle'
  | 'sectionText'
  | 'body'
  | 'compHeader'
  | 'captionTitle'
  | 'captionBody'
  | 'captionText'
  | 'pic'

export type Placeholder = { style: PlaceholderStyle; idx: number }

export type Animation = {
  effect: 'entrance' | 'emphasis' | 'exit'
  /** Effect name, e.g. 'appear', 'fade', 'flyIn', 'wipe', 'zoom', 'pulse', 'spin'. */
  name: string
  direction?: 'left' | 'right' | 'up' | 'down'
  trigger: 'click' | 'with' | 'after'
  /** Seconds. */
  duration: number
  delay: number
  /** Order on the slide (lower first). */
  order: number
}

/** One animation effect in a slide's animation sequence (several may target the same object). */
export type AnimEntry = {
  id: string
  targetId: string
  effect: 'entrance' | 'emphasis' | 'exit' | 'path'
  /** Effect name, e.g. 'fade', 'flyIn', 'pulse', 'lineDown', 'custom'. */
  name: string
  direction?: 'left' | 'right' | 'up' | 'down'
  trigger: 'click' | 'with' | 'after'
  /** Seconds. */
  duration: number
  delay: number
  /** Number of repeats (1 = play once). */
  repeat?: number
  /** Motion path (SVG path data in px, relative to the object's position when the effect starts). */
  path?: string
  /** Start the effect when this object is clicked during the show (a trigger). */
  triggerId?: string | null
  /** Group text: animate each paragraph on its own ("By Paragraph") instead of as one object. */
  textBuild?: 'paragraph' | null
  /** Animate text: word by word or letter by letter (10 % of the duration between units). */
  textUnit?: 'word' | 'letter' | null
}

type ElementBase = {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  /** Rotation in degrees, clockwise. */
  rot: number
  flipH?: boolean
  flipV?: boolean
  hidden?: boolean
  locked?: boolean
  /** Size & Position > Lock aspect ratio: resizing keeps the proportions. */
  lockAspect?: boolean
  alt?: string
  link?: string
  /** Legacy single animation (files from earlier versions); converted into Slide.animations on load. */
  anim?: Animation | null
}

export type ShapeElement = ElementBase & {
  type: 'shape'
  /** Preset geometry name (OOXML prst), see model/shapes.ts. */
  prst: string
  adj?: number[]
  fill: Fill
  line: Line
  effects?: Effects
  text?: TextBody
  placeholder?: Placeholder
  /** Created with the Text Box tool. */
  textBox?: boolean
  /** Free-form outline (prst 'custom', e.g. from Merge Shapes): rings in local px at size ringsBox. */
  rings?: [number, number][][]
  /** Bézier handles per vertex of `rings` (same coordinates); absent or null means a straight corner. */
  handles?: (VertexHandles | null)[][]
  ringsBox?: { w: number; h: number }
  /** The free-form outline is an open line (Freeform/Scribble drawn without closing it). */
  open?: boolean
  /** Connector ends glued to connection sites of other objects (site: 0 top, 1 right, 2 bottom, 3 left). */
  conn?: { start?: { id: string; site: number } | null; end?: { id: string; site: number } | null }
}

export type ImageAdjust = {
  brightness?: number
  contrast?: number
  saturation?: number
  grayscale?: boolean
  transparency?: number
  /** Sharpen (> 0) or soften (< 0), -1…1. */
  sharpness?: number
  /** Color tone: cooler (< 0) or warmer (> 0), -1…1. */
  temperature?: number
  recolor?: 'sepia' | 'washout' | 'bw' | null
  /** Artistic effect (shown here; not written to .pptx). */
  artistic?: 'blur' | 'pencil' | 'photocopy' | 'glowEdges' | 'paint' | null
}

export type ImageElement = ElementBase & {
  type: 'image'
  src: string
  /** Natural size of the source image. */
  natW: number
  natH: number
  /** Crop insets as fractions of the source image. */
  crop?: { l: number; t: number; r: number; b: number }
  adjust?: ImageAdjust
  line: Line
  effects?: Effects
  /** Optional mask shape (Crop to Shape), OOXML prst. */
  mask?: string
  placeholder?: Placeholder
}

export type GroupElement = ElementBase & {
  type: 'group'
  /** Children in group-local coordinates (0,0 = top-left of the group box). */
  children: SlideElement[]
}

export type InkElement = ElementBase & {
  type: 'ink'
  /** Points in element-local coordinates. */
  points: [number, number][]
  color: ColorRef
  width: number
  highlighter?: boolean
}

// ---------- Tables ----------

export type CellSide = 't' | 'r' | 'b' | 'l'

export type TableCell = {
  doc: RichDoc
  /** Explicit shading; undefined uses the table style, null means no fill. */
  fill?: Fill | null
  /** Explicit borders per side; a missing side uses the table style, null means no border. */
  borders?: Partial<Record<CellSide, Line>>
  rowSpan?: number
  colSpan?: number
  /** Covered by a merged cell to its left or above. */
  merged?: boolean
  anchor?: 'top' | 'middle' | 'bottom'
  /** Cell margins in px: left, top, right, bottom. */
  margins?: [number, number, number, number]
  vert?: 'horz' | 'vert' | 'vert270'
}

export type TableRow = { h: number; cells: TableCell[] }

export type TableOptions = { headerRow: boolean; totalRow: boolean; bandedRows: boolean; firstCol: boolean; lastCol: boolean; bandedCols: boolean }

export type TableElement = ElementBase & {
  type: 'table'
  /** Column widths in px (they add up to w). */
  cols: number[]
  rows: TableRow[]
  styleId: string
  opts: TableOptions
  effects?: Effects
}

// ---------- Charts ----------

export type ChartType = 'column' | 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'scatter' | 'combo'
export type ChartGrouping = 'clustered' | 'stacked' | 'percent'
export type ChartSeriesType = 'column' | 'line' | 'area'

export type TrendlineType = 'linear' | 'exponential' | 'logarithmic' | 'polynomial' | 'power' | 'movingAvg'

export type Trendline = {
  type: TrendlineType
  /** Polynomial order (2–6). */
  order?: number
  /** Moving average period. */
  period?: number
  /** Forecast forward, in categories (or x units for scatter charts). */
  forward?: number
  showEquation?: boolean
  showR2?: boolean
}

/** Error bars: a fixed amount, a percentage of each value, a multiple of the standard deviation, or the standard error. */
export type ErrorBars = { type: 'fixed' | 'percent' | 'stdDev' | 'stdErr'; value: number; dir: 'both' | 'plus' | 'minus'; noCap?: boolean }

export type ChartSeries = {
  name: string
  values: (number | null)[]
  /** Explicit color; otherwise taken from the chart's color palette. */
  color?: ColorRef | null
  /** Series type in combo charts. */
  type?: ChartSeriesType
  /** Plotted against the secondary (right) value axis. */
  secondary?: boolean
  trendline?: Trendline | null
  errorBars?: ErrorBars | null
}

export type DataLabelPos = 'center' | 'insideEnd' | 'insideBase' | 'outsideEnd' | 'bestFit' | 'above' | 'below' | 'left' | 'right'

export type ChartElement = ElementBase & {
  type: 'chart'
  chartType: ChartType
  grouping: ChartGrouping
  /** Category labels (x values for scatter charts). */
  categories: string[]
  series: ChartSeries[]
  title: { show: boolean; text: string }
  legend: { show: boolean; pos: 'right' | 'bottom' | 'top' | 'left' }
  dataLabels: boolean
  /** Data label position (default: outside end for columns, above for lines, best fit for pies). */
  labelPos?: DataLabelPos | null
  /** What data labels show (default: the value). */
  labelShow?: { value?: boolean; category?: boolean; series?: boolean; percent?: boolean } | null
  axes: { cat: boolean; val: boolean; catTitle?: string | null; valTitle?: string | null; min?: number | null; max?: number | null; secTitle?: string | null }
  gridlines: { major: boolean; minor: boolean }
  /** Chart style 1–8 (visual preset). */
  style: number
  /** 0 = colorful theme accents, 1–6 = shades of one accent. */
  palette: number
  markers: boolean
  smooth: boolean
  /** 3-D look (column, bar and pie charts), written as 3-D chart types. */
  threeD?: boolean
  fill: Fill
  line: Line
}

// ---------- Diagrams (like the original's SmartArt graphics) ----------

export type DiagramLayout = 'basicList' | 'verticalList' | 'process' | 'chevron' | 'cycle' | 'radial' | 'hierarchy' | 'venn' | 'matrix' | 'pyramid' | 'target' | 'stepUp'

export type DiagramNode = { id: string; text: string; level: number }

export type DiagramElement = ElementBase & {
  type: 'diagram'
  layout: DiagramLayout
  /** Outline of the graphic: level 0 = main shapes, higher levels = sub-points or children. */
  nodes: DiagramNode[]
  /** Color scheme id, see model/diagram.ts. */
  colors: string
  /** Style id, see model/diagram.ts. */
  style: string
}

// ---------- Video and audio ----------

export type MediaElement = ElementBase & {
  type: 'media'
  kind: 'video' | 'audio'
  /** Data URL of the media file. */
  src: string
  mime: string
  /** Poster frame (data URL) shown before a video plays. */
  poster?: string | null
  /** Trim in seconds. */
  trimStart?: number
  trimEnd?: number | null
  /** Start automatically when the slide appears (otherwise on click). */
  autoPlay?: boolean
  loop?: boolean
  rewind?: boolean
  fullScreen?: boolean
  hideWhenNotPlaying?: boolean
  /** 0 = mute … 1 = high. */
  volume?: number
  /** Duration in seconds (measured when inserted). */
  duration?: number
}

/** Slide or section zoom: a live thumbnail that jumps to its slide during the show. */
export type ZoomElement = ElementBase & { type: 'zoom'; targetId: string; kind: 'slide' | 'section' | 'summary'; line: Line }

export type SlideElement = ShapeElement | ImageElement | GroupElement | InkElement | TableElement | ChartElement | DiagramElement | MediaElement | ZoomElement

// ---------- Slides & presentation ----------

export type TransitionName =
  | 'none'
  | 'fade'
  | 'push'
  | 'wipe'
  | 'split'
  | 'reveal'
  | 'cover'
  | 'cut'
  | 'zoom'
  | 'dissolve'
  | 'circle'
  | 'blinds'
  | 'checker'
  | 'randomBars'
  | 'shape'
  | 'uncover'
  | 'flash'
  | 'clock'
  | 'wedge'
  | 'strips'
  | 'newsflash'
  | 'flip'
  | 'cube'
  | 'fallOver'
  | 'curtains'
  | 'gallery'
  | 'vortex'
  | 'morph'

export type Transition = {
  name: TransitionName
  /** Effect option: direction ('left' | 'right' | 'up' | 'down') or 'in' / 'out' / 'horizontal' / 'vertical'. */
  option?: string
  /** Seconds. */
  duration: number
  advanceOnClick: boolean
  /** Seconds, or null for no automatic advance. */
  advanceAfter: number | null
  /** Transition sound (see model/sounds.ts); played in the slide show. */
  sound?: string | null
}

export type LayoutId =
  | 'title'
  | 'titleContent'
  | 'section'
  | 'twoContent'
  | 'comparison'
  | 'titleOnly'
  | 'blank'
  | 'contentCaption'
  | 'pictureCaption'

export type Comment = { id: string; author: string; text: string; date: string; x: number; y: number; replies: { id: string; author: string; text: string; date: string }[]; resolved?: boolean }

export type Slide = {
  id: string
  layout: LayoutId
  elements: SlideElement[]
  /** Overrides the theme background. */
  background?: Fill | null
  hideBackgroundGraphics?: boolean
  notes: string
  hidden?: boolean
  transition?: Transition | null
  comments?: Comment[]
  /** Animation sequence in playing order. */
  animations?: AnimEntry[]
  /** Starts a new section with this name. */
  section?: string | null
  /** Set on the synthetic slides of the Slide Master view. */
  masterEdit?: 'root' | 'layout'
}

export type HeaderFooter = {
  date: boolean
  dateAuto: boolean
  dateText: string
  slideNumber: boolean
  footer: boolean
  footerText: string
  notOnTitle: boolean
}

export type SlideSize = { w: number; h: number; name: '16:9' | '4:3' | 'custom' }

export type Presentation = {
  version: 1
  size: SlideSize
  themeId: string
  variant: number
  /** Optional font overrides chosen in Design > Variants > Fonts. */
  fonts?: { major: string; minor: string } | null
  /** Custom theme colors (Design > Variants > Colors > Customize Colors), over the variant's colors. */
  colors?: Partial<Record<ThemeSlot, string>> | null
  /** Name of the custom color scheme. */
  colorsName?: string | null
  slides: Slide[]
  headerFooter: HeaderFooter
  loop?: boolean
  useTimings?: boolean
  author?: string
  /** Set Up Slide Show. */
  showType?: 'speaker' | 'individual' | 'kiosk'
  showNoAnimation?: boolean
  penColor?: string
  laserColor?: string
  /** Which slides the show presents: all, a range (1-based) or a custom show. */
  showRange?: { from: number; to: number } | null
  showCustom?: string | null
  presenterView?: boolean
  /** Slide Show > Show Media Controls: play/pause bars on videos and audio during the show. */
  showMediaControls?: boolean
  customShows?: CustomShow[]
  master?: MasterData | null
  /** Proofing language of the text (BCP 47, e.g. 'en-US'); used by spell check and written to files. */
  lang?: string
  handout?: HandoutSettings
  notesMaster?: NotesMasterSettings
  /** Design > Variants > Effects: the theme effect scheme (see model/effectSchemes.ts). */
  effectScheme?: string | null
}

export type CustomShow = { id: string; name: string; slideIds: string[] }

// ---------- Slide master ----------

export type TextStyleOverride = { font?: string | null; size?: number | null; color?: ColorRef | null; bold?: boolean | null; italic?: boolean | null; align?: TextAlign | null }

export type LayoutOverride = {
  name?: string
  /** Placeholder boxes by "style:idx"; null removes a placeholder, unknown keys add one. */
  boxes?: Record<string, { x: number; y: number; w: number; h: number } | null>
  elements?: SlideElement[]
  background?: Fill | null
  hideMaster?: boolean
  preserve?: boolean
  noTitle?: boolean
  noFooters?: boolean
}

export type MasterData = {
  title?: TextStyleOverride
  body?: TextStyleOverride
  /** Decorative objects shown on every slide. */
  elements?: SlideElement[]
  background?: Fill | null
  layouts?: Partial<Record<LayoutId, LayoutOverride>>
}

export type HandoutSettings = { perPage: 1 | 2 | 3 | 4 | 6 | 9; orientation: 'portrait' | 'landscape'; header: boolean; headerText: string; footer: boolean; footerText: string; date: boolean; pageNumber: boolean }

export type NotesMasterSettings = { header: boolean; headerText: string; footer: boolean; footerText: string; date: boolean; pageNumber: boolean; slideImage: boolean; body: boolean }

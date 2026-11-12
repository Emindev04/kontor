import type { JSONContent } from '@tiptap/core'
import { PX_PER_IN } from './units'
import { tx } from './i18n'

export type PaperSize = 'letter' | 'legal' | 'executive' | 'tabloid' | 'statement' | 'a3' | 'a4' | 'a5' | 'b5'
export type Orientation = 'portrait' | 'landscape'
/** Page margins in inches. */
export type Margins = { top: number; right: number; bottom: number; left: number }
export type PageNumberFormat = 'decimal' | 'lowerRoman' | 'upperRoman' | 'lowerLetter' | 'upperLetter'

export type PageSetup = {
  size: PaperSize | 'custom'
  /** Width and height (portrait, inches) when `size` is "custom". */
  customSize?: { w: number; h: number }
  orientation: Orientation
  margins: Margins
  /** Mirrored margins: left/right become inside/outside (exported; shown as inside on screen). */
  mirrored: boolean
  /** Extra space for binding (inches), added to the left (inside) or top margin. */
  gutter?: number
  gutterPosition?: 'left' | 'top'
  /** Distance of the header from the top edge and of the footer from the bottom edge, in inches. */
  headerDistance: number
  footerDistance: number
  differentFirstPage: boolean
  /** Different headers and footers on even pages (odd pages use the default ones). */
  differentOddEven: boolean
  /** Vertical alignment of the text on the page. */
  verticalAlign: 'top' | 'center' | 'bottom' | 'justify'
  /** Line numbers in the left margin. */
  lineNumbers: 'none' | 'continuous' | 'restartPage'
  pageNumberFormat: PageNumberFormat
  pageNumberStart: number
}

export const PAPER: Record<PaperSize, { label: string; w: number; h: number }> = {
  letter: { label: tx('Letter'), w: 8.5, h: 11 },
  legal: { label: tx('Legal'), w: 8.5, h: 14 },
  executive: { label: tx('Executive'), w: 7.25, h: 10.5 },
  tabloid: { label: tx('Tabloid'), w: 11, h: 17 },
  statement: { label: tx('Statement'), w: 5.5, h: 8.5 },
  a3: { label: 'A3', w: 11.69, h: 16.54 },
  a4: { label: 'A4', w: 8.27, h: 11.69 },
  a5: { label: 'A5', w: 5.83, h: 8.27 },
  b5: { label: tx('B5 (JIS)'), w: 7.17, h: 10.12 },
}

export const MARGIN_PRESETS: { id: string; label: string; margins: Margins; mirrored?: boolean }[] = [
  { id: 'normal', label: tx('Normal'), margins: { top: 1, bottom: 1, left: 1, right: 1 } },
  { id: 'narrow', label: tx('Narrow'), margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } },
  { id: 'moderate', label: tx('Moderate'), margins: { top: 1, bottom: 1, left: 0.75, right: 0.75 } },
  { id: 'wide', label: tx('Wide'), margins: { top: 1, bottom: 1, left: 2, right: 2 } },
  { id: 'mirrored', label: tx('Mirrored'), margins: { top: 1, bottom: 1, left: 1.25, right: 1 }, mirrored: true },
]

export const DEFAULT_SETUP: PageSetup = {
  size: 'letter',
  orientation: 'portrait',
  margins: MARGIN_PRESETS[0].margins,
  mirrored: false,
  headerDistance: 0.5,
  footerDistance: 0.5,
  differentFirstPage: false,
  differentOddEven: false,
  verticalAlign: 'top',
  lineNumbers: 'none',
  pageNumberFormat: 'decimal',
  pageNumberStart: 1,
}

/** Paper size in inches in portrait orientation. */
export function paperSize(setup: PageSetup): { w: number; h: number; label: string } {
  if (setup.size === 'custom' && setup.customSize) return { ...setup.customSize, label: tx('Custom size') }
  return PAPER[setup.size as PaperSize] ?? PAPER.letter
}

/** Paper size in inches, already rotated for the orientation. */
export function paperDims(setup: PageSetup) {
  const p = paperSize(setup)
  return setup.orientation === 'portrait' ? { w: p.w, h: p.h } : { w: p.h, h: p.w }
}

/** Margins as laid out: the gutter is added to the left (inside) or top margin. */
export function effectiveMargins(setup: PageSetup): Margins {
  const g = setup.gutter ?? 0
  if (!g) return setup.margins
  return setup.gutterPosition === 'top' ? { ...setup.margins, top: setup.margins.top + g } : { ...setup.margins, left: setup.margins.left + g }
}

export const contentWidthIn = (setup: PageSetup) => paperDims(setup).w - effectiveMargins(setup).left - effectiveMargins(setup).right
export const contentWidthPx = (setup: PageSetup) => contentWidthIn(setup) * PX_PER_IN

/** Finds the preset size closest to the given dimensions (used by the importer). */
export function matchPaper(wIn: number, hIn: number): { size: PaperSize | 'custom'; orientation: Orientation; customSize?: { w: number; h: number } } {
  const portrait = wIn <= hIn
  const [w, h] = portrait ? [wIn, hIn] : [hIn, wIn]
  let best: PaperSize = 'letter'
  let bestDist = Infinity
  for (const [id, p] of Object.entries(PAPER) as [PaperSize, (typeof PAPER)[PaperSize]][]) {
    const d = Math.abs(p.w - w) + Math.abs(p.h - h)
    if (d < bestDist) {
      bestDist = d
      best = id
    }
  }
  if (bestDist > 0.1) return { size: 'custom', customSize: { w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 }, orientation: portrait ? 'portrait' : 'landscape' }
  return { size: best, orientation: portrait ? 'portrait' : 'landscape' }
}

// ---- Design (page background, watermark, borders) ----

export type Watermark = {
  text: string
  color: string
  layout: 'diagonal' | 'horizontal'
  semitransparent: boolean
  /** Picture watermark (data URL) instead of text, its scale and washout. */
  image?: string | null
  scale?: number
  washout?: boolean
}
/** Page color fill effects: a two-color gradient. */
export type PageFill = { from: string; to: string; angle: number } | null
export type PageBorder = { style: 'single' | 'double' | 'dotted' | 'dashed' | 'thick'; color: string; widthPt: number; offsetPt: number }
export type ParagraphSpacingId = 'default' | 'none' | 'compact' | 'tight' | 'open' | 'relaxed' | 'double'

export type PageDesign = {
  pageColor: string | null
  watermark: Watermark | null
  pageBorder: PageBorder | null
  paragraphSpacing: ParagraphSpacingId
  fonts: string
  colors: string
  hyphenation: boolean
  /** Design › Effects: the look of shapes, diagrams and charts. */
  effects?: 'none' | 'subtle' | 'moderate' | 'intense' | 'glow'
  /** Layout › Hyphenation › Hyphenation Options. */
  hyphenationOptions?: { caps: boolean; zone: number; limit: number }
  /** Style set (Design > Document Formatting). */
  styleSet?: string
  pageFill?: PageFill
}

export const DEFAULT_DESIGN: PageDesign = {
  pageColor: null,
  watermark: null,
  pageBorder: null,
  paragraphSpacing: 'default',
  fonts: 'default',
  colors: 'blue',
  hyphenation: false,
}

/** Theme fonts of the Design tab (heading font, body font). */
export const THEME_FONTS: { id: string; label: string; heading: string; body: string }[] = [
  { id: 'default', label: tx('Default'), heading: 'Calibri Light', body: 'Calibri' },
  { id: 'cambria', label: tx('Serif Headings'), heading: 'Cambria', body: 'Calibri' },
  { id: 'classic', label: tx('Classic'), heading: 'Cambria', body: 'Cambria' },
  { id: 'arial', label: 'Arial', heading: 'Arial', body: 'Arial' },
  { id: 'times', label: 'Times New Roman', heading: 'Times New Roman', body: 'Times New Roman' },
  { id: 'georgia', label: 'Georgia', heading: 'Georgia', body: 'Georgia' },
  { id: 'garamond', label: 'Garamond', heading: 'Garamond', body: 'Garamond' },
  { id: 'trebuchet', label: 'Trebuchet MS', heading: 'Trebuchet MS', body: 'Trebuchet MS' },
  { id: 'verdana', label: 'Verdana', heading: 'Verdana', body: 'Verdana' },
]

/** Theme colors: heading colors and the accent used by quotes, intense styles and table styles. */
export const THEME_COLORS: { id: string; label: string; heading: string; headingDark: string; accent: string }[] = [
  { id: 'blue', label: tx('Blue'), heading: '#2F5496', headingDark: '#1F3763', accent: '#4472C4' },
  { id: 'blueGreen', label: tx('Blue Green'), heading: '#1B587C', headingDark: '#123A52', accent: '#3494BA' },
  { id: 'green', label: tx('Green'), heading: '#3B7D23', headingDark: '#27531A', accent: '#5B9E3A' },
  { id: 'orange', label: tx('Orange'), heading: '#C55A11', headingDark: '#833C0B', accent: '#ED7D31' },
  { id: 'red', label: tx('Red'), heading: '#A5300F', headingDark: '#6E200A', accent: '#D34817' },
  { id: 'violet', label: tx('Violet'), heading: '#5C3B8C', headingDark: '#3D275D', accent: '#8064A2' },
  { id: 'gray', label: tx('Grayscale'), heading: '#404040', headingDark: '#262626', accent: '#7F7F7F' },
]

export const themeFonts = (design: PageDesign) => THEME_FONTS.find((f) => f.id === design.fonts) ?? THEME_FONTS[0]
export const themeColors = (design: PageDesign) => THEME_COLORS.find((c) => c.id === design.colors) ?? THEME_COLORS[0]

/** Paragraph spacing presets of the Design tab: space after (pt) and line spacing multiple. */
export const PARAGRAPH_SPACING: Record<ParagraphSpacingId, { label: string; before: number; after: number; line: number }> = {
  default: { label: tx('Default'), before: 0, after: 8, line: 1.08 },
  none: { label: tx('No Paragraph Space'), before: 0, after: 0, line: 1 },
  compact: { label: tx('Compact'), before: 0, after: 4, line: 1 },
  tight: { label: tx('Tight'), before: 0, after: 6, line: 1.15 },
  open: { label: tx('Open'), before: 0, after: 10, line: 1.15 },
  relaxed: { label: tx('Relaxed'), before: 0, after: 6, line: 1.5 },
  double: { label: tx('Double'), before: 0, after: 8, line: 2 },
}

// ---- Headers and footers ----

export type HeaderFooterSlot = 'header' | 'footer' | 'firstHeader' | 'firstFooter' | 'evenHeader' | 'evenFooter'
export const HF_SLOTS: HeaderFooterSlot[] = ['header', 'footer', 'firstHeader', 'firstFooter', 'evenHeader', 'evenFooter']
export type HeaderFooter = Record<HeaderFooterSlot, JSONContent | null>
export const EMPTY_HEADER_FOOTER: HeaderFooter = { header: null, footer: null, firstHeader: null, firstFooter: null, evenHeader: null, evenFooter: null }

export const SLOT_LABEL: Record<HeaderFooterSlot, string> = {
  header: 'Header',
  footer: 'Footer',
  firstHeader: 'First Page Header',
  firstFooter: 'First Page Footer',
  evenHeader: 'Even Page Header',
  evenFooter: 'Even Page Footer',
}

/** Header/footer slot used on a given page (0-based). */
export function slotFor(kind: 'header' | 'footer', page: number, setup: PageSetup): HeaderFooterSlot {
  if (page === 0 && setup.differentFirstPage) return kind === 'header' ? 'firstHeader' : 'firstFooter'
  if (setup.differentOddEven && (page + setup.pageNumberStart) % 2 === 0) return kind === 'header' ? 'evenHeader' : 'evenFooter'
  return kind
}

const ROMAN: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
]

function roman(n: number) {
  let out = ''
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s
      n -= v
    }
  }
  return out
}

function letters(n: number) {
  // a, b, … z, aa, bb, … like the original's "a, b, c" format.
  const letter = String.fromCharCode(97 + ((n - 1) % 26))
  return letter.repeat(Math.floor((n - 1) / 26) + 1)
}

export function formatPageNumber(n: number, format: PageNumberFormat) {
  if (n < 1) return String(n)
  switch (format) {
    case 'lowerRoman': return roman(n)
    case 'upperRoman': return roman(n).toUpperCase()
    case 'lowerLetter': return letters(n)
    case 'upperLetter': return letters(n).toUpperCase()
    default: return String(n)
  }
}

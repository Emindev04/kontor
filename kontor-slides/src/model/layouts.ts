import type { ColorRef, LayoutId, MasterData, PlaceholderStyle, TextAlign } from './types'
import type { DecoKind } from './themes'

type Box = { style: PlaceholderStyle; idx: number; x: number; y: number; w: number; h: number }

/** Placeholder boxes for a 1280 px wide slide; other widths are scaled horizontally. */
const BASE: Record<LayoutId, Box[]> = {
  title: [
    { style: 'ctrTitle', idx: 0, x: 160, y: 117.8, w: 960, h: 250.7 },
    { style: 'subTitle', idx: 1, x: 160, y: 378.2, w: 960, h: 173.8 },
  ],
  titleContent: [
    { style: 'title', idx: 0, x: 88, y: 38.3, w: 1104, h: 139.2 },
    { style: 'body', idx: 1, x: 88, y: 191.7, w: 1104, h: 456.8 },
  ],
  section: [
    { style: 'sectionTitle', idx: 0, x: 87.3, y: 179.5, w: 1104, h: 299.5 },
    { style: 'sectionText', idx: 1, x: 87.3, y: 481.8, w: 1104, h: 157.5 },
  ],
  twoContent: [
    { style: 'title', idx: 0, x: 88, y: 38.3, w: 1104, h: 139.2 },
    { style: 'body', idx: 1, x: 88, y: 191.7, w: 544, h: 456.8 },
    { style: 'body', idx: 2, x: 648, y: 191.7, w: 544, h: 456.8 },
  ],
  comparison: [
    { style: 'title', idx: 0, x: 88.2, y: 38.3, w: 1104, h: 139.2 },
    { style: 'compHeader', idx: 1, x: 88.2, y: 176.5, w: 541.5, h: 86.5 },
    { style: 'body', idx: 2, x: 88.2, y: 263, w: 541.5, h: 386.8 },
    { style: 'compHeader', idx: 3, x: 648, y: 176.5, w: 544.2, h: 86.5 },
    { style: 'body', idx: 4, x: 648, y: 263, w: 544.2, h: 386.8 },
  ],
  titleOnly: [{ style: 'title', idx: 0, x: 88, y: 38.3, w: 1104, h: 139.2 }],
  blank: [],
  contentCaption: [
    { style: 'captionTitle', idx: 0, x: 88.2, y: 48, w: 412.8, h: 168 },
    { style: 'captionBody', idx: 1, x: 544.2, y: 103.7, w: 648, h: 511.7 },
    { style: 'captionText', idx: 2, x: 88.2, y: 216, w: 412.8, h: 400.2 },
  ],
  pictureCaption: [
    { style: 'captionTitle', idx: 0, x: 88.2, y: 48, w: 412.8, h: 168 },
    { style: 'pic', idx: 1, x: 544.2, y: 103.7, w: 648, h: 511.7 },
    { style: 'captionText', idx: 2, x: 88.2, y: 216, w: 412.8, h: 400.2 },
  ],
}

export const LAYOUTS: { id: LayoutId; name: string }[] = [
  { id: 'title', name: 'Title Slide' },
  { id: 'titleContent', name: 'Title and Content' },
  { id: 'section', name: 'Section Header' },
  { id: 'twoContent', name: 'Two Content' },
  { id: 'comparison', name: 'Comparison' },
  { id: 'titleOnly', name: 'Title Only' },
  { id: 'blank', name: 'Blank' },
  { id: 'contentCaption', name: 'Content with Caption' },
  { id: 'pictureCaption', name: 'Picture with Caption' },
]

// The slide master of the open presentation (set by the store whenever the presentation changes).
let activeMaster: MasterData | null | undefined

export function setActiveMaster(m: MasterData | null | undefined) {
  activeMaster = m
}

export function getActiveMaster() {
  return activeMaster
}

export function layoutName(id: LayoutId) {
  return activeMaster?.layouts?.[id]?.name || LAYOUTS.find((l) => l.id === id)?.name || id
}

/** Layout placeholders as designed (without slide master changes). */
export function baseLayoutBoxes(id: LayoutId, slideW: number, slideH: number): Box[] {
  const sx = slideW / 1280
  const sy = slideH / 720
  return (BASE[id] ?? []).map((b) => ({ ...b, x: b.x * sx, y: b.y * sy, w: b.w * sx, h: b.h * sy }))
}

export function layoutBoxes(id: LayoutId, slideW: number, slideH: number, master: MasterData | null | undefined = activeMaster): Box[] {
  const base = baseLayoutBoxes(id, slideW, slideH)
  const ov = master?.layouts?.[id]
  if (!ov) return base
  const boxes = ov.boxes ?? {}
  const out: Box[] = []
  for (const b of base) {
    const key = `${b.style}:${b.idx}`
    if (ov.noTitle && isTitleStyle(b.style)) continue
    if (key in boxes) {
      const v = boxes[key]
      if (v) out.push({ ...b, ...v })
    } else out.push(b)
  }
  for (const [key, v] of Object.entries(boxes)) {
    if (!v || base.some((b) => `${b.style}:${b.idx}` === key)) continue
    const [style, idx] = key.split(':')
    out.push({ style: style as PlaceholderStyle, idx: Number(idx), ...v })
  }
  return out
}

export function decoKind(id: LayoutId): DecoKind {
  return id === 'title' ? 'title' : id === 'section' ? 'section' : 'content'
}

export type FooterKind = 'date' | 'footer' | 'sldNum'

export function footerBox(kind: FooterKind, slideW: number, slideH: number) {
  const sx = slideW / 1280
  const sy = slideH / 720
  const y = 667.3 * sy
  const h = 38.3 * sy
  if (kind === 'date') return { x: 88 * sx, y, w: 288 * sx, h, align: 'left' as const }
  if (kind === 'footer') return { x: 424 * sx, y, w: 432 * sx, h, align: 'center' as const }
  return { x: 904 * sx, y, w: 288 * sx, h, align: 'right' as const }
}

export type StyleDef = {
  font: 'major' | 'minor'
  /** Font size (pt) per indent level. */
  sizes: number[]
  bold?: boolean
  color?: ColorRef
  align: TextAlign | 'title'
  anchor: 'top' | 'middle' | 'bottom'
  bullets: boolean
  lineHeight: number
  spaceBefore: number[]
  prompt: string
}

const BODY_SIZES = [28, 24, 20, 18, 18, 18, 18, 18, 18]
const SUB_SIZES = [24, 20, 18, 16, 16, 16, 16, 16, 16]

export const STYLE_DEFS: Record<PlaceholderStyle | 'textBox' | 'shape', StyleDef> = {
  title: { font: 'major', sizes: [44], align: 'title', anchor: 'middle', bullets: false, lineHeight: 0.9, spaceBefore: [0], prompt: 'Click to add title' },
  ctrTitle: { font: 'major', sizes: [60], align: 'center', anchor: 'bottom', bullets: false, lineHeight: 0.9, spaceBefore: [0], prompt: 'Click to add title' },
  subTitle: { font: 'minor', sizes: SUB_SIZES, align: 'center', anchor: 'top', bullets: false, lineHeight: 0.9, spaceBefore: [10, 5], prompt: 'Click to add subtitle' },
  sectionTitle: { font: 'major', sizes: [60], align: 'left', anchor: 'bottom', bullets: false, lineHeight: 0.9, spaceBefore: [0], prompt: 'Click to add title' },
  sectionText: { font: 'minor', sizes: SUB_SIZES, color: 'theme:tx1:l25', align: 'left', anchor: 'top', bullets: false, lineHeight: 0.9, spaceBefore: [10, 5], prompt: 'Click to add text' },
  body: { font: 'minor', sizes: BODY_SIZES, align: 'left', anchor: 'top', bullets: true, lineHeight: 0.9, spaceBefore: [10, 5], prompt: 'Click to add text' },
  compHeader: { font: 'minor', sizes: SUB_SIZES, bold: true, align: 'left', anchor: 'bottom', bullets: false, lineHeight: 0.9, spaceBefore: [10, 5], prompt: 'Click to add text' },
  captionTitle: { font: 'major', sizes: [32], align: 'left', anchor: 'bottom', bullets: false, lineHeight: 0.9, spaceBefore: [0], prompt: 'Click to add title' },
  captionBody: { font: 'minor', sizes: [32, 28, 24, 20, 20, 20, 20, 20, 20], align: 'left', anchor: 'top', bullets: true, lineHeight: 0.9, spaceBefore: [10, 5], prompt: 'Click to add text' },
  captionText: { font: 'minor', sizes: [16, 14, 12, 10, 10, 10, 10, 10, 10], align: 'left', anchor: 'top', bullets: false, lineHeight: 0.9, spaceBefore: [10, 5], prompt: 'Click to add text' },
  pic: { font: 'minor', sizes: [32], align: 'center', anchor: 'middle', bullets: false, lineHeight: 0.9, spaceBefore: [0], prompt: 'Click icon to add picture' },
  textBox: { font: 'minor', sizes: [18], align: 'left', anchor: 'top', bullets: false, lineHeight: 1, spaceBefore: [0], prompt: '' },
  shape: { font: 'minor', sizes: [18], align: 'center', anchor: 'middle', bullets: false, lineHeight: 1, spaceBefore: [0], prompt: '' },
}

export function isTitleStyle(style: PlaceholderStyle) {
  return style === 'title' || style === 'ctrTitle' || style === 'sectionTitle' || style === 'captionTitle'
}

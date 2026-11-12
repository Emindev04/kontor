import type { Fill, GroupElement, ImageElement, LayoutId, Line, PlaceholderStyle, Presentation, ShapeElement, Slide, SlideElement, SlideSize, TextBody } from './types'
import { emptyDoc, isDocEmpty } from './richtext'
import { layoutBoxes, STYLE_DEFS } from './layouts'
import { DEFAULT_THEME_ID } from './themes'
import { ACTION_LINKS, LINE_SHAPES, OPEN_SHAPES, type ShapePreset } from './shapes'

export const SIZE_16_9: SlideSize = { w: 1280, h: 720, name: '16:9' }
export const SIZE_4_3: SlideSize = { w: 960, h: 720, name: '4:3' }

export const DEFAULT_INSET: [number, number, number, number] = [9.6, 4.8, 9.6, 4.8]

let counter = 0
export function uid(prefix = 'e') {
  counter = (counter + 1) % 1e6
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function textBody(partial: Partial<TextBody> = {}): TextBody {
  return { doc: emptyDoc(), anchor: 'top', autofit: 'none', wrap: true, inset: [...DEFAULT_INSET], ...partial }
}

const PH_NAMES: Record<PlaceholderStyle, string> = {
  title: 'Title',
  ctrTitle: 'Title',
  sectionTitle: 'Title',
  captionTitle: 'Title',
  subTitle: 'Subtitle',
  body: 'Content Placeholder',
  captionBody: 'Content Placeholder',
  sectionText: 'Text Placeholder',
  compHeader: 'Text Placeholder',
  captionText: 'Text Placeholder',
  pic: 'Picture Placeholder',
}

export function placeholderElement(style: PlaceholderStyle, idx: number, box: { x: number; y: number; w: number; h: number }): ShapeElement {
  const def = STYLE_DEFS[style]
  return {
    id: uid(),
    type: 'shape',
    name: `${PH_NAMES[style]} ${idx + 1}`,
    prst: 'rect',
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rot: 0,
    fill: { type: 'none' },
    line: null,
    placeholder: { style, idx },
    text: textBody({ anchor: def.anchor, autofit: 'shrink' }),
  }
}

export function createSlide(layout: LayoutId, size: SlideSize): Slide {
  return {
    id: uid('s'),
    layout,
    elements: layoutBoxes(layout, size.w, size.h).map((b) => placeholderElement(b.style, b.idx, b)),
    notes: '',
  }
}

export function createPresentation(themeId = DEFAULT_THEME_ID, variant = 0, size: SlideSize = SIZE_16_9): Presentation {
  return {
    version: 1,
    size,
    themeId,
    variant,
    slides: [createSlide('title', size)],
    headerFooter: { date: false, dateAuto: true, dateText: '', slideNumber: false, footer: false, footerText: '', notOnTitle: false },
  }
}

export function nextName(elements: SlideElement[], base: string) {
  return `${base} ${elements.length + 1}`
}

export function defaultFill(): Fill {
  return { type: 'solid', color: 'theme:accent1' }
}

export function defaultLine(): Line {
  return { color: 'theme:accent1:d50', width: 1, dash: 'solid' }
}

export function createShape(preset: ShapePreset, box: { x: number; y: number; w: number; h: number; flipH?: boolean; flipV?: boolean }, elements: SlideElement[]): ShapeElement {
  const isOpen = OPEN_SHAPES.has(preset.prst)
  const isLine = LINE_SHAPES.has(preset.prst)
  return {
    id: uid(),
    type: 'shape',
    name: nextName(elements, preset.label.split(':')[0]),
    prst: preset.prst,
    ...box,
    rot: 0,
    fill: isOpen ? { type: 'none' } : defaultFill(),
    line: isLine ? { color: 'theme:accent1', width: 1, dash: 'solid', head: preset.head, tail: preset.tail } : isOpen ? { color: 'theme:accent1', width: 1, dash: 'solid' } : defaultLine(),
    text: isLine ? undefined : textBody({ anchor: 'middle' }),
    ...(ACTION_LINKS[preset.prst] ? { link: ACTION_LINKS[preset.prst] } : {}),
  }
}

export function createTextBox(box: { x: number; y: number; w: number; h: number }, elements: SlideElement[], wrap = true): ShapeElement {
  return {
    id: uid(),
    type: 'shape',
    name: nextName(elements, 'TextBox'),
    prst: 'rect',
    ...box,
    rot: 0,
    fill: { type: 'none' },
    line: null,
    textBox: true,
    text: textBody({ autofit: 'resize', wrap }),
  }
}

export function createImage(src: string, natW: number, natH: number, slide: SlideSize, elements: SlideElement[]): ImageElement {
  const scale = Math.min(1, (slide.w * 0.8) / natW, (slide.h * 0.8) / natH)
  const w = natW * scale
  const h = natH * scale
  return { id: uid(), type: 'image', name: nextName(elements, 'Picture'), src, natW, natH, x: (slide.w - w) / 2, y: (slide.h - h) / 2, w, h, rot: 0, line: null }
}

/** Deep copy with fresh ids (for duplicate and paste). */
export function cloneElement<T extends SlideElement>(el: T): T {
  const copy = structuredClone(el) as T
  copy.id = uid()
  if (copy.type === 'group') copy.children = copy.children.map((c) => cloneElement(c))
  return copy
}

export function cloneSlide(slide: Slide): Slide {
  const elements = slide.elements.map((e) => cloneElement(e))
  // Animations follow their objects to the copy.
  const ids = new Map(slide.elements.map((e, i) => [e.id, elements[i].id]))
  const animations = slide.animations?.filter((a) => ids.has(a.targetId)).map((a) => ({ ...a, id: uid('a'), targetId: ids.get(a.targetId)!, triggerId: a.triggerId ? (ids.get(a.triggerId) ?? null) : a.triggerId }))
  return { ...structuredClone(slide), id: uid('s'), elements, animations, section: null }
}

function isPlaceholderEmpty(el: SlideElement) {
  return el.type === 'shape' && !!el.placeholder && isDocEmpty(el.text?.doc)
}

/** Switches a slide to another layout, moving content into matching placeholders like the original program. */
export function applyLayout(slide: Slide, layout: LayoutId, size: SlideSize): Slide {
  const boxes = layoutBoxes(layout, size.w, size.h)
  const used = new Set<string>()
  const placed: SlideElement[] = []
  const phs = slide.elements.filter((e) => (e.type === 'shape' || e.type === 'image') && e.placeholder)
  const kind = (s: PlaceholderStyle) => (s === 'title' || s === 'ctrTitle' || s === 'sectionTitle' || s === 'captionTitle' ? 'title' : s === 'pic' ? 'pic' : 'body')
  for (const box of boxes) {
    const match =
      phs.find((e) => !used.has(e.id) && (e as ShapeElement).placeholder!.style === box.style && (e as ShapeElement).placeholder!.idx === box.idx) ??
      phs.find((e) => !used.has(e.id) && kind((e as ShapeElement).placeholder!.style) === kind(box.style))
    if (match) {
      used.add(match.id)
      placed.push({ ...match, x: box.x, y: box.y, w: box.w, h: box.h, rot: 0, placeholder: { style: box.style, idx: box.idx } } as SlideElement)
    } else placed.push(placeholderElement(box.style, box.idx, box))
  }
  const rest = slide.elements.filter((e) => !used.has(e.id) && !isPlaceholderEmpty(e))
  return { ...slide, layout, elements: [...placed, ...rest] }
}

/** Reset: placeholders go back to their layout position and size; other content stays. */
export function resetSlide(slide: Slide, size: SlideSize): Slide {
  const boxes = layoutBoxes(slide.layout, size.w, size.h)
  const elements = slide.elements.map((e) => {
    if ((e.type !== 'shape' && e.type !== 'image') || !e.placeholder) return e
    const box = boxes.find((b) => b.style === e.placeholder!.style && b.idx === e.placeholder!.idx)
    if (!box) return e
    if (e.type === 'shape') return { ...e, x: box.x, y: box.y, w: box.w, h: box.h, rot: 0, fill: { type: 'none' as const }, line: null, effects: undefined, text: e.text ? { ...e.text, anchor: STYLE_DEFS[box.style].anchor } : e.text }
    return { ...e, x: box.x, y: box.y, w: box.w, h: box.h, rot: 0 }
  })
  for (const box of boxes) {
    if (!elements.some((e) => (e.type === 'shape' || e.type === 'image') && e.placeholder?.style === box.style && e.placeholder.idx === box.idx)) elements.push(placeholderElement(box.style, box.idx, box))
  }
  return { ...slide, elements, background: null, hideBackgroundGraphics: false }
}

export function findElement(elements: SlideElement[], id: string): SlideElement | undefined {
  for (const e of elements) {
    if (e.id === id) return e
    if (e.type === 'group') {
      const inner = findElement(e.children, id)
      if (inner) return inner
    }
  }
  return undefined
}

export function mapElements(elements: SlideElement[], fn: (e: SlideElement) => SlideElement): SlideElement[] {
  return elements.map((e) => {
    const next = fn(e)
    return next.type === 'group' ? ({ ...next, children: mapElements(next.children, fn) } as GroupElement) : next
  })
}

/** Top-level object that contains `id` (the object itself when it is not inside a group). */
export function topLevelOf(elements: SlideElement[], id: string): SlideElement | undefined {
  return elements.find((e) => e.id === id || (e.type === 'group' && !!findElement(e.children, id)))
}

/** Offset of a grouped object's coordinates on the slide (0,0 for top-level objects). */
export function parentOffset(elements: SlideElement[], id: string, ox = 0, oy = 0): { x: number; y: number } | null {
  for (const e of elements) {
    if (e.id === id) return { x: ox, y: oy }
    if (e.type === 'group') {
      const r = parentOffset(e.children, id, ox + e.x, oy + e.y)
      if (r) return r
    }
  }
  return null
}

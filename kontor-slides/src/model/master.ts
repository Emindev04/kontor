// Slide Master view: the master and each layout are edited as ordinary (synthetic) slides whose
// ids start with "master:". Edits are folded back into Presentation.master.
import type { LayoutId, Mark, MasterData, Para, PlaceholderStyle, Presentation, RichDoc, ShapeElement, Slide, SlideElement, TextStyleOverride } from './types'
import { baseLayoutBoxes, isTitleStyle, layoutBoxes } from './layouts'
import { placeholderElement } from './factory'
import { t, tx } from '../i18n'

export const MASTER_ROOT = 'master:root'

export function isMasterId(id: string | null | undefined): id is string {
  return !!id && id.startsWith('master:')
}

export function masterTarget(id: string): 'root' | LayoutId {
  return id === MASTER_ROOT ? 'root' : (id.slice('master:'.length) as LayoutId)
}

export function masterIdFor(target: 'root' | LayoutId) {
  return target === 'root' ? MASTER_ROOT : `master:${target}`
}

const BODY_SAMPLE = [tx('Click to edit Master text styles'), tx('Second level'), tx('Third level'), tx('Fourth level'), tx('Fifth level')]

function marksFor(o: TextStyleOverride | undefined): Mark[] {
  if (!o) return []
  const marks: Mark[] = []
  if (o.bold) marks.push({ type: 'bold' })
  if (o.italic) marks.push({ type: 'italic' })
  if (o.font || o.size || o.color) marks.push({ type: 'textStyle', attrs: { fontFamily: o.font ?? null, fontSize: o.size ?? null, color: o.color ?? null } })
  return marks
}

function sampleDoc(style: PlaceholderStyle, master: MasterData | null | undefined): RichDoc {
  const title = isTitleStyle(style)
  const o = title ? master?.title : style === 'pic' ? undefined : master?.body
  const marks = marksFor(o)
  const text = (s: string) => [{ type: 'text' as const, text: s, ...(marks.length ? { marks } : {}) }]
  if (title) return { type: 'doc', content: [{ type: 'paragraph', attrs: o?.align ? { align: o.align } : undefined, content: text(t('Click to edit Master title style')) }] }
  if (style === 'pic') return { type: 'doc', content: [{ type: 'paragraph' }] }
  const levels = style === 'body' || style === 'captionBody' ? BODY_SAMPLE : [BODY_SAMPLE[0]]
  return { type: 'doc', content: levels.map((line, i): Para => ({ type: 'paragraph', attrs: { level: i, ...(o?.align ? { align: o.align } : {}) }, content: text(t(line)) })) }
}

/** The master or a layout as an editable slide. */
export function masterSlide(pres: Presentation, id: string): Slide {
  const target = masterTarget(id)
  const m = pres.master
  if (target === 'root') {
    const boxes = baseLayoutBoxes('titleContent', pres.size.w, pres.size.h)
    const phs = boxes.map((b) => ({ ...placeholderElement(b.style, b.idx, b), id: `${id}:${b.style}:${b.idx}`, text: { ...placeholderElement(b.style, b.idx, b).text!, doc: sampleDoc(b.style, m), autofit: 'none' as const } }))
    return { id, layout: 'titleContent', elements: [...phs, ...(m?.elements ?? [])], notes: '', background: m?.background ?? null, masterEdit: 'root' }
  }
  const ov = m?.layouts?.[target]
  const boxes = layoutBoxes(target, pres.size.w, pres.size.h, m)
  const phs: SlideElement[] = boxes.map((b) => {
    const base = placeholderElement(b.style, b.idx, b)
    return { ...base, id: `${id}:${b.style}:${b.idx}`, text: { ...base.text!, doc: sampleDoc(b.style, m), autofit: 'none' as const } }
  })
  return { id, layout: target, elements: [...phs, ...(ov?.elements ?? [])], notes: '', background: ov?.background ?? null, hideBackgroundGraphics: ov?.hideMaster, masterEdit: 'layout' }
}

function styleFromShape(el: ShapeElement): TextStyleOverride {
  const first = el.text?.doc.content[0]
  const run = first?.content?.find((n) => n.type === 'text')
  const ts = run?.marks?.find((mk) => mk.type === 'textStyle') as Extract<Mark, { type: 'textStyle' }> | undefined
  return {
    font: ts?.attrs.fontFamily ?? null,
    size: ts?.attrs.fontSize ?? null,
    color: ts?.attrs.color ?? null,
    bold: run?.marks?.some((mk) => mk.type === 'bold') || null,
    italic: run?.marks?.some((mk) => mk.type === 'italic') || null,
    align: first?.attrs?.align ?? null,
  }
}

/** Applies an edit made on a synthetic master/layout slide to Presentation.master. */
export function applyMasterEdit(pres: Presentation, id: string, fn: (s: Slide) => Slide): Presentation {
  const before = masterSlide(pres, id)
  const after = fn(before)
  if (after === before) return pres
  const target = masterTarget(id)
  const m: MasterData = { ...(pres.master ?? {}) }
  const isPh = (e: SlideElement) => e.id.startsWith(`${id}:`)
  const decorations = after.elements.filter((e) => !isPh(e))
  if (target === 'root') {
    const title = after.elements.find((e): e is ShapeElement => isPh(e) && e.type === 'shape' && !!e.placeholder && isTitleStyle(e.placeholder.style))
    const body = after.elements.find((e): e is ShapeElement => isPh(e) && e.type === 'shape' && !!e.placeholder && !isTitleStyle(e.placeholder.style))
    if (title) m.title = styleFromShape(title)
    if (body) m.body = styleFromShape(body)
    m.elements = decorations
    m.background = after.background ?? null
  } else {
    const ov = { ...(m.layouts?.[target] ?? {}) }
    const boxes: Record<string, { x: number; y: number; w: number; h: number } | null> = { ...(ov.boxes ?? {}) }
    const keyOf = (e: SlideElement) => e.id.slice(id.length + 1)
    for (const e of before.elements.filter(isPh)) if (!after.elements.some((x) => x.id === e.id)) boxes[keyOf(e)] = null
    for (const e of after.elements.filter(isPh)) {
      const prev = before.elements.find((x) => x.id === e.id)
      if (!prev || prev.x !== e.x || prev.y !== e.y || prev.w !== e.w || prev.h !== e.h) boxes[keyOf(e)] = { x: e.x, y: e.y, w: e.w, h: e.h }
    }
    ov.boxes = boxes
    ov.elements = decorations
    ov.background = after.background ?? null
    ov.hideMaster = !!after.hideBackgroundGraphics
    m.layouts = { ...(m.layouts ?? {}), [target]: ov }
  }
  // Slides follow their layout's placeholder positions, as in the original.
  const slides =
    target === 'root'
      ? pres.slides
      : pres.slides.map((s) => {
          if (s.layout !== target) return s
          const boxes = layoutBoxes(target, pres.size.w, pres.size.h, m)
          const old = layoutBoxes(target, pres.size.w, pres.size.h, pres.master)
          return {
            ...s,
            elements: s.elements.map((e) => {
              if ((e.type !== 'shape' && e.type !== 'image') || !e.placeholder) return e
              const was = old.find((b) => b.style === e.placeholder!.style && b.idx === e.placeholder!.idx)
              const now = boxes.find((b) => b.style === e.placeholder!.style && b.idx === e.placeholder!.idx)
              // Only placeholders still at their layout position move along.
              if (!was || !now || Math.abs(was.x - e.x) > 0.5 || Math.abs(was.y - e.y) > 0.5 || Math.abs(was.w - e.w) > 0.5 || Math.abs(was.h - e.h) > 0.5) return e
              return { ...e, x: now.x, y: now.y, w: now.w, h: now.h }
            }),
          }
        })
  return { ...pres, master: m, slides }
}

/** Adds a placeholder (Insert Placeholder) to a layout. */
export function insertLayoutPlaceholder(pres: Presentation, layout: LayoutId, style: PlaceholderStyle, box: { x: number; y: number; w: number; h: number }): Presentation {
  const m: MasterData = { ...(pres.master ?? {}) }
  const ov = { ...(m.layouts?.[layout] ?? {}) }
  const used = new Set(layoutBoxes(layout, pres.size.w, pres.size.h, m).map((b) => b.idx))
  let idx = 10
  while (used.has(idx)) idx++
  ov.boxes = { ...(ov.boxes ?? {}), [`${style}:${idx}`]: box }
  m.layouts = { ...(m.layouts ?? {}), [layout]: ov }
  return { ...pres, master: m }
}

export function setLayoutOption(pres: Presentation, layout: LayoutId, patch: Partial<NonNullable<MasterData['layouts']>[LayoutId]>): Presentation {
  const m: MasterData = { ...(pres.master ?? {}) }
  m.layouts = { ...(m.layouts ?? {}), [layout]: { ...(m.layouts?.[layout] ?? {}), ...patch } }
  return { ...pres, master: m }
}

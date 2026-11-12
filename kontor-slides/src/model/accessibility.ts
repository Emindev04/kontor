// Accessibility checker: errors, warnings and tips like the original's Accessibility pane.
import type { Mark, Presentation, ShapeElement, Slide, SlideElement } from './types'
import { luminance, resolveColor } from './color'
import { isDocEmpty } from './richtext'
import { isTitleStyle } from './layouts'
import { makeRenderCtx, slideBackground, textCtxFor } from '../render/context'

export type IssueLevel = 'error' | 'warning' | 'tip'
export type IssueFix = 'alt' | 'order' | 'header'
export type Issue = { level: IssueLevel; kind: string; slideId: string; slideIndex: number; elId?: string; name?: string; fix?: IssueFix }

export function contrastRatio(a: string, b: string) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function slideTitleText(slide: Slide) {
  const t = slide.elements.find((e): e is ShapeElement => e.type === 'shape' && !!e.placeholder && isTitleStyle(e.placeholder.style))
  return t?.text ? t.text.doc.content.map((p) => (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('')).join(' ').trim() : ''
}

/** Objects that need a description for screen readers. */
function needsAlt(el: SlideElement) {
  if (el.alt) return false
  if (el.type === 'image' || el.type === 'chart' || el.type === 'diagram' || el.type === 'group' || el.type === 'media') return true
  if (el.type === 'shape') return !el.placeholder && !el.textBox && isDocEmpty(el.text?.doc) && el.prst !== 'line' && el.fill.type !== 'none'
  return false
}

/** Visual reading order: top to bottom, then left to right (rows within 8 px count as one row). */
export function sortedByPosition(elements: SlideElement[]): SlideElement[] {
  return [...elements].sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x))
}

/** True when the order screen readers use (the object order) differs from the visual order of the content. */
export function readingOrderMismatch(slide: Slide) {
  const content = slide.elements.filter((e) => !e.hidden && !e.locked && !(e.alt === 'decorative'))
  if (content.length < 2) return false
  const visual = sortedByPosition(content).map((e) => e.id)
  return content.some((e, i) => e.id !== visual[i])
}

function linkMarks(doc: { content: { content?: { type: string; text?: string; marks?: Mark[] }[] }[] }) {
  const out: { text: string; href: string }[] = []
  for (const p of doc.content)
    for (const n of p.content ?? []) {
      const link = n.marks?.find((m): m is Extract<Mark, { type: 'link' }> => m.type === 'link')
      if (link && n.type === 'text') out.push({ text: n.text ?? '', href: link.attrs.href })
    }
  return out
}

export function checkAccessibility(pres: Presentation): Issue[] {
  const issues: Issue[] = []
  const titles = new Map<string, number>()
  pres.slides.forEach((sl) => {
    const t = slideTitleText(sl).toLowerCase()
    if (t) titles.set(t, (titles.get(t) ?? 0) + 1)
  })
  pres.slides.forEach((slide, slideIndex) => {
    const at = (level: IssueLevel, kind: string, el?: SlideElement, fix?: IssueFix) => issues.push({ level, kind, slideId: slide.id, slideIndex, elId: el?.id, name: el?.name, fix })
    const title = slideTitleText(slide)
    if (!title) at('error', 'Missing slide title')
    else if ((titles.get(title.toLowerCase()) ?? 0) > 1) at('warning', 'Duplicate slide title')
    const rc = makeRenderCtx(pres, slideIndex + 1, slide.layout)
    const bg = slideBackground(slide.background, rc)
    const walk = (els: SlideElement[], inGroup: boolean) => {
      for (const el of els) {
        if (el.hidden) continue
        if (!inGroup && needsAlt(el)) at('error', 'Missing alternative text', el, 'alt')
        if (el.type === 'group') walk(el.children, true)
        if (el.type === 'table') {
          if (!el.opts.headerRow) at('warning', 'No header row specified', el, 'header')
          if (el.rows.some((r) => r.cells.some((c) => c.merged))) at('warning', 'Merged cells', el)
        }
        if (el.type === 'shape' && el.text && !isDocEmpty(el.text.doc)) {
          const ctx = textCtxFor(el, rc)
          const fill = el.fill.type === 'solid' ? resolveColor(el.fill.color, rc.colors) : bg.type === 'solid' ? resolveColor(bg.color, rc.colors) : null
          if (fill) {
            const colors = new Set<string>([ctx.color])
            for (const p of el.text.doc.content)
              for (const n of p.content ?? []) {
                const ts = n.marks?.find((m): m is Extract<Mark, { type: 'textStyle' }> => m.type === 'textStyle')
                if (ts?.attrs.color) colors.add(resolveColor(ts.attrs.color, rc.colors))
              }
            const large = (ctx.sizes[0] ?? 18) * (el.text.fontScale ?? 1) >= 24 || (ctx.bold && ctx.sizes[0] >= 18.5)
            if ([...colors].some((c) => contrastRatio(c, fill) < (large ? 3 : 4.5))) at('warning', 'Hard-to-read text contrast', el)
          }
          for (const l of linkMarks(el.text.doc)) {
            const text = l.text.trim().toLowerCase()
            if (text === l.href.trim().toLowerCase() || /^(click here|here|link|more|read more)$/.test(text)) at('warning', 'Unclear hyperlink text', el)
          }
        }
      }
    }
    walk(slide.elements, false)
    if (readingOrderMismatch(slide)) at('tip', 'Check reading order', undefined, 'order')
  })
  return issues
}

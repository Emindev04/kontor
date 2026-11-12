// Review > Compare: the differences between this presentation and another version of it, as a list
// of slide-level changes that can be accepted one by one.
import type { Presentation, Slide, SlideElement } from './types'
import { docText } from './richtext'
import { slideTitleText } from './accessibility'
import { cloneSlide } from './factory'
import { tx } from '../i18n'

export type ChangeDetail = { text: string; vars?: Record<string, string | number> }

export type Change =
  | { kind: 'changed'; id: string; base: number; revised: number; details: ChangeDetail[] }
  | { kind: 'inserted'; id: string; revised: number; after: number }
  | { kind: 'deleted'; id: string; base: number }

const textOf = (el: SlideElement): string => {
  if (el.type === 'shape') return docText(el.text?.doc)
  if (el.type === 'group') return el.children.map(textOf).join(' ')
  if (el.type === 'table') return el.rows.map((r) => r.cells.map((c) => docText(c.doc)).join(' ')).join(' ')
  if (el.type === 'diagram') return el.nodes.map((n) => n.text).join(' ')
  return ''
}

const label = (el: SlideElement) => el.name || el.type
const strip = (el: SlideElement) => JSON.stringify({ ...el, id: undefined, x: undefined, y: undefined, w: undefined, h: undefined, rot: undefined })

/** What differs between two versions of one slide. */
export function slideDifferences(a: Slide, b: Slide): ChangeDetail[] {
  const out: ChangeDetail[] = []
  if (a.layout !== b.layout) out.push({ text: tx('Layout changed') })
  if (JSON.stringify(a.background ?? null) !== JSON.stringify(b.background ?? null) || !!a.hideBackgroundGraphics !== !!b.hideBackgroundGraphics) out.push({ text: tx('Background changed') })
  if ((a.notes ?? '') !== (b.notes ?? '')) out.push({ text: tx('Notes changed') })
  if (JSON.stringify(a.transition ?? null) !== JSON.stringify(b.transition ?? null)) out.push({ text: tx('Transition changed') })
  if (JSON.stringify(a.animations ?? []) !== JSON.stringify(b.animations ?? [])) out.push({ text: tx('Animations changed') })
  if (!!a.hidden !== !!b.hidden) out.push({ text: b.hidden ? tx('Slide hidden') : tx('Slide shown') })
  // Objects matched by id, otherwise by position in the list.
  const byId = new Set(a.elements.map((e) => e.id))
  const useIds = b.elements.some((e) => byId.has(e.id))
  const pairs: [SlideElement | undefined, SlideElement | undefined][] = []
  if (useIds) {
    const bIds = new Map(b.elements.map((e) => [e.id, e]))
    for (const e of a.elements) pairs.push([e, bIds.get(e.id)])
    for (const e of b.elements) if (!byId.has(e.id)) pairs.push([undefined, e])
  } else for (let i = 0; i < Math.max(a.elements.length, b.elements.length); i++) pairs.push([a.elements[i], b.elements[i]])
  for (const [x, y] of pairs) {
    if (x && !y) out.push({ text: tx('Deleted: {name}'), vars: { name: label(x) } })
    else if (!x && y) out.push({ text: tx('Inserted: {name}'), vars: { name: label(y) } })
    else if (x && y) {
      if (textOf(x) !== textOf(y)) out.push({ text: tx('Text changed in {name}'), vars: { name: label(y) } })
      else if (strip(x) !== strip(y)) out.push({ text: tx('Formatting changed: {name}'), vars: { name: label(y) } })
      if (Math.abs(x.x - y.x) > 0.5 || Math.abs(x.y - y.y) > 0.5 || Math.abs(x.w - y.w) > 0.5 || Math.abs(x.h - y.h) > 0.5 || x.rot !== y.rot) out.push({ text: tx('Moved or resized: {name}'), vars: { name: label(y) } })
    }
  }
  return out
}

/** Slides matched by id when the files share ids (files saved here), otherwise by title, then by position. */
function matchSlides(base: Presentation, revised: Presentation): Map<number, number> {
  const map = new Map<number, number>()
  const ids = new Map(revised.slides.map((s, i) => [s.id, i]))
  const used = new Set<number>()
  base.slides.forEach((s, i) => {
    const j = ids.get(s.id)
    if (j !== undefined) {
      map.set(i, j)
      used.add(j)
    }
  })
  if (map.size) return map
  const titles = revised.slides.map((s) => slideTitleText(s))
  base.slides.forEach((s, i) => {
    const t = slideTitleText(s)
    const j = titles.findIndex((x, k) => !used.has(k) && t && x === t)
    if (j >= 0) {
      map.set(i, j)
      used.add(j)
    }
  })
  base.slides.forEach((_, i) => {
    if (map.has(i) || used.has(i) || i >= revised.slides.length) return
    map.set(i, i)
    used.add(i)
  })
  return map
}

export function comparePresentations(base: Presentation, revised: Presentation): Change[] {
  const map = matchSlides(base, revised)
  const matched = new Set(map.values())
  const changes: Change[] = []
  base.slides.forEach((s, i) => {
    const j = map.get(i)
    if (j === undefined) changes.push({ kind: 'deleted', id: `d${i}`, base: i })
    else {
      const details = slideDifferences(s, revised.slides[j])
      if (details.length) changes.push({ kind: 'changed', id: `c${i}`, base: i, revised: j, details })
    }
  })
  revised.slides.forEach((_, j) => {
    if (matched.has(j)) return
    // Inserted after the base slide matched to the nearest earlier revised slide.
    let after = -1
    for (const [bi, rj] of map) if (rj < j && bi > after) after = bi
    changes.push({ kind: 'inserted', id: `i${j}`, revised: j, after })
  })
  return changes
}

/** Applies accepted changes to the base presentation (deletions last so indices stay valid). */
export function acceptChanges(base: Presentation, revised: Presentation, accepted: Change[]): Presentation {
  const slides: (Slide | null)[] = [...base.slides]
  const inserts = new Map<number, Slide[]>()
  for (const c of accepted) {
    if (c.kind === 'changed') slides[c.base] = { ...cloneSlide(revised.slides[c.revised]), id: base.slides[c.base].id }
    else if (c.kind === 'deleted') slides[c.base] = null
    else inserts.set(c.after, [...(inserts.get(c.after) ?? []), cloneSlide(revised.slides[c.revised])])
  }
  const out: Slide[] = [...(inserts.get(-1) ?? [])]
  slides.forEach((s, i) => {
    if (s) out.push(s)
    out.push(...(inserts.get(i) ?? []))
  })
  return { ...base, slides: out }
}

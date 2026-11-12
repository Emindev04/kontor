import { describe, expect, it } from 'vitest'
import { acceptChanges, comparePresentations } from './compare'
import { createPresentation, createSlide } from './factory'
import { docFromText } from './richtext'
import type { Presentation, ShapeElement } from './types'

function deck(): Presentation {
  const p = createPresentation()
  p.slides = [createSlide('title', p.size), createSlide('titleContent', p.size), createSlide('blank', p.size)]
  ;(p.slides[0].elements[0] as ShapeElement).text!.doc = docFromText('Hello')
  return p
}

describe('Compare', () => {
  it('finds changed, inserted and deleted slides', () => {
    const base = deck()
    const revised: Presentation = structuredClone(base)
    ;(revised.slides[0].elements[0] as ShapeElement).text!.doc = docFromText('Hello world')
    revised.slides[1].notes = 'New notes'
    revised.slides.splice(2, 1)
    const extra = createSlide('titleOnly', base.size)
    revised.slides.splice(1, 0, extra)
    const changes = comparePresentations(base, revised)
    expect(changes.map((c) => c.kind).sort()).toEqual(['changed', 'changed', 'deleted', 'inserted'])
    const first = changes.find((c) => c.kind === 'changed' && c.base === 0)
    expect(first?.kind === 'changed' && first.details[0].text).toBe('Text changed in {name}')

    const all = acceptChanges(base, revised, changes)
    expect(all.slides.map((s) => s.layout)).toEqual(revised.slides.map((s) => s.layout))
    expect(all.slides[2].notes).toBe('New notes')
    expect(all.slides[0].id).toBe(base.slides[0].id)

    const onlyText = acceptChanges(base, revised, changes.filter((c) => c.kind === 'changed' && c.base === 0))
    expect(onlyText.slides).toHaveLength(3)
  })

  it('reports nothing for identical presentations', () => {
    const base = deck()
    expect(comparePresentations(base, structuredClone(base))).toEqual([])
  })
})

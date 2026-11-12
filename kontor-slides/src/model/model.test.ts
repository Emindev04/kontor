import { describe, expect, it } from 'vitest'
import { bounds, frameFromEnds, lineEnds, makeGroup, resizeTo, rotate, snapBox, ungroup } from './geometry'
import { changeCaseText, computeMarkers, docFromText, docToHtml, replaceInDoc, setMarkAll, hasMarkEverywhere, type TextCtx } from './richtext'
import { adjustLum, resolveColor } from './color'
import { animationSteps, migrateSlide, pathEnd, retargetPath, triggerSteps } from './effects'
import { geometry, SHAPE_PRESETS } from './shapes'
import { applyLayout, createSlide, SIZE_16_9 } from './factory'
import { THEMES } from './themes'
import type { Para, ShapeElement, Slide } from './types'

const colors = THEMES[0].variants[0].colors

describe('geometry', () => {
  it('rotates points around a center', () => {
    const p = rotate({ x: 10, y: 0 }, { x: 0, y: 0 }, 90)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(10)
  })

  it('resizes from a corner handle keeping the opposite corner fixed', () => {
    const f = resizeTo({ x: 0, y: 0, w: 100, h: 50, rot: 0 }, 'se', { x: 200, y: 100 }, { keepRatio: false, fromCenter: false })
    expect(f).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })

  it('keeps the aspect ratio when asked', () => {
    const f = resizeTo({ x: 0, y: 0, w: 100, h: 50, rot: 0 }, 'se', { x: 300, y: 60 }, { keepRatio: true, fromCenter: false })
    expect(f.w / f.h).toBeCloseTo(2)
  })

  it('computes bounds of rotated boxes', () => {
    const b = bounds({ x: 0, y: 0, w: 100, h: 100, rot: 45 })
    expect(b.w).toBeCloseTo(141.42, 1)
  })

  it('converts line end points to frames and back', () => {
    const f = frameFromEnds({ x: 100, y: 50 }, { x: 10, y: 80 })
    expect(f).toMatchObject({ x: 10, y: 50, w: 90, h: 30, flipH: true, flipV: false })
    const [a, b] = lineEnds(f)
    expect(a.x).toBeCloseTo(100)
    expect(b.y).toBeCloseTo(80)
  })

  it('snaps to the slide center', () => {
    const snap = snapBox({ x: 587, y: 10, w: 100, h: 50 }, [], { w: 1280, h: 720 }, 6)
    expect(snap.dx).toBe(3)
    expect(snap.guides.some((g) => g.axis === 'x' && g.pos === 640)).toBe(true)
  })

  it('groups and ungroups without moving children', () => {
    const a = { id: 'a', type: 'shape', name: 'A', prst: 'rect', x: 10, y: 20, w: 30, h: 40, rot: 0, fill: { type: 'none' }, line: null } as ShapeElement
    const b = { ...a, id: 'b', x: 100, y: 200 }
    const g = makeGroup([a, b], 'g', 'Group')
    expect(g).toMatchObject({ x: 10, y: 20, w: 120, h: 220 })
    const back = ungroup(g)
    expect(back[1].x).toBeCloseTo(100)
    expect(back[1].y).toBeCloseTo(200)
  })
})

describe('rich text', () => {
  const ctx: TextCtx = { sizes: [28, 24], font: 'Arial', color: '#000000', align: 'left', bullets: true, bulletChar: '•', lineHeight: 0.9, spaceBefore: [10], colors, slideNumber: 3, dateText: '1/1/2026' }

  it('numbers paragraphs per level and restarts after a break', () => {
    const p = (level: number, bullet: string | null): Para => ({ type: 'paragraph', attrs: { level, bullet } })
    const markers = computeMarkers([p(0, 'num:arabicPeriod'), p(1, 'num:alphaLcParenR'), p(1, 'num:alphaLcParenR'), p(0, 'num:arabicPeriod'), p(0, 'none'), p(0, 'num:arabicPeriod')], ctx)
    expect(markers).toEqual(['1.', 'a)', 'b)', '2.', '', '1.'])
  })

  it('inherits bullets from the placeholder', () => {
    expect(computeMarkers([{ type: 'paragraph' }], ctx)).toEqual(['•'])
    expect(computeMarkers([{ type: 'paragraph' }], { ...ctx, bullets: false })).toEqual([''])
  })

  it('escapes text in static HTML and renders fields', () => {
    const html = docToHtml({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<b>&' }, { type: 'field', attrs: { kind: 'slidenum' } }] }] }, ctx)
    expect(html).toContain('&lt;b&gt;&amp;')
    expect(html).toContain('>3</span>')
  })

  it('changes case', () => {
    expect(changeCaseText('hello world. again', 'sentence')).toBe('Hello world. Again')
    expect(changeCaseText('hello world', 'title')).toBe('Hello World')
    expect(changeCaseText('AbC', 'toggle')).toBe('aBc')
  })

  it('replaces text and counts matches', () => {
    const { doc, count } = replaceInDoc(docFromText('cat Cat cat'), 'cat', 'dog', { matchCase: true, wholeWords: true })
    expect(count).toBe(2)
    expect(doc.content[0].content![0]).toMatchObject({ text: 'dog Cat dog' })
  })

  it('applies marks to the whole document', () => {
    const doc = setMarkAll(docFromText('a\nb'), { type: 'bold' }, true)
    expect(hasMarkEverywhere(doc, 'bold')).toBe(true)
  })
})

describe('colors', () => {
  it('resolves theme references with tints and shades', () => {
    expect(resolveColor('theme:accent1', colors)).toBe(colors.accent1)
    expect(resolveColor('#00ff00', colors)).toBe('#00FF00')
    expect(adjustLum('#000000', 0.5)).toBe('#808080')
    expect(resolveColor('theme:bg1:d50', colors)).toBe('#808080')
  })
})

describe('shapes', () => {
  it('produces valid paths for every preset', () => {
    for (const p of SHAPE_PRESETS) {
      const g = geometry(p.prst, 120, 80)
      expect(g.paths.length, p.prst).toBeGreaterThan(0)
      for (const path of g.paths) expect(path.d, p.prst).not.toMatch(/NaN|Infinity|undefined/)
    }
  })
})

describe('layouts', () => {
  it('keeps content when switching layouts', () => {
    const s = createSlide('titleContent', SIZE_16_9)
    const withText: Slide = { ...s, elements: s.elements.map((e) => (e.type === 'shape' && e.placeholder?.style === 'title' ? { ...e, text: { ...e.text!, doc: docFromText('Hello') } } : e)) }
    const two = applyLayout(withText, 'twoContent', SIZE_16_9)
    expect(two.elements.filter((e) => e.type === 'shape' && e.placeholder).length).toBe(3)
    const title = two.elements.find((e) => e.type === 'shape' && e.placeholder?.style === 'title') as ShapeElement
    expect(title.text?.doc.content[0].content?.[0]).toMatchObject({ text: 'Hello' })
  })
})

describe('animations', () => {
  it('groups with/after previous into the preceding click step and skips triggers', () => {
    const base = createSlide('blank', SIZE_16_9)
    const el = (id: string) => ({ id, type: 'shape', name: id, prst: 'rect', x: 0, y: 0, w: 1, h: 1, rot: 0, fill: { type: 'none' }, line: null }) as ShapeElement
    const entry = (id: string, targetId: string, trigger: 'click' | 'with' | 'after', triggerId?: string) => ({ id, targetId, effect: 'entrance' as const, name: 'fade', trigger, duration: 1, delay: 0, triggerId })
    const slide = {
      ...base,
      elements: [el('a'), el('b'), el('c'), el('d')],
      animations: [entry('1', 'a', 'click'), entry('2', 'b', 'with'), entry('3', 'c', 'after'), entry('4', 'd', 'click'), entry('5', 'a', 'click', 'd')],
    }
    const steps = animationSteps(slide)
    expect(steps.map((s) => s.map((i) => i.el.id))).toEqual([['a', 'b', 'c'], ['d']])
    expect(steps[0][2].delay).toBe(1)
    expect(triggerSteps(slide).get('d')?.map((i) => i.entry.id)).toEqual(['5'])
  })

  it('converts legacy single animations', () => {
    const base = createSlide('blank', SIZE_16_9)
    const el = { id: 'x', type: 'shape', name: 'x', prst: 'rect', x: 0, y: 0, w: 1, h: 1, rot: 0, fill: { type: 'none' }, line: null, anim: { effect: 'entrance', name: 'fade', trigger: 'click', duration: 1, delay: 0, order: 1 } } as ShapeElement
    const m = migrateSlide({ ...base, elements: [el] })
    expect(m.animations?.[0]).toMatchObject({ targetId: 'x', name: 'fade' })
    expect(m.elements[0].anim).toBeUndefined()
  })

  it('retargets motion paths', () => {
    expect(pathEnd('M0 0 L0 200')).toEqual({ x: 0, y: 200 })
    expect(pathEnd(retargetPath('M0 0 L100 200', 50, 100))).toEqual({ x: 50, y: 100 })
  })
})

import { describe, expect, it } from 'vitest'
import { animationSteps } from './effects'
import { fitTrend } from './chart'
import { nearestSegment, pathToPoints, simplify } from './pathPoints'
import { createSlide, SIZE_16_9 } from './factory'
import type { ShapeElement } from './types'

describe('text animation by paragraph', () => {
  const slide = createSlide('titleContent', SIZE_16_9)
  const body = slide.elements[1] as ShapeElement
  body.text!.doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One two' }] }, { type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'Three' }] }] }

  it('gives every paragraph with text its own click step', () => {
    slide.animations = [{ id: 'a', targetId: body.id, effect: 'entrance', name: 'fade', trigger: 'click', duration: 0.5, delay: 0, textBuild: 'paragraph' }]
    const steps = animationSteps(slide)
    expect(steps.length).toBe(2)
    expect(steps.map((s) => s[0].para)).toEqual([0, 2])
  })

  it('plays paragraphs one after another when started with the previous effect', () => {
    slide.animations = [{ id: 'a', targetId: body.id, effect: 'entrance', name: 'fade', trigger: 'with', duration: 0.5, delay: 0, textBuild: 'paragraph' }]
    const steps = animationSteps(slide)
    expect(steps.length).toBe(1)
    expect(steps[0].map((i) => i.delay)).toEqual([0, 0.5])
  })

  it('stretches the time of a paragraph animated word by word', () => {
    slide.animations = [{ id: 'a', targetId: body.id, effect: 'entrance', name: 'fade', trigger: 'click', duration: 1, delay: 0, textUnit: 'word' }]
    const steps = animationSteps(slide)
    // "One two" has two words: 1 s + 10 % before the second word starts.
    expect(steps[0][1].delay).toBeCloseTo(1.1)
  })
})

describe('trendlines', () => {
  const pts: [number, number][] = [
    [1, 2],
    [2, 4],
    [3, 6],
    [4, 8],
  ]
  it('fits a straight line exactly', () => {
    const fit = fitTrend(pts, { type: 'linear' })
    expect(fit && 'at' in fit ? fit.at(5) : null).toBeCloseTo(10)
    expect(fit && 'at' in fit ? fit.r2 : 0).toBeCloseTo(1)
  })
  it('fits exponential growth', () => {
    const fit = fitTrend(
      [
        [1, 2],
        [2, 4],
        [3, 8],
      ],
      { type: 'exponential' },
    )
    expect(fit && 'at' in fit ? fit.at(4) : null).toBeCloseTo(16)
  })
  it('computes a moving average', () => {
    const fit = fitTrend(pts, { type: 'movingAvg', period: 2 })
    expect(fit && 'points' in fit ? fit.points : null).toEqual([
      [2, 3],
      [3, 5],
      [4, 7],
    ])
  })
  it('fits a parabola with a polynomial of order 2', () => {
    const fit = fitTrend(
      [
        [0, 1],
        [1, 2],
        [2, 5],
        [3, 10],
      ],
      { type: 'polynomial', order: 2 },
    )
    expect(fit && 'at' in fit ? fit.at(4) : null).toBeCloseTo(17)
  })
})

describe('path points', () => {
  it('keeps polygon corners exactly', () => {
    const [sub] = pathToPoints('M0 0 L10 0 L10 10 Z')
    expect(sub.closed).toBe(true)
    expect(sub.pts).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ])
  })
  it('samples arcs and finds the nearest segment', () => {
    const [sub] = pathToPoints('M0 50 A50 50 0 0 1 100 50')
    expect(sub.pts.length).toBeGreaterThan(3)
    expect(sub.pts[sub.pts.length - 1]).toEqual([100, 50])
    expect(nearestSegment([[0, 0], [10, 0], [10, 10]], [5, 1], false).index).toBe(0)
  })
  it('simplifies a straight stroke to its end points', () => {
    expect(simplify([[0, 0], [1, 0.01], [2, 0], [3, 0]], 0.5)).toEqual([
      [0, 0],
      [3, 0],
    ])
  })
})

describe('accessibility checker', () => {
  it('measures contrast like WCAG', async () => {
    const { contrastRatio } = await import('./accessibility')
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21)
    expect(contrastRatio('#777777', '#FFFFFF')).toBeLessThan(4.5)
  })
  it('reports missing titles, alt text and reading order', async () => {
    const { checkAccessibility } = await import('./accessibility')
    const { createPresentation, createImage, SIZE_16_9 } = await import('./factory')
    const pres = createPresentation()
    const slide = pres.slides[0]
    const img = createImage('data:image/png;base64,AA==', 10, 10, SIZE_16_9, [])
    img.y = 0
    slide.elements = [...slide.elements, img]
    const kinds = checkAccessibility(pres).map((i) => `${i.level}:${i.kind}`)
    expect(kinds).toContain('error:Missing slide title')
    expect(kinds).toContain('error:Missing alternative text')
    expect(kinds).toContain('tip:Check reading order')
  })
})

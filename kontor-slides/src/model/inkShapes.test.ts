import { describe, expect, it } from 'vitest'
import { recognizeInk } from './inkShapes'
import type { Pt2 } from './pathPoints'

function along(corners: Pt2[], steps = 20): Pt2[] {
  const out: Pt2[] = []
  for (let i = 0; i < corners.length - 1; i++) for (let k = 0; k < steps; k++) {
    const t = k / steps
    out.push([corners[i][0] + (corners[i + 1][0] - corners[i][0]) * t, corners[i][1] + (corners[i + 1][1] - corners[i][1]) * t])
  }
  out.push(corners[corners.length - 1])
  return out
}

describe('Ink to Shape', () => {
  it('recognizes lines, rectangles, triangles and ellipses', () => {
    expect(recognizeInk(along([[0, 0], [100, 50]]))?.prst).toBe('line')
    expect(recognizeInk(along([[0, 0], [200, 0], [200, 100], [0, 100], [0, 2]]))).toMatchObject({ prst: 'rect', w: 200, h: 100 })
    expect(recognizeInk(along([[50, 0], [100, 100], [0, 100], [50, 2]]))?.prst).toBe('triangle')
    const circle: Pt2[] = Array.from({ length: 60 }, (_, i) => [100 + 80 * Math.cos((i / 59) * Math.PI * 2), 100 + 50 * Math.sin((i / 59) * Math.PI * 2)])
    expect(recognizeInk(circle)?.prst).toBe('ellipse')
  })

  it('leaves scribbles alone', () => {
    const zigzag: Pt2[] = Array.from({ length: 40 }, (_, i) => [i * 10, i % 2 ? 0 : 60])
    expect(recognizeInk(zigzag)).toBeNull()
  })
})

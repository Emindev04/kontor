import { describe, expect, it } from 'vitest'
import { bezierAt, moveHandle, outlineBounds, outlinePath, pathToOutline, segments, setPointType, setSegmentCurved, smoothThrough, splitSegment, type Outline } from './outline'

describe('free-form outlines with Bézier handles', () => {
  it('keeps the curves of a preset when converting it to points', () => {
    // A circle drawn with two arcs becomes four curved quarter segments, not dozens of sampled points.
    const { outline, closed } = pathToOutline('M0 50 A50 50 0 1 0 100 50 A50 50 0 1 0 0 50 Z')
    expect(closed).toEqual([true])
    expect(outline.rings[0].length).toBe(4)
    expect(segments(outline, 0, true).every((s) => s.c1 && s.c2)).toBe(true)
    const b = outlineBounds(outline, false)!
    expect(b.w).toBeCloseTo(100, 0)
    expect(b.h).toBeCloseTo(100, 0)
  })

  it('splits a curved segment without changing its shape', () => {
    const o: Outline = { rings: [[[0, 0], [100, 0]]], handles: [[{ o: [0, 80] }, { i: [100, 80] }]] }
    const mid = bezierAt([0, 0], [0, 80], [100, 80], [100, 0], 0.5)
    const split = splitSegment(o, 0, 0, 0.5, true)
    expect(split.rings[0].length).toBe(3)
    expect(split.rings[0][1][0]).toBeCloseTo(mid[0])
    expect(split.rings[0][1][1]).toBeCloseTo(mid[1])
    // The left half still passes through the original curve's quarter point.
    const q = bezierAt([0, 0], [0, 80], [100, 80], [100, 0], 0.25)
    const s0 = segments(split, 0, false)[0]
    const left = bezierAt(s0.a, s0.c1!, s0.c2!, s0.b, 0.5)
    expect(left[0]).toBeCloseTo(q[0])
    expect(left[1]).toBeCloseTo(q[1])
  })

  it('mirrors the opposite handle of a smooth point and keeps its length for a straight point', () => {
    const base: Outline = { rings: [[[0, 0], [50, 0], [100, 0]]], handles: [[null, { i: [40, 0], o: [70, 0], t: 'smooth' }, null]] }
    const smooth = moveHandle(base, 0, 1, 'o', [50, 30])
    expect(smooth.handles[0][1]!.i).toEqual([50, -30])
    const straight = moveHandle({ ...base, handles: [[null, { ...base.handles[0][1]!, t: 'straight' }, null]] }, 0, 1, 'o', [50, 30])
    expect(straight.handles[0][1]!.i![1]).toBeCloseTo(-10)
  })

  it('turns points and segments curved or straight', () => {
    const o: Outline = { rings: [[[0, 0], [50, 50], [100, 0]]], handles: [[null, null, null]] }
    const smooth = setPointType(o, 0, 1, 'smooth', true)
    expect(smooth.handles[0][1]!.i).toBeDefined()
    expect(smooth.handles[0][1]!.o).toBeDefined()
    const curved = setSegmentCurved(o, 0, 0, true)
    expect(outlinePath(curved, true)).toContain('C')
    expect(outlinePath(setSegmentCurved(curved, 0, 0, false), true)).not.toContain('C')
  })

  it('runs a smooth curve through clicked points', () => {
    const pts: [number, number][] = [[0, 0], [50, 40], [100, 0]]
    const hs = smoothThrough(pts, false)
    expect(hs[0]!.i).toBeUndefined()
    expect(hs[1]!.i![0]).toBeLessThan(50)
    expect(hs[1]!.o![0]).toBeGreaterThan(50)
  })
})

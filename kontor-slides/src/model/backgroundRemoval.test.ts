import { describe, expect, it } from 'vitest'
import { applyMask, backgroundMask, borderColors } from './backgroundRemoval'

/** A w×h picture: white background with a red square in the middle. */
function picture(w = 20, h = 20) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const inside = x >= 6 && x < 14 && y >= 6 && y < 14
      d.set(inside ? [220, 20, 20, 255] : [250, 250, 250, 255], i)
    }
  return d
}

describe('Remove Background', () => {
  it('finds the edge colors', () => {
    const c = borderColors(picture(), 20, 20)
    expect(c.length).toBeGreaterThan(0)
    expect(c[0][0]).toBeGreaterThan(240)
  })

  it('removes the background and keeps the subject', () => {
    const d = picture()
    const mask = backgroundMask(d, 20, 20, 20)
    expect(mask[0]).toBe(1)
    expect(mask[10 * 20 + 10]).toBe(0)
    applyMask(d, 20, 20, mask)
    expect(d[3]).toBe(0)
    expect(d[(10 * 20 + 10) * 4 + 3]).toBe(255)
  })

  it('honors areas marked to keep and to remove', () => {
    const d = picture()
    // Keep a background point: the area around it stays.
    const kept = backgroundMask(d, 20, 20, 20, { keep: [[2, 2]], remove: [] })
    expect(kept[2 * 20 + 2]).toBe(0)
    // Remove the subject: a click inside it adds its color as background.
    const removed = backgroundMask(d, 20, 20, 20, { keep: [], remove: [[10, 10]] })
    expect(removed[10 * 20 + 10]).toBe(1)
  })
})

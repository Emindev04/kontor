import { describe, expect, it } from 'vitest'
import { fillCrop, pictureLayout, PICTURE_LAYOUTS } from './pictureLayout'
import { createImage, SIZE_16_9 } from './factory'

const PNG = 'data:image/png;base64,AAAA'

describe('Picture Layout', () => {
  it('crops pictures to fill their frame', () => {
    expect(fillCrop({ natW: 200, natH: 100 }, 100, 100)).toEqual({ l: 0.25, t: 0, r: 0.25, b: 0 })
    expect(fillCrop({ natW: 100, natH: 200 }, 100, 100)).toEqual({ l: 0, t: 0.25, r: 0, b: 0.25 })
  })

  it('builds a group with every picture inside the area', () => {
    const imgs = [createImage(PNG, 400, 300, SIZE_16_9, []), createImage(PNG, 300, 400, SIZE_16_9, []), createImage(PNG, 500, 500, SIZE_16_9, [])]
    imgs[0].alt = 'Mountains'
    for (const { id } of PICTURE_LAYOUTS) {
      const g = pictureLayout(imgs, id, { x: 100, y: 100, w: 800, h: 500 }, 'Text')
      expect(g.children.filter((c) => c.type === 'image')).toHaveLength(3)
      expect(g.x).toBeGreaterThanOrEqual(99.9)
      expect(g.x + g.w).toBeLessThanOrEqual(900.1)
      expect(g.y + g.h).toBeLessThanOrEqual(600.1)
      if (id !== 'mosaic') expect(JSON.stringify(g)).toContain('Mountains')
    }
  })
})

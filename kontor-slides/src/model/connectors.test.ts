import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { connectionSites, nearestSite, rerouteConnectors, withConnectors } from './connectors'
import { createPresentation, createShape, createSlide } from './factory'
import { SHAPE_PRESETS, type ShapePreset } from './shapes'
import { lineEnds } from './geometry'
import { buildPptxParts } from '../io/pptxExport'
import type { ShapeElement } from './types'

const preset = (prst: string): ShapePreset => SHAPE_PRESETS.find((p) => p.prst === prst) ?? { id: prst, prst, label: prst, category: 'Basic Shapes' }

function scene() {
  const a = createShape(preset('rect'), { x: 0, y: 0, w: 100, h: 100 }, [])
  const b = createShape(preset('ellipse'), { x: 300, y: 0, w: 100, h: 100 }, [])
  const line = createShape(preset('line'), { x: 100, y: 50, w: 200, h: 0 }, [])
  line.conn = { start: { id: a.id, site: 1 }, end: { id: b.id, site: 3 } }
  return { a, b, line }
}

describe('connectors', () => {
  it('has four connection sites', () => {
    const { a } = scene()
    expect(connectionSites(a)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 50 },
    ])
    expect(nearestSite([a], { x: 98, y: 52 }, 6)).toMatchObject({ id: a.id, site: 1 })
    expect(nearestSite([a], { x: 70, y: 70 }, 6)).toBeNull()
  })

  it('follows a glued shape when it moves', () => {
    const { a, b, line } = scene()
    const moved = { ...b, x: 300, y: 200 }
    const out = rerouteConnectors([a, moved, line])
    const [s, e] = lineEnds(out[2] as ShapeElement)
    expect(s.x).toBeCloseTo(100)
    expect(s.y).toBeCloseTo(50)
    expect(e.x).toBeCloseTo(300)
    expect(e.y).toBeCloseTo(250)
  })

  it('drops glue to deleted shapes and keeps unchanged slides', () => {
    const { a, line } = scene()
    const out = rerouteConnectors([a, line])
    expect((out[1] as ShapeElement).conn).toEqual({ start: { id: a.id, site: 1 }, end: null })
    const pres = createPresentation()
    expect(withConnectors(pres, pres)).toBe(pres)
  })

  it('writes glued connectors to .pptx', async () => {
    const { a, b, line } = scene()
    const pres = createPresentation()
    const slide = createSlide('blank', pres.size)
    slide.elements = [line, a, b]
    pres.slides = [slide]
    const parts = await buildPptxParts(pres, 'C', JSZip)
    const xml = parts.get('ppt/slides/slide1.xml') as string
    expect(xml).toContain('<p:cxnSp>')
    expect(xml).toMatch(/<a:stCxn id="\d+" idx="3"\/><a:endCxn id="\d+" idx="1"\/>/)
    expect(xml).not.toContain('@@SPID')
  })
})

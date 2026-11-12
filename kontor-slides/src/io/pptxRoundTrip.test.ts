// Round trips through the .pptx writer and the regular reader (the stored model removed), for the
// newer formatting: underline styles, double strikethrough, offsets, exact spacing, indents,
// compound lines, 3-D effects, inner shadow, text warp, glued connectors and transition sounds.
import { beforeAll, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { buildPptxParts } from './pptxExport'
import { importPptx } from './pptxImport'
import { KONTOR_PART } from './package'
import { createPresentation, createShape, createSlide, createTextBox } from '../model/factory'
import { SHAPE_PRESETS, type ShapePreset } from '../model/shapes'
import type { Presentation, ShapeElement } from '../model/types'

const preset = (prst: string): ShapePreset => SHAPE_PRESETS.find((p) => p.prst === prst) ?? { id: prst, prst, label: prst, category: 'Basic Shapes' }

beforeAll(() => {
  ;(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser
})

async function roundTrip(pres: Presentation, name = 'Deck.pptx') {
  const parts = await buildPptxParts(pres, 'Deck', JSZip)
  const zip = new JSZip()
  for (const [p, d] of parts) if (p !== KONTOR_PART) zip.file(p, d)
  const data = await zip.generateAsync({ type: 'uint8array' })
  return importPptx(new File([data as BlobPart], name))
}

function deck() {
  const pres = createPresentation('kontor', 0)
  const slide = createSlide('blank', pres.size)
  const tb = createTextBox({ x: 10, y: 10, w: 400, h: 100 }, [])
  tb.text!.doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { lineExact: 20 },
        content: [
          { type: 'text', text: 'Wavy', marks: [{ type: 'textStyle', attrs: { uStyle: 'wavy', uColor: '#FF0000' } }] },
          { type: 'text', text: 'Twice', marks: [{ type: 'textStyle', attrs: { strike2: true } }] },
          { type: 'text', text: 'Up', marks: [{ type: 'textStyle', attrs: { baseline: 10 } }] },
          { type: 'text', text: 'Sup', marks: [{ type: 'superscript' }] },
        ],
      },
    ],
  }
  tb.text!.warp = 'textArchUp'
  const a = createShape(preset('rect'), { x: 0, y: 200, w: 100, h: 100 }, [])
  a.line = { color: '#000000', width: 6, dash: 'solid', compound: 'dbl' }
  a.effects = { bevel: 'circle', rot3d: { x: 20, y: -30, perspective: true }, innerShadow: { color: '#000000', alpha: 0.5, blur: 5, dist: 3, angle: 45 } }
  const b = createShape(preset('ellipse'), { x: 300, y: 200, w: 100, h: 100 }, [])
  const line = createShape(preset('line'), { x: 100, y: 250, w: 200, h: 0 }, [])
  line.conn = { start: { id: a.id, site: 1 }, end: { id: b.id, site: 3 } }
  slide.elements = [tb, a, b, line]
  slide.transition = { name: 'morph', duration: 2, advanceOnClick: true, advanceAfter: null, sound: 'chime' }
  pres.slides = [slide]
  return pres
}

describe('.pptx round trip without the stored model', () => {
  it('keeps the newer text, line, effect, connector and transition settings', async () => {
    const { pres: back } = await roundTrip(deck())
    const [slide] = back.slides
    expect(slide.transition).toMatchObject({ name: 'morph', sound: 'chime' })
    const tb = slide.elements.find((e) => e.type === 'shape' && e.textBox) as ShapeElement
    expect(tb.text!.warp).toBe('textArchUp')
    const p = tb.text!.doc.content[0]
    expect(p.attrs?.lineExact).toBe(20)
    const style = (i: number) => p.content?.[i].marks?.find((m) => m.type === 'textStyle')
    expect(style(0)).toMatchObject({ attrs: { uStyle: 'wavy', uColor: '#FF0000' } })
    expect(style(1)).toMatchObject({ attrs: { strike2: true } })
    expect(style(2)).toMatchObject({ attrs: { baseline: 10 } })
    expect(p.content?.[3].marks?.some((m) => m.type === 'superscript')).toBe(true)

    const rect = slide.elements.find((e) => e.type === 'shape' && e.prst === 'rect' && !e.textBox) as ShapeElement
    expect(rect.line).toMatchObject({ compound: 'dbl' })
    expect(rect.effects).toMatchObject({ bevel: 'circle', innerShadow: { blur: 5, dist: 3, angle: 45 } })
    expect(rect.effects?.rot3d).toMatchObject({ x: 20, y: -30, perspective: true })
    const ell = slide.elements.find((e) => e.type === 'shape' && e.prst === 'ellipse') as ShapeElement
    const conn = slide.elements.find((e) => e.type === 'shape' && e.conn) as ShapeElement
    expect(conn.conn).toEqual({ start: { id: rect.id, site: 1 }, end: { id: ell.id, site: 3 } })
  })

  it('opens a .ppsx and a .potx and drops the extension from the title', async () => {
    const pres = deck()
    for (const kind of ['ppsx', 'potx'] as const) {
      const parts = await buildPptxParts(pres, 'Deck', JSZip, kind)
      const zip = new JSZip()
      for (const [p, d] of parts) zip.file(p, d)
      const data = await zip.generateAsync({ type: 'uint8array' })
      const { pres: back, title } = await importPptx(new File([data as BlobPart], `Deck.${kind}`))
      expect(title).toBe('Deck')
      expect(back.slides).toHaveLength(1)
    }
  })
})

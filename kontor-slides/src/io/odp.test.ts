// Round trips through the .odp writer and reader: our own files reopen exactly; without the stored
// model the regular reader recovers slides, text, shapes, pictures, tables, notes and transitions.
import { beforeAll, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { buildOdpParts, lengthPx, readOdp, shapePathData } from './odp'
import { createImage, createPresentation, createShape, createSlide, createTextBox } from '../model/factory'
import { createTable } from '../model/table'
import { makeGroup } from '../model/geometry'
import { SHAPE_PRESETS } from '../model/shapes'
import type { Presentation, ShapeElement, TableElement } from '../model/types'
import { KONTOR_PART } from './package'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJgYGBAQAZgwID6sMY7wAAAABJRU5ErkJggg=='

beforeAll(() => {
  ;(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser
})

function deck(): Presentation {
  const pres = createPresentation('kontor', 0)
  const size = pres.size
  const title = pres.slides[0]
  const t = title.elements[0] as ShapeElement
  t.text!.doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello ODF' }] }] }
  const content = createSlide('titleContent', size)
  const body = content.elements[1] as ShapeElement
  body.text!.doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Bold point', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#FF0000', fontSize: 30 } }] }] },
      { type: 'paragraph', attrs: { level: 1 }, content: [{ type: 'text', text: 'Sub & <point>' }] },
    ],
  }
  content.notes = 'First line\nSecond line'
  content.transition = { name: 'wipe', duration: 1, advanceOnClick: true, advanceAfter: 4 }
  const blank = createSlide('blank', size)
  const star = createShape(SHAPE_PRESETS.find((p) => p.prst === 'star5')!, { x: 100, y: 100, w: 200, h: 150 }, [])
  star.rot = 30
  const ellipse = createShape(SHAPE_PRESETS.find((p) => p.prst === 'ellipse')!, { x: 400, y: 100, w: 100, h: 80 }, [])
  ellipse.fill = { type: 'solid', color: '#00FF00' }
  ellipse.line = { color: '#0000FF', width: 3, dash: 'dash' }
  const tb = createTextBox({ x: 600, y: 100, w: 200, h: 40 }, [])
  tb.text!.doc = { type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'center' }, content: [{ type: 'text', text: 'Text  box', marks: [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }] }] }] }
  const line = createShape(SHAPE_PRESETS.find((p) => p.prst === 'line')!, { x: 50, y: 600, w: 300, h: 0 }, [])
  line.line = { color: '#000000', width: 2, dash: 'solid', tail: 'triangle' }
  const group = makeGroup([star, ellipse], 'grp1', 'Group 1')
  const img = createImage(PNG, 2, 2, size, [])
  const table = createTable(2, 3, { x: 100, y: 400, w: 600 }, 'tbl1', 'Table 1')
  table.rows[0].cells[0].doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell A1' }] }] }
  blank.elements = [group, tb, line, img, table]
  blank.hidden = true
  blank.background = { type: 'gradient', kind: 'linear', angle: 0, stops: [{ pos: 0, color: '#FFFFFF' }, { pos: 1, color: '#000080' }] }
  return { ...pres, slides: [title, content, blank], author: 'Ada', customShows: [{ id: 'c1', name: 'Short', slideIds: [title.id, content.id] }], loop: true }
}

async function zipOf(parts: Map<string, string | Uint8Array>, dropModel = false) {
  const zip = new JSZip()
  for (const [p, d] of parts) if (!(dropModel && p === KONTOR_PART)) zip.file(p, d)
  return zip.generateAsync({ type: 'uint8array' })
}

describe('.odp writer', () => {
  it('writes well-formed parts with the mimetype first', async () => {
    const parts = await buildOdpParts(deck(), 'Deck')
    expect([...parts.keys()][0]).toBe('mimetype')
    expect(parts.get('mimetype')).toBe('application/vnd.oasis.opendocument.presentation')
    for (const name of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) {
      const errors: string[] = []
      new DOMParser({ onError: (level: string, msg: string) => void (level !== 'warning' && errors.push(msg)) }).parseFromString(parts.get(name) as string, 'application/xml')
      expect(errors, name).toEqual([])
    }
    const content = parts.get('content.xml') as string
    expect(content.match(/<draw:page /g)?.length).toBe(3)
    expect(content).toContain('presentation:class="title"')
    expect(content).toContain('draw:type="star5"')
    expect(content).toContain('<table:table>')
    expect(content).toContain('presentation:visibility="hidden"')
    expect(content).toContain('smil:type="barWipe"')
    const manifest = parts.get('META-INF/manifest.xml') as string
    for (const p of parts.keys()) if (p !== 'mimetype' && p !== 'META-INF/manifest.xml') expect(manifest, p).toContain(`manifest:full-path="${p}"`)
  })

  it('writes preset outlines as M/L/C/Z paths', () => {
    const star = createShape(SHAPE_PRESETS.find((p) => p.prst === 'star5')!, { x: 0, y: 0, w: 100, h: 100 }, [])
    const d = shapePathData(star)
    expect(d).toMatch(/^M/)
    expect(d).not.toMatch(/[AQSHV]/i)
  })
})

describe('.odp reader', () => {
  it('restores our own files exactly', async () => {
    const pres = deck()
    const { pres: back } = await readOdp(await zipOf(await buildOdpParts(pres, 'Deck')), 'Deck.odp')
    expect(back).toEqual(pres)
  })

  it('reads the slides without the stored model', async () => {
    const pres = deck()
    const { pres: back, title } = await readOdp(await zipOf(await buildOdpParts(pres, 'Deck'), true), 'Deck.odp')
    expect(title).toBe('Deck')
    expect(back.slides).toHaveLength(3)
    expect(back.size).toEqual(pres.size)
    expect(back.author).toBe('Ada')
    expect(back.loop).toBe(true)
    expect(back.customShows?.[0].slideIds).toEqual([back.slides[0].id, back.slides[1].id])

    const [s1, s2, s3] = back.slides
    const t = s1.elements.find((e) => e.type === 'shape' && e.placeholder) as ShapeElement
    expect(t.text!.doc.content[0].content?.[0]).toMatchObject({ type: 'text', text: 'Hello ODF' })

    const body = s2.elements.find((e) => e.type === 'shape' && e.placeholder?.style === 'body') as ShapeElement
    const [p1, p2] = body.text!.doc.content
    expect(p1.content?.[0].type === 'text' && p1.content[0].text).toBe('Bold point')
    const marks = p1.content?.[0].marks ?? []
    expect(marks.some((m) => m.type === 'bold')).toBe(true)
    expect(marks.find((m) => m.type === 'textStyle')).toMatchObject({ attrs: { color: '#FF0000', fontSize: 30 } })
    expect(p2.attrs?.level).toBe(1)
    expect(p2.content?.[0].type === 'text' && p2.content[0].text).toBe('Sub & <point>')
    expect(s2.notes).toBe('First line\nSecond line')
    expect(s2.transition).toMatchObject({ name: 'wipe', advanceAfter: 4 })

    expect(s3.hidden).toBe(true)
    expect(s3.background).toMatchObject({ type: 'gradient', kind: 'linear', angle: 0 })
    const group = s3.elements.find((e) => e.type === 'group')
    expect(group?.type).toBe('group')
    if (group?.type === 'group') {
      const star = group.children.find((c) => c.type === 'shape' && c.prst === 'star5') as ShapeElement
      expect(star.rot).toBeCloseTo(30, 1)
      expect(star.w).toBeCloseTo(200, 0)
      expect(group.x + star.x).toBeCloseTo(100, 0)
      expect(group.y + star.y).toBeCloseTo(100, 0)
      const ell = group.children.find((c) => c.type === 'shape' && c.prst === 'ellipse') as ShapeElement
      expect(ell.fill).toEqual({ type: 'solid', color: '#00FF00' })
      expect(ell.line).toMatchObject({ color: '#0000FF', width: 3, dash: 'dash' })
    }
    const tb = s3.elements.find((e) => e.type === 'shape' && e.textBox) as ShapeElement
    const run = tb.text!.doc.content[0]
    expect(run.attrs?.align).toBe('center')
    expect(run.content?.[0]).toMatchObject({ text: 'Text  box' })
    expect(run.content?.[0].marks?.find((m) => m.type === 'link')).toEqual({ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } })
    const line = s3.elements.find((e) => e.type === 'shape' && e.prst === 'line') as ShapeElement
    expect(line.line).toMatchObject({ width: 2, tail: 'triangle' })
    expect(line.w).toBeCloseTo(300, 0)
    const img = s3.elements.find((e) => e.type === 'image')
    expect(img?.type === 'image' && img.src).toBe(PNG)
    const table = s3.elements.find((e) => e.type === 'table') as TableElement
    expect(table.rows).toHaveLength(2)
    expect(table.cols).toHaveLength(3)
    expect(table.rows[0].cells[0].doc.content[0].content?.[0]).toMatchObject({ text: 'Cell A1' })
  })

  it('converts lengths', () => {
    expect(lengthPx('2.54cm')).toBeCloseTo(96)
    expect(lengthPx('72pt')).toBeCloseTo(96)
    expect(lengthPx('1in')).toBe(96)
    expect(lengthPx('10mm')).toBeCloseTo(37.8, 1)
  })
})

describe('.odp text formatting', () => {
  it('keeps underline styles, double strikethrough, offsets, exact spacing and indents', async () => {
    const pres = createPresentation('kontor', 0)
    const slide = createSlide('blank', pres.size)
    const tb = createTextBox({ x: 10, y: 10, w: 400, h: 100 }, [])
    tb.text!.doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { lineExact: 20, indent: 30, firstLine: -12 },
          content: [
            { type: 'text', text: 'Wavy', marks: [{ type: 'textStyle', attrs: { uStyle: 'wavy', uColor: '#FF0000' } }] },
            { type: 'text', text: 'Twice', marks: [{ type: 'textStyle', attrs: { strike2: true } }] },
            { type: 'text', text: 'Up', marks: [{ type: 'textStyle', attrs: { baseline: 10 } }] },
          ],
        },
      ],
    }
    slide.elements = [tb]
    pres.slides = [slide]
    const { pres: back } = await readOdp(await zipOf(await buildOdpParts(pres, 'T'), true), 'T.odp')
    const p = (back.slides[0].elements[0] as ShapeElement).text!.doc.content[0]
    expect(p.attrs).toMatchObject({ lineExact: 20, indent: 30, firstLine: -12 })
    const style = (i: number) => p.content?.[i].marks?.find((m) => m.type === 'textStyle')
    expect(style(0)).toMatchObject({ attrs: { uStyle: 'wavy', uColor: '#FF0000' } })
    expect(style(1)).toMatchObject({ attrs: { strike2: true } })
    expect(style(2)).toMatchObject({ attrs: { baseline: 10 } })
  })
})

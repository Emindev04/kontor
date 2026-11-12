// Package-level checks of the .pptx writer: every part parses, has a content type and is reachable,
// shape ids are unique, placeholders match their layouts and child elements follow the schema order.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { buildPptxParts } from './pptxExport'
import { createImage, createPresentation, createShape, createSlide, createTextBox, SIZE_4_3 } from '../model/factory'
import { createChart } from '../model/chart'
import { createDiagram } from '../model/diagram'
import { createTable } from '../model/table'
import { makeGroup } from '../model/geometry'
import { SHAPE_PRESETS } from '../model/shapes'
import type { Presentation, Slide } from '../model/types'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJgYGBAQAZgwID6sMY7wAAAABJRU5ErkJggg=='

function sampleDeck(): Presentation {
  const pres = createPresentation('atrium', 1)
  const size = pres.size
  const title = pres.slides[0]
  const content = createSlide('titleContent', size)
  const body = content.elements[1]
  if (body.type === 'shape') body.text!.doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }] }] }, { type: 'paragraph', attrs: { level: 1 }, content: [{ type: 'text', text: 'Sub & <point>' }] }] }
  content.notes = 'First line\nSecond line'
  content.transition = { name: 'wipe', option: 'fromLeft', duration: 1, advanceOnClick: true, advanceAfter: 3 }
  const blank = createSlide('blank', size)
  const star = createShape(SHAPE_PRESETS.find((p) => p.prst === 'star5') ?? SHAPE_PRESETS[0], { x: 100, y: 100, w: 200, h: 150 }, [])
  star.rot = 30
  star.link = '#slide1'
  const pictureFill = { ...createShape(SHAPE_PRESETS[0], { x: 400, y: 100, w: 100, h: 100 }, []), fill: { type: 'picture' as const, src: PNG } }
  const tb = createTextBox({ x: 600, y: 100, w: 200, h: 40 }, [])
  tb.text!.doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text box' }] }] }
  const group = makeGroup([star, pictureFill], 'grp1', 'Group 1')
  const img = createImage(PNG, 2, 2, size, [])
  const table = createTable(2, 3, { x: 100, y: 400, w: 600 }, 'tbl1', 'Table 1')
  const chart = createChart('column', 'clustered', { x: 800, y: 300, w: 400, h: 300 }, 'cht1', 'Chart 1')
  const diagram = createDiagram('process', { x: 100, y: 550, w: 600, h: 150 }, 'dgm1', 'Diagram 1')
  blank.elements = [group, tb, img, table, chart, diagram]
  blank.animations = [
    { id: 'a1', targetId: 'grp1', effect: 'entrance', name: 'fade', trigger: 'click', duration: 0.5, delay: 0 },
    { id: 'a2', targetId: tb.id, effect: 'entrance', name: 'flyIn', direction: 'left', trigger: 'after', duration: 0.5, delay: 0 },
  ]
  blank.hidden = true
  blank.background = { type: 'solid', color: '#FAFAFA' }
  const slides: Slide[] = [title, content, blank, ...(['section', 'twoContent', 'comparison', 'titleOnly', 'contentCaption', 'pictureCaption'] as const).map((l) => createSlide(l, size))]
  return { ...pres, slides, headerFooter: { ...pres.headerFooter, slideNumber: true, footer: true, footerText: 'Footer & co', date: true }, customShows: [{ id: 'c1', name: 'Short', slideIds: [title.id, content.id] }], loop: true }
}

const parser = () =>
  new DOMParser({
    onError: (level: string, msg: string) => {
      if (level !== 'warning') throw new Error(msg)
    },
  })

type El = { localName: string | null; nodeType: number; childNodes: ArrayLike<El>; getAttribute(n: string): string | null; getElementsByTagNameNS(ns: string, n: string): ArrayLike<El> }

function children(el: El): El[] {
  return Array.from(el.childNodes).filter((n) => n.nodeType === 1)
}

function all(doc: unknown, name: string): El[] {
  return Array.from((doc as El).getElementsByTagNameNS('*', name))
}

/** Children must appear in the given order (each entry lists alternatives). */
function checkOrder(doc: unknown, parent: string, order: string[][], where: string, problems: string[]) {
  for (const el of all(doc, parent)) {
    let pos = 0
    for (const c of children(el)) {
      const i = order.findIndex((alts) => alts.includes(c.localName ?? ''))
      if (i < 0) continue
      if (i < pos) problems.push(`${where}: <${c.localName}> out of order in <${parent}>`)
      pos = Math.max(pos, i)
    }
  }
}

const FILLS = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill']

async function build(pres: Presentation) {
  const parts = await buildPptxParts(pres, 'Test & deck', JSZip)
  const xml = new Map<string, Document>()
  for (const [path, data] of parts) if (typeof data === 'string' && /\.(xml|rels)$/.test(path)) xml.set(path, parser().parseFromString(data, 'application/xml') as unknown as Document)
  return { parts, xml }
}

describe('.pptx package', () => {
  it('writes well-formed parts with content types and working relationships', async () => {
    const { parts, xml } = await build(sampleDeck())
    const problems: string[] = []
    const ct = xml.get('[Content_Types].xml')!
    const defaults = new Set(all(ct, 'Default').map((d) => d.getAttribute('Extension')))
    const overrides = new Set(all(ct, 'Override').map((d) => d.getAttribute('PartName')))
    for (const o of overrides) if (!parts.has(o!.slice(1))) problems.push(`override without part: ${o}`)
    for (const path of parts.keys()) {
      if (path === '[Content_Types].xml') continue
      if (!overrides.has(`/${path}`) && !defaults.has(path.split('.').pop()!)) problems.push(`no content type: ${path}`)
    }
    for (const [path, doc] of xml) {
      if (!path.endsWith('.rels')) continue
      const base = path.replace('_rels/', '').replace(/\.rels$/, '')
      const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : ''
      const ids = new Set<string>()
      for (const r of all(doc, 'Relationship')) {
        const id = r.getAttribute('Id')!
        if (ids.has(id)) problems.push(`duplicate relationship id ${id} in ${path}`)
        ids.add(id)
        if (r.getAttribute('TargetMode') === 'External') continue
        const out: string[] = []
        for (const seg of (dir + r.getAttribute('Target')).split('/')) {
          if (seg === '..') out.pop()
          else if (seg && seg !== '.') out.push(seg)
        }
        if (!parts.has(out.join('/'))) problems.push(`broken relationship in ${path}: ${r.getAttribute('Target')}`)
      }
    }
    expect(problems).toEqual([])
    expect(parts.has('ppt/presentation.xml')).toBe(true)
    expect(parts.has('ppt/notesSlides/notesSlide2.xml')).toBe(true)
    expect(parts.has('ppt/charts/chart1.xml')).toBe(true)
  })

  it('gives every shape a unique id and links slide placeholders to their layout', async () => {
    const { xml } = await build(sampleDeck())
    const problems: string[] = []
    const phKey = (ph: El) => `${ph.getAttribute('type') ?? 'body'}:${ph.getAttribute('idx') ?? '0'}`
    for (const [path, doc] of xml) {
      if (!/ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(path)) continue
      const ids = all(doc, 'cNvPr').map((c) => c.getAttribute('id'))
      if (new Set(ids).size !== ids.length) problems.push(`duplicate shape ids in ${path}`)
      if (!path.includes('/slides/')) continue
      const rels = xml.get(path.replace('slides/', 'slides/_rels/') + '.rels')!
      const layoutTarget = all(rels, 'Relationship').find((r) => r.getAttribute('Type')!.endsWith('/slideLayout'))!.getAttribute('Target')!
      const layout = xml.get(`ppt/slideLayouts/${layoutTarget.split('/').pop()}`)!
      const layoutPhs = new Set(all(layout, 'ph').map(phKey))
      for (const ph of all(doc, 'ph')) if (!layoutPhs.has(phKey(ph))) problems.push(`${path}: placeholder ${phKey(ph)} has no match on its layout`)
    }
    expect(problems).toEqual([])
    const slide2 = xml.get('ppt/slides/slide2.xml')!
    expect(all(slide2, 'ph').map((p) => p.getAttribute('type'))).toContain('title')
  })

  it('keeps child elements in schema order', async () => {
    const { xml } = await build(sampleDeck())
    const problems: string[] = []
    for (const [path, doc] of xml) {
      checkOrder(doc, 'spPr', [['xfrm'], ['custGeom', 'prstGeom'], FILLS, ['ln'], ['effectLst', 'effectDag'], ['scene3d'], ['sp3d'], ['extLst']], path, problems)
      checkOrder(doc, 'txBody', [['bodyPr'], ['lstStyle'], ['p']], path, problems)
      checkOrder(doc, 'pPr', [['lnSpc'], ['spcBef'], ['spcAft'], ['buClrTx', 'buClr'], ['buSzTx', 'buSzPct', 'buSzPts'], ['buFontTx', 'buFont'], ['buNone', 'buAutoNum', 'buChar', 'buBlip'], ['tabLst'], ['defRPr'], ['extLst']], path, problems)
      for (const tag of ['rPr', 'endParaRPr', 'defRPr'])
        checkOrder(doc, tag, [['ln'], FILLS, ['effectLst', 'effectDag'], ['highlight'], ['uLnTx', 'uLn'], ['uFillTx', 'uFill'], ['latin'], ['ea'], ['cs'], ['sym'], ['hlinkClick'], ['hlinkMouseOver'], ['rtl'], ['extLst']], path, problems)
      checkOrder(doc, 'ln', [FILLS, ['prstDash', 'custDash'], ['round', 'bevel', 'miter'], ['headEnd'], ['tailEnd'], ['extLst']], path, problems)
      checkOrder(doc, 'effectLst', [['blur'], ['fillOverlay'], ['glow'], ['innerShdw'], ['outerShdw'], ['prstShdw'], ['reflection'], ['softEdge']], path, problems)
      checkOrder(doc, 'tcPr', [['lnL'], ['lnR'], ['lnT'], ['lnB'], ['lnTlToBr'], ['lnBlToTr'], ['cell3D'], FILLS, ['headers'], ['extLst']], path, problems)
      checkOrder(doc, 'sld', [['cSld'], ['clrMapOvr'], ['transition'], ['timing'], ['extLst']], path, problems)
      checkOrder(doc, 'sldLayout', [['cSld'], ['clrMapOvr'], ['transition'], ['timing'], ['hf'], ['extLst']], path, problems)
      checkOrder(doc, 'sldMaster', [['cSld'], ['clrMap'], ['sldLayoutIdLst'], ['transition'], ['timing'], ['hf'], ['txStyles'], ['extLst']], path, problems)
      checkOrder(doc, 'cSld', [['bg'], ['spTree'], ['custDataLst'], ['controls'], ['extLst']], path, problems)
      checkOrder(doc, 'presentation', [['sldMasterIdLst'], ['notesMasterIdLst'], ['handoutMasterIdLst'], ['sldIdLst'], ['sldSz'], ['notesSz'], ['smartTags'], ['embeddedFontLst'], ['custShowLst'], ['photoAlbum'], ['custDataLst'], ['kinsoku'], ['defaultTextStyle'], ['modifyVerifier'], ['extLst']], path, problems)
      checkOrder(doc, 'nvSpPr', [['cNvPr'], ['cNvSpPr'], ['nvPr']], path, problems)
      checkOrder(doc, 'pic', [['nvPicPr'], ['blipFill'], ['spPr'], ['style'], ['extLst']], path, problems)
      checkOrder(doc, 'blipFill', [['blip'], ['srcRect'], ['tile', 'stretch']], path, problems)
      checkOrder(doc, 'showPr', [['present', 'browse', 'kiosk'], ['sldAll', 'sldRg', 'custShow'], ['penClr'], ['extLst']], path, problems)
    }
    expect(problems).toEqual([])
  })

  it('writes sizes and positions in EMU and valid ids', async () => {
    const pres = { ...sampleDeck(), size: SIZE_4_3 }
    const { xml } = await build(pres)
    const presDoc = xml.get('ppt/presentation.xml')!
    const sz = all(presDoc, 'sldSz')[0]
    expect(sz.getAttribute('cx')).toBe('9144000')
    expect(sz.getAttribute('cy')).toBe('6858000')
    expect(sz.getAttribute('type')).toBe('screen4x3')
    const sldIds = all(presDoc, 'sldId').map((s) => Number(s.getAttribute('id')))
    expect(sldIds.every((id) => id >= 256)).toBe(true)
    expect(new Set(sldIds).size).toBe(sldIds.length)
    const master = xml.get('ppt/slideMasters/slideMaster1.xml')!
    const layoutIds = all(master, 'sldLayoutId').map((s) => Number(s.getAttribute('id')))
    expect(layoutIds.length).toBe(9)
    expect(layoutIds.every((id) => id > 2147483648)).toBe(true)
    // A group child at x = 22 px inside a group at 78 px → the group offset is 78 px = 742950 EMU.
    const slide3 = xml.get('ppt/slides/slide3.xml')!
    const grp = all(slide3, 'grpSpPr')[0]
    expect(Number(all(grp, 'off')[0].getAttribute('x')) % 9525).toBe(0)
    expect(all(slide3, 'sld')[0].getAttribute('show')).toBe('0')
  })

  it('stores pictures once and references them from the embedded model', async () => {
    const { parts } = await build(sampleDeck())
    const model = JSON.parse(parts.get('kontor/presentation.json') as string)
    expect(JSON.stringify(model.pres)).not.toContain('data:image/png')
    expect(JSON.stringify(model.pres)).toContain('kontor-media:ppt/media/image')
    const media = [...parts.keys()].filter((p) => p.startsWith('ppt/media/image'))
    expect(media.length).toBe(1)
  })
})

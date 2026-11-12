// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import { exportDocx } from '../io/docxExport'
import { importDocx } from '../io/docxImport'
import { DEFAULT_DESIGN, DEFAULT_SETUP, EMPTY_HEADER_FOOTER } from '../pageSetup'
import type { Comments } from '../editor/Review'
import type { Notes } from '../editor/Notes'
import fixture from './fixtures/sample-doc.json'

// Checks that exported .docx packages follow the rules the original program and LibreOffice enforce
// when they open a file (otherwise they show a "repair" prompt): a content type for every part, valid
// relationships, unique drawing ids, separator notes and the element order of ECMA-376.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** Child element order of the property containers, from the ECMA-376 schema (transitional). */
const ORDER: Record<string, string[]> = {
  rPr: ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'],
  pPr: ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'],
  sectPr: ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'],
  tblPr: ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription'],
  tcPr: ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark', 'headers', 'cellIns', 'cellDel', 'cellMerge', 'tcPrChange'],
  tblBorders: ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV'],
  tcBorders: ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV', 'tl2br', 'tr2bl'],
  pBdr: ['top', 'left', 'bottom', 'right', 'between', 'bar'],
}

type Pkg = { zip: JSZip; parts: Record<string, Document> }

async function load(blob: Blob): Promise<Pkg> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const parts: Record<string, Document> = {}
  for (const name of Object.keys(zip.files)) {
    if (!/\.(xml|rels)$/.test(name) || zip.files[name].dir) continue
    parts[name] = new DOMParser().parseFromString(await zip.file(name)!.async('string'), 'application/xml')
  }
  return { zip, parts }
}

const elements = (doc: Document | Element, local: string) => Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === local)

function orderViolations(pkg: Pkg) {
  const out: string[] = []
  for (const [name, doc] of Object.entries(pkg.parts)) {
    for (const [container, order] of Object.entries(ORDER)) {
      for (const el of elements(doc, container)) {
        if (el.namespaceURI !== W) continue
        let last = -1
        for (const child of Array.from(el.children)) {
          const i = order.indexOf(child.localName)
          if (i < 0) {
            out.push(`${name}: unknown <w:${child.localName}> in <w:${container}>`)
            continue
          }
          if (i < last) out.push(`${name}: <w:${child.localName}> after <w:${order[last]}> in <w:${container}>`)
          last = Math.max(last, i)
        }
      }
    }
  }
  return out
}

let pkg: Pkg
let blob: Blob
const input = {
  doc: fixture.doc as JSONContent,
  setup: { ...DEFAULT_SETUP, differentFirstPage: true },
  design: { ...DEFAULT_DESIGN, watermark: { text: 'DRAFT', color: '#C0C0C0', layout: 'diagonal' as const, semitransparent: true } },
  headerFooter: {
    ...EMPTY_HEADER_FOOTER,
    header: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header text' }] }] },
    footer: { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'field', attrs: { kind: 'page' } }] }] },
  },
  title: 'Sample',
  comments: fixture.comments as Comments,
  notes: fixture.notes as Notes,
  trackChanges: true,
}

beforeAll(async () => {
  blob = await exportDocx(input)
  pkg = await load(blob)
})

describe('.docx package', () => {
  it('has well-formed XML parts', () => {
    for (const [name, doc] of Object.entries(pkg.parts)) expect(doc.getElementsByTagName('parsererror').length, name).toBe(0)
  })

  it('declares a content type for every part', () => {
    const types = pkg.parts['[Content_Types].xml']
    const defaults = new Set(elements(types, 'Default').map((d) => d.getAttribute('Extension')!.toLowerCase()))
    const overrides = new Set(elements(types, 'Override').map((o) => o.getAttribute('PartName')!.replace(/^\//, '')))
    for (const name of Object.keys(pkg.zip.files)) {
      if (pkg.zip.files[name].dir || name === '[Content_Types].xml') continue
      const ext = name.split('.').pop()!.toLowerCase()
      expect(overrides.has(name) || defaults.has(ext), `content type for ${name}`).toBe(true)
    }
    for (const part of overrides) expect(pkg.zip.file(part), `override target ${part}`).not.toBeNull()
  })

  it('has relationships that point to existing parts', () => {
    for (const [name, doc] of Object.entries(pkg.parts)) {
      if (!name.endsWith('.rels')) continue
      const base = name.replace(/_rels\/[^/]*\.rels$/, '')
      const ids = new Set<string>()
      for (const rel of elements(doc, 'Relationship')) {
        const id = rel.getAttribute('Id')!
        expect(ids.has(id), `duplicate ${id} in ${name}`).toBe(false)
        ids.add(id)
        if (rel.getAttribute('TargetMode') === 'External') continue
        const target = rel.getAttribute('Target')!
        const path = target.startsWith('/') ? target.slice(1) : new URL(target, `file:///${base}`).pathname.slice(1)
        expect(pkg.zip.file(path), `${name}: ${target}`).not.toBeNull()
      }
    }
  })

  it('references only declared relationships', () => {
    for (const [name, doc] of Object.entries(pkg.parts)) {
      if (name.endsWith('.rels') || !name.startsWith('word/')) continue
      const relsName = name.replace(/([^/]+)$/, '_rels/$1.rels')
      const rels = pkg.parts[relsName]
      const ids = new Set(rels ? elements(rels, 'Relationship').map((r) => r.getAttribute('Id')) : [])
      for (const el of Array.from(doc.getElementsByTagName('*'))) {
        for (const attr of Array.from(el.attributes)) {
          if (attr.namespaceURI === R && ['id', 'embed', 'link'].includes(attr.localName)) expect(ids.has(attr.value), `${name}: ${attr.name}="${attr.value}"`).toBe(true)
        }
      }
    }
  })

  it('keeps the schema order of property elements', () => {
    expect(orderViolations(pkg)).toEqual([])
  })

  it('gives every drawing a unique id', () => {
    const ids: string[] = []
    for (const [name, doc] of Object.entries(pkg.parts)) {
      if (!name.startsWith('word/') || name.endsWith('.rels')) continue
      for (const el of elements(doc, 'docPr')) ids.push(el.getAttribute('id')!)
    }
    expect(ids.length).toBeGreaterThan(2)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('writes separator notes and resolvable note references', () => {
    for (const kind of ['footnote', 'endnote'] as const) {
      const part = pkg.parts[`word/${kind}s.xml`]
      expect(part, `${kind}s.xml`).toBeDefined()
      const notes = elements(part, kind)
      const types = notes.map((n) => n.getAttributeNS(W, 'type') ?? n.getAttribute('w:type'))
      expect(types).toContain('separator')
      expect(types).toContain('continuationSeparator')
      const ids = new Set(notes.map((n) => n.getAttributeNS(W, 'id') ?? n.getAttribute('w:id')))
      for (const ref of elements(pkg.parts['word/document.xml'], `${kind}Reference`)) expect(ids.has(ref.getAttributeNS(W, 'id') ?? ref.getAttribute('w:id'))).toBe(true)
    }
  })

  it('matches comment ranges with comments', () => {
    const doc = pkg.parts['word/document.xml']
    const comments = new Set(elements(pkg.parts['word/comments.xml'], 'comment').map((c) => c.getAttribute('w:id')))
    for (const tag of ['commentRangeStart', 'commentRangeEnd', 'commentReference']) for (const el of elements(doc, tag)) expect(comments.has(el.getAttribute('w:id')), tag).toBe(true)
    expect(comments.size).toBe(2)
    expect(pkg.zip.file('word/commentsExtended.xml'), 'replies need commentsExtended.xml').not.toBeNull()
  })

  it('writes tracked changes, row heights, repeated header rows and the direction', () => {
    const doc = pkg.parts['word/document.xml']
    expect(elements(doc, 'ins').length).toBeGreaterThan(0)
    expect(elements(doc, 'del').length).toBeGreaterThan(0)
    expect(elements(doc, 'delText').length).toBeGreaterThan(0)
    expect(elements(doc, 'trHeight').length).toBe(1)
    expect(elements(doc, 'tblHeader').length).toBe(1)
    expect(elements(doc, 'bidi').length).toBeGreaterThan(0)
    expect(elements(pkg.parts['word/settings.xml'], 'trackRevisions').length).toBe(1)
  })

  it('puts the watermark into the headers', () => {
    const headers = Object.entries(pkg.parts).filter(([n]) => /^word\/header\d+\.xml$/.test(n))
    expect(headers.length).toBeGreaterThan(0)
    for (const [name, doc] of headers) expect(doc.documentElement.outerHTML.includes('DRAFT'), name).toBe(true)
  })

  it('writes one section per section break and column block', () => {
    const doc = pkg.parts['word/document.xml']
    const sections = elements(doc, 'sectPr')
    // Body, the two-column section (which starts on a new page) and the text after it.
    expect(sections.length).toBe(3)
    const columns = sections.find((s) => elements(s, 'cols').some((c) => c.getAttribute('w:num') === '2'))!
    expect(columns).toBeDefined()
    const type = elements(columns, 'type')[0]?.getAttribute('w:val') ?? 'nextPage'
    expect(type).toBe('nextPage')
  })
})

describe('.docx round trip', () => {
  it('reads back what it writes', async () => {
    const result = await importDocx(blob)
    const json = JSON.stringify(result.content)
    for (const text of ['Sample Report', 'colored Georgia', 'Bullet two', 'Nested', 'Merged', 'Text box content', 'Column text one', 'مرحبا']) expect(json, text).toContain(text)
    expect(json).toContain('"dir":"rtl"')
    expect(json).toContain('"rowHeight"')
    expect(json).toContain('"repeatHeader":true')
    expect(json).toContain('"insertion"')
    expect(json).toContain('"deletion"')
    expect(json).toContain('"comment"')
    expect(json).toContain('"noteRef"')
    expect(json).toContain('"equation"')
    expect(json).toContain('"chart"')
    expect(json).toContain('"kind":"ellipse"')
    expect(Object.keys(result.comments ?? {})).toHaveLength(1)
    expect(Object.values(result.comments ?? {})[0].replies).toHaveLength(1)
    expect(Object.keys(result.notes ?? {})).toHaveLength(2)
    expect(result.design?.watermark?.text).toBe('DRAFT')
  })
})

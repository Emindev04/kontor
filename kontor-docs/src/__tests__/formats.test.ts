// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateJSON, type JSONContent } from '@tiptap/core'
import JSZip from 'jszip'
import { staticExtensions } from '../editor/extensions'
import { exportRtf, importRtf, readRtfFile } from '../io/rtf'
import { importDoc } from '../io/doc'
import { exportDocx, replaceParagraphMarkers } from '../io/docxExport'
import { importDocx } from '../io/docxImport'
import { DEFAULT_DESIGN, DEFAULT_SETUP, EMPTY_HEADER_FOOTER, effectiveMargins } from '../pageSetup'
import { addVersion, listVersions, MAX_VERSIONS, setPinned, listDocuments, touchDocument } from '../library'

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name))
const toJson = (html: string) => generateJSON(html, staticExtensions)

function all(doc: JSONContent, pred: (n: JSONContent) => boolean, out: JSONContent[] = []) {
  if (pred(doc)) out.push(doc)
  for (const c of doc.content ?? []) all(c, pred, out)
  return out
}
const textOf = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('')
const marked = (doc: JSONContent, type: string) => all(doc, (n) => n.type === 'text' && !!n.marks?.some((m) => m.type === type)).map((n) => n.text).join('')

describe('RTF', () => {
  it('opens a document from another program', () => {
    const { html } = importRtf(fixture('sample.rtf').toString('latin1'))
    const doc = toJson(html)
    const text = textOf(doc)
    expect(text).toContain('Report Title')
    expect(text).toContain('Grüße €.')
    expect(marked(doc, 'bold')).toContain('bold')
    expect(marked(doc, 'italic')).toBe('italic')
    expect(marked(doc, 'underline')).toContain('under')
    expect(all(doc, (n) => n.type === 'bulletList')).toHaveLength(1)
    expect(all(doc, (n) => n.type === 'orderedList')).toHaveLength(1)
    expect(all(doc, (n) => n.type === 'tableCell').map(textOf)).toEqual(['A1', 'B1', 'A2', 'B2'])
    expect(all(doc, (n) => !!n.marks?.some((m) => m.type === 'link' && m.attrs?.href === 'https://example.com/'))).not.toHaveLength(0)
    const red = all(doc, (n) => n.text === 'red')[0]
    expect(red.marks?.find((m) => m.type === 'textStyle')?.attrs?.color).toMatch(/#FB0007/i)
    expect(all(doc, (n) => n.type === 'paragraph' && n.attrs?.textAlign === 'center').map(textOf)).toEqual(['Centered line'])
  })

  it('keeps formatting, lists, tables, links and pictures through save and open', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Chapter' }] },
        {
          type: 'paragraph',
          attrs: { textAlign: 'right', indentLeft: 0.5, spaceAfter: 6, lineHeight: '1.5' },
          content: [
            { type: 'text', text: 'Bold ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'red 14', marks: [{ type: 'textStyle', attrs: { color: '#C00000', fontSize: '14pt', fontFamily: 'Georgia' } }] },
            { type: 'text', text: ' x²', marks: [{ type: 'superscript' }] },
            { type: 'text', text: ' link', marks: [{ type: 'link', attrs: { href: 'https://kontor.example/a' } }] },
            { type: 'text', text: ' mark', marks: [{ type: 'highlight', attrs: { color: '#FFFF00' } }] },
            { type: 'image', attrs: { src: png, width: 40, height: 20 } },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Apple' }] }, { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inner' }] }] }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pear' }] }] },
          ],
        },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wide' }] }] }] },
            { type: 'tableRow', content: ['L', 'R'].map((t) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Ünïcödé 😀 {braces} \\back' }] },
      ],
    }
    const rtf = exportRtf(doc, 'My title')
    expect(rtf.startsWith('{\\rtf1')).toBe(true)
    const result = importRtf(rtf)
    expect(result.title).toBe('My title')
    const back = toJson(result.html)
    expect(all(back, (n) => n.type === 'heading').map((n) => [n.attrs?.level, textOf(n)])).toEqual([[2, 'Chapter']])
    const para = all(back, (n) => n.type === 'paragraph' && textOf(n).startsWith('Bold'))[0]
    expect(para.attrs).toMatchObject({ textAlign: 'right', indentLeft: 0.5, spaceAfter: 6, lineHeight: '1.5' })
    expect(marked(back, 'bold')).toBe('Bold ')
    expect(marked(back, 'superscript')).toBe(' x²')
    expect(marked(back, 'highlight')).toBe(' mark')
    const red = all(back, (n) => n.text === 'red 14')[0].marks!.find((m) => m.type === 'textStyle')!.attrs!
    expect(red).toMatchObject({ color: '#C00000', fontSize: '14pt', fontFamily: 'Georgia' })
    expect(all(back, (n) => n.text === ' link')[0].marks!.find((m) => m.type === 'link')!.attrs!.href).toBe('https://kontor.example/a')
    const img = all(back, (n) => n.type === 'image')[0]
    expect(img.attrs?.src).toBe(png)
    expect(img.attrs?.width).toBe(40)
    const bullet = all(back, (n) => n.type === 'bulletList')
    expect(bullet).toHaveLength(1)
    expect(all(bullet[0], (n) => n.type === 'orderedList').map(textOf)).toEqual(['Inner'])
    expect(bullet[0].content!.map((li) => textOf(li.content![0]))).toEqual(['Apple', 'Pear'])
    const cells = all(back, (n) => n.type === 'tableCell')
    expect(cells.map(textOf)).toEqual(['Wide', 'L', 'R'])
    expect(cells[0].attrs?.colspan).toBe(2)
    expect(textOf(back)).toContain('Ünïcödé 😀 {braces} \\back')
  })

  it('reads characters written as raw code page bytes', async () => {
    const bytes = new Uint8Array([...Buffer.from('{\\rtf1\\ansi\\ansicpg1252 Gr'), 0xfc, 0xdf, 0x65, 0x20, 0x80, 0x7d])
    const { html } = importRtf(await readRtfFile(new Blob([bytes])))
    expect(textOf(toJson(html))).toContain('Grüße €')
  })

  it('refuses files that are not RTF', () => {
    expect(() => importRtf('hello')).toThrow()
  })
})

describe('legacy .doc', () => {
  it('opens text with character and paragraph formatting and tables', () => {
    const { html } = importDoc(new Uint8Array(fixture('sample.doc')))
    const doc = toJson(html)
    const text = textOf(doc)
    expect(text).toContain('Report Title')
    expect(text).toContain('Grüße €.')
    expect(marked(doc, 'bold')).toContain('bold')
    expect(marked(doc, 'italic')).toBe('italic')
    expect(marked(doc, 'underline')).toContain('under')
    const big = all(doc, (n) => n.text === 'big')[0].marks!.find((m) => m.type === 'textStyle')!.attrs!
    expect(big.fontSize).toBe('26.5pt')
    expect(all(doc, (n) => n.text === 'red')[0].marks!.find((m) => m.type === 'textStyle')!.attrs!.color).toMatch(/#FB0007/i)
    expect(all(doc, (n) => n.type === 'paragraph' && n.attrs?.textAlign === 'center').map(textOf)).toEqual(['Centered line'])
    expect(all(doc, (n) => n.type === 'tableCell').map(textOf)).toEqual(['A1', 'B1', 'A2', 'B2'])
  })

  it('rejects files that are not compound files', () => {
    expect(() => importDoc(new Uint8Array(1024))).toThrow()
  })
})

describe('paragraph and page options in .docx', () => {
  it('writes and reads outline level, mirror indents, contextual spacing, suppressed line numbers, no hyphenation and the gutter', async () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { outlineLevel: 2, mirrorIndents: true, indentLeft: 1, contextualSpacing: true, suppressLineNumbers: true, noHyphenate: true }, content: [{ type: 'text', text: 'Body' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Plain' }] },
      ],
    }
    const setup = { ...DEFAULT_SETUP, gutter: 0.5, gutterPosition: 'top' as const }
    const blob = await exportDocx({ doc, setup, design: DEFAULT_DESIGN, headerFooter: EMPTY_HEADER_FOOTER, title: 'T' })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:mirrorIndents/>')
    expect(xml).toContain('<w:suppressAutoHyphens/>')
    expect(xml).toContain('w:outlineLvl w:val="1"')
    expect(xml).toMatch(/w:gutter="720"/)
    expect(await zip.file('word/settings.xml')!.async('string')).toContain('<w:gutterAtTop/>')
    const back = await importDocx(blob)
    const [first, second] = back.content.content!
    expect(first.attrs).toMatchObject({ outlineLevel: 2, mirrorIndents: true, contextualSpacing: true, suppressLineNumbers: true, noHyphenate: true })
    expect(second.attrs?.mirrorIndents ?? null).toBeNull()
    expect(back.setup).toMatchObject({ gutter: 0.5, gutterPosition: 'top' })
  })

  it('replaces only the marker elements', () => {
    expect(replaceParagraphMarkers('<w:pPr><w:wordWrap w:val="0"/><w:overflowPunct/></w:pPr>')).toBe('<w:pPr><w:suppressAutoHyphens/><w:mirrorIndents/></w:pPr>')
    // In the order of the schema: suppressAutoHyphens before spacing, mirrorIndents after ind and before jc,
    // and never inside the paragraph mark's run properties.
    expect(
      replaceParagraphMarkers('<w:pPr><w:pStyle w:val="A"/><w:wordWrap w:val="0"/><w:overflowPunct/><w:spacing w:after="0"/><w:ind w:left="720"/><w:jc w:val="both"/><w:rPr><w:spacing w:val="20"/></w:rPr></w:pPr>'),
    ).toBe('<w:pPr><w:pStyle w:val="A"/><w:suppressAutoHyphens/><w:spacing w:after="0"/><w:ind w:left="720"/><w:mirrorIndents/><w:jc w:val="both"/><w:rPr><w:spacing w:val="20"/></w:rPr></w:pPr>')
    expect(replaceParagraphMarkers('<w:pPr><w:jc w:val="left"/></w:pPr>')).toBe('<w:pPr><w:jc w:val="left"/></w:pPr>')
  })

  it('adds the gutter to the left or top margin on screen', () => {
    expect(effectiveMargins({ ...DEFAULT_SETUP, gutter: 0.5 }).left).toBe(1.5)
    expect(effectiveMargins({ ...DEFAULT_SETUP, gutter: 0.5, gutterPosition: 'top' }).top).toBe(1.5)
  })
})

describe('document library', () => {
  it('keeps versions, skips unchanged ones and respects the interval', async () => {
    localStorage.clear()
    const v1 = { content: { type: 'doc', content: [{ type: 'paragraph' }] } }
    const t0 = new Date('2026-01-01T10:00:00Z')
    expect(await addVersion('d1', v1, 0, 0, t0)).toBe(true)
    expect(await addVersion('d1', v1, 0, 0, new Date('2026-01-01T11:00:00Z'))).toBe(false)
    const v2 = { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] } }
    expect(await addVersion('d1', v2, 1, 10 * 60 * 1000, new Date('2026-01-01T10:05:00Z'))).toBe(false)
    expect(await addVersion('d1', v2, 1, 10 * 60 * 1000, new Date('2026-01-01T10:20:00Z'))).toBe(true)
    const list = await listVersions('d1')
    expect(list.map((v) => v.words)).toEqual([1, 0])
    for (let i = 0; i < MAX_VERSIONS + 5; i++) await addVersion('d1', { content: i }, i, 0, new Date(t0.getTime() + i * 1000))
    expect(await listVersions('d1')).toHaveLength(MAX_VERSIONS)
  })

  it('keeps pinned documents first and pinned after updates', () => {
    localStorage.clear()
    touchDocument({ id: 'a', title: 'A', modified: '2026-01-01T00:00:00Z' })
    touchDocument({ id: 'b', title: 'B', modified: '2026-01-02T00:00:00Z' })
    setPinned({ id: 'a', title: 'A', modified: '2026-01-01T00:00:00Z' }, true)
    touchDocument({ id: 'a', title: 'A2', modified: '2026-01-01T00:00:00Z' })
    expect(listDocuments().map((d) => [d.id, !!d.pinned])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })
})

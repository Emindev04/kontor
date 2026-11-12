// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { Slice } from '@tiptap/pm/model'
import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
import { staticExtensions } from '../editor/extensions'
import { parseMath, toMathML } from '../editor/math'
import { hoistBlockStyles, mergeFormatting, textSlice } from '../editor/Paste'
import { imageSize } from '../io/imageSize'

const schema = getSchema(staticExtensions)

describe('equations', () => {
  it('keeps a lone period as a character', () => {
    expect(() => parseMath('\\text{Type equation here.}')).not.toThrow()
    expect(toMathML(parseMath('a.b'))).toContain('.')
    expect(toMathML(parseMath('3.5+.5'))).toContain('<mn>3.5</mn>')
  })
})

describe('paste', () => {
  it('moves block-level text formatting onto the text', () => {
    const html = hoistBlockStyles('<p style="color: red; font-family: Georgia; font-weight: bold">Hi</p>')
    const el = document.createElement('div')
    el.innerHTML = html
    const span = el.querySelector('span')!
    expect(span.style.color).toBe('red')
    expect(span.style.fontFamily).toBe('Georgia')
    expect(el.querySelector('strong')).not.toBeNull()
  })

  it('pastes plain text as paragraphs, a single line inline', () => {
    expect(textSlice(schema, 'one line').content.firstChild?.isText).toBe(true)
    const multi = textSlice(schema, 'a\nb\nc')
    expect(multi.content.childCount).toBe(3)
    expect(multi.content.firstChild?.type.name).toBe('paragraph')
  })

  it('merge formatting keeps emphasis and drops fonts, colors and alignment', () => {
    const el = document.createElement('div')
    el.innerHTML = '<p style="text-align:center"><span style="color:#f00;font-family:Georgia">red</span> <strong>bold</strong></p>'
    const slice = PMDOMParser.fromSchema(schema).parseSlice(el)
    const merged = mergeFormatting(schema, new Slice(slice.content, slice.openStart, slice.openEnd))
    const para = merged.content.firstChild!
    expect(para.attrs.textAlign).toBeNull()
    const marks = new Set<string>()
    para.descendants((n) => n.marks.forEach((m) => marks.add(m.type.name)))
    expect(marks.has('bold')).toBe(true)
    expect(marks.has('textStyle')).toBe(false)
  })
})

describe('pictures', () => {
  it('reads the size of PNG, GIF and JPEG files from their headers', () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0))
    expect(imageSize(png)).toEqual({ width: 10, height: 10 })
    const gif = Uint8Array.from(atob('R0lGODlhAwACAIAAAP///wAAACH5BAEAAAAALAAAAAADAAIAAAICjF8AOw=='), (c) => c.charCodeAt(0))
    expect(imageSize(gif)).toEqual({ width: 3, height: 2 })
    // Minimal JPEG: SOI, an APP0 segment and a SOF0 frame header for 640 × 480.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x01, 0x01, 0x11, 0x00, 0x00, 0x00, 0x00])
    expect(imageSize(jpeg)).toEqual({ width: 640, height: 480 })
  })
})

describe('citations and index', async () => {
  const { bibliographyEntry, citationText, indexLines } = await import('../editor/Citations')
  const book = { id: 's1', type: 'book' as const, author: 'Smith, John; Doe, Jane', title: 'Writing Well', year: '2020', publisher: 'Acme Press', city: 'Boston', volume: '', pages: '', url: '', accessed: '' }
  const sources = { s1: book }

  it('formats in-text citations per style', () => {
    expect(citationText('s1', '', 'apa', sources)).toBe('(Smith & Doe, 2020)')
    expect(citationText('s1', '42', 'mla', sources)).toBe('(Smith and Doe 42)')
    expect(citationText('s1', '', 'chicago', sources)).toBe('(Smith and Doe 2020)')
    expect(citationText('missing', '', 'apa', sources)).toContain('not found')
  })

  it('formats bibliography entries', () => {
    const apa = bibliographyEntry(book, 'apa')
    expect(apa.before).toBe('Smith, J. & Doe, J. (2020). ')
    expect(apa.italic).toBe('Writing Well')
    expect(bibliographyEntry(book, 'mla').before.startsWith('Smith, John and Jane Doe.')).toBe(true)
  })

  it('lists index terms alphabetically with subentries', () => {
    const p = (...c: object[]) => ({ type: 'paragraph', content: c })
    const xe = (term: string, sub = '') => ({ type: 'indexEntry', attrs: { term, sub } })
    const doc = schema.nodeFromJSON({ type: 'doc', content: [p({ type: 'text', text: 'a' }, xe('zebra')), p({ type: 'text', text: 'b' }, xe('apple'), xe('apple', 'green'))] })
    expect(indexLines(doc).map((l) => [l.text, l.level])).toEqual([['apple', 0], ['green', 1], ['zebra', 0]])
  })
})

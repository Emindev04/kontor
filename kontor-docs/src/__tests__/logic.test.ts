import { describe, expect, it } from 'vitest'
import { formatLength, parseLength } from '../units'
import { formatPageNumber, matchPaper, paperDims, slotFor, DEFAULT_SETUP } from '../pageSetup'
import { fillRecord, mergeAll, parseCsv } from '../editor/MailMerge'
import { stripPageNumbers } from '../hf/presets'
import { lineHeightCss } from '../editor/ParagraphFormat'

describe('units', () => {
  it('formats and parses lengths in every unit', () => {
    expect(formatLength(1, 'in')).toBe('1"')
    expect(formatLength(1, 'cm')).toBe('2.54 cm')
    expect(parseLength('2.54 cm', 'in')).toBeCloseTo(1)
    expect(parseLength('72pt', 'in')).toBeCloseTo(1)
    expect(parseLength('1,5', 'in')).toBeCloseTo(1.5)
    expect(parseLength('3', 'cm')).toBeCloseTo(3 / 2.54)
    expect(parseLength('abc', 'in')).toBeNull()
  })
})

describe('page setup', () => {
  it('numbers pages in all formats', () => {
    expect(formatPageNumber(4, 'decimal')).toBe('4')
    expect(formatPageNumber(4, 'lowerRoman')).toBe('iv')
    expect(formatPageNumber(14, 'upperRoman')).toBe('XIV')
    expect(formatPageNumber(28, 'lowerLetter')).toBe('bb')
    expect(formatPageNumber(3, 'upperLetter')).toBe('C')
  })

  it('rotates the paper for landscape and recognizes sizes', () => {
    expect(paperDims({ ...DEFAULT_SETUP, orientation: 'landscape' })).toEqual({ w: 11, h: 8.5 })
    expect(matchPaper(11.69, 8.27)).toEqual({ size: 'a4', orientation: 'landscape' })
    expect(matchPaper(8.5, 14)).toEqual({ size: 'legal', orientation: 'portrait' })
  })

  it('uses the first-page header only when enabled', () => {
    expect(slotFor('header', 0, DEFAULT_SETUP)).toBe('header')
    expect(slotFor('footer', 0, { ...DEFAULT_SETUP, differentFirstPage: true })).toBe('firstFooter')
    expect(slotFor('footer', 1, { ...DEFAULT_SETUP, differentFirstPage: true })).toBe('footer')
  })
})

describe('line spacing', () => {
  it('maps stored spacing to CSS', () => {
    expect(lineHeightCss('1.5')).toBe('calc(var(--single-line) * 1.5)')
    expect(lineHeightCss('exact:12')).toBe('12pt')
    expect(lineHeightCss(null)).toBeNull()
  })
})

describe('mail merge', () => {
  it('parses CSV with quotes, separators and newlines', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
    expect(parseCsv('a;b\r\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parseCsv('n\n"multi\nline"')).toEqual([['n'], ['multi\nline']])
  })

  it('fills merge fields and keeps their formatting', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear ' }, { type: 'mergeField', attrs: { name: 'Name' }, marks: [{ type: 'bold' }] }] }],
    }
    expect(fillRecord(doc, { Name: 'Ada' }).content![0].content![1]).toEqual({ type: 'text', text: 'Ada', marks: [{ type: 'bold' }] })
    expect(fillRecord(doc, {}).content![0].content).toHaveLength(1)
    const merged = mergeAll(doc, [{ Name: 'A' }, { Name: 'B' }])
    expect(merged.content!.map((n) => n.type)).toEqual(['paragraph', 'pageBreak', 'paragraph'])
  })
})

describe('headers and footers', () => {
  it('removes page number fields', () => {
    const footer = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Page ' }, { type: 'field', attrs: { kind: 'page' } }, { type: 'field', attrs: { kind: 'title' } }] }] }
    expect(stripPageNumbers(footer)!.content![0].content!.map((n) => n.type)).toEqual(['text', 'field'])
  })
})

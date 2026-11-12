// Regional number conventions: cells show and accept numbers with the decimal and thousands
// separators of the interface language, while the model and files keep canonical numbers.
import { afterEach, describe, expect, it } from 'vitest'
import '../engine/functions'
import { Doc } from '../commands/doc'
import { cellView } from '../commands/display'
import { setTranslationsForTest, type Language } from '../i18n'
import { exportCsv } from '../io/csv'
import { toJSON } from '../io/json'
import { formatDisplay, formatValue } from '../model/numfmt'
import { numberSymbols, US_SYMBOLS } from '../model/numberLocale'
import { parseInput, parseNumber } from '../model/parseInput'

const NNBSP = ' '
const show = (lang: Language, v: number, code?: string) => formatValue(v, code, 11, numberSymbols(lang)).text

afterEach(() => setTranslationsForTest('en', {}))

describe('separators per language', () => {
  it('match what Intl uses (with grouping of four-digit numbers)', () => {
    for (const [lang, locale] of [['de', 'de-DE'], ['fr', 'fr-FR'], ['es', 'es-ES']] as const) {
      const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
      expect(numberSymbols(lang).decimal).toBe(parts.find((p) => p.type === 'decimal')!.value)
      expect(numberSymbols(lang).group).toBe(parts.find((p) => p.type === 'group')!.value)
    }
    expect(numberSymbols('en')).toEqual(US_SYMBOLS)
  })
})

describe('display', () => {
  const cases: [string | undefined, number, Record<Language, string>][] = [
    [undefined, 3.5, { en: '3.5', de: '3,5', fr: '3,5', es: '3,5' }],
    ['General', -1234.25, { en: '-1234.25', de: '-1234,25', fr: '-1234,25', es: '-1234,25' }],
    ['0.00', 3.5, { en: '3.50', de: '3,50', fr: '3,50', es: '3,50' }],
    ['#,##0.00', 1200, { en: '1,200.00', de: '1.200,00', fr: `1${NNBSP}200,00`, es: '1.200,00' }],
    ['#,##0', 1234567, { en: '1,234,567', de: '1.234.567', fr: `1${NNBSP}234${NNBSP}567`, es: '1.234.567' }],
    ['0.0%', 0.125, { en: '12.5%', de: '12,5%', fr: '12,5%', es: '12,5%' }],
    ['"$"#,##0.00', 1234.5, { en: '$1,234.50', de: '$1.234,50', fr: `$1${NNBSP}234,50`, es: '$1.234,50' }],
    ['#,##0.00 €', -1234.5, { en: '-1,234.50 €', de: '-1.234,50 €', fr: `-1${NNBSP}234,50 €`, es: '-1.234,50 €' }],
    ['0.00E+00', 12345, { en: '1.23E+04', de: '1,23E+04', fr: '1,23E+04', es: '1,23E+04' }],
    ['# ?/?', 1.5, { en: '1 1/2', de: '1 1/2', fr: '1 1/2', es: '1 1/2' }],
    ['m/d/yyyy', 45351, { en: '2/29/2024', de: '2/29/2024', fr: '2/29/2024', es: '2/29/2024' }],
    ['mm:ss.0', 0.5 / 86400, { en: '00:00.5', de: '00:00,5', fr: '00:00,5', es: '00:00,5' }],
  ]
  for (const [code, v, expected] of cases) {
    it(`renders ${code ?? 'no format'} in every language`, () => {
      for (const lang of ['en', 'de', 'fr', 'es'] as Language[]) expect(show(lang, v, code)).toBe(expected[lang])
    })
  }

  it('renders accounting formats with localized separators', () => {
    const code = '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)'
    expect(show('de', 1234.5, code).replace(/\s+/g, ' ')).toBe(' $1.234,50 ')
    expect(show('en', 1234.5, code).replace(/\s+/g, ' ')).toBe(' $1,234.50 ')
  })

  it('formatDisplay follows the interface language; formatValue stays US', () => {
    setTranslationsForTest('de', {})
    expect(formatDisplay(1234.5, '#,##0.00').text).toBe('1.234,50')
    expect(formatValue(1234.5, '#,##0.00').text).toBe('1,234.50')
  })

  it('keeps TEXT() results canonical in German', () => {
    setTranslationsForTest('de', {})
    const doc = new Doc()
    doc.setInput(0, 0, '=TEXT(1234,5;"#,##0.00")')
    expect(doc.value(0, 0)).toBe('1,234.50')
  })

  it('shows cells, General shrink and status-bar text localized', () => {
    setTranslationsForTest('de', {})
    const doc = new Doc()
    doc.setInput(0, 0, '3,5')
    doc.setInput(1, 0, '1.200,00')
    const view = (r: number) => cellView(doc, doc.sheet, r, 0, doc.style(r, 0)).text
    expect(view(0)).toBe('3,5')
    expect(view(1)).toBe('1.200,00')
    expect(cellView(doc, doc.sheet, 0, 0, doc.style(0, 0), undefined, 1 / 3).text).toBe('0,333333333')
  })
})

describe('entry', () => {
  const num = (lang: Language, text: string) => {
    const p = parseInput(text, numberSymbols(lang))
    return p.kind === 'value' ? p : null
  }

  for (const lang of ['de', 'es'] as const) {
    it(`parses numbers typed in ${lang}`, () => {
      expect(num(lang, '1,5')).toEqual({ kind: 'value', v: 1.5, fmt: undefined })
      expect(num(lang, '-1,5')?.v).toBe(-1.5)
      expect(num(lang, '(2,25)')?.v).toBe(-2.25)
      expect(num(lang, '1.234,56')).toEqual({ kind: 'value', v: 1234.56, fmt: '#,##0.00' })
      expect(num(lang, '1.234.567')).toEqual({ kind: 'value', v: 1234567, fmt: '#,##0' })
      expect(num(lang, '-1.234')?.v).toBe(-1234)
      expect(num(lang, '12,5 %')).toEqual({ kind: 'value', v: 0.125, fmt: '0.0%' })
      expect(num(lang, '12,5%')?.v).toBe(0.125)
      expect(num(lang, '-3%')?.v).toBe(-0.03)
      expect(num(lang, '1,5E3')?.v).toBe(1500)
      expect(num(lang, ',5')?.v).toBe(0.5)
      expect(num(lang, '1.234,50 €')).toEqual({ kind: 'value', v: 1234.5, fmt: '#,##0.00 €' })
      expect(num(lang, '€1.234')).toEqual({ kind: 'value', v: 1234, fmt: '€#,##0' })
    })

    it(`keeps non-numbers as text in ${lang}`, () => {
      for (const s of ['1.5', '1.50', '12.5%', '1,234.56', '1.23.4', '1.2345', '1,2,3', '1.234,5,6', 'abc', '1,5x', '1 234', ',']) {
        expect(num(lang, s)).toEqual({ kind: 'value', v: s, fmt: undefined })
      }
    })
  }

  it('parses numbers typed in fr', () => {
    expect(num('fr', '1,5')?.v).toBe(1.5)
    expect(num('fr', '-1,5')?.v).toBe(-1.5)
    expect(num('fr', `1${NNBSP}234,56`)).toEqual({ kind: 'value', v: 1234.56, fmt: '#,##0.00' })
    expect(num('fr', '1 234,56')?.v).toBe(1234.56)
    expect(num('fr', '1 234 567')).toEqual({ kind: 'value', v: 1234567, fmt: '#,##0' })
    expect(num('fr', '12,5 %')?.v).toBe(0.125)
    expect(num('fr', '-12,5 %')?.v).toBe(-0.125)
    expect(num('fr', '1 1/2')?.v).toBe(1.5)
    for (const s of ['1.5', '1.234,56', '1 23', '12 34,5', 'deux']) expect(num('fr', s)).toEqual({ kind: 'value', v: s, fmt: undefined })
  })

  it('keeps English entry unchanged', () => {
    expect(parseNumber('1,234.56')).toEqual({ v: 1234.56, fmt: '#,##0.00' })
    expect(parseInput('1.5')).toEqual({ kind: 'value', v: 1.5, fmt: undefined })
    expect(parseInput('1,5')).toEqual({ kind: 'value', v: '1,5', fmt: undefined })
    expect(parseInput('5 €')).toEqual({ kind: 'value', v: '5 €', fmt: undefined })
    expect(parseInput('12.5%', numberSymbols('en'))).toEqual({ kind: 'value', v: 0.125, fmt: '0.0%' })
  })

  it('still reads US dates in German (1.5 is neither a number nor a date)', () => {
    expect(num('de', '3/1/2024')?.fmt).toBe('m/d/yyyy')
    expect(num('de', '1.5')?.v).toBe('1.5')
  })

  it('stores numbers typed in a German cell canonically', () => {
    setTranslationsForTest('de', {})
    const doc = new Doc()
    doc.setInput(0, 0, '1.234,56')
    doc.setInput(1, 0, '12,5 %')
    doc.setInput(2, 0, '1.5')
    expect(doc.sheet.get(0, 0)?.v).toBe(1234.56)
    expect(doc.style(0, 0).fmt).toBe('#,##0.00')
    expect(doc.sheet.get(1, 0)?.v).toBe(0.125)
    expect(doc.style(1, 0).fmt).toBe('0.0%')
    expect(doc.sheet.get(2, 0)?.v).toBe('1.5')
    const json = JSON.stringify(toJSON(doc.wb, 0))
    expect(json).toContain('1234.56')
    expect(json).not.toContain('1234,56')
  })
})

describe('editing', () => {
  for (const lang of ['de', 'fr', 'es'] as const) {
    it(`round-trips numeric cells through the edit box in ${lang}`, () => {
      setTranslationsForTest(lang, {})
      const doc = new Doc()
      doc.setInput(0, 0, '1,5')
      doc.setInput(1, 0, '-1234,25')
      doc.setInput(2, 0, '12,5%')
      doc.setInput(3, 0, '0,0000001')
      expect(doc.inputText(0, 0)).toBe('1,5')
      expect(doc.inputText(1, 0)).toBe('-1234,25')
      expect(doc.inputText(2, 0)).toBe('12,5%')
      for (let r = 0; r < 4; r++) {
        const before = doc.sheet.get(r, 0)?.v
        expect(doc.prepareInput(doc.inputText(r, 0)).data.v).toBe(before)
        doc.select({ r, c: 0 })
        doc.beginEdit('edit')
        expect(doc.commitEdit()).toBeNull()
        expect(doc.sheet.get(r, 0)?.v).toBe(before)
      }
    })
  }

  it('marks text that looks like a local number with an apostrophe', () => {
    setTranslationsForTest('de', {})
    const doc = new Doc()
    doc.setInput(0, 0, "'1,5")
    doc.setInput(1, 0, '1.5')
    expect(doc.inputText(0, 0)).toBe("'1,5")
    expect(doc.inputText(1, 0)).toBe('1.5')
  })

  it('keeps English editing unchanged', () => {
    const doc = new Doc()
    doc.setInput(0, 0, '1.5')
    doc.setInput(1, 0, '12.5%')
    expect(doc.inputText(0, 0)).toBe('1.5')
    expect(doc.inputText(1, 0)).toBe('12.5%')
  })
})

describe('storage and files', () => {
  it('writes CSV with US numbers whatever the language', async () => {
    setTranslationsForTest('de', {})
    const doc = new Doc()
    doc.setInput(0, 0, '1.234,5')
    doc.setInput(0, 1, '3,25')
    const text = await exportCsv(doc).text()
    expect(text.replace(/^﻿/, '').trim()).toBe('"1,234.50",3.25')
  })
})

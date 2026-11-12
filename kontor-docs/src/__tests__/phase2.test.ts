import { describe, expect, it } from 'vitest'
import { parseMath, textOf, toMathML } from '../editor/math'
import { compareDocuments, diff } from '../editor/compare'
import { SHAPES } from '../editor/shapePaths'
import { formatNoteNumber } from '../editor/Notes'
import { synonyms, matchCase } from '../editor/thesaurus'
import { chartSvg, DEFAULT_CHART } from '../editor/Chart'

describe('equations', () => {
  it('parses fractions, roots and scripts', () => {
    const tree = parseMath('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}')
    const ml = toMathML(tree)
    expect(ml).toContain('<mfrac>')
    expect(ml).toContain('<msqrt>')
    expect(ml).toContain('<msup>')
    expect(ml).toContain('±')
  })

  it('renders large operators with limits under and over', () => {
    expect(toMathML(parseMath('\\sum_{i=1}^{n} i'))).toContain('<munderover>')
    expect(toMathML(parseMath('\\int_0^1 x\\,dx'))).toContain('<msubsup>')
  })

  it('keeps text of plain symbols', () => {
    expect(textOf(parseMath('\\alpha+\\beta'))).toBe('α+β')
  })

  it('parses matrices inside brackets', () => {
    const ml = toMathML(parseMath('\\begin{pmatrix}a & b\\\\c & d\\end{pmatrix}'))
    expect(ml).toContain('<mtable>')
    expect((ml.match(/<mtr>/g) ?? []).length).toBe(2)
  })
})

describe('compare', () => {
  it('diffs sequences', () => {
    const ops = diff(['a', 'b', 'c'], ['a', 'x', 'c'], (p, q) => p === q)
    expect(ops).toHaveLength(4)
    expect([ops[0].op, ops[3].op]).toEqual(['eq', 'eq'])
    expect(ops.slice(1, 3).map((o) => o.op).sort()).toEqual(['del', 'ins'])
    expect(ops.filter((o) => o.op === 'eq').length).toBe(2)
  })

  it('marks changed words as insertions and deletions', () => {
    const p = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
    const { doc, changes } = compareDocuments({ type: 'doc', content: [p('The quick fox'), p('Removed paragraph')] }, { type: 'doc', content: [p('The slow fox')] }, 'Tester')
    expect(changes).toBeGreaterThan(0)
    const json = JSON.stringify(doc)
    expect(json).toContain('"insertion"')
    expect(json).toContain('"deletion"')
    expect(json).toContain('Removed paragraph')
  })
})

describe('shapes and charts', () => {
  it('every preset produces an outline', () => {
    for (const [id, preset] of Object.entries(SHAPES)) expect(preset.path(120, 80), id).toMatch(/^M/)
  })

  it('draws a chart with all series', () => {
    const svg = chartSvg(DEFAULT_CHART, 400, 300)
    expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThan(DEFAULT_CHART.series.length * DEFAULT_CHART.categories.length)
  })
})

describe('notes and thesaurus', () => {
  it('formats note numbers', () => {
    expect(formatNoteNumber(3, 'decimal')).toBe('3')
    expect(formatNoteNumber(2, 'lowerRoman')).toBe('ii')
    expect(formatNoteNumber(5, 'symbol')).toBe('**')
  })

  it('finds synonyms and keeps case', () => {
    expect(synonyms('big')).toContain('large')
    expect(matchCase('Big', 'large')).toBe('Large')
  })
})

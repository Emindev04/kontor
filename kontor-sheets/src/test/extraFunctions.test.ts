// @vitest-environment jsdom
// GROUPBY, PIVOTBY, TRIMRANGE, GETPIVOTDATA, FILTERXML, BAHTTEXT, PHONETIC, ROMAN forms, LINEST statistics, CELL format.
import { describe, expect, it } from 'vitest'
import { Doc } from '../commands/doc'
import { createPivot, updatePivot } from '../commands/pivot'
import { exportFormula, importFormula } from '../io/formulaText'
import { bahtText, roman } from '../engine/functions/extra'

function sheet(rows: (string | number)[][]) {
  const doc = new Doc()
  rows.forEach((row, r) => row.forEach((v, c) => doc.setInput(r, c, String(v))))
  return doc
}
const at = (doc: Doc, f: string) => {
  doc.setInput(20, 10, f)
  return doc.value(20, 10)
}

describe('extra functions', () => {
  it('ROMAN forms', () => {
    expect([0, 1, 2, 3, 4].map((f) => roman(499, f))).toEqual(['CDXCIX', 'LDVLIV', 'XDIX', 'VDIV', 'ID'])
    const doc = new Doc()
    expect(at(doc, '=ROMAN(1999,FALSE)')).toBe('MIM')
  })

  it('BAHTTEXT and PHONETIC', () => {
    expect(bahtText(1234)).toBe('หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน')
    expect(bahtText(21.25)).toBe('ยี่สิบเอ็ดบาทยี่สิบห้าสตางค์')
    const doc = sheet([['abc']])
    expect(at(doc, '=PHONETIC(A1)')).toBe('abc')
  })

  it('LINEST with statistics', () => {
    const doc = sheet([[1, 3], [2, 5], [3, 7.2], [4, 8.8]])
    doc.setInput(10, 0, '=LINEST(B1:B4,A1:A4,TRUE,TRUE)')
    expect(doc.value(10, 0)).toBeCloseTo(1.96, 6)
    expect(doc.value(10, 1)).toBeCloseTo(1.1, 6)
    expect(doc.value(12, 0)).toBeGreaterThan(0.99)
    expect(doc.value(13, 1)).toBe(2)
    expect(doc.value(12, 2)).toBeUndefined
  })

  it('LINEST with two x variables', () => {
    const doc = sheet([[1, 2, 6], [2, 1, 5], [3, 4, 12], [4, 3, 11], [5, 7, 20]])
    // y = 1 + 1*x1 + 2*x2 → coefficients in reverse order: m2, m1, b
    doc.setInput(10, 0, '=LINEST(C1:C5,A1:B5)')
    expect(doc.value(10, 0)).toBeCloseTo(2, 6)
    expect(doc.value(10, 1)).toBeCloseTo(1, 6)
    expect(doc.value(10, 2)).toBeCloseTo(1, 6)
  })

  it('GROUPBY and PIVOTBY with eta functions', () => {
    const doc = sheet([['Region', 'Product', 'Sales'], ['East', 'Tea', 10], ['West', 'Tea', 5], ['East', 'Coffee', 7], ['West', 'Coffee', 3], ['East', 'Tea', 1]])
    doc.setInput(10, 0, '=GROUPBY(A1:A6,C1:C6,SUM)')
    expect([doc.value(10, 0), doc.value(10, 1), doc.value(11, 0), doc.value(11, 1), doc.value(12, 0), doc.value(12, 1), doc.value(13, 0), doc.value(13, 1)]).toEqual(['Region', 'Sales', 'East', 18, 'West', 8, 'Total', 26])
    doc.setInput(20, 0, '=PIVOTBY(A2:A6,B2:B6,C2:C6,LAMBDA(x,SUM(x)))')
    expect([doc.value(20, 1), doc.value(20, 2), doc.value(20, 3)]).toEqual(['Coffee', 'Tea', 'Total'])
    expect([doc.value(21, 0), doc.value(21, 1), doc.value(21, 2), doc.value(21, 3)]).toEqual(['East', 7, 11, 18])
    expect(doc.value(23, 3)).toBe(26)
    expect(exportFormula('GROUPBY(A1:A6,C1:C6,SUM)')).toBe('_xlfn.GROUPBY(A1:A6,C1:C6,_xlfn._xleta.SUM)')
    expect(importFormula('_xlfn.GROUPBY(A1:A6,C1:C6,_xlfn._xleta.SUM)')).toBe('GROUPBY(A1:A6,C1:C6,SUM)')
    // a defined name called like a function stays a name
    expect(exportFormula('Rate*12', new Set(['RATE']))).toBe('Rate*12')
  })

  it('TRIMRANGE and FILTERXML', () => {
    const doc = sheet([[1], [2], [3]])
    expect(at(doc, '=ROWS(TRIMRANGE(A1:A100))')).toBe(3)
    expect(at(doc, '=FILTERXML("<a><b>1</b><b>x</b></a>","//b[2]")')).toBe('x')
  })

  it('GETPIVOTDATA', () => {
    const doc = sheet([['Region', 'Sales'], ['East', 10], ['West', 5], ['East', 7]])
    expect(createPivot(doc, 'Sheet1!$A$1:$B$4', { sheet: doc.sheet, r: 0, c: 5 })).toBeNull()
    const p = doc.wb.sheets.flatMap((s) => s.x.pivots)[0]
    updatePivot(doc, p.id, (x) => {
      x.rows = ['Region']
      x.values = [{ field: 'Sales', fn: 'sum', showAs: 'normal' }]
    })
    const target = doc.wb.sheets.find((s) => s.x.pivots.length)!
    const name = target === doc.sheet ? '' : `'${target.name}'!`
    expect(at(doc, `=GETPIVOTDATA("Sales",${name}$F$1,"Region","East")`)).toBe(17)
    expect(at(doc, `=GETPIVOTDATA("Sum of Sales",${name}$F$1)`)).toBe(22)
  })

  it('CELL format codes', () => {
    const doc = sheet([[1.5]])
    doc.select({ r: 0, c: 0 })
    doc.applyStyle({ fmt: '0.00%' })
    expect(at(doc, '=CELL("format",A1)')).toBe('P2')
    doc.applyStyle({ fmt: '$#,##0.00_);[Red]($#,##0.00)' })
    expect(at(doc, '=CELL("format",A1)')).toBe('C2-')
    expect(at(doc, '=CELL("color",A1)')).toBe(1)
  })
})

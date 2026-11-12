import { describe, expect, it } from 'vitest'
import { Doc } from '../commands/doc'
import { computePivot, readSource } from '../commands/pivot'
import type { PivotDef } from '../model/extras'

function data() {
  const doc = new Doc()
  const rows = [
    ['Date', 'Units', 'Revenue'],
    ['1/15/2024', '2', '20'],
    ['2/3/2024', '1', '15'],
    ['2/20/2024', '3', '30'],
    ['5/1/2024', '4', '60'],
    ['1/9/2025', '5', '40'],
  ]
  rows.forEach((row, r) => row.forEach((t, c) => doc.setInput(r, c, t)))
  return doc
}

const base = (extra: Partial<PivotDef>): PivotDef => ({
  id: 1, name: 'PivotTable1', source: 'Sheet1!$A$1:$C$6', r: 0, c: 6, rows: [], cols: [], values: [], filters: [],
  grandRows: true, grandCols: true, subtotals: true, layout: 'compact', style: 'TableStyleLight16', bandRows: false, collapsed: [], ...extra,
})

describe('PivotTable grouping', () => {
  it('groups dates by month in calendar order', () => {
    const doc = data()
    const p = base({ rows: ['Date'], values: [{ field: 'Units', fn: 'sum', showAs: 'normal' }], groups: { Date: { kind: 'date', units: ['months'] } } })
    const flat = computePivot(p, readSource(doc, p)!).map((r) => r.map((c) => c.v))
    expect(flat.slice(1)).toEqual([['Jan', 7], ['Feb', 4], ['May', 4], ['Grand Total', 15]])
  })
  it('adds Years and Quarters fields for several periods', () => {
    const doc = data()
    const p = base({ rows: ['Years', 'Date'], values: [{ field: 'Revenue', fn: 'sum', showAs: 'normal' }], groups: { Date: { kind: 'date', units: ['years', 'quarters'] } } })
    const src = readSource(doc, p)!
    expect(src.fields).toContain('Years')
    const flat = computePivot(p, src).map((r) => r.map((c) => c.v))
    expect(flat.slice(1)).toEqual([['2024', 125], ['Qtr1', 65], ['Qtr2', 60], ['2025', 40], ['Qtr1', 40], ['Grand Total', 165]])
  })
  it('groups numbers into ranges', () => {
    const doc = data()
    const p = base({ rows: ['Revenue'], values: [{ field: 'Units', fn: 'count', showAs: 'normal' }], groups: { Revenue: { kind: 'number', start: 0, end: 59, step: 20 } } })
    const flat = computePivot(p, readSource(doc, p)!).map((r) => r.map((c) => c.v))
    expect(flat.slice(1)).toEqual([['0-19', 1], ['20-39', 2], ['40-59', 1], ['>59', 1], ['Grand Total', 5]])
  })
})

describe('calculated fields', () => {
  it('evaluates on the sums of each group', () => {
    const doc = data()
    const p = base({
      rows: ['Date'], values: [{ field: 'Price', fn: 'sum', showAs: 'normal' }],
      groups: { Date: { kind: 'date', units: ['years'] } }, calcFields: [{ name: 'Price', formula: '=Revenue/Units' }],
    })
    const flat = computePivot(p, readSource(doc, p)!).map((r) => r.map((c) => c.v))
    expect(flat[0]).toEqual(['Row Labels', 'Sum of Price'])
    expect(flat[1]).toEqual(['2024', 12.5])
    expect(flat[2]).toEqual(['2025', 8])
    expect(flat[3]).toEqual(['Grand Total', 11])
  })
})

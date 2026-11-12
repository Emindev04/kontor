import { describe, expect, it } from 'vitest'
import { learn, apply } from '../commands/flashFill'
import { parseSpec, resolveSpec } from '../engine/structured'
import { niceScale, histogramBins, trend } from '../charts/renderChart'
import { subtract } from '../commands/validation'
import { shiftRange } from '../commands/extrasAdjust'
import type { TableDef } from '../model/extras'
import { passwordHash } from '../model/extras'
import { Doc } from '../commands/doc'
import { createTable } from '../commands/tables'
import { computePivot, readSource } from '../commands/pivot'
import type { PivotDef } from '../model/extras'

describe('flash fill', () => {
  it('extracts first names', () => {
    const p = learn([{ sources: ['Ada Lovelace'], output: 'Ada' }])!
    expect(apply(p, ['Grace Hopper'])).toBe('Grace')
  })
  it('builds initials and combinations', () => {
    const p = learn([
      { sources: ['Ada Lovelace'], output: 'A. Lovelace' },
      { sources: ['Grace Hopper'], output: 'G. Hopper' },
    ])!
    expect(apply(p, ['Alan Turing'])).toBe('A. Turing')
  })
  it('changes case and joins columns', () => {
    const p = learn([{ sources: ['ada', 'lovelace'], output: 'LOVELACE, ada' }])!
    expect(apply(p, ['alan', 'turing'])).toBe('TURING, alan')
  })
  it('takes the user part of an e-mail address', () => {
    const p = learn([{ sources: ['ada@example.com'], output: 'ada' }])!
    expect(apply(p, ['grace@navy.mil'])).toBe('grace')
  })
})

describe('structured references', () => {
  const t: TableDef = {
    id: 1, name: 'Sales', range: { r1: 0, c1: 0, r2: 10, c2: 2 }, header: true, totals: true, style: 'TableStyleMedium2', bandRows: true, bandCols: false,
    firstCol: false, lastCol: false, filterButton: true, columns: [{ name: 'Region', total: 'none' }, { name: 'Qty', total: 'none' }, { name: 'Unit Price', total: 'sum' }], filters: {},
  }
  it('resolves a column', () => {
    expect(resolveSpec(t, parseSpec('[Qty]')!, 3)).toEqual({ r1: 1, c1: 1, r2: 9, c2: 1 })
  })
  it('resolves this row and specials', () => {
    expect(resolveSpec(t, parseSpec('[@[Unit Price]]')!, 4)).toEqual({ r1: 4, c1: 2, r2: 4, c2: 2 })
    expect(resolveSpec(t, parseSpec('[#Totals]')!, 0)).toEqual({ r1: 10, c1: 0, r2: 10, c2: 2 })
    expect(resolveSpec(t, parseSpec('[[#Headers],[Region]:[Qty]]')!, 0)).toEqual({ r1: 0, c1: 0, r2: 0, c2: 1 })
    expect(resolveSpec(t, parseSpec('[#All]')!, 0)).toEqual({ r1: 0, c1: 0, r2: 10, c2: 2 })
  })
  it('evaluates formulas with table references', () => {
    const doc = new Doc()
    const rows = [['Region', 'Qty'], ['North', 3], ['South', 4], ['East', 5]]
    rows.forEach((row, r) => row.forEach((v, c) => doc.setInput(r, c, String(v))))
    expect(createTable(doc, { r1: 0, c1: 0, r2: 3, c2: 1 }, true)).toBeNull()
    const name = doc.sheet.x.tables[0].name
    doc.setInput(5, 0, `=SUM(${name}[Qty])`)
    expect(doc.value(5, 0)).toBe(12)
    doc.setInput(4, 1, '6')
    // the table grew by one row when typing right below it
    expect(doc.sheet.x.tables[0].range.r2).toBe(4)
    expect(doc.value(5, 0)).toBe(18)
  })
})

describe('charts and helpers', () => {
  it('finds nice axis scales', () => {
    expect(niceScale(0, 87)).toEqual({ min: 0, max: 100, step: 20 })
  })
  it('bins a histogram', () => {
    const h = histogramBins([1, 2, 2, 3, 3, 3, 4, 4, 5])
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(9)
  })
  it('fits a linear trend', () => {
    const t = trend('linear', [[1, 2], [2, 4], [3, 6]])
    expect(t[t.length - 1][1]).toBeCloseTo(6)
  })
  it('subtracts ranges', () => {
    const parts = subtract({ r1: 0, c1: 0, r2: 9, c2: 9 }, [{ r1: 2, c1: 2, r2: 3, c2: 3 }])
    const cells = parts.reduce((n, p) => n + (p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1), 0)
    expect(cells).toBe(96)
  })
  it('shifts ranges on insert and delete', () => {
    expect(shiftRange({ r1: 5, c1: 0, r2: 9, c2: 0 }, 'row', 3, 2)).toEqual({ r1: 7, c1: 0, r2: 11, c2: 0 })
    expect(shiftRange({ r1: 5, c1: 0, r2: 9, c2: 0 }, 'row', 5, -5)).toBeNull()
  })
  it('hashes passwords like the file format', () => {
    expect(passwordHash('test')).toBe('CBEB')
  })
})

describe('pivot tables', () => {
  it('sums values by row field', () => {
    const doc = new Doc()
    const rows = [['Region', 'Item', 'Sales'], ['North', 'A', 10], ['South', 'A', 5], ['North', 'B', 7]]
    rows.forEach((row, r) => row.forEach((v, c) => doc.setInput(r, c, String(v))))
    const p: PivotDef = {
      id: 1, name: 'PivotTable1', source: "'Sheet1'!$A$1:$C$4", r: 0, c: 5, rows: ['Region'], cols: [], values: [{ field: 'Sales', fn: 'sum', showAs: 'normal' }], filters: [],
      grandRows: true, grandCols: true, subtotals: true, layout: 'compact', style: 'TableStyleLight16', bandRows: false, collapsed: [],
    }
    const grid = computePivot(p, readSource(doc, p)!)
    const flat = grid.map((row) => row.map((c) => c.v))
    expect(flat).toContainEqual(['North', 17])
    expect(flat).toContainEqual(['South', 5])
    expect(flat[flat.length - 1]).toEqual(['Grand Total', 22])
  })
})

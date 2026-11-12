// Structure changes (insert/delete rows and columns, sorting, sheets) must keep every sheet extra consistent,
// and undo must restore the exact previous state.
import { describe, expect, it } from 'vitest'
import { Doc } from '../commands/doc'
import { insertDelete, deleteSheet, addSheet, renameSheet, duplicateSheet } from '../commands/ops'
import { createTable } from '../commands/tables'
import { addObject, newChart } from '../commands/objects'
import { toJSON } from '../io/json'
import { CellError } from '../model/types'

function setup(cells: string[][]) {
  const doc = new Doc()
  cells.forEach((row, r) => row.forEach((t, c) => t !== '' && doc.setInput(r, c, t)))
  return doc
}
const val = (doc: Doc, r: number, c: number) => {
  const v = doc.value(r, c)
  return v instanceof CellError ? v.code : v
}
const snapshot = (doc: Doc) => JSON.stringify(toJSON(doc.wb, doc.activeIndex))

describe('insert and delete rows', () => {
  it('moves tables, merges, charts, rules, validation and names', () => {
    const doc = setup([
      ['Region', 'Sales'],
      ['North', '10'],
      ['South', '20'],
      ['East', '30'],
      ['', '=SUM(B2:B4)'],
    ])
    expect(createTable(doc, { r1: 0, c1: 0, r2: 3, c2: 1 }, true)).toBeNull()
    doc.selectRange({ r1: 6, c1: 0, r2: 6, c2: 2 })
    doc.merge('center')
    const chart = newChart(doc, 'column', 'clustered', 'Sheet1!$A$1:$B$4')
    addObject(doc, chart)
    doc.transact('rules', (tx) => {
      tx.noteFull(doc.sheet)
      doc.sheet.x.cf.push({ id: 1, type: 'cellIs', op: 'greaterThan', f1: '15', ranges: [{ r1: 1, c1: 1, r2: 3, c2: 1 }], priority: 1, stop: false, style: { fill: '#ff0000' } })
      doc.sheet.x.validations.push({ id: 2, ranges: [{ r1: 1, c1: 1, r2: 3, c2: 1 }], type: 'whole', op: 'greaterThan', f1: '0', allowBlank: true, dropdown: true, showInput: false, showError: true, errorStyle: 'stop' })
    })
    doc.wb.setName({ name: 'Sales', ref: 'Sheet1!$B$2:$B$4' })
    const before = snapshot(doc)

    insertDelete(doc, 'row', 2, 1)
    const s = doc.sheet
    expect(s.x.tables[0].range).toEqual({ r1: 0, c1: 0, r2: 4, c2: 1 })
    expect(s.merges[0]).toEqual({ r1: 7, c1: 0, r2: 7, c2: 2 })
    expect(s.x.cf[0].ranges[0]).toEqual({ r1: 1, c1: 1, r2: 4, c2: 1 })
    expect(s.x.validations[0].ranges[0]).toEqual({ r1: 1, c1: 1, r2: 4, c2: 1 })
    expect(doc.wb.getName('Sales')!.ref).toBe('Sheet1!$B$2:$B$5')
    const c = s.x.objects.find((o) => o.kind === 'chart')
    expect(c && c.kind === 'chart' && c.source).toBe('Sheet1!$A$1:$B$5')
    expect(doc.inputText(5, 1)).toBe('=SUM(B2:B5)')
    expect(val(doc, 5, 1)).toBe(60)

    doc.undo()
    expect(snapshot(doc)).toBe(before)
    doc.redo()
    insertDelete(doc, 'row', 1, -2)
    expect(doc.inputText(3, 1)).toBe('=SUM(B2:B3)')
    expect(doc.sheet.x.tables[0].range).toEqual({ r1: 0, c1: 0, r2: 2, c2: 1 })
  })

  it('turns references to deleted rows into #REF!', () => {
    const doc = setup([['1'], ['2'], ['=A2*10']])
    insertDelete(doc, 'row', 1, -1)
    expect(doc.inputText(1, 0)).toBe('=#REF!*10')
    expect(val(doc, 1, 0)).toBe('#REF!')
    doc.undo()
    expect(val(doc, 2, 0)).toBe(20)
  })

  it('keeps references on other sheets in step', () => {
    const doc = setup([['5'], ['6']])
    addSheet(doc)
    doc.setInput(0, 0, '=Sheet1!A2+1')
    insertDelete(doc, 'row', 0, 1, doc.wb.sheets[0])
    expect(doc.inputText(0, 0)).toBe('=Sheet1!A3+1')
    expect(val(doc, 0, 0)).toBe(7)
  })
})

describe('sheets', () => {
  it('renames references when a sheet is renamed and duplicates cleanly', () => {
    const doc = setup([['3']])
    addSheet(doc)
    doc.setInput(0, 0, '=Sheet1!A1*2')
    expect(renameSheet(doc, 0, 'My Data')).toBeNull()
    expect(doc.inputText(0, 0)).toBe("='My Data'!A1*2")
    duplicateSheet(doc, 0)
    expect(doc.wb.sheets[1].name).toBe('My Data (2)')
    expect(deleteSheet(doc, 0)).toBeNull()
    expect(doc.inputText(0, 0, doc.wb.sheets.find((s) => s.name === 'Sheet2'))).toBe('=#REF!*2')
  })
})

describe('input parsing', () => {
  it('recognizes numbers, percentages, currency, dates and keeps text', () => {
    const doc = setup([['1,234.5'], ['12%'], ['$1,000'], ['3/5/2024'], ['1e3'], ['(42)'], ['007'], ["'123"], ['TRUE'], ['1/2'], ['0 1/2'], ['12:30'], ['-0']])
    expect([0, 1, 2, 3, 4, 5].map((r) => val(doc, r, 0))).toEqual([1234.5, 0.12, 1000, 45356, 1000, -42])
    expect(val(doc, 6, 0)).toBe(7)
    expect(val(doc, 7, 0)).toBe('123')
    expect(val(doc, 8, 0)).toBe(true)
    expect(val(doc, 9, 0)).toBe(Math.round((Date.UTC(new Date().getFullYear(), 0, 2) - Date.UTC(1899, 11, 30)) / 86400000))
    expect(val(doc, 10, 0)).toBe(0.5)
    expect(val(doc, 11, 0)).toBeCloseTo(12.5 / 24, 10)
    expect(val(doc, 12, 0)).toBe(0)
  })
})

describe('circular references', () => {
  it('reports and recovers', () => {
    const doc = setup([['=A2'], ['=A1']])
    expect(doc.engine.circular.size).toBeGreaterThan(0)
    doc.setInput(1, 0, '5')
    expect(val(doc, 0, 0)).toBe(5)
    expect(doc.engine.circular.size).toBe(0)
  })
})

import { setSizes, setHidden } from '../commands/ops'
describe('floating objects', () => {
  it('move and size with their cells', () => {
    const doc = setup([['1']])
    const chart = newChart(doc, 'column', 'clustered', 'Sheet1!$A$1:$A$1')
    chart.anchor = { x: 64 * 2 + 10, y: 20, w: 64 * 2, h: 100 }
    addObject(doc, chart)
    setSizes(doc, 'col', [0], 164)
    expect(doc.sheet.x.objects[0].anchor.x).toBe(64 * 2 + 10 + 100)
    expect(doc.sheet.x.objects[0].anchor.w).toBe(128)
    setSizes(doc, 'col', [3], 114)
    expect(doc.sheet.x.objects[0].anchor.w).toBe(178)
    setHidden(doc, 'col', [0], true)
    expect(doc.sheet.x.objects[0].anchor.x).toBe(64 + 10)
    doc.undo()
    doc.undo()
    doc.undo()
    expect(doc.sheet.x.objects[0].anchor).toEqual({ x: 138, y: 20, w: 128, h: 100 })
  })
})

describe('3-D references', () => {
  it('aggregate the same cells across a range of sheets', () => {
    const doc = setup([['1']])
    addSheet(doc)
    doc.setInput(0, 0, '2')
    addSheet(doc)
    doc.setInput(0, 0, '3')
    addSheet(doc)
    doc.setInput(0, 0, '=SUM(Sheet1:Sheet3!A1)')
    doc.setInput(1, 0, "=AVERAGE('Sheet1:Sheet3'!A1:A2)")
    doc.setInput(2, 0, '=COUNT(Sheet2:Sheet3!A:A)')
    expect(val(doc, 0, 0)).toBe(6)
    expect(val(doc, 1, 0)).toBe(2)
    expect(val(doc, 2, 0)).toBe(2)
    expect(doc.inputText(1, 0)).toBe('=AVERAGE(Sheet1:Sheet3!A1:A2)')
    doc.setActiveSheet(1)
    doc.setInput(0, 0, '20')
    doc.setActiveSheet(3)
    expect(val(doc, 0, 0)).toBe(24)
    expect(renameSheet(doc, 2, 'Last')).toBeNull()
    expect(doc.inputText(0, 0)).toBe('=SUM(Sheet1:Last!A1)')
    expect(val(doc, 0, 0)).toBe(24)
    expect(deleteSheet(doc, 2)).toBeNull()
    expect(doc.inputText(0, 0)).toBe('=SUM(#REF!)')
  })
})

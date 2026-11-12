// @vitest-environment jsdom
// OpenDocument spreadsheets: formulas convert to and from OpenFormula, and a workbook survives a roundtrip.
import { describe, expect, it } from 'vitest'
import { Doc } from '../commands/doc'
import { exportOds, fromOpenFormula, importOds, toOpenFormula } from '../io/ods'
import { Engine } from '../engine/engine'

describe('.ods', () => {
  it('converts formulas', () => {
    expect(toOpenFormula('SUM(A1:B2,$C$3)*2')).toBe('of:=SUM([.A1:.B2];[.$C$3])*2')
    expect(toOpenFormula("'My Sheet'!A1+Sheet2!B2")).toBe("of:=[$'My Sheet'.A1]+[$Sheet2.B2]")
    expect(fromOpenFormula('of:=SUM([.A1:.B2];[.$C$3])*2')).toBe('SUM(A1:B2,$C$3)*2')
    expect(fromOpenFormula("of:=[$'My Sheet'.A1]+IF([.A1]>1;\"a;b\";0)")).toBe("'My Sheet'!A1+IF(A1>1,\"a;b\",0)")
  })

  it('keeps values, formulas, merges and formatting', async () => {
    const doc = new Doc()
    doc.setInput(0, 0, 'Item')
    doc.setInput(0, 1, 'Price')
    doc.setInput(1, 0, 'Tea')
    doc.setInput(1, 1, '2.5')
    doc.setInput(2, 0, 'Coffee')
    doc.setInput(2, 1, '3')
    doc.setInput(3, 1, '=SUM(B2:B3)')
    doc.setInput(4, 0, '3/14/2025')
    doc.setInput(5, 0, 'TRUE')
    doc.selectRange({ r1: 0, c1: 0, r2: 0, c2: 1 })
    doc.applyStyle({ bold: true, fill: '#FFFF00' }, doc.sel.ranges, 'Bold')
    doc.selectRange({ r1: 7, c1: 0, r2: 7, c2: 2 })
    doc.merge('center')
    const blob = await exportOds(doc.wb, doc.engine)
    const wb = await importOds(await blob.arrayBuffer())
    const engine = new Engine(wb)
    engine.rebuild()
    const s = wb.sheets[0]
    expect(s.name).toBe('Sheet1')
    expect(s.get(0, 0)?.v).toBe('Item')
    expect(s.get(1, 1)?.v).toBe(2.5)
    expect(s.get(3, 1)?.f).toBe('SUM(B2:B3)')
    expect(engine.display(s, 3, 1)).toBe(5.5)
    expect(s.get(4, 0)?.v).toBe(45730)
    expect(s.get(5, 0)?.v).toBe(true)
    expect(wb.styles.get(s.styleId(0, 0))).toMatchObject({ bold: true, fill: '#FFFF00' })
    expect(s.merges).toEqual([{ r1: 7, c1: 0, r2: 7, c2: 2 }])
  })
})

// @vitest-environment jsdom
// Legacy binary workbooks (.xls, .xlsb) survive a roundtrip through SheetJS.
import { describe, expect, it } from 'vitest'
import { Doc } from '../commands/doc'
import { Engine } from '../engine/engine'
import { exportLegacy, importLegacy } from '../io/legacy'

describe('legacy binary formats', () => {
  for (const kind of ['xls', 'xlsb'] as const) {
    it(`keeps values, formula results and merges in .${kind}`, async () => {
      const doc = new Doc()
      doc.setInput(0, 0, 'Item')
      doc.setInput(1, 0, 'Tea')
      doc.setInput(1, 1, '2.5')
      doc.setInput(2, 1, '3')
      doc.setInput(3, 1, '=SUM(B2:B3)')
      doc.selectRange({ r1: 5, c1: 0, r2: 5, c2: 2 })
      doc.merge('merge')
      const blob = await exportLegacy(doc.wb, doc.engine, kind)
      const wb = await importLegacy(await blob.arrayBuffer())
      const engine = new Engine(wb)
      engine.rebuild()
      const s = wb.sheets[0]
      expect(s.name).toBe('Sheet1')
      expect(s.get(0, 0)?.v).toBe('Item')
      expect(s.get(1, 1)?.v).toBe(2.5)
      // the SheetJS community writer stores formula results, not formulas
      expect(engine.display(s, 3, 1)).toBe(5.5)
      expect(s.merges).toEqual([{ r1: 5, c1: 0, r2: 5, c2: 2 }])
    })
  }
})

// @vitest-environment jsdom
// Round trips of the newer .xlsx and AutoSave features: Scale to Fit page counts, data bar axis
// settings, icon set thresholds, macros, change records and object groups.
import { describe, expect, it } from 'vitest'
import { Doc } from '../commands/doc'
import { addRule } from '../commands/cf'
import { fromJSON, toJSON } from '../io/json'

describe('newer features in .xlsx', () => {
  it('keep Scale to Fit page counts', async () => {
    const { exportXlsx, importXlsx } = await import('../io/xlsx')
    const doc = new Doc()
    doc.setInput(0, 0, 'x')
    doc.sheet.page = { ...doc.sheet.page, fitToPage: true, fitWide: 2, fitTall: 3 }
    let wb = await importXlsx(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    expect(wb.sheets[0].page).toMatchObject({ fitToPage: true, fitWide: 2, fitTall: 3 })
    // "one page wide, automatic height"
    doc.sheet.page = { ...doc.sheet.page, fitWide: 1, fitTall: 0 }
    wb = await importXlsx(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    expect(wb.sheets[0].page).toMatchObject({ fitToPage: true, fitWide: 1, fitTall: 0 })
  })

  it('keep data bar axis settings and icon thresholds', async () => {
    const { exportXlsx, importXlsx } = await import('../io/xlsx')
    const doc = new Doc()
    for (let r = 0; r < 5; r++) doc.setInput(r, 0, String(r - 2))
    const ranges = [{ r1: 0, c1: 0, r2: 4, c2: 0 }]
    addRule(doc, { type: 'dataBar', color: '#638EC6', gradient: false, min: { type: 'num', value: -2 }, max: { type: 'percent', value: 90 }, showValue: true, axis: 'middle', negColor: '#FF0000', axisColor: '#00FF00', ranges, stop: false })
    addRule(doc, { type: 'iconSet', set: '3Arrows', reverse: false, showValue: true, thresholds: [{ type: 'num', value: 0 }, { type: 'percentile', value: 75 }], ranges, stop: false })
    const wb = await importXlsx(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    const cf = wb.sheets[0].x.cf
    const bar = cf.find((r) => r.type === 'dataBar')
    const icons = cf.find((r) => r.type === 'iconSet')
    expect(bar).toMatchObject({ axis: 'middle', negColor: '#FF0000', axisColor: '#00FF00', gradient: false })
    expect(bar && 'min' in bar ? bar.min : null).toMatchObject({ type: 'num' })
    expect(icons && 'thresholds' in icons ? icons.thresholds.map((t) => t.type) : null).toEqual(['num', 'percentile'])
  })
})

describe('AutoSave', () => {
  it('keeps macros, change records and object groups', () => {
    const doc = new Doc()
    doc.wb.macros = [{ name: 'Fill', relative: false, origin: { r: 0, c: 0 }, steps: [{ label: 'Typing', cells: [{ r: 0, c: 0, v: 1 }] }] }]
    doc.wb.changes = [{ label: 'Typing', author: 'Me', time: '2026-01-01T00:00:00Z', sheet: 'Sheet1', cells: [{ r: 0, c: 0, old: '', new: '1' }], count: 1 }]
    const back = fromJSON(JSON.parse(JSON.stringify(toJSON(doc.wb, 0))))
    expect(back.macros).toEqual(doc.wb.macros)
    expect(back.changes).toEqual(doc.wb.changes)
  })
})

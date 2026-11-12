// @vitest-environment jsdom
// Paste Special extras, AutoCorrect editing and Inspect Workbook.
import { describe, expect, it } from 'vitest'
import { Doc } from '../commands/doc'
import { DEFAULT_PASTE, copy, pasteInternal } from '../commands/clipboard'
import { setNote } from '../commands/review'
import { setValidation } from '../commands/validation'
import { inspectWorkbook, removeInspected } from '../commands/inspect'
import { autoCorrect, deleteAutoCorrectEntry, setAutoCorrectEntry } from '../model/prefs'

describe('Paste Special extras', () => {
  it('pastes notes only', () => {
    const doc = new Doc()
    doc.setInput(0, 0, 'x')
    setNote(doc, 0, 0, 'hello')
    doc.select({ r: 0, c: 0 })
    copy(doc, false)
    doc.select({ r: 4, c: 2 })
    pasteInternal(doc, { ...DEFAULT_PASTE, what: 'comments' })
    expect(doc.sheet.x.notes[4 * 16384 + 2]?.text).toBe('hello')
    expect(doc.sheet.get(4, 2)).toBeUndefined()
  })

  it('pastes validation and replaces the old rule there', () => {
    const doc = new Doc()
    doc.setInput(0, 0, '1')
    doc.setInput(1, 0, '2')
    doc.selectRange({ r1: 0, c1: 0, r2: 1, c2: 0 })
    setValidation(doc, doc.sel.ranges, { type: 'whole', op: 'between', f1: '1', f2: '9', allowBlank: true, dropdown: true, showInput: false, showError: true, errorStyle: 'stop' })
    doc.selectRange({ r1: 0, c1: 0, r2: 1, c2: 0 })
    copy(doc, false)
    doc.select({ r: 5, c: 1 })
    pasteInternal(doc, { ...DEFAULT_PASTE, what: 'validation' })
    const rules = doc.sheet.x.validations
    expect(rules.length).toBe(2)
    expect(rules[1].ranges).toEqual([{ r1: 5, c1: 1, r2: 6, c2: 1 }])
  })

})

describe('AutoCorrect list', () => {
  it('adds and deletes entries', () => {
    setAutoCorrectEntry('kntr', 'Kontor')
    expect(autoCorrect('kntr ')).toBe('Kontor ')
    deleteAutoCorrectEntry('kntr')
    expect(autoCorrect('kntr ')).toBe('kntr ')
    deleteAutoCorrectEntry('teh')
    expect(autoCorrect('teh ')).toBe('teh ')
    setAutoCorrectEntry('teh', 'the')
    expect(autoCorrect('teh ')).toBe('the ')
  })
})

describe('Inspect Workbook', () => {
  it('finds and removes notes and hidden rows', () => {
    const doc = new Doc()
    doc.setInput(3, 0, 'secret')
    setNote(doc, 0, 0, 'n')
    doc.sheet.rows.hidden.add(3)
    const kinds = inspectWorkbook(doc).map((r) => r.kind)
    expect(kinds).toContain('comments')
    expect(kinds).toContain('hiddenRowsCols')
    removeInspected(doc, 'comments')
    removeInspected(doc, 'hiddenRowsCols')
    expect(inspectWorkbook(doc).map((r) => r.kind)).not.toContain('comments')
    expect(doc.sheet.get(3, 0)).toBeUndefined()
  })
})

describe('pattern and gradient fills', () => {
  it('survive an .xlsx roundtrip', async () => {
    const { exportXlsx, importXlsx } = await import('../io/xlsx')
    const doc = new Doc()
    doc.setInput(0, 0, 'a')
    doc.select({ r: 0, c: 0 })
    doc.applyStyle({ fill: '#FFFF00', pattern: 'darkUp', patternColor: '#FF0000' })
    doc.select({ r: 1, c: 0 })
    doc.applyStyle({ gradient: { kind: 'linear', angle: 90, from: '#FFFFFF', to: '#4472C4' } })
    const wb = await importXlsx(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    const s = wb.sheets[0]
    expect(wb.styles.get(s.styleId(0, 0))).toMatchObject({ fill: '#FFFF00', pattern: 'darkUp', patternColor: '#FF0000' })
    expect(wb.styles.get(s.styleId(1, 0)).gradient).toEqual({ kind: 'linear', angle: 90, from: '#FFFFFF', to: '#4472C4' })
  })
  it('draws pattern tiles', async () => {
    const { patternPixel, fillCss } = await import('../model/fill')
    let on = 0
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (patternPixel('mediumGray', x, y)) on++
    expect(on).toBe(32)
    expect(fillCss({ pattern: 'lightGrid', fill: '#FFFFFF' })).toContain('data:image/svg+xml')
  })
})

describe('Scale to Fit', () => {
  it('fits the used range on the chosen number of pages', async () => {
    const { printScale, computePageBreaks } = await import('../grid/pages')
    const doc = new Doc()
    doc.setInput(199, 29, 'x')
    const s = doc.sheet
    expect(computePageBreaks(s).cols.length).toBeGreaterThan(1)
    s.page = { ...s.page, fitToPage: true, fitWide: 1, fitTall: 1 }
    const scale = printScale(s)
    expect(scale).toBeLessThan(1)
    const b = computePageBreaks(s)
    expect(b.cols.length).toBe(0)
    expect(b.rows.length).toBe(0)
    s.page = { ...s.page, fitWide: 2, fitTall: 0 }
    expect(computePageBreaks(s).cols.length).toBeLessThanOrEqual(2)
  })
})

describe('.xlsx themes', () => {
  it('reads the workbook theme back', async () => {
    const { exportXlsx, importXlsx } = await import('../io/xlsx')
    const { THEMES } = await import('../model/theme')
    const doc = new Doc()
    doc.wb.theme = THEMES[2]
    const wb = await importXlsx(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    expect(wb.theme?.name).toBe(THEMES[2].name)
    expect(wb.theme?.colors.accents).toEqual(THEMES[2].colors.accents)
    expect(wb.theme?.fonts).toEqual(THEMES[2].fonts)
  })
})

describe('Text to Columns data formats', () => {
  it('converts parts by column format', async () => {
    const { convertPart } = await import('../commands/textColumns')
    expect(convertPart('00123', 'text')).toEqual({ v: '00123', fmt: '@' })
    expect(convertPart('14.03.2025', 'DMY')).toEqual({ v: 45730, fmt: 'm/d/yyyy' })
    expect(convertPart('2025-03-14', 'YMD').v).toBe(45730)
    expect(convertPart('42', 'general').v).toBe(42)
  })
})

describe('data bar axis settings', () => {
  it('evaluate and survive an .xlsx roundtrip', async () => {
    const { addRule, cfEvaluator } = await import('../commands/cf')
    const { exportXlsx, importXlsx } = await import('../io/xlsx')
    const doc = new Doc()
    ;['-5', '5', '10'].forEach((v, r) => doc.setInput(r, 0, v))
    addRule(doc, { type: 'dataBar', ranges: [{ r1: 0, c1: 0, r2: 2, c2: 0 }], stop: false, color: '#638EC6', gradient: false, min: { type: 'auto' }, max: { type: 'auto' }, showValue: true, axis: 'middle', negColor: '#FF0000', axisColor: '#0000FF' })
    const ev = cfEvaluator(doc, doc.sheet)!
    const neg = ev(0, 0)!.bar!
    expect(neg.axis).toBe(0.5)
    expect(neg.color).toBe('#FF0000')
    expect(neg.end).toBe(0.5)
    expect(ev(2, 0)!.bar!.end).toBe(1)
    const wb = await importXlsx(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    expect(wb.sheets[0].x.cf[0]).toMatchObject({ type: 'dataBar', axis: 'middle', negColor: '#FF0000', axisColor: '#0000FF' })
  })
})

describe('Consolidate with links and Show Changes', () => {
  it('writes formulas linked to the sources', async () => {
    const { consolidate } = await import('../commands/tools')
    const doc = new Doc()
    ;[['Item', 'Qty'], ['Tea', '2'], ['Coffee', '3'], ['Tea', '5']].forEach((row, r) => row.forEach((t, c) => doc.setInput(r, c, t)))
    doc.select({ r: 0, c: 4 })
    expect(consolidate(doc, ['Sheet1!$A$1:$B$4'], 'sum', true, true, true)).toBeNull()
    expect(doc.sheet.get(1, 5)?.f).toBe('SUM($B$2,$B$4)')
    doc.setInput(1, 1, '10')
    expect(doc.value(1, 5)).toBe(15)
  })
  it('records old and new cell content', () => {
    const doc = new Doc()
    doc.setInput(0, 0, 'a')
    doc.setInput(0, 0, 'b')
    const last = doc.wb.changes[doc.wb.changes.length - 1]
    expect(last.cells[0]).toEqual({ r: 0, c: 0, old: 'a', new: 'b' })
    expect(last.time).toMatch(/^\d{4}-/)
  })
})

describe('macro recorder', () => {
  it('records and replays cell changes, relative to the active cell', async () => {
    const { startRecording, stopRecording, runMacro } = await import('../commands/macros')
    const doc = new Doc()
    doc.select({ r: 0, c: 0 })
    startRecording(doc, 'Fill', true)
    doc.setInput(0, 0, 'Total')
    doc.setInput(0, 1, '=A1&"!"')
    doc.select({ r: 0, c: 0 })
    doc.applyStyle({ bold: true })
    stopRecording(doc)
    expect(doc.wb.macros[0].steps.length).toBe(3)
    doc.select({ r: 5, c: 2 })
    expect(runMacro(doc, 'Fill')).toBeNull()
    expect(doc.value(5, 2)).toBe('Total')
    expect(doc.sheet.get(5, 3)?.f).toBe('C6&"!"')
    expect(doc.style(5, 2).bold).toBe(true)
    doc.undo()
    expect(doc.value(5, 2)).toBeNull()
  })
})

describe('chart data points, data table and templates', () => {
  it('draws point colors and the data table, and keeps them in .xlsx', async () => {
    const { newChart, addObject } = await import('../commands/objects')
    const { chartData } = await import('../charts/chartData')
    const { renderChartSVG } = await import('../charts/renderChart')
    const { exportXlsx, importXlsx } = await import('../io/xlsx')
    const { templateFromChart, templatePatch } = await import('../charts/chartTemplates')
    const doc = new Doc()
    ;[['Item', 'Qty'], ['Tea', '2'], ['Coffee', '3']].forEach((row, r) => row.forEach((t, c) => doc.setInput(r, c, t)))
    const chart = { ...newChart(doc, 'column', 'clustered', 'Sheet1!$A$1:$B$3'), pointColors: { '0:1': '#FF0000' }, dataTable: true }
    addObject(doc, chart)
    const svg = renderChartSVG(chart, chartData(doc.wb, doc.engine, chart), 480, 300)
    expect(svg).toContain('fill="#FF0000"')
    expect(svg).toContain('Coffee')
    const wb = await importXlsx(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    const back = wb.sheets[0].x.objects.find((o) => o.kind === 'chart')
    expect(back).toMatchObject({ pointColors: { '0:1': '#FF0000' }, dataTable: true })
    const tpl = templateFromChart({ ...chart, type: 'line', palette: 3 }, 'Mine')
    expect(templatePatch(chart, tpl)).toMatchObject({ type: 'line', palette: 3, dataTable: true })
  })
})

describe('own table styles in .xlsx', () => {
  it('are written to styles.xml and read back', async () => {
    const { createTable } = await import('../commands/tables')
    const { exportXlsx, importXlsx } = await import('../io/xlsx')
    const doc = new Doc()
    ;[['Item', 'Qty'], ['Tea', '2'], ['Coffee', '3']].forEach((row, r) => row.forEach((t, c) => doc.setInput(r, c, t)))
    doc.wb.tableStyles = [{ name: 'Mine', header: '#112233', headerText: '#FFFFFF', band: '#EEEEEE', border: '#999999', bold: true }]
    createTable(doc, { r1: 0, c1: 0, r2: 2, c2: 1 }, true)
    const t = doc.sheet.x.tables[0]
    t.style = 'Mine'
    const wb = await importXlsx(await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer())
    expect(wb.tableStyles).toEqual([{ name: 'Mine', header: '#112233', headerText: '#FFFFFF', band: '#EEEEEE', border: '#999999', bold: true }])
    expect(wb.sheets[0].x.tables[0].style).toBe('Mine')
  })
})

// @vitest-environment jsdom
// Phase 4 tools: new chart types, Consolidate, Get Data parsing, exponential smoothing, iterative
// calculation and AutoCorrect.
import { describe, expect, it } from 'vitest'
import { Doc } from '../commands/doc'
import { newChart } from '../commands/objects'
import { chartData } from '../charts/chartData'
import { renderChartSVG } from '../charts/renderChart'
import { consolidate, fillJustify, parseDataFile, recommendPivots } from '../commands/tools'
import { detectSeason, etsFit, etsForecast } from '../engine/functions/forecast'
import { autoCorrect } from '../model/prefs'

function sample() {
  const doc = new Doc()
  const rows = [['Stage', 'Count'], ['Visits', '1200'], ['Leads', '640'], ['Offers', '210'], ['Sales', '95']]
  rows.forEach((row, r) => row.forEach((t, c) => doc.setInput(r, c, t)))
  return doc
}

describe('new chart types', () => {
  it('render funnel, treemap and box & whisker charts', () => {
    const doc = sample()
    for (const type of ['funnel', 'treemap', 'boxWhisker'] as const) {
      const chart = newChart(doc, type, 'clustered', 'Sheet1!$A$1:$B$5')
      const svg = renderChartSVG(chart, chartData(doc.wb, doc.engine, chart), 480, 300)
      expect(svg, type).toContain('<rect')
      expect(svg, type).not.toContain('NaN')
    }
  })
})

describe('data tools', () => {
  it('consolidates by labels', () => {
    const doc = new Doc()
    ;[['Item', 'Qty'], ['Tea', '2'], ['Coffee', '3'], ['Tea', '5']].forEach((row, r) => row.forEach((t, c) => doc.setInput(r, c, t)))
    doc.select({ r: 0, c: 4 })
    expect(consolidate(doc, ['Sheet1!$A$1:$B$4'], 'sum', true, true)).toBeNull()
    expect([doc.value(1, 4), doc.value(1, 5), doc.value(2, 4), doc.value(2, 5)]).toEqual(['Tea', 7, 'Coffee', 3])
  })

  it('reads JSON, HTML and CSV data', () => {
    expect(parseDataFile('d.json', '[{"a":1,"b":"x"},{"a":2}]')[0].rows).toEqual([['a', 'b'], ['1', 'x'], ['2', '']])
    expect(parseDataFile('p.html', '<table><tr><th>N</th></tr><tr><td> 5 </td></tr></table>')[0].rows).toEqual([['N'], ['5']])
    expect(parseDataFile('c.csv', 'x;y\n1;2')[0].rows).toEqual([['x', 'y'], ['1', '2']])
  })

  it('recommends PivotTables and justifies text', () => {
    const doc = sample()
    doc.setInput(5, 0, 'Visits')
    expect(recommendPivots(doc, 'Sheet1!$A$1:$B$6')[0].title).toBe('Sum of Count by Stage')
    const d2 = new Doc()
    d2.setInput(0, 0, 'one two three four five six seven eight nine ten eleven twelve')
    d2.selectRange({ r1: 0, c1: 0, r2: 3, c2: 0 })
    expect(fillJustify(d2)).toBeNull()
    expect(String(d2.value(1, 0) ?? '')).not.toBe('')
  })
})

describe('forecasting', () => {
  it('detects a yearly season and continues the trend', () => {
    const ys = Array.from({ length: 36 }, (_, i) => 100 + i * 2 + 15 * Math.sin((2 * Math.PI * i) / 12))
    expect(detectSeason(ys)).toBe(12)
    const m = etsFit(ys, ys.map((_, i) => i + 1), 1)
    if (m instanceof Error || !('alpha' in m)) throw new Error('no model')
    const f = etsForecast(m, 37)
    const truth = 100 + 36 * 2 + 15 * Math.sin((2 * Math.PI * 36) / 12)
    expect(Math.abs(f - truth)).toBeLessThan(8)
  })
})

describe('engine options', () => {
  it('iterates circular references when enabled', () => {
    const doc = new Doc()
    doc.wb.iterate = { on: true, max: 100, change: 0.0001 }
    doc.setInput(0, 0, '=B1/2+1')
    doc.setInput(0, 1, '=A1')
    expect(doc.value(0, 0) as number).toBeCloseTo(2, 3)
  })

  it('corrects common typing mistakes', () => {
    expect(autoCorrect('I recieve ')).toBe('I receive ')
    expect(autoCorrect('(c) ')).toBe('© ')
    expect(autoCorrect('=teh ')).toBe('=teh ')
  })
})

describe('phase 4 push', () => {
  it('splits function calls for the Function Arguments dialog', async () => {
    const { splitCall } = await import('../components/dialogs/FunctionArgsDialog')
    expect(splitCall('=IF(A1>1,SUM(B1:B3),"x,y")', 'IF')).toEqual(['A1>1', 'SUM(B1:B3)', '"x,y"'])
    expect(splitCall('=SUM(1,2)', 'IF')).toBeNull()
  })

  it('saves the theme and the background picture in .xlsx files', async () => {
    const JSZip = (await import('jszip')).default
    const { exportXlsx, importXlsx } = await import('../io/xlsx')
    const { THEMES } = await import('../model/theme')
    const doc = new Doc()
    doc.setInput(0, 0, 'x')
    doc.wb.theme = THEMES[3]
    doc.sheet.page.background = doc.wb.addImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
    const data = await (await exportXlsx(doc.wb, doc.engine)).arrayBuffer()
    const zip = await JSZip.loadAsync(data)
    const theme = await zip.file('xl/theme/theme1.xml')!.async('string')
    expect(theme).toContain(`<a:accent1><a:srgbClr val="${THEMES[3].colors.accents[0].slice(1)}"/></a:accent1>`)
    expect(theme).toContain('name="Ember"')
    expect(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).toMatch(/<picture r:id="rId\d+"\/>/)
    const wb = await importXlsx(data)
    expect(wb.sheets[0].page.background).toBeTruthy()
  })

  it('prints title columns on every horizontal page', async () => {
    const { sheetHtml } = await import('../io/print')
    const doc = new Doc()
    for (let c = 0; c < 30; c++) doc.setInput(0, c, `H${c}`)
    doc.sheet.page.printTitleCols = '$A:$A'
    const html = sheetHtml(doc, doc.sheet)
    const tables = html.split('<table').length - 1
    expect(tables).toBeGreaterThan(1)
    expect((html.match(/>H0</g) ?? []).length).toBe(tables)
  })
})

describe('grouped sheets', () => {
  it('types, formats and undoes on every grouped sheet', async () => {
    const { addSheet } = await import('../commands/ops')
    const doc = new Doc()
    addSheet(doc)
    doc.activeIndex = 0
    doc.group = new Set(doc.wb.sheets.map((s) => s.id))
    doc.setInput(1, 1, '42')
    doc.selectRange({ r1: 1, c1: 1, r2: 1, c2: 1 })
    doc.applyStyle({ bold: true }, doc.sel.ranges, 'Bold')
    for (const s of doc.wb.sheets) {
      expect(s.get(1, 1)?.v).toBe(42)
      expect(doc.wb.styles.get(s.styleId(1, 1)).bold).toBe(true)
    }
    expect(doc.activeIndex).toBe(0)
    doc.undo()
    doc.undo()
    for (const s of doc.wb.sheets) expect(s.get(1, 1)).toBeUndefined()
  })
})

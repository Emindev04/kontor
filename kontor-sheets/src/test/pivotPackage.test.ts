// @vitest-environment jsdom
// PivotTables and slicers in .xlsx files: the cache, PivotTable and slicer parts are written so the
// original program can refresh them, and they read back into the same layout.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { Doc } from '../commands/doc'
import { createTable } from '../commands/tables'
import { createPivot, groupPivotField, updatePivot } from '../commands/pivot'
import { clickSlicerItem, insertSlicers } from '../commands/slicers'
import { exportXlsx, importXlsx } from '../io/xlsx'

async function sample() {
  const doc = new Doc()
  const rows = [
    ['Region', 'Product', 'Units', 'Date'],
    ['North', 'Tea', '10', '1/5/2025'],
    ['South', 'Coffee', '20', '2/9/2025'],
    ['North', 'Coffee', '5', '4/2/2025'],
    ['East', 'Tea', '7', '11/30/2025'],
  ]
  rows.forEach((row, r) => row.forEach((t, c) => doc.setInput(r, c, t)))
  expect(createTable(doc, { r1: 0, c1: 0, r2: 4, c2: 3 }, true)).toBeNull()
  const table = doc.sheet.x.tables[0].name
  insertSlicers(doc, { type: 'table', table }, ['Product'])
  expect(createPivot(doc, 'Sheet1!$A$1:$D$5', { sheet: 'new', r: 0, c: 0 })).toBeNull()
  const pivotSheet = doc.sheet
  const pv = pivotSheet.x.pivots[0]
  updatePivot(doc, pv.id, (p) => {
    p.rows = ['Region', 'Date']
    p.values = [{ field: 'Units', fn: 'sum', showAs: 'normal' }]
    p.filters = [{ field: 'Product', selected: ['Tea'] }]
  })
  groupPivotField(doc, pv.id, 'Date', { kind: 'date', units: ['years', 'months'] })
  insertSlicers(doc, { type: 'pivot', pivot: pv.id }, ['Region'])
  const slicer = pivotSheet.x.objects.find((o) => o.kind === 'slicer')!
  clickSlicerItem(doc, slicer.id, 'North', false)
  const blob = await exportXlsx(doc.wb, doc.engine)
  return { doc, data: await blob.arrayBuffer() }
}

describe('PivotTables and slicers in .xlsx', () => {
  it('writes cache, PivotTable and slicer parts', async () => {
    const { data } = await sample()
    const zip = await JSZip.loadAsync(data)
    const files = Object.keys(zip.files)
    expect(files).toContain('xl/pivotCache/pivotCacheDefinition1.xml')
    expect(files).toContain('xl/pivotCache/pivotCacheRecords1.xml')
    expect(files).toContain('xl/pivotTables/pivotTable1.xml')
    expect(files.filter((f) => /^xl\/slicers\/slicer\d+\.xml$/.test(f)).length).toBe(2)
    expect(files.filter((f) => /^xl\/slicerCaches\/slicerCache\d+\.xml$/.test(f)).length).toBe(2)
    const def = await zip.file('xl/pivotCache/pivotCacheDefinition1.xml')!.async('string')
    expect(def).toContain('refreshOnLoad="1"')
    expect(def).toContain('<worksheetSource ref="A1:D5" sheet="Sheet1"/>')
    expect(def).toMatch(/<cacheField name="Date" numFmtId="14"><sharedItems [^>]*containsDate="1"/)
    expect(def).toContain('groupBy="months"')
    expect(def).toMatch(/<cacheField name="Years" numFmtId="0" databaseField="0"><fieldGroup base="3">/)
    const records = await zip.file('xl/pivotCache/pivotCacheRecords1.xml')!.async('string')
    expect((records.match(/<r>/g) ?? []).length).toBe(4)
    const pt = await zip.file('xl/pivotTables/pivotTable1.xml')!.async('string')
    expect(pt).toContain('<pageFields count="1"><pageField fld="1" item="0" hier="-1"/></pageFields>')
    expect(pt).toContain('<dataField name="Sum of Units" fld="2" baseField="0" baseItem="0"/>')
    expect(pt).toMatch(/<rowFields count="3"><field x="0"\/><field x="4"\/><field x="3"\/><\/rowFields>/)
    const wbXml = await zip.file('xl/workbook.xml')!.async('string')
    expect(wbXml).toMatch(/<pivotCaches><pivotCache cacheId="1" r:id="rId\d+"\/><\/pivotCaches>/)
    expect(wbXml).toContain('<definedName name="Slicer_Product">#N/A</definedName>')
    expect(wbXml).toContain('{BBE1A952-AA13-448e-AADC-164F8A28A991}')
    expect(wbXml).toContain('{46BE6895-7355-4a93-B00E-2C351335B9C9}')
    expect(wbXml.indexOf('<pivotCaches>')).toBeGreaterThan(wbXml.indexOf('<definedNames>'))
    const sheets = (await Promise.all(files.filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async('string')))).join('')
    expect(sheets).toContain('{A8765BA9-456A-4dab-B4F3-ACF838C121DE}')
    expect(sheets).toContain('{3A4CF648-6AED-40f4-86FF-DC5316D8AED3}')
    const cache = (await Promise.all(files.filter((f) => /^xl\/slicerCaches\/.+\.xml$/.test(f)).map((f) => zip.file(f)!.async('string')))).find((x) => x.includes('<tabular'))!
    expect(cache).toMatch(/<i x="0" s="1"\/>/)
    expect((cache.match(/s="1"/g) ?? []).length).toBe(1)
    const drawing = (await Promise.all(files.filter((f) => /^xl\/drawings\/drawing\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async('string')))).join('')
    expect((drawing.match(/<sle:slicer /g) ?? []).length).toBe(2)
  })

  it('keeps the package consistent', async () => {
    const { data } = await sample()
    const zip = await JSZip.loadAsync(data)
    const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir)
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    const defaults = new Set([...ct.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase()))
    const overrides = [...ct.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1].slice(1))
    for (const f of files) if (f !== '[Content_Types].xml') expect(overrides.includes(f) || defaults.has(f.split('.').pop()!.toLowerCase()), `no content type for ${f}`).toBe(true)
    for (const o of overrides) expect(files).toContain(o)
    const parser = new DOMParser()
    for (const f of files.filter((x) => /\.(xml|rels)$/.test(x))) {
      const xml = await zip.file(f)!.async('string')
      expect(parser.parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length, `${f} is not well-formed`).toBe(0)
      if (!f.endsWith('.rels')) continue
      const source = f.replace('_rels/', '').replace(/\.rels$/, '')
      for (const m of xml.matchAll(/Target="([^"]+)"/g)) {
        const parts = source.split('/').slice(0, -1)
        for (const seg of m[1].split('/')) seg === '..' ? parts.pop() : parts.push(seg)
        expect(files, `${f} → ${m[1]}`).toContain(parts.join('/'))
      }
    }
  })

  it('reads them back', async () => {
    const { data } = await sample()
    const wb = await importXlsx(data)
    const p = wb.sheets.flatMap((s) => s.x.pivots)[0]
    expect(p).toBeTruthy()
    expect(p.source).toBe('Sheet1!A1:D5')
    expect(p.rows).toEqual(['Region', 'Years', 'Date'])
    expect(p.values).toEqual([{ field: 'Units', fn: 'sum', name: 'Sum of Units', showAs: 'normal' }])
    expect(p.filters).toEqual([{ field: 'Product', selected: ['Tea'] }])
    expect(p.groups).toEqual({ Date: { kind: 'date', units: ['months', 'years'] } })
    expect(p.slicerFilters).toEqual({ Region: ['North'] })
    const slicers = wb.sheets.flatMap((s) => s.x.objects).filter((o) => o.kind === 'slicer')
    expect(slicers.length).toBe(2)
    const pivotSlicer = slicers.find((s) => s.kind === 'slicer' && s.source.type === 'pivot')
    expect(pivotSlicer && pivotSlicer.kind === 'slicer' && pivotSlicer.selected).toEqual(['North'])
    const tableSlicer = slicers.find((s) => s.kind === 'slicer' && s.source.type === 'table')
    expect(tableSlicer && tableSlicer.kind === 'slicer' && tableSlicer.source).toMatchObject({ type: 'table', column: 'Product' })
  })
})

// Builds a workbook with every kind of content, saves it as .xlsx and checks the package against the
// rules other spreadsheet programs enforce (otherwise they show a "repair" prompt): well-formed XML,
// a content type for every part, existing relationship targets, schema order of worksheet children,
// unique drawing ids and the prefixes newer functions need inside files.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { Doc } from '../commands/doc'
import { createTable } from '../commands/tables'
import { addObject, newChart, newPicture, newShape } from '../commands/objects'
import { addSheet } from '../commands/ops'
import { exportXlsx, exportFormula, importFormula } from '../io/xlsx'
import { cellKey } from '../model/address'
import { passwordHash } from '../model/extras'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** Minimal XML well-formedness check: balanced tags, quoted attributes, valid entities. */
function checkXml(name: string, xml: string) {
  const stack: string[] = []
  let i = 0
  const fail = (msg: string) => {
    throw new Error(`${name}: ${msg} near "${xml.slice(Math.max(0, i - 60), i + 60)}"`)
  }
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    const text = xml.slice(i, lt < 0 ? xml.length : lt)
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) fail('bad entity in text')
    if (lt < 0) break
    i = lt
    if (xml.startsWith('<?', i)) {
      i = xml.indexOf('?>', i) + 2
      continue
    }
    if (xml.startsWith('<!--', i)) {
      i = xml.indexOf('-->', i) + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', i)) {
      i = xml.indexOf(']]>', i) + 3
      continue
    }
    const m = /^<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/.exec(xml.slice(i, i + 20000))
    if (!m) fail('malformed tag')
    const [all, close, tag, attrs, self] = m!
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(attrs)) fail('bad entity in attribute')
    const names = [...attrs.matchAll(/([A-Za-z_][\w.:-]*)\s*=/g)].map((a) => a[1])
    if (new Set(names).size !== names.length) fail(`duplicate attribute on <${tag}>`)
    if (close) {
      if (stack.pop() !== tag) fail(`unexpected </${tag}>`)
    } else if (!self) stack.push(tag)
    i += all.length
  }
  if (stack.length) throw new Error(`${name}: unclosed <${stack.join('> <')}>`)
}

const SHEET_ORDER = [
  'sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState',
  'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup',
  'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture',
  'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst',
]

function topLevelNames(xml: string): string[] {
  const body = xml.slice(xml.indexOf('<worksheet'))
  const out: string[] = []
  let depth = 0
  for (const m of body.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (m[1]) depth--
    else {
      if (depth === 1) out.push(m[2])
      if (!m[3]) depth++
    }
  }
  return out
}

function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

async function buildSample() {
  const doc = new Doc()
  const rows = [
    ['Region', 'Units', 'Price', 'Revenue'],
    ['North', '10', '2.5', '=B2*C2'],
    ['South', '20', '3', '=B3*C3'],
    ['East & West', '15', '4', '=B4*C4'],
  ]
  rows.forEach((row, r) => row.forEach((t, c) => doc.setInput(r, c, t)))
  doc.setInput(6, 0, '=SEQUENCE(3)')
  doc.setInput(6, 1, '=SUM(A7#)')
  doc.setInput(6, 2, '=XLOOKUP("South",A2:A4,D2:D4)')
  doc.setInput(6, 3, '=LET(total,SUM(D2:D4),rate,0.1,total*rate)')
  doc.setInput(6, 4, '=FILTER(A2:A4,B2:B4>12)')
  doc.setInput(6, 5, '=UNIQUE(A2:A4)')
  doc.setInput(6, 6, '=STDEV.S(B2:B4)')
  doc.setInput(6, 7, '=MAP(B2:B4,LAMBDA(x,x*2))')
  doc.setInput(11, 0, 'Note <here> & "there"')
  expect(createTable(doc, { r1: 0, c1: 0, r2: 3, c2: 3 }, true)).toBeNull()
  doc.selectRange({ r1: 12, c1: 0, r2: 12, c2: 2 })
  doc.merge('center')
  const s = doc.sheet
  addObject(doc, newChart(doc, 'column', 'clustered', 'Sheet1!$A$1:$B$4'))
  addObject(doc, newChart(doc, 'pie', 'clustered', 'Sheet1!$A$1:$B$4'))
  addObject(doc, newPicture(doc, doc.wb.addImage(PNG), 40, 40))
  const shape = newShape(doc, 'rect')
  shape.text = 'Hello & <you>'
  addObject(doc, shape)
  doc.transact('extras', (tx) => {
    tx.noteFull(s)
    s.x.cf.push({ id: 900, type: 'cellIs', op: 'greaterThan', f1: '12', ranges: [{ r1: 1, c1: 1, r2: 3, c2: 1 }], priority: 1, stop: false, style: { fill: '#FFC7CE', color: '#9C0006' } })
    s.x.cf.push({ id: 901, type: 'dataBar', color: '#638EC6', gradient: true, min: { type: 'min' }, max: { type: 'max' }, showValue: true, ranges: [{ r1: 1, c1: 3, r2: 3, c2: 3 }], priority: 2, stop: false })
    s.x.validations.push({ id: 902, ranges: [{ r1: 1, c1: 0, r2: 3, c2: 0 }], type: 'list', op: 'between', f1: 'North,South,East & West', allowBlank: true, dropdown: true, showInput: false, showError: true, errorStyle: 'stop' })
    s.x.notes[cellKey(11, 0)] = { text: 'A <note> & more', author: 'Ada', visible: false, w: 140, h: 80 }
    s.x.comments[cellKey(1, 3)] = { resolved: false, items: [{ author: 'Ada', text: 'Check this & that', date: '2026-01-02T10:00:00.000Z' }, { author: 'Grace', text: 'Done <ok>', date: '2026-01-03T11:00:00.000Z' }] }
    s.x.protection = { hash: passwordHash('secret'), allow: { formatCells: true, sort: true } }
    s.x.sparklines.push({ id: 903, group: 1, type: 'line', source: 'Sheet1!B2:C2', r: 1, c: 5, color: '#376092', negColor: '#D00000', markers: false, high: false, low: false, first: false, last: false, negative: false })
    s.x.rowBreaks.push(20)
    s.x.outline.rows[15] = 1
    s.x.outline.rows[16] = 1
  })
  s.freeze = { rows: 1, cols: 0 }
  doc.wb.setName({ name: 'Revenue', ref: 'Sheet1!$D$2:$D$4' })
  addSheet(doc)
  doc.setInput(0, 0, "=Sheet1!D2*2")
  doc.sheet.hidden = false
  const blob = await exportXlsx(doc.wb, doc.engine)
  return { doc, zip: await JSZip.loadAsync(await blob.arrayBuffer()) }
}

describe('formula prefixes', () => {
  it('adds and removes future-function prefixes', () => {
    expect(exportFormula('XLOOKUP(1,A:A,B:B)')).toBe('_xlfn.XLOOKUP(1,A:A,B:B)')
    expect(exportFormula('FILTER(A1:A3,B1:B3>1)')).toBe('_xlfn._xlws.FILTER(A1:A3,B1:B3>1)')
    expect(exportFormula('SORT(A1:A3)')).toBe('_xlfn._xlws.SORT(A1:A3)')
    expect(exportFormula('LET(x,2,x*3)')).toBe('_xlfn.LET(_xlpm.x,2,_xlpm.x*3)')
    expect(exportFormula('LAMBDA(a,b,a+b)(1,2)')).toBe('_xlfn.LAMBDA(_xlpm.a,_xlpm.b,_xlpm.a+_xlpm.b)(1,2)')
    expect(exportFormula('MAP(A1:A3,LAMBDA(v,v*2))')).toBe('_xlfn.MAP(A1:A3,_xlfn.LAMBDA(_xlpm.v,_xlpm.v*2))')
    expect(exportFormula('SUM(A1#)')).toBe('SUM(_xlfn.ANCHORARRAY(A1))')
    expect(exportFormula("SUM('My Sheet'!B2#)")).toBe("SUM(_xlfn.ANCHORARRAY('My Sheet'!B2))")
    expect(exportFormula('@A1:A3')).toBe('_xlfn.SINGLE(A1:A3)')
    expect(exportFormula('STDEV.S(A1:A3)+ERROR.TYPE(A1)')).toBe('_xlfn.STDEV.S(A1:A3)+ERROR.TYPE(A1)')
    expect(exportFormula('SUM(A1:A3)')).toBe('SUM(A1:A3)')
    expect(importFormula('_xlfn.LET(_xlpm.x,2,_xlpm.x*3)')).toBe('LET(x,2,x*3)')
    expect(importFormula('SUM(_xlfn.ANCHORARRAY(A1))')).toBe('SUM(A1#)')
    expect(importFormula('_xlfn.SINGLE(A1:A3)')).toBe('@A1:A3')
    expect(importFormula('_xlfn._xlws.FILTER(A1:A3,B1:B3>1)')).toBe('FILTER(A1:A3,B1:B3>1)')
  })
})

describe('.xlsx package', () => {
  it('is structurally valid', async () => {
    const { zip } = await buildSample()
    const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir)
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    const defaults = new Set([...ct.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase()))
    const overrides = [...ct.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1].slice(1))
    for (const o of overrides) expect(files, `override for missing part ${o}`).toContain(o)
    for (const f of files) {
      if (f === '[Content_Types].xml') continue
      const ext = f.split('.').pop()!.toLowerCase()
      expect(overrides.includes(f) || defaults.has(ext), `no content type for ${f}`).toBe(true)
      if (/\.(xml|rels|vml)$/i.test(f)) checkXml(f, await zip.file(f)!.async('string'))
    }
    // relationships point at existing parts and every r:id used by a part is defined
    for (const f of files.filter((x) => x.endsWith('.rels'))) {
      const rels = await zip.file(f)!.async('string')
      const source = f.replace('_rels/', '').replace(/\.rels$/, '')
      const ids = new Set<string>()
      for (const m of rels.matchAll(/<Relationship ([^>]*)\/>/g)) {
        const id = /Id="([^"]+)"/.exec(m[1])![1]
        expect(ids.has(id), `duplicate ${id} in ${f}`).toBe(false)
        ids.add(id)
        if (/TargetMode="External"/.test(m[1])) continue
        const target = resolve(source, /Target="([^"]+)"/.exec(m[1])![1])
        expect(files, `${f} → ${target}`).toContain(target)
      }
      if (zip.file(source) && /\.xml$/.test(source)) {
        const xml = await zip.file(source)!.async('string')
        for (const m of xml.matchAll(/r:(?:id|embed|link|pict)="([^"]+)"/g)) expect(ids.has(m[1]), `${source} uses undefined ${m[1]}`).toBe(true)
      }
    }
    // worksheet children in schema order
    for (const f of files.filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x))) {
      const names = topLevelNames(await zip.file(f)!.async('string'))
      const idx = names.map((n) => SHEET_ORDER.indexOf(n))
      expect(idx.includes(-1), `${f}: unknown element in ${names.join(',')}`).toBe(false)
      expect(idx, `${f}: order ${names.join(',')}`).toEqual([...idx].sort((a, b) => a - b))
      const once = names.filter((n) => n !== 'conditionalFormatting')
      expect(new Set(once).size, `${f}: repeated elements ${names.join(',')}`).toBe(once.length)
    }
    // unique drawing object ids
    for (const f of files.filter((x) => /^xl\/drawings\/drawing\d+\.xml$/.test(x))) {
      const ids = [...(await zip.file(f)!.async('string')).matchAll(/<xdr:cNvPr id="(\d+)"/g)].map((m) => m[1])
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('writes modern formulas as files from current programs do', async () => {
    const { zip } = await buildSample()
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheet).toContain('_xlfn.XLOOKUP(')
    expect(sheet).toContain('_xlfn._xlws.FILTER(')
    expect(sheet).toContain('_xlfn.LET(_xlpm.total,SUM(D2:D4),_xlpm.rate,0.1,_xlpm.total*_xlpm.rate)')
    expect(sheet).toContain('SUM(_xlfn.ANCHORARRAY(A7))')
    expect(sheet).toContain('_xlfn.STDEV.S(')
    // dynamic arrays: array formula with cell metadata pointing at the dynamic-array property
    expect(sheet).toMatch(/<c r="A7"[^>]* cm="1"[^>]*>\s*<f t="array" ref="A7:A9"[^>]*>_xlfn.SEQUENCE\(3\)<\/f>/)
    expect(sheet).toMatch(/<c r="F7"[^>]* cm="1"/)
    expect(sheet).not.toMatch(/<c r="C7"[^>]* cm="1"/)
    const meta = await zip.file('xl/metadata.xml')?.async('string')
    expect(meta).toContain('XLDAPR')
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect(ct).toContain('/xl/metadata.xml')
    expect(await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).toContain('relationships/sheetMetadata')
  })

  it('writes threaded comments with their persons and legacy notes', async () => {
    const { zip } = await buildSample()
    const files = Object.keys(zip.files)
    const tc = files.find((f) => /^xl\/threadedComments\/threadedComment\d+\.xml$/.test(f))
    expect(tc).toBeTruthy()
    const xml = await zip.file(tc!)!.async('string')
    expect((xml.match(/<threadedComment /g) ?? []).length).toBe(2)
    expect(xml).toContain('parentId=')
    expect(xml).toContain('Check this &amp; that')
    const persons = await zip.file('xl/persons/person.xml')!.async('string')
    expect(persons).toContain('displayName="Ada"')
    expect(persons).toContain('displayName="Grace"')
    const comments = files.find((f) => /^xl\/comments\d+\.xml$/.test(f))!
    const legacy = await zip.file(comments)!.async('string')
    expect(legacy).toMatch(/<author>tc=\{[0-9A-F-]+\}<\/author>/)
    expect(legacy).toContain('A &lt;note&gt; &amp; more')
  })
})

describe('.xlsx roundtrip', () => {
  it('reads back values, formulas and dynamic arrays', async () => {
    const { importXlsx } = await import('../io/xlsx')
    const { Engine } = await import('../engine/engine')
    const { zip } = await buildSample()
    const data = await zip.generateAsync({ type: 'arraybuffer' })
    const wb = await importXlsx(data)
    const engine = new Engine(wb)
    engine.rebuild()
    const s = wb.sheets[0]
    const v = (r: number, c: number) => engine.display(s, r, c)
    expect(s.get(6, 0)?.f).toBe('SEQUENCE(3)')
    expect(s.get(7, 0)).toBeUndefined()
    expect([v(6, 0), v(7, 0), v(8, 0)]).toEqual([1, 2, 3])
    expect(s.get(6, 1)?.f).toBe('SUM(A7#)')
    expect(v(6, 1)).toBe(6)
    expect(s.get(6, 3)?.f).toBe('LET(total,SUM(D2:D4),rate,0.1,total*rate)')
    expect(v(6, 3)).toBeCloseTo(14.5, 10)
    expect(v(7, 4)).toBe('East & West')
    expect(s.get(6, 7)?.f).toBe('MAP(B2:B4,LAMBDA(x,x*2))')
    expect(v(8, 7)).toBe(30)
    expect(wb.sheets[1].get(0, 0)?.f).toBe('Sheet1!D2*2')
  })
})

describe('theme colors', () => {
  it('applies tints on luminance like the original (within rounding)', async () => {
    const { tint } = await import('../io/xlsx')
    const close = (a: string, b: string) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3)
    const cases: [string, number, string][] = [
      ['#4472C4', 0.7999816888943144, '#D9E1F2'], ['#4472C4', -0.249977111117893, '#305496'], ['#ED7D31', 0.3999755851924192, '#F4B084'],
      ['#000000', 0.499984740745262, '#808080'], ['#70AD47', -0.499984740745262, '#375623'], ['#FFC000', 0.7999816888943144, '#FFF2CC'],
    ]
    for (const [base, t, want] of cases) expect(close(tint(base, t), want), `${base} ${t} → ${tint(base, t)}`).toBe(true)
  })
})

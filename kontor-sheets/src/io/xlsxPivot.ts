// PivotTables and slicers in .xlsx packages: pivot caches (definition + records) and PivotTable
// definitions that the original program can refresh, and slicers (2009 extension parts for
// PivotTables, 2010/11 parts for tables).
import { parseRange, rangeName, type Range } from '../model/address'
import type { DateUnit, PivotDef, PivotFn, PivotGroup, PivotShowAs, SlicerObj, TableDef } from '../model/extras'
import { serialToParts } from '../model/dates'
import { classifyFormat } from '../model/numfmt'
import { CellError, type Scalar } from '../model/types'
import type { Sheet } from '../model/sheet'
import type { Workbook } from '../model/workbook'
import type { Engine } from '../engine/engine'
import { makeReader, resolveRef } from '../charts/chartData'
import { US_SYMBOLS } from '../model/numberLocale'
import { fnLabel, groupFieldNames, type PivotSource } from '../commands/pivot'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const NS_X14 = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main'
const NS_X15 = 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
export const REL_PIVOT_TABLE = `${REL}/pivotTable`
export const REL_PIVOT_CACHE = `${REL}/pivotCacheDefinition`
const REL_PIVOT_RECORDS = `${REL}/pivotCacheRecords`
export const REL_SLICER = 'http://schemas.microsoft.com/office/2007/relationships/slicer'
export const REL_SLICER_CACHE = 'http://schemas.microsoft.com/office/2007/relationships/slicerCache'
export const CT_PIVOT_TABLE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml'
export const CT_PIVOT_CACHE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml'
export const CT_PIVOT_RECORDS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml'
export const CT_SLICER = 'application/vnd.ms-excel.slicer+xml'
export const CT_SLICER_CACHE = 'application/vnd.ms-excel.slicerCache+xml'
const EXT_PIVOT_SLICER_LIST = '{A8765BA9-456A-4dab-B4F3-ACF838C121DE}'
const EXT_TABLE_SLICER_LIST = '{3A4CF648-6AED-40f4-86FF-DC5316D8AED3}'
const EXT_WB_PIVOT_SLICERS = '{BBE1A952-AA13-448e-AADC-164F8A28A991}'
const EXT_WB_TABLE_SLICERS = '{46BE6895-7355-4a93-B00E-2C351335B9C9}'

// ---------------------------------------------------------------------
// Cache fields
// ---------------------------------------------------------------------

type Kind = 'string' | 'number' | 'date' | 'bool' | 'error' | 'blank'

/** One cache field: a source column, a date-period field added by grouping, or a calculated field. */
type CacheField = {
  name: string
  /** Index of the source column (database field); -1 for grouping and calculated fields. */
  col: number
  formula?: string
  /** Distinct values in first-seen order (only for fields listed with shared items). */
  items?: Scalar[]
  /** Item texts as the report shows them (formatted like the source cells). */
  labels?: string[]
  itemIndex?: Map<string, number>
  kinds: Set<Kind>
  min?: number
  max?: number
  integer: boolean
  date: boolean
  group?: { base: number; par?: number; xml: string; labels: string[] }
}

const itemKey = (v: Scalar) => (v === null ? '\u0000' : v instanceof CellError ? `#${v.code}` : `${typeof v}:${v}`)

function isoDate(serial: number) {
  const p = serialToParts(serial)
  const pad = (n: number) => String(n).padStart(2, '0')
  const secs = Math.round((serial - Math.floor(serial)) * 86400)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`
}

function isoToSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d):(\d\d))?/.exec(iso)
  if (!m) return null
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  return utc / 86400000 + 25569
}

function valueXml(f: CacheField, v: Scalar): string {
  if (v === null || v === '') return '<m/>'
  if (v instanceof CellError) return `<e v="${esc(v.code)}"/>`
  if (typeof v === 'boolean') return `<b v="${v ? 1 : 0}"/>`
  if (typeof v === 'number') return f.date ? `<d v="${isoDate(v)}"/>` : `<n v="${v}"/>`
  return `<s v="${esc(v)}"/>`
}

function sharedItemsXml(f: CacheField, withItems: boolean): string {
  const k = f.kinds
  const attrs: string[] = []
  const nonText = !k.has('string') && !k.has('bool') && !k.has('error')
  if (nonText && (k.has('number') || k.has('date'))) {
    if (!k.has('blank')) attrs.push('containsSemiMixedTypes="0"')
    attrs.push('containsString="0"')
  }
  const types = ['string', 'number', 'bool', 'error'].filter((t) => k.has(t as Kind)).length + (k.has('date') ? 1 : 0)
  if (types > 1) attrs.push('containsMixedTypes="1"')
  if (f.date && k.has('date')) {
    if (!k.has('number') && !k.has('string')) attrs.push('containsNonDate="0"')
    attrs.push('containsDate="1"')
    if (f.min !== undefined) attrs.push(`minDate="${isoDate(f.min)}"`, `maxDate="${isoDate(f.max!)}"`)
  } else if (k.has('number')) {
    attrs.push('containsNumber="1"')
    if (f.integer) attrs.push('containsInteger="1"')
    if (f.min !== undefined) attrs.push(`minValue="${f.min}"`, `maxValue="${f.max}"`)
  }
  if (k.has('blank')) attrs.push('containsBlank="1"')
  if (!withItems || !f.items) return `<sharedItems${attrs.length ? ' ' + attrs.join(' ') : ''}/>`
  attrs.push(`count="${f.items.length}"`)
  return `<sharedItems ${attrs.join(' ')}>${f.items.map((v) => valueXml(f, v)).join('')}</sharedItems>`
}

const UNIT_ORDER: DateUnit[] = ['years', 'quarters', 'months', 'days']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(serial: number) {
  const p = serialToParts(serial)
  return `${p.m}/${p.d}/${p.y}`
}

/** The group items of a date period, framed by "<start" and ">end" like the original. */
function dateGroupLabels(unit: DateUnit, min: number, max: number): string[] {
  const body: string[] = []
  if (unit === 'years') for (let y = serialToParts(min).y; y <= serialToParts(max).y; y++) body.push(String(y))
  else if (unit === 'quarters') body.push('Qtr1', 'Qtr2', 'Qtr3', 'Qtr4')
  else if (unit === 'months') body.push(...MON)
  else for (let m = 0; m < 12; m++) for (let d = 1; d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m]; d++) body.push(`${d}-${MON[m]}`)
  return [`<${shortDate(Math.floor(min))}`, ...body, `>${shortDate(Math.floor(max) + 1)}`]
}

function numberGroupLabels(g: Extract<PivotGroup, { kind: 'number' }>): string[] {
  const step = g.step > 0 ? g.step : 1
  const whole = Number.isInteger(step) && Number.isInteger(g.start)
  const out = [`<${g.start}`]
  for (let lo = g.start; lo <= g.end && out.length < 5000; lo = Math.round((lo + step) * 1e9) / 1e9) {
    const hi = whole ? lo + step - 1 : Math.round((lo + step) * 1e9) / 1e9
    out.push(`${Math.round(lo * 1e9) / 1e9}-${hi}`)
  }
  out.push(`>${g.end}`)
  return out
}

const groupItemsXml = (labels: string[]) => `<groupItems count="${labels.length}">${labels.map((l) => `<s v="${esc(l)}"/>`).join('')}</groupItems>`

// ---------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------

type BuiltCache = { id: number; fields: CacheField[]; defXml: string; recXml: string; source: { sheet: Sheet; range: Range } }

const SUBTOTAL: Record<PivotFn, string | undefined> = { sum: undefined, count: 'count', average: 'average', max: 'max', min: 'min', product: 'product', countNums: 'countNums', stdDev: 'stdDev', var: 'var' }
const SHOW_AS: Record<PivotShowAs, string | undefined> = { normal: undefined, pctGrand: 'percentOfTotal', pctCol: 'percentOfCol', pctRow: 'percentOfRow' }

export function pivotStyleName(style: string) {
  return /^TableStyle(Light|Medium|Dark)\d+$/.test(style) ? style.replace('TableStyle', 'PivotStyle') : 'PivotStyleLight16'
}

function buildCache(wb: Workbook, engine: Engine, p: PivotDef, id: number, slicerFields: Set<string>): BuiltCache | null {
  const res = resolveRef(wb, p.source)
  if (!res) return null
  const { sheet, range } = res
  const read = makeReader(wb, engine, US_SYMBOLS)
  const r2 = Math.min(range.r2, Math.max(range.r1, sheet.used().r))
  const fields: CacheField[] = []
  for (let c = range.c1; c <= range.c2; c++) {
    const h = read.value(sheet, range.r1, c)
    let name = h === null ? `Column${c - range.c1 + 1}` : h instanceof CellError ? h.code : String(h)
    for (let k = 2; fields.some((f) => f.name === name); k++) name = `${name}${k}`
    const fmt = read.fmt(sheet, Math.min(range.r1 + 1, r2), c)
    fields.push({ name, col: c - range.c1, kinds: new Set(), integer: true, date: !!fmt && classifyFormat(fmt) === 'date' })
  }
  const src: PivotSource = { fields: fields.map((f) => f.name), rows: [], fmts: fields.map(() => undefined) }
  const rowNums: number[] = []
  for (let r = range.r1 + 1; r <= r2; r++) {
    const values: Scalar[] = []
    let any = false
    for (let c = range.c1; c <= range.c2; c++) {
      const v = read.value(sheet, r, c)
      values.push(v)
      if (v !== null) any = true
    }
    if (any) {
      src.rows.push({ values, texts: [] })
      rowNums.push(r)
    }
  }
  // fields that need their items listed: everything in the layout's axes, filters, slicers and groups
  const listed = new Set<string>([...p.rows, ...p.cols, ...p.filters.map((f) => f.field), ...slicerFields, ...Object.keys(p.groups ?? {}), ...Object.keys(p.slicerFilters ?? {})])
  for (const f of fields) {
    for (const row of src.rows) {
      const v = row.values[f.col]
      const kind: Kind = v === null || v === '' ? 'blank' : v instanceof CellError ? 'error' : typeof v === 'number' ? (f.date ? 'date' : 'number') : typeof v === 'boolean' ? 'bool' : 'string'
      f.kinds.add(kind)
      if (typeof v === 'number') {
        f.min = f.min === undefined ? v : Math.min(f.min, v)
        f.max = f.max === undefined ? v : Math.max(f.max, v)
        if (!Number.isInteger(v)) f.integer = false
      }
    }
    if (listed.has(f.name) || f.kinds.has('string') || f.kinds.has('bool') || f.kinds.has('error')) {
      f.items = []
      f.labels = []
      f.itemIndex = new Map()
      src.rows.forEach((row, ri) => {
        const v = row.values[f.col] === '' ? null : row.values[f.col]
        const key = itemKey(v)
        if (!f.itemIndex!.has(key)) {
          f.itemIndex!.set(key, f.items!.length)
          f.items!.push(v)
          f.labels!.push(v === null ? '(blank)' : read.text(sheet, rowNums[ri], range.c1 + f.col))
        }
      })
    }
  }
  // grouping: number ranges and date periods (extra period fields are added after the source fields)
  for (const [field, g] of Object.entries(p.groups ?? {})) {
    const base = fields.findIndex((f) => f.name === field)
    if (base < 0 || fields[base].min === undefined) continue
    const bf = fields[base]
    if (g.kind === 'number') {
      bf.group = { base, labels: numberGroupLabels(g), xml: `<rangePr startNum="${g.start}" endNum="${g.end}" groupInterval="${g.step > 0 ? g.step : 1}"/>` }
      continue
    }
    const units = UNIT_ORDER.filter((u) => g.units.includes(u))
    if (!units.length) continue
    const rangePr = (u: DateUnit) => `<rangePr groupBy="${u}" startDate="${isoDate(Math.floor(bf.min!))}" endDate="${isoDate(Math.floor(bf.max!) + 1)}"/>`
    const finest = units[units.length - 1]
    bf.group = { base, labels: dateGroupLabels(finest, bf.min!, bf.max!), xml: rangePr(finest) }
    const extraNames = groupFieldNames(g)
    const chain = [base]
    units.slice(0, -1).forEach((u, i) => {
      fields.push({ name: extraNames[i], col: -1, kinds: new Set(), integer: true, date: false, group: { base, labels: dateGroupLabels(u, bf.min!, bf.max!), xml: rangePr(u) } })
    })
    // parent chain runs fine → coarse: base, then the extra fields from the finest to the coarsest
    for (let i = fields.length - 1; i >= fields.length - (units.length - 1); i--) chain.push(i)
    for (let i = 0; i < chain.length - 1; i++) fields[chain[i]].group!.par = chain[i + 1]
  }
  for (const cf of p.calcFields ?? []) fields.push({ name: cf.name, col: -1, formula: cf.formula.replace(/^=/, ''), kinds: new Set(), integer: true, date: false })

  const cacheFieldXml = (f: CacheField) => {
    const attrs = `name="${esc(f.name)}" numFmtId="${f.date ? 14 : 0}"${f.formula !== undefined ? ` formula="${esc(f.formula)}" databaseField="0"` : f.col < 0 ? ' databaseField="0"' : ''}`
    const shared = f.col >= 0 ? sharedItemsXml(f, !!f.items) : ''
    const group = f.group ? `<fieldGroup${f.group.par !== undefined ? ` par="${f.group.par}"` : ''} base="${f.group.base}">${f.group.xml}${groupItemsXml(f.group.labels)}</fieldGroup>` : ''
    return shared || group ? `<cacheField ${attrs}>${shared}${group}</cacheField>` : `<cacheField ${attrs}/>`
  }
  const db = fields.filter((f) => f.col >= 0)
  const records = src.rows
    .map((row) => `<r>${db.map((f) => {
      const v = row.values[f.col] === '' ? null : row.values[f.col]
      return f.itemIndex ? `<x v="${f.itemIndex.get(itemKey(v))}"/>` : valueXml(f, v)
    }).join('')}</r>`)
    .join('')
  const sourceRef = `<worksheetSource ref="${rangeName({ ...range, r2 })}" sheet="${esc(sheet.name)}"/>`
  const defXml =
    XML_HEAD +
    `<pivotCacheDefinition xmlns="${MAIN}" xmlns:r="${REL}" r:id="rId1" refreshOnLoad="1" refreshedBy="Kontor Sheets" refreshedDate="${(Date.now() / 86400000 + 25569).toFixed(6)}" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="${src.rows.length}">` +
    `<cacheSource type="worksheet">${sourceRef}</cacheSource>` +
    `<cacheFields count="${fields.length}">${fields.map(cacheFieldXml).join('')}</cacheFields>` +
    `<extLst><ext uri="{725AE2AE-9491-48be-B2B4-4EB974FC3084}" xmlns:x14="${NS_X14}"><x14:pivotCacheDefinition pivotCacheId="${id}"/></ext></extLst>` +
    '</pivotCacheDefinition>'
  const recXml = XML_HEAD + `<pivotCacheRecords xmlns="${MAIN}" xmlns:r="${REL}" count="${src.rows.length}">${records}</pivotCacheRecords>`
  return { id, fields, defXml, recXml, source: { sheet, range } }
}

/** Item texts of a field as the report shows them: group labels or the formatted source values. */
const fieldLabels = (f: CacheField) => f.group?.labels ?? f.labels

function pivotTableXml(p: PivotDef, cache: BuiltCache): string {
  const fields = cache.fields
  const fi = (name: string) => fields.findIndex((f) => f.name === name)
  const visible = new Map<number, Set<string>>()
  for (const f of p.filters) if (f.selected) visible.set(fi(f.field), new Set(f.selected))
  for (const [field, items] of Object.entries(p.slicerFilters ?? {})) visible.set(fi(field), new Set(items))
  const tabular = p.layout === 'tabular'
  const outline = p.layout === 'outline'
  const fieldAttrs = tabular ? ' compact="0" outline="0"' : outline ? ' compact="0"' : ''
  const pivotFields = fields.map((f, i) => {
    const axis = p.rows.includes(f.name) ? 'axisRow' : p.cols.includes(f.name) ? 'axisCol' : p.filters.some((x) => x.field === f.name) ? 'axisPage' : ''
    const isData = p.values.some((v) => v.field === f.name)
    const attrs = [axis && `axis="${axis}"`, isData && 'dataField="1"', 'showAll="0"']
    const vis = visible.get(i)
    if (vis && axis === 'axisPage') attrs.push('multipleItemSelectionAllowed="1"')
    const subtotal = p.subtotals && axis !== 'axisPage'
    if (!subtotal && (axis === 'axisRow' || axis === 'axisCol')) attrs.push('defaultSubtotal="0"')
    const labels = fieldLabels(f)
    let items = ''
    if ((axis || vis) && labels) {
      const list = labels.map((t, x) => `<item${vis && !vis.has(t) ? ' h="1"' : ''} x="${x}"/>`)
      if (subtotal || axis === 'axisPage') list.push('<item t="default"/>')
      items = `<items count="${list.length}">${list.join('')}</items>`
    }
    return `<pivotField${attrs.filter(Boolean).map((a) => ' ' + a).join('')}${fieldAttrs}>${items}</pivotField>`
  })
  const rowFields = p.rows.map(fi).filter((i) => i >= 0)
  const colFields = p.cols.map(fi).filter((i) => i >= 0)
  const vals = p.values.filter((v) => fi(v.field) >= 0)
  if (vals.length > 1) colFields.push(-2)
  const pages = p.filters.filter((f) => fi(f.field) >= 0)
  const top = p.r + (pages.length ? pages.length + 1 : 0)
  const out = p.output ?? { r1: p.r, c1: p.c, r2: p.r + 2, c2: p.c + 2 }
  const loc: Range = { r1: Math.min(top, out.r2), c1: out.c1, r2: Math.max(top, out.r2), c2: out.c2 }
  const firstDataRow = colFields.length ? 2 : 1
  const pageFields = pages.map((f) => {
    const i = fi(f.field)
    const one = f.selected && f.selected.length === 1 ? fieldLabels(fields[i])?.indexOf(f.selected[0]) : -1
    return `<pageField fld="${i}"${one !== undefined && one >= 0 ? ` item="${one}"` : ''} hier="-1"/>`
  })
  const dataFields = vals.map((v) => {
    const sub = SUBTOTAL[v.fn]
    const show = SHOW_AS[v.showAs]
    return `<dataField name="${esc(v.name ?? `${fnLabel(v.fn)} of ${v.field}`)}" fld="${fi(v.field)}"${sub ? ` subtotal="${sub}"` : ''}${show ? ` showDataAs="${show}"` : ''} baseField="0" baseItem="0"/>`
  })
  const attrs = [
    `name="${esc(p.name)}"`, `cacheId="${cache.id}"`, 'applyNumberFormats="0"', 'applyBorderFormats="0"', 'applyFontFormats="0"', 'applyPatternFormats="0"', 'applyAlignmentFormats="0"', 'applyWidthHeightFormats="1"',
    'dataCaption="Values"', 'updatedVersion="6"', 'minRefreshableVersion="3"', 'useAutoFormatting="1"', 'itemPrintTitles="1"', 'createdVersion="6"', 'indent="0"',
    tabular ? 'compact="0" compactData="0" gridDropZones="1"' : outline ? 'compact="0" compactData="0" outline="1" outlineData="1"' : 'outline="1" outlineData="1"',
    p.grandRows ? '' : 'rowGrandTotals="0"', p.grandCols ? '' : 'colGrandTotals="0"', 'multipleFieldFilters="0"',
  ].filter(Boolean)
  return (
    XML_HEAD +
    `<pivotTableDefinition xmlns="${MAIN}" ${attrs.join(' ')}>` +
    `<location ref="${rangeName(loc)}" firstHeaderRow="1" firstDataRow="${firstDataRow}" firstDataCol="1"${pages.length ? ` rowPageCount="${pages.length}" colPageCount="1"` : ''}/>` +
    `<pivotFields count="${pivotFields.length}">${pivotFields.join('')}</pivotFields>` +
    (rowFields.length ? `<rowFields count="${rowFields.length}">${rowFields.map((x) => `<field x="${x}"/>`).join('')}</rowFields>` : '') +
    (colFields.length ? `<colFields count="${colFields.length}">${colFields.map((x) => `<field x="${x}"/>`).join('')}</colFields>` : '') +
    (pageFields.length ? `<pageFields count="${pageFields.length}">${pageFields.join('')}</pageFields>` : '') +
    (dataFields.length ? `<dataFields count="${dataFields.length}">${dataFields.join('')}</dataFields>` : '') +
    (p.style === 'none' ? '' : `<pivotTableStyleInfo name="${pivotStyleName(p.style)}" showRowHeaders="1" showColHeaders="1" showRowStripes="${p.bandRows ? 1 : 0}" showColStripes="0" showLastColumn="1"/>`) +
    '</pivotTableDefinition>'
  )
}

type Zip = { file(path: string, data: string): unknown }

/** Collects pivot caches and slicer caches while the sheets are written, then adds the workbook parts. */
export class PivotPackageWriter {
  private caches: { id: number; part: string }[] = []
  private pivotCaches = new Map<number, BuiltCache>()
  private slicerCaches: { part: string; name: string; table: boolean }[] = []
  private slicerN = 0
  private usedNames = new Set<string>()
  private tableIds = new Map<string, number>()

  constructor(private zip: Zip, private wb: Workbook, private engine: Engine) {
    // tables are numbered in sheet order when they are written; slicers refer to them by that id
    let n = 0
    for (const s of wb.sheets) for (const t of s.x.tables) this.tableIds.set(t.name.toUpperCase(), ++n)
  }

  /** Writes a sheet's PivotTables; returns the relationship targets (relative to the sheet). */
  addPivots(sheet: Sheet, ct: { add: (part: string, type: string) => void }): string[] {
    const targets: string[] = []
    for (const p of sheet.x.pivots) {
      const id = this.caches.length + 1
      const slicerFields = new Set(this.wb.sheets.flatMap((s) => s.x.objects).filter((o): o is SlicerObj => o.kind === 'slicer' && o.source.type === 'pivot' && o.source.pivot === p.id).map((o) => (o.source as { field: string }).field))
      const cache = buildCache(this.wb, this.engine, p, id, slicerFields)
      if (!cache) continue
      const defPart = `xl/pivotCache/pivotCacheDefinition${id}.xml`
      this.zip.file(defPart, cache.defXml)
      this.zip.file(`xl/pivotCache/pivotCacheRecords${id}.xml`, cache.recXml)
      this.zip.file(`xl/pivotCache/_rels/pivotCacheDefinition${id}.xml.rels`, rels([[REL_PIVOT_RECORDS, `pivotCacheRecords${id}.xml`]]))
      ct.add(`/${defPart}`, CT_PIVOT_CACHE)
      ct.add(`/xl/pivotCache/pivotCacheRecords${id}.xml`, CT_PIVOT_RECORDS)
      this.zip.file(`xl/pivotTables/pivotTable${id}.xml`, pivotTableXml(p, cache))
      this.zip.file(`xl/pivotTables/_rels/pivotTable${id}.xml.rels`, rels([[REL_PIVOT_CACHE, `../pivotCache/pivotCacheDefinition${id}.xml`]]))
      ct.add(`/xl/pivotTables/pivotTable${id}.xml`, CT_PIVOT_TABLE)
      this.caches.push({ id, part: `pivotCache/pivotCacheDefinition${id}.xml` })
      this.pivotCaches.set(p.id, cache)
      targets.push(`../pivotTables/pivotTable${id}.xml`)
    }
    return targets
  }

  /**
   * Writes a sheet's slicers: slicer parts (one for PivotTable slicers, one for table slicers),
   * their caches and the drawing frames. Returns what the sheet needs to reference.
   */
  addSlicers(sheet: Sheet, ct: { add: (part: string, type: string) => void }, sheetIds: Map<Sheet, number>) {
    const list = sheet.x.objects.filter((o): o is SlicerObj => o.kind === 'slicer')
    const result: { parts: { target: string; table: boolean }[]; frames: { slicer: SlicerObj; name: string }[] } = { parts: [], frames: [] }
    for (const table of [false, true]) {
      const mine = list.filter((s) => (s.source.type === 'table') === table)
      const entries: string[] = []
      for (const s of mine) {
        const cacheXml = this.slicerCacheXml(s, sheetIds)
        if (!cacheXml) continue
        let cacheName = `Slicer_${(s.source.type === 'table' ? s.source.column : s.source.field).replace(/[^A-Za-z0-9_]/g, '_')}`
        for (let k = 1; this.usedNames.has(cacheName.toUpperCase()); k++) cacheName = cacheName.replace(/\d*$/, '') + k
        this.usedNames.add(cacheName.toUpperCase())
        const n = this.slicerCaches.length + 1
        const part = `slicerCaches/slicerCache${n}.xml`
        this.zip.file(`xl/${part}`, cacheXml.replace('__NAME__', esc(cacheName)))
        ct.add(`/xl/${part}`, CT_SLICER_CACHE)
        this.slicerCaches.push({ part, name: cacheName, table })
        const name = s.name || s.caption
        entries.push(`<slicer name="${esc(name)}" cache="${esc(cacheName)}" caption="${esc(s.caption)}" columnCount="${Math.max(1, s.columns)}" style="SlicerStyleLight1" rowHeight="241300"/>`)
        result.frames.push({ slicer: s, name })
      }
      if (!entries.length) continue
      const k = ++this.slicerN
      const xml = XML_HEAD + `<slicers xmlns="${NS_X14}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" xmlns:x="${MAIN}">${entries.join('')}</slicers>`
      this.zip.file(`xl/slicers/slicer${k}.xml`, xml)
      ct.add(`/xl/slicers/slicer${k}.xml`, CT_SLICER)
      result.parts.push({ target: `../slicers/slicer${k}.xml`, table })
    }
    return result
  }

  private slicerCacheXml(s: SlicerObj, sheetIds: Map<Sheet, number>): string | null {
    const head = `${XML_HEAD}<slicerCacheDefinition xmlns="${NS_X14}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" xmlns:x="${MAIN}" name="__NAME__" sourceName="${esc(s.source.type === 'table' ? s.source.column : s.source.field)}">`
    if (s.source.type === 'table') {
      const src = s.source
      const tableId = this.tableIds.get(src.table.toUpperCase())
      const table = this.wb.sheets.flatMap((x) => x.x.tables).find((t) => t.name.toUpperCase() === src.table.toUpperCase())
      const column = table ? table.columns.findIndex((c) => c.name.toUpperCase() === src.column.toUpperCase()) + 1 : 0
      if (!tableId || column < 1) return null
      return head + `<extLst><x:ext uri="{2F2917AC-EB37-4324-AD4E-5DD8C200BD13}" xmlns:x15="${NS_X15}"><x15:tableSlicerCache tableId="${tableId}" column="${column}"/></x:ext></extLst></slicerCacheDefinition>`
    }
    const src = s.source
    const pivotSheet = this.wb.sheets.find((x) => x.x.pivots.some((p) => p.id === src.pivot))
    const pivot = pivotSheet?.x.pivots.find((p) => p.id === src.pivot)
    const cache = this.pivotCaches.get(src.pivot)
    const field = cache?.fields.find((f) => f.name === src.field)
    const labels = field && fieldLabels(field)
    if (!pivotSheet || !pivot || !cache || !labels) return null
    const items = labels.map((t, x) => `<i x="${x}"${!s.selected || s.selected.includes(t) ? ' s="1"' : ''}/>`).join('')
    return head + `<pivotTables><pivotTable tabId="${sheetIds.get(pivotSheet) ?? 1}" name="${esc(pivot.name)}"/></pivotTables><data><tabular pivotCacheId="${cache.id}"><items count="${labels.length}">${items}</items></tabular></data></slicerCacheDefinition>`
  }

  /** Adds pivotCaches, slicer caches and their defined names to workbook.xml and its relationships. */
  finish(workbookXml: string, wbRels: string): { workbookXml: string; wbRels: string } {
    let w = workbookXml
    let r = wbRels
    const add = (type: string, target: string) => {
      const id = nextRid(r)
      r = r.replace('</Relationships>', `<Relationship Id="rId${id}" Type="${type}" Target="${target}"/></Relationships>`)
      return `rId${id}`
    }
    if (this.caches.length) {
      const el = `<pivotCaches>${this.caches.map((c) => `<pivotCache cacheId="${c.id}" r:id="${add(REL_PIVOT_CACHE, c.part)}"/>`).join('')}</pivotCaches>`
      w = insertWorkbookChild(w, 'pivotCaches', el)
    }
    if (this.slicerCaches.length) {
      const names = this.slicerCaches.map((c) => `<definedName name="${esc(c.name)}">#N/A</definedName>`).join('')
      w = /<definedNames>/.test(w) ? w.replace('</definedNames>', `${names}</definedNames>`) : insertWorkbookChild(w, 'definedNames', `<definedNames>${names}</definedNames>`)
      const pivotIds = this.slicerCaches.filter((c) => !c.table).map((c) => `<x14:slicerCache r:id="${add(REL_SLICER_CACHE, c.part)}"/>`)
      const tableIds = this.slicerCaches.filter((c) => c.table).map((c) => `<x14:slicerCache r:id="${add(REL_SLICER_CACHE, c.part)}"/>`)
      const exts =
        (pivotIds.length ? `<ext uri="${EXT_WB_PIVOT_SLICERS}" xmlns:x14="${NS_X14}"><x14:slicerCaches>${pivotIds.join('')}</x14:slicerCaches></ext>` : '') +
        (tableIds.length ? `<ext uri="${EXT_WB_TABLE_SLICERS}" xmlns:x15="${NS_X15}"><x15:slicerCaches xmlns:x14="${NS_X14}">${tableIds.join('')}</x15:slicerCaches></ext>` : '')
      w = /<extLst>/.test(w) ? w.replace('</extLst>', `${exts}</extLst>`) : w.replace('</workbook>', `<extLst>${exts}</extLst></workbook>`)
    }
    if (!/xmlns:r=/.test(w.slice(0, 800))) w = w.replace('<workbook ', `<workbook xmlns:r="${REL}" `)
    return { workbookXml: w, wbRels: r }
  }

  get hasWorkbookParts() {
    return this.caches.length > 0 || this.slicerCaches.length > 0
  }
}

/** The sheet's extension list entries for its slicer parts. */
export function slicerListExt(parts: { rid: string; table: boolean }[]): string {
  const pivot = parts.filter((p) => !p.table).map((p) => `<x14:slicer r:id="${p.rid}"/>`)
  const table = parts.filter((p) => p.table).map((p) => `<x14:slicer r:id="${p.rid}"/>`)
  return (
    (pivot.length ? `<ext uri="${EXT_PIVOT_SLICER_LIST}" xmlns:x14="${NS_X14}"><x14:slicerList>${pivot.join('')}</x14:slicerList></ext>` : '') +
    (table.length ? `<ext uri="${EXT_TABLE_SLICER_LIST}" xmlns:x15="${NS_X15}"><x14:slicerList xmlns:x14="${NS_X14}">${table.join('')}</x14:slicerList></ext>` : '')
  )
}

/** The drawing frame of a slicer, with a plain shape as fallback for programs without slicers. */
export function slicerFrameXml(name: string, id: number, cx: number, cy: number): string {
  return (
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">' +
    '<mc:Choice xmlns:sle15="http://schemas.microsoft.com/office/drawing/2012/slicer" Requires="sle15">' +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${esc(name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2010/slicer"><sle:slicer xmlns:sle="http://schemas.microsoft.com/office/drawing/2010/slicer" name="${esc(name)}"/></a:graphicData></a:graphic></xdr:graphicFrame>` +
    '</mc:Choice><mc:Fallback>' +
    `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="0" name=""/><xdr:cNvSpPr><a:spLocks noTextEdit="1"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="1"><a:solidFill><a:srgbClr val="7F7F7F"/></a:solidFill></a:ln></xdr:spPr>` +
    '<xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1100"/><a:t>This shape represents a slicer. Slicers need a newer version of the spreadsheet program.</a:t></a:r></a:p></xdr:txBody></xdr:sp>' +
    '</mc:Fallback></mc:AlternateContent>'
  )
}

const WB_ORDER = ['fileVersion', 'fileSharing', 'workbookPr', 'workbookProtection', 'bookViews', 'sheets', 'functionGroups', 'externalReferences', 'definedNames', 'calcPr', 'oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst']

function insertWorkbookChild(xml: string, name: string, el: string): string {
  const order = WB_ORDER.indexOf(name)
  for (const next of WB_ORDER.slice(order + 1)) {
    const m = new RegExp(`<${next}[\\s>/]`).exec(xml)
    if (m) return xml.slice(0, m.index) + el + xml.slice(m.index)
  }
  const end = xml.lastIndexOf('</workbook>')
  return xml.slice(0, end) + el + xml.slice(end)
}

function nextRid(rels: string): number {
  let max = 0
  for (const m of rels.matchAll(/Id="rId(\d+)"/g)) max = Math.max(max, Number(m[1]))
  return max + 1
}

function rels(list: [string, string][]) {
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([type, target], i) => `<Relationship Id="rId${i + 1}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`
}

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

type ReadZip = { file(path: string): { async(type: 'string'): Promise<string> } | null }
type RelsOf = (zip: never, part: string) => Promise<Map<string, { target: string; type: string }>>

const kids = (el: Element | null | undefined, name: string) => (el ? [...el.children].filter((c) => c.localName === name) : [])
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] ?? null
const num = (el: Element | null | undefined, attr: string, def = 0) => (el?.hasAttribute(attr) ? Number(el.getAttribute(attr)) : def)
const flag = (el: Element | null | undefined, attr: string, def: boolean) => (el?.hasAttribute(attr) ? ['1', 'true'].includes(el.getAttribute(attr)!) : def)

export type ReadCache = { fields: { name: string; items: string[]; groupLabels?: string[] }[] }

const FN_FROM: Record<string, PivotFn> = { count: 'count', average: 'average', max: 'max', min: 'min', product: 'product', countNums: 'countNums', stdDev: 'stdDev', var: 'var' }
const SHOW_FROM: Record<string, PivotShowAs> = { percentOfTotal: 'pctGrand', percentOfCol: 'pctCol', percentOfRow: 'pctRow' }

function sharedText(el: Element): string {
  const v = el.getAttribute('v')
  if (el.localName === 'm') return '(blank)'
  if (el.localName === 'b') return v === '1' || v === 'true' ? 'TRUE' : 'FALSE'
  if (el.localName === 'd' && v) {
    const s = isoToSerial(v)
    if (s !== null) {
      const p = serialToParts(s)
      return `${p.m}/${p.d}/${p.y}`
    }
  }
  return v ?? ''
}

/**
 * Reads a PivotTable part (and its cache) into a PivotDef. The report cells were read with the
 * sheet; `output` covers them so the next refresh replaces them.
 */
export async function readPivotTable(zip: ReadZip, relsOf: RelsOf, part: string, parse: (xml: string) => Document, wb: Workbook, sheet: Sheet, tableStyles: (name: string) => boolean): Promise<{ pivot: PivotDef; cache: ReadCache } | null> {
  const xml = await zip.file(part)?.async('string')
  if (!xml) return null
  const root = parse(xml).documentElement
  const prels = await relsOf(zip as never, part)
  const cachePart = [...prels.values()].find((r) => r.type === REL_PIVOT_CACHE)?.target
  const cxml = cachePart ? await zip.file(cachePart)?.async('string') : undefined
  if (!cxml) return null
  const croot = parse(cxml).documentElement
  const ws = kid(kid(croot, 'cacheSource'), 'worksheetSource')
  let source = ''
  if (ws?.getAttribute('ref')) {
    const sname = ws.getAttribute('sheet') ?? sheet.name
    source = `${/^[A-Za-z_][\w.]*$/.test(sname) ? sname : `'${sname.replace(/'/g, "''")}'`}!${ws.getAttribute('ref')}`
  } else if (ws?.getAttribute('name')) source = ws.getAttribute('name')!
  if (!source) return null
  const cfs = kids(kid(croot, 'cacheFields'), 'cacheField')
  const groups: Record<string, PivotGroup> = {}
  const calcFields: { name: string; formula: string }[] = []
  const fields = cfs.map((cf) => {
    const shared = kid(cf, 'sharedItems')
    const fg = kid(cf, 'fieldGroup')
    const groupLabels = fg ? kids(kid(fg, 'groupItems'), 's').map((s) => s.getAttribute('v') ?? '') : undefined
    return { name: cf.getAttribute('name') ?? '', items: shared ? [...shared.children].map(sharedText) : [], groupLabels, el: cf }
  })
  fields.forEach((f, i) => {
    const formula = f.el.getAttribute('formula')
    if (formula) calcFields.push({ name: f.name, formula: `=${formula}` })
    const fg = kid(f.el, 'fieldGroup')
    const rp = kid(fg, 'rangePr')
    if (!fg || !rp) return
    const base = num(fg, 'base', i)
    const baseName = fields[base]?.name
    if (!baseName) return
    const by = rp.getAttribute('groupBy') ?? 'range'
    if (by === 'range') {
      if (base === i) groups[baseName] = { kind: 'number', start: num(rp, 'startNum'), end: num(rp, 'endNum'), step: num(rp, 'groupInterval', 1) }
      return
    }
    const unit = ({ years: 'years', quarters: 'quarters', months: 'months', days: 'days' } as Record<string, DateUnit>)[by]
    if (!unit) return
    const g = groups[baseName]
    groups[baseName] = g && g.kind === 'date' ? { kind: 'date', units: [...new Set([...g.units, unit])] } : { kind: 'date', units: [unit] }
  })
  const label = (i: number, x: number) => (fields[i]?.groupLabels ?? fields[i]?.items ?? [])[x] ?? ''
  const pfs = kids(kid(root, 'pivotFields'), 'pivotField')
  const fieldOf = (x: number) => fields[x]?.name ?? ''
  const rows = kids(kid(root, 'rowFields'), 'field').map((f) => num(f, 'x')).filter((x) => x >= 0).map(fieldOf)
  const cols = kids(kid(root, 'colFields'), 'field').map((f) => num(f, 'x')).filter((x) => x >= 0).map(fieldOf)
  const hiddenOf = (i: number) => {
    const items = kids(kid(pfs[i], 'items'), 'item').filter((it) => it.hasAttribute('x') && !it.hasAttribute('t'))
    const hidden = items.filter((it) => flag(it, 'h', false))
    return hidden.length ? items.filter((it) => !flag(it, 'h', false)).map((it) => label(i, num(it, 'x'))) : null
  }
  const filters = kids(kid(root, 'pageFields'), 'pageField').map((pf) => {
    const i = num(pf, 'fld')
    const one = pf.hasAttribute('item') ? [label(i, num(pf, 'item'))] : null
    return { field: fieldOf(i), selected: one ?? hiddenOf(i) }
  })
  const slicerFilters: Record<string, string[]> = {}
  pfs.forEach((pf, i) => {
    if (pf.getAttribute('axis') === 'axisPage') return
    const vis = hiddenOf(i)
    if (vis) slicerFilters[fieldOf(i)] = vis
  })
  const values = kids(kid(root, 'dataFields'), 'dataField').map((df) => ({
    field: fieldOf(num(df, 'fld')),
    fn: FN_FROM[df.getAttribute('subtotal') ?? ''] ?? 'sum',
    name: df.getAttribute('name') ?? undefined,
    showAs: SHOW_FROM[df.getAttribute('showDataAs') ?? ''] ?? 'normal',
  }))
  const loc = parseRange((kid(root, 'location')?.getAttribute('ref') ?? '').replace(/\$/g, ''))
  if (!loc) return null
  const top = loc.r1 - (filters.length ? filters.length + 1 : 0)
  const compact = flag(root, 'compact', true)
  const styleName = kid(root, 'pivotTableStyleInfo')?.getAttribute('name') ?? ''
  const tableStyle = styleName.replace('PivotStyle', 'TableStyle')
  const pivot: PivotDef = {
    id: wb.newObjectId(),
    name: root.getAttribute('name') ?? 'PivotTable1',
    source,
    r: Math.max(0, top),
    c: loc.c1,
    rows,
    cols,
    values,
    filters,
    grandRows: flag(root, 'rowGrandTotals', true),
    grandCols: flag(root, 'colGrandTotals', true),
    subtotals: !pfs.some((pf) => ['axisRow', 'axisCol'].includes(pf.getAttribute('axis') ?? '') && pf.getAttribute('defaultSubtotal') === '0'),
    layout: compact ? 'compact' : flag(root, 'outline', false) ? 'outline' : 'tabular',
    style: styleName ? (tableStyles(tableStyle) ? tableStyle : 'TableStyleLight16') : 'none',
    bandRows: flag(kid(root, 'pivotTableStyleInfo'), 'showRowStripes', false),
    collapsed: [],
    output: { r1: Math.max(0, top), c1: loc.c1, r2: loc.r2, c2: loc.c2 },
    groups: Object.keys(groups).length ? groups : undefined,
    slicerFilters: Object.keys(slicerFilters).length ? slicerFilters : undefined,
    calcFields: calcFields.length ? calcFields : undefined,
  }
  return { pivot, cache: { fields: fields.map((f) => ({ name: f.name, items: f.items, groupLabels: f.groupLabels })) } }
}

/** A slicer cache read from the package: what it filters and which items are selected. */
export type ReadSlicerCache = { name: string; field: string; pivotName?: string; tableId?: number; column?: number; selectedX?: number[]; total?: number }

export function parseSlicerCache(doc: Document): ReadSlicerCache | null {
  const root = doc.documentElement
  const name = root.getAttribute('name') ?? ''
  const field = root.getAttribute('sourceName') ?? ''
  const pt = kid(kid(root, 'pivotTables'), 'pivotTable')
  const tab = kid(kid(root, 'data'), 'tabular')
  if (pt && tab) {
    const items = kids(kid(tab, 'items'), 'i')
    return { name, field, pivotName: pt.getAttribute('name') ?? '', selectedX: items.filter((i) => flag(i, 's', false)).map((i) => num(i, 'x')), total: items.length }
  }
  const tsc = [...root.getElementsByTagNameNS(NS_X15, 'tableSlicerCache')][0]
  if (tsc) return { name, field, tableId: num(tsc, 'tableId'), column: num(tsc, 'column') }
  return null
}

/** Builds slicer objects from the slicer parts of a sheet and the frames in its drawing. */
export function slicersFromParts(
  slicerEls: Element[],
  caches: Map<string, ReadSlicerCache>,
  frames: Map<string, { x: number; y: number; w: number; h: number }>,
  ctx: { pivots: { pivot: PivotDef; cache: ReadCache }[]; tablesById: Map<number, TableDef>; newId: () => number },
): SlicerObj[] {
  const out: SlicerObj[] = []
  for (const el of slicerEls) {
    const name = el.getAttribute('name') ?? ''
    const cache = caches.get(el.getAttribute('cache') ?? '')
    const anchor = frames.get(name)
    if (!cache || !anchor) continue
    const base = { kind: 'slicer' as const, id: ctx.newId(), name, anchor, caption: el.getAttribute('caption') ?? cache.field, columns: Math.max(1, num(el, 'columnCount', 1)), color: '#5B9BD5' }
    if (cache.pivotName !== undefined) {
      const hit = ctx.pivots.find((p) => p.pivot.name === cache.pivotName)
      if (!hit) continue
      const f = hit.cache.fields.find((x) => x.name === cache.field)
      const labels = f?.groupLabels ?? f?.items ?? []
      const all = !cache.selectedX || cache.selectedX.length === cache.total
      out.push({ ...base, source: { type: 'pivot', pivot: hit.pivot.id, field: cache.field }, selected: all ? null : cache.selectedX!.map((x) => labels[x]).filter((t) => t !== undefined) })
    } else if (cache.tableId !== undefined) {
      const t = ctx.tablesById.get(cache.tableId)
      const col = t?.columns[(cache.column ?? 1) - 1]
      if (!t || !col) continue
      const f = t.filters[(cache.column ?? 1) - 1]
      out.push({ ...base, source: { type: 'table', table: t.name, column: col.name }, selected: f && f.kind === 'values' ? [...f.values] : null })
    }
  }
  return out
}

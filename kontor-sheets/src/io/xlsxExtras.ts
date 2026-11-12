// .xlsx support for sheet extras. ExcelJS handles conditional formats, data validation, notes and
// outlines; drawings (charts, pictures, shapes), tables, filters, protection, page breaks and
// sparklines are written into / read from the package directly with JSZip.
import type * as EJ from 'exceljs'
import type JSZipType from 'jszip'
import { MAX_COLS, cellKey, colName, keyCol, keyRow, parseRange, rangeName, type Range } from '../model/address'
import type {
  Anchor, CFRule, CFStyle, CFValue, CellOp, ChartDef, CommentThread, ChartSeries, ChartType, FilterSpec, IconSetId, PictureObj, ShapeObj, SheetObject, Sparkline, TableDef, TotalFn, Validation,
} from '../model/extras'
import type { Sheet } from '../model/sheet'
import type { Workbook } from '../model/workbook'
import type { Engine } from '../engine/engine'
import { chartData, chartSeries } from '../charts/chartData'
import { seriesColors } from '../charts/renderChart'
import { tableRows } from '../engine/structured'
import { isArrayFormula } from './formulaText'
import {
  PivotPackageWriter, REL_PIVOT_TABLE, REL_SLICER, REL_SLICER_CACHE, NS_X14, parseSlicerCache, readPivotTable, slicerFrameXml, slicerListExt, slicersFromParts,
  type ReadCache, type ReadSlicerCache,
} from './xlsxPivot'
import type { PivotDef, SlicerObj } from '../model/extras'

type ExcelModule = typeof EJ

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const hex6 = (c: string | null | undefined) => (c ?? '#000000').replace('#', '').toUpperCase().slice(0, 6).padEnd(6, '0')
const argb = (c: string) => ({ argb: 'FF' + hex6(c) })
const rangeText = (r: Range) => rangeName(r)

async function loadZip(): Promise<typeof JSZipType> {
  const mod = (await import('jszip')) as unknown as { default?: typeof JSZipType } & typeof JSZipType
  return mod.default ?? mod
}

// =====================================================================
// Export, part 1: features ExcelJS writes for us
// =====================================================================

const OP_TO_EJ: Record<CellOp, string> = {
  greaterThan: 'greaterThan', lessThan: 'lessThan', between: 'between', notBetween: 'notBetween', equal: 'equal', notEqual: 'notEqual',
  greaterThanOrEqual: 'greaterThanOrEqual', lessThanOrEqual: 'lessThanOrEqual',
}

function dxf(st: CFStyle | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!st) return out
  if (st.fill) out.fill = { type: 'pattern', pattern: 'solid', bgColor: argb(st.fill), fgColor: argb(st.fill) }
  const font: Record<string, unknown> = {}
  if (st.color) font.color = argb(st.color)
  if (st.bold) font.bold = true
  if (st.italic) font.italic = true
  if (st.underline) font.underline = true
  if (st.strike) font.strike = true
  if (Object.keys(font).length) out.font = font
  if (st.border) {
    const b = { style: 'thin', color: argb(st.border) }
    out.border = { top: b, bottom: b, left: b, right: b }
  }
  if (st.fmt) out.numFmt = st.fmt
  return out
}

function cfvo(v: CFValue): Record<string, unknown> {
  const type = v.type === 'auto' ? (v.value === 'max' ? 'max' : 'min') : v.type
  return v.value !== undefined && type !== 'min' && type !== 'max' ? { type, value: v.value } : { type }
}

function cfToExcel(r: CFRule): Record<string, unknown> | null {
  const tl = r.ranges[0] ? `${colName(r.ranges[0].c1)}${r.ranges[0].r1 + 1}` : 'A1'
  const all = r.ranges.map((x) => `$${colName(x.c1)}$${x.r1 + 1}:$${colName(x.c2)}$${x.r2 + 1}`).join(',')
  const base = { priority: r.priority, style: dxf(r.style) }
  switch (r.type) {
    case 'cellIs': return { ...base, type: 'cellIs', operator: OP_TO_EJ[r.op], formulae: r.op === 'between' || r.op === 'notBetween' ? [r.f1, r.f2 ?? '0'] : [r.f1] }
    case 'expression': return { ...base, type: 'expression', formulae: [r.formula] }
    case 'text': {
      if (r.op === 'contains') return { ...base, type: 'containsText', operator: 'containsText', text: r.text }
      if (r.op === 'notContains') return { ...base, type: 'containsText', operator: 'notContainsText', text: r.text, formulae: [`ISERROR(SEARCH("${r.text.replace(/"/g, '""')}",${tl}))`] }
      if (r.op === 'beginsWith') return { ...base, type: 'containsText', operator: 'beginsWith', text: r.text, formulae: [`LEFT(${tl},${r.text.length})="${r.text.replace(/"/g, '""')}"`] }
      return { ...base, type: 'containsText', operator: 'endsWith', text: r.text, formulae: [`RIGHT(${tl},${r.text.length})="${r.text.replace(/"/g, '""')}"`] }
    }
    case 'date':
      if (['yesterday', 'today', 'tomorrow', 'last7Days', 'lastWeek', 'thisWeek', 'nextWeek', 'lastMonth', 'thisMonth', 'nextMonth'].includes(r.period)) return { ...base, type: 'timePeriod', timePeriod: r.period }
      return null
    case 'duplicate': return { ...base, type: 'expression', formulae: [`COUNTIF(${all.split(',')[0]},${tl})>1`] }
    case 'unique': return { ...base, type: 'expression', formulae: [`COUNTIF(${all.split(',')[0]},${tl})=1`] }
    case 'top': return { ...base, type: 'top10', rank: r.rank, percent: r.percent, bottom: r.bottom }
    case 'average': return { ...base, type: 'aboveAverage', aboveAverage: r.above }
    case 'blanks': return { ...base, type: 'containsText', operator: 'containsBlanks' }
    case 'noBlanks': return { ...base, type: 'containsText', operator: 'notContainsBlanks' }
    case 'errors': return { ...base, type: 'containsText', operator: 'containsErrors' }
    case 'noErrors': return { ...base, type: 'containsText', operator: 'notContainsErrors' }
    case 'dataBar':
      return { priority: r.priority, type: 'dataBar', cfvo: [cfvo(r.min.type === 'auto' ? { type: 'min' } : r.min), cfvo(r.max.type === 'auto' ? { type: 'max' } : r.max)], color: argb(r.color), gradient: r.gradient, showValue: r.showValue, border: !!r.border, minLength: 0, maxLength: 100 }
    case 'colorScale': return { priority: r.priority, type: 'colorScale', cfvo: r.stops.map((s) => cfvo(s.v)), color: r.stops.map((s) => argb(s.color)) }
    case 'iconSet': return { priority: r.priority, type: 'iconSet', iconSet: r.set, reverse: r.reverse, showValue: r.showValue, cfvo: [{ type: 'percent', value: 0 }, ...r.thresholds.map(cfvo)] }
  }
}

const VAL_TYPE: Record<Validation['type'], string> = { any: 'any', whole: 'whole', decimal: 'decimal', list: 'list', date: 'date', time: 'time', textLength: 'textLength', custom: 'custom' }

function validationFormula(v: Validation, f: string | undefined): string | undefined {
  if (f === undefined) return undefined
  if (v.type === 'list' && !f.startsWith('=')) return `"${f.replace(/"/g, '""')}"`
  if (f.startsWith('=')) return f.slice(1)
  if (v.type === 'date' || v.type === 'time') {
    const n = Number(f)
    if (Number.isFinite(n)) return f
    const d = Date.parse(f)
    if (!Number.isNaN(d)) {
      const serial = (d - Date.UTC(1899, 11, 30) - new Date(d).getTimezoneOffset() * -60000) / 86400000
      return String(Math.round(serial * 1e6) / 1e6)
    }
  }
  return f
}

/** Adds conditional formats, validation, notes, comments and outlines to an ExcelJS worksheet. */
export function writeWithExcelJS(ws: EJ.Worksheet, sheet: Sheet) {
  const x = sheet.x
  for (const r of [...x.cf].sort((a, b) => a.priority - b.priority)) {
    const rule = cfToExcel(r)
    if (!rule) continue
    try {
      ws.addConditionalFormatting({ ref: r.ranges.map(rangeText).join(' '), rules: [rule as unknown as EJ.ConditionalFormattingRule] })
    } catch {
      // skip rules the writer cannot express
    }
  }
  const dv = (ws as unknown as { dataValidations: { add: (addr: string, v: unknown) => void } }).dataValidations
  for (const v of x.validations) {
    const model = {
      type: VAL_TYPE[v.type],
      operator: v.type === 'list' || v.type === 'custom' || v.type === 'any' ? undefined : OP_TO_EJ[v.op],
      allowBlank: v.allowBlank,
      showInputMessage: v.showInput,
      promptTitle: v.inputTitle || undefined,
      prompt: v.inputMessage || undefined,
      showErrorMessage: v.showError,
      errorStyle: v.errorStyle === 'stop' ? 'error' : v.errorStyle,
      errorTitle: v.errorTitle || undefined,
      error: v.errorMessage || undefined,
      formulae: [validationFormula(v, v.f1), validationFormula(v, v.f2)].filter((f): f is string => f !== undefined),
    }
    if (v.type === 'list' && !v.dropdown) (model as Record<string, unknown>).showDropDown = true
    for (const rg of v.ranges) {
      try {
        dv.add(rangeText(rg), model)
      } catch {
        for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + 2000); r++) for (let c = rg.c1; c <= rg.c2; c++) ws.getCell(r + 1, c + 1).dataValidation = model as EJ.DataValidation
      }
    }
  }
  const notes = new Map<number, string>()
  for (const [k, n] of Object.entries(x.notes)) notes.set(Number(k), `${n.author}:\n${n.text}`)
  // threaded comments also get a legacy note (programs without threaded comments show that one);
  // postProcess writes the threaded comment parts next to it
  for (const [k, t] of Object.entries(x.comments)) if (t.items.length) notes.set(Number(k), legacyThreadText(t))
  for (const [k, text] of notes) ws.getCell(keyRow(k) + 1, keyCol(k) + 1).note = text
  for (const [k, lvl] of Object.entries(x.outline.rows)) ws.getRow(Number(k) + 1).outlineLevel = lvl
  for (const [k, lvl] of Object.entries(x.outline.cols)) ws.getColumn(Number(k) + 1).outlineLevel = lvl
  if (Object.keys(x.outline.rows).length || Object.keys(x.outline.cols).length)
    ws.properties.outlineProperties = { summaryBelow: x.outline.summaryBelow, summaryRight: x.outline.summaryRight }
}

// =====================================================================
// Export, part 2: package parts written directly
// =====================================================================

const SHEET_ORDER = [
  'sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState',
  'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup',
  'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture',
  'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst',
]

/** Top-level children of the <worksheet> element: name and [start, end) offsets. */
export function topLevel(xml: string): { name: string; start: number; end: number }[] {
  const out: { name: string; start: number; end: number }[] = []
  let depth = 0
  let i = 0
  let cur: { name: string; start: number } | null = null
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    if (lt < 0) break
    const gt = xml.indexOf('>', lt)
    if (gt < 0) break
    const tag = xml.slice(lt + 1, gt)
    i = gt + 1
    if (tag.startsWith('?') || tag.startsWith('!')) continue
    if (tag.startsWith('/')) {
      depth--
      if (depth === 1 && cur) {
        out.push({ ...cur, end: i })
        cur = null
      }
      continue
    }
    const selfClosing = tag.endsWith('/')
    const name = tag.split(/[\s/]/)[0]
    if (depth === 1) {
      if (selfClosing) out.push({ name, start: lt, end: i })
      else cur = { name, start: lt }
    }
    if (!selfClosing) depth++
  }
  return out
}

/** Inserts (or replaces) a top-level worksheet element at its schema position. */
export function placeElement(xml: string, name: string, el: string): string {
  const items = topLevel(xml)
  const existing = items.find((t) => t.name === name)
  if (existing) {
    if (name === 'extLst') {
      // merge our <ext> children into the existing list
      const inner = el.replace(/^<extLst>/, '').replace(/<\/extLst>$/, '')
      const close = xml.lastIndexOf('</extLst>', existing.end)
      return xml.slice(0, close) + inner + xml.slice(close)
    }
    return xml.slice(0, existing.start) + el + xml.slice(existing.end)
  }
  const order = SHEET_ORDER.indexOf(name)
  const next = items.find((t) => SHEET_ORDER.indexOf(t.name) > order)
  const pos = next ? next.start : xml.lastIndexOf('</worksheet>')
  return xml.slice(0, pos) + el + xml.slice(pos)
}

const EMU = 9525

function toCellPos(sheet: Sheet, px: number, py: number) {
  const c = sheet.cols.indexAt(Math.max(0, px))
  const r = sheet.rows.indexAt(Math.max(0, py))
  return { c, r, dx: Math.max(0, Math.round((px - sheet.cols.offset(c)) * EMU)), dy: Math.max(0, Math.round((py - sheet.rows.offset(r)) * EMU)) }
}

function anchorXml(sheet: Sheet, a: Anchor, inner: string) {
  const x1 = Math.min(a.x, a.x + a.w)
  const y1 = Math.min(a.y, a.y + a.h)
  const f = toCellPos(sheet, x1, y1)
  const t = toCellPos(sheet, x1 + Math.abs(a.w), y1 + Math.abs(a.h))
  const pos = (p: ReturnType<typeof toCellPos>) => `<xdr:col>${p.c}</xdr:col><xdr:colOff>${p.dx}</xdr:colOff><xdr:row>${p.r}</xdr:row><xdr:rowOff>${p.dy}</xdr:rowOff>`
  return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${pos(f)}</xdr:from><xdr:to>${pos(t)}</xdr:to>${inner}<xdr:clientData/></xdr:twoCellAnchor>`
}

const xfrm = (a: Anchor, rot = 0) =>
  `<a:xfrm${rot ? ` rot="${Math.round(rot * 60000)}"` : ''}${a.w < 0 ? ' flipH="1"' : ''}${a.h < 0 ? ' flipV="1"' : ''}><a:off x="0" y="0"/><a:ext cx="${Math.round(Math.abs(a.w) * EMU)}" cy="${Math.round(Math.abs(a.h) * EMU)}"/></a:xfrm>`

const solid = (c: string) => `<a:solidFill><a:srgbClr val="${hex6(c)}"/></a:solidFill>`

function shapeXml(o: ShapeObj, id: number) {
  const prst = o.shape === 'doubleArrowLine' ? 'straightConnector1' : o.shape
  const ends = o.shape === 'straightConnector1' ? '<a:tailEnd type="triangle"/>' : o.shape === 'doubleArrowLine' ? '<a:headEnd type="triangle"/><a:tailEnd type="triangle"/>' : ''
  const lines = (o.text || '').split('\n')
  const algn = o.align === 'center' ? 'ctr' : o.align === 'right' ? 'r' : 'l'
  const paras = lines
    .map((ln) => `<a:p><a:pPr algn="${algn}"/>${ln ? `<a:r><a:rPr lang="en-US" sz="${Math.round(o.fontSize * 100)}"${o.bold ? ' b="1"' : ''}${o.italic ? ' i="1"' : ''}>${solid(o.textColor)}</a:rPr><a:t>${esc(ln)}</a:t></a:r>` : `<a:endParaRPr lang="en-US" sz="${Math.round(o.fontSize * 100)}"/>`}</a:p>`)
    .join('')
  const anchor = o.vAlign === 'top' ? 't' : o.vAlign === 'bottom' ? 'b' : 'ctr'
  return `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${esc(o.name)}"/><xdr:cNvSpPr${o.textBox ? ' txBox="1"' : ''}/></xdr:nvSpPr><xdr:spPr>${xfrm(o.anchor, o.rotation)}<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${o.fill ? solid(o.fill) : '<a:noFill/>'}<a:ln w="${Math.round(o.lineWidth * 12700)}">${o.line ? solid(o.line) : '<a:noFill/>'}${ends}</a:ln></xdr:spPr><xdr:txBody><a:bodyPr vertOverflow="clip" wrap="square" rtlCol="0" anchor="${anchor}"/><a:lstStyle/>${paras}</xdr:txBody></xdr:sp>`
}

function pictureXml(o: PictureObj, id: number, rid: string) {
  return `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${esc(o.name)}"${o.alt ? ` descr="${esc(o.alt)}"` : ''}/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr>${xfrm(o.anchor, o.rotation)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${o.border ? `<a:ln w="19050">${solid(o.border)}</a:ln>` : ''}</xdr:spPr></xdr:pic>`
}

function chartFrameXml(o: ChartDef, id: number, rid: string) {
  return `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${esc(o.name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame>`
}

function richText(text: string, size = 1400, color?: string) {
  return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="0"${color ? '' : ''}/></a:pPr><a:r><a:rPr lang="en-US" sz="${size}" b="0"/><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx>`
}

function refOrLit(f: string | undefined, kind: 'str' | 'num', cache: (string | number | null)[]): string {
  const pts = cache.map((v, i) => (v === null || v === '' ? '' : `<c:pt idx="${i}"><c:v>${esc(String(v))}</c:v></c:pt>`)).join('')
  if (f && /!/.test(f)) {
    const tag = kind === 'str' ? 'strRef' : 'numRef'
    const c = kind === 'str' ? 'strCache' : 'numCache'
    return `<c:${tag}><c:f>${esc(f.replace(/^=/, ''))}</c:f><c:${c}>${kind === 'num' ? '<c:formatCode>General</c:formatCode>' : ''}<c:ptCount val="${cache.length}"/>${pts}</c:${c}></c:${tag}>`
  }
  return kind === 'str' ? `<c:strLit><c:ptCount val="${cache.length}"/>${pts}</c:strLit>` : `<c:numLit><c:ptCount val="${cache.length}"/>${pts}</c:numLit>`
}

const TREND: Record<string, string> = { linear: 'linear', exponential: 'exp', logarithmic: 'log', movingAverage: 'movingAvg' }

const ERRBAR_TYPE = { stdErr: 'stdErr', percent: 'percentage', stdDev: 'stdDev', fixed: 'fixedVal' } as const

function seriesXml(chart: ChartDef, s: ChartSeries, i: number, data: ReturnType<typeof chartData>, color: string, kind: 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'radar') {
  const d = data.series[i]
  const name = s.name && /!/.test(s.name) ? `<c:tx>${refOrLit(s.name, 'str', [d?.name ?? ''])}</c:tx>` : `<c:tx><c:v>${esc(d?.name ?? `Series${i + 1}`)}</c:v></c:tx>`
  let sp = ''
  if (kind === 'line' || kind === 'scatter' || kind === 'radar') sp = `<c:spPr><a:ln w="28575" cap="rnd">${solid(color)}<a:round/></a:ln></c:spPr>`
  else if (kind !== 'pie') sp = `<c:spPr>${solid(color)}</c:spPr>`
  const marker = kind === 'line' || kind === 'scatter' || kind === 'radar' ? (chart.markers ? `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${solid(color)}</c:spPr></c:marker>` : '<c:marker><c:symbol val="none"/></c:marker>') : ''
  const pts = kind === 'pie' ? seriesColors(chart, data.categories.length).map((c, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr>${solid(c)}<a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('') : ''
  const trend = s.trendline && kind !== 'pie' && kind !== 'radar' ? `<c:trendline><c:spPr><a:ln w="19050">${solid(color)}<a:prstDash val="sysDash"/></a:ln></c:spPr><c:trendlineType val="${TREND[s.trendline]}"/>${s.trendline === 'movingAverage' ? '<c:period val="2"/>' : ''}<c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>` : ''
  const cats = data.categories
  const catXml = kind === 'scatter'
    ? `<c:xVal>${refOrLit(s.categories, 'num', d?.xs ?? cats.map((_, j) => j + 1))}</c:xVal>`
    : s.categories ? `<c:cat>${refOrLit(s.categories, 'str', cats)}</c:cat>` : ''
  const valXml = kind === 'scatter' ? `<c:yVal>${refOrLit(s.values, 'num', d?.values ?? [])}</c:yVal>` : `<c:val>${refOrLit(s.values, 'num', d?.values ?? [])}</c:val>`
  const smooth = kind === 'line' || kind === 'scatter' ? `<c:smooth val="${chart.smooth ? 1 : 0}"/>` : ''
  const inv = kind === 'bar' ? '<c:invertIfNegative val="0"/>' : ''
  const eb = chart.errorBars
  const errBars = eb && (kind === 'bar' || kind === 'line' || kind === 'area')
    ? `<c:errBars><c:errBarType val="both"/><c:errValType val="${ERRBAR_TYPE[eb.type]}"/><c:noEndCap val="0"/>${eb.type === 'stdErr' ? '' : `<c:val val="${eb.value}"/>`}</c:errBars>`
    : ''
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${name}${sp}${inv}${marker}${pts}${trend}${errBars}${catXml}${valXml}${smooth}</c:ser>`
}

function dLblsXml(chart: ChartDef) {
  if (chart.dataLabels === 'none') return ''
  return `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${chart.dataLabels === 'value' ? 1 : 0}"/><c:showCatName val="${chart.dataLabels === 'category' ? 1 : 0}"/><c:showSerName val="0"/><c:showPercent val="${chart.dataLabels === 'percent' ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`
}

function axesXml(chart: ChartDef, catId: number, valId: number, opts: { horizontal: boolean; scatter: boolean; secondary?: boolean }) {
  const grid = (on: boolean) => (on ? '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : '')
  const minor = chart.gridlines.minor ? '<c:minorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="F2F2F2"/></a:solidFill></a:ln></c:spPr></c:minorGridlines>' : ''
  const title = (t?: string) => (t ? `<c:title>${richText(t, 1000)}<c:overlay val="0"/></c:title>` : '')
  const catPos = opts.horizontal ? 'l' : 'b'
  const valPos = opts.secondary ? (opts.horizontal ? 't' : 'r') : opts.horizontal ? 'b' : 'l'
  const catAx = opts.scatter
    ? `<c:valAx><c:axId val="${catId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${chart.axes.x ? 0 : 1}"/><c:axPos val="b"/>${grid(chart.gridlines.vertical)}${title(chart.axisTitles.x)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${valId}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
    : `<c:catAx><c:axId val="${catId}"/><c:scaling><c:orientation val="${opts.horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="${opts.secondary || !chart.axes.x ? 1 : 0}"/><c:axPos val="${catPos}"/>${opts.secondary ? '' : grid(chart.gridlines.vertical)}${opts.secondary ? '' : title(opts.horizontal ? chart.axisTitles.y : chart.axisTitles.x)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${valId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
  const va = opts.secondary ? undefined : chart.valueAxis
  const scaling = `<c:scaling>${va?.log ? '<c:logBase val="10"/>' : ''}<c:orientation val="${va?.reverse ? 'maxMin' : 'minMax'}"/>${va?.max !== undefined ? `<c:max val="${va.max}"/>` : ''}${va?.min !== undefined ? `<c:min val="${va.min}"/>` : ''}</c:scaling>`
  const valFmt = va?.fmt ? `<c:numFmt formatCode="${esc(va.fmt)}" sourceLinked="0"/>` : `<c:numFmt formatCode="${chart.grouping === 'percent' ? '0%' : 'General'}" sourceLinked="${chart.grouping === 'percent' ? 0 : 1}"/>`
  const valAx = `<c:valAx><c:axId val="${valId}"/>${scaling}<c:delete val="${chart.axes.y ? 0 : 1}"/><c:axPos val="${valPos}"/>${opts.secondary ? '' : grid(chart.gridlines.major) + minor}${opts.secondary ? '' : title(opts.horizontal ? chart.axisTitles.x : chart.axisTitles.y)}${valFmt}<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${catId}"/><c:crosses val="${opts.secondary ? 'max' : 'autoZero'}"/><c:crossBetween val="${opts.scatter ? 'midCat' : 'between'}"/>${va?.major ? `<c:majorUnit val="${va.major}"/>` : ''}</c:valAx>`
  return catAx + valAx
}

/** Chart part (c:chartSpace) for a chart definition, with cached values. */
export function chartXml(chart: ChartDef, wb: Workbook, engine: Engine): string {
  const data = chartData(wb, engine, chart)
  const series = chartSeries(wb, engine, chart)
  const colors = seriesColors(chart, Math.max(series.length, 1)).map((c, i) => series[i]?.color ?? c)
  const grouping = chart.grouping === 'stacked' ? 'stacked' : chart.grouping === 'percent' ? 'percentStacked' : 'clustered'
  const lineGrouping = chart.grouping === 'stacked' ? 'stacked' : chart.grouping === 'percent' ? 'percentStacked' : 'standard'
  let type: ChartType = chart.type
  // newer chart types (extended chart parts) are saved as their closest classic chart
  if (type === 'histogram' || type === 'waterfall' || type === 'boxWhisker') type = 'column'
  if (type === 'funnel') type = 'bar'
  if (type === 'treemap') type = 'pie'
  let plot = ''
  const sers = (kind: Parameters<typeof seriesXml>[5], idx: number[]) => idx.map((i) => seriesXml(chart, series[i], i, data, colors[i], kind)).join('')
  const all = series.map((_, i) => i)
  const AX1 = 500000001
  const AX2 = 500000002
  const AX3 = 500000003
  const AX4 = 500000004
  if (type === 'column' || type === 'bar') {
    plot = `<c:barChart><c:barDir val="${type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers('bar', all)}${dLblsXml(chart)}<c:gapWidth val="${chart.gapWidth}"/>${grouping !== 'clustered' ? '<c:overlap val="100"/>' : ''}<c:axId val="${AX1}"/><c:axId val="${AX2}"/></c:barChart>` + axesXml(chart, AX1, AX2, { horizontal: type === 'bar', scatter: false })
  } else if (type === 'line') {
    plot = `<c:lineChart><c:grouping val="${lineGrouping}"/><c:varyColors val="0"/>${sers('line', all)}${dLblsXml(chart)}<c:marker val="1"/><c:axId val="${AX1}"/><c:axId val="${AX2}"/></c:lineChart>` + axesXml(chart, AX1, AX2, { horizontal: false, scatter: false })
  } else if (type === 'area') {
    plot = `<c:areaChart><c:grouping val="${lineGrouping}"/><c:varyColors val="0"/>${sers('area', all)}${dLblsXml(chart)}<c:axId val="${AX1}"/><c:axId val="${AX2}"/></c:areaChart>` + axesXml(chart, AX1, AX2, { horizontal: false, scatter: false })
  } else if (type === 'pie') {
    plot = `<c:pieChart><c:varyColors val="1"/>${sers('pie', all.slice(0, 1))}${dLblsXml(chart)}<c:firstSliceAng val="0"/></c:pieChart>`
  } else if (type === 'doughnut') {
    plot = `<c:doughnutChart><c:varyColors val="1"/>${sers('pie', all.slice(0, 1))}${dLblsXml(chart)}<c:firstSliceAng val="0"/><c:holeSize val="${chart.holeSize}"/></c:doughnutChart>`
  } else if (type === 'scatter') {
    plot = `<c:scatterChart><c:scatterStyle val="${chart.smooth ? 'smoothMarker' : 'lineMarker'}"/><c:varyColors val="0"/>${sers('scatter', all)}${dLblsXml(chart)}<c:axId val="${AX1}"/><c:axId val="${AX2}"/></c:scatterChart>` + axesXml(chart, AX1, AX2, { horizontal: false, scatter: true })
  } else if (type === 'radar') {
    plot = `<c:radarChart><c:radarStyle val="marker"/><c:varyColors val="0"/>${sers('radar', all)}${dLblsXml(chart)}<c:axId val="${AX1}"/><c:axId val="${AX2}"/></c:radarChart>` + axesXml(chart, AX1, AX2, { horizontal: false, scatter: false })
  } else if (type === 'combo') {
    const groups = { column: [] as number[], line: [] as number[], area: [] as number[] }
    const sec = { column: [] as number[], line: [] as number[], area: [] as number[] }
    series.forEach((s, i) => (s.secondary ? sec : groups)[s.type ?? 'column'].push(i))
    const block = (kind: 'column' | 'line' | 'area', idx: number[], a: number, b: number) => {
      if (!idx.length) return ''
      if (kind === 'column') return `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers('bar', idx)}<c:gapWidth val="${chart.gapWidth}"/><c:axId val="${a}"/><c:axId val="${b}"/></c:barChart>`
      if (kind === 'line') return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers('line', idx)}<c:marker val="1"/><c:axId val="${a}"/><c:axId val="${b}"/></c:lineChart>`
      return `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers('area', idx)}<c:axId val="${a}"/><c:axId val="${b}"/></c:areaChart>`
    }
    plot = block('column', groups.column, AX1, AX2) + block('area', groups.area, AX1, AX2) + block('line', groups.line, AX1, AX2)
    const hasSec = sec.column.length + sec.line.length + sec.area.length > 0
    if (hasSec) plot += block('column', sec.column, AX3, AX4) + block('area', sec.area, AX3, AX4) + block('line', sec.line, AX3, AX4)
    plot += axesXml(chart, AX1, AX2, { horizontal: false, scatter: false })
    if (hasSec) plot += axesXml(chart, AX3, AX4, { horizontal: false, scatter: false, secondary: true })
  }
  const titleText = chart.title.text ?? (series.length === 1 ? data.series[0]?.name : undefined)
  const title = chart.title.show
    ? `<c:title>${titleText ? richText(titleText) : ''}<c:overlay val="${chart.title.overlay ? 1 : 0}"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>'
  const legend = chart.legend === 'none' ? '' : `<c:legend><c:legendPos val="${chart.legend[0]}"/><c:overlay val="0"/></c:legend>`
  const space = `<c:spPr>${chart.fill ? solid(chart.fill) : '<a:solidFill><a:schemeClr val="bg1"/></a:solidFill>'}<a:ln w="9525">${chart.border && chart.border !== 'transparent' ? solid(chart.border) : chart.border === 'transparent' ? '<a:noFill/>' : '<a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill>'}</a:ln></c:spPr>`
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:roundedCorners val="0"/>' +
    `<c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    space +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000">${chart.fontColor ? solid(chart.fontColor) : ''}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>` +
    '</c:chartSpace>'
  )
}

const TOTAL_NAMES: Record<TotalFn, string> = { none: 'none', sum: 'sum', average: 'average', count: 'count', countNums: 'countNums', max: 'max', min: 'min', stdDev: 'stdDev', var: 'var', custom: 'custom' }

const FILTER_OPS: Record<string, [string, (v: string) => string]> = {
  eq: ['equal', (v) => v], ne: ['notEqual', (v) => v], gt: ['greaterThan', (v) => v], ge: ['greaterThanOrEqual', (v) => v], lt: ['lessThan', (v) => v], le: ['lessThanOrEqual', (v) => v],
  begins: ['equal', (v) => `${v}*`], notBegins: ['notEqual', (v) => `${v}*`], ends: ['equal', (v) => `*${v}`], notEnds: ['notEqual', (v) => `*${v}`], contains: ['equal', (v) => `*${v}*`], notContains: ['notEqual', (v) => `*${v}*`],
}

function filterColumnsXml(filters: Record<number, FilterSpec>): string {
  return Object.entries(filters)
    .map(([col, f]) => {
      let body = ''
      if (f.kind === 'values') body = `<filters${f.blanks ? ' blank="1"' : ''}>${f.values.map((v) => `<filter val="${esc(v)}"/>`).join('')}</filters>`
      else if (f.kind === 'custom') {
        const one = (c: { op: string; value: string }) => {
          const [op, fmt] = FILTER_OPS[c.op] ?? ['equal', (v: string) => v]
          return `<customFilter operator="${op}" val="${esc(fmt(c.value))}"/>`
        }
        body = `<customFilters${f.and && f.c2 ? ' and="1"' : ''}>${one(f.c1)}${f.c2 && f.c2.value ? one(f.c2) : ''}</customFilters>`
      } else if (f.kind === 'top10') body = `<top10${f.top ? '' : ' top="0"'}${f.percent ? ' percent="1"' : ''} val="${f.n}"/>`
      else if (f.kind === 'average') body = `<dynamicFilter type="${f.above ? 'aboveAverage' : 'belowAverage'}"/>`
      else if (f.kind === 'dynamic') body = `<dynamicFilter type="${f.period}"/>`
      else return ''
      return `<filterColumn colId="${col}">${body}</filterColumn>`
    })
    .join('')
}

function tableXml(t: TableDef, id: number): string {
  const rows = tableRows(t)
  const ref = rangeText(t.range)
  const af = t.header && t.filterButton ? `<autoFilter ref="${rangeText({ ...t.range, r2: t.totals ? t.range.r2 - 1 : t.range.r2 })}">${filterColumnsXml(t.filters)}</autoFilter>` : ''
  const cols = t.columns
    .map((c, i) => {
      const attrs = [`id="${i + 1}"`, `name="${esc(c.name)}"`]
      if (t.totals) {
        if (i === 0 && c.total === 'none') attrs.push(`totalsRowLabel="${esc(c.totalLabel ?? 'Total')}"`)
        else if (c.total !== 'none') attrs.push(`totalsRowFunction="${TOTAL_NAMES[c.total]}"`)
      }
      const inner = (c.calc ? `<calculatedColumnFormula>${esc(c.calc)}</calculatedColumnFormula>` : '') + (t.totals && c.total === 'custom' && c.totalFormula ? `<totalsRowFormula>${esc(c.totalFormula)}</totalsRowFormula>` : '')
      return inner ? `<tableColumn ${attrs.join(' ')}>${inner}</tableColumn>` : `<tableColumn ${attrs.join(' ')}/>`
    })
    .join('')
  void rows
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${id}" name="${esc(t.name)}" displayName="${esc(t.name)}" ref="${ref}"${t.header ? '' : ' headerRowCount="0"'}${t.totals ? ' totalsRowCount="1"' : ' totalsRowShown="0"'}>` +
    af +
    `<tableColumns count="${t.columns.length}">${cols}</tableColumns>` +
    (t.style === 'none' ? '' : `<tableStyleInfo name="${esc(/^TableStyle(Light|Medium|Dark)\d+$/.test(t.style) ? t.style : 'TableStyleMedium2')}" showFirstColumn="${t.firstCol ? 1 : 0}" showLastColumn="${t.lastCol ? 1 : 0}" showRowStripes="${t.bandRows ? 1 : 0}" showColumnStripes="${t.bandCols ? 1 : 0}"/>`) +
    '</table>'
  )
}

const PERM_ATTR: Record<string, string> = {
  selectLocked: 'selectLockedCells', selectUnlocked: 'selectUnlockedCells', formatCells: 'formatCells', formatColumns: 'formatColumns', formatRows: 'formatRows',
  insertColumns: 'insertColumns', insertRows: 'insertRows', insertHyperlinks: 'insertHyperlinks', deleteColumns: 'deleteColumns', deleteRows: 'deleteRows', sort: 'sort',
  autoFilter: 'autoFilter', pivotTables: 'pivotTables', objects: 'objects', scenarios: 'scenarios',
}

function protectionXml(sheet: Sheet): string {
  const p = sheet.x.protection!
  const attrs: string[] = []
  if (p.hash && p.hash !== '*') attrs.push(`password="${p.hash}"`)
  attrs.push('sheet="1"')
  // attributes are "protected" flags: 1 = not allowed (select flags: 1 = not allowed as well)
  for (const [k, a] of Object.entries(PERM_ATTR)) {
    const allowed = !!p.allow[k as keyof typeof p.allow]
    if (k === 'selectLocked' || k === 'selectUnlocked') {
      if (!allowed) attrs.push(`${a}="1"`)
    } else if (k === 'objects' || k === 'scenarios') {
      if (!allowed) attrs.push(`${a}="1"`)
    } else if (allowed) attrs.push(`${a}="0"`)
  }
  return `<sheetProtection ${attrs.join(' ')}/>`
}

function sparklinesExt(sheet: Sheet): string {
  const groups = new Map<number, Sparkline[]>()
  for (const s of sheet.x.sparklines) {
    const g = groups.get(s.group) ?? []
    g.push(s)
    groups.set(s.group, g)
  }
  if (!groups.size) return ''
  const rgb = (c: string) => `FF${hex6(c)}`
  const body = [...groups.values()]
    .map((list) => {
      const s = list[0]
      const type = s.type === 'column' ? ' type="column"' : s.type === 'winloss' ? ' type="stacked"' : ''
      const flags = ['markers', 'high', 'low', 'first', 'last', 'negative'].filter((f) => s[f as keyof Sparkline]).map((f) => ` ${f}="1"`).join('')
      const lines = list.map((x) => `<x14:sparkline><xm:f>${esc(x.source.replace(/^=/, ''))}</xm:f><xm:sqref>${colName(x.c)}${x.r + 1}</xm:sqref></x14:sparkline>`).join('')
      return `<x14:sparklineGroup${type} displayEmptyCellsAs="gap"${flags}><x14:colorSeries rgb="${rgb(s.color)}"/><x14:colorNegative rgb="${rgb(s.negColor)}"/><x14:colorAxis rgb="FF000000"/><x14:colorMarkers rgb="${rgb(s.color)}"/><x14:colorFirst rgb="FF2E6FD8"/><x14:colorLast rgb="FF2E6FD8"/><x14:colorHigh rgb="FF3BA55C"/><x14:colorLow rgb="FFE04B3A"/><x14:sparklines>${lines}</x14:sparklines></x14:sparklineGroup>`
    })
    .join('')
  return `<ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">${body}</x14:sparklineGroups></ext>`
}

function nextRid(rels: string): number {
  let max = 0
  for (const m of rels.matchAll(/Id="rId(\d+)"/g)) max = Math.max(max, Number(m[1]))
  return max + 1
}

const EMPTY_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function addOverride(ct: string, part: string, type: string) {
  if (ct.includes(`PartName="${part}"`)) return ct
  return ct.replace('</Types>', `<Override PartName="${part}" ContentType="${type}"/></Types>`)
}

function addDefault(ct: string, ext: string, type: string) {
  if (new RegExp(`Extension="${ext}"`, 'i').test(ct)) return ct
  return ct.replace('<Override', `<Default Extension="${ext}" ContentType="${type}"/><Override`)
}

const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'image/webp': 'png' }

function dataUrlBytes(url: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url)
  if (!m) return null
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3])
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 255
  return { mime: m[1], bytes }
}

export function legacyThreadText(t: CommentThread): string {
  const [first, ...replies] = t.items
  return ['[Threaded comment]', '', 'Comment:', `    ${first.text}`, ...replies.flatMap((r) => ['Reply:', `    ${r.text}`])].join('\n')
}

function guid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  const id = c?.randomUUID ? c.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => ((Math.random() * 16) | (ch === 'x' ? 0 : 8)).toString(16))
  return `{${id.toUpperCase()}}`
}

/** "2026-01-02T10:00:00.00" (the timestamp form threaded comments use). */
const commentTime = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 22) : d.toISOString().slice(0, 22)
}

const THREADED_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments'
const REL_THREADED = 'http://schemas.microsoft.com/office/2017/10/relationships/threadedComment'
const REL_PERSON = 'http://schemas.microsoft.com/office/2017/10/relationships/person'

const METADATA_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">' +
  '<metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes>' +
  '<futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>' +
  '<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>'

/** Marks dynamic-array formula cells: cm="1" on the cell and an array formula over the result range. */
function markDynamicCells(xml: string, refs: Set<string>): string {
  return xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)>(<f(?:\s[^>]*)?>)/g, (all, ref: string, attrs: string, f: string) => {
    if (!refs.has(ref)) return all
    const cAttrs = /\scm="/.test(attrs) ? attrs : `${attrs} cm="1"`
    const fTag = /\st="/.test(f) ? f : `<f t="array" ref="${ref}">`
    return `<c r="${ref}"${cAttrs}>${fTag}`
  })
}

/** Writes drawings, tables, filters, protection, breaks and sparklines into the saved package. */
export async function postProcess(buf: ArrayBuffer, wb: Workbook, engine: Engine): Promise<Blob> {
  const JSZip = await loadZip()
  const zip = await JSZip.loadAsync(buf)
  let ct = await zip.file('[Content_Types].xml')!.async('string')
  let drawingN = 0
  let chartN = 0
  let imageN = 0
  let tableN = 0
  let threadN = 0
  let anyDynamic = false
  const persons = new Map<string, string>()
  const personId = (name: string) => {
    let id = persons.get(name)
    if (!id) persons.set(name, (id = guid()))
    return id
  }
  const imageParts = new Map<string, string>()
  // PivotTables first: slicers on any sheet refer to their caches
  const ctAdd = { add: (part: string, type: string) => void (ct = addOverride(ct, part, type)) }
  const pivotWriter = new PivotPackageWriter(zip, wb, engine)
  const pivotTargets = new Map<Sheet, string[]>()
  for (const sheet of wb.sheets) if (sheet.x.pivots.length) pivotTargets.set(sheet, pivotWriter.addPivots(sheet, ctAdd))
  const sheetIds = new Map<Sheet, number>()
  {
    const wxml = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
    const ids = [...wxml.matchAll(/<sheet [^>]*?sheetId="(\d+)"/g)].map((m) => Number(m[1]))
    wb.sheets.forEach((sh, i) => sheetIds.set(sh, ids[i] ?? i + 1))
  }
  for (let si = 0; si < wb.sheets.length; si++) {
    const sheet = wb.sheets[si]
    const path = `xl/worksheets/sheet${si + 1}.xml`
    const file = zip.file(path)
    if (!file) continue
    let xml = await file.async('string')
    const relsPath = `xl/worksheets/_rels/sheet${si + 1}.xml.rels`
    let rels = (await zip.file(relsPath)?.async('string')) ?? EMPTY_RELS
    let changed = false
    let relsChanged = false
    const x = sheet.x
    // a data bar without 2010 extensions must not point at an (empty) extension id
    if (xml.includes('<x14:id/>') || xml.includes('<x14:id></x14:id>')) {
      xml = xml.replace(/<extLst><ext uri="\{B025F937-C7B1-47D3-B67F-A62EFF666E3E\}"[^>]*><x14:id(?:\/>|><\/x14:id>)<\/ext><\/extLst>/g, '')
      changed = true
    }
    // dynamic arrays
    const dynamic = new Set<string>()
    for (const [k, d] of sheet.cells) if (d.f !== undefined && (sheet.spills.has(k) || isArrayFormula(d.f))) dynamic.add(`${colName(keyCol(k))}${keyRow(k) + 1}`)
    if (dynamic.size) {
      xml = markDynamicCells(xml, dynamic)
      anyDynamic = changed = true
    }
    // threaded comments (the legacy notes were written by ExcelJS)
    const threads = Object.entries(x.comments).filter(([, t]) => t.items.length)
    if (threads.length) {
      threadN++
      const legacyAuthor = new Map<string, string>()
      const body = threads
        .map(([k, t]) => {
          const ref = `${colName(keyCol(Number(k)))}${keyRow(Number(k)) + 1}`
          const rootId = guid()
          legacyAuthor.set(ref, `tc=${rootId}`)
          return t.items
            .map((it, i) => {
              const id = i === 0 ? rootId : guid()
              const attrs = `ref="${ref}" dT="${commentTime(it.date)}" personId="${personId(it.author || 'Author')}" id="${id}"${i > 0 ? ` parentId="${rootId}"` : ''}${i === 0 && t.resolved ? ' done="1"' : ''}`
              return `<threadedComment ${attrs}><text>${esc(it.text)}</text></threadedComment>`
            })
            .join('')
        })
        .join('')
      const tPath = `xl/threadedComments/threadedComment${threadN}.xml`
      zip.file(tPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ThreadedComments xmlns="${THREADED_NS}" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${body}</ThreadedComments>`)
      ct = addOverride(ct, `/${tPath}`, 'application/vnd.ms-excel.threadedcomments+xml')
      const id = nextRid(rels)
      rels = rels.replace('</Relationships>', `<Relationship Id="rId${id}" Type="${REL_THREADED}" Target="../threadedComments/threadedComment${threadN}.xml"/></Relationships>`)
      relsChanged = true
      // legacy comments: author "tc={id}" links each note to its thread
      const cm = /Target="\.\.\/(comments\d+\.xml)"/.exec(rels)
      const cFile = cm ? zip.file(`xl/${cm[1]}`) : null
      if (cFile) {
        let cx = await cFile.async('string')
        const authors = [...(/<authors>([\s\S]*?)<\/authors>/.exec(cx)?.[1] ?? '').matchAll(/<author>([\s\S]*?)<\/author>/g)].map((m) => m[1])
        cx = cx.replace(/<comment ref="([A-Z]+\d+)" authorId="\d+"/g, (all, ref: string) => {
          const a = legacyAuthor.get(ref)
          if (!a) return all
          authors.push(a)
          return `<comment ref="${ref}" authorId="${authors.length - 1}"`
        })
        cx = cx.replace(/<authors>[\s\S]*?<\/authors>/, `<authors>${authors.map((a) => `<author>${a}</author>`).join('')}</authors>`)
        zip.file(`xl/${cm![1]}`, cx)
      }
    }
    // protection
    if (x.protection) {
      xml = placeElement(xml, 'sheetProtection', protectionXml(sheet))
      changed = true
    }
    if (x.editRanges.length) {
      xml = placeElement(xml, 'protectedRanges', `<protectedRanges>${x.editRanges.map((e) => `<protectedRange${e.hash ? ` password="${e.hash}"` : ''} sqref="${rangeText(e.range)}" name="${esc(e.title)}"/>`).join('')}</protectedRanges>`)
      changed = true
    }
    // sheet AutoFilter with criteria
    if (x.autoFilter) {
      xml = placeElement(xml, 'autoFilter', `<autoFilter ref="${rangeText(x.autoFilter.range)}">${filterColumnsXml(x.autoFilter.filters)}</autoFilter>`)
      changed = true
    }
    // manual page breaks
    if (x.rowBreaks.length) {
      xml = placeElement(xml, 'rowBreaks', `<rowBreaks count="${x.rowBreaks.length}" manualBreakCount="${x.rowBreaks.length}">${x.rowBreaks.map((r) => `<brk id="${r}" max="16383" man="1"/>`).join('')}</rowBreaks>`)
      changed = true
    }
    if (x.colBreaks.length) {
      xml = placeElement(xml, 'colBreaks', `<colBreaks count="${x.colBreaks.length}" manualBreakCount="${x.colBreaks.length}">${x.colBreaks.map((c) => `<brk id="${c}" max="1048575" man="1"/>`).join('')}</colBreaks>`)
      changed = true
    }
    // PivotTables
    for (const target of pivotTargets.get(sheet) ?? []) {
      rels = rels.replace('</Relationships>', `<Relationship Id="rId${nextRid(rels)}" Type="${REL_PIVOT_TABLE}" Target="${target}"/></Relationships>`)
      relsChanged = true
    }
    // slicers: parts and caches now, frames go into the drawing below
    const slicers = pivotWriter.addSlicers(sheet, ctAdd, sheetIds)
    const slicerParts = slicers.parts.map((part) => {
      const id = nextRid(rels)
      rels = rels.replace('</Relationships>', `<Relationship Id="rId${id}" Type="${REL_SLICER}" Target="${part.target}"/></Relationships>`)
      relsChanged = true
      return { rid: `rId${id}`, table: part.table }
    })
    const slicerFrames = new Map<SlicerObj, string>(slicers.frames.map((f) => [f.slicer, f.name]))
    // drawing: pictures, shapes, charts and slicers
    if (x.objects.some((o) => o.kind !== 'slicer' || slicerFrames.has(o))) {
      drawingN++
      const dPath = `xl/drawings/drawing${drawingN}.xml`
      let dRels = EMPTY_RELS
      let rid = 1
      let shapeId = 2
      const anchors: string[] = []
      for (const o of x.objects) {
        if (o.kind === 'chart') {
          chartN++
          zip.file(`xl/charts/chart${chartN}.xml`, chartXml(o, wb, engine))
          ct = addOverride(ct, `/xl/charts/chart${chartN}.xml`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml')
          dRels = dRels.replace('</Relationships>', `<Relationship Id="rId${rid}" Type="${REL}/chart" Target="../charts/chart${chartN}.xml"/></Relationships>`)
          anchors.push(anchorXml(sheet, o.anchor, chartFrameXml(o, shapeId++, `rId${rid++}`)))
        } else if (o.kind === 'picture') {
          const url = wb.images.get(o.image)
          const data = url ? dataUrlBytes(url) : null
          if (!data) continue
          let target = imageParts.get(o.image)
          if (!target) {
            imageN++
            const ext = MIME_EXT[data.mime] ?? 'png'
            target = `media/image${imageN}.${ext}`
            zip.file(`xl/${target}`, data.bytes)
            ct = addDefault(ct, ext, data.mime === 'image/webp' ? 'image/png' : data.mime)
            imageParts.set(o.image, target)
          }
          dRels = dRels.replace('</Relationships>', `<Relationship Id="rId${rid}" Type="${REL}/image" Target="../${target}"/></Relationships>`)
          anchors.push(anchorXml(sheet, o.anchor, pictureXml(o, shapeId++, `rId${rid++}`)))
        } else if (o.kind === 'shape') anchors.push(anchorXml(sheet, o.anchor, shapeXml(o, shapeId++)))
        else if (o.kind === 'slicer' && slicerFrames.has(o)) anchors.push(anchorXml(sheet, o.anchor, slicerFrameXml(slicerFrames.get(o)!, shapeId++, Math.round(Math.abs(o.anchor.w) * EMU), Math.round(Math.abs(o.anchor.h) * EMU))))
      }
      zip.file(dPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}">${anchors.join('')}</xdr:wsDr>`)
      zip.file(`xl/drawings/_rels/drawing${drawingN}.xml.rels`, dRels)
      ct = addOverride(ct, `/${dPath}`, 'application/vnd.openxmlformats-officedocument.drawing+xml')
      const id = nextRid(rels)
      rels = rels.replace('</Relationships>', `<Relationship Id="rId${id}" Type="${REL}/drawing" Target="../drawings/drawing${drawingN}.xml"/></Relationships>`)
      xml = placeElement(xml, 'drawing', `<drawing r:id="rId${id}"/>`)
      changed = relsChanged = true
    }
    // sheet background picture
    const bgUrl = sheet.page.background ? wb.images.get(sheet.page.background) : undefined
    const bg = bgUrl ? dataUrlBytes(bgUrl) : null
    if (bg) {
      let target = imageParts.get(sheet.page.background!)
      if (!target) {
        imageN++
        const ext = MIME_EXT[bg.mime] ?? 'png'
        target = `media/image${imageN}.${ext}`
        zip.file(`xl/${target}`, bg.bytes)
        ct = addDefault(ct, ext, bg.mime === 'image/webp' ? 'image/png' : bg.mime)
        imageParts.set(sheet.page.background!, target)
      }
      const id = nextRid(rels)
      rels = rels.replace('</Relationships>', `<Relationship Id="rId${id}" Type="${REL}/image" Target="../${target}"/></Relationships>`)
      xml = placeElement(xml, 'picture', `<picture r:id="rId${id}"/>`)
      changed = relsChanged = true
    }
    // tables
    if (x.tables.length) {
      const parts: string[] = []
      for (const t of x.tables) {
        tableN++
        zip.file(`xl/tables/table${tableN}.xml`, tableXml(t, tableN))
        ct = addOverride(ct, `/xl/tables/table${tableN}.xml`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml')
        const id = nextRid(rels)
        rels = rels.replace('</Relationships>', `<Relationship Id="rId${id}" Type="${REL}/table" Target="../tables/table${tableN}.xml"/></Relationships>`)
        parts.push(`<tablePart r:id="rId${id}"/>`)
      }
      xml = placeElement(xml, 'tableParts', `<tableParts count="${parts.length}">${parts.join('')}</tableParts>`)
      changed = relsChanged = true
    }
    // sparklines and slicer lists live in the sheet's extension list
    const spark = sparklinesExt(sheet) + slicerListExt(slicerParts)
    if (spark) {
      xml = placeElement(xml, 'extLst', `<extLst>${spark}</extLst>`)
      changed = true
    }
    if (changed) {
      if (!/xmlns:r=/.test(xml.slice(0, 600))) xml = xml.replace('<worksheet ', `<worksheet xmlns:r="${REL}" `)
      zip.file(path, xml)
    }
    if (relsChanged) zip.file(relsPath, rels)
  }
  if (anyDynamic || persons.size) {
    const wrPath = 'xl/_rels/workbook.xml.rels'
    let wr = await zip.file(wrPath)!.async('string')
    if (anyDynamic && !zip.file('xl/metadata.xml')) {
      zip.file('xl/metadata.xml', METADATA_XML)
      ct = addOverride(ct, '/xl/metadata.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml')
      wr = wr.replace('</Relationships>', `<Relationship Id="rId${nextRid(wr)}" Type="${REL}/sheetMetadata" Target="metadata.xml"/></Relationships>`)
    }
    if (persons.size) {
      const list = [...persons].map(([name, id]) => `<person displayName="${esc(name)}" id="${id}" userId="${esc(name)}" providerId="None"/>`).join('')
      zip.file('xl/persons/person.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><personList xmlns="${THREADED_NS}" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${list}</personList>`)
      ct = addOverride(ct, '/xl/persons/person.xml', 'application/vnd.ms-excel.person+xml')
      wr = wr.replace('</Relationships>', `<Relationship Id="rId${nextRid(wr)}" Type="${REL_PERSON}" Target="persons/person.xml"/></Relationships>`)
    }
    zip.file(wrPath, wr)
  }
  // workbook theme: our colors and fonts in the theme part
  if (wb.theme) {
    const tPath = Object.keys(zip.files).find((f) => /^xl\/theme\/theme\d+\.xml$/.test(f))
    const tFile = tPath ? zip.file(tPath) : null
    if (tFile && tPath) {
      let tx = await tFile.async('string')
      const c = wb.theme.colors
      const slots: [string, string][] = [['dk1', c.dk1], ['lt1', c.lt1], ['dk2', c.dk2], ['lt2', c.lt2], ...c.accents.map((a, i): [string, string] => [`accent${i + 1}`, a]), ['hlink', c.hlink], ['folHlink', c.folHlink]]
      for (const [slot, color] of slots) tx = tx.replace(new RegExp(`<a:${slot}>[\\s\\S]*?</a:${slot}>`), `<a:${slot}><a:srgbClr val="${hex6(color)}"/></a:${slot}>`)
      tx = tx.replace(/<a:clrScheme name="[^"]*"/, `<a:clrScheme name="${esc(wb.theme.name)}"`)
      tx = tx.replace(/(<a:majorFont>\s*<a:latin typeface=")[^"]*"/, `$1${esc(wb.theme.fonts.major)}"`).replace(/(<a:minorFont>\s*<a:latin typeface=")[^"]*"/, `$1${esc(wb.theme.fonts.minor)}"`)
      zip.file(tPath, tx)
    }
  }
  if (pivotWriter.hasWorkbookParts) {
    const wrPath = 'xl/_rels/workbook.xml.rels'
    const done = pivotWriter.finish(await zip.file('xl/workbook.xml')!.async('string'), await zip.file(wrPath)!.async('string'))
    zip.file('xl/workbook.xml', done.workbookXml)
    zip.file(wrPath, done.wbRels)
  }
  if (wb.protection) {
    const wPath = 'xl/workbook.xml'
    let w = await zip.file(wPath)!.async('string')
    const el = `<workbookProtection${wb.protection.hash && wb.protection.hash !== '*' ? ` workbookPassword="${wb.protection.hash}"` : ''} lockStructure="1"/>`
    w = /<workbookProtection[^>]*\/>/.test(w) ? w.replace(/<workbookProtection[^>]*\/>/, el) : w.replace('<bookViews', `${el}<bookViews`)
    zip.file(wPath, w)
  }
  zip.file('[Content_Types].xml', ct)
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return new Blob([out as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// =====================================================================
// Import, part 1: features ExcelJS reads for us
// =====================================================================

function colorFromEJ(c: unknown): string | undefined {
  const a = (c as { argb?: string } | undefined)?.argb
  if (a && /^[0-9A-Fa-f]{8}$/.test(a)) return '#' + a.slice(2).toUpperCase()
  return undefined
}

function styleFromDxf(s: Record<string, unknown> | undefined): CFStyle | undefined {
  if (!s) return undefined
  const out: CFStyle = {}
  const fill = s.fill as { bgColor?: unknown; fgColor?: unknown } | undefined
  const f = colorFromEJ(fill?.bgColor) ?? colorFromEJ(fill?.fgColor)
  if (f) out.fill = f
  const font = s.font as { color?: unknown; bold?: boolean; italic?: boolean; underline?: unknown; strike?: boolean } | undefined
  if (font) {
    const c = colorFromEJ(font.color)
    if (c) out.color = c
    if (font.bold) out.bold = true
    if (font.italic) out.italic = true
    if (font.underline) out.underline = true
    if (font.strike) out.strike = true
  }
  if (s.numFmt) out.fmt = typeof s.numFmt === 'string' ? s.numFmt : (s.numFmt as { formatCode?: string }).formatCode
  const border = s.border as { top?: { color?: unknown } } | undefined
  if (border?.top) out.border = colorFromEJ(border.top.color) ?? '#000000'
  return out
}

function cfvoFrom(v: { type?: string; value?: number | string } | undefined, def: CFValue['type']): CFValue {
  if (!v?.type) return { type: def }
  const t = v.type === 'number' ? 'num' : (v.type as CFValue['type'])
  return { type: ['min', 'max', 'num', 'percent', 'percentile', 'formula'].includes(t) ? t : def, value: v.value }
}

const OPS = new Set(['greaterThan', 'lessThan', 'between', 'notBetween', 'equal', 'notEqual', 'greaterThanOrEqual', 'lessThanOrEqual'])

function ruleFromEJ(r: Record<string, unknown>, ranges: Range[], id: number): CFRule | null {
  const base = { id, ranges, priority: Number(r.priority ?? id), stop: !!r.stopIfTrue, style: styleFromDxf(r.style as Record<string, unknown>) }
  const formulae = (r.formulae as string[] | undefined) ?? []
  switch (r.type) {
    case 'cellIs': return OPS.has(String(r.operator)) ? { ...base, type: 'cellIs', op: r.operator as CellOp, f1: formulae[0] ?? '0', f2: formulae[1] } : null
    case 'expression': return { ...base, type: 'expression', formula: formulae[0] ?? 'FALSE' }
    case 'top10': return { ...base, type: 'top', bottom: !!r.bottom, rank: Number(r.rank ?? 10), percent: !!r.percent }
    case 'aboveAverage': return { ...base, type: 'average', above: r.aboveAverage !== false, equal: false }
    case 'containsText': {
      const op = String(r.operator ?? 'containsText')
      if (op === 'containsBlanks') return { ...base, type: 'blanks' }
      if (op === 'notContainsBlanks') return { ...base, type: 'noBlanks' }
      if (op === 'containsErrors') return { ...base, type: 'errors' }
      if (op === 'notContainsErrors') return { ...base, type: 'noErrors' }
      const text = String(r.text ?? '')
      return { ...base, type: 'text', op: op === 'notContainsText' || op === 'notContains' ? 'notContains' : op === 'beginsWith' ? 'beginsWith' : op === 'endsWith' ? 'endsWith' : 'contains', text }
    }
    case 'timePeriod': return { ...base, type: 'date', period: String(r.timePeriod ?? 'today') as never }
    case 'dataBar': {
      const cf = (r.cfvo as { type?: string; value?: number }[] | undefined) ?? []
      return { ...base, type: 'dataBar', color: colorFromEJ(r.color) ?? '#638EC6', gradient: r.gradient !== false, min: cfvoFrom(cf[0], 'min'), max: cfvoFrom(cf[1], 'max'), showValue: r.showValue !== false, border: !!r.border }
    }
    case 'colorScale': {
      const cf = (r.cfvo as { type?: string; value?: number }[] | undefined) ?? []
      const colors = (r.color as unknown[] | undefined) ?? []
      return { ...base, type: 'colorScale', stops: cf.map((v, i) => ({ v: cfvoFrom(v, i === 0 ? 'min' : 'max'), color: colorFromEJ(colors[i]) ?? '#FFFFFF' })) }
    }
    case 'iconSet': {
      const cf = (r.cfvo as { type?: string; value?: number }[] | undefined) ?? []
      return { ...base, type: 'iconSet', set: (r.iconSet as IconSetId) ?? '3TrafficLights1', reverse: !!r.reverse, showValue: r.showValue !== false, thresholds: cf.slice(1).map((v) => cfvoFrom(v, 'percent')) }
    }
    default: return null
  }
}

function parseSqref(s: string): Range[] {
  return s.split(/\s+/).map((p) => parseRange(p.replace(/\$/g, ''))).filter((r): r is Range => !!r)
}

/** Reads conditional formats, validation, notes and outlines from an ExcelJS worksheet. */
export function readWithExcelJS(ws: EJ.Worksheet, sheet: Sheet, wb: Workbook) {
  const x = sheet.x
  const cfs = ((ws as unknown as { conditionalFormattings?: { ref: string; rules: Record<string, unknown>[] }[] }).conditionalFormattings ?? [])
  for (const cf of cfs) {
    const ranges = parseSqref(cf.ref)
    for (const r of cf.rules) {
      const rule = ruleFromEJ(r, ranges, wb.newObjectId())
      if (rule) x.cf.push(rule)
    }
  }
  x.cf.sort((a, b) => a.priority - b.priority)
  // data validation: group identical rules into ranges
  const dvModel = (ws as unknown as { dataValidations?: { model?: Record<string, Record<string, unknown>> } }).dataValidations?.model ?? {}
  const byRule = new Map<string, Range[]>()
  const rules = new Map<string, Record<string, unknown>>()
  for (const [addr, v] of Object.entries(dvModel)) {
    if (!v) continue
    const key = JSON.stringify(v)
    const rg = parseRange(addr.replace(/^range:/, '').replace(/\$/g, ''))
    if (!rg) continue
    const list = byRule.get(key) ?? []
    list.push(rg)
    byRule.set(key, list)
    rules.set(key, v)
  }
  for (const [key, ranges] of byRule) {
    const v = rules.get(key)!
    const formulae = ((v.formulae as unknown[]) ?? []).map((f) => (f instanceof Date ? String((f.getTime() - Date.UTC(1899, 11, 30)) / 86400000) : String(f)))
    const type = (String(v.type ?? 'any') as Validation['type'])
    const lit = (f: string | undefined) => {
      if (f === undefined) return undefined
      if (type === 'list') return /^".*"$/.test(f) ? f.slice(1, -1).replace(/""/g, '"') : '=' + f
      return Number.isFinite(Number(f)) ? f : '=' + f
    }
    x.validations.push({
      id: wb.newObjectId(),
      ranges: mergeRanges(ranges),
      type: ['any', 'whole', 'decimal', 'list', 'date', 'time', 'textLength', 'custom'].includes(type) ? type : 'any',
      op: (OPS.has(String(v.operator)) ? v.operator : 'between') as CellOp,
      f1: type === 'custom' ? '=' + formulae[0] : lit(formulae[0]),
      f2: lit(formulae[1]),
      allowBlank: v.allowBlank !== false,
      dropdown: !v.showDropDown,
      showInput: !!v.showInputMessage,
      inputTitle: v.promptTitle as string | undefined,
      inputMessage: v.prompt as string | undefined,
      showError: v.showErrorMessage !== false,
      errorStyle: v.errorStyle === 'warning' ? 'warning' : v.errorStyle === 'information' ? 'information' : 'stop',
      errorTitle: v.errorTitle as string | undefined,
      errorMessage: v.error as string | undefined,
    })
  }
  // notes
  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    row.eachCell({ includeEmpty: true }, (cell, cn) => {
      const note = (cell as unknown as { note?: string | { texts?: { text: string }[] } }).note
      if (!note) return
      const text = typeof note === 'string' ? note : (note.texts ?? []).map((t) => t.text).join('')
      const m = /^([^:\n]{1,60}):\n([\s\S]*)$/.exec(text)
      x.notes[cellKey(rn - 1, cn - 1)] = { text: m ? m[2] : text, author: m ? m[1] : 'Author', visible: false, w: 144, h: 79 }
    })
    if (row.outlineLevel) x.outline.rows[rn - 1] = row.outlineLevel
  })
  const cols = (ws as unknown as { _columns?: EJ.Column[] })._columns ?? []
  cols.forEach((col, i) => {
    if (col?.outlineLevel) x.outline.cols[i] = col.outlineLevel
  })
  const op = ws.properties?.outlineProperties
  if (op) x.outline = { ...x.outline, summaryBelow: op.summaryBelow !== false, summaryRight: op.summaryRight !== false }
}

function mergeRanges(list: Range[]): Range[] {
  // merge vertically adjacent single-column ranges into blocks
  const sorted = list.slice().sort((a, b) => a.c1 - b.c1 || a.r1 - b.r1)
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && last.c1 === r.c1 && last.c2 === r.c2 && last.r2 + 1 === r.r1) last.r2 = r.r2
    else out.push({ ...r })
  }
  return out
}

// =====================================================================
// Import, part 2: package parts read directly
// =====================================================================

const NS = {
  main: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  r: REL,
  xdr: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  pkg: 'http://schemas.openxmlformats.org/package/2006/relationships',
  x14: 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main',
  xm: 'http://schemas.microsoft.com/office/excel/2006/main',
}

const SCHEME: Record<string, string> = {
  bg1: '#FFFFFF', tx1: '#000000', bg2: '#E7E6E6', tx2: '#44546A', lt1: '#FFFFFF', dk1: '#000000', lt2: '#E7E6E6', dk2: '#44546A',
  accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5', accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47', hlink: '#0563C1', folHlink: '#954F72',
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

const kids = (el: Element | null | undefined, ns: string, name: string) => (el ? [...el.children].filter((c) => c.namespaceURI === ns && c.localName === name) : [])
const kid = (el: Element | null | undefined, ns: string, name: string) => kids(el, ns, name)[0] ?? null
const deep = (el: Element | Document | null | undefined, ns: string, name: string) => (el ? [...el.getElementsByTagNameNS(ns, name)] : [])
const val = (el: Element | null | undefined) => el?.getAttribute('val') ?? undefined

function colorOf(el: Element | null | undefined): string | undefined {
  if (!el) return undefined
  const fill = el.localName === 'solidFill' ? el : kid(el, NS.a, 'solidFill')
  if (!fill) return undefined
  const s = kid(fill, NS.a, 'srgbClr')
  if (s) return '#' + (s.getAttribute('val') ?? '000000').toUpperCase()
  const sc = kid(fill, NS.a, 'schemeClr')
  if (sc) {
    let base = SCHEME[sc.getAttribute('val') ?? ''] ?? '#000000'
    const lumMod = kid(sc, NS.a, 'lumMod')
    const lumOff = kid(sc, NS.a, 'lumOff')
    if (lumMod || lumOff) {
      const m = Number(lumMod?.getAttribute('val') ?? 100000) / 100000
      const o = Number(lumOff?.getAttribute('val') ?? 0) / 100000
      const n = parseInt(base.slice(1), 16)
      base = '#' + [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(Math.min(255, c * m + 255 * o)).toString(16).padStart(2, '0')).join('').toUpperCase()
    }
    return base
  }
  const sys = kid(fill, NS.a, 'sysClr')
  if (sys) return '#' + (sys.getAttribute('lastClr') ?? '000000').toUpperCase()
  return undefined
}

async function relsOf(zip: JSZipType, part: string): Promise<Map<string, { target: string; type: string }>> {
  const dir = part.slice(0, part.lastIndexOf('/'))
  const name = part.slice(part.lastIndexOf('/') + 1)
  const file = zip.file(`${dir}/_rels/${name}.rels`)
  const map = new Map<string, { target: string; type: string }>()
  if (!file) return map
  const doc = parseXml(await file.async('string'))
  for (const r of deep(doc, NS.pkg, 'Relationship')) {
    const t = r.getAttribute('Target') ?? ''
    const resolved = t.startsWith('/') ? t.slice(1) : normalizePath(`${dir}/${t}`)
    map.set(r.getAttribute('Id') ?? '', { target: resolved, type: r.getAttribute('Type') ?? '' })
  }
  return map
}

function normalizePath(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop()
    else if (seg && seg !== '.') out.push(seg)
  }
  return out.join('/')
}

function anchorOf(el: Element, sheet: Sheet): Anchor | null {
  const pos = (p: Element | null) => {
    if (!p) return null
    const n = (name: string) => Number(kid(p, NS.xdr, name)?.textContent ?? 0)
    return { x: sheet.cols.offset(n('col')) + n('colOff') / EMU, y: sheet.rows.offset(n('row')) + n('rowOff') / EMU }
  }
  if (el.localName === 'twoCellAnchor') {
    const f = pos(kid(el, NS.xdr, 'from'))
    const t = pos(kid(el, NS.xdr, 'to'))
    if (!f || !t) return null
    return { x: f.x, y: f.y, w: Math.max(1, t.x - f.x), h: Math.max(1, t.y - f.y) }
  }
  const ext = kid(el, NS.xdr, 'ext')
  const w = Number(ext?.getAttribute('cx') ?? 0) / EMU
  const h = Number(ext?.getAttribute('cy') ?? 0) / EMU
  if (el.localName === 'oneCellAnchor') {
    const f = pos(kid(el, NS.xdr, 'from'))
    return f ? { x: f.x, y: f.y, w, h } : null
  }
  const p = kid(el, NS.xdr, 'pos')
  return { x: Number(p?.getAttribute('x') ?? 0) / EMU, y: Number(p?.getAttribute('y') ?? 0) / EMU, w, h }
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }

function b64(bytes: Uint8Array) {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH))
  return btoa(s)
}

function refText(el: Element | null): string | undefined {
  const f = el ? deep(el, NS.c, 'f')[0] : null
  return f?.textContent ?? undefined
}

function litText(el: Element | null): string | undefined {
  if (!el) return undefined
  const v = kid(el, NS.c, 'v')
  if (v) return v.textContent ?? undefined
  const pts = deep(el, NS.c, 'v').map((x) => x.textContent ?? '')
  return pts.length ? pts.join(' ') : undefined
}

function parseChart(doc: Document, base: Pick<ChartDef, 'id' | 'name' | 'anchor'>): ChartDef | null {
  const plot = deep(doc, NS.c, 'plotArea')[0]
  if (!plot) return null
  const groups = [...plot.children].filter((c) => c.namespaceURI === NS.c && /Chart$/.test(c.localName))
  if (!groups.length) return null
  const kindOf = (g: Element): { type: ChartType; grouping: ChartDef['grouping'] } => {
    const grouping = (val(kid(g, NS.c, 'grouping')) ?? 'clustered').replace('percentStacked', 'percent').replace('standard', 'clustered') as ChartDef['grouping']
    switch (g.localName) {
      case 'barChart':
      case 'bar3DChart': return { type: val(kid(g, NS.c, 'barDir')) === 'bar' ? 'bar' : 'column', grouping: grouping === 'percent' || grouping === 'stacked' ? grouping : 'clustered' }
      case 'lineChart':
      case 'line3DChart': return { type: 'line', grouping }
      case 'areaChart':
      case 'area3DChart': return { type: 'area', grouping }
      case 'pieChart':
      case 'pie3DChart':
      case 'ofPieChart': return { type: 'pie', grouping: 'clustered' }
      case 'doughnutChart': return { type: 'doughnut', grouping: 'clustered' }
      case 'scatterChart':
      case 'bubbleChart': return { type: 'scatter', grouping: 'clustered' }
      case 'radarChart': return { type: 'radar', grouping: 'clustered' }
      default: return { type: 'column', grouping: 'clustered' }
    }
  }
  const first = kindOf(groups[0])
  const combo = groups.length > 1
  const series: ChartSeries[] = []
  let markers = false
  let smooth = false
  const secondaryAxes = new Set<string>()
  // value axes that cross at max are secondary
  for (const ax of kids(plot, NS.c, 'valAx')) if (val(kid(ax, NS.c, 'crosses')) === 'max') secondaryAxes.add(val(kid(ax, NS.c, 'axId')) ?? '')
  for (const g of groups) {
    const k = kindOf(g)
    const ids = kids(g, NS.c, 'axId').map((a) => val(a) ?? '')
    const secondary = ids.some((id) => secondaryAxes.has(id))
    for (const s of kids(g, NS.c, 'ser')) {
      const tx = kid(s, NS.c, 'tx')
      const name = refText(tx) ?? litText(tx)
      const valEl = kid(s, NS.c, 'val') ?? kid(s, NS.c, 'yVal')
      const catEl = kid(s, NS.c, 'cat') ?? kid(s, NS.c, 'xVal')
      const values = refText(valEl)
      if (!values) continue
      const color = colorOf(kid(s, NS.c, 'spPr')) ?? colorOf(kid(kid(s, NS.c, 'spPr'), NS.a, 'ln'))
      const tl = kid(s, NS.c, 'trendline')
      const tt = val(kid(tl, NS.c, 'trendlineType'))
      const sym = val(kid(kid(s, NS.c, 'marker'), NS.c, 'symbol'))
      if (sym && sym !== 'none') markers = true
      if (val(kid(s, NS.c, 'smooth')) === '1') smooth = true
      series.push({
        name: name && /!/.test(name) ? name : name ?? undefined,
        values,
        categories: refText(catEl),
        type: combo ? (k.type === 'line' ? 'line' : k.type === 'area' ? 'area' : 'column') : undefined,
        color: k.type === 'pie' || k.type === 'doughnut' ? undefined : color,
        secondary: secondary || undefined,
        trendline: tt === 'linear' ? 'linear' : tt === 'exp' ? 'exponential' : tt === 'log' ? 'logarithmic' : tt === 'movingAvg' ? 'movingAverage' : undefined,
      })
    }
    if (val(kid(g, NS.c, 'marker')) === '1' && k.type === 'line' && !kids(g, NS.c, 'ser').some((s) => val(kid(kid(s, NS.c, 'marker'), NS.c, 'symbol')) === 'none')) markers = true
  }
  if (!series.length) return null
  const chartEl = deep(doc, NS.c, 'chart')[0]
  const titleEl = kid(chartEl, NS.c, 'title')
  const deleted = val(kid(chartEl, NS.c, 'autoTitleDeleted')) === '1'
  const titleText = titleEl ? deep(titleEl, NS.a, 't').map((t) => t.textContent ?? '').join('') : ''
  const legendEl = kid(chartEl, NS.c, 'legend')
  const lp = val(kid(legendEl, NS.c, 'legendPos'))
  const dl = deep(groups[0], NS.c, 'dLbls')[0]
  const dataLabels: ChartDef['dataLabels'] = dl ? (val(kid(dl, NS.c, 'showPercent')) === '1' ? 'percent' : val(kid(dl, NS.c, 'showCatName')) === '1' ? 'category' : val(kid(dl, NS.c, 'showVal')) === '1' ? 'value' : 'none') : 'none'
  const catAx = kid(plot, NS.c, 'catAx') ?? kids(plot, NS.c, 'valAx')[first.type === 'scatter' ? 0 : 1] ?? null
  const valAx = first.type === 'scatter' ? kids(plot, NS.c, 'valAx')[1] ?? null : kid(plot, NS.c, 'valAx')
  const axTitle = (ax: Element | null) => (ax && kid(ax, NS.c, 'title') ? deep(kid(ax, NS.c, 'title'), NS.a, 't').map((t) => t.textContent ?? '').join('') || undefined : undefined)
  const spPr = [...deep(doc, NS.c, 'spPr')].find((e) => e.parentElement?.localName === 'chartSpace')
  const hole = val(kid(groups[0], NS.c, 'holeSize'))
  const gap = val(kid(groups[0], NS.c, 'gapWidth'))
  // Format Axis options of the primary value axis
  const scaling = kid(valAx, NS.c, 'scaling')
  const num = (el: Element | null) => (el && val(el) !== undefined && Number.isFinite(Number(val(el))) ? Number(val(el)) : undefined)
  const axFmt = kid(valAx, NS.c, 'numFmt')
  const valueAxis: NonNullable<ChartDef['valueAxis']> = {
    min: num(kid(scaling, NS.c, 'min')),
    max: num(kid(scaling, NS.c, 'max')),
    major: num(kid(valAx, NS.c, 'majorUnit')),
    log: kid(scaling, NS.c, 'logBase') ? true : undefined,
    reverse: val(kid(scaling, NS.c, 'orientation')) === 'maxMin' ? true : undefined,
    fmt: axFmt && axFmt.getAttribute('sourceLinked') === '0' && axFmt.getAttribute('formatCode') !== '0%' ? axFmt.getAttribute('formatCode') ?? undefined : undefined,
  }
  const hasAxisOptions = Object.values(valueAxis).some((v) => v !== undefined)
  const eb = deep(groups[0], NS.c, 'errBars')[0]
  const ebType = val(kid(eb, NS.c, 'errValType'))
  const errorBars: ChartDef['errorBars'] = eb && ebType
    ? { type: ebType === 'percentage' ? 'percent' : ebType === 'stdDev' ? 'stdDev' : ebType === 'fixedVal' ? 'fixed' : 'stdErr', value: num(kid(eb, NS.c, 'val')) ?? 1 }
    : undefined
  return {
    valueAxis: hasAxisOptions ? valueAxis : undefined,
    errorBars,
    kind: 'chart',
    ...base,
    type: combo ? 'combo' : first.type,
    grouping: first.grouping,
    markers,
    smooth,
    source: series[0].values,
    byRow: false,
    series,
    title: { show: !deleted && (!!titleEl || series.length === 1), text: titleText || undefined, overlay: val(kid(titleEl, NS.c, 'overlay')) === '1' },
    legend: !legendEl ? 'none' : lp === 'l' ? 'left' : lp === 't' ? 'top' : lp === 'b' ? 'bottom' : 'right',
    dataLabels,
    axisTitles: first.type === 'bar' ? { x: axTitle(valAx), y: axTitle(catAx) } : { x: axTitle(catAx), y: axTitle(valAx) },
    axes: { x: val(kid(catAx, NS.c, 'delete')) !== '1', y: val(kid(valAx, NS.c, 'delete')) !== '1' },
    gridlines: { major: !!kid(valAx, NS.c, 'majorGridlines'), minor: !!kid(valAx, NS.c, 'minorGridlines'), vertical: !!kid(catAx, NS.c, 'majorGridlines') },
    style: 1,
    palette: 0,
    holeSize: hole ? Number(hole) : 50,
    gapWidth: gap ? Number(gap) : 150,
    fill: spPr ? colorOf(spPr) : undefined,
  }
}

function parseShape(sp: Element, base: { id: number; name: string; anchor: Anchor }): ShapeObj {
  const spPr = kid(sp, NS.xdr, 'spPr')
  const prst = kid(spPr, NS.a, 'prstGeom')?.getAttribute('prst') ?? 'rect'
  const ln = kid(spPr, NS.a, 'ln')
  const xf = kid(spPr, NS.a, 'xfrm')
  const body = kid(sp, NS.xdr, 'txBody')
  const paras = kids(body, NS.a, 'p')
  const text = paras.map((p) => deep(p, NS.a, 't').map((t) => t.textContent ?? '').join('')).join('\n')
  const rPr = body ? deep(body, NS.a, 'rPr')[0] ?? deep(body, NS.a, 'defRPr')[0] : null
  const algn = paras[0] ? kid(paras[0], NS.a, 'pPr')?.getAttribute('algn') : null
  const anchorAttr = kid(body, NS.a, 'bodyPr')?.getAttribute('anchor')
  const noFill = !!kid(spPr, NS.a, 'noFill')
  const lineNoFill = !!kid(ln, NS.a, 'noFill')
  const isLine = prst === 'line' || prst.includes('Connector')
  const ends = (kid(ln, NS.a, 'headEnd')?.getAttribute('type') ?? 'none') !== 'none'
  const tails = (kid(ln, NS.a, 'tailEnd')?.getAttribute('type') ?? 'none') !== 'none'
  const shape = isLine ? (ends && tails ? 'doubleArrowLine' : ends || tails ? 'straightConnector1' : 'line') : prst
  const a = { ...base.anchor }
  if (xf?.getAttribute('flipH') === '1') {
    a.x += a.w
    a.w = -a.w
  }
  if (xf?.getAttribute('flipV') === '1') {
    a.y += a.h
    a.h = -a.h
  }
  return {
    kind: 'shape',
    id: base.id,
    name: base.name,
    anchor: a,
    shape,
    fill: noFill || isLine ? null : colorOf(spPr) ?? '#4472C4',
    line: lineNoFill ? null : colorOf(ln) ?? (isLine ? '#4472C4' : '#2F528F'),
    lineWidth: ln?.getAttribute('w') ? Number(ln.getAttribute('w')) / 12700 : 1,
    text,
    textColor: colorOf(rPr) ?? (kid(sp, NS.xdr, 'nvSpPr') && kid(kid(sp, NS.xdr, 'nvSpPr'), NS.xdr, 'cNvSpPr')?.getAttribute('txBox') === '1' ? '#000000' : '#FFFFFF'),
    fontSize: rPr?.getAttribute('sz') ? Number(rPr.getAttribute('sz')) / 100 : 11,
    bold: rPr?.getAttribute('b') === '1',
    italic: rPr?.getAttribute('i') === '1',
    align: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : 'left',
    vAlign: anchorAttr === 'ctr' ? 'middle' : anchorAttr === 'b' ? 'bottom' : 'top',
    rotation: xf?.getAttribute('rot') ? Math.round(Number(xf.getAttribute('rot')) / 60000) : 0,
    textBox: kid(kid(sp, NS.xdr, 'nvSpPr'), NS.xdr, 'cNvSpPr')?.getAttribute('txBox') === '1' || undefined,
  }
}

function parseFilterColumns(el: Element): Record<number, FilterSpec> {
  const out: Record<number, FilterSpec> = {}
  for (const fc of kids(el, NS.main, 'filterColumn')) {
    const col = Number(fc.getAttribute('colId') ?? 0)
    const filters = kid(fc, NS.main, 'filters')
    const custom = kid(fc, NS.main, 'customFilters')
    const top = kid(fc, NS.main, 'top10')
    const dyn = kid(fc, NS.main, 'dynamicFilter')
    if (filters) out[col] = { kind: 'values', values: kids(filters, NS.main, 'filter').map((f) => f.getAttribute('val') ?? ''), blanks: filters.getAttribute('blank') === '1' }
    else if (custom) {
      const list = kids(custom, NS.main, 'customFilter').map((f) => {
        const op = f.getAttribute('operator') ?? 'equal'
        let v = f.getAttribute('val') ?? ''
        let fop: string = { equal: 'eq', notEqual: 'ne', greaterThan: 'gt', greaterThanOrEqual: 'ge', lessThan: 'lt', lessThanOrEqual: 'le' }[op] ?? 'eq'
        if ((fop === 'eq' || fop === 'ne') && /^\*.*\*$/.test(v) && v.length > 1) {
          fop = fop === 'eq' ? 'contains' : 'notContains'
          v = v.slice(1, -1)
        } else if ((fop === 'eq' || fop === 'ne') && v.endsWith('*') && !v.startsWith('*')) {
          fop = fop === 'eq' ? 'begins' : 'notBegins'
          v = v.slice(0, -1)
        } else if ((fop === 'eq' || fop === 'ne') && v.startsWith('*') && !v.endsWith('*')) {
          fop = fop === 'eq' ? 'ends' : 'notEnds'
          v = v.slice(1)
        }
        return { op: fop as never, value: v }
      })
      if (list[0]) out[col] = { kind: 'custom', and: custom.getAttribute('and') === '1', c1: list[0], c2: list[1] }
    } else if (top) out[col] = { kind: 'top10', top: top.getAttribute('top') !== '0', percent: top.getAttribute('percent') === '1', n: Number(top.getAttribute('val') ?? 10) }
    else if (dyn) {
      const t = dyn.getAttribute('type') ?? ''
      if (t === 'aboveAverage' || t === 'belowAverage') out[col] = { kind: 'average', above: t === 'aboveAverage' }
      else out[col] = { kind: 'dynamic', period: t as never }
    }
  }
  return out
}

const PERM_FROM: [keyof typeof PERM_ATTR, string, boolean][] = Object.entries(PERM_ATTR).map(([k, a]) => [k as keyof typeof PERM_ATTR, a, k === 'selectLocked' || k === 'selectUnlocked' || k === 'objects' || k === 'scenarios'])

/** Reads drawings, tables, filters, protection, breaks and sparklines from the package. */
export async function readPackageExtras(data: ArrayBuffer, wb: Workbook): Promise<void> {
  if (typeof DOMParser === 'undefined') return
  const JSZip = await loadZip()
  const zip = await JSZip.loadAsync(data)
  const wbXml = await zip.file('xl/workbook.xml')?.async('string')
  if (!wbXml) return
  const wdoc = parseXml(wbXml)
  const wrels = await relsOf(zip, 'xl/workbook.xml')
  const prot = deep(wdoc, NS.main, 'workbookProtection')[0]
  if (prot && prot.getAttribute('lockStructure') === '1') wb.protection = { hash: prot.getAttribute('workbookPassword') ?? (prot.getAttribute('workbookHashValue') ? '*' : ''), structure: true }
  // people who wrote threaded comments
  const persons = new Map<string, string>()
  for (const rel of wrels.values()) {
    if (rel.type !== REL_PERSON) continue
    const pxml = await zip.file(rel.target)?.async('string')
    if (pxml) for (const p of deep(parseXml(pxml), THREADED_NS, 'person')) persons.set(p.getAttribute('id') ?? '', p.getAttribute('displayName') ?? 'Author')
  }
  // slicer caches (what each slicer filters)
  const slicerCaches = new Map<string, ReadSlicerCache>()
  for (const rel of wrels.values()) {
    if (rel.type !== REL_SLICER_CACHE) continue
    const cxml = await zip.file(rel.target)?.async('string')
    const sc = cxml ? parseSlicerCache(parseXml(cxml)) : null
    if (sc) slicerCaches.set(sc.name, sc)
  }
  const readPivots: { pivot: PivotDef; cache: ReadCache }[] = []
  const tablesById = new Map<number, TableDef>()
  const pendingSlicers: { sheet: Sheet; els: Element[]; frames: Map<string, Anchor> }[] = []
  const sheetEls = deep(wdoc, NS.main, 'sheet')
  for (const se of sheetEls) {
    const name = se.getAttribute('name') ?? ''
    const sheet = wb.sheetByName(name)
    const rid = se.getAttributeNS(NS.r, 'id') ?? se.getAttribute('r:id') ?? ''
    const part = wrels.get(rid)?.target
    if (!sheet || !part) continue
    const sxml = await zip.file(part)?.async('string')
    if (!sxml) continue
    const sdoc = parseXml(sxml)
    const root = sdoc.documentElement
    const srels = await relsOf(zip, part)
    const x = sheet.x
    // protection
    const sp = kid(root, NS.main, 'sheetProtection')
    if (sp && sp.getAttribute('sheet') === '1') {
      const allow: Record<string, boolean> = {}
      for (const [k, a, inverted] of PERM_FROM) {
        const v = sp.getAttribute(a)
        if (inverted) allow[k] = v !== '1'
        else allow[k] = v === '0'
      }
      x.protection = { hash: sp.getAttribute('password') ?? (sp.getAttribute('hashValue') ? '*' : ''), allow }
    }
    const pr = kid(root, NS.main, 'protectedRanges')
    for (const p of kids(pr, NS.main, 'protectedRange')) {
      const rg = parseRange((p.getAttribute('sqref') ?? '').split(' ')[0].replace(/\$/g, ''))
      if (rg) x.editRanges.push({ title: p.getAttribute('name') ?? 'Range', range: rg, hash: p.getAttribute('password') ?? '' })
    }
    // sheet AutoFilter
    const af = kid(root, NS.main, 'autoFilter')
    if (af) {
      const rg = parseRange((af.getAttribute('ref') ?? '').replace(/\$/g, ''))
      if (rg) {
        x.autoFilter = { range: rg, filters: parseFilterColumns(af) }
        for (let r = rg.r1 + 1; r <= rg.r2; r++) if (sheet.rows.hidden.has(r) && Object.keys(x.autoFilter.filters).length) x.filtered.push(r)
      }
    }
    // page breaks
    for (const b of kids(kid(root, NS.main, 'rowBreaks'), NS.main, 'brk')) x.rowBreaks.push(Number(b.getAttribute('id') ?? 0))
    for (const b of kids(kid(root, NS.main, 'colBreaks'), NS.main, 'brk')) x.colBreaks.push(Number(b.getAttribute('id') ?? 0))
    // tables
    for (const tp of deep(kid(root, NS.main, 'tableParts'), NS.main, 'tablePart')) {
      const t = srels.get(tp.getAttributeNS(NS.r, 'id') ?? '')?.target
      const txml = t ? await zip.file(t)?.async('string') : undefined
      if (!txml) continue
      const tdoc = parseXml(txml).documentElement
      const rg = parseRange((tdoc.getAttribute('ref') ?? '').replace(/\$/g, ''))
      if (!rg) continue
      const style = kid(tdoc, NS.main, 'tableStyleInfo')
      const taf = kid(tdoc, NS.main, 'autoFilter')
      const cols = kids(kid(tdoc, NS.main, 'tableColumns'), NS.main, 'tableColumn').map((c) => {
        const fn = (c.getAttribute('totalsRowFunction') ?? 'none') as TotalFn
        return {
          name: c.getAttribute('name') ?? 'Column',
          total: (['none', 'sum', 'average', 'count', 'countNums', 'max', 'min', 'stdDev', 'var', 'custom'].includes(fn) ? fn : 'none') as TotalFn,
          totalLabel: c.getAttribute('totalsRowLabel') ?? undefined,
          totalFormula: kid(c, NS.main, 'totalsRowFormula')?.textContent ?? undefined,
          calc: kid(c, NS.main, 'calculatedColumnFormula')?.textContent?.replace(/^=/, '') ?? undefined,
        }
      })
      const header = tdoc.getAttribute('headerRowCount') !== '0'
      const table: TableDef = {
        id: wb.newObjectId(),
        name: tdoc.getAttribute('displayName') ?? tdoc.getAttribute('name') ?? `Table${x.tables.length + 1}`,
        range: rg,
        header,
        totals: Number(tdoc.getAttribute('totalsRowCount') ?? 0) > 0,
        style: style?.getAttribute('name') ?? 'none',
        bandRows: style?.getAttribute('showRowStripes') === '1',
        bandCols: style?.getAttribute('showColumnStripes') === '1',
        firstCol: style?.getAttribute('showFirstColumn') === '1',
        lastCol: style?.getAttribute('showLastColumn') === '1',
        filterButton: !!taf,
        columns: cols,
        filters: taf ? parseFilterColumns(taf) : {},
      }
      x.tables.push(table)
      if (tdoc.getAttribute('id')) tablesById.set(Number(tdoc.getAttribute('id')), table)
      if (Object.keys(table.filters).length) {
        const rows = tableRows(table)
        for (let r = rows.d1; r <= rows.d2; r++) if (sheet.rows.hidden.has(r)) x.filtered.push(r)
      }
    }
    // background picture
    const pic = kid(root, NS.main, 'picture')
    const picTarget = pic ? srels.get(pic.getAttributeNS(NS.r, 'id') ?? '')?.target : undefined
    const picFile = picTarget ? zip.file(picTarget) : null
    const picExt = (picTarget ?? '').split('.').pop()?.toLowerCase() ?? ''
    if (picFile && MIME[picExt]) sheet.page.background = wb.addImage(`data:${MIME[picExt]};base64,${b64(await picFile.async('uint8array'))}`)
    // PivotTables
    for (const rel of srels.values()) {
      if (rel.type !== REL_PIVOT_TABLE) continue
      const res = await readPivotTable(zip, relsOf as never, rel.target, parseXml, wb, sheet, (n) => /^TableStyle(Light|Medium|Dark)\d+$/.test(n))
      if (!res) continue
      x.pivots.push(res.pivot)
      readPivots.push(res)
    }
    const slicerFrames = new Map<string, Anchor>()
    // drawings
    const dr = kid(root, NS.main, 'drawing')
    const dpart = dr ? srels.get(dr.getAttributeNS(NS.r, 'id') ?? '')?.target : undefined
    const dxml = dpart ? await zip.file(dpart)?.async('string') : undefined
    if (dpart && dxml) {
      const ddoc = parseXml(dxml).documentElement
      const drels = await relsOf(zip, dpart)
      for (const an of [...ddoc.children]) {
        if (!['twoCellAnchor', 'oneCellAnchor', 'absoluteAnchor'].includes(an.localName)) continue
        const anchor = anchorOf(an, sheet)
        if (!anchor) continue
        const slicerEl = [...an.getElementsByTagNameNS('http://schemas.microsoft.com/office/drawing/2010/slicer', 'slicer')][0]
        if (slicerEl) {
          slicerFrames.set(slicerEl.getAttribute('name') ?? '', anchor)
          continue
        }
        const item = [...an.children].find((c) => ['pic', 'sp', 'cxnSp', 'graphicFrame', 'grpSp'].includes(c.localName))
        if (!item) continue
        const cNvPr = deep(item, NS.xdr, 'cNvPr')[0]
        const name = cNvPr?.getAttribute('name') ?? item.localName
        const id = wb.newObjectId()
        let obj: SheetObject | null = null
        if (item.localName === 'pic') {
          const blip = deep(item, NS.a, 'blip')[0]
          const target = blip ? drels.get(blip.getAttributeNS(NS.r, 'embed') ?? '')?.target : undefined
          const file = target ? zip.file(target) : null
          const ext = (target ?? '').split('.').pop()?.toLowerCase() ?? ''
          if (file && MIME[ext]) {
            const bytes = await file.async('uint8array')
            const image = wb.addImage(`data:${MIME[ext]};base64,${b64(bytes)}`)
            const xf = deep(item, NS.a, 'xfrm')[0]
            obj = { kind: 'picture', id, name, anchor, image, alt: cNvPr?.getAttribute('descr') ?? undefined, rotation: xf?.getAttribute('rot') ? Math.round(Number(xf.getAttribute('rot')) / 60000) : 0, border: colorOf(kid(kid(item, NS.xdr, 'spPr'), NS.a, 'ln')) }
          }
        } else if (item.localName === 'sp' || item.localName === 'cxnSp') {
          obj = parseShape(item, { id, name, anchor })
        } else if (item.localName === 'graphicFrame') {
          const chartRef = deep(item, NS.c, 'chart')[0]
          const target = chartRef ? drels.get(chartRef.getAttributeNS(NS.r, 'id') ?? '')?.target : undefined
          const cxml = target ? await zip.file(target)?.async('string') : undefined
          if (cxml) obj = parseChart(parseXml(cxml), { id, name, anchor })
        }
        if (obj) x.objects.push(obj)
      }
    }
    // sparklines
    for (const g of deep(root, NS.x14, 'sparklineGroup')) {
      const t = g.getAttribute('type')
      const type: Sparkline['type'] = t === 'column' ? 'column' : t === 'stacked' ? 'winloss' : 'line'
      const rgbOf = (name: string, def: string) => {
        const e = kid(g, NS.x14, name)
        const v = e?.getAttribute('rgb')
        return v && v.length === 8 ? '#' + v.slice(2) : def
      }
      const group = wb.newObjectId()
      for (const s of deep(g, NS.x14, 'sparkline')) {
        const f = deep(s, NS.xm, 'f')[0]?.textContent ?? ''
        const ref = parseRange((deep(s, NS.xm, 'sqref')[0]?.textContent ?? '').replace(/\$/g, ''))
        if (!ref || !f) continue
        x.sparklines.push({
          id: wb.newObjectId(),
          group,
          type,
          source: f,
          r: ref.r1,
          c: ref.c1,
          color: rgbOf('colorSeries', '#2E6FD8'),
          negColor: rgbOf('colorNegative', '#E04B3A'),
          markers: g.getAttribute('markers') === '1',
          high: g.getAttribute('high') === '1',
          low: g.getAttribute('low') === '1',
          first: g.getAttribute('first') === '1',
          last: g.getAttribute('last') === '1',
          negative: g.getAttribute('negative') === '1',
        })
      }
    }
    // threaded comments replace the legacy notes written for older programs
    for (const rel of srels.values()) {
      if (rel.type !== REL_THREADED) continue
      const txml = await zip.file(rel.target)?.async('string')
      if (!txml) continue
      const roots = new Map<string, { key: number; thread: CommentThread }>()
      for (const el of deep(parseXml(txml), THREADED_NS, 'threadedComment')) {
        const rg = parseRange(el.getAttribute('ref') ?? '')
        if (!rg) continue
        const item = { author: persons.get(el.getAttribute('personId') ?? '') ?? 'Author', text: deep(el, THREADED_NS, 'text')[0]?.textContent ?? '', date: el.getAttribute('dT') ?? '' }
        const parent = el.getAttribute('parentId')
        if (parent && roots.has(parent)) roots.get(parent)!.thread.items.push(item)
        else roots.set(el.getAttribute('id') ?? String(roots.size), { key: cellKey(rg.r1, rg.c1), thread: { resolved: el.getAttribute('done') === '1', items: [item] } })
      }
      for (const { key, thread } of roots.values()) {
        x.comments[key] = thread
        delete x.notes[key]
      }
    }
    // slicer parts: resolved after every sheet (a slicer may filter a PivotTable on another sheet)
    const slicerEls: Element[] = []
    for (const rel of srels.values()) {
      if (rel.type !== REL_SLICER) continue
      const sx = await zip.file(rel.target)?.async('string')
      if (sx) slicerEls.push(...deep(parseXml(sx), NS_X14, 'slicer'))
    }
    if (slicerEls.length) pendingSlicers.push({ sheet, els: slicerEls, frames: slicerFrames })
    x.filtered = [...new Set(x.filtered)].sort((a, b) => a - b)
  }
  for (const ps of pendingSlicers) ps.sheet.x.objects.push(...slicersFromParts(ps.els, slicerCaches, ps.frames, { pivots: readPivots, tablesById, newId: () => wb.newObjectId() }))
}

void MAX_COLS

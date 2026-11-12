// Charts as DrawingML chart parts (c:chartSpace) with an embedded workbook holding the data,
// so other presentation programs show real, editable charts.
import type JSZipType from 'jszip'
import type { ChartElement, ChartGrouping, ChartSeries, ChartType, ColorRef, ErrorBars, Trendline } from '../model/types'
import { resolveColor, type ThemeColors } from '../model/color'
import { seriesColor } from '../model/chart'
import { escXml } from './drawingml'

export const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
export const CHART_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'
export const PACKAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package'
export const CHART_CT = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
export const XLSX_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const col = (i: number) => {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const hex = (c: string) => c.replace('#', '').toUpperCase().slice(0, 6)

function solid(ref: ColorRef, colors: ThemeColors) {
  return `<a:solidFill><a:srgbClr val="${hex(resolveColor(ref, colors))}"/></a:solidFill>`
}

function strCache(values: string[]) {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${escXml(v)}</c:v></c:pt>`).join('')}</c:strCache>`
}

function numCache(values: (number | null)[]) {
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => (v === null || v === undefined ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache>`
}

function richText(text: string, size: number, color: string, rot?: number) {
  return `<c:tx><c:rich><a:bodyPr${rot ? ` rot="${rot}" vert="horz"` : ''}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="${size}" b="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escXml(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/>`
}

const LABEL_POS: Record<string, string> = { center: 'ctr', insideEnd: 'inEnd', insideBase: 'inBase', outsideEnd: 'outEnd', bestFit: 'bestFit', above: 't', below: 'b', left: 'l', right: 'r' }
/** Positions each chart group accepts (area charts take none). */
const GROUP_POS: Record<string, string[]> = { bar: ['ctr', 'inEnd', 'inBase', 'outEnd'], line: ['ctr', 'l', 'r', 't', 'b'], scatter: ['ctr', 'l', 'r', 't', 'b'], pie: ['bestFit', 'ctr', 'inEnd', 'outEnd'], area: [] }

function dLbls(c: ChartElement, kind: 'bar' | 'line' | 'area' | 'pie' | 'scatter') {
  const show = c.labelShow ?? {}
  const on = c.dataLabels
  const value = on && (show.value ?? !(show.category || show.series || show.percent))
  const pos = c.labelPos ? LABEL_POS[c.labelPos] : null
  const posXml = on && pos && GROUP_POS[kind].includes(pos) ? `<c:dLblPos val="${pos}"/>` : ''
  const b = (v: boolean | undefined) => (on && v ? 1 : 0)
  return `<c:dLbls>${posXml}<c:showLegendKey val="0"/><c:showVal val="${value ? 1 : 0}"/><c:showCatName val="${b(show.category)}"/><c:showSerName val="${b(show.series)}"/><c:showPercent val="${kind === 'pie' ? b(show.percent) : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`
}

function trendlineXml(s: ChartSeries, color: string, colors: ThemeColors) {
  const t = s.trendline
  if (!t) return ''
  const extra = t.type === 'polynomial' ? `<c:order val="${Math.max(2, Math.min(6, t.order ?? 2))}"/>` : t.type === 'movingAvg' ? `<c:period val="${Math.max(2, t.period ?? 2)}"/>` : ''
  const forward = t.forward && t.type !== 'movingAvg' ? `<c:forward val="${t.forward}"/>` : ''
  return `<c:trendline><c:spPr><a:ln w="19050" cap="rnd">${solid(color, colors)}<a:prstDash val="sysDot"/></a:ln></c:spPr><c:trendlineType val="${t.type}"/>${extra}${forward}<c:dispRSqr val="${t.showR2 ? 1 : 0}"/><c:dispEq val="${t.showEquation ? 1 : 0}"/></c:trendline>`
}

const ERR_VAL: Record<ErrorBars['type'], string> = { fixed: 'fixedVal', percent: 'percentage', stdDev: 'stdDev', stdErr: 'stdErr' }

function errBarsXml(s: ChartSeries, scatter: boolean) {
  const e = s.errorBars
  if (!e) return ''
  const val = e.type === 'stdErr' ? '' : `<c:val val="${e.value}"/>`
  return `<c:errBars>${scatter ? '<c:errDir val="y"/>' : ''}<c:errBarType val="${e.dir}"/><c:errValType val="${ERR_VAL[e.type]}"/><c:noEndCap val="${e.noCap ? 1 : 0}"/>${val}<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="404040"/></a:solidFill></a:ln></c:spPr></c:errBars>`
}

function seriesXml(c: ChartElement, s: ChartSeries, i: number, colors: ThemeColors, kind: 'bar' | 'line' | 'area' | 'pie' | 'scatter') {
  const n = c.categories.length
  const color = seriesColor(c, i, c.series.length, s.color)
  const tx = `<c:tx><c:strRef><c:f>Sheet1!$${col(i + 1)}$1</c:f>${strCache([s.name])}</c:strRef></c:tx>`
  const catRef = `Sheet1!$A$2:$A$${n + 1}`
  const valRef = `Sheet1!$${col(i + 1)}$2:$${col(i + 1)}$${n + 1}`
  const cat = `<c:cat><c:strRef><c:f>${catRef}</c:f>${strCache(c.categories)}</c:strRef></c:cat>`
  const val = `<c:val><c:numRef><c:f>${valRef}</c:f>${numCache(s.values)}</c:numRef></c:val>`
  const head = `<c:idx val="${i}"/><c:order val="${i}"/>${tx}`
  const trend = (c.grouping === 'clustered' || kind === 'scatter' ? trendlineXml(s, color, colors) : '') + (c.grouping !== 'percent' && kind !== 'pie' && !(c.threeD && kind === 'bar') ? errBarsXml(s, kind === 'scatter') : '')
  switch (kind) {
    case 'bar':
      return `<c:ser>${head}<c:spPr>${solid(color, colors)}<a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>${trend}${cat}${val}</c:ser>`
    case 'area':
      return `<c:ser>${head}<c:spPr>${solid(color, colors)}<a:ln><a:noFill/></a:ln></c:spPr>${trend}${cat}${val}</c:ser>`
    case 'line': {
      const marker = c.markers ? `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${solid(color, colors)}</c:spPr></c:marker>` : '<c:marker><c:symbol val="none"/></c:marker>'
      return `<c:ser>${head}<c:spPr><a:ln w="28575" cap="rnd">${solid(color, colors)}<a:round/></a:ln></c:spPr>${marker}${trend}${cat}${val}<c:smooth val="${c.smooth ? 1 : 0}"/></c:ser>`
    }
    case 'pie': {
      const pts = c.categories.map((_, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr>${solid(seriesColor(c, j, n, null), colors)}<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('')
      return `<c:ser>${head}${pts}${cat}${val}</c:ser>`
    }
    case 'scatter': {
      const xRef = `<c:xVal><c:numRef><c:f>${catRef}</c:f>${numCache(c.categories.map((x) => (Number.isFinite(parseFloat(x)) ? parseFloat(x) : null)))}</c:numRef></c:xVal>`
      const yRef = `<c:yVal><c:numRef><c:f>${valRef}</c:f>${numCache(s.values)}</c:numRef></c:yVal>`
      return `<c:ser>${head}<c:spPr><a:ln w="25400"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${solid(color, colors)}</c:spPr></c:marker>${trend}${xRef}${yRef}<c:smooth val="0"/></c:ser>`
    }
  }
}

function axesXml(c: ChartElement, textColor: string, horizontalBars: boolean, scatter: boolean) {
  const grid = c.gridlines.major && c.style !== 2 && c.style !== 4 ? '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : ''
  const minor = c.gridlines.minor ? '<c:minorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="F2F2F2"/></a:solidFill></a:ln></c:spPr></c:minorGridlines>' : ''
  const txPr = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1197"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`
  const scaling = `<c:scaling><c:orientation val="minMax"/>${c.axes.max != null ? `<c:max val="${c.axes.max}"/>` : ''}${c.axes.min != null ? `<c:min val="${c.axes.min}"/>` : ''}</c:scaling>`
  const catTitle = c.axes.catTitle ? `<c:title>${richText(c.axes.catTitle, 1330, textColor, horizontalBars ? -5400000 : undefined)}</c:title>` : ''
  const valTitle = c.axes.valTitle ? `<c:title>${richText(c.axes.valTitle, 1330, textColor, horizontalBars ? undefined : -5400000)}</c:title>` : ''
  const axLine = '<c:spPr><a:noFill/><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>'
  const catAx = scatter
    ? `<c:valAx><c:axId val="500000001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${c.axes.cat ? 0 : 1}"/><c:axPos val="b"/>${grid}${catTitle}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txPr}<c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
    : `<c:catAx><c:axId val="500000001"/><c:scaling><c:orientation val="${horizontalBars ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="${c.axes.cat ? 0 : 1}"/><c:axPos val="${horizontalBars ? 'l' : 'b'}"/>${catTitle}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txPr}<c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
  const valAx = `<c:valAx><c:axId val="500000002"/>${scaling}<c:delete val="${c.axes.val ? 0 : 1}"/><c:axPos val="${horizontalBars ? 'b' : 'l'}"/>${horizontalBars ? '' : grid}${minor}${valTitle}<c:numFmt formatCode="${c.grouping === 'percent' ? '0%' : 'General'}" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr}<c:crossAx val="500000001"/><c:crosses val="${horizontalBars ? 'max' : 'autoZero'}"/><c:crossBetween val="${scatter ? 'midCat' : 'between'}"/></c:valAx>`
  return catAx + valAx
}

/** Axes for series on the secondary axis: a hidden category axis and a value axis on the right. */
function secondaryAxesXml(c: ChartElement, textColor: string, scatter: boolean) {
  const txPr = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1197"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`
  const title = c.axes.secTitle ? `<c:title>${richText(c.axes.secTitle, 1330, textColor, 5400000)}</c:title>` : ''
  const cat = scatter
    ? `<c:valAx><c:axId val="500000003"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="1"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500000004"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
    : `<c:catAx><c:axId val="500000003"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="1"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500000004"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
  const val = `<c:valAx><c:axId val="500000004"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${c.axes.val ? 0 : 1}"/><c:axPos val="r"/>${title}<c:numFmt formatCode="${c.grouping === 'percent' ? '0%' : 'General'}" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr}<c:crossAx val="500000003"/><c:crosses val="max"/><c:crossBetween val="${scatter ? 'midCat' : 'between'}"/></c:valAx>`
  return cat + val
}

const GROUPING: Record<ChartGrouping, string> = { clustered: 'clustered', stacked: 'stacked', percent: 'percentStacked' }

export function chartSpaceXml(c: ChartElement, colors: ThemeColors, font: string, workbookRel: string | null) {
  const textColor = hex(resolveColor(c.style === 6 || c.style === 7 ? '#F2F2F2' : 'theme:tx1:l35', colors))
  const AX1 = '<c:axId val="500000001"/><c:axId val="500000002"/>'
  const AX2 = '<c:axId val="500000003"/><c:axId val="500000004"/>'
  const horizontal = c.chartType === 'bar'
  const sec = (i: number) => !horizontal && !!c.series[i]?.secondary
  const hasSec = c.series.some((_, i) => sec(i))
  const series = (kind: 'bar' | 'line' | 'area' | 'pie' | 'scatter', filter?: (i: number) => boolean) =>
    c.series
      .map((s, i) => (filter && !filter(i) ? '' : seriesXml(c, s, i, colors, kind)))
      .join('')
  const grouping = GROUPING[c.grouping]
  const lineGrouping = c.grouping === 'clustered' ? 'standard' : grouping
  const gap = c.style === 2 || c.style === 8 ? 80 : 219
  /** One chart group per value axis (the secondary one only when a series uses it). */
  const groups = (make: (filter: (i: number) => boolean, axIds: string) => string, keep: (i: number) => boolean = () => true) =>
    [false, true]
      .filter((s2) => (s2 ? hasSec : true) && c.series.some((_, i) => keep(i) && sec(i) === s2))
      .map((s2) => make((i) => keep(i) && sec(i) === s2, s2 ? AX2 : AX1))
      .join('')
  const bar = (dir: string, grp: string, overlap: string) => (f: (i: number) => boolean, ax: string) =>
    c.threeD && c.chartType !== 'combo'
      ? `<c:bar3DChart><c:barDir val="${dir}"/><c:grouping val="${grp}"/><c:varyColors val="0"/>${series('bar', f)}${dLbls(c, 'bar')}<c:gapWidth val="150"/><c:shape val="box"/>${ax}</c:bar3DChart>`
      : `<c:barChart><c:barDir val="${dir}"/><c:grouping val="${grp}"/><c:varyColors val="0"/>${series('bar', f)}${dLbls(c, 'bar')}<c:gapWidth val="${gap}"/>${overlap}${ax}</c:barChart>`
  const line = (grp: string) => (f: (i: number) => boolean, ax: string) => `<c:lineChart><c:grouping val="${grp}"/><c:varyColors val="0"/>${series('line', f)}${dLbls(c, 'line')}<c:marker val="1"/>${ax}</c:lineChart>`
  const area = (grp: string) => (f: (i: number) => boolean, ax: string) => `<c:areaChart><c:grouping val="${grp}"/><c:varyColors val="0"/>${series('area', f)}${dLbls(c, 'area')}${ax}</c:areaChart>`
  const scatterGroup = (f: (i: number) => boolean, ax: string) => `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series('scatter', f)}${dLbls(c, 'scatter')}${ax}</c:scatterChart>`
  const axes = (scatter: boolean) => axesXml(c, textColor, horizontal, scatter) + (hasSec ? secondaryAxesXml(c, textColor, scatter) : '')
  let plot = ''
  switch (c.chartType) {
    case 'column':
    case 'bar':
      plot = groups(bar(horizontal ? 'bar' : 'col', grouping, c.grouping === 'clustered' ? '<c:overlap val="-27"/>' : '<c:overlap val="100"/>')) + axes(false)
      break
    case 'line':
      plot = groups(line(lineGrouping)) + axes(false)
      break
    case 'area':
      plot = groups(area(lineGrouping)) + axes(false)
      break
    case 'pie':
      plot = c.threeD ? `<c:pie3DChart><c:varyColors val="1"/>${series('pie', (i) => i === 0)}${dLbls(c, 'pie')}</c:pie3DChart>` : `<c:pieChart><c:varyColors val="1"/>${series('pie', (i) => i === 0)}${dLbls(c, 'pie')}<c:firstSliceAng val="0"/></c:pieChart>`
      break
    case 'doughnut':
      plot = `<c:doughnutChart><c:varyColors val="1"/>${series('pie', (i) => i === 0)}${dLbls(c, 'pie')}<c:firstSliceAng val="0"/><c:holeSize val="50"/></c:doughnutChart>`
      break
    case 'scatter':
      plot = groups(scatterGroup) + axes(true)
      break
    case 'combo': {
      const type = (i: number) => c.series[i].type ?? (i === 0 ? 'column' : 'line')
      const areas = groups(area('standard'), (i) => type(i) === 'area')
      const bars = groups(bar('col', 'clustered', '<c:overlap val="-27"/>'), (i) => type(i) === 'column')
      const lines = groups(line('standard'), (i) => type(i) === 'line')
      plot = `${areas}${bars}${lines}${axes(false)}`
      break
    }
  }
  const title = c.title.show ? `<c:title>${richText(c.title.text || 'Chart Title', 1862, textColor)}</c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>'
  const legend = c.legend.show ? `<c:legend><c:legendPos val="${{ right: 'r', bottom: 'b', top: 't', left: 'l' }[c.legend.pos]}"/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1197"><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:legend>` : ''
  const threeD = c.threeD && (c.chartType === 'pie' || c.chartType === 'column' || c.chartType === 'bar')
  const view3d = threeD ? (c.chartType === 'pie' ? '<c:view3D><c:rotX val="30"/><c:rotY val="0"/><c:rAngAx val="0"/></c:view3D>' : '<c:view3D><c:rotX val="15"/><c:rotY val="20"/><c:rAngAx val="1"/></c:view3D><c:floor><c:thickness val="0"/></c:floor><c:sideWall><c:thickness val="0"/></c:sideWall><c:backWall><c:thickness val="0"/></c:backWall>') : ''
  const dark = c.style === 6 || c.style === 7
  const areaFill = c.fill.type === 'solid' ? solid(c.fill.color, colors) : dark ? solid('theme:tx1:l15', colors) : '<a:noFill/>'
  const areaLine = c.line ? `<a:ln w="${Math.round(c.line.width * 12700)}">${solid(c.line.color, colors)}</a:ln>` : '<a:ln><a:noFill/></a:ln>'
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    '<c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/>' +
    `<c:chart>${title}${view3d}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr>${areaFill}${areaLine}</c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="${escXml(font)}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>` +
    (workbookRel ? `<c:externalData r:id="${workbookRel}"><c:autoUpdate val="0"/></c:externalData>` : '') +
    '</c:chartSpace>'
  )
}

/** A minimal workbook with the chart data on Sheet1 (series in columns, categories in column A). */
export async function chartWorkbook(JSZip: typeof JSZipType, c: ChartElement): Promise<Uint8Array> {
  const zip = new JSZip()
  const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const cell = (ref: string, v: string | number | null) =>
    v === null || v === '' ? '' : typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${escXml(v)}</t></is></c>`
  const rows: string[] = []
  rows.push(`<row r="1">${cell('A1', '')}${c.series.map((s, i) => cell(`${col(i + 1)}1`, s.name)).join('')}</row>`)
  c.categories.forEach((cat, r) => {
    const isNum = c.chartType === 'scatter' && Number.isFinite(parseFloat(cat))
    rows.push(`<row r="${r + 2}">${cell(`A${r + 2}`, isNum ? parseFloat(cat) : cat)}${c.series.map((s, i) => cell(`${col(i + 1)}${r + 2}`, s.values[r] ?? null)).join('')}</row>`)
  })
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  )
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${S}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${S}"><sheetData>${rows.join('')}</sheetData></worksheet>`)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// ---------- Import ----------

function kids(el: Element | null | undefined, local: string): Element[] {
  return el ? Array.from(el.children).filter((c) => c.localName === local) : []
}

function kid(el: Element | null | undefined, local: string): Element | null {
  return kids(el, local)[0] ?? null
}

function cacheValues(ref: Element | null): string[] {
  if (!ref) return []
  const cache = ref.getElementsByTagNameNS('*', 'strCache')[0] ?? ref.getElementsByTagNameNS('*', 'numCache')[0] ?? ref.getElementsByTagNameNS('*', 'strLit')[0] ?? ref.getElementsByTagNameNS('*', 'numLit')[0]
  if (!cache) return []
  const count = Number(kid(cache, 'ptCount')?.getAttribute('val') ?? 0)
  const out: string[] = Array(count).fill('')
  for (const pt of kids(cache, 'pt')) out[Number(pt.getAttribute('idx') ?? 0)] = kid(pt, 'v')?.textContent ?? ''
  return out
}

function colorOf(spPr: Element | null): ColorRef | null {
  const fill = kid(spPr, 'solidFill') ?? kid(kid(spPr, 'ln'), 'solidFill')
  const srgb = kid(fill, 'srgbClr')?.getAttribute('val')
  if (srgb) return `#${srgb}`
  const scheme = kid(fill, 'schemeClr')?.getAttribute('val')
  if (scheme && /^accent[1-6]$/.test(scheme)) return `theme:${scheme}`
  return null
}

function richTextOf(title: Element | null): string {
  if (!title) return ''
  return Array.from(title.getElementsByTagNameNS('*', 't'))
    .map((t) => t.textContent)
    .join('')
}

/** Reads a chart part into chart properties (data comes from the cached values). */
export function parseChartSpace(xml: string): Omit<ChartElement, 'id' | 'name' | 'x' | 'y' | 'w' | 'h' | 'rot' | 'type'> | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const chart = doc.getElementsByTagNameNS('*', 'chart')[0]
  const plot = kid(chart, 'plotArea')
  if (!plot) return null
  const typeEls = Array.from(plot.children).filter((c) => /Chart$/.test(c.localName))
  if (!typeEls.length) return null
  const first = typeEls[0]
  let chartType: ChartType = 'column'
  let grouping: ChartGrouping = 'clustered'
  const groupingAttr = kid(first, 'grouping')?.getAttribute('val')
  if (groupingAttr === 'stacked') grouping = 'stacked'
  if (groupingAttr === 'percentStacked') grouping = 'percent'
  switch (first.localName) {
    case 'barChart':
    case 'bar3DChart':
      chartType = kid(first, 'barDir')?.getAttribute('val') === 'bar' ? 'bar' : 'column'
      break
    case 'lineChart':
    case 'line3DChart':
      chartType = 'line'
      break
    case 'pieChart':
    case 'pie3DChart':
    case 'ofPieChart':
      chartType = 'pie'
      break
    case 'doughnutChart':
      chartType = 'doughnut'
      break
    case 'areaChart':
    case 'area3DChart':
      chartType = 'area'
      break
    case 'scatterChart':
    case 'bubbleChart':
      chartType = 'scatter'
      break
    case 'radarChart':
      chartType = 'line'
      break
  }
  if (typeEls.length > 1) chartType = 'combo'
  let categories: string[] = []
  const series: ChartSeries[] = []
  let markers = false
  let smooth = false
  // Value axes on the right belong to the secondary axis.
  const rightAxes = new Set(kids(plot, 'valAx').filter((ax) => kid(ax, 'axPos')?.getAttribute('val') === 'r').map((ax) => kid(ax, 'axId')?.getAttribute('val')))
  for (const t of typeEls) {
    const kind = /bar/i.test(t.localName) ? 'column' : /area/i.test(t.localName) ? 'area' : 'line'
    const secondary = kids(t, 'axId').some((a) => rightAxes.has(a.getAttribute('val')))
    for (const ser of kids(t, 'ser')) {
      const name = cacheValues(kid(kid(ser, 'tx'), 'strRef'))[0] ?? kid(kid(ser, 'tx'), 'v')?.textContent ?? `Series ${series.length + 1}`
      const cats = cacheValues(kid(ser, 'cat') ?? kid(ser, 'xVal'))
      if (cats.length > categories.length) categories = cats
      const vals = cacheValues(kid(ser, 'val') ?? kid(ser, 'yVal')).map((v) => (v === '' ? null : Number(v)))
      const marker = kid(kid(ser, 'marker'), 'symbol')?.getAttribute('val')
      if (marker && marker !== 'none') markers = true
      if (kid(ser, 'smooth')?.getAttribute('val') === '1') smooth = true
      const tl = kid(ser, 'trendline')
      const tlType = kid(tl, 'trendlineType')?.getAttribute('val') as Trendline['type'] | undefined
      const trendline: Trendline | null = tl && tlType && ['linear', 'exponential', 'logarithmic', 'polynomial', 'power', 'movingAvg'].includes(tlType) ? { type: tlType, order: Number(kid(tl, 'order')?.getAttribute('val')) || undefined, period: Number(kid(tl, 'period')?.getAttribute('val')) || undefined, forward: Number(kid(tl, 'forward')?.getAttribute('val')) || undefined, showEquation: kid(tl, 'dispEq')?.getAttribute('val') === '1' || undefined, showR2: kid(tl, 'dispRSqr')?.getAttribute('val') === '1' || undefined } : null
      const eb = kid(ser, 'errBars')
      const ebType = Object.entries(ERR_VAL).find(([, v]) => v === kid(eb, 'errValType')?.getAttribute('val'))?.[0] as ErrorBars['type'] | undefined
      const errorBars: ErrorBars | null = eb && ebType && kid(eb, 'errDir')?.getAttribute('val') !== 'x' ? { type: ebType, value: Number(kid(eb, 'val')?.getAttribute('val') ?? 1) || (ebType === 'percent' ? 5 : 1), dir: (['both', 'plus', 'minus'].includes(kid(eb, 'errBarType')?.getAttribute('val') ?? '') ? kid(eb, 'errBarType')!.getAttribute('val') : 'both') as ErrorBars['dir'], ...(kid(eb, 'noEndCap')?.getAttribute('val') === '1' ? { noCap: true } : {}) } : null
      series.push({ name, values: vals, color: chartType === 'pie' || chartType === 'doughnut' ? null : colorOf(kid(ser, 'spPr')), type: chartType === 'combo' ? kind : undefined, ...(secondary ? { secondary: true } : {}), ...(trendline ? { trendline } : {}), ...(errorBars ? { errorBars } : {}) })
    }
  }
  if (!categories.length) categories = (series[0]?.values ?? []).map((_, i) => String(i + 1))
  const titleEl = kid(chart, 'title')
  const autoDeleted = kid(chart, 'autoTitleDeleted')?.getAttribute('val') === '1'
  const legendEl = kid(chart, 'legend')
  const legendPos = kid(legendEl, 'legendPos')?.getAttribute('val') ?? 'r'
  const dLblsEl = kid(first, 'dLbls')
  const flag = (name: string) => kid(dLblsEl, name)?.getAttribute('val') === '1'
  const dl = flag('showVal') || flag('showCatName') || flag('showSerName') || flag('showPercent') || first.getElementsByTagNameNS('*', 'showVal')[0]?.getAttribute('val') === '1'
  const posVal = kid(dLblsEl, 'dLblPos')?.getAttribute('val')
  const labelPos = (Object.entries({ center: 'ctr', insideEnd: 'inEnd', insideBase: 'inBase', outsideEnd: 'outEnd', bestFit: 'bestFit', above: 't', below: 'b', left: 'l', right: 'r' }).find(([, v]) => v === posVal)?.[0] ?? null) as ChartElement['labelPos']
  const labelShow = flag('showCatName') || flag('showSerName') || flag('showPercent') ? { value: flag('showVal'), category: flag('showCatName'), series: flag('showSerName'), percent: flag('showPercent') } : null
  const valAx = kids(plot, 'valAx')
  const catAx = kid(plot, 'catAx') ?? (chartType === 'scatter' ? valAx[0] : null)
  const valAxis = chartType === 'scatter' ? valAx[1] : valAx[0]
  const deleted = (ax: Element | null | undefined) => kid(ax, 'delete')?.getAttribute('val') === '1'
  const scaling = kid(valAxis, 'scaling')
  const num = (el: Element | null) => (el?.getAttribute('val') ? Number(el.getAttribute('val')) : null)
  return {
    chartType,
    grouping,
    ...(typeEls.length === 1 && (first.localName === 'bar3DChart' || first.localName === 'pie3DChart') ? { threeD: true } : {}),
    categories,
    series,
    title: { show: !!titleEl || (!autoDeleted && series.length === 1 && chartType !== 'scatter'), text: richTextOf(titleEl) || (series.length === 1 ? series[0].name : 'Chart Title') },
    legend: { show: !!legendEl, pos: legendPos === 'b' ? 'bottom' : legendPos === 't' ? 'top' : legendPos === 'l' ? 'left' : 'right' },
    dataLabels: dl,
    labelPos,
    labelShow,
    axes: { cat: !!catAx && !deleted(catAx), val: !!valAxis && !deleted(valAxis), catTitle: richTextOf(kid(catAx, 'title')) || null, valTitle: richTextOf(kid(valAxis, 'title')) || null, min: num(kid(scaling, 'min')), max: num(kid(scaling, 'max')), secTitle: richTextOf(kid(valAx.find((ax) => kid(ax, 'axPos')?.getAttribute('val') === 'r'), 'title')) || null },
    gridlines: { major: !!kid(valAxis, 'majorGridlines'), minor: !!kid(valAxis, 'minorGridlines') },
    style: 1,
    palette: 0,
    markers,
    smooth,
    fill: { type: 'none' },
    line: null,
  }
}

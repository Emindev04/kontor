import type { JSONContent } from '@tiptap/core'
import { PRESET_FROM_OOXML } from '../editor/shapePaths'
import { LARGE_OPS, OPERATORS, SYMBOLS } from '../editor/math'
import { DEFAULT_CHART, type ChartData, type ChartType } from '../editor/Chart'

// Reading drawing objects, charts and equations from .docx parts.

export const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
export const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
export const WPS_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'
export const C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
export const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
const EMU_PER_PX = 9525

const first = (el: Element | null | undefined, ns: string, name: string) => (el ? (el.getElementsByTagNameNS(ns, name)[0] ?? null) : null)
const child = (el: Element | null | undefined, ns: string, name: string) => (el ? (Array.from(el.children).find((c) => c.namespaceURI === ns && c.localName === name) ?? null) : null)
const childrenNS = (el: Element | null | undefined, ns: string, name?: string) => (el ? Array.from(el.children).filter((c) => c.namespaceURI === ns && (!name || c.localName === name)) : [])

/** Wrap mode and position of a drawing (`wp:inline` or `wp:anchor`). */
export function drawingLayout(drawing: Element): Record<string, unknown> {
  const anchor = first(drawing, WP_NS, 'anchor')
  if (!anchor) return { wrap: 'inline' }
  const px = (el: Element | null) => (el ? Math.round(Number(el.textContent) / EMU_PER_PX) || 0 : 0)
  const posH = child(anchor, WP_NS, 'positionH')
  const posV = child(anchor, WP_NS, 'positionV')
  const alignH = child(posH, WP_NS, 'align')?.textContent ?? null
  const offsetX = px(child(posH, WP_NS, 'posOffset'))
  const offsetY = px(child(posV, WP_NS, 'posOffset'))
  const align = alignH === 'right' || alignH === 'outside' ? 'right' : alignH === 'center' ? 'center' : offsetX > 300 ? 'right' : 'left'
  if (child(anchor, WP_NS, 'wrapNone')) return { wrap: anchor.getAttribute('behindDoc') === '1' ? 'behind' : 'front', offsetX, offsetY }
  if (child(anchor, WP_NS, 'wrapTopAndBottom')) return { wrap: 'topBottom', align }
  if (child(anchor, WP_NS, 'wrapTight')) return { wrap: 'tight', align }
  if (child(anchor, WP_NS, 'wrapThrough')) return { wrap: 'through', align }
  return { wrap: 'square', align }
}

export function drawingSize(drawing: Element) {
  const extent = first(drawing, WP_NS, 'extent')
  const cx = Number(extent?.getAttribute('cx') ?? 0)
  const cy = Number(extent?.getAttribute('cy') ?? 0)
  return { width: cx ? Math.round(cx / EMU_PER_PX) : null, height: cy ? Math.round(cy / EMU_PER_PX) : null }
}

// Theme colors used by the original's default theme, approximated with our own palette.
const SCHEME: Record<string, string> = { accent1: '#2F6FC4', accent2: '#E3742F', accent3: '#9E9E9E', accent4: '#F2B705', accent5: '#4FA3D9', accent6: '#5FA84B', dk1: '#000000', lt1: '#FFFFFF', dk2: '#3D4B5C', lt2: '#E8E6E3', tx1: '#000000', bg1: '#FFFFFF' }

function color(el: Element | null): string | null | undefined {
  if (!el) return undefined
  if (child(el, A_NS, 'noFill')) return null
  const solid = child(el, A_NS, 'solidFill') ?? (el.localName === 'solidFill' ? el : null)
  if (!solid) return undefined
  const srgb = child(solid, A_NS, 'srgbClr')?.getAttribute('val')
  if (srgb) return `#${srgb.toUpperCase()}`
  const scheme = child(solid, A_NS, 'schemeClr')?.getAttribute('val')
  return scheme ? (SCHEME[scheme] ?? '#2F6FC4') : undefined
}

/** A `wps:wsp` shape: a preset shape, or (with `txBox`) a text box whose content is given. */
export function shapeFromWsp(wsp: Element, layout: Record<string, unknown>, size: { width: number | null; height: number | null }, text: string, isTextBox: boolean): JSONContent {
  const spPr = child(wsp, WPS_NS, 'spPr')
  const prst = child(spPr, A_NS, 'prstGeom')?.getAttribute('prst') ?? 'rect'
  const ln = child(spPr, A_NS, 'ln')
  const xfrm = child(spPr, A_NS, 'xfrm')
  const fill = color(spPr)
  const stroke = ln ? color(ln) : undefined
  const strokeWidth = ln?.getAttribute('w') ? Math.round((Number(ln.getAttribute('w')) / 12700) * 100) / 100 : undefined
  const rot = Number(xfrm?.getAttribute('rot') ?? 0) / 60000
  const flip = `${xfrm?.getAttribute('flipH') === '1' ? 'h' : ''}${xfrm?.getAttribute('flipV') === '1' ? 'v' : ''}`
  const common = { ...layout, ...size, ...(rot ? { rotation: Math.round(rot) } : {}) }
  const dash = child(ln, A_NS, 'prstDash')?.getAttribute('val')
  const dashKind = dash ? (dash.includes('dot') && dash.includes('Dash') ? 'dashDot' : dash.includes('ot') ? 'dot' : dash === 'solid' ? 'solid' : 'dash') : null
  if (isTextBox) {
    // A shape holding paragraphs is a text box with the shape's outline (themed blue like the original).
    const shaped = prst !== 'rect' && PRESET_FROM_OOXML[prst]
    if (shaped)
      return {
        type: 'textBox',
        attrs: {
          ...common,
          kind: PRESET_FROM_OOXML[prst],
          fill: fill === undefined ? '#4472C4' : fill,
          stroke: stroke === undefined ? '#2F528F' : stroke,
          strokeWidth: strokeWidth ?? 1,
          ...(dashKind ? { dash: dashKind } : {}),
          ...(flip ? { flip } : {}),
          textColor: fill === null || fill === '#FFFFFF' ? null : '#FFFFFF',
          vAlign: 'middle',
        },
      }
    return { type: 'textBox', attrs: { ...common, height: null, fill: fill === undefined ? '#FFFFFF' : fill, stroke: stroke === undefined ? '#000000' : stroke, ...(strokeWidth != null ? { strokeWidth } : {}) } }
  }
  let kind = PRESET_FROM_OOXML[prst] ?? 'rectangle'
  const tail = child(ln, A_NS, 'tailEnd')?.getAttribute('type')
  const head = child(ln, A_NS, 'headEnd')?.getAttribute('type')
  if ((kind === 'line' || kind === 'arrowLine') && (tail || head)) kind = tail && head && tail !== 'none' && head !== 'none' ? 'doubleArrowLine' : tail !== 'none' || head !== 'none' ? 'arrowLine' : 'line'
  return {
    type: 'shape',
    attrs: {
      ...common,
      kind,
      ...(fill !== undefined ? { fill } : {}),
      ...(stroke !== undefined ? { stroke } : {}),
      ...(strokeWidth != null ? { strokeWidth } : {}),
      ...(dashKind ? { dash: dashKind } : {}),
      ...(flip ? { flip } : {}),
      text,
      ...(fill && fill !== '#FFFFFF' ? { textColor: '#FFFFFF' } : { textColor: '#000000' }),
    },
  }
}

// ---- Charts ----

const cachedStrings = (el: Element | null) => childrenNS(first(el, C_NS, 'strCache') ?? first(el, C_NS, 'numCache'), C_NS, 'pt').sort((a, b) => Number(a.getAttribute('idx')) - Number(b.getAttribute('idx'))).map((pt) => first(pt, C_NS, 'v')?.textContent ?? '')

export function chartFromXml(xml: Document): ChartData {
  const chart = first(xml.documentElement, C_NS, 'chart')
  const plot = first(chart, C_NS, 'plotArea')
  const types: [string, ChartType][] = [['barChart', 'column'], ['bar3DChart', 'column'], ['lineChart', 'line'], ['line3DChart', 'line'], ['areaChart', 'area'], ['pieChart', 'pie'], ['pie3DChart', 'pie'], ['doughnutChart', 'doughnut'], ['scatterChart', 'scatter']]
  let group: Element | null = null
  let chartType: ChartType = 'column'
  for (const [tag, t] of types) {
    group = child(plot, C_NS, tag)
    if (group) {
      chartType = t
      break
    }
  }
  if (!group) return DEFAULT_CHART
  if (chartType === 'column' && child(group, C_NS, 'barDir')?.getAttribute('val') === 'bar') chartType = 'bar'
  const grouping = child(group, C_NS, 'grouping')?.getAttribute('val') ?? 'clustered'
  const series = childrenNS(group, C_NS, 'ser')
  let categories: string[] = []
  const out = series.map((ser, i) => {
    const name = cachedStrings(child(ser, C_NS, 'tx'))[0] || `Series ${i + 1}`
    const cats = cachedStrings(child(ser, C_NS, 'cat') ?? child(ser, C_NS, 'xVal'))
    if (cats.length > categories.length) categories = cats
    const values = cachedStrings(child(ser, C_NS, 'val') ?? child(ser, C_NS, 'yVal')).map((v) => (v === '' ? null : Number(v)))
    const c = color(child(ser, C_NS, 'spPr'))
    return { name, values, ...(c ? { color: c } : {}) }
  })
  const titleText = Array.from(first(chart, C_NS, 'title')?.getElementsByTagNameNS(A_NS, 't') ?? []).map((t) => t.textContent).join('')
  const legendPos = first(first(chart, C_NS, 'legend'), C_NS, 'legendPos')?.getAttribute('val')
  return {
    ...DEFAULT_CHART,
    chartType,
    stacking: grouping === 'stacked' ? 'stacked' : grouping === 'percentStacked' ? 'percent' : 'none',
    title: titleText || (first(chart, C_NS, 'autoTitleDeleted')?.getAttribute('val') === '1' ? '' : out.length === 1 ? out[0].name : ''),
    legend: !first(chart, C_NS, 'legend') ? 'none' : legendPos === 'r' ? 'right' : legendPos === 't' ? 'top' : legendPos === 'l' ? 'left' : 'bottom',
    dataLabels: first(group, C_NS, 'showVal')?.getAttribute('val') === '1',
    categories: categories.length ? categories : (out[0]?.values ?? []).map((_, i) => String(i + 1)),
    series: out.length ? out : DEFAULT_CHART.series,
  }
}

// ---- Equations (OMML) to the linear format ----

const REVERSE: Record<string, string> = {}
for (const [k, v] of Object.entries({ ...SYMBOLS, ...OPERATORS, ...LARGE_OPS })) if (!REVERSE[v]) REVERSE[v] = `\\${k} `
const NARY: Record<string, string> = { '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap' }
const ACC: Record<string, string> = { '̂': 'hat', '^': 'hat', '̅': 'bar', '¯': 'bar', '⃗': 'vec', '→': 'vec', '̃': 'tilde', '~': 'tilde', '̇': 'dot', '̈': 'ddot' }
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'det'])

const mval = (el: Element | null, name: string) => {
  const c = el ? childrenNS(el, M_NS).find((x) => x.localName === name) : null
  return c?.getAttributeNS(M_NS, 'val') ?? c?.getAttribute('m:val') ?? null
}

export function ommlToLatex(el: Element): string {
  const part = (name: string) => {
    const c = childrenNS(el, M_NS, name)[0]
    return c ? ommlToLatex(c) : ''
  }
  const brace = (s: string) => `{${s}}`
  switch (el.localName) {
    case 'r': {
      const t = Array.from(el.getElementsByTagNameNS(M_NS, 't')).map((x) => x.textContent ?? '').join('')
      return Array.from(t).map((ch) => REVERSE[ch] ?? (ch === '{' ? '\\{' : ch === '}' ? '\\}' : ch)).join('')
    }
    case 'f': return `\\frac{${part('num')}}{${part('den')}}`
    case 'rad': {
      const deg = part('deg')
      return deg ? `\\sqrt[${deg}]{${part('e')}}` : `\\sqrt{${part('e')}}`
    }
    case 'sSup': return `${brace(part('e'))}^${brace(part('sup'))}`
    case 'sSub': return `${brace(part('e'))}_${brace(part('sub'))}`
    case 'sSubSup': return `${brace(part('e'))}_${brace(part('sub'))}^${brace(part('sup'))}`
    case 'sPre': return `{}_${brace(part('sub'))}^${brace(part('sup'))}${brace(part('e'))}`
    case 'nary': {
      const pr = childrenNS(el, M_NS, 'naryPr')[0] ?? null
      const chr = mval(pr, 'chr') ?? '∫'
      const sub = part('sub')
      const sup = part('sup')
      return `${NARY[chr] ?? chr}${sub ? `_${brace(sub)}` : ''}${sup ? `^${brace(sup)}` : ''} ${part('e')}`
    }
    case 'd': {
      const pr = childrenNS(el, M_NS, 'dPr')[0] ?? null
      const beg = mval(pr, 'begChr') ?? '('
      const end = mval(pr, 'endChr') ?? ')'
      const sep = mval(pr, 'sepChr') ?? ','
      const items = childrenNS(el, M_NS, 'e').map(ommlToLatex).join(sep)
      const d = (c: string) => (c === '' ? '.' : c === '{' ? '\\{' : c === '}' ? '\\}' : c)
      return `\\left${d(beg)}${items}\\right${d(end)}`
    }
    case 'acc': {
      const chr = mval(childrenNS(el, M_NS, 'accPr')[0] ?? null, 'chr') ?? '̂'
      return `\\${ACC[chr] ?? 'hat'}{${part('e')}}`
    }
    case 'bar': return `\\bar{${part('e')}}`
    case 'func': {
      const name = part('fName').trim()
      return `${FUNCS.has(name) ? `\\${name}` : name} ${part('e')}`
    }
    case 'limLow': return `${brace(part('e'))}_${brace(part('lim'))}`
    case 'limUpp': return `${brace(part('e'))}^${brace(part('lim'))}`
    case 'm':
      return `\\begin{matrix}${childrenNS(el, M_NS, 'mr')
        .map((r) => childrenNS(r, M_NS, 'e').map(ommlToLatex).join(' & '))
        .join('\\\\')}\\end{matrix}`
    case 'eqArr': return childrenNS(el, M_NS, 'e').map(ommlToLatex).join(' \\\\ ')
    default:
      return childrenNS(el, M_NS)
        .filter((c) => !c.localName.endsWith('Pr'))
        .map(ommlToLatex)
        .join('')
  }
}

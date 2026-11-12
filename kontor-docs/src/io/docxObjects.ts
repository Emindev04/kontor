import {
  HorizontalPositionAlign, HorizontalPositionRelativeFrom, ImageRun, MathFraction, MathIntegral, MathRadical, MathRoundBrackets, MathRun,
  MathSquareBrackets, MathCurlyBrackets, MathSubScript, MathSubSuperScript, MathSum, MathSuperScript, Math as DocxMath, Paragraph, TextRun, TextWrappingSide,
  TextWrappingType, VerticalPositionRelativeFrom, type IFloating, type MathComponent,
} from 'docx'
import { ShapeGroupRun, ShapeRun } from 'docx/shapes'
import { ChartRun } from 'docx/charts'
import type { WrapMode } from '../editor/Drawing'
import { parseMath, textOf, type MNode } from '../editor/math'
import { DEFAULT_CHART, seriesColor, type ChartData } from '../editor/Chart'
import { signatureSvg } from '../editor/Objects'

// Drawing objects, charts and equations for the .docx writer.

const EMU_PER_PX = 9525
const emu = (px: number) => Math.round(px * EMU_PER_PX)
const hex = (c: unknown) => (typeof c === 'string' && c.startsWith('#') ? c.slice(1).toUpperCase() : undefined)

/** Text wrapping and position of a floating object, relative to its paragraph like the editor. */
export function floatingFor(a: Record<string, unknown>): IFloating | undefined {
  const wrap = (a.wrap as WrapMode) ?? 'inline'
  if (wrap === 'inline') return undefined
  const align = a.align === 'right' ? HorizontalPositionAlign.RIGHT : a.align === 'center' ? HorizontalPositionAlign.CENTER : HorizontalPositionAlign.LEFT
  const margins = { left: emu(12), right: emu(12), top: 0, bottom: emu(6) }
  if (wrap === 'behind' || wrap === 'front')
    return {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: emu(Number(a.offsetX) || 0) },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: emu(Number(a.offsetY) || 0) },
      behindDocument: wrap === 'behind',
      allowOverlap: true,
      wrap: { type: TextWrappingType.NONE },
      zIndex: Math.max(0, 10 + (Number(a.zIndex) || 0)),
    }
  return {
    horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, align },
    verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
    wrap: { type: wrap === 'topBottom' ? TextWrappingType.TOP_AND_BOTTOM : wrap === 'tight' ? TextWrappingType.TIGHT : wrap === 'through' ? TextWrappingType.THROUGH : TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
    margins,
  }
}

/** A text run inside a shape, in the shape's text formatting. */
const shapeText = (text: string, a: Record<string, unknown>) => new TextRun({ text, color: hex(a.textColor), size: Math.round((Number(a.fontSize) || 11) * 2), bold: !!a.bold, italics: !!a.italic })

const DASHES: Record<string, 'solid' | 'dash' | 'dot' | 'dashDot'> = { solid: 'solid', dash: 'dash', dot: 'dot', dashDot: 'dashDot' }

/** Options of a shape, without its position on the page (also used for shapes inside groups). */
export function shapeOptions(a: Record<string, unknown>) {
  const kind = String(a.kind ?? 'rectangle')
  const isLine = /line$/i.test(kind)
  const fill = hex(a.fill)
  const stroke = hex(a.stroke)
  const flip = String(a.flip ?? '')
  const options = {
    type: (isLine ? 'line' : kind) as 'rectangle',
    transformation: {
      width: Math.max(1, Number(a.width) || 96),
      height: Math.max(1, Number(a.height) || (isLine ? 1 : 96)),
      ...(a.rotation ? { rotation: Number(a.rotation) } : {}),
      ...(flip ? { flip: { horizontal: flip.includes('h'), vertical: flip.includes('v') } } : {}),
    },
    ...(isLine ? {} : { fill: fill ? (a.gradient ? { type: 'gradient' as const, stops: [{ position: 0, color: fill, transparency: 35 }, { position: 100, color: fill }], angle: 90 } : a.opacity != null && Number(a.opacity) < 1 ? { type: 'solid' as const, color: fill, transparency: Math.round((1 - Number(a.opacity)) * 100) } : fill) : undefined }),
    ...(a.adjustments ? { adjustments: a.adjustments } : {}),
    line: stroke
      ? {
          color: stroke,
          width: Number(a.strokeWidth) || 1,
          dash: DASHES[String(a.dash ?? 'solid')] ?? 'solid',
          ...(kind === 'arrowLine' || kind === 'doubleArrowLine' ? { endArrow: 'triangle' as const } : {}),
          ...(kind === 'doubleArrowLine' ? { startArrow: 'triangle' as const } : {}),
        }
      : undefined,
    ...(a.shadow || a.glow ? { effects: { ...(a.shadow ? { shadow: {} } : {}), ...(a.glow ? { glow: { color: hex(a.glow) ?? '8FB3E6', radius: 5 } } : {}) } } : {}),
    ...(a.text && !isLine
      ? {
          children: String(a.text)
            .split('\n')
            .map((line) => new Paragraph({ alignment: a.textAlign === 'left' ? 'left' : a.textAlign === 'right' ? 'right' : 'center', children: [shapeText(line, a)] })),
          textOptions: { verticalAlignment: a.vAlign === 'top' ? 'top' : a.vAlign === 'bottom' ? 'bottom' : 'center' },
        }
      : {}),
  }
  return options
}

export function shapeRun(a: Record<string, unknown>) {
  return new ShapeRun({ ...shapeOptions(a), ...(floatingFor(a) ? { floating: floatingFor(a) as never } : {}) } as never)
}


/** A text box: a shape (a rectangle, or the outline of a shape with text) whose text is the box's paragraphs. */
export function textBoxRun(a: Record<string, unknown>, children: Paragraph[]) {
  return new ShapeRun({ ...textBoxOptions(a, children), ...(floatingFor(a) ? { floating: floatingFor(a) as never } : {}) } as never)
}

export function textBoxOptions(a: Record<string, unknown>, children: Paragraph[]) {
  const fill = hex(a.fill)
  const stroke = hex(a.stroke)
  const kind = typeof a.kind === 'string' && a.kind ? a.kind : 'rectangle'
  const flip = String(a.flip ?? '')
  return {
    type: kind,
    transformation: {
      width: Math.max(8, Number(a.width) || 192),
      height: Number(a.height) || Math.max(48, children.length * 22 + 16),
      ...(a.rotation ? { rotation: Number(a.rotation) } : {}),
      ...(flip ? { flip: { horizontal: flip.includes('h'), vertical: flip.includes('v') } } : {}),
    },
    fill: fill ? (a.gradient ? { type: 'gradient' as const, stops: [{ position: 0, color: fill, transparency: 35 }, { position: 100, color: fill }], angle: 90 } : fill) : undefined,
    line: stroke && Number(a.strokeWidth) ? { color: stroke, width: Number(a.strokeWidth), dash: DASHES[String(a.dash ?? 'solid')] ?? 'solid' } : undefined,
    ...(a.shadow || a.glow ? { effects: { ...(a.shadow ? { shadow: {} } : {}), ...(a.glow ? { glow: { color: hex(a.glow) ?? '8FB3E6', radius: 5 } } : {}) } } : {}),
    children,
    textOptions: { verticalAlignment: a.vAlign === 'middle' ? 'center' : a.vAlign === 'bottom' ? 'bottom' : 'top', resizeShapeToFitText: a.height == null },
  }
}

/** A child of a drawing group: options plus its position inside the group. */
export type GroupChild = { options: Record<string, unknown>; x: number; y: number }

/**
 * Grouped objects are written as one drawing group, placed where the group's top-left corner is
 * (`anchor` holds the wrap and position of the group's first object, minus its offset in the group).
 */
export function groupRun(children: GroupChild[], anchor: Record<string, unknown>) {
  const floating = floatingFor(anchor)
  return new ShapeGroupRun({
    children: children.map((c) => {
      const t = (c.options.transformation ?? {}) as Record<string, unknown>
      return { ...c.options, transformation: { ...t, offset: { left: Math.round(c.x), top: Math.round(c.y) } } }
    }) as never,
    ...(floating ? { floating } : {}),
    ...(anchor.name ? { altText: { name: String(anchor.name), description: '', title: '' } } : {}),
  })
}

export function chartRun(a: Record<string, unknown>) {
  const d = (a.data as ChartData | null) ?? DEFAULT_CHART
  const width = Number(a.width) || 576
  const height = Number(a.height) || 336
  const common = {
    title: d.title || undefined,
    legend: d.legend === 'none' ? (false as const) : { position: d.legend },
    transformation: { width, height },
    ...(floatingFor(a) ? { floating: floatingFor(a) } : {}),
  }
  const labels = d.dataLabels ? { showValue: true } : undefined
  let options: Record<string, unknown>
  if (d.chartType === 'pie' || d.chartType === 'doughnut') {
    options = {
      ...common,
      type: d.chartType,
      categories: d.categories,
      series: [{ name: d.series[0]?.name ?? 'Series 1', values: (d.series[0]?.values ?? []).map((v) => Math.max(0, v ?? 0)), colors: d.categories.map((_, i) => hex(seriesColor(d, i))) }],
      ...(labels ? { dataLabels: labels } : {}),
    }
  } else if (d.chartType === 'scatter') {
    options = {
      ...common,
      type: 'scatter',
      series: d.series.map((s, si) => ({ name: s.name, color: hex(seriesColor(d, si)), points: s.values.map((v, i) => (v == null ? null : { x: i + 1, y: v })).filter(Boolean) })),
    }
  } else {
    options = {
      ...common,
      type: d.chartType,
      categories: d.categories,
      series: d.series.map((s, si) => ({ name: s.name, values: d.categories.map((_, i) => s.values[i] ?? null), color: hex(seriesColor(d, si)) })),
      ...(d.stacking !== 'none' ? { stacking: d.stacking === 'percent' ? 'percent' : 'stacked' } : {}),
      ...(d.chartType === 'line' ? { markers: true } : {}),
      ...(labels ? { dataLabels: labels } : {}),
    }
  }
  try {
    return new ChartRun(options as never)
  } catch (error) {
    console.warn('Chart could not be written', error)
    return null
  }
}

// ---- Equations ----

function mathChildren(n: MNode): MathComponent[] {
  switch (n.t) {
    case 'row': return n.items.flatMap(mathChildren)
    case 'ident':
    case 'num':
    case 'op':
    case 'text': return [new MathRun(n.v)]
    case 'frac': return [new MathFraction({ numerator: mathChildren(n.num), denominator: mathChildren(n.den) })]
    case 'sqrt': return [new MathRadical({ children: mathChildren(n.body), ...(n.index ? { degree: mathChildren(n.index) } : {}) })]
    case 'script': {
      if (n.base.t === 'op' && ['∑', '∏'].includes(n.base.v)) return [new MathSum({ children: [], subScript: n.sub ? mathChildren(n.sub) : undefined, superScript: n.sup ? mathChildren(n.sup) : undefined })]
      if (n.base.t === 'op' && ['∫', '∬', '∭', '∮'].includes(n.base.v)) return [new MathIntegral({ children: [], subScript: n.sub ? mathChildren(n.sub) : undefined, superScript: n.sup ? mathChildren(n.sup) : undefined })]
      const base = mathChildren(n.base)
      if (n.sub && n.sup) return [new MathSubSuperScript({ children: base, subScript: mathChildren(n.sub), superScript: mathChildren(n.sup) })]
      if (n.sub) return [new MathSubScript({ children: base, subScript: mathChildren(n.sub) })]
      return [new MathSuperScript({ children: base, superScript: mathChildren(n.sup!) })]
    }
    case 'fenced': {
      const children = mathChildren(n.body)
      if (n.open === '(' && n.close === ')') return [new MathRoundBrackets({ children })]
      if (n.open === '[' && n.close === ']') return [new MathSquareBrackets({ children })]
      if (n.open === '{' && n.close === '}') return [new MathCurlyBrackets({ children })]
      return [new MathRun(n.open), ...children, new MathRun(n.close)]
    }
    case 'accent': return [...mathChildren(n.body), new MathRun(n.acc)]
    case 'matrix': return [new MathRun(n.rows.map((r) => r.map(textOf).join(' & ')).join('; '))]
  }
}

export function equationRun(latex: string) {
  return new DocxMath({ children: mathChildren(parseMath(latex)) })
}

// ---- Pictures of SVG objects ----

/** Renders SVG markup into a PNG picture (signature lines). */
export async function svgImageRun(svg: string, width: number, height: number, a: Record<string, unknown>) {
  const img = new window.Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode().catch(() => undefined)
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) return null
  return new ImageRun({ type: 'png', data: new Uint8Array(await blob.arrayBuffer()), transformation: { width, height }, ...(floatingFor(a) ? { floating: floatingFor(a)! } : {}) })
}

export function signatureRun(a: Record<string, unknown>) {
  const w = Number(a.width) || 192
  const h = Number(a.height) || 96
  return svgImageRun(signatureSvg(a, w, h), w, h, a)
}

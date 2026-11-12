import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { patternTile } from '../model/patterns'
import { normHandles, outlinePath, sampleOutline, scaleOutline, type Outline } from '../model/outline'
import type { ArrowHead, Mark, RichDoc, ChartElement, DiagramElement, MediaElement, ZoomElement, Effects, Fill, GroupElement, ImageElement, InkElement, Line, ShapeElement, SlideElement, TableElement } from '../model/types'
import { ChartSvg } from './ChartView'
import { diagramShapes } from '../model/diagram'
import { fontStack } from '../model/themes'
import { adjustLum, resolveColor, withAlpha, type ThemeColors } from '../model/color'
import { geometry } from '../model/shapes'
import { docToHtml, docToParagraphs, isDocEmpty, type TextCtx } from '../model/richtext'
import { STYLE_DEFS } from '../model/layouts'
import { fillToCss, styleKey, tableCellCtx, textCtxFor, type RenderCtx } from './context'
import { cellLook, type CellRange } from '../model/table'
import { effectiveEffects } from '../model/effectSchemes'
import { t, t as translate, tx } from '../i18n'

export type RenderMode = 'edit' | 'thumb' | 'show' | 'deco'

export type AnimLayer = { className?: string; style?: CSSProperties; motion?: { d: string; duration: number; delay: number; repeat: number } }

/** Per-paragraph animation state of text that plays by paragraph, word or letter. */
export type TextAnimPara = { hidden: boolean; layers: AnimLayer[]; unit?: 'word' | 'letter'; stagger?: number }

/** Slide show state of an animated object: visibility, finished motion offset, lasting emphasis and running effects. */
export type AnimState = { hidden?: boolean; layers?: AnimLayer[]; offset?: { x: number; y: number }; persist?: CSSProperties; trigger?: boolean; text?: TextAnimPara[] }

export type ElementProps = {
  el: SlideElement
  rc: RenderCtx
  mode: RenderMode
  editingId?: string | null
  renderEditor?: (el: ShapeElement, ctx: TextCtx) => ReactNode
  onAutofit?: (id: string, patch: { fontScale?: number; lnSpcReduction?: number; h?: number; w?: number }) => void
  /** Slide show animation state per element. */
  anim?: (el: SlideElement) => AnimState | undefined
  onPicturePlaceholder?: (id: string) => void
  renderCellEditor?: (el: TableElement, r: number, c: number, ctx: TextCtx) => ReactNode
  /** Selected cell range of the table being edited. */
  cellSel?: { id: string; range: CellRange; editing: boolean } | null
  onTableMeasure?: (id: string, heights: number[]) => void
}

const PT = 96 / 72

const DASHES: Record<string, number[]> = {
  solid: [],
  sysDot: [1, 1],
  sysDash: [3, 1],
  dash: [4, 3],
  dashDot: [4, 3, 1, 3],
  lgDash: [8, 3],
  lgDashDot: [8, 3, 1, 3],
  lgDashDotDot: [8, 3, 1, 3, 1, 3],
}

export function dashArray(line: NonNullable<Line>) {
  const w = Math.max(1, line.width * PT)
  return DASHES[line.dash]?.map((d) => d * w).join(' ') || undefined
}

export function effectsFilter(effects: Effects | undefined, colors: ThemeColors) {
  const parts: string[] = []
  const s = effects?.shadow
  if (s) {
    const a = (s.angle * Math.PI) / 180
    const d = s.dist * PT
    parts.push(`drop-shadow(${(Math.cos(a) * d).toFixed(1)}px ${(Math.sin(a) * d).toFixed(1)}px ${(s.blur * PT * 0.5).toFixed(1)}px ${withAlpha(resolveColor(s.color, colors), s.alpha)})`)
  }
  const g = effects?.glow
  if (g) parts.push(`drop-shadow(0 0 ${(g.size * PT * 0.6).toFixed(1)}px ${withAlpha(resolveColor(g.color, colors), g.alpha)})`)
  if (effects?.softEdge) parts.push(`blur(${(effects.softEdge * PT * 0.25).toFixed(1)}px)`)
  return parts.join(' ') || undefined
}

function reflection(effects: Effects | undefined): CSSProperties {
  return effects?.reflection ? ({ WebkitBoxReflect: 'below 2px linear-gradient(transparent 55%, rgba(255,255,255,0.35))' } as CSSProperties) : {}
}

/** Rotation plus the 3-D rotation of Shape Effects as a CSS transform. */
export function elementTransform(rot: number, effects: Effects | undefined) {
  const r = effects?.rot3d
  const parts: string[] = []
  if (r && (r.x || r.y)) parts.push(`perspective(${r.perspective ? 900 : 4000}px)`)
  if (rot) parts.push(`rotate(${rot}deg)`)
  if (r?.x) parts.push(`rotateY(${-r.x}deg)`)
  if (r?.y) parts.push(`rotateX(${r.y}deg)`)
  return parts.join(' ') || undefined
}

/** Bevel presets: blur radius (relative to the size) and specular exponent of the lighting filter. */
const BEVELS: Record<string, { blur: number; exp: number; scale: number }> = {
  circle: { blur: 4, exp: 18, scale: 1 },
  relaxedInset: { blur: 6, exp: 12, scale: 0.8 },
  cross: { blur: 2, exp: 30, scale: 1.2 },
  coolSlant: { blur: 3, exp: 22, scale: 1 },
  angle: { blur: 1.5, exp: 35, scale: 1.2 },
  softRound: { blur: 8, exp: 10, scale: 0.8 },
  convex: { blur: 10, exp: 8, scale: 1 },
  slope: { blur: 5, exp: 16, scale: 1 },
  divot: { blur: 2.5, exp: 26, scale: 1.1 },
  riblet: { blur: 1.2, exp: 40, scale: 1.3 },
  hardEdge: { blur: 1, exp: 45, scale: 1.4 },
  artDeco: { blur: 3, exp: 28, scale: 1.2 },
}

/** SVG filter for an inner shadow and/or a bevel on the shape's fill. */
function FillEffectsFilter({ id, effects, colors }: { id: string; effects: Effects; colors: ThemeColors }) {
  const ins = effects.innerShadow
  const bev = effects.bevel ? (BEVELS[effects.bevel] ?? BEVELS.circle) : null
  const a = ins ? (ins.angle * Math.PI) / 180 : 0
  const d = ins ? ins.dist * PT : 0
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
      {ins && (
        <>
          <feFlood floodColor={resolveColor(ins.color, colors)} floodOpacity={ins.alpha} result="isColor" />
          <feComposite in="isColor" in2="SourceAlpha" operator="out" result="isOutside" />
          <feOffset in="isOutside" dx={Math.cos(a) * d} dy={Math.sin(a) * d} result="isOffset" />
          <feGaussianBlur in="isOffset" stdDeviation={Math.max(0.1, ins.blur * PT * 0.5)} result="isBlur" />
          <feComposite in="isBlur" in2="SourceAlpha" operator="in" result="isInner" />
        </>
      )}
      {bev && (
        <>
          <feGaussianBlur in="SourceAlpha" stdDeviation={bev.blur * PT} result="bvBlur" />
          <feSpecularLighting in="bvBlur" surfaceScale={bev.scale * 4} specularConstant={0.9} specularExponent={bev.exp} lightingColor="#FFFFFF" result="bvSpec">
            <feDistantLight azimuth={225} elevation={40} />
          </feSpecularLighting>
          <feComposite in="bvSpec" in2="SourceAlpha" operator="in" result="bvLit" />
          <feDiffuseLighting in="bvBlur" surfaceScale={bev.scale * 3} diffuseConstant={1} lightingColor="#FFFFFF" result="bvDiff">
            <feDistantLight azimuth={225} elevation={55} />
          </feDiffuseLighting>
          <feComposite in="SourceGraphic" in2="bvDiff" operator="arithmetic" k1={1} k2={0} k3={0} k4={0} result="bvShade" />
          <feComposite in="bvShade" in2="SourceAlpha" operator="in" result="bvShaded" />
          <feComposite in="bvLit" in2="bvShaded" operator="arithmetic" k1={0} k2={0.55} k3={1} k4={0} result="bvOut" />
        </>
      )}
      <feMerge>
        <feMergeNode in={bev ? 'bvOut' : 'SourceGraphic'} />
        {ins && <feMergeNode in="isInner" />}
      </feMerge>
    </filter>
  )
}

/** Gap strokes (black in a mask) that split one wide stroke into compound lines. */
function compoundGaps(compound: NonNullable<Line>['compound'], lw: number): { w: number; color: string }[] {
  switch (compound) {
    case 'dbl':
      return [{ w: lw / 3, color: 'black' }]
    case 'thickThin':
    case 'thinThick':
      return [{ w: lw * 0.4, color: 'black' }, { w: lw * 0.12, color: 'white' }]
    case 'tri':
      return [{ w: lw * 0.6, color: 'black' }, { w: lw * 0.2, color: 'white' }]
    default:
      return []
  }
}

let gradId = 0

function FillDefs({ id, fill, colors, variant }: { id: string; fill: Fill; colors: ThemeColors; variant: 'norm' | 'darken' | 'lighten' }) {
  const tone = (c: string) => (variant === 'darken' ? adjustLum(c, -0.2) : variant === 'lighten' ? adjustLum(c, 0.25) : c)
  if (fill.type === 'gradient') {
    const stops = fill.stops.map((s, i) => <stop key={i} offset={s.pos} stopColor={tone(resolveColor(s.color, colors))} stopOpacity={s.alpha ?? 1} />)
    if (fill.kind === 'radial') return <radialGradient id={id}>{stops}</radialGradient>
    const a = (fill.angle * Math.PI) / 180
    const x = Math.cos(a) / 2
    const y = Math.sin(a) / 2
    return (
      <linearGradient id={id} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
        {stops}
      </linearGradient>
    )
  }
  if (fill.type === 'pattern')
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={8} height={8}>
        <image href={patternTile(fill.preset, tone(resolveColor(fill.fg, colors)), tone(resolveColor(fill.bg, colors)))} width={8} height={8} />
      </pattern>
    )
  if (fill.type === 'picture')
    return (
      <pattern id={id} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width={1} height={1}>
        <image href={fill.src} width={1} height={1} preserveAspectRatio="none" opacity={fill.alpha ?? 1} />
      </pattern>
    )
  return null
}

function paint(fill: Fill, colors: ThemeColors, variant: 'norm' | 'darken' | 'lighten', id: string): { fill: string; opacity?: number } {
  if (fill.type === 'none') return { fill: 'none' }
  if (fill.type === 'solid') {
    const c = resolveColor(fill.color, colors)
    return { fill: variant === 'darken' ? adjustLum(c, -0.2) : variant === 'lighten' ? adjustLum(c, 0.25) : c, opacity: fill.alpha }
  }
  return { fill: `url(#${id})` }
}

function arrowPath(kind: ArrowHead | undefined, tip: [number, number], from: [number, number], lw: number): { d: string; filled: boolean } | null {
  if (!kind || kind === 'none') return null
  const len = Math.max(lw * 3, 7)
  const half = len / 2
  const dx = tip[0] - from[0]
  const dy = tip[1] - from[1]
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l
  const uy = dy / l
  const px = -uy
  const py = ux
  const at = (back: number, side: number): string => `${(tip[0] - ux * back + px * side).toFixed(2)} ${(tip[1] - uy * back + py * side).toFixed(2)}`
  switch (kind) {
    case 'triangle':
      return { d: `M${tip[0]} ${tip[1]} L${at(len, half)} L${at(len, -half)} Z`, filled: true }
    case 'stealth':
      return { d: `M${tip[0]} ${tip[1]} L${at(len, half)} L${at(len * 0.65, 0)} L${at(len, -half)} Z`, filled: true }
    case 'arrow':
      return { d: `M${at(len, half)} L${tip[0]} ${tip[1]} L${at(len, -half)}`, filled: false }
    case 'diamond':
      return { d: `M${at(-half, 0)} L${at(0, half)} L${at(half, 0)} L${at(0, -half)} Z`, filled: true }
    case 'oval': {
      const c = at(0, 0)
      return { d: `M${c} m${-half} 0 a${half} ${half} 0 1 0 ${len} 0 a${half} ${half} 0 1 0 ${-len} 0`, filled: true }
    }
  }
}

function lineEndsFor(prst: string, w: number, h: number, el?: ShapeElement): { start: [number, number]; startFrom: [number, number]; end: [number, number]; endFrom: [number, number] } | null {
  if (prst === 'custom' && el?.open && el.rings?.length) {
    // Open free-form lines get arrowheads at their first and last points (curves: along the curve).
    const r = sampleOutline(shapeOutline(el), true, 8)[0]
    if (r.length < 2) return null
    return { start: r[0], startFrom: r[1], end: r[r.length - 1], endFrom: r[r.length - 2] }
  }
  if (prst === 'line' || prst === 'straightConnector1') return { start: [0, 0], startFrom: [w, h], end: [w, h], endFrom: [0, 0] }
  if (prst === 'bentConnector3' || prst === 'curvedConnector3') return { start: [0, 0], startFrom: [w / 2, 0], end: [w, h], endFrom: [w / 2, h] }
  return null
}

/** Outline (vertices and Bézier handles) of a free-form shape at its current size. */
export function shapeOutline(el: ShapeElement): Outline {
  const sx = el.ringsBox?.w ? el.w / el.ringsBox.w : 1
  const sy = el.ringsBox?.h ? el.h / el.ringsBox.h : 1
  const rings = el.rings ?? []
  return scaleOutline({ rings, handles: normHandles(rings, el.handles) }, sx, sy)
}

/** Path data of a free-form shape scaled to its current size. */
export function ringsPath(el: ShapeElement) {
  return outlinePath(shapeOutline(el), !!el.open)
}

/** Points of a free-form outline at the shape's current size. */
export function ringsPoints(el: ShapeElement): [number, number][][] {
  const sx = el.ringsBox?.w ? el.w / el.ringsBox.w : 1
  const sy = el.ringsBox?.h ? el.h / el.ringsBox.h : 1
  return (el.rings ?? []).map((r) => r.map(([x, y]) => [x * sx, y * sy] as [number, number]))
}

function ShapeGeometry({ el, colors }: { el: ShapeElement; colors: ThemeColors }) {
  const geo = el.prst === 'custom' && el.rings ? { paths: [{ d: ringsPath(el), fill: 'norm' as const, evenOdd: true }] } : geometry(el.prst, el.w, el.h, el.adj)
  const idRef = useRef(`kg${++gradId}`)
  const id = idRef.current
  const line = el.line
  const lw = line ? Math.max(0.5, line.width * PT) : 0
  const strokeColor = line ? withAlpha(resolveColor(line.color, colors), line.alpha) : 'none'
  const ends = line ? lineEndsFor(el.prst, el.w, el.h, el) : null
  const head = ends && line ? arrowPath(line.head, ends.start, ends.startFrom, lw) : null
  const tail = ends && line ? arrowPath(line.tail, ends.end, ends.endFrom, lw) : null
  const flip = el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : undefined
  const needsDefs = el.fill.type === 'gradient' || el.fill.type === 'picture' || el.fill.type === 'pattern'
  const variants = needsDefs ? [...new Set(geo.paths.map((p) => (p.fill === 'none' ? 'norm' : p.fill)))] : []
  const fillFx = !!(el.effects?.innerShadow || el.effects?.bevel) && el.fill.type !== 'none'
  const gaps = line?.compound ? compoundGaps(line.compound, lw) : []
  const sketch = line?.sketch
  // Compound and sketched outlines are drawn separately from the fill.
  const splitStroke = gaps.length > 0 || !!sketch || fillFx
  const stroke = (p: { d: string }, i: number) => (
    <path
      key={`s${i}`}
      d={p.d}
      fill="none"
      stroke={strokeColor}
      strokeWidth={lw || undefined}
      strokeDasharray={line ? dashArray(line) : undefined}
      strokeLinejoin="round"
      mask={gaps.length ? `url(#${id}-cm${i})` : undefined}
      filter={sketch ? `url(#${id}-sk)` : undefined}
    />
  )
  return (
    <svg className="el-geo" width={Math.max(el.w, 1)} height={Math.max(el.h, 1)} overflow="visible" style={{ transform: flip, filter: effectsFilter(el.effects, colors) }} aria-hidden="true">
      {(needsDefs || splitStroke) && (
        <defs>
          {variants.map((v) => (
            <FillDefs key={v} id={`${id}-${v}`} fill={el.fill} colors={colors} variant={v} />
          ))}
          {fillFx && <FillEffectsFilter id={`${id}-fx`} effects={el.effects!} colors={colors} />}
          {sketch && (
            <filter id={`${id}-sk`} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency={sketch === 'curved' ? 0.02 : sketch === 'freehand' ? 0.04 : 0.08} numOctaves={2} seed={3} result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={sketch === 'scribble' ? 6 : 4} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          )}
          {gaps.length > 0 &&
            geo.paths.map((p, i) => (
              <mask key={i} id={`${id}-cm${i}`} maskUnits="userSpaceOnUse" x={-lw * 2} y={-lw * 2} width={el.w + lw * 4} height={el.h + lw * 4}>
                <path d={p.d} fill="none" stroke="white" strokeWidth={lw} strokeLinejoin="round" />
                {gaps.map((g, k) => (
                  <path key={k} d={p.d} fill="none" stroke={g.color} strokeWidth={g.w} strokeLinejoin="round" />
                ))}
              </mask>
            ))}
        </defs>
      )}
      <g filter={fillFx ? `url(#${id}-fx)` : undefined}>
        {geo.paths.map((p, i) => {
          const pf = p.fill === 'none' ? { fill: 'none' } : paint(el.fill, colors, p.fill, `${id}-${p.fill}`)
          return (
            <path
              key={i}
              d={p.d}
              fill={pf.fill}
              fillOpacity={pf.opacity}
              fillRule={p.evenOdd ? 'evenodd' : undefined}
              stroke={splitStroke ? 'none' : strokeColor}
              strokeWidth={splitStroke ? undefined : lw || undefined}
              strokeDasharray={!splitStroke && line ? dashArray(line) : undefined}
              strokeLinejoin="round"
            />
          )
        })}
      </g>
      {splitStroke && line && geo.paths.filter((p) => p.stroke !== false).map(stroke)}
      {[head, tail].map((a, i) => a && <path key={`a${i}`} d={a.d} fill={a.filled ? strokeColor : 'none'} stroke={strokeColor} strokeWidth={a.filled ? lw * 0.5 : lw} strokeLinejoin="round" />)}
      {ends && geo.paths.map((p, i) => <path key={`h${i}`} className="hit" d={p.d} fill="none" stroke="transparent" strokeWidth={Math.max(12, lw + 8)} />)}
    </svg>
  )
}

/** Measures text for "shrink text on overflow" and "resize shape to fit text". */
export function measureAutofit(tb: HTMLElement, rt: HTMLElement, el: ShapeElement): { fontScale?: number; lnSpcReduction?: number; h?: number; w?: number } | null {
  const text = el.text
  if (!text) return null
  const cs = getComputedStyle(tb)
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
  if (text.autofit === 'shrink') {
    // Like the original: first reduce line spacing by 10–20 %, then scale the font in small steps.
    const avail = tb.clientHeight - padY
    const current = text.fontScale ?? 1
    const currentRed = text.lnSpcReduction ?? 0
    const fits = (s: number, red: number) => {
      rt.style.setProperty('--fscale', String(s))
      rt.style.setProperty('--lred', String(red))
      return rt.offsetHeight <= avail + 0.5
    }
    let scale = 1
    let red = 0
    if (!fits(1, 0)) {
      red = fits(1, 0.1) ? 0.1 : 0.2
      if (!fits(1, red)) {
        let lo = 0.1
        let hi = 1
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2
          if (fits(mid, red)) lo = mid
          else hi = mid
        }
        // The original uses font scales in 2.5 % steps.
        scale = Math.max(0.1, Math.floor(lo * 40) / 40)
      }
    }
    rt.style.setProperty('--fscale', String(scale))
    rt.style.setProperty('--lred', String(red))
    return Math.abs(scale - current) > 0.005 || Math.abs(red - currentRed) > 0.005 ? { fontScale: scale, lnSpcReduction: red } : null
  }
  if (text.autofit === 'resize') {
    const patch: { h?: number; w?: number } = {}
    const needH = rt.offsetHeight + padY
    if (Math.abs(needH - el.h) > 0.75) patch.h = Math.max(needH, 8)
    if (!text.wrap) {
      const needW = rt.scrollWidth + padX + 1
      if (Math.abs(needW - el.w) > 0.75) patch.w = Math.max(needW, 8)
    }
    return patch.h !== undefined || patch.w !== undefined ? patch : null
  }
  return null
}

/** Wraps every word (or letter) of an HTML fragment in a span that plays the paragraph's effect with a growing delay. */
function unitHtml(html: string, unit: 'word' | 'letter', layer: AnimLayer | undefined, stagger: number) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild!
  const baseDelay = parseFloat(String(layer?.style?.animationDelay ?? '0')) || 0
  let k = 0
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const parts = unit === 'word' ? (node.data.match(/\s+|\S+/g) ?? []) : Array.from(node.data)
    const frag = doc.createDocumentFragment()
    for (const part of parts) {
      if (!part.trim()) {
        frag.appendChild(doc.createTextNode(part))
        continue
      }
      const span = doc.createElement('span')
      span.className = `anim-unit ${layer?.className ?? ''}`
      span.setAttribute('style', `animation-duration:${layer?.style?.animationDuration ?? '0.5s'};animation-delay:${(baseDelay + k++ * stagger).toFixed(3)}s`)
      span.textContent = part
      frag.appendChild(span)
    }
    node.replaceWith(frag)
  }
  return root.innerHTML
}

/** Path along which warped text runs, for a w×h text area. */
export function warpPath(warp: string, w: number, h: number): string | null {
  switch (warp) {
    case 'textArchUp':
      return `M0 ${h} A${w / 2} ${h} 0 0 1 ${w} ${h}`
    case 'textArchDown':
      return `M0 0 A${w / 2} ${h} 0 0 0 ${w} 0`
    case 'textCircle':
      return `M${w / 2} ${h} A${w / 2} ${h / 2} 0 1 1 ${w / 2 + 0.1} ${h}`
    case 'textWave1':
      return `M0 ${h / 2} C${w / 4} ${-h * 0.1} ${w / 4} ${-h * 0.1} ${w / 2} ${h / 2} S${(w * 3) / 4} ${h * 1.1} ${w} ${h / 2}`
    case 'textSlantUp':
      return `M0 ${h * 0.85} L${w} ${h * 0.15}`
    case 'textSlantDown':
      return `M0 ${h * 0.15} L${w} ${h * 0.85}`
    case 'textTriangle':
      return `M0 ${h} L${w / 2} ${h * 0.2} L${w} ${h}`
    default:
      return null
  }
}

/** WordArt text following a warp path (Text Effects > Transform); the first run's look is used. */
function WarpedText({ el, ctx, w, h }: { el: ShapeElement; ctx: TextCtx; w: number; h: number }) {
  const text = el.text!
  const d = warpPath(text.warp!, w, h)
  const idRef = useRef(`kw${++gradId}`)
  const words = text.doc.content.map((p) => (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('')).join(' ')
  const first = text.doc.content.flatMap((p) => p.content ?? [])[0]
  const attrs = first?.marks?.find((m): m is Extract<Mark, { type: 'textStyle' }> => m.type === 'textStyle')?.attrs ?? {}
  const size = (attrs.fontSize ?? ctx.sizes[0]) * (text.fontScale ?? 1) * PT
  const color = text.textFill ? resolveColor(text.textFill, ctx.colors) : attrs.color ? resolveColor(attrs.color, ctx.colors) : ctx.color
  const bold = ctx.bold || !!first?.marks?.some((m) => m.type === 'bold')
  if (!d) return null
  return (
    <svg className="warp-text" width={w} height={h} overflow="visible" aria-label={words}>
      <path id={idRef.current} d={d} fill="none" />
      <text
        fontSize={size}
        fontFamily={attrs.fontFamily ? fontStack(attrs.fontFamily) : ctx.font}
        fontWeight={bold ? 700 : undefined}
        fill={color}
        stroke={text.textOutline ? resolveColor(text.textOutline.color, ctx.colors) : undefined}
        strokeWidth={text.textOutline ? text.textOutline.width * PT : undefined}
        dominantBaseline={text.warp === 'textArchDown' ? 'hanging' : 'auto'}
      >
        <textPath href={`#${idRef.current}`} startOffset="50%" textAnchor="middle">
          {words}
        </textPath>
      </text>
    </svg>
  )
}

/** Static text drawn paragraph by paragraph so each one can play its own effect. */
function AnimatedParagraphs({ doc, ctx, paras }: { doc: RichDoc; ctx: TextCtx; paras: TextAnimPara[] }) {
  const parts = docToParagraphs(doc, ctx)
  return (
    <>
      {parts.map((html, i) => {
        const st = paras[i]
        if (!st || (!st.layers.length && !st.hidden)) return <div key={i} className="anim-para" dangerouslySetInnerHTML={{ __html: html }} />
        if (st.unit && st.layers.length) return <div key={i} className="anim-para" dangerouslySetInnerHTML={{ __html: unitHtml(html, st.unit, st.layers[st.layers.length - 1], st.stagger ?? 0.05) }} />
        let node: ReactNode = <div className="anim-para-inner" dangerouslySetInnerHTML={{ __html: html }} />
        for (const layer of [...st.layers].reverse()) node = <AnimLayerView layer={layer} origin="50% 50%">{node}</AnimLayerView>
        return (
          <div key={i} className={`anim-para${st.hidden && !st.layers.length ? ' anim-hidden' : ''}`}>
            {node}
          </div>
        )
      })}
    </>
  )
}

function TextLayer({ el, rc, mode, editing, renderEditor, onAutofit, textAnim }: { el: ShapeElement; rc: RenderCtx; mode: RenderMode; editing: boolean; renderEditor?: ElementProps['renderEditor']; onAutofit?: ElementProps['onAutofit']; textAnim?: TextAnimPara[] }) {
  const text = el.text!
  const ctx = textCtxFor(el, rc)
  const geo = geometry(el.prst, el.w, el.h, el.adj)
  const tr = geo.text ?? [0, 0, el.w, el.h]
  const [l, t, r, b] = text.inset
  const tbRef = useRef<HTMLDivElement>(null)
  const rtRef = useRef<HTMLDivElement>(null)
  const key = styleKey(el)
  const prompt = mode === 'edit' && el.placeholder && STYLE_DEFS[key].prompt ? translate(STYLE_DEFS[key].prompt) : undefined
  const html = editing ? '' : docToHtml(text.doc, ctx, prompt)

  useLayoutEffect(() => {
    if (mode !== 'edit' || editing || !onAutofit || !tbRef.current || !rtRef.current) return
    const patch = measureAutofit(tbRef.current, rtRef.current, el)
    if (patch) onAutofit(el.id, patch)
  })

  const vertical = text.vert === 'vert' || text.vert === 'vert270'
  const style: CSSProperties = {
    left: tr[0],
    top: tr[1],
    width: Math.max(0, tr[2] - tr[0]),
    height: Math.max(0, tr[3] - tr[1]),
    padding: `${t}px ${r}px ${b}px ${l}px`,
    justifyContent: text.anchor === 'middle' ? 'center' : text.anchor === 'bottom' ? 'flex-end' : 'flex-start',
    writingMode: vertical || text.vert === 'stacked' ? 'vertical-rl' : undefined,
    textOrientation: text.vert === 'stacked' ? 'upright' : undefined,
    transform: text.vert === 'vert270' ? 'rotate(180deg)' : undefined,
    columnCount: text.columns && text.columns > 1 ? text.columns : undefined,
    columnGap: text.columns && text.columns > 1 ? (text.colSpacing ?? 24) : undefined,
  }
  const rtStyle = {
    fontFamily: ctx.font,
    color: ctx.color,
    fontWeight: ctx.bold ? 700 : undefined,
    textTransform: ctx.caps ? 'uppercase' : undefined,
    '--fscale': text.fontScale ?? 1,
    '--lred': text.autofit === 'shrink' ? (text.lnSpcReduction ?? 0) : 0,
    WebkitTextStroke: text.textOutline ? `${text.textOutline.width * PT}px ${resolveColor(text.textOutline.color, rc.colors)}` : undefined,
    WebkitBoxReflect: text.textReflection ? 'below -0.15em linear-gradient(transparent 55%, rgba(255, 255, 255, 0.45))' : undefined,
  } as CSSProperties
  return (
    <div ref={tbRef} className={`tb${text.wrap ? '' : ' nowrap'}`} style={style}>
      {editing && renderEditor ? (
        <div className="rt-host" style={rtStyle}>
          {renderEditor(el, ctx)}
        </div>
      ) : textAnim ? (
        <div ref={rtRef} className="rt" style={rtStyle}>
          <AnimatedParagraphs doc={text.doc} ctx={ctx} paras={textAnim} />
        </div>
      ) : text.warp && !isDocEmpty(text.doc) ? (
        <WarpedText el={el} ctx={ctx} w={Math.max(1, tr[2] - tr[0] - l - r)} h={Math.max(1, tr[3] - tr[1] - t - b)} />
      ) : (
        <div ref={rtRef} className={`rt${prompt && html.includes('class="prompt"') ? ' has-prompt' : ''}`} style={rtStyle} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}

function ShapeView(props: ElementProps & { el: ShapeElement; textAnim?: TextAnimPara[] }) {
  const { rc, mode, editingId } = props
  const schemeFx = effectiveEffects(props.el, rc.effectScheme)
  const el = schemeFx === props.el.effects ? props.el : { ...props.el, effects: schemeFx }
  const editing = editingId === el.id
  const isPic = el.placeholder?.style === 'pic'
  const emptyPh = mode === 'edit' && !!el.placeholder && el.fill.type === 'none' && !el.line
  const contentPh = mode === 'edit' && !editing && (el.placeholder?.style === 'body' || el.placeholder?.style === 'captionBody') && !!el.text && el.text.doc.content.every((p) => !p.content?.length) && el.w > 160 && el.h > 120
  return (
    <div
      className={`el el-shape${emptyPh ? ' is-placeholder' : ''}${el.text ? '' : ' no-text'}`}
      data-el={mode === 'edit' ? el.id : undefined}
      data-line={el.text ? undefined : 'true'}
      data-link={mode === 'show' ? el.link : undefined}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: elementTransform(el.rot, el.effects), ...reflection(el.effects) }}
    >
      <ShapeGeometry el={el} colors={rc.colors} />
      {el.text && <TextLayer el={el} rc={rc} mode={mode} editing={editing} renderEditor={props.renderEditor} onAutofit={props.onAutofit} textAnim={props.textAnim} />}
      {contentPh && <ContentIcons id={el.id} />}
      {isPic && mode === 'edit' && (
        <button type="button" className="ph-picture" aria-label={t('Insert picture')} title={t('Pictures')} onPointerDown={(e) => e.stopPropagation()} onClick={() => props.onPicturePlaceholder?.(el.id)}>
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="10" r="2" fill="currentColor" />
            <path d="M3 18l5-5 4 4 3-3 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      )}
    </div>
  )
}

const CONTENT_ICONS: { kind: string; label: string; d: string }[] = [
  { kind: 'table', label: tx('Insert Table'), d: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14' },
  { kind: 'chart', label: tx('Insert Chart'), d: 'M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20' },
  { kind: 'diagram', label: tx('Insert a Diagram'), d: 'M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4' },
  { kind: 'picture', label: tx('Pictures'), d: 'M3 4h18v16H3zM3 17l5-5 4 4 3-3 6 6M9 9.5a1.5 1.5 0 1 0 0 .01' },
  { kind: 'icons', label: tx('Insert an Icon'), d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01' },
  { kind: 'video', label: tx('Insert Video'), d: 'M3 6h13v12H3zM16 10l5-3v10l-5-3' },
]

/** The insert icons shown in the middle of an empty content placeholder, as in the original. */
function ContentIcons({ id }: { id: string }) {
  return (
    <div className="ph-icons" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {CONTENT_ICONS.map((ic) => (
        <button key={ic.kind} type="button" title={t(ic.label)} aria-label={t(ic.label)} onClick={() => window.dispatchEvent(new CustomEvent('kontor:ph-insert', { detail: { id, kind: ic.kind } }))}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d={ic.d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </button>
      ))}
    </div>
  )
}

function AnimLayerView({ layer, origin, children }: { layer: AnimLayer; origin: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const motion = layer.motion
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !motion) return
    // Sample the path and play it with the Web Animations API.
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', motion.d)
    let len = 0
    try {
      len = p.getTotalLength()
    } catch {
      len = 0
    }
    const frames: Keyframe[] = []
    const n = 48
    for (let i = 0; i <= n; i++) {
      const pt = len ? p.getPointAtLength((len * i) / n) : { x: 0, y: 0 }
      frames.push({ transform: `translate(${pt.x}px, ${pt.y}px)` })
    }
    const a = node.animate(frames, { duration: motion.duration * 1000, delay: motion.delay * 1000, iterations: Math.max(1, motion.repeat), fill: 'both', easing: 'ease-in-out' })
    return () => a.cancel()
  }, [motion])
  return (
    <div ref={ref} className={`anim-wrap${layer.className ? ` ${layer.className}` : ''}`} style={{ transformOrigin: origin, ...layer.style }}>
      {children}
    </div>
  )
}

const ARTISTIC: Record<NonNullable<NonNullable<ImageElement['adjust']>['artistic']>, string> = {
  blur: 'blur(3px)',
  pencil: 'grayscale(1) contrast(2.2) brightness(1.25)',
  photocopy: 'grayscale(1) contrast(6) brightness(1.1)',
  glowEdges: 'invert(1) contrast(1.6) saturate(1.8)',
  paint: 'saturate(1.8) contrast(1.3) blur(0.6px)',
}

export function imageFilter(el: ImageElement, sharpenId?: string) {
  const a = el.adjust
  const parts: string[] = []
  if (a?.brightness) parts.push(`brightness(${1 + a.brightness})`)
  if (a?.contrast) parts.push(`contrast(${1 + a.contrast})`)
  if (a?.saturation !== undefined && a.saturation !== 0) parts.push(`saturate(${1 + a.saturation})`)
  if (a?.grayscale) parts.push('grayscale(1)')
  if (a?.recolor === 'sepia') parts.push('sepia(1)')
  if (a?.recolor === 'washout') parts.push('brightness(1.7) contrast(0.3)')
  if (a?.recolor === 'bw') parts.push('grayscale(1) contrast(8)')
  if (a?.temperature) parts.push(a.temperature > 0 ? `sepia(${(a.temperature * 0.45).toFixed(2)}) saturate(${(1 + a.temperature * 0.3).toFixed(2)})` : `hue-rotate(${(a.temperature * -18).toFixed(0)}deg) saturate(${(1 + a.temperature * 0.2).toFixed(2)})`)
  if (a?.sharpness && a.sharpness < 0) parts.push(`blur(${(-a.sharpness * 2.5).toFixed(2)}px)`)
  if (a?.sharpness && a.sharpness > 0 && sharpenId) parts.push(`url(#${sharpenId})`)
  if (a?.artistic) parts.push(ARTISTIC[a.artistic])
  return parts.join(' ') || undefined
}

function ImageView({ el, rc, mode }: ElementProps & { el: ImageElement }) {
  const crop = el.crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const iw = el.w / Math.max(0.01, 1 - crop.l - crop.r)
  const ih = el.h / Math.max(0.01, 1 - crop.t - crop.b)
  const mask = el.mask ? geometry(el.mask, el.w, el.h).paths[0]?.d : undefined
  const line = el.line
  const flip = el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : undefined
  return (
    <div
      className="el el-image"
      data-el={mode === 'edit' ? el.id : undefined}
      data-link={mode === 'show' ? el.link : undefined}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: elementTransform(el.rot, el.effects), filter: effectsFilter(el.effects, rc.colors), ...reflection(el.effects) }}
    >
      {!!el.adjust?.sharpness && el.adjust.sharpness > 0 && (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <filter id={`ksharp-${el.id}-${mode}`}>
            <feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix={(() => {
              const k = el.adjust!.sharpness! * 0.9
              return `0 ${-k} 0 ${-k} ${1 + 4 * k} ${-k} 0 ${-k} 0`
            })()} />
          </filter>
        </svg>
      )}
      <div className="img-clip" style={{ clipPath: mask ? `path('${mask}')` : undefined, transform: flip }}>
        <img
          src={el.src}
          alt={el.alt ?? ''}
          draggable={false}
          style={{ left: -crop.l * iw, top: -crop.t * ih, width: iw, height: ih, filter: imageFilter(el, `ksharp-${el.id}-${mode}`), opacity: el.adjust?.transparency ? 1 - el.adjust.transparency : undefined }}
        />
      </div>
      {line && (
        <svg className="el-geo" width={el.w} height={el.h} overflow="visible" aria-hidden="true">
          <path d={mask ?? `M0 0 H${el.w} V${el.h} H0 Z`} fill="none" stroke={withAlpha(resolveColor(line.color, rc.colors), line.alpha)} strokeWidth={line.width * PT} strokeDasharray={dashArray(line)} />
        </svg>
      )}
    </div>
  )
}

function InkView({ el, rc, mode }: ElementProps & { el: InkElement }) {
  const d = el.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <div className="el el-ink" data-el={mode === 'edit' ? el.id : undefined} style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined }}>
      <svg className="el-geo" width={Math.max(el.w, 1)} height={Math.max(el.h, 1)} overflow="visible" aria-hidden="true" style={{ mixBlendMode: el.highlighter ? 'multiply' : undefined }}>
        <path d={d} fill="none" stroke={resolveColor(el.color, rc.colors)} strokeOpacity={el.highlighter ? 0.45 : 1} strokeWidth={el.width} strokeLinecap={el.highlighter ? 'square' : 'round'} strokeLinejoin="round" />
        <path className="hit" d={d} fill="none" stroke="transparent" strokeWidth={Math.max(12, el.width + 8)} />
      </svg>
    </div>
  )
}

function borderStyle(side: 'Top' | 'Right' | 'Bottom' | 'Left', line: Line, colors: ThemeColors): CSSProperties {
  if (!line) return { [`border${side}`]: 'none' } as CSSProperties
  const w = Math.max(0.75, line.width * PT)
  const style = line.dash === 'solid' ? 'solid' : line.dash === 'sysDot' ? 'dotted' : 'dashed'
  return { [`border${side}`]: `${w.toFixed(2)}px ${style} ${withAlpha(resolveColor(line.color, colors), line.alpha)}` } as CSSProperties
}

function TableView(props: ElementProps & { el: TableElement }) {
  const { el, rc, mode, editingId, cellSel, onTableMeasure } = props
  const tableRef = useRef<HTMLTableElement>(null)
  const sel = cellSel && cellSel.id === el.id ? cellSel : null
  const editing = editingId === el.id && sel?.editing

  useLayoutEffect(() => {
    if (mode !== 'edit' || !onTableMeasure || !tableRef.current) return
    const trs = Array.from(tableRef.current.rows)
    const heights = trs.map((tr) => tr.offsetHeight)
    if (heights.some((h, i) => h > (el.rows[i]?.h ?? 0) + 0.5)) onTableMeasure(el.id, heights.map((h, i) => Math.max(h, el.rows[i]?.h ?? h)))
  })

  return (
    <div
      className="el el-table"
      data-el={mode === 'edit' ? el.id : undefined}
      data-link={mode === 'show' ? el.link : undefined}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined, filter: effectsFilter(el.effects, rc.colors) }}
    >
      <table ref={tableRef} className="kt" style={{ width: el.cols.reduce((a, b) => a + b, 0) }}>
        <colgroup>
          {el.cols.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>
          {el.rows.map((row, r) => (
            <tr key={r} style={{ height: row.h }}>
              {row.cells.map((cell, c) => {
                if (cell.merged) return null
                const look = cellLook(el, r, c)
                const ctx = tableCellCtx(rc, look.color, look.bold)
                const [ml, mt, mr, mb] = cell.margins ?? [9.6, 4.8, 9.6, 4.8]
                const inSel = !!sel && !sel.editing && r >= sel.range.r0 && r <= sel.range.r1 && c >= sel.range.c0 && c <= sel.range.c1
                const isEditing = editing && sel!.range.r0 === r && sel!.range.c0 === c
                const vertical = cell.vert === 'vert' || cell.vert === 'vert270'
                const rtStyle = { fontFamily: ctx.font, color: ctx.color, fontWeight: ctx.bold ? 700 : undefined, '--fscale': 1 } as CSSProperties
                return (
                  <td
                    key={c}
                    rowSpan={cell.rowSpan}
                    colSpan={cell.colSpan}
                    data-cell={`${r}:${c}`}
                    className={inSel ? 'is-cell-selected' : undefined}
                    style={{
                      background: fillToCss(look.fill, rc.colors),
                      padding: `${mt}px ${mr}px ${mb}px ${ml}px`,
                      verticalAlign: cell.anchor === 'middle' ? 'middle' : cell.anchor === 'bottom' ? 'bottom' : 'top',
                      writingMode: vertical ? 'vertical-rl' : undefined,
                      transform: cell.vert === 'vert270' ? 'rotate(180deg)' : undefined,
                      ...borderStyle('Top', look.borders.t, rc.colors),
                      ...borderStyle('Right', look.borders.r, rc.colors),
                      ...borderStyle('Bottom', look.borders.b, rc.colors),
                      ...borderStyle('Left', look.borders.l, rc.colors),
                    }}
                  >
                    {isEditing && props.renderCellEditor ? (
                      <div className="rt-host" style={rtStyle}>
                        {props.renderCellEditor(el, r, c, ctx)}
                      </div>
                    ) : (
                      <div className="rt" style={rtStyle} dangerouslySetInnerHTML={{ __html: docToHtml(cell.doc, ctx) }} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartView({ el, rc, mode }: ElementProps & { el: ChartElement }) {
  return (
    <div
      className="el el-chart"
      data-el={mode === 'edit' ? el.id : undefined}
      data-link={mode === 'show' ? el.link : undefined}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined }}
    >
      <ChartSvg chart={el} colors={rc.colors} font={fontStack(rc.fonts.minor)} />
    </div>
  )
}

function fmtMedia(t: number) {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Video or audio: a still poster with a control bar while editing, a real player in the slide show. */
function MediaView({ el, mode }: ElementProps & { el: MediaElement }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(el.trimStart ?? 0)
  const start = el.trimStart ?? 0
  const end = el.trimEnd ?? el.duration ?? null
  const live = mode === 'edit' || mode === 'show'
  useEffect(() => {
    const m = ref.current
    if (!m) return
    m.volume = Math.max(0, Math.min(1, el.volume ?? 1))
    m.muted = (el.volume ?? 1) === 0
    const onTime = () => {
      setTime(m.currentTime)
      if (end !== null && m.currentTime >= end) {
        if (el.loop && mode === 'show') m.currentTime = start
        else {
          m.pause()
          if (el.rewind) m.currentTime = start
        }
      }
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      setPlaying(false)
      if (el.rewind) m.currentTime = start
    }
    m.addEventListener('timeupdate', onTime)
    m.addEventListener('play', onPlay)
    m.addEventListener('pause', onPause)
    m.addEventListener('ended', onEnded)
    if (m.currentTime < start) m.currentTime = start
    if (mode === 'show' && el.autoPlay) m.play().catch(() => undefined)
    return () => {
      m.removeEventListener('timeupdate', onTime)
      m.removeEventListener('play', onPlay)
      m.removeEventListener('pause', onPause)
      m.removeEventListener('ended', onEnded)
      if (mode === 'show') m.pause()
    }
  }, [el.volume, el.loop, el.rewind, el.autoPlay, start, end, mode])
  const toggle = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation()
    const m = ref.current
    if (!m) return
    if (m.paused) {
      if (end !== null && m.currentTime >= end - 0.05) m.currentTime = start
      if (mode === 'show' && el.fullScreen && el.kind === 'video') (m as HTMLVideoElement).requestFullscreen?.().catch(() => undefined)
      m.play().catch(() => undefined)
    } else m.pause()
  }
  const hidden = mode === 'show' && el.hideWhenNotPlaying && !playing
  const total = (end ?? 0) - start
  return (
    <div
      className={`el el-media media-${el.kind}`}
      data-el={mode === 'edit' ? el.id : undefined}
      data-media={mode === 'show' ? el.id : undefined}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined, visibility: hidden ? 'hidden' : undefined }}
      onClick={mode === 'show' ? toggle : undefined}
    >
      {el.kind === 'video' ? (
        live ? (
          <video ref={ref} src={el.src} poster={el.poster ?? undefined} preload="metadata" playsInline loop={el.loop && mode === 'show' && end === null} />
        ) : el.poster ? (
          <img src={el.poster} alt="" draggable={false} />
        ) : (
          <div className="media-still" />
        )
      ) : (
        <>
          {live && <audio ref={ref} src={el.src} preload="metadata" loop={el.loop && mode === 'show' && end === null} />}
          <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="#7a7a7a" />
            <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="#7a7a7a" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </>
      )}
      {live && (mode === 'edit' || !el.autoPlay || el.kind === 'audio') && (
        <div className="media-bar" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <button type="button" aria-label={playing ? t('Pause') : t('Play')} onClick={toggle}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, total)}
            step={0.05}
            value={Math.max(0, time - start)}
            aria-label={t('Seek')}
            onChange={(e) => {
              const m = ref.current
              if (m) m.currentTime = start + Number(e.target.value)
            }}
          />
          <span>{fmtMedia(Math.max(0, time - start))}</span>
        </div>
      )}
    </div>
  )
}

/** Slide zoom: draws the target slide live from the open presentation. */
function ZoomView({ el, rc, mode }: ElementProps & { el: ZoomElement }) {
  const pres = useZoomPres()
  const target = pres?.slides.find((s) => s.id === el.targetId)
  const scale = pres ? Math.min(el.w / pres.size.w, el.h / pres.size.h) : 1
  return (
    <div
      className="el el-zoom"
      data-el={mode === 'edit' ? el.id : undefined}
      data-link={mode === 'show' ? `#sid:${el.targetId}` : undefined}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined, outline: el.line ? `${Math.max(1, el.line.width * PT)}px solid ${resolveColor(el.line.color, rc.colors)}` : undefined }}
    >
      {pres && target ? (
        <div className="zoom-inner" style={{ width: pres.size.w * scale, height: pres.size.h * scale }}>
          <ZoomSlide slide={target} index={pres.slides.indexOf(target)} scale={scale} />
        </div>
      ) : (
        <div className="zoom-missing">{t('Slide not found')}</div>
      )}
    </div>
  )
}

function DiagramView(props: ElementProps & { el: DiagramElement }) {
  const { el, mode } = props
  const shapes = diagramShapes(el)
  return (
    <div className="el el-diagram" data-el={mode === 'edit' ? el.id : undefined} data-link={mode === 'show' ? el.link : undefined} style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined }}>
      {shapes.map((c) => (
        <ElementView key={c.id} el={c} rc={props.rc} mode={mode === 'edit' ? 'thumb' : mode} />
      ))}
    </div>
  )
}

function GroupView(props: ElementProps & { el: GroupElement }) {
  const { el, mode } = props
  return (
    <div className="el el-group" data-el={mode === 'edit' ? el.id : undefined} style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined }}>
      {el.children.map((c) => (
        <ElementView key={c.id} {...props} el={c} mode={mode} />
      ))}
    </div>
  )
}

export const ElementView = memo(function ElementView(props: ElementProps) {
  const { el, anim } = props
  if (el.hidden && props.mode !== 'deco') return null
  const st = anim?.(el)
  let inner: ReactNode
  switch (el.type) {
    case 'shape':
      inner = <ShapeView {...props} el={el} textAnim={st?.text} />
      break
    case 'image':
      inner = <ImageView {...props} el={el} />
      break
    case 'group':
      inner = <GroupView {...props} el={el} />
      break
    case 'ink':
      inner = <InkView {...props} el={el} />
      break
    case 'table':
      inner = <TableView {...props} el={el} />
      break
    case 'chart':
      inner = <ChartView {...props} el={el} />
      break
    case 'diagram':
      inner = <DiagramView {...props} el={el} />
      break
    case 'media':
      inner = <MediaView {...props} el={el} />
      break
    case 'zoom':
      inner = <ZoomView {...props} el={el} />
      break
  }
  if (!st) return inner
  const origin = `${el.x + el.w / 2}px ${el.y + el.h / 2}px`
  let node = inner
  for (const layer of [...(st.layers ?? [])].reverse()) node = <AnimLayerView layer={layer} origin={origin}>{node}</AnimLayerView>
  if (st.persist) node = <div className="anim-wrap" style={{ transformOrigin: origin, ...st.persist }}>{node}</div>
  return (
    <div className={`anim-wrap${st.hidden ? ' anim-hidden' : ''}`} data-trigger={st.trigger ? el.id : undefined} style={{ transform: st.offset && (st.offset.x || st.offset.y) ? `translate(${st.offset.x}px, ${st.offset.y}px)` : undefined }}>
      {node}
    </div>
  )
})

// Zooms need the whole presentation; the slide view registers how to draw a slide (avoids a circular import).
type ZoomRenderer = { usePres: () => import('../model/types').Presentation | null; Slide: (p: { slide: import('../model/types').Slide; index: number; scale: number }) => ReactNode }
let zoomRenderer: ZoomRenderer | null = null
export function registerZoomRenderer(r: ZoomRenderer) {
  zoomRenderer = r
}
function useZoomPres() {
  return zoomRenderer ? zoomRenderer.usePres() : null
}
function ZoomSlide(p: { slide: import('../model/types').Slide; index: number; scale: number }) {
  return <>{zoomRenderer?.Slide(p)}</>
}

// Reads .pptx files (OOXML) into the presentation model. Files written by Kontor Slides carry the
// original model and are restored exactly as long as their slides were not changed elsewhere.
import type JSZipType from 'jszip'
import type { ArrowHead, ChartElement, Dash, Effects, MediaElement, Fill, GroupElement, ImageElement, Inline, LayoutId, Line, Mark, Para, ParaAttrs, PlaceholderStyle, Presentation, RichDoc, ShapeElement, Slide, SlideElement, TableCell, TableElement, TableRow, TextBody, Transition, TransitionName } from '../model/types'
import { adjustLum, hslToHex, rgbToHsl } from '../model/color'
import { createPresentation, uid, DEFAULT_INSET } from '../model/factory'
import { hasGeometry } from '../model/shapes'
import { hasCurves, type VertexHandles } from '../model/outline'
import { hashString, KONTOR_PART, MEDIA_REF, mapStrings } from './package'
import { CHART_NS, parseChartSpace } from './chartXml'
import { readTiming } from './timingXml'
import { TRANSITION_SOUNDS } from '../model/sounds'
import { t } from '../i18n'

const EMU = 9525
const px = (v: string | null | undefined) => (v ? Number(v) / EMU : 0)

type Part = { path: string; doc: Document; rels: Map<string, { target: string; type: string; external: boolean }> }

type Scheme = Record<string, string>

type Ctx = {
  zip: JSZipType
  scheme: Scheme
  clrMap: Record<string, string>
  media: Map<string, string>
}

// ---------- XML helpers (prefix-agnostic) ----------

function kids(el: Element | null | undefined, local: string): Element[] {
  return el ? Array.from(el.children).filter((c) => c.localName === local) : []
}

function kid(el: Element | null | undefined, local: string): Element | null {
  if (!el) return null
  for (const c of Array.from(el.children)) if (c.localName === local) return c
  return null
}

function path(el: Element | null | undefined, ...locals: string[]): Element | null {
  let cur: Element | null | undefined = el
  for (const l of locals) cur = kid(cur, l)
  return cur ?? null
}

function attrR(el: Element, name: string) {
  return el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name) ?? el.getAttribute(`r:${name}`)
}

function resolvePath(base: string, target: string) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

async function loadPart(zip: JSZipType, p: string): Promise<Part | null> {
  const file = zip.file(p)
  if (!file) return null
  const doc = new DOMParser().parseFromString(await file.async('string'), 'application/xml')
  const relsPath = p.replace(/([^/]+)$/, '_rels/$1.rels')
  const rels = new Map<string, { target: string; type: string; external: boolean }>()
  const relFile = zip.file(relsPath)
  if (relFile) {
    const rdoc = new DOMParser().parseFromString(await relFile.async('string'), 'application/xml')
    for (const r of Array.from(rdoc.getElementsByTagName('Relationship'))) {
      const external = r.getAttribute('TargetMode') === 'External'
      const target = r.getAttribute('Target') ?? ''
      rels.set(r.getAttribute('Id') ?? '', { target: external ? target : resolvePath(p, target), type: r.getAttribute('Type') ?? '', external })
    }
  }
  return { path: p, doc, rels }
}

function relOfType(part: Part, suffix: string) {
  for (const r of part.rels.values()) if (r.type.endsWith(suffix)) return r.target
  return null
}

// ---------- Colors ----------

const PRESET_COLORS: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', orange: 'FFA500', purple: '800080', darkGray: 'A9A9A9', lightGray: 'D3D3D3' }

function applyMods(hex: string, el: Element): { color: string; alpha?: number } {
  let color = hex
  let alpha: number | undefined
  let [h, s, l] = rgbToHsl(color)
  let hslDirty = false
  for (const m of Array.from(el.children)) {
    const val = Number(m.getAttribute('val') ?? 0) / 100000
    switch (m.localName) {
      case 'lumMod':
        if (hslDirty) [h, s, l] = [h, s, l]
        else [h, s, l] = rgbToHsl(color)
        l = l * val
        hslDirty = true
        break
      case 'lumOff':
        if (!hslDirty) [h, s, l] = rgbToHsl(color)
        l = Math.min(1, l + val)
        hslDirty = true
        break
      case 'tint':
        if (hslDirty) color = hslToHex(h, s, l)
        color = adjustLum(color, 1 - val)
        ;[h, s, l] = rgbToHsl(color)
        hslDirty = false
        break
      case 'shade':
        if (hslDirty) color = hslToHex(h, s, l)
        color = adjustLum(color, -(1 - val))
        ;[h, s, l] = rgbToHsl(color)
        hslDirty = false
        break
      case 'alpha':
        alpha = val
        break
    }
  }
  if (hslDirty) color = hslToHex(h, s, Math.max(0, Math.min(1, l)))
  return { color, alpha }
}

function colorOf(el: Element | null, ctx: Ctx, phClr?: string): { color: string; alpha?: number } | null {
  if (!el) return null
  const c = el.firstElementChild && ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(el.localName) ? el : Array.from(el.children).find((x) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(x.localName))
  const node = c ?? (['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(el.localName) ? el : null)
  if (!node) return null
  let hex = '000000'
  const val = node.getAttribute('val') ?? ''
  switch (node.localName) {
    case 'srgbClr':
      hex = val
      break
    case 'sysClr':
      hex = node.getAttribute('lastClr') ?? (val === 'window' ? 'FFFFFF' : '000000')
      break
    case 'prstClr':
      hex = PRESET_COLORS[val] ?? '000000'
      break
    case 'schemeClr': {
      if (val === 'phClr' && phClr) hex = phClr.replace('#', '')
      else {
        const mapped = ctx.clrMap[val] ?? val
        hex = ctx.scheme[mapped] ?? ctx.scheme[val] ?? '000000'
      }
      break
    }
    case 'scrgbClr': {
      const ch = ['r', 'g', 'b'].map((k) => Math.round((Number(node.getAttribute(k) ?? 0) / 100000) ** (1 / 2.2) * 255))
      hex = ch.map((x) => x.toString(16).padStart(2, '0')).join('')
      break
    }
  }
  return applyMods(`#${hex.toUpperCase()}`, node)
}

// ---------- Fills, lines, effects ----------

function fillOf(spPr: Element | null, ctx: Ctx, part: Part): Fill | undefined {
  if (!spPr) return undefined
  for (const c of Array.from(spPr.children)) {
    if (c.localName === 'noFill') return { type: 'none' }
    if (c.localName === 'solidFill') {
      const col = colorOf(c, ctx)
      return col ? { type: 'solid', color: col.color, alpha: col.alpha } : undefined
    }
    if (c.localName === 'gradFill') {
      const stops = kids(kid(c, 'gsLst'), 'gs').map((gs) => {
        const col = colorOf(gs, ctx) ?? { color: '#000000' }
        return { pos: Number(gs.getAttribute('pos') ?? 0) / 100000, color: col.color, alpha: col.alpha }
      })
      const lin = kid(c, 'lin')
      const radial = !!kid(c, 'path')
      return { type: 'gradient', kind: radial ? 'radial' : 'linear', angle: lin ? Number(lin.getAttribute('ang') ?? 0) / 60000 : 90, stops: stops.length ? stops : [{ pos: 0, color: '#FFFFFF' }, { pos: 1, color: '#000000' }] }
    }
    if (c.localName === 'blipFill') {
      const blip = kid(c, 'blip')
      const id = blip && attrR(blip, 'embed')
      const target = id ? part.rels.get(id)?.target : undefined
      const src = target ? ctx.media.get(target) : undefined
      if (src) return { type: 'picture', src, tile: !!kid(c, 'tile') }
    }
    if (c.localName === 'pattFill') {
      const fg = colorOf(kid(c, 'fgClr'), ctx)
      const bg = colorOf(kid(c, 'bgClr'), ctx)
      return { type: 'pattern', preset: c.getAttribute('prst') ?? 'pct5', fg: fg?.color ?? '#000000', bg: bg?.color ?? '#FFFFFF' }
    }
  }
  return undefined
}

function lineOf(ln: Element | null, ctx: Ctx, fallbackColor?: string): Line | undefined {
  if (!ln) return undefined
  if (kid(ln, 'noFill')) return null
  const col = colorOf(kid(ln, 'solidFill'), ctx) ?? (fallbackColor ? { color: fallbackColor } : null)
  if (!col) return undefined
  const dash = (kid(ln, 'prstDash')?.getAttribute('val') ?? 'solid') as Dash
  const end = (name: string) => {
    const t = kid(ln, name)?.getAttribute('type')
    return t && t !== 'none' ? (t as ArrowHead) : undefined
  }
  const cmpd = ln.getAttribute('cmpd') as NonNullable<Line>['compound'] | null
  return { color: col.color, alpha: col.alpha, width: ln.getAttribute('w') ? Number(ln.getAttribute('w')) / 12700 : 0.75, dash, head: end('headEnd'), tail: end('tailEnd'), ...(cmpd && cmpd !== 'sng' ? { compound: cmpd } : {}) }
}

function effectsOf(spPr: Element | null, ctx: Ctx): Effects | undefined {
  const lst = kid(spPr, 'effectLst')
  const fx: Effects = {}
  const bevel = path(spPr, 'sp3d', 'bevelT')
  if (bevel) fx.bevel = bevel.getAttribute('prst') ?? 'circle'
  const camera = path(spPr, 'scene3d', 'camera')
  const rot = kid(camera, 'rot')
  if (rot) {
    const ang = (v: string | null) => {
      const d = Number(v ?? 0) / 60000
      return d > 180 ? d - 360 : d
    }
    fx.rot3d = { x: ang(rot.getAttribute('lat')), y: ang(rot.getAttribute('lon')), ...(camera?.getAttribute('prst')?.startsWith('perspective') ? { perspective: true } : {}) }
  }
  if (!lst) return Object.keys(fx).length ? fx : undefined
  const inner = kid(lst, 'innerShdw')
  if (inner) {
    const col = colorOf(inner, ctx) ?? { color: '#000000', alpha: 0.5 }
    fx.innerShadow = { color: col.color, alpha: col.alpha ?? 1, blur: Number(inner.getAttribute('blurRad') ?? 0) / 12700, dist: Number(inner.getAttribute('dist') ?? 0) / 12700, angle: Number(inner.getAttribute('dir') ?? 0) / 60000 }
  }
  const sh = kid(lst, 'outerShdw')
  if (sh) {
    const col = colorOf(sh, ctx) ?? { color: '#000000', alpha: 0.4 }
    fx.shadow = { color: col.color, alpha: col.alpha ?? 1, blur: Number(sh.getAttribute('blurRad') ?? 0) / 12700, dist: Number(sh.getAttribute('dist') ?? 0) / 12700, angle: Number(sh.getAttribute('dir') ?? 0) / 60000 }
  }
  const glow = kid(lst, 'glow')
  if (glow) {
    const col = colorOf(glow, ctx) ?? { color: '#FFC000' }
    fx.glow = { color: col.color, alpha: col.alpha ?? 0.6, size: Number(glow.getAttribute('rad') ?? 0) / 12700 }
  }
  const soft = kid(lst, 'softEdge')
  if (soft) fx.softEdge = Number(soft.getAttribute('rad') ?? 0) / 12700
  if (kid(lst, 'reflection')) fx.reflection = true
  return Object.keys(fx).length ? fx : undefined
}

function xfrmOf(el: Element | null) {
  const xfrm = el && (kid(el, 'xfrm') ?? null)
  if (!xfrm) return null
  const off = kid(xfrm, 'off')
  const ext = kid(xfrm, 'ext')
  return {
    x: px(off?.getAttribute('x')),
    y: px(off?.getAttribute('y')),
    w: px(ext?.getAttribute('cx')),
    h: px(ext?.getAttribute('cy')),
    rot: Number(xfrm.getAttribute('rot') ?? 0) / 60000,
    flipH: xfrm.getAttribute('flipH') === '1' || undefined,
    flipV: xfrm.getAttribute('flipV') === '1' || undefined,
    chOff: kid(xfrm, 'chOff'),
    chExt: kid(xfrm, 'chExt'),
  }
}

// ---------- Text ----------

type LevelStyle = { size?: number; bold?: boolean; italic?: boolean; color?: string; font?: string; align?: ParaAttrs['align']; bullet?: string | null; bulletSize?: number; bulletColor?: string; startAt?: number; lineHeight?: number; lineExact?: number; spaceBefore?: number; spaceAfter?: number }

const ALIGN: Record<string, ParaAttrs['align']> = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'distributed' }

function readLevel(pPr: Element | null, ctx: Ctx, fonts: { major: string; minor: string }): LevelStyle {
  const out: LevelStyle = {}
  if (!pPr) return out
  const algn = pPr.getAttribute('algn')
  if (algn) out.align = ALIGN[algn] ?? 'left'
  const pct = path(pPr, 'lnSpc', 'spcPct')
  if (pct) out.lineHeight = Number(pct.getAttribute('val') ?? 100000) / 100000
  const pts = path(pPr, 'lnSpc', 'spcPts')
  if (pts) out.lineExact = Number(pts.getAttribute('val') ?? 1200) / 100
  const bef = path(pPr, 'spcBef', 'spcPts')
  if (bef) out.spaceBefore = Number(bef.getAttribute('val') ?? 0) / 100
  const aft = path(pPr, 'spcAft', 'spcPts')
  if (aft) out.spaceAfter = Number(aft.getAttribute('val') ?? 0) / 100
  if (kid(pPr, 'buNone')) out.bullet = 'none'
  const ch = kid(pPr, 'buChar')
  if (ch) out.bullet = ch.getAttribute('char') || '•'
  const num = kid(pPr, 'buAutoNum')
  if (num) out.bullet = `num:${num.getAttribute('type') ?? 'arabicPeriod'}`
  if (num?.getAttribute('startAt')) out.startAt = Number(num.getAttribute('startAt'))
  const szPct = kid(pPr, 'buSzPct')
  if (szPct) out.bulletSize = Number(szPct.getAttribute('val') ?? 100000) / 1000
  const buClr = colorOf(kid(pPr, 'buClr'), ctx)
  if (buClr) out.bulletColor = buClr.color
  const def = kid(pPr, 'defRPr')
  if (def) Object.assign(out, readRun(def, ctx, fonts))
  return out
}

function readRun(rPr: Element, ctx: Ctx, fonts: { major: string; minor: string }): LevelStyle {
  const out: LevelStyle = {}
  const sz = rPr.getAttribute('sz')
  if (sz) out.size = Number(sz) / 100
  if (rPr.getAttribute('b') !== null) out.bold = rPr.getAttribute('b') === '1' || rPr.getAttribute('b') === 'true'
  if (rPr.getAttribute('i') !== null) out.italic = rPr.getAttribute('i') === '1' || rPr.getAttribute('i') === 'true'
  const fill = kid(rPr, 'solidFill')
  if (fill) out.color = colorOf(fill, ctx)?.color
  const latin = kid(rPr, 'latin')?.getAttribute('typeface')
  if (latin) out.font = latin.startsWith('+mj') ? fonts.major : latin.startsWith('+mn') ? fonts.minor : latin
  return out
}

/** Text style chain for one placeholder or shape: list styles from master, layout and slide. */
type StyleChain = LevelStyle[][]

function lstStyleLevels(lst: Element | null, ctx: Ctx, fonts: { major: string; minor: string }): LevelStyle[] {
  const out: LevelStyle[] = []
  if (!lst) return out
  for (let i = 1; i <= 9; i++) out[i - 1] = readLevel(kid(lst, `lvl${i}pPr`), ctx, fonts)
  return out
}

function resolveLevel(chain: StyleChain, level: number): LevelStyle {
  const merged: LevelStyle = {}
  for (const levels of chain) Object.assign(merged, Object.fromEntries(Object.entries(levels[level] ?? {}).filter(([, v]) => v !== undefined)))
  return merged
}

function readTextBody(txBody: Element | null, ctx: Ctx, chain: StyleChain, fonts: { major: string; minor: string }, defaults: { anchor: TextBody['anchor']; autofit: TextBody['autofit'] }, bodyChain: Element[]): TextBody | undefined {
  if (!txBody) return undefined
  const bodyPr = kid(txBody, 'bodyPr')
  // bodyPr attributes inherit from layout/master placeholders.
  const bp = (name: string) => {
    for (const b of [bodyPr, ...bodyChain]) {
      const v = b?.getAttribute(name)
      if (v !== null && v !== undefined) return v
    }
    return null
  }
  const ins = (name: string, def: number) => (bp(name) !== null ? px(bp(name)) : def)
  const anchorAttr = bp('anchor')
  const anchor = anchorAttr === 'ctr' ? 'middle' : anchorAttr === 'b' ? 'bottom' : anchorAttr === 't' ? 'top' : defaults.anchor
  const warpPrst = kid(bodyPr, 'prstTxWarp')?.getAttribute('prst')
  const reflected = Array.from(txBody.getElementsByTagNameNS('*', 'rPr')).some((r) => !!kid(kid(r, 'effectLst'), 'reflection'))
  const fitEl = [bodyPr, ...bodyChain].map((b) => b && (kid(b, 'normAutofit') ?? kid(b, 'spAutoFit') ?? kid(b, 'noAutofit'))).find(Boolean)
  const autofit: TextBody['autofit'] = fitEl ? (fitEl.localName === 'normAutofit' ? 'shrink' : fitEl.localName === 'spAutoFit' ? 'resize' : 'none') : defaults.autofit
  const fontScale = fitEl?.localName === 'normAutofit' && fitEl.getAttribute('fontScale') ? Number(fitEl.getAttribute('fontScale')) / 100000 : undefined
  const lnSpcReduction = fitEl?.localName === 'normAutofit' && fitEl.getAttribute('lnSpcReduction') ? Number(fitEl.getAttribute('lnSpcReduction')) / 100000 : undefined
  const localChain = [...chain, lstStyleLevels(kid(txBody, 'lstStyle'), ctx, fonts)]
  const paras: Para[] = kids(txBody, 'p').map((p) => {
    const pPr = kid(p, 'pPr')
    const level = Number(pPr?.getAttribute('lvl') ?? 0)
    const style = { ...resolveLevel(localChain, level), ...Object.fromEntries(Object.entries(readLevel(pPr, ctx, fonts)).filter(([, v]) => v !== undefined)) } as LevelStyle
    const attrs: ParaAttrs = { level, align: style.align ?? 'left', bullet: style.bullet ?? 'none', lineHeight: style.lineHeight ?? 1, spaceBefore: style.spaceBefore ?? 0, spaceAfter: style.spaceAfter ?? 0 }
    if (style.bulletSize && Math.abs(style.bulletSize - 100) > 0.5) attrs.bulletSize = style.bulletSize
    if (style.bulletColor) attrs.bulletColor = style.bulletColor
    if (style.startAt && style.startAt > 1) attrs.startAt = style.startAt
    if (style.lineExact) attrs.lineExact = style.lineExact
    // Indents set on the paragraph itself that differ from the level's usual indent.
    const marL = pPr?.getAttribute('marL')
    const ind = pPr?.getAttribute('indent')
    const hasMarker = !!attrs.bullet && attrs.bullet !== 'none'
    if (marL !== null && marL !== undefined && Math.abs(px(marL) - ((hasMarker ? 24 : 0) + level * 48)) > 1) attrs.indent = Math.round(px(marL) * 10) / 10
    if (ind !== null && ind !== undefined && Math.abs(px(ind) - (hasMarker ? -24 : 0)) > 1) attrs.firstLine = Math.round(px(ind) * 10) / 10
    const content: Inline[] = []
    for (const node of Array.from(p.children)) {
      if (node.localName !== 'r' && node.localName !== 'br' && node.localName !== 'fld') continue
      const rPr = kid(node, 'rPr')
      const run = { ...style, ...(rPr ? Object.fromEntries(Object.entries(readRun(rPr, ctx, fonts)).filter(([, v]) => v !== undefined)) : {}) } as LevelStyle
      const marks: Mark[] = []
      if (run.bold) marks.push({ type: 'bold' })
      if (run.italic) marks.push({ type: 'italic' })
      if (rPr) {
        const u = rPr.getAttribute('u')
        if (u === 'sng' || u === 'words') marks.push({ type: 'underline' })
        const st = rPr.getAttribute('strike')
        if (st === 'sngStrike') marks.push({ type: 'strike' })
        const base = Number(rPr.getAttribute('baseline') ?? 0)
        if (base === 30000) marks.push({ type: 'superscript' })
        if (base === -25000) marks.push({ type: 'subscript' })
        const hl = colorOf(kid(rPr, 'highlight'), ctx)
        if (hl) marks.push({ type: 'highlight', attrs: { color: hl.color } })
        const link = kid(rPr, 'hlinkClick')
        const rid = link && attrR(link, 'id')
        const target = rid ? ctxPartRels?.get(rid) : undefined
        if (target?.external) marks.push({ type: 'link', attrs: { href: target.target } })
      }
      const ts: Extract<Mark, { type: 'textStyle' }>['attrs'] = {}
      if (run.size) ts.fontSize = run.size
      if (run.color) ts.color = run.color
      if (run.font) ts.fontFamily = run.font
      const spc = rPr?.getAttribute('spc')
      if (spc) ts.letterSpacing = Number(spc) / 100
      const cap = rPr?.getAttribute('cap')
      if (cap === 'all' || cap === 'small') ts.caps = cap
      if (rPr && kid(kid(rPr, 'effectLst'), 'outerShdw')) ts.shadow = true
      if (rPr) {
        const u = rPr.getAttribute('u')
        if (u && u !== 'none' && u !== 'sng' && u !== 'words') ts.uStyle = u
        const uFill = colorOf(kid(kid(rPr, 'uFill'), 'solidFill'), ctx)
        if (uFill) {
          ts.uColor = uFill.color
          if (!ts.uStyle && u && u !== 'none') ts.uStyle = u
        }
        if (rPr.getAttribute('strike') === 'dblStrike') ts.strike2 = true
        const base = Number(rPr.getAttribute('baseline') ?? 0)
        if (base && base !== 30000 && base !== -25000) ts.baseline = base / 1000
        if (rPr.getAttribute('normalizeH') === '1') ts.equalize = true
        const glow = kid(kid(rPr, 'effectLst'), 'glow')
        const glowColor = glow ? colorOf(glow, ctx) : null
        if (glow && glowColor) {
          ts.glow = glowColor.color
          ts.glowSize = Math.round((Number(glow.getAttribute('rad') ?? 63500) / 12700) * 10) / 10
        }
      }
      if (Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: ts })
      if (node.localName === 'br') content.push({ type: 'hardBreak', marks })
      else if (node.localName === 'fld' && node.getAttribute('type') === 'slidenum') content.push({ type: 'field', attrs: { kind: 'slidenum' }, marks })
      else if (node.localName === 'fld' && node.getAttribute('type')?.startsWith('datetime')) content.push({ type: 'field', attrs: { kind: 'date' }, marks })
      else {
        const text = kid(node, 't')?.textContent ?? ''
        if (text) content.push({ type: 'text', text, marks: marks.length ? marks : undefined })
      }
    }
    // Empty paragraphs keep their size via a textStyle-only attribute on the paragraph's end run.
    if (!content.length) {
      const end = kid(p, 'endParaRPr')
      const sz = end?.getAttribute('sz')
      if (sz) attrs.lineHeight = attrs.lineHeight ?? 1
    }
    return { type: 'paragraph', attrs, ...(content.length ? { content } : {}) }
  })
  const doc: RichDoc = { type: 'doc', content: paras.length ? paras : [{ type: 'paragraph' }] }
  const vert = bp('vert')
  return {
    doc,
    anchor,
    autofit,
    fontScale,
    lnSpcReduction,
    wrap: bp('wrap') !== 'none',
    inset: [ins('lIns', DEFAULT_INSET[0]), ins('tIns', DEFAULT_INSET[1]), ins('rIns', DEFAULT_INSET[2]), ins('bIns', DEFAULT_INSET[3])],
    vert: vert === 'vert' || vert === 'eaVert' ? 'vert' : vert === 'vert270' ? 'vert270' : vert === 'wordArtVert' || vert === 'wordArtVertRtl' ? 'stacked' : undefined,
    columns: bp('numCol') ? Number(bp('numCol')) : undefined,
    colSpacing: bp('spcCol') ? Number(bp('spcCol')) / 9525 : undefined,
    ...(warpPrst && warpPrst !== 'textNoShape' ? { warp: warpPrst } : {}),
    ...(reflected ? { textReflection: true } : {}),
  }
}

// Relationships of the part currently being read (used for hyperlinks in text runs).
let ctxPartRels: Part['rels'] | null = null

// ---------- Placeholders ----------

type PhInfo = { type: string; idx: string | null }

function phOf(sp: Element): PhInfo | null {
  const ph = path(sp, 'nvSpPr', 'nvPr', 'ph') ?? path(sp, 'nvPicPr', 'nvPr', 'ph')
  if (!ph) return null
  return { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') }
}

function findPh(part: Part | null, ph: PhInfo): Element | null {
  if (!part) return null
  const tree = part.doc.getElementsByTagNameNS('*', 'spTree')[0]
  const shapes = tree ? Array.from(tree.children).filter((c) => c.localName === 'sp' || c.localName === 'pic') : []
  const typeOf = (t: string) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' ? 'body' : t)
  return (
    (ph.idx !== null ? shapes.find((s) => phOf(s)?.idx === ph.idx && phOf(s)?.type === ph.type) : null) ??
    (ph.idx !== null ? shapes.find((s) => phOf(s)?.idx === ph.idx) : null) ??
    shapes.find((s) => phOf(s)?.type === ph.type) ??
    shapes.find((s) => typeOf(phOf(s)?.type ?? '') === typeOf(ph.type)) ??
    null
  )
}

function placeholderStyle(type: string, idx: string | null, layoutType: string): PlaceholderStyle {
  if (type === 'ctrTitle') return 'ctrTitle'
  if (type === 'subTitle') return 'subTitle'
  if (type === 'pic') return 'pic'
  if (type === 'title') return layoutType === 'secHead' ? 'sectionTitle' : layoutType === 'objTx' || layoutType === 'picTx' ? 'captionTitle' : 'title'
  if (layoutType === 'secHead') return 'sectionText'
  // In "Content with Caption" the content placeholder has index 1 (often without a type); the caption text is a body placeholder.
  if (layoutType === 'objTx' || layoutType === 'picTx') return type === 'obj' || (idx === '1' && type !== 'pic') ? 'captionBody' : 'captionText'
  if (layoutType === 'twoTxTwoObj' && type === 'body' && (idx === '1' || idx === '3')) return 'compHeader'
  return 'body'
}

const LAYOUT_MAP: Record<string, LayoutId> = {
  title: 'title',
  obj: 'titleContent',
  tx: 'titleContent',
  secHead: 'section',
  twoObj: 'twoContent',
  twoTxTwoObj: 'comparison',
  titleOnly: 'titleOnly',
  blank: 'blank',
  objTx: 'contentCaption',
  picTx: 'pictureCaption',
}

// ---------- Shapes ----------

type ReadEnv = {
  ctx: Ctx
  part: Part
  layout: Part | null
  master: Part | null
  layoutType: string
  fonts: { major: string; minor: string }
  hf: Presentation['headerFooter']
  /** Table style names from ppt/tableStyles.xml by style id. */
  tableStyleNames: Map<string, string>
  /** Chart part XML by package path. */
  chartXml: Map<string, string>
  /** Shape ids of the current slide (cNvPr id) mapped to element ids, for animations. */
  spids: Map<string, string>
  /** Connectors with glue to resolve after the slide is read. */
  glue: { el: ShapeElement; st: { spid: string; idx: number } | null; en: { spid: string; idx: number } | null }[]
}

function masterStyles(env: ReadEnv, phType: string | null): LevelStyle[] {
  const tx = env.master?.doc.getElementsByTagNameNS('*', 'txStyles')[0]
  if (!tx) return []
  const which = phType === null ? 'otherStyle' : phType === 'title' || phType === 'ctrTitle' ? 'titleStyle' : 'bodyStyle'
  return lstStyleLevels(kid(tx, which), env.ctx, env.fonts)
}

function styleRefs(sp: Element, ctx: Ctx) {
  const style = kid(sp, 'style')
  if (!style) return null
  const fillRef = kid(style, 'fillRef')
  const lnRef = kid(style, 'lnRef')
  const fontRef = kid(style, 'fontRef')
  return {
    fill: fillRef && Number(fillRef.getAttribute('idx')) > 0 ? colorOf(fillRef, ctx) : null,
    line: lnRef && Number(lnRef.getAttribute('idx')) > 0 ? colorOf(lnRef, ctx) : null,
    lineWidth: lnRef ? [0, 0.75, 1.5, 2.25][Number(lnRef.getAttribute('idx'))] ?? 1 : 1,
    font: fontRef ? colorOf(fontRef, ctx) : null,
  }
}

/**
 * Custom geometry (free-form shapes) as point rings in px at the shape's size. Curves are sampled;
 * guide formulas are not evaluated (such shapes fall back to a rectangle).
 */
function custGeomRings(cust: Element, w: number, h: number): { rings: [number, number][][]; handles: (VertexHandles | null)[][]; open: boolean } | null {
  const rings: [number, number][][] = []
  const handles: (VertexHandles | null)[][] = []
  let anyClosed = false
  for (const path of kids(kid(cust, 'pathLst'), 'path')) {
    const pw = Number(path.getAttribute('w')) || 0
    const ph = Number(path.getAttribute('h')) || 0
    const sx = pw ? w / pw : 1 / EMU
    const sy = ph ? h / ph : 1 / EMU
    let ring: [number, number][] | null = null
    let hs: (VertexHandles | null)[] = []
    let cur: [number, number] = [0, 0]
    const pt = (el: Element | undefined): [number, number] | null => {
      if (!el) return null
      const x = Number(el.getAttribute('x'))
      const y = Number(el.getAttribute('y'))
      return Number.isFinite(x) && Number.isFinite(y) ? [x * sx, y * sy] : null
    }
    const start = (q: [number, number]) => {
      ring = [q]
      hs = [null]
      rings.push(ring)
      handles.push(hs)
    }
    const cubic = (c1: [number, number], c2: [number, number], q: [number, number]) => {
      if (!ring) start(cur)
      hs[hs.length - 1] = { ...(hs[hs.length - 1] ?? {}), o: c1 }
      ring!.push(q)
      hs.push({ i: c2 })
      cur = q
    }
    for (const cmd of Array.from(path.children)) {
      const pts = kids(cmd, 'pt').map(pt)
      if (pts.some((q) => !q)) return null
      const p = pts as [number, number][]
      switch (cmd.localName) {
        case 'moveTo':
          start(p[0])
          cur = p[0]
          break
        case 'lnTo':
          if (!ring) start(cur)
          ring!.push(p[0])
          hs.push(null)
          cur = p[0]
          break
        case 'cubicBezTo':
          cubic(p[0], p[1], p[2])
          break
        case 'quadBezTo':
          cubic([cur[0] + (2 / 3) * (p[0][0] - cur[0]), cur[1] + (2 / 3) * (p[0][1] - cur[1])], [p[1][0] + (2 / 3) * (p[0][0] - p[1][0]), p[1][1] + (2 / 3) * (p[0][1] - p[1][1])], p[1])
          break
        case 'arcTo': {
          const wR = Number(cmd.getAttribute('wR')) * sx
          const hR = Number(cmd.getAttribute('hR')) * sy
          const st = (Number(cmd.getAttribute('stAng')) / 60000) * (Math.PI / 180)
          const sw = (Number(cmd.getAttribute('swAng')) / 60000) * (Math.PI / 180)
          if (![wR, hR, st, sw].every(Number.isFinite)) return null
          const cx = cur[0] - wR * Math.cos(st)
          const cy = cur[1] - hR * Math.sin(st)
          // Quarter-circle (or smaller) pieces as cubic Béziers.
          const n = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2) - 1e-9))
          const step = sw / n
          const k = (4 / 3) * Math.tan(step / 4)
          for (let i = 0; i < n; i++) {
            const a = st + step * i
            const b = a + step
            const pa: [number, number] = [cx + wR * Math.cos(a), cy + hR * Math.sin(a)]
            const pb: [number, number] = [cx + wR * Math.cos(b), cy + hR * Math.sin(b)]
            cubic([pa[0] - k * wR * Math.sin(a), pa[1] + k * hR * Math.cos(a)], [pb[0] + k * wR * Math.sin(b), pb[1] - k * hR * Math.cos(b)], pb)
          }
          break
        }
        case 'close': {
          anyClosed = true
          const r = ring as [number, number][] | null
          if (r && r.length > 1) {
            const a = r[0]
            const z = r[r.length - 1]
            if (Math.abs(a[0] - z[0]) < 1e-3 && Math.abs(a[1] - z[1]) < 1e-3) {
              r.pop()
              const last = hs.pop()
              if (last?.i) hs[0] = { ...(hs[0] ?? {}), i: last.i }
            }
          }
          ring = null
          break
        }
      }
    }
  }
  const keep = rings.map((r) => r.length > 1)
  const usable = rings.filter((_, i) => keep[i])
  const hsUsable = handles.filter((_, i) => keep[i])
  return usable.length ? { rings: usable, handles: hsUsable, open: !anyClosed } : null
}

function readSp(sp: Element, env: ReadEnv, fromMaster = false): SlideElement | null {
  const { ctx } = env
  const ph = phOf(sp)
  if (ph && (ph.type === 'dt' || ph.type === 'ftr' || ph.type === 'sldNum')) {
    if (fromMaster) return null
    const text = sp.textContent?.trim() ?? ''
    if (ph.type === 'sldNum') env.hf.slideNumber = true
    if (ph.type === 'dt') env.hf.date = true
    if (ph.type === 'ftr' && text) {
      env.hf.footer = true
      env.hf.footerText = text
    }
    return null
  }
  if (fromMaster && ph) return null
  const layoutPh = ph ? findPh(env.layout, ph) : null
  const masterPh = ph ? findPh(env.master, ph) : null
  const spPr = kid(sp, 'spPr')
  const geo = xfrmOf(spPr) ?? xfrmOf(kid(layoutPh, 'spPr')) ?? xfrmOf(kid(masterPh, 'spPr'))
  if (!geo) return null
  const prstGeom = kid(spPr, 'prstGeom')
  const cust = kid(spPr, 'custGeom') ? custGeomRings(kid(spPr, 'custGeom')!, geo.w, geo.h) : null
  let prst = prstGeom?.getAttribute('prst') ?? (cust ? 'custom' : 'rect')
  if (!cust && !hasGeometry(prst)) prst = prst.includes('Connector') ? 'line' : 'rect'
  const adj = kids(kid(prstGeom, 'avLst'), 'gd').map((g) => Number((g.getAttribute('fmla') ?? '').replace('val ', '')) || 0)
  const refs = styleRefs(sp, ctx)
  const fill = fillOf(spPr, ctx, env.part) ?? (refs?.fill ? { type: 'solid' as const, color: refs.fill.color, alpha: refs.fill.alpha } : { type: 'none' as const })
  const lnEl = kid(spPr, 'ln')
  let line = lineOf(lnEl, ctx, refs?.line?.color)
  if (line === undefined) line = refs?.line ? { color: refs.line.color, width: refs.lineWidth, dash: 'solid' } : null
  const nv = path(sp, 'nvSpPr', 'cNvPr') ?? path(sp, 'nvCxnSpPr', 'cNvPr')
  const isTextBox = path(sp, 'nvSpPr', 'cNvSpPr')?.getAttribute('txBox') === '1'
  const phType = ph?.type ?? null
  const chain: StyleChain = [masterStyles(env, phType)]
  if (masterPh) chain.push(lstStyleLevels(kid(kid(masterPh, 'txBody'), 'lstStyle'), ctx, env.fonts))
  if (layoutPh) chain.push(lstStyleLevels(kid(kid(layoutPh, 'txBody'), 'lstStyle'), ctx, env.fonts))
  if (!ph && refs?.font) chain.push([{ color: refs.font.color }])
  const bodyChain = [kid(kid(layoutPh, 'txBody'), 'bodyPr'), kid(kid(masterPh, 'txBody'), 'bodyPr')].filter((x): x is Element => !!x)
  ctxPartRels = env.part.rels
  const text = readTextBody(kid(sp, 'txBody'), ctx, chain, env.fonts, { anchor: ph ? (phType === 'title' ? 'middle' : 'top') : isTextBox ? 'top' : 'middle', autofit: 'none' }, bodyChain)
  const link = nv && kid(nv, 'hlinkClick')
  const linkRel = link ? env.part.rels.get(attrR(link, 'id') ?? '') : undefined
  const el: ShapeElement = {
    id: uid(),
    type: 'shape',
    name: nv?.getAttribute('name') || 'Shape',
    alt: nv?.getAttribute('descr') || undefined,
    hidden: nv?.getAttribute('hidden') === '1' || undefined,
    prst,
    adj: adj.length ? adj : undefined,
    x: geo.x,
    y: geo.y,
    w: geo.w,
    h: geo.h,
    rot: geo.rot,
    flipH: geo.flipH,
    flipV: geo.flipV,
    fill,
    line,
    effects: effectsOf(spPr, ctx),
    text: sp.localName === 'cxnSp' ? undefined : text,
    textBox: isTextBox || undefined,
    ...(cust && prst === 'custom' ? { rings: cust.rings, handles: hasCurves(cust.handles) ? cust.handles : undefined, ringsBox: { w: geo.w, h: geo.h }, open: cust.open || undefined } : {}),
    ...(kid(kid(kid(sp, 'nvSpPr'), 'cNvSpPr'), 'spLocks')?.getAttribute('noChangeAspect') === '1' && !ph ? { lockAspect: true } : {}),
    placeholder: ph ? { style: placeholderStyle(ph.type, ph.idx, env.layoutType), idx: Number(ph.idx ?? 0) } : undefined,
    link: linkRel?.external ? linkRel.target : undefined,
    locked: fromMaster || undefined,
  }
  return el
}

function readMedia(pic: Element, env: ReadEnv): SlideElement | null {
  const nvPr = path(pic, 'nvPicPr', 'nvPr')
  const file = kid(nvPr, 'videoFile') ?? kid(nvPr, 'audioFile')
  if (!file) return null
  const kind = file.localName === 'videoFile' ? 'video' : 'audio'
  // Prefer the embedded media part (p14:media) over the linked one.
  const p14 = nvPr?.getElementsByTagNameNS('*', 'media')[0]
  const rid = (p14 && attrR(p14, 'embed')) || attrR(file, 'link')
  const target = rid ? env.part.rels.get(rid)?.target : undefined
  const src = target ? env.ctx.media.get(target) : undefined
  const geo = xfrmOf(kid(pic, 'spPr'))
  if (!src || !geo) return null
  const blip = kid(kid(pic, 'blipFill'), 'blip')
  const posterRid = blip && attrR(blip, 'embed')
  const posterTarget = posterRid ? env.part.rels.get(posterRid)?.target : undefined
  const trim = p14?.getElementsByTagNameNS('*', 'trim')[0]
  const nv = path(pic, 'nvPicPr', 'cNvPr')
  const el: MediaElement = {
    id: uid(),
    type: 'media',
    name: nv?.getAttribute('name') || (kind === 'video' ? 'Video' : 'Audio'),
    kind,
    src,
    mime: src.slice(5, src.indexOf(';')),
    poster: kind === 'video' && posterTarget ? (env.ctx.media.get(posterTarget) ?? null) : null,
    x: geo.x,
    y: geo.y,
    w: geo.w,
    h: geo.h,
    rot: geo.rot,
    trimStart: trim?.getAttribute('st') ? Number(trim.getAttribute('st')) / 1000 : undefined,
    volume: 1,
  }
  return el
}

function readPic(pic: Element, env: ReadEnv, fromMaster = false): SlideElement | null {
  const { ctx } = env
  const spPr = kid(pic, 'spPr')
  const ph = phOf(pic)
  const geo = xfrmOf(spPr) ?? (ph ? xfrmOf(kid(findPh(env.layout, ph), 'spPr')) : null)
  if (!geo) return null
  const blipFill = kid(pic, 'blipFill')
  const blip = kid(blipFill, 'blip')
  const rid = blip && (attrR(blip, 'embed') ?? attrR(blip, 'link'))
  const target = rid ? env.part.rels.get(rid)?.target : undefined
  const src = target ? ctx.media.get(target) : undefined
  if (!src) return null
  const sr = kid(blipFill, 'srcRect')
  const crop = sr ? { l: Number(sr.getAttribute('l') ?? 0) / 100000, t: Number(sr.getAttribute('t') ?? 0) / 100000, r: Number(sr.getAttribute('r') ?? 0) / 100000, b: Number(sr.getAttribute('b') ?? 0) / 100000 } : undefined
  const lum = kid(blip, 'lum')
  const alpha = kid(blip, 'alphaModFix')
  const nv = path(pic, 'nvPicPr', 'cNvPr')
  const mask = kid(spPr, 'prstGeom')?.getAttribute('prst')
  const link = nv && kid(nv, 'hlinkClick')
  const linkRel = link ? env.part.rels.get(attrR(link, 'id') ?? '') : undefined
  const img: ImageElement = {
    id: uid(),
    type: 'image',
    name: nv?.getAttribute('name') || 'Picture',
    alt: nv?.getAttribute('descr') || undefined,
    hidden: nv?.getAttribute('hidden') === '1' || undefined,
    src,
    natW: 0,
    natH: 0,
    x: geo.x,
    y: geo.y,
    w: geo.w,
    h: geo.h,
    rot: geo.rot,
    flipH: geo.flipH,
    flipV: geo.flipV,
    crop,
    adjust:
      lum || alpha || kid(blip, 'grayscl') || kid(blip, 'biLevel') || kid(blip, 'duotone')
        ? {
            recolor: kid(blip, 'biLevel') ? 'bw' : kid(blip, 'duotone') ? 'sepia' : lum?.getAttribute('bright') === '70000' && lum.getAttribute('contrast') === '-70000' ? 'washout' : undefined,
            brightness: lum && lum.getAttribute('bright') !== '70000' ? Number(lum.getAttribute('bright') ?? 0) / 100000 : undefined,
            contrast: lum && lum.getAttribute('contrast') !== '-70000' ? Number(lum.getAttribute('contrast') ?? 0) / 100000 : undefined,
            transparency: alpha ? 1 - Number(alpha.getAttribute('amt') ?? 100000) / 100000 : undefined,
            grayscale: kid(blip, 'grayscl') ? true : undefined,
          }
        : undefined,
    line: lineOf(kid(spPr, 'ln'), ctx) ?? null,
    effects: effectsOf(spPr, ctx),
    mask: mask && mask !== 'rect' && hasGeometry(mask) ? mask : undefined,
    placeholder: ph ? { style: 'pic', idx: Number(ph.idx ?? 0) } : undefined,
    link: linkRel?.external ? linkRel.target : undefined,
    locked: fromMaster || undefined,
  }
  return img
}

// Built-in table style ids of the original program mapped to the closest own style.
const TABLE_STYLE_IDS: Record<string, string> = {
  '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}': 'medium-accent1',
  '{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}': 'medium-tx1',
  '{21E4AEA4-8DFA-4A89-87EB-49C32662AFE8}': 'medium-accent2',
  '{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}': 'medium-accent3',
  '{00A15C55-8517-42AA-B614-E9B94910E393}': 'medium-accent4',
  '{7DF18680-E054-41AD-8BC1-D1AEF772440D}': 'medium-accent5',
  '{93296810-A885-4BE3-A3E7-6D5BEEA58F35}': 'medium-accent6',
  '{2D5ABB26-0587-4C30-8999-92F81FD0307C}': 'none',
  '{5940675A-B579-460E-94D1-54222C63F5DA}': 'grid',
}

function tableStyleFromName(name: string): string | null {
  const accent = /Accent (\d)/.exec(name)?.[1]
  const slot = accent ? `accent${accent}` : 'tx1'
  if (/No Style, No Grid/i.test(name)) return 'none'
  if (/No Style, Table Grid/i.test(name)) return 'grid'
  if (/^Light Style 1/i.test(name) || /^Themed/i.test(name)) return `light-${slot}`
  if (/^Light/i.test(name)) return `lightgrid-${slot}`
  if (/^Medium Style 2/i.test(name)) return `medium-${slot}`
  if (/^Medium/i.test(name)) return `mediumgrid-${slot}`
  if (/^Dark/i.test(name)) return `dark-${slot}`
  return null
}

function readTable(frame: Element, env: ReadEnv): SlideElement | null {
  const tbl = frame.getElementsByTagNameNS('*', 'tbl')[0]
  const geo = xfrmOf(frame)
  if (!tbl || !geo) return null
  const tblPr = kid(tbl, 'tblPr')
  const flag = (n: string) => tblPr?.getAttribute(n) === '1'
  const styleGuid = kid(tblPr, 'tableStyleId')?.textContent?.trim() ?? ''
  const styleId = styleGuid ? (TABLE_STYLE_IDS[styleGuid] ?? (env.tableStyleNames.get(styleGuid) ? tableStyleFromName(env.tableStyleNames.get(styleGuid)!) : null) ?? 'medium-accent1') : 'none'
  const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => px(c.getAttribute('w')))
  const rows: TableRow[] = kids(tbl, 'tr').map((tr) => {
    const cells: TableCell[] = kids(tr, 'tc').map((tc) => {
      const tcPr = kid(tc, 'tcPr')
      const text = readTextBody(kid(tc, 'txBody'), env.ctx, [masterStyles(env, null)], env.fonts, { anchor: 'top', autofit: 'none' }, [])
      const cell: TableCell = { doc: text?.doc ?? { type: 'doc', content: [{ type: 'paragraph' }] } }
      if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') cell.merged = true
      const gs = Number(tc.getAttribute('gridSpan') ?? 1)
      const rs = Number(tc.getAttribute('rowSpan') ?? 1)
      if (gs > 1) cell.colSpan = gs
      if (rs > 1) cell.rowSpan = rs
      if (tcPr) {
        const explicitFill = Array.from(tcPr.children).some((c) => /Fill$/.test(c.localName))
        if (explicitFill) cell.fill = fillOf(tcPr, env.ctx, env.part) ?? null
        const borders: TableCell['borders'] = {}
        for (const [tag, side] of [['lnT', 't'], ['lnR', 'r'], ['lnB', 'b'], ['lnL', 'l']] as const) {
          const l = kid(tcPr, tag)
          if (l) {
            const v = lineOf(l, env.ctx)
            if (v !== undefined) borders[side] = v
          }
        }
        if (Object.keys(borders).length) cell.borders = borders
        const anchor = tcPr.getAttribute('anchor')
        if (anchor === 'ctr') cell.anchor = 'middle'
        else if (anchor === 'b') cell.anchor = 'bottom'
        const m = (n: string, d: number) => (tcPr.getAttribute(n) !== null ? px(tcPr.getAttribute(n)) : d)
        if (['marL', 'marR', 'marT', 'marB'].some((n) => tcPr.getAttribute(n) !== null)) cell.margins = [m('marL', 9.6), m('marT', 4.8), m('marR', 9.6), m('marB', 4.8)]
        const vert = tcPr.getAttribute('vert')
        if (vert === 'vert' || vert === 'vert270') cell.vert = vert
      }
      return cell
    })
    while (cells.length < cols.length) cells.push({ doc: { type: 'doc', content: [{ type: 'paragraph' }] } })
    return { h: px(tr.getAttribute('h')) || 40, cells: cells.slice(0, cols.length) }
  })
  const nv = path(frame, 'nvGraphicFramePr', 'cNvPr')
  const t: TableElement = {
    id: uid(),
    type: 'table',
    name: nv?.getAttribute('name') || 'Table',
    alt: nv?.getAttribute('descr') || undefined,
    x: geo.x,
    y: geo.y,
    w: cols.reduce((a, b) => a + b, 0) || geo.w,
    h: rows.reduce((a, r) => a + r.h, 0) || geo.h,
    rot: 0,
    cols,
    rows,
    styleId,
    opts: { headerRow: flag('firstRow'), totalRow: flag('lastRow'), bandedRows: flag('bandRow'), firstCol: flag('firstCol'), lastCol: flag('lastCol'), bandedCols: flag('bandCol') },
  }
  return t
}

function readChart(frame: Element, env: ReadEnv): SlideElement | null {
  const chartRef = frame.getElementsByTagNameNS(CHART_NS, 'chart')[0]
  const geo = xfrmOf(frame)
  if (!chartRef || !geo) return null
  const rid = attrR(chartRef, 'id')
  const target = rid ? env.part.rels.get(rid)?.target : null
  const xml = target ? env.chartXml.get(target) : null
  const data = xml ? parseChartSpace(xml) : null
  if (!data) return null
  const nv = path(frame, 'nvGraphicFramePr', 'cNvPr')
  const chart: ChartElement = { id: uid(), type: 'chart', name: nv?.getAttribute('name') || 'Chart', alt: nv?.getAttribute('descr') || undefined, x: geo.x, y: geo.y, w: geo.w, h: geo.h, rot: 0, ...data }
  return chart
}

function readTree(tree: Element, env: ReadEnv, fromMaster = false): SlideElement[] {
  const out: SlideElement[] = []
  for (const c of Array.from(tree.children)) {
    let el: SlideElement | null = null
    if (c.localName === 'sp' || c.localName === 'cxnSp') el = readSp(c, env, fromMaster)
    else if (c.localName === 'pic') el = readMedia(c, env) ?? readPic(c, env, fromMaster)
    else if (c.localName === 'grpSp') el = readGroup(c, env, fromMaster)
    else if (c.localName === 'graphicFrame') {
      el = readTable(c, env) ?? readChart(c, env)
      if (!el) {
        const geo = xfrmOf(c)
        const nv = path(c, 'nvGraphicFramePr', 'cNvPr')
        if (geo)
          el = {
            id: uid(),
            type: 'shape',
            name: nv?.getAttribute('name') || 'Object',
            prst: 'rect',
            ...geo,
            chOff: undefined,
            chExt: undefined,
            fill: { type: 'solid', color: '#F2F2F2' },
            line: { color: '#BFBFBF', width: 0.75, dash: 'dash' },
            text: { doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'center' }, content: [{ type: 'text', text: t('Chart or diagram (not supported yet)'), marks: [{ type: 'textStyle', attrs: { fontSize: 14, color: '#7F7F7F' } }] }] }] }, anchor: 'middle', autofit: 'none', wrap: true, inset: [...DEFAULT_INSET] },
          } as ShapeElement
      }
    } else if (c.localName === 'AlternateContent') {
      const fallback = kid(c, 'Fallback') ?? kid(c, 'Choice')
      if (fallback) out.push(...readTree(fallback, env, fromMaster))
    }
    if (el) {
      if (fromMaster) el.locked = true
      else {
        const nv = c.getElementsByTagNameNS('*', 'cNvPr')[0]
        if (nv?.getAttribute('id')) env.spids.set(nv.getAttribute('id')!, el.id)
        // Connector glue, resolved once every shape of the slide has its id.
        if (c.localName === 'cxnSp' && el.type === 'shape') {
          const cx = path(c, 'nvCxnSpPr', 'cNvCxnSpPr')
          const glue = (name: string) => {
            const g = kid(cx, name)
            return g ? { spid: g.getAttribute('id') ?? '', idx: Number(g.getAttribute('idx') ?? 0) } : null
          }
          const st = glue('stCxn')
          const en = glue('endCxn')
          if (st || en) env.glue.push({ el, st, en })
        }
      }
      out.push(el)
    }
  }
  return out
}

function readGroup(g: Element, env: ReadEnv, fromMaster: boolean): SlideElement | null {
  const geo = xfrmOf(kid(g, 'grpSpPr'))
  if (!geo) return null
  const kidsEls = readTree(g, env, fromMaster)
  const chOffX = px(geo.chOff?.getAttribute('x'))
  const chOffY = px(geo.chOff?.getAttribute('y'))
  const chW = px(geo.chExt?.getAttribute('cx')) || geo.w
  const chH = px(geo.chExt?.getAttribute('cy')) || geo.h
  const sx = chW ? geo.w / chW : 1
  const sy = chH ? geo.h / chH : 1
  const map = (e: SlideElement): SlideElement => ({ ...e, x: (e.x - chOffX) * sx, y: (e.y - chOffY) * sy, w: e.w * sx, h: e.h * sy }) as SlideElement
  const nv = path(g, 'nvGrpSpPr', 'cNvPr')
  return { id: uid(), type: 'group', name: nv?.getAttribute('name') || 'Group', x: geo.x, y: geo.y, w: geo.w, h: geo.h, rot: geo.rot, children: kidsEls.map(map) }
}

function readBackground(parts: (Part | null)[], ctx: Ctx): Fill | null {
  for (const part of parts) {
    if (!part) continue
    const bg = part.doc.getElementsByTagNameNS('*', 'bg')[0]
    if (!bg) continue
    const bgPr = kid(bg, 'bgPr')
    if (bgPr) {
      const f = fillOf(bgPr, ctx, part)
      if (f) return f
    }
    const ref = kid(bg, 'bgRef')
    if (ref) {
      const col = colorOf(ref, ctx)
      if (col) return { type: 'solid', color: col.color }
    }
  }
  return null
}

const TRANSITION_NAMES: Record<string, TransitionName> = {
  fade: 'fade', push: 'push', wipe: 'wipe', split: 'split', pull: 'reveal', cover: 'cover', cut: 'cut', zoom: 'zoom', dissolve: 'dissolve', circle: 'shape', diamond: 'shape', plus: 'shape', blinds: 'blinds', checker: 'checker', randomBar: 'randomBars', strips: 'strips', wedge: 'wedge', wheel: 'clock', newsflash: 'newsflash', flash: 'flash', vortex: 'vortex', flip: 'flip', gallery: 'gallery', cube: 'cube', prism: 'cube', curtains: 'curtains', fallOver: 'fallOver', morph: 'morph',
}

function readTransition(sld: Element): Transition | null {
  let tr = kid(sld, 'transition')
  if (!tr) {
    const alt = kids(sld, 'AlternateContent')[0]
    tr = path(alt, 'Choice', 'transition') ?? path(alt, 'Fallback', 'transition')
  }
  if (!tr) return null
  const effect = Array.from(tr.children).find((c) => c.localName !== 'sndAc' && c.localName !== 'extLst')
  const name = effect ? (effect.localName === 'prstTrans' ? (TRANSITION_NAMES[effect.getAttribute('prst') ?? ''] ?? 'fade') : (TRANSITION_NAMES[effect.localName] ?? 'fade')) : 'none'
  const dir = effect?.getAttribute('dir')
  const dirOpt = { l: 'fromRight', r: 'fromLeft', u: 'fromBottom', d: 'fromTop' }[dir ?? ''] as string | undefined
  let option: string | undefined
  if (name === 'push' || name === 'wipe' || name === 'cover' || name === 'reveal' || name === 'uncover') option = dirOpt
  if (name === 'strips') option = dir === 'ld' || dir === 'lu' ? 'leftDown' : 'rightDown'
  if (name === 'split') option = `${effect?.getAttribute('orient') === 'horz' ? 'horizontal' : 'vertical'}${dir === 'in' ? 'In' : 'Out'}`
  if (name === 'shape') option = effect?.localName === 'diamond' ? 'diamond' : effect?.localName === 'plus' ? 'plus' : 'circle'
  if (name === 'zoom') option = dir === 'out' ? 'out' : 'in'
  if (name === 'fade' && effect?.getAttribute('thruBlk') === '1') option = 'black'
  if (name === 'randomBars' || name === 'blinds') option = dir === 'horz' ? 'horizontal' : 'vertical'
  const durAttr = tr.getAttribute('p14:dur') ?? tr.getAttribute('dur')
  const spd = tr.getAttribute('spd')
  const duration = durAttr ? Number(durAttr) / 1000 : spd === 'fast' ? 0.5 : spd === 'med' ? 0.75 : 1
  const advTm = tr.getAttribute('advTm')
  // Sounds made here carry their name; other sounds play as the closest built-in one (a chime).
  const snd = path(kid(tr, 'sndAc'), 'stSnd', 'snd')
  const sndName = (snd?.getAttribute('name') ?? '').replace(/\.wav$/i, '').toLowerCase()
  const sound = snd ? (TRANSITION_SOUNDS.find((x) => x.id === sndName || x.label.toLowerCase() === sndName)?.id ?? 'chime') : undefined
  return { name, option, duration, advanceOnClick: tr.getAttribute('advClick') !== '0', advanceAfter: advTm ? Number(advTm) / 1000 : null, ...(sound ? { sound } : {}) }
}

async function loadMedia(zip: JSZipType): Promise<Map<string, string>> {
  const media = new Map<string, string>()
  const types: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' }
  await Promise.all(
    Object.keys(zip.files)
      .filter((p) => p.startsWith('ppt/media/'))
      .map(async (p) => {
        const ext = p.split('.').pop()!.toLowerCase()
        const mime = types[ext]
        if (!mime) return
        media.set(p, `data:${mime};base64,${await zip.file(p)!.async('base64')}`)
      }),
  )
  return media
}

async function naturalSize(src: string): Promise<[number, number]> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve([img.naturalWidth || 1, img.naturalHeight || 1])
    img.onerror = () => resolve([1, 1])
    img.src = src
  })
}

async function fillNaturalSizes(els: SlideElement[]) {
  for (const e of els) {
    if (e.type === 'image' && !e.natW) {
      const [w, h] = await naturalSize(e.src)
      e.natW = w
      e.natH = h
    }
    if (e.type === 'group') await fillNaturalSizes(e.children)
  }
}

function readScheme(theme: Part | null): { scheme: Scheme; fonts: { major: string; minor: string } } {
  const scheme: Scheme = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' }
  const fonts = { major: 'Calibri Light', minor: 'Calibri' }
  if (!theme) return { scheme, fonts }
  const clr = theme.doc.getElementsByTagNameNS('*', 'clrScheme')[0]
  for (const c of Array.from(clr?.children ?? [])) {
    const v = kid(c, 'srgbClr')?.getAttribute('val') ?? kid(c, 'sysClr')?.getAttribute('lastClr')
    if (v) scheme[c.localName] = v
  }
  const major = theme.doc.getElementsByTagNameNS('*', 'majorFont')[0]
  const minor = theme.doc.getElementsByTagNameNS('*', 'minorFont')[0]
  fonts.major = kid(major, 'latin')?.getAttribute('typeface') || fonts.major
  fonts.minor = kid(minor, 'latin')?.getAttribute('typeface') || fonts.minor
  return { scheme, fonts }
}

function readClrMap(master: Part | null): Record<string, string> {
  const map: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }
  const el = master?.doc.getElementsByTagNameNS('*', 'clrMap')[0]
  if (el) for (const a of Array.from(el.attributes)) map[a.name] = a.value
  return map
}

async function readNotes(zip: JSZipType, slide: Part): Promise<string> {
  const target = relOfType(slide, '/notesSlide')
  if (!target) return ''
  const notes = await loadPart(zip, target)
  if (!notes) return ''
  for (const sp of Array.from(notes.doc.getElementsByTagNameNS('*', 'sp'))) {
    const ph = phOf(sp)
    if (ph?.type === 'body') return kids(kid(sp, 'txBody'), 'p').map((p) => Array.from(p.getElementsByTagNameNS('*', 't')).map((t) => t.textContent).join('')).join('\n').trim()
  }
  return ''
}

const MEDIA_MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' }

export async function importPptx(file: File): Promise<{ pres: Presentation; title: string }> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const baseTitle = file.name.replace(/\.(pptx|ppsx|potx|pptm|ppsm|potm)$/i, '')

  // Our own files: restore the stored model if the slides are untouched.
  const embedded = zip.file(KONTOR_PART)
  if (embedded) {
    try {
      const data = JSON.parse(await embedded.async('string')) as { hash: string; pres: Presentation; title?: string }
      const xml = await Promise.all(data.pres.slides.map((_, i) => zip.file(`ppt/slides/slide${i + 1}.xml`)?.async('string') ?? Promise.resolve('')))
      if (hashString(xml.join('')) === data.hash) {
        // Pictures and media are stored once as package parts and referenced from the model.
        const refs = new Set<string>()
        mapStrings(data.pres, (s) => (s.startsWith(MEDIA_REF) && refs.add(s.slice(MEDIA_REF.length)), s))
        const urls = new Map<string, string>()
        for (const path of refs) {
          const f = zip.file(path)
          if (!f) continue
          const ext = path.split('.').pop()!.toLowerCase()
          urls.set(path, `data:${MEDIA_MIME[ext] ?? 'application/octet-stream'};base64,${await f.async('base64')}`)
        }
        const pres = mapStrings(data.pres, (s) => (s.startsWith(MEDIA_REF) ? (urls.get(s.slice(MEDIA_REF.length)) ?? '') : s))
        return { pres, title: baseTitle }
      }
    } catch {
      // Fall through to the regular reader.
    }
  }

  const presPart = await loadPart(zip, 'ppt/presentation.xml')
  if (!presPart) throw new Error(t('This file is not a valid .pptx presentation.'))
  const sz = presPart.doc.getElementsByTagNameNS('*', 'sldSz')[0]
  const w = Math.round(px(sz?.getAttribute('cx')) || 1280)
  const h = Math.round(px(sz?.getAttribute('cy')) || 720)
  const pres = createPresentation('kontor', 0, { w, h, name: w === 1280 && h === 720 ? '16:9' : w === 960 && h === 720 ? '4:3' : 'custom' })
  pres.slides = []
  const media = await loadMedia(zip)
  const masterCache = new Map<string, Part | null>()
  const tableStyleNames = new Map<string, string>()
  const chartXml = new Map<string, string>()
  await Promise.all(
    Object.keys(zip.files)
      .filter((p) => /^ppt\/charts\/chart\d+\.xml$/.test(p))
      .map(async (p) => chartXml.set(p, await zip.file(p)!.async('string'))),
  )
  const tsPart = zip.file('ppt/tableStyles.xml')
  if (tsPart) {
    const doc = new DOMParser().parseFromString(await tsPart.async('string'), 'application/xml')
    for (const st of Array.from(doc.getElementsByTagNameNS('*', 'tblStyle'))) tableStyleNames.set(st.getAttribute('styleId') ?? '', st.getAttribute('styleName') ?? '')
  }
  const ids = kids(kid(presPart.doc.documentElement, 'sldIdLst'), 'sldId').map((s) => attrR(s, 'id') ?? '')

  for (const rid of ids) {
    const target = presPart.rels.get(rid)?.target
    if (!target) continue
    const part = await loadPart(zip, target)
    if (!part) continue
    const layoutPath = relOfType(part, '/slideLayout')
    const layout = layoutPath ? await loadPart(zip, layoutPath) : null
    const masterPath = layout ? relOfType(layout, '/slideMaster') : null
    if (masterPath && !masterCache.has(masterPath)) masterCache.set(masterPath, await loadPart(zip, masterPath))
    const master = masterPath ? (masterCache.get(masterPath) ?? null) : null
    const themePath = master ? relOfType(master, '/theme') : null
    const theme = themePath ? await loadPart(zip, themePath) : null
    const { scheme, fonts } = readScheme(theme)
    pres.fonts = fonts
    const ctx: Ctx = { zip, scheme, clrMap: readClrMap(master), media }
    const layoutType = layout?.doc.documentElement.getAttribute('type') ?? 'obj'
    const env: ReadEnv = { ctx, part, layout, master, layoutType, fonts, hf: pres.headerFooter, tableStyleNames, chartXml, spids: new Map(), glue: [] }

    const elements: SlideElement[] = []
    const sld = part.doc.documentElement
    const showMaster = sld.getAttribute('showMasterSp') !== '0'
    if (showMaster && master && layout?.doc.documentElement.getAttribute('showMasterSp') !== '0') {
      const tree = master.doc.getElementsByTagNameNS('*', 'spTree')[0]
      if (tree) elements.push(...readTree(tree, { ...env, part: master }, true))
    }
    if (showMaster && layout) {
      const tree = layout.doc.getElementsByTagNameNS('*', 'spTree')[0]
      if (tree) elements.push(...readTree(tree, { ...env, part: layout }, true))
    }
    const tree = part.doc.getElementsByTagNameNS('*', 'spTree')[0]
    if (tree) elements.push(...readTree(tree, env))
    // Glue only to shapes whose connection sites are the four sides (rectangle-like sites).
    const SITE_OF_IDX = [0, 3, 2, 1]
    for (const g of env.glue) {
      const at = (x: { spid: string; idx: number } | null) => (x && env.spids.get(x.spid) ? { id: env.spids.get(x.spid)!, site: SITE_OF_IDX[x.idx] ?? 0 } : null)
      const conn = { start: at(g.st), end: at(g.en) }
      if ((conn.start && !elements.some((e) => e.id === conn.start!.id)) || (conn.end && !elements.some((e) => e.id === conn.end!.id))) continue
      if (conn.start || conn.end) g.el.conn = conn
    }
    await fillNaturalSizes(elements)

    const bg = readBackground([part, layout, master], ctx)
    const slide: Slide = {
      id: uid('s'),
      layout: LAYOUT_MAP[layoutType] ?? 'blank',
      elements,
      background: bg ?? { type: 'solid', color: '#FFFFFF' },
      hideBackgroundGraphics: true,
      notes: await readNotes(zip, part),
      hidden: sld.getAttribute('show') === '0' || undefined,
      transition: readTransition(sld),
      animations: readTiming(sld, env.spids, { w, h }),
    }
    pres.slides.push(slide)
  }
  if (!pres.slides.length) throw new Error(t('The presentation does not contain any slides.'))
  const core = zip.file('docProps/core.xml')
  if (core) {
    const doc = new DOMParser().parseFromString(await core.async('string'), 'application/xml')
    const creator = doc.getElementsByTagNameNS('*', 'creator')[0]?.textContent
    if (creator) pres.author = creator
  }
  // The proofing language: the first language tag found on the slides' text.
  const first = zip.file('ppt/slides/slide1.xml')
  const lang = first ? /<a:rPr[^>]*\blang="([A-Za-z-]+)"/.exec(await first.async('string'))?.[1] : undefined
  if (lang) pres.lang = lang
  return { pres, title: baseTitle }
}

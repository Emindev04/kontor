// DrawingML (OOXML) generation from the presentation model.
import type { Effects, Fill, Inline, Line, Mark, Para, ShapeElement, TextBody } from '../model/types'
import { resolveColor, type ThemeColors } from '../model/color'
import { effectiveBullet, NUMBER_SCHEMES, paraMetrics, type TextCtx } from '../model/richtext'

export const EMU_PER_PX = 9525
export const EMU_PER_PT = 12700

export const emu = (px: number) => Math.round(px * EMU_PER_PX)

export function escXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

const hex = (c: string) => c.replace('#', '').toUpperCase().slice(0, 6)

export function colorXml(ref: string, colors: ThemeColors, alpha?: number) {
  const value = hex(resolveColor(ref, colors))
  const a = alpha !== undefined && alpha < 1 ? `<a:alpha val="${Math.round(Math.max(0, alpha) * 100000)}"/>` : ''
  return `<a:srgbClr val="${value}">${a}</a:srgbClr>`
}

export function fillXml(fill: Fill, colors: ThemeColors) {
  switch (fill.type) {
    case 'none':
      return '<a:noFill/>'
    case 'solid':
      return `<a:solidFill>${colorXml(fill.color, colors, fill.alpha)}</a:solidFill>`
    case 'gradient': {
      const stops = fill.stops.map((s) => `<a:gs pos="${Math.round(s.pos * 100000)}">${colorXml(s.color, colors, s.alpha)}</a:gs>`).join('')
      const shade = fill.kind === 'radial' ? '<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>' : `<a:lin ang="${Math.round((((fill.angle % 360) + 360) % 360) * 60000)}" scaled="0"/>`
      return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst>${shade}</a:gradFill>`
    }
    case 'picture':
      // Picture fills of shapes need their own media part; fall back to a neutral fill.
      return `<a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill>`
    case 'pattern':
      return `<a:pattFill prst="${fill.preset}"><a:fgClr>${colorXml(fill.fg, colors)}</a:fgClr><a:bgClr>${colorXml(fill.bg, colors)}</a:bgClr></a:pattFill>`
  }
}

export function lineXml(line: Line, colors: ThemeColors, round = false) {
  if (!line) return '<a:ln><a:noFill/></a:ln>'
  const head = line.head && line.head !== 'none' ? `<a:headEnd type="${line.head}" w="med" len="med"/>` : ''
  const tail = line.tail && line.tail !== 'none' ? `<a:tailEnd type="${line.tail}" w="med" len="med"/>` : ''
  const cmpd = line.compound && line.compound !== 'sng' ? ` cmpd="${line.compound}"` : ''
  return `<a:ln w="${Math.round(line.width * EMU_PER_PT)}"${round ? ' cap="rnd"' : ''}${cmpd}><a:solidFill>${colorXml(line.color, colors, line.alpha)}</a:solidFill><a:prstDash val="${line.dash}"/><a:round/>${head}${tail}</a:ln>`
}

export function effectsXml(fx: Effects | undefined, colors: ThemeColors) {
  if (!fx) return ''
  let out = ''
  if (fx.glow) out += `<a:glow rad="${Math.round(fx.glow.size * EMU_PER_PT)}">${colorXml(fx.glow.color, colors, fx.glow.alpha)}</a:glow>`
  const ins = fx.innerShadow
  if (ins) out += `<a:innerShdw blurRad="${Math.round(ins.blur * EMU_PER_PT)}" dist="${Math.round(ins.dist * EMU_PER_PT)}" dir="${Math.round(ins.angle * 60000)}">${colorXml(ins.color, colors, ins.alpha)}</a:innerShdw>`
  if (fx.shadow)
    out += `<a:outerShdw blurRad="${Math.round(fx.shadow.blur * EMU_PER_PT)}" dist="${Math.round(fx.shadow.dist * EMU_PER_PT)}" dir="${Math.round(fx.shadow.angle * 60000)}" algn="ctr" rotWithShape="0">${colorXml(fx.shadow.color, colors, fx.shadow.alpha)}</a:outerShdw>`
  if (fx.reflection) out += '<a:reflection blurRad="6350" stA="50000" endA="300" endPos="55000" dist="0" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>'
  if (fx.softEdge) out += `<a:softEdge rad="${Math.round(fx.softEdge * EMU_PER_PT)}"/>`
  return (out ? `<a:effectLst>${out}</a:effectLst>` : '') + threeDXml(fx)
}

/** 3-D rotation (scene3d) and bevel (sp3d), written after the effect list. */
export function threeDXml(fx: Effects | undefined) {
  if (!fx?.bevel && !fx?.rot3d) return ''
  const r = fx.rot3d
  const deg = (v: number) => Math.round((((v % 360) + 360) % 360) * 60000)
  const camera = r ? `<a:camera prst="${r.perspective ? 'perspectiveFront' : 'orthographicFront'}"><a:rot lat="${deg(r.x)}" lon="${deg(r.y)}" rev="0"/></a:camera>` : '<a:camera prst="orthographicFront"/>'
  const scene = `<a:scene3d>${camera}<a:lightRig rig="threePt" dir="t"/></a:scene3d>`
  const sp3d = fx.bevel ? `<a:sp3d><a:bevelT w="76200" h="76200" prst="${escXml(fx.bevel)}"/></a:sp3d>` : ''
  return scene + sp3d
}

export function xfrmXml(el: { x: number; y: number; w: number; h: number; rot: number; flipH?: boolean; flipV?: boolean }) {
  const rot = el.rot ? ` rot="${Math.round(el.rot * 60000)}"` : ''
  return `<a:xfrm${rot}${el.flipH ? ' flipH="1"' : ''}${el.flipV ? ' flipV="1"' : ''}><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${Math.max(0, emu(el.w))}" cy="${Math.max(0, emu(el.h))}"/></a:xfrm>`
}

export function geomXml(prst: string, adj?: number[]) {
  const gd = (adj ?? []).map((v, i) => `<a:gd name="${adj!.length === 1 ? 'adj' : `adj${i + 1}`}" fmla="val ${Math.round(v)}"/>`).join('')
  return `<a:prstGeom prst="${prst}"><a:avLst>${gd}</a:avLst></a:prstGeom>`
}

export function custGeomXml(points: [number, number][], w: number, h: number) {
  const pw = Math.max(1, emu(w))
  const ph = Math.max(1, emu(h))
  const path = points.map(([x, y], i) => `<a:${i ? 'lnTo' : 'moveTo'}><a:pt x="${emu(x)}" y="${emu(y)}"/></a:${i ? 'lnTo' : 'moveTo'}>`).join('')
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${pw}" h="${ph}">${path}</a:path></a:pathLst></a:custGeom>`
}

// ---------- Text ----------

export type TextExportCtx = TextCtx & {
  /** Theme font names; runs using them are written as theme references. */
  majorFont: string
  minorFont: string
  defaultFont: 'major' | 'minor'
  /** Adds a hyperlink relationship and returns its id. */
  linkRel: (href: string) => string
  /** Proofing language written on every run. */
  lang?: string
  /** Text Effects > Reflection on the whole text body. */
  reflection?: boolean
}

function runProps(marks: Mark[] | undefined, ctx: TextExportCtx, size: number, tag: 'a:rPr' | 'a:endParaRPr' = 'a:rPr') {
  const has = (t: Mark['type']) => marks?.some((m) => m.type === t)
  const ts = (marks?.find((m) => m.type === 'textStyle') as Extract<Mark, { type: 'textStyle' }> | undefined)?.attrs ?? {}
  const hl = marks?.find((m) => m.type === 'highlight') as Extract<Mark, { type: 'highlight' }> | undefined
  const link = marks?.find((m) => m.type === 'link') as Extract<Mark, { type: 'link' }> | undefined
  const sz = Math.round((ts.fontSize ?? size) * 100)
  let attrs = ` lang="${escXml(ctx.lang || 'en-US')}" sz="${sz}"`
  if (has('bold') || (ctx.bold && !has('bold'))) attrs += ' b="1"'
  if (has('italic')) attrs += ' i="1"'
  if (ts.uStyle && ts.uStyle !== 'none') attrs += ` u="${escXml(ts.uStyle)}"`
  else if (has('underline')) attrs += ' u="sng"'
  if (ts.strike2) attrs += ' strike="dblStrike"'
  else if (has('strike')) attrs += ' strike="sngStrike"'
  if (ts.baseline) attrs += ` baseline="${Math.round(ts.baseline * 1000)}"`
  else if (has('superscript')) attrs += ' baseline="30000"'
  else if (has('subscript')) attrs += ' baseline="-25000"'
  if (ts.equalize) attrs += ' normalizeH="1"'
  if (ts.letterSpacing) attrs += ` spc="${Math.round(ts.letterSpacing * 100)}"`
  const caps = ts.caps ?? (ctx.caps ? 'all' : null)
  if (caps) attrs += ` cap="${caps}"`
  attrs += ' dirty="0"'
  let inner = ''
  inner += `<a:solidFill>${colorXml(ts.color ?? ctx.color, ctx.colors)}</a:solidFill>`
  const glow = ts.glow ? `<a:glow rad="${Math.round((ts.glowSize ?? 5) * 12700)}">${colorXml(ts.glow, ctx.colors, 0.6)}</a:glow>` : ''
  const shadow = ts.shadow ? `<a:outerShdw blurRad="38100" dist="38100" dir="2700000" algn="tl"><a:srgbClr val="000000"><a:alpha val="43137"/></a:srgbClr></a:outerShdw>` : ''
  const reflection = ctx.reflection ? '<a:reflection blurRad="6350" stA="55000" endA="300" endPos="45500" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>' : ''
  if (glow || shadow || reflection) inner += `<a:effectLst>${glow}${shadow}${reflection}</a:effectLst>`
  if (hl?.attrs.color) inner += `<a:highlight>${colorXml(hl.attrs.color, ctx.colors)}</a:highlight>`
  if (ts.uColor) inner += `<a:uFill><a:solidFill>${colorXml(ts.uColor, ctx.colors)}</a:solidFill></a:uFill>`
  const font = ts.fontFamily
  const face = !font ? (ctx.defaultFont === 'major' ? '+mj' : '+mn') : font === ctx.majorFont ? '+mj' : font === ctx.minorFont ? '+mn' : null
  if (face) inner += `<a:latin typeface="${face}-lt"/><a:ea typeface="${face}-ea"/><a:cs typeface="${face}-cs"/>`
  else inner += `<a:latin typeface="${escXml(font!)}"/><a:ea typeface="${escXml(font!)}"/><a:cs typeface="${escXml(font!)}"/>`
  if (link?.attrs.href && tag === 'a:rPr') inner += `<a:hlinkClick r:id="${ctx.linkRel(link.attrs.href)}"/>`
  return `<${tag}${attrs}>${inner}</${tag}>`
}

function inlineXml(n: Inline, ctx: TextExportCtx, size: number) {
  if (n.type === 'text') return `<a:r>${runProps(n.marks, ctx, size)}<a:t>${escXml(n.text)}</a:t></a:r>`
  if (n.type === 'hardBreak') return `<a:br>${runProps(n.marks, ctx, size)}</a:br>`
  const id = n.attrs.kind === 'slidenum' ? '{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}' : '{F8166F1F-CE9B-4651-A6AA-CD717754106B}'
  const type = n.attrs.kind === 'slidenum' ? 'slidenum' : 'datetime1'
  const text = n.attrs.kind === 'slidenum' ? String(ctx.slideNumber) : ctx.dateText
  return `<a:fld id="${id}" type="${type}">${runProps(n.marks, ctx, size)}<a:t>${escXml(text)}</a:t></a:fld>`
}

function bulletXml(marker: string | null, attrs?: Para['attrs'], colors?: ThemeColors) {
  if (!marker) return '<a:buNone/>'
  const clr = attrs?.bulletColor && colors ? `<a:buClr>${colorXml(attrs.bulletColor, colors)}</a:buClr>` : ''
  const sz = attrs?.bulletSize ? `<a:buSzPct val="${Math.round(attrs.bulletSize * 1000)}"/>` : ''
  if (marker.startsWith('num:')) {
    const scheme = NUMBER_SCHEMES.find((s) => s.id === marker.slice(4))?.id ?? 'arabicPeriod'
    const start = attrs?.startAt && attrs.startAt > 1 ? ` startAt="${Math.round(attrs.startAt)}"` : ''
    return `${clr}${sz}<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${scheme}"${start}/>`
  }
  if (clr || sz) return `${clr}${sz}<a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:buChar char="${escXml(marker)}"/>`
  return `<a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:buChar char="${escXml(marker)}"/>`
}

export function paragraphXml(p: Para, ctx: TextExportCtx, marker: string | null) {
  const m = paraMetrics(p.attrs, ctx, !!marker)
  const algn = { left: 'l', center: 'ctr', right: 'r', justify: 'just', distributed: 'dist' }[m.align]
  const lvl = m.level ? ` lvl="${m.level}"` : ''
  const ppr =
    `<a:pPr marL="${emu(m.marL)}" indent="${emu(m.indent)}"${lvl} algn="${algn}">` +
    (m.lineExact ? `<a:lnSpc><a:spcPts val="${Math.round(m.lineExact * 100)}"/></a:lnSpc>` : `<a:lnSpc><a:spcPct val="${Math.round((m.lineHeight / 1.2) * 100000)}"/></a:lnSpc>`) +
    `<a:spcBef><a:spcPts val="${Math.round(m.spaceBefore * 100)}"/></a:spcBef>` +
    `<a:spcAft><a:spcPts val="${Math.round(m.spaceAfter * 100)}"/></a:spcAft>` +
    bulletXml(marker, p.attrs, ctx.colors) +
    '</a:pPr>'
  const runs = (p.content ?? []).map((n) => inlineXml(n, ctx, m.size)).join('')
  const lastMarks = p.content?.length ? p.content[p.content.length - 1].marks : undefined
  return `<a:p>${ppr}${runs}${runProps(lastMarks, ctx, m.size, 'a:endParaRPr')}</a:p>`
}

export function txBodyXml(text: TextBody, ctx: TextExportCtx) {
  const [l, t, r, b] = text.inset
  const anchor = { top: 't', middle: 'ctr', bottom: 'b' }[text.anchor]
  const vert = text.vert && text.vert !== 'horz' ? ` vert="${text.vert === 'stacked' ? 'wordArtVert' : text.vert}"` : ''
  const cols = text.columns && text.columns > 1 ? ` numCol="${text.columns}" spcCol="${emu(text.colSpacing ?? 24)}"` : ''
  const fit = text.autofit === 'shrink' ? `<a:normAutofit${text.fontScale && text.fontScale < 1 ? ` fontScale="${Math.round(text.fontScale * 100000)}"` : ''}${text.lnSpcReduction ? ` lnSpcReduction="${Math.round(text.lnSpcReduction * 100000)}"` : ''}/>` : text.autofit === 'resize' ? '<a:spAutoFit/>' : '<a:noAutofit/>'
  const warp = text.warp ? `<a:prstTxWarp prst="${escXml(text.warp)}"><a:avLst/></a:prstTxWarp>` : ''
  const body = `<a:bodyPr wrap="${text.wrap ? 'square' : 'none'}" lIns="${emu(l)}" tIns="${emu(t)}" rIns="${emu(r)}" bIns="${emu(b)}" anchor="${anchor}" rtlCol="0"${vert}${cols}>${warp}${fit}</a:bodyPr>`
  const pctx = text.textReflection ? { ...ctx, reflection: true } : ctx
  const paras = text.doc.content.map((p) => paragraphXml(p, pctx, effectiveBullet(p.attrs, pctx))).join('')
  return `<p:txBody>${body}<a:lstStyle/>${paras || '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'}</p:txBody>`
}

export function spPrXml(el: ShapeElement, colors: ThemeColors) {
  return `<p:spPr>${xfrmXml(el)}${geomXml(el.prst, el.adj)}${fillXml(el.fill, colors)}${lineXml(el.line, colors)}${effectsXml(el.effects, colors)}</p:spPr>`
}

// ---------- Tables ----------

function cellLineXml(tag: string, line: Line, colors: ThemeColors) {
  if (!line) return `<a:${tag} w="12700"><a:noFill/></a:${tag}>`
  return `<a:${tag} w="${Math.round(line.width * EMU_PER_PT)}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill>${colorXml(line.color, colors, line.alpha)}</a:solidFill><a:prstDash val="${line.dash}"/><a:round/></a:${tag}>`
}

export type TableCellXmlInput = {
  doc: TextBody['doc']
  ctx: TextExportCtx
  fill: Fill
  borders: Record<'t' | 'r' | 'b' | 'l', Line>
  rowSpan?: number
  colSpan?: number
  hMerge?: boolean
  vMerge?: boolean
  anchor?: 'top' | 'middle' | 'bottom'
  margins?: [number, number, number, number]
  vert?: 'horz' | 'vert' | 'vert270'
}

export function tableCellXml(c: TableCellXmlInput, colors: ThemeColors) {
  const attrs = `${c.colSpan && c.colSpan > 1 ? ` gridSpan="${c.colSpan}"` : ''}${c.rowSpan && c.rowSpan > 1 ? ` rowSpan="${c.rowSpan}"` : ''}${c.hMerge ? ' hMerge="1"' : ''}${c.vMerge ? ' vMerge="1"' : ''}`
  const paras = c.doc.content.map((p) => paragraphXml(p, c.ctx, effectiveBullet(p.attrs, c.ctx))).join('') || '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'
  const [l, t, r, b] = c.margins ?? [9.6, 4.8, 9.6, 4.8]
  const anchor = c.anchor === 'middle' ? ' anchor="ctr"' : c.anchor === 'bottom' ? ' anchor="b"' : ''
  const vert = c.vert && c.vert !== 'horz' ? ` vert="${c.vert}"` : ''
  const tcPr =
    `<a:tcPr marL="${emu(l)}" marR="${emu(r)}" marT="${emu(t)}" marB="${emu(b)}"${anchor}${vert}>` +
    cellLineXml('lnL', c.borders.l, colors) +
    cellLineXml('lnR', c.borders.r, colors) +
    cellLineXml('lnT', c.borders.t, colors) +
    cellLineXml('lnB', c.borders.b, colors) +
    (c.fill.type === 'none' ? '<a:noFill/>' : fillXml(c.fill, colors)) +
    '</a:tcPr>'
  return `<a:tc${attrs}><a:txBody><a:bodyPr/><a:lstStyle/>${paras}</a:txBody>${tcPr}</a:tc>`
}

export function graphicFrameXml(id: number, name: string, el: { x: number; y: number; w: number; h: number }, graphicData: string, descr?: string) {
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${escXml(name)}"${descr ? ` descr="${escXml(descr)}"` : ''}/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${emu(el.x)}" y="${emu(el.y)}"/><a:ext cx="${emu(el.w)}" cy="${emu(el.h)}"/></p:xfrm>` +
    `<a:graphic>${graphicData}</a:graphic></p:graphicFrame>`
  )
}

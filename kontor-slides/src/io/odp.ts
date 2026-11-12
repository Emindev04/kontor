// OpenDocument Presentation (.odp) writer and reader, written for this program (no ODF library).
//
// The writer produces content.xml, styles.xml, meta.xml and the manifest: slides with their
// backgrounds, transitions and notes; shapes (preset geometry as custom-shape paths), text boxes and
// placeholders with paragraph and character formatting and lists; pictures, groups, ink, tables and
// video/audio. Charts, diagrams and zooms are written as pictures when a rasterizer is available.
// Like the .pptx writer it also stores the Kontor model, so files saved here reopen exactly as long
// as their slides were not changed elsewhere.
//
// The reader understands the common parts of files from other programs: page size, master page
// objects, frames (text boxes, placeholders, pictures, tables, media), custom shapes, rectangles,
// ellipses, lines, polygons, paths, connectors and groups, styles with inheritance, gradients,
// bitmaps, text formatting, lists, notes, hidden slides and transitions.
import type JSZipType from 'jszip'
import type { ArrowHead, ColorRef, Dash, Fill, GroupElement, ImageElement, InkElement, Inline, LayoutId, Line, Mark, MediaElement, Para, ParaAttrs, PlaceholderStyle, Presentation, ShapeElement, Slide, SlideElement, TableCell, TableElement, TextAlign, Transition, TransitionName } from '../model/types'
import { resolveColor, type ThemeColors } from '../model/color'
import { createPresentation, DEFAULT_INSET, uid } from '../model/factory'
import { geometry, LINE_SHAPES } from '../model/shapes'
import { normHandles, outlinePath, pathToOutline, scaleOutline } from '../model/outline'
import { center, lineEnds, rotate } from '../model/geometry'
import { computeMarkers, effectiveBullet, paraMetrics, NUMBER_SCHEMES } from '../model/richtext'
import { cellLook } from '../model/table'
import { isTitleStyle, STYLE_DEFS } from '../model/layouts'
import { makeRenderCtx, slideBackground, styleKey, textCtxFor, type RenderCtx } from '../render/context'
import { hashString, KONTOR_PART, MEDIA_REF, mapStrings } from './package'
import { effectiveEffects } from '../model/effectSchemes'
import { t } from '../i18n'

export const ODP_MIME = 'application/vnd.oasis.opendocument.presentation'

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  dc: 'http://purl.org/dc/elements/1.1/',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  smil: 'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0',
  anim: 'urn:oasis:names:tc:opendocument:xmlns:animation:1.0',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
}
const PREFIX_OF = new Map(Object.entries(NS).map(([k, v]) => [v, k]))
const XMLNS = Object.entries(NS)
  .filter(([k]) => k !== 'manifest')
  .map(([k, v]) => `xmlns:${k}="${v}"`)
  .join(' ')
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cm = (px: number) => `${(Math.round((px / 96) * 2.54 * 1000) / 1000).toString()}cm`
const ptLen = (pt: number) => `${(Math.round(pt * 100) / 100).toString()}pt`
const pct = (v: number) => `${Math.round(v * 100)}%`

// ---------- Transitions ----------

/** Our transitions as SMIL type / subtype (the names ODF uses). */
const SMIL: Partial<Record<TransitionName, [string, string]>> = {
  fade: ['fade', 'crossfade'],
  push: ['pushWipe', 'fromLeft'],
  wipe: ['barWipe', 'leftToRight'],
  split: ['barnDoorWipe', 'vertical'],
  reveal: ['slideWipe', 'fromRight'],
  uncover: ['slideWipe', 'fromRight'],
  cover: ['slideWipe', 'fromLeft'],
  dissolve: ['dissolve', 'defaultSubtype'],
  circle: ['ellipseWipe', 'circle'],
  shape: ['ellipseWipe', 'circle'],
  blinds: ['blindsWipe', 'vertical'],
  checker: ['checkerBoardWipe', 'across'],
  randomBars: ['randomBarWipe', 'vertical'],
  clock: ['clockWipe', 'clockwiseTwelve'],
  wedge: ['fanWipe', 'centerTop'],
  strips: ['waterfallWipe', 'horizontalLeft'],
  zoom: ['irisWipe', 'rectangle'],
  newsflash: ['zoom', 'rotateIn'],
}
const SMIL_BACK: Record<string, TransitionName> = { fade: 'fade', pushWipe: 'push', barWipe: 'wipe', barnDoorWipe: 'split', slideWipe: 'cover', dissolve: 'dissolve', ellipseWipe: 'circle', blindsWipe: 'blinds', checkerBoardWipe: 'checker', randomBarWipe: 'randomBars', clockWipe: 'clock', fanWipe: 'wedge', waterfallWipe: 'strips', irisWipe: 'zoom', zoom: 'newsflash' }

function isoDuration(seconds: number) {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `PT${String(h).padStart(2, '0')}H${String(m).padStart(2, '0')}M${(Math.round((s % 60) * 1000) / 1000).toString().padStart(2, '0')}S`
}

function parseIsoDuration(v: string | null): number | null {
  const m = v ? /^P(?:\d+D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(v) : null
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

// ---------- Writer ----------

/** Turns an element into a PNG data URL (charts, diagrams and zooms; cropped or adjusted pictures). */
export type Rasterizer = (el: SlideElement, pres: Presentation) => Promise<string | null>
export type OdpOptions = { rasterize?: Rasterizer }

function dataUrlBytes(url: string) {
  const comma = url.indexOf(',')
  const meta = url.slice(5, comma)
  const mime = meta.split(';')[0] || 'application/octet-stream'
  const body = url.slice(comma + 1)
  let bytes: Uint8Array
  if (meta.includes(';base64')) {
    const bin = atob(body)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } else bytes = new TextEncoder().encode(decodeURIComponent(body))
  return { mime, bytes }
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' }

/** Automatic or common styles of one XML part, shared by equal definitions. */
class StyleSet {
  private byKey = new Map<string, string>()
  private counts = new Map<string, number>()
  readonly list: string[] = []
  constructor(private suffix = '') {}
  add(family: string, inner: string, prefix: string, extraAttrs = '') {
    const key = `${family}|${extraAttrs}|${inner}`
    const hit = this.byKey.get(key)
    if (hit) return hit
    const n = (this.counts.get(prefix) ?? 0) + 1
    this.counts.set(prefix, n)
    const name = `${prefix}${n}${this.suffix}`
    this.byKey.set(key, name)
    this.list.push(`<style:style style:name="${name}" style:family="${family}"${extraAttrs}>${inner}</style:style>`)
    return name
  }
  raw(xml: string) {
    this.list.push(xml)
  }
}

class OdpWriter {
  files = new Map<string, string | Uint8Array>()
  manifest: { path: string; type: string }[] = []
  /** Named definitions in styles.xml (gradients, bitmaps, dashes, markers). */
  defs: string[] = []
  private defKeys = new Map<string, string>()
  private media = new Map<string, string>()
  /** Data URLs stored unchanged as a part (used to slim down the embedded model). */
  stored = new Map<string, string>()
  private mediaCount = 0
  constructor(
    readonly pres: Presentation,
    readonly opts: OdpOptions,
  ) {}

  addFile(url: string, original = url, dir = 'Pictures') {
    const hit = this.media.get(url)
    if (hit) return hit
    const { mime, bytes } = dataUrlBytes(url)
    const path = `${dir}/${dir === 'Pictures' ? 'image' : 'media'}${++this.mediaCount}.${EXT[mime] ?? 'bin'}`
    this.files.set(path, bytes)
    this.manifest.push({ path, type: mime })
    this.media.set(url, path)
    if (original === url) this.stored.set(url, path)
    return path
  }

  def(kind: string, key: string, make: (name: string) => string) {
    const k = `${kind}|${key}`
    const hit = this.defKeys.get(k)
    if (hit) return hit
    const name = `${kind}${this.defKeys.size + 1}`
    this.defKeys.set(k, name)
    this.defs.push(make(name))
    return name
  }

  fillAttrs(fill: Fill | null | undefined, colors: ThemeColors): string {
    if (!fill || fill.type === 'none') return ' draw:fill="none"'
    switch (fill.type) {
      case 'solid':
        return ` draw:fill="solid" draw:fill-color="${resolveColor(fill.color, colors)}"${fill.alpha !== undefined && fill.alpha < 1 ? ` draw:opacity="${pct(fill.alpha)}"` : ''}`
      case 'pattern':
        return ` draw:fill="solid" draw:fill-color="${resolveColor(fill.fg, colors)}"`
      case 'gradient': {
        const stops = [...fill.stops].sort((a, b) => a.pos - b.pos)
        const first = resolveColor(stops[0]?.color, colors)
        const last = resolveColor(stops[stops.length - 1]?.color, colors)
        const radial = fill.kind === 'radial'
        // ODF: 0° runs top to bottom, angles count counter-clockwise; radial gradients start at the border.
        const angle = Math.round((((810 - fill.angle) % 360) + 360) % 360) * 10
        const [start, end] = radial ? [last, first] : [first, last]
        const name = this.def('Gradient', `${radial}|${angle}|${start}|${end}`, (n) => `<draw:gradient draw:name="${n}" draw:style="${radial ? 'radial' : 'linear'}" draw:cx="50%" draw:cy="50%" draw:start-color="${start}" draw:end-color="${end}" draw:start-intensity="100%" draw:end-intensity="100%" draw:angle="${angle}" draw:border="0%"/>`)
        return ` draw:fill="gradient" draw:fill-gradient-name="${name}"`
      }
      case 'picture': {
        if (!fill.src.startsWith('data:')) return ' draw:fill="none"'
        const path = this.addFile(fill.src)
        const name = this.def('Bitmap', path, (n) => `<draw:fill-image draw:name="${n}" xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>`)
        return ` draw:fill="bitmap" draw:fill-image-name="${name}" style:repeat="${fill.tile ? 'repeat' : 'stretch'}"${fill.alpha !== undefined && fill.alpha < 1 ? ` draw:opacity="${pct(fill.alpha)}"` : ''}`
      }
    }
  }

  lineAttrs(line: Line | undefined, colors: ThemeColors): string {
    if (!line) return ' draw:stroke="none"'
    let a = ` svg:stroke-color="${resolveColor(line.color, colors)}" svg:stroke-width="${ptLen(line.width)}"`
    if (line.alpha !== undefined && line.alpha < 1) a += ` svg:stroke-opacity="${pct(line.alpha)}"`
    if (line.dash === 'solid') a = ' draw:stroke="solid"' + a
    else {
      const [dots, dotLen, dashes, dashLen, dist] = DASHES[line.dash] ?? DASHES.dash
      const name = this.def('Dash', line.dash, (n) => `<draw:stroke-dash draw:name="${n}" draw:display-name="${line.dash}" draw:style="rect" draw:dots1="${dots}" draw:dots1-length="${dotLen}%"${dashes ? ` draw:dots2="${dashes}" draw:dots2-length="${dashLen}%"` : ''} draw:distance="${dist}%"/>`)
      a = ` draw:stroke="dash" draw:stroke-dash="${name}"` + a
    }
    const marker = (head: ArrowHead | undefined) => {
      if (!head || head === 'none') return null
      const oval = head === 'oval'
      return this.def('Marker', oval ? 'circle' : 'arrow', (n) =>
        oval ? `<draw:marker draw:name="${n}" draw:display-name="Circle" svg:viewBox="0 0 1131 1131" svg:d="M462 1118l-102-29-102-51-93-72-72-93-51-102-29-102-13-105 13-102 29-106 51-102 72-89 93-72 102-50 102-34 106-9 101 9 106 34 98 50 93 72 72 89 51 102 29 106 13 102-13 105-29 102-51 102-72 93-93 72-98 51-106 29-101 13z"/>` : `<draw:marker draw:name="${n}" draw:display-name="Arrow" svg:viewBox="0 0 20 30" svg:d="M10 0l-10 30h20z"/>`,
      )
    }
    const width = cm(Math.max(6, line.width * 4))
    const start = marker(line.head)
    const end = marker(line.tail)
    if (start) a += ` draw:marker-start="${start}" draw:marker-start-width="${width}"`
    if (end) a += ` draw:marker-end="${end}" draw:marker-end-width="${width}"`
    return a
  }
}

/** Dot/dash patterns as [dots, dot length %, dashes, dash length %, distance %] of the line width. */
const DASHES: Record<string, [number, number, number, number, number]> = {
  sysDot: [1, 100, 0, 0, 100],
  sysDash: [1, 300, 0, 0, 100],
  dash: [1, 400, 0, 0, 300],
  dashDot: [1, 400, 1, 100, 300],
  lgDash: [1, 800, 0, 0, 300],
  lgDashDot: [1, 800, 1, 100, 300],
  lgDashDotDot: [1, 800, 2, 100, 300],
}

function dashFromDef(el: Element | undefined): Dash {
  if (!el) return 'dash'
  const d1 = parseFloat(attr(el, 'draw:dots1-length') ?? '100')
  const d2 = attr(el, 'draw:dots2')
  const n2 = Number(d2 ?? 0)
  if (n2 >= 2) return 'lgDashDotDot'
  if (n2 === 1) return d1 >= 600 ? 'lgDashDot' : 'dashDot'
  if (d1 <= 150) return 'sysDot'
  if (d1 <= 350) return 'sysDash'
  if (d1 >= 600) return 'lgDash'
  return 'dash'
}

/** Writes the drawing objects of one page into an XML string, collecting their styles. */
class PageWriter {
  constructor(
    private w: OdpWriter,
    private styles: StyleSet,
    private rc: RenderCtx,
  ) {}

  private get colors() {
    return this.rc.colors
  }

  private frameAttrs(el: { x: number; y: number; w: number; h: number; rot: number }, ox: number, oy: number) {
    const x = el.x + ox
    const y = el.y + oy
    const size = `svg:width="${cm(Math.max(0, el.w))}" svg:height="${cm(Math.max(0, el.h))}"`
    if (!el.rot) return `${size} svg:x="${cm(x)}" svg:y="${cm(y)}"`
    // Rotation turns around the top-left corner; the translation puts that corner in place.
    const c = { x: x + el.w / 2, y: y + el.h / 2 }
    const tl = rotate({ x, y }, c, el.rot)
    const rad = (-el.rot * Math.PI) / 180
    return `${size} draw:transform="rotate (${rad.toFixed(6)}) translate (${cm(tl.x)} ${cm(tl.y)})"`
  }

  private graphicStyle(el: { fill?: Fill; line?: Line; effects?: ShapeElement['effects'] }, text: ShapeElement['text'] | null, extra = '') {
    let g = this.w.fillAttrs(el.fill ?? { type: 'none' }, this.colors) + this.w.lineAttrs(el.line ?? null, this.colors)
    const sh = el.effects?.shadow
    if (sh) {
      const rad = (sh.angle * Math.PI) / 180
      const d = (sh.dist * 96) / 72
      g += ` draw:shadow="visible" draw:shadow-offset-x="${cm(Math.cos(rad) * d)}" draw:shadow-offset-y="${cm(Math.sin(rad) * d)}" draw:shadow-color="${resolveColor(sh.color, this.colors)}" draw:shadow-opacity="${pct(sh.alpha)}"`
    }
    if (text) {
      const [l, t, r, b] = text.inset
      g += ` draw:textarea-vertical-align="${text.anchor}" fo:padding-left="${cm(l)}" fo:padding-top="${cm(t)}" fo:padding-right="${cm(r)}" fo:padding-bottom="${cm(b)}" draw:auto-grow-height="${text.autofit === 'resize'}" draw:auto-grow-width="false" fo:wrap-option="${text.wrap ? 'wrap' : 'no-wrap'}"`
      if (text.autofit === 'shrink') g += ' draw:fit-to-size="shrink-to-fit"'
      if (text.vert === 'vert' || text.vert === 'stacked') g += ' style:writing-mode="tb-rl"'
    }
    return this.styles.add('graphic', `<style:graphic-properties${g}${extra}/>`, 'gr')
  }

  /** Name of the font used by default in a shape's text. */
  private fontName(el: ShapeElement) {
    const def = STYLE_DEFS[styleKey(el)]
    const ov = el.placeholder && el.placeholder.style !== 'pic' ? (isTitleStyle(el.placeholder.style) ? this.rc.master?.title : this.rc.master?.body) : undefined
    return ov?.font ?? (def.font === 'major' ? this.rc.fonts.major : this.rc.fonts.minor)
  }

  private textProps(marks: Mark[] | undefined, base: { size?: number; font?: string; color?: string; bold?: boolean; caps?: boolean }) {
    const p: string[] = []
    let size = base.size
    let font = base.font
    let color = base.color
    let bold = base.bold
    let caps: string | null | undefined = base.caps ? 'all' : null
    for (const m of marks ?? []) {
      if (m.type === 'bold') bold = true
      else if (m.type === 'italic') p.push('fo:font-style="italic"')
      else if (m.type === 'underline') p.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"')
      else if (m.type === 'strike') p.push('style:text-line-through-style="solid"')
      else if (m.type === 'superscript') p.push('style:text-position="super 58%"')
      else if (m.type === 'subscript') p.push('style:text-position="sub 58%"')
      else if (m.type === 'highlight') p.push(`fo:background-color="${resolveColor(m.attrs.color, this.colors)}"`)
      else if (m.type === 'textStyle') {
        const a = m.attrs
        if (a.fontSize) size = a.fontSize
        if (a.fontFamily) font = a.fontFamily
        if (a.color) color = resolveColor(a.color, this.colors)
        if (a.letterSpacing) p.push(`fo:letter-spacing="${ptLen(a.letterSpacing)}"`)
        if (a.shadow) p.push('fo:text-shadow="1pt 1pt"')
        if (a.caps !== undefined && a.caps !== null) caps = a.caps
        if (a.uStyle && a.uStyle !== 'none') {
          const u = ODF_UNDERLINE[a.uStyle] ?? ['solid', 'single', 'auto']
          p.push(`style:text-underline-style="${u[0]}" style:text-underline-type="${u[1]}" style:text-underline-width="${u[2]}" style:text-underline-color="${a.uColor ? resolveColor(a.uColor, this.colors) : 'font-color'}"`)
        }
        if (a.strike2) p.push('style:text-line-through-style="solid" style:text-line-through-type="double"')
        if (a.baseline) p.push(`style:text-position="${Math.round(a.baseline)}% 67%"`)
      }
    }
    if (size) p.push(`fo:font-size="${ptLen(size)}"`)
    if (font) p.push(`fo:font-family="${esc(font)}"`)
    if (color) p.push(`fo:color="${color}"`)
    if (bold) p.push('fo:font-weight="bold"')
    if (caps === 'all') p.push('fo:text-transform="uppercase"')
    else if (caps === 'small') p.push('fo:font-variant="small-caps"')
    return p.join(' ')
  }

  private inlines(content: Inline[] | undefined, base: Parameters<PageWriter['textProps']>[1]) {
    let out = ''
    for (const n of content ?? []) {
      const style = this.styles.add('text', `<style:text-properties ${this.textProps(n.marks, base)}/>`, 'T')
      let body: string
      if (n.type === 'hardBreak') body = '<text:line-break/>'
      else if (n.type === 'field') body = n.attrs.kind === 'slidenum' ? `<text:page-number>${this.rc.slideNumber}</text:page-number>` : `<text:date>${esc(this.rc.dateText)}</text:date>`
      else body = textRuns(n.text)
      const link = n.marks?.find((m): m is Extract<Mark, { type: 'link' }> => m.type === 'link')
      const span = `<text:span text:style-name="${style}">${body}</text:span>`
      out += link ? `<text:a xlink:type="simple" xlink:href="${esc(linkHref(link.attrs.href))}">${span}</text:a>` : span
    }
    return out
  }

  /** Paragraphs of a text body, with lists for bulleted and numbered paragraphs. */
  textXml(el: ShapeElement, over?: { color: string; bold: boolean }) {
    if (!el.text) return ''
    const ctx = { ...textCtxFor(el, this.rc), ...(over ?? {}) }
    const paras = el.text.doc.content
    const markers = computeMarkers(paras, ctx)
    const scale = el.text.fontScale ?? 1
    let out = ''
    let i = 0
    while (i < paras.length) {
      if (!markers[i]) {
        out += this.paraXml(el, paras[i], ctx, false, scale)
        i++
        continue
      }
      // A run of list paragraphs becomes one list; deeper levels are nested lists.
      let j = i
      const levels = new Map<number, string>()
      while (j < paras.length && markers[j]) {
        const lvl = paras[j].attrs?.level ?? 0
        if (!levels.has(lvl)) levels.set(lvl, effectiveBullet(paras[j].attrs, ctx) ?? '•')
        j++
      }
      const listStyle = this.listStyle(levels, paras[i].attrs, ctx.colors)
      let items = ''
      for (let k = i; k < j; k++) {
        const lvl = paras[k].attrs?.level ?? 0
        let p = this.paraXml(el, paras[k], ctx, true, scale)
        for (let d = 0; d < lvl; d++) p = `<text:list><text:list-item>${p}</text:list-item></text:list>`
        items += `<text:list-item>${p}</text:list-item>`
      }
      out += `<text:list text:style-name="${listStyle}">${items}</text:list>`
      i = j
    }
    return out
  }

  private listStyle(levels: Map<number, string>, first: ParaAttrs | undefined, colors: ThemeColors) {
    let inner = ''
    for (let l = 0; l < 9; l++) {
      const b = levels.get(l) ?? levels.get(0) ?? '•'
      const indent = `<style:list-level-properties text:space-before="${cm(l * 48)}" text:min-label-width="${cm(24)}"/>`
      const color = first?.bulletColor ? ` fo:color="${resolveColor(first.bulletColor, colors)}"` : ''
      const size = first?.bulletSize ? ` fo:font-size="${first.bulletSize}%"` : ''
      if (b.startsWith('num:')) {
        const scheme = b.slice(4)
        const sample = (NUMBER_SCHEMES.find((s) => s.id === scheme) ?? NUMBER_SCHEMES[0]).sample(1)
        const m = /^(\(?)([^().]+)([.)]?)$/.exec(sample)
        const format = { '1': '1', a: 'a', A: 'A', i: 'i', I: 'I' }[m?.[2] ?? '1'] ?? '1'
        inner += `<text:list-level-style-number text:level="${l + 1}" style:num-format="${format}" style:num-prefix="${m?.[1] ?? ''}" style:num-suffix="${m?.[3] ?? '.'}"${first?.startAt && l === 0 ? ` text:start-value="${first.startAt}"` : ''}>${indent}<style:text-properties${color}${size}/></text:list-level-style-number>`
      } else inner += `<text:list-level-style-bullet text:level="${l + 1}" text:bullet-char="${esc(b.slice(0, 1))}">${indent}<style:text-properties${color}${size}/></text:list-level-style-bullet>`
    }
    const key = `<text:list-style>${inner}</text:list-style>`
    return this.w.def('L', key, (n) => `<text:list-style style:name="${n}">${inner}</text:list-style>`)
  }

  private paraXml(el: ShapeElement, p: Para, ctx: ReturnType<typeof textCtxFor>, listed: boolean, scale: number) {
    const m = paraMetrics(p.attrs, ctx, listed)
    const align = { left: 'start', center: 'center', right: 'end', justify: 'justify', distributed: 'justify' }[m.align]
    const lh = m.lineExact ? ptLen(m.lineExact) : `${Math.round((m.lineHeight / 1.2) * 100)}%`
    const indents = listed && p.attrs?.indent == null && p.attrs?.firstLine == null ? '' : ` fo:margin-left="${cm(m.marL)}" fo:text-indent="${cm(m.indent)}"`
    const pp = `<style:paragraph-properties fo:text-align="${align}" fo:margin-top="${ptLen(m.spaceBefore)}" fo:margin-bottom="${ptLen(m.spaceAfter)}" fo:line-height="${lh}"${indents}/>`
    const style = this.styles.add('paragraph', pp, 'P')
    const base = { size: Math.round(m.size * scale * 10) / 10, font: this.fontName(el), color: ctx.color, bold: ctx.bold, caps: ctx.caps }
    return `<text:p text:style-name="${style}">${this.inlines(p.content, base)}</text:p>`
  }

  async elementXml(el: SlideElement, ox = 0, oy = 0): Promise<string> {
    const name = ` draw:name="${esc(el.name)}"`
    const title = el.alt ? `<svg:desc>${esc(el.alt)}</svg:desc>` : ''
    const hidden = el.hidden ? ' draw:display="none"' : ''
    const raster = async () => {
      const url = this.w.opts.rasterize ? await this.w.opts.rasterize(el, this.w.pres).catch(() => null) : null
      if (!url) return ''
      const path = this.w.addFile(url)
      return `<draw:frame${name}${hidden} draw:style-name="${this.graphicStyle({}, null)}" ${this.frameAttrs(el, ox, oy)}><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${title}</draw:frame>`
    }
    switch (el.type) {
      case 'shape':
        return this.shapeXml(el, ox, oy)
      case 'image': {
        const plain = !el.crop && !el.adjust && !el.mask && el.src.startsWith('data:')
        if (!plain) {
          const r = await raster()
          if (r) return r
        }
        if (!el.src.startsWith('data:')) return ''
        const path = this.w.addFile(el.src)
        return `<draw:frame${name}${hidden} draw:style-name="${this.graphicStyle({ line: el.line, effects: el.effects }, null)}" ${this.frameAttrs(el, ox, oy)}><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${title}</draw:frame>`
      }
      case 'group': {
        let kids = ''
        for (const c of el.children) kids += await this.elementXml(c, ox + el.x, oy + el.y)
        return `<draw:g${name}>${kids}</draw:g>`
      }
      case 'ink': {
        const pts = el.points.map(([x, y]) => `${Math.round(x * 100)},${Math.round(y * 100)}`).join(' ')
        const line: Line = { color: el.color, width: el.width, dash: 'solid', alpha: el.highlighter ? 0.5 : undefined }
        return `<draw:polyline${name}${hidden} draw:style-name="${this.graphicStyle({ fill: { type: 'none' }, line }, null)}" ${this.frameAttrs(el, ox, oy)} svg:viewBox="0 0 ${Math.max(1, Math.round(el.w * 100))} ${Math.max(1, Math.round(el.h * 100))}" svg:points="${pts}"/>`
      }
      case 'table':
        return this.tableXml(el, ox, oy)
      case 'media': {
        if (!el.src.startsWith('data:')) return ''
        const path = this.w.addFile(el.src, el.src, 'Media')
        const poster = el.poster ? `<draw:image xlink:href="${this.w.addFile(el.poster)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` : ''
        return `<draw:frame${name}${hidden} draw:style-name="${this.graphicStyle({}, null)}" ${this.frameAttrs(el, ox, oy)}><draw:plugin xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="${el.mime}"><draw:param draw:name="Loop" draw:value="${!!el.loop}"/><draw:param draw:name="Mute" draw:value="${el.volume === 0}"/></draw:plugin>${poster}${title}</draw:frame>`
      }
      default:
        return raster()
    }
  }

  private shapeXml(el: ShapeElement, ox: number, oy: number) {
    const name = ` draw:name="${esc(el.name)}"`
    const hidden = el.hidden ? ' draw:display="none"' : ''
    const desc = el.alt ? `<svg:desc>${esc(el.alt)}</svg:desc>` : ''
    const link = el.link && !el.link.startsWith('#') ? el.link : null
    const wrapLink = (xml: string) => (link ? `<draw:a xlink:type="simple" xlink:href="${esc(link)}">${xml}</draw:a>` : xml)
    if (LINE_SHAPES.has(el.prst) && el.prst !== 'bentConnector3' && el.prst !== 'curvedConnector3') {
      const [a, b] = lineEnds(el)
      return wrapLink(`<draw:line${name}${hidden} draw:style-name="${this.graphicStyle({ fill: { type: 'none' }, line: el.line }, null)}" svg:x1="${cm(a.x + ox)}" svg:y1="${cm(a.y + oy)}" svg:x2="${cm(b.x + ox)}" svg:y2="${cm(b.y + oy)}">${desc}</draw:line>`)
    }
    const text = this.textXml(el)
    const cls = el.placeholder ? PH_CLASS[el.placeholder.style] : null
    if (cls || (el.textBox && el.prst === 'rect')) {
      const style = this.graphicStyle(el, el.text ?? null)
      const ph = cls ? ` presentation:class="${cls}" presentation:user-transformed="true"${el.text && !text.includes('<text:span') ? ' presentation:placeholder="true"' : ''}` : ''
      if (cls === 'graphic') return `<draw:frame${name}${hidden}${ph} draw:style-name="${style}" ${this.frameAttrs(el, ox, oy)}><draw:image/>${desc}</draw:frame>`
      return wrapLink(`<draw:frame${name}${hidden}${ph} draw:style-name="${style}" ${this.frameAttrs(el, ox, oy)}><draw:text-box>${text}</draw:text-box>${desc}</draw:frame>`)
    }
    // Every other shape is a custom shape with its outline as an enhanced path (in 1/100 px).
    const d = shapePathData(el)
    const vw = Math.max(1, Math.round(el.w * 100))
    const vh = Math.max(1, Math.round(el.h * 100))
    const flips = `${el.flipH ? ' draw:mirror-horizontal="true"' : ''}${el.flipV ? ' draw:mirror-vertical="true"' : ''}`
    const type = ODF_TYPES[el.prst] ? ` draw:type="${ODF_TYPES[el.prst]}"` : ' draw:type="non-primitive"'
    const geo = `<draw:enhanced-geometry svg:viewBox="0 0 ${vw} ${vh}"${type} draw:enhanced-path="${odfPath(d, 100)}"${flips}/>`
    return wrapLink(`<draw:custom-shape${name}${hidden} draw:style-name="${this.graphicStyle({ ...el, effects: effectiveEffects(el, this.rc.effectScheme) }, el.text ?? null)}" ${this.frameAttrs(el, ox, oy)}>${desc}${text}${geo}</draw:custom-shape>`)
  }

  private tableXml(t: TableElement, ox: number, oy: number) {
    const cols = t.cols.map((w) => `<table:table-column table:style-name="${this.styles.add('table-column', `<style:table-column-properties style:column-width="${cm(w)}"/>`, 'co')}"/>`).join('')
    let rows = ''
    for (const [r, row] of t.rows.entries()) {
      const rs = this.styles.add('table-row', `<style:table-row-properties style:row-height="${cm(row.h)}"/>`, 'ro')
      let cells = ''
      for (const [c, cell] of row.cells.entries()) {
        if (cell.merged) {
          cells += '<table:covered-table-cell/>'
          continue
        }
        const look = cellLook(t, r, c)
        const fill = this.w.fillAttrs(look.fill, this.colors)
        const border = (side: 't' | 'r' | 'b' | 'l') => {
          const b = look.borders[side]
          return b ? `${ptLen(b.width)} solid ${resolveColor(b.color, this.colors)}` : 'none'
        }
        const [ml, mt, mr, mb] = cell.margins ?? [9.6, 4.8, 9.6, 4.8]
        const cs = this.styles.add('table-cell', `<style:graphic-properties${fill} draw:textarea-vertical-align="${cell.anchor ?? 'top'}" fo:padding-left="${cm(ml)}" fo:padding-top="${cm(mt)}" fo:padding-right="${cm(mr)}" fo:padding-bottom="${cm(mb)}"/><style:table-cell-properties fo:border-top="${border('t')}" fo:border-right="${border('r')}" fo:border-bottom="${border('b')}" fo:border-left="${border('l')}"/>`, 'ce')
        const span = `${cell.colSpan && cell.colSpan > 1 ? ` table:number-columns-spanned="${cell.colSpan}"` : ''}${cell.rowSpan && cell.rowSpan > 1 ? ` table:number-rows-spanned="${cell.rowSpan}"` : ''}`
        const fake: ShapeElement = { id: '', type: 'shape', name: '', prst: 'rect', x: 0, y: 0, w: 0, h: 0, rot: 0, fill: { type: 'none' }, line: null, textBox: true, text: { doc: cell.doc, anchor: 'top', autofit: 'none', wrap: true, inset: [0, 0, 0, 0] } }
        // Cell text uses the table style's color and weight unless the runs say otherwise.
        const body = this.textXml(fake, { color: resolveColor(look.color, this.colors), bold: look.bold })
        cells += `<table:table-cell table:style-name="${cs}"${span}>${body}</table:table-cell>`
      }
      rows += `<table:table-row table:style-name="${rs}">${cells}</table:table-row>`
    }
    return `<draw:frame draw:name="${esc(t.name)}" draw:style-name="${this.graphicStyle({}, null)}" ${this.frameAttrs(t, ox, oy)}><table:table>${cols}${rows}</table:table></draw:frame>`
  }
}

/** Underline styles as ODF [style, type, width]. */
const ODF_UNDERLINE: Record<string, [string, string, string]> = {
  sng: ['solid', 'single', 'auto'],
  dbl: ['solid', 'double', 'auto'],
  heavy: ['solid', 'single', 'bold'],
  dotted: ['dotted', 'single', 'auto'],
  dottedHeavy: ['dotted', 'single', 'bold'],
  dash: ['dash', 'single', 'auto'],
  dashHeavy: ['dash', 'single', 'bold'],
  dashLong: ['long-dash', 'single', 'auto'],
  dotDash: ['dot-dash', 'single', 'auto'],
  dotDotDash: ['dot-dot-dash', 'single', 'auto'],
  wavy: ['wave', 'single', 'auto'],
  wavyHeavy: ['wave', 'single', 'bold'],
  wavyDbl: ['wave', 'double', 'auto'],
}

const PH_CLASS: Record<PlaceholderStyle, string> = {
  title: 'title',
  ctrTitle: 'title',
  sectionTitle: 'title',
  captionTitle: 'title',
  subTitle: 'subtitle',
  body: 'outline',
  captionBody: 'outline',
  sectionText: 'text',
  compHeader: 'text',
  captionText: 'text',
  pic: 'graphic',
}

/** Presets with an ODF shape type name of their own (other programs show them as editable shapes). */
const ODF_TYPES: Record<string, string> = {
  rect: 'rectangle',
  roundRect: 'round-rectangle',
  ellipse: 'ellipse',
  triangle: 'isosceles-triangle',
  rtTriangle: 'right-triangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  octagon: 'octagon',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  star5: 'star5',
  star4: 'star4',
  star8: 'star8',
  rightArrow: 'right-arrow',
  leftArrow: 'left-arrow',
  upArrow: 'up-arrow',
  downArrow: 'down-arrow',
  heart: 'heart',
  smileyFace: 'smiley',
  sun: 'sun',
  moon: 'moon',
  cloud: 'cloud',
  can: 'can',
  cube: 'cube',
  plus: 'cross',
  donut: 'ring',
  chevron: 'chevron',
  homePlate: 'pentagon-right',
  wedgeRectCallout: 'rectangular-callout',
  wedgeRoundRectCallout: 'round-rectangular-callout',
  wedgeEllipseCallout: 'round-callout',
  flowChartProcess: 'flowchart-process',
  flowChartDecision: 'flowchart-decision',
  flowChartTerminator: 'flowchart-terminator',
}
const PRST_OF_TYPE: Record<string, string> = Object.fromEntries(Object.entries(ODF_TYPES).map(([k, v]) => [v, k]))

function linkHref(href: string) {
  const m = /^#slide(\d+)$/.exec(href)
  return m ? `#page${m[1]}` : href
}

/** Text with runs of spaces and tabs written the ODF way. */
function textRuns(s: string) {
  return esc(s)
    .replace(/\t/g, '<text:tab/>')
    .replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`)
}

/** Outline of a shape in px at its size, as SVG path data with only M, L, C and Z. */
export function shapePathData(el: ShapeElement): string {
  if (el.prst === 'custom' && el.rings) {
    const sx = el.ringsBox?.w ? el.w / el.ringsBox.w : 1
    const sy = el.ringsBox?.h ? el.h / el.ringsBox.h : 1
    return outlinePath(scaleOutline({ rings: el.rings, handles: normHandles(el.rings, el.handles) }, sx, sy), !!el.open)
  }
  const geo = geometry(el.prst, el.w, el.h, el.adj)
  return geo.paths
    .filter((p) => p.fill !== 'none' || p.stroke !== false)
    .map((p) => {
      const { outline, closed } = pathToOutline(p.d)
      // Rings are converted one by one so open rings stay open.
      return outline.rings.map((r, i) => outlinePath({ rings: [r], handles: [outline.handles[i]] }, !closed[i])).join(' ')
    })
    .join(' ')
}

/** SVG path data (M L C Z) as an ODF enhanced path, scaled by `k`; N ends each sub-path. */
function odfPath(d: string, k: number) {
  return d
    .replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => String(Math.round(Number(n) * k)))
    .replace(/Z/g, 'Z N')
    .trim()
}

function enhancedToSvg(p: string): string | null {
  if (/[?$]/.test(p)) return null
  return p.replace(/\bN\b/g, ' ').replace(/\bF\b|\bS\b/g, ' ')
}

/** Rasterizer-free writer core: returns the package parts (path → content). */
export async function buildOdpParts(pres: Presentation, title: string, opts: OdpOptions = {}): Promise<Map<string, string | Uint8Array>> {
  const w = new OdpWriter(pres, opts)
  const content = new StyleSet()
  const pages: string[] = []
  for (const [i, slide] of pres.slides.entries()) {
    const rc = makeRenderCtx(pres, i + 1, slide.layout)
    const pw = new PageWriter(w, content, rc)
    let body = ''
    for (const el of slide.elements) body += await pw.elementXml(el)
    // Page style: background, visibility and transition.
    const bg = slideBackground(slide.background, rc)
    let dp = `${w.fillAttrs(bg.type === 'pattern' ? { type: 'solid', color: bg.bg } : bg, rc.colors)} draw:background-size="full" presentation:background-visible="true" presentation:background-objects-visible="${!slide.hideBackgroundGraphics}"`
    if (slide.hidden) dp += ' presentation:visibility="hidden"'
    const t = slide.transition
    if (t) {
      if (t.advanceAfter !== null && t.advanceAfter !== undefined) dp += ` presentation:transition-type="automatic" presentation:duration="${isoDuration(t.advanceAfter)}"`
      const smil = SMIL[t.name]
      if (smil) dp += ` smil:type="${smil[0]}" smil:subtype="${smil[1]}"${t.name === 'reveal' || t.name === 'uncover' ? ' smil:direction="reverse"' : ''} presentation:transition-speed="${t.duration <= 0.6 ? 'fast' : t.duration >= 1.5 ? 'slow' : 'medium'}" smil:dur="${t.duration}s"`
    }
    const dpName = content.add('drawing-page', `<style:drawing-page-properties${dp}/>`, 'dp')
    let notes = ''
    if (slide.notes) {
      const paras = slide.notes
        .split('\n')
        .map((l) => `<text:p>${textRuns(l)}</text:p>`)
        .join('')
      notes = `<presentation:notes><draw:page-thumbnail presentation:class="page" draw:page-number="${i + 1}" svg:width="14.8cm" svg:height="8.3cm" svg:x="3.1cm" svg:y="2.3cm"/><draw:frame presentation:class="notes" svg:width="16.8cm" svg:height="11.5cm" svg:x="2.1cm" svg:y="11.9cm"><draw:text-box>${paras}</draw:text-box></draw:frame></presentation:notes>`
    }
    pages.push(`<draw:page draw:name="page${i + 1}" draw:style-name="${dpName}" draw:master-page-name="Default" presentation:presentation-page-layout-name="AL1T0">${body}${notes}</draw:page>`)
  }
  const shows = (pres.customShows ?? [])
    .map((c) => {
      const names = c.slideIds.map((id) => pres.slides.findIndex((s) => s.id === id)).filter((k) => k >= 0).map((k) => `page${k + 1}`)
      return `<presentation:show presentation:name="${esc(c.name)}" presentation:pages="${names.join(',')}"/>`
    })
    .join('')
  const settings = `<presentation:settings${pres.loop ? ' presentation:endless="true"' : ''}${pres.showType === 'kiosk' ? ' presentation:pause="PT0S"' : ''}>${shows}</presentation:settings>`
  const contentXml = `${HEAD}<office:document-content ${XMLNS} office:version="1.3"><office:automatic-styles>${content.list.join('')}</office:automatic-styles><office:body><office:presentation>${pages.join('')}${settings}</office:presentation></office:body></office:document-content>`

  // styles.xml: page size, master page with the master's own objects, named definitions.
  const masterStyles = new StyleSet('m')
  const rc = makeRenderCtx(pres, 1, 'blank')
  const mw = new PageWriter(w, masterStyles, rc)
  let masterBody = ''
  for (const el of pres.master?.elements ?? []) masterBody += await mw.elementXml(el)
  const masterBg = slideBackground(null, rc)
  const masterDp = masterStyles.add('drawing-page', `<style:drawing-page-properties${w.fillAttrs(masterBg.type === 'pattern' ? { type: 'solid', color: masterBg.bg } : masterBg, rc.colors)} draw:background-size="full"/>`, 'Mdp')
  const portrait = pres.size.h > pres.size.w
  const pageLayout = `<style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${cm(pres.size.w)}" fo:page-height="${cm(pres.size.h)}" style:print-orientation="${portrait ? 'portrait' : 'landscape'}"/></style:page-layout>`
  const fonts = pres.fonts ?? rc.theme.fonts
  const defaultStyle = `<style:default-style style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="${rc.colors.accent1}" svg:stroke-color="${rc.colors.accent1}"/><style:text-properties fo:font-family="${esc(fonts.minor)}" fo:font-size="18pt" fo:color="${rc.colors.tx1}"/></style:default-style>`
  const stylesXml = `${HEAD}<office:document-styles ${XMLNS} office:version="1.3"><office:styles>${defaultStyle}${w.defs.join('')}</office:styles><office:automatic-styles>${pageLayout}${masterStyles.list.join('')}</office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="${masterDp}">${masterBody}</style:master-page></office:master-styles></office:document-styles>`
  const now = new Date().toISOString().replace(/\.\d+Z$/, '')
  const metaXml = `${HEAD}<office:document-meta ${XMLNS} office:version="1.3"><office:meta><meta:generator>Kontor Slides</meta:generator><dc:title>${esc(title)}</dc:title>${pres.author ? `<meta:initial-creator>${esc(pres.author)}</meta:initial-creator><dc:creator>${esc(pres.author)}</dc:creator>` : ''}<meta:creation-date>${now}</meta:creation-date><dc:date>${now}</dc:date>${pres.lang ? `<dc:language>${esc(pres.lang)}</dc:language>` : ''}<meta:document-statistic meta:page-count="${pres.slides.length}"/></office:meta></office:document-meta>`

  // The model, so our own files reopen exactly.
  const slim = mapStrings(pres, (s) => (s.startsWith('data:') && w.stored.has(s) ? MEDIA_REF + w.stored.get(s) : s))
  const model = JSON.stringify({ app: 'kontor-slides', version: 1, hash: hashString(contentXml), title, pres: slim })

  const manifest = [
    { path: '/', type: ODP_MIME },
    { path: 'content.xml', type: 'text/xml' },
    { path: 'styles.xml', type: 'text/xml' },
    { path: 'meta.xml', type: 'text/xml' },
    { path: KONTOR_PART, type: 'application/json' },
    ...w.manifest,
  ]
  const manifestXml = `${HEAD}<manifest:manifest xmlns:manifest="${NS.manifest}" manifest:version="1.3">${manifest.map((m) => `<manifest:file-entry manifest:full-path="${esc(m.path)}" manifest:media-type="${m.type}"${m.path === '/' ? ' manifest:version="1.3"' : ''}/>`).join('')}</manifest:manifest>`

  return new Map<string, string | Uint8Array>([
    ['mimetype', ODP_MIME],
    ['content.xml', contentXml],
    ['styles.xml', stylesXml],
    ['meta.xml', metaXml],
    ['META-INF/manifest.xml', manifestXml],
    [KONTOR_PART, model],
    ...w.files,
  ])
}

export async function zipOdp(parts: Map<string, string | Uint8Array>, JSZip: typeof JSZipType): Promise<Blob> {
  const zip = new JSZip()
  // "mimetype" must come first and be stored uncompressed.
  for (const [path, data] of parts) zip.file(path, data, path === 'mimetype' ? { compression: 'STORE' } : undefined)
  return zip.generateAsync({ type: 'blob', mimeType: ODP_MIME, compression: 'DEFLATE' })
}

export async function exportOdp(pres: Presentation, title: string, opts: OdpOptions = {}): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  return zipOdp(await buildOdpParts(pres, title, opts), JSZip)
}

// ---------- Reader ----------

type Props = Record<string, string>
type StyleDef = { family: string; parent: string | null; props: Props; listStyle?: string }

function elems(n: Node | null | undefined): Element[] {
  const out: Element[] = []
  if (!n) return out
  for (let c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c as Element)
  return out
}

/** Qualified name with our prefixes, whatever prefixes the file uses. */
function qn(el: Element) {
  const p = PREFIX_OF.get(el.namespaceURI ?? '') ?? el.prefix ?? ''
  return `${p}:${el.localName}`
}

function attr(el: Element, name: string): string | null {
  const [p, local] = name.split(':')
  const ns = (NS as Record<string, string>)[p]
  if (ns && el.hasAttributeNS?.(ns, local)) return el.getAttributeNS(ns, local)
  return el.getAttribute(name)
}

function allAttrs(el: Element, into: Props) {
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]
    if (a.name.startsWith('xmlns')) continue
    const p = PREFIX_OF.get(a.namespaceURI ?? '') ?? a.prefix ?? ''
    into[`${p}:${a.localName ?? a.name}`] = a.value
  }
}

/** A length in px. */
export function lengthPx(v: string | null | undefined): number {
  if (!v) return 0
  const m = /^(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(cm|mm|in|pt|pc|px)?$/i.exec(v.trim())
  if (!m) return 0
  const n = Number(m[1])
  switch ((m[2] ?? 'px').toLowerCase()) {
    case 'cm':
      return (n / 2.54) * 96
    case 'mm':
      return (n / 25.4) * 96
    case 'in':
      return n * 96
    case 'pt':
      return (n * 96) / 72
    case 'pc':
      return n * 16
    default:
      return n
  }
}
const lengthPt = (v: string | null | undefined) => (lengthPx(v) * 72) / 96

class Reader {
  styles = new Map<string, StyleDef>()
  defaults = new Map<string, Props>()
  named = new Map<string, Element>()
  fonts = new Map<string, string>()
  media = new Map<string, string>()
  listStyles = new Map<string, Element>()
  pageLayouts = new Map<string, Props>()

  collect(container: Element | null) {
    for (const s of elems(container)) {
      const q = qn(s)
      if (q === 'style:style') {
        const props: Props = {}
        for (const c of elems(s)) if (c.localName.endsWith('-properties')) allAttrs(c, props)
        this.styles.set(attr(s, 'style:name') ?? '', { family: attr(s, 'style:family') ?? '', parent: attr(s, 'style:parent-style-name'), props, listStyle: attr(s, 'style:list-style-name') ?? undefined })
      } else if (q === 'style:default-style') {
        const props: Props = {}
        for (const c of elems(s)) if (c.localName.endsWith('-properties')) allAttrs(c, props)
        this.defaults.set(attr(s, 'style:family') ?? '', props)
      } else if (q === 'text:list-style') this.listStyles.set(attr(s, 'style:name') ?? '', s)
      else if (q === 'style:page-layout') {
        const props: Props = {}
        for (const c of elems(s)) allAttrs(c, props)
        this.pageLayouts.set(attr(s, 'style:name') ?? '', props)
      } else if (q === 'style:font-face') this.fonts.set(attr(s, 'style:name') ?? '', (attr(s, 'svg:font-family') ?? '').replace(/^['"]|['"]$/g, ''))
      else if (s.localName && attr(s, 'draw:name')) this.named.set(`${s.localName}:${attr(s, 'draw:name')}`, s)
    }
  }

  /** Properties of a style with everything it inherits. */
  resolve(name: string | null | undefined, family?: string, depth = 0): Props {
    const st = name ? this.styles.get(name) : undefined
    if (!st || depth > 20) return family ? { ...(this.defaults.get(family) ?? {}) } : {}
    return { ...this.resolve(st.parent, family ?? st.family, depth + 1), ...st.props }
  }

  color(v: string | undefined): string | undefined {
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : undefined
  }

  fill(p: Props, fallbackNone: boolean): Fill {
    const kind = p['draw:fill'] ?? (fallbackNone ? 'none' : p['draw:fill-color'] ? 'solid' : 'none')
    const alpha = p['draw:opacity'] ? parseFloat(p['draw:opacity']) / 100 : undefined
    if (kind === 'solid') return { type: 'solid', color: this.color(p['draw:fill-color']) ?? '#729FCF', ...(alpha !== undefined && alpha < 1 ? { alpha } : {}) }
    if (kind === 'gradient') {
      const g = this.named.get(`gradient:${p['draw:fill-gradient-name']}`)
      if (!g) return { type: 'solid', color: '#729FCF' }
      const start = this.color(attr(g, 'draw:start-color') ?? undefined) ?? '#FFFFFF'
      const end = this.color(attr(g, 'draw:end-color') ?? undefined) ?? '#000000'
      const style = attr(g, 'draw:style') ?? 'linear'
      const radial = style === 'radial' || style === 'ellipsoid'
      const odfAngle = parseFloat(attr(g, 'draw:angle') ?? '0') / (/(deg|rad|grad)$/.test(attr(g, 'draw:angle') ?? '') ? 1 : 10)
      const angle = Math.round(((((810 - odfAngle) % 360) + 360) % 360) * 10) / 10
      const [a, b] = radial ? [end, start] : [start, end]
      if (style === 'axial') return { type: 'gradient', kind: 'linear', angle, stops: [{ pos: 0, color: b }, { pos: 0.5, color: a }, { pos: 1, color: b }] }
      return { type: 'gradient', kind: radial ? 'radial' : 'linear', angle: radial ? 0 : angle, stops: [{ pos: 0, color: a }, { pos: 1, color: b }] }
    }
    if (kind === 'bitmap') {
      const img = this.named.get(`fill-image:${p['draw:fill-image-name']}`)
      const href = img ? attr(img, 'xlink:href') : null
      const src = href ? this.media.get(href.replace(/^\.\//, '')) : undefined
      if (src) return { type: 'picture', src, tile: p['style:repeat'] === 'repeat' }
    }
    if (kind === 'hatch') return { type: 'solid', color: this.color(p['draw:fill-color']) ?? '#FFFFFF' }
    return { type: 'none' }
  }

  line(p: Props): Line {
    const kind = p['draw:stroke'] ?? 'none'
    if (kind === 'none') return null
    const width = Math.max(0.75, Math.round(lengthPt(p['svg:stroke-width']) * 100) / 100)
    const head = p['draw:marker-start'] ? markerHead(this.named.get(`marker:${p['draw:marker-start']}`)) : undefined
    const tail = p['draw:marker-end'] ? markerHead(this.named.get(`marker:${p['draw:marker-end']}`)) : undefined
    const alpha = p['svg:stroke-opacity'] ? parseFloat(p['svg:stroke-opacity']) / (p['svg:stroke-opacity'].endsWith('%') ? 100 : 1) : undefined
    return {
      color: this.color(p['svg:stroke-color']) ?? '#3465A4',
      width,
      dash: kind === 'dash' ? dashFromDef(this.named.get(`stroke-dash:${p['draw:stroke-dash']}`)) : 'solid',
      ...(alpha !== undefined && alpha < 1 ? { alpha } : {}),
      ...(head ? { head } : {}),
      ...(tail ? { tail } : {}),
    }
  }
}

function markerHead(m: Element | undefined): ArrowHead {
  const name = `${attr(m as Element, 'draw:name') ?? ''} ${attr(m as Element, 'draw:display-name') ?? ''}`.toLowerCase()
  if (!m) return 'triangle'
  if (/circle|oval/.test(name)) return 'oval'
  if (/diamond|square/.test(name)) return 'diamond'
  if (/line|open/.test(name)) return 'arrow'
  return 'triangle'
}

type PageCtx = { r: Reader; slideNumberBase?: number }

function frameBox(el: Element): { x: number; y: number; w: number; h: number; rot: number } {
  const w = lengthPx(attr(el, 'svg:width'))
  const h = lengthPx(attr(el, 'svg:height'))
  let x = lengthPx(attr(el, 'svg:x'))
  let y = lengthPx(attr(el, 'svg:y'))
  let rot = 0
  const tr = attr(el, 'draw:transform')
  if (tr) {
    const r = /rotate\s*\(\s*([-\d.e]+)\s*\)/.exec(tr)
    const t = /translate\s*\(\s*([^\s)]+)\s+([^\s)]+)\s*\)/.exec(tr)
    const a = r ? Number(r[1]) : 0
    rot = Math.round(((((-a * 180) / Math.PI) % 360) + 360) % 360 * 100) / 100
    if (t) {
      const tl = { x: lengthPx(t[1]) + x, y: lengthPx(t[2]) + y }
      // The translated point is the rotated top-left corner; find the unrotated box from it.
      const c = rotate({ x: tl.x + w / 2, y: tl.y + h / 2 }, tl, rot)
      x = c.x - w / 2
      y = c.y - h / 2
    }
  }
  return { x, y, w, h, rot }
}

function textAlign(v: string | undefined): TextAlign | undefined {
  return v ? ({ start: 'left', left: 'left', center: 'center', end: 'right', right: 'right', justify: 'justify' } as Record<string, TextAlign>)[v] : undefined
}

/** Character formatting of resolved text properties as marks. */
function marksFrom(p: Props, r: Reader): Mark[] {
  const marks: Mark[] = []
  if (p['fo:font-weight'] && p['fo:font-weight'] !== 'normal' && Number(p['fo:font-weight']) !== 400) marks.push({ type: 'bold' })
  if (p['fo:font-style'] === 'italic' || p['fo:font-style'] === 'oblique') marks.push({ type: 'italic' })
  const attrs: Extract<Mark, { type: 'textStyle' }>['attrs'] = {}
  const uStyle = p['style:text-underline-style']
  if (uStyle && uStyle !== 'none') {
    const key = `${uStyle}|${p['style:text-underline-type'] ?? 'single'}|${p['style:text-underline-width'] === 'bold' ? 'bold' : 'auto'}`
    const id = Object.entries(ODF_UNDERLINE).find(([, v]) => v.join('|') === key)?.[0] ?? 'sng'
    const uColor = r.color(p['style:text-underline-color'])
    if (id === 'sng' && !uColor) marks.push({ type: 'underline' })
    else {
      attrs.uStyle = id
      if (uColor) attrs.uColor = uColor
    }
  }
  if (p['style:text-line-through-style'] && p['style:text-line-through-style'] !== 'none') {
    if (p['style:text-line-through-type'] === 'double') attrs.strike2 = true
    else marks.push({ type: 'strike' })
  }
  const pos = p['style:text-position']
  const offset = pos ? parseFloat(pos) : NaN
  if (pos?.startsWith('super') || offset === 33 || offset === 30) marks.push({ type: 'superscript' })
  else if (pos?.startsWith('sub') || offset === -33 || offset === -25) marks.push({ type: 'subscript' })
  else if (offset) attrs.baseline = offset
  const hl = r.color(p['fo:background-color'])
  if (hl) marks.push({ type: 'highlight', attrs: { color: hl } })
  if (p['fo:font-size'] && !p['fo:font-size'].endsWith('%')) attrs.fontSize = Math.round(lengthPt(p['fo:font-size']) * 10) / 10
  const family = p['fo:font-family'] ?? (p['style:font-name'] ? r.fonts.get(p['style:font-name']) ?? p['style:font-name'] : undefined)
  if (family) attrs.fontFamily = family.replace(/^['"]|['"]$/g, '')
  const color = r.color(p['fo:color'])
  if (color) attrs.color = color
  if (p['fo:letter-spacing'] && p['fo:letter-spacing'] !== 'normal') attrs.letterSpacing = Math.round(lengthPt(p['fo:letter-spacing']) * 10) / 10
  if (p['fo:text-transform'] === 'uppercase') attrs.caps = 'all'
  else if (p['fo:font-variant'] === 'small-caps') attrs.caps = 'small'
  if (p['fo:text-shadow'] && p['fo:text-shadow'] !== 'none') attrs.shadow = true
  if (Object.keys(attrs).length) marks.push({ type: 'textStyle', attrs })
  return marks
}

function bulletOf(listStyle: Element | undefined, level: number): string {
  const lv = elems(listStyle).find((e) => Number(attr(e, 'text:level') ?? 1) === level + 1) ?? elems(listStyle)[0]
  if (!lv) return '•'
  if (lv.localName === 'list-level-style-number') {
    const f = attr(lv, 'style:num-format') ?? '1'
    const suffix = attr(lv, 'style:num-suffix') ?? '.'
    const prefix = attr(lv, 'style:num-prefix') ?? ''
    const sample = `${prefix}${f === '' ? '1' : f}${suffix}`
    const scheme = NUMBER_SCHEMES.find((s) => s.sample(1) === sample) ?? NUMBER_SCHEMES.find((s) => s.sample(1).replace(/[^a-z0-9]/gi, '') === (f || '1'))
    return `num:${(scheme ?? NUMBER_SCHEMES[0]).id}`
  }
  if (lv.localName === 'list-level-style-bullet') return attr(lv, 'text:bullet-char') || '•'
  return 'none'
}

/** Paragraphs of a text container (text-box, custom shape, table cell). */
function readParagraphs(container: Element, ctx: PageCtx, baseText: Props): Para[] {
  const paras: Para[] = []
  const r = ctx.r
  const walk = (node: Element, level: number, listStyle: Element | undefined, inList: boolean) => {
    for (const c of elems(node)) {
      const q = qn(c)
      if (q === 'text:list') {
        const ls = r.listStyles.get(attr(c, 'text:style-name') ?? '') ?? listStyle
        for (const item of elems(c)) if (item.localName === 'list-item' || item.localName === 'list-header') walk(item, inList ? level + 1 : level, ls, true)
      } else if (q === 'text:p' || q === 'text:h') {
        const pStyle = r.resolve(attr(c, 'text:style-name'), 'paragraph')
        const attrs: ParaAttrs = {}
        const align = textAlign(pStyle['fo:text-align'])
        if (align) attrs.align = align
        if (pStyle['fo:margin-top']) attrs.spaceBefore = Math.round(lengthPt(pStyle['fo:margin-top']) * 10) / 10
        if (pStyle['fo:margin-bottom']) attrs.spaceAfter = Math.round(lengthPt(pStyle['fo:margin-bottom']) * 10) / 10
        const lh = pStyle['fo:line-height']
        if (lh?.endsWith('%')) attrs.lineHeight = Math.round(parseFloat(lh)) / 100
        else if (lh && lh !== 'normal') attrs.lineExact = Math.round(lengthPt(lh) * 10) / 10
        const marL = pStyle['fo:margin-left'] ? lengthPx(pStyle['fo:margin-left']) : 0
        const ti = pStyle['fo:text-indent'] ? lengthPx(pStyle['fo:text-indent']) : 0
        if (!inList && marL > 0.5) attrs.indent = Math.round(marL * 10) / 10
        if (!inList && Math.abs(ti) > 0.5) attrs.firstLine = Math.round(ti * 10) / 10
        if (inList) {
          attrs.level = Math.min(8, level)
          attrs.bullet = bulletOf(listStyle, level)
        } else attrs.bullet = 'none'
        const content: Inline[] = []
        const base = { ...baseText, ...pStyle }
        readInlines(c, base, [], content, r)
        paras.push({ type: 'paragraph', attrs, ...(content.length ? { content } : {}) })
      } else if (q === 'draw:text-box') walk(c, level, listStyle, inList)
    }
  }
  walk(container, 0, undefined, false)
  return paras
}

function readInlines(node: Element, props: Props, extra: Mark[], out: Inline[], r: Reader) {
  const marks = () => {
    const m = [...marksFrom(props, r), ...extra]
    return m.length ? m : undefined
  }
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) {
      const text = (c.nodeValue ?? '').replace(/[\r\n\t ]+/g, ' ')
      if (!text) continue
      const last = out[out.length - 1]
      const mk = marks()
      if (last?.type === 'text' && JSON.stringify(last.marks) === JSON.stringify(mk)) last.text += text
      else out.push({ type: 'text', text, ...(mk ? { marks: mk } : {}) })
      continue
    }
    if (c.nodeType !== 1) continue
    const el = c as Element
    const q = qn(el)
    if (q === 'text:span') readInlines(el, { ...props, ...r.resolve(attr(el, 'text:style-name'), 'text') }, extra, out, r)
    else if (q === 'text:a') {
      const href = attr(el, 'xlink:href') ?? ''
      const page = /^#page(\d+)$/.exec(href)
      readInlines(el, props, [...extra, { type: 'link', attrs: { href: page ? `#slide${page[1]}` : href } }], out, r)
    } else if (q === 'text:s') out.push({ type: 'text', text: ' '.repeat(Number(attr(el, 'text:c') ?? 1)), ...(marks() ? { marks: marks() } : {}) })
    else if (q === 'text:tab') out.push({ type: 'text', text: '\t', ...(marks() ? { marks: marks() } : {}) })
    else if (q === 'text:line-break') out.push({ type: 'hardBreak' })
    else if (q === 'text:page-number') out.push({ type: 'field', attrs: { kind: 'slidenum' }, ...(marks() ? { marks: marks() } : {}) })
    else if (q === 'text:date' || q === 'presentation:date-time') out.push({ type: 'field', attrs: { kind: 'date' }, ...(marks() ? { marks: marks() } : {}) })
    else if (q !== 'text:note' && q !== 'office:annotation') readInlines(el, props, extra, out, r)
  }
  // Merge adjacent text with the same marks after spaces were split off.
  for (let i = out.length - 1; i > 0; i--) {
    const a = out[i - 1]
    const b = out[i]
    if (a.type === 'text' && b.type === 'text' && JSON.stringify(a.marks) === JSON.stringify(b.marks)) {
      a.text += b.text
      out.splice(i, 1)
    }
  }
}

function styleProps(el: Element, r: Reader): Props {
  return { ...r.resolve(attr(el, 'presentation:style-name'), 'graphic'), ...r.resolve(attr(el, 'draw:style-name'), 'graphic') }
}

function textBodyFrom(p: Props, paras: Para[], shape: boolean): ShapeElement['text'] {
  const pad = (k: string, d: number) => (p[k] !== undefined ? lengthPx(p[k]) : d)
  const anchor = (p['draw:textarea-vertical-align'] as 'top' | 'middle' | 'bottom' | undefined) ?? (shape ? 'middle' : 'top')
  return {
    doc: { type: 'doc', content: paras.length ? paras : [{ type: 'paragraph' }] },
    anchor: anchor === 'middle' || anchor === 'bottom' ? anchor : 'top',
    autofit: p['draw:fit-to-size'] === 'shrink-to-fit' || p['style:shrink-to-fit'] === 'true' ? 'shrink' : p['draw:auto-grow-height'] === 'true' ? 'resize' : 'none',
    wrap: p['fo:wrap-option'] !== 'no-wrap',
    inset: [pad('fo:padding-left', DEFAULT_INSET[0]), pad('fo:padding-top', DEFAULT_INSET[1]), pad('fo:padding-right', DEFAULT_INSET[2]), pad('fo:padding-bottom', DEFAULT_INSET[3])],
    ...(p['style:writing-mode'] === 'tb-rl' ? { vert: 'vert' as const } : {}),
  }
}

/** Text properties a shape's style gives its text (size, font, color …). */
function shapeTextProps(p: Props): Props {
  const out: Props = {}
  for (const [k, v] of Object.entries(p)) if (k.startsWith('fo:font') || k === 'fo:color' || k.startsWith('style:font') || k.startsWith('style:text') || k === 'fo:text-transform' || k === 'fo:letter-spacing') out[k] = v
  return out
}

const PH_STYLE: Record<string, PlaceholderStyle> = { title: 'title', outline: 'body', subtitle: 'subTitle', text: 'body', graphic: 'pic' }

async function readElement(el: Element, ctx: PageCtx): Promise<SlideElement | null> {
  const r = ctx.r
  const q = qn(el)
  const name = attr(el, 'draw:name') ?? ''
  const hidden = attr(el, 'draw:display') === 'none' || attr(el, 'presentation:display') === 'none' ? { hidden: true } : {}
  const desc = elems(el).find((c) => qn(c) === 'svg:desc' || qn(c) === 'svg:title')?.textContent ?? undefined
  const alt = desc ? { alt: desc } : {}
  const p = styleProps(el, r)
  const box = frameBox(el)
  const base = { id: uid(), name: name || '', ...box, ...hidden, ...alt }
  switch (q) {
    case 'draw:frame': {
      const kids = elems(el)
      const cls = attr(el, 'presentation:class')
      const tb = kids.find((c) => qn(c) === 'draw:text-box')
      const tbl = kids.find((c) => qn(c) === 'table:table')
      const plugin = kids.find((c) => qn(c) === 'draw:plugin')
      const image = kids.find((c) => qn(c) === 'draw:image' && attr(c, 'xlink:href'))
      if (tbl) return readTable(tbl, base, ctx)
      if (plugin) {
        const href = (attr(plugin, 'xlink:href') ?? '').replace(/^\.\//, '')
        const src = r.media.get(href)
        if (!src) return null
        const mime = attr(plugin, 'draw:mime-type') ?? src.slice(5, src.indexOf(';'))
        const media: MediaElement = { ...base, name: base.name || 'Media', type: 'media', kind: mime.startsWith('audio') ? 'audio' : 'video', src, mime, poster: image ? (r.media.get((attr(image, 'xlink:href') ?? '').replace(/^\.\//, '')) ?? null) : null }
        return media
      }
      if (image && !tb) {
        const src = r.media.get((attr(image, 'xlink:href') ?? '').replace(/^\.\//, ''))
        if (!src) return null
        const img: ImageElement = { ...base, name: base.name || 'Picture', type: 'image', src, natW: Math.round(box.w), natH: Math.round(box.h), line: r.line({ 'draw:stroke': 'none', ...p }) }
        return img
      }
      if (tb || cls) {
        if (attr(el, 'presentation:placeholder') === 'true' && cls !== 'title' && cls !== 'outline' && cls !== 'subtitle') return null
        if (cls && ['date-time', 'footer', 'page-number', 'header', 'notes', 'page'].includes(cls)) return null
        const paras = tb ? readParagraphs(tb, ctx, shapeTextProps(p)) : []
        if (attr(el, 'presentation:placeholder') === 'true') paras.length = 0
        const style = cls ? PH_STYLE[cls] : undefined
        const shape: ShapeElement = {
          ...base,
          name: base.name || (style ? 'Placeholder' : 'TextBox'),
          type: 'shape',
          prst: 'rect',
          fill: r.fill(p, true),
          line: r.line(p),
          text: textBodyFrom(p, style === 'body' ? paras.map((pa) => (pa.attrs?.bullet === 'none' ? { ...pa, attrs: { ...pa.attrs, bullet: null } } : pa)) : paras, false),
          ...(style ? { placeholder: { style, idx: style === 'title' ? 0 : 1 } } : { textBox: true }),
        }
        return shape
      }
      return null
    }
    case 'draw:custom-shape': {
      const geo = elems(el).find((c) => qn(c) === 'draw:enhanced-geometry')
      const type = geo ? attr(geo, 'draw:type') : null
      const prst = type ? PRST_OF_TYPE[type] : undefined
      const shape: ShapeElement = { ...base, name: base.name || 'Shape', type: 'shape', prst: prst ?? 'rect', fill: r.fill(p, false), line: r.line({ 'draw:stroke': 'solid', ...p }), text: textBodyFrom(p, readParagraphs(el, ctx, shapeTextProps(p)), true) }
      if (geo && attr(geo, 'draw:mirror-horizontal') === 'true') shape.flipH = true
      if (geo && attr(geo, 'draw:mirror-vertical') === 'true') shape.flipV = true
      const path = geo ? attr(geo, 'draw:enhanced-path') : null
      const svgPath = path ? enhancedToSvg(path) : null
      if (!prst && svgPath) {
        const vb = (attr(geo!, 'svg:viewBox') ?? `0 0 ${box.w} ${box.h}`).split(/[\s,]+/).map(Number)
        setOutline(shape, svgPath, vb[2] || box.w, vb[3] || box.h, vb[0] || 0, vb[1] || 0)
      }
      return shape
    }
    case 'draw:rect':
    case 'draw:ellipse':
    case 'draw:circle': {
      const prst = q === 'draw:rect' ? (attr(el, 'draw:corner-radius') && lengthPx(attr(el, 'draw:corner-radius')) > 0 ? 'roundRect' : 'rect') : 'ellipse'
      return { ...base, name: base.name || 'Shape', type: 'shape', prst, fill: r.fill(p, false), line: r.line({ 'draw:stroke': 'solid', ...p }), text: textBodyFrom(p, readParagraphs(el, ctx, shapeTextProps(p)), true) }
    }
    case 'draw:line':
    case 'draw:connector': {
      const x1 = lengthPx(attr(el, 'svg:x1'))
      const y1 = lengthPx(attr(el, 'svg:y1'))
      const x2 = lengthPx(attr(el, 'svg:x2'))
      const y2 = lengthPx(attr(el, 'svg:y2'))
      const shape: ShapeElement = { ...base, name: base.name || 'Line', type: 'shape', prst: q === 'draw:connector' ? 'straightConnector1' : 'line', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), rot: 0, fill: { type: 'none' }, line: r.line({ 'draw:stroke': 'solid', ...p }) }
      if (x2 < x1) shape.flipH = true
      if (y2 < y1) shape.flipV = true
      return shape
    }
    case 'draw:polygon':
    case 'draw:polyline':
    case 'draw:path': {
      const vb = (attr(el, 'svg:viewBox') ?? `0 0 ${box.w} ${box.h}`).split(/[\s,]+/).map(Number)
      let d = attr(el, 'svg:d') ?? ''
      if (q !== 'draw:path') {
        const pts = (attr(el, 'svg:points') ?? '').trim().split(/\s+/).map((s) => s.split(',').map(Number))
        d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + (q === 'draw:polygon' ? ' Z' : '')
      }
      const open = q === 'draw:polyline' || (q === 'draw:path' && !/z\s*$/i.test(d.trim()))
      const shape: ShapeElement = { ...base, name: base.name || 'Freeform', type: 'shape', prst: 'custom', fill: open ? { type: 'none' } : r.fill(p, false), line: r.line({ 'draw:stroke': 'solid', ...p }), ...(open ? { open: true } : {}) }
      setOutline(shape, d, vb[2] || box.w, vb[3] || box.h, vb[0] || 0, vb[1] || 0)
      return shape
    }
    case 'draw:g': {
      const children: SlideElement[] = []
      for (const c of elems(el)) {
        const k = await readElement(c, ctx)
        if (k) children.push(k)
      }
      if (!children.length) return null
      const x0 = Math.min(...children.map((c) => c.x))
      const y0 = Math.min(...children.map((c) => c.y))
      const x1 = Math.max(...children.map((c) => c.x + c.w))
      const y1 = Math.max(...children.map((c) => c.y + c.h))
      const g: GroupElement = { id: uid(), name: name || 'Group', type: 'group', x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: 0, children: children.map((c) => ({ ...c, x: c.x - x0, y: c.y - y0 })) }
      return g
    }
    case 'draw:a': {
      const inner = elems(el)[0]
      const k = inner ? await readElement(inner, ctx) : null
      if (k) k.link = attr(el, 'xlink:href') ?? undefined
      return k
    }
  }
  return null
}

function setOutline(shape: ShapeElement, d: string, vw: number, vh: number, vx: number, vy: number) {
  const { outline, closed } = pathToOutline(d)
  const sx = shape.w / (vw || 1)
  const sy = shape.h / (vh || 1)
  const moved = scaleOutline({ rings: outline.rings.map((r) => r.map(([x, y]) => [x - vx, y - vy])), handles: outline.handles.map((r) => r.map((h) => (h ? { ...h, i: h.i && [h.i[0] - vx, h.i[1] - vy], o: h.o && [h.o[0] - vx, h.o[1] - vy] } : null))) }, sx, sy)
  shape.prst = 'custom'
  shape.rings = moved.rings
  shape.handles = moved.handles
  shape.ringsBox = { w: shape.w, h: shape.h }
  if (closed.length && closed.every((c) => !c)) shape.open = true
}

function readTable(tbl: Element, base: { id: string; name: string; x: number; y: number; w: number; h: number; rot: number }, ctx: PageCtx): TableElement {
  const r = ctx.r
  const cols: number[] = []
  for (const c of elems(tbl).filter((e) => e.localName === 'table-column' || e.localName === 'table-columns')) {
    const list = c.localName === 'table-columns' ? elems(c) : [c]
    for (const col of list) {
      const w = lengthPx(r.resolve(attr(col, 'table:style-name'))['style:column-width'])
      for (let k = 0; k < Number(attr(col, 'table:number-columns-repeated') ?? 1); k++) cols.push(w)
    }
  }
  const rowEls = elems(tbl).flatMap((e) => (e.localName === 'table-rows' || e.localName === 'table-header-rows' ? elems(e) : [e])).filter((e) => e.localName === 'table-row')
  const rows = rowEls.map((row) => {
    const h = lengthPx(r.resolve(attr(row, 'table:style-name'))['style:row-height']) || 40
    const cells: TableCell[] = elems(row)
      .filter((c) => c.localName === 'table-cell' || c.localName === 'covered-table-cell')
      .map((c) => {
        if (c.localName === 'covered-table-cell') return { doc: { type: 'doc', content: [{ type: 'paragraph' }] }, merged: true }
        const cp = r.resolve(attr(c, 'table:style-name'))
        const paras = readParagraphs(c, ctx, shapeTextProps(cp))
        const cell: TableCell = { doc: { type: 'doc', content: paras.length ? paras : [{ type: 'paragraph' }] } }
        if (cp['draw:fill'] || cp['fo:background-color']) cell.fill = cp['draw:fill'] ? r.fill(cp, true) : r.color(cp['fo:background-color']) ? { type: 'solid', color: r.color(cp['fo:background-color'])! } : null
        const cs = Number(attr(c, 'table:number-columns-spanned') ?? 1)
        const rs = Number(attr(c, 'table:number-rows-spanned') ?? 1)
        if (cs > 1) cell.colSpan = cs
        if (rs > 1) cell.rowSpan = rs
        const borders: TableCell['borders'] = {}
        for (const [side, key] of [['t', 'fo:border-top'], ['r', 'fo:border-right'], ['b', 'fo:border-bottom'], ['l', 'fo:border-left']] as const) {
          const v = cp[key] ?? cp['fo:border']
          if (!v) continue
          if (v === 'none') borders[side] = null
          else {
            const m = /([\d.]+\w+)\s+\w+\s+(#[0-9a-f]{6})/i.exec(v)
            if (m) borders[side] = { color: m[2].toUpperCase(), width: Math.round(lengthPt(m[1]) * 100) / 100, dash: 'solid' }
          }
        }
        if (Object.keys(borders).length) cell.borders = borders
        const va = cp['draw:textarea-vertical-align'] ?? cp['style:vertical-align']
        if (va === 'middle' || va === 'bottom') cell.anchor = va
        return cell
      })
    return { h, cells }
  })
  const nCols = Math.max(cols.length, ...rows.map((rw) => rw.cells.length))
  while (cols.length < nCols) cols.push(base.w / nCols || 100)
  for (const row of rows) while (row.cells.length < nCols) row.cells.push({ doc: { type: 'doc', content: [{ type: 'paragraph' }] } })
  const total = cols.reduce((a, b) => a + b, 0)
  const scale = base.w && total ? base.w / total : 1
  return {
    ...base,
    name: base.name || 'Table',
    type: 'table',
    cols: cols.map((c) => c * scale),
    rows,
    styleId: 'none',
    opts: { headerRow: false, totalRow: false, bandedRows: false, firstCol: false, lastCol: false, bandedCols: false },
    h: rows.reduce((a, rw) => a + rw.h, 0) || base.h,
  }
}

function transitionFrom(p: Props): Transition | null {
  const type = p['smil:type']
  const auto = p['presentation:transition-type'] === 'automatic' ? parseIsoDuration(p['presentation:duration'] ?? null) : null
  if (!type && auto === null) return null
  let name: TransitionName = type ? (SMIL_BACK[type] ?? 'fade') : 'none'
  if (name === 'cover' && p['smil:direction'] === 'reverse') name = 'reveal'
  const speed = p['presentation:transition-speed']
  const dur = p['smil:dur'] ? parseFloat(p['smil:dur']) : speed === 'fast' ? 0.5 : speed === 'slow' ? 2 : 1
  return { name, duration: Number.isFinite(dur) ? dur : 1, advanceOnClick: true, advanceAfter: auto }
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' }

/** Reads an .odp package (also used for .otp templates). */
export async function readOdp(data: ArrayBuffer | Uint8Array, fileName = 'Presentation.odp'): Promise<{ pres: Presentation; title: string }> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(data)
  const baseTitle = fileName.replace(/\.(odp|otp|fodp)$/i, '')
  const contentFile = zip.file('content.xml')
  if (!contentFile) throw new Error(t('This file is not a valid .odp presentation.'))
  const contentText = await contentFile.async('string')

  // Our own files: restore the stored model if the slides are untouched.
  const embedded = zip.file(KONTOR_PART)
  if (embedded) {
    try {
      const model = JSON.parse(await embedded.async('string')) as { hash: string; pres: Presentation }
      if (model.hash === hashString(contentText)) {
        const urls = new Map<string, string>()
        const refs = new Set<string>()
        mapStrings(model.pres, (s) => (s.startsWith(MEDIA_REF) && refs.add(s.slice(MEDIA_REF.length)), s))
        for (const path of refs) {
          const f = zip.file(path)
          if (f) urls.set(path, `data:${MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'};base64,${await f.async('base64')}`)
        }
        return { pres: mapStrings(model.pres, (s) => (s.startsWith(MEDIA_REF) ? (urls.get(s.slice(MEDIA_REF.length)) ?? '') : s)), title: baseTitle }
      }
    } catch {
      // Fall through to the regular reader.
    }
  }

  const r = new Reader()
  for (const path of Object.keys(zip.files)) {
    const ext = path.split('.').pop()!.toLowerCase()
    if (MIME[ext] && !zip.files[path].dir) r.media.set(path, `data:${MIME[ext]};base64,${await zip.file(path)!.async('base64')}`)
  }
  const parser = new DOMParser()
  const content = parser.parseFromString(contentText, 'application/xml')
  const stylesText = await zip.file('styles.xml')?.async('string')
  const styles = stylesText ? parser.parseFromString(stylesText, 'application/xml') : null
  const docEls = (doc: Document | null, local: string) => (doc ? Array.from(doc.getElementsByTagNameNS(NS.office, local)) : [])
  for (const doc of [styles, content]) {
    for (const local of ['font-face-decls', 'styles', 'automatic-styles']) for (const c of docEls(doc, local)) r.collect(c)
  }

  // Page size from the first master page's layout.
  const masters = styles ? Array.from(styles.getElementsByTagNameNS(NS.style, 'master-page')) : []
  const masterByName = new Map(masters.map((m) => [attr(m, 'style:name') ?? '', m]))
  const layout = r.pageLayouts.get(attr(masters[0] ?? ({} as Element), 'style:page-layout-name') ?? '') ?? [...r.pageLayouts.values()][0] ?? {}
  const w = Math.round(lengthPx(layout['fo:page-width']) || 1280)
  const h = Math.round(lengthPx(layout['fo:page-height']) || 720)
  const pres = createPresentation('kontor', 0, { w, h, name: w === 1280 && h === 720 ? '16:9' : w === 960 && h === 720 ? '4:3' : 'custom' })
  pres.slides = []
  const ctx: PageCtx = { r }

  const pages = Array.from(content.getElementsByTagNameNS(NS.draw, 'page'))
  const masterObjects = new Map<string, SlideElement[]>()
  for (const [i, page] of pages.entries()) {
    const masterName = attr(page, 'draw:master-page-name') ?? ''
    const master = masterByName.get(masterName)
    const pageProps = r.resolve(attr(page, 'draw:style-name'), 'drawing-page')
    const elements: SlideElement[] = []
    if (master && pageProps['presentation:background-objects-visible'] !== 'false') {
      if (!masterObjects.has(masterName)) {
        const list: SlideElement[] = []
        for (const c of elems(master)) {
          if (attr(c, 'presentation:class')) continue
          const e = await readElement(c, ctx)
          if (e) list.push(e)
        }
        masterObjects.set(masterName, list)
      }
      elements.push(...masterObjects.get(masterName)!.map((e) => ({ ...e, id: uid() })))
    }
    let notes = ''
    for (const c of elems(page)) {
      if (qn(c) === 'presentation:notes') {
        const frame = elems(c).find((f) => attr(f, 'presentation:class') === 'notes')
        const tb = frame ? elems(frame).find((k) => qn(k) === 'draw:text-box') : undefined
        if (tb) notes = readParagraphs(tb, ctx, {}).map((p) => (p.content ?? []).map((n) => (n.type === 'text' ? n.text : n.type === 'hardBreak' ? '\n' : '')).join('')).join('\n').trim()
        continue
      }
      if (qn(c) === 'office:forms' || qn(c) === 'anim:par') continue
      const e = await readElement(c, ctx)
      if (e) elements.push(e)
    }
    const masterProps = master ? r.resolve(attr(master, 'draw:style-name'), 'drawing-page') : {}
    const bgProps = pageProps['draw:fill'] && pageProps['draw:fill'] !== 'none' ? pageProps : masterProps
    const background = bgProps['draw:fill'] && bgProps['draw:fill'] !== 'none' ? r.fill(bgProps, true) : ({ type: 'solid', color: '#FFFFFF' } as Fill)
    const hasTitle = elements.some((e) => e.type === 'shape' && e.placeholder?.style === 'title')
    const hasBody = elements.some((e) => e.type === 'shape' && e.placeholder?.style === 'body')
    const slideLayout: LayoutId = hasTitle && hasBody ? 'titleContent' : hasTitle ? 'titleOnly' : 'blank'
    // A first slide with a title and a subtitle uses the title slide layout.
    for (const e of elements) if (e.type === 'shape' && e.placeholder?.style === 'title' && i === 0 && elements.some((k) => k.type === 'shape' && k.placeholder?.style === 'subTitle')) e.placeholder = { style: 'ctrTitle', idx: 0 }
    const slide: Slide = {
      id: uid('s'),
      layout: elements.some((e) => e.type === 'shape' && e.placeholder?.style === 'ctrTitle') ? 'title' : slideLayout,
      elements,
      background,
      hideBackgroundGraphics: true,
      notes,
      ...(pageProps['presentation:visibility'] === 'hidden' ? { hidden: true } : {}),
      transition: transitionFrom(pageProps),
    }
    pres.slides.push(slide)
  }
  if (!pres.slides.length) throw new Error(t('The presentation does not contain any slides.'))

  // Custom shows, loop and document properties.
  const pageNames = pages.map((p) => attr(p, 'draw:name') ?? '')
  const settings = content.getElementsByTagNameNS(NS.presentation, 'settings')[0]
  if (settings) {
    if (attr(settings, 'presentation:endless') === 'true') pres.loop = true
    const shows = elems(settings).filter((s) => s.localName === 'show')
    if (shows.length)
      pres.customShows = shows.map((s) => ({
        id: uid('cs'),
        name: attr(s, 'presentation:name') ?? 'Custom Show',
        slideIds: (attr(s, 'presentation:pages') ?? '')
          .split(',')
          .map((n) => pageNames.indexOf(n.trim()))
          .filter((k) => k >= 0)
          .map((k) => pres.slides[k].id),
      }))
  }
  const metaText = await zip.file('meta.xml')?.async('string')
  if (metaText) {
    const meta = parser.parseFromString(metaText, 'application/xml')
    const creator = meta.getElementsByTagNameNS(NS.meta, 'initial-creator')[0]?.textContent || meta.getElementsByTagNameNS(NS.dc, 'creator')[0]?.textContent
    if (creator) pres.author = creator
    const lang = meta.getElementsByTagNameNS(NS.dc, 'language')[0]?.textContent
    if (lang) pres.lang = lang
  }
  return { pres, title: baseTitle }
}

export async function importOdp(file: File) {
  return readOdp(await file.arrayBuffer(), file.name)
}

export type { ColorRef }

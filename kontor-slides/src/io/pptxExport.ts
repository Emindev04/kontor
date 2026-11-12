// .pptx writer. Builds the whole Open XML package itself (no template library), so the slide master,
// the layouts with real placeholders, the theme and every relationship are under our control and the
// file follows the ECMA-376 schema as closely as we can make it.
import type JSZipType from 'jszip'
import type { ChartElement, Fill, GroupElement, ImageElement, InkElement, LayoutId, MediaElement, PlaceholderStyle, Presentation, ShapeElement, Slide, SlideElement, TableElement, Transition, TransitionName } from '../model/types'
import type { ThemeColors } from '../model/color'
import { luminance } from '../model/color'
import { CHART_CT, CHART_NS, CHART_REL, PACKAGE_REL, XLSX_CT, chartSpaceXml, chartWorkbook } from './chartXml'
import { decoKind, footerBox, LAYOUTS, layoutBoxes, layoutName, STYLE_DEFS } from '../model/layouts'
import { getTheme, getVariant } from '../model/themes'
import { docFromText, isDocEmpty, BULLET_INDENT, LEVEL_INDENT } from '../model/richtext'
import { textBody } from '../model/factory'
import { makeRenderCtx, slideBackground, styleKey, tableCellCtx, textCtxFor, type RenderCtx } from '../render/context'
import { cellLook, originOf } from '../model/table'
import { diagramToGroup } from '../model/diagram'
import { soundWav } from '../model/soundWav'
import { effectiveEffects } from '../model/effectSchemes'
import { timingXml } from './timingXml'
import { custGeomXml, effectsXml, emu, escXml, fillXml, geomXml, graphicFrameXml, lineXml, tableCellXml, txBodyXml, xfrmXml, type TextExportCtx } from './drawingml'
import { normHandles, segments } from '../model/outline'
import { hashString, KONTOR_PART, KONTOR_REL, MEDIA_REF, mapStrings } from './package'

export { hashString, KONTOR_PART }
export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/** The .pptx package flavors: a presentation, a show that opens in the slide show, or a template. */
export type PptxKind = 'pptx' | 'ppsx' | 'potx'
export const PPTX_KIND_MIME: Record<PptxKind, string> = {
  pptx: PPTX_MIME,
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
}
const MAIN_CT: Record<PptxKind, string> = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml',
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XMLNS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const REL = {
  officeDocument: `${RT}officeDocument`,
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  extended: `${RT}extended-properties`,
  slide: `${RT}slide`,
  slideLayout: `${RT}slideLayout`,
  slideMaster: `${RT}slideMaster`,
  notesSlide: `${RT}notesSlide`,
  notesMaster: `${RT}notesMaster`,
  theme: `${RT}theme`,
  presProps: `${RT}presProps`,
  viewProps: `${RT}viewProps`,
  tableStyles: `${RT}tableStyles`,
  image: `${RT}image`,
  hyperlink: `${RT}hyperlink`,
  video: `${RT}video`,
  audio: `${RT}audio`,
  media: 'http://schemas.microsoft.com/office/2007/relationships/media',
}

const CTP = 'application/vnd.openxmlformats-officedocument.'
const CT = {
  presentation: `${CTP}presentationml.presentation.main+xml`,
  slide: `${CTP}presentationml.slide+xml`,
  slideLayout: `${CTP}presentationml.slideLayout+xml`,
  slideMaster: `${CTP}presentationml.slideMaster+xml`,
  notesSlide: `${CTP}presentationml.notesSlide+xml`,
  notesMaster: `${CTP}presentationml.notesMaster+xml`,
  theme: `${CTP}theme+xml`,
  presProps: `${CTP}presentationml.presProps+xml`,
  viewProps: `${CTP}presentationml.viewProps+xml`,
  tableStyles: `${CTP}presentationml.tableStyles+xml`,
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  extended: `${CTP}extended-properties+xml`,
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff', webp: 'image/webp' }

/** OOXML layout type for each of our layouts. */
export const LAYOUT_TYPES: Record<LayoutId, string> = {
  title: 'title',
  titleContent: 'obj',
  section: 'secHead',
  twoContent: 'twoObj',
  comparison: 'twoTxTwoObj',
  titleOnly: 'titleOnly',
  blank: 'blank',
  contentCaption: 'objTx',
  pictureCaption: 'picTx',
}

const MASTER_PROMPTS: Record<PlaceholderStyle, string> = {
  title: 'Click to edit Master title style',
  ctrTitle: 'Click to edit Master title style',
  sectionTitle: 'Click to edit Master title style',
  captionTitle: 'Click to edit Master title style',
  subTitle: 'Click to edit Master subtitle style',
  body: 'Click to edit Master text styles',
  captionBody: 'Click to edit Master text styles',
  sectionText: 'Click to edit Master text styles',
  compHeader: 'Click to edit Master text styles',
  captionText: 'Click to edit Master text styles',
  pic: 'Click icon to add picture',
}

/** The <p:ph> attributes for a placeholder, matching those of its layout. */
export function phXml(style: PlaceholderStyle, idx: number) {
  switch (style) {
    case 'ctrTitle':
      return '<p:ph type="ctrTitle"/>'
    case 'title':
    case 'sectionTitle':
    case 'captionTitle':
      return '<p:ph type="title"/>'
    case 'subTitle':
      return `<p:ph type="subTitle" idx="${idx}"/>`
    case 'sectionText':
      return `<p:ph type="body" idx="${idx}"/>`
    case 'compHeader':
      return `<p:ph type="body" sz="quarter" idx="${idx}"/>`
    case 'captionText':
      return `<p:ph type="body" sz="half" idx="${idx}"/>`
    case 'pic':
      return `<p:ph type="pic" idx="${idx}"/>`
    default:
      return `<p:ph idx="${idx}"/>`
  }
}

type FooterKind = 'dt' | 'ftr' | 'sldNum'
const FOOTER_IDX: Record<FooterKind, number> = { dt: 10, ftr: 11, sldNum: 12 }
const footerPh = (kind: FooterKind) => `<p:ph type="${kind}" sz="${kind === 'dt' ? 'half' : 'quarter'}" idx="${FOOTER_IDX[kind]}"/>`

const isoDate = (d = new Date()) => d.toISOString().replace(/\.\d+Z$/, 'Z')

function dataUrlInfo(url: string) {
  const comma = url.indexOf(',')
  const meta = url.slice(5, comma)
  const mime = meta.split(';')[0] || 'application/octet-stream'
  const base64 = meta.includes(';base64')
  const body = url.slice(comma + 1)
  let bytes: Uint8Array
  if (base64) {
    const bin = atob(body)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } else bytes = new TextEncoder().encode(decodeURIComponent(body))
  return { mime, bytes }
}

async function rasterizeSvg(src: string, w: number, h: number): Promise<string> {
  const img = new Image()
  await new Promise((res, rej) => {
    img.onload = res
    img.onerror = rej
    img.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * 2))
  canvas.height = Math.max(1, Math.round(h * 2))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/** A neutral poster image (video) or speaker icon (audio) when there is no poster frame. */
function placeholderPoster(kind: 'video' | 'audio') {
  const c = document.createElement('canvas')
  c.width = kind === 'video' ? 640 : 128
  c.height = kind === 'video' ? 360 : 128
  const g = c.getContext('2d')!
  g.fillStyle = kind === 'video' ? '#1f1f1f' : '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#9a9a9a'
  g.beginPath()
  if (kind === 'video') {
    g.moveTo(280, 130)
    g.lineTo(380, 180)
    g.lineTo(280, 230)
  } else {
    g.moveTo(20, 48)
    g.lineTo(44, 48)
    g.lineTo(72, 24)
    g.lineTo(72, 104)
    g.lineTo(44, 80)
    g.lineTo(20, 80)
  }
  g.fill()
  return c.toDataURL('image/png')
}

function mediaExt(mime: string, kind: 'video' | 'audio') {
  const map: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' }
  return map[mime] ?? (kind === 'video' ? 'mp4' : 'mp3')
}

// ---------- Package ----------

class Rels {
  private list: { id: string; type: string; target: string; external: boolean }[] = []
  add(type: string, target: string, external = false) {
    const found = this.list.find((r) => r.type === type && r.target === target && r.external === external)
    if (found) return found.id
    const id = `rId${this.list.length + 1}`
    this.list.push({ id, type, target, external })
    return id
  }
  xml() {
    return `${HEAD}<Relationships xmlns="${NS_PKG_REL}">${this.list.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`
  }
}

class Pkg {
  files = new Map<string, string | Uint8Array>()
  overrides = new Map<string, string>()
  defaults = new Map<string, string>([
    ['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
    ['xml', 'application/xml'],
  ])
  private media = new Map<string, string>()
  private mediaCount = 0
  /** Data URLs whose bytes were stored unchanged as a part (used to slim down KONTOR_PART). */
  stored = new Map<string, string>()

  xml(path: string, xml: string, ct?: string) {
    this.files.set(path, HEAD + xml)
    if (ct) this.overrides.set(`/${path}`, ct)
  }

  /** Stores a data URL once as a media part and returns its package path. */
  addMedia(url: string, kind: 'image' | 'media' = 'image', original = url): string {
    const hit = this.media.get(url)
    if (hit) return hit
    const { mime, bytes } = dataUrlInfo(url)
    let ext = Object.keys(IMAGE_TYPES).find((k) => IMAGE_TYPES[k] === mime) ?? (mime === 'image/jpg' ? 'jpeg' : mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin')
    if (kind === 'media') ext = mediaExt(mime, mime.startsWith('audio') ? 'audio' : 'video')
    const path = `ppt/media/${kind === 'image' ? 'image' : 'media'}${++this.mediaCount}.${ext}`
    this.files.set(path, bytes)
    if (!this.defaults.has(ext)) this.defaults.set(ext, mime === 'image/jpg' ? 'image/jpeg' : mime)
    this.media.set(url, path)
    if (original === url) this.stored.set(url, path)
    return path
  }

  contentTypes() {
    const d = [...this.defaults].map(([ext, ct]) => `<Default Extension="${ext}" ContentType="${ct}"/>`).join('')
    const o = [...this.overrides].map(([part, ct]) => `<Override PartName="${part}" ContentType="${ct}"/>`).join('')
    return `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${d}${o}</Types>`
  }
}

// ---------- Shapes ----------

/** Writes the shapes of one part (slide, layout or master): ids, relationships and media. */
class ShapeWriter {
  private nextId = 2
  /** Element id → shape id (cNvPr id), used by animations. */
  spids = new Map<string, number>()
  private usedPh = new Set<string>()
  constructor(
    private pkg: Pkg,
    private rels: Rels,
    private rc: RenderCtx,
    private fonts: { major: string; minor: string },
    private shared: { charts: number; JSZip: typeof JSZipType; slideCount: number },
    private partDir: 'slides' | 'slideLayouts' | 'slideMasters',
    private lang = 'en-US',
  ) {}

  id(elId?: string) {
    const n = this.nextId++
    if (elId) this.spids.set(elId, n)
    return n
  }

  private get colors(): ThemeColors {
    return this.rc.colors
  }

  linkRel = (href: string) => this.rels.add(REL.hyperlink, href, true)

  private imageRel(url: string, original = url) {
    return this.rels.add(REL.image, `../media/${this.pkg.addMedia(url, 'image', original).split('/').pop()}`)
  }

  /** Fill XML; picture fills get their own media part. */
  fill(fill: Fill) {
    if (fill.type !== 'picture') return fillXml(fill, this.colors)
    const alpha = fill.alpha !== undefined && fill.alpha < 1 ? `<a:alphaModFix amt="${Math.round(fill.alpha * 100000)}"/>` : ''
    const mode = fill.tile ? '<a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>' : '<a:stretch><a:fillRect/></a:stretch>'
    return `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${this.imageRel(fill.src)}">${alpha}</a:blip><a:srcRect/>${mode}</a:blipFill>`
  }

  async backgroundXml(fill: Fill) {
    let f = fill
    if (f.type === 'picture' && f.src.startsWith('data:image/svg')) f = { ...f, src: await rasterizeSvg(f.src, this.rc.size.w, this.rc.size.h) }
    return `<p:bg><p:bgPr>${this.fill(f)}<a:effectLst/></p:bgPr></p:bg>`
  }

  private cNvPr(id: number, el: SlideElement) {
    let link = ''
    if (el.link && !el.link.startsWith('#')) link = `<a:hlinkClick r:id="${this.linkRel(el.link)}"/>`
    else if (el.link) {
      const jump = ({ '#next': 'nextslide', '#prev': 'previousslide', '#first': 'firstslide', '#last': 'lastslide' } as Record<string, string>)[el.link]
      const m = /^#slide(\d+)$/.exec(el.link)
      if (jump) link = `<a:hlinkClick r:id="" action="ppaction://hlinkshowjump?jump=${jump}"/>`
      else if (m && this.partDir === 'slides' && Number(m[1]) >= 1 && Number(m[1]) <= this.shared.slideCount) link = `<a:hlinkClick r:id="${this.rels.add(REL.slide, `slide${m[1]}.xml`)}" action="ppaction://hlinksldjump"/>`
    }
    const descr = el.alt ? ` descr="${escXml(el.alt)}"` : ''
    return `<p:cNvPr id="${id}" name="${escXml(el.name || `Shape ${id}`)}"${descr}${el.hidden ? ' hidden="1"' : ''}>${link}</p:cNvPr>`
  }

  private textCtx(shape: ShapeElement): TextExportCtx {
    return { ...textCtxFor(shape, this.rc), majorFont: this.fonts.major, minorFont: this.fonts.minor, defaultFont: STYLE_DEFS[styleKey(shape)].font, linkRel: this.linkRel, lang: this.lang }
  }

  /** Placeholder XML for a shape, once per type and index on a slide (duplicates become plain shapes). */
  private ph(style: PlaceholderStyle, idx: number) {
    const key = style === 'title' || style === 'ctrTitle' || style === 'sectionTitle' || style === 'captionTitle' ? 'title' : `${style}:${idx}`
    if (this.usedPh.has(key)) return ''
    this.usedPh.add(key)
    return phXml(style, idx)
  }

  shapeXml(shape: ShapeElement, ph = shape.placeholder ? this.ph(shape.placeholder.style, shape.placeholder.idx) : '') {
    if (shape.conn && !shape.text && !ph && this.partDir === 'slides') return this.connectorXml(shape)
    const id = this.id(shape.id)
    const lockAttrs = `${ph ? ' noGrp="1"' : ''}${shape.lockAspect ? ' noChangeAspect="1"' : ''}`
    const locks = lockAttrs ? `<a:spLocks${lockAttrs}/>` : ''
    const cNvSpPr = `<p:cNvSpPr${shape.textBox ? ' txBox="1"' : ''}>${locks}</p:cNvSpPr>`
    const geom = shape.prst === 'custom' && shape.rings ? ringsGeomXml(shape) : geomXml(shape.prst, shape.adj)
    const spPr = `<p:spPr>${xfrmXml(shape)}${geom}${this.fill(shape.fill)}${lineXml(shape.line, this.colors)}${effectsXml(effectiveEffects(shape, this.rc.effectScheme), this.colors)}</p:spPr>`
    const tx = shape.text ? txBodyXml(shape.text, this.textCtx(shape)) : ph ? '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody>' : ''
    return `<p:sp><p:nvSpPr>${this.cNvPr(id, shape)}${cNvSpPr}<p:nvPr>${ph}</p:nvPr></p:nvSpPr>${spPr}${tx}</p:sp>`
  }

  /** A glued connector; the ids of the shapes it is glued to are filled in when the slide is complete. */
  private connectorXml(shape: ShapeElement) {
    const id = this.id(shape.id)
    const IDX_OF_SITE = [0, 3, 2, 1]
    const cxn = (tag: string, g: { id: string; site: number } | null | undefined) => (g ? `<a:${tag} id="@@SPID:${g.id}@@" idx="${IDX_OF_SITE[g.site] ?? 0}"/>` : '')
    const spPr = `<p:spPr>${xfrmXml(shape)}${geomXml(shape.prst, shape.adj)}${this.fill(shape.fill)}${lineXml(shape.line, this.colors)}${effectsXml(shape.effects, this.colors)}</p:spPr>`
    return `<p:cxnSp><p:nvCxnSpPr>${this.cNvPr(id, shape)}<p:cNvCxnSpPr>${cxn('stCxn', shape.conn?.start)}${cxn('endCxn', shape.conn?.end)}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>${spPr}</p:cxnSp>`
  }

  async imageXml(img: ImageElement) {
    const id = this.id(img.id)
    const src = img.src.startsWith('data:image/svg') ? await rasterizeSvg(img.src, img.natW || img.w, img.natH || img.h) : img.src
    const rid = this.imageRel(src, img.src)
    const a = img.adjust
    let fx = ''
    if (a?.transparency) fx += `<a:alphaModFix amt="${Math.round((1 - a.transparency) * 100000)}"/>`
    if (a?.grayscale) fx += '<a:grayscl/>'
    if (a?.saturation && !a.grayscale) fx += `<a:hsl hue="0" sat="${Math.round(a.saturation * 100000)}" lum="0"/>`
    if (a?.brightness || a?.contrast) fx += `<a:lum bright="${Math.round((a.brightness ?? 0) * 100000)}" contrast="${Math.round((a.contrast ?? 0) * 100000)}"/>`
    if (a?.recolor === 'bw') fx += '<a:biLevel thresh="50000"/>'
    if (a?.recolor === 'washout') fx += '<a:lum bright="70000" contrast="-70000"/>'
    if (a?.recolor === 'sepia') fx += '<a:duotone><a:prstClr val="black"/><a:srgbClr val="D9C3A5"><a:tint val="50000"/><a:satMod val="180000"/></a:srgbClr></a:duotone>'
    if (a?.sharpness && a.sharpness < 0) fx += `<a:blur rad="${Math.round(-a.sharpness * 2.5 * 9525)}"/>`
    const c = img.crop
    const crop = c && (c.l || c.t || c.r || c.b) ? `<a:srcRect l="${Math.round(c.l * 100000)}" t="${Math.round(c.t * 100000)}" r="${Math.round(c.r * 100000)}" b="${Math.round(c.b * 100000)}"/>` : ''
    const ph = img.placeholder ? this.ph('pic', img.placeholder.idx) : ''
    return (
      `<p:pic><p:nvPicPr>${this.cNvPr(id, img)}<p:cNvPicPr><a:picLocks noGrp="1" noChangeAspect="1"/></p:cNvPicPr><p:nvPr>${ph}</p:nvPr></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${rid}">${fx}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr>${xfrmXml(img)}${geomXml(img.mask ?? 'rect')}${img.line ? lineXml(img.line, this.colors) : ''}${effectsXml(img.effects, this.colors)}</p:spPr></p:pic>`
    )
  }

  inkXml(ink: InkElement) {
    const id = this.id(ink.id)
    const line = { color: ink.color, width: ink.width * 0.75, dash: 'solid' as const, alpha: ink.highlighter ? 0.5 : undefined }
    return `<p:sp><p:nvSpPr>${this.cNvPr(id, ink)}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(ink)}${custGeomXml(ink.points, ink.w, ink.h)}<a:noFill/>${lineXml(line, this.colors, true)}</p:spPr></p:sp>`
  }

  tableXml(t: TableElement) {
    const id = this.id(t.id)
    return graphicFrameXml(id, t.name, t, tableGraphicXml(t, this.rc, this.fonts, this.linkRel, this.lang), t.alt)
  }

  async chartXml(c: ChartElement) {
    const id = this.id(c.id)
    const k = ++this.shared.charts
    const wb = `Kontor_Chart_Data${k}.xlsx`
    this.pkg.files.set(`ppt/embeddings/${wb}`, await chartWorkbook(this.shared.JSZip, c))
    this.pkg.defaults.set('xlsx', XLSX_CT)
    const chartRels = new Rels()
    const wbRel = chartRels.add(PACKAGE_REL, `../embeddings/${wb}`)
    this.pkg.files.set(`ppt/charts/chart${k}.xml`, HEAD + chartSpaceXml(c, this.colors, this.fonts.minor, wbRel).replace(/^<\?xml[^>]*\?>\s*/, ''))
    this.pkg.overrides.set(`/ppt/charts/chart${k}.xml`, CHART_CT)
    this.pkg.files.set(`ppt/charts/_rels/chart${k}.xml.rels`, chartRels.xml())
    const rid = this.rels.add(CHART_REL, `../charts/chart${k}.xml`)
    return graphicFrameXml(id, c.name, c, `<a:graphicData uri="${CHART_NS}"><c:chart xmlns:c="${CHART_NS}" r:id="${rid}"/></a:graphicData>`, c.alt)
  }

  mediaXml(m: MediaElement) {
    const id = this.id(m.id)
    const target = `../media/${this.pkg.addMedia(m.src, 'media').split('/').pop()}`
    const rLink = this.rels.add(m.kind === 'video' ? REL.video : REL.audio, target)
    const rEmbed = this.rels.add(REL.media, target)
    const poster = m.poster && m.poster.startsWith('data:image/') ? m.poster : placeholderPoster(m.kind)
    const rPoster = this.imageRel(poster)
    const trim = m.trimStart || m.trimEnd ? `<p14:trim${m.trimStart ? ` st="${Math.round(m.trimStart * 1000)}"` : ''}${m.trimEnd && m.duration ? ` end="${Math.round(Math.max(0, m.duration - m.trimEnd) * 1000)}"` : ''}/>` : ''
    return (
      `<p:pic><p:nvPicPr>${this.cNvPr(id, { ...m, link: undefined }).replace('</p:cNvPr>', '<a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>')}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><a:${m.kind}File r:link="${rLink}"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="${rEmbed}">${trim}</p14:media></p:ext></p:extLst></p:nvPr></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${rPoster}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(m)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
    )
  }

  async groupXml(g: GroupElement): Promise<string> {
    const id = this.id(g.id)
    const kids = (await Promise.all(g.children.map((c) => this.elementXml(c)))).join('')
    const rot = g.rot ? ` rot="${Math.round(g.rot * 60000)}"` : ''
    const xfrm = `<a:xfrm${rot}${g.flipH ? ' flipH="1"' : ''}${g.flipV ? ' flipV="1"' : ''}><a:off x="${emu(g.x)}" y="${emu(g.y)}"/><a:ext cx="${emu(g.w)}" cy="${emu(g.h)}"/><a:chOff x="0" y="0"/><a:chExt cx="${emu(g.w)}" cy="${emu(g.h)}"/></a:xfrm>`
    return `<p:grpSp><p:nvGrpSpPr>${this.cNvPr(id, g)}<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${xfrm}</p:grpSpPr>${kids}</p:grpSp>`
  }

  async elementXml(el: SlideElement, slides?: Slide[]): Promise<string> {
    switch (el.type) {
      case 'shape':
        return this.shapeXml(el)
      case 'image':
        return this.imageXml(el)
      case 'ink':
        return this.inkXml(el)
      case 'table':
        return this.tableXml(el)
      case 'chart':
        return this.chartXml(el)
      case 'media':
        return this.mediaXml(el)
      case 'group':
        return this.groupXml(el)
      case 'diagram':
        return this.groupXml(diagramToGroup(el))
      case 'zoom': {
        // Zooms are written as frames that link to their slide, showing its title.
        const n = (slides ?? []).findIndex((x) => x.id === el.targetId) + 1
        const t = slides?.[n - 1]
        const label = t ? `Slide ${n}${titleOf(t) ? `: ${titleOf(t)}` : ''}` : 'Slide'
        const frame: ShapeElement = { id: el.id, type: 'shape', name: el.name, prst: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot, fill: { type: 'solid', color: 'theme:bg1' }, line: el.line, link: n ? `#slide${n}` : undefined, alt: el.alt, text: textBody({ anchor: 'middle', doc: docFromText(label, { align: 'center' }) }) }
        return this.shapeXml(frame, '')
      }
    }
  }

  /** Date, footer and slide number placeholders. */
  footerXml(kind: FooterKind, text: string | null) {
    const b = footerBox(kind === 'dt' ? 'date' : kind === 'ftr' ? 'footer' : 'sldNum', this.rc.size.w, this.rc.size.h)
    const style = { type: 'textStyle' as const, attrs: { fontSize: 12, color: 'theme:tx1:l25' } }
    const doc =
      kind === 'sldNum'
        ? { type: 'doc' as const, content: [{ type: 'paragraph' as const, attrs: { align: 'right' as const }, content: [{ type: 'field' as const, attrs: { kind: 'slidenum' as const }, marks: [style] }] }] }
        : kind === 'dt' && text === null
          ? { type: 'doc' as const, content: [{ type: 'paragraph' as const, attrs: { align: 'left' as const }, content: [{ type: 'field' as const, attrs: { kind: 'date' as const }, marks: [style] }] }] }
          : docFromText(text ?? '', { align: b.align }, [style])
    const shape: ShapeElement = { id: `ftr-${kind}`, type: 'shape', name: { dt: 'Date Placeholder', ftr: 'Footer Placeholder', sldNum: 'Slide Number Placeholder' }[kind], prst: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rot: 0, fill: { type: 'none' }, line: null, text: textBody({ anchor: 'middle', doc }) }
    return this.shapeXml(shape, footerPh(kind))
  }
}

function titleOf(s: Slide) {
  const t = s.elements.find((e) => e.type === 'shape' && e.placeholder && ['title', 'ctrTitle', 'sectionTitle', 'captionTitle'].includes(e.placeholder.style))
  if (!t || t.type !== 'shape' || !t.text) return ''
  return t.text.doc.content.map((p) => (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('')).join(' ').trim()
}

/** Free-form outline as custom geometry (one path with several rings; Bézier segments as cubicBezTo). */
function ringsGeomXml(el: ShapeElement) {
  const bw = el.ringsBox?.w || el.w
  const bh = el.ringsBox?.h || el.h
  const outline = { rings: el.rings ?? [], handles: normHandles(el.rings ?? [], el.handles) }
  const pt = ([x, y]: [number, number]) => `<a:pt x="${emu(x)}" y="${emu(y)}"/>`
  const body = outline.rings
    .map((r, ri) => {
      if (!r.length) return ''
      const segs = segments(outline, ri, !el.open)
      return `<a:moveTo>${pt(r[0])}</a:moveTo>` + segs.map((sg) => (sg.c1 && sg.c2 ? `<a:cubicBezTo>${pt(sg.c1)}${pt(sg.c2)}${pt(sg.b)}</a:cubicBezTo>` : `<a:lnTo>${pt(sg.b)}</a:lnTo>`)).join('') + (el.open ? '' : '<a:close/>')
    })
    .join('')
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${Math.max(1, emu(bw))}" h="${Math.max(1, emu(bh))}">${body}</a:path></a:pathLst></a:custGeom>`
}

function tableGraphicXml(t: TableElement, rc: RenderCtx, fonts: { major: string; minor: string }, linkRel: (href: string) => string, lang?: string) {
  const o = t.opts
  const grid = t.cols.map((w) => `<a:gridCol w="${emu(w)}"/>`).join('')
  const rows = t.rows
    .map((row, r) => {
      const cells = row.cells
        .map((cell, c) => {
          const origin = cell.merged ? originOf(t, r, c) : { r, c }
          const look = cellLook(t, origin.r, origin.c)
          const ctx: TextExportCtx = { ...tableCellCtx(rc, look.color, look.bold), majorFont: fonts.major, minorFont: fonts.minor, defaultFont: 'minor', linkRel, lang }
          return tableCellXml(
            {
              doc: cell.merged ? { type: 'doc', content: [] } : cell.doc,
              ctx,
              fill: look.fill,
              borders: look.borders,
              rowSpan: cell.merged ? undefined : cell.rowSpan,
              colSpan: cell.merged ? undefined : cell.colSpan,
              hMerge: cell.merged && origin.c < c,
              vMerge: cell.merged && origin.r < r,
              anchor: cell.anchor,
              margins: cell.margins,
              vert: cell.vert,
            },
            rc.colors,
          )
        })
        .join('')
      return `<a:tr h="${emu(row.h)}">${cells}</a:tr>`
    })
    .join('')
  const tblPr = `<a:tblPr${o.headerRow ? ' firstRow="1"' : ''}${o.totalRow ? ' lastRow="1"' : ''}${o.firstCol ? ' firstCol="1"' : ''}${o.lastCol ? ' lastCol="1"' : ''}${o.bandedRows ? ' bandRow="1"' : ''}${o.bandedCols ? ' bandCol="1"' : ''}>${effectsXml(t.effects, rc.colors)}</a:tblPr>`
  return `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>${tblPr}<a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData>`
}

const TRANSITION_XML: Record<string, (opt?: string) => string> = {
  cut: () => '<p:cut/>',
  fade: (o) => (o === 'black' ? '<p:fade thruBlk="1"/>' : '<p:fade/>'),
  push: (o) => `<p:push dir="${{ fromBottom: 'u', fromTop: 'd', fromLeft: 'r', fromRight: 'l' }[o ?? 'fromBottom'] ?? 'u'}"/>`,
  wipe: (o) => `<p:wipe dir="${{ fromRight: 'l', fromLeft: 'r', fromTop: 'd', fromBottom: 'u' }[o ?? 'fromRight'] ?? 'l'}"/>`,
  split: (o) => `<p:split orient="${o?.startsWith('horizontal') ? 'horz' : 'vert'}" dir="${o?.endsWith('In') ? 'in' : 'out'}"/>`,
  reveal: (o) => `<p:pull dir="${o === 'fromLeft' ? 'r' : 'l'}"/>`,
  cover: (o) => `<p:cover dir="${{ fromRight: 'l', fromLeft: 'r', fromTop: 'd', fromBottom: 'u' }[o ?? 'fromRight'] ?? 'l'}"/>`,
  randomBars: (o) => `<p:randomBar dir="${o === 'horizontal' ? 'horz' : 'vert'}"/>`,
  shape: (o) => (o === 'diamond' ? '<p:diamond/>' : o === 'plus' ? '<p:plus/>' : '<p:circle/>'),
  zoom: (o) => `<p:zoom dir="${o === 'out' ? 'out' : 'in'}"/>`,
  dissolve: () => '<p:dissolve/>',
  circle: () => '<p:circle/>',
  blinds: (o) => `<p:blinds dir="${o === 'horizontal' ? 'horz' : 'vert'}"/>`,
  checker: (o) => `<p:checker dir="${o === 'fromTop' ? 'vert' : 'horz'}"/>`,
  uncover: (o) => `<p:pull dir="${{ fromRight: 'l', fromLeft: 'r', fromTop: 'd', fromBottom: 'u' }[o ?? 'fromLeft'] ?? 'l'}"/>`,
  clock: () => '<p:wheel spokes="1"/>',
  wedge: () => '<p:wedge/>',
  strips: (o) => `<p:strips dir="${o === 'leftDown' ? 'ld' : 'rd'}"/>`,
  newsflash: () => '<p:newsflash/>',
  // Effects that need newer extensions are written with their closest basic equivalent.
  flash: () => '<p:fade thruBlk="0"/>',
  flip: () => '<p:fade/>',
  cube: (o) => `<p:push dir="${o === 'fromLeft' ? 'r' : 'l'}"/>`,
  fallOver: () => '<p:fade/>',
  curtains: () => '<p:split orient="horz" dir="out"/>',
  gallery: (o) => `<p:push dir="${o === 'fromLeft' ? 'r' : 'l'}"/>`,
  vortex: () => '<p:zoom dir="in"/>',
  morph: () => '<p:fade/>',
}

const NS_P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main'
const MODERN_NS: Record<string, string> = { p15: 'http://schemas.microsoft.com/office/powerpoint/2012/main', p159: 'http://schemas.microsoft.com/office/powerpoint/2015/09/main' }
const lr = (o: string | undefined) => (o === 'fromLeft' ? 'r' : 'l')

/** Transitions that need the newer schema extensions: [namespace prefix, effect element]. */
const MODERN_TRANSITIONS: Partial<Record<TransitionName, (o?: string) => [string, string]>> = {
  flash: () => ['p14', '<p14:flash/>'],
  flip: (o) => ['p14', `<p14:flip dir="${lr(o)}"/>`],
  cube: (o) => ['p14', `<p14:prism dir="${lr(o)}"/>`],
  gallery: (o) => ['p14', `<p14:gallery dir="${lr(o)}"/>`],
  vortex: (o) => ['p14', `<p14:vortex dir="${lr(o)}"/>`],
  fallOver: () => ['p15', '<p15:prstTrans prst="fallOver"/>'],
  curtains: () => ['p15', '<p15:prstTrans prst="curtains"/>'],
  morph: () => ['p159', '<p159:morph option="byObject"/>'],
}

export function transitionXml(t: Transition | null | undefined, soundRel?: string | null) {
  if (!t || (t.name === 'none' && t.advanceAfter === null && t.advanceOnClick && !soundRel)) return ''
  const spd = t.duration < 0.6 ? 'fast' : t.duration < 0.9 ? 'med' : 'slow'
  const attrs = `spd="${spd}"${t.advanceOnClick ? '' : ' advClick="0"'}${t.advanceAfter !== null ? ` advTm="${Math.round(t.advanceAfter * 1000)}"` : ''}`
  const inner = t.name !== 'none' ? (TRANSITION_XML[t.name]?.(t.option) ?? '') : ''
  const sound = soundRel && t.sound ? `<p:sndAc><p:stSnd><p:snd r:embed="${soundRel}" name="${escXml(t.sound)}.wav"/></p:stSnd></p:sndAc>` : ''
  // Newer transitions: the exact effect for programs that know it, the closest basic one otherwise.
  const modern = MODERN_TRANSITIONS[t.name]
  if (modern) {
    const [ns, xml] = modern(t.option)
    const dur = ` p14:dur="${Math.round(t.duration * 1000)}"`
    return (
      `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p14="${NS_P14}"${ns === 'p14' ? '' : ` xmlns:${ns}="${MODERN_NS[ns]}"`} Requires="${ns}">` +
      `<p:transition ${attrs}${dur}>${xml}${sound}</p:transition></mc:Choice><mc:Fallback><p:transition ${attrs}>${inner}${sound}</p:transition></mc:Fallback></mc:AlternateContent>`
    )
  }
  return `<p:transition ${attrs}>${inner}${sound}</p:transition>`
}

// ---------- Theme, master, layouts ----------

const hex6 = (c: string) => c.replace('#', '').toUpperCase().slice(0, 6)

/** True when the theme's background color is the dark one (light text on dark slides). */
function darkBackground(colors: ThemeColors) {
  return luminance(colors.bg1) < luminance(colors.tx1)
}

export function themeXml(name: string, colors: ThemeColors, fonts: { major: string; minor: string }) {
  const dark = darkBackground(colors)
  const dk1 = dark ? colors.bg1 : colors.tx1
  const lt1 = dark ? colors.tx1 : colors.bg1
  const dk2 = dark ? colors.bg2 : colors.tx2
  const lt2 = dark ? colors.tx2 : colors.bg2
  const c = (tag: string, v: string) => `<a:${tag}><a:srgbClr val="${hex6(v)}"/></a:${tag}>`
  const clr =
    `<a:clrScheme name="${escXml(name)}">${c('dk1', dk1)}${c('lt1', lt1)}${c('dk2', dk2)}${c('lt2', lt2)}` +
    `${c('accent1', colors.accent1)}${c('accent2', colors.accent2)}${c('accent3', colors.accent3)}${c('accent4', colors.accent4)}${c('accent5', colors.accent5)}${c('accent6', colors.accent6)}` +
    `${c('hlink', colors.hlink ?? colors.accent1)}${c('folHlink', colors.accent4)}</a:clrScheme>`
  const font = (tag: string, f: string) => `<a:${tag}><a:latin typeface="${escXml(f)}" panose="020F0302020204030204"/><a:ea typeface=""/><a:cs typeface=""/></a:${tag}>`
  const fontScheme = `<a:fontScheme name="${escXml(name)}">${font('majorFont', fonts.major)}${font('minorFont', fonts.minor)}</a:fontScheme>`
  const grad = (a: [number, number, number], b: [number, number, number], c2: [number, number, number]) =>
    `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="${a[0]}"/><a:satMod val="${a[1]}"/><a:tint val="${a[2]}"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="${b[0]}"/><a:satMod val="${b[1]}"/><a:tint val="${b[2]}"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="${c2[0]}"/><a:satMod val="${c2[1]}"/><a:tint val="${c2[2]}"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>`
  const ln = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`
  const fmt =
    `<a:fmtScheme name="${escXml(name)}">` +
    `<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>${grad([110000, 105000, 67000], [105000, 103000, 73000], [105000, 109000, 81000])}${grad([102000, 103000, 94000], [100000, 110000, 100000], [99000, 120000, 78000])}</a:fillStyleLst>` +
    `<a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>${grad([102000, 150000, 93000], [100000, 130000, 98000], [99000, 120000, 98000])}</a:bgFillStyleLst>` +
    '</a:fmtScheme>'
  return `<a:theme xmlns:a="${NS_A}" name="${escXml(name)}"><a:themeElements>${clr}${fontScheme}${fmt}</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
}

function clrMapXml(colors: ThemeColors, tag = 'p:clrMap') {
  const map = darkBackground(colors) ? 'bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"' : 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"'
  return `<${tag} ${map} accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`
}

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

/** Level properties for list styles (master text styles and layout overrides). */
function levelXml(level: number, o: { marL: number; indent: number; algn: string; sz: number; font: 'mj' | 'mn'; color?: string; bold?: boolean; caps?: boolean; spcBef: number; lnSpc: number; bullet?: string | null }) {
  const bullet = o.bullet ? `<a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:buChar char="${escXml(o.bullet)}"/>` : '<a:buNone/>'
  const color = o.color ? `<a:solidFill><a:srgbClr val="${hex6(o.color)}"/></a:solidFill>` : '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>'
  return (
    `<a:lvl${level + 1}pPr marL="${emu(o.marL)}" indent="${emu(o.indent)}" algn="${o.algn}" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
    `<a:lnSpc><a:spcPct val="${Math.round(o.lnSpc * 100000)}"/></a:lnSpc><a:spcBef><a:spcPts val="${Math.round(o.spcBef * 100)}"/></a:spcBef>${bullet}` +
    `<a:defRPr sz="${Math.round(o.sz * 100)}" kern="1200"${o.bold ? ' b="1"' : ''}${o.caps ? ' cap="all"' : ''}>${color}<a:latin typeface="+${o.font}-lt"/><a:ea typeface="+${o.font}-ea"/><a:cs typeface="+${o.font}-cs"/></a:defRPr></a:lvl${level + 1}pPr>`
  )
}

const ALGN: Record<string, string> = { left: 'l', center: 'ctr', right: 'r', justify: 'just', distributed: 'dist' }

/** Text styles of a placeholder style, as a list style (title or body levels). */
function styleLevels(style: PlaceholderStyle, rc: RenderCtx) {
  const el = { id: 'ph', type: 'shape', name: '', prst: 'rect', x: 0, y: 0, w: 1, h: 1, rot: 0, fill: { type: 'none' }, line: null, placeholder: { style, idx: 0 } } as ShapeElement
  const ctx = textCtxFor(el, rc)
  const def = STYLE_DEFS[style]
  const title = def.font === 'major' && !def.bullets
  return LEVELS.map((lvl) => {
    const bullet = ctx.bullets ? ctx.bulletChar : null
    return levelXml(lvl, {
      marL: bullet ? BULLET_INDENT + lvl * LEVEL_INDENT : title ? 0 : lvl * LEVEL_INDENT,
      indent: bullet ? -BULLET_INDENT : 0,
      algn: ALGN[ctx.align] ?? 'l',
      sz: ctx.sizes[Math.min(lvl, ctx.sizes.length - 1)],
      font: def.font === 'major' ? 'mj' : 'mn',
      color: ctx.color,
      bold: ctx.bold,
      caps: ctx.caps,
      spcBef: ctx.spaceBefore[Math.min(lvl, ctx.spaceBefore.length - 1)] ?? 0,
      lnSpc: ctx.lineHeight,
      bullet,
    })
  }).join('')
}

function bodyPrFor(style: PlaceholderStyle) {
  const anchor = { top: 't', middle: 'ctr', bottom: 'b' }[STYLE_DEFS[style].anchor]
  return `<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr>`
}

const promptRun = (prompt: string) => `<a:r><a:rPr lang="en-US"/><a:t>${escXml(prompt)}</a:t></a:r>`

/** A placeholder shape on a master or layout: position, text styles and its prompt text (runs XML). */
function masterPhXml(id: number, name: string, ph: string, box: { x: number; y: number; w: number; h: number }, bodyPr: string, lstStyle: string, text: string) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escXml(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrmXml({ ...box, rot: 0 })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody>${bodyPr}<a:lstStyle>${lstStyle}</a:lstStyle><a:p>${text}<a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
  )
}

function footerPhsXml(nextId: () => number, size: { w: number; h: number }) {
  const kinds: [FooterKind, 'date' | 'footer' | 'sldNum', string][] = [
    ['dt', 'date', 'Date Placeholder'],
    ['ftr', 'footer', 'Footer Placeholder'],
    ['sldNum', 'sldNum', 'Slide Number Placeholder'],
  ]
  return kinds
    .map(([kind, box, name]) => {
      const id = nextId()
      const b = footerBox(box, size.w, size.h)
      const lvl = `<a:lvl1pPr algn="${ALGN[b.align]}"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr>`
      const fld = kind === 'sldNum' ? '<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld>' : kind === 'dt' ? '<a:fld id="{F8166F1F-CE9B-4651-A6AA-CD717754106B}" type="datetimeFigureOut"><a:rPr lang="en-US"/><a:t>1/1/2026</a:t></a:fld>' : ''
      return masterPhXml(id, `${name} ${id - 1}`, footerPh(kind), b, '<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/>', lvl, fld)
    })
    .join('')
}

// ---------- Writer ----------

type Shared = { charts: number; JSZip: typeof JSZipType; slideCount: number }

async function writeMaster(pkg: Pkg, pres: Presentation, rcBase: RenderCtx, fonts: { major: string; minor: string }, shared: Shared, layoutCount: number) {
  const rels = new Rels()
  const w = new ShapeWriter(pkg, rels, rcBase, fonts, shared, 'slideMasters')
  const size = pres.size
  const title = layoutBoxes('titleContent', size.w, size.h, null)
  const rcContent = { ...rcBase, layout: 'titleContent' as LayoutId }
  const titleLvl = styleLevels('title', rcContent).match(/<a:lvl1pPr[\s\S]*?<\/a:lvl1pPr>/)![0]
  const shapes =
    masterPhXml(w.id(), 'Title Placeholder 1', '<p:ph type="title"/>', title[0], bodyPrFor('title'), '', promptRun(MASTER_PROMPTS.title)) +
    masterPhXml(w.id(), 'Text Placeholder 2', '<p:ph type="body" idx="1"/>', title[1], bodyPrFor('body'), '', promptRun(MASTER_PROMPTS.body))
  const footers = footerPhsXml(() => w.id(), size)
  const deco: string[] = []
  for (const el of pres.master?.elements ?? []) deco.push(await w.elementXml(el))
  const variant = rcBase.variant
  const bg = await w.backgroundXml(pres.master?.background ?? variant.background)
  const layoutIds = Array.from({ length: layoutCount }, (_, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="${rels.add(REL.slideLayout, `../slideLayouts/slideLayout${i + 1}.xml`)}"/>`).join('')
  rels.add(REL.theme, '../theme/theme1.xml')
  const titleStyle = `<p:titleStyle>${titleLvl}</p:titleStyle>`
  const bodyStyle = `<p:bodyStyle>${styleLevels('body', rcContent)}</p:bodyStyle>`
  const otherStyle = `<p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${LEVELS.map((l) => `<a:lvl${l + 1}pPr marL="${emu(l * LEVEL_INDENT)}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${l + 1}pPr>`).join('')}</p:otherStyle>`
  const xml =
    `<p:sldMaster ${XMLNS}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `${deco.join('')}${shapes}${footers}</p:spTree></p:cSld>${clrMapXml(rcBase.colors)}<p:sldLayoutIdLst>${layoutIds}</p:sldLayoutIdLst><p:txStyles>${titleStyle}${bodyStyle}${otherStyle}</p:txStyles></p:sldMaster>`
  pkg.xml('ppt/slideMasters/slideMaster1.xml', xml, CT.slideMaster)
  pkg.files.set('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels.xml())
}

async function writeLayout(pkg: Pkg, n: number, id: LayoutId, pres: Presentation, fonts: { major: string; minor: string }, shared: Shared) {
  const rels = new Rels()
  rels.add(REL.slideMaster, '../slideMasters/slideMaster1.xml')
  const rc = makeRenderCtx(pres, 1, id)
  const w = new ShapeWriter(pkg, rels, rc, fonts, shared, 'slideLayouts')
  const ov = pres.master?.layouts?.[id]
  const parts: string[] = []
  // Theme decorations belong to the layout (hidden on slides with "Hide Background Graphics").
  for (const [i, d] of rc.theme.deco(decoKind(id), pres.size.w, pres.size.h).entries()) parts.push(await w.elementXml({ ...d, id: `deco${i}`, name: `Decoration ${i + 1}` } as SlideElement))
  for (const el of ov?.elements ?? []) parts.push(await w.elementXml(el))
  for (const b of layoutBoxes(id, pres.size.w, pres.size.h, pres.master)) {
    const names: Record<PlaceholderStyle, string> = { title: 'Title', ctrTitle: 'Title', sectionTitle: 'Title', captionTitle: 'Title', subTitle: 'Subtitle', body: 'Content Placeholder', captionBody: 'Content Placeholder', sectionText: 'Text Placeholder', compHeader: 'Text Placeholder', captionText: 'Text Placeholder', pic: 'Picture Placeholder' }
    const pid = w.id()
    const lst = b.style === 'pic' ? '<a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="3200"/></a:lvl1pPr>' : styleLevels(b.style, rc)
    parts.push(masterPhXml(pid, `${names[b.style]} ${pid - 1}`, phXml(b.style, b.idx), b, bodyPrFor(b.style), lst, promptRun(MASTER_PROMPTS[b.style])))
  }
  if (!ov?.noFooters) parts.push(footerPhsXml(() => w.id(), pres.size))
  const bgFill = ov?.background ?? ((id === 'title' || id === 'section') && rc.variant.titleBackground) ?? null
  const bg = bgFill ? await w.backgroundXml(bgFill) : ''
  const type = LAYOUT_TYPES[id]
  const xml =
    `<p:sldLayout ${XMLNS} type="${type}" preserve="1"${ov?.hideMaster ? ' showMasterSp="0"' : ''}><p:cSld name="${escXml(layoutName(id))}">${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `${parts.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  pkg.xml(`ppt/slideLayouts/slideLayout${n}.xml`, xml, CT.slideLayout)
  pkg.files.set(`ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`, rels.xml())
}

async function writeSlide(pkg: Pkg, n: number, slide: Slide, pres: Presentation, fonts: { major: string; minor: string }, shared: Shared, layoutIndex: Map<LayoutId, number>) {
  const rels = new Rels()
  rels.add(REL.slideLayout, `../slideLayouts/slideLayout${layoutIndex.get(slide.layout) ?? 1}.xml`)
  const rc = makeRenderCtx(pres, n, slide.layout)
  const w = new ShapeWriter(pkg, rels, rc, fonts, shared, 'slides', pres.lang)
  const shapes: string[] = []
  for (const el of slide.elements) shapes.push(await w.elementXml(el, pres.slides))
  const hf = pres.headerFooter
  if (!(hf.notOnTitle && slide.layout === 'title') && !pres.master?.layouts?.[slide.layout]?.noFooters) {
    if (hf.date) shapes.push(w.footerXml('dt', hf.dateAuto || !hf.dateText ? null : hf.dateText))
    if (hf.footer && hf.footerText) shapes.push(w.footerXml('ftr', hf.footerText))
    if (hf.slideNumber) shapes.push(w.footerXml('sldNum', null))
  }
  const bg = slide.background ? await w.backgroundXml(slideBackground(slide.background, rc)) : ''
  if (slide.notes) rels.add(REL.notesSlide, `../notesSlides/notesSlide${n}.xml`)
  const timing = timingXml(slide, (id) => w.spids.get(id), pres.size)
  // Transition sounds are stored once per sound as WAV files.
  let soundRel: string | null = null
  const wav = slide.transition?.sound ? soundWav(slide.transition.sound) : null
  if (wav && slide.transition?.sound) {
    const part = `ppt/media/sound-${slide.transition.sound}.wav`
    if (!pkg.files.has(part)) pkg.files.set(part, wav)
    pkg.defaults.set('wav', 'audio/wav')
    soundRel = rels.add('http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio', `../media/sound-${slide.transition.sound}.wav`)
  }
  const attrs = `${slide.hidden ? ' show="0"' : ''}${slide.hideBackgroundGraphics ? ' showMasterSp="0"' : ''}`
  const xml =
    `<p:sld ${XMLNS}${attrs}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `${shapes.join('').replace(/<a:(stCxn|endCxn) id="@@SPID:([^@]+)@@" idx="(\d+)"\/>/g, (_m, tag: string, elId: string, idx: string) => (w.spids.has(elId) ? `<a:${tag} id="${w.spids.get(elId)}" idx="${idx}"/>` : ''))}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transitionXml(slide.transition, soundRel)}${timing}</p:sld>`
  pkg.xml(`ppt/slides/slide${n}.xml`, xml, CT.slide)
  pkg.files.set(`ppt/slides/_rels/slide${n}.xml.rels`, rels.xml())
  if (slide.notes) writeNotesSlide(pkg, n, slide.notes, pres.lang)
}

function writeNotesSlide(pkg: Pkg, n: number, notes: string, lang = 'en-US') {
  const rels = new Rels()
  rels.add(REL.notesMaster, '../notesMasters/notesMaster1.xml')
  rels.add(REL.slide, `../slides/slide${n}.xml`)
  const paras = notes
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line ? `<a:p><a:r><a:rPr lang="${escXml(lang)}" dirty="0"/><a:t>${escXml(line)}</a:t></a:r></a:p>` : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'))
    .join('')
  const xml =
    `<p:notes ${XMLNS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>' +
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>` +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
  pkg.xml(`ppt/notesSlides/notesSlide${n}.xml`, xml, CT.notesSlide)
  pkg.files.set(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, rels.xml())
}

function writeNotesMaster(pkg: Pkg, colors: ThemeColors) {
  const rels = new Rels()
  rels.add(REL.theme, '../theme/theme2.xml')
  const box = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`
  const ph = (id: number, name: string, phx: string, xfrm: string, algn: string, anchor: string, text: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${phx}</p:nvPr></p:nvSpPr><p:spPr>${xfrm}</p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="${anchor}"/><a:lstStyle><a:lvl1pPr algn="${algn}"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p>${text}<a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
  const shapes =
    ph(2, 'Header Placeholder 1', '<p:ph type="hdr" sz="quarter"/>', box(0, 0, 2971800, 458788), 'l', 't', '') +
    ph(3, 'Date Placeholder 2', '<p:ph type="dt" idx="1"/>', box(3884613, 0, 2971800, 458788), 'r', 't', '') +
    `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Image Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr>${box(685800, 1143000, 5486400, 3086100)}<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>` +
    ph(5, 'Notes Placeholder 4', '<p:ph type="body" sz="quarter" idx="3"/>', box(685800, 4400550, 5486400, 3600450), 'l', 't', '<a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r>') +
    ph(6, 'Footer Placeholder 5', '<p:ph type="ftr" sz="quarter" idx="4"/>', box(0, 8685213, 2971800, 458787), 'l', 'b', '') +
    ph(7, 'Slide Number Placeholder 6', '<p:ph type="sldNum" sz="quarter" idx="5"/>', box(3884613, 8685213, 2971800, 458787), 'r', 'b', '<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld>')
  const lvls = LEVELS.map((l) => `<a:lvl${l + 1}pPr marL="${l * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${l + 1}pPr>`).join('')
  const xml =
    `<p:notesMaster ${XMLNS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld>` +
    `${clrMapXml(colors)}<p:notesStyle>${lvls}</p:notesStyle></p:notesMaster>`
  pkg.xml('ppt/notesMasters/notesMaster1.xml', xml, CT.notesMaster)
  pkg.files.set('ppt/notesMasters/_rels/notesMaster1.xml.rels', rels.xml())
}

function presPropsXml(pres: Presentation) {
  const mode = pres.showType === 'individual' ? '<p:browse/>' : pres.showType === 'kiosk' ? '<p:kiosk/>' : '<p:present/>'
  const custom = pres.showCustom ? (pres.customShows ?? []).findIndex((c) => c.id === pres.showCustom) : -1
  const range = custom >= 0 ? `<p:custShow id="${custom}"/>` : pres.showRange ? `<p:sldRg st="${pres.showRange.from}" end="${pres.showRange.to}"/>` : '<p:sldAll/>'
  const pen = pres.penColor ? `<p:penClr><a:srgbClr val="${hex6(pres.penColor)}"/></p:penClr>` : '<p:penClr><a:prstClr val="red"/></p:penClr>'
  const attrs = `${pres.loop ? ' loop="1"' : ''} showNarration="1"${pres.showNoAnimation ? ' showAnimation="0"' : ''}${pres.useTimings === false ? ' useTimings="0"' : ''}`
  return `<p:presentationPr ${XMLNS}><p:showPr${attrs}>${mode}${range}${pen}</p:showPr></p:presentationPr>`
}

function defaultTextStyle() {
  return `<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${LEVELS.map((l) => `<a:lvl${l + 1}pPr marL="${l * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${l + 1}pPr>`).join('')}</p:defaultTextStyle>`
}

function countWords(pres: Presentation) {
  let words = 0
  let paras = 0
  const walk = (els: SlideElement[]) => {
    for (const e of els) {
      if (e.type === 'group') walk(e.children)
      if (e.type === 'shape' && e.text && !isDocEmpty(e.text.doc)) {
        for (const p of e.text.doc.content) {
          paras++
          words += (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('').split(/\s+/).filter(Boolean).length
        }
      }
    }
  }
  pres.slides.forEach((s) => walk(s.elements))
  return { words, paras }
}

/** Builds every part of the package (path → content); used by exportPptx and the tests. */
export async function buildPptxParts(pres: Presentation, title: string, JSZip: typeof JSZipType, kind: PptxKind = 'pptx'): Promise<Map<string, string | Uint8Array>> {
  const pkg = new Pkg()
  const theme = getTheme(pres.themeId)
  const variant = getVariant(theme, pres.variant)
  const fonts = pres.fonts ?? theme.fonts
  const shared: Shared = { charts: 0, JSZip, slideCount: pres.slides.length }
  const rcBase = makeRenderCtx(pres, 1, 'titleContent')

  // Theme, master and layouts.
  const colors = pres.colors ? { ...variant.colors, ...pres.colors } : variant.colors
  pkg.xml('ppt/theme/theme1.xml', themeXml(`${theme.name} – ${pres.colorsName || variant.name}`, colors, fonts), CT.theme)
  pkg.xml('ppt/theme/theme2.xml', themeXml(theme.name, colors, fonts), CT.theme)
  const layoutIndex = new Map<LayoutId, number>(LAYOUTS.map((l, i) => [l.id, i + 1]))
  await writeMaster(pkg, pres, rcBase, fonts, shared, LAYOUTS.length)
  for (const [i, l] of LAYOUTS.entries()) await writeLayout(pkg, i + 1, l.id, pres, fonts, shared)
  writeNotesMaster(pkg, colors)

  // Slides.
  for (const [i, slide] of pres.slides.entries()) await writeSlide(pkg, i + 1, slide, pres, fonts, shared, layoutIndex)

  // presentation.xml and its relationships.
  const presRels = new Rels()
  const masterRel = presRels.add(REL.slideMaster, 'slideMasters/slideMaster1.xml')
  const slideRels = pres.slides.map((_, i) => presRels.add(REL.slide, `slides/slide${i + 1}.xml`))
  const notesRel = presRels.add(REL.notesMaster, 'notesMasters/notesMaster1.xml')
  presRels.add(REL.presProps, 'presProps.xml')
  presRels.add(REL.viewProps, 'viewProps.xml')
  presRels.add(REL.theme, 'theme/theme1.xml')
  presRels.add(REL.tableStyles, 'tableStyles.xml')
  const sldSz = `<p:sldSz cx="${emu(pres.size.w)}" cy="${emu(pres.size.h)}"${pres.size.name === '4:3' ? ' type="screen4x3"' : ''}/>`
  const shows = (pres.customShows ?? [])
    .map((c, i) => `<p:custShow name="${escXml(c.name)}" id="${i}"><p:sldLst>${c.slideIds.map((id) => pres.slides.findIndex((s) => s.id === id)).filter((k) => k >= 0).map((k) => `<p:sld r:id="${slideRels[k]}"/>`).join('')}</p:sldLst></p:custShow>`)
    .join('')
  pkg.xml(
    'ppt/presentation.xml',
    `<p:presentation ${XMLNS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${masterRel}"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="${notesRel}"/></p:notesMasterIdLst>` +
      `${slideRels.length ? `<p:sldIdLst>${slideRels.map((r, i) => `<p:sldId id="${256 + i}" r:id="${r}"/>`).join('')}</p:sldIdLst>` : ''}${sldSz}<p:notesSz cx="6858000" cy="9144000"/>` +
      `${shows ? `<p:custShowLst>${shows}</p:custShowLst>` : ''}${defaultTextStyle()}</p:presentation>`,
    MAIN_CT[kind],
  )
  pkg.files.set('ppt/_rels/presentation.xml.rels', presRels.xml())
  pkg.xml('ppt/presProps.xml', presPropsXml(pres), CT.presProps)
  pkg.xml(
    'ppt/viewProps.xml',
    `<p:viewPr ${XMLNS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="0"><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`,
    CT.viewProps,
  )
  pkg.xml('ppt/tableStyles.xml', `<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`, CT.tableStyles)

  // Document properties.
  const now = isoDate()
  const author = escXml(pres.author || 'Kontor Slides')
  pkg.xml(
    'docProps/core.xml',
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXml(title)}</dc:title><dc:creator>${author}</dc:creator><cp:lastModifiedBy>${author}</cp:lastModifiedBy><cp:revision>1</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    CT.core,
  )
  const { words, paras } = countWords(pres)
  const format = pres.size.name === '4:3' ? 'On-screen Show (4:3)' : pres.size.name === '16:9' ? 'Widescreen' : 'Custom'
  pkg.xml(
    'docProps/app.xml',
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><TotalTime>0</TotalTime><Words>${words}</Words><Application>Kontor Slides</Application><PresentationFormat>${format}</PresentationFormat><Paragraphs>${paras}</Paragraphs><Slides>${pres.slides.length}</Slides><Notes>${pres.slides.filter((s) => s.notes).length}</Notes><HiddenSlides>${pres.slides.filter((s) => s.hidden).length}</HiddenSlides><MMClips>${pres.slides.reduce((n, s) => n + s.elements.filter((e) => e.type === 'media').length, 0)}</MMClips><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>`,
    CT.extended,
  )

  // Root relationships, our model part and the content types.
  const root = new Rels()
  root.add(REL.officeDocument, 'ppt/presentation.xml')
  root.add(REL.core, 'docProps/core.xml')
  root.add(REL.extended, 'docProps/app.xml')
  root.add(KONTOR_REL, KONTOR_PART)
  pkg.files.set('_rels/.rels', root.xml())
  const slideXml = pres.slides.map((_, i) => pkg.files.get(`ppt/slides/slide${i + 1}.xml`) as string)
  // Pictures and media already stored as parts are referenced instead of embedded twice.
  const slim = mapStrings(pres, (s) => (s.startsWith('data:') && pkg.stored.has(s) ? MEDIA_REF + pkg.stored.get(s) : s))
  pkg.files.set(KONTOR_PART, JSON.stringify({ app: 'kontor-slides', version: 1, hash: hashString(slideXml.join('')), title, pres: slim }))
  pkg.defaults.set('json', 'application/json')
  return new Map([['[Content_Types].xml', pkg.contentTypes()], ...pkg.files])
}

export async function exportPptx(pres: Presentation, title: string, kind: PptxKind = 'pptx'): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const parts = await buildPptxParts(pres, title, JSZip, kind)
  const zip = new JSZip()
  // [Content_Types].xml comes first, like other writers, so streaming readers find it immediately.
  for (const [path, data] of parts) zip.file(path, data)
  return zip.generateAsync({ type: 'blob', mimeType: PPTX_KIND_MIME[kind], compression: 'DEFLATE' })
}

export { emu, escXml }

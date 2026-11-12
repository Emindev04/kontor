import {
  AlignmentType, BorderStyle, ColumnBreak, SectionType, VerticalAlignSection, LineNumberRestartFormat, EndnoteReferenceRun, FootnoteReferenceRun, CommentRangeEnd, CommentRangeStart, CommentReference, DeletedTextRun, Document, InsertedTextRun, ExternalHyperlink, Footer, Header, HeadingLevel, ImageRun, LeaderType, LevelFormat,
  LineRuleType, NumberFormat, Packer, PageBorderDisplay, PageBorderOffsetFrom, PageBreak, PageNumber, PageOrientation, Paragraph,
  ShadingType, Tab, TabStopType, Table, TableCell, TableRow, TextRun, UnderlineType, VerticalAlign, WidthType,
  type IBorderOptions, type IParagraphOptions, type IRunOptions, type ParagraphChild,
} from 'docx'
import type { JSONContent } from '@tiptap/core'
import { APP_NAME } from '../brand'
import { BULLET_STYLES } from '../editor/ListStyles'
import {
  PARAGRAPH_SPACING, paperDims, paperSize, themeColors, themeFonts, type HeaderFooter, type PageDesign, type PageSetup,
} from '../pageSetup'
import { PX_PER_IN, TWIP_PER_IN } from '../units'
import type { Comments } from '../editor/Review'
import type { NoteSettings, Notes } from '../editor/Notes'
import { Bookmark as DocxBookmark, HeightRule, SimpleField, TextDirection } from 'docx'
import type { BorderPen, CellBorders } from '../editor/TableExtras'

const penBorder = (p: BorderPen | null | undefined): IBorderOptions =>
  !p || p.style === 'none'
    ? { style: BorderStyle.NONE, size: 0, color: 'auto' }
    : { style: p.style === 'dashed' ? BorderStyle.DASHED : p.style === 'dotted' ? BorderStyle.DOTTED : p.style === 'double' ? BorderStyle.DOUBLE : BorderStyle.SINGLE, size: Math.max(2, Math.round(p.width * 8)), color: p.color.replace('#', '') }
import { DIAGRAM_NS, diagramShapes, shapeAttrsOf, type DiagramData } from '../editor/Diagram'
import { chartRun, equationRun, floatingFor, groupRun, shapeOptions, shapeRun, signatureRun, textBoxOptions, textBoxRun, type GroupChild } from './docxObjects'
import { injectTextWatermark, pictureWatermark, textWatermarkXml } from './docxWatermark'
import { imageSize } from './imageSize'
import { pictureFilter } from '../editor/Picture'
import { bibliographyEntry, bibliographyHeading, bibliographySources, citationText, indexLines } from '../editor/Citations'
import { Node as PMNode } from '@tiptap/pm/model'
import { getSchema } from '@tiptap/core'
import { staticExtensions } from '../editor/extensions'

const staticSchema = getSchema(staticExtensions)

/** The document as a node, for lists of what it contains (an empty one if the JSON is not valid). */
function documentNode(doc: JSONContent) {
  try {
    return PMNode.fromJSON(staticSchema, doc)
  } catch {
    return staticSchema.topNodeType.createAndFill()!
  }
}
import { STYLE_SETS, type StyleDefs, type StyleFormat } from '../editor/styleDefs'

/** The document's own styles, by editor id (set while a document is being written). */
let customStyles: StyleDefs = {}
const customId = (id: string) => `K${id.replace(/[^A-Za-z0-9]/g, '')}`

type StyleOptions = { run?: Record<string, unknown>; paragraph?: Record<string, unknown> }

/** A style's options with a style format applied on top. */
function withFormat(base: StyleOptions, f: StyleFormat | undefined): StyleOptions {
  if (!f) return base
  const run: Record<string, unknown> = { ...base.run }
  const paragraph: Record<string, unknown> = { ...base.paragraph }
  if (f.font) run.font = f.font
  if (f.size) run.size = Math.round(f.size * 2)
  if (f.bold != null) run.bold = f.bold
  if (f.italic != null) run.italics = f.italic
  if (f.underline != null) run.underline = f.underline ? { type: UnderlineType.SINGLE } : undefined
  if (f.color) run.color = f.color.replace('#', '')
  if (f.allCaps != null) run.allCaps = f.allCaps
  if (f.smallCaps != null) run.smallCaps = f.smallCaps
  if (f.letterSpacing != null) run.characterSpacing = Math.round(f.letterSpacing * 20)
  if (f.align) paragraph.alignment = ALIGN[f.align]
  const spacing: Record<string, unknown> = { ...(paragraph.spacing as object) }
  if (f.spaceBefore != null) spacing.before = Math.round(f.spaceBefore * 20)
  if (f.spaceAfter != null) spacing.after = Math.round(f.spaceAfter * 20)
  if (f.lineHeight) Object.assign(spacing, { line: Math.round(parseFloat(f.lineHeight) * 240), lineRule: LineRuleType.AUTO })
  paragraph.spacing = spacing
  if (f.indentLeft != null || f.indentFirstLine != null) paragraph.indent = { ...(paragraph.indent as object), ...(f.indentLeft != null ? { left: twip(f.indentLeft) } : {}), ...(f.indentFirstLine ? { firstLine: twip(f.indentFirstLine) } : {}) }
  if (f.borderBottom) paragraph.border = { bottom: { style: BorderStyle.SINGLE, size: 8, color: f.borderBottom.replace('#', ''), space: 1 } }
  if (f.shading) paragraph.shading = { type: ShadingType.CLEAR, fill: f.shading.replace('#', ''), color: 'auto' }
  return { run, paragraph }
}

// Converts the editor document (ProseMirror JSON) into a real .docx file.

const LIST_INDENT = 720
const twip = (inches: number) => Math.round(inches * TWIP_PER_IN)

type Block = Paragraph | Table
type Ctx = {
  listInstance: number
  contentWidthTwips: number
  contentWidthPx: number
  title: string
  numbering: Map<string, { format: (typeof LevelFormat)[keyof typeof LevelFormat]; text: (level: number) => string; start?: number }>
  /** Run formatting applied to text that does not set it itself (table style header rows). */
  runDefaults?: Partial<IRunOptions>
  comments: Comments
  /** Numeric ids of exported comment threads and their replies. */
  commentIds: Map<string, number[]>
  openComments: Set<string>
  revisionId: number
  notes: Notes
  /** The document being written (bibliographies and indexes list what it contains). */
  doc: PMNode
  /** Numeric ids of exported footnotes and endnotes, in order of their references. */
  noteIds: { footnote: Map<string, number>; endnote: Map<string, number> }
  /** Current texts of cross-references ("target|show"), written as the fields' results. */
  crossRefs: Record<string, string>
  /** Grouped objects by group id (in document order); a group is written once, at its first object. */
  groups: Map<string, JSONContent[]>
  writtenGroups: Set<string>
  /** Diagrams written as shape groups, kept with their outline so they open as diagrams again. */
  diagrams: { name: string; data: unknown }[]
}

/** A diagram: its shapes as one drawing group named after the diagram's entry in the custom XML part. */
function diagramGroup(a: Record<string, unknown>, ctx: Ctx) {
  const data = a.data as DiagramData
  const w = Number(a.width) || 576
  const h = Number(a.height) || 320
  const name = `Kontor Diagram ${ctx.diagrams.length + 1}`
  ctx.diagrams.push({ name, data })
  const children: GroupChild[] = diagramShapes(data, w, h).map((s) => ({ options: shapeOptions({ ...shapeAttrsOf(s), opacity: s.opacity }), x: s.x, y: s.y }))
  return groupRun(children, { ...a, name })
}

const GROUPABLE = new Set(['shape', 'image', 'textBox'])

function collectGroups(node: JSONContent, groups: Map<string, JSONContent[]>) {
  const id = node.attrs?.groupId as string | undefined
  if (id && GROUPABLE.has(node.type ?? '')) groups.set(id, [...(groups.get(id) ?? []), node])
  for (const c of node.content ?? []) collectGroups(c, groups)
  return groups
}

const isGrouped = (n: JSONContent, ctx: Ctx) => GROUPABLE.has(n.type ?? '') && (ctx.groups.get(n.attrs?.groupId)?.length ?? 0) > 1

/** The drawing group for a grouped object: written at its first object, nothing for the others. */
async function groupFor(n: JSONContent, ctx: Ctx): Promise<ParagraphChild | null | undefined> {
  const id = n.attrs?.groupId as string | undefined
  const members = id ? ctx.groups.get(id) : undefined
  if (!id || !members || members.length < 2) return undefined
  if (ctx.writtenGroups.has(id)) return null
  ctx.writtenGroups.add(id)
  const children: GroupChild[] = []
  for (const m of members) {
    const a = m.attrs ?? {}
    const x = Number(a.groupX) || 0
    const y = Number(a.groupY) || 0
    if (m.type === 'shape') children.push({ options: shapeOptions(a), x, y })
    else if (m.type === 'textBox') {
      const inner = (await blocks(m.content, ctx)).filter((b): b is Paragraph => b instanceof Paragraph)
      children.push({ options: textBoxOptions(a, inner.length ? inner : [new Paragraph({})]), x, y })
    } else if (m.type === 'image') {
      const pic = await imagePayload(a, ctx)
      if (pic) children.push({ options: { type: 'picture', image: { type: pic.type, data: pic.data }, transformation: pic.transformation }, x, y })
    }
  }
  const first = members[0].attrs ?? {}
  const anchor = { ...first, offsetX: (Number(first.offsetX) || 0) - (Number(first.groupX) || 0), offsetY: (Number(first.offsetY) || 0) - (Number(first.groupY) || 0) }
  return groupRun(children, anchor) as unknown as ParagraphChild
}

/** Numeric ids (thread first, then its replies) for a comment thread. */
function commentNumbers(ctx: Ctx, id: string) {
  let ids = ctx.commentIds.get(id)
  if (!ids) {
    const base = [...ctx.commentIds.values()].reduce((n, list) => n + list.length, 0)
    ids = Array.from({ length: 1 + (ctx.comments[id]?.replies.length ?? 0) }, (_, i) => base + i)
    ctx.commentIds.set(id, ids)
  }
  return ids
}

/** Comment range starts/ends between runs, so anchors may span runs and paragraphs. */
function commentBoundaries(ctx: Ctx, marks: JSONContent['marks'] = []): ParagraphChild[] {
  const here = new Set(marks.filter((m) => m.type === 'comment' && ctx.comments[m.attrs?.id]).map((m) => m.attrs!.id as string))
  const out: ParagraphChild[] = []
  for (const id of [...ctx.openComments]) {
    if (here.has(id)) continue
    ctx.openComments.delete(id)
    for (const n of commentNumbers(ctx, id)) out.push(new CommentRangeEnd(n), new TextRun({ children: [new CommentReference(n)] }))
  }
  for (const id of here) {
    if (ctx.openComments.has(id)) continue
    ctx.openComments.add(id)
    for (const n of commentNumbers(ctx, id)) out.push(new CommentRangeStart(n))
  }
  return out
}

const HEADINGS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

const PARAGRAPH_STYLE_IDS: Record<string, string> = {
  noSpacing: 'NoSpacing',
  title: 'Title',
  subtitle: 'Subtitle',
  quote: 'Quote',
  intenseQuote: 'IntenseQuote',
  listParagraph: 'ListParagraph',
  caption: 'Caption',
}

const CHAR_STYLE_IDS: Record<string, string> = {
  strong: 'Strong',
  emphasis: 'Emphasis',
  subtleEmphasis: 'SubtleEmphasis',
  intenseEmphasis: 'IntenseEmphasis',
  subtleReference: 'SubtleReference',
  intenseReference: 'IntenseReference',
  bookTitle: 'BookTitle',
}

const UNDERLINES: Record<string, (typeof UnderlineType)[keyof typeof UnderlineType]> = {
  single: UnderlineType.SINGLE,
  double: UnderlineType.DOUBLE,
  thick: UnderlineType.THICK,
  dotted: UnderlineType.DOTTED,
  dashed: UnderlineType.DASH,
  wavy: UnderlineType.WAVE,
  words: UnderlineType.WORDS,
}

// The format only knows fixed highlight colors; other colors are exported as shading.
const HIGHLIGHT_NAMES: Record<string, string> = {
  FFFF00: 'yellow', '00FF00': 'green', '00FFFF': 'cyan', FF00FF: 'magenta', '0000FF': 'blue', FF0000: 'red',
  '000080': 'darkBlue', '008080': 'darkCyan', '008000': 'darkGreen', '800080': 'darkMagenta', '800000': 'darkRed',
  '808000': 'darkYellow', '808080': 'darkGray', C0C0C0: 'lightGray', '000000': 'black',
}

export function toHex(color?: string | null): string | undefined {
  if (!color) return
  const c = color.trim()
  if (c.startsWith('#')) {
    const h = c.slice(1)
    return (h.length === 3 ? [...h].map((x) => x + x).join('') : h.slice(0, 6)).toUpperCase()
  }
  const rgb = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (rgb) return rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
  if (typeof document === 'undefined') return
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return
  ctx.fillStyle = c
  return ctx.fillStyle.startsWith('#') ? ctx.fillStyle.slice(1).toUpperCase() : undefined
}

function halfPoints(size?: string | null) {
  const n = parseFloat(size ?? '')
  if (isNaN(n)) return
  return Math.round((size!.endsWith('px') ? n * 0.75 : n) * 2)
}

const firstFont = (family?: string | null) => family?.split(',')[0].trim().replace(/^["']|["']$/g, '') || undefined

function runOptions(marks: JSONContent['marks'] = []) {
  const o: Record<string, unknown> = {}
  let link: string | undefined
  for (const m of marks) {
    const a = m.attrs ?? {}
    switch (m.type) {
      case 'bold': o.bold = true; break
      case 'italic': o.italics = true; break
      case 'underline': {
        const color = toHex(a.underlineColor)
        o.underline = { type: UNDERLINES[a.underlineStyle] ?? UnderlineType.SINGLE, ...(color ? { color } : {}) }
        break
      }
      case 'strike': o.strike = true; break
      case 'subscript': o.subScript = true; break
      case 'superscript': o.superScript = true; break
      case 'link': link = a.href; break
      case 'charStyle':
        if (CHAR_STYLE_IDS[a.id]) o.style = CHAR_STYLE_IDS[a.id]
        else if (customStyles[a.id]) o.style = customId(a.id)
        break
      case 'highlight': {
        const hex = toHex(a.color) ?? 'FFFF00'
        if (HIGHLIGHT_NAMES[hex]) o.highlight = HIGHLIGHT_NAMES[hex]
        else o.shading = { type: ShadingType.CLEAR, fill: hex, color: 'auto' }
        break
      }
      case 'textStyle': {
        const color = toHex(a.color)
        if (color) o.color = color
        const font = firstFont(a.fontFamily)
        if (font) o.font = font
        const size = halfPoints(a.fontSize)
        if (size) o.size = size
        const bg = toHex(a.backgroundColor)
        if (bg) o.shading = { type: ShadingType.CLEAR, fill: bg, color: 'auto' }
        if (a.smallCaps) o.smallCaps = true
        if (a.allCaps) o.allCaps = true
        if (a.doubleStrike) {
          o.doubleStrike = true
          o.strike = false
        }
        if (a.hidden) o.vanish = true
        if (a.letterSpacing) o.characterSpacing = Math.round(a.letterSpacing * 20)
        if (a.baselineShift) o.position = `${a.baselineShift}pt`
        if (a.scale) o.scale = a.scale
        if (a.kerning) o.kern = Math.round(Number(a.kerning) * 2)
        if (a.textEffect === 'emboss') o.emboss = true
        if (a.textEffect === 'engrave') o.imprint = true
        break
      }
    }
  }
  return { options: o as IRunOptions, link }
}

/** Text with tab characters becomes runs with real tabs. */
function textRun(text: string, options: IRunOptions, extra: Partial<IRunOptions> = {}) {
  if (!text.includes('\t')) return new TextRun({ ...options, ...extra, text })
  const children: (string | Tab)[] = []
  text.split('\t').forEach((part, i) => {
    if (i > 0) children.push(new Tab())
    if (part) children.push(part)
  })
  return new TextRun({ ...options, ...extra, children })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image()
    if (/^https?:/.test(src)) img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => reject(new Error('Picture did not load')), 15000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = (e) => {
      clearTimeout(timer)
      reject(e)
    }
    img.src = src
  })
}

const DIRECT_TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', bmp: 'bmp' }

async function imagePayload(attrs: Record<string, unknown> | undefined, ctx: Ctx) {
  const src = attrs?.src as string | undefined
  if (!src) return
  try {
    const dataUrl = src.match(/^data:image\/(\w+);base64,(.*)$/)
    const crop = ['cropTop', 'cropRight', 'cropBottom', 'cropLeft'].map((k) => Number(attrs?.[k]) || 0)
    const styled = crop.some(Boolean) || !!pictureFilter(attrs ?? {}) || !!attrs?.transparency || !!attrs?.cropShape || !!attrs?.flip
    const direct = !styled && dataUrl && DIRECT_TYPES[dataUrl[1]]
    // PNG, JPEG and GIF data go in as they are; their size is read from the file header.
    const bytes = direct ? Uint8Array.from(atob(dataUrl[2]), (c) => c.charCodeAt(0)) : null
    const natural = (bytes && imageSize(bytes)) || null
    const img = natural ? null : await loadImage(src)
    const nw = natural?.width ?? img!.naturalWidth
    const nh = natural?.height ?? img!.naturalHeight
    let w = (attrs?.width as number) || nw
    let h = (attrs?.height as number) || (attrs?.width ? Math.round(((attrs.width as number) * nh) / nw) : nh)
    if (w > ctx.contentWidthPx) {
      h = Math.round((h * ctx.contentWidthPx) / w)
      w = Math.round(ctx.contentWidthPx)
    }
    let data: Uint8Array
    if (bytes) {
      data = bytes
    } else if (styled && img) {
      // Crop, corrections, color, transparency and flips are baked into the exported picture.
      const [t, r, b, l] = crop
      const sw = img.naturalWidth * (1 - l - r)
      const sh = img.naturalHeight * (1 - t - b)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw))
      canvas.height = Math.max(1, Math.round(sh))
      const g = canvas.getContext('2d')!
      g.filter = pictureFilter(attrs ?? {}) || 'none'
      g.globalAlpha = 1 - (Number(attrs?.transparency) || 0)
      const flip = String(attrs?.flip ?? '')
      g.translate(flip.includes('h') ? canvas.width : 0, flip.includes('v') ? canvas.height : 0)
      g.scale(flip.includes('h') ? -1 : 1, flip.includes('v') ? -1 : 1)
      if (attrs?.cropShape === 'ellipse') {
        g.beginPath()
        g.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2)
        g.clip()
      }
      g.drawImage(img, img.naturalWidth * l, img.naturalHeight * t, sw, sh, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
      if (!blob) return
      data = new Uint8Array(await blob.arrayBuffer())
    } else if (img) {
      // SVG, WebP and other formats are embedded as PNG via a canvas.
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) return
      data = new Uint8Array(await blob.arrayBuffer())
    } else return
    const rotation = (attrs?.rotation as number) || 0
    const flip = (attrs?.flip as string | null) ?? ''
    return {
      type: (direct || 'png') as 'png' | 'jpg' | 'gif',
      data,
      transformation: {
        width: w,
        height: h,
        ...(rotation ? { rotation } : {}),
        ...(flip ? { flip: { horizontal: flip.includes('h'), vertical: flip.includes('v') } } : {}),
      },
    }
  } catch {
    return // Pictures from servers without CORS cannot be embedded.
  }
}

async function imageRun(attrs: Record<string, unknown> | undefined, ctx: Ctx) {
  const pic = await imagePayload(attrs, ctx)
  if (!pic) return
  const floating = floatingFor(attrs ?? {})
  return new ImageRun({
    ...pic,
    ...(floating ? { floating } : {}),
    altText: attrs?.alt ? { name: String(attrs.alt), description: String(attrs.alt), title: String(attrs.alt) } : undefined,
  })
}

async function inline(nodes: JSONContent[] = [], ctx: Ctx): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = []
  for (const n of nodes) {
    if (n.type === 'text') {
      out.push(...commentBoundaries(ctx, n.marks))
      const { options: plain, link } = runOptions(n.marks)
      // A tracked formatting change writes the run's earlier formatting next to the current one.
      const fmt = n.marks?.find((m) => m.type === 'formatChange')
      let options = plain
      if (fmt) {
        let old: JSONContent['marks'] = []
        try {
          old = JSON.parse(String(fmt.attrs?.old ?? '[]'))
        } catch {
          old = []
        }
        options = { ...plain, revision: { ...ctx.runDefaults, ...runOptions(old).options, id: ctx.revisionId++, author: String(fmt.attrs?.author || 'Author'), date: String(fmt.attrs?.date || new Date().toISOString()) } } as typeof plain
      }
      const revision = n.marks?.find((m) => m.type === 'insertion' || m.type === 'deletion')
      let run: ParagraphChild
      if (revision) {
        const change = { id: ctx.revisionId++, author: revision.attrs?.author || 'Author', date: revision.attrs?.date || new Date().toISOString() }
        const runOpts = { ...ctx.runDefaults, ...options, ...(link ? { style: 'Hyperlink' } : {}), text: n.text ?? '' }
        run = revision.type === 'insertion' ? new InsertedTextRun({ ...runOpts, ...change }) : new DeletedTextRun({ ...runOpts, ...change })
      } else run = textRun(n.text ?? '', { ...ctx.runDefaults, ...options }, link ? { style: 'Hyperlink' } : {})
      out.push(link ? new ExternalHyperlink({ link, children: [run as TextRun] }) : run)
    } else if (n.type === 'hardBreak') {
      out.push(new TextRun({ text: '', break: 1 }))
    } else if (isGrouped(n, ctx)) {
      const group = await groupFor(n, ctx)
      if (group) out.push(group)
    } else if (n.type === 'image') {
      const img = await imageRun(n.attrs, ctx)
      if (img) out.push(img)
    } else if (n.type === 'field') {
      const { options } = runOptions(n.marks)
      const kind = n.attrs?.kind
      if (kind === 'page') out.push(new TextRun({ ...options, children: [PageNumber.CURRENT] }))
      else if (kind === 'numPages') out.push(new TextRun({ ...options, children: [PageNumber.TOTAL_PAGES] }))
      else if (kind === 'date') out.push(new TextRun({ ...options, text: new Date().toLocaleDateString('en-US') }))
      else if (kind === 'time') out.push(new TextRun({ ...options, text: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }))
      else if (kind === 'title') out.push(new TextRun({ ...options, text: ctx.title }))
    } else if (n.type === 'shape') {
      out.push(shapeRun(n.attrs ?? {}) as unknown as ParagraphChild)
    } else if (n.type === 'onlineVideo') {
      // Documents can't play web videos everywhere: the video is written as a link to it.
      const url = String(n.attrs?.url ?? '')
      if (url) out.push(new ExternalHyperlink({ link: url, children: [new TextRun({ text: `▶ Online video: ${url}`, style: 'Hyperlink' })] }))
    } else if (n.type === 'diagram') {
      out.push(diagramGroup(n.attrs ?? {}, ctx) as unknown as ParagraphChild)
    } else if (n.type === 'chart') {
      const run = chartRun(n.attrs ?? {})
      if (run) out.push(run as unknown as ParagraphChild)
    } else if (n.type === 'equation') {
      out.push(equationRun(String(n.attrs?.latex ?? '')))
    } else if (n.type === 'signatureLine') {
      const run = await signatureRun(n.attrs ?? {})
      if (run) out.push(run)
    } else if (n.type === 'citation') {
      out.push(new TextRun(citationText(String(n.attrs?.sourceId ?? ''), String(n.attrs?.pages ?? ''))))
    } else if (n.type === 'indexEntry') {
      const term = String(n.attrs?.term ?? '').replace(/"/g, '')
      if (term) out.push(new SimpleField(`XE "${term}${n.attrs?.sub ? `:${String(n.attrs.sub).replace(/"/g, '')}` : ''}"`))
    } else if (n.type === 'bookmark') {
      if (n.attrs?.name) out.push(new DocxBookmark({ id: String(n.attrs.name), children: [] }) as unknown as ParagraphChild)
    } else if (n.type === 'crossRef') {
      const a = n.attrs ?? {}
      const instr = a.refType === 'footnote' || a.refType === 'endnote' ? null : `${a.show === 'page' ? 'PAGEREF' : 'REF'} ${a.target} \\h${a.show === 'aboveBelow' ? ' \\p' : a.show === 'number' ? ' \\n' : ''}`
      const cached = ctx.crossRefs[`${a.target}|${a.show}`] ?? String(a.target)
      out.push(instr ? new SimpleField(instr, cached) : new TextRun(cached))
    } else if (n.type === 'noteRef') {
      const id = n.attrs?.id as string
      const kind = n.attrs?.kind === 'endnote' ? 'endnote' : 'footnote'
      if (!ctx.notes[id]) continue
      const ids = ctx.noteIds[kind]
      if (!ids.has(id)) ids.set(id, ids.size + 1)
      out.push(kind === 'endnote' ? new EndnoteReferenceRun(ids.get(id)!) : new FootnoteReferenceRun(ids.get(id)!))
    } else if (n.type === 'mergeField') {
      const { options } = runOptions(n.marks)
      out.push(new TextRun({ ...options, text: `«${n.attrs?.name ?? ''}»` }))
    }
  }
  return out
}

function lineSpacing(value: string | null | undefined) {
  if (!value) return {}
  if (value.startsWith('exact:')) return { line: Math.round(parseFloat(value.slice(6)) * 20), lineRule: LineRuleType.EXACT }
  if (value.startsWith('atLeast:')) return { line: Math.round(parseFloat(value.slice(8)) * 20), lineRule: LineRuleType.AT_LEAST }
  const n = parseFloat(value)
  return isNaN(n) ? {} : { line: Math.round(n * 240), lineRule: LineRuleType.AUTO }
}

const border: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: 'auto', space: 1 }

function paraProps(n: JSONContent): Partial<IParagraphOptions> {
  const a = n.attrs ?? {}
  const p: Record<string, unknown> = {}
  if (ALIGN[a.textAlign]) p.alignment = ALIGN[a.textAlign]
  const spacing: Record<string, unknown> = { ...lineSpacing(a.lineHeight) }
  if (a.spaceBefore != null) spacing.before = Math.round(a.spaceBefore * 20)
  if (a.spaceAfter != null) spacing.after = Math.round(a.spaceAfter * 20)
  if (Object.keys(spacing).length) p.spacing = spacing
  const indent: Record<string, number> = {}
  if (a.indentLeft) indent.left = twip(a.indentLeft)
  if (a.indentRight) indent.right = twip(a.indentRight)
  if (a.indentFirstLine > 0) indent.firstLine = twip(a.indentFirstLine)
  if (a.indentFirstLine < 0) indent.hanging = twip(-a.indentFirstLine)
  if (Object.keys(indent).length) p.indent = indent
  if (Array.isArray(a.tabStops) && a.tabStops.length)
    p.tabStops = (a.tabStops as { pos: number; align: string; leader: string }[]).map((t) => ({
      type: { left: TabStopType.LEFT, center: TabStopType.CENTER, right: TabStopType.RIGHT, decimal: TabStopType.DECIMAL, bar: TabStopType.BAR }[t.align] ?? TabStopType.LEFT,
      position: twip(t.pos),
      ...(t.leader !== 'none' ? { leader: { dot: LeaderType.DOT, dash: LeaderType.HYPHEN, underline: LeaderType.UNDERSCORE }[t.leader] } : {}),
    }))
  if (a.keepNext != null) p.keepNext = a.keepNext
  if (a.keepLines) p.keepLines = true
  if (a.pageBreakBefore) p.pageBreakBefore = true
  if (a.widowControl === false) p.widowControl = false
  if (a.dir === 'rtl') p.bidirectional = true
  if (a.pStyle && PARAGRAPH_STYLE_IDS[a.pStyle]) p.style = PARAGRAPH_STYLE_IDS[a.pStyle]
  else if (a.pStyle && customStyles[a.pStyle]) p.style = customId(a.pStyle)
  const shading = toHex(a.shading)
  if (shading) p.shading = { type: ShadingType.CLEAR, fill: shading, color: 'auto' }
  if (a.borders) {
    const sides = String(a.borders)
    p.border = {
      ...(sides.includes('t') ? { top: border } : {}),
      ...(sides.includes('b') ? { bottom: border } : {}),
      ...(sides.includes('l') ? { left: border } : {}),
      ...(sides.includes('r') ? { right: border } : {}),
    }
  }
  return p as Partial<IParagraphOptions>
}

function listReference(n: JSONContent, ctx: Ctx) {
  const style = (n.attrs?.listStyle as string | null) ?? (n.type === 'orderedList' ? 'decimal' : 'disc')
  const start = n.type === 'orderedList' ? ((n.attrs?.start as number) ?? 1) : 1
  const key = `${n.type === 'orderedList' ? 'num' : 'bullet'}-${style}${start !== 1 ? `-${start}` : ''}`
  if (!ctx.numbering.has(key)) {
    if (n.type === 'bulletList') {
      const symbol = BULLET_STYLES.find((b) => b.id === style)?.symbol ?? '•'
      ctx.numbering.set(key, { format: LevelFormat.BULLET, text: (level) => (level === 0 ? symbol : ['◦', '▪', '•'][level % 3]) })
    } else {
      const formats: Record<string, [(typeof LevelFormat)[keyof typeof LevelFormat], string]> = {
        decimal: [LevelFormat.DECIMAL, '.'],
        'decimal-paren': [LevelFormat.DECIMAL, ')'],
        'upper-roman': [LevelFormat.UPPER_ROMAN, '.'],
        'upper-alpha': [LevelFormat.UPPER_LETTER, '.'],
        'lower-alpha': [LevelFormat.LOWER_LETTER, '.'],
        'lower-alpha-paren': [LevelFormat.LOWER_LETTER, ')'],
        'lower-roman': [LevelFormat.LOWER_ROMAN, '.'],
        legal: [LevelFormat.DECIMAL, '.'],
        outline: [LevelFormat.UPPER_ROMAN, '.'],
      }
      const [format, suffix] = formats[style] ?? formats.decimal
      ctx.numbering.set(key, {
        format,
        start,
        text: (level) => (style === 'legal' ? Array.from({ length: level + 1 }, (_, i) => `%${i + 1}`).join('.') + '.' : level === 0 ? `%1${suffix}` : `%${level + 1}.`),
      })
    }
  }
  return key
}

async function list(n: JSONContent, ctx: Ctx, level: number, instance: number): Promise<Block[]> {
  const reference = listReference(n, ctx)
  const out: Block[] = []
  for (const item of n.content ?? []) {
    let first = true
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...(await list(child, ctx, Math.min(level + 1, 8), instance)))
      } else if ((child.type === 'paragraph' || child.type === 'heading') && first) {
        const { indent: _ignored, ...props } = paraProps(child)
        out.push(new Paragraph({ ...props, numbering: { reference, level, instance }, children: await inline(child.content, ctx) }))
        first = false
      } else {
        out.push(...(await blocks([child], ctx, { indent: { left: LIST_INDENT * (level + 1) } })))
      }
    }
  }
  return out
}

type TableLook = { borders: 'all' | 'none' | 'outside' | 'horizontal'; color: string; header?: string; headerText?: string; band?: string }

function tableLook(style: string): TableLook {
  switch (style) {
    case 'plain': return { borders: 'none', color: 'auto' }
    case 'outside': return { borders: 'outside', color: '000000' }
    case 'light': return { borders: 'all', color: 'BFBFBF' }
    case 'lightList': return { borders: 'horizontal', color: '7F7F7F', header: undefined }
    case 'accent1': return { borders: 'all', color: '8EAADB', header: '4472C4', headerText: 'FFFFFF', band: 'D9E2F3' }
    case 'accent2': return { borders: 'all', color: 'F4B083', header: 'ED7D31', headerText: 'FFFFFF', band: 'FBE4D5' }
    case 'accent3': return { borders: 'all', color: 'A8D08D', header: '70AD47', headerText: 'FFFFFF', band: 'E2EFD9' }
    case 'accent4': return { borders: 'all', color: 'B4A7D6', header: '7F5FA8', headerText: 'FFFFFF', band: 'E5DFEC' }
    case 'dark': return { borders: 'all', color: '404040', header: '262626', headerText: 'FFFFFF', band: 'F2F2F2' }
    default: return { borders: 'all', color: '000000' }
  }
}

async function table(n: JSONContent, ctx: Ctx): Promise<Table> {
  const rows = n.content ?? []
  const attrs = n.attrs ?? {}
  const look = tableLook(attrs.tableStyle ?? 'grid')
  const columns = Math.max(1, ...rows.map((r) => (r.content ?? []).reduce((sum, c) => sum + (c.attrs?.colspan ?? 1), 0)))
  // Column widths: the editor's own widths if the user resized columns, otherwise equal widths.
  const firstRowWidths: number[] = []
  for (const cell of rows[0]?.content ?? []) {
    const span = cell.attrs?.colspan ?? 1
    for (let i = 0; i < span; i++) firstRowWidths.push(cell.attrs?.colwidth?.[i] ?? 0)
  }
  const px = firstRowWidths.every((w) => w > 0) ? firstRowWidths : null
  const totalPx = px ? px.reduce((a, b) => a + b, 0) : 0
  const widths = px ? px.map((w) => Math.round((w / totalPx) * Math.min(ctx.contentWidthTwips, twip(totalPx / PX_PER_IN)))) : Array(columns).fill(Math.floor(ctx.contentWidthTwips / columns))
  const line = (on: boolean): IBorderOptions => (on ? { style: BorderStyle.SINGLE, size: 4, color: look.color } : { style: BorderStyle.NONE, size: 0, color: 'auto' })
  const all = look.borders === 'all'
  const tableRows: TableRow[] = []
  for (const [r, row] of rows.entries()) {
    const cells: TableCell[] = []
    let col = 0
    const isHeader = r === 0 && attrs.headerRow !== false && !!look.header
    const isTotal = r === rows.length - 1 && attrs.totalRow
    const banded = attrs.bandedRows && look.band && r > 0 && (r - (attrs.headerRow !== false ? 1 : 0)) % 2 === 0
    for (const cell of row.content ?? []) {
      const span = cell.attrs?.colspan ?? 1
      const fill = toHex(cell.attrs?.backgroundColor) ?? (isHeader ? look.header : banded ? look.band : undefined)
      // Header and total rows of the styled tables use bold (and white text on dark header fills).
      const runDefaults = ctx.runDefaults
      if (isHeader || isTotal || (attrs.firstColumn && col === 0) || (attrs.lastColumn && col + span >= columns))
        ctx.runDefaults = { bold: true, ...(isHeader && look.headerText ? { color: look.headerText } : {}) }
      const children = await blocks(cell.content, ctx)
      ctx.runDefaults = runDefaults
      cells.push(
        new TableCell({
          children: children.some((c) => c instanceof Paragraph) ? children : [...children, new Paragraph({})],
          columnSpan: span > 1 ? span : undefined,
          rowSpan: (cell.attrs?.rowspan ?? 1) > 1 ? cell.attrs?.rowspan : undefined,
          width: { size: widths.slice(col, col + span).reduce((a, b) => a + b, 0), type: WidthType.DXA },
          shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
          verticalAlign: cell.attrs?.verticalAlign === 'middle' ? VerticalAlign.CENTER : cell.attrs?.verticalAlign === 'bottom' ? VerticalAlign.BOTTOM : undefined,
          borders: (() => {
            const own = (cell.attrs?.borders ?? {}) as CellBorders
            const base = {
              top: line(all || look.borders === 'horizontal' || (look.borders === 'outside' && r === 0) || !!isTotal),
              bottom: line(all || look.borders === 'horizontal' || (look.borders === 'outside' && r === rows.length - 1)),
              left: line(all || (look.borders === 'outside' && col === 0)),
              right: line(all || (look.borders === 'outside' && col + span >= columns)),
            }
            for (const side of ['top', 'bottom', 'left', 'right'] as const) if (side in own) base[side] = penBorder(own[side])
            return base
          })(),
          ...(cell.attrs?.textDirection === 'btLr' ? { textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT } : cell.attrs?.textDirection === 'tbRl' ? { textDirection: TextDirection.TOP_TO_BOTTOM_RIGHT_TO_LEFT } : {}),
        }),
      )
      col += span
    }
    tableRows.push(
      new TableRow({
        children: cells,
        tableHeader: (r === 0 && attrs.repeatHeader) || undefined,
        cantSplit: row.attrs?.cantSplit || undefined,
        ...(row.attrs?.rowHeight ? { height: { value: twip(row.attrs.rowHeight / PX_PER_IN), rule: HeightRule.ATLEAST } } : {}),
      }),
    )
  }
  return new Table({
    rows: tableRows,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    alignment: attrs.tableAlign === 'center' ? AlignmentType.CENTER : attrs.tableAlign === 'right' ? AlignmentType.RIGHT : undefined,
    ...(attrs.cellPadding != null ? { margins: { left: twip(attrs.cellPadding), right: twip(attrs.cellPadding) } } : {}),
  })
}

async function blocks(nodes: JSONContent[] = [], ctx: Ctx, extra: Partial<IParagraphOptions> = {}): Promise<Block[]> {
  const out: Block[] = []
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph': {
        const props = paraProps(n)
        const dropCap = n.attrs?.dropCap as string | null
        if (dropCap && n.content?.[0]?.type === 'text' && n.content[0].text) {
          // Drop cap: the first letter goes into its own framed paragraph like the original writes it.
          const [first, ...rest] = n.content
          const letter = first.text!.slice(0, 1)
          const remainder = first.text!.slice(1)
          const { options } = runOptions(first.marks)
          out.push(
            new Paragraph({
              frame: { type: 'alignment', alignment: { x: 'left', y: 'top' }, anchor: { horizontal: 'text', vertical: 'text' }, width: 0, height: 0, dropCap: dropCap === 'margin' ? 'margin' : 'drop', lines: 3, wrap: 'around' } as never,
              spacing: { line: 240 * 2.6, lineRule: LineRuleType.EXACT },
              children: [new TextRun({ ...options, text: letter, size: 72 * 2 })],
            }),
          )
          out.push(new Paragraph({ ...props, ...extra, children: await inline([...(remainder ? [{ ...first, text: remainder }] : []), ...rest], ctx) }))
          break
        }
        out.push(new Paragraph({ ...props, ...extra, children: await inline(n.content, ctx) }))
        break
      }
      case 'heading':
        out.push(new Paragraph({ ...paraProps(n), heading: HEADINGS[(n.attrs?.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6], children: await inline(n.content, ctx) }))
        break
      case 'blockquote':
        out.push(...(await blocks(n.content, ctx, { ...extra, style: 'Quote' })))
        break
      case 'bulletList':
      case 'orderedList':
        out.push(...(await list(n, ctx, 0, ++ctx.listInstance)))
        break
      case 'table':
        out.push(await table(n, ctx))
        break
      case 'horizontalRule':
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'auto', space: 1 } } }))
        break
      case 'pageBreak':
        out.push(new Paragraph({ children: [new PageBreak()] }))
        break
      case 'columnBreak':
        out.push(new Paragraph({ children: [new ColumnBreak()] }))
        break
      case 'textBox': {
        if (isGrouped(n, ctx)) {
          const group = await groupFor(n, ctx)
          if (group) out.push(new Paragraph({ children: [group] }))
          break
        }
        // The box's text color applies to text that has no color of its own.
        const color = n.attrs?.textColor as string | null | undefined
        const colored = (nodes: JSONContent[] = []): JSONContent[] =>
          nodes.map((c) =>
            c.type === 'text' && color && !c.marks?.some((m) => m.type === 'textStyle' && m.attrs?.color)
              ? { ...c, marks: [...(c.marks ?? []).filter((m) => m.type !== 'textStyle'), { type: 'textStyle', attrs: { ...(c.marks?.find((m) => m.type === 'textStyle')?.attrs ?? {}), color } }] }
              : c.content
                ? { ...c, content: colored(c.content) }
                : c,
          )
        const inner = (await blocks(colored(n.content), ctx)).filter((b): b is Paragraph => b instanceof Paragraph)
        out.push(new Paragraph({ children: [textBoxRun(n.attrs ?? {}, inner.length ? inner : [new Paragraph({})]) as unknown as ParagraphChild] }))
        break
      }
      case 'columns':
      case 'sectionBreak':
        // Top-level ones become sections; nested ones (rare) just keep their content.
        out.push(...(await blocks(n.content, ctx, extra)))
        break
      case 'bibliography': {
        // Written as text, like an updated bibliography field.
        if (n.attrs?.heading !== null) out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(String(n.attrs?.heading || bibliographyHeading()))] }))
        for (const source of bibliographySources(ctx.doc)) {
          const e = bibliographyEntry(source)
          out.push(new Paragraph({ indent: { left: 720, hanging: 720 }, children: [new TextRun(e.before), ...(e.italic ? [new TextRun({ text: e.italic, italics: true })] : []), new TextRun(e.after)] }))
        }
        break
      }
      case 'documentIndex': {
        for (const line of indexLines(ctx.doc)) out.push(new Paragraph({ indent: line.level ? { left: 288 } : undefined, spacing: { after: 0 }, children: [new TextRun(`${line.text}${line.pages ? `, ${line.pages}` : ''}`)] }))
        break
      }
      case 'tableOfContents': {
        out.push(new Paragraph({ style: 'TOCHeading', children: [new TextRun('Contents')] }))
        for (const e of (n.attrs?.entries ?? []) as { text: string; level: number; page: string }[]) {
          out.push(
            new Paragraph({
              style: `TOC${Math.min(e.level, 9)}`,
              tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidthTwips, leader: LeaderType.DOT }],
              children: [new TextRun({ children: [e.text, new Tab(), e.page] })],
            }),
          )
        }
        break
      }
    }
  }
  return out
}

const BULLETS_INDENT = (level: number) => ({ paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: 360 } } })

export type ExportInput = {
  doc: JSONContent
  setup: PageSetup
  design: PageDesign
  headerFooter: HeaderFooter
  title: string
  comments?: Comments
  trackChanges?: boolean
  notes?: Notes
  noteSettings?: NoteSettings
  crossRefs?: Record<string, string>
  styles?: StyleDefs
}

export async function exportDocx({ doc, setup, design, headerFooter, title, comments = {}, trackChanges, notes = {}, crossRefs = {}, styles = {} }: ExportInput): Promise<Blob> {
  customStyles = Object.fromEntries(Object.entries(styles).filter(([, d]) => d.custom))
  // Formats of the built-in styles: the style set first, then the document's own changes.
  const setFormats = STYLE_SETS.find((x) => x.id === design.styleSet)?.styles ?? {}
  const fmt = (id: string): StyleFormat | undefined => (setFormats[id] || styles[id] ? { ...setFormats[id], ...(styles[id] && !styles[id].custom ? styles[id].format : {}) } : undefined)
  const { w } = paperDims(setup)
  const { margins } = setup
  const contentIn = w - margins.left - margins.right
  const ctx: Ctx = {
    listInstance: 0,
    contentWidthTwips: twip(contentIn),
    contentWidthPx: contentIn * PX_PER_IN,
    title,
    numbering: new Map(),
    comments,
    commentIds: new Map(),
    openComments: new Set(),
    revisionId: 1,
    notes,
    noteIds: { footnote: new Map(), endnote: new Map() },
    crossRefs,
    doc: documentNode(doc),
    groups: collectGroups(doc, new Map()),
    writtenGroups: new Set(),
    diagrams: [],
  }
  const colors = themeColors(design)
  const fonts = themeFonts(design)
  const accent = colors.accent.slice(1)
  const heading = colors.heading.slice(1)
  const headingDark = colors.headingDark.slice(1)
  const spacing = PARAGRAPH_SPACING[design.paragraphSpacing] ?? PARAGRAPH_SPACING.default

  // Section breaks and column blocks split the body into sections, like the original stores them.
  type Segment = { type: string; columns: Record<string, unknown> | null; nodes: JSONContent[] }
  const segments: Segment[] = [{ type: 'nextPage', columns: null, nodes: [] }]
  for (const n of doc.content ?? []) {
    if (n.type === 'sectionBreak') segments.push({ type: n.attrs?.kind ?? 'nextPage', columns: null, nodes: [] })
    else if (n.type === 'columns') {
      // Columns right after a section break (or at the start) belong to that section and keep the way
      // it starts (e.g. on the next page).
      const last = segments[segments.length - 1]
      if (!last.nodes.length) Object.assign(last, { columns: n.attrs ?? {}, nodes: n.content ?? [] })
      else segments.push({ type: 'continuous', columns: n.attrs ?? {}, nodes: n.content ?? [] })
      segments.push({ type: 'continuous', columns: null, nodes: [] })
    } else segments[segments.length - 1].nodes.push(n)
  }
  const used = segments.filter((seg, i) => i === 0 || seg.nodes.length)
  const sectionChildren: Block[][] = []
  for (const seg of used) sectionChildren.push(await blocks(seg.nodes, ctx))
  const children = sectionChildren[sectionChildren.length - 1]
  const noteParts = async (kind: 'footnote' | 'endnote') => {
    const out: Record<string, { children: Paragraph[] }> = {}
    for (const [id, num] of ctx.noteIds[kind]) {
      const paras = (await blocks(notes[id]?.content, ctx)).filter((b): b is Paragraph => b instanceof Paragraph)
      out[String(num)] = { children: paras.length ? paras : [new Paragraph({})] }
    }
    return out
  }
  const footnotes = await noteParts('footnote')
  const endnotes = await noteParts('endnote')
  // Comments still open at the end of the document close in a last paragraph.
  const closing = commentBoundaries(ctx, [])
  if (closing.length) children.push(new Paragraph({ children: closing }))
  const commentChildren = [...ctx.commentIds.entries()].flatMap(([id, numbers]) => {
    const t = comments[id]
    const para = (text: string) => text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] }))
    return [
      { id: numbers[0], author: t.author, initials: t.initials, date: new Date(t.date), resolved: t.resolved || undefined, children: para(t.text) },
      ...t.replies.map((r, i) => ({ id: numbers[i + 1], parentId: numbers[0], author: r.author, initials: r.initials, date: new Date(r.date), children: para(r.text) })),
    ]
  })
  const hf = async (content: JSONContent | null) => (content ? await blocks(content.content, ctx) : null)
  // Watermarks are part of every header, so a watermark needs a header on every kind of page.
  const watermark = design.watermark
  const pictureMark = watermark?.image ? await pictureWatermark(watermark, contentIn * PX_PER_IN, (paperDims(setup).h - margins.top - margins.bottom) * PX_PER_IN) : null
  const withMark = (b: Block[] | null) => (watermark ? [...(pictureMark ? [pictureMark] : []), ...(b ?? [new Paragraph({})])] : b)
  // Sequential on purpose: the conversion context carries state (list instances, run defaults).
  const header = withMark(await hf(headerFooter.header))
  const footer = await hf(headerFooter.footer)
  const firstHeader = setup.differentFirstPage ? withMark(await hf(headerFooter.firstHeader)) : null
  const firstFooter = setup.differentFirstPage ? await hf(headerFooter.firstFooter) : null
  const evenHeader = setup.differentOddEven ? withMark(await hf(headerFooter.evenHeader)) : null
  const evenFooter = setup.differentOddEven ? await hf(headerFooter.evenFooter) : null
  const paper = paperSize(setup)
  const pageBorder = design.pageBorder
  const borderStyle = pageBorder
    ? {
        style: { single: BorderStyle.SINGLE, double: BorderStyle.DOUBLE, dotted: BorderStyle.DOTTED, dashed: BorderStyle.DASHED, thick: BorderStyle.THICK }[pageBorder.style],
        size: Math.round(pageBorder.widthPt * 8),
        color: toHex(pageBorder.color) ?? 'auto',
        space: Math.round(pageBorder.offsetPt),
      }
    : null

  const document = new Document({
    creator: APP_NAME,
    title,
    ...(commentChildren.length ? { comments: { children: commentChildren } } : {}),
    ...(trackChanges ? { features: { trackRevisions: true } } : {}),
    ...(Object.keys(footnotes).length ? { footnotes } : {}),
    ...(Object.keys(endnotes).length ? { endnotes } : {}),
    ...(setup.differentOddEven ? { evenAndOddHeaderAndFooters: true } : {}),
    ...(design.hyphenation || design.hyphenationOptions
      ? {
          hyphenation: {
            autoHyphenation: design.hyphenation,
            ...(design.hyphenationOptions
              ? { doNotHyphenateCaps: !design.hyphenationOptions.caps, hyphenationZone: Math.round(design.hyphenationOptions.zone * 1440), ...(design.hyphenationOptions.limit ? { consecutiveHyphenLimit: design.hyphenationOptions.limit } : {}) }
              : {}),
          },
        }
      : {}),
    background: design.pageColor ? { color: toHex(design.pageColor) } : undefined,
    styles: {
      default: {
        document: withFormat(
          {
            run: { font: fonts.body, size: 22 },
            paragraph: { spacing: { before: spacing.before * 20, after: spacing.after * 20, line: Math.round(spacing.line * 240), lineRule: LineRuleType.AUTO } },
          },
          fmt('normal'),
        ),
        heading1: withFormat({ run: { font: fonts.heading, size: 32, color: heading }, paragraph: { spacing: { before: 240, after: 0 }, keepNext: true, keepLines: true } }, fmt('h1')),
        heading2: withFormat({ run: { font: fonts.heading, size: 26, color: heading }, paragraph: { spacing: { before: 40, after: 0 }, keepNext: true, keepLines: true } }, fmt('h2')),
        heading3: withFormat({ run: { font: fonts.heading, size: 24, color: headingDark }, paragraph: { spacing: { before: 40, after: 0 }, keepNext: true, keepLines: true } }, fmt('h3')),
        heading4: withFormat({ run: { font: fonts.heading, size: 22, color: heading, italics: true }, paragraph: { spacing: { before: 40, after: 0 }, keepNext: true } }, fmt('h4')),
        heading5: withFormat({ run: { font: fonts.heading, size: 22, color: heading }, paragraph: { spacing: { before: 40, after: 0 }, keepNext: true } }, fmt('h5')),
        heading6: withFormat({ run: { font: fonts.heading, size: 22, color: headingDark }, paragraph: { spacing: { before: 40, after: 0 }, keepNext: true } }, fmt('h6')),
        title: withFormat({ run: { font: fonts.heading, size: 56, characterSpacing: -10 }, paragraph: { spacing: { after: 0, line: 240, lineRule: LineRuleType.AUTO } } }, fmt('title')),
      },
      paragraphStyles: [
        { id: 'NoSpacing', name: 'No Spacing', basedOn: 'Normal', quickFormat: true, paragraph: { spacing: { after: 0, line: 240, lineRule: LineRuleType.AUTO } } },
        { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { color: '5A5A5A', characterSpacing: 15 }, paragraph: { spacing: { after: 160 } } },
        { id: 'Quote', name: 'Quote', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { italics: true, color: '404040' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 200, after: 160 }, indent: { left: 864, right: 864 } } },
        {
          id: 'IntenseQuote',
          name: 'Intense Quote',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { italics: true, color: accent },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 360, after: 360 },
            indent: { left: 864, right: 864 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: accent, space: 10 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: accent, space: 10 } },
          },
        },
        { id: 'ListParagraph', name: 'List Paragraph', basedOn: 'Normal', quickFormat: true, paragraph: { indent: { left: 720 }, contextualSpacing: true } },
        { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { italics: true, color: '44546A', size: 18 }, paragraph: { spacing: { after: 200, line: 240, lineRule: LineRuleType.AUTO } } },
        { id: 'TOCHeading', name: 'TOC Heading', basedOn: 'Heading1', next: 'Normal', run: { font: fonts.heading, size: 32, color: heading } },
        ...Array.from({ length: 9 }, (_, i) => ({ id: `TOC${i + 1}`, name: `toc ${i + 1}`, basedOn: 'Normal', next: 'Normal', paragraph: { spacing: { after: 100 }, indent: { left: i * 220 } } })),
        ...Object.values(customStyles)
          .filter((d) => d.kind !== 'character')
          .map((d) => ({ id: customId(d.id), name: d.name, basedOn: d.basedOn && d.basedOn.startsWith('h') ? `Heading${d.basedOn.slice(1)}` : 'Normal', next: 'Normal', quickFormat: true, ...withFormat({}, d.format) })),
      ],
      characterStyles: [
        { id: 'Strong', name: 'Strong', run: { bold: true } },
        { id: 'Emphasis', name: 'Emphasis', run: { italics: true } },
        { id: 'SubtleEmphasis', name: 'Subtle Emphasis', run: { italics: true, color: '404040' } },
        { id: 'IntenseEmphasis', name: 'Intense Emphasis', run: { italics: true, color: accent } },
        { id: 'SubtleReference', name: 'Subtle Reference', run: { smallCaps: true, color: '5A5A5A' } },
        { id: 'IntenseReference', name: 'Intense Reference', run: { bold: true, smallCaps: true, color: accent, characterSpacing: 5 } },
        { id: 'BookTitle', name: 'Book Title', run: { bold: true, italics: true, characterSpacing: 5 } },
        { id: 'Hyperlink', name: 'Hyperlink', run: { color: '0563C1', underline: { type: UnderlineType.SINGLE } } },
        ...Object.values(customStyles)
          .filter((d) => d.kind === 'character')
          .map((d) => ({ id: customId(d.id), name: d.name, run: withFormat({}, d.format).run })),
      ],
    },
    numbering: {
      config: [...ctx.numbering.entries()].map(([reference, def]) => ({
        reference,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: def.format === LevelFormat.BULLET ? LevelFormat.BULLET : level === 0 ? def.format : [LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN, LevelFormat.DECIMAL][(level - 1) % 3],
          text: def.text(level),
          start: level === 0 ? (def.start ?? 1) : 1,
          alignment: AlignmentType.LEFT,
          style: BULLETS_INDENT(level),
        })),
      })),
    },
    sections: used.map((seg, i) => ({
        properties: {
          ...(i > 0 ? { type: { nextPage: SectionType.NEXT_PAGE, continuous: SectionType.CONTINUOUS, evenPage: SectionType.EVEN_PAGE, oddPage: SectionType.ODD_PAGE }[seg.type] ?? SectionType.NEXT_PAGE } : {}),
          ...(seg.columns
            ? { column: { count: Number(seg.columns.count ?? 2), space: twip(Number(seg.columns.gap ?? 0.5)), separate: !!seg.columns.line, equalWidth: true } }
            : {}),
          ...(setup.verticalAlign !== 'top'
            ? { verticalAlign: { center: VerticalAlignSection.CENTER, bottom: VerticalAlignSection.BOTTOM, justify: VerticalAlignSection.BOTH }[setup.verticalAlign as 'center' | 'bottom' | 'justify'] }
            : {}),
          ...(setup.lineNumbers !== 'none'
            ? { lineNumbers: { countBy: 1, restart: setup.lineNumbers === 'restartPage' ? LineNumberRestartFormat.NEW_PAGE : LineNumberRestartFormat.CONTINUOUS } }
            : {}),
          titlePage: (i === 0 && setup.differentFirstPage) || undefined,
          page: {
            // docx rotates width/height for landscape itself, so always pass the portrait size.
            size: {
              width: twip(paper.w),
              height: twip(paper.h),
              orientation: setup.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: twip(margins.top),
              bottom: twip(margins.bottom),
              left: twip(margins.left),
              right: twip(margins.right),
              header: twip(setup.headerDistance),
              footer: twip(setup.footerDistance),
            },
            pageNumbers: {
              start: i === 0 && setup.pageNumberStart !== 1 ? setup.pageNumberStart : undefined,
              formatType: setup.pageNumberFormat === 'decimal' ? undefined : NumberFormat[({ lowerRoman: 'LOWER_ROMAN', upperRoman: 'UPPER_ROMAN', lowerLetter: 'LOWER_LETTER', upperLetter: 'UPPER_LETTER' } as const)[setup.pageNumberFormat]],
            },
            borders: borderStyle
              ? {
                  pageBorders: { display: PageBorderDisplay.ALL_PAGES, offsetFrom: PageBorderOffsetFrom.PAGE },
                  pageBorderTop: borderStyle,
                  pageBorderBottom: borderStyle,
                  pageBorderLeft: borderStyle,
                  pageBorderRight: borderStyle,
                }
              : undefined,
          },
        },
        // Later sections inherit the headers and footers ("Link to Previous").
        headers:
          i > 0
            ? undefined
            : {
                ...(header ? { default: new Header({ children: header }) } : {}),
                ...(firstHeader ? { first: new Header({ children: firstHeader }) } : setup.differentFirstPage ? { first: new Header({ children: [new Paragraph({})] }) } : {}),
                ...(evenHeader ? { even: new Header({ children: evenHeader }) } : setup.differentOddEven ? { even: new Header({ children: [new Paragraph({})] }) } : {}),
              },
        footers:
          i > 0
            ? undefined
            : {
                ...(footer ? { default: new Footer({ children: footer }) } : {}),
                ...(firstFooter ? { first: new Footer({ children: firstFooter }) } : setup.differentFirstPage ? { first: new Footer({ children: [new Paragraph({})] }) } : {}),
                ...(evenFooter ? { even: new Footer({ children: evenFooter }) } : setup.differentOddEven ? { even: new Footer({ children: [new Paragraph({})] }) } : {}),
              },
        children: sectionChildren[i].length ? sectionChildren[i] : [new Paragraph({})],
      })),
  })
  const blob = await Packer.toBlob(document)
  const textMark = watermark && !watermark.image && watermark.text ? watermark : null
  if (!setup.mirrored && !textMark && !ctx.diagrams.length) return blob
  // The writer has no option for mirrored margins or VML watermarks: add them to the package afterwards.
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const settings = await zip.file('word/settings.xml')?.async('string')
  if (setup.mirrored && settings && !settings.includes('w:mirrorMargins')) zip.file('word/settings.xml', settings.replace(/(<w:settings[^>]*>)/, '$1<w:mirrorMargins/>'))
  if (textMark) {
    const headers = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name))
    for (const [i, name] of headers.entries()) {
      const xml = await zip.file(name)!.async('string')
      zip.file(name, injectTextWatermark(xml, textWatermarkXml(textMark, contentIn * 72, fonts.body, i + 1)))
    }
  }
  if (ctx.diagrams.length) await addDiagramPart(zip, ctx.diagrams)
  return zip.generateAsync({ type: 'blob', mimeType: blob.type })
}

/**
 * The diagrams' outlines go into a custom XML part (the standard place for application data), so a
 * diagram opens as a diagram again; other programs show the shape groups.
 */
async function addDiagramPart(zip: import('jszip'), diagrams: { name: string; data: unknown }[]) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  let n = 1
  while (zip.file(`customXml/item${n}.xml`)) n++
  zip.file(`customXml/item${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<diagrams xmlns="${DIAGRAM_NS}">${diagrams.map((d) => `<diagram name="${esc(d.name)}">${esc(JSON.stringify(d.data))}</diagram>`).join('')}</diagrams>`)
  zip.file(`customXml/itemProps${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ds:datastoreItem ds:itemID="{6B0C1F52-4D1A-4B7E-9C2D-${String(n).padStart(12, '0')}}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${DIAGRAM_NS}"/></ds:schemaRefs></ds:datastoreItem>`)
  zip.file(`customXml/_rels/item${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps${n}.xml"/></Relationships>`)
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file('[Content_Types].xml', types.replace('</Types>', `<Override PartName="/customXml/item${n}.xml" ContentType="application/xml"/><Override PartName="/customXml/itemProps${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/></Types>`))
  const relsPath = 'word/_rels/document.xml.rels'
  const rels = await zip.file(relsPath)!.async('string')
  zip.file(relsPath, rels.replace('</Relationships>', `<Relationship Id="rIdKontorDiagrams" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item${n}.xml"/></Relationships>`))
}

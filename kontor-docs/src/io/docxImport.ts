import { defaultLevels, encodeMultilevel, type LevelFormat, type ListLevel } from '../editor/customLists'
import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import { matchPaper, type HeaderFooter, type PageBorder, type PageDesign, type PageNumberFormat, type PageSetup, type Watermark } from '../pageSetup'
import { TWIP_PER_IN } from '../units'
import type { Comments } from '../editor/Review'
import type { Notes } from '../editor/Notes'
import type { StyleDefs, StyleFormat } from '../editor/styleDefs'
import { DIAGRAM_NS, type DiagramData, type DiagramItem, type DiagramLayout } from '../editor/Diagram'
import { C_NS, M_NS, WPS_NS, chartFromXml, drawingLayout, drawingSize, ommlToLatex, shapeFromWsp } from './docxImportObjects'

// Reads .docx files directly (JSZip + DOMParser over the WordprocessingML parts), keeping character
// and paragraph formatting, lists, tables, pictures, links, page setup and headers/footers.

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const EMU_PER_PX = 9525

export type ImportResult = {
  content: JSONContent
  setup: Partial<PageSetup>
  design: Partial<PageDesign>
  headerFooter: Partial<HeaderFooter>
  comments: Comments
  trackChanges: boolean
  notes: Notes
  styles: StyleDefs
}

type PProps = {
  align?: string
  spaceBefore?: number
  spaceAfter?: number
  line?: string
  indentLeft?: number
  indentRight?: number
  indentFirstLine?: number
  keepNext?: boolean
  keepLines?: boolean
  pageBreakBefore?: boolean
  widowControl?: boolean
  shading?: string
  borders?: string
  numId?: string
  ilvl?: number
  dropCap?: 'dropped' | 'margin'
  dir?: 'rtl'
  outlineLevel?: number
  contextualSpacing?: boolean
  suppressLineNumbers?: boolean
  mirrorIndents?: boolean
  noHyphenate?: boolean
  tabStops?: { pos: number; align: string; leader: string }[]
}

type RProps = {
  bold?: boolean
  italic?: boolean
  underline?: { style: string; color?: string } | null
  strike?: boolean
  doubleStrike?: boolean
  vertAlign?: string
  color?: string
  size?: number
  font?: string
  highlight?: string
  shading?: string
  allCaps?: boolean
  smallCaps?: boolean
  hidden?: boolean
  spacing?: number
  position?: number
  scale?: number
  effect?: string
  glow?: string
  reflection?: boolean
  gradient?: string
}

type Style = { type: string; name: string; basedOn?: string; p: PProps; r: RProps }
type Level = { fmt: string; text: string; start: number }

type Ctx = {
  zip: JSZip
  styles: Map<string, Style>
  defaults: { p: PProps; r: RProps }
  numbering: Map<string, Level[]>
  theme: { major: string; minor: string }
  rels: Map<string, { target: string; external: boolean }>
  partDir: string
  /** Fields become live field nodes only in headers and footers. */
  fields: boolean
  images: Map<string, string>
  /** Comment ranges open at the current run (file ids), and ids that belong to replies. */
  openComments: Set<string>
  replyIds: Set<string>
  /** The tracked change (w:ins / w:del) that the current runs belong to. */
  revision: { type: 'insertion' | 'deletion'; author: string; date: string } | null
  /** The document's own paragraph styles, kept as named styles. */
  customStyles: StyleDefs
  /** A watermark found in a header (shared by all header contexts). */
  found: { watermark: Watermark | null }
  /** Outlines of diagrams saved by this app (custom XML part), by group name. */
  diagrams: Record<string, DiagramData>
}

// ---- XML helpers ----

const kids = (el: Element | null | undefined, name?: string) =>
  el ? Array.from(el.children).filter((c) => c.namespaceURI === W_NS && (!name || c.localName === name)) : []
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] ?? null
const val = (el: Element | null | undefined, name = 'val') => el?.getAttributeNS(W_NS, name) ?? el?.getAttribute(`w:${name}`) ?? null
const num = (v: string | null) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Number(v))
const on = (el: Element | null) => (el ? !['0', 'false', 'off', 'none'].includes(val(el) ?? 'true') : undefined)

function parseXml(text: string) {
  return new DOMParser().parseFromString(text, 'application/xml')
}

async function readXml(zip: JSZip, path: string) {
  const file = zip.file(path)
  return file ? parseXml(await file.async('string')) : null
}

const HIGHLIGHT_HEX: Record<string, string> = {
  yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF', blue: '#0000FF', red: '#FF0000', darkBlue: '#000080',
  darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080',
  lightGray: '#C0C0C0', black: '#000000', white: '#FFFFFF',
}

const hex = (v: string | null | undefined) => (v && /^[0-9A-Fa-f]{6}$/.test(v) ? `#${v.toUpperCase()}` : undefined)

// ---- Property parsers ----

function parsePPr(pPr: Element | null): PProps {
  const p: PProps = {}
  if (!pPr) return p
  const jc = val(kid(pPr, 'jc'))
  if (jc) p.align = jc === 'both' || jc === 'distribute' ? 'justify' : jc === 'end' ? 'right' : jc === 'start' ? 'left' : jc
  const sp = kid(pPr, 'spacing')
  if (sp) {
    const before = num(val(sp, 'before'))
    const after = num(val(sp, 'after'))
    if (before != null) p.spaceBefore = before / 20
    if (after != null) p.spaceAfter = after / 20
    const line = num(val(sp, 'line'))
    if (line != null) {
      const rule = val(sp, 'lineRule') ?? 'auto'
      p.line = rule === 'exact' ? `exact:${line / 20}` : rule === 'atLeast' ? `atLeast:${line / 20}` : String(Math.round((line / 240) * 100) / 100)
    }
  }
  const ind = kid(pPr, 'ind')
  if (ind) {
    const left = num(val(ind, 'left') ?? val(ind, 'start'))
    const right = num(val(ind, 'right') ?? val(ind, 'end'))
    const first = num(val(ind, 'firstLine'))
    const hanging = num(val(ind, 'hanging'))
    if (left != null) p.indentLeft = left / TWIP_PER_IN
    if (right != null) p.indentRight = right / TWIP_PER_IN
    if (hanging != null) p.indentFirstLine = -hanging / TWIP_PER_IN
    else if (first != null) p.indentFirstLine = first / TWIP_PER_IN
  }
  for (const [tag, key] of [['keepNext', 'keepNext'], ['keepLines', 'keepLines'], ['pageBreakBefore', 'pageBreakBefore'], ['widowControl', 'widowControl']] as const) {
    const el = kid(pPr, tag)
    if (el) p[key] = on(el)
  }
  const fill = hex(kid(pPr, 'shd')?.getAttributeNS(W_NS, 'fill') ?? val(kid(pPr, 'shd'), 'fill'))
  if (fill && fill !== '#FFFFFF') p.shading = fill
  const bdr = kid(pPr, 'pBdr')
  if (bdr) {
    const sides = (['top', 'bottom', 'left', 'right'] as const).filter((s) => {
      const b = kid(bdr, s) ?? kid(bdr, s === 'left' ? 'start' : s === 'right' ? 'end' : s)
      return b && !['nil', 'none'].includes(val(b) ?? 'none')
    })
    if (sides.length) p.borders = sides.map((s) => s[0]).join('')
  }
  const numPr = kid(pPr, 'numPr')
  if (numPr) {
    const id = val(kid(numPr, 'numId'))
    if (id != null) p.numId = id
    const lvl = num(val(kid(numPr, 'ilvl')))
    if (lvl != null) p.ilvl = lvl
  }
  const tabs = kids(kid(pPr, 'tabs'), 'tab')
  if (tabs.length) {
    const stops = tabs
      .filter((t) => val(t) !== 'clear')
      .map((t) => {
        const v = val(t) ?? 'left'
        const leader = val(t, 'leader') ?? 'none'
        return {
          pos: Math.round(((num(val(t, 'pos')) ?? 0) / TWIP_PER_IN) * 10000) / 10000,
          align: v === 'end' ? 'right' : v === 'start' ? 'left' : ['left', 'center', 'right', 'decimal', 'bar'].includes(v) ? v : 'left',
          leader: leader === 'dot' || leader === 'middleDot' ? 'dot' : leader === 'hyphen' ? 'dash' : leader === 'underscore' || leader === 'heavy' ? 'underline' : 'none',
        }
      })
      .filter((t) => t.pos > 0)
    if (stops.length) p.tabStops = stops
  }
  const bidi = kid(pPr, 'bidi')
  if (bidi && on(bidi)) p.dir = 'rtl'
  const outline = num(val(kid(pPr, 'outlineLvl')))
  if (outline != null && outline < 9) p.outlineLevel = outline + 1
  for (const [tag, key] of [['contextualSpacing', 'contextualSpacing'], ['suppressLineNumbers', 'suppressLineNumbers'], ['mirrorIndents', 'mirrorIndents'], ['suppressAutoHyphens', 'noHyphenate']] as const) {
    const el = kid(pPr, tag)
    if (el) p[key] = on(el)
  }
  const frame = kid(pPr, 'framePr')
  const drop = val(frame, 'dropCap')
  if (drop === 'drop' || drop === 'margin') p.dropCap = drop === 'drop' ? 'dropped' : 'margin'
  return p
}

function parseRPr(rPr: Element | null, ctx?: Pick<Ctx, 'theme'>): RProps {
  const r: RProps = {}
  if (!rPr) return r
  const b = kid(rPr, 'b')
  if (b) r.bold = on(b)
  const i = kid(rPr, 'i')
  if (i) r.italic = on(i)
  const u = kid(rPr, 'u')
  if (u) {
    const style = val(u) ?? 'single'
    r.underline = style === 'none' ? null : { style, color: hex(val(u, 'color')) }
  }
  const strike = kid(rPr, 'strike')
  if (strike) r.strike = on(strike)
  const dstrike = kid(rPr, 'dstrike')
  if (dstrike) r.doubleStrike = on(dstrike)
  const va = val(kid(rPr, 'vertAlign'))
  if (va) r.vertAlign = va
  const color = val(kid(rPr, 'color'))
  if (color && color !== 'auto') r.color = hex(color)
  if (color === 'auto') r.color = undefined
  const sz = num(val(kid(rPr, 'sz')))
  if (sz != null) r.size = sz / 2
  const fonts = kid(rPr, 'rFonts')
  if (fonts) {
    const theme = val(fonts, 'asciiTheme') ?? val(fonts, 'hAnsiTheme')
    const font = val(fonts, 'ascii') ?? val(fonts, 'hAnsi') ?? val(fonts, 'cs')
    if (theme && ctx) r.font = theme.startsWith('major') ? ctx.theme.major : ctx.theme.minor
    else if (font) r.font = font
  }
  const hl = val(kid(rPr, 'highlight'))
  if (hl && hl !== 'none' && HIGHLIGHT_HEX[hl]) r.highlight = HIGHLIGHT_HEX[hl]
  const shd = hex(val(kid(rPr, 'shd'), 'fill'))
  if (shd && shd !== '#FFFFFF') r.shading = shd
  const caps = kid(rPr, 'caps')
  if (caps) r.allCaps = on(caps)
  const small = kid(rPr, 'smallCaps')
  if (small) r.smallCaps = on(small)
  const vanish = kid(rPr, 'vanish')
  if (vanish) r.hidden = on(vanish)
  const spacing = num(val(kid(rPr, 'spacing')))
  if (spacing != null) r.spacing = spacing / 20
  const position = num(val(kid(rPr, 'position')))
  if (position != null) r.position = position / 2
  const w = num(val(kid(rPr, 'w')))
  if (w != null) r.scale = w
  for (const [tag, effect] of [['emboss', 'emboss'], ['imprint', 'engrave'], ['outline', 'outline'], ['shadow', 'shadow']] as const) {
    if (on(kid(rPr, tag))) r.effect = effect
  }
  // Newer text effects (w14): glow, reflection and gradient fill.
  const w14 = (name: string) => Array.from(rPr.children).find((c) => c.localName === name && c.namespaceURI !== W_NS)
  const fxColor = (el: Element | undefined) => {
    const c = el ? Array.from(el.getElementsByTagName('*')).find((x) => x.localName === 'srgbClr') : undefined
    const v = c?.getAttribute('w14:val') ?? (c ? Array.from(c.attributes).find((a) => a.localName === 'val')?.value : undefined)
    return hex(v ?? undefined)
  }
  const glow = w14('glow')
  if (glow) r.glow = fxColor(glow) ?? '#4472C4'
  if (w14('reflection')) r.reflection = true
  const fill = w14('textFill')
  const grad = fill && Array.from(fill.getElementsByTagName('*')).find((x) => x.localName === 'gradFill')
  if (grad) {
    const stops = Array.from(grad.getElementsByTagName('*')).filter((x) => x.localName === 'gs').map((g) => fxColor(g)).filter(Boolean)
    if (stops.length) r.gradient = `${stops[0]},${stops[stops.length - 1]}`
  }
  return r
}

// ---- Styles, numbering, theme ----

async function loadStyles(zip: JSZip, theme: Ctx['theme']) {
  const styles = new Map<string, Style>()
  const defaults = { p: {} as PProps, r: {} as RProps }
  const xml = await readXml(zip, 'word/styles.xml')
  if (!xml) return { styles, defaults }
  const root = xml.documentElement
  const dd = kid(root, 'docDefaults')
  defaults.p = parsePPr(kid(kid(dd, 'pPrDefault'), 'pPr'))
  defaults.r = parseRPr(kid(kid(dd, 'rPrDefault'), 'rPr'), { theme })
  for (const s of kids(root, 'style')) {
    const id = val(s, 'styleId')
    if (!id) continue
    styles.set(id, {
      type: val(s, 'type') ?? 'paragraph',
      name: (val(kid(s, 'name')) ?? id).toLowerCase(),
      basedOn: val(kid(s, 'basedOn')) ?? undefined,
      p: parsePPr(kid(s, 'pPr')),
      r: parseRPr(kid(s, 'rPr'), { theme }),
    })
  }
  return { styles, defaults }
}

function resolveStyle(ctx: Ctx, id: string | null | undefined, seen = new Set<string>()): { p: PProps; r: RProps } {
  if (!id || seen.has(id)) return { p: {}, r: {} }
  const s = ctx.styles.get(id)
  if (!s) return { p: {}, r: {} }
  seen.add(id)
  const base = resolveStyle(ctx, s.basedOn, seen)
  return { p: { ...base.p, ...s.p }, r: { ...base.r, ...s.r } }
}

async function loadNumbering(zip: JSZip) {
  const result = new Map<string, Level[]>()
  const xml = await readXml(zip, 'word/numbering.xml')
  if (!xml) return result
  const abstracts = new Map<string, Level[]>()
  for (const a of kids(xml.documentElement, 'abstractNum')) {
    const levels: Level[] = []
    for (const l of kids(a, 'lvl')) {
      const i = num(val(l, 'ilvl')) ?? levels.length
      levels[i] = { fmt: val(kid(l, 'numFmt')) ?? 'decimal', text: val(kid(l, 'lvlText')) ?? '', start: num(val(kid(l, 'start'))) ?? 1 }
    }
    abstracts.set(val(a, 'abstractNumId') ?? '', levels)
  }
  for (const n of kids(xml.documentElement, 'num')) {
    const levels = [...(abstracts.get(val(kid(n, 'abstractNumId')) ?? '') ?? [])]
    for (const o of kids(n, 'lvlOverride')) {
      const i = num(val(o, 'ilvl')) ?? 0
      const start = num(val(kid(o, 'startOverride')))
      if (start != null && levels[i]) levels[i] = { ...levels[i], start }
    }
    result.set(val(n, 'numId') ?? '', levels)
  }
  return result
}

async function loadTheme(zip: JSZip) {
  const theme = { major: 'Calibri Light', minor: 'Calibri' }
  const xml = await readXml(zip, 'word/theme/theme1.xml')
  if (!xml) return theme
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const major = xml.getElementsByTagNameNS(A, 'majorFont')[0]?.getElementsByTagNameNS(A, 'latin')[0]?.getAttribute('typeface')
  const minor = xml.getElementsByTagNameNS(A, 'minorFont')[0]?.getElementsByTagNameNS(A, 'latin')[0]?.getAttribute('typeface')
  if (major) theme.major = major
  if (minor) theme.minor = minor
  return theme
}

async function loadRels(zip: JSZip, partPath: string) {
  const dir = partPath.slice(0, partPath.lastIndexOf('/') + 1)
  const name = partPath.slice(partPath.lastIndexOf('/') + 1)
  const rels = new Map<string, { target: string; external: boolean }>()
  const xml = await readXml(zip, `${dir}_rels/${name}.rels`)
  if (!xml) return rels
  for (const r of Array.from(xml.getElementsByTagName('Relationship'))) {
    rels.set(r.getAttribute('Id') ?? '', { target: r.getAttribute('Target') ?? '', external: r.getAttribute('TargetMode') === 'External' })
  }
  return rels
}

function resolvePath(dir: string, target: string) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = (dir + target).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf' }

const WPG_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup'
const WP_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram'

/** Diagram outlines this app saved in a custom XML part (see the writer), by drawing name. */
async function loadDiagrams(zip: JSZip) {
  const out: Record<string, DiagramData> = {}
  for (const name of Object.keys(zip.files).filter((n) => /^customXml\/item\d+\.xml$/.test(n))) {
    const xml = await readXml(zip, name)
    if (xml?.documentElement.namespaceURI !== DIAGRAM_NS) continue
    for (const d of Array.from(xml.documentElement.children)) {
      try {
        out[d.getAttribute('name') ?? ''] = JSON.parse(d.textContent ?? '') as DiagramData
      } catch {
        // A damaged entry: the drawing is read as plain shapes instead.
      }
    }
  }
  return out
}

/** Layouts of the original's diagram gallery, by the words in their ids, mapped to ours. */
const SMARTART_LAYOUTS: [RegExp, DiagramLayout][] = [
  [/hierarchy|orgChart/i, 'hierarchy'],
  [/venn/i, 'venn'],
  [/matrix/i, 'matrix'],
  [/pyramid/i, 'pyramid'],
  [/radial/i, 'radial'],
  [/cycle/i, 'cycle'],
  [/chevron/i, 'chevron'],
  [/process|arrow/i, 'process'],
  [/vList|bList|vertical/i, 'bulletList'],
]

/** A diagram from the original's gallery: its outline from the data part, its kind from the layout's id. */
async function smartArtDiagram(ctx: Ctx, drawing: Element): Promise<DiagramData | null> {
  const ids = drawing.getElementsByTagNameNS(DGM_NS, 'relIds')[0]
  if (!ids) return null
  const part = async (attr: string) => {
    const rel = ctx.rels.get(ids.getAttributeNS(R_NS, attr) ?? ids.getAttribute(`r:${attr}`) ?? '')
    return rel ? readXml(ctx.zip, resolvePath(ctx.partDir, rel.target)) : null
  }
  const data = await part('dm')
  if (!data) return null
  const layoutId = (await part('lo'))?.documentElement.getAttribute('uniqueId') ?? ''
  const pts = new Map<string, { type: string; text: string }>()
  for (const pt of Array.from(data.getElementsByTagNameNS(DGM_NS, 'pt'))) {
    const text = Array.from(pt.getElementsByTagNameNS(A_MAIN, 'p'))
      .map((p) => Array.from(p.getElementsByTagNameNS(A_MAIN, 't')).map((t) => t.textContent).join(''))
      .join(' ')
    pts.set(pt.getAttribute('modelId') ?? '', { type: pt.getAttribute('type') ?? 'node', text })
  }
  const links = Array.from(data.getElementsByTagNameNS(DGM_NS, 'cxn')).filter((c) => (c.getAttribute('type') ?? 'parOf') === 'parOf')
  const childrenOf = (id: string) =>
    links
      .filter((c) => c.getAttribute('srcId') === id && (pts.get(c.getAttribute('destId') ?? '')?.type ?? 'node') === 'node')
      .sort((a, b) => Number(a.getAttribute('srcOrd') ?? 0) - Number(b.getAttribute('srcOrd') ?? 0))
      .map((c) => c.getAttribute('destId') ?? '')
  const root = [...pts.entries()].find(([, p]) => p.type === 'doc')?.[0]
  if (!root) return null
  const items: DiagramItem[] = []
  const walk = (id: string, level: number) => {
    for (const child of childrenOf(id)) {
      items.push({ text: pts.get(child)?.text ?? '', level })
      walk(child, level + 1)
    }
  }
  walk(root, 0)
  if (!items.length) return null
  const layout = SMARTART_LAYOUTS.find(([re]) => re.test(layoutId))?.[1] ?? 'blockList'
  return { layout, items, colors: 'colorful', style: 'flat' }
}
const A_MAIN = 'http://schemas.openxmlformats.org/drawingml/2006/main'

/**
 * A drawing group becomes its shapes and pictures, floating at their places and sharing a group id,
 * so they keep moving together (nested groups are flattened into the outer one).
 */
async function groupMembers(ctx: Ctx, wgp: Element, layout: Record<string, unknown>, size: { width: number | null; height: number | null }): Promise<JSONContent[]> {
  const groupId = `g${Math.random().toString(36).slice(2, 10)}`
  const out: JSONContent[] = []
  const kids = (el: Element) => Array.from(el.children)
  const xfrmOf = (el: Element | null | undefined) => {
    const x = el ? kids(el).find((k) => k.localName === 'xfrm') : undefined
    const n = (tag: string, attr: string) => Number(x ? kids(x).find((k) => k.localName === tag)?.getAttribute(attr) ?? 0 : 0)
    return { x: n('off', 'x'), y: n('off', 'y'), cx: n('ext', 'cx'), cy: n('ext', 'cy'), chX: n('chOff', 'x'), chY: n('chOff', 'y'), chCx: n('chExt', 'cx'), chCy: n('chExt', 'cy') }
  }
  // Maps child coordinates (EMU) of a group to pixels from the outermost group's top-left corner.
  type Map2 = (x: number, y: number, cx: number, cy: number) => { x: number; y: number; w: number; h: number }
  const visit = async (group: Element, map: Map2) => {
    const props = kids(group).find((k) => k.localName === 'grpSpPr')
    const t = xfrmOf(props)
    const sx = t.chCx ? t.cx / t.chCx : 1
    const sy = t.chCy ? t.cy / t.chCy : 1
    const inner: Map2 = (x, y, cx, cy) => map(t.x + (x - t.chX) * sx, t.y + (y - t.chY) * sy, cx * sx, cy * sy)
    for (const k of kids(group)) {
      if (k.localName === 'grpSp') {
        await visit(k, inner)
        continue
      }
      const box = (el: Element | undefined) => {
        const xf = xfrmOf(el)
        return inner(xf.x, xf.y, xf.cx, xf.cy)
      }
      if (k.localName === 'wsp') {
        const spPr = kids(k).find((c) => c.localName === 'spPr')
        const b = box(spPr)
        const txbx = k.getElementsByTagNameNS(W_NS, 'txbxContent')[0]
        const text = txbx ? Array.from(txbx.getElementsByTagNameNS(W_NS, 'p')).map((p) => Array.from(p.getElementsByTagNameNS(W_NS, 't')).map((r) => r.textContent).join('')).join('\n') : ''
        const shape = shapeFromWsp(k, {}, { width: Math.max(1, Math.round(b.w)), height: Math.max(1, Math.round(b.h)) }, text, false)
        out.push({ ...shape, attrs: { ...shape.attrs, _x: b.x, _y: b.y } })
      } else if (k.localName === 'pic') {
        const spPr = kids(k).find((c) => c.localName === 'spPr')
        const b = box(spPr)
        const blip = k.getElementsByTagNameNS(A_MAIN, 'blip')[0]
        const rId = blip?.getAttributeNS(R_NS, 'embed') ?? blip?.getAttribute('r:embed')
        const src = rId ? await imageData(ctx, rId) : null
        if (src) out.push({ type: 'image', attrs: { src, width: Math.round(b.w), height: Math.round(b.h), _x: b.x, _y: b.y } })
      }
    }
  }
  // The outermost group's own offset is where the drawing is anchored; children are relative to it.
  const outer = xfrmOf(kids(wgp).find((k) => k.localName === 'grpSpPr'))
  const scaleX = outer.cx && size.width ? (size.width * EMU_PER_PX) / outer.cx : 1
  const scaleY = outer.cy && size.height ? (size.height * EMU_PER_PX) / outer.cy : 1
  await visit(wgp, (x, y, cx, cy) => ({ x: ((x - outer.x) * scaleX) / EMU_PER_PX, y: ((y - outer.y) * scaleY) / EMU_PER_PX, w: (cx * scaleX) / EMU_PER_PX, h: (cy * scaleY) / EMU_PER_PX }))
  const floating = layout.wrap === 'behind' || layout.wrap === 'front'
  const baseX = floating ? Number(layout.offsetX) || 0 : 0
  const baseY = floating ? Number(layout.offsetY) || 0 : 0
  const wrap = layout.wrap === 'behind' ? 'behind' : 'front'
  return out.map((m) => {
    const { _x, _y, ...attrs } = m.attrs as Record<string, unknown>
    const gx = Math.round(Number(_x) || 0)
    const gy = Math.round(Number(_y) || 0)
    return { ...m, attrs: { ...attrs, wrap, offsetX: baseX + gx, offsetY: baseY + gy, ...(out.length > 1 ? { groupId, groupX: gx, groupY: gy } : {}) } }
  })
}

async function imageData(ctx: Ctx, rId: string) {
  const rel = ctx.rels.get(rId)
  if (!rel) return null
  if (rel.external) return rel.target
  const path = resolvePath(ctx.partDir, rel.target)
  if (ctx.images.has(path)) return ctx.images.get(path)!
  const file = ctx.zip.file(path)
  if (!file) return null
  const ext = path.split('.').pop()!.toLowerCase()
  const url = `data:${MIME[ext] ?? 'application/octet-stream'};base64,${await file.async('base64')}`
  ctx.images.set(path, url)
  return url
}

// Symbol fonts put pictures on letter codes; map the common ones to their Unicode look-alikes.
const SYMBOL_FONTS: Record<string, Record<number, string>> = {
  wingdings: {
    0x6c: '●', 0x6e: '■', 0x6f: '□', 0x71: '❑', 0x75: '◆', 0x76: '❖', 0x9f: '•', 0xa7: '▪', 0xa8: '◻', 0xd8: '➢', 0xe0: '➔', 0xe8: '➔',
    0xef: '⇦', 0xf0: '⇨', 0xfb: '✗', 0xfc: '✓', 0xfd: '☒', 0xfe: '☑', 0x4a: '☺', 0x4c: '☹', 0x2a: '✉', 0x28: '☎',
  },
  symbol: {
    0xb7: '•', 0xd7: '⋅', 0xae: '→', 0xac: '←', 0xad: '↑', 0xaf: '↓', 0xb0: '°', 0xb1: '±', 0xa3: '≤', 0xb3: '≥', 0xb9: '≠', 0xbb: '≈',
    0xa5: '∞', 0xb4: '×', 0xb8: '÷', 0xd6: '√', 0xe5: '∑', 0x70: 'π', 0x61: 'α', 0x62: 'β', 0x67: 'γ', 0x64: 'δ', 0x6d: 'μ', 0x53: 'Σ',
    0x57: 'Ω', 0x44: 'Δ', 0xf2: '∫',
  },
}

function symbolChar(font: string, code: number) {
  const table = SYMBOL_FONTS[font.toLowerCase().replace(/\s*\d+$/, '')]
  return table?.[code] ?? String.fromCodePoint(code)
}

// ---- Mapping to the editor model ----

const HEADING_SIZES = [16, 13, 12, 11, 11, 11]
const PARA_STYLE_NAMES: Record<string, string> = {
  title: 'title',
  subtitle: 'subtitle',
  quote: 'quote',
  'intense quote': 'intenseQuote',
  'no spacing': 'noSpacing',
  'list paragraph': 'listParagraph',
  caption: 'caption',
}
const CHAR_STYLE_NAMES: Record<string, string> = {
  strong: 'strong',
  emphasis: 'emphasis',
  'subtle emphasis': 'subtleEmphasis',
  'intense emphasis': 'intenseEmphasis',
  'subtle reference': 'subtleReference',
  'intense reference': 'intenseReference',
  'book title': 'bookTitle',
}

type BlockKind = { type: 'paragraph' | 'heading'; level?: number; pStyle?: string; mapped: boolean; custom?: { p: PProps; r: RProps } }

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

function styleFormat(st: { p: PProps; r: RProps }): StyleFormat {
  const f: StyleFormat = {}
  const { p, r } = st
  if (r.font) f.font = r.font
  if (r.size) f.size = r.size
  if (r.bold) f.bold = true
  if (r.italic) f.italic = true
  if (r.underline) f.underline = true
  if (r.color && r.color !== '#000000') f.color = r.color
  if (r.allCaps) f.allCaps = true
  if (r.smallCaps) f.smallCaps = true
  if (p.align && p.align !== 'left') f.align = p.align as StyleFormat['align']
  if (p.spaceBefore != null) f.spaceBefore = p.spaceBefore
  if (p.spaceAfter != null) f.spaceAfter = p.spaceAfter
  if (p.line && !p.line.includes(':')) f.lineHeight = p.line
  if (p.indentLeft) f.indentLeft = Math.round(p.indentLeft * 1000) / 1000
  if (p.indentFirstLine) f.indentFirstLine = Math.round(p.indentFirstLine * 1000) / 1000
  return f
}

function blockKind(ctx: Ctx, styleId: string | null): BlockKind {
  const style = styleId ? ctx.styles.get(styleId) : undefined
  const name = style?.name ?? ''
  const heading = name.match(/^heading ([1-9])$/)
  if (heading) return { type: 'heading', level: Math.min(6, Number(heading[1])), mapped: true }
  if (PARA_STYLE_NAMES[name]) return { type: 'paragraph', pStyle: PARA_STYLE_NAMES[name], mapped: true }
  if (style && styleId && name !== 'normal' && style.type === 'paragraph' && !/^(toc|index|footnote|endnote|header|footer|balloon|annotation|comment)/.test(name)) {
    // The document's own paragraph style: kept as a named style.
    const id = `d${styleId.replace(/[^A-Za-z0-9]/g, '')}`
    const resolved = resolveStyle(ctx, styleId)
    if (!ctx.customStyles[id]) ctx.customStyles[id] = { id, name: titleCase(name), kind: 'paragraph', basedOn: 'normal', custom: true, format: styleFormat({ p: resolved.p, r: resolved.r }) }
    return { type: 'paragraph', pStyle: id, mapped: true, custom: resolved }
  }
  return { type: 'paragraph', mapped: !style || name === 'normal' }
}

/** What the editor's stylesheet shows for a block type, so only real differences become marks. */
function expectedRun(kind: BlockKind, ctx: Ctx): RProps {
  if (kind.custom) return { font: ctx.theme.minor, size: 11, ...ctx.defaults.r, ...kind.custom.r }
  if (kind.type === 'heading') {
    const level = kind.level ?? 1
    return { font: ctx.theme.major, size: HEADING_SIZES[level - 1], italic: level === 4, color: level === 3 || level === 6 ? '#1F3763' : '#2F5496' }
  }
  if (kind.pStyle === 'title') return { font: ctx.theme.major, size: 28, spacing: -0.5 }
  if (kind.pStyle === 'subtitle') return { font: ctx.theme.minor, size: 11, color: '#5A5A5A', spacing: 0.75 }
  if (kind.pStyle === 'caption') return { font: ctx.theme.minor, size: 9, italic: true, color: '#44546A' }
  if (kind.pStyle === 'quote') return { font: ctx.theme.minor, size: 11, italic: true, color: '#404040' }
  if (kind.pStyle === 'intenseQuote') return { font: ctx.theme.minor, size: 11, italic: true, color: '#4472C4' }
  return { font: ctx.theme.minor, size: 11 }
}

function expectedPara(kind: BlockKind): PProps {
  if (kind.custom) return { spaceBefore: 0, spaceAfter: 8, line: '1.08', ...kind.custom.p }
  if (kind.type === 'heading') return { spaceBefore: kind.level === 1 ? 12 : 2, spaceAfter: 0, line: '1.08' }
  if (kind.pStyle === 'noSpacing') return { spaceBefore: 0, spaceAfter: 0, line: '1' }
  if (kind.pStyle === 'title') return { spaceBefore: 0, spaceAfter: 0, line: '1' }
  if (kind.pStyle === 'listParagraph') return { indentLeft: 0.5 }
  if (kind.pStyle === 'quote' || kind.pStyle === 'intenseQuote') return { indentLeft: 0.6, indentRight: 0.6 }
  if (kind.pStyle) return {}
  return { spaceBefore: 0, spaceAfter: 8, line: '1.08' }
}

function marksFor(r: RProps, expected: RProps, charStyle: string | null): JSONContent['marks'] {
  const marks: NonNullable<JSONContent['marks']> = []
  if (r.bold && !expected.bold) marks.push({ type: 'bold' })
  if (r.italic && !expected.italic) marks.push({ type: 'italic' })
  if (r.underline) marks.push({ type: 'underline', attrs: { underlineStyle: r.underline.style === 'dash' ? 'dashed' : r.underline.style === 'wave' ? 'wavy' : r.underline.style, underlineColor: r.underline.color ?? null } })
  if (r.strike) marks.push({ type: 'strike' })
  if (r.vertAlign === 'superscript') marks.push({ type: 'superscript' })
  if (r.vertAlign === 'subscript') marks.push({ type: 'subscript' })
  if (r.highlight) marks.push({ type: 'highlight', attrs: { color: r.highlight } })
  if (charStyle) marks.push({ type: 'charStyle', attrs: { id: charStyle } })
  const ts: Record<string, unknown> = {}
  if (r.color && r.color !== '#000000' && r.color !== expected.color) ts.color = r.color
  if (r.font && r.font !== expected.font) ts.fontFamily = r.font
  if (r.size && r.size !== expected.size) ts.fontSize = `${r.size}pt`
  if (r.shading) ts.backgroundColor = r.shading
  if (r.allCaps) ts.allCaps = true
  if (r.smallCaps) ts.smallCaps = true
  if (r.doubleStrike) ts.doubleStrike = true
  if (r.hidden) ts.hidden = true
  if (r.spacing && r.spacing !== expected.spacing) ts.letterSpacing = r.spacing
  if (r.position) ts.baselineShift = r.position
  if (r.scale && r.scale !== 100) ts.scale = r.scale
  if (r.effect) ts.textEffect = r.effect
  if (r.glow) ts.glow = r.glow
  if (r.reflection) ts.reflection = true
  if (r.gradient) ts.gradient = r.gradient
  if (Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: ts })
  return marks.length ? marks : undefined
}

/** Inline content; page breaks and text boxes are split out into blocks afterwards. */
type Inline = JSONContent | { pageBreak: true } | { block: JSONContent }

/** Converts a paragraph's runs, hyperlinks and fields. Page breaks split the paragraph later. */
/** XE (index entry) and TA (table of authorities citation) field codes as hidden entry nodes. */
export function hiddenFieldNode(instr: string): JSONContent | null {
  const code = instr.trim()
  const quoted = (sw: string) => code.match(new RegExp(`\\\\${sw}\\s+"([^"]*)"`))?.[1]
  if (/^XE\b/i.test(code)) {
    const term = code.match(/^XE\s+"([^"]*)"/i)?.[1]
    if (!term) return null
    const [main, sub = ''] = term.split(':')
    return { type: 'indexEntry', attrs: { term: main, sub } }
  }
  if (/^TA\b/i.test(code)) {
    const long = quoted('l') ?? ''
    const short = quoted('s') ?? ''
    const category = Number(code.match(/\\c\s+(\d+)/)?.[1] ?? 1)
    if (!long && !short) return null
    return { type: 'authorityEntry', attrs: { long, short, category } }
  }
  return null
}

async function runs(ctx: Ctx, parent: Element, kind: BlockKind, paraRun: RProps, link: string | null, out: Inline[], field: { state: 'none' | 'instr' | 'result'; instr: string; skip: boolean }) {
  for (const el of Array.from(parent.children)) {
    if (el.namespaceURI === M_NS) {
      // Equations: m:oMathPara is a display equation, m:oMath an inline one.
      if (!field.skip && (el.localName === 'oMathPara' || el.localName === 'oMath')) {
        const maths = el.localName === 'oMathPara' ? Array.from(el.children).filter((c) => c.namespaceURI === M_NS && c.localName === 'oMath') : [el]
        for (const m of maths) out.push({ type: 'equation', attrs: { latex: ommlToLatex(m).trim() || 'x', display: el.localName === 'oMathPara' } })
      }
      continue
    }
    if (el.namespaceURI !== W_NS) continue
    switch (el.localName) {
      case 'bookmarkStart': {
        const name = val(el, 'name')
        if (name && name !== '_GoBack' && !field.skip) out.push({ type: 'bookmark', attrs: { name } })
        break
      }
      case 'r': {
        const rPr = kid(el, 'rPr')
        const rStyleId = val(kid(rPr, 'rStyle'))
        const rStyle = rStyleId ? ctx.styles.get(rStyleId) : undefined
        const charStyle = rStyle ? (CHAR_STYLE_NAMES[rStyle.name] ?? null) : null
        const fromStyle = rStyleId && !charStyle && rStyle?.name !== 'hyperlink' ? resolveStyle(ctx, rStyleId).r : {}
        const r: RProps = { ...paraRun, ...fromStyle, ...parseRPr(rPr, ctx) }
        let marks = marksFor(r, expectedRun(kind, ctx), charStyle)
        // A tracked formatting change keeps the formatting from before it.
        const rPrChange = kid(rPr, 'rPrChange')
        if (rPrChange) {
          const oldR: RProps = { ...paraRun, ...fromStyle, ...parseRPr(kid(rPrChange, 'rPr'), ctx) }
          marks = [...(marks ?? []), { type: 'formatChange', attrs: { author: val(rPrChange, 'author') ?? '', date: val(rPrChange, 'date') ?? '', old: JSON.stringify(marksFor(oldR, expectedRun(kind, ctx), charStyle) ?? []) } }]
        }
        if (link) marks = [...(marks ?? []).filter((m) => !(m.type === 'underline')), { type: 'link', attrs: { href: link } }]
        const push = (text: string) => {
          if (!text || field.skip) return
          const extra: NonNullable<JSONContent['marks']> = [...ctx.openComments].map((id) => ({ type: 'comment', attrs: { id: `c${id}` } }))
          if (ctx.revision) extra.push({ type: ctx.revision.type, attrs: { author: ctx.revision.author, date: ctx.revision.date } })
          const all = extra.length ? [...(marks ?? []), ...extra] : marks
          const last = out[out.length - 1] as JSONContent | undefined
          if (last && last.type === 'text' && JSON.stringify(last.marks) === JSON.stringify(all)) last.text += text
          else out.push({ type: 'text', text, ...(all ? { marks: all } : {}) })
        }
        for (const c of runChildren(el)) {
          switch (c.localName) {
            case 't':
            case 'delText':
              if (field.state !== 'instr') push(c.textContent ?? '')
              break
            case 'instrText':
              field.instr += c.textContent ?? ''
              break
            case 'fldChar': {
              const type = val(c, 'fldCharType')
              if (type === 'begin') {
                field.state = 'instr'
                field.instr = ''
              } else if (type === 'separate') {
                field.state = 'result'
                const words = field.instr.trim().split(/\s+/)
                const instr = words[0]?.toUpperCase()
                const kindName = instr === 'PAGE' ? 'page' : instr === 'NUMPAGES' || instr === 'SECTIONPAGES' ? 'numPages' : null
                if (kindName && ctx.fields) {
                  out.push({ type: 'field', attrs: { kind: kindName }, ...(marks ? { marks } : {}) })
                  field.skip = true
                } else if ((instr === 'REF' || instr === 'PAGEREF') && words[1] && !ctx.fields) {
                  const show = instr === 'PAGEREF' ? 'page' : words.includes('\\p') ? 'aboveBelow' : words.includes('\\n') || words.includes('\\r') ? 'number' : 'text'
                  out.push({ type: 'crossRef', attrs: { target: words[1], refType: 'bookmark', show }, ...(marks ? { marks } : {}) })
                  field.skip = true
                }
              } else if (type === 'end') {
                // Index (XE) and citation (TA) fields have no result: they become hidden entries.
                const hidden = field.state === 'instr' ? hiddenFieldNode(field.instr) : null
                if (hidden) out.push(hidden)
                field.state = 'none'
                field.skip = false
              }
              break
            }
            case 'tab':
            case 'ptab':
              push('\t')
              break
            case 'br':
            case 'cr':
              if (val(c, 'type') === 'page') out.push({ pageBreak: true })
              else if (!field.skip) out.push({ type: 'hardBreak' })
              break
            case 'footnoteReference':
            case 'endnoteReference': {
              const id = val(c, 'id')
              const kind = c.localName === 'footnoteReference' ? 'footnote' : 'endnote'
              if (id != null && !field.skip) out.push({ type: 'noteRef', attrs: { id: `${kind[0]}${id}`, kind } })
              break
            }
            case 'noBreakHyphen':
              push('‑')
              break
            case 'softHyphen':
              push('­')
              break
            case 'sym': {
              const code = parseInt(val(c, 'char') ?? '', 16)
              if (!isNaN(code)) push(symbolChar(val(c, 'font') ?? '', code >= 0xf000 ? code - 0xf000 : code))
              break
            }
            case 'drawing': {
              if (field.skip) break
              const layout = drawingLayout(c)
              const size = drawingSize(c)
              const groupName = c.getElementsByTagNameNS(WP_DRAWING_NS, 'docPr')[0]?.getAttribute('name') ?? ''
              const saved = ctx.diagrams[groupName]
              if (saved) {
                out.push({ type: 'diagram', attrs: { ...layout, ...size, data: saved } })
                break
              }
              const smartArt = await smartArtDiagram(ctx, c)
              if (smartArt) {
                out.push({ type: 'diagram', attrs: { ...layout, ...size, data: smartArt } })
                break
              }
              const wgp = c.getElementsByTagNameNS(WPG_NS, 'wgp')[0]
              if (wgp) {
                out.push(...(await groupMembers(ctx, wgp, layout, size)))
                break
              }
              const wsp = c.getElementsByTagNameNS(WPS_NS, 'wsp')[0]
              if (wsp) {
                const txbx = wsp.getElementsByTagNameNS(W_NS, 'txbxContent')[0]
                const prst = wsp.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'prstGeom')[0]?.getAttribute('prst') ?? 'rect'
                // Text boxes are marked as such; shapes holding paragraphs become text boxes with the shape's outline.
                const isTextBox = wsp.getElementsByTagNameNS(WPS_NS, 'cNvSpPr')[0]?.getAttribute('txBox') === '1' || (!/line|connector/i.test(prst) && !!txbx?.textContent?.trim())
                if (isTextBox && txbx) {
                  const box = shapeFromWsp(wsp, layout, size, '', true)
                  const content = await blocks(ctx, txbx)
                  out.push({ block: { ...box, content: content.length ? content : [{ type: 'paragraph' }] } })
                } else {
                  const text = txbx ? Array.from(txbx.getElementsByTagNameNS(W_NS, 'p')).map((p) => Array.from(p.getElementsByTagNameNS(W_NS, 't')).map((t) => t.textContent).join('')).join('\n') : ''
                  out.push(shapeFromWsp(wsp, layout, size, text, false))
                }
                break
              }
              const chartRef = c.getElementsByTagNameNS(C_NS, 'chart')[0]
              if (chartRef) {
                const rel = ctx.rels.get(chartRef.getAttributeNS(R_NS, 'id') ?? chartRef.getAttribute('r:id') ?? '')
                const xml = rel ? await readXml(ctx.zip, resolvePath(ctx.partDir, rel.target)) : null
                if (xml) out.push({ type: 'chart', attrs: { ...layout, ...size, data: chartFromXml(xml) } })
                break
              }
              const blip = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0]
              const rId = blip?.getAttributeNS(R_NS, 'embed') ?? blip?.getAttribute('r:embed')
              const extent = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0]
              const docPr = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'docPr')[0]
              const src = rId ? await imageData(ctx, rId) : null
              // A picture watermark: a picture named "Watermark" behind the text of a header.
              if (src && ctx.fields && layout.wrap === 'behind' && /watermark/i.test(`${docPr?.getAttribute('name')} ${docPr?.getAttribute('descr')}`)) {
                ctx.found.watermark = { text: '', color: '#C0C0C0', layout: 'diagonal', semitransparent: true, image: src, scale: 1, washout: false }
                break
              }
              if (src && !field.skip) {
                const cx = Number(extent?.getAttribute('cx') ?? 0)
                const cy = Number(extent?.getAttribute('cy') ?? 0)
                const srcRect = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'srcRect')[0]
                const crop = (k: string) => (srcRect?.getAttribute(k) ? Number(srcRect.getAttribute(k)) / 100000 : 0)
                const alpha = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'alphaModFix')[0]?.getAttribute('amt')
                const xfrm = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'xfrm')[0]
                const rot = Number(xfrm?.getAttribute('rot') ?? 0) / 60000
                out.push({
                  type: 'image',
                  attrs: {
                    src,
                    alt: docPr?.getAttribute('descr') || docPr?.getAttribute('title') || null,
                    width: cx ? Math.round(cx / EMU_PER_PX) : null,
                    height: cy ? Math.round(cy / EMU_PER_PX) : null,
                    ...layout,
                    ...(rot ? { rotation: Math.round(rot) } : {}),
                    ...(srcRect ? { cropTop: crop('t'), cropRight: crop('r'), cropBottom: crop('b'), cropLeft: crop('l') } : {}),
                    ...(alpha ? { transparency: Math.round((1 - Number(alpha) / 100000) * 100) / 100 } : {}),
                  },
                })
              }
              break
            }
            case 'pict': {
              const data = c.getElementsByTagNameNS(VML_NS, 'imagedata')[0]
              const rId = data?.getAttributeNS(R_NS, 'id') ?? data?.getAttribute('r:id')
              const src = rId ? await imageData(ctx, rId) : null
              const shape = c.getElementsByTagNameNS(VML_NS, 'shape')[0]
              // (The shape type definition has a text path too; the text is on the shape's own.)
              const textpath = shape?.getElementsByTagNameNS(VML_NS, 'textpath')[0]
              // Watermarks are VML shapes in the headers: WordArt text or a washed-out picture.
              if (ctx.fields && (textpath || /watermark/i.test(shape?.getAttribute('id') ?? ''))) {
                ctx.found.watermark = vmlWatermark(shape, textpath, src, data)
                break
              }
              if (src && !field.skip) out.push({ type: 'image', attrs: { src } })
              break
            }
          }
        }
        break
      }
      case 'hyperlink': {
        const rId = el.getAttributeNS(R_NS, 'id') ?? el.getAttribute('r:id')
        const anchor = val(el, 'anchor')
        const href = rId ? (ctx.rels.get(rId)?.target ?? null) : anchor ? `#${anchor}` : null
        await runs(ctx, el, kind, paraRun, href, out, field)
        break
      }
      case 'fldSimple': {
        const words = (val(el, 'instr') ?? '').trim().split(/\s+/)
        const instr = words[0]?.toUpperCase()
        const kindName = instr === 'PAGE' ? 'page' : instr === 'NUMPAGES' ? 'numPages' : null
        if (kindName && ctx.fields) out.push({ type: 'field', attrs: { kind: kindName } })
        else if ((instr === 'REF' || instr === 'PAGEREF') && words[1] && !ctx.fields) out.push({ type: 'crossRef', attrs: { target: words[1], refType: 'bookmark', show: instr === 'PAGEREF' ? 'page' : 'text' } })
        else if (hiddenFieldNode(val(el, 'instr') ?? '')) out.push(hiddenFieldNode(val(el, 'instr') ?? '')!)
        else await runs(ctx, el, kind, paraRun, link, out, field)
        break
      }
      case 'smartTag':
      case 'customXml':
        await runs(ctx, el, kind, paraRun, link, out, field)
        break
      case 'ins':
      case 'del':
      case 'moveTo':
      case 'moveFrom': {
        const prev = ctx.revision
        ctx.revision = { type: el.localName === 'ins' || el.localName === 'moveTo' ? 'insertion' : 'deletion', author: val(el, 'author') ?? '', date: val(el, 'date') ?? '' }
        await runs(ctx, el, kind, paraRun, link, out, field)
        ctx.revision = prev
        break
      }
      case 'commentRangeStart':
        commentRange(ctx, el, true)
        break
      case 'commentRangeEnd':
        commentRange(ctx, el, false)
        break
      case 'sdt':
        await runs(ctx, kid(el, 'sdtContent') ?? el, kind, paraRun, link, out, field)
        break
    }
  }
}

const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const VML_NS = 'urn:schemas-microsoft-com:vml'
const VML_COLORS: Record<string, string> = { silver: '#C0C0C0', gray: '#808080', black: '#000000', red: '#FF0000', blue: '#0000FF', green: '#008000', white: '#FFFFFF', yellow: '#FFFF00' }

function vmlWatermark(shape: Element | undefined, textpath: Element | undefined, src: string | null, data: Element | undefined): Watermark {
  const style = shape?.getAttribute('style') ?? ''
  const rotation = Number(style.match(/rotation:\s*(-?[\d.]+)/)?.[1] ?? 0)
  const fill = (shape?.getAttribute('fillcolor') ?? 'silver').split(' ')[0]
  const color = VML_COLORS[fill.toLowerCase()] ?? (/^#[0-9a-f]{6}$/i.test(fill) ? fill.toUpperCase() : '#C0C0C0')
  const rawOpacity = shape?.getElementsByTagNameNS(VML_NS, 'fill')[0]?.getAttribute('opacity')
  // VML fractions are either decimals (".5") or 1/65536 units ("32768f").
  const opacity = rawOpacity == null ? 1 : rawOpacity.endsWith('f') ? Number(rawOpacity.slice(0, -1)) / 65536 : Number(rawOpacity)
  if (!textpath && src) return { text: '', color, layout: 'diagonal', semitransparent: true, image: src, scale: 1, washout: !!(data?.getAttribute('gain') || data?.getAttribute('blacklevel')) }
  return { text: textpath?.getAttribute('string') ?? '', color, layout: rotation % 180 ? 'diagonal' : 'horizontal', semitransparent: opacity < 1 }
}

/** Run content, with mc:AlternateContent resolved to its preferred choice (shapes, text boxes). */
function runChildren(run: Element): Element[] {
  const out: Element[] = []
  for (const c of Array.from(run.children)) {
    if (c.namespaceURI === W_NS) out.push(c)
    else if (c.namespaceURI === MC_NS && c.localName === 'AlternateContent') {
      const choice = Array.from(c.children).find((x) => x.localName === 'Choice') ?? Array.from(c.children).find((x) => x.localName === 'Fallback')
      if (choice) out.push(...Array.from(choice.children).filter((x) => x.namespaceURI === W_NS))
    }
  }
  return out
}

function paragraphAttrs(kind: BlockKind, p: PProps): Record<string, unknown> {
  const exp = expectedPara(kind)
  const a: Record<string, unknown> = {}
  if (kind.type === 'heading') a.level = kind.level
  if (kind.pStyle) a.pStyle = kind.pStyle
  if (p.align && p.align !== 'left' && !(p.align === 'center' && (kind.pStyle === 'quote' || kind.pStyle === 'intenseQuote'))) a.textAlign = p.align
  if (p.spaceBefore != null && p.spaceBefore !== (exp.spaceBefore ?? p.spaceBefore)) a.spaceBefore = p.spaceBefore
  if (p.spaceAfter != null && p.spaceAfter !== (exp.spaceAfter ?? p.spaceAfter)) a.spaceAfter = p.spaceAfter
  if (p.line && p.line !== (exp.line ?? p.line)) a.lineHeight = p.line
  if (p.indentLeft && Math.abs(p.indentLeft - (exp.indentLeft ?? 0)) > 0.001) a.indentLeft = Math.round((p.indentLeft - (exp.indentLeft ?? 0)) * 1000) / 1000
  if (p.indentRight && Math.abs(p.indentRight - (exp.indentRight ?? 0)) > 0.001) a.indentRight = Math.round((p.indentRight - (exp.indentRight ?? 0)) * 1000) / 1000
  if (p.indentFirstLine) a.indentFirstLine = Math.round(p.indentFirstLine * 1000) / 1000
  if (p.keepNext != null && kind.type !== 'heading') a.keepNext = p.keepNext || null
  if (p.keepLines && kind.type !== 'heading') a.keepLines = true
  if (p.pageBreakBefore) a.pageBreakBefore = true
  if (p.widowControl === false) a.widowControl = false
  if (p.shading) a.shading = p.shading
  if (p.borders) a.borders = p.borders
  if (p.dropCap) a.dropCap = p.dropCap
  if (p.dir) a.dir = p.dir
  if (p.outlineLevel && kind.type !== 'heading') a.outlineLevel = p.outlineLevel
  if (p.contextualSpacing && kind.pStyle !== 'listParagraph') a.contextualSpacing = true
  if (p.suppressLineNumbers) a.suppressLineNumbers = true
  if (p.mirrorIndents) a.mirrorIndents = true
  if (p.noHyphenate) a.noHyphenate = true
  if (p.tabStops?.length) a.tabStops = p.tabStops
  return a
}

type ParaResult = { blocks: JSONContent[]; numId?: string; ilvl: number; dropCap?: string }

async function paragraph(ctx: Ctx, el: Element): Promise<ParaResult> {
  const pPr = kid(el, 'pPr')
  const styleId = val(kid(pPr, 'pStyle'))
  const kind = blockKind(ctx, styleId)
  const style = resolveStyle(ctx, styleId)
  const p: PProps = { ...ctx.defaults.p, ...style.p, ...parsePPr(pPr) }
  const paraRun: RProps = { ...ctx.defaults.r, ...style.r }
  const inline: Inline[] = []
  await runs(ctx, el, kind, paraRun, null, inline, { state: 'none', instr: '', skip: false })
  // Only values that differ from what the editor's stylesheet shows for this style become attributes.
  const attrs = paragraphAttrs(kind, p)
  const numId = p.numId && p.numId !== '0' ? p.numId : undefined
  const blocks: JSONContent[] = []
  const before: JSONContent[] = []
  let current: JSONContent[] = []
  const flush = (force = false) => {
    if (current.length || force) blocks.push({ type: kind.type, attrs, ...(current.length ? { content: current } : {}) })
    current = []
  }
  for (const item of inline) {
    if ('pageBreak' in item) {
      flush()
      blocks.push({ type: 'pageBreak' })
    } else if ('block' in item) before.push(item.block)
    else current.push(item)
  }
  flush(blocks.length === 0 || current.length > 0)
  if (blocks[blocks.length - 1]?.type === 'pageBreak' && inline.length === 1) {
    // A paragraph that only holds a page break.
    return { blocks: [{ type: 'pageBreak' }], ilvl: 0 }
  }
  // Text boxes anchored in the paragraph come out as blocks in front of it.
  return { blocks: [...before, ...blocks], numId: before.length ? undefined : numId, ilvl: p.ilvl ?? 0, dropCap: p.dropCap }
}

function listInfo(ctx: Ctx, numId: string, ilvl: number) {
  const level = ctx.numbering.get(numId)?.[ilvl] ?? ctx.numbering.get(numId)?.[0]
  if (!level || level.fmt === 'none') return null
  // Multilevel definitions with compound numbers (1.1, 1.a) are kept as a whole.
  const all = ctx.numbering.get(numId) ?? []
  const legal = all.every((l, i) => !l || (l.fmt === 'decimal' && l.text === `${Array.from({ length: i + 1 }, (_, k) => `%${k + 1}`).join('.')}.`))
  if (legal && all.length > 1) return { type: 'orderedList', listStyle: 'legal', start: all[0]?.start ?? 1 }
  if (all.some((l, i) => i > 0 && l && l.fmt !== 'bullet' && (l.text.match(/%[1-9]/g) ?? []).length > 1)) {
    const fmt: Record<string, LevelFormat> = { decimal: 'decimal', decimalZero: 'decimal-zero', lowerLetter: 'lower-alpha', upperLetter: 'upper-alpha', lowerRoman: 'lower-roman', upperRoman: 'upper-roman', bullet: 'bullet', none: 'none' }
    const levels: ListLevel[] = Array.from({ length: 9 }, (_, i) => (all[i] ? { f: fmt[all[i].fmt] ?? 'decimal', t: all[i].text } : defaultLevels()[i]))
    return { type: 'orderedList', listStyle: encodeMultilevel(levels), start: all[0]?.start ?? 1 }
  }
  if (level.fmt === 'bullet') {
    const ch = level.text
    let style = ch === 'o' ? 'circle' : ch === '' || ch === '■' || ch === '▪' ? 'square' : ch === '' || ch === '◆' ? 'diamond' : ch === '' || ch === '➢' ? 'arrow' : ch === '' || ch === '✓' ? 'check' : ch === '–' || ch === '-' ? 'dash' : ch === '★' ? 'star' : null
    // Other characters (not the symbol fonts' private codes) stay custom bullets.
    if (!style && ch && ch !== '•' && ch !== '·' && ch !== '' && !/[\uE000-\uF8FF]/.test(ch) && Array.from(ch).length === 1) style = `sym:${ch}`
    return { type: 'bulletList', listStyle: style, start: 1 }
  }
  const paren = level.text.endsWith(')')
  const map: Record<string, string> = { decimal: paren ? 'decimal-paren' : 'decimal', upperRoman: 'upper-roman', lowerRoman: 'lower-roman', upperLetter: 'upper-alpha', lowerLetter: paren ? 'lower-alpha-paren' : 'lower-alpha' }
  const style = map[level.fmt] ?? 'decimal'
  return { type: 'orderedList', listStyle: style === 'decimal' ? null : style, start: level.start }
}

/** Builds nested lists from flat numbered paragraphs. */
function listBuilder() {
  type Open = { node: JSONContent; numId: string; level: number }
  const stack: Open[] = []
  return {
    add(out: JSONContent[], ctx: Ctx, para: JSONContent, numId: string, level: number) {
      const info = listInfo(ctx, numId, level)
      if (!info) return false
      while (stack.length && (stack[stack.length - 1].level > level || (stack[stack.length - 1].level === level && stack[stack.length - 1].node.type !== info.type))) stack.pop()
      const top = stack[stack.length - 1]
      if (top && top.level === level) {
        top.node.content!.push({ type: 'listItem', content: [para] })
        return true
      }
      const list: JSONContent = { type: info.type, attrs: { ...(info.listStyle ? { listStyle: info.listStyle } : {}), ...(info.type === 'orderedList' ? { start: info.start } : {}) }, content: [{ type: 'listItem', content: [para] }] }
      if (top) {
        const lastItem = top.node.content![top.node.content!.length - 1]
        lastItem.content!.push(list)
      } else out.push(list)
      stack.push({ node: list, numId, level })
      return true
    },
    reset() {
      stack.length = 0
    },
  }
}

async function table(ctx: Ctx, el: Element): Promise<JSONContent> {
  const tblPr = kid(el, 'tblPr')
  const styleId = val(kid(tblPr, 'tblStyle'))
  const styleName = styleId ? (ctx.styles.get(styleId)?.name ?? styleId).toLowerCase() : ''
  const borders = kid(tblPr, 'tblBorders')
  const hasBorders = borders ? kids(borders).some((b) => !['nil', 'none'].includes(val(b) ?? 'none')) : false
  const tableStyle = /grid/.test(styleName) || hasBorders ? 'grid' : 'plain'
  const grid = kids(kid(el, 'tblGrid'), 'gridCol').map((g) => Math.round((num(val(g, 'w')) ?? 0) / 15))
  const jc = val(kid(tblPr, 'jc'))
  const rows: JSONContent[] = []
  const vmerge: (JSONContent | null)[] = []
  let repeatHeader = false
  const cellMar = kid(tblPr, 'tblCellMar')
  const padLeft = num(val(kid(cellMar, 'left') ?? kid(cellMar, 'start'), 'w'))
  const penOf = (b: Element | null) => {
    if (!b) return undefined
    const v = val(b) ?? 'single'
    if (v === 'nil' || v === 'none') return { style: 'none' as const, width: 0, color: '#000000' }
    return { style: v.startsWith('dash') ? ('dashed' as const) : v === 'dotted' ? ('dotted' as const) : v === 'double' ? ('double' as const) : ('solid' as const), width: (num(val(b, 'sz')) ?? 4) / 8, color: hex(val(b, 'color')) ?? '#000000' }
  }
  for (const tr of kids(el, 'tr')) {
    const trPr = kid(tr, 'trPr')
    const header = on(kid(trPr, 'tblHeader')) ?? false
    if (header && !rows.length) repeatHeader = true
    const trH = num(val(kid(trPr, 'trHeight')))
    const cantSplit = !!on(kid(trPr, 'cantSplit'))
    const cells: JSONContent[] = []
    let col = 0
    for (const tc of kids(tr, 'tc')) {
      const tcPr = kid(tc, 'tcPr')
      const span = num(val(kid(tcPr, 'gridSpan'))) ?? 1
      const vm = kid(tcPr, 'vMerge')
      const vmVal = vm ? (val(vm) ?? 'continue') : null
      if (vmVal === 'continue' && vmerge[col]) {
        vmerge[col]!.attrs!.rowspan = (vmerge[col]!.attrs!.rowspan as number) + 1
        col += span
        continue
      }
      const content = await blocks(ctx, tc)
      const fill = hex(val(kid(tcPr, 'shd'), 'fill'))
      const va = val(kid(tcPr, 'vAlign'))
      const tcBorders = kid(tcPr, 'tcBorders')
      const ownBorders: Record<string, unknown> = {}
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        const pen = penOf(kid(tcBorders, side) ?? kid(tcBorders, side === 'left' ? 'start' : side === 'right' ? 'end' : side))
        if (pen) ownBorders[side] = pen
      }
      const dir = val(kid(tcPr, 'textDirection'))
      const widths = grid.slice(col, col + span)
      const cell: JSONContent = {
        type: header ? 'tableHeader' : 'tableCell',
        attrs: {
          colspan: span,
          rowspan: 1,
          colwidth: widths.length === span && widths.every((w) => w > 0) ? widths : null,
          ...(fill && fill !== '#FFFFFF' ? { backgroundColor: fill } : {}),
          ...(va === 'center' ? { verticalAlign: 'middle' } : va === 'bottom' ? { verticalAlign: 'bottom' } : {}),
          ...(Object.keys(ownBorders).length ? { borders: ownBorders } : {}),
          ...(dir === 'btLr' || dir === 'tbRl' ? { textDirection: dir } : {}),
        },
        content: content.length ? content : [{ type: 'paragraph' }],
      }
      for (let i = 0; i < span; i++) vmerge[col + i] = vmVal === 'restart' ? cell : null
      cells.push(cell)
      col += span
    }
    if (cells.length) rows.push({ type: 'tableRow', attrs: { ...(trH ? { rowHeight: Math.round(trH / 15) } : {}), ...(cantSplit ? { cantSplit: true } : {}) }, content: cells })
  }
  return { type: 'table', attrs: { tableStyle, ...(jc === 'center' || jc === 'right' ? { tableAlign: jc } : {}), ...(repeatHeader ? { repeatHeader: true } : {}), ...(padLeft != null ? { cellPadding: padLeft / TWIP_PER_IN } : {}) }, content: rows }
}

/** Block content of a body, cell, header or footer. */
async function blocks(ctx: Ctx, container: Element): Promise<JSONContent[]> {
  const out: JSONContent[] = []
  const lists = listBuilder()
  let pendingDropCap: { text: string; kind: string } | null = null
  const visit = async (parent: Element) => {
    for (const el of kids(parent)) {
      if (el.localName === 'p') {
        const res = await paragraph(ctx, el)
        if (res.dropCap) {
          // The original writes a drop cap as its own framed paragraph in front of the real one.
          const text = res.blocks.flatMap((b) => b.content ?? []).map((c) => c.text ?? '').join('')
          pendingDropCap = { text, kind: res.dropCap }
          continue
        }
        if (pendingDropCap) {
          const first = res.blocks[0]
          if (first) {
            first.attrs = { ...first.attrs, dropCap: pendingDropCap.kind }
            const head = first.content?.[0]
            if (head?.type === 'text') head.text = pendingDropCap.text + head.text
            else first.content = [{ type: 'text', text: pendingDropCap.text }, ...(first.content ?? [])]
          }
          pendingDropCap = null
        }
        if (res.numId && res.blocks.length === 1 && res.blocks[0].type !== 'pageBreak') {
          const para = res.blocks[0]
          // List indentation comes from the list itself; "List Paragraph" is the original's list item style.
          const { indentLeft: _l, indentFirstLine: _f, ...attrs } = para.attrs ?? {}
          if (attrs.pStyle === 'listParagraph') delete attrs.pStyle
          if (lists.add(out, ctx, { ...para, attrs }, res.numId, res.ilvl)) continue
        }
        lists.reset()
        out.push(...res.blocks)
      } else if (el.localName === 'tbl') {
        lists.reset()
        out.push(await table(ctx, el))
      } else if (el.localName === 'sdt') {
        await visit(kid(el, 'sdtContent') ?? el)
      } else if (el.localName === 'customXml' || el.localName === 'ins') {
        await visit(el)
      } else if (el.localName === 'commentRangeStart' || el.localName === 'commentRangeEnd') {
        commentRange(ctx, el, el.localName === 'commentRangeStart')
      }
    }
  }
  await visit(container)
  return out
}

/** Footnote or endnote texts by id (separators and continuation notices are skipped). */
async function loadNotes(base: Ctx, kind: 'footnote' | 'endnote'): Promise<Notes> {
  const path = `word/${kind}s.xml`
  const xml = await readXml(base.zip, path)
  const notes: Notes = {}
  if (!xml) return notes
  const ctx: Ctx = { ...base, rels: await loadRels(base.zip, path), partDir: 'word/', openComments: new Set(), revision: null }
  for (const el of kids(xml.documentElement, kind)) {
    const type = val(el, 'type')
    if (type && type !== 'normal') continue
    const content = await blocks(ctx, el)
    // The note starts with its own reference mark and a space; the page view draws the number itself.
    const first = content[0]?.content?.[0]
    if (first?.type === 'text' && first.text) first.text = first.text.replace(/^\s+/, '')
    if (first?.type === 'text' && !first.text) content[0].content!.shift()
    notes[`${kind[0]}${val(el, 'id')}`] = { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
  }
  return notes
}

function commentRange(ctx: Ctx, el: Element, start: boolean) {
  const id = val(el, 'id')
  if (id == null || ctx.replyIds.has(id)) return
  if (start) ctx.openComments.add(id)
  else ctx.openComments.delete(id)
}

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml'

/** Comment threads from comments.xml, with replies and resolved state from commentsExtended.xml. */
async function loadComments(zip: JSZip): Promise<{ comments: Comments; replyIds: Set<string> }> {
  const comments: Comments = {}
  const replyIds = new Set<string>()
  const xml = await readXml(zip, 'word/comments.xml')
  if (!xml) return { comments, replyIds }
  const byPara = new Map<string, string>()
  const list = kids(xml.documentElement, 'comment').map((c) => {
    const id = val(c, 'id') ?? ''
    const paras = kids(c, 'p')
    const text = paras.map((p) => Array.from(p.getElementsByTagNameNS(W_NS, 't')).map((t) => t.textContent ?? '').join('')).join('\n')
    const paraId = paras[paras.length - 1]?.getAttributeNS(W14, 'paraId')
    if (paraId) byPara.set(paraId, id)
    const author = val(c, 'author') ?? 'Author'
    return { id, author, initials: val(c, 'initials') ?? author.slice(0, 1).toUpperCase(), date: val(c, 'date') ?? new Date().toISOString(), text }
  })
  const ext = await readXml(zip, 'word/commentsExtended.xml')
  const parent = new Map<string, string>()
  const done = new Set<string>()
  if (ext) {
    for (const e of Array.from(ext.getElementsByTagNameNS(W15, 'commentEx'))) {
      const id = byPara.get(e.getAttributeNS(W15, 'paraId') ?? '')
      if (!id) continue
      const p = byPara.get(e.getAttributeNS(W15, 'paraIdParent') ?? '')
      if (p) parent.set(id, p)
      if (e.getAttributeNS(W15, 'done') === '1') done.add(id)
    }
  }
  for (const c of list) {
    if (parent.has(c.id)) continue
    comments[`c${c.id}`] = { id: `c${c.id}`, author: c.author, initials: c.initials, date: c.date, text: c.text, resolved: done.has(c.id), replies: [] }
  }
  for (const c of list) {
    const p = parent.get(c.id)
    if (!p || !comments[`c${p}`]) continue
    replyIds.add(c.id)
    comments[`c${p}`].replies.push({ id: `c${c.id}`, author: c.author, initials: c.initials, date: c.date, text: c.text })
  }
  return { comments, replyIds }
}

function pageSetup(sectPr: Element | null): Partial<PageSetup> {
  if (!sectPr) return {}
  const out: Partial<PageSetup> = {}
  const pgSz = kid(sectPr, 'pgSz')
  const w = num(val(pgSz, 'w'))
  const h = num(val(pgSz, 'h'))
  if (w && h) Object.assign(out, matchPaper(w / TWIP_PER_IN, h / TWIP_PER_IN))
  const mar = kid(sectPr, 'pgMar')
  if (mar) {
    const m = (k: string) => Math.max(0, (num(val(mar, k)) ?? 1440) / TWIP_PER_IN)
    out.margins = { top: m('top'), bottom: m('bottom'), left: m('left'), right: m('right') }
    const gutter = num(val(mar, 'gutter'))
    if (gutter) out.gutter = Math.round((gutter / TWIP_PER_IN) * 1000) / 1000
    const hd = num(val(mar, 'header'))
    const fd = num(val(mar, 'footer'))
    if (hd != null) out.headerDistance = hd / TWIP_PER_IN
    if (fd != null) out.footerDistance = fd / TWIP_PER_IN
  }
  out.differentFirstPage = !!on(kid(sectPr, 'titlePg'))
  const vAlign = val(kid(sectPr, 'vAlign'))
  if (vAlign === 'center' || vAlign === 'bottom') out.verticalAlign = vAlign
  if (vAlign === 'both') out.verticalAlign = 'justify'
  const ln = kid(sectPr, 'lnNumType')
  if (ln) out.lineNumbers = val(ln, 'restart') === 'newPage' ? 'restartPage' : 'continuous'
  const pg = kid(sectPr, 'pgNumType')
  const fmt = val(pg, 'fmt')
  const formats: Record<string, PageNumberFormat> = { lowerRoman: 'lowerRoman', upperRoman: 'upperRoman', lowerLetter: 'lowerLetter', upperLetter: 'upperLetter', decimal: 'decimal' }
  if (fmt && formats[fmt]) out.pageNumberFormat = formats[fmt]
  const start = num(val(pg, 'start'))
  if (start != null) out.pageNumberStart = start
  return out
}

function pageBorder(sectPr: Element | null): PageBorder | null {
  const b = kid(kid(sectPr, 'pgBorders'), 'top')
  if (!b || ['nil', 'none'].includes(val(b) ?? 'none')) return null
  const style = val(b) ?? 'single'
  return {
    style: style === 'double' ? 'double' : style === 'dotted' ? 'dotted' : style.startsWith('dash') ? 'dashed' : style.startsWith('thick') ? 'thick' : 'single',
    color: hex(val(b, 'color')) ?? '#000000',
    widthPt: (num(val(b, 'sz')) ?? 4) / 8,
    offsetPt: num(val(b, 'space')) ?? 24,
  }
}

export async function importDocx(file: File | Blob): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const doc = await readXml(zip, 'word/document.xml')
  if (!doc || doc.getElementsByTagName('parsererror').length) throw new Error('word/document.xml is missing or invalid')
  const theme = await loadTheme(zip)
  const { styles, defaults } = await loadStyles(zip, theme)
  const { comments, replyIds } = await loadComments(zip)
  const settings = await readXml(zip, 'word/settings.xml')
  const trackChanges = !!(settings && on(kid(settings.documentElement, 'trackRevisions')))
  const oddEven = !!(settings && on(kid(settings.documentElement, 'evenAndOddHeaders')))
  const mirrored = !!(settings && on(kid(settings.documentElement, 'mirrorMargins')))
  const gutterAtTop = !!(settings && on(kid(settings.documentElement, 'gutterAtTop')))
  const base: Ctx = {
    zip,
    styles,
    defaults,
    numbering: await loadNumbering(zip),
    theme,
    rels: await loadRels(zip, 'word/document.xml'),
    partDir: 'word/',
    fields: false,
    images: new Map(),
    openComments: new Set(),
    replyIds,
    revision: null,
    customStyles: {},
    found: { watermark: null },
    diagrams: await loadDiagrams(zip),
  }
  const body = kid(doc.documentElement, 'body')!
  const sectPr = kid(body, 'sectPr')
  // Sections end at paragraphs that carry their properties; the last one is the body's own.
  const segs: { els: Element[]; sectPr: Element | null }[] = [{ els: [], sectPr: null }]
  for (const el of kids(body)) {
    if (el.localName === 'sectPr') continue
    segs[segs.length - 1].els.push(el)
    const sp = el.localName === 'p' ? kid(kid(el, 'pPr'), 'sectPr') : null
    if (sp) {
      segs[segs.length - 1].sectPr = sp
      segs.push({ els: [], sectPr: null })
    }
  }
  segs[segs.length - 1].sectPr = sectPr
  const content: JSONContent[] = []
  let prevColumns = false
  for (const [i, seg] of segs.entries()) {
    if (i > 0 && !seg.els.length) continue
    const holder = doc.createElementNS(W_NS, 'w:body')
    seg.els.forEach((el) => holder.appendChild(el))
    const out = await blocks(base, holder)
    const cols = kid(seg.sectPr, 'cols')
    const count = num(val(cols, 'num')) ?? 1
    const type = val(kid(seg.sectPr, 'type')) ?? 'nextPage'
    const kind = type === 'continuous' || type === 'nextColumn' ? 'continuous' : type === 'evenPage' ? 'evenPage' : type === 'oddPage' ? 'oddPage' : 'nextPage'
    if (i > 0 && !(kind === 'continuous' && (count > 1 || prevColumns))) content.push({ type: 'sectionBreak', attrs: { kind } })
    if (count > 1 && out.length) {
      const space = num(val(cols, 'space'))
      content.push({ type: 'columns', attrs: { count: Math.min(6, count), gap: space != null ? space / TWIP_PER_IN : 0.5, line: ['1', 'true', 'on'].includes(val(cols, 'sep') ?? '0'), preset: 'equal' }, content: out })
    } else content.push(...out)
    prevColumns = count > 1
  }

  // One set of headers and footers serves all sections: take each kind from the first section that
  // defines it (later sections inherit them unless they define their own).
  const headerFooter: Partial<HeaderFooter> = {}
  const refs = new Map<string, Element>()
  for (const sp of segs.map((s) => s.sectPr)) {
    for (const ref of [...kids(sp, 'headerReference'), ...kids(sp, 'footerReference')]) {
      const key = `${ref.localName}:${val(ref, 'type') ?? 'default'}`
      if (!refs.has(key)) refs.set(key, ref)
    }
  }
  for (const ref of refs.values()) {
    const type = val(ref, 'type') ?? 'default'
    const rId = ref.getAttributeNS(R_NS, 'id') ?? ref.getAttribute('r:id')
    const rel = rId ? base.rels.get(rId) : undefined
    if (!rel || (type !== 'default' && type !== 'first' && type !== 'even')) continue
    const path = resolvePath('word/', rel.target)
    const part = await readXml(zip, path)
    if (!part) continue
    const ctx: Ctx = { ...base, rels: await loadRels(zip, path), partDir: path.slice(0, path.lastIndexOf('/') + 1), fields: true }
    const before = base.found.watermark
    const blocksOut = await blocks(ctx, part.documentElement)
    // The paragraph that only held the watermark is not header text.
    const first = blocksOut[0]
    if (base.found.watermark !== before && blocksOut.length > 1 && first?.type === 'paragraph' && !first.content?.length) blocksOut.shift()
    const isHeader = ref.localName === 'headerReference'
    const slot = type === 'first' ? (isHeader ? 'firstHeader' : 'firstFooter') : type === 'even' ? (isHeader ? 'evenHeader' : 'evenFooter') : isHeader ? 'header' : 'footer'
    headerFooter[slot] = { type: 'doc', content: blocksOut.length ? blocksOut : [{ type: 'paragraph' }] }
  }

  const design: Partial<PageDesign> = {}
  const background = hex(val(kid(doc.documentElement, 'background'), 'color'))
  if (background && background !== '#FFFFFF') design.pageColor = background
  const border = pageBorder(sectPr)
  if (border) design.pageBorder = border
  if (base.found.watermark) design.watermark = base.found.watermark

  return {
    content: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] },
    setup: { ...pageSetup(sectPr), ...(oddEven ? { differentOddEven: true } : {}), ...(mirrored ? { mirrored: true } : {}), ...(gutterAtTop ? { gutterPosition: 'top' as const } : {}) },
    design,
    headerFooter,
    comments,
    trackChanges,
    notes: { ...(await loadNotes(base, 'footnote')), ...(await loadNotes(base, 'endnote')) },
    styles: base.customStyles,
  }
}

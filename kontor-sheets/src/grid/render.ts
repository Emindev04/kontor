// Canvas renderer for the sheet: cells, fills, borders, text overflow, merges, headers and selection.
import { colName, type Range } from '../model/address'
import type { RichRun, Sheet } from '../model/sheet'
import { runStyle } from '../commands/richText'
import { DEFAULT_FONT, DEFAULT_SIZE, FONT_STACK, type Border, type Style } from '../model/style'
import { cellView } from '../commands/display'
import type { Doc, Sel } from '../commands/doc'
import type { Geometry, Pane } from './geometry'
import { makeDecorator, drawDataBar, drawIcon, drawSparkline, drawFilterButton, annotationKeys, type Decorator } from './decorate'
import { filterArea, sheetTargets } from '../commands/filter'
import { validationAt } from '../commands/validation'
import { OUTLINE_STEP, maxLevel, outlineButtons } from '../commands/outline'
import { PageGeometry } from './pages'

export const BRAND = '#15784a'
const GRID = '#e1e1e1'
const HEADER_BG = '#f5f5f5'
const HEADER_SEL = '#dfe3e0'
const HEADER_FULL = '#cfe6d8'
const HEADER_LINE = '#d4d4d4'
const HEADER_TEXT = '#4a4a4a'
const SEL_FILL = 'rgba(20, 120, 74, 0.11)'
const LINK = '#0563c1'

export type Overlays = {
  sel: Sel
  refs: { range: Range; color: string }[]
  clip: { range: Range; phase: number } | null
  fillPreview: Range | null
  movePreview: Range | null
  resize: { axis: 'col' | 'row'; pos: number } | null
  editing: { r: number; c: number } | null
  spill: Range | null
  showSelection: boolean
  pageBreaks: { rows: number[]; cols: number[]; labels: boolean; manualRows?: Set<number>; manualCols?: Set<number>; drag?: { axis: 'row' | 'col'; at: number } | null } | null
  ink: { points: number[]; color: string; width: number; highlighter: boolean }[]
  traces: { from: Range; to: { r: number; c: number } }[]
  /** Rectangle being dragged out for a new shape (canvas px). */
  rubber?: { x: number; y: number; w: number; h: number } | null
  /** Cells circled by Circle Invalid Data. */
  circles?: { r: number; c: number }[]
}

/** Converts unzoomed sheet pixels to canvas coordinates. */
export function sheetToCanvas(g: Geometry, px: number, py: number) {
  return g.toCanvas(px, py)
}

export function canvasToSheet(g: Geometry, x: number, y: number) {
  return g.toSheet(x, y)
}

export function fontFor(st: Style, z: number) {
  const px = ((st.size ?? DEFAULT_SIZE) * 96) / 72 * z
  return `${st.italic ? 'italic ' : ''}${st.bold ? 'bold ' : ''}${px.toFixed(2)}px ${FONT_STACK(st.font ?? DEFAULT_FONT)}`
}

export function wrapText(measure: (t: string) => number, text: string, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w !== '')
    let line = ''
    for (const w of words) {
      const next = line + w
      if (line && measure(next.trimEnd()) > width) {
        out.push(line.trimEnd())
        line = w.trimStart()
        // break words longer than the line
        while (line && measure(line) > width && line.length > 1) {
          let i = line.length - 1
          while (i > 1 && measure(line.slice(0, i)) > width) i--
          out.push(line.slice(0, i))
          line = line.slice(i)
        }
      } else line = next
    }
    out.push(line.trimEnd())
  }
  return out
}

function dash(ctx: CanvasRenderingContext2D, b: Border, z: number) {
  const s = b.style
  const u = Math.max(1, z)
  if (s === 'dashed' || s === 'mediumDashed') ctx.setLineDash([3 * u, 1 * u])
  else if (s === 'dotted' || s === 'hair') ctx.setLineDash([1 * u, 1 * u])
  else if (s === 'dashDot' || s === 'mediumDashDot' || s === 'slantDashDot') ctx.setLineDash([4 * u, 2 * u, 1 * u, 2 * u])
  else if (s === 'dashDotDot' || s === 'mediumDashDotDot') ctx.setLineDash([4 * u, 1 * u, 1 * u, 1 * u, 1 * u, 1 * u])
  else ctx.setLineDash([])
}

function lineWidth(b: Border) {
  return b.style === 'thick' ? 3 : b.style.startsWith('medium') || b.style === 'slantDashDot' ? 2 : 1
}

function drawEdge(ctx: CanvasRenderingContext2D, b: Border, x1: number, y1: number, x2: number, y2: number, z: number) {
  ctx.strokeStyle = b.color
  dash(ctx, b, z)
  const w = lineWidth(b)
  if (b.style === 'double') {
    ctx.lineWidth = 1
    const horiz = y1 === y2
    for (const o of [-1, 1]) {
      ctx.beginPath()
      if (horiz) {
        ctx.moveTo(x1, y1 + o + 0.5)
        ctx.lineTo(x2, y2 + o + 0.5)
      } else {
        ctx.moveTo(x1 + o + 0.5, y1)
        ctx.lineTo(x2 + o + 0.5, y2)
      }
      ctx.stroke()
    }
    return
  }
  ctx.lineWidth = w
  const off = w % 2 ? 0.5 : 0
  ctx.beginPath()
  if (y1 === y2) {
    ctx.moveTo(x1, y1 + off)
    ctx.lineTo(x2, y2 + off)
  } else {
    ctx.moveTo(x1 + off, y1)
    ctx.lineTo(x2 + off, y2)
  }
  ctx.stroke()
  ctx.setLineDash([])
}

type TextJob = {
  x: number
  y: number
  w: number
  h: number
  clipX: number
  clipW: number
  st: Style
  r: number
  c: number
  merged: boolean
  /** Room taken by a conditional-format icon on the left. */
  padL?: number
}

export function render(ctx: CanvasRenderingContext2D, g: Geometry, doc: Doc, o: Overlays) {
  const sheet = g.sheet
  const z = g.z
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, g.width, g.height)
  if (sheet.page.background && !(g instanceof PageGeometry)) drawBackground(ctx, g, doc, sheet.page.background)
  ctx.textBaseline = 'alphabetic'
  const deco = makeDecorator(doc, sheet)
  for (const pane of g.panes()) drawPane(ctx, g, doc, sheet, pane, o, deco)
  if (g instanceof PageGeometry) drawPages(ctx, g, doc)
  drawExtras(ctx, g, o)
  drawNotes(ctx, g, doc)
  // frozen pane separators
  ctx.strokeStyle = '#a6a6a6'
  ctx.lineWidth = 1
  if (sheet.freeze.rows) {
    ctx.beginPath()
    ctx.moveTo(0, g.bodyY - 0.5)
    ctx.lineTo(g.width, g.bodyY - 0.5)
    ctx.stroke()
  }
  if (sheet.freeze.cols) {
    ctx.beginPath()
    ctx.moveTo(g.bodyX - 0.5, 0)
    ctx.lineTo(g.bodyX - 0.5, g.height)
    ctx.stroke()
  }
  if (sheet.showHeadings) drawHeaders(ctx, g, doc, o)
  if (g.ow || g.oh) drawOutline(ctx, g)
  if (o.resize) {
    ctx.strokeStyle = '#555'
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    if (o.resize.axis === 'col') {
      ctx.moveTo(o.resize.pos + 0.5, 0)
      ctx.lineTo(o.resize.pos + 0.5, g.height)
    } else {
      ctx.moveTo(0, o.resize.pos + 0.5)
      ctx.lineTo(g.width, o.resize.pos + 0.5)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }
  void z
  ctx.restore()
}

function rangeRect(g: Geometry, rg: Range) {
  const x = g.colX(rg.c1)
  const y = g.rowY(rg.r1)
  const x2 = g.colX(rg.c2) + g.colW(rg.c2)
  const y2 = g.rowY(rg.r2) + g.rowH(rg.r2)
  return { x, y, w: x2 - x, h: y2 - y }
}

/** Rect of a range clipped to the rows/cols of a pane (ranges may be huge, e.g. whole columns). */
function paneRect(g: Geometry, pane: Pane, rg: Range) {
  const r1 = Math.max(rg.r1, pane.r0)
  const r2 = Math.min(rg.r2, pane.r1)
  const c1 = Math.max(rg.c1, pane.c0)
  const c2 = Math.min(rg.c2, pane.c1)
  if (r1 > r2 || c1 > c2) return null
  const x = rg.c1 < pane.c0 ? pane.x - 4 : g.colX(c1)
  const y = rg.r1 < pane.r0 ? pane.y - 4 : g.rowY(r1)
  const xe = rg.c2 > pane.c1 ? pane.x + pane.w + 4 : g.colX(c2) + g.colW(c2)
  const ye = rg.r2 > pane.r1 ? pane.y + pane.h + 4 : g.rowY(r2) + g.rowH(r2)
  return { x, y, w: xe - x, h: ye - y }
}

function drawPane(ctx: CanvasRenderingContext2D, g: Geometry, doc: Doc, sheet: Sheet, pane: Pane, o: Overlays, deco: Decorator) {
  const z = g.z
  ctx.save()
  ctx.beginPath()
  ctx.rect(pane.x, pane.y, pane.w, pane.h)
  ctx.clip()

  const rows: number[] = []
  for (let r = pane.r0; r <= pane.r1; r++) if (sheet.rows.size(r) > 0) rows.push(r)
  const cols: number[] = []
  for (let c = pane.c0; c <= pane.c1; c++) if (sheet.cols.size(c) > 0) cols.push(c)
  const xs = new Map<number, number>()
  for (const c of cols) xs.set(c, g.colX(c))
  const ys = new Map<number, number>()
  for (const r of rows) ys.set(r, g.rowY(r))

  // merged areas touching the pane
  const merges = sheet.merges.filter((m) => m.r1 <= pane.r1 && m.r2 >= pane.r0 && m.c1 <= pane.c1 && m.c2 >= pane.c0)
  const covered = new Set<string>()
  for (const m of merges) for (let r = Math.max(m.r1, pane.r0); r <= Math.min(m.r2, pane.r1); r++) for (let c = Math.max(m.c1, pane.c0); c <= Math.min(m.c2, pane.c1); c++) covered.add(`${r}:${c}`)

  // gridlines
  if (sheet.showGrid) {
    ctx.strokeStyle = sheet.gridColor ?? GRID
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const c of cols) {
      const x = Math.round(xs.get(c)! + g.colW(c)) - 0.5
      ctx.moveTo(x, pane.y)
      ctx.lineTo(x, pane.y + pane.h)
    }
    for (const r of rows) {
      const y = Math.round(ys.get(r)! + g.rowH(r)) - 0.5
      ctx.moveTo(pane.x, y)
      ctx.lineTo(pane.x + pane.w, y)
    }
    ctx.stroke()
  }

  // fills and text jobs
  const texts: TextJob[] = []
  const borders: { x: number; y: number; w: number; h: number; st: Style }[] = []
  for (const r of rows) {
    const y = Math.round(ys.get(r)!)
    const h = Math.round(ys.get(r)! + g.rowH(r)) - y
    for (const c of cols) {
      if (covered.has(`${r}:${c}`)) continue
      const x = Math.round(xs.get(c)!)
      const w = Math.round(xs.get(c)! + g.colW(c)) - x
      const st = deco.style(r, c)
      if (st.fill) {
        ctx.fillStyle = st.fill
        ctx.fillRect(x - 1, y - 1, w + 1, h + 1)
      }
      if (st.bt || st.bb || st.bl || st.br || st.bdd || st.bdu) borders.push({ x, y, w, h, st })
      const res = deco.cf(r, c)
      let padL = 0
      let hide = false
      if (res?.bar) {
        drawDataBar(ctx, res.bar, x, y, w, h)
        if (!res.bar.showValue) hide = true
      }
      if (res?.icon) {
        const size = Math.min(h - 3, 16 * z)
        drawIcon(ctx, res.icon.set, res.icon.index, res.icon.count, x + 2, y + (h - size) / 2, size)
        padL = size + 3
        if (!res.icon.showValue) hide = true
      }
      const sp = deco.spark(r, c)
      if (sp) drawSparkline(ctx, doc, sp, x, y, w, h)
      if (!hide && (sheet.hasValue(r, c) || (sheet.showFormulas && sheet.get(r, c)?.f !== undefined))) {
        let tw = w
        if (st.h === 'centerContinuous') {
          // Center Across Selection: spread over the empty cells to the right that use it too
          for (let cc = c + 1; cc < c + 60 && !sheet.hasValue(r, cc) && doc.wb.styles.get(sheet.styleId(r, cc)).h === 'centerContinuous'; cc++) tw += g.colW(cc)
        }
        texts.push({ x, y, w: Math.round(tw), h, clipX: x, clipW: Math.round(tw), st, r, c, merged: tw !== w, padL })
      }
    }
  }
  for (const m of merges) {
    const rect = rangeRect(g, m)
    const st = deco.style(m.r1, m.c1)
    ctx.fillStyle = st.fill ?? '#ffffff'
    ctx.fillRect(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w) - 1, Math.round(rect.h) - 1)
    if (st.fill) ctx.fillRect(Math.round(rect.x) - 1, Math.round(rect.y) - 1, Math.round(rect.w) + 1, Math.round(rect.h) + 1)
    if (sheet.hasValue(m.r1, m.c1)) texts.push({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h), clipX: Math.round(rect.x), clipW: Math.round(rect.w), st, r: m.r1, c: m.c1, merged: true })
    borders.push({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h), st: mergedBorders(doc, sheet, m) })
  }

  // text that starts left of the pane but overflows into it
  if (cols.length && !pane.frozenC) {
    const first = cols[0]
    for (const r of rows) {
      if (sheet.hasValue(r, first)) continue
      for (let c = first - 1; c >= Math.max(0, first - 30); c--) {
        if (!sheet.hasValue(r, c)) continue
        const v = doc.value(r, c, sheet)
        if (typeof v !== 'string' || sheet.mergeAt(r, c)) break
        const st = deco.style(r, c)
        if (st.wrap) break
        const y = Math.round(ys.get(r)!)
        const h = Math.round(ys.get(r)! + g.rowH(r)) - y
        const x = Math.round(g.colX(c))
        const w = Math.round(g.colX(c) + g.colW(c)) - x
        texts.push({ x, y, w, h, clipX: x, clipW: w, st, r, c, merged: false })
        break
      }
    }
  }

  for (const t of texts) drawText(ctx, g, doc, sheet, t, z)

  for (const b of borders) {
    const { x, y, w, h, st } = b
    if (st.bt) drawEdge(ctx, st.bt, x - 1, y - 1, x + w, y - 1, z)
    if (st.bb) drawEdge(ctx, st.bb, x - 1, y + h - 1, x + w, y + h - 1, z)
    if (st.bl) drawEdge(ctx, st.bl, x - 1, y - 1, x - 1, y + h, z)
    if (st.br) drawEdge(ctx, st.br, x + w - 1, y - 1, x + w - 1, y + h, z)
    if (st.bdd || st.bdu) {
      for (const [bd, down] of [[st.bdd, true], [st.bdu, false]] as const) {
        if (!bd) continue
        ctx.strokeStyle = bd.color
        ctx.lineWidth = lineWidth(bd)
        ctx.beginPath()
        if (down) {
          ctx.moveTo(x, y)
          ctx.lineTo(x + w - 1, y + h - 1)
        } else {
          ctx.moveTo(x, y + h - 1)
          ctx.lineTo(x + w - 1, y)
        }
        ctx.stroke()
      }
    }
  }

  drawMarkers(ctx, g, doc, sheet, pane, o)
  drawSelection(ctx, g, doc, pane, o)
  ctx.restore()
}

/** Filter buttons, note/comment indicators, list drop-down button and invalid-data circles. */
function drawMarkers(ctx: CanvasRenderingContext2D, g: Geometry, doc: Doc, sheet: Sheet, pane: Pane, o: Overlays) {
  const z = g.z
  const visible = (r: number, c: number) => r >= pane.r0 && r <= pane.r1 && c >= pane.c0 && c <= pane.c1 && g.rowH(r) > 0 && g.colW(c) > 0
  for (const t of sheetTargets(sheet)) {
    if (t.kind === 'table' && (!t.table.header || !t.table.filterButton)) continue
    const a = filterArea(t)
    if (!visible(a.header, Math.max(pane.c0, Math.min(a.c1, pane.c1)))) continue
    const sort = t.kind === 'table' ? t.table.sort : t.af.sort
    for (let c = Math.max(a.c1, pane.c0); c <= Math.min(a.c2, pane.c1); c++) {
      if (!visible(a.header, c)) continue
      const s = Math.min(g.rowH(a.header) - 3, 15 * z)
      const x = g.colX(c) + g.colW(c) - s - 2
      const y = g.rowY(a.header) + g.rowH(a.header) - s - 2
      const col = c - a.c1
      drawFilterButton(ctx, x, y, s, !!a.filters[col], sort && sort.col === col ? (sort.desc ? 'desc' : 'asc') : null)
    }
  }
  const ann = annotationKeys(sheet)
  for (const n of ann.notes) {
    if (!visible(n.r, n.c)) continue
    const x = g.colX(n.c) + g.colW(n.c) - 1
    const y = g.rowY(n.r)
    ctx.fillStyle = '#D9302F'
    ctx.beginPath()
    ctx.moveTo(x - 6 * z, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + 6 * z)
    ctx.closePath()
    ctx.fill()
  }
  for (const cm of ann.comments) {
    if (!visible(cm.r, cm.c)) continue
    const x = g.colX(cm.c) + g.colW(cm.c) - 1
    const y = g.rowY(cm.r)
    ctx.fillStyle = cm.resolved ? '#9A9A9A' : '#7B4FB8'
    ctx.beginPath()
    ctx.moveTo(x - 9 * z, y + 1)
    ctx.lineTo(x - 1, y + 1)
    ctx.lineTo(x - 1, y + 7 * z)
    ctx.lineTo(x - 4 * z, y + 5 * z)
    ctx.lineTo(x - 9 * z, y + 5 * z)
    ctx.closePath()
    ctx.fill()
  }
  // drop-down button of a list validation next to the active cell
  const a = o.sel.active
  if (!o.editing && visible(a.r, a.c)) {
    const v = validationAt(sheet, a.r, a.c)
    if (v && v.type === 'list' && v.dropdown) {
      const m = sheet.mergeAt(a.r, a.c) ?? { r1: a.r, c1: a.c, r2: a.r, c2: a.c }
      const x = g.colX(m.c2) + g.colW(m.c2) + 1
      const y = g.rowY(m.r2)
      const h = g.rowH(m.r2)
      const w = Math.min(h, 17 * z)
      ctx.fillStyle = '#F3F3F3'
      ctx.fillRect(x, y, w, h - 1)
      ctx.strokeStyle = '#A6A6A6'
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 2)
      ctx.fillStyle = '#404040'
      ctx.beginPath()
      ctx.moveTo(x + w * 0.28, y + h * 0.42)
      ctx.lineTo(x + w * 0.72, y + h * 0.42)
      ctx.lineTo(x + w * 0.5, y + h * 0.62)
      ctx.closePath()
      ctx.fill()
    }
  }
  for (const cell of o.circles ?? []) {
    if (!visible(cell.r, cell.c)) continue
    const x = g.colX(cell.c)
    const y = g.rowY(cell.r)
    const w = g.colW(cell.c)
    const h = g.rowH(cell.r)
    ctx.strokeStyle = '#E00000'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 + 3, h / 2 + 2, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** Notes set to "Show" are drawn as yellow boxes next to their cell. */
function drawNotes(ctx: CanvasRenderingContext2D, g: Geometry, doc: Doc) {
  const sheet = g.sheet
  const entries = Object.entries(sheet.x.notes).filter(([, n]) => n.visible)
  if (!entries.length) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.headerW, g.headerH, g.width - g.headerW, g.height - g.headerH)
  ctx.clip()
  const z = g.z
  for (const [ks, n] of entries) {
    const k = Number(ks)
    const r = Math.floor(k / 16384)
    const c = k % 16384
    const cx = g.colX(c) + g.colW(c)
    const cy = g.rowY(r)
    const bx = cx + 14 * z
    const by = cy - 6 * z
    const bw = n.w * z
    const bh = n.h * z
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - 2, cy + 2)
    ctx.lineTo(bx, by + 8 * z)
    ctx.stroke()
    ctx.fillStyle = '#FFFFE1'
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(bw), Math.round(bh))
    ctx.fillStyle = '#000'
    ctx.font = `${(9 * 96 / 72 * z).toFixed(1)}px "Segoe UI", Tahoma, sans-serif`
    const lines = wrapText((t) => ctx.measureText(t).width, `${n.author}:\n${n.text}`, bw - 8 * z)
    lines.forEach((line, i) => {
      if ((i + 1) * 13 * z > bh - 4) return
      if (i === 0) ctx.font = `bold ${(9 * 96 / 72 * z).toFixed(1)}px "Segoe UI", Tahoma, sans-serif`
      ctx.fillText(line, bx + 4 * z, by + 12 * z + i * 13 * z)
      if (i === 0) ctx.font = `${(9 * 96 / 72 * z).toFixed(1)}px "Segoe UI", Tahoma, sans-serif`
    })
  }
  ctx.restore()
  void doc
}

function mergedBorders(doc: Doc, sheet: Sheet, m: Range): Style {
  const st = doc.wb.styles
  return {
    bt: st.get(sheet.styleId(m.r1, m.c1)).bt,
    bl: st.get(sheet.styleId(m.r1, m.c1)).bl,
    bb: st.get(sheet.styleId(m.r2, m.c1)).bb ?? st.get(sheet.styleId(m.r1, m.c1)).bb,
    br: st.get(sheet.styleId(m.r1, m.c2)).br ?? st.get(sheet.styleId(m.r1, m.c1)).br,
  }
}

function drawText(ctx: CanvasRenderingContext2D, g: Geometry, doc: Doc, sheet: Sheet, t: TextJob, z: number) {
  const st = t.st
  const view = cellView(doc, sheet, t.r, t.c, st, t.w / z)
  if (!view.text) return
  const d = sheet.get(t.r, t.c)
  const isLink = !!d?.link
  const script = st.script
  ctx.font = fontFor(script ? { ...st, size: (st.size ?? DEFAULT_SIZE) * 0.68 } : st, z)
  const color = view.color ?? (isLink && !st.color ? LINK : st.color) ?? '#000000'
  ctx.fillStyle = color
  const sizePx = ((st.size ?? DEFAULT_SIZE) * 96) / 72 * z
  const padX = 3 * z
  const indent = (st.indent ?? 0) * 9 * z + (t.padL ?? 0)
  const lineH = sizePx * 1.22
  const v = st.v ?? 'bottom'
  const rotate = st.rotate ?? 0
  const measure = (s: string) => ctx.measureText(s).width

  // overflow into empty neighbours for unwrapped text
  let clipX = t.clipX
  let clipW = t.clipW
  const textW = measure(view.text) + indent
  const justify = st.h === 'justify' || st.h === 'distributed' || st.v === 'justify'
  const canOverflow = !t.merged && !st.wrap && !justify && !view.numeric && !st.shrink && rotate === 0 && view.align !== undefined && !view.text.includes('\n') && st.h !== 'fill'
  if (canOverflow && textW + padX * 2 > t.w) {
    const extendRight = view.align === 'left' || view.align === 'center'
    const extendLeft = view.align === 'right' || view.align === 'center'
    const need = textW + padX * 2 - t.w
    let right = t.x + t.w
    let left = t.x
    if (extendRight) {
      let c = t.c + 1
      while (right - t.x - t.w < (view.align === 'center' ? need / 2 : need) && c < 16384 && !sheet.hasValue(t.r, c) && !sheet.mergeAt(t.r, c)) {
        const w = g.colW(c)
        maskGrid(ctx, sheet, doc, right, t.y, w, t.h, t.r, c)
        right += w
        c++
      }
    }
    if (extendLeft) {
      let c = t.c - 1
      while (t.x - left < (view.align === 'center' ? need / 2 : need) && c >= 0 && !sheet.hasValue(t.r, c) && !sheet.mergeAt(t.r, c)) {
        const w = g.colW(c)
        left -= w
        maskGrid(ctx, sheet, doc, left, t.y, w, t.h, t.r, c, true)
        c--
      }
    }
    clipX = left
    clipW = right - left
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(clipX, t.y, clipW - 1, t.h - 1)
  ctx.clip()
  ctx.fillStyle = color
  const metricsAscent = sizePx * 0.78
  const baseline = (lines: number) => {
    const block = lines * lineH
    if (v === 'top') return t.y + 2 * z + metricsAscent
    if (v === 'middle' || v === 'justify' || v === 'distributed') return t.y + (t.h - block) / 2 + metricsAscent + (lineH - sizePx) / 2
    return t.y + t.h - 3 * z - (lines - 1) * lineH - (lineH - sizePx) / 2 - sizePx * 0.18
  }

  if (rotate !== 0) {
    const cx = t.x + t.w / 2
    const cy = t.y + t.h / 2
    ctx.translate(cx, cy)
    if (rotate === 255) {
      const chars = [...view.text]
      const total = chars.length * lineH
      chars.forEach((ch, i) => {
        const w = measure(ch)
        ctx.fillText(ch, -w / 2, -total / 2 + (i + 0.8) * lineH)
      })
    } else {
      ctx.rotate((-rotate * Math.PI) / 180)
      const w = measure(view.text)
      ctx.fillText(view.text, -w / 2, sizePx * 0.35)
    }
    ctx.restore()
    return
  }

  const rich = d?.rich
  if (rich && view.text === doc.value(t.r, t.c) && !view.fill && st.h !== 'fill') {
    drawRich(ctx, t, st, rich, z, view.align, padX, indent, st.wrap || justify ? t.w - padX * 2 - indent : Infinity)
    ctx.restore()
    return
  }

  let lines: string[]
  if (st.wrap || justify) lines = wrapText(measure, view.text, t.w - padX * 2 - indent)
  else lines = view.text.split('\n')
  if (st.shrink && !st.wrap) {
    const w = measure(view.text)
    if (w > t.w - padX * 2) {
      const scale = (t.w - padX * 2) / w
      ctx.font = fontFor({ ...st, size: (st.size ?? DEFAULT_SIZE) * scale }, z)
    }
  }
  let y = baseline(lines.length) + (script === 'superscript' ? -sizePx * 0.32 : script === 'subscript' ? sizePx * 0.12 : 0)
  for (const [li, line] of lines.entries()) {
    if (justify && li < lines.length - 1 && line.includes(' ')) {
      // spread the words of every line but the last over the cell width
      const words = line.split(/\s+/)
      const total = words.reduce((a, w) => a + measure(w), 0)
      const gap = (t.w - padX * 2 - indent - total) / Math.max(1, words.length - 1)
      let wx = t.x + padX + indent
      for (const w of words) {
        ctx.fillText(w, wx, y)
        wx += measure(w) + gap
      }
      y += lineH
      continue
    }
    const w = measure(line)
    let x: number
    if (view.fill) {
      // accounting style: symbol left, number right
      const lw = measure(view.fill.left)
      const rw = measure(view.fill.right)
      ctx.fillText(view.fill.left, t.x + padX, y)
      ctx.fillText(view.fill.right, t.x + t.w - padX - rw, y)
      void lw
      y += lineH
      continue
    }
    if (st.h === 'fill' && w > 0) {
      let fx = t.x + padX
      while (fx + w <= t.x + t.w - padX) {
        ctx.fillText(line, fx, y)
        fx += w
      }
      y += lineH
      continue
    }
    if (view.align === 'right') x = t.x + t.w - padX - w - indent
    else if (view.align === 'center') x = t.x + (t.w - w) / 2
    else x = t.x + padX + indent
    ctx.fillText(line, x, y)
    if (st.underline === 'singleAccounting' || st.underline === 'doubleAccounting') {
      // accounting underlines run across the whole cell, a little lower than the text underline
      const ux = t.x + 2 * z
      const uw = t.w - 4 * z
      ctx.fillRect(ux, y + sizePx * 0.2, uw, Math.max(1, z * 0.8))
      if (st.underline === 'doubleAccounting') ctx.fillRect(ux, y + sizePx * 0.2 + 2 * z, uw, Math.max(1, z * 0.8))
    } else if (st.underline || isLink) {
      ctx.fillRect(x, y + sizePx * 0.12, w, Math.max(1, z * 0.8))
      if (st.underline === 'double') ctx.fillRect(x, y + sizePx * 0.12 + 2 * z, w, Math.max(1, z * 0.8))
    }
    if (st.strike) ctx.fillRect(x, y - sizePx * 0.3, w, Math.max(1, z * 0.8))
    y += lineH
  }
  ctx.restore()
}

/** Text with mixed formatting in one cell: runs laid out word by word, each with its own font. */
function drawRich(ctx: CanvasRenderingContext2D, t: TextJob, base: Style, runs: RichRun[], z: number, align: string | undefined, padX: number, indent: number, maxW: number) {
  type Piece = { text: string; st: Style; w: number; font: string; br?: boolean }
  const pieces: Piece[] = []
  let maxSize = base.size ?? DEFAULT_SIZE
  for (const r of runs) {
    const st = runStyle(base, r.s)
    maxSize = Math.max(maxSize, st.size ?? DEFAULT_SIZE)
    const font = fontFor(st.script ? { ...st, size: (st.size ?? DEFAULT_SIZE) * 0.68 } : st, z)
    ctx.font = font
    r.t.split('\n').forEach((part, i) => {
      if (i > 0) pieces.push({ text: '', st, w: 0, font, br: true })
      const words = Number.isFinite(maxW) ? part.split(/(?<=\s)/) : [part]
      for (const w of words) if (w) pieces.push({ text: w, st, w: ctx.measureText(w).width, font })
    })
  }
  const lines: Piece[][] = [[]]
  let used = 0
  for (const p of pieces) {
    if (p.br) {
      lines.push([])
      used = 0
      continue
    }
    const cur = lines[lines.length - 1]
    const trimmed = p.w - (p.text.endsWith(' ') ? ctx.measureText(' ').width : 0)
    if (cur.length && used + trimmed > maxW) {
      lines.push([p])
      used = p.w
    } else {
      cur.push(p)
      used += p.w
    }
  }
  const sizePx = ((maxSize * 96) / 72) * z
  const lineH = sizePx * 1.22
  const block = lines.length * lineH
  const v = base.v ?? 'bottom'
  let y =
    v === 'top' ? t.y + 2 * z + sizePx * 0.78
    : v === 'middle' || v === 'justify' || v === 'distributed' ? t.y + (t.h - block) / 2 + sizePx * 0.78 + (lineH - sizePx) / 2
    : t.y + t.h - 3 * z - (lines.length - 1) * lineH - (lineH - sizePx) / 2 - sizePx * 0.18
  for (const line of lines) {
    const total = line.reduce((a, p) => a + p.w, 0)
    let x = align === 'right' ? t.x + t.w - padX - total - indent : align === 'center' ? t.x + (t.w - total) / 2 : t.x + padX + indent
    for (const p of line) {
      const px = ((p.st.size ?? DEFAULT_SIZE) * 96) / 72 * z
      const dy = p.st.script === 'superscript' ? -px * 0.32 : p.st.script === 'subscript' ? px * 0.12 : 0
      ctx.font = p.font
      ctx.fillStyle = p.st.color ?? '#000000'
      ctx.fillText(p.text, x, y + dy)
      const ink = p.text.trimEnd()
      const w = ink === p.text ? p.w : ctx.measureText(ink).width
      if (p.st.underline) {
        ctx.fillRect(x, y + dy + px * 0.12, w, Math.max(1, z * 0.8))
        if (p.st.underline === 'double' || p.st.underline === 'doubleAccounting') ctx.fillRect(x, y + dy + px * 0.12 + 2 * z, w, Math.max(1, z * 0.8))
      }
      if (p.st.strike) ctx.fillRect(x, y + dy - px * 0.3, w, Math.max(1, z * 0.8))
      x += p.w
    }
    y += lineH
  }
}

function maskGrid(ctx: CanvasRenderingContext2D, sheet: Sheet, doc: Doc, x: number, y: number, w: number, h: number, r: number, c: number, left = false) {
  if (!sheet.showGrid) return
  const st = doc.wb.styles.get(sheet.styleId(r, c))
  ctx.fillStyle = st.fill ?? '#ffffff'
  if (left) ctx.fillRect(x, y, w, h - 1)
  else ctx.fillRect(x - 1, y, w, h - 1)
}

function drawSelection(ctx: CanvasRenderingContext2D, g: Geometry, doc: Doc, pane: Pane, o: Overlays) {
  const sel = o.sel
  if (o.spill) {
    const rr = paneRect(g, pane, o.spill)
    if (rr) {
      ctx.strokeStyle = '#4a86e8'
      ctx.lineWidth = 1
      ctx.setLineDash([])
      ctx.strokeRect(Math.round(rr.x) - 0.5, Math.round(rr.y) - 0.5, Math.round(rr.w), Math.round(rr.h))
    }
  }
  for (const ref of o.refs) {
    const rr = paneRect(g, pane, ref.range)
    if (!rr) continue
    ctx.fillStyle = ref.color + '1f'
    ctx.fillRect(rr.x, rr.y, rr.w, rr.h)
    ctx.strokeStyle = ref.color
    ctx.lineWidth = 2
    ctx.strokeRect(Math.round(rr.x) - 1, Math.round(rr.y) - 1, Math.round(rr.w) + 1, Math.round(rr.h) + 1)
    ctx.fillStyle = ref.color
    for (const [cx, cy] of [[rr.x, rr.y], [rr.x + rr.w, rr.y], [rr.x, rr.y + rr.h], [rr.x + rr.w, rr.y + rr.h]]) ctx.fillRect(cx - 3, cy - 3, 5, 5)
  }
  if (o.showSelection) {
    const many = sel.ranges.length > 1 || sel.ranges[0].r1 !== sel.ranges[0].r2 || sel.ranges[0].c1 !== sel.ranges[0].c2
    if (many) {
      const m = doc.sheet.mergeAt(sel.active.r, sel.active.c) ?? { r1: sel.active.r, c1: sel.active.c, r2: sel.active.r, c2: sel.active.c }
      const ar = paneRect(g, pane, m)
      ctx.save()
      if (ar && !o.editing) {
        // the active cell stays clear
        ctx.beginPath()
        ctx.rect(pane.x, pane.y, pane.w, pane.h)
        ctx.rect(ar.x, ar.y, ar.w - 1, ar.h - 1)
        ctx.clip('evenodd')
      }
      ctx.fillStyle = SEL_FILL
      for (const rg of sel.ranges) {
        const rr = paneRect(g, pane, rg)
        if (!rr) continue
        ctx.fillRect(rr.x, rr.y, rr.w - 1, rr.h - 1)
      }
      ctx.restore()
    }
    const last = sel.ranges[sel.ranges.length - 1]
    const rr = paneRect(g, pane, last)
    if (rr) {
      ctx.strokeStyle = BRAND
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.strokeRect(Math.round(rr.x) - 1, Math.round(rr.y) - 1, Math.round(rr.w) + 1, Math.round(rr.h) + 1)
      const hx = Math.round(rr.x + rr.w)
      const hy = Math.round(rr.y + rr.h)
      if (last.r2 <= pane.r1 && last.c2 <= pane.c1 && !o.editing) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(hx - 5, hy - 5, 8, 8)
        ctx.fillStyle = BRAND
        ctx.fillRect(hx - 4, hy - 4, 6, 6)
      }
    }
    if (many) {
      const m = doc.sheet.mergeAt(sel.active.r, sel.active.c) ?? { r1: sel.active.r, c1: sel.active.c, r2: sel.active.r, c2: sel.active.c }
      const ar = paneRect(g, pane, m)
      if (ar) {
        ctx.strokeStyle = BRAND
        ctx.lineWidth = 1
        ctx.strokeRect(Math.round(ar.x) + 0.5, Math.round(ar.y) + 0.5, Math.round(ar.w) - 3, Math.round(ar.h) - 3)
      }
    }
  }
  if (o.clip) {
    const rr = paneRect(g, pane, o.clip.range)
    if (rr) {
      ctx.save()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ffffff'
      ctx.strokeRect(Math.round(rr.x) - 1, Math.round(rr.y) - 1, Math.round(rr.w) + 1, Math.round(rr.h) + 1)
      ctx.strokeStyle = BRAND
      ctx.setLineDash([4, 3])
      ctx.lineDashOffset = -o.clip.phase
      ctx.strokeRect(Math.round(rr.x) - 1, Math.round(rr.y) - 1, Math.round(rr.w) + 1, Math.round(rr.h) + 1)
      ctx.restore()
    }
  }
  for (const preview of [o.fillPreview, o.movePreview]) {
    if (!preview) continue
    const rr = paneRect(g, pane, preview)
    if (!rr) continue
    ctx.save()
    ctx.strokeStyle = '#7a7a7a'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    ctx.strokeRect(Math.round(rr.x) - 0.5, Math.round(rr.y) - 0.5, Math.round(rr.w), Math.round(rr.h))
    ctx.restore()
  }
}

function drawHeaders(ctx: CanvasRenderingContext2D, g: Geometry, doc: Doc, o: Overlays) {
  const sheet = g.sheet
  const z = g.z
  const sel = o.sel
  const selCols = new Set<number>()
  const fullCols = new Set<number>()
  const selRows = new Set<number>()
  const fullRows = new Set<number>()
  const [vr0, vr1] = g.visibleRows()
  const [vc0, vc1] = g.visibleCols()
  for (const rg of sel.ranges) {
    const full = rg.r1 === 0 && rg.r2 === 1048575
    const fullR = rg.c1 === 0 && rg.c2 === 16383
    for (let c = Math.max(rg.c1, 0); c <= Math.min(rg.c2, Math.max(vc1, sheet.freeze.cols)); c++) {
      if (c < sheet.freeze.cols || c >= vc0) {
        selCols.add(c)
        if (full) fullCols.add(c)
      }
    }
    for (let r = Math.max(rg.r1, 0); r <= Math.min(rg.r2, Math.max(vr1, sheet.freeze.rows)); r++) {
      if (r < sheet.freeze.rows || r >= vr0) {
        selRows.add(r)
        if (fullR) fullRows.add(r)
      }
    }
  }
  ctx.font = `${(11 * z * 96 / 72).toFixed(1)}px "Segoe UI", system-ui, -apple-system, sans-serif`
  ctx.textBaseline = 'middle'
  // column header
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.headerW, g.oh, g.width - g.headerW, g.headerH - g.oh)
  ctx.clip()
  ctx.fillStyle = HEADER_BG
  ctx.fillRect(g.headerW, g.oh, g.width, g.headerH - g.oh)
  const colList: number[] = []
  for (let c = 0; c < sheet.freeze.cols; c++) colList.push(c)
  for (let c = vc0; c <= vc1; c++) colList.push(c)
  for (const c of colList) {
    const w = g.colW(c)
    if (w <= 0) continue
    const x = g.colX(c)
    if (c >= sheet.freeze.cols && x + w < g.bodyX) continue
    if (selCols.has(c)) {
      ctx.fillStyle = fullCols.has(c) ? HEADER_FULL : HEADER_SEL
      ctx.fillRect(x, g.oh, w, g.headerH - g.oh)
      ctx.fillStyle = BRAND
      ctx.fillRect(x, g.headerH - 2, w, 2)
    }
    ctx.fillStyle = selCols.has(c) ? (fullCols.has(c) ? '#0b4d2d' : BRAND) : HEADER_TEXT
    const label = colName(c)
    const tw = ctx.measureText(label).width
    if (tw < w - 2) ctx.fillText(label, x + (w - tw) / 2, g.oh + (g.headerH - g.oh) / 2 + 0.5)
    ctx.fillStyle = HEADER_LINE
    ctx.fillRect(Math.round(x + w) - 1, g.oh, 1, g.headerH - g.oh)
  }
  ctx.fillStyle = HEADER_LINE
  ctx.fillRect(g.headerW, g.headerH - 1, g.width, 1)
  ctx.restore()
  // row header
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.ow, g.headerH, g.headerW - g.ow, g.height - g.headerH)
  ctx.clip()
  ctx.fillStyle = HEADER_BG
  ctx.fillRect(g.ow, g.headerH, g.headerW - g.ow, g.height)
  const rowList: number[] = []
  for (let r = 0; r < sheet.freeze.rows; r++) rowList.push(r)
  for (let r = vr0; r <= vr1; r++) rowList.push(r)
  for (const r of rowList) {
    const h = g.rowH(r)
    if (h <= 0) continue
    const y = g.rowY(r)
    if (r >= sheet.freeze.rows && y + h < g.bodyY) continue
    if (selRows.has(r)) {
      ctx.fillStyle = fullRows.has(r) ? HEADER_FULL : HEADER_SEL
      ctx.fillRect(g.ow, y, g.headerW - g.ow, h)
      ctx.fillStyle = BRAND
      ctx.fillRect(g.headerW - 2, y, 2, h)
    }
    ctx.fillStyle = selRows.has(r) ? (fullRows.has(r) ? '#0b4d2d' : BRAND) : HEADER_TEXT
    const label = String(r + 1)
    const tw = ctx.measureText(label).width
    if (h > 8 * z) ctx.fillText(label, g.ow + (g.headerW - g.ow - tw) / 2, y + h / 2 + 0.5)
    ctx.fillStyle = HEADER_LINE
    ctx.fillRect(g.ow, Math.round(y + h) - 1, g.headerW - g.ow, 1)
  }
  ctx.fillStyle = HEADER_LINE
  ctx.fillRect(g.headerW - 1, g.headerH, 1, g.height)
  ctx.restore()
  // corner (select all)
  ctx.fillStyle = HEADER_BG
  ctx.fillRect(g.ow, g.oh, g.headerW - g.ow, g.headerH - g.oh)
  ctx.fillStyle = '#b8b8b8'
  ctx.beginPath()
  ctx.moveTo(g.headerW - 4, g.oh + 4 * z)
  ctx.lineTo(g.headerW - 4, g.headerH - 4)
  ctx.lineTo(g.headerW - 4 - (g.headerH - g.oh - 4 - 4 * z), g.headerH - 4)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = HEADER_LINE
  ctx.fillRect(g.ow, g.headerH - 1, g.headerW - g.ow, 1)
  ctx.fillRect(g.headerW - 1, g.oh, 1, g.headerH - g.oh)
  ctx.textBaseline = 'alphabetic'
}

/** Page Layout view: gray desk around white pages, margins and header/footer text. */
function drawPages(ctx: CanvasRenderingContext2D, g: PageGeometry, doc: Doc) {
  const pages = g.pageRects()
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.headerW, g.headerH, g.width - g.headerW, g.height - g.headerH)
  // the desk is everything outside the pages
  for (const p of pages) ctx.rect(p.x, p.y, p.w, p.h)
  ctx.fillStyle = '#D9D9D9'
  ctx.fill('evenodd')
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.headerW, g.headerH, g.width - g.headerW, g.height - g.headerH)
  ctx.clip()
  const sheet = g.sheet
  const hf = (s: string | undefined): [string, string, string] => {
    const out: [string, string, string] = ['', '', '']
    if (!s) return out
    if (!/&[LCR]/.test(s)) return ['', s, '']
    let cur = 1
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '&' && /[LCR]/.test(s[i + 1] ?? '')) {
        cur = s[i + 1] === 'L' ? 0 : s[i + 1] === 'C' ? 1 : 2
        i++
        continue
      }
      out[cur] += s[i]
    }
    return out
  }
  const head = hf(sheet.page.header)
  const foot = hf(sheet.page.footer)
  const total = (g.breaks.rows.length + 1) * (g.breaks.cols.length + 1)
  const expand = (t: string, n: number) =>
    t.replace(/&P/g, String(n)).replace(/&N/g, String(total)).replace(/&D/g, new Date().toLocaleDateString('en-US')).replace(/&T/g, new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })).replace(/&F/g, doc.title).replace(/&A/g, sheet.name).replace(/&&/g, '&')
  ctx.font = `${(9 * 96 / 72 * g.z).toFixed(1)}px Calibri, Carlito, Arial, sans-serif`
  ctx.textBaseline = 'middle'
  for (const p of pages) {
    // white margin bands (cells may have drawn into them)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(p.x, p.y, p.w, g.mt)
    ctx.fillRect(p.x, p.y + p.h - g.mb, p.w, g.mb)
    ctx.fillRect(p.x, p.y, g.ml, p.h)
    ctx.fillRect(p.x + p.w - g.mr, p.y, g.mr, p.h)
    ctx.strokeStyle = '#BFBFBF'
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, Math.round(p.w), Math.round(p.h))
    const hy = p.y + Math.max(10, sheet.page.margins.header * 96 * g.z)
    const fy = p.y + p.h - Math.max(10, sheet.page.margins.footer * 96 * g.z)
    const put = (t: string, y: number, where: number) => {
      if (!t) return
      const text = expand(t, p.n)
      const w = ctx.measureText(text).width
      const x = where === 0 ? p.x + g.ml : where === 1 ? p.x + (p.w - w) / 2 : p.x + p.w - g.mr - w
      ctx.fillStyle = '#404040'
      ctx.fillText(text, x, y)
    }
    head.forEach((t, i) => put(t, hy, i))
    foot.forEach((t, i) => put(t, fy, i))
    if (!sheet.page.header && p.n === 1) {
      ctx.fillStyle = '#A6A6A6'
      const t = 'Add header'
      ctx.fillText(t, p.x + (p.w - ctx.measureText(t).width) / 2, hy)
    }
    drawRulers(ctx, g, p)
  }
  ctx.restore()
}

const backgrounds = new Map<string, HTMLImageElement>()

/** Page Layout > Background: the picture tiled behind the cells, scrolling with the sheet. */
function drawBackground(ctx: CanvasRenderingContext2D, g: Geometry, doc: Doc, id: string) {
  let img = backgrounds.get(id)
  if (!img) {
    img = new Image()
    img.onload = () => doc.emit()
    img.src = doc.wb.images.get(id) ?? ''
    backgrounds.set(id, img)
  }
  if (!img.complete || !img.naturalWidth) return
  const pattern = ctx.createPattern(img, 'repeat')
  if (!pattern) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.headerW, g.headerH, g.width - g.headerW, g.height - g.headerH)
  ctx.clip()
  const ox = g.headerW - (g.sx % (img.naturalWidth * g.z))
  const oy = g.headerH - (g.sy % (img.naturalHeight * g.z))
  ctx.translate(ox, oy)
  ctx.scale(g.z, g.z)
  ctx.fillStyle = pattern
  ctx.fillRect(-img.naturalWidth, -img.naturalHeight, (g.width + img.naturalWidth * 2) / g.z, (g.height + img.naturalHeight * 2) / g.z)
  ctx.restore()
}

/** Rulers in inches above and left of a page: margins shaded, ticks every 1/8", numbers from the margin. */
function drawRulers(ctx: CanvasRenderingContext2D, g: PageGeometry, p: { x: number; y: number; w: number; h: number }) {
  const z = g.z
  const t = Math.round(14 * z)
  const inch = 96 * z
  ctx.save()
  ctx.font = `${Math.max(7, 9 * z).toFixed(1)}px Segoe UI, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const strip = (horizontal: boolean) => {
    const len = horizontal ? p.w : p.h
    const m1 = horizontal ? g.ml : g.mt
    const m2 = horizontal ? g.mr : g.mb
    const ox = horizontal ? p.x : p.x - t - 4 * z
    const oy = horizontal ? p.y - t - 4 * z : p.y
    const rect = (a: number, b: number, fill: string) => {
      ctx.fillStyle = fill
      if (horizontal) ctx.fillRect(ox + a, oy, b - a, t)
      else ctx.fillRect(ox, oy + a, t, b - a)
    }
    rect(0, len, '#FFFFFF')
    rect(0, m1, '#D0D0D0')
    rect(len - m2, len, '#D0D0D0')
    ctx.strokeStyle = '#A0A0A0'
    ctx.lineWidth = 1
    if (horizontal) ctx.strokeRect(Math.round(ox) + 0.5, Math.round(oy) + 0.5, Math.round(len), t)
    else ctx.strokeRect(Math.round(ox) + 0.5, Math.round(oy) + 0.5, t, Math.round(len))
    ctx.fillStyle = '#505050'
    ctx.beginPath()
    for (let k = -Math.floor((m1 / inch) * 8); k <= ((len - m1) / inch) * 8; k++) {
      const pos = m1 + (k * inch) / 8
      if (pos < 0 || pos > len) continue
      const major = k % 8 === 0
      if (major && k !== 0) {
        const label = String(Math.abs(k / 8))
        if (horizontal) ctx.fillText(label, ox + pos, oy + t / 2)
        else ctx.fillText(label, ox + t / 2, oy + pos)
        continue
      }
      const size = major ? t * 0.6 : k % 4 === 0 ? t * 0.4 : t * 0.2
      if (horizontal) {
        ctx.moveTo(Math.round(ox + pos) + 0.5, oy + t - size)
        ctx.lineTo(Math.round(ox + pos) + 0.5, oy + t)
      } else {
        ctx.moveTo(ox + t - size, Math.round(oy + pos) + 0.5)
        ctx.lineTo(ox + t, Math.round(oy + pos) + 0.5)
      }
    }
    ctx.stroke()
  }
  strip(true)
  strip(false)
  ctx.restore()
}

/** Outline gutters: level buttons, group brackets and +/- buttons. */
function drawOutline(ctx: CanvasRenderingContext2D, g: Geometry) {
  const sheet = g.sheet
  const z = g.z
  const step = OUTLINE_STEP * z
  const s = Math.round(12 * z)
  ctx.save()
  ctx.fillStyle = '#FAFAFA'
  if (g.ow) ctx.fillRect(0, 0, g.ow, g.height)
  if (g.oh) ctx.fillRect(0, 0, g.width, g.oh)
  ctx.font = `${Math.round(9 * z * 96 / 72)}px "Segoe UI", system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  const box = (x: number, y: number, label: string) => {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = '#8C8C8C'
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, s - 1, s - 1)
    ctx.fillStyle = '#404040'
    const tw = ctx.measureText(label).width
    ctx.fillText(label, x + (s - tw) / 2, y + s / 2 + 0.5)
  }
  const rl = maxLevel(sheet, 'row')
  const cl = maxLevel(sheet, 'col')
  for (let L = 1; L <= rl + 1 && g.ow; L++) box((L - 1) * step + 2, g.oh + (g.headerH - g.oh - s) / 2, String(L))
  for (let L = 1; L <= cl + 1 && g.oh; L++) box(g.ow + (g.headerW - g.ow - s) / 2, (L - 1) * step + 2, String(L))
  ctx.strokeStyle = '#5A5A5A'
  if (g.ow) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, g.headerH, g.ow, g.height - g.headerH)
    ctx.clip()
    const [r0, r1] = g.visibleRows()
    for (const b of outlineButtons(sheet, 'row', Math.min(r0, sheet.freeze.rows ? 0 : r0), r1)) {
      const x = (b.level - 1) * step + 3
      if (!b.collapsed) {
        const y1 = g.rowY(b.run[0])
        const y2 = g.rowY(b.run[1]) + g.rowH(b.run[1])
        ctx.beginPath()
        ctx.moveTo(x + s / 2, y1 + 2)
        ctx.lineTo(x + s / 2, y2)
        ctx.moveTo(x + s / 2, y1 + 2)
        ctx.lineTo(x + s / 2 + 4, y1 + 2)
        ctx.stroke()
      }
      if (g.rowH(b.at) > 0) box(x, g.rowY(b.at) + (g.rowH(b.at) - s) / 2, b.collapsed ? '+' : '−')
    }
    ctx.restore()
  }
  if (g.oh) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(g.headerW, 0, g.width - g.headerW, g.oh)
    ctx.clip()
    const [c0, c1] = g.visibleCols()
    for (const b of outlineButtons(sheet, 'col', c0, c1)) {
      const y = (b.level - 1) * step + 3
      if (!b.collapsed) {
        const x1 = g.colX(b.run[0])
        const x2 = g.colX(b.run[1]) + g.colW(b.run[1])
        ctx.beginPath()
        ctx.moveTo(x1 + 2, y + s / 2)
        ctx.lineTo(x2, y + s / 2)
        ctx.moveTo(x1 + 2, y + s / 2)
        ctx.lineTo(x1 + 2, y + s / 2 + 4)
        ctx.stroke()
      }
      if (g.colW(b.at) > 0) box(g.colX(b.at) + (g.colW(b.at) - s) / 2, y, b.collapsed ? '+' : '−')
    }
    ctx.restore()
  }
  ctx.restore()
}

function drawExtras(ctx: CanvasRenderingContext2D, g: Geometry, o: Overlays) {
  const sheet = g.sheet
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.headerW, g.headerH, g.width - g.headerW, g.height - g.headerH)
  ctx.clip()
  if (o.pageBreaks && !(g instanceof PageGeometry)) {
    const pb = o.pageBreaks
    const used = sheet.used()
    const bottom = g.rowY(Math.max(0, used.r)) + g.rowH(Math.max(0, used.r))
    const right = g.colX(Math.max(0, used.c)) + g.colW(Math.max(0, used.c))
    if (pb.labels) {
      // Page Break Preview: everything outside the printed range is grayed out
      ctx.fillStyle = 'rgba(128, 128, 128, 0.28)'
      if (right < g.width) ctx.fillRect(Math.max(g.headerW, right), g.headerH, g.width, g.height)
      if (bottom < g.height) ctx.fillRect(g.headerW, Math.max(g.headerH, bottom), Math.max(0, right - g.headerW), g.height)
      ctx.strokeStyle = '#1f4fd0'
      ctx.lineWidth = 3
      ctx.strokeRect(g.colX(0), g.rowY(0), right - g.colX(0), bottom - g.rowY(0))
    }
    const line = (manual: boolean) => {
      ctx.strokeStyle = '#1f4fd0'
      ctx.lineWidth = pb.labels ? 2.5 : 1.5
      ctx.setLineDash(manual ? [] : [6, 4])
    }
    for (const c of pb.cols) {
      line(!!pb.manualCols?.has(c))
      const x = Math.round(g.colX(c)) - 0.5
      ctx.beginPath()
      ctx.moveTo(x, g.headerH)
      ctx.lineTo(x, bottom)
      ctx.stroke()
    }
    for (const r of pb.rows) {
      line(!!pb.manualRows?.has(r))
      const y = Math.round(g.rowY(r)) - 0.5
      ctx.beginPath()
      ctx.moveTo(g.headerW, y)
      ctx.lineTo(right, y)
      ctx.stroke()
    }
    ctx.setLineDash([])
    if (pb.drag) {
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2
      ctx.beginPath()
      if (pb.drag.axis === 'row') {
        const y = Math.round(g.rowY(pb.drag.at))
        ctx.moveTo(g.headerW, y)
        ctx.lineTo(right, y)
      } else {
        const x = Math.round(g.colX(pb.drag.at))
        ctx.moveTo(x, g.headerH)
        ctx.lineTo(x, bottom)
      }
      ctx.stroke()
    }
    if (pb.labels) {
      const cols = [0, ...pb.cols, used.c + 1]
      const rows = [0, ...pb.rows, used.r + 1]
      ctx.fillStyle = 'rgba(120, 120, 120, 0.22)'
      ctx.font = `${Math.round(36 * g.z)}px "Segoe UI", system-ui, sans-serif`
      let n = 1
      for (let i = 0; i + 1 < rows.length; i++)
        for (let j = 0; j + 1 < cols.length; j++) {
          const x1 = g.colX(cols[j])
          const x2 = g.colX(cols[j + 1])
          const y1 = g.rowY(rows[i])
          const y2 = g.rowY(rows[i + 1])
          const label = `Page ${n++}`
          const w = ctx.measureText(label).width
          ctx.fillText(label, (x1 + x2 - w) / 2, (y1 + y2) / 2)
        }
    }
  }
  for (const s of o.ink) {
    if (s.points.length < 4) continue
    ctx.strokeStyle = s.color
    ctx.globalAlpha = s.highlighter ? 0.4 : 1
    ctx.lineWidth = s.width * g.z
    ctx.lineCap = s.highlighter ? 'square' : 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i < s.points.length; i += 2) {
      const p = sheetToCanvas(g, s.points[i], s.points[i + 1])
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (o.rubber) {
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.strokeRect(Math.round(o.rubber.x) + 0.5, Math.round(o.rubber.y) + 0.5, Math.round(o.rubber.w), Math.round(o.rubber.h))
    ctx.setLineDash([])
  }
  for (const t of o.traces) {
    const fx = (g.colX(t.from.c1) + g.colX(t.from.c2) + g.colW(t.from.c2)) / 2
    const fy = (g.rowY(t.from.r1) + g.rowY(t.from.r2) + g.rowH(t.from.r2)) / 2
    const tx = g.colX(t.to.c) + g.colW(t.to.c) / 2
    const ty = g.rowY(t.to.r) + g.rowH(t.to.r) / 2
    ctx.strokeStyle = '#2f64c8'
    ctx.fillStyle = '#2f64c8'
    ctx.lineWidth = 1.5
    if (t.from.r1 !== t.from.r2 || t.from.c1 !== t.from.c2) {
      const x = g.colX(t.from.c1)
      const y = g.rowY(t.from.r1)
      ctx.strokeRect(x + 1, y + 1, g.colX(t.from.c2) + g.colW(t.from.c2) - x - 2, g.rowY(t.from.r2) + g.rowH(t.from.r2) - y - 2)
    }
    ctx.beginPath()
    ctx.arc(fx, fy, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    const a = Math.atan2(ty - fy, tx - fx)
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx - 9 * Math.cos(a - 0.4), ty - 9 * Math.sin(a - 0.4))
    ctx.lineTo(tx - 9 * Math.cos(a + 0.4), ty - 9 * Math.sin(a + 0.4))
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

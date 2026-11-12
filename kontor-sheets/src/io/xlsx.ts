// .xlsx import and export through ExcelJS (MIT). Loaded on demand.
import type * as EJ from 'exceljs'
import { APP_NAME } from '../brand'
import { MAX_COLS, cellKey, colName, keyCol, keyRow, parseRange, type Range } from '../model/address'
import { Sheet, type CellData, type PageSetup, type RichRun, type RunStyle } from '../model/sheet'
import { runStyle } from '../commands/richText'
import { DEFAULT_FONT, DEFAULT_SIZE, type Border, type BorderStyle, type Style, type StylePatch } from '../model/style'
import { CellError, errorFromCode, type Scalar } from '../model/types'
import { Workbook } from '../model/workbook'
import type { Engine } from '../engine/engine'
import { exportFormula, importFormula } from './formulaText'
export { exportFormula, importFormula } from './formulaText'
import type { PatternType } from '../model/fill'
import { THEMES, type Theme } from '../model/theme'
import { postProcess, readPackageExtras, readWithExcelJS, writeWithExcelJS } from './xlsxExtras'

type ExcelModule = typeof EJ

async function load(): Promise<ExcelModule> {
  const mod = (await import('exceljs')) as unknown as { default?: ExcelModule } & ExcelModule
  return mod.default ?? mod
}

// ---------- colors ----------

const THEME = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#0563C1', '#954F72']
const INDEXED = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080', '#9999FF', '#993366', '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF',
  '#000080', '#FF00FF', '#FFFF00', '#00FFFF', '#800080', '#800000', '#008080', '#0000FF', '#00CCFF', '#CCFFFF', '#CCFFCC', '#FFFF99', '#99CCFF', '#FF99CC', '#CC99FF', '#FFCC99',
  '#3366FF', '#33CCCC', '#99CC00', '#FFCC00', '#FF9900', '#FF6600', '#666699', '#969696', '#003366', '#339966', '#003300', '#333300', '#993300', '#993366', '#333399', '#333333',
]

/** Theme colors of the file being imported (theme index order: lt1, dk1, lt2, dk2, accent1-6, hlink, folHlink). */
let theme = THEME

/** Reads the color scheme from theme1.xml. */
function themeColors(xml: string | undefined): string[] {
  if (!xml) return THEME
  const pick = (name: string, i: number) => {
    const m = new RegExp(`<a:${name}>\\s*<a:(?:srgbClr val|sysClr[^>]*lastClr)="([0-9A-Fa-f]{6})"`).exec(xml)
    return m ? '#' + m[1].toUpperCase() : THEME[i]
  }
  return ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(pick)
}

/** The workbook theme stored in the file (colors, fonts, name), unless it is the generic default theme. */
export function themeFromXml(xml: string | undefined): Theme | undefined {
  if (!xml) return undefined
  const name = /<a:clrScheme name="([^"]*)"/.exec(xml)?.[1] ?? ''
  const known = THEMES.find((t) => t.name === name)
  const c = themeColors(xml)
  const major = /<a:majorFont>\s*<a:latin typeface="([^"]*)"/.exec(xml)?.[1]
  const minor = /<a:minorFont>\s*<a:latin typeface="([^"]*)"/.exec(xml)?.[1]
  if (!known && (!name || /^office/i.test(name))) return undefined
  return { name: name || 'Custom', colors: { lt1: c[0], dk1: c[1], lt2: c[2], dk2: c[3], accents: c.slice(4, 10), hlink: c[10], folHlink: c[11] }, fonts: { major: major || 'Calibri Light', minor: minor || 'Calibri' } }
}

/** Applies a tint the way the original does: on the HSL luminance. */
export function tint(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let sat = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  l = t < 0 ? l * (1 + t) : l * (1 - t) + t
  const hue = (p: number, q: number, x: number) => {
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  let out: number[]
  if (sat === 0) out = [l, l, l]
  else {
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat
    const p = 2 * l - q
    out = [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]
  }
  return '#' + out.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

function colorOf(c: Partial<EJ.Color> & { indexed?: number; tint?: number } | undefined): string | undefined {
  if (!c) return undefined
  if (c.argb && /^[0-9A-Fa-f]{8}$/.test(c.argb)) return '#' + c.argb.slice(2).toUpperCase()
  if (c.argb && /^[0-9A-Fa-f]{6}$/.test(c.argb)) return '#' + c.argb.toUpperCase()
  if (typeof c.theme === 'number') {
    const base = theme[c.theme] ?? '#000000'
    return c.tint ? tint(base, c.tint) : base
  }
  if (typeof c.indexed === 'number' && c.indexed < INDEXED.length) return INDEXED[c.indexed]
  return undefined
}

const argb = (hex: string) => ({ argb: 'FF' + hex.replace('#', '').toUpperCase() })

// ---------- styles ----------

const BORDER_STYLES: BorderStyle[] = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double', 'hair', 'mediumDashed', 'dashDot', 'mediumDashDot', 'dashDotDot', 'mediumDashDotDot', 'slantDashDot']

function borderOf(b: Partial<EJ.Border> | undefined): Border | undefined {
  if (!b?.style) return undefined
  const style = BORDER_STYLES.includes(b.style as BorderStyle) ? (b.style as BorderStyle) : 'thin'
  return { style, color: colorOf(b.color) ?? '#000000' }
}

/** Built-in formats whose meaning follows the system locale (en-US here) or that the reader spells oddly. */
const BUILTIN_FIX: Record<string, string> = { 'mm-dd-yy': 'm/d/yyyy', 'm/d/yy "h":mm': 'm/d/yyyy h:mm' }

function styleFromExcel(s: Partial<EJ.Style>): StylePatch {
  const p: StylePatch = {}
  const f = s.font
  if (f) {
    if (f.name) p.font = f.name
    if (f.size) p.size = f.size
    if (f.bold) p.bold = true
    if (f.italic) p.italic = true
    if (f.underline) p.underline = f.underline === 'double' ? 'double' : f.underline === 'singleAccounting' ? 'singleAccounting' : f.underline === 'doubleAccounting' ? 'doubleAccounting' : 'single'
    if (f.strike) p.strike = true
    const color = colorOf(f.color)
    if (color && color !== '#000000') p.color = color
    if (f.vertAlign === 'superscript' || f.vertAlign === 'subscript') p.script = f.vertAlign
  }
  const fill = s.fill as EJ.FillPattern | undefined
  if (fill && fill.type === 'pattern' && fill.pattern && fill.pattern !== 'none') {
    if (fill.pattern === 'solid') {
      const fg = colorOf(fill.fgColor) ?? colorOf(fill.bgColor)
      if (fg) p.fill = fg
    } else {
      p.pattern = fill.pattern as PatternType
      p.patternColor = colorOf(fill.fgColor) ?? '#000000'
      const bg = colorOf(fill.bgColor)
      if (bg && bg !== '#FFFFFF') p.fill = bg
    }
  }
  const grad = s.fill as (EJ.FillGradientAngle | EJ.FillGradientPath) | undefined
  if (grad && grad.type === 'gradient' && grad.stops?.length) {
    const from = colorOf(grad.stops[0].color) ?? '#FFFFFF'
    const to = colorOf(grad.stops[grad.stops.length - 1].color) ?? '#000000'
    p.gradient = grad.gradient === 'path' ? { kind: 'path', angle: 0, from, to } : { kind: 'linear', angle: (grad as EJ.FillGradientAngle).degree ?? 0, from, to }
  }
  const a = s.alignment
  if (a) {
    if (a.horizontal) p.h = a.horizontal as Style['h']
    if (a.vertical) p.v = a.vertical as Style['v']
    if (a.wrapText) p.wrap = true
    if (a.shrinkToFit) p.shrink = true
    if (a.indent) p.indent = a.indent
    if (typeof a.textRotation === 'number' && a.textRotation) p.rotate = a.textRotation === 255 ? 255 : a.textRotation > 90 ? 90 - a.textRotation : a.textRotation
    else if (a.textRotation === 'vertical') p.rotate = 255
  }
  const b = s.border
  if (b) {
    p.bt = borderOf(b.top)
    p.bb = borderOf(b.bottom)
    p.bl = borderOf(b.left)
    p.br = borderOf(b.right)
    if (b.diagonal?.down) p.bdd = borderOf(b.diagonal)
    if (b.diagonal?.up) p.bdu = borderOf(b.diagonal)
  }
  if (s.numFmt && s.numFmt !== 'General') p.fmt = BUILTIN_FIX[s.numFmt] ?? s.numFmt
  if (s.protection) {
    if (s.protection.locked === false) p.locked = false
    if (s.protection.hidden) p.hideFormula = true
  }
  return p
}

function styleToExcel(st: Style): Partial<EJ.Style> {
  const out: Partial<EJ.Style> = {}
  out.font = {
    name: st.font ?? 'Calibri',
    size: st.size ?? 11,
    bold: st.bold,
    italic: st.italic,
    underline: st.underline === 'single' ? true : st.underline,
    strike: st.strike,
    color: st.color ? argb(st.color) : undefined,
    vertAlign: st.script,
  }
  if (st.gradient) {
    const g = st.gradient
    const stops = [{ position: 0, color: argb(g.from) }, { position: 1, color: argb(g.to) }]
    out.fill = g.kind === 'path' ? { type: 'gradient', gradient: 'path', center: { left: 0.5, top: 0.5 }, stops } : { type: 'gradient', gradient: 'angle', degree: g.angle, stops }
  } else if (st.pattern) out.fill = { type: 'pattern', pattern: st.pattern, fgColor: argb(st.patternColor ?? '#000000'), bgColor: argb(st.fill ?? '#FFFFFF') }
  else if (st.fill) out.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(st.fill) }
  if (st.h || st.v || st.wrap || st.indent || st.rotate || st.shrink)
    out.alignment = {
      horizontal: st.h as EJ.Alignment['horizontal'],
      vertical: st.v as EJ.Alignment['vertical'],
      wrapText: st.wrap,
      shrinkToFit: st.shrink,
      indent: st.indent,
      textRotation: st.rotate === 255 ? 'vertical' : st.rotate !== undefined && st.rotate < 0 ? 90 - st.rotate : st.rotate,
    }
  const b = (x?: Border): Partial<EJ.Border> | undefined => (x ? { style: x.style as EJ.BorderStyle, color: argb(x.color) } : undefined)
  if (st.bt || st.bb || st.bl || st.br || st.bdd || st.bdu)
    out.border = {
      top: b(st.bt),
      bottom: b(st.bb),
      left: b(st.bl),
      right: b(st.br),
      diagonal: st.bdd || st.bdu ? { ...(b(st.bdd ?? st.bdu) as EJ.Border), up: !!st.bdu, down: !!st.bdd } : undefined,
    }
  if (st.fmt) out.numFmt = st.fmt
  if (st.locked === false || st.hideFormula) out.protection = { locked: st.locked !== false, hidden: !!st.hideFormula }
  return out
}

// ---------- sizes & formulas ----------

const colPx = (w: number) => Math.trunc(((256 * w + 18) / 256) * 7)
const colChars = (px: number) => Math.trunc((px / 7) * 256) / 256
const rowPx = (pt: number) => Math.round((pt * 96) / 72)
const rowPt = (px: number) => Math.round(((px * 72) / 96) * 4) / 4

const EPOCH = Date.UTC(1899, 11, 30)

function scalarOf(v: unknown): Scalar {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (v instanceof Date) return (v.getTime() - EPOCH) / 86400000
  if (typeof v === 'object' && 'error' in (v as object)) return errorFromCode(String((v as { error: string }).error)) ?? new CellError('#VALUE!')
  if (typeof v === 'object' && 'richText' in (v as object)) return ((v as { richText: { text: string }[] }).richText ?? []).map((r) => r.text).join('')
  return String(v)
}

const PAPER: Record<number, PageSetup['paper']> = { 1: 'letter', 5: 'legal', 9: 'a4', 8: 'a3', 3: 'tabloid' }
const PAPER_ID: Record<PageSetup['paper'], number | undefined> = { letter: undefined, legal: 5, a4: 9, a3: 8, tabloid: 3 }

// ---------- rich text ----------

/** Run settings that differ from the cell style. */
function richFromExcel(parts: { text: string; font?: Partial<EJ.Font> }[], base: Style): RichRun[] {
  return parts.map((p) => {
    const f = p.font
    if (!f) return { t: p.text }
    const st = styleFromExcel({ font: f })
    const s: RunStyle = {}
    if (!!st.bold !== !!base.bold) s.bold = !!st.bold
    if (!!st.italic !== !!base.italic) s.italic = !!st.italic
    if (!!st.strike !== !!base.strike) s.strike = !!st.strike
    if ((st.underline ?? null) !== (base.underline ?? null)) s.underline = st.underline ?? 'none'
    if (st.color && st.color !== (base.color ?? '#000000')) s.color = st.color
    if (st.size && st.size !== (base.size ?? DEFAULT_SIZE)) s.size = st.size
    if (st.font && st.font !== (base.font ?? DEFAULT_FONT)) s.font = st.font
    if (st.script) s.script = st.script
    return Object.keys(s).length ? { t: p.text, s } : { t: p.text }
  })
}

/** Complete font of a run for the file (each run carries all settings). */
function runFont(base: Style, r: RichRun): Partial<EJ.Font> {
  const st = runStyle(base, r.s)
  const f: Partial<EJ.Font> = { name: st.font ?? DEFAULT_FONT, size: st.size ?? DEFAULT_SIZE, color: argb(st.color ?? '#000000') }
  if (st.bold) f.bold = true
  if (st.italic) f.italic = true
  if (st.strike) f.strike = true
  if (st.underline) f.underline = st.underline
  if (st.script) f.vertAlign = st.script
  return f
}

// ---------- import ----------

export async function importXlsx(data: ArrayBuffer): Promise<Workbook> {
  const Excel = await load()
  const x = new Excel.Workbook()
  await x.xlsx.load(data)
  const themeXml = (x as unknown as { _themes?: Record<string, string> })._themes?.theme1
  theme = themeColors(themeXml)
  const wb = new Workbook(true)
  const fileTheme = themeFromXml(themeXml)
  if (fileTheme && fileTheme.name !== THEMES[0].name) wb.theme = fileTheme
  const styleCache = new Map<string, number>()
  const internStyle = (s: Partial<EJ.Style> | undefined): number => {
    if (!s || !Object.keys(s).length) return 0
    const key = JSON.stringify(s)
    let id = styleCache.get(key)
    if (id === undefined) {
      id = wb.styles.intern(styleFromExcel(s))
      styleCache.set(key, id)
    }
    return id
  }
  x.eachSheet((ws) => {
    const arrayRanges: Range[] = []
    const sheet = new Sheet(wb.newSheetId(), ws.name)
    wb.sheets.push(sheet)
    sheet.hidden = ws.state === 'hidden' || ws.state === 'veryHidden'
    sheet.tabColor = colorOf(ws.properties?.tabColor as EJ.Color | undefined)
    if (ws.properties?.defaultColWidth) sheet.cols.def = colPx(ws.properties.defaultColWidth)
    if (ws.properties?.defaultRowHeight && Math.abs(ws.properties.defaultRowHeight - 15) > 0.1) sheet.rows.def = rowPx(ws.properties.defaultRowHeight)
    const view = ws.views?.[0] as Partial<EJ.WorksheetViewFrozen & EJ.WorksheetViewCommon> | undefined
    if (view) {
      if (view.state === 'frozen') sheet.freeze = { rows: view.ySplit ?? 0, cols: view.xSplit ?? 0 }
      if (view.showGridLines === false) sheet.showGrid = false
      if (view.zoomScale) sheet.zoom = view.zoomScale
    }
    const cols = (ws as unknown as { _columns?: EJ.Column[] })._columns ?? []
    cols.forEach((col, i) => {
      if (!col) return
      if (col.width) sheet.cols.manual.set(i, colPx(col.width))
      if (col.hidden) sheet.cols.hidden.add(i)
      const st = internStyle(col.style)
      if (st) sheet.colStyle.set(i, st)
    })
    sheet.cols.touch()
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const r = rn - 1
      if (row.height && (row as unknown as { customHeight?: boolean }).customHeight !== false && Math.abs(row.height - 15) > 0.01) sheet.rows.manual.set(r, rowPx(row.height))
      if (row.hidden) sheet.rows.hidden.add(r)
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        const c = cn - 1
        if (c >= MAX_COLS) return
        const d: CellData = {}
        const s = internStyle(cell.style)
        if (s) d.s = s
        const v = cell.value as unknown
        if (cell.type === Excel.ValueType.Merge) {
          if (s) sheet.cells.set(cellKey(r, c), d)
          return
        }
        if (v && typeof v === 'object' && ('formula' in (v as object) || 'sharedFormula' in (v as object))) {
          const f = (cell as unknown as { formula?: string }).formula ?? (v as { formula?: string }).formula
          if (f) {
            d.f = importFormula(f)
            const res = (v as { result?: unknown }).result
            if (res !== undefined) d.cache = scalarOf(res)
            const arr = v as { shareType?: string; ref?: string }
            if (arr.shareType === 'array' && arr.ref) {
              const rg = parseRange(arr.ref.replace(/\$/g, ''))
              if (rg && (rg.r2 > rg.r1 || rg.c2 > rg.c1)) arrayRanges.push(rg)
            }
          } else if ((v as { result?: unknown }).result !== undefined) d.v = scalarOf((v as { result?: unknown }).result)
        } else if (v && typeof v === 'object' && 'hyperlink' in (v as object)) {
          d.v = String((v as { text?: unknown }).text ?? (v as { hyperlink: string }).hyperlink)
          d.link = (v as { hyperlink: string }).hyperlink
        } else if (v && typeof v === 'object' && 'richText' in (v as object)) {
          const runs = richFromExcel((v as { richText: { text: string; font?: Partial<EJ.Font> }[] }).richText ?? [], wb.styles.get(s))
          d.v = runs.map((r) => r.t).join('')
          if (runs.some((r) => r.s)) d.rich = runs
        } else {
          const sv = scalarOf(v)
          if (sv !== null && sv !== '') d.v = sv
        }
        if (d.v !== undefined || d.f !== undefined || d.s) sheet.cells.set(cellKey(r, c), d)
      })
    })
    sheet.rows.touch()
    // cells covered by an array formula hold cached results only: the formula spills into them again
    for (const rg of arrayRanges)
      for (let rr = rg.r1; rr <= rg.r2; rr++)
        for (let cc = rg.c1; cc <= rg.c2; cc++) {
          if (rr === rg.r1 && cc === rg.c1) continue
          const key = cellKey(rr, cc)
          const d = sheet.cells.get(key)
          if (!d || d.f !== undefined) continue
          if (d.s) sheet.cells.set(key, { s: d.s })
          else sheet.cells.delete(key)
        }
    const merges = ((ws as unknown as { model: { merges?: string[] } }).model.merges ?? []) as string[]
    for (const m of merges) {
      const rg = parseRange(m)
      if (rg) sheet.merges.push(rg)
    }
    const ps = ws.pageSetup
    if (ps) {
      sheet.page.orientation = ps.orientation === 'landscape' ? 'landscape' : 'portrait'
      sheet.page.paper = PAPER[Number(ps.paperSize ?? 1)] ?? 'letter'
      if (ps.margins) sheet.page.margins = { ...sheet.page.margins, ...ps.margins }
      sheet.page.fitToPage = !!ps.fitToPage
      if (ps.fitToPage) {
        sheet.page.fitWide = ps.fitToWidth ?? 1
        sheet.page.fitTall = ps.fitToHeight ?? 1
      }
      sheet.page.scale = ps.scale ?? 100
      sheet.page.printGridlines = !!ps.showGridLines
      sheet.page.printHeadings = !!ps.showRowColHeaders
      sheet.page.centerH = !!ps.horizontalCentered
      sheet.page.centerV = !!ps.verticalCentered
      if (ps.printArea) sheet.page.printArea = ps.printArea
      if (ps.printTitlesRow) sheet.page.printTitleRows = ps.printTitlesRow
    }
    sheet.page.header = ws.headerFooter?.oddHeader ?? undefined
    sheet.page.footer = ws.headerFooter?.oddFooter ?? undefined
    try {
      readWithExcelJS(ws, sheet, wb)
    } catch {
      // keep the cells even when extras cannot be read
    }
    sheet.touchUsed()
  })
  for (const dn of x.definedNames.model ?? []) {
    const n = dn as unknown as { name: string; ranges: string[]; localSheetId?: number }
    if (!n.name || n.name.startsWith('_xlnm.')) continue
    const scope = n.localSheetId !== undefined ? wb.sheets[n.localSheetId]?.id : undefined
    wb.setName({ name: n.name, ref: n.ranges.join(','), scope })
  }
  if (!wb.sheets.length) wb.addSheet()
  try {
    await readPackageExtras(data, wb)
  } catch (e) {
    console.warn('Some objects in this file could not be read', e)
  }
  return wb
}

// ---------- export ----------

export async function exportXlsx(wb: Workbook, engine: Engine): Promise<Blob> {
  const Excel = await load()
  const x = new Excel.Workbook()
  x.creator = APP_NAME
  x.lastModifiedBy = APP_NAME
  x.created = new Date()
  x.modified = new Date()
  const styleCache = new Map<number, Partial<EJ.Style>>()
  // defined names that share a function's name must not be written as eta-reduced LAMBDAs
  const nameSet = new Set([...wb.names.values()].map((n) => n.name.toUpperCase()))
  const ejStyle = (id: number) => {
    let s = styleCache.get(id)
    if (!s) styleCache.set(id, (s = styleToExcel(wb.styles.get(id))))
    return s
  }
  for (const sheet of wb.sheets) {
    const views: Partial<EJ.WorksheetView>[] = [
      sheet.freeze.rows || sheet.freeze.cols
        ? { state: 'frozen', xSplit: sheet.freeze.cols, ySplit: sheet.freeze.rows, topLeftCell: `${colName(sheet.freeze.cols)}${sheet.freeze.rows + 1}`, showGridLines: sheet.showGrid, zoomScale: sheet.zoom }
        : { state: 'normal', showGridLines: sheet.showGrid, zoomScale: sheet.zoom },
    ]
    const ws = x.addWorksheet(sheet.name, {
      views,
      state: sheet.hidden ? 'hidden' : 'visible',
      properties: { tabColor: sheet.tabColor ? argb(sheet.tabColor) : undefined, defaultColWidth: colChars(sheet.cols.def), defaultRowHeight: rowPt(sheet.rows.def) } as Partial<EJ.WorksheetProperties>,
      pageSetup: {
        orientation: sheet.page.orientation,
        paperSize: PAPER_ID[sheet.page.paper] as EJ.PaperSize | undefined,
        margins: sheet.page.margins,
        fitToPage: sheet.page.fitToPage,
        fitToWidth: sheet.page.fitToPage ? sheet.page.fitWide ?? 1 : undefined,
        fitToHeight: sheet.page.fitToPage ? sheet.page.fitTall ?? 0 : undefined,
        scale: sheet.page.scale,
        showGridLines: sheet.page.printGridlines,
        showRowColHeaders: sheet.page.printHeadings,
        horizontalCentered: sheet.page.centerH,
        verticalCentered: sheet.page.centerV,
        printArea: sheet.page.printArea,
        printTitlesRow: sheet.page.printTitleRows,
      },
    })
    if (sheet.page.header || sheet.page.footer) ws.headerFooter = { oddHeader: sheet.page.header, oddFooter: sheet.page.footer } as EJ.HeaderFooter
    const colKeys = new Set<number>([...sheet.cols.manual.keys(), ...sheet.cols.hidden, ...sheet.colStyle.keys()])
    for (const c of colKeys) {
      if (c >= 16384) continue
      const col = ws.getColumn(c + 1)
      col.width = colChars(sheet.cols.rawSize(c))
      if (sheet.cols.hidden.has(c)) col.hidden = true
      const st = sheet.colStyle.get(c)
      if (st) col.style = ejStyle(st)
    }
    const rowKeys = new Set<number>([...sheet.rows.manual.keys(), ...sheet.rows.hidden, ...sheet.rowStyle.keys()])
    for (const r of rowKeys) {
      const row = ws.getRow(r + 1)
      if (sheet.rows.manual.has(r)) row.height = rowPt(sheet.rows.manual.get(r)!)
      if (sheet.rows.hidden.has(r)) row.hidden = true
      const st = sheet.rowStyle.get(r)
      if (st) (row as unknown as { style: Partial<EJ.Style> }).style = ejStyle(st)
    }
    const keys = [...sheet.cells.keys()].sort((a, b) => a - b)
    for (const k of keys) {
      const d = sheet.cells.get(k)!
      const r = keyRow(k)
      const c = keyCol(k)
      const cell = ws.getCell(r + 1, c + 1)
      if (d.f !== undefined) {
        const res = engine.display(sheet, r, c)
        const result = res instanceof CellError ? { error: res.code as EJ.CellErrorValue['error'] } : res ?? undefined
        const sp = sheet.spills.get(k)
        if (sp) {
          const range = `${colName(c)}${r + 1}:${colName(c + sp.cols - 1)}${r + sp.rows}`
          const results = sp.matrix.data.map((v) => (v instanceof CellError ? 0 : (v as string | number | boolean | null) ?? 0))
          ;(ws as unknown as { fillFormula: (a: string, b: string, c: unknown, d: string) => void }).fillFormula(range, exportFormula(d.f, nameSet), results, 'array')
        } else cell.value = { formula: exportFormula(d.f, nameSet), result } as EJ.CellFormulaValue
      } else if (d.rich && typeof d.v === 'string') cell.value = { richText: d.rich.map((r) => ({ text: r.t, font: runFont(wb.styles.get(d.s), r) })) } as EJ.CellRichTextValue
      else if (d.link) cell.value = { text: String(d.v ?? d.link), hyperlink: d.link }
      else if (d.v instanceof CellError) cell.value = { error: d.v.code as EJ.CellErrorValue['error'] }
      else if (d.v !== undefined && d.v !== null) cell.value = d.v
      if (d.s) cell.style = ejStyle(d.s)
    }
    for (const m of sheet.merges) ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1)
    writeWithExcelJS(ws, sheet)
  }
  for (const n of wb.names.values()) {
    try {
      if (/^('?[^!]+'?!)?\$?[A-Z]{1,3}\$?\d+(:\$?[A-Z]{1,3}\$?\d+)?$/.test(n.ref)) x.definedNames.add(n.ref, n.name)
    } catch {
      // complex names (formulas, constants) are not supported by the writer
    }
  }
  const buf = await x.xlsx.writeBuffer()
  return postProcess(buf as ArrayBuffer, wb, engine)
}

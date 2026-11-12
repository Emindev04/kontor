// The document controller: workbook + calculation engine + selection + undo/redo.
// UI components read from it and call its commands; every change goes through `transact`.
import { registerTableStyles } from '../model/tableStyles'
import { setCurrentTheme } from '../model/theme'
import { DEFAULT_DOC_TITLE } from '../brand'
import {
  MAX_COLS, MAX_ROWS, cellKey, cellName, intersect, isFullCols, isFullRows, keyCol, keyRow, normalize, quoteSheet, rangeOf, type Cell, type Range,
} from '../model/address'
import { classifyFormat } from '../model/numfmt'
import { parseInput } from '../model/parseInput'
import { localizeNumberText, numberSymbols } from '../model/numberLocale'
import type { CellData, RichRun, Sheet } from '../model/sheet'
import { DEFAULT_FONT, DEFAULT_SIZE, type Style, type StylePatch } from '../model/style'
import type { Scalar } from '../model/types'
import { Workbook, type ChangeRecord } from '../model/workbook'
import { Engine } from '../engine/engine'
import { ParseError, parseFormula } from '../engine/parser'
import { tokenize } from '../engine/tokenizer'
import { refText, shiftFormula } from '../engine/refs'
import { fromR1C1, toR1C1 } from '../engine/r1c1'
import { toCanonicalFormula, toLocalFormula } from '../engine/localize'
import { prefs } from '../model/prefs'
import { Tx, captureAfter, restoreFull, restoreProps, restoreWb, type HistoryEntry } from './history'
import { afterTyping } from './tables'
import { authorName, blocked } from './review'
import { recordStep, type Recorder } from './macros'
import { validateInput } from './validation'
import { applyRichPatch, normalizeRuns, runsText, spliceRuns, stripRunKeys } from './richText'
import { t, tx } from '../i18n'

export type Sel = { ranges: Range[]; active: Cell; anchor: Cell; head: Cell }

export type EditState = {
  sheetId: number
  r: number
  c: number
  text: string
  /** "enter": typing replaced the cell, arrows commit; "edit": F2 / double-click, arrows move the caret. */
  mode: 'enter' | 'edit'
  caret: number
  /** Range of the reference inserted by pointing, so the next arrow/click replaces it. */
  point: { start: number; end: number } | null
  /** Cell and anchor of the pointed reference (arrow keys move it). */
  pointCell?: Cell
  pointAnchor?: Cell
  source: 'cell' | 'bar'
  /** Selected autocomplete item, and whether the list was dismissed with Esc. */
  ac?: number
  acOff?: boolean
  original: string
  /** Formatted runs while editing a text cell with mixed formatting. */
  rich?: RichRun[]
}

export type ClipData = {
  sheetId: number
  range: Range
  cut: boolean
  cells: (CellData | undefined)[][]
  colWidths: number[]
  text: string
}

export type Measurer = (text: string, style: Style) => number

export class FormulaError extends Error {}

/** Returned by commitEdit while the user is asked to confirm (not an error to show). */
export const PENDING = '\u0000'

const cloneSel = (s: Sel): Sel => structuredClone(s)
const defaultSel = (): Sel => ({ ranges: [rangeOf(0, 0)], active: { r: 0, c: 0 }, anchor: { r: 0, c: 0 }, head: { r: 0, c: 0 } })

/** Normalizes a formula the way the original does on entry: upper-case functions and references, close parentheses. */
export function normalizeFormula(body: string): string {
  let out = ''
  let depth = 0
  for (const t of tokenize(body)) {
    if (t.type === 'func') out += t.text.toUpperCase()
    else if (t.type === 'ref') out += refText(t.ref!)
    else if (t.type === 'bool') out += t.text.toUpperCase()
    else if (t.type === 'err') out += t.text.toUpperCase()
    else out += t.text
    if (t.type === 'lparen') depth++
    if (t.type === 'rparen') depth--
  }
  while (depth-- > 0) out += ')'
  return out
}

export class Doc {
  wb: Workbook
  engine: Engine
  title = DEFAULT_DOC_TITLE
  activeIndex = 0
  sels = new Map<number, Sel>()
  scroll = new Map<number, { x: number; y: number }>()
  edit: EditState | null = null
  clip: ClipData | null = null
  undoStack: HistoryEntry[] = []
  redoStack: HistoryEntry[] = []
  version = 0
  modified = false
  measure: Measurer = (text, style) => text.length * ((style.size ?? DEFAULT_SIZE) * 0.6)
  /** Re-runs the last command (F4 / Ctrl+Y with nothing to redo). */
  lastCommand: (() => void) | null = null
  status = ''
  /** Column where a Tab-Tab-Enter data entry run started (Enter returns there). */
  tabStart: number | undefined
  /** Formula auditing arrows (Trace Precedents / Dependents). */
  traces: { sheetId: number; from: Range; to: Cell }[] = []
  /** Active Draw tool, null when selecting cells. */
  tool: { kind: 'pen' | 'highlighter' | 'eraser'; color: string; width: number } | null = null
  /** Selected floating object (chart, picture, shape) on the active sheet. */
  selObj: number | null = null
  /** Further selected objects (Ctrl/Shift+click, or the other members of a group). */
  selObjs: number[] = []
  /** Macro being recorded (View > Macros > Record Macro). */
  recorder: Recorder | null = null
  /** Use Relative References for the next recording. */
  macroRelative = false
  /** View > Hide: the workbook window is hidden (the grid is not shown). */
  windowHidden = false
  /** Cells marked by Circle Invalid Data. */
  circles: { r: number; c: number }[] = []
  /** Shape being drawn with the mouse after choosing it in the Shapes gallery. */
  drawShape: { shape: string; textBox: boolean } | null = null
  /** Review > Hide Ink: ink strokes stay in the workbook but are not drawn. */
  hideInk = false
  /** Grouped sheets (Ctrl/Shift+click on sheet tabs): typing, formatting and clearing apply to all of them. */
  group = new Set<number>()
  private inGroup = false
  /** Clipboard task pane: the last copied ranges (text and HTML), newest first. */
  clipHistory: { label: string; text: string; html: string }[] = []
  /** Image made by Copy as Picture (data URL). */
  pictureClip: string | null = null
  /** Draw Border / Draw Border Grid / Erase Border: applied to each range the user drags over until Esc. */
  borderPen: { mode: 'outside' | 'all' | 'none'; style: { style: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double'; color: string } } | null = null
  /** Shows a message to the user (set by the app shell; protected sheets, validation …). */
  onReport: ((message: string, title?: string) => void) | null = null
  /** Asks the user to confirm a warning-style validation failure. */
  onAsk: ((message: string, title: string, onYes: () => void) => void) | null = null
  private listeners = new Set<() => void>()
  private tx: Tx | null = null

  constructor(wb?: Workbook) {
    if (wb) {
      registerTableStyles(wb.tableStyles)
      setCurrentTheme(wb.theme)
    } else setCurrentTheme(undefined)
    this.wb = wb ?? new Workbook()
    this.engine = new Engine(this.wb)
    this.engine.rebuild()
  }

  report(message: string, title?: string) {
    if (this.onReport) this.onReport(message, title)
    else console.warn(message)
  }

  // ---------- store ----------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  emit() {
    this.version++
    for (const l of this.listeners) l()
  }

  load(wb: Workbook, title: string) {
    this.wb = wb
    registerTableStyles(wb.tableStyles)
    setCurrentTheme(wb.theme)
    this.engine = new Engine(wb)
    this.engine.rebuild()
    this.title = title
    this.activeIndex = Math.max(0, wb.sheets.findIndex((s) => !s.hidden))
    this.sels.clear()
    this.scroll.clear()
    this.edit = null
    this.clip = null
    this.selObj = null
    this.selObjs = []
    this.undoStack = []
    this.redoStack = []
    this.modified = false
    this.recomputeAllAutoHeights()
    this.emit()
  }

  get sheet(): Sheet {
    return this.wb.sheets[this.activeIndex] ?? this.wb.sheets[0]
  }

  /** True while several sheets are grouped for editing ("[Group]" in the title bar). */
  get grouped() {
    return this.group.size > 1 && this.group.has(this.sheet.id)
  }

  /** Runs an edit once per grouped sheet, at the same addresses, as one undo step. */
  private forGroup(label: string, fn: () => void): boolean {
    if (!this.grouped || this.inGroup) return false
    const keep = this.activeIndex
    const ids = this.wb.sheets.filter((s) => this.group.has(s.id)).map((s) => s.id)
    this.inGroup = true
    try {
      this.transact(label, () => {
        for (const id of ids) {
          const i = this.wb.sheets.findIndex((s) => s.id === id)
          if (i < 0) continue
          this.activeIndex = i
          fn()
        }
      })
    } finally {
      this.activeIndex = keep
      this.inGroup = false
    }
    return true
  }

  get sel(): Sel {
    let s = this.sels.get(this.sheet.id)
    if (!s) this.sels.set(this.sheet.id, (s = defaultSel()))
    return s
  }

  set sel(s: Sel) {
    this.sels.set(this.sheet.id, s)
  }

  get activeRange(): Range {
    const s = this.sel
    return s.ranges[s.ranges.length - 1]
  }

  // ---------- transactions & history ----------

  transact(label: string, fn: (tx: Tx) => void): boolean {
    if (this.tx) {
      fn(this.tx)
      return true
    }
    const tx = new Tx(label)
    this.tx = tx
    const selBefore = cloneSel(this.sel)
    const sheetBefore = this.sheet.id
    try {
      fn(tx)
    } finally {
      this.tx = null
    }
    if (tx.empty) {
      this.emit()
      return false
    }
    const after = captureAfter(tx, this.wb)
    const change = this.recordChange(label, tx)
    if (this.recorder) recordStep(this, label, tx)
    this.undoStack.push({ change, label, before: tx, after, selBefore, selAfter: cloneSel(this.sel), sheetBefore, sheetAfter: this.sheet.id })
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    this.afterChange(tx.structural, tx.changed)
    this.modified = true
    this.emit()
    return true
  }

  /** Adds an entry to Review > Show Changes. */
  private recordChange(label: string, tx: Tx) {
    const text = (d: CellData | undefined) => (d?.f !== undefined ? '=' + d.f : d?.v === undefined || d.v === null ? '' : typeof d.v === 'object' ? d.v.code : String(d.v))
    const cells: ChangeRecord['cells'] = []
    let count = 0
    let sheetName = this.sheet.name
    tx.cells.forEach((m, sheet) => {
      m.forEach((old, k) => {
        const now = sheet.cells.get(k)
        if (text(old) === text(now)) return
        count++
        sheetName = sheet.name
        if (cells.length < 20) cells.push({ r: keyRow(k), c: keyCol(k), old: text(old), new: text(now) })
      })
    })
    const record: ChangeRecord = { label, author: authorName(), time: new Date().toISOString(), sheet: sheetName, cells, count }
    this.wb.changes.push(record)
    if (this.wb.changes.length > 500) this.wb.changes.splice(0, this.wb.changes.length - 500)
    return record
  }

  private afterChange(structural: boolean, changed: Map<Sheet, Set<number>>) {
    if (structural) {
      this.engine.rebuild()
      this.recomputeAllAutoHeights()
    } else {
      changed.forEach((keys, sheet) => this.engine.cellsChanged(sheet, keys))
      this.engine.recalc()
      changed.forEach((keys, sheet) => this.updateAutoHeights(sheet, new Set([...keys].map(keyRow))))
    }
  }

  private applySnapshot(part: HistoryEntry['after'] | Tx) {
    const changed = new Map<Sheet, Set<number>>()
    if (part.wb) restoreWb(this.wb, part.wb)
    part.full.forEach((snap, sheet) => restoreFull(sheet, snap))
    part.props.forEach((p, sheet) => restoreProps(sheet, p))
    part.cells.forEach((m, sheet) => {
      const set = new Set<number>()
      m.forEach((v, k) => {
        sheet.setRaw(k, v)
        set.add(k)
      })
      changed.set(sheet, set)
    })
    const structural = !!part.wb || part.full.size > 0
    this.afterChange(structural, changed)
  }

  private focusSheet(id: number) {
    const i = this.wb.sheets.findIndex((s) => s.id === id)
    if (i >= 0) this.activeIndex = i
    else this.activeIndex = Math.min(this.activeIndex, this.wb.sheets.length - 1)
  }

  undo() {
    const e = this.undoStack.pop()
    if (!e) return
    this.edit = null
    this.applySnapshot(e.before)
    if (e.change) this.wb.changes = this.wb.changes.filter((c) => c !== e.change)
    this.redoStack.push(e)
    this.focusSheet(e.sheetBefore)
    this.sel = cloneSel(e.selBefore as Sel)
    this.modified = true
    this.emit()
  }

  redo() {
    const e = this.redoStack.pop()
    if (!e) {
      this.lastCommand?.()
      return
    }
    this.edit = null
    this.applySnapshot(e.after)
    if (e.change) this.wb.changes.push(e.change)
    this.undoStack.push(e)
    this.focusSheet(e.sheetAfter)
    this.sel = cloneSel(e.selAfter as Sel)
    this.modified = true
    this.emit()
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  /** Low-level cell write inside a transaction. */
  write(sheet: Sheet, r: number, c: number, data: CellData | undefined) {
    const key = cellKey(r, c)
    this.tx?.noteCell(sheet, key)
    sheet.setRaw(key, data)
  }

  writeKey(sheet: Sheet, key: number, data: CellData | undefined) {
    this.tx?.noteCell(sheet, key)
    sheet.setRaw(key, data)
  }

  noteProps(sheet: Sheet) {
    this.tx?.noteProps(sheet)
  }

  noteFull(sheet: Sheet) {
    this.tx?.noteFull(sheet)
  }

  noteWorkbook() {
    this.tx?.noteWorkbook(this.wb)
  }

  // ---------- auto row heights ----------

  private rowAutoHeight(sheet: Sheet, r: number): number | null {
    let max = 0
    const visit = (d: CellData | undefined, c: number) => {
      const st = this.wb.styles.get(d?.s ?? sheet.rowStyle.get(r) ?? sheet.colStyle.get(c))
      let size = st.size ?? DEFAULT_SIZE
      if (d?.rich) for (const run of d.rich) size = Math.max(size, run.s?.size ?? 0)
      let h = Math.ceil(size * 1.3333 * 1.364)
      if (st.wrap && d && (d.v !== undefined || d.f !== undefined)) {
        const v = d.f !== undefined ? this.engine.display(sheet, r, c) : d.v
        if (v !== null && v !== undefined) {
          const text = String(typeof v === 'object' ? (v as { code: string }).code : v)
          const merge = sheet.mergeAt(r, c)
          if (merge && merge.r1 !== merge.r2) return
          const width = merge ? sheet.cols.offset(merge.c2 + 1) - sheet.cols.offset(merge.c1) : sheet.cols.size(c)
          const lines = this.wrapLines(text, st, Math.max(8, width - 6))
          h = Math.ceil(lines * size * 1.3333 * 1.22 + 6)
        }
      } else if (d && typeof d.v === 'string' && d.v.includes('\n')) {
        h = Math.ceil(d.v.split('\n').length * size * 1.3333 * 1.22 + 6)
      }
      if (h > max) max = h
    }
    const used = sheet.used()
    for (let c = 0; c <= used.c; c++) {
      const d = sheet.cells.get(cellKey(r, c))
      if (d) visit(d, c)
    }
    if (sheet.rowStyle.has(r)) visit(undefined, 0)
    if (max <= sheet.rows.def) return null
    return max
  }

  wrapLines(text: string, style: Style, width: number): number {
    let lines = 0
    for (const para of text.split('\n')) {
      const words = para.split(/(\s+)/)
      let line = ''
      lines++
      for (const w of words) {
        const next = line + w
        if (line && this.measure(next.trimEnd(), style) > width) {
          lines++
          line = w.trimStart()
        } else line = next
      }
    }
    return lines
  }

  updateAutoHeights(sheet: Sheet, rows: Iterable<number>) {
    let touched = false
    for (const r of rows) {
      if (sheet.rows.manual.has(r)) continue
      const h = this.rowAutoHeight(sheet, r)
      const old = sheet.rows.auto.get(r)
      if (h === null) {
        if (old !== undefined) {
          sheet.rows.auto.delete(r)
          touched = true
        }
      } else if (old !== h) {
        sheet.rows.auto.set(r, h)
        touched = true
      }
    }
    if (touched) sheet.rows.touch()
  }

  recomputeAllAutoHeights() {
    for (const sheet of this.wb.sheets) {
      sheet.rows.auto.clear()
      const rows = new Set<number>()
      for (const [k, d] of sheet.cells) {
        const st = this.wb.styles.get(d.s)
        if (st.wrap || (st.size && st.size > DEFAULT_SIZE) || (typeof d.v === 'string' && d.v.includes('\n')) || d.rich) rows.add(keyRow(k))
      }
      sheet.rowStyle.forEach((_s, r) => rows.add(r))
      sheet.rows.touch()
      this.updateAutoHeights(sheet, rows)
    }
  }

  // ---------- reading ----------

  style(r: number, c: number, sheet = this.sheet): Style {
    return this.wb.styles.get(sheet.styleId(r, c))
  }

  value(r: number, c: number, sheet = this.sheet): Scalar {
    return this.engine.display(sheet, r, c)
  }

  /** Text shown in the formula bar / edit box for a cell. */
  inputText(r: number, c: number, sheet = this.sheet): string {
    const d = sheet.get(r, c)
    if (!d) {
      const anchor = sheet.spillOwner.get(cellKey(r, c))
      if (anchor !== undefined) {
        const f = sheet.cells.get(anchor)?.f
        return f !== undefined ? '=' + toLocalFormula(prefs().r1c1 ? toR1C1(f, keyRow(anchor), keyCol(anchor)) : f) : ''
      }
      return ''
    }
    if (d.f !== undefined) return '=' + toLocalFormula(prefs().r1c1 ? toR1C1(d.f, r, c) : d.f)
    const v = d.v
    if (v === undefined || v === null) return ''
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    if (typeof v === 'object') return v.code
    if (typeof v === 'number') {
      const st = this.wb.styles.get(d.s)
      const kind = classifyFormat(st.fmt)
      if (kind === 'date' || kind === 'time') return this.dateInputText(v, kind === 'time')
      // numbers in the edit box use the interface language's decimal separator (no grouping)
      const sym = numberSymbols()
      if (kind === 'percentage') return `${localizeNumberText(String(Number((v * 100).toPrecision(15))), sym)}%`
      return localizeNumberText(String(Number(v.toPrecision(15))), sym)
    }
    const p = parseInput(v, numberSymbols())
    const looksNumeric = p.kind !== 'value' || typeof p.v !== 'string'
    return looksNumeric ? "'" + v : v
  }

  private dateInputText(v: number, timeOnly: boolean): string {
    const days = Math.floor(v)
    const frac = v - days
    const secs = Math.round(frac * 86400)
    const h = Math.floor(secs / 3600)
    const m = Math.floor(secs / 60) % 60
    const s = secs % 60
    const time = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
    if (timeOnly) return time
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86400000)
    const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
    return secs ? `${date} ${time}` : date
  }

  // ---------- selection ----------

  /** Expands a range so that it fully contains every merged area it touches. */
  expandMerges(rg: Range, sheet = this.sheet): Range {
    let out = { ...rg }
    let changed = true
    while (changed) {
      changed = false
      for (const m of sheet.merges) {
        if (m.r1 <= out.r2 && m.r2 >= out.r1 && m.c1 <= out.c2 && m.c2 >= out.c1) {
          const u = { r1: Math.min(out.r1, m.r1), c1: Math.min(out.c1, m.c1), r2: Math.max(out.r2, m.r2), c2: Math.max(out.c2, m.c2) }
          if (u.r1 !== out.r1 || u.c1 !== out.c1 || u.r2 !== out.r2 || u.c2 !== out.c2) {
            out = u
            changed = true
          }
        }
      }
    }
    return out
  }

  select(cell: Cell, opts: { extend?: boolean; add?: boolean } = {}) {
    this.tabStart = undefined
    this.selObj = null
    this.selObjs = []
    const s = this.sel
    const c = { r: clamp(cell.r, 0, MAX_ROWS - 1), c: clamp(cell.c, 0, MAX_COLS - 1) }
    if (opts.extend) {
      const rg = this.expandMerges(normalize(s.anchor, c))
      const ranges = s.ranges.slice(0, -1).concat(rg)
      this.sel = { ranges, active: s.active, anchor: s.anchor, head: c }
    } else {
      const m = this.sheet.mergeAt(c.r, c.c)
      const rg = m ?? rangeOf(c.r, c.c)
      const active = m ? { r: m.r1, c: m.c1 } : c
      this.sel = { ranges: opts.add ? s.ranges.concat(rg) : [rg], active, anchor: active, head: c }
    }
    this.emit()
  }

  selectRange(rg: Range, active?: Cell, add = false) {
    this.selObj = null
    this.selObjs = []
    const s = this.sel
    const a = active ?? { r: rg.r1, c: rg.c1 }
    this.sel = { ranges: add ? s.ranges.concat(rg) : [rg], active: a, anchor: a, head: { r: rg.r2, c: rg.c2 } }
    this.emit()
  }

  selectAll() {
    this.selectRange({ r1: 0, c1: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 }, this.sel.active)
  }

  /** Moves the active cell (or the extend head) one step, skipping hidden rows/columns and merged areas. */
  move(dr: number, dc: number, extend = false) {
    const s = this.sel
    const sheet = this.sheet
    const from = extend ? s.head : s.active
    let r = from.r
    let c = from.c
    const m = sheet.mergeAt(r, c)
    if (dr) r = sheet.rows.step(dr > 0 && m && !extend ? m.r2 : dr < 0 && m && !extend ? m.r1 : r, dr > 0 ? 1 : -1)
    if (dc) c = sheet.cols.step(dc > 0 && m && !extend ? m.c2 : dc < 0 && m && !extend ? m.c1 : c, dc > 0 ? 1 : -1)
    this.select({ r, c }, { extend })
  }

  /** Ctrl+Arrow: jump to the edge of the current data region. */
  moveEdge(dr: number, dc: number, extend = false) {
    const s = this.sel
    const sheet = this.sheet
    const from = extend ? s.head : s.active
    const used = sheet.used()
    const has = (r: number, c: number) => sheet.hasValue(r, c)
    let r = from.r
    let c = from.c
    const maxR = MAX_ROWS - 1
    const maxC = MAX_COLS - 1
    const inBounds = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr <= maxR && cc <= maxC
    const next = (rr: number, cc: number) => [rr + dr, cc + dc] as const
    const [nr, nc] = next(r, c)
    if (!inBounds(nr, nc)) return this.select({ r, c }, { extend })
    if (has(r, c) && has(nr, nc)) {
      while (true) {
        const [ar, ac] = next(r, c)
        if (!inBounds(ar, ac) || !has(ar, ac)) break
        r = ar
        c = ac
      }
    } else {
      r = nr
      c = nc
      while (!has(r, c)) {
        const beyond = (dr > 0 && r > used.r) || (dc > 0 && c > used.c) || (dr < 0 && r <= 0) || (dc < 0 && c <= 0)
        if (beyond) {
          if (dr > 0) r = maxR
          if (dc > 0) c = maxC
          if (dr < 0) r = 0
          if (dc < 0) c = 0
          break
        }
        const [ar, ac] = next(r, c)
        if (!inBounds(ar, ac)) break
        r = ar
        c = ac
      }
    }
    this.select({ r, c }, { extend })
  }

  /** Enter/Tab inside a multi-cell selection cycles the active cell without collapsing it. */
  cycle(dr: number, dc: number): boolean {
    const s = this.sel
    const rg = this.activeRange
    if (s.ranges.length === 1 && rg.r1 === rg.r2 && rg.c1 === rg.c2) return false
    const own = this.expandMerges(rangeOf(s.active.r, s.active.c))
    if (s.ranges.length === 1 && own.r1 === rg.r1 && own.r2 === rg.r2 && own.c1 === rg.c1 && own.c2 === rg.c2) return false
    let { r, c } = s.active
    const box = rg
    if (dc) {
      c += dc
      if (c > box.c2) {
        c = box.c1
        r = r + 1 > box.r2 ? box.r1 : r + 1
      } else if (c < box.c1) {
        c = box.c2
        r = r - 1 < box.r1 ? box.r2 : r - 1
      }
    } else {
      r += dr
      if (r > box.r2) {
        r = box.r1
        c = c + 1 > box.c2 ? box.c1 : c + 1
      } else if (r < box.r1) {
        r = box.r2
        c = c - 1 < box.c1 ? box.c2 : c - 1
      }
    }
    this.sel = { ...s, active: { r, c } }
    this.emit()
    return true
  }

  setActiveSheet(i: number) {
    if (i < 0 || i >= this.wb.sheets.length || this.wb.sheets[i].hidden) return
    this.activeIndex = i
    this.edit = null
    this.selObj = null
    this.selObjs = []
    this.emit()
  }

  // ---------- cell input ----------

  /**
   * Validates and normalizes typed input. Throws FormulaError for broken formulas. Formulas are typed
   * in the interface language (function names, ';' and decimal commas) and stored in English; so are
   * plain numbers ("1.234,5" in German is stored as 1234.5).
   */
  prepareInput(text: string): { data: Pick<CellData, 'v' | 'f'>; fmt?: string } {
    const p = parseInput(text, numberSymbols())
    if (p.kind === 'formula') {
      const body = normalizeFormula(toCanonicalFormula(p.f))
      try {
        parseFormula(body)
      } catch (e) {
        throw new FormulaError(e instanceof ParseError ? e.message : t('There is a problem with this formula.'))
      }
      return { data: { f: body } }
    }
    return { data: { v: p.v }, fmt: p.fmt }
  }

  /** Writes typed text to a cell (or every selected cell for Ctrl+Enter), keeping its style. */
  setInput(r: number, c: number, text: string, fillSelection = false, rich?: RichRun[]) {
    if (this.forGroup(t('Typing "{text}" in {cell}', { text: text.slice(0, 20), cell: cellName(r, c) }), () => this.setInput(r, c, text, fillSelection, rich))) return
    const sheet = this.sheet
    if (blocked(this, 'cells', fillSelection ? this.sel.ranges : [{ r1: r, c1: c, r2: r, c2: c }])) return
    if (prefs().r1c1 && /^[=+]/.test(text) && text.length > 1) text = text[0] + fromR1C1(text.slice(1), r, c)
    const prepared = this.prepareInput(text)
    const targets: Cell[] = []
    if (fillSelection) {
      for (const rg of this.sel.ranges) {
        const b = this.boundToUsed(rg)
        for (let rr = b.r1; rr <= b.r2; rr++) for (let cc = b.c1; cc <= b.c2; cc++) targets.push({ r: rr, c: cc })
      }
    } else targets.push({ r, c })
    this.transact(t('Typing "{text}" in {cell}', { text: text.slice(0, 20), cell: cellName(r, c) }), () => {
      for (const t of targets) {
        const old = sheet.get(t.r, t.c)
        let data: CellData = { ...prepared.data }
        if (data.f !== undefined && (t.r !== r || t.c !== c)) {
          data = { f: shiftF(data.f, t.r - r, t.c - c) }
        }
        let s = old?.s ?? sheet.styleId(t.r, t.c)
        const st = this.wb.styles.get(s)
        const kind = classifyFormat(st.fmt)
        if (prepared.fmt && (kind === 'general' || (kind === 'number' && prepared.fmt.includes('%')))) s = this.wb.styles.patch(s, { fmt: prepared.fmt })
        if (typeof data.v === 'number' && kind === 'percentage' && !text.trim().endsWith('%')) data.v = data.v / 100
        if (typeof data.v === 'string' && kind === 'general' && text.includes('\n')) s = this.wb.styles.patch(s, { wrap: true })
        if (old?.link) data.link = old.link
        if (rich && typeof data.v === 'string' && runsText(rich) === data.v) data.rich = rich
        if (s) data.s = s
        if (data.v === null) delete data.v
        this.write(sheet, t.r, t.c, data)
      }
      if (sheet.x.tables.length) for (const t of targets) afterTyping(this, sheet, t.r, t.c)
    })
  }

  /** Clamps huge selections (whole columns) to the used range for content operations. */
  boundToUsed(rg: Range, sheet = this.sheet): Range {
    const u = sheet.used()
    return { r1: rg.r1, c1: rg.c1, r2: Math.min(rg.r2, Math.max(u.r, rg.r1)), c2: Math.min(rg.c2, Math.max(u.c, rg.c1)) }
  }

  // ---------- formatting ----------

  /** Applies a style change to the selection (or given ranges). Whole rows/columns use row/column styles. */
  applyStyle(patch: StylePatch | ((s: Style, r: number, c: number) => StylePatch), ranges = this.sel.ranges, label = tx('Format Cells')) {
    if (!this.edit && this.forGroup(label, () => this.applyStyle(patch, ranges, label))) return
    const sheet = this.sheet
    if (blocked(this, 'formatCells')) return
    // while editing text, font changes apply to the selected characters
    if (this.edit && applyRichPatch(this, typeof patch === 'function' ? (st) => patch(st, this.edit!.r, this.edit!.c) : patch)) return
    const styles = this.wb.styles
    const get = (id: number | undefined, r: number, c: number) => {
      const p = typeof patch === 'function' ? patch(styles.get(id), r, c) : patch
      return styles.patch(id, p)
    }
    // a font setting for the whole cell replaces the same setting inside rich text runs
    const withRuns = (d: CellData, r: number, c: number): CellData => {
      if (!d.rich) return d
      const keys = Object.keys(typeof patch === 'function' ? patch(styles.get(d.s), r, c) : patch)
      const rich = stripRunKeys(d.rich, keys)
      return rich === d.rich ? d : { ...d, rich }
    }
    this.transact(label, () => {
      for (const rg of ranges) {
        if (isFullCols(rg) || isFullRows(rg)) {
          this.noteProps(sheet)
          if (isFullCols(rg) && !isFullRows(rg)) for (let c = rg.c1; c <= rg.c2; c++) sheet.colStyle.set(c, get(sheet.colStyle.get(c), 0, c))
          else if (isFullRows(rg) && !isFullCols(rg)) for (let r = rg.r1; r <= rg.r2; r++) sheet.rowStyle.set(r, get(sheet.rowStyle.get(r), r, 0))
          else {
            for (let c = 0; c < MAX_COLS; c++) sheet.colStyle.set(c, get(sheet.colStyle.get(c), 0, c))
            sheet.rowStyle.forEach((id, r) => sheet.rowStyle.set(r, get(id, r, 0)))
          }
          for (const [k, d] of [...sheet.cells]) {
            const r = keyRow(k)
            const c = keyCol(k)
            if (r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2) this.writeKey(sheet, k, { ...withRuns(d, r, c), s: get(d.s ?? sheet.styleId(r, c), r, c) })
          }
          continue
        }
        for (let r = rg.r1; r <= rg.r2; r++)
          for (let c = rg.c1; c <= rg.c2; c++) {
            const d = sheet.get(r, c)
            const s = get(d?.s ?? sheet.styleId(r, c), r, c)
            const nd = d ? withRuns(d, r, c) : d
            if ((d?.s ?? 0) === s && d && nd === d) continue
            if (!d && !s) continue
            this.write(sheet, r, c, { ...(nd ?? {}), s: s || undefined })
          }
      }
    })
    this.lastCommand = () => this.applyStyle(patch, this.sel.ranges, label)
  }

  /** Applies borders like the Borders dropdown. */
  applyBorders(mode: BorderMode, style: Style['bt'] = { style: 'thin', color: '#000000' }, ranges = this.sel.ranges) {
    const b = style!
    this.applyStyle((s, r, c) => {
      const rg = ranges.find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2)!
      const top = r === rg.r1
      const bottom = r === rg.r2
      const left = c === rg.c1
      const right = c === rg.c2
      const p: StylePatch = {}
      const thick = { style: 'thick' as const, color: b.color }
      const dbl = { style: 'double' as const, color: b.color }
      switch (mode) {
        case 'none': return { bt: undefined, bb: undefined, bl: undefined, br: undefined, bdd: undefined, bdu: undefined }
        case 'all': return { bt: b, bb: b, bl: b, br: b }
        case 'outside':
          if (top) p.bt = b
          if (bottom) p.bb = b
          if (left) p.bl = b
          if (right) p.br = b
          return p
        case 'thickOutside':
          if (top) p.bt = thick
          if (bottom) p.bb = thick
          if (left) p.bl = thick
          if (right) p.br = thick
          return p
        case 'bottom': return bottom ? { bb: b } : {}
        case 'top': return top ? { bt: b } : {}
        case 'left': return left ? { bl: b } : {}
        case 'right': return right ? { br: b } : {}
        case 'bottomDouble': return bottom ? { bb: dbl } : {}
        case 'thickBottom': return bottom ? { bb: thick } : {}
        case 'topBottom': return { ...(top ? { bt: b } : {}), ...(bottom ? { bb: b } : {}) }
        case 'topThickBottom': return { ...(top ? { bt: b } : {}), ...(bottom ? { bb: thick } : {}) }
        case 'topDoubleBottom': return { ...(top ? { bt: b } : {}), ...(bottom ? { bb: dbl } : {}) }
        case 'insideH': return { ...(top ? {} : { bt: b }), ...(bottom ? {} : { bb: b }) }
        case 'insideV': return { ...(left ? {} : { bl: b }), ...(right ? {} : { br: b }) }
        case 'inside': return { ...(top ? {} : { bt: b }), ...(bottom ? {} : { bb: b }), ...(left ? {} : { bl: b }), ...(right ? {} : { br: b }) }
        case 'diagDown': return { bdd: b }
        case 'diagUp': return { bdu: b }
      }
      void s
      return p
    }, ranges, tx('Borders'))
    if (mode === 'none') {
      // also clear the facing edges of neighbouring cells
      const sheet = this.sheet
      this.transact(tx('Borders'), () => {
        for (const rg of ranges) {
          if (isFullCols(rg) || isFullRows(rg)) continue
          const edges: [number, number, keyof Style][] = []
          for (let c = rg.c1; c <= rg.c2; c++) {
            if (rg.r1 > 0) edges.push([rg.r1 - 1, c, 'bb'])
            if (rg.r2 < MAX_ROWS - 1) edges.push([rg.r2 + 1, c, 'bt'])
          }
          for (let r = rg.r1; r <= rg.r2; r++) {
            if (rg.c1 > 0) edges.push([r, rg.c1 - 1, 'br'])
            if (rg.c2 < MAX_COLS - 1) edges.push([r, rg.c2 + 1, 'bl'])
          }
          for (const [r, c, edge] of edges) {
            const d = sheet.get(r, c)
            if (!d?.s || !this.wb.styles.get(d.s)[edge]) continue
            this.write(sheet, r, c, { ...d, s: this.wb.styles.patch(d.s, { [edge]: undefined }) || undefined })
          }
        }
      })
    }
  }

  clear(what: 'all' | 'formats' | 'contents' | 'links', ranges = this.sel.ranges) {
    if (this.forGroup(tx('Clear'), () => this.clear(what, ranges))) return
    const sheet = this.sheet
    if (blocked(this, 'cells', ranges.map((rg) => this.boundToUsed(rg)))) return
    this.transact(what === 'contents' ? tx('Clear Contents') : what === 'formats' ? tx('Clear Formats') : tx('Clear'), () => {
      for (const rg of ranges) {
        if ((what === 'all' || what === 'formats') && (isFullCols(rg) || isFullRows(rg))) {
          this.noteProps(sheet)
          if (isFullCols(rg)) for (let c = rg.c1; c <= rg.c2; c++) sheet.colStyle.delete(c)
          if (isFullRows(rg)) for (let r = rg.r1; r <= rg.r2; r++) sheet.rowStyle.delete(r)
        }
        if (what === 'all' || what === 'formats') {
          const keep = sheet.merges.filter((m) => !(m.r1 >= rg.r1 && m.r2 <= rg.r2 && m.c1 >= rg.c1 && m.c2 <= rg.c2))
          if (keep.length !== sheet.merges.length) {
            this.noteProps(sheet)
            sheet.merges = keep
          }
        }
        const keys = this.keysIn(sheet, rg)
        for (const k of keys) {
          const d = sheet.cells.get(k)!
          let next: CellData | undefined
          if (what === 'all') next = undefined
          else if (what === 'contents') next = d.s ? { s: d.s } : undefined
          else if (what === 'formats') next = { v: d.v, f: d.f, link: d.link }
          else next = { ...d, link: undefined }
          this.writeKey(sheet, k, next)
        }
      }
    })
  }

  /** Stored cell keys inside a range (iterates the sparse map for big ranges). */
  keysIn(sheet: Sheet, rg: Range): number[] {
    const size = (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1)
    const out: number[] = []
    if (size > sheet.cells.size) {
      for (const k of sheet.cells.keys()) {
        const r = keyRow(k)
        const c = keyCol(k)
        if (r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2) out.push(k)
      }
    } else {
      for (let r = rg.r1; r <= rg.r2; r++)
        for (let c = rg.c1; c <= rg.c2; c++) {
          const k = cellKey(r, c)
          if (sheet.cells.has(k)) out.push(k)
        }
    }
    return out
  }

  // ---------- merge ----------

  merge(mode: 'center' | 'across' | 'merge' | 'unmerge', ranges = this.sel.ranges) {
    const sheet = this.sheet
    if (blocked(this, 'formatCells')) return
    this.transact(mode === 'unmerge' ? tx('Unmerge Cells') : tx('Merge Cells'), () => {
      this.noteProps(sheet)
      for (const rg0 of ranges) {
        const rg = this.boundToUsedIfHuge(rg0)
        sheet.merges = sheet.merges.filter((m) => !(m.r1 <= rg.r2 && m.r2 >= rg.r1 && m.c1 <= rg.c2 && m.c2 >= rg.c1))
        if (mode === 'unmerge') continue
        const parts = mode === 'across' ? Array.from({ length: rg.r2 - rg.r1 + 1 }, (_, i) => ({ r1: rg.r1 + i, r2: rg.r1 + i, c1: rg.c1, c2: rg.c2 })) : [rg]
        for (const p of parts) {
          if (p.r1 === p.r2 && p.c1 === p.c2) continue
          // keep only the upper-left value
          for (const k of this.keysIn(sheet, p)) {
            const r = keyRow(k)
            const c = keyCol(k)
            if (r === p.r1 && c === p.c1) continue
            const d = sheet.cells.get(k)!
            this.writeKey(sheet, k, d.s ? { s: d.s } : undefined)
          }
          sheet.merges.push(p)
        }
      }
    })
    if (mode === 'center') this.applyStyle({ h: 'center' }, ranges.map((rg) => ({ r1: rg.r1, c1: rg.c1, r2: rg.r1, c2: rg.c1 })), tx('Merge & Center'))
    this.sel = { ...this.sel, ranges: this.sel.ranges.map((r) => this.expandMerges(r)) }
    this.emit()
  }

  private boundToUsedIfHuge(rg: Range): Range {
    return isFullCols(rg) || isFullRows(rg) ? this.boundToUsed(rg) : rg
  }

  /** Whether merging would discard values other than the upper-left one. */
  mergeLosesData(ranges = this.sel.ranges): boolean {
    const sheet = this.sheet
    for (const rg of ranges) {
      let count = 0
      for (const k of this.keysIn(sheet, this.boundToUsedIfHuge(rg))) {
        const d = sheet.cells.get(k)!
        if (d.v !== undefined || d.f !== undefined) count++
        if (count > 1) return true
      }
    }
    return false
  }

  // ---------- editing ----------

  beginEdit(mode: 'enter' | 'edit', text?: string, source: 'cell' | 'bar' = 'cell') {
    const { r, c } = this.sel.active
    if (blocked(this, 'cells', [{ r1: r, c1: c, r2: r, c2: c }])) return
    const original = this.inputText(r, c)
    const t = text ?? original
    const rich = text === undefined ? this.sheet.get(r, c)?.rich : undefined
    this.edit = { sheetId: this.sheet.id, r, c, text: t, mode, caret: t.length, point: null, source, original, rich: rich?.map((x) => ({ ...x })) }
    this.emit()
  }

  updateEdit(patch: Partial<EditState>) {
    if (!this.edit) return
    const e = this.edit
    let rich = patch.rich ?? e.rich
    if (patch.text !== undefined && patch.rich === undefined && e.rich && patch.text !== e.text) {
      // keep the formatting of untouched characters: replace only the changed middle part
      const a = e.text
      const b = patch.text
      let p = 0
      while (p < a.length && p < b.length && a[p] === b[p]) p++
      let q = 0
      while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++
      rich = spliceRuns(e.rich, p, a.length - p - q, b.slice(p, b.length - q))
    }
    this.edit = { ...e, ...patch, rich }
    this.emit()
  }

  cancelEdit() {
    const e = this.edit
    if (!e) return
    this.edit = null
    this.focusSheet(e.sheetId)
    this.emit()
  }

  /** Commits the edit. Returns an error message for invalid formulas (the edit stays open). */
  commitEdit(move?: { dr: number; dc: number }, fillSelection = false, skipValidation = false): string | null {
    const e = this.edit
    if (!e) return null
    if (this.sheet.id !== e.sheetId) this.focusSheet(e.sheetId)
    if ((e.text !== e.original || fillSelection) && !skipValidation) {
      const fail = validateInput(this, this.sheet, e.r, e.c, e.text)
      if (fail) {
        if (fail.style === 'stop') return fail.message
        const ask = this.onAsk
        if (ask) {
          ask(fail.message, fail.title, () => {
            if (this.edit) this.commitEdit(move, fillSelection, true)
          })
          return PENDING
        }
      }
    }
    const rich = normalizeRuns(e.rich)
    const richChanged = JSON.stringify(rich ?? null) !== JSON.stringify(this.sheet.get(e.r, e.c)?.rich ?? null)
    if (e.text !== e.original || fillSelection || richChanged) {
      try {
        this.setInput(e.r, e.c, e.text, fillSelection, rich)
      } catch (err) {
        if (err instanceof FormulaError) return err.message
        throw err
      }
    }
    this.edit = null
    if (move && (move.dr || move.dc)) {
      const tabStart = this.tabStart
      if (this.cycle(move.dr, move.dc)) return null
      if (move.dc && !move.dr) {
        this.move(move.dr, move.dc)
        this.tabStart = tabStart ?? e.c
      } else if (move.dr > 0 && tabStart !== undefined) this.select({ r: e.r + 1, c: tabStart })
      else this.move(move.dr, move.dc)
    } else this.emit()
    return null
  }

  /** Inserts or replaces the pointed reference while typing a formula. */
  pointAt(cell: Cell, anchor?: Cell) {
    const e = this.edit
    if (!e) return
    const start = e.point ? e.point.start : e.caret
    const end = e.point ? e.point.end : e.caret
    const a = anchor ?? cell
    const rg = normalize(a, cell)
    const m = this.expandMerges(rg)
    const prefix = this.sheet.id !== e.sheetId ? quoteSheet(this.sheet.name) + '!' : ''
    const ref = prefix + (m.r1 === m.r2 && m.c1 === m.c2 ? cellName(m.r1, m.c1) : `${cellName(m.r1, m.c1)}:${cellName(m.r2, m.c2)}`)
    const text = e.text.slice(0, start) + ref + e.text.slice(end)
    this.edit = { ...e, text, caret: start + ref.length, point: { start, end: start + ref.length }, pointCell: cell, pointAnchor: a }
    this.emit()
  }
}

export type BorderMode =
  | 'none' | 'all' | 'outside' | 'thickOutside' | 'bottom' | 'top' | 'left' | 'right' | 'bottomDouble' | 'thickBottom'
  | 'topBottom' | 'topThickBottom' | 'topDoubleBottom' | 'insideH' | 'insideV' | 'inside' | 'diagDown' | 'diagUp'

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}

function shiftF(f: string, dr: number, dc: number) {
  return shiftFormula(f, dr, dc)
}

export { DEFAULT_FONT, intersect }

// Commands that change structure: rows/columns, cells, sheets, sizes, names and panes.
import { MAX_COLS, MAX_ROWS, cellKey, colName, keyCol, keyRow, type Range } from '../model/address'
import { Sheet, type CellData } from '../model/sheet'
import { adjustFormula, deleteSheetRefs, mapRefs, moveRefs, renameSheetRefs } from '../engine/refs'
import type { Doc } from './doc'
import { cellView } from './display'
import { refArea } from '../engine/parser'
import { adjustExtras, objectsFollowCells, rewriteExtrasFormulas } from './extrasAdjust'
import { blocked, structureBlocked } from './review'

type Axis = 'row' | 'col'

function rewriteFormulas(doc: Doc, fn: (f: string, host: Sheet) => string) {
  for (const s of doc.wb.sheets) {
    for (const [k, d] of s.cells) {
      if (d.f === undefined) continue
      const nf = fn(d.f, s)
      if (nf !== d.f) s.cells.set(k, { ...d, f: nf })
    }
  }
  for (const n of [...doc.wb.names.values()]) {
    const host = n.scope !== undefined ? doc.wb.sheetById(n.scope) : undefined
    const nr = fn(n.ref, host ?? ({ name: '\u0000' } as Sheet))
    if (nr !== n.ref) doc.wb.setName({ ...n, ref: nr })
  }
  rewriteExtrasFormulas(doc.wb, fn)
}

function noteAll(doc: Doc) {
  for (const s of doc.wb.sheets) doc.noteFull(s)
  doc.noteWorkbook()
}

function shiftCells(sheet: Sheet, axis: Axis, at: number, count: number) {
  const next = new Map<number, CellData>()
  const max = axis === 'row' ? MAX_ROWS : MAX_COLS
  for (const [k, d] of sheet.cells) {
    let r = keyRow(k)
    let c = keyCol(k)
    const x = axis === 'row' ? r : c
    if (x >= at) {
      if (count < 0 && x < at - count) continue
      const nx = x + count
      if (nx >= max) continue
      if (axis === 'row') r = nx
      else c = nx
    }
    next.set(cellKey(r, c), d)
  }
  sheet.cells = next
  sheet.touchUsed()
}

function shiftStyleMap(m: Map<number, number>, at: number, count: number, max: number) {
  const entries = [...m.entries()]
  m.clear()
  for (const [k, v] of entries) {
    if (k < at) m.set(k, v)
    else if (count < 0 && k < at - count) continue
    else if (k + count < max) m.set(k + count, v)
  }
}

function adjustMerges(sheet: Sheet, axis: Axis, at: number, count: number) {
  const out: Range[] = []
  for (const m of sheet.merges) {
    let a = axis === 'row' ? m.r1 : m.c1
    let b = axis === 'row' ? m.r2 : m.c2
    if (count > 0) {
      if (a >= at) a += count
      if (b >= at) b += count
    } else {
      const n = -count
      const end = at + n
      if (a >= at && b < end) continue
      a = a < at ? a : a >= end ? a - n : at
      b = b < at ? b : b >= end ? b - n : at - 1
    }
    const nm = axis === 'row' ? { ...m, r1: a, r2: b } : { ...m, c1: a, c2: b }
    if (nm.r1 === nm.r2 && nm.c1 === nm.c2) continue
    out.push(nm)
  }
  sheet.merges = out
}

/** Inserts (count > 0) or deletes (count < 0) whole rows or columns at `at`. */
export function insertDelete(doc: Doc, axis: Axis, at: number, count: number, sheet = doc.sheet) {
  if (blocked(doc, count > 0 ? (axis === 'row' ? 'insertRows' : 'insertColumns') : axis === 'row' ? 'deleteRows' : 'deleteColumns', undefined, sheet)) return
  const label = `${count > 0 ? 'Insert' : 'Delete'} ${axis === 'row' ? 'Rows' : 'Columns'}`
  doc.transact(label, () => {
    noteAll(doc)
    shiftCells(sheet, axis, at, count)
    rewriteFormulas(doc, (f, host) => adjustFormula(f, host.name, sheet.name, axis, at, count))
    adjustExtras(sheet, axis, at, count)
    const ax = axis === 'row' ? sheet.rows : sheet.cols
    ax.shift(at, count)
    shiftStyleMap(axis === 'row' ? sheet.rowStyle : sheet.colStyle, at, count, axis === 'row' ? MAX_ROWS : MAX_COLS)
    adjustMerges(sheet, axis, at, count)
    if (count > 0 && at > 0) {
      // new rows/columns take the formatting of the one before ("Format Same As Above")
      const src = at - 1
      for (const [k, d] of [...sheet.cells]) {
        if (!d.s) continue
        const r = keyRow(k)
        const c = keyCol(k)
        if ((axis === 'row' ? r : c) !== src) continue
        for (let i = 0; i < count; i++) {
          const key = axis === 'row' ? cellKey(at + i, c) : cellKey(r, at + i)
          sheet.cells.set(key, { s: d.s })
        }
      }
      const styleMap = axis === 'row' ? sheet.rowStyle : sheet.colStyle
      const st = styleMap.get(src)
      if (st !== undefined) for (let i = 0; i < count; i++) styleMap.set(at + i, st)
      const size = ax.manual.get(src)
      if (size !== undefined) for (let i = 0; i < count; i++) ax.manual.set(at + i, size)
      ax.touch()
    }
  })
}

export function insertRowsAtSelection(doc: Doc) {
  const rg = doc.activeRange
  insertDelete(doc, 'row', rg.r1, rg.r2 - rg.r1 + 1)
}

export function insertColsAtSelection(doc: Doc) {
  const rg = doc.activeRange
  insertDelete(doc, 'col', rg.c1, rg.c2 - rg.c1 + 1)
}

export function deleteRowsAtSelection(doc: Doc) {
  const rg = doc.activeRange
  insertDelete(doc, 'row', rg.r1, -(rg.r2 - rg.r1 + 1))
}

export function deleteColsAtSelection(doc: Doc) {
  const rg = doc.activeRange
  insertDelete(doc, 'col', rg.c1, -(rg.c2 - rg.c1 + 1))
}

/** Moves the cells of `block` by (dr, dc) within the sheet, updating references. Cells in `clear` are removed first. */
function moveBlock(doc: Doc, sheet: Sheet, block: Range, dr: number, dc: number, clear: Range | null) {
  const moved: [number, CellData][] = []
  for (const [k, d] of [...sheet.cells]) {
    const r = keyRow(k)
    const c = keyCol(k)
    const inClear = clear && r >= clear.r1 && r <= clear.r2 && c >= clear.c1 && c <= clear.c2
    const inBlock = r >= block.r1 && r <= block.r2 && c >= block.c1 && c <= block.c2
    if (inClear || inBlock) sheet.cells.delete(k)
    if (inBlock) {
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nc >= 0 && nr < MAX_ROWS && nc < MAX_COLS) moved.push([cellKey(nr, nc), d])
    }
  }
  for (const [k, d] of moved) sheet.cells.set(k, d)
  sheet.touchUsed()
  if (clear) {
    rewriteFormulas(doc, (f, host) =>
      mapRefs(f, (p) => {
        const sh = p.sheet ?? host.name
        if (sh.toUpperCase() !== sheet.name.toUpperCase() || p.kind === 'cols' || p.kind === 'rows') return p
        const a = refArea(p)
        return a.r1 >= clear.r1 && a.r2 <= clear.r2 && a.c1 >= clear.c1 && a.c2 <= clear.c2 ? null : p
      }),
    )
  }
  rewriteFormulas(doc, (f, host) => moveRefs(f, host.name, sheet.name, block, sheet.name, dr, dc))
  sheet.merges = sheet.merges
    .filter((m) => !(clear && m.r1 >= clear.r1 && m.r2 <= clear.r2 && m.c1 >= clear.c1 && m.c2 <= clear.c2))
    .map((m) => (m.r1 >= block.r1 && m.r2 <= block.r2 && m.c1 >= block.c1 && m.c2 <= block.c2 ? { r1: m.r1 + dr, r2: m.r2 + dr, c1: m.c1 + dc, c2: m.c2 + dc } : m))
}

export function insertCells(doc: Doc, shift: 'down' | 'right', rg = doc.activeRange) {
  const sheet = doc.sheet
  if (blocked(doc, 'cells', [rg])) return
  doc.transact('Insert Cells', () => {
    noteAll(doc)
    const used = sheet.used()
    if (shift === 'down') {
      const n = rg.r2 - rg.r1 + 1
      moveBlock(doc, sheet, { r1: rg.r1, r2: Math.max(rg.r1, used.r), c1: rg.c1, c2: rg.c2 }, n, 0, null)
    } else {
      const n = rg.c2 - rg.c1 + 1
      moveBlock(doc, sheet, { r1: rg.r1, r2: rg.r2, c1: rg.c1, c2: Math.max(rg.c1, used.c) }, 0, n, null)
    }
  })
}

export function deleteCells(doc: Doc, shift: 'up' | 'left', rg = doc.activeRange) {
  const sheet = doc.sheet
  if (blocked(doc, 'cells', [rg])) return
  doc.transact('Delete Cells', () => {
    noteAll(doc)
    const used = sheet.used()
    if (shift === 'up') {
      const n = rg.r2 - rg.r1 + 1
      moveBlock(doc, sheet, { r1: rg.r2 + 1, r2: Math.max(rg.r2 + 1, used.r), c1: rg.c1, c2: rg.c2 }, -n, 0, rg)
    } else {
      const n = rg.c2 - rg.c1 + 1
      moveBlock(doc, sheet, { r1: rg.r1, r2: rg.r2, c1: rg.c2 + 1, c2: Math.max(rg.c2 + 1, used.c) }, 0, -n, rg)
    }
  })
}

// ---------- sheets ----------

const INVALID_SHEET_CHARS = /[\\/?*[\]:]/

export function validateSheetName(doc: Doc, name: string, except?: Sheet): string | null {
  const n = name.trim()
  if (!n) return 'The sheet name cannot be empty.'
  if (n.length > 31) return 'The sheet name can have at most 31 characters.'
  if (INVALID_SHEET_CHARS.test(n)) return 'The sheet name cannot contain : \\ / ? * [ or ].'
  if (n.startsWith("'") || n.endsWith("'")) return 'The sheet name cannot start or end with an apostrophe.'
  if (n.toLowerCase() === 'history') return '"History" is a reserved name.'
  const other = doc.wb.sheetByName(n)
  if (other && other !== except) return 'That name is already taken. Try a different one.'
  return null
}

export function addSheet(doc: Doc, at = doc.activeIndex + 1) {
  if (structureBlocked(doc)) return
  doc.transact('Insert Sheet', () => {
    doc.noteWorkbook()
    doc.wb.addSheet(undefined, at)
    doc.activeIndex = at
  })
}

export function deleteSheet(doc: Doc, index = doc.activeIndex): string | null {
  if (structureBlocked(doc)) return null
  const visible = doc.wb.sheets.filter((s) => !s.hidden)
  if (visible.length <= 1) return 'A workbook must contain at least one visible sheet.'
  const sheet = doc.wb.sheets[index]
  doc.transact('Delete Sheet', () => {
    noteAll(doc)
    doc.wb.sheets.splice(index, 1)
    rewriteFormulas(doc, (f) => deleteSheetRefs(f, sheet.name))
    let i = Math.min(index, doc.wb.sheets.length - 1)
    while (doc.wb.sheets[i]?.hidden && i > 0) i--
    doc.activeIndex = i
  })
  return null
}

export function renameSheet(doc: Doc, index: number, name: string): string | null {
  if (structureBlocked(doc)) return null
  const sheet = doc.wb.sheets[index]
  const err = validateSheetName(doc, name, sheet)
  if (err) return err
  const old = sheet.name
  if (old === name.trim()) return null
  doc.transact('Rename Sheet', () => {
    noteAll(doc)
    sheet.name = name.trim()
    rewriteFormulas(doc, (f) => renameSheetRefs(f, old, sheet.name))
  })
  return null
}

export function moveSheet(doc: Doc, from: number, to: number) {
  if (structureBlocked(doc)) return
  if (from === to) return
  doc.transact('Move Sheet', () => {
    doc.noteWorkbook()
    const [s] = doc.wb.sheets.splice(from, 1)
    doc.wb.sheets.splice(to > from ? to - 1 : to, 0, s)
    doc.activeIndex = doc.wb.sheets.indexOf(s)
  })
}

export function duplicateSheet(doc: Doc, index = doc.activeIndex, to = index + 1) {
  if (structureBlocked(doc)) return
  const src = doc.wb.sheets[index]
  doc.transact('Copy Sheet', () => {
    doc.noteWorkbook()
    let name = ''
    for (let i = 2; ; i++) {
      name = `${src.name.slice(0, 26)} (${i})`
      if (!doc.wb.sheetByName(name)) break
    }
    const copy = new Sheet(doc.wb.newSheetId(), name)
    copy.cells = new Map(src.cells)
    copy.cols.restore(src.cols.snapshot())
    copy.rows.restore(src.rows.snapshot())
    copy.colStyle = new Map(src.colStyle)
    copy.rowStyle = new Map(src.rowStyle)
    copy.merges = src.merges.map((m) => ({ ...m }))
    copy.freeze = { ...src.freeze }
    copy.tabColor = src.tabColor
    copy.showGrid = src.showGrid
    copy.showHeadings = src.showHeadings
    copy.zoom = src.zoom
    copy.page = structuredClone(src.page)
    copy.x = structuredClone(src.x)
    for (const o of copy.x.objects) o.id = doc.wb.newObjectId()
    for (const r of [...copy.x.cf, ...copy.x.validations, ...copy.x.sparklines]) r.id = doc.wb.newObjectId()
    for (const t of copy.x.tables) {
      t.id = doc.wb.newObjectId()
      t.name = uniqueTableName(doc, t.name.replace(/\d+$/, ''))
    }
    for (const p of copy.x.pivots) p.id = doc.wb.newObjectId()
    doc.wb.sheets.splice(to, 0, copy)
    doc.activeIndex = to
  })
}

export function setTabColor(doc: Doc, index: number, color: string | undefined) {
  const s = doc.wb.sheets[index]
  doc.transact('Tab Color', () => {
    doc.noteProps(s)
    s.tabColor = color
  })
}

export function hideSheet(doc: Doc, index = doc.activeIndex): string | null {
  if (structureBlocked(doc)) return null
  if (doc.wb.sheets.filter((s) => !s.hidden).length <= 1) return 'A workbook must contain at least one visible sheet.'
  const s = doc.wb.sheets[index]
  doc.transact('Hide Sheet', () => {
    doc.noteProps(s)
    s.hidden = true
    let i = index
    while (doc.wb.sheets[i]?.hidden) i = (i + 1) % doc.wb.sheets.length
    doc.activeIndex = i
  })
  return null
}

export function unhideSheet(doc: Doc, index: number) {
  if (structureBlocked(doc)) return
  const s = doc.wb.sheets[index]
  doc.transact('Unhide Sheet', () => {
    doc.noteProps(s)
    s.hidden = false
    doc.activeIndex = index
  })
}

// ---------- sizes & visibility ----------

export function setSizes(doc: Doc, axis: Axis, indexes: number[], px: number) {
  if (blocked(doc, axis === 'row' ? 'formatRows' : 'formatColumns')) return
  const sheet = doc.sheet
  doc.transact(axis === 'row' ? 'Row Height' : 'Column Width', () => {
    doc.noteProps(sheet)
    const ax = axis === 'row' ? sheet.rows : sheet.cols
    objectsFollowCells(sheet, () => {
      for (const i of indexes) {
        if (px <= 0) ax.hidden.add(i)
        else {
          ax.hidden.delete(i)
          ax.manual.set(i, Math.round(px))
        }
      }
      ax.touch()
    })
  })
}

export function setHidden(doc: Doc, axis: Axis, indexes: number[], hidden: boolean) {
  if (blocked(doc, axis === 'row' ? 'formatRows' : 'formatColumns')) return
  const sheet = doc.sheet
  doc.transact(hidden ? 'Hide' : 'Unhide', () => {
    doc.noteProps(sheet)
    const ax = axis === 'row' ? sheet.rows : sheet.cols
    objectsFollowCells(sheet, () => {
      for (const i of indexes) {
        if (hidden) ax.hidden.add(i)
        else {
          ax.hidden.delete(i)
          if (ax.manual.get(i) === 0) ax.manual.delete(i)
        }
      }
      ax.touch()
    })
  })
}

/** Indexes covered by the selection on one axis (whole sheet → used range). */
export function selectedIndexes(doc: Doc, axis: Axis): number[] {
  const out = new Set<number>()
  const used = doc.sheet.used()
  for (const rg of doc.sel.ranges) {
    const a = axis === 'row' ? rg.r1 : rg.c1
    let b = axis === 'row' ? rg.r2 : rg.c2
    if (b - a > 20000) b = Math.max(a, axis === 'row' ? used.r : used.c)
    for (let i = a; i <= b; i++) out.add(i)
  }
  return [...out]
}

export function autofitColumns(doc: Doc, cols: number[]) {
  const sheet = doc.sheet
  const widths = new Map<number, number>()
  const set = new Set(cols)
  for (const [k] of sheet.cells) {
    const c = keyCol(k)
    if (!set.has(c)) continue
    const r = keyRow(k)
    if (sheet.mergeAt(r, c)) continue
    const st = doc.style(r, c)
    if (st.wrap) continue
    const view = cellView(doc, sheet, r, c, st)
    if (!view.text) continue
    const w = Math.max(...view.text.split('\n').map((line) => doc.measure(line, st))) + 8 + (st.indent ?? 0) * 9
    widths.set(c, Math.max(widths.get(c) ?? 0, w))
  }
  for (const [k] of sheet.spillOwner) {
    const c = keyCol(k)
    if (!set.has(c)) continue
    const r = keyRow(k)
    const st = doc.style(r, c)
    const view = cellView(doc, sheet, r, c, st)
    widths.set(c, Math.max(widths.get(c) ?? 0, doc.measure(view.text, st) + 8))
  }
  doc.transact('AutoFit Column Width', () => {
    doc.noteProps(sheet)
    objectsFollowCells(sheet, () => {
      for (const c of cols) {
        const w = widths.get(c)
        if (w === undefined) continue
        sheet.cols.manual.set(c, Math.min(1785, Math.ceil(w)))
        sheet.cols.hidden.delete(c)
      }
      sheet.cols.touch()
    })
  })
}

export function autofitRows(doc: Doc, rows: number[]) {
  const sheet = doc.sheet
  doc.transact('AutoFit Row Height', () => {
    doc.noteProps(sheet)
    for (const r of rows) {
      sheet.rows.manual.delete(r)
      sheet.rows.hidden.delete(r)
    }
    sheet.rows.touch()
  })
  doc.updateAutoHeights(sheet, rows)
  doc.emit()
}

export function setDefaultColWidth(doc: Doc, px: number) {
  const sheet = doc.sheet
  doc.transact('Default Width', () => {
    doc.noteProps(sheet)
    sheet.cols.def = Math.max(1, Math.round(px))
    sheet.cols.touch()
  })
}

/** Table names are unique in the workbook (and must not clash with defined names). */
export function uniqueTableName(doc: Doc, base = 'Table'): string {
  const taken = new Set<string>()
  for (const s of doc.wb.sheets) for (const t of s.x.tables) taken.add(t.name.toUpperCase())
  for (const n of doc.wb.names.values()) taken.add(n.name.toUpperCase())
  for (let i = 1; ; i++) if (!taken.has(`${base}${i}`.toUpperCase())) return `${base}${i}`
}

// ---------- panes ----------

export function freezePanes(doc: Doc, rows: number, cols: number) {
  const sheet = doc.sheet
  sheet.freeze = { rows: Math.max(0, rows), cols: Math.max(0, cols) }
  doc.scroll.set(sheet.id, { x: 0, y: 0 })
  doc.modified = true
  doc.emit()
}

// ---------- names ----------

const NAME_RE = /^[A-Za-z_\\][A-Za-z0-9_.\\]*$/

export function validateName(doc: Doc, name: string, scope?: number, except?: string): string | null {
  if (!NAME_RE.test(name)) return 'Names must start with a letter or underscore and contain no spaces.'
  if (/^[A-Za-z]{1,3}\d{1,7}$/.test(name) || /^[Rr]\d*[Cc]\d*$/.test(name) || /^[RrCc]$/.test(name)) return 'A name cannot look like a cell reference.'
  const existing = doc.wb.getName(name, scope)
  if (existing && existing.scope === scope && existing.name.toUpperCase() !== except?.toUpperCase()) return 'That name already exists. Names must be unique.'
  return null
}

export function defineName(doc: Doc, name: string, ref: string, scope?: number, comment?: string, replace?: { name: string; scope?: number }) {
  doc.transact('Define Name', () => {
    doc.noteWorkbook()
    if (replace) {
      const old = doc.wb.getName(replace.name, replace.scope)
      if (old && old.scope === replace.scope) doc.wb.deleteName(old)
    }
    doc.wb.setName({ name, ref: ref.replace(/^=/, ''), scope, comment })
    doc.engine.namesChanged()
  })
}

export function deleteName(doc: Doc, name: string, scope?: number) {
  const n = doc.wb.getName(name, scope)
  if (!n) return
  doc.transact('Delete Name', () => {
    doc.noteWorkbook()
    doc.wb.deleteName(n)
    doc.engine.namesChanged()
  })
}

/** Create from Selection: uses labels in the top row / left column as names for the adjacent cells. */
export function createNamesFromSelection(doc: Doc, opts: { top: boolean; left: boolean; bottom: boolean; right: boolean }) {
  const rg = doc.boundToUsed(doc.activeRange)
  const sheet = doc.sheet
  const created: [string, string][] = []
  const clean = (v: unknown) => String(v ?? '').trim().replace(/[^A-Za-z0-9_.]/g, '_').replace(/^(\d)/, '_$1')
  const q = (s: string) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(s) ? s : `'${s.replace(/'/g, "''")}'`)
  const abs = (r1: number, c1: number, r2: number, c2: number) => {
    const a = `$${colLetters(c1)}$${r1 + 1}`
    return r1 === r2 && c1 === c2 ? `${q(sheet.name)}!${a}` : `${q(sheet.name)}!${a}:$${colLetters(c2)}$${r2 + 1}`
  }
  if (opts.top) for (let c = rg.c1; c <= rg.c2; c++) created.push([clean(doc.value(rg.r1, c)), abs(rg.r1 + 1, c, rg.r2, c)])
  if (opts.left) for (let r = rg.r1; r <= rg.r2; r++) created.push([clean(doc.value(r, rg.c1)), abs(r, rg.c1 + 1, r, rg.c2)])
  if (opts.bottom) for (let c = rg.c1; c <= rg.c2; c++) created.push([clean(doc.value(rg.r2, c)), abs(rg.r1, c, rg.r2 - 1, c)])
  if (opts.right) for (let r = rg.r1; r <= rg.r2; r++) created.push([clean(doc.value(r, rg.c2)), abs(r, rg.c1, r, rg.c2 - 1)])
  doc.transact('Create Names', () => {
    doc.noteWorkbook()
    for (const [name, ref] of created) if (name && !validateName(doc, name)) doc.wb.setName({ name, ref })
    doc.engine.namesChanged()
  })
}

const colLetters = colName

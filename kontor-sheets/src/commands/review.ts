// Review tab: notes, threaded comments, sheet/workbook protection and allow-edit ranges.
import { cellKey, keyCol, keyRow, type Range } from '../model/address'
import { passwordHash, type CommentThread, type EditRange, type Note, type SheetPermission, type SheetProtection } from '../model/extras'
import type { Sheet } from '../model/sheet'
import type { Doc } from './doc'

export const AUTHOR_KEY = 'kontor-sheets:author'

export function authorName(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) || 'Author'
  } catch {
    return 'Author'
  }
}

// ---------- notes ----------

export function noteAt(sheet: Sheet, r: number, c: number): Note | undefined {
  return sheet.x.notes[cellKey(r, c)]
}

export function setNote(doc: Doc, r: number, c: number, text: string | null, sheet = doc.sheet) {
  if (blocked(doc, 'objects')) return
  doc.transact(text === null ? 'Delete Note' : 'Edit Note', () => {
    doc.noteProps(sheet)
    const k = cellKey(r, c)
    const notes = { ...sheet.x.notes }
    if (text === null) delete notes[k]
    else notes[k] = { ...(notes[k] ?? { author: authorName(), visible: false, w: 144, h: 79 }), text }
    sheet.x.notes = notes
  })
}

export function toggleNote(doc: Doc, r: number, c: number) {
  const sheet = doc.sheet
  const n = noteAt(sheet, r, c)
  if (!n) return
  doc.transact('Show/Hide Note', () => {
    doc.noteProps(sheet)
    sheet.x.notes = { ...sheet.x.notes, [cellKey(r, c)]: { ...n, visible: !n.visible } }
  })
}

export function showAllNotes(doc: Doc, show: boolean) {
  const sheet = doc.sheet
  doc.transact('Show All Notes', () => {
    doc.noteProps(sheet)
    const notes: Record<number, Note> = {}
    for (const [k, n] of Object.entries(sheet.x.notes)) notes[Number(k)] = { ...n, visible: show }
    sheet.x.notes = notes
  })
}

export function deleteNotesIn(doc: Doc, ranges: Range[]) {
  const sheet = doc.sheet
  doc.transact('Delete Notes', () => {
    doc.noteProps(sheet)
    const notes = { ...sheet.x.notes }
    for (const k of Object.keys(notes).map(Number)) if (ranges.some((rg) => keyRow(k) >= rg.r1 && keyRow(k) <= rg.r2 && keyCol(k) >= rg.c1 && keyCol(k) <= rg.c2)) delete notes[k]
    sheet.x.notes = notes
  })
}

// ---------- comments ----------

export function threadAt(sheet: Sheet, r: number, c: number): CommentThread | undefined {
  return sheet.x.comments[cellKey(r, c)]
}

export function addComment(doc: Doc, r: number, c: number, text: string, sheet = doc.sheet) {
  if (!text.trim() || blocked(doc, 'objects')) return
  doc.transact('New Comment', () => {
    doc.noteProps(sheet)
    const k = cellKey(r, c)
    const t = sheet.x.comments[k] ?? { resolved: false, items: [] }
    sheet.x.comments = { ...sheet.x.comments, [k]: { ...t, items: [...t.items, { author: authorName(), text: text.trim(), date: new Date().toISOString() }] } }
  })
}

export function editComment(doc: Doc, r: number, c: number, index: number, text: string) {
  const sheet = doc.sheet
  const k = cellKey(r, c)
  const t = sheet.x.comments[k]
  if (!t) return
  doc.transact('Edit Comment', () => {
    doc.noteProps(sheet)
    sheet.x.comments = { ...sheet.x.comments, [k]: { ...t, items: t.items.map((it, i) => (i === index ? { ...it, text } : it)) } }
  })
}

export function resolveThread(doc: Doc, r: number, c: number, resolved: boolean) {
  const sheet = doc.sheet
  const k = cellKey(r, c)
  const t = sheet.x.comments[k]
  if (!t) return
  doc.transact(resolved ? 'Resolve Thread' : 'Reopen Thread', () => {
    doc.noteProps(sheet)
    sheet.x.comments = { ...sheet.x.comments, [k]: { ...t, resolved } }
  })
}

export function deleteThread(doc: Doc, r: number, c: number) {
  const sheet = doc.sheet
  doc.transact('Delete Comment', () => {
    doc.noteProps(sheet)
    const comments = { ...sheet.x.comments }
    delete comments[cellKey(r, c)]
    sheet.x.comments = comments
  })
}

/** Next/previous cell with a comment (or note) in reading order, wrapping around the sheet. */
export function stepAnnotation(doc: Doc, kind: 'comments' | 'notes', dir: 1 | -1): boolean {
  const sheet = doc.sheet
  const keys = Object.keys(kind === 'comments' ? sheet.x.comments : sheet.x.notes).map(Number).sort((a, b) => a - b)
  if (!keys.length) return false
  const cur = cellKey(doc.sel.active.r, doc.sel.active.c)
  const next = dir > 0 ? keys.find((k) => k > cur) ?? keys[0] : [...keys].reverse().find((k) => k < cur) ?? keys[keys.length - 1]
  doc.select({ r: keyRow(next), c: keyCol(next) })
  return true
}

// ---------- protection ----------

export const PERMISSIONS: [SheetPermission, string][] = [
  ['selectLocked', 'Select locked cells'], ['selectUnlocked', 'Select unlocked cells'], ['formatCells', 'Format cells'], ['formatColumns', 'Format columns'],
  ['formatRows', 'Format rows'], ['insertColumns', 'Insert columns'], ['insertRows', 'Insert rows'], ['insertHyperlinks', 'Insert hyperlinks'],
  ['deleteColumns', 'Delete columns'], ['deleteRows', 'Delete rows'], ['sort', 'Sort'], ['autoFilter', 'Use AutoFilter'], ['pivotTables', 'Use PivotTable & PivotChart'],
  ['objects', 'Edit objects'], ['scenarios', 'Edit scenarios'],
]

export const LOCKED_MESSAGE = 'The cell or chart you are trying to change is on a protected sheet. To make a change, unprotect the sheet. You might be requested to enter a password.'

export function protectSheet(doc: Doc, password: string, allow: SheetProtection['allow']) {
  const sheet = doc.sheet
  doc.transact('Protect Sheet', () => {
    doc.noteProps(sheet)
    sheet.x.protection = { hash: passwordHash(password), allow }
  })
}

export function unprotectSheet(doc: Doc, password: string): boolean {
  const sheet = doc.sheet
  const p = sheet.x.protection
  if (!p) return true
  if (p.hash && passwordHash(password) !== p.hash) return false
  doc.transact('Unprotect Sheet', () => {
    doc.noteProps(sheet)
    sheet.x.protection = null
  })
  return true
}

export function protectWorkbook(doc: Doc, password: string) {
  doc.transact('Protect Workbook', () => {
    doc.noteWorkbook()
    doc.wb.protection = { hash: passwordHash(password), structure: true }
  })
}

export function unprotectWorkbook(doc: Doc, password: string): boolean {
  const p = doc.wb.protection
  if (!p) return true
  if (p.hash && passwordHash(password) !== p.hash) return false
  doc.transact('Unprotect Workbook', () => {
    doc.noteWorkbook()
    doc.wb.protection = null
  })
  return true
}

export function setEditRanges(doc: Doc, list: EditRange[]) {
  const sheet = doc.sheet
  doc.transact('Allow Edit Ranges', () => {
    doc.noteProps(sheet)
    sheet.x.editRanges = list
  })
}

/** Unlocked edit ranges the user opened with their password in this session. */
const unlockedRanges = new WeakMap<Sheet, Set<string>>()

export function unlockRange(sheet: Sheet, title: string) {
  let s = unlockedRanges.get(sheet)
  if (!s) unlockedRanges.set(sheet, (s = new Set()))
  s.add(title)
}

function editable(doc: Doc, sheet: Sheet, r: number, c: number): boolean {
  if (doc.wb.styles.get(sheet.styleId(r, c)).locked === false) return true
  for (const e of sheet.x.editRanges) {
    if (r < e.range.r1 || r > e.range.r2 || c < e.range.c1 || c > e.range.c2) continue
    if (!e.hash || unlockedRanges.get(sheet)?.has(e.title)) return true
  }
  return false
}

/** Error message when the protected sheet forbids changing these cells, else null. */
export function cellsLocked(doc: Doc, ranges: Range[], sheet = doc.sheet): string | null {
  if (!sheet.x.protection) return null
  for (const rg of ranges) {
    const r2 = Math.min(rg.r2, rg.r1 + 2000)
    const c2 = Math.min(rg.c2, rg.c1 + 200)
    for (let r = rg.r1; r <= r2; r++) for (let c = rg.c1; c <= c2; c++) if (!editable(doc, sheet, r, c)) return LOCKED_MESSAGE
  }
  return null
}

/** True (and the message is reported) when the protected sheet forbids an action. */
export function blocked(doc: Doc, action: SheetPermission | 'cells', ranges?: Range[], sheet = doc.sheet): boolean {
  const p = sheet.x.protection
  if (!p) return false
  let msg: string | null = null
  if (action === 'cells') msg = cellsLocked(doc, ranges ?? doc.sel.ranges, sheet)
  else if (!p.allow[action]) msg = LOCKED_MESSAGE
  if (msg) doc.report(msg)
  return !!msg
}

export function structureBlocked(doc: Doc): boolean {
  if (!doc.wb.protection?.structure) return false
  doc.report('The workbook is protected and cannot be changed. Unprotect the workbook to add, delete, move, rename, hide or unhide sheets.')
  return true
}

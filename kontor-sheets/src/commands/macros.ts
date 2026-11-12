// Macro recorder (View > Macros): records what the program's own commands change in cells (contents
// and formatting) and replays it, at the same cells or relative to the active cell. Real VBA code is
// not supported; macros are kept with the workbook (AutoSave), not in .xlsx files.
import { MAX_COLS, MAX_ROWS, keyCol, keyRow, type Cell } from '../model/address'
import { tx } from '../i18n'
import type { CellData } from '../model/sheet'
import type { Style } from '../model/style'
import type { Macro, MacroCell } from '../model/workbook'
import { shiftFormula } from '../engine/refs'
import type { Doc } from './doc'
import type { Tx } from './history'

export type Recorder = { name: string; relative: boolean; origin: Cell; steps: Macro['steps'] }

const RUN_LABEL = tx('Run Macro')

export function startRecording(doc: Doc, name: string, relative: boolean) {
  doc.recorder = { name: name.trim() || 'Macro1', relative, origin: { ...doc.sel.active }, steps: [] }
  doc.emit()
}

/** Ends the recording and keeps the macro with the workbook (replacing one with the same name). */
export function stopRecording(doc: Doc): Macro | null {
  const rec = doc.recorder
  doc.recorder = null
  if (!rec) return null
  const macro: Macro = { name: rec.name, relative: rec.relative, origin: rec.origin, steps: rec.steps }
  doc.wb.macros = [...doc.wb.macros.filter((m) => m.name.toUpperCase() !== macro.name.toUpperCase()), macro]
  doc.modified = true
  doc.emit()
  return macro
}

/** Called after every committed command: stores the cells it changed on the active sheet. */
export function recordStep(doc: Doc, label: string, change: Tx) {
  const rec = doc.recorder
  if (!rec || label === RUN_LABEL) return
  const sheet = doc.sheet
  const keys = new Set<number>([...(change.cells.get(sheet)?.keys() ?? []), ...(change.full.has(sheet) ? change.changed.get(sheet) ?? [] : [])])
  const cells: MacroCell[] = []
  for (const k of keys) {
    const d = sheet.cells.get(k)
    const r = keyRow(k)
    const c = keyCol(k)
    cells.push(d ? { r, c, v: d.v ?? undefined, f: d.f, style: d.s ? { ...doc.wb.styles.get(d.s) } : undefined, link: d.link } : { r, c, clear: true })
  }
  if (cells.length) rec.steps.push({ label, cells })
}

export function suggestMacroName(doc: Doc): string {
  for (let i = 1; ; i++) if (!doc.wb.macros.some((m) => m.name.toUpperCase() === `MACRO${i}`)) return `Macro${i}`
}

/** Replays a macro in one undo step. */
export function runMacro(doc: Doc, name: string): string | null {
  const macro = doc.wb.macros.find((m) => m.name === name)
  if (!macro) return tx('The macro was not found.')
  const sheet = doc.sheet
  const dr = macro.relative ? doc.sel.active.r - macro.origin.r : 0
  const dc = macro.relative ? doc.sel.active.c - macro.origin.c : 0
  let outside = false
  doc.transact(RUN_LABEL, () => {
    for (const step of macro.steps)
      for (const cell of step.cells) {
        const r = cell.r + dr
        const c = cell.c + dc
        if (r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) {
          outside = true
          continue
        }
        if (cell.clear) {
          doc.write(sheet, r, c, undefined)
          continue
        }
        const data: CellData = {}
        if (cell.f !== undefined) data.f = dr || dc ? shiftFormula(cell.f, dr, dc) : cell.f
        else if (cell.v !== undefined) data.v = cell.v
        if (cell.style && Object.keys(cell.style).length) data.s = doc.wb.styles.intern(cell.style as Style)
        if (cell.link) data.link = cell.link
        doc.write(sheet, r, c, data)
      }
  })
  return outside ? tx('Some cells of the macro are outside the sheet and were skipped.') : null
}

export function deleteMacro(doc: Doc, name: string) {
  doc.wb.macros = doc.wb.macros.filter((m) => m.name !== name)
  doc.modified = true
  doc.emit()
}

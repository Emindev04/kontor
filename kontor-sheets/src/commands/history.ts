import type { Range } from '../model/address'
import type { CellData, Sheet } from '../model/sheet'
import type { DefinedName, Workbook } from '../model/workbook'

/** Layout properties of a sheet that are part of undo (not view settings like zoom). */
export type PropsSnap = {
  name: string
  cols: ReturnType<Sheet['cols']['snapshot']>
  rows: ReturnType<Sheet['rows']['snapshot']>
  colStyle: Map<number, number>
  rowStyle: Map<number, number>
  merges: Range[]
  tabColor?: string
  hidden: boolean
  page: Sheet['page']
  ink: Sheet['ink']
  x: Sheet['x']
}

export type FullSnap = { cells: Map<number, CellData>; props: PropsSnap }

export type WbSnap = { sheets: Sheet[]; names: Map<string, DefinedName>; protection: Workbook['protection'] }

export function snapProps(s: Sheet): PropsSnap {
  return {
    name: s.name,
    cols: s.cols.snapshot(),
    rows: s.rows.snapshot(),
    colStyle: new Map(s.colStyle),
    rowStyle: new Map(s.rowStyle),
    merges: s.merges.map((m) => ({ ...m })),
    tabColor: s.tabColor,
    hidden: s.hidden,
    page: structuredClone(s.page),
    ink: s.ink.slice(),
    x: structuredClone(s.x),
  }
}

export function restoreProps(s: Sheet, p: PropsSnap) {
  s.name = p.name
  s.cols.restore(p.cols)
  s.rows.restore(p.rows)
  s.colStyle = new Map(p.colStyle)
  s.rowStyle = new Map(p.rowStyle)
  s.merges = p.merges.map((m) => ({ ...m }))
  s.tabColor = p.tabColor
  s.hidden = p.hidden
  s.page = structuredClone(p.page)
  s.ink = p.ink.slice()
  s.x = structuredClone(p.x)
}

export const snapFull = (s: Sheet): FullSnap => ({ cells: new Map(s.cells), props: snapProps(s) })

export function restoreFull(s: Sheet, f: FullSnap) {
  s.cells = new Map(f.cells)
  restoreProps(s, f.props)
  s.touchUsed()
}

export const snapWb = (wb: Workbook): WbSnap => ({ sheets: wb.sheets.slice(), names: new Map(wb.names), protection: wb.protection ? { ...wb.protection } : null })

export function restoreWb(wb: Workbook, w: WbSnap) {
  wb.sheets = w.sheets.slice()
  wb.names = new Map(w.names)
  wb.protection = w.protection ? { ...w.protection } : null
}

/** Records the "before" state of everything a command touches, then captures "after" on commit. */
export class Tx {
  cells = new Map<Sheet, Map<number, CellData | undefined>>()
  props = new Map<Sheet, PropsSnap>()
  full = new Map<Sheet, FullSnap>()
  wb: WbSnap | null = null
  changed = new Map<Sheet, Set<number>>()
  structural = false

  constructor(readonly label: string) {}

  noteCell(sheet: Sheet, key: number) {
    if (this.full.has(sheet)) {
      this.markChanged(sheet, key)
      return
    }
    let m = this.cells.get(sheet)
    if (!m) this.cells.set(sheet, (m = new Map()))
    if (!m.has(key)) m.set(key, sheet.cells.get(key))
    this.markChanged(sheet, key)
  }

  markChanged(sheet: Sheet, key: number) {
    let set = this.changed.get(sheet)
    if (!set) this.changed.set(sheet, (set = new Set()))
    set.add(key)
  }

  noteProps(sheet: Sheet) {
    if (!this.props.has(sheet) && !this.full.has(sheet)) this.props.set(sheet, snapProps(sheet))
  }

  noteFull(sheet: Sheet) {
    if (this.full.has(sheet)) return
    // merge earlier cell-level notes into the full snapshot's "before"
    const before = snapFull(sheet)
    const earlier = this.cells.get(sheet)
    if (earlier) {
      earlier.forEach((v, k) => (v === undefined ? before.cells.delete(k) : before.cells.set(k, v)))
      this.cells.delete(sheet)
    }
    const props = this.props.get(sheet)
    if (props) {
      before.props = props
      this.props.delete(sheet)
    }
    this.full.set(sheet, before)
    this.structural = true
  }

  noteWorkbook(wb: Workbook) {
    if (!this.wb) this.wb = snapWb(wb)
    this.structural = true
  }

  get empty() {
    return !this.cells.size && !this.props.size && !this.full.size && !this.wb
  }
}

export type HistoryEntry = {
  label: string
  before: Tx
  after: {
    cells: Map<Sheet, Map<number, CellData | undefined>>
    props: Map<Sheet, PropsSnap>
    full: Map<Sheet, FullSnap>
    wb: WbSnap | null
  }
  selBefore: unknown
  selAfter: unknown
  sheetBefore: number
  sheetAfter: number
}

export function captureAfter(tx: Tx, wb: Workbook): HistoryEntry['after'] {
  const cells = new Map<Sheet, Map<number, CellData | undefined>>()
  tx.cells.forEach((m, sheet) => {
    const a = new Map<number, CellData | undefined>()
    m.forEach((_v, k) => a.set(k, sheet.cells.get(k)))
    cells.set(sheet, a)
  })
  const props = new Map<Sheet, PropsSnap>()
  tx.props.forEach((_p, sheet) => props.set(sheet, snapProps(sheet)))
  const full = new Map<Sheet, FullSnap>()
  tx.full.forEach((_f, sheet) => full.set(sheet, snapFull(sheet)))
  return { cells, props, full, wb: tx.wb ? snapWb(wb) : null }
}

// Compact JSON form of a workbook for autosave in the browser.
import { Sheet, type CellData, type PageSetup, type RichRun } from '../model/sheet'
import type { Style } from '../model/style'
import { CellError, type ErrorCode, type Scalar } from '../model/types'
import { Workbook, type DefinedName } from '../model/workbook'
import { emptyExtras, type SheetExtras } from '../model/extras'

type JValue = number | string | boolean | null | { e: string }
type JCell = [number, JValue | undefined, string | undefined, number | undefined, string | undefined, RichRun[]?]

type JSheet = {
  id: number
  name: string
  cells: JCell[]
  cols: { def: number; manual: [number, number][]; hidden: number[] }
  rows: { def: number; manual: [number, number][]; hidden: number[] }
  colStyle: [number, number][]
  rowStyle: [number, number][]
  merges: [number, number, number, number][]
  freeze: { rows: number; cols: number }
  tabColor?: string
  hidden: boolean
  showGrid: boolean
  showHeadings: boolean
  showFormulas: boolean
  zoom: number
  page: PageSetup
  ink?: Sheet['ink']
  x?: SheetExtras
}

export type JWorkbook = {
  version: 1
  styles: Style[]
  sheets: JSheet[]
  names: DefinedName[]
  active: number
  calcMode: 'auto' | 'manual'
  images?: [string, string][]
  protection?: Workbook['protection']
  customViews?: Workbook['customViews']
  customStyles?: Workbook['customStyles']
  tableStyles?: Workbook['tableStyles']
  theme?: Workbook['theme']
  iterate?: Workbook['iterate']
}

const enc = (v: Scalar | undefined): JValue | undefined => (v instanceof CellError ? { e: v.code } : v)
const dec = (v: JValue | undefined): Scalar | undefined => (v && typeof v === 'object' ? new CellError(v.e as ErrorCode) : v)

export function toJSON(wb: Workbook, active: number): JWorkbook {
  const used = new Map<number, number>()
  const styles: Style[] = [{}]
  const sid = (id: number | undefined) => {
    if (!id) return undefined
    let n = used.get(id)
    if (n === undefined) {
      n = styles.length
      styles.push(wb.styles.get(id))
      used.set(id, n)
    }
    return n
  }
  const sheets = wb.sheets.map((s): JSheet => ({
    id: s.id,
    name: s.name,
    cells: [...s.cells].map(([k, d]) => (d.rich ? [k, enc(d.v), d.f, sid(d.s), d.link, d.rich] : [k, enc(d.v), d.f, sid(d.s), d.link]) as JCell),
    cols: { def: s.cols.def, manual: [...s.cols.manual], hidden: [...s.cols.hidden] },
    rows: { def: s.rows.def, manual: [...s.rows.manual], hidden: [...s.rows.hidden] },
    colStyle: [...s.colStyle].map(([k, v]) => [k, sid(v) ?? 0]),
    rowStyle: [...s.rowStyle].map(([k, v]) => [k, sid(v) ?? 0]),
    merges: s.merges.map((m) => [m.r1, m.c1, m.r2, m.c2]),
    freeze: s.freeze,
    tabColor: s.tabColor,
    hidden: s.hidden,
    showGrid: s.showGrid,
    showHeadings: s.showHeadings,
    showFormulas: s.showFormulas,
    zoom: s.zoom,
    page: s.page,
    ink: s.ink.length ? s.ink : undefined,
    x: s.x,
  }))
  const usedImages = new Set(wb.sheets.flatMap((s) => [...s.x.objects.map((o) => (o.kind === 'picture' ? o.image : '')), s.page.background ?? '']))
  return {
    version: 1,
    styles,
    sheets,
    names: [...wb.names.values()],
    active,
    calcMode: wb.calcMode,
    images: [...wb.images].filter(([k]) => usedImages.has(k)),
    protection: wb.protection,
    customViews: wb.customViews.length ? wb.customViews : undefined,
    customStyles: wb.customStyles.length ? wb.customStyles : undefined,
    tableStyles: wb.tableStyles.length ? wb.tableStyles : undefined,
    theme: wb.theme,
    iterate: wb.iterate.on ? wb.iterate : undefined,
  }
}

export function fromJSON(j: JWorkbook): Workbook {
  const wb = new Workbook(true)
  const ids = j.styles.map((s) => wb.styles.intern(s))
  const sid = (n: number | undefined) => (n ? ids[n] : undefined)
  for (const js of j.sheets) {
    const s = new Sheet(js.id, js.name)
    wb.bumpId(js.id)
    for (const [k, v, f, st, link, rich] of js.cells) {
      const d: CellData = {}
      const val = dec(v)
      if (val !== undefined && val !== null) d.v = val
      if (f !== undefined && f !== null) d.f = f
      const style = sid(st ?? undefined)
      if (style) d.s = style
      if (link) d.link = link
      if (rich) d.rich = rich
      s.cells.set(k, d)
    }
    s.cols.def = js.cols.def
    js.cols.manual.forEach(([k, v]) => s.cols.manual.set(k, v))
    js.cols.hidden.forEach((k) => s.cols.hidden.add(k))
    s.rows.def = js.rows.def
    js.rows.manual.forEach(([k, v]) => s.rows.manual.set(k, v))
    js.rows.hidden.forEach((k) => s.rows.hidden.add(k))
    s.cols.touch()
    s.rows.touch()
    js.colStyle.forEach(([k, v]) => s.colStyle.set(k, sid(v) ?? 0))
    js.rowStyle.forEach(([k, v]) => s.rowStyle.set(k, sid(v) ?? 0))
    s.merges = js.merges.map(([r1, c1, r2, c2]) => ({ r1, c1, r2, c2 }))
    s.freeze = js.freeze
    s.tabColor = js.tabColor
    s.hidden = js.hidden
    s.showGrid = js.showGrid
    s.showHeadings = js.showHeadings
    s.showFormulas = js.showFormulas
    s.zoom = js.zoom || 100
    s.page = { ...s.page, ...js.page }
    s.ink = js.ink ?? []
    s.x = { ...emptyExtras(), ...(js.x ?? {}) }
    for (const o of s.x.objects) wb.bumpObjectId(o.id)
    for (const t of s.x.tables) wb.bumpObjectId(t.id)
    for (const r of [...s.x.cf, ...s.x.validations, ...s.x.sparklines, ...s.x.pivots]) wb.bumpObjectId(r.id)
    wb.sheets.push(s)
  }
  for (const n of j.names) wb.setName(n)
  wb.calcMode = j.calcMode ?? 'auto'
  for (const [k, v] of j.images ?? []) wb.images.set(k, v)
  wb.protection = j.protection ?? null
  wb.customViews = j.customViews ?? []
  wb.customStyles = j.customStyles ?? []
  wb.tableStyles = j.tableStyles ?? []
  wb.theme = j.theme
  if (j.iterate) wb.iterate = { ...j.iterate }
  if (!wb.sheets.length) wb.addSheet()
  return wb
}

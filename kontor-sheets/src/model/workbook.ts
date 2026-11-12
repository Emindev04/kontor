import { Sheet } from './sheet'
import { StyleTable } from './style'

export interface DefinedName {
  name: string
  /** Formula text without "=", e.g. "Sheet1!$A$1:$B$10". */
  ref: string
  /** Sheet id for sheet-scoped names. */
  scope?: number
  comment?: string
}

/** A saved view: zoom, selection, frozen panes and hidden rows/columns of one sheet (View > Custom Views). */
export interface CustomView {
  name: string
  sheet: number
  zoom: number
  sel: { r1: number; c1: number; r2: number; c2: number }
  freeze: { rows: number; cols: number }
  hiddenRows: number[]
  hiddenCols: number[]
  showGrid: boolean
  showHeadings: boolean
}

export class Workbook {
  sheets: Sheet[] = []
  styles = new StyleTable()
  names = new Map<string, DefinedName>()
  calcMode: 'auto' | 'manual' = 'auto'
  props = { author: '', created: new Date().toISOString(), title: '' }
  /** Picture data (data URLs) by id; shared by picture objects, never changed once added. */
  images = new Map<string, string>()
  /** Protect Workbook: structure locked (no adding, deleting, renaming or moving sheets). */
  protection: { hash: string; structure: boolean } | null = null
  customViews: CustomView[] = []
  /** Cell styles made with New Cell Style (name and the formatting they apply). */
  customStyles: { name: string; patch: import('./style').StylePatch }[] = []
  /** Table styles made with New Table Style. */
  tableStyles: import('./tableStyles').CustomTableStyle[] = []
  /** Page Layout > Themes (undefined = the default theme). */
  theme?: import('./theme').Theme
  /** Iterative calculation for circular references (File > Options > Formulas). */
  iterate = { on: false, max: 100, change: 0.001 }
  private nextId = 1
  private nextObj = 1

  /** New id for tables, charts, rules and other sheet extras (unique within the workbook). */
  newObjectId() {
    return this.nextObj++
  }

  bumpObjectId(id: number) {
    if (id >= this.nextObj) this.nextObj = id + 1
  }

  addImage(dataUrl: string): string {
    for (const [k, v] of this.images) if (v === dataUrl) return k
    const id = `img${this.images.size + 1}_${Math.random().toString(36).slice(2, 7)}`
    this.images.set(id, dataUrl)
    return id
  }

  constructor(empty = false) {
    if (!empty) this.addSheet()
  }

  newSheetId() {
    return this.nextId++
  }

  bumpId(id: number) {
    if (id >= this.nextId) this.nextId = id + 1
  }

  uniqueSheetName(base = 'Sheet'): string {
    for (let i = 1; ; i++) {
      const name = `${base}${i}`
      if (!this.sheetByName(name)) return name
    }
  }

  addSheet(name?: string, at = this.sheets.length): Sheet {
    const sheet = new Sheet(this.newSheetId(), name ?? this.uniqueSheetName())
    this.sheets.splice(at, 0, sheet)
    return sheet
  }

  sheetByName(name: string): Sheet | undefined {
    const n = name.toUpperCase()
    return this.sheets.find((s) => s.name.toUpperCase() === n)
  }

  sheetById(id: number): Sheet | undefined {
    return this.sheets.find((s) => s.id === id)
  }

  getName(name: string, sheetId?: number): DefinedName | undefined {
    const key = name.toUpperCase()
    if (sheetId !== undefined) {
      const scoped = this.names.get(`${sheetId}!${key}`)
      if (scoped) return scoped
    }
    return this.names.get(key)
  }

  setName(n: DefinedName) {
    this.names.set(n.scope !== undefined ? `${n.scope}!${n.name.toUpperCase()}` : n.name.toUpperCase(), n)
  }

  deleteName(n: DefinedName) {
    this.names.delete(n.scope !== undefined ? `${n.scope}!${n.name.toUpperCase()}` : n.name.toUpperCase())
  }
}

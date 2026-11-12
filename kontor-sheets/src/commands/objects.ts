// Floating objects over the grid (charts, pictures, shapes, text boxes) and the contextual
// state that decides which extra ribbon tabs are shown.
import type { Anchor, ChartDef, ChartType, PictureObj, ShapeObj, SheetObject } from '../model/extras'
import type { Sheet } from '../model/sheet'
import { SHAPES } from '../charts/shapes'
import type { Doc } from './doc'

export function selectedObject(doc: Doc): SheetObject | null {
  if (doc.selObj === null) return null
  return doc.sheet.x.objects.find((o) => o.id === doc.selObj) ?? null
}

export function selectObject(doc: Doc, id: number | null) {
  doc.selObj = id
  if (doc.edit) doc.cancelEdit()
  doc.emit()
}

export function tableAt(sheet: Sheet, r: number, c: number) {
  return sheet.x.tables.find((t) => r >= t.range.r1 && r <= t.range.r2 && c >= t.range.c1 && c <= t.range.c2)
}

export function pivotAt(sheet: Sheet, r: number, c: number) {
  return sheet.x.pivots.find((p) => (p.output ? r >= p.output.r1 && r <= p.output.r2 && c >= p.output.c1 && c <= p.output.c2 : r === p.r && c === p.c))
}

/** Which contextual tabs apply: a selected object, or the active cell inside a table or PivotTable. */
export function activeContext(doc: Doc): 'chart' | 'shape' | 'slicer' | 'table' | 'pivot' | null {
  const o = selectedObject(doc)
  if (o) return o.kind === 'chart' ? 'chart' : o.kind === 'slicer' ? 'slicer' : 'shape'
  const a = doc.sel.active
  if (tableAt(doc.sheet, a.r, a.c)) return 'table'
  if (pivotAt(doc.sheet, a.r, a.c)) return 'pivot'
  return null
}

function nextName(doc: Doc, base: string) {
  const taken = new Set(doc.sheet.x.objects.map((o) => o.name))
  for (let i = 1; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`
}

/** Places a new object to the right of the current selection, inside the visible area. */
export function defaultAnchor(doc: Doc, w: number, h: number): Anchor {
  const sheet = doc.sheet
  const rg = doc.activeRange
  const c = Math.min(rg.c2, rg.c1 + 50)
  const x = sheet.cols.offset(c + 1) + 24
  const y = sheet.rows.offset(rg.r1)
  return { x, y, w, h }
}

export function addObject(doc: Doc, obj: SheetObject, label = 'Insert Object', sheet = doc.sheet) {
  doc.transact(label, () => {
    doc.noteProps(sheet)
    sheet.x.objects = [...sheet.x.objects, obj]
  })
  doc.selObj = obj.id
  doc.emit()
  return obj.id
}

export function updateObject(doc: Doc, id: number, patch: Partial<SheetObject>, label = 'Format Object', sheet = doc.sheet) {
  doc.transact(label, () => {
    doc.noteProps(sheet)
    sheet.x.objects = sheet.x.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as SheetObject) : o))
  })
}

export function updateChart(doc: Doc, id: number, patch: Partial<ChartDef>, label = 'Chart') {
  updateObject(doc, id, patch as Partial<SheetObject>, label)
}

export function deleteObject(doc: Doc, id: number) {
  const sheet = doc.sheet
  doc.transact('Delete Object', () => {
    doc.noteProps(sheet)
    sheet.x.objects = sheet.x.objects.filter((o) => o.id !== id)
  })
  if (doc.selObj === id) doc.selObj = null
  doc.emit()
}

export function arrangeObject(doc: Doc, id: number, how: 'front' | 'back' | 'forward' | 'backward') {
  const sheet = doc.sheet
  const list = sheet.x.objects.slice()
  const i = list.findIndex((o) => o.id === id)
  if (i < 0) return
  const [o] = list.splice(i, 1)
  const at = how === 'front' ? list.length : how === 'back' ? 0 : how === 'forward' ? Math.min(list.length, i + 1) : Math.max(0, i - 1)
  list.splice(at, 0, o)
  doc.transact('Arrange', () => {
    doc.noteProps(sheet)
    sheet.x.objects = list
  })
}

export function duplicateObject(doc: Doc, id: number) {
  const o = doc.sheet.x.objects.find((x) => x.id === id)
  if (!o) return
  const copy = structuredClone(o) as SheetObject
  copy.id = doc.wb.newObjectId()
  copy.name = nextName(doc, o.name.replace(/\s\d+$/, ''))
  copy.anchor = { ...o.anchor, x: o.anchor.x + 16, y: o.anchor.y + 16 }
  addObject(doc, copy, 'Duplicate')
}

export function newChart(doc: Doc, type: ChartType, grouping: ChartDef['grouping'], source: string, extra: Partial<ChartDef> = {}): ChartDef {
  return {
    kind: 'chart',
    id: doc.wb.newObjectId(),
    name: nextName(doc, 'Chart'),
    anchor: defaultAnchor(doc, 480, 288),
    type,
    grouping,
    markers: type === 'line' || type === 'scatter' || type === 'radar',
    smooth: false,
    source,
    byRow: false,
    title: { show: true },
    legend: type === 'pie' || type === 'doughnut' ? 'right' : 'bottom',
    dataLabels: 'none',
    axisTitles: {},
    axes: { x: true, y: true },
    gridlines: { major: type !== 'pie' && type !== 'doughnut', minor: false, vertical: false },
    style: 1,
    palette: 0,
    holeSize: 50,
    gapWidth: type === 'histogram' ? 2 : 150,
    ...extra,
  }
}

export function newPicture(doc: Doc, image: string, w: number, h: number, name = 'Picture'): PictureObj {
  return { kind: 'picture', id: doc.wb.newObjectId(), name: nextName(doc, name), anchor: defaultAnchor(doc, w, h), image, rotation: 0 }
}

export function newShape(doc: Doc, shape: string, textBox = false): ShapeObj {
  const def = SHAPES.find((s) => s.id === shape)
  const line = !!def?.line
  const w = textBox ? 180 : line ? 120 : 120
  const h = textBox ? 60 : line ? 80 : 90
  return {
    kind: 'shape',
    id: doc.wb.newObjectId(),
    name: nextName(doc, textBox ? 'TextBox' : (def?.label ?? 'Shape').split(':')[0]),
    anchor: defaultAnchor(doc, w, h),
    shape,
    fill: textBox ? '#FFFFFF' : line ? null : '#3B7DD8',
    line: textBox ? '#7F7F7F' : line ? '#3B7DD8' : '#2C5FA8',
    lineWidth: line ? 2 : 1,
    text: '',
    textColor: textBox ? '#000000' : '#FFFFFF',
    fontSize: 11,
    bold: false,
    italic: false,
    align: textBox ? 'left' : 'center',
    vAlign: textBox ? 'top' : 'middle',
    rotation: 0,
    textBox,
  }
}

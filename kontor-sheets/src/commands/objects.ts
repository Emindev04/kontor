// Floating objects over the grid (charts, pictures, shapes, text boxes) and the contextual
// state that decides which extra ribbon tabs are shown.
import type { Anchor, ChartDef, ChartType, PictureObj, ShapeObj, SheetObject } from '../model/extras'
import type { Sheet } from '../model/sheet'
import { SHAPES } from '../charts/shapes'
import type { Doc } from './doc'
import { tx } from '../i18n'

export function selectedObject(doc: Doc): SheetObject | null {
  if (doc.selObj === null) return null
  return doc.sheet.x.objects.find((o) => o.id === doc.selObj) ?? null
}

export function selectObject(doc: Doc, id: number | null, add = false) {
  const o = id === null ? undefined : doc.sheet.x.objects.find((x) => x.id === id)
  if (add && doc.selObj !== null && id !== null) {
    // Ctrl/Shift+click adds the object (and its group) to the selection, or removes it
    const ids = groupIds(doc, id)
    const current = new Set([doc.selObj, ...doc.selObjs])
    const remove = ids.every((x) => current.has(x))
    ids.forEach((x) => (remove ? current.delete(x) : current.add(x)))
    const list = [...current]
    doc.selObj = list.includes(doc.selObj) ? doc.selObj : list[0] ?? null
    doc.selObjs = list.filter((x) => x !== doc.selObj)
  } else {
    doc.selObj = id
    doc.selObjs = o?.group !== undefined ? groupIds(doc, o.id).filter((x) => x !== o.id) : []
  }
  if (doc.edit) doc.cancelEdit()
  doc.emit()
}

/** The object and every object grouped with it. */
function groupIds(doc: Doc, id: number): number[] {
  const o = doc.sheet.x.objects.find((x) => x.id === id)
  if (!o || o.group === undefined) return [id]
  return doc.sheet.x.objects.filter((x) => x.group === o.group).map((x) => x.id)
}

/** Ids of all selected objects (the primary one first). */
export function selectedIds(doc: Doc): number[] {
  return doc.selObj === null ? [] : [doc.selObj, ...doc.selObjs.filter((x) => x !== doc.selObj)]
}

const box = (a: Anchor) => ({ x1: Math.min(a.x, a.x + a.w), y1: Math.min(a.y, a.y + a.h), x2: Math.max(a.x, a.x + a.w), y2: Math.max(a.y, a.y + a.h) })

export type AlignHow = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/** Arrange > Align: lines the selected objects up (with one object: against the sheet's top-left corner). */
export function alignObjects(doc: Doc, how: AlignHow) {
  const ids = selectedIds(doc)
  const objs = doc.sheet.x.objects.filter((o) => ids.includes(o.id))
  if (!objs.length) return
  const boxes = objs.map((o) => box(o.anchor))
  const all = objs.length === 1 ? { x1: 0, y1: 0, x2: boxes[0].x2 - boxes[0].x1, y2: boxes[0].y2 - boxes[0].y1 } : {
    x1: Math.min(...boxes.map((b) => b.x1)), y1: Math.min(...boxes.map((b) => b.y1)), x2: Math.max(...boxes.map((b) => b.x2)), y2: Math.max(...boxes.map((b) => b.y2)),
  }
  moveEach(doc, tx('Align Objects'), objs.map((o, i) => {
    const b = boxes[i]
    const w = b.x2 - b.x1
    const h = b.y2 - b.y1
    const dx = how === 'left' ? all.x1 - b.x1 : how === 'right' ? all.x2 - b.x2 : how === 'center' ? (all.x1 + all.x2) / 2 - (b.x1 + w / 2) : 0
    const dy = how === 'top' ? all.y1 - b.y1 : how === 'bottom' ? all.y2 - b.y2 : how === 'middle' ? (all.y1 + all.y2) / 2 - (b.y1 + h / 2) : 0
    return { id: o.id, dx, dy }
  }))
}

/** Arrange > Align > Distribute Horizontally / Vertically: equal gaps between three or more objects. */
export function distributeObjects(doc: Doc, axis: 'h' | 'v') {
  const ids = selectedIds(doc)
  const objs = doc.sheet.x.objects.filter((o) => ids.includes(o.id))
  if (objs.length < 3) return
  const items = objs.map((o) => ({ o, b: box(o.anchor) })).sort((a, b) => (axis === 'h' ? a.b.x1 - b.b.x1 : a.b.y1 - b.b.y1))
  const size = (b: ReturnType<typeof box>) => (axis === 'h' ? b.x2 - b.x1 : b.y2 - b.y1)
  const start = axis === 'h' ? items[0].b.x1 : items[0].b.y1
  const last = items[items.length - 1].b
  const end = axis === 'h' ? last.x2 : last.y2
  const gap = (end - start - items.reduce((s, it) => s + size(it.b), 0)) / (items.length - 1)
  let pos = start
  moveEach(doc, tx('Distribute Objects'), items.map((it) => {
    const from = axis === 'h' ? it.b.x1 : it.b.y1
    const d = pos - from
    pos += size(it.b) + gap
    return { id: it.o.id, dx: axis === 'h' ? d : 0, dy: axis === 'v' ? d : 0 }
  }))
}

/** Moves several objects in one undo step. */
export function moveEach(doc: Doc, label: string, moves: { id: number; dx: number; dy: number }[], sheet = doc.sheet) {
  const by = new Map(moves.map((m) => [m.id, m]))
  doc.transact(label, () => {
    doc.noteProps(sheet)
    sheet.x.objects = sheet.x.objects.map((o) => {
      const m = by.get(o.id)
      return m && (m.dx || m.dy) ? ({ ...o, anchor: { ...o.anchor, x: Math.max(0, o.anchor.x + m.dx), y: Math.max(0, o.anchor.y + m.dy) } } as SheetObject) : o
    })
  })
}

/** Arrange > Group: the selected objects select and move together. */
export function groupObjects(doc: Doc) {
  const ids = selectedIds(doc)
  if (ids.length < 2) return
  const gid = doc.wb.newObjectId()
  const sheet = doc.sheet
  doc.transact(tx('Group'), () => {
    doc.noteProps(sheet)
    sheet.x.objects = sheet.x.objects.map((o) => (ids.includes(o.id) ? ({ ...o, group: gid } as SheetObject) : o))
  })
}

export function ungroupObjects(doc: Doc) {
  const ids = selectedIds(doc)
  const sheet = doc.sheet
  if (!sheet.x.objects.some((o) => ids.includes(o.id) && o.group !== undefined)) return
  doc.transact(tx('Ungroup'), () => {
    doc.noteProps(sheet)
    sheet.x.objects = sheet.x.objects.map((o) => {
      if (!ids.includes(o.id) || o.group === undefined) return o
      const copy = { ...o } as SheetObject
      delete copy.group
      return copy
    })
  })
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

export function addObject(doc: Doc, obj: SheetObject, label = tx('Insert Object'), sheet = doc.sheet) {
  doc.transact(label, () => {
    doc.noteProps(sheet)
    sheet.x.objects = [...sheet.x.objects, obj]
  })
  doc.selObj = obj.id
  doc.selObjs = []
  doc.emit()
  return obj.id
}

export function updateObject(doc: Doc, id: number, patch: Partial<SheetObject>, label = tx('Format Object'), sheet = doc.sheet) {
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
  doc.transact(tx('Delete Object'), () => {
    doc.noteProps(sheet)
    sheet.x.objects = sheet.x.objects.filter((o) => o.id !== id)
  })
  if (doc.selObj === id) {
    doc.selObj = null
    doc.selObjs = []
  }
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
  doc.transact(tx('Arrange'), () => {
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
  addObject(doc, copy, tx('Duplicate'))
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

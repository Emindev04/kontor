// Slicers: floating button panels that filter a table column or a PivotTable field.
import type { SlicerObj } from '../model/extras'
import type { Doc } from './doc'
import { addObject, defaultAnchor } from './objects'
import { distinctValues, setColumnFilter, type FilterTarget } from './filter'
import { fieldItems, readSource, updatePivot } from './pivot'
import { tx } from '../i18n'

export type SlicerTarget = { type: 'table'; table: string } | { type: 'pivot'; pivot: number }

const SLICER_COLORS = ['#2E7D4F', '#2E6FD8', '#C55A11', '#7030A0', '#BF8F00', '#5B6770']

function tableOf(doc: Doc, name: string) {
  for (const sheet of doc.wb.sheets) for (const t of sheet.x.tables) if (t.name === name) return { sheet, t }
  return null
}

function pivotOf(doc: Doc, id: number) {
  for (const sheet of doc.wb.sheets) for (const p of sheet.x.pivots) if (p.id === id) return { sheet, p }
  return null
}

/** Field names a slicer can be made for (PivotTable fields in the layout first; no calculated fields). */
export function slicerFields(doc: Doc, target: SlicerTarget): string[] {
  if (target.type === 'table') return tableOf(doc, target.table)?.t.columns.map((c) => c.name) ?? []
  const hit = pivotOf(doc, target.pivot)
  if (!hit) return []
  const p = hit.p
  const calc = new Set((p.calcFields ?? []).map((c) => c.name))
  const all = (readSource(doc, p)?.fields ?? []).filter((f) => !calc.has(f))
  const placed = [...p.rows, ...p.cols, ...p.filters.map((x) => x.field)].filter((f, i, a) => a.indexOf(f) === i && all.includes(f))
  return [...placed, ...all.filter((f) => !placed.includes(f))]
}

/** All items of the slicer's field, with the current selection. */
export function slicerItems(doc: Doc, s: SlicerObj): { items: string[]; selected: Set<string> } {
  let items: string[] = []
  if (s.source.type === 'table') {
    const hit = tableOf(doc, s.source.table)
    if (hit) {
      const col = hit.t.columns.findIndex((c) => c.name === (s.source as { column: string }).column)
      if (col >= 0) {
        const target: FilterTarget = { kind: 'table', table: hit.t }
        const dv = distinctValues(doc, hit.sheet, target, col)
        items = dv.values.map((v) => v.text)
        if (dv.blanks) items.push('(blank)')
      }
    }
  } else {
    const hit = pivotOf(doc, s.source.pivot)
    if (hit) items = fieldItems(doc, { ...hit.p, slicerFilters: undefined }, s.source.field)
  }
  return { items: customOrder(items), selected: new Set(s.selected ?? items) }
}

const LISTS = [
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
]

/** Month and weekday names sort in calendar order (the custom lists the original applies to slicers). */
function customOrder(items: string[]): string[] {
  for (const list of LISTS) {
    const rank = (x: string) => list.indexOf(x.slice(0, 3).toLowerCase())
    if (items.length && items.every((x) => x === '(blank)' || rank(x) >= 0)) return [...items].sort((a, b) => (a === '(blank)' ? 1 : b === '(blank)' ? -1 : rank(a) - rank(b)))
  }
  return items
}

/** Applies the slicer's selection to its table or PivotTable (inside the caller's transaction). */
function applySlicer(doc: Doc, s: SlicerObj) {
  if (s.source.type === 'table') {
    const hit = tableOf(doc, s.source.table)
    if (!hit) return
    const col = hit.t.columns.findIndex((c) => c.name === (s.source as { column: string }).column)
    if (col < 0) return
    const target: FilterTarget = { kind: 'table', table: hit.t }
    const sel = s.selected
    setColumnFilter(doc, target, col, sel === null ? null : { kind: 'values', values: sel.filter((v) => v !== '(blank)'), blanks: sel.includes('(blank)') })
    return
  }
  const field = s.source.field
  updatePivot(doc, s.source.pivot, (p) => {
    const f = { ...(p.slicerFilters ?? {}) }
    if (s.selected === null) delete f[field]
    else f[field] = s.selected
    p.slicerFilters = Object.keys(f).length ? f : undefined
  }, tx('Slicer'))
}

/** Click on an item: select only it, or toggle it with Ctrl / multi-select on. */
export function clickSlicerItem(doc: Doc, id: number, item: string, toggle: boolean) {
  const s = doc.sheet.x.objects.find((o): o is SlicerObj => o.id === id && o.kind === 'slicer')
  if (!s) return
  const { items, selected } = slicerItems(doc, s)
  let next: string[] | null
  if (toggle || s.multi) {
    const set = new Set(selected)
    if (set.has(item)) set.delete(item)
    else set.add(item)
    next = set.size === 0 || set.size === items.length ? null : items.filter((x) => set.has(x))
  } else next = s.selected && s.selected.length === 1 && s.selected[0] === item ? null : [item]
  setSlicer(doc, s, next)
}

export function clearSlicer(doc: Doc, id: number) {
  const s = doc.sheet.x.objects.find((o): o is SlicerObj => o.id === id && o.kind === 'slicer')
  if (s) setSlicer(doc, s, null)
}

function setSlicer(doc: Doc, s: SlicerObj, selected: string[] | null) {
  const sheet = doc.sheet
  doc.transact(tx('Slicer'), () => {
    doc.noteProps(sheet)
    const o = sheet.x.objects.find((x) => x.id === s.id) as SlicerObj
    o.selected = selected
    applySlicer(doc, o)
  })
}

/** Inserts one slicer per field, cascaded like the original. */
export function insertSlicers(doc: Doc, target: SlicerTarget, fields: string[]) {
  if (!fields.length) return
  doc.transact(tx('Insert Slicer'), () => {
    fields.forEach((field, i) => {
      const a = defaultAnchor(doc, 190, 240)
      const s: SlicerObj = {
        kind: 'slicer',
        id: doc.wb.newObjectId(),
        name: field,
        anchor: { ...a, x: a.x + i * 24, y: a.y + i * 24 },
        caption: field,
        source: target.type === 'table' ? { type: 'table', table: target.table, column: field } : { type: 'pivot', pivot: target.pivot, field },
        selected: null,
        columns: 1,
        color: SLICER_COLORS[0],
      }
      addObject(doc, s, tx('Insert Slicer'))
    })
  })
}

export { SLICER_COLORS }

// ---------- Timelines ----------

/** Date fields of a PivotTable's source (fields whose values are dates). */
export function timelineFields(doc: Doc, pivot: number): string[] {
  const hit = pivotOf(doc, pivot)
  const src = hit && readRawDates(doc, hit.p)
  return src ? src.fields.filter((_, i) => src.isDate[i]) : []
}

function readRawDates(doc: Doc, p: Parameters<typeof readSource>[1]) {
  const src = readSource(doc, { source: p.source })
  if (!src) return null
  const isDate = src.fields.map((_, i) => {
    const fmt = src.fmts[i] ?? ''
    const vals = src.rows.map((r) => r.values[i]).filter((v) => v !== null)
    return vals.length > 0 && vals.every((v) => typeof v === 'number') && /[dmy]/i.test(fmt.replace(/"[^"]*"|\[[^\]]*\]/g, ''))
  })
  return { ...src, isDate }
}

/** First and last date of the timeline's field. */
export function timelineSpan(doc: Doc, s: SlicerObj): { min: number; max: number } | null {
  if (s.source.type !== 'pivot') return null
  const hit = pivotOf(doc, s.source.pivot)
  const src = hit && readSource(doc, { source: hit.p.source })
  if (!src) return null
  const i = src.fields.indexOf(s.source.field)
  const nums = src.rows.map((r) => r.values[i]).filter((v): v is number => typeof v === 'number')
  return nums.length ? { min: Math.min(...nums), max: Math.max(...nums) } : null
}

export function insertTimeline(doc: Doc, pivot: number, field: string) {
  const a = defaultAnchor(doc, 420, 130)
  const s: SlicerObj = {
    kind: 'slicer',
    id: doc.wb.newObjectId(),
    name: field,
    anchor: a,
    caption: field,
    source: { type: 'pivot', pivot, field },
    selected: null,
    columns: 1,
    color: SLICER_COLORS[1],
    timeline: { level: 'months', start: null, end: null },
  }
  addObject(doc, s, tx('Insert Timeline'))
}

/** Sets the timeline's date range ([start, end) serials, null = all periods) and filters its PivotTable. */
export function setTimelineRange(doc: Doc, id: number, start: number | null, end: number | null) {
  const sheet = doc.wb.sheets.find((x) => x.x.objects.some((o) => o.id === id))
  const s = sheet?.x.objects.find((o) => o.id === id)
  if (!sheet || !s || s.kind !== 'slicer' || !s.timeline || s.source.type !== 'pivot') return
  const src = s.source
  doc.transact(tx('Timeline'), () => {
    doc.noteProps(sheet)
    sheet.x.objects = sheet.x.objects.map((o) => (o.id === id && o.kind === 'slicer' ? { ...o, timeline: { ...o.timeline!, start, end } } : o))
    updatePivot(doc, src.pivot, (p) => {
      const d = { ...(p.dateFilters ?? {}) }
      if (start === null || end === null) delete d[src.field]
      else d[src.field] = { start, end }
      p.dateFilters = Object.keys(d).length ? d : undefined
    }, tx('Timeline'))
  })
}

export function setTimelineLevel(doc: Doc, id: number, level: NonNullable<SlicerObj['timeline']>['level']) {
  const sheet = doc.wb.sheets.find((x) => x.x.objects.some((o) => o.id === id))
  if (!sheet) return
  doc.transact(tx('Timeline Level'), () => {
    doc.noteProps(sheet)
    sheet.x.objects = sheet.x.objects.map((o) => (o.id === id && o.kind === 'slicer' && o.timeline ? { ...o, timeline: { ...o.timeline, level } } : o))
  })
}

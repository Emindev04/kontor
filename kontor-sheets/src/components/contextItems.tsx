// Extra context-menu entries for objects and for cells in tables, filters, notes and comments.
import type { AppApi } from './appContext'
import type { MenuItem } from './ui'
import type { SheetObject } from '../model/extras'
import { tableAt } from '../commands/objects'
import { convertToRange, insertTableRows, setTotalsRow } from '../commands/tables'
import { displayText, filterArea, setColumnFilter, sheetTargets, toggleAutoFilter } from '../commands/filter'
import { noteAt, setNote, threadAt, toggleNote } from '../commands/review'
import { validationAt } from '../commands/validation'
import { deleteCells } from '../commands/ops'

export function objectContextItems(app: AppApi, o: SheetObject, act: { arrange: (h: 'front' | 'back' | 'forward' | 'backward') => void; del: () => void; dup: () => void }): MenuItem[] {
  const common: MenuItem[] = [
    { label: 'Bring to Front', onClick: () => act.arrange('front') },
    { label: 'Send to Back', onClick: () => act.arrange('back') },
    { label: 'Duplicate', shortcut: 'Ctrl+D', onClick: act.dup },
    { label: 'Delete', shortcut: 'Delete', onClick: act.del },
  ]
  if (o.kind === 'chart')
    return [
      { label: 'Change Chart Type…', onClick: () => app.dialog({ kind: 'changeChartType', data: o.id }) },
      { label: 'Select Data…', onClick: () => app.dialog({ kind: 'selectData', data: o.id }) },
      { label: 'Move Chart…', onClick: () => app.dialog({ kind: 'moveChart', data: o.id }) },
      'separator',
      ...common,
      'separator',
      { label: 'Format Chart Area…', onClick: () => app.setPane('format') },
    ]
  return [
    ...common,
    'separator',
    ...(o.kind === 'picture' ? [{ label: 'Edit Alt Text…', onClick: () => app.dialog({ kind: 'altText', data: o.id }) } as MenuItem] : []),
    { label: o.kind === 'picture' ? 'Format Picture…' : 'Format Shape…', onClick: () => app.setPane('format') },
  ]
}

export function cellExtraItems(app: AppApi): MenuItem[] {
  const doc = app.doc
  const sheet = doc.sheet
  const { r, c } = doc.sel.active
  const items: MenuItem[] = []
  // filters
  const target = sheetTargets(sheet).find((t) => {
    const a = filterArea(t)
    return r >= a.r1 && r <= a.r2 && c >= a.c1 && c <= a.c2
  })
  const byValue = () => {
    let t = target
    if (!t) {
      const err = toggleAutoFilter(doc)
      if (err) return app.alert(err)
      t = sheetTargets(doc.sheet).find((x) => x.kind === 'auto')
      if (!t) return
    }
    const a = filterArea(t)
    const text = displayText(doc, sheet, r, c)
    setColumnFilter(doc, t, c - a.c1, { kind: 'values', values: text ? [text] : [], blanks: !text })
  }
  items.push({ heading: 'Filter' })
  items.push({ label: "Filter by Selected Cell's Value", onClick: byValue })
  items.push({
    label: "Filter by Selected Cell's Color",
    disabled: !target,
    onClick: () => target && setColumnFilter(doc, target, c - filterArea(target).c1, { kind: 'color', fill: doc.style(r, c).fill ?? '' }),
  })
  if (target && filterArea(target).filters[c - filterArea(target).c1]) items.push({ label: 'Clear Filter From Column', onClick: () => setColumnFilter(doc, target, c - filterArea(target).c1, null) })
  // tables
  const t = tableAt(sheet, r, c)
  if (t) {
    items.push({ heading: 'Table' })
    items.push({ label: 'Insert Table Rows Above', onClick: () => insertTableRows(doc, t.id, Math.max(r, t.range.r1 + (t.header ? 1 : 0)), 1) })
    items.push({
      label: 'Delete Table Rows',
      onClick: () => {
        const rg = doc.activeRange
        deleteCells(doc, 'up', { r1: Math.max(rg.r1, t.range.r1 + (t.header ? 1 : 0)), r2: rg.r2, c1: t.range.c1, c2: t.range.c2 })
        const tt = doc.sheet.x.tables.find((x) => x.id === t.id)
        if (tt) {
          doc.transact('Delete Table Rows', () => {
            doc.noteFull(doc.sheet)
            tt.range = { ...tt.range, r2: Math.max(tt.range.r1 + 1, tt.range.r2 - (rg.r2 - rg.r1 + 1)) }
          })
        }
      },
    })
    items.push({ label: 'Totals Row', checked: t.totals, onClick: () => setTotalsRow(doc, t.id, !t.totals) })
    items.push({ label: 'Convert to Range', onClick: () => convertToRange(doc, t.id) })
  }
  // notes and comments
  items.push('separator')
  const note = noteAt(sheet, r, c)
  if (note) {
    items.push({ label: 'Edit Note', onClick: () => app.dialog({ kind: 'prompt', title: 'note' }) })
    items.push({ label: 'Delete Note', onClick: () => setNote(doc, r, c, null) })
    items.push({ label: note.visible ? 'Hide Note' : 'Show/Hide Note', onClick: () => toggleNote(doc, r, c) })
  } else items.push({ label: 'New Note', shortcut: 'Shift+F2', onClick: () => app.dialog({ kind: 'prompt', title: 'note' }) })
  items.push({ label: threadAt(sheet, r, c) ? 'Reply to Comment' : 'New Comment', onClick: () => app.setPane('comments') })
  const v = validationAt(sheet, r, c)
  if (v?.type === 'list') items.push({ label: 'Pick From Drop-down List…', onClick: () => (window as unknown as { __openValidationList?: () => void }).__openValidationList?.() })
  return items
}

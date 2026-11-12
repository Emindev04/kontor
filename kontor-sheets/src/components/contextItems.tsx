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
import { t, tx } from '../i18n'

export function objectContextItems(app: AppApi, o: SheetObject, act: { arrange: (h: 'front' | 'back' | 'forward' | 'backward') => void; del: () => void; dup: () => void }): MenuItem[] {
  const common: MenuItem[] = [
    { label: t('Bring to Front'), onClick: () => act.arrange('front') },
    { label: t('Send to Back'), onClick: () => act.arrange('back') },
    { label: t('Duplicate'), shortcut: 'Ctrl+D', onClick: act.dup },
    { label: t('Delete'), shortcut: 'Delete', onClick: act.del },
  ]
  if (o.kind === 'chart')
    return [
      { label: t('Change Chart Type…'), onClick: () => app.dialog({ kind: 'changeChartType', data: o.id }) },
      { label: t('Select Data…'), onClick: () => app.dialog({ kind: 'selectData', data: o.id }) },
      { label: t('Move Chart…'), onClick: () => app.dialog({ kind: 'moveChart', data: o.id }) },
      'separator',
      ...common,
      'separator',
      { label: t('Format Chart Area…'), onClick: () => app.setPane('format') },
    ]
  return [
    ...common,
    'separator',
    ...(o.kind === 'picture' ? [{ label: t('Edit Alt Text…'), onClick: () => app.dialog({ kind: 'altText', data: o.id }) } as MenuItem] : []),
    { label: o.kind === 'picture' ? t('Format Picture…') : t('Format Shape…'), onClick: () => app.setPane('format') },
  ]
}

export function cellExtraItems(app: AppApi): MenuItem[] {
  const doc = app.doc
  const sheet = doc.sheet
  const { r, c } = doc.sel.active
  const items: MenuItem[] = []
  // filters
  const target = sheetTargets(sheet).find((table) => {
    const a = filterArea(table)
    return r >= a.r1 && r <= a.r2 && c >= a.c1 && c <= a.c2
  })
  const byValue = () => {
    let table = target
    if (!table) {
      const err = toggleAutoFilter(doc)
      if (err) return app.alert(err)
      table = sheetTargets(doc.sheet).find((x) => x.kind === 'auto')
      if (!table) return
    }
    const a = filterArea(table)
    const text = displayText(doc, sheet, r, c)
    setColumnFilter(doc, table, c - a.c1, { kind: 'values', values: text ? [text] : [], blanks: !text })
  }
  items.push({ heading: t('Filter') })
  items.push({ label: t("Filter by Selected Cell's Value"), onClick: byValue })
  items.push({
    label: t("Filter by Selected Cell's Color"),
    disabled: !target,
    onClick: () => target && setColumnFilter(doc, target, c - filterArea(target).c1, { kind: 'color', fill: doc.style(r, c).fill ?? '' }),
  })
  if (target && filterArea(target).filters[c - filterArea(target).c1]) items.push({ label: t('Clear Filter From Column'), onClick: () => setColumnFilter(doc, target, c - filterArea(target).c1, null) })
  // tables
  const table = tableAt(sheet, r, c)
  if (table) {
    items.push({ heading: t('Table') })
    items.push({ label: t('Insert Table Rows Above'), onClick: () => insertTableRows(doc, table.id, Math.max(r, table.range.r1 + (table.header ? 1 : 0)), 1) })
    items.push({
      label: t('Delete Table Rows'),
      onClick: () => {
        const rg = doc.activeRange
        deleteCells(doc, 'up', { r1: Math.max(rg.r1, table.range.r1 + (table.header ? 1 : 0)), r2: rg.r2, c1: table.range.c1, c2: table.range.c2 })
        const tt = doc.sheet.x.tables.find((x) => x.id === table.id)
        if (tt) {
          doc.transact(tx('Delete Table Rows'), () => {
            doc.noteFull(doc.sheet)
            tt.range = { ...tt.range, r2: Math.max(tt.range.r1 + 1, tt.range.r2 - (rg.r2 - rg.r1 + 1)) }
          })
        }
      },
    })
    items.push({ label: t('Totals Row'), checked: table.totals, onClick: () => setTotalsRow(doc, table.id, !table.totals) })
    items.push({ label: t('Convert to Range'), onClick: () => convertToRange(doc, table.id) })
  }
  // notes and comments
  items.push('separator')
  const note = noteAt(sheet, r, c)
  if (note) {
    items.push({ label: t('Edit Note'), onClick: () => app.dialog({ kind: 'prompt', title: 'note' }) })
    items.push({ label: t('Delete Note'), onClick: () => setNote(doc, r, c, null) })
    items.push({ label: note.visible ? t('Hide Note') : t('Show/Hide Note'), onClick: () => toggleNote(doc, r, c) })
  } else items.push({ label: t('New Note'), shortcut: 'Shift+F2', onClick: () => app.dialog({ kind: 'prompt', title: 'note' }) })
  items.push({ label: threadAt(sheet, r, c) ? t('Reply to Comment') : t('New Comment'), onClick: () => app.setPane('comments') })
  const v = validationAt(sheet, r, c)
  if (v?.type === 'list') items.push({ label: t('Pick From Drop-down List…'), onClick: () => (window as unknown as { __openValidationList?: () => void }).__openValidationList?.() })
  return items
}

// File > Info > Inspect Workbook: finds content people may not want to share (comments, notes,
// personal information, hidden sheets, rows and columns, ink, custom views) and removes it on request.
import { tx } from '../i18n'
import { keyCol, keyRow } from '../model/address'
import type { Doc } from './doc'

export type InspectKind = 'comments' | 'properties' | 'hiddenSheets' | 'hiddenRowsCols' | 'ink' | 'customViews'

export type InspectResult = { kind: InspectKind; label: string; count: number; detail: string }

const LABELS: Record<InspectKind, string> = {
  comments: tx('Comments and notes'),
  properties: tx('Document properties and personal information'),
  hiddenSheets: tx('Hidden worksheets'),
  hiddenRowsCols: tx('Hidden rows and columns'),
  ink: tx('Ink'),
  customViews: tx('Custom views'),
}

const DETAILS: Record<InspectKind, string> = {
  comments: tx('{n} comments or notes were found.'),
  properties: tx('The author and title are stored with the workbook.'),
  hiddenSheets: tx('{n} hidden worksheets were found.'),
  hiddenRowsCols: tx('{n} hidden rows or columns were found.'),
  ink: tx('{n} ink strokes were found.'),
  customViews: tx('{n} custom views were found.'),
}

/** What Inspect Workbook finds; only kinds with something to remove are returned. */
export function inspectWorkbook(doc: Doc): InspectResult[] {
  const wb = doc.wb
  const count: Record<InspectKind, number> = { comments: 0, properties: 0, hiddenSheets: 0, hiddenRowsCols: 0, ink: 0, customViews: wb.customViews.length }
  if (wb.props.author || wb.props.title) count.properties = 1
  for (const s of wb.sheets) {
    count.comments += Object.keys(s.x.notes).length + Object.keys(s.x.comments).length
    if (s.hidden) count.hiddenSheets++
    count.hiddenRowsCols += [...s.rows.hidden].filter((r) => !s.x.filtered.includes(r)).length + s.cols.hidden.size
    count.ink += s.ink.length
  }
  return (Object.keys(count) as InspectKind[]).filter((k) => count[k] > 0).map((kind) => ({ kind, label: LABELS[kind], count: count[kind], detail: DETAILS[kind] }))
}

/** Removes everything of one kind (Remove All). Hidden sheets are deleted, hidden rows and columns are shown and emptied. */
export function removeInspected(doc: Doc, kind: InspectKind) {
  const wb = doc.wb
  doc.transact(tx('Inspect Workbook'), () => {
    if (kind === 'properties') {
      doc.noteWorkbook()
      wb.props.author = ''
      wb.props.title = ''
      return
    }
    if (kind === 'customViews') {
      doc.noteWorkbook()
      wb.customViews = []
      return
    }
    if (kind === 'hiddenSheets') {
      if (wb.sheets.every((s) => s.hidden)) return
      doc.noteWorkbook()
      wb.sheets = wb.sheets.filter((s) => !s.hidden)
      doc.activeIndex = Math.min(doc.activeIndex, wb.sheets.length - 1)
      return
    }
    for (const s of wb.sheets) {
      if (kind === 'comments') {
        if (!Object.keys(s.x.notes).length && !Object.keys(s.x.comments).length) continue
        doc.noteProps(s)
        s.x.notes = {}
        s.x.comments = {}
      } else if (kind === 'ink') {
        if (!s.ink.length) continue
        doc.noteProps(s)
        s.ink = []
      } else if (kind === 'hiddenRowsCols') {
        const rows = [...s.rows.hidden].filter((r) => !s.x.filtered.includes(r))
        const cols = [...s.cols.hidden]
        if (!rows.length && !cols.length) continue
        doc.noteFull(s)
        for (const k of [...s.cells.keys()]) {
          if (rows.includes(keyRow(k)) || cols.includes(keyCol(k))) s.cells.delete(k)
        }
        rows.forEach((r) => s.rows.hidden.delete(r))
        cols.forEach((c) => s.cols.hidden.delete(c))
        s.rows.touch()
        s.cols.touch()
        s.touchUsed()
      }
    }
  })
}

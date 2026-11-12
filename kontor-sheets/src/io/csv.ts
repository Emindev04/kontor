import { fillCss } from '../model/fill'
import { cellKey, keyCol, keyRow } from '../model/address'
import { Workbook } from '../model/workbook'
import { parseDelimited } from '../commands/clipboard'
import { cellView } from '../commands/display'
import type { Doc } from '../commands/doc'
import { normalizeFormula } from '../commands/doc'
import { parseInput } from '../model/parseInput'
import { US_SYMBOLS } from '../model/numberLocale'

/**
 * Exports the active sheet as CSV using the displayed (formatted) values. Numbers are always written
 * with US separators (and read back the same way by importCsv), whatever the interface language, so a
 * file reads the same everywhere.
 */
export function exportCsv(doc: Doc, sep = ','): Blob {
  const sheet = doc.sheet
  const used = sheet.used()
  const lines: string[] = []
  for (let r = 0; r <= used.r; r++) {
    const cells: string[] = []
    for (let c = 0; c <= used.c; c++) {
      const t = cellView(doc, sheet, r, c, doc.style(r, c), undefined, undefined, US_SYMBOLS).text
      cells.push(/["\n\r]/.test(t) || t.includes(sep) ? `"${t.replace(/"/g, '""')}"` : t)
    }
    lines.push(cells.join(sep).replace(new RegExp(`${sep === '|' ? '\\|' : sep}+$`), ''))
  }
  return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
}

function detectSeparator(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n')
  const counts = [',', ';', '\t', '|'].map((s) => [s, sample.split(s).length] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 1 ? counts[0][0] : ','
}

/** Reads a CSV/TXT file into a new single-sheet workbook. */
export function importCsv(text: string, name: string, sep?: string): Workbook {
  const wb = new Workbook()
  const sheet = wb.sheets[0]
  sheet.name = name.replace(/\.[^.]+$/, '').slice(0, 31).replace(/[\\/?*[\]:]/g, '_') || 'Sheet1'
  const clean = text.replace(/^﻿/, '')
  const rows = parseDelimited(clean, sep ?? detectSeparator(clean))
  rows.forEach((row, r) =>
    row.forEach((t, c) => {
      if (t === '') return
      const p = parseInput(t)
      if (p.kind === 'formula') sheet.cells.set(cellKey(r, c), { f: normalizeFormula(p.f) })
      else if (p.v !== null) {
        const d: { v: typeof p.v; s?: number } = { v: p.v }
        if (p.fmt) d.s = wb.styles.intern({ fmt: p.fmt })
        sheet.cells.set(cellKey(r, c), d)
      }
    }),
  )
  sheet.touchUsed()
  void keyRow
  void keyCol
  return wb
}

/** Exports the active sheet as a web page: a table with the displayed values and basic formatting. */
export function exportHtml(doc: Doc): Blob {
  const sheet = doc.sheet
  const used = sheet.used()
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const covered = new Set<number>()
  for (const m of sheet.merges) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(cellKey(r, c))
  const rows: string[] = []
  for (let r = 0; r <= used.r; r++) {
    if (sheet.rows.hidden.has(r)) continue
    const cells: string[] = []
    for (let c = 0; c <= used.c; c++) {
      if (sheet.cols.hidden.has(c) || covered.has(cellKey(r, c))) continue
      const st = doc.style(r, c)
      const view = cellView(doc, sheet, r, c, st)
      const css = [st.bold && 'font-weight:bold', st.italic && 'font-style:italic', st.color && `color:${st.color}`, (fillCss(st) || st.fill) && `background:${fillCss(st) ?? st.fill}`, st.size && `font-size:${st.size}pt`, `text-align:${st.h ?? (typeof doc.value(r, c) === 'number' ? 'right' : 'left')}`].filter(Boolean).join(';')
      const m = sheet.mergeAt(r, c)
      const span = m && m.r1 === r && m.c1 === c ? `${m.r2 > m.r1 ? ` rowspan="${m.r2 - m.r1 + 1}"` : ''}${m.c2 > m.c1 ? ` colspan="${m.c2 - m.c1 + 1}"` : ''}` : ''
      const link = sheet.get(r, c)?.link
      const text = esc(view.text)
      cells.push(`<td${span} style="${css}">${link ? `<a href="${esc(link)}">${text}</a>` : text}</td>`)
    }
    rows.push(`<tr>${cells.join('')}</tr>`)
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.title)} – ${esc(sheet.name)}</title><style>body{font:11pt Calibri,Carlito,Arial,sans-serif}table{border-collapse:collapse}td{border:1px solid #d4d4d4;padding:2px 6px;white-space:nowrap}</style></head><body><table>${rows.join('')}</table></body></html>`
  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

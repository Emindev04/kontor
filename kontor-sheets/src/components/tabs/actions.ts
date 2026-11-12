// Command helpers shared by ribbon tabs, context menus and keyboard shortcuts.
import { MAX_COLS, MAX_ROWS, cellName, rangeName } from '../../model/address'
import { BUILTIN_FORMATS, adjustDecimals } from '../../model/numfmt'
import { DEFAULT_SIZE, type Style } from '../../model/style'
import type { Doc } from '../../commands/doc'
import { insertDelete, deleteCells, insertCells } from '../../commands/ops'
import { toggleRich } from '../../commands/richText'
import { tx } from '../../i18n'

export const FONTS = [
  'Aptos Narrow', 'Arial', 'Arial Black', 'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
  'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Helvetica', 'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
  'Times New Roman', 'Trebuchet MS', 'Verdana',
]

export const SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '22', '24', '26', '28', '36', '48', '72']

export function activeStyle(doc: Doc): Style {
  const a = doc.sel.active
  return doc.style(a.r, a.c)
}

export function toggleStyle(doc: Doc, key: 'bold' | 'italic' | 'strike') {
  if (toggleRich(doc, key)) return
  const on = !activeStyle(doc)[key]
  doc.applyStyle({ [key]: on || undefined }, doc.sel.ranges, key === 'bold' ? tx('Bold') : key === 'italic' ? tx('Italic') : tx('Strikethrough'))
}

export function toggleUnderline(doc: Doc, kind: 'single' | 'double' = 'single') {
  if (toggleRich(doc, 'underline', kind)) return
  const cur = activeStyle(doc).underline
  doc.applyStyle({ underline: cur === kind ? undefined : kind }, doc.sel.ranges, tx('Underline'))
}

export function stepFontSize(doc: Doc, dir: 1 | -1) {
  doc.applyStyle((s) => {
    const cur = s.size ?? DEFAULT_SIZE
    const list = SIZES.map(Number)
    const next = dir > 0 ? list.find((x) => x > cur) ?? cur + 10 : [...list].reverse().find((x) => x < cur) ?? Math.max(1, cur - 1)
    return { size: next }
  }, doc.sel.ranges, dir > 0 ? tx('Increase Font Size') : tx('Decrease Font Size'))
}

export function changeDecimals(doc: Doc, delta: number) {
  const a = doc.sel.active
  const v = doc.value(a.r, a.c)
  const fmt = adjustDecimals(activeStyle(doc).fmt, delta, v)
  doc.applyStyle({ fmt }, doc.sel.ranges, delta > 0 ? tx('Increase Decimal') : tx('Decrease Decimal'))
}

export function setFormat(doc: Doc, fmt: string) {
  doc.applyStyle({ fmt: fmt === 'General' ? undefined : fmt }, doc.sel.ranges, tx('Number Format'))
}

export function indent(doc: Doc, delta: number) {
  doc.applyStyle((s) => {
    const n = Math.max(0, Math.min(250, (s.indent ?? 0) + delta))
    return { indent: n || undefined, h: n && (!s.h || s.h === 'general' || s.h === 'center') ? 'left' : s.h }
  }, doc.sel.ranges, tx('Indent'))
}

export const NUMBER_FORMATS: { id: string; label: string; fmt: string }[] = [
  { id: 'general', label: tx('General'), fmt: 'General' },
  { id: 'number', label: tx('Number'), fmt: BUILTIN_FORMATS.number },
  { id: 'currency', label: tx('Currency'), fmt: BUILTIN_FORMATS.currency },
  { id: 'accounting', label: tx('Accounting'), fmt: BUILTIN_FORMATS.accounting },
  { id: 'shortDate', label: tx('Short Date'), fmt: BUILTIN_FORMATS.shortDate },
  { id: 'longDate', label: tx('Long Date'), fmt: BUILTIN_FORMATS.longDate },
  { id: 'time', label: tx('Time'), fmt: BUILTIN_FORMATS.time },
  { id: 'percentage', label: tx('Percentage'), fmt: BUILTIN_FORMATS.percentage },
  { id: 'fraction', label: tx('Fraction'), fmt: BUILTIN_FORMATS.fraction },
  { id: 'scientific', label: tx('Scientific'), fmt: BUILTIN_FORMATS.scientific },
  { id: 'text', label: tx('Text'), fmt: BUILTIN_FORMATS.text },
]

export const ACCOUNTING_SYMBOLS: { label: string; fmt: string }[] = [
  { label: tx('$ English (United States)'), fmt: BUILTIN_FORMATS.accounting },
  { label: tx('£ English (United Kingdom)'), fmt: '_-[$£-809]* #,##0.00_-;-[$£-809]* #,##0.00_-;_-[$£-809]* "-"??_-;_-@_-' },
  { label: tx('€ Euro (€ 123)'), fmt: '_-[$€-x-euro2] * #,##0.00_-;-[$€-x-euro2] * #,##0.00_-;_-[$€-x-euro2] * "-"??_-;_-@_-' },
  { label: tx('¥ Chinese (PRC)'), fmt: '_ [$¥-804]* #,##0.00_ ;_ [$¥-804]* -#,##0.00_ ;_ [$¥-804]* "-"??_ ;_ @_ ' },
  { label: tx('CHF French (Switzerland)'), fmt: '_ * #,##0.00_ [$CHF-100C]_ ;_ * -#,##0.00_ [$CHF-100C]_ ;_ * "-"??_ [$CHF-100C]_ ;_ @_ ' },
]

/** AutoSum: inserts SUM/AVERAGE/… for the data above or to the left. */
export function autoSum(doc: Doc, fn: string): 'edit' | 'done' {
  const sheet = doc.sheet
  const rg = doc.activeRange
  const isNum = (r: number, c: number) => typeof doc.value(r, c) === 'number'
  const single = rg.r1 === rg.r2 && rg.c1 === rg.c2
  if (single) {
    const { r, c } = doc.sel.active
    let range: string | null = null
    if (r > 0 && (isNum(r - 1, c) || (r > 1 && isNum(r - 2, c) && !sheet.hasValue(r - 1, c)))) {
      let top = r - 1
      while (top > 0 && isNum(top - 1, c)) top--
      range = `${cellName(top, c)}:${cellName(r - 1, c)}`
    } else if (c > 0 && isNum(r, c - 1)) {
      let left = c - 1
      while (left > 0 && isNum(r, left - 1)) left--
      range = `${cellName(r, left)}:${cellName(r, c - 1)}`
    }
    const text = `=${fn}(${range ?? ''})`
    doc.beginEdit('enter', text)
    if (range) doc.updateEdit({ caret: text.length - 1, point: { start: fn.length + 2, end: fn.length + 2 + range.length } })
    else doc.updateEdit({ caret: text.length - 1 })
    return 'edit'
  }
  // a block: totals below every column (or to the right of every row for a single column of rows)
  const bounded = doc.boundToUsed(rg)
  const lastRowEmpty = Array.from({ length: bounded.c2 - bounded.c1 + 1 }, (_, i) => !sheet.hasValue(bounded.r2, bounded.c1 + i)).every(Boolean)
  doc.transact(tx('AutoSum'), () => {
    if (lastRowEmpty && bounded.r2 > bounded.r1) {
      for (let c = bounded.c1; c <= bounded.c2; c++) doc.write(sheet, bounded.r2, c, { f: `${fn}(${cellName(bounded.r1, c)}:${cellName(bounded.r2 - 1, c)})`, s: sheet.get(bounded.r2, c)?.s })
    } else {
      const r = Math.min(MAX_ROWS - 1, bounded.r2 + 1)
      for (let c = bounded.c1; c <= bounded.c2; c++) doc.write(sheet, r, c, { f: `${fn}(${cellName(bounded.r1, c)}:${cellName(bounded.r2, c)})`, s: sheet.get(r, c)?.s })
    }
  })
  void MAX_COLS
  void rangeName
  return 'done'
}

export function insertSmart(doc: Doc, dialog: () => void) {
  const rg = doc.activeRange
  if (rg.c1 === 0 && rg.c2 === MAX_COLS - 1) insertDelete(doc, 'row', rg.r1, rg.r2 - rg.r1 + 1)
  else if (rg.r1 === 0 && rg.r2 === MAX_ROWS - 1) insertDelete(doc, 'col', rg.c1, rg.c2 - rg.c1 + 1)
  else dialog()
}

export function deleteSmart(doc: Doc, dialog: () => void) {
  const rg = doc.activeRange
  if (rg.c1 === 0 && rg.c2 === MAX_COLS - 1) insertDelete(doc, 'row', rg.r1, -(rg.r2 - rg.r1 + 1))
  else if (rg.r1 === 0 && rg.r2 === MAX_ROWS - 1) insertDelete(doc, 'col', rg.c1, -(rg.c2 - rg.c1 + 1))
  else dialog()
}

export { insertCells, deleteCells }

import type { Sheet } from '../model/sheet'
import { formatValue, generalNumber, isDateFormat } from '../model/numfmt'
import type { Style } from '../model/style'
import { CellError, type Scalar } from '../model/types'
import type { Doc } from './doc'

export type CellView = {
  text: string
  color?: string
  align: 'left' | 'right' | 'center'
  fill?: { left: string; right: string; char: string }
  numeric: boolean
}

/**
 * Text and alignment of a cell as displayed. With `width`, General numbers shrink their decimals
 * to fit and other numbers turn into "####" when too wide, like the original.
 */
export function cellView(doc: Doc, sheet: Sheet, r: number, c: number, style: Style, width?: number, value?: Scalar): CellView {
  const d = sheet.get(r, c)
  if (sheet.showFormulas && d?.f !== undefined) return { text: '=' + d.f, align: style.h === 'center' ? 'center' : style.h === 'right' ? 'right' : 'left', numeric: false }
  const v = value !== undefined ? value : doc.engine.display(sheet, r, c)
  if (v === null || v === undefined) return { text: '', align: 'left', numeric: false }
  const h = style.h ?? 'general'
  const natural: CellView['align'] = typeof v === 'number' ? 'right' : typeof v === 'string' ? 'left' : 'center'
  const align: CellView['align'] = h === 'left' || h === 'fill' || h === 'justify' || h === 'distributed' ? 'left' : h === 'center' || h === 'centerContinuous' ? 'center' : h === 'right' ? 'right' : natural
  if (typeof v === 'number' && v === 0 && !sheet.showZeros) return { text: '', align, numeric: true }
  if (v instanceof CellError) return { text: v.code, align: h === 'general' ? 'center' : align, numeric: false }
  if (typeof v === 'number' && (!style.fmt || style.fmt === 'General')) {
    if (width === undefined) return { text: generalNumber(v), align, numeric: true }
    const room = width - 6
    for (let chars = 11; chars >= 1; chars--) {
      const t = generalNumber(v, chars)
      if (doc.measure(t, style) <= room) return { text: t, align, numeric: true }
    }
    return { text: hashes(doc, style, room), align, numeric: true }
  }
  const f = formatValue(v, style.fmt)
  if (typeof v === 'number' && width !== undefined && !style.wrap && !style.shrink) {
    const room = width - 6
    if (doc.measure(f.text, style) > room) return { text: hashes(doc, style, room), align, numeric: true, color: f.color }
    if (isDateFormat(style.fmt) && f.text.startsWith('#')) return { text: hashes(doc, style, room), align, numeric: true }
  }
  return { text: f.text, color: f.color, align, fill: f.fill, numeric: typeof v === 'number' }
}

function hashes(doc: Doc, style: Style, room: number) {
  const w = doc.measure('#', style) || 7
  return '#'.repeat(Math.max(1, Math.floor(room / w)))
}

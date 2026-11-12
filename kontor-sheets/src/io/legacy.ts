// Legacy binary workbooks: .xls (BIFF8, the 97–2003 format) and .xlsb (binary 2007+ workbook).
// The SheetJS community edition reads them; we let it rewrite the workbook as .xlsx and load that
// with the regular .xlsx reader, so values, formulas, number formats, merged cells, column widths,
// row heights, hidden sheets and defined names arrive the same way. Cell fill colors are copied over
// afterwards. Saving works the other way round: our .xlsx is converted with SheetJS.
import type { Engine } from '../engine/engine'
import { cellKey } from '../model/address'
import type { Workbook } from '../model/workbook'

const load = () => import('xlsx')

type SheetJSCell = { s?: { patternType?: string; fgColor?: { rgb?: string } } }

export async function importLegacy(data: ArrayBuffer): Promise<Workbook> {
  const X = await load()
  const book = X.read(new Uint8Array(data), { type: 'array', cellFormula: true, cellNF: true, cellStyles: true, cellDates: false })
  const xlsx = X.write(book, { type: 'array', bookType: 'xlsx', cellStyles: true }) as ArrayBuffer
  const { importXlsx } = await import('./xlsx')
  const wb = await importXlsx(xlsx)
  // Fill colors: SheetJS reads solid fills of .xls cells.
  book.SheetNames.forEach((name, i) => {
    const sheet = wb.sheets[i]
    const ws = book.Sheets[name] as Record<string, SheetJSCell> | undefined
    if (!sheet || !ws) return
    for (const [addr, cell] of Object.entries(ws)) {
      if (addr.startsWith('!')) continue
      const rgb = cell?.s?.patternType === 'solid' ? cell.s.fgColor?.rgb : undefined
      if (!rgb || !/^[0-9A-Fa-f]{6}$/.test(rgb.slice(-6))) continue
      const pos = X.utils.decode_cell(addr)
      const key = cellKey(pos.r, pos.c)
      const old = sheet.cells.get(key)
      const style = wb.styles.get(old?.s)
      if (style.fill) continue
      const s = wb.styles.intern({ ...style, fill: '#' + rgb.slice(-6).toUpperCase() })
      sheet.cells.set(key, { ...(old ?? {}), s })
    }
  })
  return wb
}

/** Converts the workbook to a legacy binary format through our .xlsx writer. */
export async function exportLegacy(wb: Workbook, engine: Engine, bookType: 'xls' | 'xlsb'): Promise<Blob> {
  const { exportXlsx } = await import('./xlsx')
  const xlsx = await (await exportXlsx(wb, engine)).arrayBuffer()
  const X = await load()
  const book = X.read(new Uint8Array(xlsx), { type: 'array', cellFormula: true, cellNF: true, cellStyles: true })
  const out = X.write(book, { type: 'array', bookType: bookType === 'xls' ? 'biff8' : 'xlsb', cellStyles: true }) as ArrayBuffer
  const mime = bookType === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
  return new Blob([out], { type: mime })
}

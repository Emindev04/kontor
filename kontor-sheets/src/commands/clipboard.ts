// Copy, cut and paste (including Paste Special) inside the app and with other programs.
import { rangeName } from '../model/address'
import { MAX_COLS, MAX_ROWS, cellKey, colName, quoteSheet, type Range } from '../model/address'
import type { CellData } from '../model/sheet'
import { FONT_STACK, type Style, type StylePatch } from '../model/style'
import { CellError, type Scalar } from '../model/types'
import { moveRefs, shiftFormula } from '../engine/refs'
import type { ClipData, Doc } from './doc'
import { cellView } from './display'
import { blocked } from './review'

export type PasteWhat = 'all' | 'formulas' | 'values' | 'formats' | 'allNoBorders' | 'colWidths' | 'formulasAndFormats' | 'valuesAndFormats' | 'link' | 'keepWidths'
export type PasteOp = 'none' | 'add' | 'subtract' | 'multiply' | 'divide'
export type PasteOptions = { what: PasteWhat; op: PasteOp; skipBlanks: boolean; transpose: boolean }

export const DEFAULT_PASTE: PasteOptions = { what: 'all', op: 'none', skipBlanks: false, transpose: false }

type ClipFull = ClipData & { values: Scalar[][] }

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function styleCss(st: Style): string {
  const css: string[] = []
  if (st.font) css.push(`font-family:${FONT_STACK(st.font).replace(/"/g, "'")}`)
  if (st.size) css.push(`font-size:${st.size}pt`)
  if (st.bold) css.push('font-weight:bold')
  if (st.italic) css.push('font-style:italic')
  if (st.underline || st.strike) css.push(`text-decoration:${st.underline ? 'underline' : ''} ${st.strike ? 'line-through' : ''}`)
  if (st.color) css.push(`color:${st.color}`)
  if (st.fill) css.push(`background:${st.fill}`)
  if (st.h && st.h !== 'general') css.push(`text-align:${st.h === 'centerContinuous' ? 'center' : st.h}`)
  const b = (side: string, x?: Style['bt']) => x && css.push(`border-${side}:${x.style === 'thick' ? 3 : x.style === 'medium' ? 2 : 1}px ${x.style === 'double' ? 'double' : x.style.includes('ash') ? 'dashed' : x.style === 'dotted' || x.style === 'hair' ? 'dotted' : 'solid'} ${x.color}`)
  b('top', st.bt)
  b('bottom', st.bb)
  b('left', st.bl)
  b('right', st.br)
  return css.join(';')
}

/** Copies the active range. Returns the plain-text and HTML representations for the system clipboard. */
export function copy(doc: Doc, cut: boolean): { text: string; html: string } | string {
  if (doc.sel.ranges.length > 1) return "This action won't work on multiple selections."
  const sheet = doc.sheet
  const rg = doc.boundToUsed(doc.activeRange)
  const cells: (CellData | undefined)[][] = []
  const values: Scalar[][] = []
  const lines: string[] = []
  const htmlRows: string[] = []
  for (let r = rg.r1; r <= rg.r2; r++) {
    const row: (CellData | undefined)[] = []
    const vrow: Scalar[] = []
    const texts: string[] = []
    const tds: string[] = []
    for (let c = rg.c1; c <= rg.c2; c++) {
      row.push(sheet.get(r, c))
      const v = doc.value(r, c)
      vrow.push(v)
      const st = doc.style(r, c)
      const t = cellView(doc, sheet, r, c, st).text
      texts.push(/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)
      const m = sheet.mergeAt(r, c)
      if (m && (m.r1 !== r || m.c1 !== c)) continue
      const span = m ? ` rowspan="${m.r2 - m.r1 + 1}" colspan="${m.c2 - m.c1 + 1}"` : ''
      tds.push(`<td${span} style="${styleCss(st)}">${escapeHtml(t).replace(/\n/g, '<br>')}</td>`)
    }
    cells.push(row)
    values.push(vrow)
    lines.push(texts.join('\t'))
    htmlRows.push(`<tr style="height:${sheet.rows.size(r)}px">${tds.join('')}</tr>`)
  }
  const colWidths: number[] = []
  for (let c = rg.c1; c <= rg.c2; c++) colWidths.push(sheet.cols.size(c))
  const text = lines.join('\n') + '\n'
  const clip: ClipFull = { sheetId: sheet.id, range: rg, cut, cells, colWidths, text, values }
  doc.clip = clip
  doc.emit()
  const cols = colWidths.map((w) => `<col width="${w}">`).join('')
  const html = `<html><body><table style="border-collapse:collapse">${cols}${htmlRows.join('')}</table></body></html>`
  // Clipboard task pane: keep the last 24 copies
  const label = `${sheet.name}!${rangeName(rg)}`
  doc.clipHistory = [{ label, text, html }, ...doc.clipHistory.filter((h) => h.text !== text)].slice(0, 24)
  return { text, html }
}

function combine(op: PasteOp, dest: Scalar, src: Scalar): Scalar {
  if (op === 'none') return src
  const a = typeof dest === 'number' ? dest : dest === null ? 0 : NaN
  const b = typeof src === 'number' ? src : src === null ? 0 : NaN
  if (Number.isNaN(a) || Number.isNaN(b)) return typeof src === 'number' ? dest : src
  switch (op) {
    case 'add': return a + b
    case 'subtract': return a - b
    case 'multiply': return a * b
    case 'divide': return b === 0 ? new CellError('#DIV/0!') : a / b
  }
}

const noBorders: StylePatch = { bt: undefined, bb: undefined, bl: undefined, br: undefined, bdd: undefined, bdu: undefined }

/** Pastes the internal clipboard at the active selection. */
export function pasteInternal(doc: Doc, opts: PasteOptions = DEFAULT_PASTE): string | null {
  if (blocked(doc, 'cells')) return null
  const clip = doc.clip as ClipFull | null
  if (!clip) return null
  const srcSheet = doc.wb.sheetById(clip.sheetId)
  if (!srcSheet) return null
  const sheet = doc.sheet
  const target = doc.activeRange
  let h = clip.cells.length
  let w = clip.cells[0]?.length ?? 0
  if (opts.transpose) [h, w] = [w, h]
  const th = target.r2 - target.r1 + 1
  const tw = target.c2 - target.c1 + 1
  const tileR = th % h === 0 && th > h ? th / h : 1
  const tileC = tw % w === 0 && tw > w ? tw / w : 1
  const r0 = target.r1
  const c0 = target.c1
  if (r0 + h * tileR > MAX_ROWS || c0 + w * tileC > MAX_COLS) return "The content can't be pasted because it doesn't fit."
  const styles = doc.wb.styles
  const cut = clip.cut && opts.what === 'all'
  doc.transact(cut ? 'Cut and Paste' : 'Paste', () => {
    if (cut) for (const s of doc.wb.sheets) doc.noteFull(s)
    if (opts.what === 'colWidths' || opts.what === 'keepWidths') {
      doc.noteProps(sheet)
      for (let j = 0; j < w * tileC; j++) sheet.cols.manual.set(c0 + j, clip.colWidths[(opts.transpose ? 0 : j % w)] ?? sheet.cols.def)
      sheet.cols.touch()
      if (opts.what === 'colWidths') return
    }
    const writes: [number, number, CellData | undefined][] = []
    for (let ti = 0; ti < tileR; ti++)
      for (let tj = 0; tj < tileC; tj++)
        for (let i = 0; i < h; i++)
          for (let j = 0; j < w; j++) {
            const si = opts.transpose ? j : i
            const sj = opts.transpose ? i : j
            const src = clip.cells[si]?.[sj]
            const srcVal = clip.values[si]?.[sj] ?? null
            const r = r0 + ti * h + i
            const c = c0 + tj * w + j
            if (opts.skipBlanks && (!src || (src.v === undefined && src.f === undefined))) continue
            const dest = sheet.get(r, c)
            const dr = r - (clip.range.r1 + si)
            const dc = c - (clip.range.c1 + sj)
            let next: CellData | undefined
            const content = (): Pick<CellData, 'v' | 'f' | 'link'> => {
              if (!src) return {}
              if (src.f !== undefined) return { f: cut ? src.f : opts.transpose ? shiftFormula(src.f, dr, dc) : shiftFormula(src.f, dr, dc) }
              return { v: src.v, link: src.link }
            }
            switch (opts.what) {
              case 'all':
              case 'keepWidths':
                next = { ...content(), s: src?.s }
                break
              case 'allNoBorders':
                next = { ...content(), s: styles.patch(src?.s, noBorders) || undefined }
                break
              case 'formulas':
                next = { ...content(), s: dest?.s }
                break
              case 'formulasAndFormats':
                next = { ...content(), s: styles.patch(dest?.s, { fmt: styles.get(src?.s).fmt }) || undefined }
                break
              case 'values':
                next = { v: srcVal === null ? undefined : srcVal, s: dest?.s }
                break
              case 'valuesAndFormats':
                next = { v: srcVal === null ? undefined : srcVal, s: styles.patch(dest?.s, { fmt: styles.get(src?.s).fmt }) || undefined }
                break
              case 'formats':
                next = { v: dest?.v, f: dest?.f, link: dest?.link, s: src?.s }
                break
              case 'link': {
                const ref = `${clip.sheetId === sheet.id ? '' : quoteSheet(srcSheet.name) + '!'}$${colName(clip.range.c1 + sj)}$${clip.range.r1 + si + 1}`
                next = { f: ref, s: dest?.s }
                break
              }
              default:
                next = { ...content(), s: src?.s }
            }
            if (opts.op !== 'none' && (opts.what === 'all' || opts.what === 'values' || opts.what === 'valuesAndFormats')) {
              const destVal = doc.value(r, c)
              if (next?.f === undefined) next = { ...next, v: combine(opts.op, destVal, srcVal) as Scalar }
            }
            writes.push([r, c, next])
          }
    if (cut) {
      // clear the source (cells that are not overwritten), then move references
      for (let i = 0; i < clip.cells.length; i++)
        for (let j = 0; j < (clip.cells[0]?.length ?? 0); j++) srcSheet.setRaw(cellKey(clip.range.r1 + i, clip.range.c1 + j), undefined)
    }
    for (const [r, c, d] of writes) {
      if (d && d.v === undefined && d.f === undefined && !d.s && !d.link) doc.write(sheet, r, c, undefined)
      else doc.write(sheet, r, c, d)
    }
    if (cut) {
      const dr = r0 - clip.range.r1
      const dc = c0 - clip.range.c1
      for (const s of doc.wb.sheets)
        for (const [k, d] of s.cells) {
          if (d.f === undefined) continue
          const nf = moveRefs(d.f, s.name, srcSheet.name, clip.range, sheet.name, dr, dc)
          if (nf !== d.f) s.cells.set(k, { ...d, f: nf })
        }
      // merges move along
      const moved = srcSheet.merges.filter((m) => m.r1 >= clip.range.r1 && m.r2 <= clip.range.r2 && m.c1 >= clip.range.c1 && m.c2 <= clip.range.c2)
      srcSheet.merges = srcSheet.merges.filter((m) => !moved.includes(m))
      for (const m of moved) sheet.merges.push({ r1: m.r1 + dr, r2: m.r2 + dr, c1: m.c1 + dc, c2: m.c2 + dc })
    } else if (opts.what === 'all' && srcSheet === sheet && !opts.transpose) {
      const rgSrc = clip.range
      const add: Range[] = []
      for (const m of srcSheet.merges)
        if (m.r1 >= rgSrc.r1 && m.r2 <= rgSrc.r2 && m.c1 >= rgSrc.c1 && m.c2 <= rgSrc.c2) add.push({ r1: m.r1 - rgSrc.r1 + r0, r2: m.r2 - rgSrc.r1 + r0, c1: m.c1 - rgSrc.c1 + c0, c2: m.c2 - rgSrc.c1 + c0 })
      if (add.length) {
        doc.noteProps(sheet)
        sheet.merges = sheet.merges.filter((m) => !add.some((a) => a.r1 <= m.r2 && a.r2 >= m.r1 && a.c1 <= m.c2 && a.c2 >= m.c1)).concat(add)
      }
    }
  })
  if (cut) doc.clip = null
  doc.selectRange({ r1: r0, c1: c0, r2: r0 + h * tileR - 1, c2: c0 + w * tileC - 1 })
  return null
}

/** Parses clipboard HTML tables (from browsers, other spreadsheets) into rows of text with simple formatting. */
function parseHtmlTable(html: string): { text: string; style: StylePatch }[][] | null {
  if (!/<table/i.test(html)) return null
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const table = dom.querySelector('table')
  if (!table) return null
  const rows: { text: string; style: StylePatch }[][] = []
  const occupied = new Set<string>()
  table.querySelectorAll('tr').forEach((tr, ri) => {
    const row: { text: string; style: StylePatch }[] = []
    let ci = 0
    tr.querySelectorAll('td,th').forEach((td) => {
      while (occupied.has(`${ri}:${ci}`)) {
        row[ci] = { text: '', style: {} }
        ci++
      }
      const el = td as HTMLElement
      const style: StylePatch = {}
      const css = el.style
      if (td.tagName === 'TH' || css.fontWeight === 'bold' || Number(css.fontWeight) >= 600 || el.querySelector('b,strong')) style.bold = true
      if (css.fontStyle === 'italic' || el.querySelector('i,em')) style.italic = true
      if (css.color) style.color = toHex(css.color)
      const bg = css.backgroundColor || css.background
      if (bg && toHex(bg)) style.fill = toHex(bg)
      if (css.textAlign === 'center' || css.textAlign === 'right' || css.textAlign === 'left') style.h = css.textAlign
      const text = (el.innerText ?? el.textContent ?? '').replace(/ /g, ' ').replace(/\n+$/, '')
      row[ci] = { text: (el.textContent ?? '').includes('\n') && !el.querySelector('br') ? text.replace(/\s*\n\s*/g, ' ').trim() : text.trim(), style }
      const rs = Number(td.getAttribute('rowspan') ?? 1)
      const cs = Number(td.getAttribute('colspan') ?? 1)
      for (let a = 0; a < rs; a++) for (let b = 0; b < cs; b++) if (a || b) occupied.add(`${ri + a}:${ci + b}`)
      ci += 1
      for (let b = 1; b < cs; b++) row[ci++] = { text: '', style: {} }
    })
    rows.push(row)
  })
  return rows
}

function toHex(color: string): string | undefined {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(color)
  if (m) {
    if (m[4] !== undefined && Number(m[4]) === 0) return undefined
    return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase()
  return undefined
}

export function parseDelimited(text: string, sep = '\t'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** Pastes text/HTML that came from another program. */
export function pasteExternal(doc: Doc, text: string, html: string, valuesOnly = false) {
  if (blocked(doc, 'cells')) return
  const sheet = doc.sheet
  const table = html && !valuesOnly ? parseHtmlTable(html) : null
  const grid = table ?? parseDelimited(text.replace(/\n$/, '')).map((r) => r.map((t) => ({ text: t, style: {} as StylePatch })))
  if (!grid.length) return
  const r0 = doc.activeRange.r1
  const c0 = doc.activeRange.c1
  const h = grid.length
  const w = Math.max(...grid.map((r) => r.length))
  doc.transact('Paste', () => {
    for (let i = 0; i < h; i++)
      for (let j = 0; j < w; j++) {
        const cell = grid[i][j] ?? { text: '', style: {} }
        const r = r0 + i
        const c = c0 + j
        if (r >= MAX_ROWS || c >= MAX_COLS) continue
        const old = sheet.get(r, c)
        let s = old?.s ?? sheet.styleId(r, c)
        let data: CellData = {}
        if (cell.text !== '') {
          try {
            const p = doc.prepareInput(cell.text)
            data = { ...p.data }
            if (p.fmt) s = doc.wb.styles.patch(s, { fmt: p.fmt })
          } catch {
            data = { v: cell.text }
          }
        }
        if (Object.keys(cell.style).length) s = doc.wb.styles.patch(s, cell.style)
        if (s) data.s = s
        if (data.v === null) delete data.v
        doc.write(sheet, r, c, data.v === undefined && data.f === undefined && !data.s ? undefined : data)
      }
  })
  doc.selectRange({ r1: r0, c1: c0, r2: Math.min(MAX_ROWS - 1, r0 + h - 1), c2: Math.min(MAX_COLS - 1, c0 + w - 1) })
}

/** True when the system clipboard text is what we last copied (so the rich internal copy can be used). */
export function isOwnClipboard(doc: Doc, text: string) {
  return !!doc.clip && text.replace(/\r\n/g, '\n') === doc.clip.text
}

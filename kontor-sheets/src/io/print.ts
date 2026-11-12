// Printing / PDF export: renders sheets as HTML tables in a hidden frame and opens the print dialog.
import { colName, parseRange, type Range } from '../model/address'
import type { Sheet } from '../model/sheet'
import { FONT_STACK, type Border, type Style } from '../model/style'
import type { Doc } from '../commands/doc'
import { cellView } from '../commands/display'
import { makeDecorator } from '../grid/decorate'
import { chartData } from '../charts/chartData'
import { renderChartSVG } from '../charts/renderChart'
import { shapeSVG } from '../charts/shapes'
import type { SlicerObj } from '../model/extras'
import { slicerItems } from '../commands/slicers'
import { computePageBreaks } from '../grid/pages'

/** "$A:$B" → [0, 1] (columns to repeat at left). */
function parseColumns(text: string): [number, number] | null {
  const m = /^\$?([A-Z]{1,3})(?::\$?([A-Z]{1,3}))?$/i.exec(text.trim())
  if (!m) return null
  const idx = (s: string) => [...s.toUpperCase()].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const a = idx(m[1])
  const b = idx(m[2] ?? m[1])
  return [Math.min(a, b), Math.max(a, b)]
}

/** Splits a header/footer string ("&LLeft&CCenter&RRight") into its three sections. */
function hfSections(s: string | undefined): [string, string, string] {
  const out: [string, string, string] = ['', '', '']
  if (!s) return out
  if (!/&[LCR]/.test(s)) return ['', s, '']
  let cur = 1
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '&' && /[LCR]/.test(s[i + 1] ?? '')) {
      cur = s[i + 1] === 'L' ? 0 : s[i + 1] === 'C' ? 1 : 2
      i++
      continue
    }
    out[cur] += s[i]
  }
  return out
}

/** CSS "content" value for a header/footer section: page counters, date, time, file and sheet names. */
function hfContent(text: string, title: string, sheetName: string): string {
  if (!text) return '""'
  const parts: string[] = []
  let lit = ''
  const flush = () => {
    if (lit) parts.push(JSON.stringify(lit))
    lit = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '&' && i + 1 < text.length) {
      const code = text[i + 1].toUpperCase()
      i++
      if (code === 'P') {
        flush()
        parts.push('counter(page)')
      } else if (code === 'N') {
        flush()
        parts.push('counter(pages)')
      } else if (code === 'D') lit += new Date().toLocaleDateString('en-US')
      else if (code === 'T') lit += new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      else if (code === 'F') lit += title
      else if (code === 'A') lit += sheetName
      else if (code === '&') lit += '&'
      continue
    }
    lit += ch
  }
  flush()
  return parts.join(' ') || '""'
}

function pageRules(doc: Doc, sheet: Sheet, index: number): string {
  const h = hfSections(sheet.page.header)
  const f = hfSections(sheet.page.footer)
  const box = (name: string, text: string) => (text ? `@${name} { content: ${hfContent(text, doc.title, sheet.name)}; font: 9pt Arial, sans-serif; color: #444; }` : '')
  return `@page s${index} { ${box('top-left', h[0])} ${box('top-center', h[1])} ${box('top-right', h[2])} ${box('bottom-left', f[0])} ${box('bottom-center', f[1])} ${box('bottom-right', f[2])} }`
}

const PAPER: Record<Sheet['page']['paper'], [number, number]> = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17], a4: [8.27, 11.69], a3: [11.69, 16.54] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function border(b?: Border) {
  if (!b) return ''
  const w = b.style === 'thick' ? 3 : b.style.startsWith('medium') ? 2 : 1
  const kind = b.style === 'double' ? 'double' : b.style.includes('ash') ? 'dashed' : b.style === 'dotted' || b.style === 'hair' ? 'dotted' : 'solid'
  return `${b.style === 'double' ? 3 : w}px ${kind} ${b.color}`
}

function css(st: Style, grid: boolean): string {
  const out: string[] = [`font-family:${FONT_STACK(st.font ?? 'Calibri').replace(/"/g, "'")}`, `font-size:${st.size ?? 11}pt`]
  if (st.bold) out.push('font-weight:bold')
  if (st.italic) out.push('font-style:italic')
  if (st.underline || st.strike) out.push(`text-decoration:${st.underline ? 'underline' : ''} ${st.strike ? 'line-through' : ''}`)
  if (st.color) out.push(`color:${st.color}`)
  if (st.fill) out.push(`background:${st.fill}`)
  out.push(`vertical-align:${st.v === 'top' ? 'top' : st.v === 'middle' ? 'middle' : 'bottom'}`)
  out.push(st.wrap ? 'white-space:pre-wrap' : 'white-space:pre')
  const g = grid ? '1px solid #c8c8c8' : ''
  out.push(`border-top:${border(st.bt) || g || 'none'}`, `border-bottom:${border(st.bb) || g || 'none'}`, `border-left:${border(st.bl) || g || 'none'}`, `border-right:${border(st.br) || g || 'none'}`)
  if (st.indent) out.push(`padding-left:${3 + st.indent * 9}px`)
  return out.join(';')
}

function printRange(sheet: Sheet, selection?: Range): Range | null {
  if (selection) return selection
  if (sheet.page.printArea) {
    const r = parseRange(sheet.page.printArea.split('!').pop() ?? '')
    if (r) return r
  }
  const u = sheet.used()
  if (u.r < 0) return null
  return { r1: 0, c1: 0, r2: u.r, c2: u.c }
}

export function sheetHtml(doc: Doc, sheet: Sheet, selection?: Range, index = 0): string {
  const rg = printRange(sheet, selection) ?? (sheet.x.objects.length ? { r1: 0, c1: 0, r2: 0, c2: 0 } : null)
  if (!rg) return ''
  const deco = makeDecorator(doc, sheet)
  const p = sheet.page
  const grid = p.printGridlines
  const head = p.printHeadings
  const titleRows = p.printTitleRows ? parseRange(p.printTitleRows.split('!').pop() ?? '') : null
  const titleCols = p.printTitleCols ? parseColumns(p.printTitleCols.split('!').pop() ?? '') : null
  // column chunks: one per horizontal page when columns repeat at left or manual column breaks exist
  const visibleCols: number[] = []
  for (let c = rg.c1; c <= rg.c2; c++) if (sheet.cols.size(c) > 0) visibleCols.push(c)
  let chunks: number[][] = [visibleCols]
  if ((titleCols || sheet.x.colBreaks.length) && !p.fitToPage) {
    const breaks = computePageBreaks(sheet, rg.r2, rg.c2).cols.filter((b) => b > rg.c1 && b <= rg.c2)
    chunks = []
    let start = rg.c1
    for (const b of [...breaks, rg.c2 + 1]) {
      const part = visibleCols.filter((c) => c >= start && c < b)
      if (part.length) chunks.push(part)
      start = b
    }
  }
  const rowHtml = (r: number, list: number[]) => {
    const tds: string[] = []
    if (head) tds.push(`<th class="hd">${r + 1}</th>`)
    for (const c of list) {
      const m = sheet.mergeAt(r, c)
      if (m && m.r1 !== r) continue
      if (m && m.c1 !== c && list.includes(m.c1)) continue
      const st = deco.style(r, c)
      const span = m ? list.filter((x) => x >= m.c1 && x <= m.c2) : [c]
      const w = span.reduce((a, x) => a + sheet.cols.size(x), 0)
      const v = cellView(doc, sheet, m ? m.r1 : r, m ? m.c1 : c, st, w)
      const spanAttr = m ? ` colspan="${span.length}" rowspan="${m.r2 - m.r1 + 1}"` : ''
      const color = v.color ? `;color:${v.color}` : ''
      const text = v.fill ? `<span style="float:left">${esc(v.fill.left)}</span>${esc(v.fill.right)}` : esc(v.text)
      const cf = deco.cf(r, c)
      const bar = cf?.bar ? `;background-image:linear-gradient(90deg, transparent ${(cf.bar.start * 100).toFixed(1)}%, ${cf.bar.color} ${(cf.bar.start * 100).toFixed(1)}%, ${cf.bar.color} ${(cf.bar.end * 100).toFixed(1)}%, transparent ${(cf.bar.end * 100).toFixed(1)}%);background-size:100% 70%;background-repeat:no-repeat;background-position:center` : ''
      tds.push(`<td${spanAttr} style="${css(st, grid)};text-align:${v.align}${color}${bar}">${text}</td>`)
    }
    const brk = sheet.x.rowBreaks.includes(r) ? ';break-before:page' : ''
    return `<tr style="height:${sheet.rows.size(r)}px${brk}">${tds.join('')}</tr>`
  }
  const tables = chunks.map((chunk, ci) => {
    const repeat = titleCols ? visibleCols.filter((c) => c >= titleCols[0] && c <= titleCols[1] && c < chunk[0]) : []
    const list = [...repeat, ...chunk]
    const cols: string[] = []
    if (head) cols.push('<col style="width:32px">')
    for (const c of list) cols.push(`<col style="width:${sheet.cols.size(c)}px">`)
    const rows: string[] = []
    for (let r = rg.r1; r <= rg.r2; r++) if (sheet.rows.size(r) > 0) rows.push(rowHtml(r, list))
    const thead: string[] = []
    if (head) {
      const ths = ['<th class="hd"></th>']
      for (const c of list) ths.push(`<th class="hd">${colName(c)}</th>`)
      thead.push(`<tr>${ths.join('')}</tr>`)
    }
    if (titleRows) for (let r = titleRows.r1; r <= titleRows.r2; r++) if (r < rg.r1) thead.push(rowHtml(r, list))
    return `<table${ci > 0 ? ' style="break-before:page"' : ''}>${cols.join('')}<thead>${thead.join('')}</thead><tbody>${rows.join('')}</tbody></table>`
  })
  const scale = p.fitToPage ? 'zoom:var(--fit)' : `zoom:${p.scale / 100}`
  // charts, pictures and shapes positioned like on screen
  const ox = sheet.cols.offset(rg.c1) - (head ? 32 : 0)
  const oy = sheet.rows.offset(rg.r1) - (head ? 20 : 0)
  const objects = sheet.x.objects
    .map((o) => {
      const a = o.anchor
      const box = `position:absolute;left:${Math.min(a.x, a.x + a.w) - ox}px;top:${Math.min(a.y, a.y + a.h) - oy}px;width:${Math.abs(a.w)}px;height:${Math.abs(a.h)}px${'rotation' in o && o.rotation ? `;transform:rotate(${o.rotation}deg)` : ''}`
      if (o.kind === 'chart') return `<div style="${box}">${renderChartSVG(o, chartData(doc.wb, doc.engine, o), Math.abs(a.w), Math.abs(a.h))}</div>`
      if (o.kind === 'picture') return `<img style="${box}" src="${doc.wb.images.get(o.image) ?? ''}" alt="${esc(o.alt ?? '')}">`
      if (o.kind === 'slicer') return slicerHtml(doc, o, box)
      const text = o.text ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:${o.vAlign === 'top' ? 'flex-start' : o.vAlign === 'bottom' ? 'flex-end' : 'center'};padding:4px 8px;text-align:${o.align};color:${o.textColor};font:${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.fontSize}pt Calibri,Carlito,Arial,sans-serif;white-space:pre-wrap">${esc(o.text)}</div>` : ''
      return `<div style="${box}">${shapeSVG(o, Math.max(1, Math.abs(a.w)), Math.max(1, Math.abs(a.h)))}${text}</div>`
    })
    .join('')
  return `<section class="sheet" style="${scale};page:s${index}">${objects}${tables.join('')}</section>`
}

export type PrintWhat = 'active' | 'workbook' | 'selection'

export function printHtml(doc: Doc, what: PrintWhat = 'active', preview = false): string {
  const sheets = what === 'workbook' ? doc.wb.sheets.filter((s) => !s.hidden) : [doc.sheet]
  const body = sheets.map((s, i) => sheetHtml(doc, s, what === 'selection' ? doc.boundToUsed(doc.activeRange) : undefined, i)).filter(Boolean).join('')
  const named = sheets.map((s, i) => pageRules(doc, s, i)).join('\n')
  const p = doc.sheet.page
  const [pw, ph] = PAPER[p.paper]
  const [w, h] = p.orientation === 'landscape' ? [ph, pw] : [pw, ph]
  const m = p.margins
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
@page { size: ${w}in ${h}in; margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in; }
${named}
body { margin: 0; font-family: Calibri, Carlito, Arial, sans-serif; }
.sheet { position: relative; break-after: page; ${p.centerH ? 'display:flex;flex-direction:column;align-items:center;' : ''} }
.sheet:last-child { break-after: auto; }
table { border-collapse: collapse; table-layout: fixed; }
td { padding: 0 3px; overflow: hidden; line-height: 1.2; }
th.hd { background: #f0f0f0; border: 1px solid #c8c8c8; font: 9pt Arial, sans-serif; color: #444; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.hf { text-align: center; font: 9pt Arial, sans-serif; color: #444; margin: 4px 0; }
${preview ? `@media screen { html { background: #e6e6e6; } body { padding: 16px; } .sheet { background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); margin: 0 auto 16px; padding: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in; width: ${w}in; min-height: ${h}in; box-sizing: border-box; overflow: hidden; } }` : ''}
</style></head><body>${body || '<p style="font:12pt Arial">There is nothing to print.</p>'}</body></html>`
  return html
}

export function printDoc(doc: Doc, what: PrintWhat = 'active') {
  const html = printHtml(doc, what)
  const p = doc.sheet.page
  const [pw, ph] = PAPER[p.paper]
  const [w] = p.orientation === 'landscape' ? [ph, pw] : [pw, ph]
  const m = p.margins
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const fdoc = frame.contentDocument!
  fdoc.open()
  fdoc.write(html)
  fdoc.close()
  const go = () => {
    if (p.fitToPage) {
      const sec = fdoc.querySelector('.sheet') as HTMLElement | null
      if (sec) {
        const avail = (w - m.left - m.right) * 96
        const ratio = Math.min(1, avail / Math.max(1, sec.scrollWidth))
        fdoc.documentElement.style.setProperty('--fit', String(ratio))
      }
    }
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }
  setTimeout(go, 50)
}

function slicerHtml(doc: Doc, o: SlicerObj, box: string): string {
  const { items, selected } = slicerItems(doc, o)
  const buttons = items
    .map((it) => `<div style="padding:3px 6px;margin:2px;border:1px solid #c8c8c8;border-radius:2px;font:9pt Calibri,Carlito,Arial,sans-serif;${selected.has(it) ? `background:${o.color};color:#fff` : 'background:#fff;color:#999'}">${esc(it)}</div>`)
    .join('')
  return `<div style="${box};border:1px solid #bdbdbd;background:#fff;overflow:hidden"><div style="padding:4px 6px;font:bold 10pt Calibri,Carlito,Arial,sans-serif;border-bottom:1px solid #e0e0e0">${esc(o.caption)}</div><div style="display:grid;grid-template-columns:repeat(${Math.max(1, o.columns)},1fr);padding:4px">${buttons}</div></div>`
}

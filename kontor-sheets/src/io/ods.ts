// OpenDocument spreadsheets (.ods): values, formulas (OpenFormula syntax), merged cells, column
// widths, row heights, bold/italic/colors and the common number formats.
import JSZip from 'jszip'
import { cellKey, colName, keyCol, keyRow } from '../model/address'
import { Workbook } from '../model/workbook'
import { CellError, type ErrorCode } from '../model/types'
import { classifyFormat } from '../model/numfmt'
import { tokenize, type RefParts } from '../engine/tokenizer'
import type { Engine } from '../engine/engine'
import { t } from '../i18n'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
}
const PX_PER_IN = 96

// ---------------------------------------------------------------------
// Formulas: A1 syntax ⇄ OpenFormula ([.A1], [$Sheet2.A1:.B2], ";" between arguments)
// ---------------------------------------------------------------------

const quoteSheet = (name: string) => (/^[A-Za-z_][\w]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`)

function refEnd(e: RefParts['a']) {
  return `${e.col !== undefined ? `${e.absC ? '$' : ''}${colName(e.col)}` : ''}${e.row !== undefined ? `${e.absR ? '$' : ''}${e.row + 1}` : ''}`
}

export function toOpenFormula(f: string): string {
  let out = ''
  for (const t of tokenize(f)) {
    if (t.type === 'ref' && t.ref) {
      const r = t.ref
      const sheet = r.sheet ? `$${quoteSheet(r.sheet)}` : ''
      const a = `${sheet}.${refEnd(r.a)}`
      out += r.b ? `[${a}:${sheet}.${refEnd(r.b)}]` : `[${a}]`
    } else if (t.type === 'comma') out += ';'
    else out += t.text
  }
  return `of:=${out}`
}

export function fromOpenFormula(f: string): string {
  let s = f.replace(/^(of:|oooc:)?=/, '')
  // [$'My Sheet'.A1:.B2] / [.A1] → 'My Sheet'!A1:B2 / A1
  s = s.replace(/\[(\$?('(?:[^']|'')+'|[^.\]:[]+))?\.([$A-Z]+[$\d]*)(?::(\$?('(?:[^']|'')+'|[^.\]:[]+))?\.([$A-Z]+[$\d]*))?\]/g, (_m, _s1, sheet: string | undefined, a: string, _s2, _sheet2, b: string | undefined) => {
    const prefix = sheet ? `${sheet.startsWith("'") ? sheet : quoteSheet(sheet)}!` : ''
    return `${prefix}${a}${b ? `:${b}` : ''}`
  })
  // argument separators outside strings
  let out = ''
  let inStr = false
  for (const ch of s) {
    if (ch === '"') inStr = !inStr
    out += !inStr && ch === ';' ? ',' : ch
  }
  return out
}

// ---------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------

function isoDate(serial: number) {
  const ms = Math.round((serial - 25569) * 86400000)
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = serial % 1 ? `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : ''
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}${time}`
}

export async function exportOds(wb: Workbook, engine: Engine): Promise<Blob> {
  const cellStyles = new Map<number, string>()
  const autoStyles: string[] = []
  const styleName = (sid: number) => {
    if (!sid) return ''
    let name = cellStyles.get(sid)
    if (name) return name
    const st = wb.styles.get(sid)
    name = `ce${cellStyles.size + 1}`
    cellStyles.set(sid, name)
    const text = [st.bold && 'fo:font-weight="bold"', st.italic && 'fo:font-style="italic"', st.color && `fo:color="${st.color}"`, st.size && `fo:font-size="${st.size}pt"`, st.font && `style:font-name="${esc(st.font)}"`, st.underline && 'style:text-underline-style="solid"'].filter(Boolean).join(' ')
    const cell = [st.fill && `fo:background-color="${st.fill}"`, st.wrap && 'fo:wrap-option="wrap"', st.v && `style:vertical-align="${st.v === 'middle' ? 'middle' : st.v}"`].filter(Boolean).join(' ')
    const para = st.h ? `<style:paragraph-properties fo:text-align="${st.h === 'left' ? 'start' : st.h === 'right' ? 'end' : 'center'}"/>` : ''
    autoStyles.push(`<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default">${cell ? `<style:table-cell-properties ${cell}/>` : ''}${para}${text ? `<style:text-properties ${text}/>` : ''}</style:style>`)
    return name
  }
  const tables = wb.sheets.map((sheet, si) => {
    const used = sheet.used()
    const maxR = Math.max(0, used.r)
    const maxC = Math.max(0, used.c)
    const merges = new Map(sheet.merges.map((m) => [cellKey(m.r1, m.c1), m]))
    const covered = new Set<number>()
    for (const m of sheet.merges) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(cellKey(r, c))
    const cols: string[] = []
    for (let c = 0; c <= maxC; c++) {
      const name = `co${si}_${c}`
      autoStyles.push(`<style:style style:name="${name}" style:family="table-column"><style:table-column-properties style:column-width="${(sheet.cols.size(c) / PX_PER_IN).toFixed(4)}in"/></style:style>`)
      cols.push(`<table:table-column table:style-name="${name}"${sheet.cols.hidden.has(c) ? ' table:visibility="collapse"' : ''}/>`)
    }
    const rows: string[] = []
    for (let r = 0; r <= maxR; r++) {
      const rname = `ro${si}_${r}`
      autoStyles.push(`<style:style style:name="${rname}" style:family="table-row"><style:table-row-properties style:row-height="${(sheet.rows.size(r) / PX_PER_IN).toFixed(4)}in"/></style:style>`)
      const cells: string[] = []
      for (let c = 0; c <= maxC; c++) {
        const key = cellKey(r, c)
        if (covered.has(key)) {
          cells.push('<table:covered-table-cell/>')
          continue
        }
        const d = sheet.cells.get(key)
        const sid = sheet.styleId(r, c)
        const sname = styleName(sid)
        const m = merges.get(key)
        const attrs: string[] = []
        if (sname) attrs.push(`table:style-name="${sname}"`)
        if (m) attrs.push(`table:number-rows-spanned="${m.r2 - m.r1 + 1}"`, `table:number-columns-spanned="${m.c2 - m.c1 + 1}"`)
        if (!d) {
          cells.push(attrs.length ? `<table:table-cell ${attrs.join(' ')}/>` : '<table:table-cell/>')
          continue
        }
        const v = d.f !== undefined ? engine.display(sheet, r, c) : d.v ?? null
        if (d.f !== undefined) attrs.push(`table:formula="${esc(toOpenFormula(d.f))}"`)
        const fmt = wb.styles.get(sid).fmt ?? ''
        let shown = ''
        if (typeof v === 'number') {
          const kind = classifyFormat(fmt)
          if (kind === 'date') attrs.push('office:value-type="date"', `office:date-value="${isoDate(v)}"`)
          else if (kind === 'percentage') attrs.push('office:value-type="percentage"', `office:value="${v}"`)
          else attrs.push('office:value-type="float"', `office:value="${v}"`)
          shown = String(v)
        } else if (typeof v === 'boolean') {
          attrs.push('office:value-type="boolean"', `office:boolean-value="${v}"`)
          shown = v ? 'TRUE' : 'FALSE'
        } else if (v instanceof CellError) {
          attrs.push('office:value-type="string"', `office:string-value="${v.code}"`)
          shown = v.code
        } else if (v !== null && v !== '') {
          attrs.push('office:value-type="string"')
          shown = String(v)
        }
        const link = d.link ? `<text:a xlink:href="${esc(d.link)}">${esc(shown)}</text:a>` : esc(shown)
        cells.push(`<table:table-cell ${attrs.join(' ')}>${shown ? `<text:p>${link}</text:p>` : ''}</table:table-cell>`)
      }
      rows.push(`<table:table-row table:style-name="${rname}"${sheet.rows.hidden.has(r) ? ' table:visibility="collapse"' : ''}>${cells.join('')}</table:table-row>`)
    }
    return `<table:table table:name="${esc(sheet.name)}">${cols.join('')}${rows.join('')}</table:table>`
  })
  const content =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<office:document-content xmlns:office="${NS.office}" xmlns:style="${NS.style}" xmlns:text="${NS.text}" xmlns:table="${NS.table}" xmlns:fo="${NS.fo}" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" office:version="1.3">` +
    `<office:automatic-styles>${autoStyles.join('')}</office:automatic-styles>` +
    `<office:body><office:spreadsheet>${tables.join('')}</office:spreadsheet></office:body></office:document-content>`
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="${NS.office}" xmlns:style="${NS.style}" xmlns:fo="${NS.fo}" office:version="1.3"><office:styles><style:style style:name="Default" style:family="table-cell"><style:text-properties style:font-name="Calibri" fo:font-size="11pt"/></style:style></office:styles></office:document-styles>`
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="${NS.office}" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3"><office:meta><meta:generator>Kontor Sheets</meta:generator></office:meta></office:document-meta>`
  const zip = new JSZip()
  // the mimetype must be the first entry and stored uncompressed
  zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' })
  zip.file('META-INF/manifest.xml', manifest)
  zip.file('content.xml', content)
  zip.file('styles.xml', styles)
  zip.file('meta.xml', meta)
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.oasis.opendocument.spreadsheet' })
  return new Blob([out as BlobPart], { type: 'application/vnd.oasis.opendocument.spreadsheet' })
}

// ---------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------

const ERRORS: Record<string, ErrorCode> = { '#DIV/0!': '#DIV/0!', '#N/A': '#N/A', '#NAME?': '#NAME?', '#REF!': '#REF!', '#VALUE!': '#VALUE!', '#NUM!': '#NUM!', '#NULL!': '#NULL!' }

function lengthPx(v: string | null): number | null {
  const m = /^([\d.]+)(in|cm|mm|pt|px)$/.exec(v ?? '')
  if (!m) return null
  const n = Number(m[1])
  return m[2] === 'in' ? n * PX_PER_IN : m[2] === 'cm' ? (n / 2.54) * PX_PER_IN : m[2] === 'mm' ? (n / 25.4) * PX_PER_IN : m[2] === 'pt' ? (n / 72) * PX_PER_IN : n
}

export async function importOds(data: ArrayBuffer): Promise<Workbook> {
  const zip = await JSZip.loadAsync(data)
  const xml = await zip.file('content.xml')?.async('string')
  if (!xml) throw new Error(t('This is not an OpenDocument spreadsheet.'))
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const wb = new Workbook(true)
  const a = (el: Element, ns: keyof typeof NS, name: string) => el.getAttributeNS(NS[ns], name)
  // automatic styles: widths, heights and cell formatting
  const colW = new Map<string, number>()
  const rowH = new Map<string, number>()
  const cellStyle = new Map<string, number>()
  for (const st of [...doc.getElementsByTagNameNS(NS.style, 'style')]) {
    const name = a(st, 'style', 'name') ?? ''
    const fam = a(st, 'style', 'family')
    if (fam === 'table-column') {
      const w = lengthPx(a(st.getElementsByTagNameNS(NS.style, 'table-column-properties')[0] ?? st, 'style', 'column-width'))
      if (w) colW.set(name, w)
    } else if (fam === 'table-row') {
      const h = lengthPx(a(st.getElementsByTagNameNS(NS.style, 'table-row-properties')[0] ?? st, 'style', 'row-height'))
      if (h) rowH.set(name, h)
    } else if (fam === 'table-cell') {
      const tp = st.getElementsByTagNameNS(NS.style, 'text-properties')[0]
      const cp = st.getElementsByTagNameNS(NS.style, 'table-cell-properties')[0]
      const pp = st.getElementsByTagNameNS(NS.style, 'paragraph-properties')[0]
      const align = pp ? a(pp, 'fo', 'text-align') : null
      const bg = cp ? a(cp, 'fo', 'background-color') : null
      const patch = {
        bold: tp && a(tp, 'fo', 'font-weight') === 'bold' ? true : undefined,
        italic: tp && a(tp, 'fo', 'font-style') === 'italic' ? true : undefined,
        color: (tp && a(tp, 'fo', 'color')) || undefined,
        fill: bg && bg !== 'transparent' ? bg : undefined,
        h: align === 'center' ? ('center' as const) : align === 'end' || align === 'right' ? ('right' as const) : align === 'start' || align === 'left' ? ('left' as const) : undefined,
        wrap: cp && a(cp, 'fo', 'wrap-option') === 'wrap' ? true : undefined,
      }
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      if (Object.keys(clean).length) cellStyle.set(name, wb.styles.intern(clean))
    }
  }
  const dateStyle = wb.styles.intern({ fmt: 'm/d/yyyy' })
  const pctStyle = wb.styles.intern({ fmt: '0%' })
  for (const t of [...doc.getElementsByTagNameNS(NS.table, 'table')]) {
    const sheet = wb.addSheet(a(t, 'table', 'name') ?? undefined)
    let c = 0
    for (const col of [...t.getElementsByTagNameNS(NS.table, 'table-column')]) {
      const rep = Math.min(16384, Number(a(col, 'table', 'number-columns-repeated') ?? 1))
      const w = colW.get(a(col, 'table', 'style-name') ?? '')
      for (let k = 0; k < rep && c < 16384; k++, c++) {
        if (w && rep < 1000) sheet.cols.manual.set(c, Math.round(w))
        if (a(col, 'table', 'visibility') === 'collapse') sheet.cols.hidden.add(c)
      }
    }
    let r = 0
    for (const row of [...t.getElementsByTagNameNS(NS.table, 'table-row')]) {
      const rep = Number(a(row, 'table', 'number-rows-repeated') ?? 1)
      const cells = [...row.children].filter((x) => x.localName === 'table-cell' || x.localName === 'covered-table-cell')
      const empty = cells.every((x) => !x.hasAttributeNS(NS.office, 'value-type') && !x.hasAttributeNS(NS.table, 'formula'))
      if (empty && rep > 1) {
        r += rep
        continue
      }
      for (let k = 0; k < Math.min(rep, 1000); k++, r++) {
        const h = rowH.get(a(row, 'table', 'style-name') ?? '')
        if (h && Math.abs(h - 20) > 1) sheet.rows.manual.set(r, Math.round(h))
        if (a(row, 'table', 'visibility') === 'collapse') sheet.rows.hidden.add(r)
        let cc = 0
        for (const cell of cells) {
          const crep = Math.min(16384, Number(a(cell, 'table', 'number-columns-repeated') ?? 1))
          for (let j = 0; j < crep && cc < 16384; j++, cc++) {
            if (cell.localName === 'covered-table-cell') continue
            const type = a(cell, 'office', 'value-type')
            const formula = a(cell, 'table', 'formula')
            const sid0 = cellStyle.get(a(cell, 'table', 'style-name') ?? '') ?? 0
            const text = [...cell.getElementsByTagNameNS(NS.text, 'p')].map((p) => p.textContent ?? '').join('\n')
            let v: string | number | boolean | CellError | undefined
            let sid = sid0
            if (type === 'float' || type === 'currency') v = Number(a(cell, 'office', 'value'))
            else if (type === 'percentage') {
              v = Number(a(cell, 'office', 'value'))
              sid = sid || pctStyle
            } else if (type === 'date') {
              const iso = a(cell, 'office', 'date-value') ?? ''
              const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d):(\d\d))?/.exec(iso)
              if (m) v = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) / 86400000 + 25569
              sid = sid || dateStyle
            } else if (type === 'time') {
              const m = /PT(\d+)H(\d+)M([\d.]+)S/.exec(a(cell, 'office', 'time-value') ?? '')
              if (m) v = (+m[1] * 3600 + +m[2] * 60 + +m[3]) / 86400
            } else if (type === 'boolean') v = a(cell, 'office', 'boolean-value') === 'true'
            else if (type === 'string') v = ERRORS[text] ? new CellError(ERRORS[text]) : text
            if (v === undefined && !formula && !sid) continue
            const link = cell.getElementsByTagNameNS(NS.text, 'a')[0]?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? undefined
            sheet.cells.set(cellKey(r, cc), {
              ...(formula ? { f: fromOpenFormula(formula) } : {}),
              ...(v !== undefined && !formula ? { v } : {}),
              ...(sid ? { s: sid } : {}),
              ...(link ? { link } : {}),
            })
            const rs = Number(a(cell, 'table', 'number-rows-spanned') ?? 1)
            const cs = Number(a(cell, 'table', 'number-columns-spanned') ?? 1)
            if (rs > 1 || cs > 1) sheet.merges.push({ r1: r, c1: cc, r2: r + rs - 1, c2: cc + cs - 1 })
          }
        }
      }
    }
    sheet.cols.touch()
    sheet.rows.touch()
    sheet.touchUsed()
  }
  if (!wb.sheets.length) wb.addSheet()
  void keyRow
  void keyCol
  return wb
}

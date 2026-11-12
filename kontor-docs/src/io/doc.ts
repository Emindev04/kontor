// Legacy binary .doc files (the 97–2003 word processor format): imported as formatted text.
//
// The file is a Compound File (a small FAT file system). The "WordDocument" stream holds the text,
// located through the piece table in the table stream, and the character and paragraph formatting in
// 512-byte pages (FKPs). Read here: text, bold, italic, underline, strike, caps, hidden text, font,
// size, color, highlight, super/subscript, alignment, indents, spacing, line spacing, headings
// (built-in heading styles), bullet and numbered lists, tables, hyperlinks, tabs, line and page
// breaks. Pictures, headers, footers and notes are not read.

import { decodeCp1252 } from './rtf'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// ---- Compound File ----

const END_OF_CHAIN = 0xfffffffe
const FREE = 0xffffffff

class CompoundFile {
  private view: DataView
  private sectorSize: number
  private miniSectorSize: number
  private fat: number[] = []
  private miniFat: number[] = []
  private miniStream: Uint8Array = new Uint8Array(0)
  private cutoff: number
  entries: { name: string; type: number; start: number; size: number }[] = []

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
    if (bytes.length < 512 || sig.some((b, i) => bytes[i] !== b)) throw new Error('Not a compound file')
    this.sectorSize = 1 << this.view.getUint16(0x1e, true)
    this.miniSectorSize = 1 << this.view.getUint16(0x20, true)
    this.cutoff = this.view.getUint32(0x38, true)
    // FAT sectors: the first 109 are listed in the header, the rest in the DIFAT chain.
    const fatSectors: number[] = []
    for (let i = 0; i < 109; i++) {
      const s = this.view.getUint32(0x4c + i * 4, true)
      if (s !== FREE && s !== END_OF_CHAIN) fatSectors.push(s)
    }
    let difat = this.view.getUint32(0x44, true)
    let guard = 0
    while (difat !== END_OF_CHAIN && difat !== FREE && guard++ < 10000) {
      const off = this.offset(difat)
      const n = this.sectorSize / 4 - 1
      for (let i = 0; i < n; i++) {
        const s = this.view.getUint32(off + i * 4, true)
        if (s !== FREE && s !== END_OF_CHAIN) fatSectors.push(s)
      }
      difat = this.view.getUint32(off + n * 4, true)
    }
    for (const s of fatSectors) {
      const off = this.offset(s)
      for (let i = 0; i < this.sectorSize / 4 && off + i * 4 + 4 <= bytes.length; i++) this.fat.push(this.view.getUint32(off + i * 4, true))
    }
    // Directory.
    const dir = this.chain(this.view.getUint32(0x30, true))
    for (let off = 0; off + 128 <= dir.length; off += 128) {
      const d = new DataView(dir.buffer, dir.byteOffset + off, 128)
      const nameLen = d.getUint16(64, true)
      let name = ''
      for (let i = 0; i < Math.max(0, nameLen / 2 - 1); i++) name += String.fromCharCode(d.getUint16(i * 2, true))
      this.entries.push({ name, type: d.getUint8(66), start: d.getUint32(116, true), size: d.getUint32(120, true) })
    }
    const root = this.entries.find((e) => e.type === 5)
    if (root) this.miniStream = this.chain(root.start).subarray(0, root.size)
    const miniFatStart = this.view.getUint32(0x3c, true)
    if (miniFatStart !== END_OF_CHAIN) {
      const mf = this.chain(miniFatStart)
      const v = new DataView(mf.buffer, mf.byteOffset, mf.byteLength)
      for (let i = 0; i + 4 <= mf.length; i += 4) this.miniFat.push(v.getUint32(i, true))
    }
  }

  private offset(sector: number) {
    return (sector + 1) * this.sectorSize
  }

  private chain(start: number): Uint8Array {
    const parts: Uint8Array[] = []
    let s = start
    let guard = 0
    while (s !== END_OF_CHAIN && s !== FREE && s < this.fat.length + 1 && guard++ < 1_000_000) {
      const off = this.offset(s)
      if (off >= this.bytes.length) break
      parts.push(this.bytes.subarray(off, Math.min(off + this.sectorSize, this.bytes.length)))
      s = this.fat[s] ?? END_OF_CHAIN
    }
    return concat(parts)
  }

  private miniChain(start: number): Uint8Array {
    const parts: Uint8Array[] = []
    let s = start
    let guard = 0
    while (s !== END_OF_CHAIN && s !== FREE && guard++ < 1_000_000) {
      const off = s * this.miniSectorSize
      if (off >= this.miniStream.length) break
      parts.push(this.miniStream.subarray(off, off + this.miniSectorSize))
      s = this.miniFat[s] ?? END_OF_CHAIN
    }
    return concat(parts)
  }

  stream(name: string): Uint8Array | null {
    const e = this.entries.find((x) => x.type === 2 && x.name === name)
    if (!e) return null
    const data = e.size < this.cutoff ? this.miniChain(e.start) : this.chain(e.start)
    return data.subarray(0, e.size)
  }
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// ---- Formatting ----

type Chp = { b?: boolean; i?: boolean; u?: boolean; strike?: boolean; caps?: boolean; smallCaps?: boolean; hidden?: boolean; size?: number; color?: string; highlight?: string; font?: number; vert?: 'super' | 'sub' }
type Pap = { istd: number; jc?: number; left?: number; right?: number; first?: number; before?: number; after?: number; line?: string; inTable?: boolean; ttp?: boolean; ilfo?: number; ilvl?: number; breakBefore?: boolean; keepNext?: boolean }

/** The 16 standard colors of the format's color index. */
const ICO = ['', '#000000', '#0000FF', '#00FFFF', '#00FF00', '#FF00FF', '#FF0000', '#FFFF00', '#FFFFFF', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#C0C0C0']

/** Calls `fn` for every property (sprm) of a grpprl with its operand position. */
function eachSprm(data: Uint8Array, start: number, end: number, fn: (sprm: number, at: number, v: DataView) => void) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let p = start
  while (p + 2 <= end) {
    const sprm = v.getUint16(p, true)
    p += 2
    const spra = sprm >> 13
    let size: number
    if (spra === 0 || spra === 1) size = 1
    else if (spra === 2 || spra === 4 || spra === 5) size = 2
    else if (spra === 3) size = 4
    else if (spra === 7) size = 3
    else if (sprm === 0xd608 || sprm === 0xd606) size = p + 2 <= end ? v.getUint16(p, true) + 1 : 0
    else if (sprm === 0xc615) size = p < end ? (data[p] === 255 ? 0 : data[p] + 1) : 0
    else size = p < end ? data[p] + 1 : 0
    if (p + size > end) break
    fn(sprm, spra === 6 ? p + 1 : p, v)
    p += size
  }
}

const toggle = (b: number) => b === 1 || b === 0x81

function readChp(data: Uint8Array, start: number, end: number): Chp {
  const c: Chp = {}
  eachSprm(data, start, end, (sprm, at, v) => {
    const b = data[at]
    switch (sprm) {
      case 0x0835: c.b = toggle(b); break
      case 0x0836: c.i = toggle(b); break
      case 0x0837: c.strike = toggle(b); break
      case 0x2a53: c.strike = toggle(b) || c.strike; break
      case 0x083a: c.smallCaps = toggle(b); break
      case 0x083b: c.caps = toggle(b); break
      case 0x083c: c.hidden = toggle(b); break
      case 0x2a3e: c.u = b !== 0; break
      case 0x4a43: c.size = v.getUint16(at, true) / 2; break
      case 0x2a42: c.color = ICO[b] || undefined; break
      case 0x6870: {
        const r = data[at], g = data[at + 1], bl = data[at + 2], auto = data[at + 3]
        c.color = auto === 0xff ? undefined : `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`
        break
      }
      case 0x2a0c: c.highlight = ICO[b] || undefined; break
      case 0x2a48: c.vert = b === 1 ? 'super' : b === 2 ? 'sub' : undefined; break
      case 0x4a4f: c.font = v.getUint16(at, true); break
    }
  })
  return c
}

function readPap(data: Uint8Array, start: number, end: number, base: Pap): Pap {
  const p: Pap = { ...base }
  eachSprm(data, start, end, (sprm, at, v) => {
    const s16 = () => v.getInt16(at, true)
    switch (sprm) {
      case 0x2403:
      case 0x2461: p.jc = data[at]; break
      case 0x840f:
      case 0x845e: p.left = s16(); break
      case 0x840e:
      case 0x845d: p.right = s16(); break
      case 0x8411:
      case 0x8460: p.first = s16(); break
      case 0xa413: p.before = v.getUint16(at, true); break
      case 0xa414: p.after = v.getUint16(at, true); break
      case 0x6412: {
        const dya = v.getInt16(at, true)
        const mult = v.getInt16(at + 2, true)
        p.line = mult ? (dya === 240 ? undefined : String(Math.round((dya / 240) * 100) / 100)) : dya < 0 ? `exact:${-dya / 20}` : `atLeast:${dya / 20}`
        break
      }
      case 0x2416: p.inTable = data[at] !== 0; break
      case 0x2417: p.ttp = data[at] !== 0; break
      case 0x460b: p.ilfo = v.getInt16(at, true); break
      case 0x260a: p.ilvl = data[at]; break
      case 0x2407: p.breakBefore = data[at] !== 0; break
      case 0x2405: p.keepNext = data[at] !== 0; break
    }
  })
  return p
}

type Run<T> = { start: number; end: number; props: T }

/** Reads the formatting pages listed by a PlcBte (character or paragraph). */
function readFkps<T>(doc: Uint8Array, table: Uint8Array, fc: number, lcb: number, kind: 'chp' | 'pap'): Run<T>[] {
  const runs: Run<T>[] = []
  if (!lcb || fc + lcb > table.length) return runs
  const tv = new DataView(table.buffer, table.byteOffset + fc, lcb)
  const n = (lcb - 4) / 8
  const dv = new DataView(doc.buffer, doc.byteOffset, doc.byteLength)
  for (let i = 0; i < n; i++) {
    const pn = tv.getUint32((n + 1) * 4 + i * 4, true) & 0x3fffff
    const page = pn * 512
    if (page + 512 > doc.length) continue
    const crun = doc[page + 511]
    for (let r = 0; r < crun; r++) {
      const start = dv.getUint32(page + r * 4, true)
      const end = dv.getUint32(page + (r + 1) * 4, true)
      if (kind === 'chp') {
        const off = doc[page + (crun + 1) * 4 + r] * 2
        if (!off) {
          runs.push({ start, end, props: {} as T })
          continue
        }
        const cb = doc[page + off]
        runs.push({ start, end, props: readChp(doc, page + off + 1, page + off + 1 + cb) as T })
      } else {
        const off = doc[page + (crun + 1) * 4 + r * 13] * 2
        if (!off) {
          runs.push({ start, end, props: { istd: 0 } as T })
          continue
        }
        let cb = doc[page + off]
        let p = page + off + 1
        let size: number
        if (cb === 0) {
          cb = doc[p]
          p++
          size = cb * 2
        } else size = cb * 2 - 1
        const istd = dv.getUint16(p, true)
        runs.push({ start, end, props: readPap(doc, p + 2, p + size, { istd }) as T })
      }
    }
  }
  return runs.sort((a, b) => a.start - b.start)
}

function find<T>(runs: Run<T>[], fc: number): T | null {
  let lo = 0
  let hi = runs.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = runs[mid]
    if (fc < r.start) hi = mid - 1
    else if (fc >= r.end) lo = mid + 1
    else return r.props
  }
  return null
}

/** Font names (SttbfFfn). */
function readFonts(table: Uint8Array, fc: number, lcb: number): string[] {
  const out: string[] = []
  if (!lcb || fc + lcb > table.length) return out
  const v = new DataView(table.buffer, table.byteOffset, table.byteLength)
  const count = v.getUint16(fc, true)
  let p = fc + 4
  for (let i = 0; i < count && p < fc + lcb; i++) {
    const len = table[p] + 1
    let name = ''
    for (let q = p + 40; q + 1 < p + len; q += 2) {
      const ch = v.getUint16(q, true)
      if (!ch) break
      name += String.fromCharCode(ch)
    }
    out.push(name)
    p += len
  }
  return out
}

/** List formats: for each list (by lsid), whether each level is a bullet, and its start number. */
function readLists(table: Uint8Array, fcLst: number, lcbLst: number, fcLfo: number, lcbLfo: number): { lfo: number[]; lists: Map<number, { bullet: boolean; start: number }[]> } {
  const lists = new Map<number, { bullet: boolean; start: number }[]>()
  const lfo: number[] = []
  const v = new DataView(table.buffer, table.byteOffset, table.byteLength)
  try {
    if (lcbLst && fcLst + lcbLst <= table.length) {
      const count = v.getInt16(fcLst, true)
      const lstfs: { lsid: number; simple: boolean }[] = []
      for (let i = 0; i < count; i++) {
        const at = fcLst + 2 + i * 28
        lstfs.push({ lsid: v.getInt32(at, true), simple: (table[at + 26] & 1) !== 0 })
      }
      let p = fcLst + 2 + count * 28
      for (const l of lstfs) {
        const levels: { bullet: boolean; start: number }[] = []
        for (let k = 0; k < (l.simple ? 1 : 9); k++) {
          const start = v.getInt32(p, true)
          const nfc = table[p + 4]
          const cbChpx = table[p + 24]
          const cbPapx = table[p + 25]
          p += 28 + cbPapx + cbChpx
          const cch = v.getUint16(p, true)
          p += 2 + cch * 2
          levels.push({ bullet: nfc === 23, start })
        }
        lists.set(l.lsid, levels)
      }
    }
    if (lcbLfo && fcLfo + lcbLfo <= table.length) {
      const count = v.getInt32(fcLfo, true)
      for (let i = 0; i < count; i++) lfo.push(v.getInt32(fcLfo + 4 + i * 16, true))
    }
  } catch {
    // Damaged list tables: lists come out as bullets.
  }
  return { lfo, lists }
}

// ---- Document ----

type Para = { html: string; pap: Pap; empty: boolean }

/** Imports a legacy .doc file as HTML for the editor. */
export function importDoc(bytes: Uint8Array): { html: string; title: string | null } {
  const cf = new CompoundFile(bytes)
  const doc = cf.stream('WordDocument')
  if (!doc || doc.length < 0x200) throw new Error('No document stream')
  const dv = new DataView(doc.buffer, doc.byteOffset, doc.byteLength)
  if (dv.getUint16(0, true) !== 0xa5ec) throw new Error('Unsupported document')
  const flags = dv.getUint16(0x0a, true)
  if (flags & 0x0100) throw new Error('The document is password protected')
  const table = cf.stream(flags & 0x0200 ? '1Table' : '0Table')
  if (!table) throw new Error('No table stream')
  const ccpText = dv.getInt32(0x4c, true)
  const fcLcb = (i: number) => [dv.getUint32(154 + i * 8, true), dv.getUint32(158 + i * 8, true)] as const

  // Piece table.
  const [fcClx, lcbClx] = fcLcb(33)
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength)
  let p = fcClx
  while (p < fcClx + lcbClx && table[p] === 0x01) p += 3 + tv.getInt16(p + 1, true)
  if (table[p] !== 0x02) throw new Error('No piece table')
  const lcb = tv.getUint32(p + 1, true)
  const plc = p + 5
  const n = (lcb - 4) / 12
  const chars: string[] = []
  const fcs: number[] = []
  for (let i = 0; i < n && chars.length < ccpText; i++) {
    const cpStart = tv.getUint32(plc + i * 4, true)
    const cpEnd = tv.getUint32(plc + (i + 1) * 4, true)
    const raw = tv.getUint32(plc + (n + 1) * 4 + i * 8 + 2, true)
    const compressed = (raw & 0x40000000) !== 0
    const fc = raw & 0x3fffffff
    const count = Math.min(cpEnd - cpStart, ccpText - cpStart)
    for (let k = 0; k < count; k++) {
      if (compressed) {
        const at = fc / 2 + k
        chars.push(decodeCp1252(doc.subarray(at, at + 1)))
        fcs.push(at)
      } else {
        const at = fc + k * 2
        chars.push(String.fromCharCode(dv.getUint16(at, true)))
        fcs.push(at)
      }
    }
  }

  const [fcChpx, lcbChpx] = fcLcb(12)
  const [fcPapx, lcbPapx] = fcLcb(13)
  const [fcFfn, lcbFfn] = fcLcb(15)
  const [fcLst, lcbLst] = fcLcb(73)
  const [fcLfo, lcbLfo] = fcLcb(74)
  const chpRuns = readFkps<Chp>(doc, table, fcChpx, lcbChpx, 'chp')
  const papRuns = readFkps<Pap>(doc, table, fcPapx, lcbPapx, 'pap')
  const fonts = readFonts(table, fcFfn, lcbFfn)
  const { lfo, lists } = readLists(table, fcLst, lcbLst, fcLfo, lcbLfo)

  const blocks: (Para | { table: string[][][] } | { page: true })[] = []
  let html = ''
  let empty = true
  let cell: string[] = []
  let row: string[][] = []
  let rows: string[][][] = []
  const fields: { inst: string; result: boolean; href: string | null }[] = []

  const wrap = (text: string, c: Chp) => {
    if (c.hidden) return ''
    let out = esc(text)
    if (c.b) out = `<strong>${out}</strong>`
    if (c.i) out = `<em>${out}</em>`
    if (c.u) out = `<u>${out}</u>`
    if (c.strike) out = `<s>${out}</s>`
    if (c.vert === 'super') out = `<sup>${out}</sup>`
    if (c.vert === 'sub') out = `<sub>${out}</sub>`
    if (c.highlight) out = `<mark data-color="${c.highlight}" style="background-color: ${c.highlight}">${out}</mark>`
    const css: string[] = []
    if (c.font != null && fonts[c.font] && !/^Times New Roman$/i.test(fonts[c.font])) css.push(`font-family: ${fonts[c.font]}`)
    if (c.size && c.size !== 11) css.push(`font-size: ${c.size}pt`)
    if (c.color && c.color !== '#000000') css.push(`color: ${c.color}`)
    if (c.caps) css.push('text-transform: uppercase')
    if (c.smallCaps) css.push('font-variant: small-caps')
    if (css.length) out = `<span style="${css.join('; ')}">${out}</span>`
    const link = [...fields].reverse().find((f) => f.result && f.href)
    return link ? `<a href="${esc(link.href!)}">${out}</a>` : out
  }

  const flushTable = () => {
    if (rows.length) blocks.push({ table: rows })
    rows = []
  }

  let segment = ''
  let segChp: Chp | null = null
  const flushSegment = () => {
    if (segment && segChp) html += wrap(segment, segChp)
    segment = ''
  }
  const paraTag = (pap: Pap) => paragraphHtml(html, pap)

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const code = ch.charCodeAt(0)
    // Fields: instructions are hidden, the result is shown (hyperlinks keep their address).
    if (code === 0x13) {
      flushSegment()
      fields.push({ inst: '', result: false, href: null })
      continue
    }
    if (code === 0x14 && fields.length) {
      flushSegment()
      const f = fields[fields.length - 1]
      f.result = true
      const m = f.inst.match(/HYPERLINK\s+"([^"]+)"/i) ?? f.inst.match(/HYPERLINK\s+(\S+)/i)
      if (m) f.href = m[1]
      continue
    }
    if (code === 0x15 && fields.length) {
      flushSegment()
      fields.pop()
      continue
    }
    const field = fields[fields.length - 1]
    if (field && !field.result) {
      field.inst += ch
      continue
    }
    if (code === 0x0d || code === 0x07) {
      flushSegment()
      const pap = find(papRuns, fcs[i]) ?? { istd: 0 }
      if (code === 0x07 && pap.inTable) {
        if (pap.ttp) {
          rows.push(row)
          row = []
        } else {
          if (html || cell.length === 0) cell.push(paraTag(pap))
          row.push(cell)
          cell = []
        }
      } else if (pap.inTable) {
        cell.push(paraTag(pap))
      } else {
        flushTable()
        blocks.push({ html, pap, empty })
      }
      html = ''
      empty = true
      continue
    }
    const chp = find(chpRuns, fcs[i]) ?? {}
    let text = ch
    if (code === 0x0b) {
      flushSegment()
      html += '<br>'
      continue
    }
    if (code === 0x0c) {
      flushSegment()
      if (html) {
        flushTable()
        blocks.push({ html, pap: find(papRuns, fcs[i]) ?? { istd: 0 }, empty })
        html = ''
        empty = true
      }
      blocks.push({ page: true })
      continue
    }
    if (code === 0x1e) text = '‑'
    else if (code === 0x1f) text = '­'
    else if (code < 0x20 && code !== 0x09) continue
    if (segChp !== chp && JSON.stringify(segChp) !== JSON.stringify(chp)) {
      flushSegment()
      segChp = chp
    }
    segment += text
    if (!chp.hidden) empty = false
  }
  flushSegment()
  if (html) blocks.push({ html, pap: { istd: 0 }, empty })
  flushTable()

  // Paragraphs to HTML, with list paragraphs grouped into lists.
  const out: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if ('page' in b) {
      out.push('<div data-type="page-break"></div>')
      continue
    }
    if ('table' in b) {
      out.push(`<table>${b.table.map((r) => `<tr>${r.map((c) => `<td>${c.join('') || '<p></p>'}</td>`).join('')}</tr>`).join('')}</table>`)
      continue
    }
    if (!b.pap.ilfo) {
      out.push(paragraphHtml(b.html, b.pap))
      continue
    }
    const items: { level: number; ordered: boolean; html: string; start: number }[] = []
    while (i < blocks.length) {
      const c = blocks[i]
      if ('page' in c || 'table' in c || !c.pap.ilfo) break
      const lsid = lfo[(c.pap.ilfo ?? 1) - 1]
      const level = Math.max(0, Math.min(8, c.pap.ilvl ?? 0))
      const def = lists.get(lsid)?.[level]
      items.push({ level, ordered: def ? !def.bullet : false, html: paragraphHtml(c.html, { ...c.pap, left: undefined, first: undefined }), start: def?.start ?? 1 })
      i++
    }
    i--
    out.push(listHtml(items))
  }
  return { html: out.join(''), title: null }
}

function paragraphHtml(inner: string, pap: Pap) {
  const level = pap.istd >= 1 && pap.istd <= 6 ? pap.istd : 0
  const tag = level ? `h${level}` : 'p'
  const css: string[] = []
  const align = ['', 'center', 'right', 'justify', 'justify'][pap.jc ?? 0]
  if (align) css.push(`text-align: ${align}`)
  const inch = (tw: number) => Math.round((tw / 1440) * 1000) / 1000
  if (pap.left && pap.left > 0) css.push(`margin-left: ${inch(pap.left)}in`)
  if (pap.right && pap.right > 0) css.push(`margin-right: ${inch(pap.right)}in`)
  if (pap.first) css.push(`text-indent: ${inch(pap.first)}in`)
  if (pap.before != null) css.push(`margin-top: ${pap.before / 20}pt`)
  if (pap.after != null) css.push(`margin-bottom: ${pap.after / 20}pt`)
  const attrs: string[] = []
  if (pap.line) attrs.push(`data-line-height="${pap.line}"`)
  if (pap.breakBefore) attrs.push('data-break-before=""')
  if (pap.keepNext && !level) attrs.push('data-keep-next="true"')
  return `<${tag}${css.length ? ` style="${css.join('; ')}"` : ''}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${inner}</${tag}>`
}

function listHtml(items: { level: number; ordered: boolean; html: string; start: number }[]): string {
  let html = ''
  const open: boolean[] = []
  for (const item of items) {
    while (open.length > item.level + 1) html += `</li></${open.pop() ? 'ol' : 'ul'}>`
    if (open.length === item.level + 1 && open[open.length - 1] !== item.ordered) html += `</li></${open.pop() ? 'ol' : 'ul'}>`
    if (open.length === item.level + 1) html += '</li>'
    while (open.length < item.level + 1) {
      html += item.ordered ? `<ol${item.start !== 1 && open.length === item.level ? ` start="${item.start}"` : ''}>` : '<ul>'
      open.push(item.ordered)
      if (open.length < item.level + 1) html += '<li><p></p>'
    }
    html += `<li>${item.html}`
  }
  while (open.length) html += `</li></${open.pop() ? 'ol' : 'ul'}>`
  return html
}

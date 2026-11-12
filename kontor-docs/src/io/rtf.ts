import type { JSONContent } from '@tiptap/core'

// Rich Text Format: open (to HTML for the editor) and save. Reading covers what documents from word
// processors use: fonts, sizes, colors, highlight, bold/italic/underline/strike, super/subscript,
// caps, hidden text, alignment, indents, spacing, line spacing, headings (outline levels and the
// "heading n" styles), bullet and numbered lists with levels, tables with merged cells, pictures
// (PNG/JPEG), hyperlinks, tabs, line and page breaks and Unicode text.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// ---- Reading ----

type Token = { t: 'open' } | { t: 'close' } | { t: 'word'; word: string; param: number | null } | { t: 'hex'; byte: number } | { t: 'text'; text: string }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  let text = ''
  const flush = () => {
    if (text) out.push({ t: 'text', text })
    text = ''
  }
  while (i < src.length) {
    const c = src[i]
    if (c === '{' || c === '}') {
      flush()
      out.push({ t: c === '{' ? 'open' : 'close' })
      i++
    } else if (c === '\\') {
      const n = src[i + 1]
      if (n === undefined) break
      if (/[a-zA-Z]/.test(n)) {
        flush()
        let j = i + 1
        while (j < src.length && /[a-zA-Z]/.test(src[j])) j++
        const word = src.slice(i + 1, j)
        let k = j
        if (src[k] === '-' || /\d/.test(src[k] ?? '')) {
          k++
          while (k < src.length && /\d/.test(src[k])) k++
        }
        const param = k > j ? parseInt(src.slice(j, k), 10) : null
        if (src[k] === ' ') k++
        out.push({ t: 'word', word, param })
        i = k
      } else if (n === "'") {
        flush()
        out.push({ t: 'hex', byte: parseInt(src.slice(i + 2, i + 4), 16) || 0 })
        i += 4
      } else if (n === '\r' || n === '\n') {
        flush()
        out.push({ t: 'word', word: 'par', param: null })
        i += 2
      } else {
        flush()
        // Control symbols: \~ nonbreaking space, \- optional hyphen, \_ nonbreaking hyphen, \* destination marker.
        if (n === '~') text += '\u00a0'
        else if (n === '-') text += '\u00ad'
        else if (n === '_') text += '\u2011'
        else if (n === '*') out.push({ t: 'word', word: '*', param: null })
        else if (n === '\\' || n === '{' || n === '}') text += n
        else if (n === '|' || n === ':') {
          // Formula / index subentry characters: ignore.
        } else text += n
        if (text) flush()
        i += 2
      }
    } else if (c === '\r' || c === '\n') {
      i++
    } else {
      text += c
      i++
    }
  }
  flush()
  return out
}

type CharState = {
  b: boolean
  i: boolean
  ul: boolean
  strike: boolean
  fs: number
  f: number | null
  cf: number
  hl: number
  sup: boolean
  sub: boolean
  caps: boolean
  scaps: boolean
  v: boolean
  uc: number
  dest: string | null
}

type ParaState = {
  align: string | null
  li: number
  ri: number
  fi: number
  sb: number | null
  sa: number | null
  sl: number
  slmult: number
  intbl: boolean
  style: number
  outline: number | null
  list: number | null
  ilvl: number
  keepn: boolean
  pagebb: boolean
}

const defaultChar = (): CharState => ({ b: false, i: false, ul: false, strike: false, fs: 24, f: null, cf: 0, hl: 0, sup: false, sub: false, caps: false, scaps: false, v: false, uc: 1, dest: null })
const defaultPara = (): ParaState => ({ align: null, li: 0, ri: 0, fi: 0, sb: null, sa: null, sl: 0, slmult: 0, intbl: false, style: 0, outline: null, list: null, ilvl: 0, keepn: false, pagebb: false })

type Block =
  | { kind: 'p'; html: string; para: ParaState; listText: string; empty: boolean }
  | { kind: 'table'; rows: { cells: { html: string; merge: 'first' | 'cont' | null; vmerge: 'first' | 'cont' | null }[] }[] }
  | { kind: 'page' }

/** Destinations whose content is not document text. */
const SKIP = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'footnote', 'listtable',
  'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'pgdsctbl', 'nonshppict', 'object',
  'objdata', 'filetbl', 'revtbl', 'annotation', 'atnid', 'atnauthor', 'bkmkstart', 'bkmkend', 'fldinst', 'pict', 'listtext', 'pntext', 'pn', 'shpinst', 'template',
  'userprops', 'docvar', 'xe', 'tc', 'mmathPr', 'wgrffmtfilter', 'fchars', 'lchars', 'background', 'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc',
])

/** Characters 0x80–0x9F of code page 1252 (some runtimes decode that range as Latin-1). */
const CP1252_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ'

export function decodeCp1252(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b)
  return s
}

const DECODERS = new Map<number, TextDecoder | null>()
function decoder(cp: number): { decode: (b: Uint8Array) => string } {
  if (cp === 1252) return { decode: decodeCp1252 }
  if (!DECODERS.has(cp)) {
    try {
      DECODERS.set(cp, new TextDecoder(cp === 65001 ? 'utf-8' : cp === 932 ? 'shift_jis' : cp === 936 ? 'gbk' : cp === 949 ? 'euc-kr' : cp === 950 ? 'big5' : `windows-${cp}`))
    } catch {
      DECODERS.set(cp, null)
    }
  }
  return DECODERS.get(cp) ?? new TextDecoder('windows-1252')
}

function colorHex(c: { r: number; g: number; b: number }) {
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/**
 * The text of an RTF file. RTF is 8-bit: characters outside ASCII are normally escaped, but some
 * programs write them as raw bytes of the document's ANSI code page, so the bytes are read as code
 * page 1252 rather than as UTF-8 (which would turn them into replacement characters).
 */
export async function readRtfFile(file: Blob): Promise<string> {
  return decodeCp1252(new Uint8Array(await file.arrayBuffer()))
}

/** RTF to HTML for the editor. `title` is taken from the document information when present. */
export function importRtf(src: string): { html: string; title: string | null } {
  if (!/^\s*\{\\rtf/.test(src)) throw new Error('Not an RTF document')
  const tokens = tokenize(src)
  const fonts = new Map<number, string>()
  const colors: ({ r: number; g: number; b: number } | null)[] = []
  const styleNames = new Map<number, string>()
  let codepage = 1252
  let defaultFont = 0
  let title: string | null = null

  // ---- Pass over the header tables: fonts, colors, styles, info. ----
  let state = defaultChar()
  let para = defaultPara()
  const stack: CharState[] = []
  const blocks: Block[] = []
  let html = ''
  let empty = true
  let listText = ''
  let pending: number[] = []
  let skipChars = 0
  // Field (hyperlink) handling.
  let fieldInst = ''
  const fieldDepth: { depth: number; href: string | null; started: boolean }[] = []
  // Pictures.
  let pict: { type: string | null; hex: string; w: number; h: number; wg: number; hg: number; sx: number; sy: number } | null = null
  // Collected text for header destinations.
  let destText = ''
  let curColor = { r: 0, g: 0, b: 0 }
  let colorSet = false
  let fontNum = 0
  let styleNum = 0
  // Tables.
  let row: { html: string; merge: 'first' | 'cont' | null; vmerge: 'first' | 'cont' | null }[] = []
  let cellDefs: { merge: 'first' | 'cont' | null; vmerge: 'first' | 'cont' | null }[] = []
  let nextDef: { merge: 'first' | 'cont' | null; vmerge: 'first' | 'cont' | null } = { merge: null, vmerge: null }
  let cellHtml = ''
  let table: Extract<Block, { kind: 'table' }> | null = null
  let openRun = ''

  const decodePending = () => {
    if (!pending.length) return ''
    const s = decoder(codepage).decode(new Uint8Array(pending))
    pending = []
    return s
  }

  const runStyle = () => {
    const css: string[] = []
    const level = headingLevel(para, styleNames)
    if (state.f != null && state.f !== defaultFont && fonts.has(state.f)) css.push(`font-family: ${fonts.get(state.f)}`)
    if (state.fs !== 22 && !(level && state.fs === HEADING_SIZES[level - 1])) css.push(`font-size: ${state.fs / 2}pt`)
    const color = colors[state.cf]
    if (state.cf && color) css.push(`color: ${colorHex(color)}`)
    if (state.caps) css.push('text-transform: uppercase')
    if (state.scaps) css.push('font-variant: small-caps')
    return css.join('; ')
  }

  const wrap = (text: string) => {
    let out = esc(text).replace(/\t/g, '\t')
    if (state.b && !headingLevel(para, styleNames)) out = `<strong>${out}</strong>`
    if (state.i) out = `<em>${out}</em>`
    if (state.ul) out = `<u>${out}</u>`
    if (state.strike) out = `<s>${out}</s>`
    if (state.sup) out = `<sup>${out}</sup>`
    if (state.sub) out = `<sub>${out}</sub>`
    const hl = colors[state.hl]
    if (state.hl && hl) out = `<mark data-color="${colorHex(hl)}" style="background-color: ${colorHex(hl)}">${out}</mark>`
    const style = runStyle()
    if (style) out = `<span style="${style}">${out}</span>`
    return out
  }

  const emitText = (text: string) => {
    if (!text) return
    if (state.dest) {
      if (state.dest === 'listtext' || state.dest === 'pntext') listText += text
      else if (state.dest === 'fldinst') fieldInst += text
      else destText += text
      return
    }
    if (state.v) return
    const field = fieldDepth[fieldDepth.length - 1]
    if (field?.href && !field.started) {
      openRun += `<a href="${esc(field.href)}">`
      field.started = true
    }
    html += openRun + wrap(text)
    openRun = ''
    empty = false
  }

  const flushText = () => emitText(decodePending())

  const paraHtml = () => {
    const field = fieldDepth[fieldDepth.length - 1]
    // A link that spans paragraphs is closed at the paragraph end.
    return field?.started ? `${html}</a>` : html
  }

  const endParagraph = () => {
    flushText()
    const out = paraHtml()
    const field = fieldDepth[fieldDepth.length - 1]
    if (field?.started) field.started = false
    if (para.intbl) {
      cellHtml += paragraphHtml(out, para, styleNames)
    } else {
      if (table) {
        blocks.push(table)
        table = null
      }
      blocks.push({ kind: 'p', html: out, para: { ...para }, listText, empty })
    }
    html = ''
    empty = true
    listText = ''
  }

  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k]
    if (tok.t !== 'hex') {
      if (pending.length && !(tok.t === 'word' && tok.word === 'uc')) flushText()
    }
    if (tok.t === 'open') {
      stack.push({ ...state })
      continue
    }
    if (tok.t === 'close') {
      flushText()
      const closing = state.dest
      if (closing === 'fonttbl-entry' && destText) {
        fonts.set(fontNum, destText.replace(/;\s*$/, '').trim())
        destText = ''
      } else if (closing === 'stylesheet-entry') {
        styleNames.set(styleNum, destText.replace(/;\s*$/, '').trim().toLowerCase())
        destText = ''
      } else if (closing === 'title') {
        title = destText.trim() || null
        destText = ''
      } else if (closing === 'fldinst') {
        const m = fieldInst.match(/HYPERLINK\s+"([^"]*)"/i) ?? fieldInst.match(/HYPERLINK\s+(\S+)/i)
        const f = fieldDepth[fieldDepth.length - 1]
        if (f && m) f.href = m[1]
        fieldInst = ''
      } else if (closing === 'pict' && pict) {
        const mime = pict.type === 'png' ? 'image/png' : pict.type === 'jpeg' ? 'image/jpeg' : null
        const prev = stack[stack.length - 1]
        if (mime && pict.hex && !prev?.dest) {
          const bytes = pict.hex.replace(/[^0-9a-fA-F]/g, '')
          let bin = ''
          for (let x = 0; x + 1 < bytes.length; x += 2) bin += String.fromCharCode(parseInt(bytes.slice(x, x + 2), 16))
          const wPx = Math.round(((pict.wg || pict.w * 15) * (pict.sx / 100)) / 15)
          const hPx = Math.round(((pict.hg || pict.h * 15) * (pict.sy / 100)) / 15)
          const img = `<img src="data:${mime};base64,${btoa(bin)}"${wPx > 0 ? ` width="${wPx}"` : ''}${hPx > 0 ? ` height="${hPx}"` : ''}>`
          html += img
          empty = false
        }
        pict = null
      }
      const fieldTop = fieldDepth[fieldDepth.length - 1]
      if (fieldTop && fieldTop.depth === stack.length) {
        if (fieldTop.started) html += '</a>'
        fieldDepth.pop()
      }
      state = stack.pop() ?? defaultChar()
      continue
    }
    if (tok.t === 'hex') {
      if (skipChars > 0) {
        skipChars--
        continue
      }
      if (state.dest === 'pict') continue
      pending.push(tok.byte)
      continue
    }
    if (tok.t === 'text') {
      let text = tok.text
      if (skipChars > 0) {
        const n = Math.min(skipChars, text.length)
        text = text.slice(n)
        skipChars -= n
      }
      if (state.dest === 'pict' && pict) {
        pict.hex += text
        continue
      }
      if (state.dest === 'colortbl') {
        if (text.includes(';')) {
          for (let x = 0; x < (text.match(/;/g)?.length ?? 0); x++) {
            colors.push(colorSet ? curColor : null)
            curColor = { r: 0, g: 0, b: 0 }
            colorSet = false
          }
        }
        continue
      }
      if (state.dest === 'skip' || state.dest === 'fonttbl' || state.dest === 'stylesheet' || state.dest === 'info') continue
      emitText(text)
      continue
    }
    // Control words.
    const { word, param } = tok
    const p = param ?? 1
    if (word === '*') {
      // Unknown starred destinations are skipped; known ones are handled by their own word.
      const next = tokens[k + 1]
      if (next?.t === 'word' && ['fldinst', 'listtext', 'pntext'].includes(next.word)) continue
      if (next?.t === 'word' && (next.word === 'shppict')) continue
      state.dest = 'skip'
      continue
    }
    if (state.dest === 'skip') continue
    if (state.dest === 'fonttbl' || state.dest === 'fonttbl-entry') {
      if (word === 'f') {
        if (state.dest === 'fonttbl-entry' && destText) fonts.set(fontNum, destText.replace(/;\s*$/, '').trim())
        fontNum = p
        state.dest = 'fonttbl-entry'
        destText = ''
      }
      continue
    }
    if (state.dest === 'colortbl') {
      if (word === 'red') (curColor.r = p), (colorSet = true)
      else if (word === 'green') (curColor.g = p), (colorSet = true)
      else if (word === 'blue') (curColor.b = p), (colorSet = true)
      continue
    }
    if (state.dest === 'stylesheet' || state.dest === 'stylesheet-entry') {
      if (word === 's' || word === 'cs' || word === 'ds' || word === 'ts') {
        styleNum = word === 's' ? p : -1
        state.dest = 'stylesheet-entry'
        destText = ''
      }
      continue
    }
    if (state.dest === 'info') {
      if (word === 'title') {
        state.dest = 'title'
        destText = ''
      } else if (SKIP.has(word) || /^[a-z]+$/.test(word)) state.dest = word === 'title' ? 'title' : 'info'
      continue
    }
    if (state.dest === 'pict' && pict) {
      if (word === 'pngblip') pict.type = 'png'
      else if (word === 'jpegblip') pict.type = 'jpeg'
      else if (word === 'emfblip' || word === 'wmetafile' || word === 'macpict' || word === 'dibitmap' || word === 'wbitmap') pict.type = null
      else if (word === 'picw') pict.w = p
      else if (word === 'pich') pict.h = p
      else if (word === 'picwgoal') pict.wg = p
      else if (word === 'pichgoal') pict.hg = p
      else if (word === 'picscalex') pict.sx = p
      else if (word === 'picscaley') pict.sy = p
      else if (word === 'bin') state.dest = 'skip'
      continue
    }
    switch (word) {
      case 'ansicpg':
        codepage = p
        break
      case 'deff':
        defaultFont = p
        break
      case 'fonttbl':
        state.dest = 'fonttbl'
        break
      case 'colortbl':
        state.dest = 'colortbl'
        break
      case 'stylesheet':
        state.dest = 'stylesheet'
        break
      case 'info':
        state.dest = 'info'
        break
      case 'pict':
        state.dest = 'pict'
        pict = { type: null, hex: '', w: 0, h: 0, wg: 0, hg: 0, sx: 100, sy: 100 }
        break
      case 'listtext':
      case 'pntext':
        state.dest = word
        listText = ''
        break
      case 'fldinst':
        state.dest = 'fldinst'
        fieldInst = ''
        break
      case 'field':
        fieldDepth.push({ depth: stack.length, href: null, started: false })
        break
      case 'fldrslt':
        break
      case 'uc':
        state.uc = p
        break
      case 'u': {
        const code = param! < 0 ? param! + 65536 : param!
        emitText(String.fromCodePoint(code))
        skipChars = state.uc
        break
      }
      case 'par':
        endParagraph()
        break
      case 'sect':
        if (html || !empty) endParagraph()
        break
      case 'page':
        flushText()
        if (!para.intbl) {
          if (!empty) endParagraph()
          if (table) {
            blocks.push(table)
            table = null
          }
          blocks.push({ kind: 'page' })
        }
        break
      case 'line':
        flushText()
        html += '<br>'
        break
      case 'tab':
        emitText('\t')
        break
      case 'emdash':
        emitText('—')
        break
      case 'endash':
        emitText('–')
        break
      case 'bullet':
        emitText('•')
        break
      case 'lquote':
        emitText('‘')
        break
      case 'rquote':
        emitText('’')
        break
      case 'ldblquote':
        emitText('“')
        break
      case 'rdblquote':
        emitText('”')
        break
      case 'emspace':
      case 'enspace':
      case 'qmspace':
        emitText(' ')
        break
      case 'plain': {
        const keep = { uc: state.uc, dest: state.dest }
        state = { ...defaultChar(), ...keep }
        break
      }
      case 'b':
        state.b = p !== 0
        break
      case 'i':
        state.i = p !== 0
        break
      case 'ul':
      case 'uld':
      case 'uldb':
      case 'uldash':
      case 'ulw':
      case 'ulth':
      case 'ulwave':
        state.ul = p !== 0
        break
      case 'ulnone':
        state.ul = false
        break
      case 'strike':
      case 'striked':
        state.strike = p !== 0
        break
      case 'fs':
        state.fs = p
        break
      case 'f':
        state.f = p
        break
      case 'cf':
        state.cf = p
        break
      case 'highlight':
      case 'cb':
      case 'chcbpat':
        state.hl = p
        break
      case 'super':
        state.sup = p !== 0
        state.sub = false
        break
      case 'sub':
        state.sub = p !== 0
        state.sup = false
        break
      case 'nosupersub':
        state.sup = state.sub = false
        break
      case 'caps':
        state.caps = p !== 0
        break
      case 'scaps':
        state.scaps = p !== 0
        break
      case 'v':
        state.v = p !== 0
        break
      case 'pard': {
        const intbl = false
        para = { ...defaultPara(), intbl }
        break
      }
      case 'ql':
        para.align = null
        break
      case 'qc':
        para.align = 'center'
        break
      case 'qr':
        para.align = 'right'
        break
      case 'qj':
      case 'qd':
        para.align = 'justify'
        break
      case 'li':
      case 'lin':
        para.li = p
        break
      case 'ri':
      case 'rin':
        para.ri = p
        break
      case 'fi':
        para.fi = p
        break
      case 'sb':
        para.sb = p
        break
      case 'sa':
        para.sa = p
        break
      case 'sl':
        para.sl = p
        break
      case 'slmult':
        para.slmult = p
        break
      case 's':
        para.style = p
        break
      case 'outlinelevel':
        para.outline = p
        break
      case 'ls':
        para.list = p
        break
      case 'ilvl':
        para.ilvl = p
        break
      case 'pnlvlblt':
        para.list = para.list ?? -1
        break
      case 'pnlvlbody':
        para.list = para.list ?? -2
        break
      case 'keepn':
        para.keepn = true
        break
      case 'pagebb':
        para.pagebb = true
        break
      case 'intbl':
        para.intbl = true
        break
      case 'trowd':
        cellDefs = []
        nextDef = { merge: null, vmerge: null }
        row = []
        break
      case 'clmgf':
        nextDef.merge = 'first'
        break
      case 'clmrg':
        nextDef.merge = 'cont'
        break
      case 'clvmgf':
        nextDef.vmerge = 'first'
        break
      case 'clvmrg':
        nextDef.vmerge = 'cont'
        break
      case 'cellx':
        cellDefs.push(nextDef)
        nextDef = { merge: null, vmerge: null }
        break
      case 'cell':
      case 'nestcell': {
        flushText()
        if (html || !empty) cellHtml += paragraphHtml(paraHtml(), para, styleNames)
        html = ''
        empty = true
        const def = cellDefs[row.length] ?? { merge: null, vmerge: null }
        row.push({ html: cellHtml || '<p></p>', ...def })
        cellHtml = ''
        break
      }
      case 'row':
      case 'nestrow':
        if (!table) table = { kind: 'table', rows: [] }
        table.rows.push({ cells: row })
        row = []
        break
      default:
        if (SKIP.has(word) && word !== 'fldinst') state.dest = 'skip'
    }
  }
  flushText()
  if (html && !empty) endParagraph()
  if (table) blocks.push(table)
  return { html: blocksToHtml(blocks, styleNames), title }
}

function headingLevel(para: ParaState, styles: Map<number, string>): number | null {
  const name = styles.get(para.style) ?? ''
  const m = name.match(/^heading\s*([1-6])$/)
  if (m) return Number(m[1])
  if (para.outline != null && para.outline < 6 && para.style !== 0) return para.outline + 1
  return null
}

function paragraphCss(para: ParaState, inList: boolean) {
  const css: string[] = []
  if (para.align) css.push(`text-align: ${para.align}`)
  if (!inList && para.li > 0) css.push(`margin-left: ${Math.round((para.li / 1440) * 1000) / 1000}in`)
  if (para.ri > 0) css.push(`margin-right: ${Math.round((para.ri / 1440) * 1000) / 1000}in`)
  if (!inList && para.fi) css.push(`text-indent: ${Math.round((para.fi / 1440) * 1000) / 1000}in`)
  if (para.sb != null) css.push(`margin-top: ${para.sb / 20}pt`)
  if (para.sa != null) css.push(`margin-bottom: ${para.sa / 20}pt`)
  const attrs: string[] = []
  if (para.sl && para.slmult) attrs.push(`data-line-height="${Math.round((Math.abs(para.sl) / 240) * 100) / 100}"`)
  else if (para.sl > 0) attrs.push(`data-line-height="atLeast:${para.sl / 20}"`)
  else if (para.sl < 0) attrs.push(`data-line-height="exact:${-para.sl / 20}"`)
  if (para.keepn) attrs.push('data-keep-next="true"')
  if (para.pagebb) attrs.push('data-break-before=""')
  return (css.length ? ` style="${css.join('; ')}"` : '') + (attrs.length ? ` ${attrs.join(' ')}` : '')
}

function paragraphHtml(inner: string, para: ParaState, styles: Map<number, string>, inList = false) {
  const level = headingLevel(para, styles)
  const tag = level ? `h${level}` : 'p'
  return `<${tag}${paragraphCss(para, inList)}>${inner}</${tag}>`
}

function blocksToHtml(blocks: Block[], styles: Map<number, string>): string {
  const out: string[] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    if (b.kind === 'page') {
      out.push('<div data-type="page-break"></div>')
      i++
      continue
    }
    if (b.kind === 'table') {
      out.push(tableHtml(b))
      i++
      continue
    }
    if (b.para.list == null && !b.listText) {
      out.push(paragraphHtml(b.html, b.para, styles))
      i++
      continue
    }
    // A run of list paragraphs: nested lists by level.
    const items: { level: number; ordered: boolean; html: string; start: number | null }[] = []
    while (i < blocks.length) {
      const c = blocks[i]
      if (c.kind !== 'p' || (c.para.list == null && !c.listText)) break
      const marker = c.listText.replace(/\t/g, '').trim()
      const ordered = c.para.list === -2 || /^\(?(\d+[.)]?|[a-zA-Z]{1,4}[.)])$/.test(marker)
      const num = marker.match(/^(\d+)/)
      items.push({ level: Math.max(0, Math.min(8, c.para.ilvl)), ordered, html: paragraphHtml(c.html, c.para, styles, true), start: num ? Number(num[1]) : null })
      i++
    }
    out.push(listHtml(items))
  }
  return out.join('')
}

function listHtml(items: { level: number; ordered: boolean; html: string; start: number | null }[]): string {
  let html = ''
  const open: { ordered: boolean }[] = []
  for (const item of items) {
    while (open.length > item.level + 1) html += `</li></${open.pop()!.ordered ? 'ol' : 'ul'}>`
    if (open.length === item.level + 1 && open[open.length - 1].ordered !== item.ordered) html += `</li></${open.pop()!.ordered ? 'ol' : 'ul'}>`
    if (open.length === item.level + 1) html += '</li>'
    while (open.length < item.level + 1) {
      const tag = item.ordered ? 'ol' : 'ul'
      html += `<${tag}${item.ordered && item.start && item.start !== 1 && open.length === item.level ? ` start="${item.start}"` : ''}>`
      open.push({ ordered: item.ordered })
      if (open.length < item.level + 1) html += '<li><p></p>'
    }
    html += `<li>${item.html}`
  }
  while (open.length) html += `</li></${open.pop()!.ordered ? 'ol' : 'ul'}>`
  return html
}

function tableHtml(t: Extract<Block, { kind: 'table' }>): string {
  // Vertical merges become rowspans: count the continuation cells below each first cell.
  const rows = t.rows.map((r) => r.cells.filter((c) => c.merge !== 'cont'))
  const spans = rows.map((r, ri) =>
    r.map((c, ci) => {
      if (c.vmerge !== 'first') return 1
      let n = 1
      while (rows[ri + n]?.[ci]?.vmerge === 'cont') n++
      return n
    }),
  )
  return `<table>${t.rows
    .map((r, ri) => {
      const cells: string[] = []
      let ci = 0
      for (let x = 0; x < r.cells.length; x++) {
        const c = r.cells[x]
        if (c.merge === 'cont') continue
        let colspan = 1
        while (r.cells[x + colspan]?.merge === 'cont') colspan++
        if (c.vmerge !== 'cont') cells.push(`<td${colspan > 1 ? ` colspan="${colspan}"` : ''}${spans[ri][ci] > 1 ? ` rowspan="${spans[ri][ci]}"` : ''}>${c.html}</td>`)
        ci++
      }
      return `<tr>${cells.join('')}</tr>`
    })
    .join('')}</table>`
}

// ---- Writing ----

type Tables = { fonts: string[]; colors: string[] }

function rtfText(s: string) {
  return Array.from(s)
    .map((ch) => {
      const code = ch.codePointAt(0)!
      if (ch === '\\' || ch === '{' || ch === '}') return `\\${ch}`
      if (ch === '\t') return '\\tab '
      if (ch === '\u00a0') return '\\~'
      if (code > 0xffff) {
        // Characters outside the BMP: written as a UTF-16 surrogate pair.
        const hi = Math.floor((code - 0x10000) / 0x400) + 0xd800
        const lo = ((code - 0x10000) % 0x400) + 0xdc00
        return `\\u${hi - 65536}?\\u${lo - 65536}?`
      }
      if (code > 127) return `\\u${code > 32767 ? code - 65536 : code}?`
      return ch
    })
    .join('')
}

const markOf = (n: JSONContent, type: string) => n.marks?.find((m) => m.type === type)

function colorIndex(tables: Tables, color: unknown): number {
  if (typeof color !== 'string') return 0
  let hex = color.trim()
  const rgb = hex.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
  if (rgb) hex = `#${rgb.slice(1).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = `#${hex.slice(1).split('').map((c) => c + c).join('')}`
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0
  hex = hex.toUpperCase()
  let i = tables.colors.indexOf(hex)
  if (i < 0) i = tables.colors.push(hex) - 1
  return i + 1
}

function fontIndex(tables: Tables, family: unknown): number | null {
  if (typeof family !== 'string' || !family) return null
  const name = family.split(',')[0].trim().replace(/^["']|["']$/g, '')
  if (!name) return null
  let i = tables.fonts.indexOf(name)
  if (i < 0) i = tables.fonts.push(name) - 1
  return i
}

function rtfRuns(nodes: JSONContent[] = [], tables: Tables): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '\\line '
      if (n.type === 'image' && typeof n.attrs?.src === 'string') return rtfPicture(n.attrs.src, n.attrs.width, n.attrs.height)
      if (n.type !== 'text' || n.marks?.some((m) => m.type === 'deletion')) return ''
      const style = markOf(n, 'textStyle')?.attrs ?? {}
      const codes: string[] = []
      if (markOf(n, 'bold')) codes.push('\\b')
      if (markOf(n, 'italic')) codes.push('\\i')
      if (markOf(n, 'underline')) codes.push('\\ul')
      if (markOf(n, 'strike')) codes.push('\\strike')
      if (markOf(n, 'superscript')) codes.push('\\super')
      if (markOf(n, 'subscript')) codes.push('\\sub')
      const f = fontIndex(tables, style.fontFamily)
      if (f != null) codes.push(`\\f${f}`)
      const size = parseFloat(String(style.fontSize ?? ''))
      if (size > 0) codes.push(`\\fs${Math.round((String(style.fontSize).endsWith('px') ? size * 0.75 : size) * 2)}`)
      const cf = colorIndex(tables, style.color)
      if (cf) codes.push(`\\cf${cf}`)
      const hl = markOf(n, 'highlight')
      if (hl) codes.push(`\\highlight${colorIndex(tables, hl.attrs?.color ?? '#FFFF00')}`)
      const text = rtfText(n.text ?? '')
      const run = codes.length ? `{${codes.join('')} ${text}}` : text
      const link = markOf(n, 'link')
      return link ? `{\\field{\\*\\fldinst HYPERLINK "${String(link.attrs?.href ?? '').replace(/["\\{}]/g, '')}"}{\\fldrslt ${run}}}` : run
    })
    .join('')
}

function rtfPicture(src: string, width: unknown, height: unknown): string {
  const m = src.match(/^data:image\/(png|jpe?g);base64,(.*)$/)
  if (!m) return ''
  let bin: string
  try {
    bin = atob(m[2])
  } catch {
    return ''
  }
  let hex = ''
  for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0')
  const w = Number(width) || 0
  const h = Number(height) || 0
  const size = `${w ? `\\picwgoal${Math.round(w * 15)}` : ''}${h ? `\\pichgoal${Math.round(h * 15)}` : ''}`
  return `{\\pict${m[1] === 'png' ? '\\pngblip' : '\\jpegblip'}${size}\n${hex.replace(/(.{128})/g, '$1\n')}}`
}

function paraCodes(n: JSONContent): string {
  const a = n.attrs ?? {}
  const parts: string[] = []
  parts.push({ center: '\\qc', right: '\\qr', justify: '\\qj' }[a.textAlign as string] ?? '\\ql')
  const tw = (inches: unknown) => Math.round((Number(inches) || 0) * 1440)
  if (a.indentLeft) parts.push(`\\li${tw(a.indentLeft)}`)
  if (a.indentRight) parts.push(`\\ri${tw(a.indentRight)}`)
  if (a.indentFirstLine) parts.push(`\\fi${tw(a.indentFirstLine)}`)
  if (a.spaceBefore != null) parts.push(`\\sb${Math.round(a.spaceBefore * 20)}`)
  if (a.spaceAfter != null) parts.push(`\\sa${Math.round(a.spaceAfter * 20)}`)
  const lh = a.lineHeight as string | null
  if (lh) {
    if (lh.startsWith('exact:')) parts.push(`\\sl-${Math.round(parseFloat(lh.slice(6)) * 20)}\\slmult0`)
    else if (lh.startsWith('atLeast:')) parts.push(`\\sl${Math.round(parseFloat(lh.slice(8)) * 20)}\\slmult0`)
    else if (parseFloat(lh)) parts.push(`\\sl${Math.round(parseFloat(lh) * 240)}\\slmult1`)
  }
  if (a.keepNext) parts.push('\\keepn')
  if (a.pageBreakBefore) parts.push('\\pagebb')
  return parts.join('')
}

const HEADING_SIZES = [32, 26, 24, 22, 22, 22]

function rtfParagraph(n: JSONContent, tables: Tables, extra = '', prefix = ''): string {
  if (n.type === 'heading') {
    const level = Math.min(6, Math.max(1, n.attrs?.level ?? 1))
    return `\\pard\\plain\\s${level}\\outlinelevel${level - 1}${paraCodes(n)}${extra}\\b\\fs${HEADING_SIZES[level - 1]} ${prefix}${rtfRuns(n.content, tables)}\\par\n`
  }
  const defaults = n.attrs?.spaceAfter == null ? '\\sa160' : ''
  return `\\pard\\plain${defaults}${paraCodes(n)}${extra}\\fs22 ${prefix}${rtfRuns(n.content, tables)}\\par\n`
}

function rtfList(n: JSONContent, tables: Tables, level: number): string {
  const ordered = n.type === 'orderedList'
  const start = ordered ? Number(n.attrs?.start ?? 1) : 1
  return (n.content ?? [])
    .map((item, i) => {
      let first = true
      return (item.content ?? [])
        .map((child) => {
          if (child.type === 'bulletList' || child.type === 'orderedList') return rtfList(child, tables, Math.min(8, level + 1))
          if (child.type !== 'paragraph' && child.type !== 'heading') return rtfBlocks([child], tables)
          const indent = 720 * (level + 1)
          const marker = ordered ? `${start + i}.` : '\\u8226?'
          const prefix = first ? `{\\listtext ${marker}\\tab}` : ''
          const extra = `\\li${indent}\\fi-360${first ? `\\ls${ordered ? 2 : 1}\\ilvl${level}` : ''}`
          const out = rtfParagraph({ ...child, attrs: { ...child.attrs, indentLeft: 0, indentFirstLine: 0 } }, tables, extra, prefix)
          first = false
          return out
        })
        .join('')
    })
    .join('')
}

function rtfTable(n: JSONContent, tables: Tables): string {
  const rows = n.content ?? []
  const cols = Math.max(1, ...rows.map((r) => (r.content ?? []).reduce((s, c) => s + (Number(c.attrs?.colspan) || 1), 0)))
  const width = 9360
  const pending = new Map<number, number>() // column -> remaining vertical merge rows
  return (
    rows
      .map((r) => {
        let col = 0
        const defs: string[] = []
        const cells: string[] = []
        const borders = '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10'
        const cellAt = (c: number) => Math.round(((c + 1) * width) / cols)
        const fillMerged = () => {
          while ((pending.get(col) ?? 0) > 0) {
            pending.set(col, pending.get(col)! - 1)
            defs.push(`\\clvmrg${borders}\\cellx${cellAt(col)}`)
            cells.push('\\pard\\intbl\\cell')
            col++
          }
        }
        for (const c of r.content ?? []) {
          fillMerged()
          const span = Number(c.attrs?.colspan) || 1
          const rowspan = Number(c.attrs?.rowspan) || 1
          if (rowspan > 1) pending.set(col, rowspan - 1)
          const shade = colorIndex(tables, c.attrs?.background)
          for (let s = 0; s < span; s++) {
            const merge = span > 1 ? (s === 0 ? '\\clmgf' : '\\clmrg') : ''
            defs.push(`${merge}${rowspan > 1 && s === 0 ? '\\clvmgf' : ''}${borders}${shade ? `\\clcbpat${shade}` : ''}\\cellx${cellAt(col)}`)
            const paras = (c.content ?? []).filter((p) => p.type === 'paragraph' || p.type === 'heading')
            const body = s === 0 ? paras.map((p, pi) => `\\pard\\intbl${paraCodes(p)}\\fs22 ${rtfRuns(p.content, tables)}${pi < paras.length - 1 ? '\\par ' : ''}`).join('') : '\\pard\\intbl'
            cells.push(`${body || '\\pard\\intbl'}\\cell`)
            col++
          }
        }
        fillMerged()
        return `\\trowd\\trgaph108${defs.join('')}\n${cells.join('\n')}\n\\row\n`
      })
      .join('') + '\\pard\n'
  )
}

function rtfBlocks(nodes: JSONContent[] = [], tables: Tables): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'heading':
        case 'paragraph':
          return rtfParagraph(n, tables)
        case 'bulletList':
        case 'orderedList':
          return rtfList(n, tables, 0)
        case 'pageBreak':
          return '\\page\n'
        case 'table':
          return rtfTable(n, tables)
        case 'blockquote':
        case 'columns':
        case 'column':
        case 'textBox':
          return rtfBlocks(n.content, tables)
        case 'horizontalRule':
          return '\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n'
        default:
          return n.content ? rtfBlocks(n.content, tables) : ''
      }
    })
    .join('')
}

const LIST_TABLE =
  '{\\*\\listtable' +
  `{\\list\\listtemplateid1${Array.from({ length: 9 }, (_, l) => `{\\listlevel\\levelnfc23\\leveljc0\\levelfollow0\\levelstartat1{\\leveltext\\'01\\u${[8226, 9702, 9642][l % 3]} ?;}{\\levelnumbers;}\\fi-360\\li${720 * (l + 1)}}`).join('')}\\listid1}` +
  `{\\list\\listtemplateid2${Array.from({ length: 9 }, (_, l) => `{\\listlevel\\levelnfc${[0, 4, 2][l % 3]}\\leveljc0\\levelfollow0\\levelstartat1{\\leveltext\\'02\\'0${l}.;}{\\levelnumbers\\'01;}\\fi-360\\li${720 * (l + 1)}}`).join('')}\\listid2}}` +
  '{\\*\\listoverridetable{\\listoverride\\listid1\\listoverridecount0\\ls1}{\\listoverride\\listid2\\listoverridecount0\\ls2}}'

export function exportRtf(doc: JSONContent, title?: string) {
  const tables: Tables = { fonts: ['Calibri'], colors: [] }
  const body = rtfBlocks(doc.content, tables)
  const fonttbl = `{\\fonttbl${tables.fonts.map((f, i) => `{\\f${i}\\fnil ${rtfText(f)};}`).join('')}}`
  const colortbl = `{\\colortbl;${tables.colors.map((c) => `\\red${parseInt(c.slice(1, 3), 16)}\\green${parseInt(c.slice(3, 5), 16)}\\blue${parseInt(c.slice(5, 7), 16)};`).join('')}}`
  const stylesheet = `{\\stylesheet{\\s0 Normal;}${HEADING_SIZES.map((size, i) => `{\\s${i + 1}\\outlinelevel${i}\\b\\fs${size} heading ${i + 1};}`).join('')}}`
  const info = title ? `{\\info{\\title ${rtfText(title)}}}` : ''
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1${fonttbl}\n${colortbl}\n${stylesheet}\n${LIST_TABLE}\n${info}\\viewkind4\n${body}}`
}

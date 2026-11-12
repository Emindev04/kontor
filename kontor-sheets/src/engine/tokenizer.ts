import { MAX_ROWS, colIndex } from '../model/address'
import { ERROR_CODES, type ErrorCode } from '../model/types'

export type TokType =
  | 'num' | 'str' | 'bool' | 'err' | 'ref' | 'func' | 'name' | 'op'
  | 'lparen' | 'rparen' | 'comma' | 'semi' | 'lbrace' | 'rbrace' | 'ws' | 'spill' | 'at' | 'struct' | 'unknown'

/** One end of a reference. `col`/`row` are undefined for whole-row/whole-column parts. */
export type RefEnd = { col?: number; row?: number; absC: boolean; absR: boolean }
/** `sheet2` is the last sheet of a 3-D reference (Sheet1:Sheet3!A1). */
export type RefParts = { sheet?: string; sheet2?: string; a: RefEnd; b?: RefEnd; kind: 'cell' | 'range' | 'cols' | 'rows' }

export interface Token {
  type: TokType
  text: string
  start: number
  end: number
  num?: number
  str?: string
  bool?: boolean
  err?: ErrorCode
  ref?: RefParts
  /** Function or name identifier (upper case, without _xlfn. prefixes). */
  id?: string
  /** Sheet qualifier of a name ("Sheet1!MyName"). */
  sheet?: string
  /** Structured reference: table name (empty for "[@Col]" inside a table) and the bracket part. */
  table?: string
  spec?: string
}

/** Reads a balanced "[...]" group starting at `i`; returns the end index (exclusive) or -1. */
function bracketEnd(src: string, i: number): number {
  let depth = 0
  for (let j = i; j < src.length; j++) {
    const ch = src[j]
    if (ch === "'" && j + 1 < src.length) {
      j++
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return j + 1
    }
  }
  return -1
}

const SHEET_UNQUOTED = /^[A-Za-z_À-￿][A-Za-z0-9_.À-￿]*(?::[A-Za-z_À-￿][A-Za-z0-9_.À-￿]*)?!/
const CELL = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?/
const COLS = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/
const ROWS = /^(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![\d.])/
const IDENT = /^[A-Za-z_\\À-￿][A-Za-z0-9_.?\\À-￿]*/

/** Splits "First:Last" (sheet names cannot contain ":", so a colon always means a 3-D reference). */
function sheetSpan(name: string, end: number): { sheet: string; sheet2?: string; end: number } {
  const k = name.indexOf(':')
  return k > 0 ? { sheet: name.slice(0, k), sheet2: name.slice(k + 1), end } : { sheet: name, end }
}

function sheetPrefix(src: string, i: number): { sheet: string; sheet2?: string; end: number } | null {
  if (src[i] === "'") {
    let j = i + 1
    let name = ''
    while (j < src.length) {
      if (src[j] === "'") {
        if (src[j + 1] === "'") {
          name += "'"
          j += 2
          continue
        }
        break
      }
      name += src[j++]
    }
    if (src[j] === "'" && src[j + 1] === '!') return sheetSpan(name, j + 2)
    return null
  }
  const m = SHEET_UNQUOTED.exec(src.slice(i))
  return m ? sheetSpan(m[0].slice(0, -1), i + m[0].length) : null
}

const validRow = (s: string) => {
  const n = Number(s)
  return n >= 1 && n <= MAX_ROWS
}

/** Matches a reference (optionally sheet-qualified) at `i`. */
export function matchRef(src: string, i: number): { parts: RefParts; end: number } | null {
  let j = i
  let sheet: string | undefined
  let sheet2: string | undefined
  const sp = sheetPrefix(src, i)
  if (sp) {
    sheet = sp.sheet
    sheet2 = sp.sheet2
    j = sp.end
  }
  const rest = src.slice(j)
  let m = COLS.exec(rest)
  if (m) {
    const c1 = colIndex(m[2])
    const c2 = colIndex(m[4])
    if (c1 >= 0 && c2 >= 0) {
      return { parts: { sheet, sheet2, kind: 'cols', a: { col: c1, absC: !!m[1], absR: false }, b: { col: c2, absC: !!m[3], absR: false } }, end: j + m[0].length }
    }
  }
  m = ROWS.exec(rest)
  if (m && validRow(m[2]) && validRow(m[4])) {
    return { parts: { sheet, sheet2, kind: 'rows', a: { row: Number(m[2]) - 1, absR: !!m[1], absC: false }, b: { row: Number(m[4]) - 1, absR: !!m[3], absC: false } }, end: j + m[0].length }
  }
  m = CELL.exec(rest)
  if (m) {
    const next = rest[m[0].length] ?? ''
    if (/[A-Za-z0-9_.(![]/.test(next)) return null
    const c1 = colIndex(m[2])
    if (c1 < 0 || !validRow(m[4])) return null
    const a: RefEnd = { col: c1, row: Number(m[4]) - 1, absC: !!m[1], absR: !!m[3] }
    if (m[5] !== undefined && m[6]) {
      const c2 = colIndex(m[6])
      if (c2 < 0 || !validRow(m[8])) return null
      return { parts: { sheet, sheet2, kind: 'range', a, b: { col: c2, row: Number(m[8]) - 1, absC: !!m[5], absR: !!m[7] } }, end: j + m[0].length }
    }
    return { parts: { sheet, sheet2, kind: 'cell', a }, end: j + m[0].length }
  }
  return null
}

function stripPrefix(id: string) {
  return id.replace(/^(_xlfn\.|_xlws\.|_xludf\.)+/i, '').replace(/^_xlfn\._xlws\./i, '').toUpperCase()
}

export function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  const push = (type: TokType, start: number, end: number, extra: Partial<Token> = {}) => out.push({ type, text: src.slice(start, end), start, end, ...extra })
  const lastSig = () => {
    for (let k = out.length - 1; k >= 0; k--) if (out[k].type !== 'ws') return out[k]
    return undefined
  }
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      let j = i
      while (j < src.length && /\s/.test(src[j])) j++
      push('ws', i, j)
      i = j
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let s = ''
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"'
            j += 2
            continue
          }
          break
        }
        s += src[j++]
      }
      push('str', i, Math.min(j + 1, src.length), { str: s })
      i = j + 1
      continue
    }
    if (ch === '#') {
      const code = ERROR_CODES.find((e) => src.slice(i, i + e.length).toUpperCase() === e)
      if (code) {
        push('err', i, i + code.length, { err: code })
        i += code.length
        continue
      }
      const prev = lastSig()
      if (prev && (prev.type === 'ref' || prev.type === 'rparen' || prev.type === 'name')) {
        push('spill', i, i + 1)
        i++
        continue
      }
      push('unknown', i, i + 1)
      i++
      continue
    }
    if (ch === "'" || ch === '$' || /[A-Za-z_À-￿]/.test(ch) || /\d/.test(ch)) {
      const r = matchRef(src, i)
      if (r && !(src[r.end] === '(')) {
        push('ref', i, r.end, { ref: r.parts })
        i = r.end
        continue
      }
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i))!
      push('num', i, i + m[0].length, { num: Number(m[0]) })
      i += m[0].length
      continue
    }
    if (/[A-Za-z_\\À-￿]/.test(ch)) {
      const m = IDENT.exec(src.slice(i))!
      const end = i + m[0].length
      const word = m[0]
      if (src[end] === '[') {
        const close = bracketEnd(src, end)
        if (close > 0) {
          push('struct', i, close, { table: word, spec: src.slice(end, close) })
          i = close
          continue
        }
      }
      if (src[end] === '(') {
        push('func', i, end, { id: stripPrefix(word) })
        i = end
        continue
      }
      if (src[end] === '!') {
        // sheet-qualified name
        const n = IDENT.exec(src.slice(end + 1))
        if (n) {
          push('name', i, end + 1 + n[0].length, { id: n[0].toUpperCase(), sheet: word })
          i = end + 1 + n[0].length
          continue
        }
      }
      const up = word.toUpperCase()
      if (up === 'TRUE' || up === 'FALSE') push('bool', i, end, { bool: up === 'TRUE' })
      else push('name', i, end, { id: up })
      i = end
      continue
    }
    if (ch === '[') {
      const close = bracketEnd(src, i)
      if (close > 0) {
        push('struct', i, close, { table: '', spec: src.slice(i, close) })
        i = close
        continue
      }
    }
    const two = src.slice(i, i + 2)
    if (two === '<>' || two === '<=' || two === '>=') {
      push('op', i, i + 2)
      i += 2
      continue
    }
    if ('+-*/^&=<>%:'.includes(ch)) {
      push('op', i, i + 1)
      i++
      continue
    }
    const single: Record<string, TokType> = { '(': 'lparen', ')': 'rparen', ',': 'comma', ';': 'semi', '{': 'lbrace', '}': 'rbrace', '@': 'at' }
    push(single[ch] ?? 'unknown', i, i + 1)
    i++
  }
  return out
}

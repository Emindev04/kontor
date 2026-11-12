// R1C1 reference style (File > Options > Formulas): formulas are stored in A1 style and converted
// for display and entry. "R[-1]C" is the cell one row up, "R2C3" is $C$2, "RC[1]" one column right.
import { MAX_COLS, MAX_ROWS, colName, quoteSheet } from '../model/address'
import { tokenize, type RefEnd, type RefParts } from './tokenizer'

function rowPart(e: RefEnd, r: number): string {
  if (e.row === undefined) return ''
  if (e.absR) return `R${e.row + 1}`
  return e.row === r ? 'R' : `R[${e.row - r}]`
}

function colPart(e: RefEnd, c: number): string {
  if (e.col === undefined) return ''
  if (e.absC) return `C${e.col + 1}`
  return e.col === c ? 'C' : `C[${e.col - c}]`
}

function sheetText(p: RefParts): string {
  if (p.sheet === undefined) return ''
  return (p.sheet2 !== undefined ? quoteSheet(`${p.sheet}:${p.sheet2}`) : quoteSheet(p.sheet)) + '!'
}

/** One reference in R1C1 style, relative to the formula's cell (r, c). */
export function refToR1C1(p: RefParts, r: number, c: number): string {
  const end = (e: RefEnd) => rowPart(e, r) + colPart(e, c)
  const sheet = sheetText(p)
  if (p.kind === 'cell') return sheet + end(p.a)
  if (p.kind === 'cols') return `${sheet}${colPart(p.a, c)}:${colPart(p.b!, c)}`
  if (p.kind === 'rows') return `${sheet}${rowPart(p.a, r)}:${rowPart(p.b!, r)}`
  return `${sheet}${end(p.a)}:${end(p.b!)}`
}

/** Converts a formula body (without "=") from A1 to R1C1 style. */
export function toR1C1(formula: string, r: number, c: number): string {
  let out = ''
  for (const t of tokenize(formula)) out += t.type === 'ref' ? refToR1C1(t.ref!, r, c) : t.text
  return out
}

const R1C1 = /^R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?:\:R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?)?(?![A-Za-z0-9_.(])/i
const ROWS_ONLY = /^R(\[-?\d+\]|\d+)?:R(\[-?\d+\]|\d+)?(?![A-Za-z0-9_.(])/i
const COLS_ONLY = /^C(\[-?\d+\]|\d+)?:C(\[-?\d+\]|\d+)?(?![A-Za-z0-9_.(])/i

/** "[−2]" relative / "5" absolute / missing = same row or column. */
function part(text: string | undefined, base: number, max: number): { i: number; abs: boolean } | null {
  if (text === undefined) return { i: base, abs: false }
  const rel = text.startsWith('[')
  const n = Number(rel ? text.slice(1, -1) : text)
  const i = rel ? base + n : n - 1
  if (!Number.isInteger(i) || i < 0 || i >= max) return null
  return { i, abs: !rel }
}

const a1Col = (p: { i: number; abs: boolean }) => (p.abs ? '$' : '') + colName(p.i)
const a1Row = (p: { i: number; abs: boolean }) => (p.abs ? '$' : '') + (p.i + 1)

/** Converts a formula body typed in R1C1 style to A1 style. A1 references already in it stay. */
export function fromR1C1(formula: string, r: number, c: number): string {
  let out = ''
  let i = 0
  const prevOk = () => i === 0 || !/[A-Za-z0-9_.\]]/.test(formula[i - 1]) || formula[i - 1] === '!'
  while (i < formula.length) {
    const ch = formula[i]
    if (ch === '"') {
      const j = formula.indexOf('"', i + 1)
      let end = j < 0 ? formula.length : j + 1
      while (formula[end] === '"') {
        const k = formula.indexOf('"', end + 1)
        end = k < 0 ? formula.length : k + 1
      }
      out += formula.slice(i, end)
      i = end
      continue
    }
    if (ch === "'") {
      let j = i + 1
      while (j < formula.length && !(formula[j] === "'" && formula[j + 1] !== "'")) j += formula[j] === "'" ? 2 : 1
      out += formula.slice(i, j + 1)
      i = j + 1
      continue
    }
    if ((ch === 'R' || ch === 'r' || ch === 'C' || ch === 'c') && prevOk()) {
      const rest = formula.slice(i)
      let m = R1C1.exec(rest)
      if (m && (m[1] !== undefined || m[2] !== undefined || /^RC(?![A-Za-z0-9_.(])/i.test(rest) || m[0].includes(':'))) {
        const ra = part(m[1], r, MAX_ROWS)
        const ca = part(m[2], c, MAX_COLS)
        if (ra && ca) {
          let text = a1Col(ca) + a1Row(ra)
          if (m[0].includes(':')) {
            const rb = part(m[3], r, MAX_ROWS)
            const cb = part(m[4], c, MAX_COLS)
            if (!rb || !cb) {
              out += m[0]
              i += m[0].length
              continue
            }
            text += ':' + a1Col(cb) + a1Row(rb)
          }
          out += text
          i += m[0].length
          continue
        }
      }
      m = ROWS_ONLY.exec(rest)
      if (m) {
        const a = part(m[1], r, MAX_ROWS)
        const b = part(m[2], r, MAX_ROWS)
        if (a && b) {
          out += `${a1Row(a)}:${a1Row(b)}`
          i += m[0].length
          continue
        }
      }
      m = COLS_ONLY.exec(rest)
      if (m) {
        const a = part(m[1], c, MAX_COLS)
        const b = part(m[2], c, MAX_COLS)
        if (a && b) {
          out += `${a1Col(a)}:${a1Col(b)}`
          i += m[0].length
          continue
        }
      }
    }
    out += ch
    i++
  }
  return out
}

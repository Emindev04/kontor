// Flash Fill (Ctrl+E): learns a text pattern from typed examples and fills the rest of the column.
// A pattern is a sequence of pieces: words taken from source columns (by position from the start
// or the end, with a case change or only the first letters) and literal text in between.
import type { Doc } from './doc'

type Piece =
  | { kind: 'lit'; text: string }
  | { kind: 'word'; col: number; index: number; fromEnd: boolean; casing: 'same' | 'upper' | 'lower' | 'proper'; chars?: number }

export type Pattern = Piece[]

const WORD = /[A-Za-z0-9À-ɏ]+/g

export function words(s: string): string[] {
  return s.match(WORD) ?? []
}

function cased(w: string, c: Extract<Piece, { kind: 'word' }>['casing']) {
  if (c === 'upper') return w.toUpperCase()
  if (c === 'lower') return w.toLowerCase()
  if (c === 'proper') return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  return w
}

function casingOf(src: string, out: string): Extract<Piece, { kind: 'word' }>['casing'] | null {
  if (out === src) return 'same'
  if (out === src.toUpperCase()) return 'upper'
  if (out === src.toLowerCase()) return 'lower'
  if (out === src.charAt(0).toUpperCase() + src.slice(1).toLowerCase()) return 'proper'
  return null
}

export function apply(p: Pattern, sources: string[]): string | null {
  let out = ''
  for (const piece of p) {
    if (piece.kind === 'lit') {
      out += piece.text
      continue
    }
    const ws = words(sources[piece.col] ?? '')
    const w = piece.fromEnd ? ws[ws.length - 1 - piece.index] : ws[piece.index]
    if (w === undefined) return null
    out += cased(piece.chars ? w.slice(0, piece.chars) : w, piece.casing)
  }
  return out
}

/** All patterns that turn `sources` into `output` (up to a limit). */
function candidates(sources: string[], output: string): Pattern[] {
  const results: Pattern[] = []
  const lists = sources.map(words)
  const walk = (pos: number, acc: Pattern) => {
    if (results.length > 400) return
    if (pos >= output.length) {
      results.push(acc)
      return
    }
    let matched = false
    lists.forEach((ws, col) => {
      ws.forEach((w, i) => {
        // whole word
        const seg = output.slice(pos, pos + w.length)
        const casing = seg.length === w.length ? casingOf(w, seg) : null
        if (casing) {
          matched = true
          for (const fromEnd of [false, true]) walk(pos + w.length, [...acc, { kind: 'word', col, index: fromEnd ? ws.length - 1 - i : i, fromEnd, casing }])
        }
        // first letter(s): initials
        const ch = output[pos]
        if (ch && w[0] && ch.toLowerCase() === w[0].toLowerCase() && !(seg.length === w.length && casing)) {
          const next = output[pos + 1]
          if (!next || !/[A-Za-z0-9]/.test(next) || next.toLowerCase() !== (w[1] ?? '').toLowerCase()) {
            for (const fromEnd of [false, true]) walk(pos + 1, [...acc, { kind: 'word', col, index: fromEnd ? ws.length - 1 - i : i, fromEnd, casing: ch === ch.toUpperCase() ? 'upper' : 'lower', chars: 1 }])
          }
        }
      })
    })
    if (!matched || /[^A-Za-z0-9]/.test(output[pos])) {
      const last = acc[acc.length - 1]
      if (last?.kind === 'lit') walk(pos + 1, [...acc.slice(0, -1), { kind: 'lit', text: last.text + output[pos] }])
      else walk(pos + 1, [...acc, { kind: 'lit', text: output[pos] }])
    }
  }
  walk(0, [])
  // prefer short patterns with few literals
  return results.sort((a, b) => a.length - b.length || litLen(a) - litLen(b))
}

const litLen = (p: Pattern) => p.reduce((n, x) => n + (x.kind === 'lit' ? x.text.length : 0), 0)

/** Learns a pattern from examples [sources, output]; null when no pattern fits all of them. */
export function learn(examples: { sources: string[]; output: string }[]): Pattern | null {
  if (!examples.length) return null
  const first = candidates(examples[0].sources, examples[0].output)
  for (const p of first) if (examples.every((e) => apply(p, e.sources) === e.output)) return p
  return null
}

/** Ctrl+E: fills the active column below the typed examples. Returns the number of filled cells or an error. */
export function flashFill(doc: Doc): number | string {
  const sheet = doc.sheet
  const { r, c } = doc.sel.active
  if (c === 0) return 'Flash Fill needs data in the columns to the left of the active cell.'
  // source columns: the contiguous block of filled columns to the left
  let c0 = c - 1
  while (c0 > 0 && sheet.hasValue(r, c0 - 1)) c0--
  if (!sheet.hasValue(r, c - 1) && !sheet.hasValue(Math.max(0, r - 1), c - 1)) return 'Flash Fill couldn’t find data next to the active cell.'
  const cols: number[] = []
  for (let x = c0; x < c; x++) cols.push(x)
  const text = (rr: number, cc: number) => {
    const v = doc.value(rr, cc)
    return v === null ? '' : typeof v === 'object' ? v.code : String(v)
  }
  // find the data block rows
  let top = r
  while (top > 0 && cols.some((cc) => sheet.hasValue(top - 1, cc))) top--
  let bottom = r
  while (cols.some((cc) => sheet.hasValue(bottom + 1, cc))) bottom++
  // examples: rows with a value in the target column (skip a header row whose sources look like headers)
  const examples: { sources: string[]; output: string; row: number }[] = []
  for (let rr = top; rr <= bottom; rr++) {
    const out = text(rr, c)
    if (out === '') continue
    examples.push({ sources: cols.map((cc) => text(rr, cc)), output: out, row: rr })
  }
  let usable = examples
  let pattern = learn(usable)
  if (!pattern && usable.length > 1) {
    usable = examples.slice(1)
    pattern = learn(usable)
  }
  if (!pattern) return 'Flash Fill didn’t recognize a pattern. Type a few more examples and try again.'
  const start = usable[0].row
  const writes: { row: number; v: string }[] = []
  for (let rr = start; rr <= bottom; rr++) {
    if (sheet.hasValue(rr, c)) continue
    const v = apply(pattern, cols.map((cc) => text(rr, cc)))
    if (v !== null && v !== '') writes.push({ row: rr, v })
  }
  if (!writes.length) return 'Flash Fill didn’t find any cells to fill.'
  doc.transact('Flash Fill', () => {
    for (const w of writes) {
      const old = sheet.get(w.row, c)
      doc.write(sheet, w.row, c, { ...(old?.s ? { s: old.s } : {}), v: w.v })
    }
  })
  return writes.length
}

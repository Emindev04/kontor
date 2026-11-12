// Formula text as stored inside .xlsx files. Newer functions carry "_xlfn." prefixes, LET/LAMBDA
// parameters "_xlpm.", the spill operator A1# becomes _xlfn.ANCHORARRAY(A1) and the implicit
// intersection operator @ becomes _xlfn.SINGLE(...).
import { tokenize, type Token } from '../engine/tokenizer'
import { FUNCTIONS } from '../engine/registry'

/** Functions added after the 2007 file format; they need the _xlfn. prefix inside files. */
const MODERN = new Set([
  'CONCAT', 'TEXTJOIN', 'IFS', 'SWITCH', 'MAXIFS', 'MINIFS', 'XLOOKUP', 'XMATCH', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'RANDARRAY', 'LET', 'LAMBDA', 'IFNA', 'XOR',
  'DAYS', 'ISOWEEKNUM', 'SHEET', 'SHEETS', 'FORMULATEXT', 'ISFORMULA', 'NUMBERVALUE', 'UNICHAR', 'UNICODE', 'GAMMA', 'GAUSS', 'PHI', 'PERMUTATIONA', 'COMBINA',
  'ARABIC', 'BASE', 'DECIMAL', 'ACOT', 'ACOTH', 'COT', 'COTH', 'CSC', 'CSCH', 'SEC', 'SECH', 'MUNIT', 'BITAND', 'BITOR', 'BITXOR', 'BITLSHIFT', 'BITRSHIFT',
  'PDURATION', 'RRI', 'TEXTBEFORE', 'TEXTAFTER', 'TEXTSPLIT', 'VSTACK', 'HSTACK', 'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'TAKE', 'DROP', 'CHOOSEROWS', 'CHOOSECOLS',
  'EXPAND', 'MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'ISOMITTED', 'VALUETOTEXT', 'ARRAYTOTEXT', 'AGGREGATE', 'ENCODEURL', 'REGEXTEST', 'REGEXEXTRACT', 'REGEXREPLACE',
  'IMCOSH', 'IMCOT', 'IMCSC', 'IMCSCH', 'IMSEC', 'IMSECH', 'IMSINH', 'IMTAN', 'FILTERXML', 'WEBSERVICE', 'GROUPBY', 'PIVOTBY', 'PERCENTOF', 'TRIMRANGE', 'IMAGE',
])

/** Functions that return arrays; cells using them are saved as dynamic-array formulas. */
const ARRAY_FUNCTIONS = new Set([
  'FILTER', 'SORT', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'RANDARRAY', 'TEXTSPLIT', 'VSTACK', 'HSTACK', 'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'TAKE', 'DROP',
  'CHOOSEROWS', 'CHOOSECOLS', 'EXPAND', 'MAP', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'TRANSPOSE', 'MMULT', 'MINVERSE', 'MUNIT', 'FREQUENCY', 'LINEST', 'LOGEST',
  'TREND', 'GROWTH', 'MODE.MULT', 'REGEXEXTRACT', 'GROUPBY', 'PIVOTBY', 'TRIMRANGE',
])

const significant = (toks: Token[]) => toks.filter((t) => t.type !== 'ws')

/** Names declared as LET / LAMBDA parameters anywhere in the formula (upper case). */
function parameterNames(toks: Token[]): Set<string> {
  const out = new Set<string>()
  const sig = significant(toks)
  const frames: { id: string; arg: number }[] = []
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i]
    if (t.type === 'func') {
      frames.push({ id: t.id ?? '', arg: 0 })
      continue
    }
    if (t.type === 'lparen') {
      if (sig[i - 1]?.type !== 'func') frames.push({ id: '', arg: 0 })
      continue
    }
    if (t.type === 'rparen') {
      frames.pop()
      continue
    }
    const top = frames[frames.length - 1]
    if (!top) continue
    if (t.type === 'comma') {
      top.arg++
      continue
    }
    if ((t.type === 'name' || t.type === 'ref') && sig[i + 1]?.type === 'comma' && (sig[i - 1]?.type === 'comma' || sig[i - 1]?.type === 'lparen')) {
      if ((top.id === 'LET' && top.arg % 2 === 0) || top.id === 'LAMBDA') out.add((t.id ?? t.text).toUpperCase())
    }
  }
  return out
}

function funcName(t: Token): string {
  return t.text.replace(/^(_xlfn\.|_xlws\.|_xludf\.)+/i, '')
}

/**
 * Formula text (without "=") as it must appear inside a file. `names` are the workbook's defined
 * names (upper case): a defined name that is also a function name stays a name.
 */
export function exportFormula(f: string, names?: ReadonlySet<string>): string {
  const toks = tokenize(f)
  const params = parameterNames(toks)
  const parts: string[] = []
  /** Paren depths at which a _xlfn.SINGLE( wrapper must be closed. */
  const closeAt: number[] = []
  let depth = 0
  let wrapNext = false
  const closeSingles = () => {
    while (closeAt.length && closeAt[closeAt.length - 1] === depth) {
      parts.push(')')
      closeAt.pop()
    }
  }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.type === 'at') {
      parts.push('_xlfn.SINGLE(')
      wrapNext = true
      continue
    }
    const wrapping = wrapNext && t.type !== 'ws'
    if (wrapping) wrapNext = false
    switch (t.type) {
      case 'func': {
        const id = t.id ?? ''
        const name = funcName(t)
        if (params.has(id)) parts.push(`_xlpm.${name}`)
        else if (id === 'FILTER' || id === 'SORT') parts.push(`_xlfn._xlws.${name}`)
        else if (MODERN.has(id) || (id.includes('.') && id !== 'ERROR.TYPE')) parts.push(`_xlfn.${name}`)
        else parts.push(t.text)
        // the wrapper closes after the call's own parenthesis
        if (wrapping) closeAt.push(depth)
        continue
      }
      case 'lparen':
        if (wrapping) closeAt.push(depth)
        depth++
        parts.push(t.text)
        continue
      case 'rparen':
        depth--
        parts.push(t.text)
        closeSingles()
        continue
      case 'name': {
        const up = (t.id ?? t.text).toUpperCase()
        // a bare function name passed as an argument is an eta-reduced LAMBDA
        parts.push(params.has(up) ? `_xlpm.${t.text}` : FUNCTIONS.has(up) && !t.sheet && !names?.has(up) ? `_xlfn._xleta.${up}` : t.text)
        break
      }
      case 'ref':
        if (toks[i + 1]?.type === 'spill') {
          parts.push(`_xlfn.ANCHORARRAY(${t.text})`)
          i++
        } else parts.push(params.has(t.text.toUpperCase()) ? `_xlpm.${t.text}` : t.text)
        break
      default:
        parts.push(t.text)
    }
    if (wrapping) parts.push(')')
  }
  return parts.join('')
}

/** Formula text read from a file, back in the form typed in the formula bar. */
export function importFormula(f: string): string {
  const toks = tokenize(f.replace(/^=/, ''))
  const out: string[] = []
  /** Pending wrappers: depth at which they end and what replaces the closing paren. */
  const pending: { depth: number; kind: 'anchor' | 'single'; start: number }[] = []
  let depth = 0
  let skipParen = false
  for (const t of toks) {
    if (t.type === 'func') {
      const name = funcName(t)
      const up = name.toUpperCase()
      if (up === 'ANCHORARRAY' || up === 'SINGLE') {
        pending.push({ depth, kind: up === 'ANCHORARRAY' ? 'anchor' : 'single', start: out.length })
        skipParen = true
        continue
      }
      out.push(name.replace(/^_xlpm\./i, ''))
      continue
    }
    if (t.type === 'lparen') {
      depth++
      if (skipParen) skipParen = false
      else out.push('(')
      continue
    }
    if (t.type === 'rparen') {
      depth--
      const p = pending[pending.length - 1]
      if (p && p.depth === depth) {
        pending.pop()
        const inner = out.splice(p.start).join('')
        if (p.kind === 'anchor') out.push(`${inner}#`)
        else out.push(/^[\w.$:!'[\]# ]+$/.test(inner) && !/\s/.test(inner.trim()) ? `@${inner}` : `@(${inner})`)
        continue
      }
      out.push(')')
      continue
    }
    if (t.type === 'name') {
      out.push(t.text.replace(/^_xlpm\./i, '').replace(/^_xlfn\._xleta\./i, ''))
      continue
    }
    out.push(t.text)
  }
  return out.join('')
}

/** True when the formula should be saved as a dynamic-array formula even if its result is one cell. */
export function isArrayFormula(f: string): boolean {
  for (const t of tokenize(f)) {
    if (t.type === 'spill') return true
    if (t.type === 'func' && ARRAY_FUNCTIONS.has(t.id ?? '')) return true
  }
  return false
}

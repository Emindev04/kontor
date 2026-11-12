// Number format codes ("#,##0.00", "m/d/yyyy", "[Red]0%;(0%)" …) with the same section,
// placeholder, date and color rules the original spreadsheet program uses.
import { DAYS, MONTHS, serialToParts } from './dates'
import { CellError, type Scalar } from './types'

export type Formatted = {
  text: string
  color?: string
  /** Text split at a `*` repeat character: `left` is left-aligned, `right` right-aligned. */
  fill?: { left: string; right: string; char: string }
}

type Tok =
  | { t: 'lit'; v: string }
  | { t: 'digit'; v: '0' | '#' | '?' }
  | { t: 'dot' }
  | { t: 'comma' }
  | { t: 'pct' }
  | { t: 'exp'; sign: '+' | '-' }
  | { t: 'slash' }
  | { t: 'text' }
  | { t: 'fill'; v: string }
  | { t: 'date'; v: string }
  | { t: 'elapsed'; v: 'h' | 'm' | 's'; n: number }
  | { t: 'ampm'; v: string }
  | { t: 'subsec'; n: number }
  | { t: 'general' }

type Cond = { op: string; v: number }
type Section = { toks: Tok[]; color?: string; cond?: Cond; kind: 'number' | 'date' | 'text' | 'general' }
type Format = { sections: Section[]; text?: Section }

const COLORS: Record<string, string> = {
  black: '#000000', blue: '#0000FF', cyan: '#00FFFF', green: '#00FF00', magenta: '#FF00FF', red: '#FF0000', white: '#FFFFFF', yellow: '#FFFF00',
}
const INDEXED = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080']

function splitSections(code: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (ch === '"') {
      const end = code.indexOf('"', i + 1)
      const j = end < 0 ? code.length : end
      cur += code.slice(i, j + 1)
      i = j
    } else if (ch === '\\' || ch === '_' || ch === '*') {
      cur += code.slice(i, i + 2)
      i++
    } else if (ch === '[') {
      const end = code.indexOf(']', i)
      const j = end < 0 ? code.length : end
      cur += code.slice(i, j + 1)
      i = j
    } else if (ch === ';') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function tokenize(src: string): Section {
  const toks: Tok[] = []
  let color: string | undefined
  let cond: Cond | undefined
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    const rest = src.slice(i)
    if (ch === '"') {
      const end = src.indexOf('"', i + 1)
      const j = end < 0 ? src.length : end
      toks.push({ t: 'lit', v: src.slice(i + 1, j) })
      i = j
    } else if (ch === '\\') {
      toks.push({ t: 'lit', v: src[i + 1] ?? '' })
      i++
    } else if (ch === '_') {
      toks.push({ t: 'lit', v: src[i + 1] === ')' || src[i + 1] === '(' ? ' ' : ' ' })
      i++
    } else if (ch === '*') {
      toks.push({ t: 'fill', v: src[i + 1] ?? ' ' })
      i++
    } else if (ch === '[') {
      const end = src.indexOf(']', i)
      const inner = src.slice(i + 1, end < 0 ? src.length : end)
      i = end < 0 ? src.length : end
      const lower = inner.toLowerCase()
      const cm = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)$/.exec(inner)
      if (COLORS[lower]) color = COLORS[lower]
      else if (/^color\s*\d+$/.test(lower)) color = INDEXED[(Number(lower.replace(/\D/g, '')) - 1) % INDEXED.length]
      else if (cm) cond = { op: cm[1], v: Number(cm[2]) }
      else if (/^h+$/.test(lower)) toks.push({ t: 'elapsed', v: 'h', n: lower.length })
      else if (/^m+$/.test(lower)) toks.push({ t: 'elapsed', v: 'm', n: lower.length })
      else if (/^s+$/.test(lower)) toks.push({ t: 'elapsed', v: 's', n: lower.length })
      else if (inner.startsWith('$')) {
        const sym = inner.slice(1).split('-')[0]
        if (sym) toks.push({ t: 'lit', v: sym })
      }
    } else if (/^general/i.test(rest)) {
      toks.push({ t: 'general' })
      i += 6
    } else if (ch === '0' || ch === '#' || ch === '?') toks.push({ t: 'digit', v: ch })
    else if (ch === '.') toks.push({ t: 'dot' })
    else if (ch === ',') toks.push({ t: 'comma' })
    else if (ch === '%') toks.push({ t: 'pct' })
    else if ((ch === 'E' || ch === 'e') && (src[i + 1] === '+' || src[i + 1] === '-')) {
      toks.push({ t: 'exp', sign: src[i + 1] as '+' | '-' })
      i++
    } else if (ch === '/') toks.push({ t: 'slash' })
    else if (ch === '@') toks.push({ t: 'text' })
    else if (/^am\/pm/i.test(rest)) {
      toks.push({ t: 'ampm', v: 'AM/PM' })
      i += 4
    } else if (/^a\/p/i.test(rest)) {
      toks.push({ t: 'ampm', v: rest[0] === 'a' ? 'a/p' : 'A/P' })
      i += 2
    } else if (/[ymdhs]/i.test(ch)) {
      let j = i
      while (j < src.length && src[j].toLowerCase() === ch.toLowerCase()) j++
      toks.push({ t: 'date', v: src.slice(i, j).toLowerCase() })
      i = j - 1
    } else toks.push({ t: 'lit', v: ch })
  }
  const isDate = toks.some((t) => t.t === 'date' || t.t === 'elapsed' || t.t === 'ampm')
  const kind = isDate ? 'date' : toks.some((t) => t.t === 'digit') ? 'number' : toks.some((t) => t.t === 'general') ? 'general' : toks.some((t) => t.t === 'text') ? 'text' : 'number'
  if (isDate) {
    // "m" means minutes right after hours or right before seconds; ".0" after seconds is sub-seconds.
    const timeIdx = toks.map((t, i) => (t.t === 'date' || t.t === 'elapsed' ? i : -1)).filter((i) => i >= 0)
    timeIdx.forEach((idx, k) => {
      const t = toks[idx] as { t: 'date'; v: string }
      if (t.t !== 'date' || t.v[0] !== 'm' || t.v.length > 2) return
      const prev = k > 0 ? toks[timeIdx[k - 1]] : null
      const next = k < timeIdx.length - 1 ? toks[timeIdx[k + 1]] : null
      const prevH = prev && ((prev.t === 'date' && prev.v[0] === 'h') || (prev.t === 'elapsed' && prev.v === 'h'))
      const nextS = next && ((next.t === 'date' && next.v[0] === 's') || (next.t === 'elapsed' && next.v === 's'))
      if (prevH || nextS) t.v = t.v === 'm' ? 'M' : 'MM'
    })
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].t !== 'dot') continue
      let n = 0
      while (toks[i + 1 + n]?.t === 'digit') n++
      if (n > 0) toks.splice(i, n + 1, { t: 'subsec', n })
    }
  }
  return { toks, color, cond, kind }
}

const cache = new Map<string, Format>()

function compile(code: string): Format {
  let f = cache.get(code)
  if (f) return f
  const parts = splitSections(code).map(tokenize)
  const sections: Section[] = []
  let text: Section | undefined
  parts.forEach((p, i) => {
    if (i === 3 || (p.kind === 'text' && i > 0)) text = p
    else sections.push(p)
  })
  if (parts.length === 1 && parts[0].kind === 'text') {
    text = parts[0]
  }
  f = { sections, text }
  if (cache.size > 2000) cache.clear()
  cache.set(code, f)
  return f
}

// ---------- General ----------

/** Number → text the way formulas convert it (up to 15 significant digits). */
export function numberToText(v: number): string {
  if (!Number.isFinite(v)) return '#NUM!'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1e15 || abs < 1e-9) {
    const [m, e] = v.toExponential(14).split('e')
    const mant = m.replace(/\.?0+$/, '')
    const exp = Number(e)
    return `${mant}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`
  }
  return trimZeros(Number(v.toPrecision(15)).toFixed(Math.max(0, 15 - Math.floor(Math.log10(abs)) - 1)))
}

function trimZeros(s: string) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** General format for display in a cell, limited to `maxChars` characters (11 for a standard column). */
export function generalNumber(v: number, maxChars = 11): string {
  if (!Number.isFinite(v)) return '#NUM!'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  const sign = v < 0 ? 1 : 0
  const intDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 1
  if (abs < 1e11 && abs >= 1e-9 && intDigits + sign <= maxChars) {
    const room = maxChars - intDigits - sign - 1
    const sigRoom = abs >= 1 ? 15 - intDigits : 15 - Math.floor(Math.log10(abs))
    const dec = Math.max(0, Math.min(room, sigRoom, 20))
    const s = trimZeros(roundTo(v, dec).toFixed(dec))
    if (s !== '0' && s !== '-0') return s
    if (abs >= 1e-4) return s
  }
  const expLen = Math.abs(Math.floor(Math.log10(abs))) >= 100 ? 5 : 4
  const mantDigits = Math.max(0, Math.min(14, maxChars - sign - 2 - expLen))
  const [m, e] = v.toExponential(mantDigits).split('e')
  const exp = Number(e)
  return `${trimZeros(m)}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`
}

/** Rounds half away from zero, working on the 15-significant-digit value like the original (so ROUND(1.005,2) is 1.01). */
export function roundTo(v: number, dec: number): number {
  if (!Number.isFinite(v) || v === 0) return v
  const s = Math.sign(v)
  const [m, e] = Math.abs(v).toExponential(14).split('e')
  const exp = Number(e) + dec
  if (exp >= 15) return v
  if (exp < -1) return 0
  const r = Math.round(Number(`${m}e${exp}`))
  if (r === 0) return 0
  return s * Number(`${r}e${-dec}`)
}

// ---------- Formatting ----------

function pickSection(f: Format, v: number): { sec: Section; v: number } | null {
  const secs = f.sections
  if (secs.length === 0) return null
  if (secs.some((s) => s.cond)) {
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i]
      if (!s.cond) return { sec: s, v: i > 0 ? Math.abs(v) : v }
      if (test(s.cond, v)) return { sec: s, v: s.cond.op.startsWith('<') && s.cond.v <= 0 ? Math.abs(v) : v }
    }
    return { sec: secs[secs.length - 1], v }
  }
  if (secs.length === 1) return { sec: secs[0], v }
  if (v > 0 || (v === 0 && secs.length === 2)) return { sec: secs[0], v }
  if (v < 0) return { sec: secs[1], v: Math.abs(v) }
  return { sec: secs[2], v }
}

function test(c: Cond, v: number) {
  switch (c.op) {
    case '<': return v < c.v
    case '<=': return v <= c.v
    case '>': return v > c.v
    case '>=': return v >= c.v
    case '=': return v === c.v
    default: return v !== c.v
  }
}

function finish(parts: string[], fillAt: number, fillChar: string, color?: string): Formatted {
  if (fillAt < 0) return { text: parts.join(''), color }
  const left = parts.slice(0, fillAt).join('')
  const right = parts.slice(fillAt).join('')
  return { text: left + right, color, fill: { left, right, char: fillChar } }
}

function formatText(sec: Section, s: string): Formatted {
  const parts: string[] = []
  let fillAt = -1
  let fillChar = ' '
  for (const t of sec.toks) {
    if (t.t === 'text') parts.push(s)
    else if (t.t === 'lit') parts.push(t.v)
    else if (t.t === 'fill') {
      fillAt = parts.length
      fillChar = t.v
    } else if (t.t === 'general') parts.push(s)
  }
  return finish(parts, fillAt, fillChar, sec.color)
}

/** Formats a value for display. `maxChars` limits the General format. */
export function formatValue(value: Scalar, code?: string, maxChars = 11): Formatted {
  if (value === null) return { text: '' }
  if (value instanceof CellError) return { text: value.code }
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE' }
  const fmt = code && code !== 'General' ? compile(code) : null
  if (typeof value === 'string') {
    if (fmt?.text) return formatText(fmt.text, value)
    return { text: value }
  }
  if (!fmt) return { text: generalNumber(value, maxChars) }
  const picked = pickSection(fmt, value)
  if (!picked) return { text: generalNumber(value, maxChars) }
  const { sec, v } = picked
  const negSingle = fmt.sections.length === 1 || (fmt.sections.some((s) => s.cond) && v < 0)
  if (sec.kind === 'date') return formatDate(sec, v)
  if (sec.kind === 'text' && !sec.toks.some((t) => t.t === 'digit')) return formatText(sec, numberToText(v))
  return formatNumber(sec, v, negSingle, maxChars)
}

function formatNumber(sec: Section, value: number, negSingle: boolean, maxChars: number): Formatted {
  const toks = sec.toks
  let v = value
  const neg = v < 0 && negSingle
  v = Math.abs(v)
  for (const t of toks) if (t.t === 'pct') v *= 100

  const dotIdx = toks.findIndex((t) => t.t === 'dot')
  const expIdx = toks.findIndex((t) => t.t === 'exp')
  const slashIdx = toks.findIndex((t) => t.t === 'slash')
  const digitIdx = toks.map((t, i) => (t.t === 'digit' ? i : -1)).filter((i) => i >= 0)

  // Commas right after the last integer placeholder scale by 1000; commas between placeholders group.
  const numEnd = dotIdx >= 0 ? dotIdx : expIdx >= 0 ? expIdx : digitIdx.length ? digitIdx[digitIdx.length - 1] + 1 : toks.length
  let grouping = false
  const intDigitIdx = digitIdx.filter((i) => i < numEnd && (slashIdx < 0 || i < slashIdx))
  const firstInt = intDigitIdx[0] ?? -1
  const lastInt = intDigitIdx[intDigitIdx.length - 1] ?? -1
  const skip = new Set<number>()
  toks.forEach((t, i) => {
    if (t.t !== 'comma') return
    if (i > firstInt && i < lastInt && firstInt >= 0) {
      grouping = true
      skip.add(i)
    } else if (i > lastInt && lastInt >= 0 && i <= numEnd) {
      let onlyCommas = true
      for (let j = lastInt + 1; j < i; j++) if (toks[j].t !== 'comma') onlyCommas = false
      if (onlyCommas) {
        v /= 1000
        skip.add(i)
      }
    }
  })

  const out = new Map<number, string>()
  const genIdx = toks.findIndex((t) => t.t === 'general')
  if (genIdx >= 0 && digitIdx.length === 0) out.set(genIdx, generalNumber(v, maxChars))

  if (slashIdx >= 0 && digitIdx.some((i) => i > slashIdx)) {
    formatFraction(toks, slashIdx, v, out)
  } else if (slashIdx >= 0 && toks.slice(slashIdx + 1).some((t) => t.t === 'lit' && /\d/.test(t.v))) {
    formatFraction(toks, slashIdx, v, out)
  } else if (expIdx >= 0) {
    const decIdx = digitIdx.filter((i) => i > (dotIdx >= 0 ? dotIdx : Infinity) && i < expIdx)
    const expDigits = digitIdx.filter((i) => i > expIdx)
    const intCount = Math.max(1, intDigitIdx.length)
    let exp = v === 0 ? 0 : Math.floor(Math.log10(v))
    const eng = intDigitIdx.length > 1 && intDigitIdx.some((i) => (toks[i] as { v: string }).v === '#')
    if (eng) exp = Math.floor(exp / intCount) * intCount
    let mant = v === 0 ? 0 : v / Math.pow(10, exp)
    mant = roundTo(mant, decIdx.length)
    if (!eng && mant >= 10) {
      mant /= 10
      exp += 1
    }
    fillInt(toks, intDigitIdx, Math.floor(mant).toString(), false, out)
    fillDec(toks, decIdx, decimals(mant, decIdx.length), out)
    const t = toks[expIdx] as { sign: '+' | '-' }
    const expStr = String(Math.abs(exp)).padStart(expDigits.filter((i) => (toks[i] as { v: string }).v === '0').length, '0')
    out.set(expIdx, `E${exp < 0 ? '-' : t.sign === '+' ? '+' : ''}`)
    expDigits.forEach((i, k) => out.set(i, k === 0 ? expStr : ''))
  } else {
    const decIdx = dotIdx >= 0 ? digitIdx.filter((i) => i > dotIdx) : []
    const r = roundTo(v, decIdx.length)
    const intPart = Math.floor(r)
    const intStr = intPart === 0 ? '' : intPart >= 1e21 ? BigInt(Math.round(intPart)).toString() : intPart.toFixed(0)
    if (intDigitIdx.length === 0 && intStr && dotIdx >= 0) out.set(dotIdx, intStr + '.')
    fillInt(toks, intDigitIdx, intStr, grouping, out)
    fillDec(toks, decIdx, decimals(r, decIdx.length), out)
  }

  const parts: string[] = []
  let fillAt = -1
  let fillChar = ' '
  toks.forEach((t, i) => {
    if (skip.has(i)) return
    if (out.has(i)) {
      parts.push(out.get(i)!)
      return
    }
    switch (t.t) {
      case 'lit': parts.push(t.v); break
      case 'dot': parts.push('.'); break
      case 'comma': parts.push(','); break
      case 'pct': parts.push('%'); break
      case 'slash': parts.push('/'); break
      case 'text': break
      case 'fill': fillAt = parts.length; fillChar = t.v; break
      case 'digit': parts.push(''); break
      default: break
    }
  })
  if (neg) {
    const allZero = !/[1-9]/.test(parts.join(''))
    if (!allZero) parts.unshift('-')
  }
  return finish(parts, fillAt >= 0 ? fillAt + (neg && fillAt >= 0 ? 1 : 0) : -1, fillChar, sec.color)
}

function decimals(v: number, n: number): string {
  if (n === 0) return ''
  const s = v.toFixed(Math.min(n, 100))
  const i = s.indexOf('.')
  return i < 0 ? '0'.repeat(n) : s.slice(i + 1).padEnd(n, '0')
}

function fillInt(toks: Tok[], idx: number[], digits: string, grouping: boolean, out: Map<number, string>) {
  if (idx.length === 0) return
  if (grouping) {
    const zeros = idx.filter((i) => (toks[i] as { v: string }).v !== '#').length
    let d = digits.padStart(zeros, '0')
    const q = idx.filter((i) => (toks[i] as { v: string }).v === '?').length
    d = d.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    if (!digits && q && zeros === q) d = ' '.repeat(q)
    idx.forEach((i, k) => out.set(i, k === 0 ? d : ''))
    return
  }
  let pos = digits.length
  for (let k = idx.length - 1; k >= 0; k--) {
    const ph = (toks[idx[k]] as { v: string }).v
    if (k === 0) {
      const restDigits = digits.slice(0, pos)
      out.set(idx[k], restDigits || (ph === '0' ? '0' : ph === '?' ? ' ' : ''))
    } else if (pos > 0) {
      out.set(idx[k], digits[pos - 1])
      pos--
    } else out.set(idx[k], ph === '0' ? '0' : ph === '?' ? ' ' : '')
  }
}

function fillDec(toks: Tok[], idx: number[], digits: string, out: Map<number, string>) {
  let keep = digits.length
  for (let k = idx.length - 1; k >= 0; k--) {
    const ph = (toks[idx[k]] as { v: string }).v
    if (ph === '0' || digits[k] !== '0') break
    keep = k
  }
  idx.forEach((i, k) => {
    const ph = (toks[i] as { v: string }).v
    if (k < keep) out.set(i, digits[k])
    else out.set(i, ph === '?' ? ' ' : ph === '0' ? digits[k] : '')
  })
}

function formatFraction(toks: Tok[], slashIdx: number, v: number, out: Map<number, string>) {
  // numerator = digit run right before the slash; integer part = digits before that run
  let numStart = slashIdx
  while (numStart > 0 && toks[numStart - 1].t === 'digit') numStart--
  const numIdx: number[] = []
  for (let i = numStart; i < slashIdx; i++) numIdx.push(i)
  const intIdx = toks.map((t, i) => (t.t === 'digit' && i < numStart ? i : -1)).filter((i) => i >= 0)
  const denIdx = toks.map((t, i) => (t.t === 'digit' && i > slashIdx ? i : -1)).filter((i) => i >= 0)
  let fixedDen = 0
  if (!denIdx.length) {
    const lit = toks.slice(slashIdx + 1).find((t) => t.t === 'lit' && /\d/.test(t.v)) as { v: string } | undefined
    fixedDen = lit ? parseInt(lit.v, 10) : 0
  }
  const ip = intIdx.length ? Math.floor(v) : 0
  const frac = v - ip
  let num: number
  let den: number
  if (fixedDen) {
    den = fixedDen
    num = Math.round(frac * den)
  } else {
    const maxDen = Math.pow(10, Math.max(1, denIdx.length)) - 1
    ;[num, den] = bestFraction(frac, maxDen)
  }
  let whole = ip
  if (num === den && intIdx.length) {
    whole += 1
    num = 0
  }
  const wholeStr = whole === 0 ? '' : String(whole)
  if (intIdx.length) fillInt(toks, intIdx, wholeStr || (num === 0 ? '0' : ''), false, out)
  if (num === 0 && intIdx.length) {
    numIdx.forEach((i) => out.set(i, ' '))
    out.set(slashIdx, ' ')
    denIdx.forEach((i) => out.set(i, ' '))
    for (let i = slashIdx + 1; i < toks.length; i++) if (toks[i].t === 'lit' && /\d/.test((toks[i] as { v: string }).v)) out.set(i, ' '.repeat((toks[i] as { v: string }).v.length))
    return
  }
  fillInt(toks, numIdx, String(num), false, out)
  if (denIdx.length) {
    const ds = String(den)
    denIdx.forEach((i, k) => {
      const ph = (toks[i] as { v: string }).v
      out.set(i, k === 0 ? ds + (ph === '?' ? ' '.repeat(Math.max(0, denIdx.length - ds.length)) : '') : '')
    })
  }
}

function bestFraction(x: number, maxDen: number): [number, number] {
  let best: [number, number] = [Math.round(x), 1]
  let err = Math.abs(x - best[0])
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d)
    const e = Math.abs(x - n / d)
    if (e < err - 1e-12) {
      err = e
      best = [n, d]
      if (e < 1e-12) break
    }
  }
  return best
}

function formatDate(sec: Section, v: number): Formatted {
  if (v < 0 || v > 2958465.99999) return { text: '#'.repeat(10) }
  const sub = sec.toks.find((t) => t.t === 'subsec') as { n: number } | undefined
  const subDigits = sub?.n ?? 0
  const hasAmPm = sec.toks.some((t) => t.t === 'ampm')
  const unit = Math.pow(10, subDigits)
  const totalUnits = Math.round(v * 86400 * unit)
  const day = Math.floor(totalUnits / (86400 * unit))
  const dayUnits = totalUnits - day * 86400 * unit
  const secs = Math.floor(dayUnits / unit)
  const subVal = dayUnits - secs * unit
  const h = Math.floor(secs / 3600)
  const mi = Math.floor(secs / 60) % 60
  const s = secs % 60
  const p = serialToParts(day)
  const parts: string[] = []
  let fillAt = -1
  let fillChar = ' '
  const pad = (n: number, len: number) => String(n).padStart(len, '0')
  for (const t of sec.toks) {
    switch (t.t) {
      case 'lit': parts.push(t.v); break
      case 'fill': fillAt = parts.length; fillChar = t.v; break
      case 'digit': parts.push(t.v === '0' ? '0' : ''); break
      case 'dot': parts.push('.'); break
      case 'comma': parts.push(','); break
      case 'slash': parts.push('/'); break
      case 'pct': parts.push('%'); break
      case 'subsec': parts.push('.' + pad(subVal, subDigits)); break
      case 'ampm': {
        const pm = h >= 12
        parts.push(t.v === 'AM/PM' ? (pm ? 'PM' : 'AM') : t.v === 'a/p' ? (pm ? 'p' : 'a') : pm ? 'P' : 'A')
        break
      }
      case 'elapsed': {
        const totalSecs = Math.floor(totalUnits / unit)
        const val = t.v === 'h' ? Math.floor(totalSecs / 3600) : t.v === 'm' ? Math.floor(totalSecs / 60) : totalSecs
        parts.push(pad(val, t.n))
        break
      }
      case 'date': {
        const k = t.v
        if (k[0] === 'y') parts.push(k.length <= 2 ? pad(p.y % 100, 2) : String(p.y))
        else if (k === 'm') parts.push(String(p.m))
        else if (k === 'mm') parts.push(pad(p.m, 2))
        else if (k === 'mmm') parts.push(MONTHS[p.m - 1]?.slice(0, 3) ?? '')
        else if (k === 'mmmmm') parts.push(MONTHS[p.m - 1]?.[0] ?? '')
        else if (k.startsWith('mmmm')) parts.push(MONTHS[p.m - 1] ?? '')
        else if (k === 'M') parts.push(String(mi))
        else if (k === 'MM') parts.push(pad(mi, 2))
        else if (k === 'd') parts.push(String(p.d))
        else if (k === 'dd') parts.push(pad(p.d, 2))
        else if (k === 'ddd') parts.push(DAYS[p.wd].slice(0, 3))
        else if (k.startsWith('dddd')) parts.push(DAYS[p.wd])
        else if (k[0] === 'h') {
          const hh = hasAmPm ? (h % 12 === 0 ? 12 : h % 12) : h
          parts.push(k.length >= 2 ? pad(hh, 2) : String(hh))
        } else if (k[0] === 's') parts.push(k.length >= 2 ? pad(s, 2) : String(s))
        break
      }
      default: break
    }
  }
  return finish(parts, fillAt, fillChar, sec.color)
}

// ---------- Helpers for the UI ----------

export type FormatKind = 'general' | 'number' | 'currency' | 'accounting' | 'date' | 'time' | 'percentage' | 'fraction' | 'scientific' | 'text' | 'custom'

export function isDateFormat(code?: string): boolean {
  if (!code || code === 'General') return false
  return compile(code).sections.some((s) => s.kind === 'date')
}

export function hasTimeOnly(code?: string): boolean {
  if (!code) return false
  const s = compile(code).sections[0]
  return !!s && s.kind === 'date' && !s.toks.some((t) => t.t === 'date' && /^[yd]|^m/.test(t.v))
}

/** Changes the number of decimals of a format code by `delta`. */
export function adjustDecimals(code: string | undefined, delta: number, value: Scalar): string {
  if (!code || code === 'General') {
    let dec = 0
    if (typeof value === 'number') {
      const s = generalNumber(value)
      dec = s.includes('.') && !s.includes('E') ? s.split('.')[1].length : 0
    }
    dec = Math.max(0, dec + delta)
    return dec === 0 ? '0' : '0.' + '0'.repeat(dec)
  }
  return splitSections(code)
    .map((sec) => {
      if (delta > 0) {
        if (/0\./.test(sec) || /#\./.test(sec)) return sec.replace(/([0#])\.([0#]*)/, (_m, a, b) => `${a}.${b}0`)
        return sec.replace(/(.*[0#])/, '$1.0')
      }
      return sec.replace(/([0#])\.([0#]*)/, (_m, a, b: string) => (b.length <= 1 ? a : `${a}.${b.slice(0, -1)}`))
    })
    .join(';')
}

export const BUILTIN_FORMATS = {
  general: 'General',
  number: '0.00',
  currency: '"$"#,##0.00',
  accounting: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)',
  shortDate: 'm/d/yyyy',
  longDate: 'dddd, mmmm d, yyyy',
  time: 'h:mm:ss AM/PM',
  percentage: '0.00%',
  fraction: '# ?/?',
  scientific: '0.00E+00',
  text: '@',
  comma: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)',
}

export const CUSTOM_FORMATS = [
  'General', '0', '0.00', '#,##0', '#,##0.00', '#,##0_);(#,##0)', '#,##0_);[Red](#,##0)', '#,##0.00_);(#,##0.00)', '#,##0.00_);[Red](#,##0.00)',
  '"$"#,##0_);("$"#,##0)', '"$"#,##0_);[Red]("$"#,##0)', '"$"#,##0.00_);("$"#,##0.00)', '"$"#,##0.00_);[Red]("$"#,##0.00)', '0%', '0.00%', '0.00E+00', '##0.0E+0',
  '# ?/?', '# ??/??', 'm/d/yyyy', 'd-mmm-yy', 'd-mmm', 'mmm-yy', 'h:mm AM/PM', 'h:mm:ss AM/PM', 'h:mm', 'h:mm:ss', 'm/d/yyyy h:mm', 'mm:ss', 'mm:ss.0', '@', '[h]:mm:ss',
  '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"_);_(@_)', '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)', BUILTIN_FORMATS.accounting, BUILTIN_FORMATS.comma,
]

/** Classifies a format code for the Number Format dropdown. */
export function classifyFormat(code?: string): FormatKind {
  if (!code || code === 'General') return 'general'
  if (code === '@') return 'text'
  if (code === BUILTIN_FORMATS.accounting || /\* #,##0/.test(code) && code.includes('$')) return 'accounting'
  if (isDateFormat(code)) return hasTimeOnly(code) ? 'time' : 'date'
  if (code.includes('%')) return 'percentage'
  if (/E[+-]/i.test(code)) return 'scientific'
  if (code.includes('/')) return 'fraction'
  if (code.includes('$') || code.includes('€') || code.includes('£') || code.includes('¥')) return 'currency'
  if (/^[#,0.]+$/.test(code) || /0/.test(code)) return 'number'
  return 'custom'
}

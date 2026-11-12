// Turns what the user typed into a cell into a value plus an automatic number format. Numbers follow
// the separators passed in (`sym`, US by default; cell entry passes the interface language's): in
// German "1.234,5" is a number and "1.5" is text, in English the other way round. Dates and times use
// en-US rules in every language (there is no locale short date), so German "1.5" never becomes a date.
import { MONTHS, partsToSerial, timeToFraction } from './dates'
import { US_SYMBOLS, isUsSymbols, type NumberSymbols } from './numberLocale'
import { errorFromCode, type Scalar } from './types'

export type Parsed = { kind: 'formula'; f: string } | { kind: 'value'; v: Scalar; fmt?: string }

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

function monthNum(s: string) {
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(s.toLowerCase().slice(0, 3))) + 1
}

function year(y: string): number {
  const n = Number(y)
  if (y.length <= 2) return n < 30 ? 2000 + n : 1900 + n
  return n
}

function validDate(y: number, m: number, d: number) {
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 9999 && new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d
}

export function parseTime(text: string): { v: number; fmt: string } | null {
  const m = /^(\d{1,4}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?\s*(am|pm|a|p)?$/i.exec(text.trim())
  if (!m) return null
  let h = Number(m[1])
  const mi = Number(m[2])
  const s = m[3] ? Number(m[3]) : 0
  const ap = m[4]?.toLowerCase()
  if (mi > 59 || s >= 60) return null
  if (ap) {
    if (h < 1 || h > 12) return null
    if (ap.startsWith('p') && h !== 12) h += 12
    if (ap.startsWith('a') && h === 12) h = 0
  }
  const fmt = ap ? (m[3] ? 'h:mm:ss AM/PM' : 'h:mm AM/PM') : h >= 24 ? '[h]:mm:ss' : m[3] ? 'h:mm:ss' : 'h:mm'
  return { v: timeToFraction(h, mi, s), fmt }
}

export function parseDate(text: string): { v: number; fmt: string } | null {
  const t = text.trim()
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{1,4})$/.exec(t)
  if (m) {
    const y = year(m[3])
    const mo = Number(m[1])
    const d = Number(m[2])
    return validDate(y, mo, d) ? { v: partsToSerial(y, mo, d), fmt: 'm/d/yyyy' } : null
  }
  m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(t)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return validDate(y, mo, d) ? { v: partsToSerial(y, mo, d), fmt: 'm/d/yyyy' } : null
  }
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(t)
  if (m) {
    const y = new Date().getFullYear()
    const [mo, d] = [Number(m[1]), Number(m[2])]
    return validDate(y, mo, d) ? { v: partsToSerial(y, mo, d), fmt: 'd-mmm' } : null
  }
  m = new RegExp(`^${MONTH_RE}\\.?\\s+(\\d{1,2}),?\\s+(\\d{2,4})$`, 'i').exec(t)
  if (m) {
    const [y, mo, d] = [year(m[3]), monthNum(m[1]), Number(m[2])]
    return validDate(y, mo, d) ? { v: partsToSerial(y, mo, d), fmt: 'd-mmm-yy' } : null
  }
  m = new RegExp(`^(\\d{1,2})[-\\s]${MONTH_RE}\\.?[-\\s](\\d{2,4})$`, 'i').exec(t)
  if (m) {
    const [y, mo, d] = [year(m[3]), monthNum(m[2]), Number(m[1])]
    return validDate(y, mo, d) ? { v: partsToSerial(y, mo, d), fmt: 'd-mmm-yy' } : null
  }
  m = new RegExp(`^(\\d{1,2})[-\\s]${MONTH_RE}$`, 'i').exec(t)
  if (m) {
    const y = new Date().getFullYear()
    const [mo, d] = [monthNum(m[2]), Number(m[1])]
    return validDate(y, mo, d) ? { v: partsToSerial(y, mo, d), fmt: 'd-mmm' } : null
  }
  m = new RegExp(`^${MONTH_RE}\\.?\\s+(\\d{1,2})$`, 'i').exec(t)
  if (m) {
    const y = new Date().getFullYear()
    const [mo, d] = [monthNum(m[1]), Number(m[2])]
    return validDate(y, mo, d) ? { v: partsToSerial(y, mo, d), fmt: 'd-mmm' } : null
  }
  m = new RegExp(`^${MONTH_RE}[-\\s](\\d{2}|\\d{4})$`, 'i').exec(t)
  if (m) {
    const [y, mo] = [year(m[2]), monthNum(m[1])]
    return validDate(y, mo, 1) ? { v: partsToSerial(y, mo, 1), fmt: 'mmm-yy' } : null
  }
  return null
}

export function parseDateTime(text: string): { v: number; fmt: string } | null {
  const d = parseDate(text)
  if (d) return d
  const t = parseTime(text)
  if (t) return t
  const m = /^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:am|pm|a|p)?)$/i.exec(text.trim())
  if (m) {
    const dd = parseDate(m[1])
    const tt = parseTime(m[2])
    if (dd && tt) return { v: dd.v + tt.v, fmt: 'm/d/yyyy h:mm' }
  }
  return null
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Thousands separators accepted on entry: any kind of space when the language groups with one. */
function groupPattern(group: string) {
  return /^[\s\u00A0\u202F]$/.test(group) ? '[ \u00A0\u202F]' : escapeRe(group)
}

/** Parses a number typed with optional currency, grouping, percent, parentheses or exponent. */
export function parseNumber(text: string, sym: NumberSymbols = US_SYMBOLS): { v: number; fmt?: string } | null {
  let t = text.trim()
  if (!t) return null
  let neg = false
  if (/^\(.*\)$/.test(t)) {
    neg = true
    t = t.slice(1, -1).trim()
  }
  if (t.startsWith('-')) {
    neg = !neg
    t = t.slice(1).trim()
  } else if (t.startsWith('+')) t = t.slice(1).trim()
  let currency = ''
  const cm = /^([$€£¥])\s*/.exec(t)
  if (cm) {
    currency = cm[1]
    t = t.slice(cm[0].length)
    if (t.startsWith('-')) {
      neg = !neg
      t = t.slice(1)
    }
  }
  let suffix = false
  if (!currency && !isUsSymbols(sym)) {
    // "1.234,50 €" — the currency symbol after the number, as written in these languages
    const sm = /\s*([$€£¥])$/.exec(t)
    if (sm) {
      currency = sm[1]
      suffix = true
      t = t.slice(0, -sm[0].length)
    }
  }
  let pct = false
  if (t.endsWith('%')) {
    pct = true
    t = t.slice(0, -1).trim()
  }
  const frac = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
  if (frac && !currency && !pct) {
    const den = Number(frac[3])
    if (den === 0) return null
    const v = Number(frac[1]) + Number(frac[2]) / den
    return { v: neg ? -v : v, fmt: frac[3].length > 1 ? '# ??/??' : '# ?/?' }
  }
  const g = groupPattern(sym.group)
  const d = escapeRe(sym.decimal)
  if (!new RegExp(`^(\\d{1,3}(${g}\\d{3})+|\\d+)?(${d}\\d*)?([eE][-+]?\\d+)?$`).test(t) || !/\d/.test(t)) return null
  const grouped = new RegExp(g).test(t)
  const n = t.replace(new RegExp(g, 'g'), '').replace(sym.decimal, '.')
  const sci = /e/i.test(n)
  const decimals = n.includes('.') && !sci ? (n.split('.')[1] ?? '').length : 0
  let v = Number(n)
  if (Number.isNaN(v)) return null
  if (neg) v = -v || 0
  let fmt: string | undefined
  if (pct) {
    v /= 100
    fmt = decimals ? `0.${'0'.repeat(decimals)}%` : '0%'
  } else if (currency) {
    const cur = currency === '$' ? '"$"' : currency
    const body = decimals ? '#,##0.00' : '#,##0'
    fmt = suffix ? `${body} ${cur}` : `${cur}${body}`
  } else if (sci) fmt = '0.00E+00'
  else if (grouped) fmt = decimals ? '#,##0.00' : '#,##0'
  return { v, fmt }
}

export function parseInput(raw: string, sym: NumberSymbols = US_SYMBOLS): Parsed {
  if (raw.length > 1 && raw.startsWith('=')) return { kind: 'formula', f: raw.slice(1) }
  if (raw.startsWith("'")) return { kind: 'value', v: raw.slice(1) }
  const text = raw
  if (text === '') return { kind: 'value', v: null }
  const t = text.trim()
  if (/^(true|false)$/i.test(t)) return { kind: 'value', v: t.toLowerCase() === 'true' }
  const err = errorFromCode(t)
  if (err) return { kind: 'value', v: err }
  const n = parseNumber(t, sym)
  if (n) return { kind: 'value', v: n.v, fmt: n.fmt }
  const dt = parseDateTime(t)
  if (dt) return { kind: 'value', v: dt.v, fmt: dt.fmt }
  if (/^[+-]/.test(t) && t.length > 1 && /[A-Za-z(]/.test(t)) return { kind: 'formula', f: t }
  return { kind: 'value', v: text }
}

/** Value coercion used by formulas: text that looks like a number/date/time becomes a number. */
export function textToNumber(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const n = parseNumber(t)
  if (n) return n.v
  const dt = parseDateTime(t)
  return dt ? dt.v : null
}

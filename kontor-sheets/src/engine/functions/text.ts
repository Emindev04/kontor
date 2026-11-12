import { formatValue, numberToText, roundTo } from '../../model/numfmt'
import { textToNumber } from '../../model/parseInput'
import type { Scalar } from '../../model/types'
import { alias, fn, VARARGS } from '../registry'
import { flatten, type Value } from '../values'
import { CellError, ERR, Matrix, Omitted, argBool, argMatrix, argNum, argScalar, isErr, N, optN, sfn, T, toMatrix, toScalar, toText, wildcard, isOmitted } from './helpers'

function str(v: Scalar): string | CellError {
  return toText(v)
}

sfn('LEN', 1, 1, ([a]) => {
  const s = str(a)
  return isErr(s) ? s : [...s].length
})
alias('LENB', 'LEN')
sfn('LOWER', 1, 1, ([a]) => {
  const s = str(a)
  return isErr(s) ? s : s.toLowerCase()
})
sfn('UPPER', 1, 1, ([a]) => {
  const s = str(a)
  return isErr(s) ? s : s.toUpperCase()
})
sfn('PROPER', 1, 1, ([a]) => {
  const s = str(a)
  if (isErr(s)) return s
  return s.toLowerCase().replace(/(^|[^A-Za-zÀ-￿'])([A-Za-zÀ-￿])/g, (_m, p, c) => p + c.toUpperCase()).replace(/'([A-Z])/g, (_m, c) => "'" + c.toLowerCase())
})
sfn('TRIM', 1, 1, ([a]) => {
  const s = str(a)
  return isErr(s) ? s : s.replace(/ +/g, ' ').trim()
})
sfn('CLEAN', 1, 1, ([a]) => {
  const s = str(a)
  // eslint-disable-next-line no-control-regex
  return isErr(s) ? s : s.replace(/[\x00-\x1f]/g, '')
})
sfn('LEFT', 1, 2, (a) => {
  const s = str(a[0])
  const n = optN(a, 1, 1)
  if (isErr(s)) return s
  if (isErr(n)) return n
  if (n < 0) return ERR.value
  return [...s].slice(0, Math.trunc(n)).join('')
})
alias('LEFTB', 'LEFT')
sfn('RIGHT', 1, 2, (a) => {
  const s = str(a[0])
  const n = optN(a, 1, 1)
  if (isErr(s)) return s
  if (isErr(n)) return n
  if (n < 0) return ERR.value
  const chars = [...s]
  return Math.trunc(n) === 0 ? '' : chars.slice(-Math.trunc(n)).join('')
})
alias('RIGHTB', 'RIGHT')
sfn('MID', 3, 3, (a) => {
  const s = str(a[0])
  const start = N(a[1])
  const n = N(a[2])
  if (isErr(s)) return s
  if (isErr(start)) return start
  if (isErr(n)) return n
  if (start < 1 || n < 0) return ERR.value
  return [...s].slice(Math.trunc(start) - 1, Math.trunc(start) - 1 + Math.trunc(n)).join('')
})
alias('MIDB', 'MID')
sfn('REPT', 2, 2, ([a, b]) => {
  const s = str(a)
  const n = N(b)
  if (isErr(s)) return s
  if (isErr(n)) return n
  if (n < 0 || s.length * n > 32767) return ERR.value
  return s.repeat(Math.trunc(n))
})
sfn('EXACT', 2, 2, ([a, b]) => {
  const x = str(a)
  const y = str(b)
  if (isErr(x)) return x
  if (isErr(y)) return y
  return x === y
})
sfn('CONCATENATE', 1, VARARGS, (a) => {
  let out = ''
  for (const v of a) {
    const s = str(v)
    if (isErr(s)) return s
    out += s
  }
  return out
})

fn('CONCAT', 1, VARARGS, (args, ctx) => {
  let out = ''
  for (const a of args) {
    const vals = flatten(a, ctx)
    if (isErr(vals)) return vals
    for (const v of vals) {
      const s = str(v)
      if (isErr(s)) return s
      out += s
    }
  }
  return out.length > 32767 ? ERR.value : out
})

fn('TEXTJOIN', 3, VARARGS, (args, ctx) => {
  const delims = flatten(args[0], ctx)
  if (isErr(delims)) return delims
  const ignore = argBool(args, 1, ctx, true)
  if (isErr(ignore)) return ignore
  const parts: string[] = []
  for (const a of args.slice(2)) {
    const vals = flatten(a, ctx)
    if (isErr(vals)) return vals
    for (const v of vals) {
      if (v instanceof CellError) return v
      const s = str(v) as string
      if (ignore && s === '') continue
      parts.push(s)
    }
  }
  const ds = delims.map((d) => (str(d) as string))
  let out = parts[0] ?? ''
  for (let i = 1; i < parts.length; i++) out += (ds.length ? ds[(i - 1) % ds.length] : '') + parts[i]
  return out.length > 32767 ? ERR.value : out
})

sfn('SUBSTITUTE', 3, 4, (a) => {
  const s = str(a[0])
  const oldT = str(a[1])
  const newT = str(a[2])
  if (isErr(s)) return s
  if (isErr(oldT)) return oldT
  if (isErr(newT)) return newT
  if (!oldT) return s
  if (a.length > 3 && a[3] !== null) {
    const n = N(a[3])
    if (isErr(n)) return n
    if (n < 1) return ERR.value
    let idx = -1
    for (let i = 0; i < Math.trunc(n); i++) {
      idx = s.indexOf(oldT, idx + 1)
      if (idx < 0) return s
    }
    return s.slice(0, idx) + newT + s.slice(idx + oldT.length)
  }
  return s.split(oldT).join(newT)
})
sfn('REPLACE', 4, 4, (a) => {
  const s = str(a[0])
  const start = N(a[1])
  const n = N(a[2])
  const nt = str(a[3])
  if (isErr(s)) return s
  if (isErr(start)) return start
  if (isErr(n)) return n
  if (isErr(nt)) return nt
  if (start < 1 || n < 0) return ERR.value
  const i = Math.trunc(start) - 1
  return s.slice(0, i) + nt + s.slice(i + Math.trunc(n))
})
alias('REPLACEB', 'REPLACE')

function finder(name: string, insensitive: boolean) {
  sfn(name, 2, 3, (a) => {
    const f = str(a[0])
    const s = str(a[1])
    const start = optN(a, 2, 1)
    if (isErr(f)) return f
    if (isErr(s)) return s
    if (isErr(start)) return start
    const from = Math.trunc(start) - 1
    if (from < 0 || from > s.length) return ERR.value
    if (!insensitive) {
      const i = s.indexOf(f, from)
      return i < 0 ? ERR.value : i + 1
    }
    if (f === '') return from + 1
    const re = wildcard(f, false)
    const m = re.exec(s.slice(from))
    return m ? m.index + from + 1 : ERR.value
  })
}
finder('FIND', false)
finder('SEARCH', true)
alias('FINDB', 'FIND')
alias('SEARCHB', 'SEARCH')

sfn('CHAR', 1, 1, ([a]) => {
  const n = N(a)
  if (isErr(n)) return n
  if (n < 1 || n > 255) return ERR.value
  const cp1252: Record<number, number> = { 128: 0x20ac, 130: 0x201a, 131: 0x192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x2c6, 137: 0x2030, 138: 0x160, 139: 0x2039, 140: 0x152, 142: 0x17d, 145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x2dc, 153: 0x2122, 154: 0x161, 155: 0x203a, 156: 0x153, 158: 0x17e, 159: 0x178 }
  const c = Math.trunc(n)
  return String.fromCodePoint(cp1252[c] ?? c)
})
sfn('CODE', 1, 1, ([a]) => {
  const s = str(a)
  if (isErr(s)) return s
  if (!s) return ERR.value
  const cp = s.codePointAt(0)!
  return cp > 255 ? 63 : cp
})
sfn('UNICHAR', 1, 1, ([a]) => {
  const n = N(a)
  if (isErr(n)) return n
  if (n < 1 || n > 0x10ffff) return ERR.value
  return String.fromCodePoint(Math.trunc(n))
})
sfn('UNICODE', 1, 1, ([a]) => {
  const s = str(a)
  if (isErr(s)) return s
  if (!s) return ERR.value
  return s.codePointAt(0)!
})
sfn('T', 1, 1, ([a]) => (typeof a === 'string' ? a : a instanceof CellError ? a : ''))
sfn('ASC', 1, 1, ([a]) => str(a))
sfn('DBCS', 1, 1, ([a]) => str(a))

sfn('VALUE', 1, 1, ([a]) => {
  if (typeof a === 'number') return a
  if (a === null) return 0
  if (a instanceof CellError) return a
  if (typeof a === 'boolean') return ERR.value
  const n = textToNumber(a)
  return n === null ? ERR.value : n
})
sfn('NUMBERVALUE', 1, 3, (a) => {
  const s = str(a[0])
  if (isErr(s)) return s
  const dec = a.length > 1 && a[1] !== null ? str(a[1]) : '.'
  const grp = a.length > 2 && a[2] !== null ? str(a[2]) : ','
  if (isErr(dec)) return dec
  if (isErr(grp)) return grp
  let t = s.replace(/\s/g, '')
  if (!t) return 0
  t = t.split(grp[0] ?? ',').join('')
  const pct = (t.match(/%+$/)?.[0].length ?? 0)
  t = t.replace(/%+$/, '')
  if ((dec[0] ?? '.') !== '.') t = t.replace(dec[0], '.')
  const n = Number(t)
  if (Number.isNaN(n)) return ERR.value
  return n / Math.pow(100, pct)
})

sfn('TEXT', 2, 2, ([a, b]) => {
  const fmt = str(b)
  if (isErr(fmt)) return fmt
  if (a instanceof CellError) return a
  let v: Scalar = a
  if (typeof v === 'string') {
    const n = textToNumber(v)
    if (n !== null) v = n
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return formatValue(v ?? 0, fmt || 'General', 255).text
})

function fixedText(x: number, dec: number, commas: boolean) {
  const r = roundTo(x, dec)
  const d = Math.max(0, dec)
  let s = Math.abs(r).toFixed(d)
  if (commas) {
    const [i, f] = s.split('.')
    s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? '.' + f : '')
  }
  return { s, neg: r < 0 }
}
sfn('FIXED', 1, 3, (a) => {
  const x = N(a[0])
  const dec = optN(a, 1, 2)
  if (isErr(x)) return x
  if (isErr(dec)) return dec
  const noCommas = a.length > 2 && a[2] !== null && a[2] !== false && a[2] !== 0
  const { s, neg } = fixedText(x, Math.trunc(dec), !noCommas)
  return (neg ? '-' : '') + s
})
sfn('DOLLAR', 1, 2, (a) => {
  const x = N(a[0])
  const dec = optN(a, 1, 2)
  if (isErr(x)) return x
  if (isErr(dec)) return dec
  const { s, neg } = fixedText(x, Math.trunc(dec), true)
  return neg ? `($${s})` : `$${s}`
})
alias('USDOLLAR', 'DOLLAR')

// ---------- TEXTBEFORE / TEXTAFTER / TEXTSPLIT ----------

function delimiters(v: Value, ctx: Parameters<Parameters<typeof fn>[3]>[1]): string[] | CellError {
  const vals = flatten(v, ctx)
  if (isErr(vals)) return vals
  const out: string[] = []
  for (const d of vals) {
    const s = str(d)
    if (isErr(s)) return s
    out.push(s)
  }
  return out
}

function findDelims(text: string, delims: string[], ci: boolean): { index: number; len: number }[] {
  const hay = ci ? text.toLowerCase() : text
  const res: { index: number; len: number }[] = []
  let i = 0
  while (i <= hay.length) {
    let best: { index: number; len: number } | null = null
    for (const d of delims) {
      if (!d) continue
      const idx = hay.indexOf(ci ? d.toLowerCase() : d, i)
      if (idx >= 0 && (!best || idx < best.index || (idx === best.index && d.length > best.len))) best = { index: idx, len: d.length }
    }
    if (!best) break
    res.push(best)
    i = best.index + Math.max(1, best.len)
  }
  return res
}

function beforeAfter(name: string, before: boolean) {
  fn(name, 2, 6, (args, ctx) => {
    const tv = toScalar(args[0], ctx)
    const text = str(tv)
    if (isErr(text)) return text
    const delims = delimiters(args[1], ctx)
    if (isErr(delims)) return delims
    const inst = argNum(args, 2, ctx, 1)
    const mode = argNum(args, 3, ctx, 0)
    const matchEnd = argNum(args, 4, ctx, 0)
    if (isErr(inst)) return inst
    if (isErr(mode)) return mode
    if (isErr(matchEnd)) return matchEnd
    const notFound = isOmitted(args, 5) ? ERR.na : toScalar(args[5], ctx)
    const n = Math.trunc(inst)
    if (n === 0 || Math.abs(n) > text.length + 1) return ERR.value
    if (delims.every((d) => d === '')) return before ? (n > 0 ? '' : text) : n > 0 ? text : ''
    const hits = findDelims(text, delims, mode === 1)
    if (matchEnd) {
      if (n > 0) hits.push({ index: text.length, len: 0 })
      else hits.unshift({ index: 0, len: 0 })
    }
    const hit = n > 0 ? hits[n - 1] : hits[hits.length + n]
    if (!hit) return notFound
    return before ? text.slice(0, hit.index) : text.slice(hit.index + hit.len)
  })
}
beforeAfter('TEXTBEFORE', true)
beforeAfter('TEXTAFTER', false)

fn('TEXTSPLIT', 2, 6, (args, ctx) => {
  const text = str(toScalar(args[0], ctx))
  if (isErr(text)) return text
  const colD = isOmitted(args, 1) ? [] : delimiters(args[1], ctx)
  const rowD = isOmitted(args, 2) ? [] : delimiters(args[2], ctx)
  if (isErr(colD)) return colD
  if (isErr(rowD)) return rowD
  const ignore = argBool(args, 3, ctx, false)
  const mode = argNum(args, 4, ctx, 0)
  if (isErr(ignore)) return ignore
  if (isErr(mode)) return mode
  const pad = isOmitted(args, 5) ? ERR.na : toScalar(args[5], ctx)
  const split = (s: string, ds: string[]) => {
    if (!ds.filter(Boolean).length) return [s]
    const hits = findDelims(s, ds, mode === 1)
    const parts: string[] = []
    let last = 0
    for (const h of hits) {
      parts.push(s.slice(last, h.index))
      last = h.index + h.len
    }
    parts.push(s.slice(last))
    return ignore ? parts.filter((p) => p !== '') : parts
  }
  const rows = split(text, rowD).map((r) => split(r, colD))
  const width = Math.max(...rows.map((r) => r.length))
  return Matrix.fill(rows.length, width, (r, c) => (c < rows[r].length ? rows[r][c] : pad))
})

// ---------- conversions to text ----------

function valueText(v: Scalar, strict: boolean): string {
  if (v === null) return ''
  if (v instanceof CellError) return v.code
  if (typeof v === 'string') return strict ? `"${v}"` : v
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return numberToText(v)
}

fn('VALUETOTEXT', 1, 2, (args, ctx) => {
  const f = argNum(args, 1, ctx, 0)
  if (isErr(f)) return f
  const m = toMatrix(args[0], ctx)
  if (isErr(m)) return m
  const out = m.map((v) => valueText(v, f === 1))
  return out.rows === 1 && out.cols === 1 ? out.get(0, 0) : out
})

fn('ARRAYTOTEXT', 1, 2, (args, ctx) => {
  const f = argNum(args, 1, ctx, 0)
  if (isErr(f)) return f
  const m = argMatrix(args, 0, ctx)
  if (isErr(m)) return m
  if (f === 1) return '{' + m.toRows().map((r) => r.map((v) => valueText(v, true)).join(',')).join(';') + '}'
  return m.data.map((v) => valueText(v, false)).join(', ')
})

// ---------- regular expressions ----------

function regex(pattern: string, cs: number, global = false): RegExp | CellError {
  try {
    return new RegExp(pattern, (cs === 1 ? 'i' : '') + (global ? 'g' : '') + 'u')
  } catch {
    return ERR.value
  }
}

sfn('REGEXTEST', 2, 3, (a) => {
  const s = str(a[0])
  const p = str(a[1])
  const cs = optN(a, 2, 0)
  if (isErr(s)) return s
  if (isErr(p)) return p
  if (isErr(cs)) return cs
  const re = regex(p, cs)
  return isErr(re) ? re : re.test(s)
})

fn('REGEXEXTRACT', 2, 4, (args, ctx) => {
  const s = str(toScalar(args[0], ctx))
  const p = str(toScalar(args[1], ctx))
  if (isErr(s)) return s
  if (isErr(p)) return p
  const mode = argNum(args, 2, ctx, 0)
  const cs = argNum(args, 3, ctx, 0)
  if (isErr(mode)) return mode
  if (isErr(cs)) return cs
  if (mode === 1) {
    const re = regex(p, cs, true)
    if (isErr(re)) return re
    const all = [...s.matchAll(re)].map((m) => m[0])
    return all.length ? Matrix.fill(all.length, 1, (r) => all[r]) : ERR.na
  }
  const re = regex(p, cs)
  if (isErr(re)) return re
  const m = re.exec(s)
  if (!m) return ERR.na
  if (mode === 2) {
    const groups = m.slice(1)
    return groups.length ? Matrix.fill(1, groups.length, (_r, c) => groups[c] ?? '') : m[0]
  }
  return m[0]
})

sfn('REGEXREPLACE', 3, 5, (a) => {
  const s = str(a[0])
  const p = str(a[1])
  const rep = str(a[2])
  const occ = optN(a, 3, 0)
  const cs = optN(a, 4, 0)
  if (isErr(s)) return s
  if (isErr(p)) return p
  if (isErr(rep)) return rep
  if (isErr(occ)) return occ
  if (isErr(cs)) return cs
  const re = regex(p, cs, true)
  if (isErr(re)) return re
  if (!occ) return s.replace(re, rep)
  const matches = [...s.matchAll(re)]
  const target = occ > 0 ? matches[occ - 1] : matches[matches.length + occ]
  if (!target || target.index === undefined) return s
  return s.slice(0, target.index) + target[0].replace(new RegExp(re.source, re.flags.replace('g', '')), rep) + s.slice(target.index + target[0].length)
})

sfn('ENCODEURL', 1, 1, ([a]) => {
  const s = str(a)
  return isErr(s) ? s : encodeURIComponent(s)
})

void Omitted
void argScalar
void T

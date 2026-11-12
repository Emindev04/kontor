// Functions added for completeness: GROUPBY, PIVOTBY, TRIMRANGE, GETPIVOTDATA, FILTERXML, BAHTTEXT,
// PHONETIC, the ROMAN forms, and LINEST / LOGEST with several x variables and the statistics block.
import { MAX_COLS } from '../../model/address'
import type { Scalar } from '../../model/types'
import { callLambda } from '../evaluator'
import { refArea } from '../parser'
import { fn, VARARGS } from '../registry'
import { matchRef } from '../tokenizer'
import { compareValues, type Ctx, type Value } from '../values'
import { CellError, ERR, LambdaV, Matrix, RefV, argMatrix, argNum, isErr, isOmitted, sfn, toMatrix, toScalar, toText } from './helpers'

// ---------- ROMAN ----------

const R_CHARS = ['M', 'D', 'C', 'L', 'X', 'V', 'I']
const R_VALUES = [1000, 500, 100, 50, 10, 5, 1]

/** Roman numeral in one of the five forms: 0 = classic … 4 = most simplified. */
export function roman(value: number, form: number): string {
  let n = value
  let out = ''
  const maxIndex = R_VALUES.length - 1
  for (let i = 0; i <= maxIndex / 2; i++) {
    let index = 2 * i
    const digit = Math.floor(n / R_VALUES[index])
    if (digit % 5 === 4) {
      const index2 = digit === 4 ? index - 1 : index - 2
      let steps = 0
      while (steps < form && index < maxIndex) {
        steps++
        if (R_VALUES[index2] - R_VALUES[index + 1] <= n) index++
        else steps = form
      }
      out += R_CHARS[index] + R_CHARS[index2]
      n = n + R_VALUES[index] - R_VALUES[index2]
    } else {
      if (digit > 4) out += R_CHARS[index - 1]
      out += R_CHARS[index].repeat(digit % 5)
      n %= R_VALUES[index]
    }
  }
  return out
}

sfn('ROMAN', 1, 2, (a) => {
  const x = typeof a[0] === 'number' ? a[0] : Number(a[0])
  if (a[0] instanceof CellError) return a[0]
  if (!Number.isFinite(x)) return ERR.value
  const v = Math.trunc(x)
  if (v < 0 || v > 3999) return ERR.value
  const f = a[1]
  if (f instanceof CellError) return f
  const form = f === null || f === undefined || f === true ? 0 : f === false ? 4 : Math.trunc(Number(f))
  if (!Number.isFinite(form) || form < 0 || form > 4) return ERR.value
  return v === 0 ? '' : roman(v, form)
})

// ---------- LINEST / LOGEST ----------

/** Solves the linear system A·x = b (Gaussian elimination with partial pivoting); null when singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-12) return null
    ;[M[col], M[piv]] = [M[piv], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

function inverse(A: number[][]): number[][] | null {
  const n = A.length
  const cols: number[][] = []
  for (let j = 0; j < n; j++) {
    const e = Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))
    const x = solve(A, e)
    if (!x) return null
    cols.push(x)
  }
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]))
}

export type RegResult = { coef: number[]; b: number; se: number[]; seB: number; r2: number; sey: number; F: number; df: number; ssreg: number; ssresid: number }

/** Least squares fit of y on the columns of X; `constant` false forces b = 0. */
export function regress(y: number[], X: number[][], constant: boolean): RegResult | CellError {
  const n = y.length
  const k = X[0]?.length ?? 0
  if (!n || !k) return ERR.value
  const D = X.map((row) => (constant ? [...row, 1] : row))
  const p = D[0].length
  const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => D.reduce((s, row) => s + row[i] * row[j], 0)))
  const Xty = Array.from({ length: p }, (_, i) => D.reduce((s, row, r) => s + row[i] * y[r], 0))
  const beta = solve(XtX, Xty)
  if (!beta) return ERR.num
  const fitted = D.map((row) => row.reduce((s, v, i) => s + v * beta[i], 0))
  const ssresid = y.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0)
  const mean = constant ? y.reduce((s, v) => s + v, 0) / n : 0
  const sstot = y.reduce((s, v) => s + (v - mean) ** 2, 0)
  const ssreg = sstot - ssresid
  const df = n - p
  const r2 = sstot === 0 ? 1 : ssreg / sstot
  const sey = df > 0 ? Math.sqrt(ssresid / df) : NaN
  const inv = inverse(XtX)
  const se = inv ? inv.map((row, i) => Math.sqrt(Math.max(0, row[i]) * (ssresid / Math.max(1, df)))) : beta.map(() => NaN)
  const F = df > 0 && ssresid > 0 ? ssreg / (p - (constant ? 1 : 0)) / (ssresid / df) : NaN
  return { coef: beta.slice(0, k), b: constant ? beta[k] : 0, se: se.slice(0, k), seB: constant ? se[k] : NaN, r2, sey, F, df, ssreg, ssresid }
}

const num = (x: number): Scalar => (Number.isFinite(x) ? x : ERR.na)

function linestLike(name: string, exp: boolean) {
  fn(name, 1, 4, (args, ctx) => {
    const ym = argMatrix(args, 0, ctx)
    if (isErr(ym)) return ym
    const ys: number[] = []
    for (const v of ym.data) {
      if (typeof v !== 'number') return ERR.value
      if (exp && v <= 0) return ERR.num
      ys.push(exp ? Math.log(v) : v)
    }
    // known_xs: one column per variable when y is a column, one row per variable when y is a row
    let X: number[][]
    if (isOmitted(args, 1)) X = ys.map((_, i) => [i + 1])
    else {
      const xm = argMatrix(args, 1, ctx)
      if (isErr(xm)) return xm
      if (xm.data.some((v) => typeof v !== 'number')) return ERR.value
      if (xm.data.length === ys.length) X = xm.data.map((v) => [v as number])
      else if (ym.cols === 1 && xm.rows === ym.rows) X = xm.toRows() as number[][]
      else if (ym.rows === 1 && xm.cols === ym.cols) X = xm.transpose().toRows() as number[][]
      else return ERR.ref
    }
    const c = isOmitted(args, 2) ? true : toScalar(args[2], ctx)
    if (c instanceof CellError) return c
    const s = isOmitted(args, 3) ? false : toScalar(args[3], ctx)
    if (s instanceof CellError) return s
    const r = regress(ys, X, c !== false && c !== 0)
    if (isErr(r)) return r
    const k = r.coef.length
    const out = (v: number) => (exp ? Math.exp(v) : v)
    const top: Scalar[] = [...r.coef.slice().reverse().map(out), out(r.b)]
    if (!s || s === 0) return Matrix.from([top])
    const na = (n: number) => Array.from({ length: n }, () => ERR.na as Scalar)
    return Matrix.from([
      top,
      [...r.se.slice().reverse().map(num), c === false || c === 0 ? ERR.na : num(r.seB)],
      [num(r.r2), num(r.sey), ...na(k - 1)],
      [num(r.F), r.df, ...na(k - 1)],
      [num(r.ssreg), num(r.ssresid), ...na(k - 1)],
    ])
  })
}
linestLike('LINEST', false)
linestLike('LOGEST', true)

// ---------- BAHTTEXT ----------

const TH_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const TH_UNITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

function thaiBelowMillion(n: number): string {
  const digits = String(n).split('').map(Number)
  let out = ''
  digits.forEach((d, i) => {
    const pos = digits.length - 1 - i
    if (d === 0) return
    if (pos === 0 && d === 1 && digits.length > 1) out += 'เอ็ด'
    else if (pos === 1 && d === 1) out += 'สิบ'
    else if (pos === 1 && d === 2) out += 'ยี่สิบ'
    else out += TH_DIGITS[d] + TH_UNITS[pos]
  })
  return out
}

/** Thai text for a whole number (millions repeat "ล้าน"). */
function thaiNumber(n: number): string {
  if (n === 0) return TH_DIGITS[0]
  const parts: string[] = []
  let rest = n
  while (rest > 0) {
    parts.unshift(thaiBelowMillion(rest % 1000000))
    rest = Math.floor(rest / 1000000)
  }
  return parts.map((p, i) => p + (i < parts.length - 1 ? 'ล้าน' : '')).join('')
}

export function bahtText(value: number): string {
  const neg = value < 0
  const cents = Math.round(Math.abs(value) * 100)
  const baht = Math.floor(cents / 100)
  const satang = cents % 100
  let out = ''
  if (baht > 0) out += thaiNumber(baht) + 'บาท'
  if (satang > 0) out += thaiBelowMillion(satang) + 'สตางค์'
  else out += baht > 0 ? 'ถ้วน' : 'ศูนย์บาทถ้วน'
  return (neg ? 'ลบ' : '') + out
}

sfn('BAHTTEXT', 1, 1, ([a]) => {
  if (a instanceof CellError) return a
  const x = typeof a === 'number' ? a : typeof a === 'string' && a.trim() !== '' ? Number(a) : a === null ? 0 : NaN
  return Number.isFinite(x) ? bahtText(x) : ERR.value
})

// ---------- PHONETIC ----------

// Phonetic guides are not stored, so the text itself is returned (like the original for cells without guides).
fn('PHONETIC', 1, 1, (args, ctx) => {
  const v = args[0]
  if (v instanceof RefV) {
    const a = v.area
    let out = ''
    for (let r = a.r1; r <= a.r2; r++) for (let c = a.c1; c <= a.c2; c++) {
      const x = ctx.host.value(a.sheet, r, c)
      if (typeof x === 'string') out += x
    }
    return out
  }
  const s = toScalar(v, ctx)
  return typeof s === 'string' ? s : s instanceof CellError ? s : ERR.value
})

// ---------- TRIMRANGE ----------

fn('TRIMRANGE', 1, 3, (args, ctx) => {
  const v = args[0]
  if (!(v instanceof RefV) || v.areas.length !== 1) return v instanceof CellError ? v : ERR.value
  const rowsMode = isOmitted(args, 1) ? 3 : argNum(args, 1, ctx)
  const colsMode = isOmitted(args, 2) ? 3 : argNum(args, 2, ctx)
  if (isErr(rowsMode)) return rowsMode
  if (isErr(colsMode)) return colsMode
  const a = v.area
  const used = a.sheet.used()
  let { r1, c1, r2, c2 } = a
  r2 = Math.min(r2, Math.max(r1, used.r))
  c2 = Math.min(c2, Math.max(c1, used.c))
  const blank = (r: number, c: number) => {
    const x = ctx.host.value(a.sheet, r, c)
    return x === null || x === undefined
  }
  const rowBlank = (r: number) => {
    for (let c = c1; c <= c2; c++) if (!blank(r, c)) return false
    return true
  }
  const colBlank = (c: number) => {
    for (let r = r1; r <= r2; r++) if (!blank(r, c)) return false
    return true
  }
  if (rowsMode === 1 || rowsMode === 3) while (r1 < r2 && rowBlank(r1)) r1++
  if (rowsMode === 2 || rowsMode === 3) while (r2 > r1 && rowBlank(r2)) r2--
  if (colsMode === 1 || colsMode === 3) while (c1 < c2 && colBlank(c1)) c1++
  if (colsMode === 2 || colsMode === 3) while (c2 > c1 && colBlank(c2)) c2--
  if (r1 === r2 && c1 === c2 && blank(r1, c1)) return ERR.ref
  return ctx.host.makeRef(a.sheet, r1, Math.min(c1, MAX_COLS - 1), r2, c2)
})

// ---------- FILTERXML ----------

fn('FILTERXML', 2, 2, (args, ctx) => {
  const xml = toText(toScalar(args[0], ctx))
  const path = toText(toScalar(args[1], ctx))
  if (isErr(xml)) return xml
  if (isErr(path)) return path
  if (typeof DOMParser === 'undefined') return ERR.value
  const dom = new DOMParser().parseFromString(xml, 'text/xml')
  if (dom.getElementsByTagName('parsererror').length) return ERR.value
  let result: XPathResult
  try {
    result = dom.evaluate(path, dom, null, 7 /* ORDERED_NODE_SNAPSHOT_TYPE */, null)
  } catch {
    return ERR.value
  }
  const out: Scalar[] = []
  for (let i = 0; i < result.snapshotLength; i++) {
    const text = result.snapshotItem(i)?.textContent ?? ''
    const n = text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : null
    out.push(n ?? text)
  }
  if (!out.length) return ERR.value
  return out.length === 1 ? out[0] : Matrix.fill(out.length, 1, (r) => out[r])
})

// ---------- GROUPBY / PIVOTBY ----------

/** The aggregation argument: a LAMBDA, or a function name such as SUM (eta-reduced). */
function aggregator(v: Value, ctx: Ctx): ((vals: Scalar[]) => Scalar) | CellError {
  if (!(v instanceof LambdaV)) return v instanceof CellError ? v : ERR.value
  return (vals) => {
    const res = callLambda(v, [Matrix.fill(Math.max(1, vals.length), 1, (r) => vals[r] ?? null)], ctx)
    const s = res instanceof RefV ? toMatrix(res, ctx) : res
    if (s instanceof Matrix) return s.rows === 1 && s.cols === 1 ? s.get(0, 0) : ERR.calc
    return s instanceof LambdaV ? ERR.calc : (s as Scalar)
  }
}

type KeyRow = { key: string; vals: Scalar[] }

const keyOf = (vals: Scalar[]) => JSON.stringify(vals.map((v) => (v instanceof CellError ? v.code : typeof v === 'string' ? v.toUpperCase() : v)))

function compareKeys(a: Scalar[], b: Scalar[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = compareValues(a[i], b[i])
    if (d) return d
  }
  return 0
}

/** Header detection: the first row is text while the rest has numbers. */
function autoHeaders(values: Matrix): boolean {
  const first = values.row(0)
  return values.rows > 1 && first.every((v) => typeof v === 'string') && values.data.slice(values.cols).some((v) => typeof v === 'number')
}

function headerMode(args: Value[], i: number, values: Matrix, ctx: Ctx): { has: boolean; show: boolean } | CellError {
  if (isOmitted(args, i)) {
    const has = autoHeaders(values)
    return { has, show: has }
  }
  const m = argNum(args, i, ctx)
  if (isErr(m)) return m
  return { has: m === 1 || m === 3, show: m === 2 || m === 3 }
}

function filterRows(args: Value[], i: number, n: number, ctx: Ctx, offset: number): boolean[] | CellError {
  if (isOmitted(args, i)) return Array(n).fill(true)
  const m = argMatrix(args, i, ctx)
  if (isErr(m)) return m
  const list = m.data.slice(m.data.length > n ? offset : 0)
  if (list.length < n) return ERR.value
  return list.slice(0, n).map((v) => v === true || (typeof v === 'number' && v !== 0))
}

fn('GROUPBY', 3, 8, (args, ctx) => {
  const fields = argMatrix(args, 0, ctx)
  const values = argMatrix(args, 1, ctx)
  if (isErr(fields)) return fields
  if (isErr(values)) return values
  if (fields.rows !== values.rows) return ERR.value
  const agg = aggregator(args[2], ctx)
  if (isErr(agg)) return agg
  const hm = headerMode(args, 3, values, ctx)
  if (isErr(hm)) return hm
  const depth = isOmitted(args, 4) ? 1 : argNum(args, 4, ctx)
  if (isErr(depth)) return depth
  const sortBy = isOmitted(args, 5) ? 1 : argNum(args, 5, ctx)
  if (isErr(sortBy)) return sortBy
  const start = hm.has ? 1 : 0
  const keep = filterRows(args, 6, values.rows - start, ctx, start)
  if (isErr(keep)) return keep
  const k = fields.cols
  const m = values.cols
  const groups = new Map<string, { vals: Scalar[]; rows: number[] }>()
  for (let r = start; r < values.rows; r++) {
    if (!keep[r - start]) continue
    const kv = fields.row(r)
    const key = keyOf(kv)
    const g = groups.get(key) ?? { vals: kv, rows: [] }
    g.rows.push(r)
    groups.set(key, g)
  }
  const aggregate = (rows: number[]) => Array.from({ length: m }, (_, j) => agg(rows.map((r) => values.get(r, j))))
  let list: { vals: Scalar[]; out: Scalar[]; rows: number[] }[] = [...groups.values()].map((g) => ({ vals: g.vals, rows: g.rows, out: aggregate(g.rows) }))
  const col = Math.abs(Math.trunc(sortBy)) - 1
  const dir = sortBy < 0 ? -1 : 1
  list.sort((a, b) => {
    const d = col < k ? compareValues(a.vals[col], b.vals[col]) : compareValues(a.out[col - k] ?? null, b.out[col - k] ?? null)
    return d * dir || compareKeys(a.vals, b.vals)
  })
  const rowsOut: Scalar[][] = []
  if (hm.show) rowsOut.push([...(hm.has ? fields.row(0) : Array.from({ length: k }, (_, i) => `Row Field ${i + 1}`)), ...(hm.has ? values.row(0) : Array.from({ length: m }, (_, i) => `Value ${i + 1}`))])
  const absDepth = Math.abs(depth)
  if (absDepth >= 2 && k >= 2) {
    // subtotals per first-field item
    const out: Scalar[][] = []
    const firsts = new Map<string, typeof list>()
    for (const g of list) {
      const fk = keyOf([g.vals[0]])
      firsts.set(fk, [...(firsts.get(fk) ?? []), g])
    }
    for (const items of firsts.values()) {
      const sub = [items[0].vals[0], ...Array(k - 1).fill(null), ...aggregate(items.flatMap((g) => g.rows))]
      if (depth < 0) out.push(sub)
      for (const g of items) out.push([...g.vals, ...g.out])
      if (depth > 0) out.push(sub)
    }
    list = []
    rowsOut.push(...out)
  } else for (const g of list) rowsOut.push([...g.vals, ...g.out])
  if (depth !== 0) {
    const all = [...groups.values()].flatMap((g) => g.rows)
    const total = ['Total', ...Array(k - 1).fill(null), ...aggregate(all)]
    if (depth < 0) rowsOut.splice(hm.show ? 1 : 0, 0, total)
    else rowsOut.push(total)
  }
  if (!rowsOut.length) return ERR.calc
  return Matrix.from(rowsOut)
})

fn('PIVOTBY', 4, 11, (args, ctx) => {
  const rf = argMatrix(args, 0, ctx)
  const cf = argMatrix(args, 1, ctx)
  const values = argMatrix(args, 2, ctx)
  if (isErr(rf)) return rf
  if (isErr(cf)) return cf
  if (isErr(values)) return values
  if (rf.rows !== values.rows || cf.rows !== values.rows) return ERR.value
  const agg = aggregator(args[3], ctx)
  if (isErr(agg)) return agg
  const hm = headerMode(args, 4, values, ctx)
  if (isErr(hm)) return hm
  const rowTotals = isOmitted(args, 5) ? 1 : argNum(args, 5, ctx)
  const rowSort = isOmitted(args, 6) ? 1 : argNum(args, 6, ctx)
  const colTotals = isOmitted(args, 7) ? 1 : argNum(args, 7, ctx)
  const colSort = isOmitted(args, 8) ? 1 : argNum(args, 8, ctx)
  for (const x of [rowTotals, rowSort, colTotals, colSort]) if (isErr(x)) return x
  const start = hm.has ? 1 : 0
  const keep = filterRows(args, 9, values.rows - start, ctx, start)
  if (isErr(keep)) return keep
  const rowKeys = new Map<string, KeyRow>()
  const colKeys = new Map<string, KeyRow>()
  const cells = new Map<string, number[]>()
  for (let r = start; r < values.rows; r++) {
    if (!keep[r - start]) continue
    const rk = keyOf(rf.row(r))
    const ck = keyOf(cf.row(r))
    if (!rowKeys.has(rk)) rowKeys.set(rk, { key: rk, vals: rf.row(r) })
    if (!colKeys.has(ck)) colKeys.set(ck, { key: ck, vals: cf.row(r) })
    const id = rk + '\u0000' + ck
    cells.set(id, [...(cells.get(id) ?? []), r])
  }
  const order = (list: KeyRow[], dir: number) => list.sort((a, b) => compareKeys(a.vals, b.vals) * (dir < 0 ? -1 : 1))
  const rows = order([...rowKeys.values()], rowSort as number)
  const cols = order([...colKeys.values()], colSort as number)
  const m = values.cols
  const rowsOfKey = (rk: string | null, ck: string | null) => {
    const out: number[] = []
    for (const [id, list] of cells) {
      const [a, b] = id.split('\u0000')
      if ((rk === null || a === rk) && (ck === null || b === ck)) out.push(...list)
    }
    return out
  }
  const value = (rk: string | null, ck: string | null, j: number) => {
    const list = rowsOfKey(rk, ck)
    return list.length ? agg(list.map((r) => values.get(r, j))) : null
  }
  const nr = rf.cols
  const colSpec: { ck: string | null; j: number }[] = []
  for (const c of cols) for (let j = 0; j < m; j++) colSpec.push({ ck: c.key, j })
  if (colTotals) for (let j = 0; j < m; j++) colSpec.push({ ck: null, j })
  if ((colTotals as number) < 0) colSpec.unshift(...colSpec.splice(colSpec.length - m, m))
  const out: Scalar[][] = []
  // header rows: one per column field, plus value names when there are several values
  for (let f = 0; f < cf.cols; f++) out.push([...Array(nr).fill(null), ...colSpec.map((s) => (s.ck === null ? (f === 0 ? 'Total' : null) : colKeys.get(s.ck)!.vals[f]))])
  if (m > 1 || hm.show) out.push([...(hm.show && hm.has ? rf.row(0) : Array(nr).fill(null)), ...colSpec.map((s) => (hm.has ? values.get(0, s.j) : m > 1 ? `Value ${s.j + 1}` : null))])
  const body = rows.map((rk) => [...rk.vals, ...colSpec.map((s) => value(rk.key, s.ck, s.j))])
  const total = ['Total', ...Array(nr - 1).fill(null), ...colSpec.map((s) => value(null, s.ck, s.j))]
  if ((rowTotals as number) < 0) out.push(total)
  out.push(...body)
  if ((rowTotals as number) > 0) out.push(total)
  return Matrix.from(out)
})

// ---------- GETPIVOTDATA ----------

function pivotAggregate(fnName: string, nums: number[], count: number): Scalar {
  const n = nums.length
  const sum = nums.reduce((a, b) => a + b, 0)
  switch (fnName) {
    case 'count': return count
    case 'countNums': return n
    case 'average': return n ? sum / n : ERR.div0
    case 'max': return n ? Math.max(...nums) : 0
    case 'min': return n ? Math.min(...nums) : 0
    case 'product': return n ? nums.reduce((a, b) => a * b, 1) : 0
    case 'stdDev':
    case 'var': {
      if (n < 2) return ERR.div0
      const mean = sum / n
      const v = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
      return fnName === 'var' ? v : Math.sqrt(v)
    }
    default: return sum
  }
}

const FN_LABELS: Record<string, string> = { sum: 'Sum', count: 'Count', average: 'Average', max: 'Max', min: 'Min', product: 'Product', countNums: 'Count Numbers', stdDev: 'StdDev', var: 'Var' }

fn('GETPIVOTDATA', 2, VARARGS, (args, ctx) => {
  const field = toText(toScalar(args[0], ctx))
  if (isErr(field)) return field
  const ref = args[1]
  if (!(ref instanceof RefV)) return ERR.ref
  if ((args.length - 2) % 2) return ERR.ref
  const at = ref.area
  const found = ctx.host.pivots?.().find(({ sheet, pivot }) => {
    const o = pivot.output
    return sheet === at.sheet && (o ? at.r1 >= o.r1 && at.r1 <= o.r2 && at.c1 >= o.c1 && at.c1 <= o.c2 : at.r1 === pivot.r && at.c1 === pivot.c)
  })
  if (!found) return ERR.ref
  const p = found.pivot
  const want = field.trim().toUpperCase()
  const val = p.values.find((v) => (v.name ?? `${FN_LABELS[v.fn] ?? v.fn} of ${v.field}`).toUpperCase() === want || v.field.toUpperCase() === want)
  if (!val) return ERR.ref
  // read the source range
  const m = matchRef(p.source, 0)
  if (!m) return ERR.ref
  const sheet = m.parts.sheet !== undefined ? ctx.host.sheetNamed(m.parts.sheet) : found.sheet
  if (!sheet) return ERR.ref
  const area = refArea(m.parts)
  const used = sheet.used()
  const r2 = Math.min(area.r2, used.r)
  const headers: string[] = []
  for (let c = area.c1; c <= area.c2; c++) headers.push(String(ctx.host.value(sheet, area.r1, c) ?? '').toUpperCase())
  const vi = headers.indexOf(val.field.toUpperCase())
  if (vi < 0) return ERR.ref
  const conds: { col: number; item: Scalar }[] = []
  for (let i = 2; i < args.length; i += 2) {
    const f = toText(toScalar(args[i], ctx))
    if (isErr(f)) return f
    const col = headers.indexOf(f.toUpperCase())
    if (col < 0 || ![...p.rows, ...p.cols, ...p.filters.map((x) => x.field)].some((x) => x.toUpperCase() === f.toUpperCase())) return ERR.ref
    conds.push({ col, item: toScalar(args[i + 1], ctx) })
  }
  const nums: number[] = []
  let count = 0
  let matched = false
  for (let r = area.r1 + 1; r <= r2; r++) {
    const ok = conds.every(({ col, item }) => {
      const v = ctx.host.value(sheet, r, area.c1 + col)
      return compareValues(v, item) === 0 || (typeof item === 'string' && String(v ?? '').toUpperCase() === item.toUpperCase())
    })
    if (!ok) continue
    matched = true
    const v = ctx.host.value(sheet, r, area.c1 + vi)
    if (v !== null && v !== '') count++
    if (typeof v === 'number') nums.push(v)
  }
  if (!matched) return ERR.ref
  return pivotAggregate(val.fn, nums, count)
}, { volatile: true })

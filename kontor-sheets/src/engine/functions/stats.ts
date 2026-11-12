import { fn, alias, VARARGS } from '../registry'
import { collectNumbers, eachCell, flatten, type Ctx, type Value } from '../values'
import { CellError, ERR, Matrix, RefV, argMatrix, argNum, isErr, N, optN, sfn, toMatrix, B } from './helpers'
import { combin, gamma, lnGamma } from './math'
import type { Scalar } from '../../model/types'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const mean = (xs: number[]) => sum(xs) / xs.length

function variance(xs: number[], sample: boolean): number | CellError {
  const n = xs.length
  if (n < (sample ? 2 : 1)) return ERR.div0
  const m = mean(xs)
  return xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (sample ? n - 1 : n)
}

function median(xs: number[]): number | CellError {
  if (!xs.length) return ERR.num
  const s = xs.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function modes(xs: number[]): number[] {
  const counts = new Map<number, number>()
  const order: number[] = []
  for (const x of xs) {
    if (!counts.has(x)) order.push(x)
    counts.set(x, (counts.get(x) ?? 0) + 1)
  }
  const max = Math.max(0, ...counts.values())
  if (max < 2) return []
  return order.filter((x) => counts.get(x) === max)
}

function percentileInc(xs: number[], k: number): number | CellError {
  if (!xs.length || k < 0 || k > 1) return ERR.num
  const s = xs.slice().sort((a, b) => a - b)
  const h = (s.length - 1) * k
  const lo = Math.floor(h)
  return s[lo] + (h - lo) * ((s[lo + 1] ?? s[lo]) - s[lo])
}

function percentileExc(xs: number[], k: number): number | CellError {
  const n = xs.length
  if (!n || k <= 0 || k >= 1) return ERR.num
  const s = xs.slice().sort((a, b) => a - b)
  const h = (n + 1) * k
  if (h < 1 || h > n) return ERR.num
  const lo = Math.floor(h)
  return s[lo - 1] + (h - lo) * ((s[lo] ?? s[lo - 1]) - s[lo - 1])
}

function kth(xs: number[], k: number, largest: boolean): number | CellError {
  const i = Math.ceil(k) - 1
  if (i < 0 || i >= xs.length) return ERR.num
  const s = xs.slice().sort((a, b) => (largest ? b - a : a - b))
  return s[i]
}

/** Shared by SUBTOTAL and AGGREGATE. */
export function aggregateBy(code: number, vals: Scalar[], k?: number): Scalar {
  const nums = vals.filter((v): v is number => typeof v === 'number')
  switch (code) {
    case 1: return nums.length ? mean(nums) : ERR.div0
    case 2: return nums.length
    case 3: return vals.filter((v) => v !== null).length
    case 4: return nums.length ? Math.max(...nums) : 0
    case 5: return nums.length ? Math.min(...nums) : 0
    case 6: return nums.length ? nums.reduce((a, b) => a * b, 1) : 0
    case 7: { const v = variance(nums, true); return isErr(v) ? v : Math.sqrt(v) }
    case 8: { const v = variance(nums, false); return isErr(v) ? v : Math.sqrt(v) }
    case 9: return sum(nums)
    case 10: return variance(nums, true)
    case 11: return variance(nums, false)
    case 12: return median(nums)
    case 13: { const m = modes(nums); return m.length ? m[0] : ERR.na }
    case 14: return k === undefined ? ERR.value : kth(nums, k, true)
    case 15: return k === undefined ? ERR.value : kth(nums, k, false)
    case 16: return k === undefined ? ERR.value : percentileInc(nums, k)
    case 17: return k === undefined ? ERR.value : percentileInc(nums, Math.trunc(k) / 4)
    case 18: return k === undefined ? ERR.value : percentileExc(nums, k)
    case 19: return k === undefined ? ERR.value : percentileExc(nums, Math.trunc(k) / 4)
    default: return ERR.value
  }
}

function agg(name: string, f: (xs: number[]) => Scalar, mode: 'plain' | 'a' = 'plain', min = 1) {
  fn(name, min, VARARGS, (args, ctx) => {
    const xs = collectNumbers(args, ctx, mode)
    return isErr(xs) ? xs : f(xs)
  })
}

agg('AVERAGE', (xs) => (xs.length ? mean(xs) : ERR.div0))
agg('AVERAGEA', (xs) => (xs.length ? mean(xs) : ERR.div0), 'a')
agg('MAX', (xs) => (xs.length ? Math.max(...xs) : 0))
agg('MAXA', (xs) => (xs.length ? Math.max(...xs) : 0), 'a')
agg('MIN', (xs) => (xs.length ? Math.min(...xs) : 0))
agg('MINA', (xs) => (xs.length ? Math.min(...xs) : 0), 'a')
agg('MEDIAN', median)
agg('STDEV.S', (xs) => { const v = variance(xs, true); return isErr(v) ? v : Math.sqrt(v) })
agg('STDEV.P', (xs) => { const v = variance(xs, false); return isErr(v) ? v : Math.sqrt(v) })
agg('STDEVA', (xs) => { const v = variance(xs, true); return isErr(v) ? v : Math.sqrt(v) }, 'a')
agg('STDEVPA', (xs) => { const v = variance(xs, false); return isErr(v) ? v : Math.sqrt(v) }, 'a')
agg('VAR.S', (xs) => variance(xs, true))
agg('VAR.P', (xs) => variance(xs, false))
agg('VARA', (xs) => variance(xs, true), 'a')
agg('VARPA', (xs) => variance(xs, false), 'a')
alias('STDEV', 'STDEV.S')
alias('STDEVP', 'STDEV.P')
alias('VAR', 'VAR.S')
alias('VARP', 'VAR.P')
agg('MODE.SNGL', (xs) => { const m = modes(xs); return m.length ? m[0] : ERR.na })
alias('MODE', 'MODE.SNGL')
fn('MODE.MULT', 1, VARARGS, (args, ctx) => {
  const xs = collectNumbers(args, ctx)
  if (isErr(xs)) return xs
  const m = modes(xs)
  return m.length ? Matrix.fill(m.length, 1, (r) => m[r]) : ERR.na
})
agg('AVEDEV', (xs) => { if (!xs.length) return ERR.num; const m = mean(xs); return mean(xs.map((x) => Math.abs(x - m))) })
agg('DEVSQ', (xs) => { if (!xs.length) return 0; const m = mean(xs); return sum(xs.map((x) => (x - m) ** 2)) })
agg('GEOMEAN', (xs) => (!xs.length || xs.some((x) => x <= 0) ? ERR.num : Math.exp(mean(xs.map(Math.log)))))
agg('HARMEAN', (xs) => (!xs.length || xs.some((x) => x <= 0) ? ERR.num : xs.length / sum(xs.map((x) => 1 / x))))
agg('KURT', (xs) => {
  const n = xs.length
  if (n < 4) return ERR.div0
  const m = mean(xs)
  const s = Math.sqrt(variance(xs, true) as number)
  if (s === 0) return ERR.div0
  const k = sum(xs.map((x) => ((x - m) / s) ** 4))
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * k - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
})
agg('SKEW', (xs) => {
  const n = xs.length
  if (n < 3) return ERR.div0
  const m = mean(xs)
  const s = Math.sqrt(variance(xs, true) as number)
  if (s === 0) return ERR.div0
  return (n / ((n - 1) * (n - 2))) * sum(xs.map((x) => ((x - m) / s) ** 3))
})
agg('SKEW.P', (xs) => {
  const n = xs.length
  if (n < 1) return ERR.div0
  const m = mean(xs)
  const s = Math.sqrt(variance(xs, false) as number)
  if (s === 0) return ERR.div0
  return sum(xs.map((x) => ((x - m) / s) ** 3)) / n
})

fn('COUNT', 1, VARARGS, (args, ctx) => {
  let n = 0
  for (const a of args) {
    if (a instanceof RefV) eachCell(a, ctx, (v) => { if (typeof v === 'number') n++ })
    else if (a instanceof Matrix) n += a.data.filter((v) => typeof v === 'number').length
    else if (typeof a === 'number') n++
    else if (typeof a === 'boolean') n++
    else if (typeof a === 'string' && !Number.isNaN(Number(a)) && a.trim() !== '') n++
  }
  return n
})

fn('COUNTA', 1, VARARGS, (args, ctx) => {
  let n = 0
  for (const a of args) {
    if (a instanceof RefV) eachCell(a, ctx, (v) => { if (v !== null) n++ })
    else if (a instanceof Matrix) n += a.data.filter((v) => v !== null).length
    else if (a !== null && a !== undefined) n++
  }
  return n
})

fn('COUNTBLANK', 1, 1, (args, ctx) => {
  const a = args[0]
  if (!(a instanceof RefV)) return ERR.value
  let filled = 0
  eachCell(a, ctx, (v) => { if (v !== null && v !== '') filled++ })
  return a.rows * a.cols - filled
})

function largeSmall(name: string, largest: boolean) {
  fn(name, 2, 2, (args, ctx) => {
    const xs = collectNumbers([args[0]], ctx)
    if (isErr(xs)) return xs
    const km = toMatrix(args[1], ctx)
    if (isErr(km)) return km
    const one = (k: Scalar) => {
      const n = N(k)
      return isErr(n) ? n : kth(xs, n, largest)
    }
    return km.rows === 1 && km.cols === 1 ? one(km.get(0, 0)) : km.map(one)
  })
}
largeSmall('LARGE', true)
largeSmall('SMALL', false)

function percentileFn(name: string, f: (xs: number[], k: number) => number | CellError, quart = false) {
  fn(name, 2, 2, (args, ctx) => {
    const xs = collectNumbers([args[0]], ctx)
    if (isErr(xs)) return xs
    const k = argNum(args, 1, ctx)
    if (isErr(k)) return k
    if (quart) {
      const q = Math.trunc(k)
      if (q < 0 || q > 4) return ERR.num
      return f(xs, q / 4)
    }
    return f(xs, k)
  })
}
percentileFn('PERCENTILE.INC', percentileInc)
percentileFn('PERCENTILE.EXC', percentileExc)
percentileFn('QUARTILE.INC', percentileInc, true)
percentileFn('QUARTILE.EXC', (xs, k) => (k <= 0 || k >= 1 ? ERR.num : percentileExc(xs, k)), true)
alias('PERCENTILE', 'PERCENTILE.INC')
alias('QUARTILE', 'QUARTILE.INC')

function percentRank(xs: number[], x: number, sig: number, exc: boolean): number | CellError {
  const s = xs.slice().sort((a, b) => a - b)
  const n = s.length
  if (!n || x < s[0] || x > s[n - 1]) return ERR.na
  let lo = 0
  while (lo < n && s[lo] < x) lo++
  let rank: number
  if (s[lo] === x) {
    rank = exc ? (lo + 1) / (n + 1) : n === 1 ? 1 : lo / (n - 1)
  } else {
    const below = lo - 1
    const frac = (x - s[below]) / (s[lo] - s[below])
    rank = exc ? (below + 1 + frac) / (n + 1) : (below + frac) / (n - 1)
  }
  const f = Math.pow(10, sig)
  return Math.floor(rank * f + 1e-9) / f
}
function percentRankFn(name: string, exc: boolean) {
  fn(name, 2, 3, (args, ctx) => {
    const xs = collectNumbers([args[0]], ctx)
    if (isErr(xs)) return xs
    const x = argNum(args, 1, ctx)
    const sig = argNum(args, 2, ctx, 3)
    if (isErr(x)) return x
    if (isErr(sig)) return sig
    if (sig < 1) return ERR.num
    return percentRank(xs, x, Math.trunc(sig), exc)
  })
}
percentRankFn('PERCENTRANK.INC', false)
percentRankFn('PERCENTRANK.EXC', true)
alias('PERCENTRANK', 'PERCENTRANK.INC')

function rankFn(name: string, avg: boolean) {
  fn(name, 2, 3, (args, ctx) => {
    const x = argNum(args, 0, ctx)
    if (isErr(x)) return x
    const xs = collectNumbers([args[1]], ctx)
    if (isErr(xs)) return xs
    const order = argNum(args, 2, ctx, 0)
    if (isErr(order)) return order
    const asc = order !== 0
    const better = xs.filter((v) => (asc ? v < x : v > x)).length
    const ties = xs.filter((v) => v === x).length
    if (!ties) return ERR.na
    return avg ? better + (ties + 1) / 2 : better + 1
  })
}
rankFn('RANK.EQ', false)
rankFn('RANK.AVG', true)
alias('RANK', 'RANK.EQ')

fn('TRIMMEAN', 2, 2, (args, ctx) => {
  const xs = collectNumbers([args[0]], ctx)
  if (isErr(xs)) return xs
  const p = argNum(args, 1, ctx)
  if (isErr(p)) return p
  if (p < 0 || p >= 1) return ERR.num
  const s = xs.slice().sort((a, b) => a - b)
  const cut = Math.floor((s.length * p) / 2)
  const t = s.slice(cut, s.length - cut)
  return t.length ? mean(t) : ERR.num
})

sfn('STANDARDIZE', 3, 3, ([a, b, c]) => {
  const x = N(a)
  const m = N(b)
  const s = N(c)
  if (isErr(x)) return x
  if (isErr(m)) return m
  if (isErr(s)) return s
  if (s <= 0) return ERR.num
  return (x - m) / s
})

// ---------- two-variable statistics ----------

function pairs(args: Value[], ctx: Ctx): [number[], number[]] | CellError {
  const a = argMatrix(args, 0, ctx)
  const b = argMatrix(args, 1, ctx)
  if (isErr(a)) return a
  if (isErr(b)) return b
  if (a.data.length !== b.data.length) return ERR.na
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i]
    const y = b.data[i]
    if (x instanceof CellError) return x
    if (y instanceof CellError) return y
    if (typeof x === 'number' && typeof y === 'number') {
      xs.push(x)
      ys.push(y)
    }
  }
  return [xs, ys]
}

function pairFn(name: string, f: (ys: number[], xs: number[]) => Scalar, swap = false) {
  fn(name, 2, 2, (args, ctx) => {
    const p = pairs(args, ctx)
    if (isErr(p)) return p
    return swap ? f(p[1], p[0]) : f(p[0], p[1])
  })
}

function covariance(xs: number[], ys: number[], sample: boolean): Scalar {
  const n = xs.length
  if (n < (sample ? 2 : 1)) return ERR.div0
  const mx = mean(xs)
  const my = mean(ys)
  let s = 0
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my)
  return s / (sample ? n - 1 : n)
}

function correl(xs: number[], ys: number[]): Scalar {
  const n = xs.length
  if (n < 2) return ERR.div0
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  if (sxx === 0 || syy === 0) return ERR.div0
  return sxy / Math.sqrt(sxx * syy)
}

function linreg(ys: number[], xs: number[]): { slope: number; intercept: number } | CellError {
  const n = xs.length
  if (n < 1) return ERR.div0
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
  }
  if (sxx === 0) return ERR.div0
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

pairFn('CORREL', correl)
pairFn('PEARSON', correl)
pairFn('RSQ', (a, b) => {
  const r = correl(a, b)
  return typeof r === 'number' ? r * r : r
})
pairFn('COVARIANCE.P', (a, b) => covariance(a, b, false))
pairFn('COVARIANCE.S', (a, b) => covariance(a, b, true))
alias('COVAR', 'COVARIANCE.P')
pairFn('SLOPE', (ys, xs) => {
  const r = linreg(ys, xs)
  return isErr(r) ? r : r.slope
})
pairFn('INTERCEPT', (ys, xs) => {
  const r = linreg(ys, xs)
  return isErr(r) ? r : r.intercept
})
pairFn('STEYX', (ys, xs) => {
  const n = xs.length
  if (n < 3) return ERR.div0
  const r = linreg(ys, xs)
  if (isErr(r)) return r
  let s = 0
  for (let i = 0; i < n; i++) s += (ys[i] - (r.intercept + r.slope * xs[i])) ** 2
  return Math.sqrt(s / (n - 2))
})

fn('FORECAST.LINEAR', 3, 3, (args, ctx) => {
  const x = argNum(args, 0, ctx)
  if (isErr(x)) return x
  const p = pairs([args[1], args[2]], ctx)
  if (isErr(p)) return p
  const r = linreg(p[0], p[1])
  return isErr(r) ? r : r.intercept + r.slope * x
})
alias('FORECAST', 'FORECAST.LINEAR')

function trendLike(name: string, exp: boolean) {
  fn(name, 1, 4, (args, ctx) => {
    const ym = argMatrix(args, 0, ctx)
    if (isErr(ym)) return ym
    const ys = ym.data.map((v) => (typeof v === 'number' ? v : NaN))
    if (ys.some(Number.isNaN)) return ERR.value
    const xm = args.length > 1 && !(args[1] === null) ? argMatrix(args, 1, ctx) : null
    const xs = xm && !isErr(xm) ? xm.data.map((v) => (typeof v === 'number' ? v : NaN)) : ys.map((_, i) => i + 1)
    if (xs.length !== ys.length) return ERR.ref
    const target = exp ? ys.map((y) => (y > 0 ? Math.log(y) : NaN)) : ys
    if (target.some(Number.isNaN)) return ERR.num
    const r = linreg(target, xs)
    if (isErr(r)) return r
    const nm = args.length > 2 ? argMatrix(args, 2, ctx) : null
    const newX = nm && !isErr(nm) ? nm : xm && !isErr(xm) ? xm : Matrix.fill(ym.rows, ym.cols, (i, j) => i * ym.cols + j + 1)
    return newX.map((v) => {
      if (typeof v !== 'number') return ERR.value
      const y = r.intercept + r.slope * v
      return exp ? Math.exp(y) : y
    })
  })
}
trendLike('TREND', false)
trendLike('GROWTH', true)

fn('LINEST', 1, 4, (args, ctx) => {
  const ym = argMatrix(args, 0, ctx)
  if (isErr(ym)) return ym
  const ys = ym.data.map(Number)
  const xm = args.length > 1 ? argMatrix(args, 1, ctx) : null
  const xs = xm && !isErr(xm) ? xm.data.map(Number) : ys.map((_, i) => i + 1)
  const r = linreg(ys, xs)
  if (isErr(r)) return r
  return Matrix.from([[r.slope, r.intercept]])
})

fn('LOGEST', 1, 4, (args, ctx) => {
  const ym = argMatrix(args, 0, ctx)
  if (isErr(ym)) return ym
  const ys = ym.data.map((v) => Math.log(Number(v)))
  const xm = args.length > 1 ? argMatrix(args, 1, ctx) : null
  const xs = xm && !isErr(xm) ? xm.data.map(Number) : ys.map((_, i) => i + 1)
  const r = linreg(ys, xs)
  if (isErr(r)) return r
  return Matrix.from([[Math.exp(r.slope), Math.exp(r.intercept)]])
})

fn('FREQUENCY', 2, 2, (args, ctx) => {
  const data = collectNumbers([args[0]], ctx)
  const bins = collectNumbers([args[1]], ctx)
  if (isErr(data)) return data
  if (isErr(bins)) return bins
  const sorted = bins.slice().sort((a, b) => a - b)
  const counts = new Array(sorted.length + 1).fill(0)
  for (const x of data) {
    let i = 0
    while (i < sorted.length && x > sorted[i]) i++
    counts[i]++
  }
  // results follow the original bin order
  const byBin = bins.map((b) => counts[sorted.indexOf(b)])
  return Matrix.fill(bins.length + 1, 1, (r) => (r < bins.length ? byBin[r] : counts[sorted.length]))
})

fn('PROB', 3, 4, (args, ctx) => {
  const p = pairs([args[0], args[1]], ctx)
  if (isErr(p)) return p
  const lo = argNum(args, 2, ctx)
  if (isErr(lo)) return lo
  const hi = argNum(args, 3, ctx, lo)
  if (isErr(hi)) return hi
  const [xs, ps] = p
  if (Math.abs(sum(ps) - 1) > 1e-9) return ERR.num
  return xs.reduce((acc, x, i) => (x >= lo && x <= hi ? acc + ps[i] : acc), 0)
})

sfn('PERMUT', 2, 2, ([a, b]) => {
  const n = N(a)
  const k = N(b)
  if (isErr(n)) return n
  if (isErr(k)) return k
  const nn = Math.trunc(n)
  const kk = Math.trunc(k)
  if (nn < 0 || kk < 0 || kk > nn) return ERR.num
  let r = 1
  for (let i = 0; i < kk; i++) r *= nn - i
  return r
})
sfn('PERMUTATIONA', 2, 2, ([a, b]) => {
  const n = N(a)
  const k = N(b)
  if (isErr(n)) return n
  if (isErr(k)) return k
  if (n < 0 || k < 0) return ERR.num
  return Math.pow(Math.trunc(n), Math.trunc(k))
})
sfn('FISHER', 1, 1, ([a]) => {
  const x = N(a)
  if (isErr(x)) return x
  if (x <= -1 || x >= 1) return ERR.num
  return 0.5 * Math.log((1 + x) / (1 - x))
})
sfn('FISHERINV', 1, 1, ([a]) => {
  const y = N(a)
  if (isErr(y)) return y
  return Math.tanh(y)
})

// ---------- special functions ----------

function gser(a: number, x: number): number {
  let sumv = 1 / a
  let del = sumv
  let ap = a
  for (let n = 0; n < 500; n++) {
    ap += 1
    del *= x / ap
    sumv += del
    if (Math.abs(del) < Math.abs(sumv) * 1e-16) break
  }
  return sumv * Math.exp(-x + a * Math.log(x) - lnGamma(a))
}

function gcf(a: number, x: number): number {
  let b = x + 1 - a
  let c = 1 / 1e-300
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0
  return x < a + 1 ? gser(a, x) : 1 - gcf(a, x)
}

function betacf(a: number, b: number, x: number): number {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-300) d = 1e-300
  d = 1 / d
  let h = d
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
export function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

export function erf(x: number): number {
  return x >= 0 ? gammaP(0.5, x * x) : -gammaP(0.5, x * x)
}

export function normCdf(z: number): number {
  return z < 0 ? 0.5 * (1 - erf(-z / Math.SQRT2)) : 0.5 * (1 + erf(z / Math.SQRT2))
}

const normPdf = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)

export function normInv(p: number): number {
  // Acklam's rational approximation with one Halley refinement step
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  let x: number
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - pl) {
    const q = p - 0.5
    const r = q * q
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const e = normCdf(x) - p
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
}

/** Inverts a monotonic CDF by bisection. */
function invert(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  while (cdf(hi) < p && hi < 1e10) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (cdf(mid) < p) lo = mid
    else hi = mid
    if (hi - lo < 1e-15 * Math.max(1, Math.abs(mid))) break
  }
  return (lo + hi) / 2
}

const tCdf = (t: number, df: number) => {
  const x = df / (df + t * t)
  const tail = 0.5 * betaI(x, df / 2, 0.5)
  return t >= 0 ? 1 - tail : tail
}
const tPdf = (t: number, df: number) => Math.exp(lnGamma((df + 1) / 2) - lnGamma(df / 2)) / Math.sqrt(df * Math.PI) * Math.pow(1 + (t * t) / df, -(df + 1) / 2)
const chiCdf = (x: number, k: number) => gammaP(k / 2, x / 2)
const chiPdf = (x: number, k: number) => (x <= 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lnGamma(k / 2)))
const fCdf = (x: number, d1: number, d2: number) => (x <= 0 ? 0 : betaI((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2))
const fPdf = (x: number, d1: number, d2: number) =>
  x <= 0 ? 0 : Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - (lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2)))

function nums(a: Scalar[], count: number): number[] | CellError {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const n = N(a[i] ?? null)
    if (isErr(n)) return n
    out.push(n)
  }
  return out
}

function dist(name: string, count: number, f: (x: number[], cum: boolean, a: Scalar[]) => Scalar, cumIndex = count) {
  sfn(name, count + (cumIndex === count ? 1 : 0), count + 1, (a) => {
    const xs = nums(a, count)
    if (isErr(xs)) return xs
    const cum = cumIndex < 0 ? true : B(a[cumIndex] ?? false)
    if (isErr(cum)) return cum
    return f(xs, cum, a)
  })
}

dist('NORM.DIST', 3, ([x, m, s], cum) => (s <= 0 ? ERR.num : cum ? normCdf((x - m) / s) : normPdf((x - m) / s) / s))
alias('NORMDIST', 'NORM.DIST')
sfn('NORM.S.DIST', 2, 2, (a) => {
  const z = N(a[0])
  const cum = B(a[1])
  if (isErr(z)) return z
  if (isErr(cum)) return cum
  return cum ? normCdf(z) : normPdf(z)
})
sfn('NORMSDIST', 1, 1, ([a]) => { const z = N(a); return isErr(z) ? z : normCdf(z) })
sfn('NORM.INV', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [p, m, s] = xs
  if (p <= 0 || p >= 1 || s <= 0) return ERR.num
  return m + s * normInv(p)
})
alias('NORMINV', 'NORM.INV')
sfn('NORM.S.INV', 1, 1, ([a]) => {
  const p = N(a)
  if (isErr(p)) return p
  if (p <= 0 || p >= 1) return ERR.num
  return normInv(p)
})
alias('NORMSINV', 'NORM.S.INV')
sfn('PHI', 1, 1, ([a]) => { const z = N(a); return isErr(z) ? z : normPdf(z) })
sfn('GAUSS', 1, 1, ([a]) => { const z = N(a); return isErr(z) ? z : normCdf(z) - 0.5 })
dist('LOGNORM.DIST', 3, ([x, m, s], cum) => {
  if (x <= 0 || s <= 0) return ERR.num
  const z = (Math.log(x) - m) / s
  return cum ? normCdf(z) : normPdf(z) / (x * s)
})
sfn('LOGNORMDIST', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [x, m, s] = xs
  if (x <= 0 || s <= 0) return ERR.num
  return normCdf((Math.log(x) - m) / s)
})
sfn('LOGNORM.INV', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [p, m, s] = xs
  if (p <= 0 || p >= 1 || s <= 0) return ERR.num
  return Math.exp(m + s * normInv(p))
})
alias('LOGINV', 'LOGNORM.INV')
dist('EXPON.DIST', 2, ([x, l], cum) => (x < 0 || l <= 0 ? ERR.num : cum ? 1 - Math.exp(-l * x) : l * Math.exp(-l * x)))
alias('EXPONDIST', 'EXPON.DIST')
dist('POISSON.DIST', 2, ([x, m], cum) => {
  const k = Math.trunc(x)
  if (k < 0 || m < 0) return ERR.num
  if (!cum) return Math.exp(k * Math.log(m) - m - lnGamma(k + 1))
  return 1 - gammaP(k + 1, m)
})
alias('POISSON', 'POISSON.DIST')
dist('BINOM.DIST', 3, ([x, n, p], cum) => {
  const k = Math.trunc(x)
  const nn = Math.trunc(n)
  if (k < 0 || k > nn || p < 0 || p > 1) return ERR.num
  const pmf = (i: number) => combin(nn, i) * Math.pow(p, i) * Math.pow(1 - p, nn - i)
  if (!cum) return pmf(k)
  let s = 0
  for (let i = 0; i <= k; i++) s += pmf(i)
  return Math.min(1, s)
})
alias('BINOMDIST', 'BINOM.DIST')
sfn('BINOM.DIST.RANGE', 3, 4, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [n, p, s1] = xs
  const s2 = a.length > 3 && a[3] !== null ? N(a[3]) : s1
  if (isErr(s2)) return s2
  let s = 0
  for (let i = Math.trunc(s1); i <= Math.trunc(s2); i++) s += combin(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i)
  return s
})
sfn('BINOM.INV', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [n, p, alpha] = xs
  if (n < 0 || p < 0 || p > 1 || alpha <= 0 || alpha >= 1) return ERR.num
  let s = 0
  for (let k = 0; k <= n; k++) {
    s += combin(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k)
    if (s >= alpha - 1e-12) return k
  }
  return Math.trunc(n)
})
alias('CRITBINOM', 'BINOM.INV')
dist('NEGBINOM.DIST', 3, ([f, s, p], cum) => {
  const k = Math.trunc(f)
  const r = Math.trunc(s)
  if (k < 0 || r < 1 || p < 0 || p > 1) return ERR.num
  const pmf = (i: number) => combin(i + r - 1, r - 1) * Math.pow(p, r) * Math.pow(1 - p, i)
  if (!cum) return pmf(k)
  let t = 0
  for (let i = 0; i <= k; i++) t += pmf(i)
  return t
})
sfn('NEGBINOMDIST', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [f, s, p] = xs
  return combin(f + s - 1, s - 1) * Math.pow(p, s) * Math.pow(1 - p, f)
})
dist('HYPGEOM.DIST', 4, ([x, n, M, N0], cum) => {
  const pmf = (i: number) => (combin(M, i) * combin(N0 - M, n - i)) / combin(N0, n)
  if (!cum) return pmf(Math.trunc(x))
  let s = 0
  for (let i = 0; i <= Math.trunc(x); i++) s += pmf(i)
  return s
})
sfn('HYPGEOMDIST', 4, 4, (a) => {
  const xs = nums(a, 4)
  if (isErr(xs)) return xs
  const [x, n, M, N0] = xs
  return (combin(M, x) * combin(N0 - M, n - x)) / combin(N0, n)
})
dist('GAMMA.DIST', 3, ([x, al, be], cum) => {
  if (x < 0 || al <= 0 || be <= 0) return ERR.num
  if (cum) return gammaP(al, x / be)
  return Math.exp((al - 1) * Math.log(x) - x / be - al * Math.log(be) - lnGamma(al))
})
alias('GAMMADIST', 'GAMMA.DIST')
sfn('GAMMA.INV', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [p, al, be] = xs
  if (p < 0 || p >= 1 || al <= 0 || be <= 0) return ERR.num
  if (p === 0) return 0
  return invert((x) => gammaP(al, x / be), p, 0, al * be * 10 + 10)
})
alias('GAMMAINV', 'GAMMA.INV')
sfn('BETA.DIST', 4, 6, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  let [x, al, be] = xs
  const cum = B(a[3])
  const lo = optN(a, 4, 0)
  const hi = optN(a, 5, 1)
  if (isErr(cum)) return cum
  if (isErr(lo)) return lo
  if (isErr(hi)) return hi
  if (al <= 0 || be <= 0 || x < lo || x > hi || lo === hi) return ERR.num
  x = (x - lo) / (hi - lo)
  if (cum) return betaI(x, al, be)
  return Math.exp((al - 1) * Math.log(x) + (be - 1) * Math.log(1 - x) - (lnGamma(al) + lnGamma(be) - lnGamma(al + be))) / (hi - lo)
})
sfn('BETADIST', 3, 5, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [x, al, be] = xs
  const lo = optN(a, 3, 0)
  const hi = optN(a, 4, 1)
  if (isErr(lo)) return lo
  if (isErr(hi)) return hi
  return betaI((x - lo) / (hi - lo), al, be)
})
sfn('BETA.INV', 3, 5, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [p, al, be] = xs
  const lo = optN(a, 3, 0)
  const hi = optN(a, 4, 1)
  if (isErr(lo)) return lo
  if (isErr(hi)) return hi
  if (p <= 0 || p >= 1 || al <= 0 || be <= 0) return ERR.num
  return lo + (hi - lo) * invert((x) => betaI(x, al, be), p, 0, 1)
})
alias('BETAINV', 'BETA.INV')
dist('CHISQ.DIST', 2, ([x, k], cum) => (x < 0 || k < 1 ? ERR.num : cum ? chiCdf(x, Math.trunc(k)) : chiPdf(x, Math.trunc(k))))
sfn('CHISQ.DIST.RT', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [x, k] = xs
  if (x < 0 || k < 1) return ERR.num
  return 1 - chiCdf(x, Math.trunc(k))
})
alias('CHIDIST', 'CHISQ.DIST.RT')
sfn('CHISQ.INV', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [p, k] = xs
  if (p < 0 || p >= 1 || k < 1) return ERR.num
  return invert((x) => chiCdf(x, Math.trunc(k)), p, 0, k * 10 + 10)
})
sfn('CHISQ.INV.RT', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [p, k] = xs
  if (p <= 0 || p > 1 || k < 1) return ERR.num
  return invert((x) => chiCdf(x, Math.trunc(k)), 1 - p, 0, k * 10 + 10)
})
alias('CHIINV', 'CHISQ.INV.RT')
dist('T.DIST', 2, ([t, df], cum) => (df < 1 ? ERR.num : cum ? tCdf(t, df) : tPdf(t, df)))
sfn('T.DIST.2T', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [t, df] = xs
  if (t < 0 || df < 1) return ERR.num
  return 2 * (1 - tCdf(t, Math.trunc(df)))
})
sfn('T.DIST.RT', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [t, df] = xs
  if (df < 1) return ERR.num
  return 1 - tCdf(t, Math.trunc(df))
})
sfn('TDIST', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [t, df, tails] = xs
  if (t < 0 || df < 1 || (tails !== 1 && tails !== 2)) return ERR.num
  return tails * (1 - tCdf(t, Math.trunc(df)))
})
sfn('T.INV', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [p, df] = xs
  if (p <= 0 || p >= 1 || df < 1) return ERR.num
  const pos = invert((t) => tCdf(t, df), Math.max(p, 1 - p), 0, 100)
  return p < 0.5 ? -pos : pos
})
sfn('T.INV.2T', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [p, df] = xs
  if (p <= 0 || p > 1 || df < 1) return ERR.num
  return invert((t) => tCdf(t, df), 1 - p / 2, 0, 100)
})
alias('TINV', 'T.INV.2T')
dist('F.DIST', 3, ([x, d1, d2], cum) => (x < 0 || d1 < 1 || d2 < 1 ? ERR.num : cum ? fCdf(x, d1, d2) : fPdf(x, d1, d2)))
sfn('F.DIST.RT', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [x, d1, d2] = xs
  if (x < 0 || d1 < 1 || d2 < 1) return ERR.num
  return 1 - fCdf(x, d1, d2)
})
alias('FDIST', 'F.DIST.RT')
sfn('F.INV', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [p, d1, d2] = xs
  if (p < 0 || p >= 1) return ERR.num
  return invert((x) => fCdf(x, d1, d2), p, 0, 100)
})
sfn('F.INV.RT', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [p, d1, d2] = xs
  if (p <= 0 || p > 1) return ERR.num
  return invert((x) => fCdf(x, d1, d2), 1 - p, 0, 100)
})
alias('FINV', 'F.INV.RT')
dist('WEIBULL.DIST', 3, ([x, al, be], cum) => {
  if (x < 0 || al <= 0 || be <= 0) return ERR.num
  if (cum) return 1 - Math.exp(-Math.pow(x / be, al))
  return (al / Math.pow(be, al)) * Math.pow(x, al - 1) * Math.exp(-Math.pow(x / be, al))
})
alias('WEIBULL', 'WEIBULL.DIST')
sfn('CONFIDENCE.NORM', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [alpha, s, n] = xs
  if (alpha <= 0 || alpha >= 1 || s <= 0 || n < 1) return ERR.num
  return (normInv(1 - alpha / 2) * s) / Math.sqrt(Math.trunc(n))
})
alias('CONFIDENCE', 'CONFIDENCE.NORM')
sfn('CONFIDENCE.T', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [alpha, s, n] = xs
  if (alpha <= 0 || alpha >= 1 || s <= 0 || n < 2) return ERR.num
  const df = Math.trunc(n) - 1
  return (invert((t) => tCdf(t, df), 1 - alpha / 2, 0, 100) * s) / Math.sqrt(Math.trunc(n))
})

fn('Z.TEST', 2, 3, (args, ctx) => {
  const xs = collectNumbers([args[0]], ctx)
  if (isErr(xs)) return xs
  const x = argNum(args, 1, ctx)
  if (isErr(x)) return x
  const s = args.length > 2 ? argNum(args, 2, ctx) : Math.sqrt(variance(xs, true) as number)
  if (isErr(s)) return s
  return 1 - normCdf((mean(xs) - x) / (s / Math.sqrt(xs.length)))
})
alias('ZTEST', 'Z.TEST')

fn('T.TEST', 4, 4, (args, ctx) => {
  const a = collectNumbers([args[0]], ctx)
  const b = collectNumbers([args[1]], ctx)
  if (isErr(a)) return a
  if (isErr(b)) return b
  const tails = argNum(args, 2, ctx)
  const type = argNum(args, 3, ctx)
  if (isErr(tails)) return tails
  if (isErr(type)) return type
  let t: number
  let df: number
  if (type === 1) {
    if (a.length !== b.length) return ERR.na
    const d = a.map((x, i) => x - b[i])
    const sd = Math.sqrt(variance(d, true) as number)
    t = mean(d) / (sd / Math.sqrt(d.length))
    df = d.length - 1
  } else if (type === 2) {
    const n1 = a.length
    const n2 = b.length
    const sp = ((n1 - 1) * (variance(a, true) as number) + (n2 - 1) * (variance(b, true) as number)) / (n1 + n2 - 2)
    t = (mean(a) - mean(b)) / Math.sqrt(sp * (1 / n1 + 1 / n2))
    df = n1 + n2 - 2
  } else {
    const v1 = (variance(a, true) as number) / a.length
    const v2 = (variance(b, true) as number) / b.length
    t = (mean(a) - mean(b)) / Math.sqrt(v1 + v2)
    df = (v1 + v2) ** 2 / (v1 ** 2 / (a.length - 1) + v2 ** 2 / (b.length - 1))
  }
  const p = 1 - tCdf(Math.abs(t), df)
  return tails === 1 ? p : 2 * p
})
alias('TTEST', 'T.TEST')

fn('CHISQ.TEST', 2, 2, (args, ctx) => {
  const o = argMatrix(args, 0, ctx)
  const e = argMatrix(args, 1, ctx)
  if (isErr(o)) return o
  if (isErr(e)) return e
  if (o.rows !== e.rows || o.cols !== e.cols) return ERR.na
  let chi = 0
  for (let i = 0; i < o.data.length; i++) chi += (Number(o.data[i]) - Number(e.data[i])) ** 2 / Number(e.data[i])
  const df = o.rows > 1 && o.cols > 1 ? (o.rows - 1) * (o.cols - 1) : Math.max(o.rows, o.cols) - 1
  return 1 - chiCdf(chi, df)
})
alias('CHITEST', 'CHISQ.TEST')

fn('F.TEST', 2, 2, (args, ctx) => {
  const a = collectNumbers([args[0]], ctx)
  const b = collectNumbers([args[1]], ctx)
  if (isErr(a)) return a
  if (isErr(b)) return b
  const va = variance(a, true) as number
  const vb = variance(b, true) as number
  const f = va / vb
  const p = fCdf(f, a.length - 1, b.length - 1)
  return 2 * Math.min(p, 1 - p)
})
alias('FTEST', 'F.TEST')

void gamma
void flatten

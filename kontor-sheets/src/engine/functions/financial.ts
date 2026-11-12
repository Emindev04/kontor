import type { Scalar } from '../../model/types'
import { fn, VARARGS } from '../registry'
import { collectNumbers, type Ctx, type Value } from '../values'
import { CellError, ERR, argMatrix, argNum, isErr, N, optN, sfn } from './helpers'

function nums(a: Scalar[], n: number): number[] | CellError {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const v = N(a[i] ?? null)
    if (isErr(v)) return v
    out.push(v)
  }
  return out
}

export function fv(r: number, n: number, pmt: number, pv: number, type: number) {
  if (r === 0) return -(pv + pmt * n)
  const f = Math.pow(1 + r, n)
  return -(pv * f + (pmt * (1 + r * type) * (f - 1)) / r)
}

export function pmt(r: number, n: number, pv: number, fvv: number, type: number) {
  if (r === 0) return -(pv + fvv) / n
  const f = Math.pow(1 + r, n)
  return (-(r * (pv * f + fvv)) / ((1 + r * type) * (f - 1)))
}

export function pv(r: number, n: number, p: number, fvv: number, type: number) {
  if (r === 0) return -(fvv + p * n)
  const f = Math.pow(1 + r, n)
  return -(fvv + (p * (1 + r * type) * (f - 1)) / r) / f
}

function ipmt(r: number, per: number, n: number, pvv: number, fvv: number, type: number) {
  const p = pmt(r, n, pvv, fvv, type)
  let interest: number
  if (per === 1) interest = type === 1 ? 0 : -pvv
  else interest = type === 1 ? fv(r, per - 2, p, pvv, 1) - p : fv(r, per - 1, p, pvv, 0)
  return interest * r
}

const fin = (x: number): Scalar => (Number.isFinite(x) ? x : ERR.num)

sfn('FV', 3, 5, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const p = optN(a, 3, 0)
  const t = optN(a, 4, 0)
  if (isErr(p)) return p
  if (isErr(t)) return t
  return fin(fv(xs[0], xs[1], xs[2], p, t ? 1 : 0))
})
sfn('PMT', 3, 5, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const f = optN(a, 3, 0)
  const t = optN(a, 4, 0)
  if (isErr(f)) return f
  if (isErr(t)) return t
  if (xs[1] === 0) return ERR.num
  return fin(pmt(xs[0], xs[1], xs[2], f, t ? 1 : 0))
})
sfn('PV', 3, 5, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const f = optN(a, 3, 0)
  const t = optN(a, 4, 0)
  if (isErr(f)) return f
  if (isErr(t)) return t
  return fin(pv(xs[0], xs[1], xs[2], f, t ? 1 : 0))
})
sfn('NPER', 3, 5, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [r, p, pvv] = xs
  const f = optN(a, 3, 0)
  const t = optN(a, 4, 0)
  if (isErr(f)) return f
  if (isErr(t)) return t
  const type = t ? 1 : 0
  if (r === 0) return p === 0 ? ERR.num : -(pvv + f) / p
  const num = p * (1 + r * type) - f * r
  const den = p * (1 + r * type) + pvv * r
  if (num / den <= 0) return ERR.num
  return fin(Math.log(num / den) / Math.log(1 + r))
})
sfn('IPMT', 4, 6, (a) => {
  const xs = nums(a, 4)
  if (isErr(xs)) return xs
  const [r, per, n, pvv] = xs
  const f = optN(a, 4, 0)
  const t = optN(a, 5, 0)
  if (isErr(f)) return f
  if (isErr(t)) return t
  if (per < 1 || per > n) return ERR.num
  return fin(ipmt(r, per, n, pvv, f, t ? 1 : 0))
})
sfn('PPMT', 4, 6, (a) => {
  const xs = nums(a, 4)
  if (isErr(xs)) return xs
  const [r, per, n, pvv] = xs
  const f = optN(a, 4, 0)
  const t = optN(a, 5, 0)
  if (isErr(f)) return f
  if (isErr(t)) return t
  if (per < 1 || per > n) return ERR.num
  const type = t ? 1 : 0
  return fin(pmt(r, n, pvv, f, type) - ipmt(r, per, n, pvv, f, type))
})

function cumulative(name: string, principal: boolean) {
  sfn(name, 6, 6, (a) => {
    const xs = nums(a, 6)
    if (isErr(xs)) return xs
    const [r, n, pvv, s, e, t] = xs
    if (r <= 0 || n <= 0 || pvv <= 0 || s < 1 || e < s || e > n || (t !== 0 && t !== 1)) return ERR.num
    const p = pmt(r, n, pvv, 0, t)
    let total = 0
    for (let per = Math.ceil(s); per <= Math.floor(e); per++) {
      const i = ipmt(r, per, n, pvv, 0, t)
      total += principal ? p - i : i
    }
    return total
  })
}
cumulative('CUMIPMT', false)
cumulative('CUMPRINC', true)

sfn('RATE', 3, 6, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [n, p, pvv] = xs
  const f = optN(a, 3, 0)
  const t = optN(a, 4, 0)
  const g = optN(a, 5, 0.1)
  if (isErr(f)) return f
  if (isErr(t)) return t
  if (isErr(g)) return g
  const type = t ? 1 : 0
  const fnc = (r: number) => (r === 0 ? pvv + p * n + f : pvv * Math.pow(1 + r, n) + (p * (1 + r * type) * (Math.pow(1 + r, n) - 1)) / r + f)
  let r = g
  for (let i = 0; i < 200; i++) {
    const y = fnc(r)
    const h = 1e-7
    const d = (fnc(r + h) - y) / h
    if (d === 0) break
    const next = r - y / d
    if (!Number.isFinite(next)) return ERR.num
    if (Math.abs(next - r) < 1e-12) return next
    r = next
  }
  return Math.abs(fnc(r)) < 1e-6 ? r : ERR.num
})

fn('NPV', 2, VARARGS, (args, ctx) => {
  const r = argNum(args, 0, ctx)
  if (isErr(r)) return r
  const vals = collectNumbers(args.slice(1), ctx)
  if (isErr(vals)) return vals
  return vals.reduce((acc, v, i) => acc + v / Math.pow(1 + r, i + 1), 0)
})

function npvAt(r: number, vals: number[]) {
  let s = 0
  for (let i = 0; i < vals.length; i++) s += vals[i] / Math.pow(1 + r, i)
  return s
}

function solve(f: (r: number) => number, guess: number): number | CellError {
  let r = guess
  for (let i = 0; i < 100; i++) {
    const y = f(r)
    const h = 1e-7 * Math.max(1, Math.abs(r))
    const d = (f(r + h) - y) / h
    if (!d) break
    const next = r - y / d
    if (!Number.isFinite(next)) break
    if (Math.abs(next - r) < 1e-12) return next
    r = next
  }
  if (Math.abs(f(r)) < 1e-7) return r
  // bisection fallback
  let lo = -0.9999
  let hi = 10
  if (f(lo) * f(hi) > 0) return ERR.num
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    if (f(lo) * f(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

fn('IRR', 1, 2, (args, ctx) => {
  const vals = collectNumbers([args[0]], ctx)
  if (isErr(vals)) return vals
  const g = argNum(args, 1, ctx, 0.1)
  if (isErr(g)) return g
  if (!vals.some((v) => v > 0) || !vals.some((v) => v < 0)) return ERR.num
  return solve((r) => npvAt(r, vals), g)
})

function xvalues(args: Value[], ctx: Ctx): { v: number[]; d: number[] } | CellError {
  const vm = argMatrix(args, 1, ctx)
  const vv = argMatrix(args, 0, ctx)
  if (isErr(vm)) return vm
  if (isErr(vv)) return vv
  const v = vv.data.map(Number)
  const d = vm.data.map((x) => Math.floor(Number(x)))
  if (v.length !== d.length || v.some(Number.isNaN) || d.some(Number.isNaN)) return ERR.value
  return { v, d }
}

const xnpv = (r: number, v: number[], d: number[]) => v.reduce((acc, x, i) => acc + x / Math.pow(1 + r, (d[i] - d[0]) / 365), 0)

fn('XNPV', 3, 3, (args, ctx) => {
  const r = argNum(args, 0, ctx)
  if (isErr(r)) return r
  const x = xvalues(args.slice(1), ctx)
  if (isErr(x)) return x
  return xnpv(r, x.v, x.d)
})
fn('XIRR', 2, 3, (args, ctx) => {
  const x = xvalues(args, ctx)
  if (isErr(x)) return x
  const g = argNum(args, 2, ctx, 0.1)
  if (isErr(g)) return g
  if (!x.v.some((v) => v > 0) || !x.v.some((v) => v < 0)) return ERR.num
  return solve((r) => xnpv(r, x.v, x.d), g)
})
fn('MIRR', 3, 3, (args, ctx) => {
  const vals = collectNumbers([args[0]], ctx)
  if (isErr(vals)) return vals
  const fr = argNum(args, 1, ctx)
  const rr = argNum(args, 2, ctx)
  if (isErr(fr)) return fr
  if (isErr(rr)) return rr
  const n = vals.length
  let pos = 0
  let neg = 0
  vals.forEach((v, i) => {
    if (v > 0) pos += v * Math.pow(1 + rr, n - 1 - i)
    else neg += v / Math.pow(1 + fr, i)
  })
  if (pos === 0 || neg === 0) return ERR.div0
  return Math.pow(-pos / neg, 1 / (n - 1)) - 1
})

sfn('SLN', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [c, s, l] = xs
  return l === 0 ? ERR.div0 : (c - s) / l
})
sfn('SYD', 4, 4, (a) => {
  const xs = nums(a, 4)
  if (isErr(xs)) return xs
  const [c, s, l, p] = xs
  if (l <= 0 || p <= 0 || p > l) return ERR.num
  return ((c - s) * (l - p + 1) * 2) / (l * (l + 1))
})
sfn('DB', 4, 5, (a) => {
  const xs = nums(a, 4)
  if (isErr(xs)) return xs
  const [cost, salvage, life, period] = xs
  const month = optN(a, 4, 12)
  if (isErr(month)) return month
  if (cost < 0 || salvage < 0 || life <= 0 || period <= 0 || month < 1 || month > 12 || period > life + 1) return ERR.num
  const rate = Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000
  let total = 0
  let dep = 0
  for (let p = 1; p <= period; p++) {
    if (p === 1) dep = (cost * rate * month) / 12
    else if (p === Math.floor(life) + 1) dep = ((cost - total) * rate * (12 - month)) / 12
    else dep = (cost - total) * rate
    total += dep
  }
  return dep
})
function ddb(cost: number, salvage: number, life: number, period: number, factor: number) {
  let acc = 0
  let dep = 0
  for (let p = 1; p <= period; p++) {
    dep = Math.min(((cost - acc) * factor) / life, Math.max(0, cost - salvage - acc))
    acc += dep
  }
  return dep
}
sfn('DDB', 4, 5, (a) => {
  const xs = nums(a, 4)
  if (isErr(xs)) return xs
  const [c, s, l, p] = xs
  const f = optN(a, 4, 2)
  if (isErr(f)) return f
  if (c < 0 || s < 0 || l <= 0 || p <= 0 || p > l || f <= 0) return ERR.num
  return ddb(c, s, l, p, f)
})
sfn('VDB', 5, 7, (a) => {
  const xs = nums(a, 5)
  if (isErr(xs)) return xs
  const [cost, salvage, life, start, end] = xs
  const factor = optN(a, 5, 2)
  if (isErr(factor)) return factor
  const noSwitch = a[6] === true || (typeof a[6] === 'number' && a[6] !== 0)
  if (start < 0 || end < start || end > life) return ERR.num
  let value = cost
  let total = 0
  for (let p = 0; p < Math.ceil(end); p++) {
    const ddbDep = Math.min((value * factor) / life, Math.max(0, value - salvage))
    const slDep = (value - salvage) / (life - p)
    const dep = !noSwitch && slDep > ddbDep ? slDep : ddbDep
    const portionStart = Math.max(start, p)
    const portionEnd = Math.min(end, p + 1)
    if (portionEnd > portionStart) total += dep * (portionEnd - portionStart)
    value -= dep
  }
  return total
})
sfn('EFFECT', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [r, n] = xs
  if (r <= 0 || n < 1) return ERR.num
  return Math.pow(1 + r / Math.trunc(n), Math.trunc(n)) - 1
})
sfn('NOMINAL', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [r, n] = xs
  if (r <= 0 || n < 1) return ERR.num
  return Math.trunc(n) * (Math.pow(1 + r, 1 / Math.trunc(n)) - 1)
})
sfn('PDURATION', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [r, p, f] = xs
  if (r <= 0 || p <= 0 || f <= 0) return ERR.num
  return (Math.log(f) - Math.log(p)) / Math.log(1 + r)
})
sfn('RRI', 3, 3, (a) => {
  const xs = nums(a, 3)
  if (isErr(xs)) return xs
  const [n, p, f] = xs
  if (n <= 0 || p === 0) return ERR.num
  return Math.pow(f / p, 1 / n) - 1
})
sfn('ISPMT', 4, 4, (a) => {
  const xs = nums(a, 4)
  if (isErr(xs)) return xs
  const [r, per, n, p] = xs
  return p * r * (per / n - 1)
})
fn('FVSCHEDULE', 2, 2, (args, ctx) => {
  const p = argNum(args, 0, ctx)
  if (isErr(p)) return p
  const rates = collectNumbers([args[1]], ctx)
  if (isErr(rates)) return rates
  return rates.reduce((acc, r) => acc * (1 + r), p)
})
sfn('DOLLARDE', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [x, f] = xs
  const fr = Math.trunc(f)
  if (fr < 0) return ERR.num
  if (fr === 0) return ERR.div0
  const i = Math.trunc(x)
  return i + ((x - i) * Math.pow(10, Math.ceil(Math.log10(fr)))) / fr
})
sfn('DOLLARFR', 2, 2, (a) => {
  const xs = nums(a, 2)
  if (isErr(xs)) return xs
  const [x, f] = xs
  const fr = Math.trunc(f)
  if (fr < 0) return ERR.num
  if (fr === 0) return ERR.div0
  const i = Math.trunc(x)
  return i + ((x - i) * fr) / Math.pow(10, Math.ceil(Math.log10(fr)))
})

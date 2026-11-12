// Bond and security functions (coupon dates, prices, yields, accrued interest, T-bills, duration).
import { daysInMonth, partsToSerial, serialToParts } from '../../model/dates'
import type { Scalar } from '../../model/types'
import { CellError, ERR, isErr, N, sfn } from './helpers'
import { yearFrac } from './date'

const int = (v: Scalar): number | CellError => {
  const n = N(v)
  return isErr(n) ? n : Math.trunc(n)
}

function basisOf(v: Scalar | undefined): number | CellError {
  if (v === undefined || v === null) return 0
  const b = int(v)
  if (isErr(b)) return b
  return b < 0 || b > 4 ? ERR.num : b
}

function freqOf(v: Scalar): number | CellError {
  const f = int(v)
  if (isErr(f)) return f
  return f === 1 || f === 2 || f === 4 ? f : ERR.num
}

/** Date `months` after `s`; month ends stay month ends when `eom`. */
function addMonths(s: number, months: number, eom: boolean): number {
  const p = serialToParts(s)
  const total = p.y * 12 + (p.m - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  const d = eom ? daysInMonth(y, m) : Math.min(p.d, daysInMonth(y, m))
  return partsToSerial(y, m, d)
}

const isMonthEnd = (s: number) => {
  const p = serialToParts(s)
  return p.d === daysInMonth(p.y, p.m)
}

/** Previous and next coupon dates around the settlement date, and the number of remaining coupons. */
function coupons(settle: number, mat: number, freq: number) {
  const step = 12 / freq
  const eom = isMonthEnd(mat)
  let n = 0
  let ncd = mat
  let pcd = addMonths(mat, -step, eom)
  while (pcd > settle) {
    ncd = pcd
    n++
    pcd = addMonths(mat, -step * (n + 1), eom)
  }
  return { pcd, ncd, num: n + 1 }
}

/** 30/360 day count (US NASD for basis 0, European for basis 4). */
function days360(a: number, b: number, european: boolean): number {
  const p = serialToParts(a)
  const q = serialToParts(b)
  let d1 = p.d
  let d2 = q.d
  if (european) {
    if (d1 === 31) d1 = 30
    if (d2 === 31) d2 = 30
  } else {
    const lastFebA = p.m === 2 && d1 === daysInMonth(p.y, 2)
    const lastFebB = q.m === 2 && d2 === daysInMonth(q.y, 2)
    if (lastFebA && lastFebB) d2 = 30
    if (lastFebA) d1 = 30
    if (d2 === 31 && d1 >= 30) d2 = 30
    if (d1 === 31) d1 = 30
  }
  return (q.y - p.y) * 360 + (q.m - p.m) * 30 + (d2 - d1)
}

function dayCount(a: number, b: number, basis: number): number {
  if (basis === 0) return days360(a, b, false)
  if (basis === 4) return days360(a, b, true)
  return b - a
}

/** Days in the coupon period that contains the settlement date. */
function periodDays(pcd: number, ncd: number, freq: number, basis: number): number {
  if (basis === 1) return ncd - pcd
  if (basis === 3) return 365 / freq
  return 360 / freq
}

type Common = { settle: number; mat: number; freq: number; basis: number }

function common(s: Scalar, m: Scalar, f: Scalar, b: Scalar | undefined): Common | CellError {
  const settle = int(s)
  if (isErr(settle)) return settle
  const mat = int(m)
  if (isErr(mat)) return mat
  const freq = freqOf(f)
  if (isErr(freq)) return freq
  const basis = basisOf(b)
  if (isErr(basis)) return basis
  if (settle >= mat) return ERR.num
  return { settle, mat, freq, basis }
}

function couponInfo(c: Common) {
  const { pcd, ncd, num } = coupons(c.settle, c.mat, c.freq)
  const E = periodDays(pcd, ncd, c.freq, c.basis)
  const A = dayCount(pcd, c.settle, c.basis)
  const DSC = c.basis === 0 || c.basis === 4 ? E - A : ncd - c.settle
  return { pcd, ncd, num, E, A, DSC }
}

sfn('COUPPCD', 3, 4, ([s, m, f, b]) => {
  const c = common(s, m, f, b)
  return isErr(c) ? c : coupons(c.settle, c.mat, c.freq).pcd
})
sfn('COUPNCD', 3, 4, ([s, m, f, b]) => {
  const c = common(s, m, f, b)
  return isErr(c) ? c : coupons(c.settle, c.mat, c.freq).ncd
})
sfn('COUPNUM', 3, 4, ([s, m, f, b]) => {
  const c = common(s, m, f, b)
  return isErr(c) ? c : coupons(c.settle, c.mat, c.freq).num
})
sfn('COUPDAYBS', 3, 4, ([s, m, f, b]) => {
  const c = common(s, m, f, b)
  return isErr(c) ? c : couponInfo(c).A
})
sfn('COUPDAYS', 3, 4, ([s, m, f, b]) => {
  const c = common(s, m, f, b)
  return isErr(c) ? c : couponInfo(c).E
})
sfn('COUPDAYSNC', 3, 4, ([s, m, f, b]) => {
  const c = common(s, m, f, b)
  return isErr(c) ? c : couponInfo(c).DSC
})

function price(c: Common, rate: number, yld: number, redemption: number): number {
  const { num, E, A, DSC } = couponInfo(c)
  const f = c.freq
  const coupon = (100 * rate) / f
  if (num === 1) return (redemption + coupon) / (1 + (DSC / E) * (yld / f)) - coupon * (A / E)
  let p = redemption / Math.pow(1 + yld / f, num - 1 + DSC / E)
  for (let k = 1; k <= num; k++) p += coupon / Math.pow(1 + yld / f, k - 1 + DSC / E)
  return p - coupon * (A / E)
}

sfn('PRICE', 6, 7, ([s, m, r, y, red, f, b]) => {
  const c = common(s, m, f, b)
  if (isErr(c)) return c
  const rate = N(r)
  const yld = N(y)
  const redemption = N(red)
  if (isErr(rate)) return rate
  if (isErr(yld)) return yld
  if (isErr(redemption)) return redemption
  if (rate < 0 || yld < 0 || redemption <= 0) return ERR.num
  return price(c, rate, yld, redemption)
})

sfn('YIELD', 6, 7, ([s, m, r, pr, red, f, b]) => {
  const c = common(s, m, f, b)
  if (isErr(c)) return c
  const rate = N(r)
  const target = N(pr)
  const redemption = N(red)
  if (isErr(rate)) return rate
  if (isErr(target)) return target
  if (isErr(redemption)) return redemption
  if (rate < 0 || target <= 0 || redemption <= 0) return ERR.num
  const { num, E, A, DSC } = couponInfo(c)
  if (num === 1) {
    const coupon = (100 * rate) / c.freq
    const t = target + coupon * (A / E)
    return ((redemption + coupon - t) / t) * ((c.freq * E) / DSC)
  }
  // Newton's method on the price function
  let yld = rate || 0.05
  for (let i = 0; i < 100; i++) {
    const p = price(c, rate, yld, redemption) - target
    const d = (price(c, rate, yld + 1e-6, redemption) - price(c, rate, yld - 1e-6, redemption)) / 2e-6
    if (d === 0) break
    const next = yld - p / d
    if (Math.abs(next - yld) < 1e-12) return next
    yld = next
  }
  return Number.isFinite(yld) ? yld : ERR.num
})

function duration(c: Common, coupon: number, yld: number): number {
  const { num, E, DSC } = couponInfo(c)
  const f = c.freq
  let pvSum = 0
  let tSum = 0
  for (let k = 1; k <= num; k++) {
    const t = k - 1 + DSC / E
    const cf = (100 * coupon) / f + (k === num ? 100 : 0)
    const pv = cf / Math.pow(1 + yld / f, t)
    pvSum += pv
    tSum += (t / f) * pv
  }
  return tSum / pvSum
}

for (const name of ['DURATION', 'MDURATION'] as const)
  sfn(name, 5, 6, ([s, m, cp, y, f, b]) => {
    const c = common(s, m, f, b)
    if (isErr(c)) return c
    const coupon = N(cp)
    const yld = N(y)
    if (isErr(coupon)) return coupon
    if (isErr(yld)) return yld
    if (coupon < 0 || yld < 0) return ERR.num
    const d = duration(c, coupon, yld)
    return name === 'DURATION' ? d : d / (1 + yld / c.freq)
  })

/** Settlement/maturity pair with basis for discount securities. */
function pair(s: Scalar, m: Scalar, b: Scalar | undefined): { settle: number; mat: number; basis: number; yf: number } | CellError {
  const settle = int(s)
  if (isErr(settle)) return settle
  const mat = int(m)
  if (isErr(mat)) return mat
  const basis = basisOf(b)
  if (isErr(basis)) return basis
  if (settle >= mat) return ERR.num
  const yf = yearFrac(settle, mat, basis)
  if (isErr(yf)) return yf
  return { settle, mat, basis, yf }
}

const nums = (...vs: Scalar[]): number[] | CellError => {
  const out: number[] = []
  for (const v of vs) {
    const n = N(v)
    if (isErr(n)) return n
    out.push(n)
  }
  return out
}

sfn('DISC', 4, 5, ([s, m, pr, red, b]) => {
  const p = pair(s, m, b)
  if (isErr(p)) return p
  const v = nums(pr, red)
  if (isErr(v)) return v
  if (v[0] <= 0 || v[1] <= 0) return ERR.num
  return (v[1] - v[0]) / v[1] / p.yf
})
sfn('INTRATE', 4, 5, ([s, m, inv, red, b]) => {
  const p = pair(s, m, b)
  if (isErr(p)) return p
  const v = nums(inv, red)
  if (isErr(v)) return v
  if (v[0] <= 0 || v[1] <= 0) return ERR.num
  return (v[1] - v[0]) / v[0] / p.yf
})
sfn('RECEIVED', 4, 5, ([s, m, inv, disc, b]) => {
  const p = pair(s, m, b)
  if (isErr(p)) return p
  const v = nums(inv, disc)
  if (isErr(v)) return v
  if (v[0] <= 0 || v[1] <= 0) return ERR.num
  const d = 1 - v[1] * p.yf
  return d <= 0 ? ERR.num : v[0] / d
})
sfn('PRICEDISC', 4, 5, ([s, m, disc, red, b]) => {
  const p = pair(s, m, b)
  if (isErr(p)) return p
  const v = nums(disc, red)
  if (isErr(v)) return v
  if (v[0] <= 0 || v[1] <= 0) return ERR.num
  return v[1] - v[0] * v[1] * p.yf
})
sfn('YIELDDISC', 4, 5, ([s, m, pr, red, b]) => {
  const p = pair(s, m, b)
  if (isErr(p)) return p
  const v = nums(pr, red)
  if (isErr(v)) return v
  if (v[0] <= 0 || v[1] <= 0) return ERR.num
  return (v[1] - v[0]) / v[0] / p.yf
})

/** Days in the year for a day-count basis (actual/actual uses 365 here, like the original for these functions). */
const yearDays = (basis: number) => (basis === 2 ? 360 : basis === 3 || basis === 1 ? 365 : 360)

function matCommon(s: Scalar, m: Scalar, i: Scalar, b: Scalar | undefined) {
  const settle = int(s)
  if (isErr(settle)) return settle
  const mat = int(m)
  if (isErr(mat)) return mat
  const issue = int(i)
  if (isErr(issue)) return issue
  const basis = basisOf(b)
  if (isErr(basis)) return basis
  if (settle >= mat || issue >= settle) return ERR.num
  const B = yearDays(basis)
  return { DIM: dayCount(issue, mat, basis), DSM: dayCount(settle, mat, basis), A: dayCount(issue, settle, basis), B }
}

sfn('PRICEMAT', 5, 6, ([s, m, i, r, y, b]) => {
  const c = matCommon(s, m, i, b)
  if (isErr(c)) return c
  const v = nums(r, y)
  if (isErr(v)) return v
  const [rate, yld] = v
  if (rate < 0 || yld < 0) return ERR.num
  return (100 + (c.DIM / c.B) * rate * 100) / (1 + (c.DSM / c.B) * yld) - (c.A / c.B) * rate * 100
})
sfn('YIELDMAT', 5, 6, ([s, m, i, r, pr, b]) => {
  const c = matCommon(s, m, i, b)
  if (isErr(c)) return c
  const v = nums(r, pr)
  if (isErr(v)) return v
  const [rate, p] = v
  if (rate < 0 || p <= 0) return ERR.num
  const t = p / 100 + (c.A / c.B) * rate
  return ((1 + (c.DIM / c.B) * rate - t) / t) * (c.B / c.DSM)
})

sfn('ACCRINT', 6, 8, ([iss, _first, s, r, par, f, b]) => {
  const issue = int(iss)
  if (isErr(issue)) return issue
  const settle = int(s)
  if (isErr(settle)) return settle
  const v = nums(r, par ?? 1000)
  if (isErr(v)) return v
  const freq = freqOf(f)
  if (isErr(freq)) return freq
  const basis = basisOf(b)
  if (isErr(basis)) return basis
  if (issue >= settle || v[0] <= 0 || v[1] <= 0) return ERR.num
  const yf = yearFrac(issue, settle, basis)
  return isErr(yf) ? yf : v[1] * v[0] * yf
})
sfn('ACCRINTM', 4, 5, ([iss, s, r, par, b]) => {
  const issue = int(iss)
  if (isErr(issue)) return issue
  const settle = int(s)
  if (isErr(settle)) return settle
  const v = nums(r, par ?? 1000)
  if (isErr(v)) return v
  const basis = basisOf(b)
  if (isErr(basis)) return basis
  if (issue >= settle || v[0] <= 0 || v[1] <= 0) return ERR.num
  const yf = yearFrac(issue, settle, basis)
  return isErr(yf) ? yf : v[1] * v[0] * yf
})

function tbill(s: Scalar, m: Scalar): number | CellError {
  const settle = int(s)
  if (isErr(settle)) return settle
  const mat = int(m)
  if (isErr(mat)) return mat
  const dsm = mat - settle
  if (dsm <= 0 || dsm > 365) return ERR.num
  return dsm
}
sfn('TBILLPRICE', 3, 3, ([s, m, d]) => {
  const dsm = tbill(s, m)
  if (isErr(dsm)) return dsm
  const disc = N(d)
  if (isErr(disc)) return disc
  if (disc <= 0) return ERR.num
  const p = 100 * (1 - (disc * dsm) / 360)
  return p <= 0 ? ERR.num : p
})
sfn('TBILLYIELD', 3, 3, ([s, m, pr]) => {
  const dsm = tbill(s, m)
  if (isErr(dsm)) return dsm
  const p = N(pr)
  if (isErr(p)) return p
  if (p <= 0) return ERR.num
  return ((100 - p) / p) * (360 / dsm)
})
sfn('TBILLEQ', 3, 3, ([s, m, d]) => {
  const dsm = tbill(s, m)
  if (isErr(dsm)) return dsm
  const disc = N(d)
  if (isErr(disc)) return disc
  if (disc <= 0) return ERR.num
  if (dsm <= 182) return (365 * disc) / (360 - disc * dsm)
  // longer than half a year: quadratic form used by the original
  const price = 100 * (1 - (disc * dsm) / 360)
  const a = dsm / (2 * 365) - 0.25
  const bq = dsm / 365
  const cq = (price - 100) / price
  return (-bq + Math.sqrt(bq * bq - 4 * a * cq)) / (2 * a)
})

// ---------- odd first / last periods ----------

type Odd = Common & { rate: number; redemption: number }

function oddArgs(s: Scalar, m: Scalar, r: Scalar, red: Scalar, f: Scalar, b: Scalar | undefined): Odd | CellError {
  const c = common(s, m, f, b)
  if (isErr(c)) return c
  const v = nums(r, red)
  if (isErr(v)) return v
  if (v[0] < 0 || v[1] <= 0) return ERR.num
  return { ...c, rate: v[0], redemption: v[1] }
}

/** Price with an odd first period (short or long), following the quasi-coupon method of the original. */
function oddFirstPrice(o: Odd, issue: number, first: number, yld: number): number {
  const f = o.freq
  const step = 12 / f
  const eom = isMonthEnd(first)
  const C = (100 * o.rate) / f
  // quasi-coupon periods covering the odd period, earliest first
  const starts: number[] = []
  for (let k = 1; k < 1000; k++) {
    const d = addMonths(first, -step * k, eom)
    starts.unshift(d)
    if (d <= issue) break
  }
  const ends = starts.map((_, i) => (i + 1 < starts.length ? starts[i + 1] : first))
  let dcSum = 0
  let aSum = 0
  let dsc = 0
  let nl = 0
  let nq = 0
  starts.forEach((st, i) => {
    const en = ends[i]
    const NL = periodDays(st, en, f, o.basis)
    const from = Math.max(st, issue)
    dcSum += dayCount(from, en, o.basis) / NL
    if (o.settle > from) aSum += dayCount(from, Math.min(o.settle, en), o.basis) / NL
    if (o.settle >= st && o.settle < en) {
      nl = NL
      dsc = o.basis === 0 || o.basis === 4 ? NL - dayCount(st, o.settle, o.basis) : en - o.settle
      nq = starts.length - 1 - i
    }
  })
  // regular coupons after the first coupon
  let M = 0
  while (addMonths(first, step * (M + 1), eom) <= o.mat && M < 2000) M++
  const base = 1 + yld / f
  const t = nq + dsc / nl
  let p = o.redemption / Math.pow(base, M + t) + (C * dcSum) / Math.pow(base, t)
  for (let k = 1; k <= M; k++) p += C / Math.pow(base, k + t)
  return p - C * aSum
}

/** Price with an odd last period. */
function oddLastPrice(o: Odd, last: number, yld: number): number | CellError {
  const f = o.freq
  const dc = yearFrac(last, o.mat, o.basis)
  const dsc = yearFrac(o.settle, o.mat, o.basis)
  const a = yearFrac(last, o.settle, o.basis)
  if (isErr(dc)) return dc
  if (isErr(dsc)) return dsc
  if (isErr(a)) return a
  const C = (100 * o.rate) / f
  return (o.redemption + dc * f * C) / (1 + (dsc * f * yld) / f) - a * f * C
}

function solveYield(price: (y: number) => number | CellError, target: number, guess: number): number | CellError {
  let y = guess
  for (let i = 0; i < 100; i++) {
    const p = price(y)
    const p1 = price(y + 1e-7)
    if (isErr(p)) return p
    if (isErr(p1)) return p1
    const d = (p1 - p) / 1e-7
    if (!d) break
    const next = y - (p - target) / d
    if (!Number.isFinite(next)) break
    if (Math.abs(next - y) < 1e-12) return next
    y = next
  }
  return ERR.num
}

sfn('ODDFPRICE', 8, 9, ([s, m, iss, fc, r, y, red, f, b]) => {
  const o = oddArgs(s, m, r, red, f, b)
  if (isErr(o)) return o
  const issue = int(iss)
  const first = int(fc)
  const yld = N(y)
  if (isErr(issue)) return issue
  if (isErr(first)) return first
  if (isErr(yld)) return yld
  if (!(o.mat > first && first > o.settle && o.settle > issue) || yld < 0) return ERR.num
  return oddFirstPrice(o, issue, first, yld)
})

sfn('ODDFYIELD', 8, 9, ([s, m, iss, fc, r, pr, red, f, b]) => {
  const o = oddArgs(s, m, r, red, f, b)
  if (isErr(o)) return o
  const issue = int(iss)
  const first = int(fc)
  const target = N(pr)
  if (isErr(issue)) return issue
  if (isErr(first)) return first
  if (isErr(target)) return target
  if (!(o.mat > first && first > o.settle && o.settle > issue) || target <= 0) return ERR.num
  return solveYield((y) => oddFirstPrice(o, issue, first, y), target, o.rate || 0.05)
})

sfn('ODDLPRICE', 7, 8, ([s, m, li, r, y, red, f, b]) => {
  const o = oddArgs(s, m, r, red, f, b)
  if (isErr(o)) return o
  const last = int(li)
  const yld = N(y)
  if (isErr(last)) return last
  if (isErr(yld)) return yld
  if (!(o.mat > o.settle && o.settle > last) || yld < 0) return ERR.num
  return oddLastPrice(o, last, yld)
})

sfn('ODDLYIELD', 7, 8, ([s, m, li, r, pr, red, f, b]) => {
  const o = oddArgs(s, m, r, red, f, b)
  if (isErr(o)) return o
  const last = int(li)
  const price = N(pr)
  if (isErr(last)) return last
  if (isErr(price)) return price
  if (!(o.mat > o.settle && o.settle > last) || price <= 0) return ERR.num
  const fr = o.freq
  const dc = yearFrac(last, o.mat, o.basis)
  const dsc = yearFrac(o.settle, o.mat, o.basis)
  const a = yearFrac(last, o.settle, o.basis)
  if (isErr(dc)) return dc
  if (isErr(dsc)) return dsc
  if (isErr(a)) return a
  const C = (100 * o.rate) / fr
  return ((o.redemption + dc * fr * C) / (price + a * fr * C) - 1) * (fr / (dsc * fr))
})

// ---------- French depreciation (amortissement) ----------

function amorArgs(cost: Scalar, bought: Scalar, first: Scalar, salvage: Scalar, per: Scalar, rate: Scalar, basis: Scalar | undefined) {
  const v = nums(cost, salvage, per, rate)
  if (isErr(v)) return v
  const d1 = int(bought)
  const d2 = int(first)
  if (isErr(d1)) return d1
  if (isErr(d2)) return d2
  const b = basisOf(basis)
  if (isErr(b)) return b
  if (b === 2 || v[0] < 0 || v[1] < 0 || v[1] > v[0] || v[2] < 0 || v[3] <= 0 || d2 < d1) return ERR.num
  const yf = yearFrac(d1, d2, b)
  if (isErr(yf)) return yf
  return { cost: v[0], salvage: v[1], per: Math.trunc(v[2]), rate: v[3], yf }
}

sfn('AMORLINC', 6, 7, ([c, d1, d2, sv, per, rate, b]) => {
  const a = amorArgs(c, d1, d2, sv, per, rate, b)
  if (isErr(a)) return a
  const one = a.cost * a.rate
  const first = a.yf * a.rate * a.cost
  const full = Math.floor((a.cost - a.salvage - first) / one)
  if (a.per === 0) return first
  if (a.per <= full) return one
  if (a.per === full + 1) return a.cost - a.salvage - one * full - first
  return 0
})

sfn('AMORDEGRC', 6, 7, ([c, d1, d2, sv, per, rate, b]) => {
  const a = amorArgs(c, d1, d2, sv, per, rate, b)
  if (isErr(a)) return a
  const life = 1 / a.rate
  if (life >= 0 && life < 1) return ERR.num
  const coeff = life < 3 ? 1 : life < 5 ? 1.5 : life <= 6 ? 2 : 2.5
  const r = a.rate * coeff
  let n = Math.round(a.yf * r * a.cost)
  let cost = a.cost - n
  let rest = cost - a.salvage
  if (a.per === 0) return n
  for (let k = 0; k < a.per; k++) {
    n = Math.round(r * cost)
    rest -= n
    if (rest < 0) return a.per - k <= 1 ? Math.round(cost * 0.5) : 0
    cost -= n
  }
  return n
})

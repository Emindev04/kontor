// Complex numbers as text ("3+4i") and Bessel functions (Engineering category).
import { numberToText } from '../../model/numfmt'
import type { Scalar } from '../../model/types'
import { fn } from '../registry'
import { flatten, type Ctx, type Value } from '../values'
import { CellError, ERR, isErr, N, optN, sfn } from './helpers'

type C = { re: number; im: number; unit: 'i' | 'j' }

const NUM = '(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?'
const REAL_ONLY = new RegExp(`^[+-]?${NUM}$`)
const IMAG_ONLY = new RegExp(`^([+-]?)(${NUM})?([ij])$`)
const FULL = new RegExp(`^([+-]?${NUM})([+-])(${NUM})?([ij])$`)

/** Parses "3+4i", "-2.5j", "i", "4", "1e-3-2i". */
export function parseComplex(v: Scalar): C | CellError {
  if (typeof v === 'number') return { re: v, im: 0, unit: 'i' }
  if (typeof v === 'boolean') return ERR.value
  if (v instanceof CellError) return v
  const t = (v ?? '').trim()
  if (t === '') return { re: 0, im: 0, unit: 'i' }
  if (REAL_ONLY.test(t)) return { re: Number(t), im: 0, unit: 'i' }
  let m = IMAG_ONLY.exec(t)
  if (m) {
    const mag = m[2] !== undefined ? Number(m[2]) : 1
    return { re: 0, im: m[1] === '-' ? -mag : mag, unit: m[3] as 'i' | 'j' }
  }
  m = FULL.exec(t)
  if (!m) return ERR.num
  const mag = m[3] !== undefined ? Number(m[3]) : 1
  return { re: Number(m[1]), im: m[2] === '-' ? -mag : mag, unit: m[4] as 'i' | 'j' }
}

const clean = (x: number) => (Math.abs(x) < 1e-300 ? 0 : x)

/** Formats like the original: "3+4i", "i", "-2j", "5", "0". */
export function formatComplex(re: number, im: number, unit: 'i' | 'j' = 'i'): Scalar {
  if (!Number.isFinite(re) || !Number.isFinite(im)) return ERR.num
  re = clean(re)
  im = clean(im)
  if (im === 0) return numberToText(re)
  const coef = im === 1 ? '' : im === -1 ? '-' : numberToText(im)
  if (re === 0) return `${coef}${unit}`
  return `${numberToText(re)}${im > 0 ? '+' : ''}${coef}${unit}`
}

const out = (c: { re: number; im: number }, unit: 'i' | 'j') => formatComplex(c.re, c.im, unit)

function unary(name: string, f: (c: C) => { re: number; im: number } | CellError) {
  sfn(name, 1, 1, ([a]) => {
    const c = parseComplex(a)
    if (isErr(c)) return c
    const r = f(c)
    return isErr(r) ? r : out(r, c.unit)
  })
}

const cexp = (c: { re: number; im: number }) => ({ re: Math.exp(c.re) * Math.cos(c.im), im: Math.exp(c.re) * Math.sin(c.im) })
const cmul = (a: { re: number; im: number }, b: { re: number; im: number }) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cdiv = (a: { re: number; im: number }, b: { re: number; im: number }): { re: number; im: number } | CellError => {
  const d = b.re * b.re + b.im * b.im
  if (d === 0) return ERR.num
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
const cln = (c: { re: number; im: number }): { re: number; im: number } | CellError => (c.re === 0 && c.im === 0 ? ERR.num : { re: Math.log(Math.hypot(c.re, c.im)), im: Math.atan2(c.im, c.re) })
const csin = (c: { re: number; im: number }) => ({ re: Math.sin(c.re) * Math.cosh(c.im), im: Math.cos(c.re) * Math.sinh(c.im) })
const ccos = (c: { re: number; im: number }) => ({ re: Math.cos(c.re) * Math.cosh(c.im), im: -Math.sin(c.re) * Math.sinh(c.im) })
const csinh = (c: { re: number; im: number }) => ({ re: Math.sinh(c.re) * Math.cos(c.im), im: Math.cosh(c.re) * Math.sin(c.im) })
const ccosh = (c: { re: number; im: number }) => ({ re: Math.cosh(c.re) * Math.cos(c.im), im: Math.sinh(c.re) * Math.sin(c.im) })
const ONE = { re: 1, im: 0 }

sfn('COMPLEX', 2, 3, ([r, i, s]) => {
  const re = N(r)
  const im = N(i)
  if (isErr(re)) return re
  if (isErr(im)) return im
  const unit = s === null || s === undefined || s === '' ? 'i' : String(s)
  if (unit !== 'i' && unit !== 'j') return ERR.value
  return formatComplex(re, im, unit)
})
sfn('IMREAL', 1, 1, ([a]) => {
  const c = parseComplex(a)
  return isErr(c) ? c : c.re
})
sfn('IMAGINARY', 1, 1, ([a]) => {
  const c = parseComplex(a)
  return isErr(c) ? c : c.im
})
sfn('IMABS', 1, 1, ([a]) => {
  const c = parseComplex(a)
  return isErr(c) ? c : Math.hypot(c.re, c.im)
})
sfn('IMARGUMENT', 1, 1, ([a]) => {
  const c = parseComplex(a)
  if (isErr(c)) return c
  return c.re === 0 && c.im === 0 ? ERR.div0 : Math.atan2(c.im, c.re)
})
unary('IMCONJUGATE', (c) => ({ re: c.re, im: -c.im }))
unary('IMEXP', cexp)
unary('IMLN', cln)
unary('IMLOG10', (c) => {
  const l = cln(c)
  return isErr(l) ? l : { re: l.re / Math.LN10, im: l.im / Math.LN10 }
})
unary('IMLOG2', (c) => {
  const l = cln(c)
  return isErr(l) ? l : { re: l.re / Math.LN2, im: l.im / Math.LN2 }
})
unary('IMSQRT', (c) => {
  const r = Math.sqrt(Math.hypot(c.re, c.im))
  const t = Math.atan2(c.im, c.re) / 2
  return { re: r * Math.cos(t), im: r * Math.sin(t) }
})
unary('IMSIN', csin)
unary('IMCOS', ccos)
unary('IMTAN', (c) => cdiv(csin(c), ccos(c)))
unary('IMCOT', (c) => cdiv(ccos(c), csin(c)))
unary('IMSEC', (c) => cdiv(ONE, ccos(c)))
unary('IMCSC', (c) => cdiv(ONE, csin(c)))
unary('IMSINH', csinh)
unary('IMCOSH', ccosh)
unary('IMSECH', (c) => cdiv(ONE, ccosh(c)))
unary('IMCSCH', (c) => cdiv(ONE, csinh(c)))

sfn('IMPOWER', 2, 2, ([a, p]) => {
  const c = parseComplex(a)
  if (isErr(c)) return c
  const n = N(p)
  if (isErr(n)) return n
  if (c.re === 0 && c.im === 0) return n > 0 ? '0' : ERR.num
  const r = Math.pow(Math.hypot(c.re, c.im), n)
  const t = Math.atan2(c.im, c.re) * n
  return formatComplex(r * Math.cos(t), r * Math.sin(t), c.unit)
})
sfn('IMDIV', 2, 2, ([a, b]) => {
  const x = parseComplex(a)
  if (isErr(x)) return x
  const y = parseComplex(b)
  if (isErr(y)) return y
  const r = cdiv(x, y)
  return isErr(r) ? r : out(r, x.unit)
})
sfn('IMSUB', 2, 2, ([a, b]) => {
  const x = parseComplex(a)
  if (isErr(x)) return x
  const y = parseComplex(b)
  if (isErr(y)) return y
  return formatComplex(x.re - y.re, x.im - y.im, x.unit)
})

/** IMSUM / IMPRODUCT take numbers, text and ranges; blank cells are skipped. */
function collect(args: Value[], ctx: Ctx): C[] | CellError {
  const list: C[] = []
  for (const a of args) {
    const vals = flatten(a, ctx)
    if (isErr(vals)) return vals
    for (const v of vals) {
      if (v === null) continue
      const c = parseComplex(v)
      if (isErr(c)) return c
      list.push(c)
    }
  }
  return list
}
fn('IMSUM', 1, 255, (args, ctx) => {
  const list = collect(args, ctx)
  if (isErr(list)) return list
  return formatComplex(list.reduce((s, c) => s + c.re, 0), list.reduce((s, c) => s + c.im, 0), list[0]?.unit ?? 'i')
})
fn('IMPRODUCT', 1, 255, (args, ctx) => {
  const list = collect(args, ctx)
  if (isErr(list)) return list
  const p = list.reduce((acc, c) => cmul(acc, c), ONE)
  return formatComplex(p.re, p.im, list[0]?.unit ?? 'i')
})

// ---------- Bessel functions ----------

/** Bessel J of integer order n (series for small x, asymptotic recurrence otherwise). */
export function besselJ(x: number, n: number): number {
  if (n < 0) return NaN
  if (Math.abs(x) < 25) {
    // power series: sum (-1)^k (x/2)^(2k+n) / (k! (n+k)!)
    let term = Math.pow(x / 2, n)
    for (let k = 1; k <= n; k++) term /= k
    let sum = term
    for (let k = 1; k < 300; k++) {
      term *= -(x * x) / 4 / (k * (n + k))
      sum += term
      if (Math.abs(term) < 1e-17 * Math.abs(sum)) break
    }
    return sum
  }
  // Miller's backward recurrence is stable for large x
  const j0 = besselJ0Large(x)
  const j1 = besselJ1Large(x)
  if (n === 0) return j0
  let a = j0
  let b = j1
  for (let k = 1; k < n; k++) {
    const c = ((2 * k) / x) * b - a
    a = b
    b = c
  }
  return b
}

/**
 * Hankel's asymptotic expansion for large x (order 0 or 1): J = √(2/πx)(P cos χ − Q sin χ) and
 * Y = √(2/πx)(P sin χ + Q cos χ). Terms shrink until x is small, so this is precise to ~1e-15 for x ≥ 25.
 */
function hankel(x: number, nu: number) {
  const mu = 4 * nu * nu
  let P = 0
  let Q = 0
  let term = 1
  let last = Infinity
  for (let k = 0; k < 60; k++) {
    if (k > 0) term *= (mu - (2 * k - 1) * (2 * k - 1)) / (k * 8 * x)
    const size = Math.abs(term)
    if (size > last || size < 1e-17) break
    last = size
    const sign = Math.floor(k / 2) % 2 === 0 ? 1 : -1
    if (k % 2 === 0) P += sign * term
    else Q += sign * term
  }
  const chi = x - (nu / 2 + 0.25) * Math.PI
  const amp = Math.sqrt(2 / (Math.PI * x))
  return { j: amp * (P * Math.cos(chi) - Q * Math.sin(chi)), y: amp * (P * Math.sin(chi) + Q * Math.cos(chi)) }
}

function besselJ0Large(x: number) {
  return hankel(Math.abs(x), 0).j
}

function besselJ1Large(x: number) {
  const v = hankel(Math.abs(x), 1).j
  return x < 0 ? -v : v
}

/** Modified Bessel I of integer order (power series). */
export function besselI(x: number, n: number): number {
  let term = Math.pow(x / 2, n)
  for (let k = 1; k <= n; k++) term /= k
  let sum = term
  for (let k = 1; k < 500; k++) {
    term *= (x * x) / 4 / (k * (n + k))
    sum += term
    if (Math.abs(term) < 1e-17 * Math.abs(sum)) break
  }
  return sum
}

const EULER = 0.5772156649015329

/** Bessel Y (Neumann) of integer order: series for Y0/Y1, then upward recurrence. */
export function besselY(x: number, n: number): number {
  if (x <= 0) return NaN
  const y0 = x < 25 ? y0Series(x) : y0Large(x)
  if (n === 0) return y0
  const y1 = x < 25 ? y1Series(x) : y1Large(x)
  let a = y0
  let b = y1
  for (let k = 1; k < n; k++) {
    const c = ((2 * k) / x) * b - a
    a = b
    b = c
  }
  return b
}

function y0Series(x: number) {
  // Y0 = (2/π)(ln(x/2)+γ) J0 + (2/π) Σ (-1)^(k+1) H_k (x²/4)^k / (k!)²
  let sum = 0
  let term = 1
  let h = 0
  for (let k = 1; k < 300; k++) {
    term *= -(x * x) / 4 / (k * k)
    h += 1 / k
    const t = -term * h
    sum += t
    if (Math.abs(t) < 1e-17 * Math.max(1, Math.abs(sum))) break
  }
  return (2 / Math.PI) * ((Math.log(x / 2) + EULER) * besselJ(x, 0) + sum)
}

function y1Series(x: number) {
  // Y1 = (2/π)(ln(x/2)+γ)J1 − 2/(πx) − (1/π) Σ (-1)^k (H_k + H_{k+1}) (x/2)^(2k+1) / (k!(k+1)!)  (with H_0 = 0)
  let sum = 0
  let term = x / 2
  let hk = 0
  for (let k = 0; k < 300; k++) {
    if (k > 0) term *= -(x * x) / 4 / (k * (k + 1))
    const hk1 = hk + 1 / (k + 1)
    const t = term * (hk + hk1)
    sum += t
    hk = hk1
    if (Math.abs(t) < 1e-17 * Math.max(1, Math.abs(sum))) break
  }
  return (2 / Math.PI) * (Math.log(x / 2) + EULER) * besselJ(x, 1) - 2 / (Math.PI * x) - sum / Math.PI
}

function y0Large(x: number) {
  return hankel(x, 0).y
}

function y1Large(x: number) {
  return hankel(x, 1).y
}

/** Modified Bessel K of integer order: series for K0/K1, then upward recurrence. */
export function besselK(x: number, n: number): number {
  if (x <= 0) return NaN
  const k0 = (() => {
    let sum = 0
    let term = 1
    let h = 0
    for (let k = 1; k < 300; k++) {
      term *= (x * x) / 4 / (k * k)
      h += 1 / k
      sum += term * h
      if (term * h < 1e-17 * sum) break
    }
    return -(Math.log(x / 2) + EULER) * besselI(x, 0) + sum
  })()
  if (n === 0) return k0
  const k1 = (() => {
    // K1 = (1/x) + (ln(x/2)+γ) I1 − (x/4) Σ (H_k + H_{k+1}) (x²/4)^k / (k!(k+1)!)
    let sum = 0
    let term = 1
    let hk = 0
    for (let k = 0; k < 300; k++) {
      if (k > 0) term *= (x * x) / 4 / (k * (k + 1))
      const hk1 = hk + 1 / (k + 1)
      sum += term * (hk + hk1)
      hk = hk1
      if (term < 1e-17) break
    }
    return 1 / x + (Math.log(x / 2) + EULER) * besselI(x, 1) - (x / 4) * sum
  })()
  let a = k0
  let b = k1
  for (let k = 1; k < n; k++) {
    const c = ((2 * k) / x) * b + a
    a = b
    b = c
  }
  return b
}

function bessel(name: string, f: (x: number, n: number) => number, positive: boolean) {
  sfn(name, 2, 2, (a) => {
    const x = N(a[0])
    if (isErr(x)) return x
    const n = optN(a, 1, 0)
    if (isErr(n)) return n
    const order = Math.trunc(n)
    if (order < 0 || (positive && x <= 0)) return ERR.num
    const r = f(x, order)
    return Number.isFinite(r) ? r : ERR.num
  })
}
bessel('BESSELJ', besselJ, false)
bessel('BESSELI', besselI, false)
bessel('BESSELY', besselY, true)
bessel('BESSELK', besselK, true)

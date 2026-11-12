import { Matrix } from '../../model/matrix'
import { textToNumber } from '../../model/parseInput'
import { CellError, ERR, type Scalar } from '../../model/types'
import { fn } from '../registry'
import {
  LambdaV, Omitted, RefV, clampArea, compareText, eachCell, lift, toBool, toMatrix, toNumber, toScalar, toText, type Ctx, type Value,
} from '../values'

export { ERR, CellError, Matrix, RefV, LambdaV, Omitted }

/** Registers a function whose arguments are all scalars; arrays are processed element-wise. */
export function sfn(name: string, min: number, max: number, impl: (a: Scalar[], ctx: Ctx) => Scalar) {
  fn(name, min, max, (args, ctx) => lift(args, ctx, (s) => impl(s, ctx)))
}

export const isErr = (v: unknown): v is CellError => v instanceof CellError

/** Number from a scalar argument (blank → 0). */
export function N(v: Scalar): number | CellError {
  return toNumber(v)
}

export function T(v: Scalar): string | CellError {
  return toText(v)
}

export function B(v: Scalar): boolean | CellError {
  return toBool(v)
}

/** Optional number argument with default. */
export function optN(a: Scalar[], i: number, def: number): number | CellError {
  if (i >= a.length || a[i] === null) return def
  return toNumber(a[i])
}

export function optB(a: Scalar[], i: number, def: boolean): boolean | CellError {
  if (i >= a.length || a[i] === null) return def
  return toBool(a[i])
}

export function isOmitted(args: Value[], i: number) {
  return i >= args.length || args[i] instanceof Omitted
}

/** Scalar from a raw (unlifted) argument with default when omitted. */
export function argScalar(args: Value[], i: number, ctx: Ctx, def: Scalar = null): Scalar {
  if (isOmitted(args, i)) return def
  return toScalar(args[i], ctx)
}

export function argNum(args: Value[], i: number, ctx: Ctx, def?: number): number | CellError {
  if (isOmitted(args, i)) return def === undefined ? ERR.value : def
  return toNumber(toScalar(args[i], ctx))
}

export function argBool(args: Value[], i: number, ctx: Ctx, def: boolean): boolean | CellError {
  if (isOmitted(args, i)) return def
  return toBool(toScalar(args[i], ctx))
}

export function argMatrix(args: Value[], i: number, ctx: Ctx): Matrix | CellError {
  if (isOmitted(args, i)) return ERR.value
  const v = args[i]
  if (v instanceof CellError) return v
  return toMatrix(v, ctx)
}

export function int(x: number) {
  return Math.trunc(x)
}

/** Text or number criteria matcher used by COUNTIF, SUMIFS, DCOUNT and friends. */
export function criterion(crit: Scalar): (v: Scalar) => boolean {
  if (crit === null) return (v) => v === null || v === 0
  if (typeof crit === 'number') return (v) => (typeof v === 'number' ? Math.abs(v - crit) < 1e-12 * Math.max(1, Math.abs(crit)) : typeof v === 'string' && textToNumber(v) === crit)
  if (typeof crit === 'boolean') return (v) => v === crit
  if (crit instanceof CellError) return (v) => v instanceof CellError && v.code === crit.code
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(crit)!
  const op = m[1] ?? ''
  const rest = m[2]
  const num = rest.trim() === '' ? null : textToNumber(rest)
  const upper = rest.toUpperCase()
  const boolCrit = upper === 'TRUE' ? true : upper === 'FALSE' ? false : null
  if (op === '' || op === '=') {
    if (rest === '') return op === '=' ? (v) => v === null : (v) => v === null || v === ''
    if (num !== null) return (v) => (typeof v === 'number' && Math.abs(v - num) < 1e-12 * Math.max(1, Math.abs(num))) || (typeof v === 'string' && v.trim() !== '' && textToNumber(v) === num)
    if (boolCrit !== null) return (v) => v === boolCrit
    const re = wildcard(rest)
    return (v) => typeof v === 'string' && re.test(v)
  }
  if (op === '<>') {
    if (rest === '') return (v) => v !== null && v !== ''
    if (num !== null) return (v) => !(typeof v === 'number' && Math.abs(v - num) < 1e-12 * Math.max(1, Math.abs(num)))
    if (boolCrit !== null) return (v) => v !== boolCrit
    const re = wildcard(rest)
    return (v) => !(typeof v === 'string' && re.test(v))
  }
  const cmp = (c: number) => (op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0)
  if (num !== null) return (v) => typeof v === 'number' && cmp(v - num)
  return (v) => typeof v === 'string' && cmp(compareText(v, rest))
}

export function wildcard(pattern: string, anchored = true): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '~' && (pattern[i + 1] === '*' || pattern[i + 1] === '?' || pattern[i + 1] === '~')) {
      re += '\\' + pattern[++i]
    } else if (ch === '*') re += '[\\s\\S]*'
    else if (ch === '?') re += '[\\s\\S]'
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(anchored ? `^${re}$` : re, 'i')
}

export const hasWildcard = (s: string) => /(^|[^~])[*?]/.test(s)

/** Iterates a range (or array) with positions, including blank cells within the used range. */
export function eachPos(v: Value, ctx: Ctx, cb: (val: Scalar, i: number, j: number) => void) {
  if (v instanceof RefV) {
    const a = v.area
    const b = clampArea(a)
    for (let r = a.r1; r <= b.r2; r++) for (let c = a.c1; c <= b.c2; c++) cb(ctx.host.value(a.sheet, r, c), r - a.r1, c - a.c1)
    return
  }
  const m = toMatrix(v, ctx)
  if (m instanceof CellError) return
  for (let i = 0; i < m.rows; i++) for (let j = 0; j < m.cols; j++) cb(m.get(i, j), i, j)
}

/** Size of a range/array argument (unclamped for references). */
export function dims(v: Value, ctx: Ctx): { rows: number; cols: number } {
  if (v instanceof RefV) return { rows: v.rows, cols: v.cols }
  if (v instanceof Matrix) return { rows: v.rows, cols: v.cols }
  void ctx
  return { rows: 1, cols: 1 }
}

/** Value at (i, j) of a range/array argument. */
export function valueAt(v: Value, i: number, j: number, ctx: Ctx): Scalar {
  if (v instanceof RefV) {
    const a = v.area
    if (i > a.r2 - a.r1 || j > a.c2 - a.c1) return null
    return ctx.host.value(a.sheet, a.r1 + i, a.c1 + j)
  }
  if (v instanceof Matrix) return i < v.rows && j < v.cols ? v.get(i, j) : null
  return i === 0 && j === 0 ? toScalar(v, ctx) : null
}

export { eachCell, toMatrix, toScalar, toNumber, toText, toBool, lift }

export function numbersOf(values: Scalar[]): number[] {
  return values.filter((v): v is number => typeof v === 'number')
}

export function matrixResult(rows: Scalar[][]): Matrix | CellError {
  if (!rows.length || !rows[0].length) return ERR.calc
  return Matrix.from(rows)
}

/** Factorial with a cache for small values. */
const factCache: number[] = [1]
export function factorial(n: number): number {
  if (n < 0) return NaN
  n = Math.floor(n)
  if (n > 170) return Infinity
  for (let i = factCache.length; i <= n; i++) factCache[i] = factCache[i - 1] * i
  return factCache[n]
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

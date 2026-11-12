import { roundTo } from '../../model/numfmt'
import { FUNCTIONS, alias, fn, VARARGS } from '../registry'
import { aggregateBy } from './stats'
import { collectNumbers, eachCell, flatten, type Ctx, type Value } from '../values'
import {
  CellError, ERR, Matrix, RefV, Omitted, argMatrix, argNum, criterion, factorial, gcd, isErr, N, optN, sfn, toMatrix, toNumber, toScalar, dims, valueAt,
} from './helpers'
import type { Scalar } from '../../model/types'

const num = (x: number): Scalar => (Number.isFinite(x) ? x : ERR.num)

function unary(name: string, f: (x: number) => number, domain?: (x: number) => boolean, err: CellError = ERR.num) {
  sfn(name, 1, 1, ([a]) => {
    const x = N(a)
    if (isErr(x)) return x
    if (domain && !domain(x)) return err
    return num(f(x))
  })
}

unary('ABS', Math.abs)
unary('ACOS', Math.acos, (x) => x >= -1 && x <= 1)
unary('ACOSH', Math.acosh, (x) => x >= 1)
unary('ACOT', (x) => Math.PI / 2 - Math.atan(x))
unary('ACOTH', (x) => 0.5 * Math.log((x + 1) / (x - 1)), (x) => Math.abs(x) > 1)
unary('ASIN', Math.asin, (x) => x >= -1 && x <= 1)
unary('ASINH', Math.asinh)
unary('ATAN', Math.atan)
unary('ATANH', Math.atanh, (x) => x > -1 && x < 1)
unary('COS', Math.cos, (x) => Math.abs(x) < 2 ** 27)
unary('COSH', Math.cosh)
unary('COT', (x) => 1 / Math.tan(x), (x) => x !== 0, ERR.div0)
unary('COTH', (x) => 1 / Math.tanh(x), (x) => x !== 0, ERR.div0)
unary('CSC', (x) => 1 / Math.sin(x), (x) => x !== 0, ERR.div0)
unary('CSCH', (x) => 1 / Math.sinh(x), (x) => x !== 0, ERR.div0)
unary('SEC', (x) => 1 / Math.cos(x))
unary('SECH', (x) => 1 / Math.cosh(x))
unary('SIN', Math.sin, (x) => Math.abs(x) < 2 ** 27)
unary('SINH', Math.sinh)
unary('TAN', Math.tan, (x) => Math.abs(x) < 2 ** 27)
unary('TANH', Math.tanh)
unary('DEGREES', (x) => (x * 180) / Math.PI)
unary('RADIANS', (x) => (x * Math.PI) / 180)
unary('EXP', Math.exp)
unary('LN', Math.log, (x) => x > 0)
unary('LOG10', Math.log10, (x) => x > 0)
unary('SQRT', Math.sqrt, (x) => x >= 0)
unary('SQRTPI', (x) => Math.sqrt(x * Math.PI), (x) => x >= 0)
unary('INT', Math.floor)
unary('SIGN', Math.sign)
unary('FACT', (x) => factorial(Math.floor(x)), (x) => x >= 0)
unary('FACTDOUBLE', (x) => {
  let r = 1
  for (let i = Math.floor(x); i > 1; i -= 2) r *= i
  return r
}, (x) => x >= -1)
unary('EVEN', (x) => {
  const s = Math.sign(x) || 1
  const a = Math.ceil(Math.abs(x))
  return s * (a % 2 === 0 ? a : a + 1)
})
unary('ODD', (x) => {
  const s = Math.sign(x) || 1
  const a = Math.ceil(Math.abs(x))
  return s * (a % 2 === 1 ? a : a + 1)
})
unary('GAMMA', gamma, (x) => !(x <= 0 && Number.isInteger(x)))
unary('GAMMALN', (x) => lnGamma(x), (x) => x > 0)
alias('GAMMALN.PRECISE', 'GAMMALN')

fn('PI', 0, 0, () => Math.PI)
fn('RAND', 0, 0, () => Math.random(), { volatile: true })
sfn('RANDBETWEEN', 2, 2, ([a, b]) => {
  const lo = N(a)
  const hi = N(b)
  if (isErr(lo)) return lo
  if (isErr(hi)) return hi
  const l = Math.ceil(lo)
  const h = Math.floor(hi)
  if (l > h) return ERR.num
  return l + Math.floor(Math.random() * (h - l + 1))
})
markVolatile('RANDBETWEEN')

fn('RANDARRAY', 0, 5, (args, ctx) => {
  const rows = argNum(args, 0, ctx, 1)
  const cols = argNum(args, 1, ctx, 1)
  const min = argNum(args, 2, ctx, 0)
  const max = argNum(args, 3, ctx, 1)
  const whole = isOmittedArg(args, 4) ? false : !!toNumber(toScalar(args[4], ctx))
  for (const v of [rows, cols, min, max]) if (isErr(v)) return v
  const [r, c, lo, hi] = [rows, cols, min, max] as number[]
  if (r < 1 || c < 1 || lo > hi) return ERR.value
  return Matrix.fill(Math.floor(r), Math.floor(c), () => (whole ? Math.ceil(lo) + Math.floor(Math.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) : lo + Math.random() * (hi - lo)))
}, { volatile: true })

function isOmittedArg(args: Value[], i: number) {
  return i >= args.length || args[i] instanceof Omitted
}

function markVolatile(name: string) {
  const def = FUNCTIONS.get(name)
  if (def) def.volatile = true
}

sfn('ATAN2', 2, 2, ([a, b]) => {
  const x = N(a)
  const y = N(b)
  if (isErr(x)) return x
  if (isErr(y)) return y
  if (x === 0 && y === 0) return ERR.div0
  return Math.atan2(y, x)
})

sfn('LOG', 1, 2, (a) => {
  const x = N(a[0])
  const b = optN(a, 1, 10)
  if (isErr(x)) return x
  if (isErr(b)) return b
  if (x <= 0 || b <= 0) return ERR.num
  if (b === 1) return ERR.div0
  return Math.log(x) / Math.log(b)
})

sfn('POWER', 2, 2, ([a, b]) => {
  const x = N(a)
  const y = N(b)
  if (isErr(x)) return x
  if (isErr(y)) return y
  if (x === 0 && y === 0) return ERR.num
  if (x === 0 && y < 0) return ERR.div0
  const r = Math.pow(x, y)
  return Number.isNaN(r) ? ERR.num : num(r)
})

sfn('MOD', 2, 2, ([a, b]) => {
  const x = N(a)
  const d = N(b)
  if (isErr(x)) return x
  if (isErr(d)) return d
  if (d === 0) return ERR.div0
  const r = x - d * Math.floor(x / d)
  return Math.abs(r) < 1e-12 ? 0 : roundTo(r, 12)
})

sfn('QUOTIENT', 2, 2, ([a, b]) => {
  const x = N(a)
  const d = N(b)
  if (isErr(x)) return x
  if (isErr(d)) return d
  if (d === 0) return ERR.div0
  return Math.trunc(x / d)
})

function roundFn(name: string, mode: 'round' | 'up' | 'down') {
  sfn(name, 1, 2, (a) => {
    const x = N(a[0])
    const d = name === 'ROUND' ? N(a[1] ?? null) : optN(a, 1, 0)
    if (isErr(x)) return x
    if (isErr(d)) return d
    const digits = Math.trunc(d)
    if (mode === 'round') return roundTo(x, digits)
    const f = Math.pow(10, digits)
    const scaled = roundTo(Math.abs(x) * f, 9)
    const r = (mode === 'up' ? Math.ceil(scaled) : Math.floor(scaled)) / f
    return Math.sign(x) * r
  })
}
roundFn('ROUND', 'round')
roundFn('ROUNDUP', 'up')
roundFn('ROUNDDOWN', 'down')
sfn('TRUNC', 1, 2, (a) => {
  const x = N(a[0])
  const d = optN(a, 1, 0)
  if (isErr(x)) return x
  if (isErr(d)) return d
  const f = Math.pow(10, Math.trunc(d))
  return Math.trunc(roundTo(x * f, 9)) / f
})

sfn('MROUND', 2, 2, ([a, b]) => {
  const x = N(a)
  const m = N(b)
  if (isErr(x)) return x
  if (isErr(m)) return m
  if (m === 0) return 0
  if (Math.sign(x) * Math.sign(m) < 0) return ERR.num
  return roundTo(Math.round(roundTo(x / m, 9)) * m, 12)
})

function ceilFloor(name: string, up: boolean, kind: 'classic' | 'math' | 'precise') {
  sfn(name, kind === 'classic' ? 2 : 1, kind === 'math' ? 3 : 2, (a) => {
    const x = N(a[0])
    if (isErr(x)) return x
    let sig = optN(a, 1, Math.sign(x) < 0 && kind === 'classic' ? -1 : 1)
    if (isErr(sig)) return sig
    if (x === 0 || sig === 0) return 0
    if (kind === 'classic') {
      if (x > 0 && sig < 0) return ERR.num
      const q = roundTo(x / sig, 9)
      return roundTo((up ? Math.ceil(q) : Math.floor(q)) * sig, 12)
    }
    sig = Math.abs(sig)
    const mode = kind === 'math' ? optN(a, 2, 0) : 0
    if (isErr(mode)) return mode
    const q = roundTo(x / sig, 9)
    let r: number
    if (x < 0 && mode !== 0) r = (up ? Math.floor(q) : Math.ceil(q)) * sig
    else r = (up ? Math.ceil(q) : Math.floor(q)) * sig
    return roundTo(r, 12)
  })
}
ceilFloor('CEILING', true, 'classic')
ceilFloor('FLOOR', false, 'classic')
ceilFloor('CEILING.MATH', true, 'math')
ceilFloor('FLOOR.MATH', false, 'math')
ceilFloor('CEILING.PRECISE', true, 'precise')
ceilFloor('FLOOR.PRECISE', false, 'precise')
alias('ISO.CEILING', 'CEILING.PRECISE')

sfn('COMBIN', 2, 2, ([a, b]) => {
  const n = N(a)
  const k = N(b)
  if (isErr(n)) return n
  if (isErr(k)) return k
  const nn = Math.trunc(n)
  const kk = Math.trunc(k)
  if (nn < 0 || kk < 0 || kk > nn) return ERR.num
  return Math.round(combin(nn, kk))
})
sfn('COMBINA', 2, 2, ([a, b]) => {
  const n = N(a)
  const k = N(b)
  if (isErr(n)) return n
  if (isErr(k)) return k
  const nn = Math.trunc(n)
  const kk = Math.trunc(k)
  if (nn < 0 || kk < 0) return ERR.num
  return Math.round(combin(nn + kk - 1, kk))
})
export function combin(n: number, k: number) {
  let r = 1
  k = Math.min(k, n - k)
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

fn('GCD', 1, VARARGS, (args, ctx) => {
  const ns = collectNumbers(args, ctx)
  if (isErr(ns)) return ns
  if (ns.some((x) => x < 0)) return ERR.num
  return ns.reduce((acc, x) => gcd(acc, Math.trunc(x)), 0)
})
fn('LCM', 1, VARARGS, (args, ctx) => {
  const ns = collectNumbers(args, ctx)
  if (isErr(ns)) return ns
  if (ns.some((x) => x < 0)) return ERR.num
  return ns.reduce((acc, x) => {
    const v = Math.trunc(x)
    if (acc === 0 || v === 0) return 0
    return (acc * v) / gcd(acc, v)
  }, 1)
})
fn('MULTINOMIAL', 1, VARARGS, (args, ctx) => {
  const ns = collectNumbers(args, ctx)
  if (isErr(ns)) return ns
  if (ns.some((x) => x < 0)) return ERR.num
  const t = ns.map(Math.trunc)
  const sum = t.reduce((a, b) => a + b, 0)
  return Math.round(t.reduce((acc, x) => acc / factorial(x), factorial(sum)))
})

// ---------- sums & products ----------

fn('SUM', 1, VARARGS, (args, ctx) => {
  let total = 0
  for (const arg of args) {
    if (arg instanceof RefV) {
      let err: CellError | null = null
      eachCell(arg, ctx, (v) => {
        if (typeof v === 'number') total += v
        else if (v instanceof CellError) {
          err = v
          return false
        }
      })
      if (err) return err
      continue
    }
    const ns = collectNumbers([arg], ctx)
    if (isErr(ns)) return ns
    for (const n of ns) total += n
  }
  return total
})

fn('PRODUCT', 1, VARARGS, (args, ctx) => {
  const ns = collectNumbers(args.filter((a) => !(a instanceof Omitted)), ctx)
  if (isErr(ns)) return ns
  return ns.length ? ns.reduce((a, b) => a * b, 1) : 0
})

fn('SUMSQ', 1, VARARGS, (args, ctx) => {
  const ns = collectNumbers(args, ctx)
  if (isErr(ns)) return ns
  return ns.reduce((a, b) => a + b * b, 0)
})

fn('SUMPRODUCT', 1, VARARGS, (args, ctx) => {
  const ms: Matrix[] = []
  for (const a of args) {
    const m = toMatrix(a, ctx)
    if (isErr(m)) return m
    ms.push(m)
  }
  const { rows, cols } = ms[0]
  if (ms.some((m) => m.rows !== rows || m.cols !== cols)) return ERR.value
  let total = 0
  for (let i = 0; i < rows * cols; i++) {
    let p = 1
    for (const m of ms) {
      const v = m.data[i]
      if (v instanceof CellError) return v
      p *= typeof v === 'number' ? v : 0
    }
    total += p
  }
  return total
})

function pairSum(name: string, f: (x: number, y: number) => number) {
  fn(name, 2, 2, (args, ctx) => {
    const a = argMatrix(args, 0, ctx)
    const b = argMatrix(args, 1, ctx)
    if (isErr(a)) return a
    if (isErr(b)) return b
    if (a.data.length !== b.data.length) return ERR.na
    let t = 0
    for (let i = 0; i < a.data.length; i++) {
      const x = a.data[i]
      const y = b.data[i]
      if (x instanceof CellError) return x
      if (y instanceof CellError) return y
      if (typeof x === 'number' && typeof y === 'number') t += f(x, y)
    }
    return t
  })
}
pairSum('SUMX2MY2', (x, y) => x * x - y * y)
pairSum('SUMX2PY2', (x, y) => x * x + y * y)
pairSum('SUMXMY2', (x, y) => (x - y) * (x - y))

fn('SERIESSUM', 4, 4, (args, ctx) => {
  const x = argNum(args, 0, ctx)
  const n = argNum(args, 1, ctx)
  const m = argNum(args, 2, ctx)
  const coef = argMatrix(args, 3, ctx)
  if (isErr(x)) return x
  if (isErr(n)) return n
  if (isErr(m)) return m
  if (isErr(coef)) return coef
  let total = 0
  coef.data.forEach((a, i) => {
    if (typeof a === 'number') total += a * Math.pow(x, n + i * m)
  })
  return total
})

// ---------- conditional sums ----------

/** Shared implementation of the *IF / *IFS family. Returns matching positions' values in `target`. */
export function matchCriteria(pairs: [Value, Scalar][], ctx: Ctx, target: Value | null): { values: Scalar[]; extraBlank: number } | CellError {
  if (!pairs.length) return ERR.value
  const first = pairs[0][0]
  if (!(first instanceof RefV) && !(first instanceof Matrix)) return ERR.value
  const d0 = dims(first, ctx)
  for (const [r] of pairs) {
    const d = dims(r, ctx)
    if (d.rows !== d0.rows || d.cols !== d0.cols) return ERR.value
  }
  const tests = pairs.map(([, c]) => criterion(c))
  const out: Scalar[] = []
  // number of rows actually present (used range); cells beyond are blank everywhere
  let rowsUsed = d0.rows
  let colsUsed = d0.cols
  if (first instanceof RefV) {
    const u = first.area.sheet.used()
    rowsUsed = Math.min(d0.rows, Math.max(0, u.r - first.area.r1 + 1))
    colsUsed = Math.min(d0.cols, Math.max(0, u.c - first.area.c1 + 1))
    for (const [r] of pairs.slice(1)) {
      if (r instanceof RefV) {
        const uu = r.area.sheet.used()
        rowsUsed = Math.max(rowsUsed, Math.min(d0.rows, Math.max(0, uu.r - r.area.r1 + 1)))
        colsUsed = Math.max(colsUsed, Math.min(d0.cols, Math.max(0, uu.c - r.area.c1 + 1)))
      }
    }
    if (target instanceof RefV) {
      const ut = target.area.sheet.used()
      rowsUsed = Math.max(rowsUsed, Math.min(d0.rows, Math.max(0, ut.r - target.area.r1 + 1)))
      colsUsed = Math.max(colsUsed, Math.min(d0.cols, Math.max(0, ut.c - target.area.c1 + 1)))
    }
  }
  for (let i = 0; i < rowsUsed; i++)
    for (let j = 0; j < colsUsed; j++) {
      let ok = true
      for (let p = 0; p < pairs.length; p++) {
        if (!tests[p](valueAt(pairs[p][0], i, j, ctx))) {
          ok = false
          break
        }
      }
      if (ok) out.push(target ? valueAt(target, i, j, ctx) : true)
    }
  const blankMatches = tests.every((t) => t(null))
  const extraBlank = blankMatches ? d0.rows * d0.cols - rowsUsed * colsUsed : 0
  return { values: out, extraBlank }
}

function critPairs(args: Value[], from: number, ctx: Ctx): [Value, Scalar][] | CellError {
  const pairs: [Value, Scalar][] = []
  for (let i = from; i + 1 < args.length + 1 && i < args.length; i += 2) {
    if (i + 1 >= args.length) return ERR.value
    pairs.push([args[i], toScalar(args[i + 1], ctx)])
  }
  return pairs
}

/** Lifts the criteria argument(s) when they are arrays: COUNTIF(A:A, {"a","b"}) → array. */
function liftCriteria(args: Value[], critIdx: number[], ctx: Ctx, f: (crit: Value[]) => Scalar): Scalar | Matrix {
  const arr = critIdx.find((i) => args[i] instanceof Matrix || (args[i] instanceof RefV && !(args[i] as RefV).isCell))
  if (arr === undefined) return f(args)
  const m = toMatrix(args[arr], ctx)
  if (isErr(m)) return m
  return m.map((v) => {
    const copy = args.slice()
    copy[arr] = v
    return f(copy)
  })
}

fn('SUMIF', 2, 3, (args, ctx) =>
  liftCriteria(args, [1], ctx, (a) => {
    const res = matchCriteria([[a[0], toScalar(a[1], ctx)]], ctx, a.length > 2 && !(a[2] instanceof Omitted) ? a[2] : a[0])
    if (isErr(res)) return res
    let t = 0
    for (const v of res.values) {
      if (v instanceof CellError) return v
      if (typeof v === 'number') t += v
    }
    return t
  }),
)

fn('SUMIFS', 3, VARARGS, (args, ctx) =>
  liftCriteria(args, args.map((_, i) => i).filter((i) => i >= 2 && i % 2 === 0), ctx, (a) => {
    const pairs = critPairs(a, 1, ctx)
    if (isErr(pairs)) return pairs
    const res = matchCriteria(pairs, ctx, a[0])
    if (isErr(res)) return res
    let t = 0
    for (const v of res.values) {
      if (v instanceof CellError) return v
      if (typeof v === 'number') t += v
    }
    return t
  }),
)

fn('COUNTIF', 2, 2, (args, ctx) =>
  liftCriteria(args, [1], ctx, (a) => {
    const res = matchCriteria([[a[0], toScalar(a[1], ctx)]], ctx, null)
    if (isErr(res)) return res
    return res.values.length + res.extraBlank
  }),
)

fn('COUNTIFS', 2, VARARGS, (args, ctx) =>
  liftCriteria(args, args.map((_, i) => i).filter((i) => i % 2 === 1), ctx, (a) => {
    const pairs = critPairs(a, 0, ctx)
    if (isErr(pairs)) return pairs
    const res = matchCriteria(pairs, ctx, null)
    if (isErr(res)) return res
    return res.values.length + res.extraBlank
  }),
)

fn('AVERAGEIF', 2, 3, (args, ctx) => {
  const res = matchCriteria([[args[0], toScalar(args[1], ctx)]], ctx, args.length > 2 && !(args[2] instanceof Omitted) ? args[2] : args[0])
  if (isErr(res)) return res
  const ns = res.values.filter((v): v is number => typeof v === 'number')
  const e = res.values.find((v) => v instanceof CellError)
  if (e) return e
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : ERR.div0
})

fn('AVERAGEIFS', 3, VARARGS, (args, ctx) => {
  const pairs = critPairs(args, 1, ctx)
  if (isErr(pairs)) return pairs
  const res = matchCriteria(pairs, ctx, args[0])
  if (isErr(res)) return res
  const ns = res.values.filter((v): v is number => typeof v === 'number')
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : ERR.div0
})

function minMaxIfs(name: string, max: boolean) {
  fn(name, 3, VARARGS, (args, ctx) => {
    const pairs = critPairs(args, 1, ctx)
    if (isErr(pairs)) return pairs
    const res = matchCriteria(pairs, ctx, args[0])
    if (isErr(res)) return res
    const ns = res.values.filter((v): v is number => typeof v === 'number')
    if (!ns.length) return 0
    return max ? Math.max(...ns) : Math.min(...ns)
  })
}
minMaxIfs('MAXIFS', true)
minMaxIfs('MINIFS', false)

// ---------- SUBTOTAL / AGGREGATE ----------

function subtotalValues(refs: Value[], ctx: Ctx, skipHidden: boolean, skipErrors: boolean, skipNested: boolean): Scalar[] | CellError {
  const out: Scalar[] = []
  for (const ref of refs) {
    if (ref instanceof RefV) {
      for (const a of ref.areas) {
        const sheet = a.sheet
        let err: CellError | null = null
        eachCell(new RefV([a]), ctx, (v, r, c) => {
          if (skipHidden && sheet.rows.hidden.has(r)) return
          if (skipNested) {
            const f = ctx.host.formulaAt(sheet, r, c)
            if (f && /\b(SUBTOTAL|AGGREGATE)\s*\(/i.test(f)) return
          }
          if (v instanceof CellError) {
            if (skipErrors) return
            err = v
            return false
          }
          out.push(v)
        })
        if (err) return err
      }
    } else {
      const flat = flatten(ref, ctx)
      if (isErr(flat)) return flat
      for (const v of flat) {
        if (v instanceof CellError && !skipErrors) return v
        if (!(v instanceof CellError)) out.push(v)
      }
    }
  }
  return out
}

fn('SUBTOTAL', 2, VARARGS, (args, ctx) => {
  const f = argNum(args, 0, ctx)
  if (isErr(f)) return f
  const code = Math.trunc(f)
  const base = code > 100 ? code - 100 : code
  if (base < 1 || base > 11) return ERR.value
  const vals = subtotalValues(args.slice(1), ctx, code > 100, false, true)
  if (isErr(vals)) return vals
  return aggregateBy(base, vals)
})

fn('AGGREGATE', 3, VARARGS, (args, ctx) => {
  const f = argNum(args, 0, ctx)
  const o = argNum(args, 1, ctx)
  if (isErr(f)) return f
  if (isErr(o)) return o
  const code = Math.trunc(f)
  const opt = Math.trunc(o)
  if (code < 1 || code > 19) return ERR.value
  const skipHidden = opt === 1 || opt === 3 || opt === 5 || opt === 7
  const skipErrors = opt === 2 || opt === 3 || opt === 6 || opt === 7
  const skipNested = opt <= 3
  if (code >= 14) {
    const vals = subtotalValues([args[2]], ctx, skipHidden, skipErrors, skipNested)
    if (isErr(vals)) return vals
    const k = argNum(args, 3, ctx)
    if (isErr(k)) return k
    return aggregateBy(code, vals, k)
  }
  const vals = subtotalValues(args.slice(2), ctx, skipHidden, skipErrors, skipNested)
  if (isErr(vals)) return vals
  return aggregateBy(code, vals)
})

// ---------- matrices ----------

function numericMatrix(v: Value, ctx: Ctx): number[][] | CellError {
  const m = toMatrix(v, ctx)
  if (isErr(m)) return m
  const rows: number[][] = []
  for (let r = 0; r < m.rows; r++) {
    const row: number[] = []
    for (let c = 0; c < m.cols; c++) {
      const x = m.get(r, c)
      if (typeof x !== 'number') return ERR.value
      row.push(x)
    }
    rows.push(row)
  }
  return rows
}

fn('MMULT', 2, 2, (args, ctx) => {
  const a = numericMatrix(args[0], ctx)
  const b = numericMatrix(args[1], ctx)
  if (isErr(a)) return a
  if (isErr(b)) return b
  if (a[0].length !== b.length) return ERR.value
  return Matrix.fill(a.length, b[0].length, (r, c) => {
    let s = 0
    for (let k = 0; k < b.length; k++) s += a[r][k] * b[k][c]
    return s
  })
})

function luDet(m: number[][]): number {
  const n = m.length
  const a = m.map((r) => r.slice())
  let det = 1
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r
    if (Math.abs(a[p][i]) < 1e-300) return 0
    if (p !== i) {
      ;[a[p], a[i]] = [a[i], a[p]]
      det = -det
    }
    det *= a[i][i]
    for (let r = i + 1; r < n; r++) {
      const f = a[r][i] / a[i][i]
      for (let c = i; c < n; c++) a[r][c] -= f * a[i][c]
    }
  }
  return det
}

fn('MDETERM', 1, 1, (args, ctx) => {
  const a = numericMatrix(args[0], ctx)
  if (isErr(a)) return a
  if (a.length !== a[0].length) return ERR.value
  return luDet(a)
})

fn('MINVERSE', 1, 1, (args, ctx) => {
  const a = numericMatrix(args[0], ctx)
  if (isErr(a)) return a
  const n = a.length
  if (n !== a[0].length) return ERR.value
  const m = a.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r
    if (Math.abs(m[p][i]) < 1e-12) return ERR.num
    ;[m[p], m[i]] = [m[i], m[p]]
    const d = m[i][i]
    for (let c = 0; c < 2 * n; c++) m[i][c] /= d
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = m[r][i]
      for (let c = 0; c < 2 * n; c++) m[r][c] -= f * m[i][c]
    }
  }
  return Matrix.fill(n, n, (r, c) => m[r][n + c])
})

fn('MUNIT', 1, 1, (args, ctx) => {
  const n = argNum(args, 0, ctx)
  if (isErr(n)) return n
  if (n < 1) return ERR.value
  return Matrix.fill(Math.trunc(n), Math.trunc(n), (r, c) => (r === c ? 1 : 0))
})

// ---------- conversions ----------

// ROMAN is in extra.ts (all five forms).

sfn('ARABIC', 1, 1, ([a]) => {
  const s = typeof a === 'string' ? a.trim().toUpperCase() : ''
  if (!s) return 0
  const neg = s.startsWith('-')
  const t = neg ? s.slice(1) : s
  const val: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  let total = 0
  for (let i = 0; i < t.length; i++) {
    const v = val[t[i]]
    if (!v) return ERR.value
    const next = val[t[i + 1]] ?? 0
    total += v < next ? -v : v
  }
  return neg ? -total : total
})

sfn('BASE', 2, 3, (a) => {
  const x = N(a[0])
  const radix = N(a[1])
  const len = optN(a, 2, 0)
  if (isErr(x)) return x
  if (isErr(radix)) return radix
  if (isErr(len)) return len
  if (x < 0 || radix < 2 || radix > 36) return ERR.num
  return Math.trunc(x).toString(Math.trunc(radix)).toUpperCase().padStart(Math.trunc(len), '0')
})

sfn('DECIMAL', 2, 2, ([a, b]) => {
  const radix = N(b)
  if (isErr(radix)) return radix
  const s = String(a ?? '').trim()
  const r = Math.trunc(radix)
  if (r < 2 || r > 36) return ERR.num
  const v = parseInt(s, r)
  return Number.isNaN(v) ? ERR.num : v
})

// ---------- gamma helpers (used by statistics too) ----------

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]

export function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x))
  x -= 1
  let a = 0.99999999999980993
  const t = x + 7.5
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1)
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a
}

export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x)
  x -= 1
  let a = 0.99999999999980993
  const t = x + 7.5
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

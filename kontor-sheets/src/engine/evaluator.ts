import { CellError, ERR, type Scalar } from '../model/types'
import { Matrix } from '../model/matrix'
import type { Node } from './parser'
import { FUNCTIONS } from './registry'
import {
  LambdaV, Omitted, RefV, compareValues, pick, scalarOrMatrix, toNumber, toScalar, toText, type Ctx, type RefArea, type Scope, type Value,
} from './values'

/** Returned for functions that do not exist (lets imported files keep their cached results). */
export const UNKNOWN_FUNCTION = new CellError('#NAME?', 'unknown function')

export function lookupVar(name: string, scope: Scope | null): Value | undefined {
  for (let s = scope; s; s = s.parent) {
    const v = s.vars.get(name)
    if (v !== undefined) return v
  }
  return undefined
}

export function callLambda(f: LambdaV, args: Value[], ctx: Ctx): Value {
  if (args.length > f.params.length) return ERR.value
  const vars = new Map<string, Value>()
  f.params.forEach((p, i) => vars.set(p, i < args.length ? args[i] : Omitted.it))
  return evaluate(f.body, { ...ctx, scope: { vars, parent: f.scope } })
}

function numResult(x: number): Scalar {
  return Number.isFinite(x) ? x : ERR.num
}

export function arith(op: string, x: Scalar, y: Scalar): Scalar {
  const a = toNumber(x)
  if (a instanceof CellError) return a
  const b = toNumber(y)
  if (b instanceof CellError) return b
  switch (op) {
    case '+': return numResult(a + b)
    case '-': return numResult(a - b)
    case '*': return numResult(a * b)
    case '/': return b === 0 ? ERR.div0 : numResult(a / b)
    case '^': {
      if (a === 0 && b === 0) return ERR.num
      if (a === 0 && b < 0) return ERR.div0
      if (a < 0 && !Number.isInteger(b)) {
        const inv = 1 / b
        if (Number.isInteger(inv) && inv % 2 !== 0) return numResult(-Math.pow(-a, b))
        return ERR.num
      }
      return numResult(Math.pow(a, b))
    }
    default: return ERR.value
  }
}

function scalarOp(op: string, x: Scalar, y: Scalar): Scalar {
  if (op === '&') {
    const a = toText(x)
    if (a instanceof CellError) return a
    const b = toText(y)
    if (b instanceof CellError) return b
    return a + b
  }
  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    if (x instanceof CellError) return x
    if (y instanceof CellError) return y
    const c = compareValues(x, y)
    switch (op) {
      case '=': return c === 0
      case '<>': return c !== 0
      case '<': return c < 0
      case '>': return c > 0
      case '<=': return c <= 0
      default: return c >= 0
    }
  }
  return arith(op, x, y)
}

/** Element-wise operation with broadcasting of single rows/columns. */
export function broadcast(a: Scalar | Matrix, b: Scalar | Matrix, f: (x: Scalar, y: Scalar) => Scalar): Scalar | Matrix {
  if (!(a instanceof Matrix) && !(b instanceof Matrix)) return f(a, b)
  const ma = a instanceof Matrix ? a : null
  const mb = b instanceof Matrix ? b : null
  const rows = Math.max(ma?.rows ?? 1, mb?.rows ?? 1)
  const cols = Math.max(ma?.cols ?? 1, mb?.cols ?? 1)
  return Matrix.fill(rows, cols, (r, c) => f(ma ? pick(ma, r, c) : (a as Scalar), mb ? pick(mb, r, c) : (b as Scalar)))
}

function mapValue(v: Scalar | Matrix, f: (x: Scalar) => Scalar): Scalar | Matrix {
  return v instanceof Matrix ? v.map(f) : f(v)
}

function areaOf(v: Value): RefArea | null {
  return v instanceof RefV && v.areas.length === 1 ? v.area : null
}

function rangeOp(av: Value, bv: Value, ctx: Ctx): Value {
  if (av instanceof CellError) return av
  if (bv instanceof CellError) return bv
  const a = areaOf(av)
  const b = areaOf(bv)
  if (!a || !b || a.sheet !== b.sheet) return ERR.value
  return ctx.host.makeRef(a.sheet, Math.min(a.r1, b.r1), Math.min(a.c1, b.c1), Math.max(a.r2, b.r2), Math.max(a.c2, b.c2))
}

function intersectOp(av: Value, bv: Value, ctx: Ctx): Value {
  if (!(av instanceof RefV) || !(bv instanceof RefV)) return ERR.value
  for (const a of av.areas)
    for (const b of bv.areas) {
      if (a.sheet !== b.sheet) continue
      const r1 = Math.max(a.r1, b.r1)
      const r2 = Math.min(a.r2, b.r2)
      const c1 = Math.max(a.c1, b.c1)
      const c2 = Math.min(a.c2, b.c2)
      if (r1 <= r2 && c1 <= c2) return ctx.host.makeRef(a.sheet, r1, c1, r2, c2)
    }
  return ERR.null
}

function callFunction(n: Extract<Node, { k: 'fn' }>, ctx: Ctx): Value {
  const def = FUNCTIONS.get(n.name)
  if (!def) {
    const v = lookupVar(n.name, ctx.scope) ?? ctx.host.definedName(n.name, ctx)
    if (v instanceof LambdaV) return callLambda(v, n.args.map((a) => evaluate(a, ctx)), ctx)
    return UNKNOWN_FUNCTION
  }
  if (n.args.length < def.min || n.args.length > def.max) return ERR.value
  if (def.lazy) return def.lazy(n.args, ctx)
  const args = n.args.map((a) => evaluate(a, ctx))
  return def.impl!(args, ctx)
}

export function evaluate(n: Node, ctx: Ctx): Value {
  switch (n.k) {
    case 'num': return n.v
    case 'str': return n.v
    case 'bool': return n.v
    case 'err': return new CellError(n.v)
    case 'empty': return Omitted.it
    case 'ref': {
      const sheet = n.sheet !== undefined ? ctx.host.sheetNamed(n.sheet) : ctx.sheet
      if (!sheet) return ERR.ref
      if (n.sheet2 !== undefined) {
        // 3-D reference: the same area on every sheet from the first to the last one
        const last = ctx.host.sheetNamed(n.sheet2)
        if (!last) return ERR.ref
        const list = ctx.host.sheetList()
        const i1 = list.indexOf(sheet)
        const i2 = list.indexOf(last)
        const areas: RefArea[] = []
        for (let i = Math.min(i1, i2); i <= Math.max(i1, i2); i++) areas.push(...ctx.host.makeRef(list[i], n.area.r1, n.area.c1, n.area.r2, n.area.c2).areas)
        return new RefV(areas)
      }
      return ctx.host.makeRef(sheet, n.area.r1, n.area.c1, n.area.r2, n.area.c2)
    }
    case 'name': {
      if (!n.sheet) {
        const v = lookupVar(n.name, ctx.scope)
        if (v !== undefined) return v
      }
      const target = n.sheet ? ctx.host.sheetNamed(n.sheet) : ctx.sheet
      if (!target) return ERR.ref
      const d = ctx.host.definedName(n.name, { ...ctx, sheet: target })
      return d === undefined ? ERR.name : d
    }
    case 'fn': return callFunction(n, ctx)
    case 'call': {
      const f = evaluate(n.callee, ctx)
      if (f instanceof LambdaV) return callLambda(f, n.args.map((a) => evaluate(a, ctx)), ctx)
      return f instanceof CellError ? f : ERR.value
    }
    case 'un': {
      const v = scalarOrMatrix(evaluate(n.a, ctx), ctx)
      if (n.op === '+') return v
      return mapValue(v, (x) => arith('*', x, -1))
    }
    case 'pct': return mapValue(scalarOrMatrix(evaluate(n.a, ctx), ctx), (x) => arith('/', x, 100))
    case 'bin': {
      const av = evaluate(n.a, ctx)
      const bv = evaluate(n.b, ctx)
      if (n.op === ':') return rangeOp(av, bv, ctx)
      if (n.op === ' ') return intersectOp(av, bv, ctx)
      return broadcast(scalarOrMatrix(av, ctx), scalarOrMatrix(bv, ctx), (x, y) => scalarOp(n.op, x, y))
    }
    case 'union': {
      const areas: RefArea[] = []
      for (const item of n.items) {
        const v = evaluate(item, ctx)
        if (v instanceof CellError) return v
        if (!(v instanceof RefV)) return ERR.value
        areas.push(...v.areas)
      }
      return new RefV(areas)
    }
    case 'arr': return Matrix.from(n.rows.map((row) => row.map((x) => toScalar(evaluate(x, ctx), ctx))))
    case 'spill': {
      const v = evaluate(n.a, ctx)
      if (v instanceof CellError) return v
      if (!(v instanceof RefV) || !v.isCell) return ERR.ref
      return ctx.host.spillRange(v.area.sheet, v.area.r1, v.area.c1)
    }
    case 'at': return toScalar(evaluate(n.a, ctx), ctx)
    case 'struct': return ctx.host.structRef(n.table, n.spec, ctx)
  }
}

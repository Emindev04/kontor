import type { Scalar } from '../../model/types'
import { callLambda, evaluate, lookupVar } from '../evaluator'
import type { Node } from '../parser'
import { fn, lazyFn, VARARGS } from '../registry'
import { scalarOrMatrix, toBool, type Ctx, type Value } from '../values'
import { CellError, ERR, LambdaV, Matrix, Omitted, RefV, argNum, eachCell, isErr, sfn, toMatrix, toScalar } from './helpers'

function arg(nodes: Node[], i: number, ctx: Ctx, missing: Value): Value {
  if (i >= nodes.length) return missing
  if (nodes[i].k === 'empty') return 0
  return evaluate(nodes[i], ctx)
}

function pickBranch(cond: Scalar | Matrix, t: () => Value, f: () => Value, ctx: Ctx): Value {
  if (cond instanceof Matrix) {
    return pickMatrix(cond, scalarOrMatrix(t(), ctx), scalarOrMatrix(f(), ctx))
  }
  if (cond instanceof CellError) return cond
  const b = toBool(cond)
  if (b instanceof CellError) return b
  return b ? t() : f()
}

function pickMatrix(cond: Matrix, tv: Scalar | Matrix, fv: Scalar | Matrix): Matrix {
  const rows = Math.max(cond.rows, tv instanceof Matrix ? tv.rows : 1, fv instanceof Matrix ? fv.rows : 1)
  const cols = Math.max(cond.cols, tv instanceof Matrix ? tv.cols : 1, fv instanceof Matrix ? fv.cols : 1)
  const at = (m: Scalar | Matrix, r: number, c: number): Scalar => {
    if (!(m instanceof Matrix)) return m
    const rr = m.rows === 1 ? 0 : r
    const cc = m.cols === 1 ? 0 : c
    return rr < m.rows && cc < m.cols ? m.get(rr, cc) : ERR.na
  }
  return Matrix.fill(rows, cols, (r, c) => {
    const x = at(cond, r, c)
    if (x instanceof CellError) return x
    const b = toBool(x)
    if (b instanceof CellError) return b
    return b ? at(tv, r, c) : at(fv, r, c)
  })
}

lazyFn('IF', 1, 3, (nodes, ctx) => {
  const cond = scalarOrMatrix(evaluate(nodes[0], ctx), ctx)
  return pickBranch(
    cond,
    () => arg(nodes, 1, ctx, 0),
    () => arg(nodes, 2, ctx, false),
    ctx,
  )
})

lazyFn('IFS', 2, VARARGS, (nodes, ctx) => {
  if (nodes.length % 2) return ERR.value
  for (let i = 0; i < nodes.length; i += 2) {
    const c = toScalar(evaluate(nodes[i], ctx), ctx)
    if (c instanceof CellError) return c
    const b = toBool(c)
    if (b instanceof CellError) return b
    if (b) return arg(nodes, i + 1, ctx, 0)
  }
  return ERR.na
})

function errorCatcher(name: string, onlyNA: boolean) {
  lazyFn(name, 2, 2, (nodes, ctx) => {
    const v = evaluate(nodes[0], ctx)
    const hit = (x: Scalar) => x instanceof CellError && (!onlyNA || x.code === '#N/A')
    const sv = scalarOrMatrix(v, ctx)
    if (sv instanceof Matrix) {
      if (!sv.data.some(hit)) return sv
      const alt = scalarOrMatrix(arg(nodes, 1, ctx, 0), ctx)
      return sv.map((x, r, c) => (hit(x) ? (alt instanceof Matrix ? alt.get(Math.min(r, alt.rows - 1), Math.min(c, alt.cols - 1)) : alt) : x))
    }
    if (hit(sv)) return arg(nodes, 1, ctx, 0)
    return v instanceof RefV && v.isCell ? sv : v
  })
}
errorCatcher('IFERROR', false)
errorCatcher('IFNA', true)

lazyFn('SWITCH', 3, VARARGS, (nodes, ctx) => {
  const v = toScalar(evaluate(nodes[0], ctx), ctx)
  if (v instanceof CellError) return v
  const rest = nodes.length - 1
  const pairs = Math.floor(rest / 2)
  for (let i = 0; i < pairs; i++) {
    const cand = toScalar(evaluate(nodes[1 + i * 2], ctx), ctx)
    if (cand instanceof CellError) return cand
    const same = typeof cand === typeof v ? (typeof v === 'string' ? (v as string).toUpperCase() === (cand as string).toUpperCase() : cand === v) : false
    if (same) return arg(nodes, 2 + i * 2, ctx, 0)
  }
  return rest % 2 ? arg(nodes, nodes.length - 1, ctx, 0) : ERR.na
})

function logicalValues(args: Value[], ctx: Ctx): boolean[] | CellError {
  const out: boolean[] = []
  for (const a of args) {
    if (a instanceof Omitted) continue
    if (a instanceof RefV) {
      let err: CellError | null = null
      eachCell(a, ctx, (v) => {
        if (typeof v === 'boolean') out.push(v)
        else if (typeof v === 'number') out.push(v !== 0)
        else if (v instanceof CellError) {
          err = v
          return false
        }
      })
      if (err) return err
      continue
    }
    if (a instanceof Matrix) {
      for (const v of a.data) {
        if (typeof v === 'boolean') out.push(v)
        else if (typeof v === 'number') out.push(v !== 0)
        else if (v instanceof CellError) return v
      }
      continue
    }
    if (a instanceof LambdaV) return ERR.calc
    const b = toBool(a as Scalar)
    if (b instanceof CellError) return b
    out.push(b)
  }
  return out
}

fn('AND', 1, VARARGS, (args, ctx) => {
  const vs = logicalValues(args, ctx)
  if (isErr(vs)) return vs
  return vs.length ? vs.every(Boolean) : ERR.value
})
fn('OR', 1, VARARGS, (args, ctx) => {
  const vs = logicalValues(args, ctx)
  if (isErr(vs)) return vs
  return vs.length ? vs.some(Boolean) : ERR.value
})
fn('XOR', 1, VARARGS, (args, ctx) => {
  const vs = logicalValues(args, ctx)
  if (isErr(vs)) return vs
  return vs.length ? vs.filter(Boolean).length % 2 === 1 : ERR.value
})
sfn('NOT', 1, 1, ([a]) => {
  const b = toBool(a)
  return b instanceof CellError ? b : !b
})
fn('TRUE', 0, 0, () => true)
fn('FALSE', 0, 0, () => false)

// ---------- LET / LAMBDA and helpers ----------

lazyFn('LET', 3, VARARGS, (nodes, ctx) => {
  if (nodes.length % 2 === 0) return ERR.value
  const vars = new Map<string, Value>()
  const scope = { vars, parent: ctx.scope }
  const inner = { ...ctx, scope }
  for (let i = 0; i < nodes.length - 1; i += 2) {
    const n = nodes[i]
    if (n.k !== 'name') return ERR.value
    vars.set(n.name, evaluate(nodes[i + 1], inner))
  }
  return evaluate(nodes[nodes.length - 1], inner)
})

lazyFn('LAMBDA', 1, VARARGS, (nodes, ctx) => {
  const params: string[] = []
  for (const n of nodes.slice(0, -1)) {
    if (n.k !== 'name') return ERR.value
    params.push(n.name)
  }
  return new LambdaV(params, nodes[nodes.length - 1], ctx.scope)
})

lazyFn('ISOMITTED', 1, 1, (nodes, ctx) => {
  const n = nodes[0]
  if (n.k !== 'name') return false
  return lookupVar(n.name, ctx.scope) instanceof Omitted
})

function lambdaArg(v: Value): LambdaV | CellError {
  return v instanceof LambdaV ? v : v instanceof CellError ? v : ERR.value
}

function scalarResult(v: Value, ctx: Ctx): Scalar {
  const s = scalarOrMatrix(v, ctx)
  if (s instanceof Matrix) return s.rows === 1 && s.cols === 1 ? s.get(0, 0) : ERR.calc
  return s
}

fn('MAP', 2, VARARGS, (args, ctx) => {
  const f = lambdaArg(args[args.length - 1])
  if (isErr(f)) return f
  const arrays: Matrix[] = []
  for (const a of args.slice(0, -1)) {
    const m = toMatrix(a, ctx)
    if (isErr(m)) return m
    arrays.push(m)
  }
  const rows = Math.max(...arrays.map((m) => m.rows))
  const cols = Math.max(...arrays.map((m) => m.cols))
  return Matrix.fill(rows, cols, (r, c) => scalarResult(callLambda(f, arrays.map((m) => (r < m.rows && c < m.cols ? m.get(r, c) : ERR.na)), ctx), ctx))
})

function reduceLike(name: string, scan: boolean) {
  fn(name, 2, 3, (args, ctx) => {
    const f = lambdaArg(args[args.length - 1])
    if (isErr(f)) return f
    const init: Value = args.length === 3 ? args[0] : Omitted.it
    const m = toMatrix(args[args.length - 2], ctx)
    if (isErr(m)) return m
    let acc: Value = init instanceof Omitted ? 0 : scalarOrMatrix(init, ctx)
    const out: Scalar[] = []
    for (const v of m.data) {
      acc = callLambda(f, [acc, v], ctx)
      if (scan) out.push(scalarResult(acc, ctx))
    }
    return scan ? new Matrix(m.rows, m.cols, out) : acc
  })
}
reduceLike('REDUCE', false)
reduceLike('SCAN', true)

fn('BYROW', 2, 2, (args, ctx) => {
  const m = toMatrix(args[0], ctx)
  const f = lambdaArg(args[1])
  if (isErr(m)) return m
  if (isErr(f)) return f
  return Matrix.fill(m.rows, 1, (r) => scalarResult(callLambda(f, [Matrix.from([m.row(r)])], ctx), ctx))
})
fn('BYCOL', 2, 2, (args, ctx) => {
  const m = toMatrix(args[0], ctx)
  const f = lambdaArg(args[1])
  if (isErr(m)) return m
  if (isErr(f)) return f
  return Matrix.fill(1, m.cols, (_r, c) => scalarResult(callLambda(f, [Matrix.fill(m.rows, 1, (r) => m.get(r, c))], ctx), ctx))
})
fn('MAKEARRAY', 3, 3, (args, ctx) => {
  const rows = argNum(args, 0, ctx)
  const cols = argNum(args, 1, ctx)
  const f = lambdaArg(args[2])
  if (isErr(rows)) return rows
  if (isErr(cols)) return cols
  if (isErr(f)) return f
  if (rows < 1 || cols < 1) return ERR.value
  return Matrix.fill(Math.trunc(rows), Math.trunc(cols), (r, c) => scalarResult(callLambda(f, [r + 1, c + 1], ctx), ctx))
})

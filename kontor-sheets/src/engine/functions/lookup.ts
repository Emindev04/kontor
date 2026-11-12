import { MAX_COLS, MAX_ROWS, colName, quoteSheet } from '../../model/address'
import type { Scalar } from '../../model/types'
import { evaluate } from '../evaluator'
import { fn, lazyFn, VARARGS } from '../registry'
import { matchRef } from '../tokenizer'
import { refArea } from '../parser'
import { clampArea, compareValues, equalValues, scalarOrMatrix, toBool, type Ctx, type Value } from '../values'
import {
  CellError, ERR, Matrix, Omitted, RefV, argBool, argMatrix, argNum, hasWildcard, isErr, isOmitted, toMatrix, toNumber, toScalar, toText, wildcard,
} from './helpers'

/** 1-D view of a lookup range or array. */
type Vec = { len: number; get: (i: number) => Scalar; vertical: boolean }

function vector(v: Value, ctx: Ctx): Vec | CellError {
  if (v instanceof CellError) return v
  if (v instanceof RefV) {
    if (v.areas.length !== 1) return ERR.na
    const a = v.area
    const vertical = a.c1 === a.c2
    if (!vertical && a.r1 !== a.r2) return ERR.na
    const b = clampArea(a)
    const len = vertical ? b.r2 - a.r1 + 1 : b.c2 - a.c1 + 1
    return { len, vertical, get: (i) => (vertical ? ctx.host.value(a.sheet, a.r1 + i, a.c1) : ctx.host.value(a.sheet, a.r1, a.c1 + i)) }
  }
  const m = toMatrix(v, ctx)
  if (isErr(m)) return m
  if (m.rows > 1 && m.cols > 1) return ERR.na
  const vertical = m.cols === 1
  return { len: vertical ? m.rows : m.cols, vertical, get: (i) => (vertical ? m.get(i, 0) : m.get(0, i)) }
}

function exactIndex(vec: Vec, x: Scalar, fromEnd = false, wild = true): number {
  const re = wild && typeof x === 'string' && hasWildcard(x) ? wildcard(x) : null
  const test = (v: Scalar) => (re ? typeof v === 'string' && re.test(v) : v !== null && equalValues(v, x))
  if (fromEnd) {
    for (let i = vec.len - 1; i >= 0; i--) if (test(vec.get(i))) return i
  } else for (let i = 0; i < vec.len; i++) if (test(vec.get(i))) return i
  return -1
}

/** Binary search: last index whose value is <= x (ascending data). */
function approxIndex(vec: Vec, x: Scalar): number {
  let lo = 0
  let hi = vec.len - 1
  let res = -1
  while (lo <= hi) {
    let mid = (lo + hi) >> 1
    let v = vec.get(mid)
    let m = mid
    while (v === null && m > lo) v = vec.get(--m)
    if (v === null) {
      lo = mid + 1
      continue
    }
    const sameKind = typeof v === typeof x || (typeof x === 'number' && typeof v === 'number')
    const c = compareValues(v, x)
    if (c <= 0) {
      if (sameKind) res = m
      lo = mid + 1
    } else hi = m - 1
    mid = m
  }
  return res
}

function descIndex(vec: Vec, x: Scalar): number {
  let res = -1
  for (let i = 0; i < vec.len; i++) {
    const v = vec.get(i)
    if (v === null) continue
    if (compareValues(v, x) >= 0) res = i
    else break
  }
  return res
}

function liftLookup(v: Value, ctx: Ctx, f: (x: Scalar) => Value): Value {
  const s = scalarOrMatrix(v, ctx)
  if (s instanceof Matrix) return s.map((x) => toScalar(f(x), ctx))
  return f(s)
}

fn('MATCH', 2, 3, (args, ctx) => {
  const vec = vector(args[1], ctx)
  if (isErr(vec)) return vec
  const type = argNum(args, 2, ctx, 1)
  if (isErr(type)) return type
  return liftLookup(args[0], ctx, (x) => {
    if (x instanceof CellError) return x
    const i = type === 0 ? exactIndex(vec, x) : type > 0 ? approxIndex(vec, x) : descIndex(vec, x)
    return i < 0 ? ERR.na : i + 1
  })
})

function tableLookup(args: Value[], ctx: Ctx, horizontal: boolean): Value {
  const table = args[1]
  const idx = argNum(args, 2, ctx)
  if (isErr(idx)) return idx
  const approx = argBool(args, 3, ctx, true)
  if (isErr(approx)) return approx
  const n = Math.trunc(idx)
  let rows: number
  let cols: number
  let get: (r: number, c: number) => Scalar
  if (table instanceof RefV) {
    const a = table.area
    const b = clampArea(a)
    rows = horizontal ? a.r2 - a.r1 + 1 : b.r2 - a.r1 + 1
    cols = horizontal ? b.c2 - a.c1 + 1 : a.c2 - a.c1 + 1
    get = (r, c) => ctx.host.value(a.sheet, a.r1 + r, a.c1 + c)
  } else {
    const m = toMatrix(table, ctx)
    if (isErr(m)) return m
    rows = m.rows
    cols = m.cols
    get = (r, c) => m.get(r, c)
  }
  if (n < 1) return ERR.value
  if (horizontal ? n > rows : n > cols) return ERR.ref
  const vec: Vec = horizontal ? { len: cols, vertical: false, get: (i) => get(0, i) } : { len: rows, vertical: true, get: (i) => get(i, 0) }
  return liftLookup(args[0], ctx, (x) => {
    if (x instanceof CellError) return x
    const i = approx ? approxIndex(vec, x) : exactIndex(vec, x)
    if (i < 0) return ERR.na
    const v = horizontal ? get(n - 1, i) : get(i, n - 1)
    return v === null ? 0 : v
  })
}

fn('VLOOKUP', 3, 4, (args, ctx) => tableLookup(args, ctx, false))
fn('HLOOKUP', 3, 4, (args, ctx) => tableLookup(args, ctx, true))

fn('LOOKUP', 2, 3, (args, ctx) => {
  let lookupVec: Vec | CellError
  let resultVec: Vec | CellError
  if (args.length === 3) {
    lookupVec = vector(args[1], ctx)
    resultVec = vector(args[2], ctx)
  } else {
    const m = toMatrix(args[1], ctx)
    if (isErr(m)) return m
    if (m.cols > m.rows) {
      lookupVec = { len: m.cols, vertical: false, get: (i) => m.get(0, i) }
      resultVec = { len: m.cols, vertical: false, get: (i) => m.get(m.rows - 1, i) }
    } else {
      lookupVec = { len: m.rows, vertical: true, get: (i) => m.get(i, 0) }
      resultVec = { len: m.rows, vertical: true, get: (i) => m.get(i, m.cols - 1) }
    }
  }
  if (isErr(lookupVec)) return lookupVec
  if (isErr(resultVec)) return resultVec
  const lv = lookupVec
  const rv = resultVec
  return liftLookup(args[0], ctx, (x) => {
    const i = approxIndex(lv, x)
    return i < 0 ? ERR.na : (rv.get(i) ?? 0)
  })
})

function xIndex(vec: Vec, x: Scalar, mode: number, search: number): number {
  if (mode === 2 || mode === 0) {
    if (search === 2 || search === -2) {
      const i = search === 2 ? approxIndex(vec, x) : descIndex(vec, x)
      return i >= 0 && equalValues(vec.get(i), x) ? i : -1
    }
    return exactIndex(vec, x, search === -1, mode === 2)
  }
  // exact or next smaller (-1) / next larger (1)
  let best = -1
  let bestVal: Scalar = null
  const order = search === -1 ? [...Array(vec.len).keys()].reverse() : [...Array(vec.len).keys()]
  for (const i of order) {
    const v = vec.get(i)
    if (v === null || typeof v !== typeof x) continue
    const c = compareValues(v, x)
    if (c === 0) return i
    if (mode === -1 && c < 0 && (best < 0 || compareValues(v, bestVal) > 0)) {
      best = i
      bestVal = v
    }
    if (mode === 1 && c > 0 && (best < 0 || compareValues(v, bestVal) < 0)) {
      best = i
      bestVal = v
    }
  }
  return best
}

fn('XLOOKUP', 3, 6, (args, ctx) => {
  const vec = vector(args[1], ctx)
  if (isErr(vec)) return vec
  const mode = argNum(args, 4, ctx, 0)
  const search = argNum(args, 5, ctx, 1)
  if (isErr(mode)) return mode
  if (isErr(search)) return search
  const ret = args[2]
  const notFound = isOmitted(args, 3) ? null : args[3]
  const one = (x: Scalar): Value => {
    if (x instanceof CellError) return x
    const i = xIndex(vec, x, mode, search)
    if (i < 0) return notFound === null ? ERR.na : notFound
    if (ret instanceof RefV) {
      const a = ret.area
      if (vec.vertical) {
        if (i > a.r2 - a.r1) return ERR.value
        return ctx.host.makeRef(a.sheet, a.r1 + i, a.c1, a.r1 + i, a.c2)
      }
      if (i > a.c2 - a.c1) return ERR.value
      return ctx.host.makeRef(a.sheet, a.r1, a.c1 + i, a.r2, a.c1 + i)
    }
    const m = toMatrix(ret, ctx)
    if (isErr(m)) return m
    if (vec.vertical) return m.rows === 1 && m.cols === 1 ? m.get(0, 0) : i < m.rows ? (m.cols === 1 ? m.get(i, 0) : Matrix.from([m.row(i)])) : ERR.value
    return i < m.cols ? (m.rows === 1 ? m.get(0, i) : Matrix.fill(m.rows, 1, (r) => m.get(r, i))) : ERR.value
  }
  const look = scalarOrMatrix(args[0], ctx)
  if (look instanceof Matrix) return look.map((x) => toScalar(one(x), ctx))
  return one(look)
})

fn('XMATCH', 2, 4, (args, ctx) => {
  const vec = vector(args[1], ctx)
  if (isErr(vec)) return vec
  const mode = argNum(args, 2, ctx, 0)
  const search = argNum(args, 3, ctx, 1)
  if (isErr(mode)) return mode
  if (isErr(search)) return search
  return liftLookup(args[0], ctx, (x) => {
    if (x instanceof CellError) return x
    const i = xIndex(vec, x, mode, search)
    return i < 0 ? ERR.na : i + 1
  })
})

fn('INDEX', 2, 4, (args, ctx) => {
  const arr = args[0]
  const rowV = isOmitted(args, 1) ? 0 : scalarOrMatrix(args[1], ctx)
  const colV = isOmitted(args, 2) ? null : scalarOrMatrix(args[2], ctx)
  const areaN = argNum(args, 3, ctx, 1)
  if (isErr(areaN)) return areaN
  const one = (rv: Scalar, cv: Scalar | null): Value => {
    const rn = toNumber(rv)
    if (isErr(rn)) return rn
    const cn = cv === null ? null : toNumber(cv)
    if (isErr(cn)) return cn
    if (arr instanceof RefV) {
      const a = arr.areas[Math.trunc(areaN) - 1]
      if (!a) return ERR.ref
      const rows = a.r2 - a.r1 + 1
      const cols = a.c2 - a.c1 + 1
      let r = Math.trunc(rn)
      let c: number
      if (cn === null) {
        if (rows === 1 && cols > 1) {
          c = r
          r = 1
        } else c = cols === 1 ? 1 : 0
      } else c = Math.trunc(cn)
      if (r < 0 || c < 0 || r > rows || c > cols) return ERR.ref
      const r1 = r === 0 ? a.r1 : a.r1 + r - 1
      const r2 = r === 0 ? a.r2 : r1
      const c1 = c === 0 ? a.c1 : a.c1 + c - 1
      const c2 = c === 0 ? a.c2 : c1
      return ctx.host.makeRef(a.sheet, r1, c1, r2, c2)
    }
    const m = toMatrix(arr, ctx)
    if (isErr(m)) return m
    let r = Math.trunc(rn)
    let c: number
    if (cn === null) {
      if (m.rows === 1 && m.cols > 1) {
        c = r
        r = 1
      } else c = m.cols === 1 ? 1 : 0
    } else c = Math.trunc(cn)
    if (r < 0 || c < 0 || r > m.rows || c > m.cols) return ERR.ref
    if (r === 0 && c === 0) return m
    if (r === 0) return Matrix.fill(m.rows, 1, (i) => m.get(i, c - 1))
    if (c === 0) return Matrix.from([m.row(r - 1)])
    return m.get(r - 1, c - 1)
  }
  if (rowV instanceof Matrix || colV instanceof Matrix) {
    const rm = rowV instanceof Matrix ? rowV : null
    const cm = colV instanceof Matrix ? colV : null
    const rows = Math.max(rm?.rows ?? 1, cm?.rows ?? 1)
    const cols = Math.max(rm?.cols ?? 1, cm?.cols ?? 1)
    return Matrix.fill(rows, cols, (i, j) => toScalar(one(rm ? rm.get(Math.min(i, rm.rows - 1), Math.min(j, rm.cols - 1)) : (rowV as Scalar), cm ? cm.get(Math.min(i, cm.rows - 1), Math.min(j, cm.cols - 1)) : (colV as Scalar | null)), ctx))
  }
  return one(rowV as Scalar, colV as Scalar | null)
})

fn('OFFSET', 3, 5, (args, ctx) => {
  const ref = args[0]
  if (!(ref instanceof RefV)) return ref instanceof CellError ? ref : ERR.value
  const a = ref.area
  const dr = argNum(args, 1, ctx)
  const dc = argNum(args, 2, ctx)
  const h = argNum(args, 3, ctx, a.r2 - a.r1 + 1)
  const w = argNum(args, 4, ctx, a.c2 - a.c1 + 1)
  for (const v of [dr, dc, h, w]) if (isErr(v)) return v
  const r1 = a.r1 + Math.trunc(dr as number)
  const c1 = a.c1 + Math.trunc(dc as number)
  const hh = Math.trunc(h as number)
  const ww = Math.trunc(w as number)
  if (hh === 0 || ww === 0) return ERR.ref
  const r2 = hh > 0 ? r1 + hh - 1 : r1
  const c2 = ww > 0 ? c1 + ww - 1 : c1
  const rr1 = hh > 0 ? r1 : r1 + hh + 1
  const cc1 = ww > 0 ? c1 : c1 + ww + 1
  if (rr1 < 0 || cc1 < 0 || r2 >= MAX_ROWS || c2 >= MAX_COLS) return ERR.ref
  return ctx.host.makeRef(a.sheet, rr1, cc1, r2, c2)
}, { volatile: true })

export function resolveRefText(text: string, a1: boolean, ctx: Ctx): RefV | CellError {
  const t = text.trim()
  if (!a1) {
    const m = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!)?R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?::R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?)?$/i.exec(t)
    if (!m) return ERR.ref
    const sheetName = m[1]?.replace(/''/g, "'") ?? m[2]
    const sheet = sheetName ? ctx.host.sheetNamed(sheetName) : ctx.sheet
    if (!sheet) return ERR.ref
    const part = (s: string | undefined, base: number) => (s === undefined ? base : s.startsWith('[') ? base + Number(s.slice(1, -1)) : Number(s) - 1)
    const r1 = part(m[3], ctx.r)
    const c1 = part(m[4], ctx.c)
    const r2 = m[5] !== undefined || m[6] !== undefined ? part(m[5], ctx.r) : r1
    const c2 = m[5] !== undefined || m[6] !== undefined ? part(m[6], ctx.c) : c1
    if ([r1, r2].some((r) => r < 0 || r >= MAX_ROWS) || [c1, c2].some((c) => c < 0 || c >= MAX_COLS)) return ERR.ref
    return ctx.host.makeRef(sheet, Math.min(r1, r2), Math.min(c1, c2), Math.max(r1, r2), Math.max(c1, c2))
  }
  const r = matchRef(t, 0)
  if (r && r.end === t.length) {
    const sheet = r.parts.sheet !== undefined ? ctx.host.sheetNamed(r.parts.sheet) : ctx.sheet
    if (!sheet) return ERR.ref
    const area = refArea(r.parts)
    return ctx.host.makeRef(sheet, area.r1, area.c1, area.r2, area.c2)
  }
  const named = ctx.host.definedName(t.toUpperCase(), ctx)
  if (named instanceof RefV) return named
  return ERR.ref
}

fn('INDIRECT', 1, 2, (args, ctx) => {
  const text = toText(toScalar(args[0], ctx))
  if (isErr(text)) return text
  const a1 = argBool(args, 1, ctx, true)
  if (isErr(a1)) return a1
  return resolveRefText(text, a1, ctx)
}, { volatile: true })

lazyFn('CHOOSE', 2, VARARGS, (nodes, ctx) => {
  const idx = scalarOrMatrix(evaluate(nodes[0], ctx), ctx)
  const pickOne = (x: Scalar): Value => {
    const n = toNumber(x)
    if (isErr(n)) return n
    const i = Math.trunc(n)
    if (i < 1 || i >= nodes.length) return ERR.value
    const node = nodes[i]
    return node.k === 'empty' ? 0 : evaluate(node, ctx)
  }
  if (idx instanceof Matrix) return idx.map((x) => toScalar(pickOne(x), ctx))
  return pickOne(idx)
})

fn('ROW', 0, 1, (args, ctx) => {
  if (isOmitted(args, 0)) return ctx.r + 1
  const v = args[0]
  if (!(v instanceof RefV)) return ERR.value
  const a = v.area
  if (a.r1 === a.r2) return a.r1 + 1
  return Matrix.fill(a.r2 - a.r1 + 1, 1, (r) => a.r1 + r + 1)
})
fn('COLUMN', 0, 1, (args, ctx) => {
  if (isOmitted(args, 0)) return ctx.c + 1
  const v = args[0]
  if (!(v instanceof RefV)) return ERR.value
  const a = v.area
  if (a.c1 === a.c2) return a.c1 + 1
  return Matrix.fill(1, a.c2 - a.c1 + 1, (_r, c) => a.c1 + c + 1)
})
fn('ROWS', 1, 1, (args, ctx) => {
  const v = args[0]
  if (isErr(v)) return v
  if (v instanceof RefV) return v.rows
  const m = toMatrix(v, ctx)
  return isErr(m) ? m : m.rows
})
fn('COLUMNS', 1, 1, (args, ctx) => {
  const v = args[0]
  if (isErr(v)) return v
  if (v instanceof RefV) return v.cols
  const m = toMatrix(v, ctx)
  return isErr(m) ? m : m.cols
})
fn('AREAS', 1, 1, (args) => (args[0] instanceof RefV ? args[0].areas.length : ERR.value))

fn('ADDRESS', 2, 5, (args, ctx) => {
  const r = argNum(args, 0, ctx)
  const c = argNum(args, 1, ctx)
  const abs = argNum(args, 2, ctx, 1)
  const a1 = argBool(args, 3, ctx, true)
  if (isErr(r)) return r
  if (isErr(c)) return c
  if (isErr(abs)) return abs
  if (isErr(a1)) return a1
  const sheet = isOmitted(args, 4) ? '' : toText(toScalar(args[4], ctx))
  if (isErr(sheet)) return sheet
  const row = Math.trunc(r)
  const col = Math.trunc(c)
  if (row < 1 || col < 1 || row > MAX_ROWS || col > MAX_COLS) return ERR.value
  const absR = abs === 1 || abs === 2
  const absC = abs === 1 || abs === 3
  const prefix = sheet ? quoteSheet(sheet) + '!' : ''
  if (!a1) return `${prefix}R${absR ? row : `[${row}]`}C${absC ? col : `[${col}]`}`
  return `${prefix}${absC ? '$' : ''}${colName(col - 1)}${absR ? '$' : ''}${row}`
})

fn('TRANSPOSE', 1, 1, (args, ctx) => {
  const m = argMatrix(args, 0, ctx)
  return isErr(m) ? m : m.transpose()
})

fn('FORMULATEXT', 1, 1, (args, ctx) => {
  const v = args[0]
  if (!(v instanceof RefV)) return ERR.value
  return ctx.host.formulaAt(v.area.sheet, v.area.r1, v.area.c1) ?? ERR.na
})

fn('HYPERLINK', 1, 2, (args, ctx) => {
  const link = toScalar(args[0], ctx)
  return isOmitted(args, 1) ? link : toScalar(args[1], ctx)
})

// ---------- dynamic arrays ----------

function truthy(v: Scalar): boolean | CellError {
  if (v instanceof CellError) return v
  if (typeof v === 'string') {
    const b = toBool(v)
    return b instanceof CellError ? b : b
  }
  return v === true || (typeof v === 'number' && v !== 0)
}

fn('FILTER', 2, 3, (args, ctx) => {
  const m = argMatrix(args, 0, ctx)
  const inc = argMatrix(args, 1, ctx)
  if (isErr(m)) return m
  if (isErr(inc)) return inc
  const empty = () => (isOmitted(args, 2) ? ERR.calc : scalarOrMatrix(args[2], ctx))
  if (inc.cols === 1 && inc.rows === m.rows) {
    const rows: Scalar[][] = []
    for (let r = 0; r < m.rows; r++) {
      const t = truthy(inc.get(r, 0))
      if (isErr(t)) return t
      if (t) rows.push(m.row(r))
    }
    return rows.length ? Matrix.from(rows) : empty()
  }
  if (inc.rows === 1 && inc.cols === m.cols) {
    const cols: number[] = []
    for (let c = 0; c < m.cols; c++) {
      const t = truthy(inc.get(0, c))
      if (isErr(t)) return t
      if (t) cols.push(c)
    }
    return cols.length ? Matrix.fill(m.rows, cols.length, (r, c) => m.get(r, cols[c])) : empty()
  }
  return ERR.value
})

function sortCompare(a: Scalar, b: Scalar): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (a instanceof CellError || b instanceof CellError) return a instanceof CellError ? (b instanceof CellError ? 0 : 1) : -1
  return compareValues(a, b)
}

fn('SORT', 1, 4, (args, ctx) => {
  const m = argMatrix(args, 0, ctx)
  if (isErr(m)) return m
  const byCol = argBool(args, 3, ctx, false)
  if (isErr(byCol)) return byCol
  const idxM = isOmitted(args, 1) ? new Matrix(1, 1, [1]) : toMatrix(args[1], ctx)
  const ordM = isOmitted(args, 2) ? new Matrix(1, 1, [1]) : toMatrix(args[2], ctx)
  if (isErr(idxM)) return idxM
  if (isErr(ordM)) return ordM
  const keys = idxM.data.map((v) => Math.trunc(Number(v)))
  const orders = keys.map((_, i) => Number(ordM.data[Math.min(i, ordM.data.length - 1)]))
  const src = byCol ? m.transpose() : m
  if (keys.some((k) => k < 1 || k > src.cols) || orders.some((o) => o !== 1 && o !== -1)) return ERR.value
  const rows = src.toRows()
  rows.sort((x, y) => {
    for (let i = 0; i < keys.length; i++) {
      const c = sortCompare(x[keys[i] - 1], y[keys[i] - 1])
      if (c) return orders[i] === -1 && x[keys[i] - 1] !== null && y[keys[i] - 1] !== null ? -c : c
    }
    return 0
  })
  const out = Matrix.from(rows)
  return byCol ? out.transpose() : out
})

fn('SORTBY', 2, VARARGS, (args, ctx) => {
  const m = argMatrix(args, 0, ctx)
  if (isErr(m)) return m
  const by: { m: Matrix; order: number }[] = []
  for (let i = 1; i < args.length; i += 2) {
    const b = toMatrix(args[i], ctx)
    if (isErr(b)) return b
    const o = i + 1 < args.length ? toNumber(toScalar(args[i + 1], ctx)) : 1
    if (isErr(o)) return o
    by.push({ m: b, order: o })
  }
  const vertical = by[0].m.cols === 1
  const n = vertical ? m.rows : m.cols
  if (by.some((b) => (vertical ? b.m.rows !== n : b.m.cols !== n))) return ERR.value
  const idx = [...Array(n).keys()]
  idx.sort((x, y) => {
    for (const b of by) {
      const va = vertical ? b.m.get(x, 0) : b.m.get(0, x)
      const vb = vertical ? b.m.get(y, 0) : b.m.get(0, y)
      const c = sortCompare(va, vb)
      if (c) return b.order === -1 ? -c : c
    }
    return x - y
  })
  return vertical ? Matrix.fill(m.rows, m.cols, (r, c) => m.get(idx[r], c)) : Matrix.fill(m.rows, m.cols, (r, c) => m.get(r, idx[c]))
})

fn('UNIQUE', 1, 3, (args, ctx) => {
  const m = argMatrix(args, 0, ctx)
  if (isErr(m)) return m
  const byCol = argBool(args, 1, ctx, false)
  const once = argBool(args, 2, ctx, false)
  if (isErr(byCol)) return byCol
  if (isErr(once)) return once
  const src = byCol ? m.transpose() : m
  const groups = new Map<string, { row: Scalar[]; n: number }>()
  for (const row of src.toRows()) {
    const key = JSON.stringify(row.map((v) => (typeof v === 'string' ? 's' + v.toUpperCase() : v instanceof CellError ? 'e' + v.code : v)))
    const g = groups.get(key)
    if (g) g.n++
    else groups.set(key, { row, n: 1 })
  }
  const rows = [...groups.values()].filter((g) => !once || g.n === 1).map((g) => g.row)
  if (!rows.length) return ERR.calc
  const out = Matrix.from(rows)
  return byCol ? out.transpose() : out
})

fn('SEQUENCE', 1, 4, (args, ctx) => {
  const rows = argNum(args, 0, ctx, 1)
  const cols = argNum(args, 1, ctx, 1)
  const start = argNum(args, 2, ctx, 1)
  const step = argNum(args, 3, ctx, 1)
  for (const v of [rows, cols, start, step]) if (isErr(v)) return v
  const r = Math.trunc(rows as number)
  const c = Math.trunc(cols as number)
  if (r < 1 || c < 1) return ERR.calc
  return Matrix.fill(r, c, (i, j) => (start as number) + (i * c + j) * (step as number))
})

function takeDrop(name: string, take: boolean) {
  fn(name, 2, 3, (args, ctx) => {
    const m = argMatrix(args, 0, ctx)
    if (isErr(m)) return m
    const rn = isOmitted(args, 1) ? (take ? m.rows : 0) : toNumber(toScalar(args[1], ctx))
    const cn = isOmitted(args, 2) ? (take ? m.cols : 0) : toNumber(toScalar(args[2], ctx))
    if (isErr(rn)) return rn
    if (isErr(cn)) return cn
    const sel = (n: number, len: number): [number, number] => {
      const k = Math.trunc(n)
      if (take) return k >= 0 ? [0, Math.min(k, len)] : [Math.max(0, len + k), len]
      return k >= 0 ? [Math.min(k, len), len] : [0, Math.max(0, len + k)]
    }
    const [r0, r1] = sel(rn, m.rows)
    const [c0, c1] = sel(cn, m.cols)
    if (r1 <= r0 || c1 <= c0) return ERR.calc
    return Matrix.fill(r1 - r0, c1 - c0, (r, c) => m.get(r0 + r, c0 + c))
  })
}
takeDrop('TAKE', true)
takeDrop('DROP', false)

function chooseLines(name: string, rows: boolean) {
  fn(name, 2, VARARGS, (args, ctx) => {
    const m = argMatrix(args, 0, ctx)
    if (isErr(m)) return m
    const picks: number[] = []
    for (const a of args.slice(1)) {
      const idx = toMatrix(a, ctx)
      if (isErr(idx)) return idx
      for (const v of idx.data) {
        const n = toNumber(v)
        if (isErr(n)) return n
        const len = rows ? m.rows : m.cols
        const k = Math.trunc(n)
        const i = k > 0 ? k - 1 : len + k
        if (k === 0 || i < 0 || i >= len) return ERR.value
        picks.push(i)
      }
    }
    return rows ? Matrix.fill(picks.length, m.cols, (r, c) => m.get(picks[r], c)) : Matrix.fill(m.rows, picks.length, (r, c) => m.get(r, picks[c]))
  })
}
chooseLines('CHOOSEROWS', true)
chooseLines('CHOOSECOLS', false)

function stack(name: string, vertical: boolean) {
  fn(name, 1, VARARGS, (args, ctx) => {
    const ms: Matrix[] = []
    for (const a of args) {
      if (a instanceof Omitted) continue
      const m = toMatrix(a, ctx)
      if (isErr(m)) return m
      ms.push(m)
    }
    if (vertical) {
      const cols = Math.max(...ms.map((m) => m.cols))
      const rows: Scalar[][] = []
      for (const m of ms) for (let r = 0; r < m.rows; r++) rows.push(Array.from({ length: cols }, (_, c) => (c < m.cols ? m.get(r, c) : ERR.na)))
      return Matrix.from(rows)
    }
    const rowsN = Math.max(...ms.map((m) => m.rows))
    const rows: Scalar[][] = Array.from({ length: rowsN }, () => [])
    for (const m of ms) for (let r = 0; r < rowsN; r++) for (let c = 0; c < m.cols; c++) rows[r].push(r < m.rows ? m.get(r, c) : ERR.na)
    return Matrix.from(rows)
  })
}
stack('VSTACK', true)
stack('HSTACK', false)

function toLine(name: string, col: boolean) {
  fn(name, 1, 3, (args, ctx) => {
    const m = argMatrix(args, 0, ctx)
    if (isErr(m)) return m
    const ignore = argNum(args, 1, ctx, 0)
    const byCol = argBool(args, 2, ctx, false)
    if (isErr(ignore)) return ignore
    if (isErr(byCol)) return byCol
    const vals: Scalar[] = []
    const src = byCol ? m.transpose() : m
    for (const v of src.data) {
      if ((ignore === 1 || ignore === 3) && v === null) continue
      if ((ignore === 2 || ignore === 3) && v instanceof CellError) continue
      vals.push(v)
    }
    if (!vals.length) return ERR.calc
    return col ? Matrix.fill(vals.length, 1, (r) => vals[r]) : Matrix.fill(1, vals.length, (_r, c) => vals[c])
  })
}
toLine('TOCOL', true)
toLine('TOROW', false)

function wrap(name: string, rows: boolean) {
  fn(name, 2, 3, (args, ctx) => {
    const m = argMatrix(args, 0, ctx)
    if (isErr(m)) return m
    if (m.rows > 1 && m.cols > 1) return ERR.value
    const n = argNum(args, 1, ctx)
    if (isErr(n)) return n
    const k = Math.trunc(n)
    if (k < 1) return ERR.num
    const pad = isOmitted(args, 2) ? ERR.na : toScalar(args[2], ctx)
    const vals = m.data
    const lines = Math.ceil(vals.length / k)
    return rows ? Matrix.fill(lines, k, (r, c) => vals[r * k + c] ?? pad) : Matrix.fill(k, lines, (r, c) => vals[c * k + r] ?? pad)
  })
}
wrap('WRAPROWS', true)
wrap('WRAPCOLS', false)

fn('EXPAND', 2, 4, (args, ctx) => {
  const m = argMatrix(args, 0, ctx)
  if (isErr(m)) return m
  const r = isOmitted(args, 1) ? m.rows : toNumber(toScalar(args[1], ctx))
  const c = isOmitted(args, 2) ? m.cols : toNumber(toScalar(args[2], ctx))
  if (isErr(r)) return r
  if (isErr(c)) return c
  if (r < m.rows || c < m.cols) return ERR.value
  const pad = isOmitted(args, 3) ? ERR.na : toScalar(args[3], ctx)
  return Matrix.fill(Math.trunc(r), Math.trunc(c), (i, j) => (i < m.rows && j < m.cols ? m.get(i, j) : pad))
})

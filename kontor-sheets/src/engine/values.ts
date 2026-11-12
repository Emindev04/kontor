import { Matrix } from '../model/matrix'
import { cellKey, keyCol, keyRow } from '../model/address'
import { numberToText } from '../model/numfmt'
import { textToNumber } from '../model/parseInput'
import type { Sheet } from '../model/sheet'
import { CellError, ERR, type Scalar } from '../model/types'
import type { Node } from './parser'

export { Matrix }

export type RefArea = { sheet: Sheet; r1: number; c1: number; r2: number; c2: number }

export class RefV {
  constructor(readonly areas: RefArea[]) {}
  get area(): RefArea {
    return this.areas[0]
  }
  get isCell(): boolean {
    const a = this.areas[0]
    return this.areas.length === 1 && a.r1 === a.r2 && a.c1 === a.c2
  }
  get rows() {
    return this.area.r2 - this.area.r1 + 1
  }
  get cols() {
    return this.area.c2 - this.area.c1 + 1
  }
}

export type Scope = { vars: Map<string, Value>; parent: Scope | null }

export class LambdaV {
  constructor(
    readonly params: string[],
    readonly body: Node,
    readonly scope: Scope | null,
  ) {}
}

/** Marker for an omitted argument, e.g. the middle one in IF(A1,,2). */
export class Omitted {
  static readonly it = new Omitted()
}

export type Value = Scalar | Matrix | RefV | LambdaV | Omitted

/** What evaluation needs from the calculation engine. */
export interface EvalHost {
  value(sheet: Sheet, r: number, c: number): Scalar
  makeRef(sheet: Sheet, r1: number, c1: number, r2: number, c2: number): RefV
  sheetNamed(name: string): Sheet | undefined
  sheetList(): Sheet[]
  /** Value of a defined name, or undefined when there is no such name. */
  definedName(name: string, ctx: Ctx): Value | undefined
  /** Range covered by the spilled array anchored at a cell (the A1# operator). */
  spillRange(sheet: Sheet, r: number, c: number): RefV | CellError
  /** Formula text of a cell, or undefined. */
  formulaAt(sheet: Sheet, r: number, c: number): string | undefined
  /** Resolves a structured table reference ("Table1[Sales]", "[@Qty]"). */
  structRef(table: string, spec: string, ctx: Ctx): Value
}

export interface Ctx {
  host: EvalHost
  sheet: Sheet
  r: number
  c: number
  scope: Scope | null
}

export const isErr = (v: unknown): v is CellError => v instanceof CellError

// ---------- scalar coercion ----------

export function toNumber(v: Scalar): number | CellError {
  if (typeof v === 'number') return v
  if (v === null) return 0
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof CellError) return v
  const n = textToNumber(v)
  return n === null ? ERR.value : n
}

export function toText(v: Scalar): string | CellError {
  if (typeof v === 'string') return v
  if (v === null) return ''
  if (typeof v === 'number') return numberToText(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return v
}

export function toBool(v: Scalar): boolean | CellError {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null) return false
  if (v instanceof CellError) return v
  const u = v.toUpperCase()
  if (u === 'TRUE') return true
  if (u === 'FALSE') return false
  return ERR.value
}

// ---------- reference / array helpers ----------

/** Bounds of an area limited to the sheet's used range (for materializing whole columns). */
export function clampArea(a: RefArea): RefArea {
  const u = a.sheet.used()
  const r2 = Math.max(a.r1, Math.min(a.r2, Math.max(u.r, a.r1)))
  const c2 = Math.max(a.c1, Math.min(a.c2, Math.max(u.c, a.c1)))
  return { ...a, r2, c2 }
}

export function areaToMatrix(a: RefArea, ctx: Ctx): Matrix {
  const b = clampArea(a)
  const rows = b.r2 - b.r1 + 1
  const cols = b.c2 - b.c1 + 1
  return Matrix.fill(rows, cols, (r, c) => ctx.host.value(a.sheet, b.r1 + r, b.c1 + c))
}

export function toMatrix(v: Value, ctx: Ctx): Matrix | CellError {
  if (v instanceof Matrix) return v
  if (v instanceof RefV) {
    if (v.areas.length !== 1) return ERR.value
    return areaToMatrix(v.area, ctx)
  }
  if (v instanceof LambdaV) return ERR.calc
  if (v instanceof Omitted) return new Matrix(1, 1, [null])
  return new Matrix(1, 1, [v])
}

/** Single value from any argument; ranges use implicit intersection. */
export function toScalar(v: Value, ctx: Ctx): Scalar {
  if (v instanceof RefV) {
    if (v.areas.length !== 1) return ERR.value
    const a = v.area
    if (a.r1 === a.r2 && a.c1 === a.c2) return ctx.host.value(a.sheet, a.r1, a.c1)
    if (a.c1 === a.c2 && ctx.r >= a.r1 && ctx.r <= a.r2 && ctx.sheet === a.sheet) return ctx.host.value(a.sheet, ctx.r, a.c1)
    if (a.r1 === a.r2 && ctx.c >= a.c1 && ctx.c <= a.c2 && ctx.sheet === a.sheet) return ctx.host.value(a.sheet, a.r1, ctx.c)
    return ERR.value
  }
  if (v instanceof Matrix) return v.get(0, 0)
  if (v instanceof LambdaV) return ERR.calc
  if (v instanceof Omitted) return null
  return v
}

/** Calls `cb` for each cell of the areas; sparse areas iterate only stored cells (blanks skipped). */
export function eachCell(ref: RefV, ctx: Ctx, cb: (v: Scalar, r: number, c: number, area: RefArea) => void | false, includeBlanks = false) {
  for (const a of ref.areas) {
    const size = (a.r2 - a.r1 + 1) * (a.c2 - a.c1 + 1)
    const sheet = a.sheet
    const stored = sheet.cells.size + sheet.spillOwner.size
    if (!includeBlanks && size > 64 && size > stored * 4) {
      const keys: number[] = []
      for (const k of sheet.cells.keys()) keys.push(k)
      for (const k of sheet.spillOwner.keys()) keys.push(k)
      keys.sort((x, y) => x - y)
      for (const k of keys) {
        const r = keyRow(k)
        const c = keyCol(k)
        if (r < a.r1 || r > a.r2 || c < a.c1 || c > a.c2) continue
        const v = ctx.host.value(sheet, r, c)
        if (v === null) continue
        if (cb(v, r, c, a) === false) return
      }
      continue
    }
    const b = clampArea(a)
    for (let r = a.r1; r <= b.r2; r++)
      for (let c = a.c1; c <= b.c2; c++) {
        const v = ctx.host.value(sheet, r, c)
        if (v === null && !includeBlanks) continue
        if (cb(v, r, c, a) === false) return
      }
  }
}

/** All scalar values in an argument (row by row). Blank cells inside ranges are kept as null. */
export function flatten(v: Value, ctx: Ctx): Scalar[] | CellError {
  if (v instanceof RefV) {
    const out: Scalar[] = []
    for (const a of v.areas) {
      const m = areaToMatrix(a, ctx)
      out.push(...m.data)
    }
    return out
  }
  const m = toMatrix(v, ctx)
  return m instanceof CellError ? m : m.data
}

export type NumMode = 'plain' | 'a'

/**
 * Numbers of aggregate-function arguments. Typed arguments are coerced (TRUE → 1, "3" → 3);
 * values from ranges and arrays count only when numeric (mode "a" also counts text as 0 and booleans).
 */
export function collectNumbers(args: Value[], ctx: Ctx, mode: NumMode = 'plain'): number[] | CellError {
  const out: number[] = []
  for (const arg of args) {
    if (arg instanceof Omitted) {
      out.push(0)
      continue
    }
    if (arg instanceof RefV) {
      let err: CellError | null = null
      eachCell(arg, ctx, (v) => {
        if (typeof v === 'number') out.push(v)
        else if (v instanceof CellError) {
          err = v
          return false
        } else if (mode === 'a') {
          if (typeof v === 'boolean') out.push(v ? 1 : 0)
          else if (typeof v === 'string') out.push(0)
        }
      })
      if (err) return err
      continue
    }
    if (arg instanceof Matrix) {
      for (const v of arg.data) {
        if (typeof v === 'number') out.push(v)
        else if (v instanceof CellError) return v
        else if (mode === 'a' && typeof v === 'boolean') out.push(v ? 1 : 0)
        else if (mode === 'a' && typeof v === 'string') out.push(0)
      }
      continue
    }
    if (arg instanceof LambdaV) return ERR.calc
    const n = toNumber(arg)
    if (n instanceof CellError) return n
    out.push(n)
  }
  return out
}

/** Value in a matrix-like argument with broadcasting of single rows/columns. */
export function pick(m: Matrix, r: number, c: number): Scalar {
  const rr = m.rows === 1 ? 0 : r
  const cc = m.cols === 1 ? 0 : c
  if (rr >= m.rows || cc >= m.cols) return ERR.na
  return m.get(rr, cc)
}

/** Converts a function argument to either a scalar or a matrix (ranges become matrices). */
export function scalarOrMatrix(v: Value, ctx: Ctx): Scalar | Matrix {
  if (v instanceof RefV) {
    if (v.isCell) return ctx.host.value(v.area.sheet, v.area.r1, v.area.c1)
    const m = toMatrix(v, ctx)
    return m
  }
  if (v instanceof Matrix) return v.rows === 1 && v.cols === 1 ? v.get(0, 0) : v
  if (v instanceof LambdaV) return ERR.calc
  if (v instanceof Omitted) return null
  return v
}

/** Applies a scalar function element-wise when any argument is an array (dynamic-array lifting). */
export function lift(args: Value[], ctx: Ctx, f: (s: Scalar[]) => Scalar, liftMask?: boolean[]): Scalar | Matrix {
  const conv = args.map((a, i) => (liftMask && liftMask[i] === false ? toScalar(a, ctx) : scalarOrMatrix(a, ctx)))
  let rows = 1
  let cols = 1
  let any = false
  for (const v of conv)
    if (v instanceof Matrix) {
      any = true
      rows = Math.max(rows, v.rows)
      cols = Math.max(cols, v.cols)
    }
  if (!any) return f(conv as Scalar[])
  return Matrix.fill(rows, cols, (r, c) => f(conv.map((v) => (v instanceof Matrix ? pick(v, r, c) : v))))
}

export function cellOf(ref: RefV): { sheet: Sheet; key: number } {
  return { sheet: ref.area.sheet, key: cellKey(ref.area.r1, ref.area.c1) }
}

// ---------- comparison ----------

const collator = new Intl.Collator('en', { sensitivity: 'accent' })

export function compareText(a: string, b: string): number {
  return collator.compare(a, b)
}

function rank(v: Scalar): number {
  if (typeof v === 'number') return 0
  if (typeof v === 'string') return 1
  if (typeof v === 'boolean') return 2
  return 3
}

export function round15(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return x
  return Number(x.toPrecision(15))
}

/** Comparison with spreadsheet semantics: numbers < text < booleans, text case-insensitive. */
export function compareValues(a: Scalar, b: Scalar): number {
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  if (typeof a === 'number' && typeof b === 'number') {
    const x = round15(a)
    const y = round15(b)
    return x < y ? -1 : x > y ? 1 : 0
  }
  if (typeof a === 'string' && typeof b === 'string') return Math.sign(compareText(a, b))
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1
  return 0
}

export function equalValues(a: Scalar, b: Scalar): boolean {
  return compareValues(a, b) === 0
}

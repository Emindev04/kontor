// Calculation engine: parsed-formula cache, dependency graph, dirty tracking, pull-based
// recalculation, dynamic-array spilling and circular-reference detection.
import { MAX_COLS, MAX_ROWS, cellKey, keyCol, keyRow } from '../model/address'
import { Matrix } from '../model/matrix'
import type { Sheet } from '../model/sheet'
import { CellError, ERR, type Scalar } from '../model/types'
import type { Workbook } from '../model/workbook'
import { UNKNOWN_FUNCTION, evaluate } from './evaluator'
import './functions'
import { functionNames, parseFormula, type Node } from './parser'
import { FUNCTIONS } from './registry'
import { LambdaV, Omitted, RefV, areaToMatrix, round15, type Ctx, type EvalHost, type Value } from './values'
import { parseSpec, resolveSpec } from './structured'

const SHEET_MUL = 2 ** 34
export const fidOf = (sheetId: number, key: number) => sheetId * SHEET_MUL + key
const fidSheet = (fid: number) => Math.floor(fid / SHEET_MUL)
const fidKey = (fid: number) => fid - fidSheet(fid) * SHEET_MUL

type Dep = { s: number; r1: number; c1: number; r2: number; c2: number }
type Seed = { s: number; key: number }

const BUCKET_MAX_WIDTH = 32
const DIRTY_LIMIT = 20000

export class Engine implements EvalHost {
  private ast = new Map<number, { text: string; node: Node | null }>()
  private deps = new Map<number, Dep[]>()
  private cellIdx = new Map<number, Set<number>>()
  private colIdx = new Map<number, Map<number, Map<number, Dep[]>>>()
  private wide = new Map<number, Map<number, Dep[]>>()
  private dirty = new Set<number>()
  private volatile = new Set<number>()
  private blocked = new Set<number>()
  private evaluating = new Set<number>()
  private rec: Dep[] | null = null
  private pending: Seed[] = []
  private nameAst = new Map<string, { text: string; node: Node | null }>()
  /** Formula cells that were part of a circular reference in the last calculation. */
  circular = new Set<number>()

  constructor(public wb: Workbook) {}

  // ---------- EvalHost ----------

  sheetNamed(name: string) {
    return this.wb.sheetByName(name)
  }

  sheetList() {
    return this.wb.sheets
  }

  formulaAt(sheet: Sheet, r: number, c: number) {
    const f = sheet.get(r, c)?.f
    return f === undefined ? undefined : '=' + f
  }

  makeRef(sheet: Sheet, r1: number, c1: number, r2: number, c2: number): RefV {
    if (this.rec) this.rec.push({ s: sheet.id, r1, c1, r2, c2 })
    return new RefV([{ sheet, r1, c1, r2, c2 }])
  }

  value(sheet: Sheet, r: number, c: number): Scalar {
    const key = cellKey(r, c)
    const d = sheet.cells.get(key)
    if (d) {
      if (d.f !== undefined) {
        const fid = fidOf(sheet.id, key)
        if (this.dirty.has(fid) || !sheet.calc.has(key) || this.evaluating.has(fid)) this.compute(sheet, key, fid)
        return sheet.calc.get(key) ?? 0
      }
      if (d.v !== undefined && d.v !== null) return d.v
    }
    const anchor = sheet.spillOwner.get(key)
    if (anchor !== undefined) {
      const afid = fidOf(sheet.id, anchor)
      if (this.dirty.has(afid)) this.compute(sheet, anchor, afid)
      const sp = sheet.spills.get(anchor)
      if (!sp || sheet.spillOwner.get(key) !== anchor) return null
      return sp.matrix.get(keyRow(key) - keyRow(anchor), keyCol(key) - keyCol(anchor))
    }
    return null
  }

  /** Table by name (case-insensitive) with its sheet. */
  table(name: string) {
    const up = name.toUpperCase()
    for (const sheet of this.wb.sheets) for (const t of sheet.x.tables) if (t.name.toUpperCase() === up) return { sheet, t }
    return undefined
  }

  structRef(table: string, spec: string, ctx: Ctx): Value {
    let found: { sheet: Sheet; t: (typeof ctx.sheet.x.tables)[number] } | undefined
    if (table) found = this.table(table)
    else {
      const t = ctx.sheet.x.tables.find((x) => ctx.r >= x.range.r1 && ctx.r <= x.range.r2 && ctx.c >= x.range.c1 && ctx.c <= x.range.c2)
      if (t) found = { sheet: ctx.sheet, t }
    }
    if (!found) return ERR.ref
    const parsed = parseSpec(spec)
    if (!parsed) return ERR.ref
    const rg = resolveSpec(found.t, parsed, ctx.r)
    if (!rg) return parsed.thisRow ? ERR.value : ERR.ref
    return this.makeRef(found.sheet, rg.r1, rg.c1, rg.r2, rg.c2)
  }

  definedName(name: string, ctx: Ctx): Value | undefined {
    const def = this.wb.getName(name, ctx.sheet.id)
    if (!def) {
      const tb = this.table(name)
      return tb ? this.structRef(tb.t.name, '[]', ctx) : undefined
    }
    const cacheKey = `${def.scope ?? ''}!${def.name.toUpperCase()}`
    let entry = this.nameAst.get(cacheKey)
    if (!entry || entry.text !== def.ref) {
      let node: Node | null = null
      try {
        node = parseFormula(def.ref)
      } catch {
        node = null
      }
      entry = { text: def.ref, node }
      this.nameAst.set(cacheKey, entry)
    }
    if (!entry.node) return ERR.name
    return evaluate(entry.node, { ...ctx, scope: null })
  }

  spillRange(sheet: Sheet, r: number, c: number): RefV | CellError {
    const key = cellKey(r, c)
    const fid = fidOf(sheet.id, key)
    if (this.rec) this.rec.push({ s: sheet.id, r1: r, c1: c, r2: r, c2: c })
    if (this.dirty.has(fid)) this.compute(sheet, key, fid)
    const sp = sheet.spills.get(key)
    if (!sp) {
      const d = sheet.cells.get(key)
      return d?.f !== undefined && !(sheet.calc.get(key) instanceof CellError) ? this.makeRef(sheet, r, c, r, c) : ERR.ref
    }
    return this.makeRef(sheet, r, c, r + sp.rows - 1, c + sp.cols - 1)
  }

  // ---------- free formulas (conditional formats, validation) ----------

  private freeAst = new Map<string, Node | null>()

  /** Evaluates formula text (without "=") as if it were in cell (r, c), without recording dependencies. */
  evalFormula(text: string, sheet: Sheet, r: number, c: number): Value {
    let node = this.freeAst.get(text)
    if (node === undefined) {
      try {
        node = parseFormula(text)
      } catch {
        node = null
      }
      if (this.freeAst.size > 5000) this.freeAst.clear()
      this.freeAst.set(text, node)
    }
    if (!node) return ERR.name
    const prev = this.rec
    this.rec = null
    try {
      const ctx: Ctx = { host: this, sheet, r, c, scope: null }
      const v = evaluate(node, ctx)
      if (v instanceof RefV) {
        if (v.areas.length > 1) return ERR.value
        if (v.isCell) return this.value(v.area.sheet, v.area.r1, v.area.c1)
        return areaToMatrix(v.area, ctx)
      }
      return v
    } catch {
      return ERR.value
    } finally {
      this.rec = prev
    }
  }

  /** Like evalFormula, but always a single value (top-left of arrays). */
  evalScalar(text: string, sheet: Sheet, r: number, c: number): Scalar {
    const v = this.evalFormula(text, sheet, r, c)
    if (v instanceof Matrix) return v.get(0, 0)
    if (v instanceof LambdaV) return ERR.calc
    if (v instanceof Omitted) return null
    return v as Scalar
  }

  // ---------- display (no calculation) ----------

  /** Stored value for rendering. */
  display(sheet: Sheet, r: number, c: number): Scalar {
    const key = cellKey(r, c)
    const d = sheet.cells.get(key)
    if (d) {
      if (d.f !== undefined) return sheet.calc.get(key) ?? (d.cache !== undefined ? d.cache : null)
      if (d.v !== undefined && d.v !== null) return d.v
    }
    const anchor = sheet.spillOwner.get(key)
    if (anchor !== undefined) {
      const sp = sheet.spills.get(anchor)
      return sp ? sp.matrix.get(keyRow(key) - keyRow(anchor), keyCol(key) - keyCol(anchor)) : null
    }
    return null
  }

  isSpillAnchor(sheet: Sheet, r: number, c: number) {
    return sheet.spills.has(cellKey(r, c))
  }

  // ---------- dependency index ----------

  private removeDeps(fid: number) {
    const old = this.deps.get(fid)
    if (!old) return
    for (const d of old) {
      if (d.r1 === d.r2 && d.c1 === d.c2) {
        const set = this.cellIdx.get(fidOf(d.s, cellKey(d.r1, d.c1)))
        set?.delete(fid)
        continue
      }
      if (d.c2 - d.c1 + 1 <= BUCKET_MAX_WIDTH) {
        const cols = this.colIdx.get(d.s)
        if (!cols) continue
        for (let c = d.c1; c <= d.c2; c++) cols.get(c)?.delete(fid)
      } else this.wide.get(d.s)?.delete(fid)
    }
    this.deps.delete(fid)
  }

  private addDeps(fid: number, list: Dep[]) {
    if (!list.length) return
    const seen = new Set<string>()
    const uniq: Dep[] = []
    for (const d of list) {
      const k = `${d.s}:${d.r1}:${d.c1}:${d.r2}:${d.c2}`
      if (seen.has(k)) continue
      seen.add(k)
      uniq.push(d)
    }
    const existing = this.deps.get(fid)
    this.deps.set(fid, existing ? existing.concat(uniq) : uniq)
    for (const d of uniq) {
      if (d.r1 === d.r2 && d.c1 === d.c2) {
        const t = fidOf(d.s, cellKey(d.r1, d.c1))
        let set = this.cellIdx.get(t)
        if (!set) this.cellIdx.set(t, (set = new Set()))
        set.add(fid)
        continue
      }
      if (d.c2 - d.c1 + 1 <= BUCKET_MAX_WIDTH) {
        let cols = this.colIdx.get(d.s)
        if (!cols) this.colIdx.set(d.s, (cols = new Map()))
        for (let c = d.c1; c <= d.c2; c++) {
          let m = cols.get(c)
          if (!m) cols.set(c, (m = new Map()))
          const arr = m.get(fid)
          if (arr) arr.push(d)
          else m.set(fid, [d])
        }
      } else {
        let m = this.wide.get(d.s)
        if (!m) this.wide.set(d.s, (m = new Map()))
        const arr = m.get(fid)
        if (arr) arr.push(d)
        else m.set(fid, [d])
      }
    }
  }

  private dependents(s: number, key: number, out: (fid: number) => void) {
    const r = keyRow(key)
    const c = keyCol(key)
    const direct = this.cellIdx.get(fidOf(s, key))
    if (direct) direct.forEach(out)
    const bucket = this.colIdx.get(s)?.get(c)
    if (bucket)
      bucket.forEach((ds, fid) => {
        for (const d of ds) if (r >= d.r1 && r <= d.r2) return out(fid)
      })
    const w = this.wide.get(s)
    if (w)
      w.forEach((ds, fid) => {
        for (const d of ds) if (r >= d.r1 && r <= d.r2 && c >= d.c1 && c <= d.c2) return out(fid)
      })
  }

  /** Formula cells that read the given cell (direct precedents only). */
  directDependents(sheet: Sheet, r: number, c: number): number[] {
    const out = new Set<number>()
    this.dependents(sheet.id, cellKey(r, c), (f) => out.add(f))
    return [...out]
  }

  /** Ranges a formula cell reads. */
  precedents(sheet: Sheet, r: number, c: number): Dep[] {
    return this.deps.get(fidOf(sheet.id, cellKey(r, c))) ?? []
  }

  static cellOfFid(fid: number) {
    const key = fidKey(fid)
    return { sheetId: fidSheet(fid), r: keyRow(key), c: keyCol(key) }
  }

  private markFrom(seeds: Seed[]) {
    const queue = seeds.slice()
    while (queue.length) {
      const { s, key } = queue.pop()!
      this.dependents(s, key, (fid) => {
        if (this.dirty.has(fid)) return
        this.dirty.add(fid)
        const fs = fidSheet(fid)
        const fk = fidKey(fid)
        queue.push({ s: fs, key: fk })
        const sheet = this.wb.sheetById(fs)
        const sp = sheet?.spills.get(fk)
        if (sp) for (const k of this.spillKeys(fk, sp.rows, sp.cols)) queue.push({ s: fs, key: k })
      })
      if (this.dirty.size > DIRTY_LIMIT) {
        this.markAll()
        return
      }
    }
  }

  private spillKeys(anchor: number, rows: number, cols: number): number[] {
    const r0 = keyRow(anchor)
    const c0 = keyCol(anchor)
    const out: number[] = []
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r || c) out.push(cellKey(r0 + r, c0 + c))
    return out
  }

  private markAll() {
    this.circular.clear()
    for (const sheet of this.wb.sheets) for (const [key, d] of sheet.cells) if (d.f !== undefined) this.dirty.add(fidOf(sheet.id, key))
  }

  // ---------- public API ----------

  /** Call after cell contents changed (values or formulas). */
  cellsChanged(sheet: Sheet, keys: Iterable<number>) {
    const seeds: Seed[] = []
    for (const key of keys) {
      const fid = fidOf(sheet.id, key)
      const d = sheet.cells.get(key)
      this.ast.delete(fid)
      if (d?.f !== undefined) this.dirty.add(fid)
      else {
        this.removeDeps(fid)
        this.circular.delete(fid)
        this.volatile.delete(fid)
        this.blocked.delete(fid)
        this.dirty.delete(fid)
        sheet.calc.delete(key)
        const sp = sheet.spills.get(key)
        if (sp) {
          for (const k of this.spillKeys(key, sp.rows, sp.cols)) {
            sheet.spillOwner.delete(k)
            seeds.push({ s: sheet.id, key: k })
          }
          sheet.spills.delete(key)
          sheet.touchUsed()
        }
      }
      const owner = sheet.spillOwner.get(key)
      if (owner !== undefined) this.dirty.add(fidOf(sheet.id, owner))
      seeds.push({ s: sheet.id, key })
    }
    for (const b of this.blocked) this.dirty.add(b)
    this.markFrom(seeds)
  }

  /** Forget everything and recalculate all formulas (after loading or structural changes). */
  rebuild() {
    this.ast.clear()
    this.deps.clear()
    this.cellIdx.clear()
    this.colIdx.clear()
    this.wide.clear()
    this.volatile.clear()
    this.blocked.clear()
    this.nameAst.clear()
    this.dirty.clear()
    for (const sheet of this.wb.sheets) {
      sheet.calc.clear()
      sheet.spills.clear()
      sheet.spillOwner.clear()
      sheet.touchUsed()
    }
    this.markAll()
    this.recalc(true)
  }

  /** Marks everything dirty and recalculates (F9 / Calculate Now). */
  recalcAll() {
    this.nameAst.clear()
    this.markAll()
    this.recalc(true)
  }

  namesChanged() {
    this.nameAst.clear()
    this.markAll()
  }

  /** Recalculates dirty cells. Volatile cells are recalculated too unless `skipVolatile`. */
  recalc(force = false, skipVolatile = false) {
    if (this.wb.calcMode === 'manual' && !force) return
    if (!skipVolatile && this.volatile.size) {
      const seeds: Seed[] = []
      for (const fid of this.volatile) {
        this.dirty.add(fid)
        seeds.push({ s: fidSheet(fid), key: fidKey(fid) })
      }
      this.markFrom(seeds)
    }
    for (let pass = 0; pass < 50 && (this.dirty.size || this.pending.length); pass++) {
      if (this.pending.length) {
        const seeds = this.pending
        this.pending = []
        this.markFrom(seeds)
      }
      const order = [...this.dirty].sort((a, b) => a - b)
      for (const fid of order) {
        if (!this.dirty.has(fid)) continue
        const sheet = this.wb.sheetById(fidSheet(fid))
        const key = fidKey(fid)
        if (!sheet || sheet.cells.get(key)?.f === undefined) {
          this.dirty.delete(fid)
          continue
        }
        try {
          this.compute(sheet, key, fid)
        } catch (e) {
          if (!(e instanceof RangeError)) throw e
          // Too deep for one go: precedents computed so far stay, the rest follows in the next pass.
          this.evaluating.clear()
          this.rec = null
        }
      }
    }
    if (this.wb.iterate.on && this.circular.size && !this.iterating) this.iterateLoops()
  }

  private iterating = false

  /** Iterative calculation: recalculates circular references until no value changes more than the limit. */
  private iterateLoops() {
    this.iterating = true
    try {
      const { max, change } = this.wb.iterate
      for (let k = 1; k < Math.max(1, max); k++) {
        const loop = [...this.circular]
        const at = (fid: number) => {
          const sh = this.wb.sheetById(fidSheet(fid))
          const v = sh ? this.value(sh, keyRow(fidKey(fid)), keyCol(fidKey(fid))) : null
          return typeof v === 'number' ? v : NaN
        }
        const before = loop.map(at)
        for (const fid of loop) this.dirty.add(fid)
        this.markFrom(loop.map((fid) => ({ s: fidSheet(fid), key: fidKey(fid) })))
        this.recalc(true, true)
        const delta = Math.max(0, ...loop.map((fid, i) => Math.abs(at(fid) - before[i])).filter((d) => !Number.isNaN(d)))
        if (delta <= change) break
      }
    } finally {
      this.iterating = false
    }
  }

  get needsRecalc() {
    return this.dirty.size > 0
  }

  // ---------- computing one cell ----------

  private parsed(fid: number, text: string): Node | null {
    const e = this.ast.get(fid)
    if (e && e.text === text) return e.node
    let node: Node | null = null
    try {
      node = parseFormula(text)
    } catch {
      node = null
    }
    this.ast.set(fid, { text, node })
    if (node) {
      const names = functionNames(node)
      let vol = false
      for (const n of names) if (FUNCTIONS.get(n)?.volatile) vol = true
      if (vol) this.volatile.add(fid)
      else this.volatile.delete(fid)
    }
    return node
  }

  private compute(sheet: Sheet, key: number, fid: number) {
    if (this.evaluating.has(fid)) {
      this.circular.add(fid)
      return
    }
    const d = sheet.cells.get(key)
    // stays in `circular` only while recalculating it still closes a loop
    this.circular.delete(fid)
    if (!d || d.f === undefined) {
      this.dirty.delete(fid)
      return
    }
    this.evaluating.add(fid)
    this.dirty.delete(fid)
    const node = this.parsed(fid, d.f)
    this.removeDeps(fid)
    const rec: Dep[] = []
    const prev = this.rec
    this.rec = rec
    const r = keyRow(key)
    const c = keyCol(key)
    const ctx: Ctx = { host: this, sheet, r, c, scope: null }
    let result: Value = ERR.name
    let done = false
    try {
      result = node ? evaluate(node, ctx) : ERR.name
      if (result instanceof RefV) {
        if (result.areas.length > 1) result = ERR.value
        else if (result.isCell) result = this.value(result.area.sheet, result.area.r1, result.area.c1)
        else result = areaToMatrix(result.area, ctx)
      }
      done = true
    } catch (e) {
      if (e instanceof RangeError && /call stack/i.test(e.message)) throw e
      result = ERR.value
      done = true
    } finally {
      this.rec = prev
      this.evaluating.delete(fid)
      this.addDeps(fid, rec)
      if (!done) this.dirty.add(fid)
    }
    // Without iterative calculation a cell that closes a circular reference shows 0, like the original;
    // with it, the loop keeps its last value and recalc() iterates until the values settle.
    this.store(sheet, key, fid, this.circular.has(fid) && !this.wb.iterate.on ? 0 : result)
  }

  private store(sheet: Sheet, key: number, fid: number, result: Value) {
    let v: Scalar = null
    let matrix: Matrix | null = null
    if (result instanceof RefV) v = ERR.value
    else if (result instanceof Matrix) {
      if (result.rows === 1 && result.cols === 1) v = result.get(0, 0)
      else matrix = result
    } else if (result instanceof LambdaV) v = ERR.calc
    else if (result instanceof Omitted) v = 0
    else v = result

    const r0 = keyRow(key)
    const c0 = keyCol(key)
    const old = sheet.spills.get(key)
    let changed = false
    if (matrix) {
      const rows = Math.min(matrix.rows, MAX_ROWS - r0)
      const cols = Math.min(matrix.cols, MAX_COLS - c0)
      let blocked = rows < matrix.rows || cols < matrix.cols || matrix.rows * matrix.cols > 2_000_000
      if (!blocked)
        outer: for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            if (!r && !c) continue
            const k = cellKey(r0 + r, c0 + c)
            const cd = sheet.cells.get(k)
            if (cd && (cd.f !== undefined || (cd.v !== undefined && cd.v !== null))) {
              blocked = true
              break outer
            }
            const owner = sheet.spillOwner.get(k)
            if (owner !== undefined && owner !== key) {
              blocked = true
              break outer
            }
          }
      if (!blocked && sheet.merges.some((m) => m.r1 <= r0 + rows - 1 && m.r2 >= r0 && m.c1 <= c0 + cols - 1 && m.c2 >= c0)) blocked = true
      if (old && (blocked || old.rows !== rows || old.cols !== cols)) {
        for (const k of this.spillKeys(key, old.rows, old.cols)) {
          if (sheet.spillOwner.get(k) === key) sheet.spillOwner.delete(k)
          this.pending.push({ s: sheet.id, key: k })
        }
        sheet.spills.delete(key)
        changed = true
      }
      if (blocked) {
        v = ERR.spill
        this.blocked.add(fid)
      } else {
        this.blocked.delete(fid)
        const clean = matrix.map((x) => (x === null ? 0 : typeof x === 'number' ? normalizeNumber(x) : x))
        sheet.spills.set(key, { matrix: clean, rows, cols })
        if (!old || old.rows !== rows || old.cols !== cols) {
          for (const k of this.spillKeys(key, rows, cols)) {
            sheet.spillOwner.set(k, key)
            this.pending.push({ s: sheet.id, key: k })
          }
          changed = true
        }
        v = clean.get(0, 0)
      }
    } else {
      this.blocked.delete(fid)
      if (old) {
        for (const k of this.spillKeys(key, old.rows, old.cols)) {
          if (sheet.spillOwner.get(k) === key) sheet.spillOwner.delete(k)
          this.pending.push({ s: sheet.id, key: k })
        }
        sheet.spills.delete(key)
        changed = true
      }
    }
    if (changed) sheet.touchUsed()
    if (v === null) v = 0
    if (v === UNKNOWN_FUNCTION) {
      const cache = sheet.cells.get(key)?.cache
      if (cache !== undefined) v = cache
    }
    if (typeof v === 'number') v = normalizeNumber(v)
    sheet.calc.set(key, v)
  }
}

function normalizeNumber(x: number): Scalar {
  if (!Number.isFinite(x)) return ERR.num
  if (Object.is(x, -0)) return 0
  return round15(x)
}

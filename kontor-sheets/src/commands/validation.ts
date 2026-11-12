// Data validation: checking typed values, list drop-downs, input messages and invalid-data circles.
import { type Range } from '../model/address'
import type { CellOp, Validation } from '../model/extras'
import { Matrix } from '../model/matrix'
import { parseInput } from '../model/parseInput'
import { numberSymbols } from '../model/numberLocale'
import type { Sheet } from '../model/sheet'
import { CellError, type Scalar } from '../model/types'
import type { Doc } from './doc'
import { shiftFormula } from '../engine/refs'
import { t, tx } from '../i18n'

export function validationAt(sheet: Sheet, r: number, c: number): Validation | undefined {
  for (let i = sheet.x.validations.length - 1; i >= 0; i--) {
    const v = sheet.x.validations[i]
    if (v.ranges.some((rg) => r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2)) return v
  }
  return undefined
}

/** Top-left cell of the first range (relative formulas are written for it). */
const origin = (v: Validation) => v.ranges[0] ?? { r1: 0, c1: 0, r2: 0, c2: 0 }

const shiftText = (f: string, dr: number, dc: number) => shiftFormula(f, dr, dc)

/** Value of a criteria box ("10", "=B1", "1/1/2026") at cell (r, c). */
export function criteriaValue(doc: Doc, sheet: Sheet, v: Validation, text: string | undefined, r: number, c: number): Scalar {
  if (text === undefined || text === '') return null
  if (text.startsWith('=')) {
    const o = origin(v)
    return doc.engine.evalScalar(shiftText(text.slice(1), r - o.r1, c - o.c1), sheet, r, c)
  }
  const p = parseInput(text)
  return p.kind === 'value' ? p.v : null
}

/** Items of a list validation: literal "a,b,c" or a range/formula. */
export function listItems(doc: Doc, sheet: Sheet, v: Validation, r: number, c: number): string[] {
  const src = v.f1 ?? ''
  if (!src.startsWith('=')) return src.split(',').map((x) => x.trim()).filter((x) => x !== '')
  const o = origin(v)
  const res = doc.engine.evalFormula(shiftText(src.slice(1), r - o.r1, c - o.c1), sheet, r, c)
  const out: string[] = []
  const push = (x: Scalar) => {
    if (x === null || x === '') return
    out.push(x instanceof CellError ? x.code : typeof x === 'boolean' ? (x ? 'TRUE' : 'FALSE') : String(x))
  }
  if (res instanceof Matrix) res.data.forEach((x) => push(x as Scalar))
  else push(res as Scalar)
  return out
}

function compare(op: CellOp, x: number, a: number, b: number): boolean {
  switch (op) {
    case 'between': return x >= Math.min(a, b) && x <= Math.max(a, b)
    case 'notBetween': return x < Math.min(a, b) || x > Math.max(a, b)
    case 'equal': return x === a
    case 'notEqual': return x !== a
    case 'greaterThan': return x > a
    case 'lessThan': return x < a
    case 'greaterThanOrEqual': return x >= a
    case 'lessThanOrEqual': return x <= a
  }
}

/** Whether a value satisfies a rule (value = what the cell would contain). */
export function isValid(doc: Doc, sheet: Sheet, v: Validation, r: number, c: number, value: Scalar): boolean {
  if (value === null || value === '') return v.allowBlank
  const num = (x: Scalar) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : NaN)
  const a = criteriaValue(doc, sheet, v, v.f1, r, c)
  const b = criteriaValue(doc, sheet, v, v.f2, r, c)
  switch (v.type) {
    case 'any':
      return true
    case 'whole': {
      const x = num(value)
      return Number.isInteger(x) && compare(v.op, x, num(a), num(b))
    }
    case 'decimal':
    case 'date':
    case 'time': {
      const x = num(value)
      if (!Number.isFinite(x)) return false
      if (v.type === 'time' && (x < 0 || x >= 1)) return false
      return compare(v.op, x, num(a), num(b))
    }
    case 'textLength': {
      const len = String(value instanceof CellError ? value.code : value).length
      return compare(v.op, len, num(a), num(b))
    }
    case 'list': {
      const items = listItems(doc, sheet, v, r, c)
      const t = String(value instanceof CellError ? value.code : value).toUpperCase()
      return items.some((i) => i.toUpperCase() === t)
    }
    case 'custom': {
      const res = criteriaValue(doc, sheet, v, v.f1?.startsWith('=') ? v.f1 : `=${v.f1 ?? 'TRUE'}`, r, c)
      return res === true || (typeof res === 'number' && res !== 0)
    }
  }
}

export type ValidationFailure = { style: 'stop' | 'warning' | 'information'; title: string; message: string }

const DEFAULT_MESSAGE = tx('This value doesn’t match the data validation restrictions defined for this cell.')

/** Checks typed text for (r, c). Formulas are checked by their result after entry, like the original. */
export function validateInput(doc: Doc, sheet: Sheet, r: number, c: number, text: string): ValidationFailure | null {
  const v = validationAt(sheet, r, c)
  if (!v || !v.showError || v.type === 'any') return null
  // typed like cell entry: numbers in the interface language's notation
  const p = parseInput(text, numberSymbols())
  if (p.kind === 'formula') return null
  const value = p.v
  if (isValid(doc, sheet, v, r, c, value)) return null
  return { style: v.errorStyle, title: v.errorTitle || 'Kontor Sheets', message: (v.errorMessage || t(DEFAULT_MESSAGE)) + (v.errorStyle === 'warning' ? '\n\n' + t('Continue?') : '') }
}

/** Cells with values that break their validation rule (Circle Invalid Data). */
export function invalidCells(doc: Doc, sheet: Sheet, limit = 500): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = []
  for (const v of sheet.x.validations) {
    if (v.type === 'any') continue
    for (const rg of v.ranges) {
      const b = doc.boundToUsed(rg, sheet)
      for (let r = b.r1; r <= b.r2; r++)
        for (let c = b.c1; c <= b.c2; c++) {
          const val = doc.engine.display(sheet, r, c)
          if (val === null) continue
          if (!isValid(doc, sheet, v, r, c, val)) out.push({ r, c })
          if (out.length >= limit) return out
        }
    }
  }
  return out
}

/** Removes the given ranges from every rule, then adds a new rule for them (or none). */
export function setValidation(doc: Doc, ranges: Range[], rule: Omit<Validation, 'id' | 'ranges'> | null) {
  const sheet = doc.sheet
  doc.transact(rule ? tx('Data Validation') : tx('Clear Validation'), () => {
    doc.noteProps(sheet)
    const list: Validation[] = []
    for (const v of sheet.x.validations) {
      const kept = v.ranges.flatMap((rg) => subtract(rg, ranges))
      if (kept.length) list.push({ ...v, ranges: kept })
    }
    if (rule) list.push({ ...rule, id: doc.wb.newObjectId(), ranges: ranges.map((r) => ({ ...r })) })
    sheet.x.validations = list
  })
}

/** Range minus a set of ranges, as a list of rectangles. */
export function subtract(rg: Range, cuts: Range[]): Range[] {
  let parts = [rg]
  for (const cut of cuts) {
    const next: Range[] = []
    for (const p of parts) {
      if (cut.r2 < p.r1 || cut.r1 > p.r2 || cut.c2 < p.c1 || cut.c1 > p.c2) {
        next.push(p)
        continue
      }
      if (cut.r1 > p.r1) next.push({ ...p, r2: cut.r1 - 1 })
      if (cut.r2 < p.r2) next.push({ ...p, r1: cut.r2 + 1 })
      const r1 = Math.max(p.r1, cut.r1)
      const r2 = Math.min(p.r2, cut.r2)
      if (cut.c1 > p.c1) next.push({ r1, r2, c1: p.c1, c2: cut.c1 - 1 })
      if (cut.c2 < p.c2) next.push({ r1, r2, c1: cut.c2 + 1, c2: p.c2 })
    }
    parts = next
  }
  return parts
}

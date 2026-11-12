import type { Scalar } from '../../model/types'
import { fn } from '../registry'
import { compareText, type Ctx, type Value } from '../values'
import { aggregateBy } from './stats'
import { ERR, argMatrix, criterion, isErr, toScalar, CellError } from './helpers'

/** Values of `field` for database rows matching the criteria range (rows OR-ed, columns AND-ed). */
function dbValues(args: Value[], ctx: Ctx): Scalar[] | CellError {
  const db = argMatrix(args, 0, ctx)
  const crit = argMatrix(args, 2, ctx)
  if (isErr(db)) return db
  if (isErr(crit)) return crit
  const headers = db.row(0).map((h) => String(h ?? ''))
  const fieldV = toScalar(args[1], ctx)
  let field = -1
  if (typeof fieldV === 'number') field = Math.trunc(fieldV) - 1
  else if (typeof fieldV === 'string') field = headers.findIndex((h) => compareText(h, fieldV) === 0)
  else if (fieldV === null) field = -2
  if (field === -1 || field >= headers.length) return ERR.value
  const critHeaders = crit.row(0).map((h) => headers.findIndex((x) => compareText(x, String(h ?? '')) === 0))
  const critRows: ((row: Scalar[]) => boolean)[] = []
  for (let r = 1; r < crit.rows; r++) {
    const tests: [number, (v: Scalar) => boolean][] = []
    for (let c = 0; c < crit.cols; c++) {
      const v = crit.get(r, c)
      if (v === null) continue
      if (critHeaders[c] < 0) return ERR.value
      tests.push([critHeaders[c], criterion(v)])
    }
    critRows.push((row) => tests.every(([i, t]) => t(row[i])))
  }
  const out: Scalar[] = []
  for (let r = 1; r < db.rows; r++) {
    const row = db.row(r)
    if (critRows.length && !critRows.some((t) => t(row))) continue
    out.push(field === -2 ? true : row[field])
  }
  return out
}

function dbFn(name: string, code: number | 'count' | 'counta' | 'get') {
  fn(name, 3, 3, (args, ctx) => {
    const vals = dbValues(args, ctx)
    if (isErr(vals)) return vals
    if (code === 'count') return vals.filter((v) => typeof v === 'number').length
    if (code === 'counta') return vals.filter((v) => v !== null && v !== '').length
    if (code === 'get') return vals.length === 1 ? vals[0] : vals.length ? ERR.num : ERR.value
    return aggregateBy(code, vals)
  })
}
dbFn('DAVERAGE', 1)
dbFn('DCOUNT', 'count')
dbFn('DCOUNTA', 'counta')
dbFn('DGET', 'get')
dbFn('DMAX', 4)
dbFn('DMIN', 5)
dbFn('DPRODUCT', 6)
dbFn('DSTDEV', 7)
dbFn('DSTDEVP', 8)
dbFn('DSUM', 9)
dbFn('DVAR', 10)
dbFn('DVARP', 11)

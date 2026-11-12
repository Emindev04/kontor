import { cellName } from '../../model/address'
import { classifyFormat } from '../../model/numfmt'
import type { Scalar } from '../../model/types'
import { fn } from '../registry'
import { LambdaV, scalarOrMatrix } from '../values'
import { CellError, ERR, Matrix, RefV, isErr, isOmitted, N, sfn, toScalar, toText } from './helpers'

sfn('ISBLANK', 1, 1, ([a]) => a === null)
sfn('ISERR', 1, 1, ([a]) => a instanceof CellError && a.code !== '#N/A')
sfn('ISERROR', 1, 1, ([a]) => a instanceof CellError)
sfn('ISNA', 1, 1, ([a]) => a instanceof CellError && a.code === '#N/A')
sfn('ISNUMBER', 1, 1, ([a]) => typeof a === 'number')
sfn('ISTEXT', 1, 1, ([a]) => typeof a === 'string')
sfn('ISNONTEXT', 1, 1, ([a]) => typeof a !== 'string')
sfn('ISLOGICAL', 1, 1, ([a]) => typeof a === 'boolean')
sfn('ISEVEN', 1, 1, ([a]) => {
  const n = N(a)
  return isErr(n) ? n : Math.trunc(n) % 2 === 0
})
sfn('ISODD', 1, 1, ([a]) => {
  const n = N(a)
  return isErr(n) ? n : Math.abs(Math.trunc(n)) % 2 === 1
})
fn('ISREF', 1, 1, (args) => args[0] instanceof RefV)
fn('ISFORMULA', 1, 1, (args, ctx) => {
  const v = args[0]
  if (!(v instanceof RefV)) return ERR.value
  return ctx.host.formulaAt(v.area.sheet, v.area.r1, v.area.c1) !== undefined
})
sfn('N', 1, 1, ([a]) => (typeof a === 'number' ? a : typeof a === 'boolean' ? (a ? 1 : 0) : a instanceof CellError ? a : 0))
fn('NA', 0, 0, () => ERR.na)
fn('TYPE', 1, 1, (args, ctx) => {
  const v = args[0]
  if (v instanceof Matrix || (v instanceof RefV && !v.isCell)) return 64
  if (v instanceof LambdaV) return 128
  const s = scalarOrMatrix(v, ctx) as Scalar
  if (typeof s === 'number' || s === null) return 1
  if (typeof s === 'string') return 2
  if (typeof s === 'boolean') return 4
  return 16
})
sfn('ERROR.TYPE', 1, 1, ([a]) => {
  if (!(a instanceof CellError)) return ERR.na
  const codes = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#GETTING_DATA']
  const i = codes.indexOf(a.code)
  return i >= 0 ? i + 1 : a.code === '#SPILL!' ? 9 : a.code === '#CALC!' ? 14 : ERR.na
})
fn('SHEET', 0, 1, (args, ctx) => {
  const list = ctx.host.sheetList()
  if (isOmitted(args, 0)) return list.indexOf(ctx.sheet) + 1
  const v = args[0]
  if (v instanceof RefV) return list.indexOf(v.area.sheet) + 1
  const name = toText(toScalar(v, ctx))
  if (isErr(name)) return name
  const s = ctx.host.sheetNamed(name)
  return s ? list.indexOf(s) + 1 : ERR.na
})
fn('SHEETS', 0, 1, (args, ctx) => {
  if (isOmitted(args, 0)) return ctx.host.sheetList().length
  const v = args[0]
  return v instanceof RefV ? new Set(v.areas.map((a) => a.sheet)).size : ERR.value
})
fn('CELL', 1, 2, (args, ctx) => {
  const type = toText(toScalar(args[0], ctx))
  if (isErr(type)) return type
  const ref = isOmitted(args, 1) ? ctx.host.makeRef(ctx.sheet, ctx.r, ctx.c, ctx.r, ctx.c) : args[1]
  if (!(ref instanceof RefV)) return ERR.value
  const a = ref.area
  const v = ctx.host.value(a.sheet, a.r1, a.c1)
  switch (type.toLowerCase()) {
    case 'address': return '$' + cellName(a.r1, a.c1).replace(/(\d+)$/, '$$$1')
    case 'col': return a.c1 + 1
    case 'row': return a.r1 + 1
    case 'contents': return v
    case 'type': return v === null ? 'b' : typeof v === 'string' ? 'l' : 'v'
    case 'filename': return a.sheet.name
    case 'sheetname': return a.sheet.name
    case 'width': return Math.round((a.sheet.cols.size(a.c1) - 5) / 7)
    case 'prefix': return typeof v === 'string' ? "'" : ''
    case 'protect': return 1
    case 'format': {
      const k = classifyFormat(undefined)
      return k === 'general' ? 'G' : 'F2'
    }
    default: return ERR.value
  }
}, { volatile: true })
fn('INFO', 1, 1, (args, ctx) => {
  const t = toText(toScalar(args[0], ctx))
  if (isErr(t)) return t
  switch (t.toLowerCase()) {
    case 'numfile': return ctx.host.sheetList().length
    case 'recalc': return 'Automatic'
    case 'release': return '1.0'
    case 'system': return 'web'
    case 'osversion': return navigator.userAgent
    case 'origin': return '$A:$A$1'
    case 'directory': return '/'
    default: return ERR.value
  }
}, { volatile: true })

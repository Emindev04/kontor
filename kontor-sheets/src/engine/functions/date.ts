import { daysInMonth, isLeap, jsDateToSerial, partsToSerial, serialToParts } from '../../model/dates'
import { parseDate, parseDateTime, parseTime } from '../../model/parseInput'
import type { Scalar } from '../../model/types'
import { fn } from '../registry'
import { collectNumbers, type Ctx, type Value } from '../values'
import { CellError, ERR, argNum, isErr, isOmitted, N, optN, sfn, toScalar, toText } from './helpers'

function serial(v: Scalar): number | CellError {
  const n = N(v)
  if (isErr(n)) return n
  if (n < 0 || n > 2958465) return ERR.num
  return n
}

sfn('DATE', 3, 3, ([a, b, c]) => {
  const y = N(a)
  const m = N(b)
  const d = N(c)
  if (isErr(y)) return y
  if (isErr(m)) return m
  if (isErr(d)) return d
  let yy = Math.trunc(y)
  if (yy < 0 || yy > 9999) return ERR.num
  if (yy < 1900) yy += 1900
  const s = partsToSerial(yy, Math.trunc(m), Math.trunc(d))
  return s < 0 || s > 2958465 ? ERR.num : s
})

sfn('DATEVALUE', 1, 1, ([a]) => {
  if (typeof a !== 'string') return ERR.value
  const d = parseDateTime(a)
  if (!d) return ERR.value
  const v = Math.floor(d.v)
  return v === 0 && !parseDate(a) ? ERR.value : v
})

sfn('TIMEVALUE', 1, 1, ([a]) => {
  if (typeof a !== 'string') return ERR.value
  const t = parseTime(a) ?? parseDateTime(a)
  if (!t) return ERR.value
  return t.v - Math.floor(t.v)
})

function part(name: string, f: (p: ReturnType<typeof serialToParts>) => number) {
  sfn(name, 1, 1, ([a]) => {
    const s = serial(a)
    return isErr(s) ? s : f(serialToParts(s))
  })
}
part('DAY', (p) => p.d)
part('MONTH', (p) => p.m)
part('YEAR', (p) => p.y)

function timePart(name: string, f: (secs: number) => number) {
  sfn(name, 1, 1, ([a]) => {
    const n = N(a)
    if (isErr(n)) return n
    if (n < 0) return ERR.num
    const secs = Math.round((n - Math.floor(n)) * 86400) % 86400
    return f(secs)
  })
}
timePart('HOUR', (s) => Math.floor(s / 3600))
timePart('MINUTE', (s) => Math.floor(s / 60) % 60)
timePart('SECOND', (s) => s % 60)

sfn('TIME', 3, 3, ([a, b, c]) => {
  const h = N(a)
  const m = N(b)
  const s = N(c)
  if (isErr(h)) return h
  if (isErr(m)) return m
  if (isErr(s)) return s
  const total = Math.trunc(h) * 3600 + Math.trunc(m) * 60 + Math.trunc(s)
  if (total < 0) return ERR.num
  return (total % 86400) / 86400
})

fn('NOW', 0, 0, () => jsDateToSerial(new Date()), { volatile: true })
fn('TODAY', 0, 0, () => Math.floor(jsDateToSerial(new Date())), { volatile: true })

function weekday(s: number, type: number): number | CellError {
  const wd = serialToParts(s).wd // 0 = Sunday
  switch (type) {
    case 1: return wd + 1
    case 2: return ((wd + 6) % 7) + 1
    case 3: return (wd + 6) % 7
    default:
      if (type >= 11 && type <= 17) {
        const start = type - 10 // 1 = Monday
        return ((wd - start + 7) % 7) + 1
      }
      return ERR.num
  }
}

sfn('WEEKDAY', 1, 2, (a) => {
  const s = serial(a[0])
  const t = optN(a, 1, 1)
  if (isErr(s)) return s
  if (isErr(t)) return t
  return weekday(s, Math.trunc(t))
})

function isoWeek(s: number): number {
  const p = serialToParts(s)
  const wdMon = (p.wd + 6) % 7 // 0 = Monday
  const thursday = Math.floor(s) - wdMon + 3
  const ty = serialToParts(thursday).y
  const jan1 = partsToSerial(ty, 1, 1)
  return Math.floor((thursday - jan1) / 7) + 1
}

sfn('ISOWEEKNUM', 1, 1, ([a]) => {
  const s = serial(a)
  return isErr(s) ? s : isoWeek(s)
})

sfn('WEEKNUM', 1, 2, (a) => {
  const s = serial(a[0])
  const t = optN(a, 1, 1)
  if (isErr(s)) return s
  if (isErr(t)) return t
  const type = Math.trunc(t)
  if (type === 21) return isoWeek(s)
  const startMap: Record<number, number> = { 1: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 0 }
  const start = startMap[type]
  if (start === undefined) return ERR.num
  const p = serialToParts(s)
  const jan1 = partsToSerial(p.y, 1, 1)
  const jan1wd = serialToParts(jan1).wd
  const offset = (jan1wd - start + 7) % 7
  return Math.floor((Math.floor(s) - jan1 + offset) / 7) + 1
})

function addMonths(s: number, months: number, endOfMonth: boolean): number | CellError {
  const p = serialToParts(s)
  let m = p.m - 1 + Math.trunc(months)
  const y = p.y + Math.floor(m / 12)
  m = ((m % 12) + 12) % 12
  if (y < 1900 || y > 9999) return ERR.num
  const dim = daysInMonth(y, m + 1)
  return partsToSerial(y, m + 1, endOfMonth ? dim : Math.min(p.d, dim))
}

sfn('EDATE', 2, 2, ([a, b]) => {
  const s = serial(a)
  const m = N(b)
  if (isErr(s)) return s
  if (isErr(m)) return m
  return addMonths(Math.floor(s), m, false)
})
sfn('EOMONTH', 2, 2, ([a, b]) => {
  const s = serial(a)
  const m = N(b)
  if (isErr(s)) return s
  if (isErr(m)) return m
  return addMonths(Math.floor(s), m, true)
})

sfn('DAYS', 2, 2, ([a, b]) => {
  const e = serial(a)
  const s = serial(b)
  if (isErr(e)) return e
  if (isErr(s)) return s
  return Math.floor(e) - Math.floor(s)
})

function days360(s: number, e: number, european: boolean): number {
  const a = serialToParts(s)
  const b = serialToParts(e)
  let d1 = a.d
  let d2 = b.d
  if (european) {
    if (d1 === 31) d1 = 30
    if (d2 === 31) d2 = 30
  } else {
    const lastFebA = a.m === 2 && d1 === daysInMonth(a.y, 2)
    if (d1 === 31 || lastFebA) d1 = 30
    if (d2 === 31 && d1 >= 30) d2 = 30
  }
  return (b.y - a.y) * 360 + (b.m - a.m) * 30 + (d2 - d1)
}

sfn('DAYS360', 2, 3, (a) => {
  const s = serial(a[0])
  const e = serial(a[1])
  if (isErr(s)) return s
  if (isErr(e)) return e
  const eu = a.length > 2 && a[2] !== null && a[2] !== false && a[2] !== 0
  return days360(s, e, eu)
})

sfn('DATEDIF', 3, 3, ([a, b, c]) => {
  const s = serial(a)
  const e = serial(b)
  if (isErr(s)) return s
  if (isErr(e)) return e
  if (s > e) return ERR.num
  const unit = String(c ?? '').toUpperCase()
  const p = serialToParts(s)
  const q = serialToParts(e)
  let months = (q.y - p.y) * 12 + (q.m - p.m)
  if (q.d < p.d) months--
  switch (unit) {
    case 'Y': return Math.floor(months / 12)
    case 'M': return months
    case 'D': return Math.floor(e) - Math.floor(s)
    case 'YM': return ((months % 12) + 12) % 12
    case 'MD': {
      let d = q.d - p.d
      if (d < 0) d += daysInMonth(q.m === 1 ? q.y - 1 : q.y, q.m === 1 ? 12 : q.m - 1)
      return d
    }
    case 'YD': {
      let start = partsToSerial(q.y, p.m, p.d)
      if (start > e) start = partsToSerial(q.y - 1, p.m, p.d)
      return Math.floor(e) - start
    }
    default: return ERR.num
  }
})

function weekendMask(v: Scalar): boolean[] | CellError {
  // index 0 = Monday … 6 = Sunday
  if (v === null) return [false, false, false, false, false, true, true]
  if (typeof v === 'string') {
    if (!/^[01]{7}$/.test(v) || v === '1111111') return ERR.value
    return [...v].map((ch) => ch === '1')
  }
  const n = N(v)
  if (isErr(n)) return n
  const map: Record<number, number[]> = { 1: [5, 6], 2: [6, 0], 3: [0, 1], 4: [1, 2], 5: [2, 3], 6: [3, 4], 7: [4, 5], 11: [6], 12: [0], 13: [1], 14: [2], 15: [3], 16: [4], 17: [5] }
  const days = map[Math.trunc(n)]
  if (!days) return ERR.num
  const mask = new Array(7).fill(false)
  for (const d of days) mask[d] = true
  return mask
}

function holidaySet(v: Value | undefined, ctx: Ctx): Set<number> | CellError {
  if (v === undefined) return new Set()
  const ns = collectNumbers([v], ctx)
  if (isErr(ns)) return ns
  return new Set(ns.map(Math.floor))
}

const isWorkday = (s: number, mask: boolean[], hol: Set<number>) => !mask[(serialToParts(s).wd + 6) % 7] && !hol.has(s)

function networkdays(args: Value[], ctx: Ctx, intl: boolean): Scalar {
  const s = argNum(args, 0, ctx)
  const e = argNum(args, 1, ctx)
  if (isErr(s)) return s
  if (isErr(e)) return e
  const mask = intl ? weekendMask(isOmitted(args, 2) ? null : toScalar(args[2], ctx)) : weekendMask(null)
  if (isErr(mask)) return mask
  const hol = holidaySet(intl ? (isOmitted(args, 3) ? undefined : args[3]) : isOmitted(args, 2) ? undefined : args[2], ctx)
  if (isErr(hol)) return hol
  let a = Math.floor(s)
  let b = Math.floor(e)
  const sign = a <= b ? 1 : -1
  if (sign < 0) [a, b] = [b, a]
  let count = 0
  for (let d = a; d <= b; d++) if (isWorkday(d, mask, hol)) count++
  return sign * count
}
fn('NETWORKDAYS', 2, 3, (args, ctx) => networkdays(args, ctx, false))
fn('NETWORKDAYS.INTL', 2, 4, (args, ctx) => networkdays(args, ctx, true))

function workday(args: Value[], ctx: Ctx, intl: boolean): Scalar {
  const s = argNum(args, 0, ctx)
  const n = argNum(args, 1, ctx)
  if (isErr(s)) return s
  if (isErr(n)) return n
  const mask = intl ? weekendMask(isOmitted(args, 2) ? null : toScalar(args[2], ctx)) : weekendMask(null)
  if (isErr(mask)) return mask
  const hol = holidaySet(intl ? (isOmitted(args, 3) ? undefined : args[3]) : isOmitted(args, 2) ? undefined : args[2], ctx)
  if (isErr(hol)) return hol
  let d = Math.floor(s)
  let left = Math.trunc(n)
  const step = left >= 0 ? 1 : -1
  while (left !== 0) {
    d += step
    if (isWorkday(d, mask, hol)) left -= step
  }
  return d
}
fn('WORKDAY', 2, 3, (args, ctx) => workday(args, ctx, false))
fn('WORKDAY.INTL', 2, 4, (args, ctx) => workday(args, ctx, true))

export function yearFrac(s: number, e: number, basis: number): number | CellError {
  if (s > e) [s, e] = [e, s]
  const a = serialToParts(s)
  const b = serialToParts(e)
  switch (basis) {
    case 0: return days360(s, e, false) / 360
    case 1: {
      if (a.y === b.y) return (e - s) / (isLeap(a.y) ? 366 : 365)
      const within = a.y + 1 === b.y && (b.m < a.m || (b.m === a.m && b.d <= a.d))
      if (within) {
        const leapIncluded = (isLeap(a.y) && (a.m < 3)) || (isLeap(b.y) && (b.m > 2 || (b.m === 2 && b.d === 29)))
        return (e - s) / (leapIncluded ? 366 : 365)
      }
      let total = 0
      for (let y = a.y; y <= b.y; y++) total += isLeap(y) ? 366 : 365
      return (e - s) / (total / (b.y - a.y + 1))
    }
    case 2: return (e - s) / 360
    case 3: return (e - s) / 365
    case 4: return days360(s, e, true) / 360
    default: return ERR.num
  }
}

sfn('YEARFRAC', 2, 3, (a) => {
  const s = serial(a[0])
  const e = serial(a[1])
  const basis = optN(a, 2, 0)
  if (isErr(s)) return s
  if (isErr(e)) return e
  if (isErr(basis)) return basis
  return yearFrac(Math.floor(s), Math.floor(e), Math.trunc(basis))
})

void toText

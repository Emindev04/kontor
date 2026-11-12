// Spreadsheet serial dates (1900 date system, including the historic 1900 leap-year bug:
// serial 60 is the non-existent 29 February 1900).

const MS_PER_DAY = 86400000
const EPOCH = Date.UTC(1899, 11, 30)

export type DateParts = { y: number; m: number; d: number; wd: number }

export function serialToParts(serial: number): DateParts {
  const day = Math.floor(serial)
  if (day === 60) return { y: 1900, m: 2, d: 29, wd: 3 }
  if (day === 0) return { y: 1900, m: 1, d: 0, wd: 6 }
  const ms = EPOCH + (day < 60 ? day + 1 : day) * MS_PER_DAY
  const dt = new Date(ms)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: day < 60 ? (dt.getUTCDay() + 6) % 7 : dt.getUTCDay() }
}

/** Serial for a date; month and day may overflow like DATE() allows. */
export function partsToSerial(y: number, m: number, d: number): number {
  const ms = Date.UTC(y, m - 1, 1) + (d - 1) * MS_PER_DAY
  let serial = Math.round((ms - EPOCH) / MS_PER_DAY)
  if (serial <= 60) serial -= 1
  if (y === 1900 && m === 2 && d === 29) return 60
  return serial
}

export function timeToFraction(h: number, mi: number, s: number) {
  return (h * 3600 + mi * 60 + s) / 86400
}

export function jsDateToSerial(date: Date): number {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds())
  return (local - EPOCH) / MS_PER_DAY
}

export function serialToJsDate(serial: number): Date {
  const p = serialToParts(serial)
  const frac = serial - Math.floor(serial)
  const secs = Math.round(frac * 86400)
  return new Date(p.y, p.m - 1, p.d, Math.floor(secs / 3600), Math.floor(secs / 60) % 60, secs % 60)
}

export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
export const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

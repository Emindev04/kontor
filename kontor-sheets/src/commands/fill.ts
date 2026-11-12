// AutoFill (the fill handle), Fill Down/Right/Up/Left and the Series dialog.
import { MAX_COLS, MAX_ROWS, cellKey, type Range } from '../model/address'
import { DAYS, MONTHS, daysInMonth, partsToSerial, serialToParts } from '../model/dates'
import { isDateFormat } from '../model/numfmt'
import type { CellData } from '../model/sheet'
import type { Scalar } from '../model/types'
import { shiftFormula } from '../engine/refs'
import type { Doc } from './doc'
import { blocked } from './review'

export type FillMode = 'auto' | 'copy' | 'series' | 'formats' | 'noFormats'

const LISTS: string[][] = [
  DAYS.map((d) => d.slice(0, 3)),
  DAYS,
  MONTHS.map((m) => m.slice(0, 3)),
  MONTHS,
]

type Content = Pick<CellData, 'v' | 'f'>

function applyCase(sample: string, word: string) {
  if (sample === sample.toUpperCase()) return word.toUpperCase()
  if (sample === sample.toLowerCase()) return word.toLowerCase()
  return word
}

function regression(vals: number[]) {
  const n = vals.length
  const mx = (n - 1) / 2
  const my = vals.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  vals.forEach((v, i) => {
    sxy += (i - mx) * (v - my)
    sxx += (i - mx) ** 2
  })
  const slope = sxx ? sxy / sxx : 0
  return { slope, intercept: my - slope * mx }
}

function addMonths(serial: number, months: number): number {
  const p = serialToParts(serial)
  const total = p.y * 12 + (p.m - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return partsToSerial(y, m, Math.min(p.d, daysInMonth(y, m))) + (serial - Math.floor(serial))
}

/**
 * Returns a generator for position `k` (0 = first source cell; may be negative or beyond the source)
 * or null when the line should simply be copied.
 */
export function seriesGenerator(cells: (CellData | undefined)[], fmts: (string | undefined)[], mode: FillMode): ((k: number) => Content) | null {
  const n = cells.length
  if (mode === 'copy' || mode === 'formats') return null
  if (cells.some((d) => d?.f !== undefined)) return null
  const vals = cells.map((d) => (d?.v === undefined ? null : d.v)) as Scalar[]
  if (vals.some((v) => v === null)) {
    // blanks in the source: every position continues on its own (Jan, –, Feb, –, Mar …)
    if (vals.every((v) => v === null)) return null
    const gens = cells.map((d, i) => (d?.v === undefined || d.v === null ? null : seriesGenerator([d], [fmts[i]], mode)))
    if (gens.every((g) => g === null)) return null
    return (k) => {
      const i = ((k % n) + n) % n
      const g = gens[i]
      if (!g) return cells[i]?.v === undefined ? {} : { v: cells[i]!.v }
      return g(Math.floor(k / n))
    }
  }
  const asSeries = mode === 'series'
  // numbers and dates
  if (vals.every((v) => typeof v === 'number')) {
    const nums = vals as number[]
    const dates = fmts.every((f) => isDateFormat(f))
    if (n === 1) {
      if (!asSeries && !dates) return null
      return (k) => ({ v: nums[0] + k })
    }
    if (dates && nums.every(Number.isInteger)) {
      const parts = nums.map(serialToParts)
      const sameDay = parts.every((p) => p.d === parts[0].d)
      const monthDiffs = parts.slice(1).map((p, i) => (p.y - parts[i].y) * 12 + (p.m - parts[i].m))
      if (sameDay && monthDiffs.every((d) => d === monthDiffs[0]) && monthDiffs[0] !== 0 && (nums[1] - nums[0]) % 1 === 0 && Math.abs(nums[1] - nums[0]) >= 28) {
        const step = monthDiffs[0]
        return (k) => ({ v: addMonths(nums[0], step * k) })
      }
    }
    const { slope, intercept } = regression(nums)
    return (k) => ({ v: Number((intercept + slope * k).toPrecision(15)) })
  }
  if (vals.every((v) => typeof v === 'string')) {
    const strs = vals as string[]
    // custom lists (weekdays, months)
    for (const list of LISTS) {
      const idx = strs.map((s) => list.findIndex((x) => x.toLowerCase() === s.toLowerCase()))
      if (idx.every((i) => i >= 0)) {
        const step = n === 1 ? 1 : idx[1] - idx[0]
        if (n > 2 && idx.slice(1).some((x, i) => (x - idx[i] + list.length) % list.length !== (step + list.length) % list.length)) break
        return (k) => {
          const i = (((idx[0] + step * k) % list.length) + list.length) % list.length
          return { v: applyCase(strs[0], list[i]) }
        }
      }
    }
    // text with a number: "Item 1", "Q1", "1st"
    const parts = strs.map((s) => /^(.*?)(\d+)(\D*)$/.exec(s))
    if (parts.every((m) => m && m[1] === parts[0]![1] && m[3] === parts[0]![3])) {
      const nums = parts.map((m) => Number(m![2]))
      const width = parts[0]![2].length
      const pad = parts[0]![2].startsWith('0') ? width : 0
      const prefix = parts[0]![1]
      const suffix = parts[0]![3]
      const step = n === 1 ? 1 : regression(nums).slope
      const start = n === 1 ? nums[0] : regression(nums).intercept
      return (k) => {
        const x = Math.round(start + step * k)
        return { v: `${prefix}${String(Math.abs(x)).padStart(pad, '0')}${suffix}` }
      }
    }
  }
  return null
}

/** Fills from `src` into `dst` (which extends `src` in one direction). */
export function fillRange(doc: Doc, src: Range, dst: Range, mode: FillMode = 'auto') {
  if (blocked(doc, 'cells')) return
  const sheet = doc.sheet
  const vertical = dst.r1 !== src.r1 || dst.r2 !== src.r2
  const styles = doc.wb.styles
  // shrinking: dragging the handle back into the selection clears
  if (dst.r2 < src.r2 || dst.c2 < src.c2) {
    const clear: Range = vertical ? { r1: dst.r2 + 1, r2: src.r2, c1: src.c1, c2: src.c2 } : { r1: src.r1, r2: src.r2, c1: dst.c2 + 1, c2: src.c2 }
    doc.clear('contents', [clear])
    doc.selectRange(dst)
    return
  }
  doc.transact('AutoFill', () => {
    const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1
    const len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1
    for (let li = 0; li < lines; li++) {
      const at = (k: number) => (vertical ? { r: src.r1 + k, c: src.c1 + li } : { r: src.r1 + li, c: src.c1 + k })
      const cells: (CellData | undefined)[] = []
      const fmts: (string | undefined)[] = []
      for (let k = 0; k < len; k++) {
        const p = at(k)
        cells.push(sheet.get(p.r, p.c))
        fmts.push(styles.get(sheet.styleId(p.r, p.c)).fmt)
      }
      const gen = seriesGenerator(cells, fmts, mode)
      const from = vertical ? dst.r1 - src.r1 : dst.c1 - src.c1
      const to = vertical ? dst.r2 - src.r1 : dst.c2 - src.c1
      for (let k = from; k <= to; k++) {
        if (k >= 0 && k < len) continue
        const p = at(k)
        if (p.r < 0 || p.c < 0 || p.r >= MAX_ROWS || p.c >= MAX_COLS) continue
        const i = ((k % len) + len) % len
        const srcCell = cells[i]
        const dest = sheet.get(p.r, p.c)
        let content: Content
        if (mode === 'formats') content = { v: dest?.v, f: dest?.f }
        else if (gen) content = gen(k)
        else if (srcCell?.f !== undefined) content = { f: shiftFormula(srcCell.f, vertical ? k - i : 0, vertical ? 0 : k - i) }
        else content = { v: srcCell?.v }
        const s = mode === 'noFormats' ? dest?.s : srcCell?.s ?? (sheet.styleId(at(i).r, at(i).c) || undefined)
        const data: CellData = { ...content, s }
        if (data.v === undefined) delete data.v
        if (data.f === undefined) delete data.f
        doc.write(sheet, p.r, p.c, data.v === undefined && data.f === undefined && !data.s ? undefined : data)
      }
    }
  })
  doc.selectRange(dst, doc.sel.active)
}

/** Ctrl+D / Ctrl+R and the Fill Up/Left commands. */
export function fillDirection(doc: Doc, dir: 'down' | 'right' | 'up' | 'left') {
  for (const rg0 of doc.sel.ranges) {
    const rg = doc.boundToUsed(rg0)
    let src: Range
    let dst: Range = rg
    if (dir === 'down') {
      if (rg.r1 === rg.r2) {
        if (rg.r1 === 0) continue
        src = { ...rg, r1: rg.r1 - 1, r2: rg.r1 - 1 }
        dst = { ...rg, r1: rg.r1 - 1 }
      } else src = { ...rg, r2: rg.r1 }
    } else if (dir === 'right') {
      if (rg.c1 === rg.c2) {
        if (rg.c1 === 0) continue
        src = { ...rg, c1: rg.c1 - 1, c2: rg.c1 - 1 }
        dst = { ...rg, c1: rg.c1 - 1 }
      } else src = { ...rg, c2: rg.c1 }
    } else if (dir === 'up') {
      if (rg.r1 === rg.r2) continue
      src = { ...rg, r1: rg.r2 }
    } else {
      if (rg.c1 === rg.c2) continue
      src = { ...rg, c1: rg.c2 }
    }
    fillRange(doc, src, dst, 'copy')
  }
  doc.selectRange(doc.activeRange, doc.sel.active)
}

export type SeriesOptions = {
  byRows: boolean
  type: 'linear' | 'growth' | 'date' | 'autofill'
  unit: 'day' | 'weekday' | 'month' | 'year'
  step: number
  stop?: number
}

/** Home → Fill → Series… */
export function fillSeries(doc: Doc, o: SeriesOptions) {
  const rg = doc.activeRange
  const sheet = doc.sheet
  if (o.type === 'autofill') {
    const src = o.byRows ? { ...rg, c2: rg.c1 } : { ...rg, r2: rg.r1 }
    fillRange(doc, src, rg, 'auto')
    return
  }
  doc.transact('Series', () => {
    const lines = o.byRows ? rg.r2 - rg.r1 + 1 : rg.c2 - rg.c1 + 1
    const len = o.byRows ? rg.c2 - rg.c1 + 1 : rg.r2 - rg.r1 + 1
    for (let li = 0; li < lines; li++) {
      const at = (k: number) => (o.byRows ? { r: rg.r1 + li, c: rg.c1 + k } : { r: rg.r1 + k, c: rg.c1 + li })
      const first = sheet.get(at(0).r, at(0).c)
      if (typeof first?.v !== 'number') continue
      let v = first.v
      for (let k = 1; k < len; k++) {
        if (o.type === 'linear') v += o.step
        else if (o.type === 'growth') v *= o.step
        else if (o.unit === 'day') v += o.step
        else if (o.unit === 'month') v = addMonths(v, o.step)
        else if (o.unit === 'year') v = addMonths(v, 12 * o.step)
        else {
          let left = o.step
          while (left > 0) {
            v += 1
            const wd = serialToParts(v).wd
            if (wd !== 0 && wd !== 6) left--
          }
        }
        if (o.stop !== undefined && (o.step >= 0 ? v > o.stop : v < o.stop)) break
        const p = at(k)
        const old = sheet.get(p.r, p.c)
        doc.write(sheet, p.r, p.c, { v: Number(v.toPrecision(15)), s: old?.s ?? first.s })
      }
    }
  })
}

void cellKey

// Text to Columns, step 3: the data format of each column (General, Text, Date in a given order, or skip).
import { partsToSerial } from '../model/dates'
import { parseInput } from '../model/parseInput'
import type { Scalar } from '../model/types'

export type ColumnFormat = 'general' | 'text' | 'skip' | 'MDY' | 'DMY' | 'YMD' | 'MYD' | 'DYM' | 'YDM'

export const DATE_ORDERS: ColumnFormat[] = ['MDY', 'DMY', 'YMD', 'MYD', 'DYM', 'YDM']

/** Converts one split part for its column format: the value and the number format to give the cell. */
export function convertPart(part: string, format: ColumnFormat): { v: Scalar; fmt?: string } {
  if (format === 'text') return { v: part, fmt: '@' }
  if (DATE_ORDERS.includes(format)) {
    const nums = part.match(/\d+/g)?.map(Number)
    if (nums && nums.length >= 3) {
      const at = (ch: string) => nums[format.indexOf(ch)]
      let y = at('Y')
      if (y < 100) y += y < 30 ? 2000 : 1900
      const m = at('M')
      const d = at('D')
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { v: partsToSerial(y, m, d), fmt: 'm/d/yyyy' }
    }
    return { v: part }
  }
  const p = parseInput(part)
  if (p.kind === 'value') return { v: p.v ?? null, fmt: p.fmt }
  return { v: part }
}

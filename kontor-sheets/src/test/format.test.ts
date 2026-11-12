import { describe, expect, it } from 'vitest'
import { BUILTIN_FORMATS, adjustDecimals, formatValue, generalNumber, numberToText } from '../model/numfmt'
import { parseInput } from '../model/parseInput'

const f = (v: number | string, code: string) => formatValue(v, code).text

describe('number formats', () => {
  it('formats numbers', () => {
    expect(f(1234.567, '#,##0.00')).toBe('1,234.57')
    expect(f(-1234.5, '#,##0.00')).toBe('-1,234.50')
    expect(f(0.5, '0%')).toBe('50%')
    expect(f(0.1234, '0.00%')).toBe('12.34%')
    expect(f(5, '000')).toBe('005')
    expect(f(1234567, '#,##0,')).toBe('1,235')
    expect(f(12345.678, '0.00E+00')).toBe('1.23E+04')
    expect(f(1.5, '# ?/?')).toBe('1 1/2')
    expect(f(0.333333, '# ??/??')).toBe('  1/3 ')
    expect(f(-5, '#,##0_);(#,##0)')).toBe('(5)')
    expect(f(5551234567, '(000) 000-0000')).toBe('(555) 123-4567')
    expect(f(3.1, '0.0#')).toBe('3.1')
    expect(f(0.5, '#.00')).toBe('.50')
  })
  it('formats currency and accounting', () => {
    expect(f(1234.5, BUILTIN_FORMATS.currency)).toBe('$1,234.50')
    const acc = formatValue(1234.5, BUILTIN_FORMATS.accounting)
    expect(acc.fill?.left.trim()).toBe('$')
    expect(acc.fill?.right.trim()).toBe('1,234.50')
    expect(formatValue(0, BUILTIN_FORMATS.accounting).text.replace(/\s/g, '')).toBe('$-')
    expect(formatValue(-3, BUILTIN_FORMATS.accounting).text.replace(/[\s ]/g, '')).toBe('$(3.00)')
  })
  it('formats dates and times', () => {
    expect(f(45351, 'm/d/yyyy')).toBe('2/29/2024')
    expect(f(45351, 'dddd, mmmm d, yyyy')).toBe('Thursday, February 29, 2024')
    expect(f(45351.75, 'h:mm AM/PM')).toBe('6:00 PM')
    expect(f(1.5, '[h]:mm')).toBe('36:00')
    expect(f(0.000694444, 'mm:ss')).toBe('01:00')
    expect(f(45351, 'mmm-yy')).toBe('Feb-24')
  })
  it('applies sections and colors', () => {
    expect(formatValue(-1, '0;[Red]-0').color).toBe('#FF0000')
    expect(f(0, '0;-0;"zero"')).toBe('zero')
    expect(f('abc', '0;0;0;"txt: "@')).toBe('txt: abc')
    expect(f(150, '[>100]"big";"small"')).toBe('big')
  })
  it('general format', () => {
    expect(generalNumber(1 / 3)).toBe('0.333333333')
    expect(generalNumber(123456789012)).toBe('1.23457E+11')
    expect(generalNumber(0.1 + 0.2)).toBe('0.3')
    expect(numberToText(1 / 3)).toBe('0.333333333333333')
    expect(numberToText(1e20)).toBe('1E+20')
  })
  it('changes decimals', () => {
    expect(adjustDecimals('0.00', 1, 1)).toBe('0.000')
    expect(adjustDecimals('0.00', -1, 1)).toBe('0.0')
    expect(adjustDecimals(undefined, 1, 1.5)).toBe('0.00')
  })
})

describe('input parsing', () => {
  it('recognizes values', () => {
    expect(parseInput('1,234.5')).toEqual({ kind: 'value', v: 1234.5, fmt: '#,##0.00' })
    expect(parseInput('$12')).toEqual({ kind: 'value', v: 12, fmt: '"$"#,##0' })
    expect(parseInput('15%')).toEqual({ kind: 'value', v: 0.15, fmt: '0%' })
    expect(parseInput('(5)')).toEqual({ kind: 'value', v: -5, fmt: undefined })
    expect(parseInput('2/29/2024')).toEqual({ kind: 'value', v: 45351, fmt: 'm/d/yyyy' })
    expect(parseInput('13:30').kind).toBe('value')
    expect(parseInput('true')).toEqual({ kind: 'value', v: true })
    expect(parseInput("'123")).toEqual({ kind: 'value', v: '123' })
    expect(parseInput('=A1')).toEqual({ kind: 'formula', f: 'A1' })
    expect(parseInput('1 1/2')).toEqual({ kind: 'value', v: 1.5, fmt: '# ?/?' })
    expect(parseInput('hello').kind).toBe('value')
  })
})

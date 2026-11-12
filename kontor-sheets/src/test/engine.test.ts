import { describe, expect, it } from 'vitest'
import { cellKey, parseCell } from '../model/address'
import { parseInput } from '../model/parseInput'
import { CellError } from '../model/types'
import { Workbook } from '../model/workbook'
import { Engine } from '../engine/engine'
import { adjustFormula, shiftFormula, cycleAbsolute } from '../engine/refs'

function book(cells: Record<string, string>, sheetName?: string) {
  const wb = new Workbook()
  if (sheetName) wb.sheets[0].name = sheetName
  const engine = new Engine(wb)
  const set = (ref: string, text: string, sheet = wb.sheets[0]) => {
    const c = parseCell(ref)!
    const p = parseInput(text)
    const key = cellKey(c.r, c.c)
    sheet.setRaw(key, p.kind === 'formula' ? { f: p.f } : { v: p.v })
    engine.cellsChanged(sheet, [key])
    engine.recalc()
  }
  for (const [k, v] of Object.entries(cells)) set(k, v)
  const get = (ref: string, sheet = wb.sheets[0]) => {
    const c = parseCell(ref)!
    const v = engine.display(sheet, c.r, c.c)
    return v instanceof CellError ? v.code : v
  }
  return { wb, engine, set, get }
}

const calc = (formula: string, cells: Record<string, string> = {}) => {
  const b = book({ ...cells, Z1: formula })
  return b.get('Z1')
}

describe('operators', () => {
  it('follows precedence', () => {
    expect(calc('=1+2*3')).toBe(7)
    expect(calc('=-2^2')).toBe(4)
    expect(calc('=2^3^2')).toBe(64)
    expect(calc('=10%')).toBe(0.1)
    expect(calc('=0.1+0.2')).toBe(0.3)
    expect(calc('="a"&1&TRUE')).toBe('a1TRUE')
    expect(calc('=1/0')).toBe('#DIV/0!')
    expect(calc('="a"="A"')).toBe(true)
    expect(calc('=2<"a"')).toBe(true)
  })
  it('handles references and ranges', () => {
    expect(calc('=A1+A2', { A1: '2', A2: '3' })).toBe(5)
    expect(calc('=SUM(A1:A3)', { A1: '1', A2: '2', A3: '3' })).toBe(6)
    expect(calc('=SUM(A:A)', { A1: '1', A5: '4' })).toBe(5)
    expect(calc('=SUM(A1:B2 B1:C3)', { B1: '5', B2: '7' })).toBe(12)
    expect(calc('=SUM((A1,A3))', { A1: '1', A2: '10', A3: '3' })).toBe(4)
    expect(calc('=A1', {})).toBe(0)
  })
})

describe('functions', () => {
  it('math and statistics', () => {
    expect(calc('=ROUND(2.345,2)')).toBe(2.35)
    expect(calc('=ROUND(-2.5,0)')).toBe(-3)
    expect(calc('=ROUNDDOWN(3.99,0)')).toBe(3)
    expect(calc('=MOD(-3,2)')).toBe(1)
    expect(calc('=AVERAGE(1,2,3,4)')).toBe(2.5)
    expect(calc('=MEDIAN(5,1,3)')).toBe(3)
    expect(calc('=STDEV.S(2,4,4,4,5,5,7,9)')).toBeCloseTo(2.138089935, 8)
    expect(calc('=SUMPRODUCT({1,2,3},{4,5,6})')).toBe(32)
    expect(calc('=COUNTIF(A1:A4,">2")', { A1: '1', A2: '3', A3: '5', A4: 'x' })).toBe(2)
    expect(calc('=SUMIFS(B1:B3,A1:A3,"a*")', { A1: 'apple', A2: 'banana', A3: 'avocado', B1: '1', B2: '2', B3: '3' })).toBe(4)
    expect(calc('=NORM.S.INV(0.975)')).toBeCloseTo(1.959963985, 8)
    expect(calc('=NORM.DIST(1,0,1,TRUE)')).toBeCloseTo(0.841344746, 8)
    expect(calc('=T.DIST.2T(2,10)')).toBeCloseTo(0.07338803, 6)
    expect(calc('=SUBTOTAL(9,A1:A3)', { A1: '1', A2: '2', A3: '3' })).toBe(6)
  })
  it('text', () => {
    expect(calc('=LEFT("Hello",2)')).toBe('He')
    expect(calc('=MID("Hello",2,3)')).toBe('ell')
    expect(calc('=PROPER("hello wORLD")')).toBe('Hello World')
    expect(calc('=TEXT(1234.5,"#,##0.00")')).toBe('1,234.50')
    expect(calc('=TEXT(45000,"mmm d, yyyy")')).toBe('Mar 15, 2023')
    expect(calc('=TEXTJOIN(", ",TRUE,"a","","b")')).toBe('a, b')
    expect(calc('=SUBSTITUTE("a-b-c","-","+",2)')).toBe('a-b+c')
    expect(calc('=SEARCH("l*o","Hello")')).toBe(3)
    expect(calc('=TEXTBEFORE("a.b.c",".",-1)')).toBe('a.b')
    expect(calc('=VALUE("$1,000")')).toBe(1000)
  })
  it('logical and LET/LAMBDA', () => {
    expect(calc('=IF(1>2,"y","n")')).toBe('n')
    expect(calc('=IFERROR(1/0,"bad")')).toBe('bad')
    expect(calc('=IFS(FALSE,1,TRUE,2)')).toBe(2)
    expect(calc('=SWITCH(2,1,"a",2,"b","c")')).toBe('b')
    expect(calc('=LET(x,2,y,3,x*y)')).toBe(6)
    expect(calc('=LAMBDA(a,b,a+b)(2,5)')).toBe(7)
    expect(calc('=REDUCE(0,{1,2,3},LAMBDA(a,v,a+v))')).toBe(6)
  })
  it('lookup', () => {
    const cells = { A1: 'a', A2: 'b', A3: 'c', B1: '1', B2: '2', B3: '3' }
    expect(calc('=VLOOKUP("b",A1:B3,2,FALSE)', cells)).toBe(2)
    expect(calc('=INDEX(B1:B3,MATCH("c",A1:A3,0))', cells)).toBe(3)
    expect(calc('=XLOOKUP("z",A1:A3,B1:B3,"none")', cells)).toBe('none')
    expect(calc('=SUM(OFFSET(B1,1,0,2,1))', cells)).toBe(5)
    expect(calc('=INDIRECT("B"&2)', cells)).toBe(2)
    expect(calc('=MATCH(2.5,B1:B3,1)', cells)).toBe(2)
  })
  it('dates and finance', () => {
    expect(calc('=DATE(2024,2,29)')).toBe(45351)
    expect(calc('=YEAR(45351)')).toBe(2024)
    expect(calc('=EOMONTH(DATE(2024,1,15),1)')).toBe(45351)
    expect(calc('=WEEKDAY(DATE(2024,1,1))')).toBe(2)
    expect(calc('=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,31))')).toBe(23)
    expect(calc('=DATEDIF(DATE(2020,1,15),DATE(2024,3,1),"Y")')).toBe(4)
    expect(calc('=PMT(0.05/12,360,200000)')).toBeCloseTo(-1073.643246, 5)
    expect(calc('=IRR({-100,30,40,50})')).toBeCloseTo(0.0889633947, 8)
    expect(calc('=RATE(360,-1073.64,200000)*12')).toBeCloseTo(0.05, 6)
  })
})

describe('dynamic arrays', () => {
  it('spills and blocks', () => {
    const b = book({ A1: '=SEQUENCE(3)' })
    expect(b.get('A1')).toBe(1)
    expect(b.get('A3')).toBe(3)
    b.set('A2', 'x')
    expect(b.get('A1')).toBe('#SPILL!')
    b.set('A2', '')
    expect(b.get('A2')).toBe(2)
    b.set('C1', '=SUM(A1#)')
    expect(b.get('C1')).toBe(6)
  })
  it('filters, sorts and uniques', () => {
    const b = book({ A1: '3', A2: '1', A3: '3', A4: '2', C1: '=SORT(UNIQUE(A1:A4))', D1: '=ROWS(FILTER(A1:A4,A1:A4>1))' })
    expect([b.get('C1'), b.get('C2'), b.get('C3')]).toEqual([1, 2, 3])
    expect(b.get('D1')).toBe(3)
  })
})

describe('recalculation', () => {
  it('updates dependents and detects cycles', () => {
    const b = book({ A1: '1', A2: '=A1*2', A3: '=A2+1' })
    expect(b.get('A3')).toBe(3)
    b.set('A1', '5')
    expect(b.get('A3')).toBe(11)
    b.set('A1', '=A3')
    expect(b.engine.circular.size).toBeGreaterThan(0)
  })
  it('handles long chains', () => {
    const wb = new Workbook()
    const engine = new Engine(wb)
    const s = wb.sheets[0]
    s.setRaw(cellKey(0, 0), { v: 1 })
    for (let r = 1; r < 5000; r++) s.setRaw(cellKey(r, 0), { f: `A${r}+1` })
    engine.rebuild()
    expect(engine.display(s, 4999, 0)).toBe(5000)
  })
})

describe('reference rewriting', () => {
  it('shifts relative references', () => {
    expect(shiftFormula('A1+$B$2+C$3+$D4', 1, 1)).toBe('B2+$B$2+D$3+$D5')
    expect(shiftFormula('A1', -1, 0)).toBe('#REF!')
    expect(shiftFormula('SUM(A:A)', 3, 1)).toBe('SUM(B:B)')
  })
  it('adjusts for inserted and deleted rows', () => {
    expect(adjustFormula('SUM(A1:A10)', 'Sheet1', 'Sheet1', 'row', 4, 2)).toBe('SUM(A1:A12)')
    expect(adjustFormula('A5', 'Sheet1', 'Sheet1', 'row', 4, -1)).toBe('#REF!')
    expect(adjustFormula('SUM(A1:A10)', 'Sheet1', 'Sheet1', 'row', 2, -3)).toBe('SUM(A1:A7)')
    expect(adjustFormula('Sheet2!A5', 'Sheet1', 'Sheet1', 'row', 0, 1)).toBe('Sheet2!A5')
  })
  it('cycles absolute markers', () => {
    expect(cycleAbsolute('=A1', 2)?.text).toBe('=$A$1')
    expect(cycleAbsolute('=$A$1', 2)?.text).toBe('=A$1')
  })
})

import { seriesGenerator } from '../commands/fill'
describe('autofill series', () => {
  const gen = (vals: (number | string)[], fmts: (string | undefined)[] = []) => seriesGenerator(vals.map((v) => ({ v })), vals.map((_, i) => fmts[i]), 'auto')
  it('extends numbers, dates, lists and text with numbers', () => {
    expect(gen([1, 3])!(2).v).toBe(5)
    expect(gen([5])).toBeNull()
    expect(gen([45351], ['m/d/yyyy'])!(1).v).toBe(45352)
    expect(gen(['Mon'])!(1).v).toBe('Tue')
    expect(gen(['January', 'March'])!(2).v).toBe('May')
    expect(gen(['Item 1'])!(2).v).toBe('Item 3')
    expect(gen(['Q1', 'Q2'])!(3).v).toBe('Q4')
    expect(gen([45322, 45351], ['m/d/yyyy', 'm/d/yyyy'])).not.toBeNull()
  })
})

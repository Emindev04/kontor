// Function results checked against the documented behaviour of the original spreadsheet program.
import { describe, expect, it } from 'vitest'
import { cellKey, parseCell } from '../model/address'
import { parseInput } from '../model/parseInput'
import { CellError } from '../model/types'
import { Workbook } from '../model/workbook'
import { Engine } from '../engine/engine'

function book(cells: Record<string, string>) {
  const wb = new Workbook()
  const engine = new Engine(wb)
  const sheet = wb.sheets[0]
  for (const [ref, text] of Object.entries(cells)) {
    const c = parseCell(ref)!
    const p = parseInput(text)
    sheet.setRaw(cellKey(c.r, c.c), p.kind === 'formula' ? { f: p.f } : { v: p.v })
  }
  engine.rebuild()
  const get = (ref: string) => {
    const c = parseCell(ref)!
    const v = engine.display(sheet, c.r, c.c)
    return v instanceof CellError ? v.code : v
  }
  return { wb, engine, get }
}

const calc = (formula: string, cells: Record<string, string> = {}) => book({ ...cells, Z1: formula }).get('Z1')
const near = (formula: string, expected: number, digits = 6, cells: Record<string, string> = {}) => {
  const v = calc(formula, cells)
  expect(typeof v, `${formula} → ${String(v)}`).toBe('number')
  expect(v as number).toBeCloseTo(expected, digits)
}
const table = (rows: [string, string | number | boolean | null][]) => rows.forEach(([f, want]) => expect(calc(f), f).toBe(want))

describe('rounding and integer math', () => {
  it('rounds half away from zero on the 15-digit value', () => {
    table([
      ['=ROUND(2.5,0)', 3],
      ['=ROUND(-2.5,0)', -3],
      ['=ROUND(1.005,2)', 1.01],
      ['=ROUND(2.675,2)', 2.68],
      ['=ROUND(1234.567,-2)', 1200],
      ['=ROUNDUP(-3.14159,1)', -3.2],
      ['=ROUNDDOWN(-3.14159,1)', -3.1],
      ['=ROUNDUP(0.1+0.2,1)', 0.3],
      ['=MROUND(10,3)', 9],
      ['=MROUND(-10,-3)', -9],
      ['=MROUND(5,-2)', '#NUM!'],
      ['=MROUND(1.3,0.2)', 1.4],
      ['=CEILING(2.5,1)', 3],
      ['=CEILING(-2.5,-2)', -4],
      ['=CEILING(-2.5,2)', -2],
      ['=CEILING(1.5,0)', 0],
      ['=FLOOR(-2.5,-2)', -2],
      ['=FLOOR(2.5,-2)', '#NUM!'],
      ['=FLOOR(-2.5,2)', -4],
      ['=CEILING.MATH(-5.5,2,-1)', -6],
      ['=CEILING.MATH(-5.5,2)', -4],
      ['=FLOOR.MATH(-5.5,2,-1)', -4],
      ['=FLOOR.MATH(-5.5,2)', -6],
      ['=EVEN(-1)', -2],
      ['=ODD(1.5)', 3],
      ['=ODD(0)', 1],
      ['=TRUNC(-8.9)', -8],
      ['=INT(-8.9)', -9],
      ['=TRUNC(3.14159,2)', 3.14],
    ])
  })
  it('MOD and QUOTIENT keep the sign rules', () => {
    table([
      ['=MOD(3,2)', 1],
      ['=MOD(-3,2)', 1],
      ['=MOD(3,-2)', -1],
      ['=MOD(-3,-2)', -1],
      ['=MOD(5.5,2)', 1.5],
      ['=MOD(1,0)', '#DIV/0!'],
      ['=QUOTIENT(-10,3)', -3],
      ['=QUOTIENT(5,0)', '#DIV/0!'],
    ])
  })
  it('combinatorics', () => {
    table([
      ['=COMBIN(8,2)', 28],
      ['=PERMUT(100,3)', 970200],
      ['=FACT(5)', 120],
      ['=FACT(-1)', '#NUM!'],
      ['=FACTDOUBLE(7)', 105],
      ['=GCD(24,36)', 12],
      ['=LCM(5,2)', 10],
      ['=MULTINOMIAL(2,3,4)', 1260],
      ['=COMBINA(4,3)', 20],
    ])
  })
  it('arithmetic coercion', () => {
    table([
      ['="1"+1', 2],
      ['=TRUE+1', 2],
      ['="a"*1', '#VALUE!'],
      ['=SUM(1,"a")', '#VALUE!'],
      ['=SUM(1,"2",TRUE)', 4],
      ['=1-0.9', 0.1],
      ['=0.1*3=0.3', true],
      ['=1="1"', false],
      ['="a"<"B"', true],
      ['=(-8)^(1/3)', -2],
    ])
  })
})

describe('text formatting', () => {
  it('TEXT format codes', () => {
    table([
      ['=TEXT(1234.567,"#,##0.00")', '1,234.57'],
      ['=TEXT(0.285,"0.0%")', '28.5%'],
      ['=TEXT(DATE(2024,3,5),"dddd, mmmm d, yyyy")', 'Tuesday, March 5, 2024'],
      ['=TEXT(DATE(2024,3,5),"mm/dd/yy")', '03/05/24'],
      ['=TEXT(DATE(2024,1,1),"mmm")', 'Jan'],
      ['=TEXT(DATE(2024,1,1),"mmmmm")', 'J'],
      ['=TEXT(0.75,"h:mm AM/PM")', '6:00 PM'],
      ['=TEXT(0.5,"hh:mm:ss")', '12:00:00'],
      ['=TEXT(1.5,"[h]:mm")', '36:00'],
      ['=TEXT(-5,"0;(0)")', '(5)'],
      ['=TEXT(1.5,"# ?/?")', '1 1/2'],
      ['=TEXT(12345,"0.00E+00")', '1.23E+04'],
      ['=TEXT(5,"000")', '005'],
      ['=TEXT(1234567,"#,##0,")', '1,235'],
      ['=TEXT(0,"0.00;-0.00;""zero""")', 'zero'],
      ['=TEXT(3.14159,"$#,##0.00")', '$3.14'],
      ['=TEXT(DATE(2024,3,5)+TIME(14,5,9),"yyyy-mm-dd hh:mm:ss")', '2024-03-05 14:05:09'],
      ['=TEXT(TIME(9,5,0),"h:mm")', '9:05'],
      ['=TEXT(2.5,"0")', '3'],
      ['=TEXT(-2.5,"0")', '-3'],
      ['=TEXT("abc","@")', 'abc'],
      ['=TEXT(44927,"d-mmm-yy")', '1-Jan-23'],
    ])
  })
  it('string functions', () => {
    table([
      ['=LEFT("abc",5)', 'abc'],
      ['=MID("abc",0,1)', '#VALUE!'],
      ['=MID("abc",5,1)', ''],
      ['=FIND("b","abcb",3)', 4],
      ['=FIND("B","abc")', '#VALUE!'],
      ['=SEARCH("B?","abc")', 2],
      ['=SEARCH("~*","a*b")', 2],
      ['=SUBSTITUTE("aaa","a","b",2)', 'aba'],
      ['=REPLACE("abcdef",2,3,"X")', 'aXef'],
      ['=PROPER("hello wORLD 2nd")', 'Hello World 2Nd'],
      ['=VALUE("1,234.5")', 1234.5],
      ['=VALUE("50%")', 0.5],
      ['=VALUE("abc")', '#VALUE!'],
      ['=NUMBERVALUE("1.234,5",",",".")', 1234.5],
      ['=FIXED(1234.567,1)', '1,234.6'],
      ['=FIXED(1234.567,-1,TRUE)', '1230'],
      ['=DOLLAR(1234.567,2)', '$1,234.57'],
      ['=DOLLAR(-5)', '($5.00)'],
      ['=TRIM("  a   b  ")', 'a b'],
      ['=TEXTAFTER("a-b-c","-",-1)', 'c'],
      ['=TEXTBEFORE("a-b-c","-",2)', 'a-b'],
      ['=TEXTBEFORE("abc","x")', '#N/A'],
      ['=CHAR(65)', 'A'],
      ['=CODE("A")', 65],
      ['=UNICODE("€")', 8364],
      ['=REPT("ab",3)', 'ababab'],
      ['=EXACT("a","A")', false],
      ['=LEN("héllo")', 5],
      ['=CONCAT("a",1,TRUE)', 'a1TRUE'],
      ['=T(1)', ''],
      ['=UPPER("abc")', 'ABC'],
      ['=ROMAN(1999)', 'MCMXCIX'],
      ['=ARABIC("MCMXCIX")', 1999],
      ['=BASE(255,16,4)', '00FF'],
      ['=DECIMAL("FF",16)', 255],
      ['=DEC2BIN(-1)', '1111111111'],
      ['=HEX2DEC("FFFFFFFFFF")', -1],
    ])
  })
})

describe('logical and information', () => {
  it('works like the original', () => {
    table([
      ['=XOR(TRUE,TRUE)', false],
      ['=XOR(TRUE,FALSE,TRUE,TRUE)', true],
      ['=NOT(0)', true],
      ['=AND(A1:A2)', '#VALUE!'],
      ['=OR(1,0)', true],
      ['=IFNA(NA(),"x")', 'x'],
      ['=IFERROR(1/0,"x")', 'x'],
      ['=IF(TRUE,,1)', 0],
      ['=ISNUMBER("1")', false],
      ['=N("a")', 0],
      ['=N(TRUE)', 1],
      ['=TYPE({1})', 64],
      ['=TYPE("a")', 2],
      ['=ISBLANK(A1)', true],
      ['=ISERR(NA())', false],
      ['=ISERROR(NA())', true],
      ['=ERROR.TYPE(1/0)', 2],
      ['=ISEVEN(-2)', true],
      ['=ISODD(2.5)', false],
      ['=ISLOGICAL(TRUE)', true],
      ['=ISTEXT("")', true],
    ])
  })
})

describe('dates and times', () => {
  it('serial numbers including the 1900 leap-year bug', () => {
    table([
      ['=DATE(2024,1,1)', 45292],
      ['=DATE(1900,1,1)', 1],
      ['=DATE(1900,2,28)', 59],
      ['=DATE(1900,2,29)', 60],
      ['=DATE(1900,3,1)', 61],
      ['=DAY(60)', 29],
      ['=MONTH(60)', 2],
      ['=WEEKDAY(1)', 1],
      ['=WEEKDAY(61)', 5],
      ['=DATE(99,1,1)', 36161],
      ['=DATE(-1,1,1)', '#NUM!'],
      ['=DATE(2024,14,1)', 45689],
      ['=DATE(2024,1,0)', 45291],
      ['=DATE(2024,-1,1)', 45231],
      ['=YEAR(0)', 1900],
      ['=MONTH(0)', 1],
      ['=DAY(0)', 0],
      ['=EOMONTH(DATE(2024,1,31),1)', 45351],
      ['=EDATE(DATE(2024,1,31),1)', 45351],
      ['=EDATE(DATE(2024,3,31),-1)', 45351],
      ['=DAYS360(DATE(2024,1,31),DATE(2024,3,31))', 60],
      ['=DAYS(DATE(2024,3,1),DATE(2024,2,1))', 29],
      ['=WEEKNUM(DATE(2024,1,1))', 1],
      ['=WEEKNUM(DATE(2024,12,31))', 53],
      ['=WEEKNUM(DATE(2024,1,7),2)', 1],
      ['=ISOWEEKNUM(DATE(2024,12,30))', 1],
      ['=ISOWEEKNUM(DATE(2021,1,3))', 53],
      ['=HOUR(0.75)', 18],
      ['=MINUTE(TIME(1,59,59))', 59],
      ['=SECOND(TIME(1,2,3))', 3],
      ['=TIMEVALUE("6:00 PM")', 0.75],
      ['=DATEVALUE("2024-03-05")', 45356],
      ['=DATEVALUE("3/5/2024")', 45356],
      ['=DATEVALUE("March 5, 2024")', 45356],
      ['=WEEKDAY(DATE(2024,1,1),2)', 1],
      ['=WEEKDAY(DATE(2024,1,1),3)', 0],
    ])
    near('=TIME(25,0,0)', 25 / 24 - 1, 10)
    near('=TIME(12,0,0)', 0.5, 10)
  })
  it('DATEDIF units', () => {
    table([
      ['=DATEDIF(DATE(2020,1,31),DATE(2020,3,1),"m")', 1],
      ['=DATEDIF(DATE(2020,1,31),DATE(2020,3,1),"d")', 30],
      ['=DATEDIF(DATE(2020,1,31),DATE(2020,3,1),"y")', 0],
      ['=DATEDIF(DATE(2019,6,15),DATE(2021,3,10),"ym")', 8],
      ['=DATEDIF(DATE(2019,6,15),DATE(2021,3,10),"yd")', 268],
      ['=DATEDIF(DATE(2019,6,15),DATE(2021,3,10),"md")', 23],
      ['=DATEDIF(DATE(2024,3,1),DATE(2024,2,1),"d")', '#NUM!'],
      ['=DATEDIF(DATE(2024,1,1),DATE(2024,2,1),"x")', '#NUM!'],
    ])
  })
  it('working days', () => {
    table([
      ['=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,31))', 23],
      ['=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,31),DATE(2024,1,15))', 22],
      ['=NETWORKDAYS(DATE(2024,1,31),DATE(2024,1,1))', -23],
      ['=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,31),11)', 27],
      ['=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,31),"0000011")', 23],
      ['=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,31),"1111111")', '#VALUE!'],
      ['=WORKDAY(DATE(2024,1,5),1)', 45299],
      ['=WORKDAY(DATE(2024,1,8),-1)', 45296],
      ['=WORKDAY(DATE(2024,1,5),0)', 45296],
      ['=WORKDAY.INTL(DATE(2024,1,5),1,7)', 45298],
    ])
  })
  it('YEARFRAC bases', () => {
    near('=YEARFRAC(DATE(2024,1,1),DATE(2024,7,1))', 0.5, 10)
    near('=YEARFRAC(DATE(2023,1,1),DATE(2024,1,1),1)', 1, 10)
    near('=YEARFRAC(DATE(2012,1,1),DATE(2012,7,30),1)', 0.57650273, 7)
    near('=YEARFRAC(DATE(2012,1,1),DATE(2012,7,30),2)', 0.58611111, 7)
    near('=YEARFRAC(DATE(2012,1,1),DATE(2012,7,30),3)', 0.57808219, 7)
    near('=YEARFRAC(DATE(2012,1,1),DATE(2012,7,30),4)', 0.58055556, 7)
  })
})

describe('financial', () => {
  it('time value of money', () => {
    near('=PMT(0.08/12,10,10000)', -1037.0320893, 6)
    near('=FV(0.06/12,10,-200,-500,1)', 2581.4033741, 6)
    near('=PV(0.08/12,12*20,500,,0)', -59777.1458511, 5)
    near('=RATE(48,-200,8000)', 0.0077014725, 9)
    near('=NPER(0.12/12,-100,-1000,10000,1)', 59.6738657, 6)
    near('=IPMT(0.1/12,1,36,8000)', -66.6666667, 6)
    near('=PPMT(0.1/12,1,24,2000)', -75.6231860, 6)
    near('=NPV(0.1,-10000,3000,4200,6800)', 1188.4434123, 6)
    near('=CUMIPMT(0.09/12,30*12,125000,13,24,0)', -11135.2321307, 5)
    near('=CUMPRINC(0.09/12,360,125000,13,24,0)', -934.1071234, 6)
    near('=EFFECT(0.0525,4)', 0.0535427, 6)
    near('=NOMINAL(0.053543,4)', 0.0525003, 6)
    near('=FVSCHEDULE(1,{0.09,0.11,0.1})', 1.33089, 6)
    near('=PDURATION(0.025,2000,2200)', 3.8598661, 6)
    near('=RRI(96,10000,11000)', 0.0009933, 6)
  })
  it('IRR and XIRR converge', () => {
    near('=IRR({-70000,12000,15000,18000,21000,26000})', 0.0866309480, 8)
    near('=IRR({-70000,12000,15000,18000,21000})', -0.0212448482, 8)
    near('=IRR({-70000,12000,15000},-0.1)', -0.4435069413, 6)
    near('=IRR({-100,110})', 0.1, 10)
    expect(calc('=IRR({100,110})')).toBe('#NUM!')
    near('=MIRR({-120000,39000,30000,21000,37000,46000},0.1,0.12)', 0.1260941, 6)
    const cells = { A1: '-10000', A2: '2750', A3: '4250', A4: '3250', A5: '2750', B1: '1/1/2008', B2: '3/1/2008', B3: '10/30/2008', B4: '2/15/2009', B5: '4/1/2009' }
    near('=XIRR(A1:A5,B1:B5)', 0.373362535, 7, cells)
    near('=XNPV(0.09,A1:A5,B1:B5)', 2086.6476020, 5, cells)
  })
  it('depreciation', () => {
    near('=SLN(30000,7500,10)', 2250, 8)
    near('=SYD(30000,7500,10,1)', 4090.9090909, 6)
    near('=DB(1000000,100000,6,1,7)', 186083.33, 2)
    near('=DB(1000000,100000,6,7,7)', 15845.10, 1)
    near('=DDB(2400,300,10*365,1)', 1.3150685, 6)
    near('=DDB(2400,300,10,2)', 384, 8)
    near('=VDB(2400,300,10*365,0,1)', 1.3150685, 6)
    near('=VDB(2400,300,10,0,0.875,1.5)', 315, 8)
  })
})

describe('lookup and reference', () => {
  const t = { A1: '1', A2: '3', A3: '5', B1: 'a', B2: 'b', B3: 'c' }
  it('approximate and exact matches', () => {
    expect(calc('=VLOOKUP(4,A1:B3,2)', t)).toBe('b')
    expect(calc('=VLOOKUP(0,A1:B3,2)', t)).toBe('#N/A')
    expect(calc('=VLOOKUP(6,A1:B3,2,TRUE)', t)).toBe('c')
    expect(calc('=VLOOKUP("B",B1:B3,1,FALSE)', t)).toBe('b')
    expect(calc('=VLOOKUP("b*",B1:B3,1,FALSE)', t)).toBe('b')
    expect(calc('=VLOOKUP(1,A1:B3,3,FALSE)', t)).toBe('#REF!')
    expect(calc('=VLOOKUP(1,A1:B3,0,FALSE)', t)).toBe('#VALUE!')
    expect(calc('=HLOOKUP(4,{1,3,5;"a","b","c"},2)')).toBe('b')
    expect(calc('=MATCH(4,{1,3,5},1)')).toBe(2)
    expect(calc('=MATCH(4,{5,3,1},-1)')).toBe(1)
    expect(calc('=MATCH("b?",{"ab","bc"},0)')).toBe(2)
    expect(calc('=MATCH(9,{1,3,5},0)')).toBe('#N/A')
    expect(calc('=LOOKUP(4,{1,3,5},{"a","b","c"})')).toBe('b')
    expect(calc('=LOOKUP(6,{1,3,5;"a","b","c"})')).toBe('c')
  })
  it('XLOOKUP and XMATCH modes', () => {
    expect(calc('=XLOOKUP(4,{1,3,5},{"a","b","c"},"none",-1)')).toBe('b')
    expect(calc('=XLOOKUP(4,{1,3,5},{"a","b","c"},"none",1)')).toBe('c')
    expect(calc('=XLOOKUP(4,{1,3,5},{"a","b","c"},"none",0)')).toBe('none')
    expect(calc('=XLOOKUP(4,{1,3,5},{"a","b","c"})')).toBe('#N/A')
    expect(calc('=XLOOKUP(2,{1,2,2,3},{"a","b","c","d"},,0,-1)')).toBe('c')
    expect(calc('=XLOOKUP("b*",{"apple","banana"},{1,2},,2)')).toBe(2)
    expect(calc('=XLOOKUP(3,{1,3,5},{"a","b","c"},,0,2)')).toBe('b')
    expect(calc('=XLOOKUP(3,{5,3,1},{"a","b","c"},,0,-2)')).toBe('b')
    expect(calc('=XMATCH(4,{1,3,5},1)')).toBe(3)
    expect(calc('=XMATCH(4,{1,3,5},-1)')).toBe(2)
    expect(calc('=XMATCH("?an*",{"apple","banana"},2)')).toBe(2)
  })
  it('INDEX, OFFSET, CHOOSE and arrays', () => {
    expect(calc('=INDEX({1,2;3,4},2,1)')).toBe(3)
    expect(calc('=SUM(INDEX(A1:B3,0,1))', t)).toBe(9)
    expect(calc('=INDEX(A1:A3,4)', t)).toBe('#REF!')
    expect(calc('=ROWS(OFFSET(A1,0,0,2,2))', t)).toBe(2)
    expect(calc('=OFFSET(A1,-1,0)', t)).toBe('#REF!')
    expect(calc('=CHOOSE(2,"a","b")')).toBe('b')
    expect(calc('=CHOOSE(3,"a","b")')).toBe('#VALUE!')
    expect(calc('=COLUMNS(TRANSPOSE(A1:A3))', t)).toBe(3)
    expect(calc('=SUM({1,2,3}*{4,5,6})')).toBe(32)
    expect(calc('=ROWS(FILTER(A1:A3,A1:A3>9))', t)).toBe('#CALC!')
    expect(calc('=FILTER(A1:A3,A1:A3>9,"none")', t)).toBe('none')
    expect(calc('=INDEX(SORT({3;1;2}),1)')).toBe(1)
    expect(calc('=INDEX(SORT({3;1;2},1,-1),1)')).toBe(3)
    expect(calc('=ROWS(UNIQUE({1;1;2}))')).toBe(2)
    expect(calc('=ROWS(UNIQUE({1;1;2},,TRUE))')).toBe(1)
    expect(calc('=SUM(TAKE({1,2,3;4,5,6},1))')).toBe(6)
    expect(calc('=SUM(DROP({1,2,3;4,5,6},1))')).toBe(15)
    expect(calc('=ROWS(VSTACK({1,2},{3,4}))')).toBe(2)
    expect(calc('=COLUMNS(HSTACK({1,2},{3,4}))')).toBe(4)
    expect(calc('=ROWS(TOCOL({1,2;3,4}))')).toBe(4)
    expect(calc('=ROWS(WRAPROWS({1,2,3,4,5},2))')).toBe(3)
    expect(calc('=INDEX(WRAPROWS({1,2,3,4,5},2),3,2)')).toBe('#N/A')
    expect(calc('=SUM(CHOOSECOLS({1,2,3;4,5,6},-1))')).toBe(9)
    expect(calc('=INDEX(SEQUENCE(2,3,10,5),2,3)')).toBe(35)
    expect(calc('=ADDRESS(2,3)')).toBe('$C$2')
    expect(calc('=ADDRESS(2,3,4)')).toBe('C2')
    expect(calc('=ADDRESS(2,3,1,FALSE)')).toBe('R2C3')
    expect(calc('=ADDRESS(1,1,1,TRUE,"My Sheet")')).toBe("'My Sheet'!$A$1")
    expect(calc('=INDIRECT("R1C1",FALSE)', t)).toBe(1)
    expect(calc('=COLUMN(D5)')).toBe(4)
    expect(calc('=ROW()')).toBe(1)
  })
})

describe('conditional aggregation', () => {
  const d = {
    A1: 'apple', A2: 'avocado', A3: 'banana', A4: 'a*b', A5: '',
    B1: '1', B2: '2', B3: '3', B4: '4', B5: '5',
    C1: '5', C2: '10', C3: '', C4: 'x', C5: '7',
  }
  it('criteria strings', () => {
    expect(calc('=SUMIFS(B1:B5,A1:A5,"a*")', d)).toBe(7)
    expect(calc('=SUMIF(A1:A5,"a~*b",B1:B5)', d)).toBe(4)
    expect(calc('=SUMIF(A1:A5,"?????",B1:B5)', d)).toBe(1)
    expect(calc('=COUNTIF(C1:C5,">=5")', d)).toBe(3)
    expect(calc('=COUNTIF(C1:C5,"<>")', d)).toBe(4)
    expect(calc('=COUNTIF(C1:C5,"")', d)).toBe(1)
    expect(calc('=COUNTIF(C1:C5,"=")', d)).toBe(1)
    expect(calc('=COUNTIF(C1:C5,"<>x")', d)).toBe(4)
    expect(calc('=COUNTIF(C1:C5,10)', d)).toBe(1)
    expect(calc('=COUNTIF(C1:C5,"1*")', d)).toBe(0)
    expect(calc('=SUMIF(C1:C5,">5")', d)).toBe(17)
    expect(calc('=AVERAGEIF(C1:C5,">100")', d)).toBe('#DIV/0!')
    expect(calc('=AVERAGEIFS(B1:B5,C1:C5,">=5",A1:A5,"a*")', d)).toBe(1.5)
    expect(calc('=COUNTIFS(A1:A5,"a*",B1:B5,">1")', d)).toBe(2)
    expect(calc('=MAXIFS(B1:B5,A1:A5,"a*")', d)).toBe(4)
    expect(calc('=MINIFS(B1:B5,A1:A5,"b*")', d)).toBe(3)
    expect(calc('=SUMPRODUCT((B1:B5>2)*B1:B5)', d)).toBe(12)
    expect(calc('=SUMPRODUCT(--(A1:A5="apple"))', d)).toBe(1)
    expect(calc('=COUNTBLANK(C1:C5)', d)).toBe(1)
    expect(calc('=COUNTA(C1:C5)', d)).toBe(4)
    expect(calc('=COUNT(C1:C5)', d)).toBe(3)
    expect(calc('=SUMIF(B1:B5,"<"&B3)', d)).toBe(3)
  })
})

describe('statistics', () => {
  it('descriptive', () => {
    near('=STDEV.S(2,4,4,4,5,5,7,9)', 2.138089935, 8)
    near('=STDEV.P(2,4,4,4,5,5,7,9)', 2, 10)
    table([
      ['=MEDIAN(1,2,3,4)', 2.5],
      ['=MODE.SNGL(1,2,2,3)', 2],
      ['=MODE.SNGL(1,2,3)', '#N/A'],
      ['=RANK.EQ(3,{1,3,3,5})', 2],
      ['=RANK.AVG(3,{1,3,3,5})', 2.5],
      ['=RANK.EQ(3,{1,3,3,5},1)', 2],
      ['=LARGE({3,5,3,5,4},3)', 4],
      ['=SMALL({3,5,3,5,4},6)', '#NUM!'],
      ['=AVERAGE(A1:A3)', '#DIV/0!'],
      ['=MAX()', '#VALUE!'],
      ['=MIN(A1:A3)', 0],
    ])
    near('=PERCENTILE.INC({1,2,3,4},0.3)', 1.9, 10)
    near('=PERCENTILE.EXC({1,2,3,4},0.3)', 1.5, 10)
    expect(calc('=PERCENTILE.EXC({1,2,3,4},0.1)')).toBe('#NUM!')
    near('=QUARTILE.INC({1,2,4,7,8,9,10,12},1)', 3.5, 10)
    near('=QUARTILE.EXC({6,7,15,36,39,40,41,42,43,47,49},1)', 15, 10)
    near('=PERCENTRANK.INC({13,12,11,8,4,3,2,1,1,1},2)', 0.333, 3)
    near('=TRIMMEAN({4,5,6,7,2,3,4,5,1,2,3},0.2)', 3.777777778, 8)
    near('=GEOMEAN(4,5,8,7,11,4,3)', 5.476986969, 8)
    near('=HARMEAN(4,5,8,7,11,4,3)', 5.028375962, 8)
    near('=AVEDEV(4,5,6,7,5,4,3)', 1.020408163, 8)
    near('=DEVSQ(4,5,8,7,11,4,3)', 48, 10)
    near('=KURT(3,4,5,2,3,4,5,6,4,7)', -0.151799637, 8)
    near('=SKEW(3,4,5,2,3,4,5,6,4,7)', 0.359543071, 8)
  })
  it('regression', () => {
    const x = '{6,5,11,7,5,4,4}'
    const y = '{2,3,9,1,8,7,5}'
    near(`=SLOPE(${y},${x})`, 0.305555556, 8)
    near('=INTERCEPT({2,3,9,1,8},{6,5,11,7,5})', 0.048387097, 8)
    near(`=INTERCEPT(${y},${x})`, 3.166666667, 8)
    near('=FORECAST.LINEAR(30,{6,7,9,15,21},{20,28,31,38,40})', 10.607253, 6)
    near('=CORREL({3,2,4,5,6},{9,7,12,15,17})', 0.997054486, 8)
    near('=RSQ({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})', 0.05795019, 7)
    near('=STEYX({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})', 3.305718950, 8)
    near('=COVARIANCE.S({2,4,8},{5,11,12})', 9.666666667, 8)
  })
  it('distributions', () => {
    near('=NORM.DIST(42,40,1.5,TRUE)', 0.9087888, 7)
    near('=NORM.DIST(42,40,1.5,FALSE)', 0.10934005, 7)
    near('=NORM.S.INV(0.908789)', 1.3333347, 6)
    near('=NORM.INV(0.908789,40,1.5)', 42.000002, 5)
    near('=T.DIST.2T(1.96,60)', 0.054645, 6)
    near('=T.DIST(60,1,TRUE)', 0.99469533, 7)
    near('=T.INV.2T(0.546449,60)', 0.606533, 5)
    near('=CHISQ.DIST.RT(18.307,10)', 0.0500006, 7)
    near('=CHISQ.INV.RT(0.050001,10)', 18.306973, 4)
    near('=BINOM.DIST(6,10,0.5,FALSE)', 0.2050781, 7)
    near('=BINOM.DIST(6,10,0.5,TRUE)', 0.828125, 7)
    near('=POISSON.DIST(2,5,FALSE)', 0.084224, 6)
    near('=EXPON.DIST(0.2,10,TRUE)', 0.86466472, 7)
    near('=GAMMA.DIST(10.00001131,9,2,FALSE)', 0.032639, 6)
    near('=BETA.DIST(2,8,10,TRUE,1,3)', 0.6854706, 6)
    near('=F.DIST.RT(15.2068649,6,4)', 0.01, 6)
    near('=LOGNORM.DIST(4,3.5,1.2,TRUE)', 0.0390836, 6)
    near('=WEIBULL.DIST(105,20,100,TRUE)', 0.929581, 6)
    near('=HYPGEOM.DIST(1,4,8,20,FALSE)', 0.363261, 6)
    near('=NEGBINOM.DIST(10,5,0.25,FALSE)', 0.0550487, 6)
    near('=GAMMALN(4)', Math.log(6), 9)
    near('=CONFIDENCE.NORM(0.05,2.5,50)', 0.692951912, 8)
    near('=FISHER(0.75)', 0.972955075, 8)
    near('=STANDARDIZE(42,40,1.5)', 1.333333333, 8)
  })
})

describe('dynamic arrays and spill', () => {
  it('spills range arithmetic and blocks on collisions', () => {
    const b = book({ A1: '1', A2: '2', A3: '3', B1: '=A1:A3*2', C2: 'x', C1: '=SEQUENCE(2)' })
    expect([b.get('B1'), b.get('B2'), b.get('B3')]).toEqual([2, 4, 6])
    expect(b.get('C1')).toBe('#SPILL!')
  })
  it('implicit intersection with @', () => {
    const b = book({ A1: '1', A2: '2', A3: '3', B2: '=@A1:A3*10' })
    expect(b.get('B2')).toBe(20)
  })
})

describe('bond and security functions', () => {
  it('coupon dates and days', () => {
    const s = 'DATE(2011,1,25),DATE(2011,11,15),2,1'
    table([
      [`=COUPDAYBS(${s})`, 71],
      [`=COUPDAYS(${s})`, 181],
      [`=COUPDAYSNC(${s})`, 110],
      [`=COUPNCD(${s})`, 40678],
      [`=COUPPCD(${s})`, 40497],
      ['=COUPNUM(DATE(2007,1,25),DATE(2008,11,15),2,1)', 4],
      ['=COUPNUM(DATE(2011,11,15),DATE(2011,1,25),2,1)', '#NUM!'],
      ['=COUPNUM(DATE(2007,1,25),DATE(2008,11,15),3,1)', '#NUM!'],
    ])
  })
  it('prices, yields and durations', () => {
    near('=PRICE(DATE(2008,2,15),DATE(2017,11,15),0.0575,0.065,100,2,0)', 94.63436, 4)
    near('=YIELD(DATE(2008,2,15),DATE(2016,11,15),0.0575,95.04287,100,2,0)', 0.065, 6)
    near('=DURATION(DATE(2018,7,1),DATE(2048,1,1),0.08,0.09,2,1)', 10.9191453, 6)
    near('=MDURATION(DATE(2008,1,1),DATE(2016,1,1),0.08,0.09,2,1)', 5.73567, 4)
    near('=DISC(DATE(2007,1,25),DATE(2007,6,15),97.975,100,1)', 0.052420213, 7)
    near('=INTRATE(DATE(2008,2,15),DATE(2008,5,15),1000000,1014420,2)', 0.05768, 5)
    near('=RECEIVED(DATE(2008,2,15),DATE(2008,5,15),1000000,0.0575,2)', 1014584.654, 2)
    near('=PRICEDISC(DATE(2008,2,16),DATE(2008,3,1),0.0525,100,2)', 99.79583333, 7)
    near('=YIELDDISC(DATE(2008,2,16),DATE(2008,3,1),99.795,100,2)', 0.052823, 5)
    near('=PRICEMAT(DATE(2008,2,15),DATE(2008,4,13),DATE(2007,11,11),0.061,0.061,0)', 99.98449888, 6)
    near('=YIELDMAT(DATE(2008,3,15),DATE(2008,11,3),DATE(2007,11,8),0.0625,100.0123,0)', 0.060954, 5)
    near('=TBILLPRICE(DATE(2008,3,31),DATE(2008,6,1),0.09)', 98.45, 8)
    near('=TBILLYIELD(DATE(2008,3,31),DATE(2008,6,1),98.45)', 0.091417, 5)
    near('=TBILLEQ(DATE(2008,3,31),DATE(2008,6,1),0.0914)', 0.094151, 5)
    near('=ACCRINT(DATE(2008,3,1),DATE(2008,8,31),DATE(2008,5,1),0.1,1000,2,0)', 16.66666667, 6)
    near('=ACCRINTM(DATE(2008,4,1),DATE(2008,6,15),0.1,1000,3)', 20.54794521, 6)
  })
})

describe('complex numbers and Bessel functions', () => {
  it('format and compute like the original', () => {
    table([
      ['=COMPLEX(3,4)', '3+4i'],
      ['=COMPLEX(0,1)', 'i'],
      ['=COMPLEX(3,4,"j")', '3+4j'],
      ['=COMPLEX(0,0)', '0'],
      ['=IMSUM("3+4i","5-3i")', '8+i'],
      ['=IMPRODUCT("3+4i","5-3i")', '27+11i'],
      ['=IMDIV("-238+240i","10+24i")', '5+12i'],
      ['=IMSUB("13+4i","5+3i")', '8+i'],
      ['=IMABS("5+12i")', 13],
      ['=IMCONJUGATE("3+4i")', '3-4i'],
      ['=IMREAL("6-9i")', 6],
      ['=IMAGINARY("3+4i")', 4],
      ['=IMAGINARY("0-j")', -1],
      ['=IMAGINARY("-i")', -1],
      ['=IMREAL("abc")', '#NUM!'],
      ['=IMSQRT("1+i")', '1.09868411346781+0.455089860562227i'],
      ['=IMEXP("1+i")', '1.46869393991589+2.28735528717884i'],
      ['=IMLN("3+4i")', '1.6094379124341+0.927295218001612i'],
    ])
    near('=IMARGUMENT("3+4i")', 0.92729522, 7)
    near('=BESSELJ(1.9,2)', 0.329925829, 6)
    near('=BESSELI(1.5,1)', 0.981666428, 6)
    near('=BESSELK(1.5,1)', 0.277387804, 6)
    near('=BESSELY(2.5,1)', 0.145918138, 6)
    near('=BESSELJ(30,1)', -0.118751062, 8)
    near('=BESSELY(40,0)', 0.1259364170583, 11)
    // Wronskian J1·Y0 − J0·Y1 = 2/(πx) holds to full precision on the large-argument path
    near('=BESSELJ(40,1)*BESSELY(40,0)-BESSELJ(40,0)*BESSELY(40,1)-2/(PI()*40)', 0, 14)
  })

  it('odd-period securities and French depreciation', () => {
    near('=ODDLPRICE(DATE(2008,2,7),DATE(2008,6,15),DATE(2007,10,15),3.75%,4.05%,100,2,0)', 99.87828601, 6)
    near('=ODDLYIELD(DATE(2008,4,20),DATE(2008,6,15),DATE(2007,12,24),3.75%,99.875,100,2,0)', 0.045192, 5)
    near('=ODDFPRICE(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),7.85%,6.25%,100,2,1)', 113.5977, 3)
    near('=ODDFYIELD(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),5.75%,84.5,100,2,0)', 0.0772, 4)
    near('=AMORLINC(2400,DATE(2008,8,19),DATE(2008,12,31),300,1,15%,1)', 360, 6)
    near('=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,1,15%,1)', 776, 6)
  })
})

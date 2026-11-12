// Localized function names and separators: formulas are typed and shown in the interface language
// and stored in English.
import { afterEach, describe, expect, it } from 'vitest'
import '../engine/functions'
import { FUNCTIONS } from '../engine/registry'
import { FN_META } from '../engine/functions/meta'
import { FUNCTION_NAMES, KNOWN_OVERLAPS, type FormulaLanguage } from '../engine/localNames'
import { canonicalFunctionName, localFunctionName, toCanonicalFormula, toLocalFormula } from '../engine/localize'
import { functionContext, suggestions } from '../grid/formulaAssist'
import { Doc } from '../commands/doc'
import { setTranslationsForTest } from '../i18n'

const LANGS: FormulaLanguage[] = ['de', 'fr', 'es']

describe('function name tables', () => {
  for (const lang of LANGS) {
    const table = FUNCTION_NAMES[lang]
    it(`has every engine function in ${lang}`, () => {
      const missing = [...new Set([...FUNCTIONS.keys(), ...FN_META.keys()])].filter((n) => !table.get(n))
      expect(missing).toEqual([])
      const extra = [...table.keys()].filter((n) => !FUNCTIONS.has(n))
      expect(extra).toEqual([])
    })
    it(`has unique names in ${lang}`, () => {
      const seen = new Map<string, string>()
      const dupes: string[] = []
      for (const [en, local] of table) {
        const key = local.toUpperCase()
        if (seen.has(key)) dupes.push(`${local}: ${seen.get(key)} / ${en}`)
        seen.set(key, en)
      }
      expect(dupes).toEqual([])
    })
    it(`uses names the formula tokenizer reads as one word in ${lang}`, () => {
      const bad = [...table.values()].filter((n) => !/^[A-Za-z_À-￿][A-Za-z0-9_.À-￿]*$/.test(n))
      expect(bad).toEqual([])
    })
    it(`only reuses another function's English name where documented in ${lang}`, () => {
      const clashes = [...table].filter(([en, local]) => local !== en && FUNCTIONS.has(local)).map(([, local]) => local)
      expect(clashes.sort()).toEqual([...KNOWN_OVERLAPS[lang]].sort())
    })
  }

  it('has the well-known names', () => {
    expect(['SUM', 'VLOOKUP', 'IF', 'AVERAGE', 'COUNTIF'].map((n) => localFunctionName(n, 'de'))).toEqual(['SUMME', 'SVERWEIS', 'WENN', 'MITTELWERT', 'ZÄHLENWENN'])
    expect(['SUM', 'VLOOKUP', 'IF', 'AVERAGE'].map((n) => localFunctionName(n, 'fr'))).toEqual(['SOMME', 'RECHERCHEV', 'SI', 'MOYENNE'])
    expect(['SUM', 'VLOOKUP', 'IF', 'AVERAGE'].map((n) => localFunctionName(n, 'es'))).toEqual(['SUMA', 'BUSCARV', 'SI', 'PROMEDIO'])
    expect(canonicalFunctionName('zählenwenn', 'de')).toBe('COUNTIF')
    expect(canonicalFunctionName('año', 'es')).toBe('YEAR')
    expect(localFunctionName('SUM', 'en')).toBe('SUM')
  })
})

/** Canonical formula → expected text in [de, fr, es]. */
const CASES: [string, string, string, string][] = [
  ['SUM(A1:A3)', 'SUMME(A1:A3)', 'SOMME(A1:A3)', 'SUMA(A1:A3)'],
  ['SUM(1.5,2)', 'SUMME(1,5;2)', 'SOMME(1,5;2)', 'SUMA(1,5;2)'],
  ['IF(A1>0.5,VLOOKUP(B1,Data!A:C,3,FALSE),"a,b;c")', 'WENN(A1>0,5;SVERWEIS(B1;Data!A:C;3;FALSCH);"a,b;c")', 'SI(A1>0,5;RECHERCHEV(B1;Data!A:C;3;FAUX);"a,b;c")', 'SI(A1>0,5;BUSCARV(B1;Data!A:C;3;FALSO);"a,b;c")'],
  ["SUM('My Sheet'!A1,'SUM(1,2)'!B2)", "SUMME('My Sheet'!A1;'SUM(1,2)'!B2)", "SOMME('My Sheet'!A1;'SUM(1,2)'!B2)", "SUMA('My Sheet'!A1;'SUM(1,2)'!B2)"],
  ['SUM(Summe,Total)*Summe', 'SUMME(Summe;Total)*Summe', 'SOMME(Summe;Total)*Summe', 'SUMA(Summe;Total)*Summe'],
  ['SUM({1,2.5;3,4})', 'SUMME({1.2,5;3.4})', 'SOMME({1.2,5;3.4})', 'SUMA({1\\2,5;3\\4})'],
  ['AND({TRUE,FALSE})', 'UND({WAHR.FALSCH})', 'ET({VRAI.FAUX})', 'Y({VERDADERO\\FALSO})'],
  ['NORM.S.DIST(1.25,TRUE)+_xlfn.T.TEST(A1:A3,B1:B3,2,1)', 'NORM.S.VERT(1,25;WAHR)+T.TEST(A1:A3;B1:B3;2;1)', 'LOI.NORMALE.STANDARD.N(1,25;VRAI)+T.TEST(A1:A3;B1:B3;2;1)', 'DISTR.NORM.ESTAND.N(1,25;VERDADERO)+PRUEBA.T.N(A1:A3;B1:B3;2;1)'],
  ['LET(x,2.5,y,LAMBDA(a,a*x),y(4))', 'LET(x;2,5;y;LAMBDA(a;a*x);y(4))', 'LET(x;2,5;y;LAMBDA(a;a*x);y(4))', 'LET(x;2,5;y;LAMBDA(a;a*x);y(4))'],
  ['SUM(Table1[[#Headers],[Sales]],Table1[Sales, Q1])', 'SUMME(Table1[[#Headers];[Sales]];Table1[Sales, Q1])', 'SOMME(Table1[[#Headers];[Sales]];Table1[Sales, Q1])', 'SUMA(Table1[[#Headers];[Sales]];Table1[Sales, Q1])'],
  ['IFERROR(1/0,#N/A)&TEXT(1E-3,"0.00")', 'WENNFEHLER(1/0;#N/A)&TEXT(1E-3;"0.00")', 'SIERREUR(1/0;#N/A)&TEXTE(1E-3;"0.00")', 'SI.ERROR(1/0;#N/A)&TEXTO(1E-3;"0.00")'],
  ['COUNTIFS(A:A,">=1.5",B:B,"x")+.5', 'ZÄHLENWENNS(A:A;">=1.5";B:B;"x")+,5', 'NB.SI.ENS(A:A;">=1.5";B:B;"x")+,5', 'CONTAR.SI.CONJUNTO(A:A;">=1.5";B:B;"x")+,5'],
  ['YEAR(TODAY())-1', 'JAHR(HEUTE())-1', 'ANNEE(AUJOURDHUI())-1', 'AÑO(HOY())-1'],
  ['SUM((A1,B1))', 'SUMME((A1;B1))', 'SOMME((A1;B1))', 'SUMA((A1;B1))'],
]

describe('formula conversion', () => {
  it('leaves English formulas unchanged', () => {
    for (const [en] of CASES) {
      expect(toLocalFormula(en, 'en')).toBe(en)
      expect(toCanonicalFormula(en, 'en')).toBe(en)
    }
  })

  LANGS.forEach((lang, i) => {
    it(`round-trips English ↔ ${lang}`, () => {
      for (const c of CASES) {
        const local = c[i + 1]
        expect(toLocalFormula(c[0], lang), c[0]).toBe(local)
        expect(toCanonicalFormula(local, lang), local).toBe(c[0].replace('_xlfn.', ''))
      }
    })
  })

  it('accepts English function names and TRUE/FALSE typed in another language', () => {
    expect(toCanonicalFormula('SUM(A1;A2)+summe(1,5;2)', 'de')).toBe('SUM(A1,A2)+SUM(1.5,2)')
    expect(toCanonicalFormula('IF(TRUE;VLOOKUP(1;A:B;2;FALSE))', 'de')).toBe('IF(TRUE,VLOOKUP(1,A:B,2,FALSE))')
    expect(toCanonicalFormula('wenn(a1>1;"ja";"nein")', 'de')).toBe('IF(a1>1,"ja","nein")')
  })

  it('does not translate names, sheet names or text that look like function names', () => {
    // WAHR as a sheet name and SUMME as a defined name stay as they are
    expect(toCanonicalFormula('WAHR!A1+Summe+"SUMME(1;2)"', 'de')).toBe('WAHR!A1+Summe+"SUMME(1;2)"')
    expect(toLocalFormula('SUM!A1+SUM+"SUM(1,2)"', 'de')).toBe('SUM!A1+SUM+"SUM(1,2)"')
    // a LET variable or LAMBDA parameter that is called keeps its name (names ignore case)
    expect(toCanonicalFormula('LET(summe;LAMBDA(a;a+1);summe(2)+WENN(1;2))', 'de')).toBe('LET(summe,LAMBDA(a,a+1),summe(2)+IF(1,2))')
    expect(toLocalFormula('LET(Sum,LAMBDA(a,a+1),Sum(2)+IF(1,2))', 'de')).toBe('LET(Sum;LAMBDA(a;a+1);Sum(2)+WENN(1;2))')
  })

  it('keeps R1C1 references intact', () => {
    expect(toLocalFormula('SUM(R[-1]C,RC[2]:R2C3,1.5)', 'de')).toBe('SUMME(R[-1]C;RC[2]:R2C3;1,5)')
    expect(toCanonicalFormula('SUMME(R[-1]C;RC[2]:R2C3;1,5)', 'de')).toBe('SUM(R[-1]C,RC[2]:R2C3,1.5)')
  })

  it('accepts both array column separators', () => {
    expect(toCanonicalFormula('{1\\2;3.4}', 'de')).toBe('{1,2;3,4}')
    expect(toCanonicalFormula('{1.2;3\\4}', 'es')).toBe('{1,2;3,4}')
  })

  it('reads the function and argument at the caret in localized text', () => {
    setTranslationsForTest('de', {})
    const text = '=WENN(A1>1,5;SUMME({1.2};'
    expect(functionContext(text, text.length)).toEqual({ name: 'SUM', arg: 1 })
    expect(functionContext('=WENN(A1>1,5;', 13)).toEqual({ name: 'IF', arg: 1 })
    const s = suggestions('=SUMMEW', 7, [])!
    expect(s.items.map((i) => i.name)).toEqual(['SUMMEWENN', 'SUMMEWENNS'])
    // English names still find their function and insert the German name
    expect(suggestions('=VLOOK', 6, [])!.items[0]).toMatchObject({ name: 'SVERWEIS', fn: 'VLOOKUP' })
    expect(suggestions('=ZÄHL', 5, [])!.items.map((i) => i.name)).toContain('ZÄHLENWENN')
    setTranslationsForTest('en', {})
  })
})

describe('entering formulas in another interface language', () => {
  afterEach(() => setTranslationsForTest('en', {}))

  it('calculates =SUMME(A1;A2) typed in German and stores it in English', () => {
    setTranslationsForTest('de', {})
    const doc = new Doc()
    // cell values (not formulas) keep their own number parsing
    doc.setInput(0, 0, '1.5')
    doc.setInput(1, 0, '2')
    doc.setInput(2, 0, '=SUMME(A1;A2)')
    doc.setInput(3, 0, '=summe(A1;2,5)')
    doc.setInput(4, 0, '=SUM(A1;A2)')
    doc.setInput(5, 0, '=WENN(A3>3;"ja, gut";"nein")')
    expect(doc.sheet.get(2, 0)?.f).toBe('SUM(A1,A2)')
    expect(doc.sheet.get(3, 0)?.f).toBe('SUM(A1,2.5)')
    expect(doc.sheet.get(4, 0)?.f).toBe('SUM(A1,A2)')
    expect(doc.sheet.get(5, 0)?.f).toBe('IF(A3>3,"ja, gut","nein")')
    expect(doc.value(2, 0)).toBe(3.5)
    expect(doc.value(3, 0)).toBe(4)
    expect(doc.value(4, 0)).toBe(3.5)
    expect(doc.value(5, 0)).toBe('ja, gut')
    // shown for editing in German
    expect(doc.inputText(2, 0)).toBe('=SUMME(A1;A2)')
    expect(doc.inputText(3, 0)).toBe('=SUMME(A1;2,5)')
  })

  it('goes through the editor: begin, type, commit', () => {
    setTranslationsForTest('fr', {})
    const doc = new Doc()
    doc.setInput(0, 0, '4')
    doc.select({ r: 0, c: 1 })
    doc.beginEdit('enter', '=SI(A1>3;MOYENNE(A1;2);0)')
    expect(doc.commitEdit()).toBeNull()
    expect(doc.sheet.get(0, 1)?.f).toBe('IF(A1>3,AVERAGE(A1,2),0)')
    expect(doc.value(0, 1)).toBe(3)
    doc.select({ r: 0, c: 1 })
    doc.beginEdit('edit')
    expect(doc.edit?.text).toBe('=SI(A1>3;MOYENNE(A1;2);0)')
    doc.cancelEdit()
  })

  it('keeps English formulas when the interface is English', () => {
    const doc = new Doc()
    doc.setInput(0, 0, '=SUM(1.5,2)')
    expect(doc.sheet.get(0, 0)?.f).toBe('SUM(1.5,2)')
    expect(doc.inputText(0, 0)).toBe('=SUM(1.5,2)')
    expect(doc.value(0, 0)).toBe(3.5)
  })
})

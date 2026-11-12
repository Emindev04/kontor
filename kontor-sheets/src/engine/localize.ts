// Formulas in the interface language. The model, AutoSave and every file format keep English
// (canonical) formulas; this module converts at the edges only — when a formula is shown for editing
// (toLocalFormula) and when the user enters one (toCanonicalFormula).
//
// In German, French and Spanish, like the original program in those locales:
//   - function names are localized (=SUMME, =SOMME, =SUMA); English names are still accepted;
//   - ';' separates arguments and ',' is the decimal separator: =SUMME(1,5;2);
//   - TRUE/FALSE are written in the language (WAHR/FALSCH, VRAI/FAUX, VERDADERO/FALSO);
//   - array constants use ';' between rows and '.' (German, French) or '\' (Spanish) between
//     columns: {1.2;3.4} / {1\2;3\4}. On entry, both '.' and '\' are accepted as column separators;
//   - items inside structured references are separated by ';': Table1[[#Headers];[Sales]].
// Text in quotes, quoted sheet names, defined names, table and column names are never changed: a
// word is translated only when it is a function name directly followed by "(". Error values
// (#N/A, #VALUE!, …), structured-reference keywords (#This Row) and number format codes inside text
// stay in English.
import { getLanguage, type Language } from '../i18n'
import { ERROR_CODES } from '../model/types'
import { tokenize, type Token } from './tokenizer'
import { FUNCTION_NAMES, type FormulaLanguage } from './localNames'
import { FN_META } from './functions/meta'

const prefixRe = /^(_xlfn\.|_xlws\.|_xludf\.)+/i

/** Localized name → English name, per language (built on first use). */
const reverse = new Map<FormulaLanguage, Map<string, string>>()
function reverseOf(lang: FormulaLanguage): Map<string, string> {
  let map = reverse.get(lang)
  if (!map) {
    map = new Map()
    for (const [en, local] of FUNCTION_NAMES[lang]) map.set(local.toUpperCase(), en)
    reverse.set(lang, map)
  }
  return map
}

const isLocal = (lang: Language): lang is FormulaLanguage => lang !== 'en'

/** Argument separator shown in formulas (and function tooltips) for a language. */
export const argSeparator = (lang: Language = getLanguage()) => (isLocal(lang) ? ';' : ',')

/** Column separator inside array constants. */
export const arrayColumnSeparator = (lang: Language = getLanguage()) => (lang === 'es' ? '\\' : isLocal(lang) ? '.' : ',')

/** The name a user sees for an English function name. */
export function localFunctionName(name: string, lang: Language = getLanguage()): string {
  const up = name.toUpperCase()
  return isLocal(lang) ? (FUNCTION_NAMES[lang].get(up) ?? up) : up
}

/** The English function name for a name typed in the interface language (or in English). */
export function canonicalFunctionName(name: string, lang: Language = getLanguage()): string {
  const up = name.replace(prefixRe, '').toUpperCase()
  return isLocal(lang) ? (reverseOf(lang).get(up) ?? up) : up
}

/** "NAME(arg1, arg2)" with the localized name and the language's argument separator. */
export function localSignature(name: string, lang: Language = getLanguage()): string {
  const m = FN_META.get(name.toUpperCase())
  return `${localFunctionName(name, lang)}(${(m?.args ?? []).join(argSeparator(lang) + ' ')})`
}

/**
 * Variables declared by LET and parameters of LAMBDA in the formula. A call of such a name
 * ("y(4)" after LET(y, LAMBDA(…), …)) calls the variable, so it is never translated. `sep` is the
 * token type that separates arguments in the text (comma in English, semicolon otherwise).
 */
function localNames(toks: Token[], sep: 'comma' | 'semi', lang: Language): Set<string> {
  const out = new Set<string>()
  const stack: { fn: string; arg: number; only: Token | null; count: number }[] = []
  let pending = ''
  const close = () => {
    const top = stack[stack.length - 1]
    if (!top || top.count !== 1 || top.only?.type !== 'name' || top.only.sheet !== undefined) return
    if (top.fn === 'LAMBDA' || (top.fn === 'LET' && top.arg % 2 === 0)) out.add(top.only.id!)
  }
  for (const t of toks) {
    if (t.type === 'ws') continue
    if (t.type === 'lparen' || t.type === 'lbrace') {
      const top = stack[stack.length - 1]
      if (top) top.count++
      stack.push({ fn: t.type === 'lparen' ? pending : '', arg: 0, only: null, count: 0 })
    } else if (t.type === 'rparen' || t.type === 'rbrace') {
      close()
      stack.pop()
    } else if (t.type === sep && stack.length) {
      close()
      Object.assign(stack[stack.length - 1], { only: null, count: 0 })
      stack[stack.length - 1].arg++
    } else if (stack.length) {
      const top = stack[stack.length - 1]
      top.only = t
      top.count++
    }
    pending = t.type === 'func' ? canonicalFunctionName(t.id!, lang) : ''
  }
  return out
}

/** Swaps the item separators of a structured reference's bracket part ("[[#Headers],[Sales]]"). */
function convertStructSpec(spec: string, from: string, to: string): string {
  // only the "[[…],[…]]" form has separators; "[Sales, Q1]" is one column name that contains a comma
  let inner = spec.slice(1).trimStart()
  if (inner.startsWith('@')) inner = inner.slice(1).trimStart()
  if (!inner.startsWith('[')) return spec
  let out = ''
  let depth = 0
  for (let i = 0; i < spec.length; i++) {
    const ch = spec[i]
    if (ch === "'" && i + 1 < spec.length) {
      out += ch + spec[++i]
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') depth--
    out += ch === from && depth === 1 ? to : ch
  }
  return out
}

/** Converts a canonical (English) formula body, without "=", to the interface language. */
export function toLocalFormula(body: string, lang: Language = getLanguage()): string {
  if (!isLocal(lang)) return body
  const names = FUNCTION_NAMES[lang]
  const colSep = arrayColumnSeparator(lang)
  let depth = 0
  let out = ''
  const toks = tokenize(body)
  const locals = localNames(toks, 'comma', 'en')
  for (const t of toks) {
    switch (t.type) {
      case 'lbrace':
        depth++
        out += t.text
        break
      case 'rbrace':
        depth = Math.max(0, depth - 1)
        out += t.text
        break
      case 'comma':
        out += depth > 0 ? colSep : ';'
        break
      case 'num':
        out += t.text.replace('.', ',')
        break
      case 'func':
        out += locals.has(t.id!) ? t.text : (names.get(t.id!) ?? t.text)
        break
      case 'bool':
        out += names.get(t.bool ? 'TRUE' : 'FALSE')!
        break
      case 'struct':
        out += t.table! + convertStructSpec(t.spec!, ',', ';')
        break
      default:
        out += t.text
    }
  }
  return out
}

const IDENT = /^[A-Za-z_\\À-￿][A-Za-z0-9_.?\\À-￿]*/
/** Inside array constants only TRUE/FALSE appear as words; '.' and '\' are column separators there. */
const ARRAY_WORD = /^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*/
const LOCAL_NUMBER = /^(\d+(,\d*)?|,\d+)([eE][-+]?\d+)?/

/** End (exclusive) of a balanced "[...]" group starting at `i`, or the end of the text. */
function bracketEnd(src: string, i: number): number {
  let depth = 0
  for (let j = i; j < src.length; j++) {
    const ch = src[j]
    if (ch === "'" && j + 1 < src.length) {
      j++
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']' && --depth === 0) return j + 1
  }
  return src.length
}

/** End (exclusive) of a text in quotes starting at `i` (doubled quotes are escapes). */
function quotedEnd(src: string, i: number, q: string): number {
  let j = i + 1
  while (j < src.length) {
    if (src[j] === q) {
      if (src[j + 1] === q) {
        j += 2
        continue
      }
      return j + 1
    }
    j++
  }
  return src.length
}

/**
 * Converts a formula body, without "=", typed in the interface language to the canonical English
 * form. English function names and English booleans typed by the user are accepted too.
 */
export function toCanonicalFormula(body: string, lang: Language = getLanguage()): string {
  if (!isLocal(lang)) return body
  const rev = reverseOf(lang)
  const trueWord = FUNCTION_NAMES[lang].get('TRUE')!
  const falseWord = FUNCTION_NAMES[lang].get('FALSE')!
  const locals = localNames(tokenize(body), 'semi', lang)
  let out = ''
  let depth = 0
  let i = 0
  // the last significant character copied, to tell ",5" (a number) from a stray comma
  let prev = ''
  const emit = (text: string, last = text.trimEnd().slice(-1)) => {
    out += text
    if (last) prev = last
  }
  while (i < body.length) {
    const ch = body[i]
    if (ch === '"' || ch === "'") {
      const end = quotedEnd(body, i, ch)
      emit(body.slice(i, end))
      i = end
      continue
    }
    if (ch === '[') {
      const end = bracketEnd(body, i)
      emit(convertStructSpec(body.slice(i, end), ';', ','), ']')
      i = end
      continue
    }
    if (ch === '#') {
      const code = ERROR_CODES.find((e) => body.slice(i, i + e.length).toUpperCase() === e)
      const text = code ? body.slice(i, i + code.length) : ch
      emit(text)
      i += text.length
      continue
    }
    if (/\d/.test(ch) || (ch === ',' && /\d/.test(body[i + 1] ?? '') && (prev === '' || '(;,=+-*/^&<>:{%'.includes(prev)))) {
      const m = LOCAL_NUMBER.exec(body.slice(i))!
      emit(m[0].replace(',', '.'))
      i += m[0].length
      continue
    }
    if (depth > 0 && (ch === '.' || ch === '\\')) {
      emit(',')
      i++
      continue
    }
    if (/[A-Za-z_\\À-￿]/.test(ch)) {
      const word = (depth > 0 ? ARRAY_WORD : IDENT).exec(body.slice(i))?.[0] ?? ch
      const end = i + word.length
      const next = body[end] ?? ''
      const qualified = prev === '!' && out.endsWith('!')
      let text = word
      if (next === '(') text = locals.has(word.toUpperCase()) ? word : (rev.get(word.replace(prefixRe, '').toUpperCase()) ?? word)
      else if (next !== '!' && next !== '[' && !qualified) {
        const up = word.toUpperCase()
        if (up === trueWord) text = 'TRUE'
        else if (up === falseWord) text = 'FALSE'
      }
      emit(text)
      i = end
      continue
    }
    if (ch === ';') {
      emit(depth > 0 ? ';' : ',')
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') depth = Math.max(0, depth - 1)
    emit(ch)
    i++
  }
  return out
}

/** Like toLocalFormula for input text: formulas ("=…") are converted, other text is returned unchanged. */
export function localInput(text: string, lang: Language = getLanguage()): string {
  return text.startsWith('=') && text.length > 1 ? '=' + toLocalFormula(text.slice(1), lang) : text
}

/** Like toCanonicalFormula for input text: formulas ("=…") are converted, other text is returned unchanged. */
export function canonicalInput(text: string, lang: Language = getLanguage()): string {
  return text.startsWith('=') && text.length > 1 ? '=' + toCanonicalFormula(text.slice(1), lang) : text
}

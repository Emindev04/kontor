// Regional number conventions (decimal and thousands separator) of the interface language, the way
// the original program follows the system locale. Only the edges use them: cell display, the edit
// box and typed input. The model, AutoSave, every file format (.xlsx, .ods, .csv) and formula
// results such as TEXT() keep canonical (US) numbers and format codes.
//
//   en: 1,234.5   de: 1.234,5   es: 1.234,5   fr: 1 234,5 (thousands = U+202F narrow no-break space,
//   which is what Intl.NumberFormat('fr-FR') uses; on entry a regular space and U+00A0 are accepted too)
//
// Like the original (and unlike Intl for es-ES), four-digit numbers are grouped as well: #,##0 shows
// 1.234 in Spanish.
import { getLanguage, type Language } from '../i18n'

export type NumberSymbols = { decimal: string; group: string }

export const US_SYMBOLS: NumberSymbols = { decimal: '.', group: ',' }

const SYMBOLS: Record<Language, NumberSymbols> = {
  en: US_SYMBOLS,
  de: { decimal: ',', group: '.' },
  fr: { decimal: ',', group: ' ' },
  es: { decimal: ',', group: '.' },
}

/** Separators of a language (the interface language by default). */
export function numberSymbols(lang: Language = getLanguage()): NumberSymbols {
  return SYMBOLS[lang] ?? US_SYMBOLS
}

export const isUsSymbols = (sym: NumberSymbols) => sym.decimal === '.' && sym.group === ','

/** Swaps the separators of canonical number text ("1,234.5", "1.5E+10") to the given ones. */
export function localizeNumberText(text: string, sym: NumberSymbols): string {
  if (isUsSymbols(sym)) return text
  return text.replace(/[.,]/g, (ch) => (ch === '.' ? sym.decimal : sym.group))
}

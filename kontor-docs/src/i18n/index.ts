// Interface language.
//
// The English text is the key: write `t('Save As')` in code and add the translation to every file in
// ./locales. Text without a translation shows in English, so nothing ever breaks. Placeholders use
// braces: `t('Page {n} of {total}', { n: 3, total: 9 })`.
//
// The language is chosen in Options (stored in this browser / on this computer) and otherwise
// follows the system language. Changing it reloads the program, so every text, including texts
// built when a module loads, comes out in the new language.
//
// This file is copied unchanged into every program folder so the folders stay independent.

export type Language = 'en' | 'de' | 'fr' | 'es'
export type Translations = Record<string, string>

export const LANGUAGES: { id: Language; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
  { id: 'fr', name: 'Français' },
  { id: 'es', name: 'Español' },
]

const STORAGE_KEY = 'kontor:ui-language'

const loaders: Record<Exclude<Language, 'en'>, () => Promise<{ default: Translations }>> = {
  de: () => import('./locales/de'),
  fr: () => import('./locales/fr'),
  es: () => import('./locales/es'),
}

let current: Language = 'en'
let table: Translations = {}

const isLanguage = (value: unknown): value is Language => LANGUAGES.some((l) => l.id === value)

/** The language chosen in Options, or the system language when nothing was chosen. */
export function preferredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // Storage unavailable: use the system language.
  }
  const system = (globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? 'en']).map((l) => l.slice(0, 2).toLowerCase())
  return system.find(isLanguage) ?? 'en'
}

/** Loads the interface language. Call (and await) it before the app's modules are imported. */
export async function initLanguage(language: Language = preferredLanguage()) {
  current = language
  table = language === 'en' ? {} : (await loaders[language]().catch(() => ({ default: {} }))).default
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

export function getLanguage(): Language {
  return current
}

/** Stores the choice and reloads the program in the new language. */
export function setLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Not stored: the language still changes for this session after the reload.
  }
  if (language !== current) location.reload()
}

/** Translates an English interface text. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const translated = table[text] ?? text
  if (!vars) return translated
  return translated.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

/** Marks a text for translation where it is defined but translates it later (for example in constant tables). */
export const tx = (text: string) => text

/** Formats numbers and dates for the interface language. */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(current, options).format(value)
export const formatDate = (value: Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(current, options).format(value)

/** For tests: switch the table without a reload. */
export function setTranslationsForTest(language: Language, translations: Translations) {
  current = language
  table = translations
}

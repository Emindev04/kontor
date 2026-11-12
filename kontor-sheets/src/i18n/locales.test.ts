// The texts that are not passed to t() as literals (function help, categories) and a sample of the
// most visible interface texts must be translated, the German ones in particular.
import { describe, expect, it } from 'vitest'
import { CATEGORY_ORDER, FN_META } from '../engine/functions/meta'
import de from './locales/de'
import es from './locales/es'
import fr from './locales/fr'

const IMPORTANT_DE: Record<string, string> = {
  File: 'Datei',
  Home: 'Start',
  Insert: 'Einfügen',
  Draw: 'Zeichnen',
  'Page Layout': 'Seitenlayout',
  Formulas: 'Formeln',
  Data: 'Daten',
  Review: 'Überprüfen',
  View: 'Ansicht',
  Help: 'Hilfe',
  'Save As': 'Speichern unter',
  Paste: 'Einfügen',
  Cut: 'Ausschneiden',
  Copy: 'Kopieren',
  Bold: 'Fett',
  Italic: 'Kursiv',
  Underline: 'Unterstrichen',
  'Format Cells': 'Zellen formatieren',
  'Conditional Formatting': 'Bedingte Formatierung',
  'Format as Table': 'Als Tabelle formatieren',
  'Sort & Filter': 'Sortieren und Filtern',
  'Find & Select': 'Suchen und Auswählen',
  'Insert Function': 'Funktion einfügen',
  'Name Manager': 'Namens-Manager',
  'Freeze Panes': 'Fenster fixieren',
  Options: 'Optionen',
  Undo: 'Rückgängig',
  Redo: 'Wiederholen',
  Ready: 'Bereit',
  Sum: 'Summe',
  Average: 'Mittelwert',
}

describe('locale files', () => {
  it('translate the important German interface texts', () => {
    const wrong = Object.entries(IMPORTANT_DE).filter(([en, text]) => de[en] !== text)
    expect(wrong).toEqual([])
  })

  it('translate a sample of keys into German (not left in English)', () => {
    const sample = ['Paste Special…', 'Insert Sheet Rows', 'Merge & Center', 'Wrap Text', 'Data Validation', 'Remove Duplicates', 'Page Setup', 'Print Titles', 'Keyboard Shortcuts', 'Customize Quick Access Toolbar']
    for (const key of sample) {
      expect(de[key], key).toBeTruthy()
      expect(de[key], key).not.toBe(key)
    }
  })

  for (const [name, table] of Object.entries({ de, fr, es })) {
    it(`has the function categories and descriptions in ${name}`, () => {
      const keys = [...CATEGORY_ORDER, ...[...FN_META.values()].map((m) => m.description)]
      const missing = keys.filter((k) => !(k in table))
      expect(missing.slice(0, 20), `${missing.length} missing in ${name}`).toEqual([])
    })
    it(`keeps keyboard shortcuts unchanged in ${name}`, () => {
      // German keyboards label Ctrl and Shift as Strg and Umschalt; the keys themselves stay the same.
      const local = (s: string) => (name === 'de' ? s.replace(/\bCtrl\+/g, 'Strg+').replace(/\bShift\+/g, 'Umschalt+') : s)
      const broken = Object.entries(table).filter(([k, v]) => (k.match(/\b(?:Ctrl|Shift|Alt)\+\S+/g) ?? []).some((s) => !v.includes(s) && !v.includes(local(s))))
      expect(broken.map(([k]) => k)).toEqual([])
    })
  }
})

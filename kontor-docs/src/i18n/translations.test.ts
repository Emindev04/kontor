// Spot checks of the translations: the most visible interface texts must be translated (not just copied
// from English), and a translation must not itself be another key, because some labels from constant
// tables pass through t() twice.
import { describe, expect, it } from 'vitest'
import de from './locales/de'
import es from './locales/es'
import fr from './locales/fr'

const GERMAN: Record<string, string> = {
  File: 'Datei',
  Home: 'Start',
  Insert: 'Einfügen',
  Draw: 'Zeichnen',
  Design: 'Entwurf',
  Layout: 'Layout',
  References: 'Referenzen',
  Mailings: 'Sendungen',
  Review: 'Überprüfen',
  View: 'Ansicht',
  Help: 'Hilfe',
  'Save As': 'Speichern unter',
  Save: 'Speichern',
  Open: 'Öffnen',
  Print: 'Drucken',
  Paste: 'Einfügen',
  Cut: 'Ausschneiden',
  Copy: 'Kopieren',
  'Format Painter': 'Format übertragen',
  Font: 'Schriftart',
  Bold: 'Fett',
  Italic: 'Kursiv',
  Underline: 'Unterstrichen',
  Paragraph: 'Absatz',
  Styles: 'Formatvorlagen',
  Normal: 'Standard',
  'Heading 1': 'Überschrift 1',
  'Track Changes': 'Änderungen nachverfolgen',
  'New Comment': 'Neuer Kommentar',
  Margins: 'Seitenränder',
  Orientation: 'Ausrichtung',
  'Page Break': 'Seitenumbruch',
  'Insert Table': 'Tabelle einfügen',
  'Table of Contents': 'Inhaltsverzeichnis',
  'Word Count': 'Wörter zählen',
  'Read Mode': 'Lesemodus',
  'Print Layout': 'Drucklayout',
  Zoom: 'Zoom',
  OK: 'OK',
  Cancel: 'Abbrechen',
  Close: 'Schließen',
  'Page {n} of {total}': 'Seite {n} von {total}',
  '{n} words': '{n} Wörter',
  'Interface language:': 'Sprache der Benutzeroberfläche:',
}

/** Keys that are the same in German because the word is the same (or a name). */
const SAME_IN_GERMAN = new Set(Object.entries(GERMAN).filter(([k, v]) => k === v).map(([k]) => k))

describe('German translation', () => {
  it('uses the familiar terms for the main commands', () => {
    const actual = Object.fromEntries(Object.keys(GERMAN).map((k) => [k, de[k]]))
    expect(actual).toEqual(GERMAN)
  })

  it('translates the important texts instead of copying the English', () => {
    const copied = Object.keys(GERMAN).filter((k) => !SAME_IN_GERMAN.has(k) && de[k] === k)
    expect(copied).toEqual([])
  })
})

describe('all translations', () => {
  for (const [name, table] of Object.entries({ de, fr, es })) {
    it(`never turns a translation into another key in ${name}`, () => {
      const chained = Object.entries(table).filter(([k, v]) => v !== k && v in table && table[v] !== v)
      expect(chained.map(([k, v]) => `${k} → ${v} → ${table[v]}`)).toEqual([])
    })
    it(`does not use product names in ${name}`, () => {
      const names = Object.values(table).filter((v) => /\b(Microsoft|Word|Excel|PowerPoint|Outlook|Office)\b/.test(v))
      expect(names).toEqual([])
    })
  }
})

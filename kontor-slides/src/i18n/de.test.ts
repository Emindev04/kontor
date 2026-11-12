// The German interface uses the terms users of the classic office programs know.
import { describe, expect, it } from 'vitest'
import de from './locales/de'

const SAMPLE: Record<string, string> = {
  File: 'Datei',
  Home: 'Start',
  Insert: 'Einfügen',
  Design: 'Entwurf',
  Transitions: 'Übergänge',
  Animations: 'Animationen',
  'Slide Show': 'Bildschirmpräsentation',
  Review: 'Überprüfen',
  View: 'Ansicht',
  Help: 'Hilfe',
  'Save As': 'Speichern unter',
  Open: 'Öffnen',
  New: 'Neu',
  Print: 'Drucken',
  Export: 'Exportieren',
  Options: 'Optionen',
  Cancel: 'Abbrechen',
  Close: 'Schließen',
  Paste: 'Einfügen',
  Cut: 'Ausschneiden',
  Copy: 'Kopieren',
  'Format Painter': 'Format übertragen',
  'New Slide': 'Neue Folie',
  Layout: 'Layout',
  Font: 'Schriftart',
  Paragraph: 'Absatz',
  Bold: 'Fett',
  Italic: 'Kursiv',
  Underline: 'Unterstrichen',
  Undo: 'Rückgängig',
  Redo: 'Wiederholen',
  'Slide Sorter': 'Foliensortierung',
  'Slide Master': 'Folienmaster',
  'Notes Master': 'Notizenmaster',
  'Handout Master': 'Handzettelmaster',
  'Reading View': 'Leseansicht',
  'Presenter View': 'Referentenansicht',
  'From Beginning': 'Von Beginn an',
  'From Current Slide': 'Ab aktueller Folie',
  'Shape Format': 'Formformat',
  'Picture Format': 'Bildformat',
  'Table Design': 'Tabellenentwurf',
  Notes: 'Notizen',
  Comments: 'Kommentare',
  Language: 'Sprache',
  'Display language:': 'Anzeigesprache:',
  'Slide {n} of {total}': 'Folie {n} von {total}',
}

/** Texts that read the same in German (names, formats, words German shares with English). */
const ALLOWED_SAME = [
  '{name}:',
  'JPEG File Interchange Format',
  'Layout 1',
  'Layout 2',
  'Layout 3',
  'Layout 4',
  'Layout 5',
  'Layout 6',
  'Maximum:',
  'Minimum:',
  'Offset:',
  'PNG Portable Network Graphics',
  'Sound:',
  'Standard (4:3)',
  'Standard (480p)',
  'Start:',
]

describe('German interface texts', () => {
  for (const [en, expected] of Object.entries(SAMPLE)) {
    it(`translates "${en}"`, () => {
      expect(de[en]).toBe(expected)
    })
  }

  it('translates every text (no English left over except names and symbols)', () => {
    const same = Object.entries(de).filter(([en, text]) => en === text && /[a-z]{4}/.test(en) && !/^[A-Z][\w-]*$/.test(en))
    expect(same.map(([en]) => en)).toEqual(ALLOWED_SAME)
  })
})

// Program options kept per browser (File > Options): they are not part of the workbook.
const KEY = 'kontor-sheets:options'

export type Prefs = {
  /** Move the selection after pressing Enter, and in which direction. */
  moveAfterEnter: boolean
  enterDir: 'down' | 'right' | 'up' | 'left'
  /** Complete text entries from values already in the column. */
  autoComplete: boolean
  /** Correct common typing mistakes while entering text. */
  autoCorrect: boolean
  /** AutoCorrect entries added or changed by the user, and built-in entries the user deleted. */
  acAdded: Record<string, string>
  acRemoved: string[]
  /** Ribbon tabs hidden with Customize the Ribbon. */
  hiddenTabs: string[]
  /** R1C1 reference style: formulas are shown and typed with R1C1 references. */
  r1c1: boolean
}

const DEFAULTS: Prefs = { moveAfterEnter: true, enterDir: 'down', autoComplete: true, autoCorrect: true, acAdded: {}, acRemoved: [], hiddenTabs: [], r1c1: false }

let current: Prefs = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
})()

export const prefs = () => current

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // storage unavailable
  }
}

/** Row/column step for Enter (Shift+Enter goes the other way). */
export function enterStep(shift: boolean): { dr: number; dc: number } {
  if (!current.moveAfterEnter) return { dr: 0, dc: 0 }
  const s = shift ? -1 : 1
  switch (current.enterDir) {
    case 'right': return { dr: 0, dc: s }
    case 'up': return { dr: -s, dc: 0 }
    case 'left': return { dr: 0, dc: -s }
    default: return { dr: s, dc: 0 }
  }
}

/** Common typing mistakes and symbols corrected as you type (a subset of the original's list). */
export const AUTOCORRECT: Record<string, string> = {
  '(c)': '©', '(r)': '®', '(tm)': '™', '...': '…', '->': '→', '<-': '←', '=>': '⇒',
  teh: 'the', adn: 'and', recieve: 'receive', seperate: 'separate', occured: 'occurred', untill: 'until', wich: 'which', thier: 'their', becuase: 'because',
  definately: 'definitely', accomodate: 'accommodate', acheive: 'achieve', beleive: 'believe', calender: 'calendar', goverment: 'government', tommorow: 'tomorrow',
  wierd: 'weird', neccessary: 'necessary', occassion: 'occasion', publically: 'publicly', reccomend: 'recommend', truely: 'truly', alot: 'a lot', i: 'I',
}

/** The AutoCorrect list in use: the built-in entries plus the user's changes. */
export function autoCorrectList(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(AUTOCORRECT)) if (!current.acRemoved.includes(k)) out[k] = v
  return { ...out, ...current.acAdded }
}

/** Adds or replaces an AutoCorrect entry. */
export function setAutoCorrectEntry(from: string, to: string) {
  const acRemoved = current.acRemoved.filter((k) => k !== from)
  setPrefs({ acAdded: { ...current.acAdded, [from]: to }, acRemoved })
}

/** Deletes an AutoCorrect entry (built-in entries are remembered as deleted). */
export function deleteAutoCorrectEntry(from: string) {
  const acAdded = { ...current.acAdded }
  delete acAdded[from]
  setPrefs({ acAdded, acRemoved: from in AUTOCORRECT ? [...new Set([...current.acRemoved, from])] : current.acRemoved })
}

/** Applies AutoCorrect to the word just finished in `text` (called when a space or punctuation is typed). */
export function autoCorrect(text: string): string {
  if (!current.autoCorrect || text.startsWith('=')) return text
  const m = /(^|\s)(\S+)([\s.,;:!?])$/.exec(text)
  if (!m) return text
  const word = m[2]
  const list = autoCorrectList()
  const fix = list[word] ?? list[word.toLowerCase()]
  if (!fix || fix === word) return text
  const cased = word[0] === word[0].toUpperCase() && word.length > 1 && fix[0] !== fix[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix
  return text.slice(0, text.length - word.length - 1) + cased + m[3]
}

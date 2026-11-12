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
}

const DEFAULTS: Prefs = { moveAfterEnter: true, enterDir: 'down', autoComplete: true, autoCorrect: true }

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

/** Applies AutoCorrect to the word just finished in `text` (called when a space or punctuation is typed). */
export function autoCorrect(text: string): string {
  if (!current.autoCorrect || text.startsWith('=')) return text
  const m = /(^|\s)(\S+)([\s.,;:!?])$/.exec(text)
  if (!m) return text
  const word = m[2]
  const fix = AUTOCORRECT[word] ?? AUTOCORRECT[word.toLowerCase()]
  if (!fix || fix === word) return text
  const cased = word[0] === word[0].toUpperCase() && word.length > 1 && fix[0] !== fix[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix
  return text.slice(0, text.length - word.length - 1) + cased + m[3]
}

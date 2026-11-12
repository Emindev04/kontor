// All lengths are stored in inches (like the en-US original) and only converted for display.

export type Unit = 'in' | 'cm' | 'mm' | 'pt' | 'pi'

export const UNITS: { id: Unit; label: string }[] = [
  { id: 'in', label: 'Inches' },
  { id: 'cm', label: 'Centimeters' },
  { id: 'mm', label: 'Millimeters' },
  { id: 'pt', label: 'Points' },
  { id: 'pi', label: 'Picas' },
]

const PER_INCH: Record<Unit, number> = { in: 1, cm: 2.54, mm: 25.4, pt: 72, pi: 6 }
const SUFFIX: Record<Unit, string> = { in: '"', cm: ' cm', mm: ' mm', pt: ' pt', pi: ' pi' }

export const PX_PER_IN = 96
export const PT_PER_IN = 72
export const TWIP_PER_IN = 1440

export const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits

export function toUnit(inches: number, unit: Unit) {
  return round(inches * PER_INCH[unit], unit === 'pt' ? 1 : 2)
}

export function formatLength(inches: number, unit: Unit) {
  return `${toUnit(inches, unit).toLocaleString('en-US', { maximumFractionDigits: 2 })}${SUFFIX[unit]}`
}

/** Parses user input such as `1.5"`, `2 cm`, `12pt` or a bare number in the current unit. Returns inches. */
export function parseLength(text: string, unit: Unit): number | null {
  const m = text.trim().replace(',', '.').match(/^(-?\d*\.?\d+)\s*("|in|inch|inches|cm|mm|pt|pi)?$/i)
  if (!m) return null
  const value = parseFloat(m[1])
  const suffix = (m[2] ?? '').toLowerCase()
  const from: Unit = suffix === '"' || suffix.startsWith('in') ? 'in' : ((suffix as Unit) || unit)
  return value / PER_INCH[from]
}

export type Settings = {
  unit: Unit
  widowControl: boolean
  showPageGapLabels: boolean
  /** Name and initials used for comments and tracked changes. */
  userName: string
  userInitials: string
  /** AutoFormat as you type: straight quotes become smart quotes, AutoCorrect replacements. */
  smartQuotes: boolean
  autoCorrect: boolean
  /** The AutoCorrect replacement list, when the user changed it. */
  autoCorrectEntries?: [string, string][]
  /** Options > Advanced > Pasting from other programs. */
  defaultPaste?: 'keep' | 'merge' | 'text'
  /** Commands on the Quick Access Toolbar, in order. */
  qat?: string[]
  /** Ribbon tabs hidden in Options › Customize Ribbon. */
  hiddenTabs?: string[]
  /** Status bar items turned off (right-click the status bar). */
  hiddenStatus?: string[]
}

const SETTINGS_KEY = 'kontor-write:settings'
export const DEFAULT_SETTINGS: Settings = {
  unit: 'in',
  widowControl: true,
  showPageGapLabels: false,
  userName: 'User',
  userInitials: 'U',
  smartQuotes: true,
  autoCorrect: true,
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be full or disabled; settings then only last for this session.
  }
}

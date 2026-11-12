// User options (File > Options and the Account page), kept in this browser's localStorage.
import { useSyncExternalStore } from 'react'
import { tx } from '../i18n'

/** Commands that can be shown on the Quick Access Toolbar in the title bar. */
export const QAT_COMMANDS = [
  { id: 'save', label: tx('Save') },
  { id: 'undo', label: tx('Undo') },
  { id: 'redo', label: tx('Redo') },
  { id: 'startShow', label: tx('Start From Beginning') },
  { id: 'new', label: tx('New') },
  { id: 'open', label: tx('Open') },
  { id: 'print', label: tx('Print') },
  { id: 'newSlide', label: tx('New Slide') },
  { id: 'shapes', label: tx('Insert Shape (Rectangle)') },
  { id: 'textbox', label: tx('Draw Text Box') },
  { id: 'spelling', label: tx('Spelling') },
] as const

export type QatId = (typeof QAT_COMMANDS)[number]['id']

export type AppOptions = {
  userName: string
  initials: string
  /** Quick Access Toolbar commands, in order. */
  qat: QatId[]
  /** Show the toolbar below the ribbon instead of in the title bar. */
  qatBelow: boolean
  /** AutoCorrect: replace text as you type ((c) → ©, -- → —, :) …) and use smart quotes. */
  autoCorrect: boolean
  smartQuotes: boolean
  /** AutoFormat: start bulleted/numbered lists when a paragraph begins with "* " or "1. ". */
  autoLists: boolean
  /** Floating mini toolbar on text selection. */
  miniToolbar: boolean
  /** App color scheme. */
  officeTheme: 'colorful' | 'dark' | 'white'
}

const KEY = 'kontor-slides:options'

export const DEFAULT_OPTIONS: AppOptions = {
  userName: '',
  initials: '',
  qat: ['save', 'undo', 'redo', 'startShow'],
  qatBelow: false,
  autoCorrect: true,
  smartQuotes: true,
  autoLists: true,
  miniToolbar: true,
  officeTheme: 'colorful',
}

function read(): AppOptions {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_OPTIONS, ...(JSON.parse(raw) as Partial<AppOptions>) } : DEFAULT_OPTIONS
  } catch {
    return DEFAULT_OPTIONS
  }
}

let current = read()
const listeners = new Set<() => void>()

export function getOptions() {
  return current
}

export function setOptions(patch: Partial<AppOptions>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage may be unavailable (private mode); the options still apply for this session.
  }
  listeners.forEach((l) => l())
}

export function useOptions(): AppOptions {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/** Initials from a name ("Ada Lovelace" → "AL"). */
export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

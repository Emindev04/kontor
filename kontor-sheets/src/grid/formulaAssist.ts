// Helpers for editing formulas: reference coloring, pointing, autocomplete and argument tooltips.
import type { Range } from '../model/address'
import { refArea } from '../engine/parser'
import { FUNCTIONS } from '../engine/registry'
import { FN_META } from '../engine/functions/meta'
import { tokenize } from '../engine/tokenizer'
import { tx } from '../i18n'

export const REF_COLORS = ['#1f6fd0', '#d4373a', '#7e3fb2', '#1d8a4a', '#b8620b', '#0f8b8d', '#c2378b', '#5d6b00']

export type ColoredRef = { start: number; end: number; color: string; sheet?: string; range: Range }

/** References in a formula (text including "="), each with its highlight color. */
export function coloredRefs(text: string): ColoredRef[] {
  if (!text.startsWith('=')) return []
  const out: ColoredRef[] = []
  const colors = new Map<string, string>()
  for (const t of tokenize(text.slice(1))) {
    if (t.type !== 'ref') continue
    const key = t.text.toUpperCase().replace(/\$/g, '')
    let color = colors.get(key)
    if (!color) {
      color = REF_COLORS[colors.size % REF_COLORS.length]
      colors.set(key, color)
    }
    out.push({ start: t.start + 1, end: t.end + 1, color, sheet: t.ref!.sheet, range: refArea(t.ref!) })
  }
  return out
}

/** Whether a click or arrow key should insert a reference at the caret (point mode). */
export function canPoint(text: string, caret: number, point: { start: number; end: number } | null): boolean {
  if (!text.startsWith('=')) return false
  if (point && point.end === caret) return true
  let i = caret - 1
  while (i >= 0 && text[i] === ' ') i--
  if (i < 0) return false
  if (inString(text, caret)) return false
  return '=(,+-*/^&<>:;{'.includes(text[i])
}

function inString(text: string, caret: number) {
  let n = 0
  for (let i = 0; i < caret; i++) if (text[i] === '"') n++
  return n % 2 === 1
}

export type Suggestion = { name: string; kind: 'function' | 'name'; description: string }

/** Function/name suggestions for the identifier being typed before the caret. */
export function suggestions(text: string, caret: number, names: string[]): { start: number; items: Suggestion[] } | null {
  if (!text.startsWith('=') || inString(text, caret)) return null
  const before = text.slice(0, caret)
  const m = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(before)
  if (!m) return null
  const start = caret - m[0].length
  const prev = text[start - 1] ?? ''
  if (/[A-Za-z0-9_$'!.]/.test(prev)) return null
  const next = text[caret] ?? ''
  if (next === '(') return null
  const prefix = m[0].toUpperCase()
  const items: Suggestion[] = []
  for (const name of [...FUNCTIONS.keys()].sort()) if (name.startsWith(prefix)) items.push({ name, kind: 'function', description: FN_META.get(name)?.description ?? '' })
  for (const n of names.sort()) if (n.toUpperCase().startsWith(prefix)) items.push({ name: n, kind: 'name', description: tx('Defined name') })
  if (!items.length) return null
  return { start, items }
}

/** The innermost function call around the caret and which argument the caret is in. */
export function functionContext(text: string, caret: number): { name: string; arg: number } | null {
  if (!text.startsWith('=')) return null
  const stack: { name: string | null; arg: number }[] = []
  let pending: string | null = null
  for (const t of tokenize(text.slice(1, caret))) {
    if (t.type === 'func') pending = t.id!
    else if (t.type === 'lparen') {
      stack.push({ name: pending, arg: 0 })
      pending = null
    } else if (t.type === 'rparen') stack.pop()
    else if (t.type === 'comma' && stack.length) stack[stack.length - 1].arg++
    else if (t.type !== 'ws') pending = null
  }
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name) return { name: stack[i].name!, arg: stack[i].arg }
  return null
}

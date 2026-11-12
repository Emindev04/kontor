// Rich text inside one cell: runs of text with their own font settings on top of the cell style.
// While a text cell is edited, selected characters can be formatted (Bold, Italic, Underline,
// Strikethrough, font, size, color, superscript/subscript) like in the original.
import type { RichRun, RunStyle } from '../model/sheet'
import type { Style, StylePatch } from '../model/style'
import type { Doc } from './doc'

export type { RichRun, RunStyle }

export const RUN_KEYS = ['bold', 'italic', 'underline', 'strike', 'color', 'size', 'font', 'script'] as const
type RunKey = (typeof RUN_KEYS)[number]

const isRunKey = (k: string): k is RunKey => (RUN_KEYS as readonly string[]).includes(k)

function cleanStyle(s: RunStyle | undefined): RunStyle | undefined {
  if (!s) return undefined
  const out: RunStyle = {}
  for (const k of RUN_KEYS) {
    const v = s[k]
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

const sameStyle = (a: RunStyle | undefined, b: RunStyle | undefined) => JSON.stringify(cleanStyle(a) ?? {}) === JSON.stringify(cleanStyle(b) ?? {})

export const runsText = (runs: RichRun[]) => runs.map((r) => r.t).join('')

/** Merges neighbours with equal styles and drops empty runs; undefined when no run has its own style. */
export function normalizeRuns(runs: RichRun[] | undefined): RichRun[] | undefined {
  if (!runs) return undefined
  const out: RichRun[] = []
  for (const r of runs) {
    if (!r.t) continue
    const s = cleanStyle(r.s)
    const last = out[out.length - 1]
    if (last && sameStyle(last.s, s)) last.t += r.t
    else out.push(s ? { t: r.t, s } : { t: r.t })
  }
  return out.some((r) => r.s) ? out : undefined
}

/**
 * Replaces `del` characters at `start` with `ins`. Inserted text takes the style of the first replaced
 * character, or of the character before it when nothing is replaced.
 */
export function spliceRuns(runs: RichRun[], start: number, del: number, ins: string): RichRun[] {
  const styleAt = (i: number): RunStyle | undefined => {
    let pos = 0
    for (const r of runs) {
      if (i < pos + r.t.length) return r.s
      pos += r.t.length
    }
    return runs[runs.length - 1]?.s
  }
  const insStyle = del > 0 ? styleAt(start) : styleAt(Math.max(0, start - 1))
  const out: RichRun[] = []
  let pos = 0
  let inserted = false
  const insert = () => {
    if (!inserted && ins) out.push({ t: ins, s: insStyle })
    inserted = true
  }
  for (const r of runs) {
    const a = pos
    const b = pos + r.t.length
    pos = b
    if (b <= start) {
      out.push(r)
      continue
    }
    if (a >= start + del) {
      insert()
      out.push(r)
      continue
    }
    const before = r.t.slice(0, Math.max(0, start - a))
    const after = r.t.slice(Math.max(0, start + del - a))
    if (before) out.push({ t: before, s: r.s })
    if (after) {
      insert()
      out.push({ t: after, s: r.s })
    }
  }
  insert()
  return out.filter((r) => r.t)
}

/** Restyles characters [start, end). */
export function styleRuns(runs: RichRun[], start: number, end: number, fn: (s: RunStyle) => RunStyle): RichRun[] {
  const out: RichRun[] = []
  let pos = 0
  for (const r of runs) {
    const a = pos
    const b = pos + r.t.length
    pos = b
    if (b <= start || a >= end) {
      out.push(r)
      continue
    }
    const i = Math.max(0, start - a)
    const j = Math.min(r.t.length, end - a)
    if (i > 0) out.push({ t: r.t.slice(0, i), s: r.s })
    out.push({ t: r.t.slice(i, j), s: cleanStyle(fn({ ...(r.s ?? {}) })) })
    if (j < r.t.length) out.push({ t: r.t.slice(j), s: r.s })
  }
  return out
}

/** Effective style of a run (cell style plus the run's own settings). */
export function runStyle(base: Style, s: RunStyle | undefined): Style {
  const c = cleanStyle(s)
  if (!c) return base
  const { underline, ...rest } = c
  const out: Style = { ...base, ...rest }
  if (underline === 'none') delete out.underline
  else if (underline) out.underline = underline
  return out
}

/** Removes the given keys from every run (the whole cell got that setting). */
export function stripRunKeys(runs: RichRun[], keys: string[]): RichRun[] | undefined {
  const ks = keys.filter(isRunKey)
  if (!ks.length) return runs
  return normalizeRuns(
    runs.map((r) => {
      if (!r.s) return r
      const s = { ...r.s }
      for (const k of ks) delete s[k]
      return { t: r.t, s }
    }),
  )
}

/** Selected characters in the active editor (cell box or formula bar), or null. */
export function editorSelection(doc: Doc): { start: number; end: number } | null {
  const e = doc.edit
  if (!e || e.text.startsWith('=')) return null
  const el = document.querySelector<HTMLTextAreaElement>(e.source === 'bar' ? '.fx-input textarea' : '.cell-editor textarea')
  if (!el) return null
  const start = Math.min(el.selectionStart ?? 0, el.selectionEnd ?? 0)
  const end = Math.max(el.selectionStart ?? 0, el.selectionEnd ?? 0)
  return end > start ? { start, end } : null
}

/**
 * Applies a font-level change to the selected characters of the edited cell.
 * Returns false when there is no character selection or the change is not a font setting.
 */
export function applyRichPatch(doc: Doc, patch: StylePatch | ((s: Style) => StylePatch)): boolean {
  const e = doc.edit
  if (!e || typeof document === 'undefined') return false
  const sel = editorSelection(doc)
  if (!sel) return false
  const base = doc.style(e.r, e.c)
  if (typeof patch !== 'function' && !Object.keys(patch).every(isRunKey)) return false
  const runs = e.rich ?? [{ t: e.text }]
  const next = styleRuns(runs, sel.start, sel.end, (s) => {
    const p = typeof patch === 'function' ? patch(runStyle(base, s)) : patch
    const out: RunStyle = { ...s }
    for (const [k, v] of Object.entries(p)) {
      if (!isRunKey(k)) continue
      if (v !== undefined) (out as Record<string, unknown>)[k] = v
      else if (k === 'bold' || k === 'italic' || k === 'strike') out[k] = false
      else if (k === 'underline') out.underline = base.underline ? 'none' : undefined
      else delete out[k]
    }
    return out
  })
  doc.updateEdit({ rich: next })
  return true
}

/** Toggle for Bold / Italic / Strikethrough / Underline on the selected characters. */
export function toggleRich(doc: Doc, key: 'bold' | 'italic' | 'strike' | 'underline', kind: Style['underline'] = 'single'): boolean {
  const e = doc.edit
  const sel = editorSelection(doc)
  if (!e || !sel) return false
  const base = doc.style(e.r, e.c)
  const runs = e.rich ?? [{ t: e.text }]
  // on when any selected character does not have it yet
  let allOn = true
  let pos = 0
  for (const r of runs) {
    const a = pos
    pos += r.t.length
    if (pos <= sel.start || a >= sel.end) continue
    const st = runStyle(base, r.s)
    if (key === 'underline' ? st.underline !== kind : !st[key]) allOn = false
  }
  const value = key === 'underline' ? (allOn ? (base.underline ? 'none' : undefined) : kind) : !allOn
  doc.updateEdit({ rich: styleRuns(runs, sel.start, sel.end, (s) => ({ ...s, [key]: value })) })
  return true
}

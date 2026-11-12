// Keyboard handling shared by the in-cell editor and the formula bar.
import { enterStep } from '../model/prefs'
import type { Doc } from '../commands/doc'
import { toggleRich } from '../commands/richText'
import { cycleAbsolute } from '../engine/refs'
import { canPoint, suggestions } from './formulaAssist'

export function definedNames(doc: Doc): string[] {
  return [...doc.wb.names.values()].map((n) => n.name)
}

/** Accepts the highlighted autocomplete item. */
export function acceptSuggestion(doc: Doc, index?: number): boolean {
  const e = doc.edit
  if (!e || e.acOff) return false
  const s = suggestions(e.text, e.caret, definedNames(doc))
  if (!s) return false
  const item = s.items[index ?? e.ac ?? 0]
  if (!item) return false
  const insert = item.kind === 'function' ? item.name + '(' : item.name
  const text = e.text.slice(0, s.start) + insert + e.text.slice(e.caret)
  doc.updateEdit({ text, caret: s.start + insert.length, ac: 0, point: null })
  return true
}

/**
 * Handles a key while editing. Returns true when the key was consumed.
 * `alert` shows formula errors.
 */
export function handleEditKey(e: React.KeyboardEvent<HTMLTextAreaElement>, doc: Doc, alert: (msg: string) => void, focusGrid: () => void): boolean {
  const ed = doc.edit
  if (!ed) return false
  const el = e.currentTarget
  const caret = el.selectionStart ?? ed.caret
  const ctrl = e.ctrlKey || e.metaKey
  const sug = !ed.acOff ? suggestions(ed.text, caret, definedNames(doc)) : null

  const commit = (dr: number, dc: number, fill = false) => {
    const err = doc.commitEdit({ dr, dc }, fill)
    if (err) alert(err)
    else focusGrid()
  }

  switch (e.key) {
    case 'Enter':
      e.preventDefault()
      if (e.altKey) {
        const text = ed.text.slice(0, caret) + '\n' + ed.text.slice(el.selectionEnd ?? caret)
        doc.updateEdit({ text, caret: caret + 1, point: null })
        return true
      }
      if (ctrl) commit(0, 0, true)
      else {
        const step = enterStep(e.shiftKey)
        commit(step.dr, step.dc)
      }
      return true
    case 'Tab':
      e.preventDefault()
      if (sug && acceptSuggestion(doc)) return true
      commit(0, e.shiftKey ? -1 : 1)
      return true
    case 'Escape':
      e.preventDefault()
      if (sug) {
        doc.updateEdit({ acOff: true })
        return true
      }
      doc.cancelEdit()
      focusGrid()
      return true
    case 'F2':
      e.preventDefault()
      doc.updateEdit({ mode: ed.mode === 'enter' ? 'edit' : 'enter', point: null })
      return true
    case 'F4': {
      e.preventDefault()
      const r = cycleAbsolute(ed.text, caret)
      if (r) doc.updateEdit({ text: r.text, caret: r.end, point: ed.point ? { start: r.start, end: r.end } : null })
      return true
    }
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (sug && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const n = sug.items.length
        const cur = ed.ac ?? 0
        doc.updateEdit({ ac: (cur + (e.key === 'ArrowDown' ? 1 : -1) + n) % n })
        return true
      }
      if (ed.mode === 'edit') return false
      const dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
      const dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
      if (canPoint(ed.text, caret, ed.point)) {
        e.preventDefault()
        const base = ed.pointCell ?? { r: ed.r, c: ed.c }
        const sheet = doc.sheet
        const next = {
          r: dr ? sheet.rows.step(base.r, dr > 0 ? 1 : -1) : base.r,
          c: dc ? sheet.cols.step(base.c, dc > 0 ? 1 : -1) : base.c,
        }
        if (!ed.point && !ed.pointCell) {
          // the first arrow starts from the edited cell
          next.r = dr ? Math.max(0, ed.r + dr) : ed.r
          next.c = dc ? Math.max(0, ed.c + dc) : ed.c
        }
        doc.pointAt(next, e.shiftKey ? ed.pointAnchor ?? base : undefined)
        return true
      }
      e.preventDefault()
      commit(dr, dc)
      return true
    }
    default: {
      // formatting selected characters of a text cell
      if (ctrl && !e.altKey) {
        const k = e.key.toLowerCase()
        const kind = k === 'b' || k === '2' ? 'bold' : k === 'i' || k === '3' ? 'italic' : k === 'u' || k === '4' ? 'underline' : k === '5' ? 'strike' : null
        if (kind && toggleRich(doc, kind)) {
          e.preventDefault()
          return true
        }
      }
      return false
    }
  }
}

import type { Mark, RichDoc, SlideElement } from '../model/types'
import { findElement } from '../model/factory'
import { setMarkAll } from '../model/richtext'
import { commit, currentSlide, selectedElements, store, updateElements } from '../store/store'
import { getActiveEditor } from './activeEditor'

function firstRunMarks(doc: RichDoc | undefined): Mark[] {
  for (const p of doc?.content ?? []) for (const n of p.content ?? []) if (n.type === 'text') return n.marks ?? []
  return []
}

/** Picks up formatting from the text cursor or the selected object. */
export function pickFormat(sticky = false) {
  const ed = getActiveEditor()
  if (ed) {
    const marks = ed.state.selection.$from.marks().map((m) => m.toJSON() as Mark)
    store.set({ painter: { marks, sticky } })
    return
  }
  const el = selectedElements()[0]
  if (!el) return
  if (el.type === 'shape') store.set({ painter: { fill: el.fill, line: el.line, effects: el.effects, marks: firstRunMarks(el.text?.doc), sticky } })
  else if (el.type === 'image') store.set({ painter: { line: el.line, effects: el.effects, sticky } })
}

function withMarks(doc: RichDoc, marks: Mark[]): RichDoc {
  let out = doc
  for (const type of ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'highlight', 'textStyle'] as const) out = setMarkAll(out, { type } as Mark, false)
  for (const m of marks) out = setMarkAll(out, m, true)
  return out
}

/** Applies picked-up formatting to an object. */
export function paintElement(id: string) {
  const st = store.get()
  const p = st.painter
  if (!p) return false
  const el = findElement(currentSlide(st).elements, id)
  if (!el) return false
  commit((pres) =>
    updateElements(pres, st.slideId, [id], (e): SlideElement => {
      if (e.type === 'shape')
        return {
          ...e,
          ...(p.fill ? { fill: p.fill } : {}),
          ...(p.line !== undefined ? { line: p.line } : {}),
          ...(p.effects !== undefined ? { effects: p.effects } : {}),
          text: e.text && p.marks ? { ...e.text, doc: withMarks(e.text.doc, p.marks) } : e.text,
        }
      if (e.type === 'image') return { ...e, ...(p.line !== undefined ? { line: p.line } : {}), ...(p.effects !== undefined ? { effects: p.effects } : {}) }
      return e
    }),
  )
  if (!p.sticky) store.set({ painter: null })
  return true
}

/** Applies picked-up text formatting to the editor selection. */
export function paintSelection() {
  const st = store.get()
  const ed = getActiveEditor()
  if (!st.painter?.marks || !ed || ed.state.selection.empty) return false
  let chain = ed.chain().focus().unsetAllMarks()
  for (const m of st.painter.marks) chain = chain.setMark(m.type, 'attrs' in m ? m.attrs : {})
  chain.run()
  if (!st.painter.sticky) store.set({ painter: null })
  return true
}

// Text formatting that works both inside the open text editor and on whole selected shapes,
// like the original program (selecting a shape and pressing Bold formats all of its text).
import type { ChainedCommands, Editor } from '@tiptap/core'
import type { Mark, ParaAttrs, RichDoc, ShapeElement, SlideElement } from '../model/types'
import {
  changeCaseAll,
  changeCaseText,
  changeLevelAll,
  clearFormattingAll,
  hasMarkEverywhere,
  setMarkAll,
  setParaAll,
  setTextStyleAll,
  uniformTextStyle,
  type CaseMode,
  type TextStyleAttrs,
} from '../model/richtext'
import { commit, currentIndex, currentSlide, store, updateElements } from '../store/store'
import { currentTable, selectedTextShapes, updateTable } from '../store/actions'
import { mapCells } from '../model/table'
import { getActiveEditor } from './activeEditor'
import { changeLevel as editorChangeLevel } from './levels'
import { makeRenderCtx, textCtxFor } from '../render/context'

type SimpleMark = 'bold' | 'italic' | 'underline' | 'strike' | 'superscript' | 'subscript'

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96]

/** Runs `fn` on the word around an empty cursor (as the original does), else on the selection. */
function onWordOrSelection(ed: Editor, fn: (c: ChainedCommands) => ChainedCommands) {
  const sel = ed.state.selection
  if (sel.empty) {
    const $p = sel.$from
    const text = $p.parent.textBetween(0, $p.parent.content.size, undefined, '￼')
    let a = $p.parentOffset
    let b = a
    while (a > 0 && /[\p{L}\p{N}_]/u.test(text[a - 1])) a--
    while (b < text.length && /[\p{L}\p{N}_]/u.test(text[b])) b++
    if (a < $p.parentOffset && b > $p.parentOffset) {
      const base = $p.start()
      fn(ed.chain().focus().setTextSelection({ from: base + a, to: base + b }))
        .setTextSelection(sel.from)
        .run()
      return
    }
  }
  fn(ed.chain().focus()).run()
}

function updateTextShapes(fn: (doc: RichDoc, el: ShapeElement) => RichDoc) {
  // A selected table formats the selected cells (or all cells) instead.
  const table = currentTable()
  if (table) {
    updateTable((t, rg) => mapCells(t, rg, (cell) => ({ ...cell, doc: fn(cell.doc, { type: 'shape', text: { doc: cell.doc } } as unknown as ShapeElement) })))
    return true
  }
  const els = selectedTextShapes()
  if (!els.length) return false
  const ids = els.map((e) => e.id)
  commit((p) =>
    updateElements(p, store.get().slideId, ids, (e) => (e.type === 'shape' && e.text ? ({ ...e, text: { ...e.text, doc: fn(e.text.doc, e), fontScale: e.text.fontScale, lnSpcReduction: e.text.lnSpcReduction } } as SlideElement) : e)),
  )
  return true
}

export function isMarkActive(type: SimpleMark) {
  const ed = getActiveEditor()
  if (ed) return ed.isActive(type)
  const els = selectedTextShapes()
  return els.length > 0 && els.every((e) => hasMarkEverywhere(e.text!.doc, type))
}

export function toggleMark(type: SimpleMark) {
  const ed = getActiveEditor()
  if (ed) {
    onWordOrSelection(ed, (c) => c.toggleMark(type))
    return
  }
  const on = !isMarkActive(type)
  updateTextShapes((doc) => setMarkAll(doc, { type } as Mark, on))
}

export function textStyleValue<K extends keyof TextStyleAttrs>(key: K): TextStyleAttrs[K] | undefined {
  const ed = getActiveEditor()
  if (ed) return (ed.getAttributes('textStyle')[key] ?? undefined) as TextStyleAttrs[K] | undefined
  const els = selectedTextShapes()
  if (!els.length) return undefined
  const values = els.map((e) => uniformTextStyle(e.text!.doc, key))
  return values.every((v) => v === values[0]) ? values[0] : undefined
}

export function setTextStyle(patch: TextStyleAttrs) {
  const ed = getActiveEditor()
  if (ed) {
    onWordOrSelection(ed, (c) => c.setMark('textStyle', patch))
    return
  }
  updateTextShapes((doc) => setTextStyleAll(doc, patch))
}

export function setHighlight(color: string | null) {
  const ed = getActiveEditor()
  if (ed) {
    onWordOrSelection(ed, (c) => (color ? c.setMark('highlight', { color }) : c.unsetMark('highlight')))
    return
  }
  updateTextShapes((doc) => setMarkAll(doc, { type: 'highlight', attrs: { color: color ?? '' } }, !!color))
}

export function setLink(href: string | null) {
  const ed = getActiveEditor()
  if (ed) {
    if (href) ed.chain().focus().extendMarkRange('link').setMark('link', { href }).run()
    else ed.chain().focus().extendMarkRange('link').unsetMark('link').run()
    return
  }
  updateTextShapes((doc) => setMarkAll(doc, { type: 'link', attrs: { href: href ?? '' } }, !!href))
}

export function linkValue(): string | undefined {
  const ed = getActiveEditor()
  if (ed) return ed.getAttributes('link').href
  return undefined
}

export function clearFormatting() {
  const ed = getActiveEditor()
  if (ed) {
    ed.chain().focus().unsetAllMarks().run()
    return
  }
  updateTextShapes((doc) => clearFormattingAll(doc))
}

export function paraValue<K extends keyof ParaAttrs>(key: K): ParaAttrs[K] | undefined {
  const ed = getActiveEditor()
  if (ed) return ed.getAttributes('paragraph')[key] as ParaAttrs[K]
  const els = selectedTextShapes()
  const first = els[0]?.text?.doc.content[0]?.attrs
  return first?.[key]
}

export function setPara(patch: Partial<ParaAttrs>) {
  const ed = getActiveEditor()
  if (ed) {
    const { from, to } = ed.state.selection
    const tr = ed.state.tr
    ed.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch })
      return false
    })
    ed.view.dispatch(tr)
    ed.commands.focus()
    return
  }
  updateTextShapes((doc) => setParaAll(doc, patch))
}

export function changeLevel(delta: number) {
  const ed = getActiveEditor()
  if (ed) {
    editorChangeLevel(ed, delta)
    ed.commands.focus()
    return
  }
  updateTextShapes((doc) => changeLevelAll(doc, delta))
}

export function changeCase(mode: CaseMode) {
  const ed = getActiveEditor()
  if (ed) {
    const { from, to, empty } = ed.state.selection
    if (empty) return
    const tr = ed.state.tr
    ed.state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || !node.text) return
      const start = Math.max(from, pos)
      const end = Math.min(to, pos + node.nodeSize)
      const slice = node.text.slice(start - pos, end - pos)
      const replaced = changeCaseText(slice, mode, start === from)
      if (replaced !== slice) tr.replaceWith(start, end, ed.schema.text(replaced, node.marks))
    })
    ed.view.dispatch(tr)
    ed.commands.focus()
    return
  }
  updateTextShapes((doc) => changeCaseAll(doc, mode))
}

export function insertText(text: string) {
  const ed = getActiveEditor()
  if (ed) ed.chain().focus().insertContent(text).run()
}

export function insertField(kind: 'slidenum' | 'date') {
  const ed = getActiveEditor()
  if (ed) ed.chain().focus().insertContent({ type: 'field', attrs: { kind } }).run()
}

/** Default font size at the cursor (or of the first selected shape) when no explicit size is set. */
export function defaultFontSize(): number {
  const s = store.get()
  const slide = currentSlide(s)
  const el = selectedTextShapes()[0]
  if (!el) return 18
  const rc = makeRenderCtx(s.pres, currentIndex(s) + 1, slide.layout)
  const ctx = textCtxFor(el, rc)
  const ed = getActiveEditor()
  const level = ed ? (ed.getAttributes('paragraph').level ?? 0) : (el.text?.doc.content[0]?.attrs?.level ?? 0)
  return Math.round(ctx.sizes[Math.min(level, ctx.sizes.length - 1)] * (el.text?.fontScale ?? 1) * 2) / 2
}

export function currentFontSize(): number {
  return textStyleValue('fontSize') ?? defaultFontSize()
}

export function stepFontSize(dir: 1 | -1) {
  const cur = currentFontSize()
  const next = dir > 0 ? (FONT_SIZES.find((s) => s > cur) ?? cur + 10) : ([...FONT_SIZES].reverse().find((s) => s < cur) ?? Math.max(1, cur - 1))
  setTextStyle({ fontSize: next })
}

export function hasTextTarget() {
  return !!getActiveEditor() || selectedTextShapes().length > 0 || !!currentTable()
}

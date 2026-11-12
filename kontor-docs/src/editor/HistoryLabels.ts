import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { AddMarkStep, AttrStep, RemoveMarkStep, ReplaceAroundStep, ReplaceStep, type Step } from '@tiptap/pm/transform'
import { redoDepth, undoDepth } from '@tiptap/pm/history'
import type { Slice } from '@tiptap/pm/model'

// Names for the entries of the undo history ("Typing", "Bold", "Paste" …), shown in the Undo and
// Redo drop-downs. The history itself groups quick edits into one entry; the labels follow its depth.

type State = { undo: string[]; redo: string[] }
export const historyLabelsKey = new PluginKey<State>('historyLabels')

const MARK_NAMES: Record<string, string> = {
  bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough', subscript: 'Subscript', superscript: 'Superscript',
  highlight: 'Highlight', textStyle: 'Font', link: 'Hyperlink', comment: 'New Comment', insertion: 'Track Changes', deletion: 'Track Changes', formatChange: 'Track Changes',
}

const NODE_NAMES: Record<string, string> = {
  image: 'Insert Picture', table: 'Insert Table', shape: 'Insert Shape', textBox: 'Insert Text Box', chart: 'Insert Chart', diagram: 'Insert Diagram',
  pageBreak: 'Page Break', sectionBreak: 'Section Break', columnBreak: 'Column Break', horizontalRule: 'Horizontal Line', equation: 'Insert Equation',
  noteRef: 'Insert Note', field: 'Insert Field', bookmark: 'Bookmark', tableOfContents: 'Table of Contents', signatureLine: 'Signature Line',
}

/** A short description of what a transaction did. */
export function labelFor(tr: Transaction): string {
  const ui = tr.getMeta('uiEvent') as string | undefined
  if (ui === 'paste') return 'Paste'
  if (ui === 'drop') return 'Drag and Drop'
  if (ui === 'cut') return 'Cut'
  const steps: Step[] = tr.steps
  const marks = steps.filter((s) => s instanceof AddMarkStep || s instanceof RemoveMarkStep) as unknown as { mark: { type: { name: string } } }[]
  if (marks.length === steps.length && marks.length) return MARK_NAMES[marks[0].mark.type.name] ?? 'Formatting'
  if (steps.some((s) => s instanceof ReplaceAroundStep) || (steps.length && steps.every((s) => s instanceof AttrStep))) return 'Paragraph Formatting'
  for (const s of steps) {
    if (!(s instanceof ReplaceStep)) continue
    const slice = (s as unknown as { slice: Slice }).slice
    let node: string | null = null
    slice.content.descendants((n) => {
      if (!node && NODE_NAMES[n.type.name]) node = NODE_NAMES[n.type.name]
      return !node
    })
    if (node) return node
  }
  const replaces = steps.filter((s) => s instanceof ReplaceStep) as unknown as { from: number; to: number; slice: Slice }[]
  if (replaces.length && replaces.every((s) => !s.slice.size)) return 'Delete'
  if (replaces.some((s) => s.slice.content.childCount > 1 || s.slice.openStart === 0 && s.slice.content.firstChild?.isBlock)) return 'Typing'
  if (replaces.length) return replaces.some((s) => s.to > s.from) ? 'Replace' : 'Typing'
  return 'Edit'
}

export function historyLabels(state: EditorState): State {
  return historyLabelsKey.getState(state) ?? { undo: [], redo: [] }
}

export const HistoryLabels = Extension.create({
  name: 'historyLabels',
  // After the history plugin, so its new depth is known when a transaction is applied.
  priority: 50,

  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: historyLabelsKey,
        state: {
          init: () => ({ undo: [], redo: [] }),
          apply(tr, prev, _oldState, newState) {
            let depth: number
            let redo: number
            try {
              depth = undoDepth(newState)
              redo = redoDepth(newState)
            } catch {
              return prev
            }
            const oldDepth = prev.undo.length
            if (depth === oldDepth && redo === prev.redo.length) return prev
            const undo = [...prev.undo]
            const redoList = [...prev.redo]
            if (depth < oldDepth && redo > redoList.length) {
              // Undo: the entries move to the redo list.
              while (undo.length > depth) redoList.push(undo.pop()!)
            } else if (depth > oldDepth && redo < redoList.length) {
              // Redo: they come back.
              while (undo.length < depth && redoList.length) undo.push(redoList.pop()!)
            } else if (depth > oldDepth) {
              while (undo.length < depth) undo.push(labelFor(tr))
              redoList.length = 0
            }
            while (undo.length > depth) undo.shift()
            while (undo.length < depth) undo.unshift('Edit')
            redoList.length = Math.min(redoList.length, redo)
            while (redoList.length < redo) redoList.unshift('Edit')
            return { undo, redo: redoList }
          },
        },
      }),
    ]
  },
})

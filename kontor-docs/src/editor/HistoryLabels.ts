import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { AddMarkStep, AttrStep, RemoveMarkStep, ReplaceAroundStep, ReplaceStep, type Step } from '@tiptap/pm/transform'
import { redoDepth, undoDepth } from '@tiptap/pm/history'
import type { Slice } from '@tiptap/pm/model'
import { tx } from '../i18n'

// Names for the entries of the undo history ("Typing", "Bold", "Paste" …), shown in the Undo and
// Redo drop-downs. The history itself groups quick edits into one entry; the labels follow its depth.

type State = { undo: string[]; redo: string[] }
export const historyLabelsKey = new PluginKey<State>('historyLabels')

const MARK_NAMES: Record<string, string> = {
  bold: tx('Bold'), italic: tx('Italic'), underline: tx('Underline'), strike: tx('Strikethrough'), subscript: tx('Subscript'), superscript: tx('Superscript'),
  highlight: tx('Highlight'), textStyle: tx('Font'), link: tx('Hyperlink'), comment: tx('New Comment'), insertion: tx('Track Changes'), deletion: tx('Track Changes'), formatChange: tx('Track Changes'),
}

const NODE_NAMES: Record<string, string> = {
  image: tx('Insert Picture'), table: tx('Insert Table'), shape: tx('Insert Shape'), textBox: tx('Insert Text Box'), chart: tx('Insert Chart'), diagram: tx('Insert Diagram'),
  pageBreak: tx('Page Break'), sectionBreak: tx('Section Break'), columnBreak: tx('Column Break'), horizontalRule: tx('Horizontal Line'), equation: tx('Insert Equation'),
  noteRef: tx('Insert Note'), field: tx('Insert Field'), bookmark: tx('Bookmark'), tableOfContents: tx('Table of Contents'), signatureLine: tx('Signature Line'),
}

/** A short description of what a transaction did. */
export function labelFor(tr: Transaction): string {
  const ui = tr.getMeta('uiEvent') as string | undefined
  if (ui === 'paste') return tx('Paste')
  if (ui === 'drop') return tx('Drag and Drop')
  if (ui === 'cut') return tx('Cut')
  const steps: Step[] = tr.steps
  const marks = steps.filter((s) => s instanceof AddMarkStep || s instanceof RemoveMarkStep) as unknown as { mark: { type: { name: string } } }[]
  if (marks.length === steps.length && marks.length) return MARK_NAMES[marks[0].mark.type.name] ?? tx('Formatting')
  if (steps.some((s) => s instanceof ReplaceAroundStep) || (steps.length && steps.every((s) => s instanceof AttrStep))) return tx('Paragraph Formatting')
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
  if (replaces.length && replaces.every((s) => !s.slice.size)) return tx('Delete')
  if (replaces.some((s) => s.slice.content.childCount > 1 || s.slice.openStart === 0 && s.slice.content.firstChild?.isBlock)) return tx('Typing')
  if (replaces.length) return replaces.some((s) => s.to > s.from) ? tx('Replace') : tx('Typing')
  return tx('Edit')
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

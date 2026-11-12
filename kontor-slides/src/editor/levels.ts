// List level changes of the paragraphs in the selection (kept apart from the editor schema so the
// ribbon can use it without loading the editing engine).
import type { Editor } from '@tiptap/core'

export function changeLevel(editor: Editor, delta: number) {
  const { state, view } = editor
  const { from, to } = state.selection
  const tr = state.tr
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'paragraph') return
    const level = Math.max(0, Math.min(8, (node.attrs.level ?? 0) + delta))
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, level })
    return false
  })
  view.dispatch(tr)
  return true
}

import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'

type Rect = { x: number; y: number; w: number; h: number; flip: string | null }

/**
 * Places a drawn shape or text box: it is anchored to the paragraph under the drawn rectangle and
 * floats in front of the text at exactly the drawn position. A click without dragging inserts the
 * default 1-inch size.
 */
export function placeDrawing(editor: Editor, pagesEl: HTMLElement, pageWidth: number, kind: string, rect: Rect) {
  const view = editor.view
  const pagesRect = pagesEl.getBoundingClientRect()
  const scale = pagesRect.width / pageWidth || 1
  const hit = view.posAtCoords({ left: pagesRect.left + (rect.x + 4) * scale, top: pagesRect.top + (rect.y + 4) * scale })
  const pos = hit?.pos ?? editor.state.doc.content.size - 1
  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size))
  let depth = $pos.depth
  while (depth > 0 && !$pos.node(depth).isTextblock) depth--
  const isLine = kind.endsWith('ine') && /line$/i.test(kind)
  const w = rect.w < 5 ? 96 : Math.round(rect.w)
  const h = rect.h < 5 ? (isLine ? 0 : 96) : Math.round(rect.h)
  const blockPos = depth > 0 ? $pos.before(depth) : 0
  const blockDom = view.nodeDOM(blockPos) as HTMLElement | null
  const br = blockDom?.getBoundingClientRect() ?? pagesRect
  const offsetX = Math.round(rect.x - (br.left - pagesRect.left) / scale)
  const offsetY = Math.round(rect.y - (br.top - pagesRect.top) / scale)
  if (kind === 'textBox') {
    editor.chain().insertTextBox({ width: Math.max(w, 48), height: rect.h < 5 ? null : h, wrap: 'front', offsetX, offsetY }, blockPos).run()
    // Put the cursor in the new text box, its text selected.
    const inner = blockPos + 2
    const node = editor.state.doc.nodeAt(blockPos)
    if (node?.type.name === 'textBox') view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, inner, inner + node.firstChild!.content.size)))
    view.focus()
    return
  }
  const anchor = depth > 0 ? $pos.start(depth) : pos
  editor.chain().insertShape({ kind, width: w, height: Math.max(h, isLine ? 1 : 8), wrap: 'front', offsetX, offsetY, ...(rect.flip ? { flip: rect.flip } : {}), ...(isLine ? { fill: null, stroke: '#2F6FC4', strokeWidth: 1.5 } : {}) } as never, anchor).run()
  view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, anchor)))
  view.focus()
}

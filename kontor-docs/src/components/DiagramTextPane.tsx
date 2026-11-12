import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { X } from 'lucide-react'
import { diagramCursor, itemsToText, textToItems, type DiagramData } from '../editor/Diagram'

/** The selected diagram (position and data), or null. */
export function selectedDiagram(editor: Editor) {
  const sel = editor.state.selection
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'diagram') return null
  return { pos: sel.from, data: sel.node.attrs.data as DiagramData }
}

export function updateDiagram(editor: Editor, pos: number, data: DiagramData) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'diagram') return
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, data })
  tr.setSelection(NodeSelection.create(tr.doc, pos))
  editor.view.dispatch(tr)
}

/**
 * "Type your text here": the diagram's outline, one item per line. Tab and Shift+Tab change an
 * item's level; every edit redraws the diagram at once.
 */
export function DiagramTextPane({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const diagram = selectedDiagram(editor)
  const [text, setText] = useState(diagram ? itemsToText(diagram.data.items) : '')
  const ref = useRef<HTMLTextAreaElement>(null)
  const pos = diagram?.pos
  const items = diagram ? itemsToText(diagram.data.items) : ''
  // Another diagram, or a change from the ribbon (Add Shape, Promote …), reloads the outline.
  useEffect(() => {
    if (items !== text) setText(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, items])
  if (!diagram) return null

  const lineAt = (offset: number, value: string) => value.slice(0, offset).split('\n').length - 1
  const remember = () => {
    const el = ref.current
    if (el) diagramCursor.index = lineAt(el.selectionStart, el.value)
  }
  const commit = (value: string, caret?: number) => {
    setText(value)
    updateDiagram(editor, diagram.pos, { ...diagram.data, items: textToItems(value) })
    if (caret != null)
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.setSelectionRange(caret, caret)
        remember()
      })
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      // A new item starts at the level of the current one.
      e.preventDefault()
      const el = e.currentTarget
      const value = el.value
      const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1
      const indent = value.slice(start).match(/^\t*/)![0]
      const insert = `\n${indent}`
      commit(value.slice(0, el.selectionStart) + insert + value.slice(el.selectionEnd), el.selectionStart + insert.length)
      return
    }
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const value = el.value
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1
    if (e.shiftKey) {
      if (value[start] !== '\t') return
      commit(value.slice(0, start) + value.slice(start + 1), Math.max(start, el.selectionStart - 1))
    } else commit(`${value.slice(0, start)}\t${value.slice(start)}`, el.selectionStart + 1)
  }
  return (
    <div className="diagram-pane" role="dialog" aria-label="Diagram text">
      <div className="diagram-pane-title">
        <span>Type your text here</span>
        <button type="button" className="modal-close" aria-label="Close text pane" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <textarea
        ref={ref}
        value={text}
        spellCheck
        aria-label="Diagram items, one per line"
        onChange={(e) => commit(e.target.value)}
        onKeyDown={onKeyDown}
        onKeyUp={remember}
        onClick={remember}
        onFocus={remember}
      />
      <p className="diagram-pane-hint">One item per line. Tab indents an item, Shift+Tab moves it back.</p>
    </div>
  )
}

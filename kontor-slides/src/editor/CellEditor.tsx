import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { RichDoc } from '../model/types'
import type { TextCtx } from '../model/richtext'
import { buildExtensions } from './schema'
import { bumpEditor, setActiveEditor } from './activeEditor'
import { moveCell, takeTyped } from '../store/actions'
import type { EditEntry } from './TextEditor'

type Props = { doc: RichDoc; ctx: TextCtx; entry: EditEntry; spellcheck: boolean; onChange: (doc: RichDoc) => void }

/** Rich text editor for one table cell; Tab and Shift+Tab move to the next or previous cell. */
export function CellEditor({ doc, ctx, entry, spellcheck, onChange }: Props) {
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const extensions = useMemo(() => buildExtensions(ctxRef), [])
  const editor = useEditor({
    extensions,
    content: doc,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'rt rt-edit', spellcheck: String(spellcheck) },
      handleKeyDown: (_view, e) => {
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          moveCell(e.shiftKey ? -1 : 1)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichDoc),
    onTransaction: () => bumpEditor(),
  })

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    setActiveEditor(editor)
    if (entry.kind === 'point') {
      let pos: { pos: number } | null = null
      try {
        pos = editor.view.posAtCoords({ left: entry.x, top: entry.y })
      } catch {
        // The view is not mounted yet; fall back to the end of the text.
      }
      editor.commands.focus()
      if (pos) editor.commands.setTextSelection(pos.pos)
      else editor.commands.focus('end')
    } else if (entry.kind === 'all') editor.commands.focus('all')
    else if (entry.kind === 'end') editor.commands.focus('end')
    else editor.chain().focus('all').insertContent(entry.text).run()
    const ahead = takeTyped()
    if (ahead) editor.chain().focus().insertContent(ahead).run()
    return () => setActiveEditor(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return <EditorContent editor={editor} className="rt-editor" />
}

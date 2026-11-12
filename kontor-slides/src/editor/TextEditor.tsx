import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type { RichDoc, ShapeElement } from '../model/types'
import type { TextCtx } from '../model/richtext'
import { buildExtensions } from './schema'
import { bumpEditor, setActiveEditor } from './activeEditor'
import { measureAutofit } from '../render/ElementView'
import { takeTyped } from '../store/actions'
import { store } from '../store/store'

export type EditEntry = { kind: 'point'; x: number; y: number } | { kind: 'all' } | { kind: 'end' } | { kind: 'type'; text: string }

type Props = {
  el: ShapeElement
  ctx: TextCtx
  entry: EditEntry
  spellcheck: boolean
  onChange: (doc: RichDoc) => void
  onAutofit: (id: string, patch: { fontScale?: number; lnSpcReduction?: number; h?: number; w?: number }) => void
}

/** The editor's view exists only while its content is mounted (it throws otherwise). */
function hasView(editor: Editor) {
  try {
    return !editor.isDestroyed && !!editor.view.dom
  } catch {
    return false
  }
}

export function TextEditor({ el, ctx, entry, spellcheck, onChange, onAutofit }: Props) {
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const elRef = useRef(el)
  elRef.current = el
  const extensions = useMemo(() => buildExtensions(ctxRef), [])
  const editor = useEditor({
    extensions,
    content: el.text?.doc,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { class: 'rt rt-edit', spellcheck: String(spellcheck) } },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichDoc),
    onTransaction: () => bumpEditor(),
  })

  useEffect(() => {
    if (!editor || !hasView(editor)) return
    setActiveEditor(editor)
    const view = editor.view
    // Focus synchronously so typing right after the click lands in the editor.
    if (entry.kind === 'point') {
      const pos = view.posAtCoords({ left: entry.x, top: entry.y })
      editor.commands.focus()
      if (pos) editor.commands.setTextSelection(pos.pos)
      else editor.commands.focus('end')
    } else if (entry.kind === 'all') editor.commands.focus('all')
    else if (entry.kind === 'end') editor.commands.focus('end')
    else editor.chain().focus('all').insertContent(entry.text).run()
    const ahead = takeTyped()
    if (ahead) editor.chain().focus().insertContent(ahead).run()
    return () => setActiveEditor(null)
    // The entry only matters when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Keep autofit measurements current while typing.
  useLayoutEffect(() => {
    if (!editor) return
    const measure = () => {
      if (!hasView(editor)) return
      const dom = editor.view.dom as HTMLElement
      const tb = dom.closest('.tb') as HTMLElement | null
      if (!tb) return
      const patch = measureAutofit(tb, dom, elRef.current)
      if (patch) onAutofit(elRef.current.id, patch)
    }
    measure()
    editor.on('update', measure)
    return () => {
      editor.off('update', measure)
    }
  }, [editor, onAutofit, el.w, el.h])

  useEffect(() => {
    if (!editor || !hasView(editor)) return
    editor.view.dom.setAttribute('spellcheck', String(spellcheck))
    // The proofing language tells the browser's spell checker which dictionary to use.
    editor.view.dom.setAttribute('lang', store.get().pres.lang || 'en-US')
  }, [editor, spellcheck])

  return <EditorContent editor={editor} className="rt-editor" />
}

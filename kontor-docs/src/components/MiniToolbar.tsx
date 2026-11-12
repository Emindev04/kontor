import { useEffect, useState } from 'react'
import { AArrowDown, AArrowUp, Baseline, Bold, Highlighter, Italic, List, ListOrdered, Underline } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { FONT_SIZES, currentFont, currentFontSize, formatSize, parseSize, setFontSize, stepFontSize } from '../editor/commands'
import { ComboBox, RibbonButton } from './ui'
import { FONTS } from './tabs/HomeTab'
import type { AppApi } from './tabs/types'

/** Floating formatting bar that appears above a text selection made with the mouse. */
export function MiniToolbar({ editor, app }: { editor: Editor; app: AppApi }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const dom = editor.view.dom
    const show = () =>
      setTimeout(() => {
        const { from, to, empty } = editor.state.selection
        if (empty || !editor.isEditable || !editor.view.hasFocus()) return setPos(null)
        const a = editor.view.coordsAtPos(from)
        const b = editor.view.coordsAtPos(to)
        setPos({ x: Math.min(a.left, b.left), y: Math.min(a.top, b.top) })
      }, 0)
    const hide = () => setPos(null)
    dom.addEventListener('mouseup', show)
    dom.addEventListener('keydown', hide)
    document.addEventListener('scroll', hide, true)
    const onDown = (e: MouseEvent) => !(e.target as HTMLElement).closest?.('.mini-toolbar, .menu') && hide()
    document.addEventListener('mousedown', onDown)
    return () => {
      dom.removeEventListener('mouseup', show)
      dom.removeEventListener('keydown', hide)
      document.removeEventListener('scroll', hide, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [editor])

  if (!pos || editor.state.selection.empty) return null
  const chain = () => editor.chain().focus()
  const top = Math.max(8, pos.y - 78)
  const left = Math.max(8, Math.min(pos.x - 20, window.innerWidth - 330))
  return (
    <div className="mini-toolbar" style={{ top, left }} role="toolbar" aria-label="Formatting">
      <div className="row">
        <ComboBox title="Font" width={120} value={currentFont(editor)} options={FONTS} onCommit={(f) => chain().setFontFamily(f).run()} />
        <ComboBox title="Font Size" width={48} value={formatSize(currentFontSize(editor))} options={FONT_SIZES} onCommit={(v) => setFontSize(editor, parseSize(v))} />
        <RibbonButton icon={AArrowUp} label="Increase Font Size" onClick={() => stepFontSize(editor, 1)} />
        <RibbonButton icon={AArrowDown} label="Decrease Font Size" onClick={() => stepFontSize(editor, -1)} />
      </div>
      <div className="row">
        <RibbonButton icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
        <RibbonButton icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
        <RibbonButton icon={Underline} label="Underline" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()} />
        <RibbonButton icon={Highlighter} label="Text Highlight Color" onClick={() => chain().setHighlight({ color: app.highlightColor }).run()} />
        <RibbonButton icon={Baseline} label="Font Color" onClick={() => chain().setColor(app.fontColor).run()} />
        <RibbonButton icon={List} label="Bullets" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
        <RibbonButton icon={ListOrdered} label="Numbering" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
      </div>
    </div>
  )
}

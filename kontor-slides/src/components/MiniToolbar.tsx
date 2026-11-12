// The floating mini toolbar that appears above selected text (File > Options > Show Mini Toolbar on selection).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AArrowDown, AArrowUp, AlignCenter, AlignLeft, AlignRight, Baseline, Bold, Highlighter, Italic, List, Underline } from 'lucide-react'
import { getActiveEditor, useEditorVersion } from '../editor/activeEditor'
import * as T from '../editor/textCommands'
import { useStore } from '../store/store'
import { useOptions } from '../io/options'
import { cls, keepFocus } from './ui'
import { t } from '../i18n'

export function MiniToolbar() {
  const opts = useOptions()
  const editingId = useStore((s) => s.editingId)
  useEditorVersion()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [mouseDown, setMouseDown] = useState(false)

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('.mini-toolbar')) return
      setMouseDown(true)
      setPos(null)
    }
    const up = () => setMouseDown(false)
    const key = (e: KeyboardEvent) => !e.ctrlKey && !e.metaKey && setPos(null)
    document.addEventListener('mousedown', down, true)
    document.addEventListener('mouseup', up, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('mouseup', up, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [])

  // Show it once the mouse is released over a non-empty text selection.
  useEffect(() => {
    if (mouseDown || !opts.miniToolbar || !editingId) return
    const ed = getActiveEditor()
    const sel = window.getSelection()
    if (!ed || !sel || sel.isCollapsed || ed.state.selection.empty || !sel.rangeCount) return
    const r = sel.getRangeAt(0).getBoundingClientRect()
    if (!r.width && !r.height) return
    setPos({ x: Math.max(8, Math.min(window.innerWidth - 300, r.left)), y: Math.max(8, r.top - 46) })
  }, [mouseDown, opts.miniToolbar, editingId])

  if (!pos || !editingId || !opts.miniToolbar) return null
  const btn = (Icon: typeof Bold, label: string, run: () => void, active = false) => (
    <button type="button" className={cls('rb', active && 'is-active')} title={label} aria-label={label} onMouseDown={keepFocus} onClick={run}>
      <Icon size={15} />
    </button>
  )
  return createPortal(
    <div className="mini-toolbar" role="toolbar" aria-label={t('Mini toolbar')} style={{ left: pos.x, top: pos.y }}>
      {btn(AArrowUp, t('Increase Font Size'), () => T.stepFontSize(1))}
      {btn(AArrowDown, t('Decrease Font Size'), () => T.stepFontSize(-1))}
      {btn(Bold, t('Bold'), () => T.toggleMark('bold'), T.isMarkActive('bold'))}
      {btn(Italic, t('Italic'), () => T.toggleMark('italic'), T.isMarkActive('italic'))}
      {btn(Underline, t('Underline'), () => T.toggleMark('underline'), T.isMarkActive('underline'))}
      {btn(Highlighter, t('Text Highlight Color (yellow)'), () => getActiveEditor()?.chain().focus().toggleHighlight({ color: '#FFFF00' }).run())}
      {btn(Baseline, t('Font Color (red)'), () => T.setTextStyle({ color: '#FF0000' }))}
      {btn(AlignLeft, t('Align Left'), () => T.setPara({ align: 'left' }))}
      {btn(AlignCenter, t('Center'), () => T.setPara({ align: 'center' }))}
      {btn(AlignRight, t('Align Right'), () => T.setPara({ align: 'right' }))}
      {btn(List, t('Bullets'), () => T.setPara({ bullet: T.paraValue('bullet') && T.paraValue('bullet') !== 'none' ? 'none' : '•' }))}
    </div>,
    document.body,
  )
}

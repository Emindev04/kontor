import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ClipboardPaste, ClipboardType, Paintbrush, Type } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { endPastePreview, getLastPaste, insertPaste, startPastePreview, type PasteMode, type PastePreview } from '../editor/Paste'
import { cls, keepFocus } from './ui'
import { t, tx } from '../i18n'

const OPTIONS: { mode: PasteMode; label: string; key: string; icon: typeof ClipboardPaste }[] = [
  { mode: 'keep', label: tx('Keep Source Formatting'), key: 'K', icon: Paintbrush },
  { mode: 'merge', label: tx('Merge Formatting'), key: 'M', icon: ClipboardType },
  { mode: 'text', label: tx('Keep Text Only'), key: 'T', icon: Type },
]

/** The (Ctrl) button after a paste: pick how the pasted content should look. Ctrl alone opens it. */
export function PasteOptionsButton({ editor, onSetDefault }: { editor: Editor; onSetDefault: () => void }) {
  const last = getLastPaste(editor.state)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!last) {
      setPos(null)
      setOpen(false)
      return
    }
    const update = () => {
      try {
        const c = editor.view.coordsAtPos(Math.min(last.to, editor.state.doc.content.size))
        setPos({ left: c.right + 4, top: c.bottom + 2 })
      } catch {
        setPos(null)
      }
    }
    update()
    const canvas = document.querySelector('.canvas')
    canvas?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      canvas?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [last, editor])

  // Resting on an option shows the result live; moving away puts the paste back as it was.
  const preview = useRef<PastePreview | null>(null)
  const stopPreview = useCallback(() => {
    if (preview.current) endPastePreview(editor.view, preview.current)
    preview.current = null
  }, [editor])
  const startPreview = (mode: PasteMode) => {
    stopPreview()
    const current = getLastPaste(editor.state)
    if (current) preview.current = startPastePreview(editor.view, current, mode)
  }
  useEffect(() => {
    if (!open) stopPreview()
  }, [open, stopPreview])

  const choose = useCallback(
    (mode: PasteMode) => {
      stopPreview()
      setOpen(false)
      const current = getLastPaste(editor.state) ?? last
      if (current && mode !== current.mode) insertPaste(editor.view, current.html, current.text, mode, { from: current.from, to: current.to })
    },
    [editor, last, stopPreview],
  )

  useEffect(() => {
    if (!last) return
    let ctrlAlone = false
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        ctrlAlone = !e.repeat
        return
      }
      ctrlAlone = false
      if (!open) return
      const option = OPTIONS.find((o) => o.key === e.key.toUpperCase())
      if (option) {
        e.preventDefault()
        e.stopPropagation()
        choose(option.mode)
      } else if (e.key === 'Escape') setOpen(false)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' && ctrlAlone) setOpen((o) => !o)
      ctrlAlone = false
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  }, [last, open, choose])

  if (!last || !pos) return null
  return (
    <div className="paste-options" style={{ left: pos.left, top: pos.top }}>
      <button type="button" className={cls('paste-options-btn', open && 'is-open')} title={t('Paste Options (Ctrl)')} aria-label={t('Paste Options')} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ClipboardPaste size={14} />
        <span>{t('(Ctrl)')}</span>
      </button>
      {open && (
        <div className="menu paste-options-menu" role="menu">
          <div className="menu-heading">{t('Paste Options:')}</div>
          <div className="paste-options-row">
            {OPTIONS.map((o) => (
              <button
                key={o.mode}
                type="button"
                role="menuitem"
                className={cls('paste-option', last.mode === o.mode && 'is-active')}
                title={`${t(o.label)} (${o.key})`}
                aria-label={t(o.label)}
                onMouseDown={keepFocus}
                onMouseEnter={() => startPreview(o.mode)}
                onMouseLeave={stopPreview}
                onClick={() => choose(o.mode)}
              >
                <o.icon size={18} />
              </button>
            ))}
          </div>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onMouseDown={keepFocus}
            onClick={() => {
              setOpen(false)
              onSetDefault()
            }}
          >
            {t('Set Default Paste…')}</button>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Group, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { getMultiSelection, listDrawings, setMultiSelection } from '../editor/DrawingSelection'
import { cls, keepFocus } from './ui'
import { t } from '../i18n'

/** Selection Pane: every drawing object, front to back, to select, rename, hide and reorder. */
export function SelectionPane({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [renaming, setRenaming] = useState<number | null>(null)
  const drawings = listDrawings(editor.state.doc)
  // Front to back like the original: higher stacking order first, later objects in front.
  const ordered = [...drawings].sort((a, b) => (Number(b.node.attrs.zIndex) || 0) - (Number(a.node.attrs.zIndex) || 0) || b.pos - a.pos)
  const sel = editor.state.selection
  const multi = new Set(getMultiSelection(editor.state))
  const selected = (pos: number) => multi.has(pos) || (sel instanceof NodeSelection && sel.from === pos)

  const patch = (pos: number, attrs: Record<string, unknown>) => {
    const node = editor.state.doc.nodeAt(pos)
    if (node) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }))
  }
  const select = (pos: number, add: boolean) => {
    if (add) {
      const next = new Set(multi)
      if (sel instanceof NodeSelection) next.add(sel.from)
      if (next.has(pos)) next.delete(pos)
      else next.add(pos)
      setMultiSelection(editor.view, [...next])
    } else {
      editor.chain().focus().setNodeSelection(pos).run()
      ;(editor.view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({ block: 'center' })
    }
  }
  const move = (pos: number, delta: number) => {
    const node = editor.state.doc.nodeAt(pos)
    if (node) patch(pos, { zIndex: (Number(node.attrs.zIndex) || 0) + delta })
  }
  const setAll = (hidden: boolean) => {
    const tr = editor.state.tr
    for (const d of drawings) tr.setNodeMarkup(d.pos, undefined, { ...d.node.attrs, hidden })
    editor.view.dispatch(tr)
  }
  const current = ordered.find((d) => selected(d.pos))

  return (
    <aside className="styles-pane selection-pane" aria-label={t('Selection')}>
      <div className="nav-head">
        <strong>{t('Selection')}</strong>
        <button type="button" className="sb-btn" aria-label={t('Close Selection Pane')} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="selection-pane-tools">
        <button type="button" className="btn" onClick={() => setAll(false)}>
          {t('Show All')}</button>
        <button type="button" className="btn" onClick={() => setAll(true)}>
          {t('Hide All')}</button>
        <span className="spacer" />
        <button type="button" className="sb-btn" title={t('Bring Forward')} aria-label={t('Bring Forward')} disabled={!current} onClick={() => current && move(current.pos, 1)}>
          <ChevronUp size={14} />
        </button>
        <button type="button" className="sb-btn" title={t('Send Backward')} aria-label={t('Send Backward')} disabled={!current} onClick={() => current && move(current.pos, -1)}>
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="nav-list" role="listbox" aria-multiselectable="true">
        {ordered.length === 0 && <p className="dlg-hint selection-empty">{t('There are no shapes, pictures, charts or text boxes in this document.')}</p>}
        {ordered.map((d) => (
          <div key={d.pos} role="option" aria-selected={selected(d.pos)} className={cls('selection-row', selected(d.pos) && 'is-active', !!d.node.attrs.hidden && 'is-hidden')}>
            {d.node.attrs.groupId && <Group size={12} className="selection-group" aria-label={t('Grouped')} />}
            {renaming === d.pos ? (
              <input
                className="selection-name-input"
                defaultValue={d.name}
                autoFocus
                onBlur={(e) => {
                  patch(d.pos, { name: e.target.value.trim() || null })
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <button type="button" className="selection-name" title={t('Click to select, Ctrl/Shift+click to add, double-click to rename')} onMouseDown={keepFocus} onClick={(e) => select(d.pos, e.shiftKey || e.ctrlKey || e.metaKey)} onDoubleClick={() => setRenaming(d.pos)}>
                {d.name}
              </button>
            )}
            <button type="button" className="sb-btn" aria-label={d.node.attrs.hidden ? t('Show {name}', { name: d.name }) : t('Hide {name}', { name: d.name })} title={d.node.attrs.hidden ? t('Show') : t('Hide')} onClick={() => patch(d.pos, { hidden: !d.node.attrs.hidden })}>
              {d.node.attrs.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}

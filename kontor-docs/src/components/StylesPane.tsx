import { useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { allStyles, applyStyle, currentStyleId, formatOfSelection, type StyleDef, type StyleDefs } from '../editor/styleDefs'
import { MenuList, Popup, cls, keepFocus, usePopover } from './ui'

type Props = {
  editor: Editor
  defs: StyleDefs
  setDefs: (update: (d: StyleDefs) => StyleDefs) => void
  onClose: () => void
  onModify: (id: string | null) => void
}

function StyleRow({ s, active, preview, editor, setDefs, onModify }: { s: StyleDef; active: boolean; preview: boolean } & Pick<Props, 'editor' | 'setDefs' | 'onModify'>) {
  const menu = usePopover()
  const mark = s.kind === 'character' ? 'a' : '¶'
  return (
    <div className={cls('style-row-item', active && 'is-active')} ref={menu.ref}>
      <button type="button" className={cls('style-row-main', preview && `style-preview style-${s.id}`)} onMouseDown={keepFocus} onClick={() => applyStyle(editor, s)} title={s.name}>
        <span className="style-row-name">{s.name}</span>
        <span className="style-row-kind">{s.kind === 'character' ? mark : s.kind === 'heading' ? '¶a' : mark}</span>
      </button>
      <button type="button" className="style-row-menu" aria-label={`${s.name} options`} onMouseDown={keepFocus} onClick={() => menu.setOpen(!menu.open)}>
        <ChevronDown size={12} />
      </button>
      {menu.open && (
        <Popup anchor={menu.ref} role="menu">
          <MenuList
            close={() => menu.setOpen(false)}
            items={[
              { label: `Update ${s.name} to Match Selection`, onClick: () => setDefs((d) => ({ ...d, [s.id]: { ...s, ...d[s.id], format: { ...(d[s.id]?.format ?? {}), ...formatOfSelection(editor) } } })) },
              { label: 'Modify…', onClick: () => onModify(s.id) },
              ...(s.custom
                ? [{ label: `Delete ${s.name}…`, onClick: () => confirm(`Delete the style “${s.name}”?`) && setDefs((d) => {
                  const next = { ...d }
                  delete next[s.id]
                  return next
                }) }]
                : [{ label: 'Reset to Default', onClick: () => setDefs((d) => {
                  const next = { ...d }
                  delete next[s.id]
                  return next
                }) }]),
            ]}
          />
        </Popup>
      )}
    </div>
  )
}

/** Styles pane (Alt+Ctrl+Shift+S): every style, with apply, modify and update options. */
export function StylesPane({ editor, defs, setDefs, onClose, onModify }: Props) {
  const [preview, setPreview] = useState(false)
  const current = currentStyleId(editor)
  return (
    <aside className="styles-pane" aria-label="Styles">
      <div className="nav-head">
        <strong>Styles</strong>
        <button type="button" className="sb-btn" aria-label="Close styles pane" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <button
        type="button"
        className="style-row-item style-clear"
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().unsetAllMarks().setParagraph().updateAttributes('paragraph', { pStyle: null }).run()}
      >
        Clear All
      </button>
      <div className="nav-list">
        {allStyles(defs).map((s) => (
          <StyleRow key={s.id} s={s} active={current === s.id} preview={preview} editor={editor} setDefs={setDefs} onModify={onModify} />
        ))}
      </div>
      <div className="styles-pane-foot">
        <label>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Show Preview
        </label>
        <button type="button" className="btn" title="New Style" onClick={() => onModify(null)}>
          <Plus size={14} /> New Style
        </button>
      </div>
    </aside>
  )
}

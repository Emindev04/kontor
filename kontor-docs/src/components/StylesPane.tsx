import { useState } from 'react'
import { ChevronDown, Plus, ScanSearch, Settings2, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { allStyles, applyStyle, currentStyleId, formatOfSelection, type StyleDef, type StyleDefs } from '../editor/styleDefs'
import { MenuList, Popup, cls, keepFocus, usePopover } from './ui'
import { t } from '../i18n'
import { clearParagraphFormatting, clearTextFormatting, paragraphFormatting, textFormatting } from '../editor/styleInspector'

/** Style Inspector: the paragraph and text styles at the cursor with the formatting added on top. */
function StyleInspector({ editor, defs }: { editor: Editor; defs: StyleDefs }) {
  const styles = allStyles(defs)
  const name = (id: string | null | undefined) => styles.find((s) => s.id === id)?.name ?? id ?? ''
  const para = editor.isActive('heading') ? `h${editor.getAttributes('heading').level}` : ((editor.getAttributes('paragraph').pStyle as string | null) ?? 'normal')
  const charStyle = editor.getAttributes('charStyle').id as string | undefined
  const p = paragraphFormatting(editor)
  const tf = textFormatting(editor)
  return (
    <div className="style-inspector" aria-label={t('Style Inspector')}>
      <div className="si-head">{t('Paragraph formatting')}</div>
      <div className="si-row">
        <span>{name(para)}</span>
        <button type="button" className="sb-btn" title={t('Reset to Normal Paragraph Style')} aria-label={t('Reset to Normal Paragraph Style')} onMouseDown={keepFocus} onClick={() => editor.chain().focus().setParagraph().setParagraphStyle(null).run()}>
          <X size={12} />
        </button>
      </div>
      <div className="si-row">
        <span className="si-plus">{p.length ? `${t('Plus:')} ${p.join(', ')}` : t('<None>')}</span>
        <button type="button" className="sb-btn" title={t('Clear Paragraph Formatting')} aria-label={t('Clear Paragraph Formatting')} disabled={!p.length} onMouseDown={keepFocus} onClick={() => clearParagraphFormatting(editor)}>
          <X size={12} />
        </button>
      </div>
      <div className="si-head">{t('Text level formatting')}</div>
      <div className="si-row">
        <span>{charStyle ? name(charStyle) : t('Default Paragraph Font')}</span>
        <button type="button" className="sb-btn" title={t('Clear Character Style')} aria-label={t('Clear Character Style')} disabled={!charStyle} onMouseDown={keepFocus} onClick={() => editor.chain().focus().unsetCharStyle().run()}>
          <X size={12} />
        </button>
      </div>
      <div className="si-row">
        <span className="si-plus">{tf.length ? `${t('Plus:')} ${tf.join(', ')}` : t('<None>')}</span>
        <button type="button" className="sb-btn" title={t('Clear Character Formatting')} aria-label={t('Clear Character Formatting')} disabled={!tf.length} onMouseDown={keepFocus} onClick={() => clearTextFormatting(editor)}>
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

type Props = {
  editor: Editor
  defs: StyleDefs
  setDefs: (update: (d: StyleDefs) => StyleDefs) => void
  onClose: () => void
  onModify: (id: string | null) => void
  onManage: () => void
}

function StyleRow({ s, active, preview, editor, setDefs, onModify }: { s: StyleDef; active: boolean; preview: boolean } & Pick<Props, 'editor' | 'setDefs' | 'onModify'>) {
  const menu = usePopover()
  const mark = s.kind === 'character' ? 'a' : '¶'
  return (
    <div className={cls('style-row-item', active && 'is-active')} ref={menu.ref}>
      <button type="button" className={cls('style-row-main', preview && `style-preview style-${s.id}`)} onMouseDown={keepFocus} onClick={() => applyStyle(editor, s)} title={t(s.name)}>
        <span className="style-row-name">{t(s.name)}</span>
        <span className="style-row-kind">{s.kind === 'character' ? mark : s.kind === 'heading' ? '¶a' : mark}</span>
      </button>
      <button type="button" className="style-row-menu" aria-label={t('{name} options', { name: t(s.name) })} onMouseDown={keepFocus} onClick={() => menu.setOpen(!menu.open)}>
        <ChevronDown size={12} />
      </button>
      {menu.open && (
        <Popup anchor={menu.ref} role="menu">
          <MenuList
            close={() => menu.setOpen(false)}
            items={[
              { label: t('Update {name} to Match Selection', { name: t(s.name) }), onClick: () => setDefs((d) => ({ ...d, [s.id]: { ...s, ...d[s.id], format: { ...(d[s.id]?.format ?? {}), ...formatOfSelection(editor) } } })) },
              { label: t('Modify…'), onClick: () => onModify(s.id) },
              ...(s.custom
                ? [{ label: t('Delete {name}…', { name: s.name }), onClick: () => confirm(t('Delete the style “{name}”?', { name: s.name })) && setDefs((d) => {
                  const next = { ...d }
                  delete next[s.id]
                  return next
                }) }]
                : [{ label: t('Reset to Default'), onClick: () => setDefs((d) => {
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
export function StylesPane({ editor, defs, setDefs, onClose, onModify, onManage }: Props) {
  const [preview, setPreview] = useState(false)
  const [inspector, setInspector] = useState(false)
  const current = currentStyleId(editor)
  return (
    <aside className="styles-pane" aria-label={t('Styles')}>
      <div className="nav-head">
        <strong>{t('Styles')}</strong>
        <button type="button" className="sb-btn" aria-label={t('Close styles pane')} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <button
        type="button"
        className="style-row-item style-clear"
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().unsetAllMarks().setParagraph().updateAttributes('paragraph', { pStyle: null }).run()}
      >
        {t('Clear All')}</button>
      <div className="nav-list">
        {allStyles(defs).map((s) => (
          <StyleRow key={s.id} s={s} active={current === s.id} preview={preview} editor={editor} setDefs={setDefs} onModify={onModify} />
        ))}
      </div>
      {inspector && <StyleInspector editor={editor} defs={defs} />}
      <div className="styles-pane-foot">
        <label>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> {t('Show Preview')}</label>
        <button type="button" className="btn" title={t('New Style')} onClick={() => onModify(null)}>
          <Plus size={14} /> {t('New Style')}</button>
        <button type="button" className={cls('btn', inspector && 'is-active')} aria-pressed={inspector} title={t('Style Inspector')} onClick={() => setInspector(!inspector)}>
          <ScanSearch size={14} /> {t('Inspector')}
        </button>
        <button type="button" className="btn" title={t('Manage Styles')} onClick={onManage}>
          <Settings2 size={14} /> {t('Manage')}
        </button>
      </div>
    </aside>
  )
}

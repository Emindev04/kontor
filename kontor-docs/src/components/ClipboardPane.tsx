import { useSyncExternalStore } from 'react'
import { ClipboardPaste, Trash2, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { clearClipItems, clipboardItems, removeClipItem, subscribeClipboard } from '../editor/clipboardHistory'
import { insertPaste } from '../editor/Paste'
import { t } from '../i18n'

/** Home › Clipboard launcher: everything cut or copied, to paste again in any order. */
export function ClipboardPane({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const items = useSyncExternalStore(subscribeClipboard, clipboardItems)
  const paste = (html: string, text: string) => insertPaste(editor.view, html || null, text, 'keep')
  return (
    <aside className="nav-pane clipboard-pane" aria-label={t('Clipboard')}>
      <div className="nav-head">
        <strong>{t('Clipboard')}</strong>
        <button type="button" className="sb-btn" aria-label={t('Close clipboard')} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="clipboard-actions">
        <button type="button" className="btn" disabled={!items.length} onClick={() => [...items].reverse().forEach((i) => paste(i.html, `${i.text}\n`))}>
          <ClipboardPaste size={14} /> {t('Paste All')}</button>
        <button type="button" className="btn" disabled={!items.length} onClick={clearClipItems}>
          <Trash2 size={14} /> {t('Clear All')}</button>
      </div>
      <p className="nav-empty">{items.length ? t('Click an item to paste:') : t('Cut or copy something in the document and it shows up here.')}</p>
      <div className="nav-list">
        {items.map((i) => (
          <div key={i.id} className="clip-item">
            <button type="button" className="clip-text" title={t('Paste')} onClick={() => paste(i.html, i.text)}>
              {i.text.length > 160 ? `${i.text.slice(0, 160)}…` : i.text || t('(picture)')}
            </button>
            <button type="button" className="sb-btn" aria-label={t('Delete item')} onClick={() => removeClipItem(i.id)}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}

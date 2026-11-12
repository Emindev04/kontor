import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { htmlToText, insertPicture, readClipboard } from '../../editor/commands'
import { insertPaste } from '../../editor/Paste'
import { Modal, OkCancel, cls } from '../ui'

type Clip = Awaited<ReturnType<typeof readClipboard>>
type Format = 'html' | 'formatted' | 'text' | 'picture'

const FORMATS: { id: Format; label: string; result: string }[] = [
  { id: 'html', label: 'HTML Format', result: 'Inserts the contents of the Clipboard as HTML, with all of its formatting.' },
  { id: 'formatted', label: 'Formatted Text', result: 'Inserts the contents of the Clipboard as text with emphasis (bold, italic, links) but in the formatting of the destination.' },
  { id: 'text', label: 'Unformatted Unicode Text', result: 'Inserts the contents of the Clipboard as text without any formatting.' },
  { id: 'picture', label: 'Picture (PNG)', result: 'Inserts the contents of the Clipboard as a picture.' },
]

/** Home › Paste › Paste Special: choose the format the clipboard content is inserted in. */
export function PasteSpecialDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [clip, setClip] = useState<Clip | null>(null)
  const [error, setError] = useState(false)
  const [format, setFormat] = useState<Format>('html')
  useEffect(() => {
    readClipboard()
      .then((c) => {
        setClip(c)
        setFormat(c.html ? 'html' : c.text ? 'text' : 'picture')
      })
      .catch(() => setError(true))
  }, [])
  const available = (f: Format) => !!clip && (f === 'picture' ? !!clip.image : f === 'text' ? !!(clip.text || clip.html) : !!clip.html)
  const apply = () => {
    if (!clip || !available(format)) return
    onClose()
    if (format === 'picture') return insertPicture(editor, clip.image!)
    const text = clip.text || (clip.html ? htmlToText(clip.html) : '')
    insertPaste(editor.view, clip.html, text, format === 'html' ? 'keep' : format === 'formatted' ? 'merge' : 'text')
  }
  return (
    <Modal title="Paste Special" onClose={onClose} width={460} footer={<OkCancel onOk={apply} onCancel={onClose} okDisabled={!clip || !available(format)} />}>
      {error ? (
        <p className="dlg-hint">Your browser does not allow reading the Clipboard here. Use Ctrl+V (⌘+V on a Mac) and choose a Paste Option afterwards.</p>
      ) : !clip ? (
        <p className="dlg-hint">Reading the Clipboard…</p>
      ) : (
        <div className="dlg-stack">
          <div className="dlg-label">As:</div>
          <div className="dlg-list" role="listbox" aria-label="Paste as">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="option"
                aria-selected={format === f.id}
                disabled={!available(f.id)}
                className={cls('dlg-list-item', format === f.id && 'is-active')}
                onClick={() => setFormat(f.id)}
                onDoubleClick={apply}
              >
                {f.label}
              </button>
            ))}
          </div>
          <fieldset className="dlg-fieldset">
            <legend>Result</legend>
            <p className="dlg-hint">{FORMATS.find((f) => f.id === format)?.result}</p>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}

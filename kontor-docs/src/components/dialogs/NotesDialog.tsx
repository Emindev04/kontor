import { useState } from 'react'
import { formatNoteNumber, type NoteFormat, type NoteKind } from '../../editor/Notes'
import { Modal, OkCancel } from '../ui'
import type { AppApi } from '../tabs/types'

const FORMATS: NoteFormat[] = ['decimal', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman', 'symbol']

/** Footnote and Endnote dialog: numbering format and start number, and inserting a note. */
export function NotesDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [kind, setKind] = useState<NoteKind>('footnote')
  const [s, setS] = useState(app.noteSettings)
  const format = kind === 'footnote' ? s.footnoteFormat : s.endnoteFormat
  const start = kind === 'footnote' ? s.footnoteStart : s.endnoteStart
  const set = (patch: { format?: NoteFormat; start?: number }) =>
    setS(
      kind === 'footnote'
        ? { ...s, footnoteFormat: patch.format ?? s.footnoteFormat, footnoteStart: patch.start ?? s.footnoteStart }
        : { ...s, endnoteFormat: patch.format ?? s.endnoteFormat, endnoteStart: patch.start ?? s.endnoteStart },
    )
  return (
    <Modal
      title="Footnote and Endnote"
      onClose={onClose}
      width={400}
      footer={
        <OkCancel
          okLabel="Insert"
          onOk={() => {
            app.setNoteSettings(s)
            onClose()
            app.insertNote(kind)
          }}
          onCancel={onClose}
          extra={
            <button
              type="button"
              className="btn"
              onClick={() => {
                app.setNoteSettings(s)
                onClose()
              }}
            >
              Apply
            </button>
          }
        />
      }
    >
      <div className="dlg-stack">
        <fieldset className="dlg-fieldset">
          <legend>Location</legend>
          <label className="dlg-inline">
            <input type="radio" checked={kind === 'footnote'} onChange={() => setKind('footnote')} /> Footnotes: <span className="dlg-hint">Bottom of page</span>
          </label>
          <label className="dlg-inline">
            <input type="radio" checked={kind === 'endnote'} onChange={() => setKind('endnote')} /> Endnotes: <span className="dlg-hint">End of document</span>
          </label>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>Format</legend>
          <label className="dlg-inline">
            Number format:
            <select value={format} onChange={(e) => set({ format: e.target.value as NoteFormat })}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {[1, 2, 3].map((n) => formatNoteNumber(n, f)).join(', ')}, …
                </option>
              ))}
            </select>
          </label>
          <label className="dlg-inline">
            Start at: <input type="number" min={1} max={999} value={start} onChange={(e) => set({ start: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
        </fieldset>
      </div>
    </Modal>
  )
}

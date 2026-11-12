import { useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Modal, OkCancel } from '../ui'
import { DEFAULT_SETUP, type PageSetup } from '../../pageSetup'
import { PX_PER_IN } from '../../units'
import type { AppApi } from '../tabs/types'

export type NewDocument = { title: string; content: JSONContent; setup: Partial<PageSetup> }

const lines = (text: string, attrs: Record<string, unknown> = {}): JSONContent[] =>
  text
    .split('\n')
    .map((line) => ({ type: 'paragraph', attrs: { pStyle: 'noSpacing', ...attrs }, content: line ? [{ type: 'text', text: line }] : [] }))

const ENVELOPES: { id: string; label: string; w: number; h: number }[] = [
  { id: '10', label: 'Size 10 (4 1/8 × 9 1/2 in)', w: 9.5, h: 4.125 },
  { id: 'dl', label: 'DL (110 × 220 mm)', w: 8.66, h: 4.33 },
  { id: 'c5', label: 'C5 (162 × 229 mm)', w: 9.02, h: 6.38 },
  { id: 'monarch', label: 'Monarch (3 7/8 × 7 1/2 in)', w: 7.5, h: 3.875 },
  { id: '6.75', label: 'Size 6 3/4 (3 5/8 × 6 1/2 in)', w: 6.5, h: 3.625 },
]

/** Mailings > Envelopes: creates an envelope document with the return and delivery addresses. */
export function EnvelopesDialog({ app, onClose, onCreate }: { app: AppApi; onClose: () => void; onCreate: (doc: NewDocument, print: boolean) => void }) {
  const selected = app.mainEditor.state.selection.empty ? '' : app.mainEditor.state.doc.textBetween(app.mainEditor.state.selection.from, app.mainEditor.state.selection.to, '\n')
  const [delivery, setDelivery] = useState(selected)
  const [ret, setRet] = useState(app.settings.userName && app.settings.userName !== 'User' ? app.settings.userName : '')
  const [omit, setOmit] = useState(false)
  const [size, setSize] = useState('10')
  const make = (print: boolean) => {
    const env = ENVELOPES.find((e) => e.id === size)!
    const content: JSONContent = {
      type: 'doc',
      content: [...(omit ? [] : lines(ret || ' ', { spaceAfter: 0 })), ...lines(delivery || ' ', { indentLeft: Math.max(1.5, env.w / 2 - 0.75) }).map((p, i) => (i === 0 ? { ...p, attrs: { ...p.attrs, spaceBefore: Math.round(env.h * 18) } } : p))],
    }
    onCreate({ title: 'Envelope', content, setup: { size: 'custom', customSize: { w: env.h, h: env.w }, orientation: 'landscape', margins: { top: 0.4, bottom: 0.3, left: 0.4, right: 0.4 } } }, print)
    onClose()
  }
  return (
    <Modal
      title="Envelopes"
      onClose={onClose}
      width={460}
      footer={
        <OkCancel
          okLabel="Create Envelope"
          onOk={() => make(false)}
          onCancel={onClose}
          extra={
            <button type="button" className="btn" onClick={() => make(true)}>
              Print
            </button>
          }
        />
      }
    >
      <div className="dlg-stack">
        <label className="dlg-stack">
          Delivery address:
          <textarea rows={4} autoFocus value={delivery} onChange={(e) => setDelivery(e.target.value)} />
        </label>
        <label className="dlg-stack">
          Return address:
          <textarea rows={3} value={ret} disabled={omit} onChange={(e) => setRet(e.target.value)} />
        </label>
        <label><input type="checkbox" checked={omit} onChange={(e) => setOmit(e.target.checked)} /> Omit return address</label>
        <label className="dlg-inline">
          Envelope size:
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {ENVELOPES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <p className="dlg-hint">The envelope opens as a new document (this one stays in File › Open › Recent).</p>
      </div>
    </Modal>
  )
}

/** Label products: label size, sheet layout and margins (inches), on Letter paper. */
const LABELS: { id: string; label: string; w: number; h: number; cols: number; rows: number; top: number; left: number; gapX: number; gapY: number }[] = [
  { id: 'address30', label: 'Address – 2 5/8" × 1", 30 per sheet', w: 2.625, h: 1, cols: 3, rows: 10, top: 0.5, left: 0.19, gapX: 0.125, gapY: 0 },
  { id: 'shipping10', label: 'Shipping – 4" × 2", 10 per sheet', w: 4, h: 2, cols: 2, rows: 5, top: 0.5, left: 0.16, gapX: 0.19, gapY: 0 },
  { id: 'return80', label: 'Return Address – 1 3/4" × 1/2", 80 per sheet', w: 1.75, h: 0.5, cols: 4, rows: 20, top: 0.5, left: 0.28, gapX: 0.31, gapY: 0 },
  { id: 'badge8', label: 'Name Badge – 3 3/8" × 2 1/3", 8 per sheet', w: 3.375, h: 2.333, cols: 2, rows: 4, top: 0.6, left: 0.69, gapX: 0.375, gapY: 0.083 },
  { id: 'shipping6', label: 'Shipping – 4" × 3 1/3", 6 per sheet', w: 4, h: 3.333, cols: 2, rows: 3, top: 0.5, left: 0.16, gapX: 0.19, gapY: 0 },
]

/** Mailings > Labels: a sheet of labels as a table sized to the label product. */
export function LabelsDialog({ app, onClose, onCreate }: { app: AppApi; onClose: () => void; onCreate: (doc: NewDocument, print: boolean) => void }) {
  const selected = app.mainEditor.state.selection.empty ? '' : app.mainEditor.state.doc.textBetween(app.mainEditor.state.selection.from, app.mainEditor.state.selection.to, '\n')
  const [text, setText] = useState(selected)
  const [product, setProduct] = useState('address30')
  const [full, setFull] = useState(true)
  const make = (print: boolean) => {
    const p = LABELS.find((l) => l.id === product)!
    const px = (inch: number) => Math.round(inch * PX_PER_IN)
    const colwidths: number[] = []
    for (let c = 0; c < p.cols; c++) {
      colwidths.push(px(p.w))
      if (c < p.cols - 1 && p.gapX) colwidths.push(px(p.gapX))
    }
    const cell = (label: boolean, i: number) => ({
      type: 'tableCell',
      attrs: { colwidth: [colwidths[i]], verticalAlign: 'middle' },
      content: label && (full || i === 0) ? lines(text || ' ') : [{ type: 'paragraph', attrs: { pStyle: 'noSpacing' } }],
    })
    const rows: JSONContent[] = []
    for (let r = 0; r < p.rows; r++) {
      rows.push({
        type: 'tableRow',
        attrs: { rowHeight: px(p.h), cantSplit: true },
        content: colwidths.map((_, i) => cell(i % (p.gapX ? 2 : 1) === 0 && (full || r === 0), i)),
      })
      if (p.gapY && r < p.rows - 1) rows.push({ type: 'tableRow', attrs: { rowHeight: px(p.gapY) }, content: colwidths.map((_, i) => cell(false, i)) })
    }
    const content: JSONContent = { type: 'doc', content: [{ type: 'table', attrs: { tableStyle: 'plain', headerRow: false, cellPadding: 0.08 }, content: rows }, { type: 'paragraph', attrs: { pStyle: 'noSpacing' } }] }
    onCreate({ title: 'Labels', content, setup: { ...DEFAULT_SETUP, size: 'letter', orientation: 'portrait', margins: { top: p.top, bottom: 0.2, left: p.left, right: 0.1 } } }, print)
    onClose()
  }
  return (
    <Modal
      title="Labels"
      onClose={onClose}
      width={460}
      footer={
        <OkCancel
          okLabel="New Document"
          onOk={() => make(false)}
          onCancel={onClose}
          extra={
            <button type="button" className="btn" onClick={() => make(true)}>
              Print
            </button>
          }
        />
      }
    >
      <div className="dlg-stack">
        <label className="dlg-stack">
          Address:
          <textarea rows={4} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <fieldset className="dlg-fieldset">
          <legend>Print</legend>
          <label><input type="radio" checked={full} onChange={() => setFull(true)} /> Full page of the same label</label>
          <label><input type="radio" checked={!full} onChange={() => setFull(false)} /> Single label</label>
        </fieldset>
        <label className="dlg-inline">
          Label:
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            {LABELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  )
}

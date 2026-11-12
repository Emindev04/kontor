// New Table Style: a table style of the workbook's own (header, stripes, borders).
import { useState } from 'react'
import { registerTableStyles } from '../../model/tableStyles'
import { useApp } from '../appContext'
import { Modal, OkCancel } from '../ui'

export function NewTableStyleDialog({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const doc = app.doc
  const [name, setName] = useState(`Table Style ${doc.wb.tableStyles.length + 1}`)
  const [header, setHeader] = useState('#2F6FC4')
  const [headerText, setHeaderText] = useState('#FFFFFF')
  const [band, setBand] = useState('#DCE8F7')
  const [border, setBorder] = useState('#2F6FC4')
  const [bold, setBold] = useState(true)
  const ok = () => {
    const n = name.trim()
    if (!n) return app.alert('Type a name for the table style.')
    if (/^TableStyle(Light|Medium|Dark)\d+$/i.test(n)) return app.alert('This name is used by a built-in style.')
    doc.wb.tableStyles = [...doc.wb.tableStyles.filter((s) => s.name.toUpperCase() !== n.toUpperCase()), { name: n, header, headerText, band, border, bold }]
    registerTableStyles(doc.wb.tableStyles)
    doc.modified = true
    doc.emit()
    onClose()
  }
  const color = (label: string, v: string, set: (c: string) => void) => (
    <label className="dlg-inline">
      {label}
      <input type="color" value={v} onChange={(e) => set(e.target.value.toUpperCase())} />
    </label>
  )
  return (
    <Modal title="New Table Style" onClose={onClose} width={420} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        {color('Header Row fill', header, setHeader)}
        {color('Header Row font color', headerText, setHeaderText)}
        <label className="check-item"><input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} /> Bold header</label>
        {color('First Row Stripe', band, setBand)}
        {color('Borders and Total Row line', border, setBorder)}
        <div className="tstyle-sample" aria-label="Preview">
          <table>
            <tbody>
              <tr style={{ background: header, color: headerText, fontWeight: bold ? 700 : 400 }}><td>Item</td><td>Qty</td></tr>
              <tr style={{ background: band }}><td>Tea</td><td>12</td></tr>
              <tr><td>Coffee</td><td>8</td></tr>
              <tr style={{ background: band }}><td>Juice</td><td>5</td></tr>
              <tr style={{ fontWeight: 700, borderTop: `3px double ${border}` }}><td>Total</td><td>25</td></tr>
            </tbody>
          </table>
        </div>
        <p className="hint">Your styles appear under Custom in Format as Table and Table Styles. They are kept with the workbook; .xlsx files get a built-in style instead.</p>
      </div>
    </Modal>
  )
}

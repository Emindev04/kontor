// New Table Style: a table style of the workbook's own (header, stripes, borders).
import { useState } from 'react'
import { registerTableStyles } from '../../model/tableStyles'
import { useApp } from '../appContext'
import { Modal, OkCancel } from '../ui'
import { t } from '../../i18n'

export function NewTableStyleDialog({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const doc = app.doc
  const [name, setName] = useState(t('Table Style {n}', { n: doc.wb.tableStyles.length + 1 }))
  const [header, setHeader] = useState('#2F6FC4')
  const [headerText, setHeaderText] = useState('#FFFFFF')
  const [band, setBand] = useState('#DCE8F7')
  const [border, setBorder] = useState('#2F6FC4')
  const [bold, setBold] = useState(true)
  const ok = () => {
    const n = name.trim()
    if (!n) return app.alert(t('Type a name for the table style.'))
    if (/^TableStyle(Light|Medium|Dark)\d+$/i.test(n)) return app.alert(t('This name is used by a built-in style.'))
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
    <Modal title={t('New Table Style')} onClose={onClose} width={420} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>{t('Name')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        {color(t('Header Row fill'), header, setHeader)}
        {color(t('Header Row font color'), headerText, setHeaderText)}
        <label className="check-item"><input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />{' '}{t('Bold header')}</label>
        {color(t('First Row Stripe'), band, setBand)}
        {color(t('Borders and Total Row line'), border, setBorder)}
        <div className="tstyle-sample" aria-label={t('Preview')}>
          <table>
            <tbody>
              <tr style={{ background: header, color: headerText, fontWeight: bold ? 700 : 400 }}><td>{t('Item')}</td><td>{t('Qty')}</td></tr>
              <tr style={{ background: band }}><td>{t('Tea')}</td><td>12</td></tr>
              <tr><td>{t('Coffee')}</td><td>8</td></tr>
              <tr style={{ background: band }}><td>{t('Juice')}</td><td>5</td></tr>
              <tr style={{ fontWeight: 700, borderTop: `3px double ${border}` }}><td>{t('Total')}</td><td>25</td></tr>
            </tbody>
          </table>
        </div>
        <p className="hint">{t('Your styles appear under Custom in Format as Table and Table Styles. They are kept with the workbook; .xlsx files get a built-in style instead.')}</p>
      </div>
    </Modal>
  )
}

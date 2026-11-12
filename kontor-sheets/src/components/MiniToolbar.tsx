// The mini toolbar shown above the cell context menu: the most used formatting commands.
import { Baseline, Bold, DollarSign, Grid3x3, Italic, PaintBucket, Paintbrush, Percent, TableCellsMerge } from 'lucide-react'
import { DEFAULT_FONT, DEFAULT_SIZE } from '../model/style'
import { FONTS, SIZES, activeStyle, changeDecimals, setFormat, stepFontSize, toggleStyle } from './tabs/actions'
import { ComboBox, keepFocus } from './ui'
import { useApp, useDocVersion } from './appContext'
import { t, tx } from '../i18n'

export function MiniToolbar({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const st = activeStyle(doc)
  const b = (label: string, icon: React.ReactNode, onClick: () => void, active = false) => (
    <button type="button" className={active ? 'rb is-active' : 'rb'} title={label} aria-label={label} onMouseDown={keepFocus} onClick={onClick}>
      {icon}
    </button>
  )
  return (
    <div className="mini-toolbar" role="toolbar" aria-label={t('Mini toolbar')}>
      <div className="row">
        <ComboBox value={st.font ?? DEFAULT_FONT} options={FONTS} width={110} title={t('Font')} onCommit={(f) => f && doc.applyStyle({ font: f }, doc.sel.ranges, tx('Font'))} />
        <ComboBox value={String(st.size ?? DEFAULT_SIZE)} options={SIZES} width={46} title={t('Font Size')} onCommit={(v) => Number(v) >= 1 && doc.applyStyle({ size: Number(v) }, doc.sel.ranges, tx('Font Size'))} />
        {b(t('Increase Font Size'), <span className="mt-a">A↑</span>, () => stepFontSize(doc, 1))}
        {b(t('Decrease Font Size'), <span className="mt-a">A↓</span>, () => stepFontSize(doc, -1))}
        {b(t('Accounting Number Format'), <DollarSign size={15} />, () => setFormat(doc, '_($* #,##0.00_);_($* \\(#,##0.00\\);_($* "-"??_);_(@_)'))}
        {b(t('Percent Style'), <Percent size={15} />, () => setFormat(doc, '0%'))}
        {b(t('Comma Style'), <b className="mt-a">,</b>, () => setFormat(doc, '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)'))}
      </div>
      <div className="row">
        {b(t('Bold'), <Bold size={15} />, () => toggleStyle(doc, 'bold'), !!st.bold)}
        {b(t('Italic'), <Italic size={15} />, () => toggleStyle(doc, 'italic'), !!st.italic)}
        {b(t('Fill Color (yellow)'), <PaintBucket size={15} />, () => doc.applyStyle({ fill: '#FFFF00' }, doc.sel.ranges, tx('Fill Color')))}
        {b(t('Font Color (red)'), <Baseline size={15} />, () => doc.applyStyle({ color: '#FF0000' }, doc.sel.ranges, tx('Font Color')))}
        {b(t('Bottom Border'), <Grid3x3 size={15} />, () => doc.applyBorders('bottom', { style: 'thin', color: '#000000' }))}
        {b(t('Merge & Center'), <TableCellsMerge size={15} />, () => doc.merge('center'))}
        {b(t('Increase Decimal'), <small className="mt-a">.0→</small>, () => changeDecimals(doc, 1))}
        {b(t('Decrease Decimal'), <small className="mt-a">←.0</small>, () => changeDecimals(doc, -1))}
        {b(t('Format Painter'), <Paintbrush size={15} />, () => { onClose(); app.startPainter(false) })}
      </div>
    </div>
  )
}

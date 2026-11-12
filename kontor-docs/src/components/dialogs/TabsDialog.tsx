import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel, cls } from '../ui'
import type { TabAlign, TabLeader, TabStop } from '../../editor/TabStops'
import { formatLength, parseLength, type Unit } from '../../units'
import { t } from '../../i18n'

/** Tabs dialog: set, change and clear the tab stops of the selected paragraphs. */
export function TabsDialog({ editor, unit, onClose }: { editor: Editor; unit: Unit; onClose: () => void }) {
  const para = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const [stops, setStops] = useState<TabStop[]>(((para.tabStops as TabStop[] | null) ?? []).slice().sort((a, b) => a.pos - b.pos))
  const [text, setText] = useState(stops[0] ? formatLength(stops[0].pos, unit) : '')
  const [align, setAlign] = useState<TabAlign>(stops[0]?.align ?? 'left')
  const [leader, setLeader] = useState<TabLeader>(stops[0]?.leader ?? 'none')
  const [error, setError] = useState('')
  const set = () => {
    const pos = parseLength(text, unit)
    if (pos == null || pos <= 0 || pos > 22) return setError(t('Enter a position, for example 1.5".'))
    setError('')
    setStops([...stops.filter((s) => Math.abs(s.pos - pos) > 0.005), { pos: Math.round(pos * 10000) / 10000, align, leader }].sort((a, b) => a.pos - b.pos))
  }
  const pick = (s: TabStop) => {
    setText(formatLength(s.pos, unit))
    setAlign(s.align)
    setLeader(s.leader)
  }
  const apply = () => {
    editor.chain().focus().setParagraphFormat({ tabStops: stops.length ? stops : null }).run()
    onClose()
  }
  return (
    <Modal title={t('Tabs')} onClose={onClose} width={440} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="tabs-dlg">
        <div className="dlg-stack">
          <label className="dlg-stack">
            {t('Tab stop position:')}<input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && set()} />
          </label>
          <div className="tabs-list" role="listbox" aria-label={t('Tab stops')}>
            {stops.map((s) => (
              <button key={s.pos} type="button" role="option" aria-selected={formatLength(s.pos, unit) === text} className={cls('menu-item', formatLength(s.pos, unit) === text && 'is-active')} onClick={() => pick(s)}>
                {formatLength(s.pos, unit)} – {s.align}
                {s.leader !== 'none' ? `, ${s.leader} leader` : ''}
              </button>
            ))}
          </div>
          <p className="dlg-hint">{t('Default tab stops:')}{' '}{formatLength(0.5, unit)}</p>
        </div>
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>{t('Alignment')}</legend>
            {(['left', 'center', 'right', 'decimal', 'bar'] as const).map((a) => (
              <label key={a}>
                <input type="radio" checked={align === a} onChange={() => setAlign(a)} /> {a[0].toUpperCase() + a.slice(1)}
              </label>
            ))}
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>{t('Leader')}</legend>
            {(['none', 'dot', 'dash', 'underline'] as const).map((l, i) => (
              <label key={l}>
                <input type="radio" checked={leader === l} onChange={() => setLeader(l)} /> {i + 1} {l === 'none' ? t('None') : l === 'dot' ? '.......' : l === 'dash' ? '-------' : '_______'}
              </label>
            ))}
          </fieldset>
        </div>
      </div>
      {error && <p className="dlg-error">{error}</p>}
      <div className="dlg-inline">
        <button type="button" className="btn" onClick={set}>
          {t('Set')}</button>
        <button type="button" className="btn" onClick={() => setStops(stops.filter((s) => formatLength(s.pos, unit) !== text))}>
          {t('Clear')}</button>
        <button type="button" className="btn" onClick={() => setStops([])}>
          {t('Clear All')}</button>
      </div>
    </Modal>
  )
}

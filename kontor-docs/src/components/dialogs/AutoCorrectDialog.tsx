import { useState } from 'react'
import { Modal, OkCancel, cls } from '../ui'
import { DEFAULT_AUTOCORRECT } from '../../editor/AutoCorrect'
import type { AppApi } from '../tabs/types'
import { t } from '../../i18n'

/** AutoCorrect options: the replacement list and the AutoFormat-as-you-type switches. */
export function AutoCorrectDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [entries, setEntries] = useState<[string, string][]>(app.settings.autoCorrectEntries ?? DEFAULT_AUTOCORRECT)
  const [replace, setReplace] = useState('')
  const [withText, setWithText] = useState('')
  const [enabled, setEnabled] = useState(app.settings.autoCorrect)
  const [quotes, setQuotes] = useState(app.settings.smartQuotes)
  const apply = () => {
    app.setSettings({ ...app.settings, autoCorrect: enabled, smartQuotes: quotes, autoCorrectEntries: entries })
    onClose()
  }
  const add = () => {
    if (!replace.trim() || !withText) return
    const next: [string, string][] = [...entries.filter(([f]) => f !== replace.trim()), [replace.trim(), withText]]
    setEntries(next.sort((a, b) => a[0].localeCompare(b[0])))
    setReplace('')
    setWithText('')
  }
  return (
    <Modal title={t('AutoCorrect')} onClose={onClose} width={480} footer={<OkCancel onOk={apply} onCancel={onClose} extra={<button type="button" className="btn" onClick={() => setEntries(DEFAULT_AUTOCORRECT)}>{t('Reset')}</button>} />}>
      <div className="dlg-stack">
        <label><input type="checkbox" checked={quotes} onChange={(e) => setQuotes(e.target.checked)} /> {t('Replace "straight quotes" with “smart quotes”')}</label>
        <label><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t('Replace text as you type')}</label>
        <div className="dlg-inline">
          <label className="dlg-stack">
            {t('Replace:')}<input value={replace} onChange={(e) => setReplace(e.target.value)} />
          </label>
          <label className="dlg-stack">
            {t('With:')}<input value={withText} onChange={(e) => setWithText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </label>
          <button type="button" className="btn" onClick={add}>
            {t('Add')}</button>
          <button type="button" className="btn" disabled={!entries.some(([f]) => f === replace)} onClick={() => setEntries(entries.filter(([f]) => f !== replace))}>
            {t('Delete')}</button>
        </div>
        <div className="autocorrect-list" role="listbox" aria-label={t('Replacements')}>
          {entries.map(([f, t]) => (
            <button key={f} type="button" role="option" aria-selected={replace === f} className={cls('autocorrect-row', replace === f && 'is-active')} onClick={() => (setReplace(f), setWithText(t))}>
              <span>{f}</span>
              <span>{t}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

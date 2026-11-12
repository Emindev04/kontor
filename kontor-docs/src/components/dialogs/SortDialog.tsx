import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel } from '../ui'
import { t } from '../../i18n'
import { fieldCount, selectedTable, sortSelection, type SortKey, type SortType } from '../../editor/sortText'

type KeyState = SortKey & { on: boolean }

/** Home › Sort: Sort Text dialog (paragraphs, fields or table columns; text, number or date). */
export function SortDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const inTable = !!selectedTable(editor)
  const [sep, setSep] = useState<'tab' | 'comma' | 'other'>('tab')
  const [other, setOther] = useState('-')
  const separator = sep === 'tab' ? '\t' : sep === 'comma' ? ',' : other || '-'
  const count = fieldCount(editor, separator)
  const [keys, setKeys] = useState<KeyState[]>([
    { on: true, field: inTable ? 1 : 0, type: 'text', descending: false },
    { on: false, field: inTable ? 2 : 0, type: 'text', descending: false },
    { on: false, field: inTable ? 3 : 0, type: 'text', descending: false },
  ])
  const [headerRow, setHeaderRow] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [error, setError] = useState('')

  const fields = inTable
    ? Array.from({ length: count }, (_, i) => ({ id: i + 1, label: t('Column {n}', { n: i + 1 }) }))
    : [{ id: 0, label: t('Paragraphs') }, ...Array.from({ length: count > 1 ? count : 0 }, (_, i) => ({ id: i + 1, label: t('Field {n}', { n: i + 1 }) }))]

  const apply = () => {
    const ok = sortSelection(editor, { keys: keys.filter((k, i) => i === 0 || k.on), separator, headerRow, caseSensitive })
    if (!ok) return setError(t('Select at least two paragraphs or table rows to sort.'))
    onClose()
  }

  const keyRow = (i: number, label: string) => {
    const k = keys[i]
    const set = (patch: Partial<KeyState>) => setKeys(keys.map((x, j) => (j === i ? { ...x, ...patch } : x)))
    return (
      <fieldset className="dlg-fieldset" key={i}>
        <legend>
          {i > 0 ? (
            <label>
              <input type="checkbox" checked={k.on} onChange={(e) => set({ on: e.target.checked })} /> {label}
            </label>
          ) : (
            label
          )}
        </legend>
        <div className="dlg-inline" aria-disabled={i > 0 && !k.on}>
          <select aria-label={label} value={k.field} disabled={i > 0 && !k.on} onChange={(e) => set({ field: Number(e.target.value) })}>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {t(f.label)}
              </option>
            ))}
          </select>
          {t('Type:')}
          <select value={k.type} disabled={i > 0 && !k.on} onChange={(e) => set({ type: e.target.value as SortType })}>
            <option value="text">{t('Text')}</option>
            <option value="number">{t('Number')}</option>
            <option value="date">{t('Date')}</option>
          </select>
          <label>
            <input type="radio" name={`dir${i}`} checked={!k.descending} disabled={i > 0 && !k.on} onChange={() => set({ descending: false })} /> {t('Ascending')}
          </label>
          <label>
            <input type="radio" name={`dir${i}`} checked={k.descending} disabled={i > 0 && !k.on} onChange={() => set({ descending: true })} /> {t('Descending')}
          </label>
        </div>
      </fieldset>
    )
  }

  return (
    <Modal title={t('Sort Text')} onClose={onClose} width={520} footer={<OkCancel onOk={apply} onCancel={onClose} extra={error && <span className="dlg-error">{error}</span>} />}>
      {keyRow(0, t('Sort by'))}
      {keyRow(1, t('Then by'))}
      {keyRow(2, t('Then by'))}
      <fieldset className="dlg-fieldset">
        <legend>{t('My list has')}</legend>
        <div className="dlg-inline">
          <label>
            <input type="radio" name="header" checked={headerRow} onChange={() => setHeaderRow(true)} /> {t('Header row')}
          </label>
          <label>
            <input type="radio" name="header" checked={!headerRow} onChange={() => setHeaderRow(false)} /> {t('No header row')}
          </label>
        </div>
      </fieldset>
      <fieldset className="dlg-fieldset">
        <legend>{t('Options')}</legend>
        {!inTable && (
          <div className="dlg-inline">
            {t('Separate fields at:')}
            <label>
              <input type="radio" name="sep" checked={sep === 'tab'} onChange={() => setSep('tab')} /> {t('Tabs')}
            </label>
            <label>
              <input type="radio" name="sep" checked={sep === 'comma'} onChange={() => setSep('comma')} /> {t('Commas')}
            </label>
            <label>
              <input type="radio" name="sep" checked={sep === 'other'} onChange={() => setSep('other')} /> {t('Other:')}
            </label>
            <input value={other} maxLength={1} style={{ width: 32 }} onChange={(e) => (setOther(e.target.value), setSep('other'))} aria-label={t('Other:')} />
          </div>
        )}
        <label>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> {t('Case sensitive')}
        </label>
      </fieldset>
    </Modal>
  )
}

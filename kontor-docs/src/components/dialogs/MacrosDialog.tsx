import { useState } from 'react'
import { Modal, cls } from '../ui'
import { t } from '../../i18n'
import { describeStep, loadMacros, runMacro, saveMacros, validMacroName, type Macro } from '../../editor/macros'
import type { AppApi } from '../tabs/types'

/** View › Macros › Record Macro: name and description, then the recorder starts. */
export function RecordMacroDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [name, setName] = useState(() => `Macro${loadMacros().length + 1}`)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const start = () => {
    if (!validMacroName(name)) return setError(t('Macro names start with a letter and contain only letters, digits and underscores.'))
    onClose()
    app.startMacro(name, description)
  }
  return (
    <Modal
      title={t('Record Macro')}
      onClose={onClose}
      width={420}
      footer={
        <>
          {error && <span className="dlg-error">{error}</span>}
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={start}>
            {t('OK')}</button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
        </>
      }
    >
      <div className="dlg-stack">
        <label className="dlg-col">
          {t('Macro name:')}
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="dlg-col">
          {t('Description:')}
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <p className="dlg-hint">{t('Typing, keys, ribbon commands and menu choices are recorded until you click Stop Recording. Macros are kept on this device.')}</p>
      </div>
    </Modal>
  )
}

/** View › Macros › View Macros: run, rename, delete and inspect recorded macros. */
export function MacrosDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [list, setList] = useState<Macro[]>(loadMacros)
  const [selected, setSelected] = useState(list[0]?.name ?? '')
  const [message, setMessage] = useState('')
  const macro = list.find((m) => m.name === selected)
  const update = (next: Macro[]) => {
    setList(next)
    saveMacros(next)
  }
  const run = async () => {
    if (!macro) return
    onClose()
    const failed = await runMacro(macro, app.mainEditor)
    if (failed) alert(t('{n} recorded steps could not be repeated.', { n: failed }))
  }
  const rename = () => {
    if (!macro) return
    const name = prompt(t('Macro name:'), macro.name)
    if (!name || name === macro.name) return
    if (!validMacroName(name)) return setMessage(t('Macro names start with a letter and contain only letters, digits and underscores.'))
    update(list.map((m) => (m === macro ? { ...m, name } : m)))
    setSelected(name)
  }
  const remove = () => {
    if (!macro || !confirm(t('Delete the macro “{name}”?', { name: macro.name }))) return
    const next = list.filter((m) => m !== macro)
    update(next)
    setSelected(next[0]?.name ?? '')
  }
  return (
    <Modal
      title={t('Macros')}
      onClose={onClose}
      width={520}
      footer={
        <>
          {message && <span className="dlg-error">{message}</span>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t('Close')}
          </button>
        </>
      }
    >
      <div className="macros-dialog">
        <div className="dlg-col">
          <div className="dlg-label">{t('Macro name:')}</div>
          <div className="dlg-list" role="listbox" aria-label={t('Macros')}>
            {list.length === 0 && <span className="dlg-hint">{t('No macros recorded yet.')}</span>}
            {list.map((m) => (
              <button key={m.name} type="button" role="option" aria-selected={m.name === selected} className={cls('dlg-list-item', m.name === selected && 'is-active')} onClick={() => setSelected(m.name)} onDoubleClick={run}>
                {m.name}
              </button>
            ))}
          </div>
          {macro && (
            <>
              <div className="dlg-label">{t('Description:')}</div>
              <p className="dlg-hint">{macro.description || '—'}</p>
              <div className="dlg-label">{t('Steps')}</div>
              <ol className="macro-steps">
                {macro.steps.map((s, i) => (
                  <li key={i}>{describeStep(s)}</li>
                ))}
              </ol>
            </>
          )}
        </div>
        <div className="macros-buttons">
          <button type="button" className="btn btn-primary" disabled={!macro} onClick={run}>
            {t('Run')}
          </button>
          <button type="button" className="btn" disabled={!macro} onClick={rename}>
            {t('Rename…')}
          </button>
          <button type="button" className="btn" disabled={!macro} onClick={remove}>
            {t('Delete')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose()
              app.openDialog('recordMacro')
            }}
          >
            {t('Record…')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

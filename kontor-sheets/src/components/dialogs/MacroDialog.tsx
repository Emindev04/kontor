// View > Macros > View Macros: run or delete recorded macros, or start recording a new one.
import { useState } from 'react'
import { t } from '../../i18n'
import { deleteMacro, runMacro, startRecording, suggestMacroName } from '../../commands/macros'
import { useApp } from '../appContext'
import { Modal } from '../ui'

export function MacrosDialog({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const doc = app.doc
  const macros = doc.wb.macros
  const [sel, setSel] = useState(macros[0]?.name ?? '')
  const [, force] = useState(0)
  const macro = macros.find((m) => m.name === sel)
  const run = () => {
    if (!macro) return
    onClose()
    const err = runMacro(doc, macro.name)
    if (err) app.alert(t(err))
  }
  return (
    <Modal
      title={t('Macro')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn-primary" disabled={!macro} onClick={run}>
            {t('Run')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!macro}
            onClick={() => {
              if (!macro) return
              deleteMacro(doc, macro.name)
              setSel(doc.wb.macros[0]?.name ?? '')
              force((n) => n + 1)
            }}
          >
            {t('Delete')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
        </>
      }
    >
      {macros.length === 0 ? (
        <p>{t('There are no macros in this workbook. Use Record Macro to record one.')}</p>
      ) : (
        <div className="list-box">
          {macros.map((m) => (
            <button key={m.name} type="button" className={`list-item${m.name === sel ? ' is-active' : ''}`} onClick={() => setSel(m.name)} onDoubleClick={run}>
              {m.name}
            </button>
          ))}
        </div>
      )}
      {macro && (
        <p className="dlg-hint">
          {t('{n} recorded steps', { n: macro.steps.length })} · {macro.relative ? t('Relative references') : t('Absolute references')}
        </p>
      )}
      <p className="dlg-hint">{t('Macros record the changes your commands make to cells (contents and formatting) and repeat them. They are kept with the workbook in this browser, not in .xlsx files.')}</p>
    </Modal>
  )
}

/** Asks for a name and starts recording. */
export function recordMacro(app: ReturnType<typeof useApp>, relative: boolean) {
  const suggested = suggestMacroName(app.doc)
  app.dialog({
    kind: 'prompt',
    title: t('Record Macro'),
    message: t('Macro name (empty for {name}):', { name: suggested }),
    onText: (name) => startRecording(app.doc, name.trim() || suggested, relative),
  })
}

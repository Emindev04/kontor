import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel } from '../ui'
import { t, tx } from '../../i18n'
import { RULE_OPERATORS, mergeStore, type RuleAttrs, type RuleKind, type RuleOperator } from '../../editor/MailMerge'
import { newId } from '../../editor/Review'

export const RULE_KINDS: { id: RuleKind; label: string }[] = [
  { id: 'if', label: tx('If…Then…Else…') },
  { id: 'fillIn', label: tx('Fill-in…') },
  { id: 'recordNumber', label: tx('Merge Record #') },
  { id: 'sequence', label: tx('Merge Sequence #') },
  { id: 'nextRecord', label: tx('Next Record') },
  { id: 'nextRecordIf', label: tx('Next Record If…') },
]

/** The rule the Rules menu asked for (the dialog opens with it). */
export const pendingRule: { kind: RuleKind } = { kind: 'if' }

/** Mailings › Rules: inserts a rule field. */
export function MergeRuleDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const columns = mergeStore.get().columns
  const [kind, setKind] = useState<RuleKind>(pendingRule.kind)
  const [field, setField] = useState(columns[0] ?? '')
  const [op, setOp] = useState<RuleOperator>('eq')
  const [value, setValue] = useState('')
  const [then, setThen] = useState('')
  const [otherwise, setOtherwise] = useState('')
  const [promptText, setPromptText] = useState('')
  const conditional = kind === 'if' || kind === 'nextRecordIf'

  const apply = () => {
    const attrs: Partial<RuleAttrs> = { kind, field, op, value, then, otherwise, prompt: promptText, id: newId() }
    editor.chain().focus().insertMergeRule(attrs).run()
    onClose()
  }

  return (
    <Modal title={t('Insert Rule')} onClose={onClose} width={460} footer={<OkCancel onOk={apply} onCancel={onClose} okDisabled={conditional && !field} />}>
      <div className="dlg-stack">
        <label className="dlg-inline">
          {t('Rule:')}
          <select value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
            {RULE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {t(k.label)}
              </option>
            ))}
          </select>
        </label>
        {conditional && (
          <fieldset className="dlg-fieldset">
            <legend>{kind === 'if' ? t('If') : t('Next record if')}</legend>
            <div className="dlg-inline">
              <label className="dlg-col">
                {t('Field name:')}
                <select value={field} onChange={(e) => setField(e.target.value)}>
                  {columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="dlg-col">
                {t('Comparison:')}
                <select value={op} onChange={(e) => setOp(e.target.value as RuleOperator)}>
                  {RULE_OPERATORS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {t(o.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dlg-col">
                {t('Compare to:')}
                <input value={value} disabled={op === 'empty' || op === 'notEmpty'} onChange={(e) => setValue(e.target.value)} />
              </label>
            </div>
          </fieldset>
        )}
        {kind === 'if' && (
          <>
            <label className="dlg-col">
              {t('Insert this text:')}
              <textarea rows={2} value={then} onChange={(e) => setThen(e.target.value)} />
            </label>
            <label className="dlg-col">
              {t('Otherwise insert this text:')}
              <textarea rows={2} value={otherwise} onChange={(e) => setOtherwise(e.target.value)} />
            </label>
          </>
        )}
        {kind === 'fillIn' && (
          <>
            <label className="dlg-col">
              {t('Prompt:')}
              <input value={promptText} onChange={(e) => setPromptText(e.target.value)} />
            </label>
            <label className="dlg-col">
              {t('Default fill-in text:')}
              <input value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
            <p className="dlg-hint">{t('The question is asked once when you finish the merge; the answer goes into every copy.')}</p>
          </>
        )}
        {kind === 'recordNumber' && <p className="dlg-hint">{t('Shows the number of the recipient in the recipient list.')}</p>}
        {kind === 'sequence' && <p className="dlg-hint">{t('Shows the number of the merged copy (counting only the included recipients).')}</p>}
        {kind === 'nextRecord' && <p className="dlg-hint">{t('The fields after this rule use the next recipient, so one page holds several recipients.')}</p>}
      </div>
    </Modal>
  )
}

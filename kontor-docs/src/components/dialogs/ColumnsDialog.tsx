import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel, cls } from '../ui'
import { formatLength, parseLength, type Unit } from '../../units'
import type { ColumnsAttrs } from '../../editor/Sections'
import { t, tx } from '../../i18n'

const PRESETS: { id: string; label: string; count: number; preset: ColumnsAttrs['preset'] }[] = [
  { id: 'one', label: tx('One'), count: 1, preset: 'equal' },
  { id: 'two', label: tx('Two'), count: 2, preset: 'equal' },
  { id: 'three', label: tx('Three'), count: 3, preset: 'equal' },
  { id: 'left', label: tx('Left'), count: 2, preset: 'left' },
  { id: 'right', label: tx('Right'), count: 2, preset: 'right' },
]

/** Layout > Columns > More Columns. */
export function ColumnsDialog({ editor, unit, onClose }: { editor: Editor; unit: Unit; onClose: () => void }) {
  const current = editor.isActive('columns') ? (editor.getAttributes('columns') as ColumnsAttrs) : null
  const [count, setCount] = useState(current?.count ?? 1)
  const [preset, setPreset] = useState<ColumnsAttrs['preset']>(current?.preset ?? 'equal')
  const [gap, setGap] = useState(formatLength(current?.gap ?? 0.5, unit))
  const [line, setLine] = useState(current?.line ?? false)
  const [scope, setScope] = useState<'section' | 'selection' | 'document'>(editor.state.selection.empty ? 'section' : 'selection')
  const apply = () => {
    const g = parseLength(gap, unit) ?? 0.5
    editor.chain().focus().setColumns({ count: Math.max(1, Math.min(6, count)), gap: Math.max(0, g), line, preset }, scope).run()
    onClose()
  }
  return (
    <Modal title={t('Columns')} onClose={onClose} width={420} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="dlg-stack">
        <fieldset className="dlg-fieldset">
          <legend>{t('Presets')}</legend>
          <div className="col-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cls('col-preset', count === p.count && preset === p.preset && 'is-active')}
                onClick={() => {
                  setCount(p.count)
                  setPreset(p.preset)
                }}
              >
                <span className={`col-preview cols-${p.id}`}>
                  {Array.from({ length: p.count }, (_, i) => (
                    <span key={i} />
                  ))}
                </span>
                {t(p.label)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="dlg-inline">
          {t('Number of columns:')}{' '}<input type="number" min={1} max={6} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
        </label>
        <label className="dlg-inline">
          {t('Spacing:')}{' '}<input value={gap} onChange={(e) => setGap(e.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={line} onChange={(e) => setLine(e.target.checked)} /> {t('Line between')}</label>
        <label className="dlg-inline">
          {t('Apply to:')}<select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="section">{t('This section')}</option>
            {!editor.state.selection.empty && <option value="selection">{t('Selected text')}</option>}
            <option value="document">{t('Whole document')}</option>
          </select>
        </label>
        <p className="dlg-hint">{t('Columns always have equal widths here; "Left" and "Right" are kept for files from other programs.')}</p>
      </div>
    </Modal>
  )
}

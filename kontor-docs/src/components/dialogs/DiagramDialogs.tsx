import { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel, cls } from '../ui'
import { DIAGRAM_CATEGORIES, DIAGRAM_LAYOUTS, diagramSvg, newDiagram, type DiagramLayout } from '../../editor/Diagram'
import type { AppApi } from '../tabs/types'
import { t } from '../../i18n'

/** Insert > Diagram: pick a layout by category, with a preview and a description. */
export function InsertDiagramDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const [category, setCategory] = useState('All')
  const [pick, setPick] = useState<DiagramLayout>('blockList')
  const layouts = DIAGRAM_LAYOUTS.filter((l) => category === 'All' || l.category === category)
  const current = DIAGRAM_LAYOUTS.find((l) => l.id === pick)!
  const thumbs = useMemo(() => Object.fromEntries(DIAGRAM_LAYOUTS.map((l) => [l.id, diagramSvg(newDiagram(l.id), 96, 64)])), [])
  const insert = () => {
    editor.chain().focus().insertDiagram(pick).run()
    // Select the new diagram so its tab and text pane apply to it.
    editor.commands.setNodeSelection(editor.state.selection.from - 1)
    onClose()
    // Like the original, the text pane opens with the new diagram selected.
    setTimeout(() => app.setShowDiagramPane(true), 30)
  }
  return (
    <Modal title={t('Choose a Diagram')} onClose={onClose} width={760} footer={<OkCancel onOk={insert} onCancel={onClose} />}>
      <div className="diagram-picker">
        <div className="diagram-cats" role="listbox" aria-label={t('Categories')}>
          {DIAGRAM_CATEGORIES.map((c) => (
            <button key={c} type="button" role="option" aria-selected={category === c} className={cls('menu-item', category === c && 'is-active')} onClick={() => setCategory(c)}>
              {t(c)}
            </button>
          ))}
        </div>
        <div className="diagram-grid" role="listbox" aria-label={t('Layouts')}>
          {layouts.map((l) => (
            <button key={l.id} type="button" role="option" aria-selected={pick === l.id} title={t(l.label)} className={cls('diagram-thumb', pick === l.id && 'is-active')} onClick={() => setPick(l.id)} onDoubleClick={insert}>
              <span dangerouslySetInnerHTML={{ __html: thumbs[l.id] }} />
              <small>{t(l.label)}</small>
            </button>
          ))}
        </div>
        <div className="diagram-info">
          <div className="diagram-preview" dangerouslySetInnerHTML={{ __html: diagramSvg(newDiagram(pick), 220, 150) }} />
          <strong>{t(current.label)}</strong>
          <p>{t(current.hint)}</p>
        </div>
      </div>
    </Modal>
  )
}

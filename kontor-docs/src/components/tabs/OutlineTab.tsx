import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { CheckItem, RibbonButton, RibbonGroup } from '../ui'
import type { TabProps } from './types'
import { t } from '../../i18n'

/** Outline level of the block at the cursor: 1–6 for headings, 0 for body text. */
const levelAt = (editor: Editor) => (editor.isActive('heading') ? (editor.getAttributes('heading').level as number) : 0)

function setLevel(editor: Editor, level: number) {
  const chain = editor.chain().focus()
  if (level <= 0) chain.setParagraph().run()
  else chain.setHeading({ level: Math.min(6, level) as 1 }).run()
}

/** Moves the current top-level block (with a heading: its whole section) up or down past the neighbour. */
function moveBlock(editor: Editor, dir: -1 | 1) {
  const { state } = editor
  const $from = state.selection.$from
  if ($from.depth < 1) return
  const index = $from.index(0)
  const doc = state.doc
  const target = index + dir
  if (target < 0 || target >= doc.childCount) return
  let start = 0
  for (let i = 0; i < index; i++) start += doc.child(i).nodeSize
  const node = doc.child(index)
  const tr = state.tr.delete(start, start + node.nodeSize)
  let insertAt = 0
  for (let i = 0; i < target; i++) insertAt += tr.doc.child(i).nodeSize
  tr.insert(insertAt, node)
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.setTextSelection(insertAt + 1)
}

/** Contextual Outlining tab of the Outline view. */
export function OutlineTab({ editor, app }: TabProps) {
  const level = levelAt(editor)
  const o = app.outline
  return (
    <>
      <RibbonGroup label={t('Outline Tools')} priority={4}>
        <div className="col">
          <div className="row">
            <RibbonButton icon={ChevronsLeft} label={t('Promote to Heading 1')} onClick={() => setLevel(editor, 1)} />
            <RibbonButton icon={ChevronLeft} label={t('Promote')} disabled={level === 1} onClick={() => setLevel(editor, level === 0 ? 6 : level - 1)} />
            <span className="outline-level-box">{level ? t('Level {n}', { n: level }) : t('Body Text')}</span>
            <RibbonButton icon={ChevronRight} label={t('Demote')} disabled={level === 0} onClick={() => setLevel(editor, level >= 6 ? 0 : level + 1)} />
            <RibbonButton icon={ChevronsRight} label={t('Demote to Body Text')} onClick={() => setLevel(editor, 0)} />
          </div>
          <div className="row">
            <RibbonButton icon={ArrowUp} label={t('Move Up')} onClick={() => moveBlock(editor, -1)} />
            <RibbonButton icon={ArrowDown} label={t('Move Down')} onClick={() => moveBlock(editor, 1)} />
          </div>
        </div>
        <div className="col checks">
          <label className="check-item">
            {t('Show Level:')}<select value={o.level} onChange={(e) => app.setOutline({ ...o, level: Number(e.target.value) })}>
              <option value={0}>{t('All Levels')}</option>
              {[1, 2, 3, 4, 5, 6].map((l) => (
                <option key={l} value={l}>
                  {t('Level')}{' '}{l}
                </option>
              ))}
            </select>
          </label>
          <CheckItem label={t('Show Text Formatting')} checked={o.showFormatting} onChange={(v) => app.setOutline({ ...o, showFormatting: v })} />
          <CheckItem label={t('Show First Line Only')} checked={o.firstLineOnly} onChange={(v) => app.setOutline({ ...o, firstLineOnly: v })} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Close')} priority={5}>
        <RibbonButton large icon={X} label={t('Close Outline View')} onClick={() => app.setViewMode('print')} />
      </RibbonGroup>
    </>
  )
}

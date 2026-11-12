import { NodeSelection } from '@tiptap/pm/state'
import { AlignCenter, Pencil, Sigma, Type } from 'lucide-react'
import { MenuButton, RibbonButton, RibbonGroup, keepFocus } from '../ui'
import { EQUATION_GALLERY, EQUATION_STRUCTURES, SYMBOL_PALETTE } from '../../editor/math'
import type { TabProps } from './types'
import { t } from '../../i18n'

/** Contextual tab of a selected equation. */
export function EquationTab({ editor, app }: TabProps) {
  const sel = editor.state.selection
  const node = sel instanceof NodeSelection && sel.node.type.name === 'equation' ? sel.node : null
  if (!node) return null
  const pos = sel.from
  const set = (patch: Record<string, unknown>) => {
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch })
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    editor.view.dispatch(tr)
  }
  const append = (latex: string) => set({ latex: `${node.attrs.latex === 'x' ? '' : node.attrs.latex}${latex}` })
  return (
    <>
      <RibbonGroup label={t('Tools')} priority={2}>
        <MenuButton large icon={Sigma} label={t('Equation')} wide items={EQUATION_GALLERY.map((g) => ({ label: t(g.label), onClick: () => set({ latex: g.latex }) }))} />
        <RibbonButton large icon={Pencil} label={t('Edit')} title={t('Edit the equation (double-click)')} onClick={() => (app.setObjectPos(pos), app.openDialog('equation'))} />
        <div className="col">
          <RibbonButton icon={AlignCenter} label={t('Display')} showLabel active={!!node.attrs.display} title={t('Show the equation centered on its own line')} onClick={() => set({ display: !node.attrs.display })} />
          <RibbonButton
            icon={Type}
            label={t('Convert to Text')}
            showLabel
            onClick={() => editor.chain().focus().insertContentAt({ from: pos, to: pos + 1 }, node.attrs.latex).run()}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Symbols')} priority={3}>
        <div className="eq-symbols">
          {SYMBOL_PALETTE.slice(0, 36).map((s) => (
            <button key={s} type="button" onMouseDown={keepFocus} onClick={() => append(s)}>
              {s}
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Structures')} priority={4}>
        {EQUATION_STRUCTURES.map((g) => (
          <MenuButton key={g.group} large icon={Sigma} label={t(g.group)} items={g.items.map((it) => ({ label: t(it.label), onClick: () => append(it.latex) }))} />
        ))}
      </RibbonGroup>
    </>
  )
}

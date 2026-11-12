import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel } from '../ui'
import { allStyles, builtin, formatOfSelection, newStyleId, stylesCss, type StyleDef, type StyleDefs, type StyleFormat, type StyleKind } from '../../editor/styleDefs'
import { FONTS as FONT_LIST } from '../tabs/HomeTab'
import { t } from '../../i18n'

type Props = { editor: Editor; defs: StyleDefs; setDefs: (update: (d: StyleDefs) => StyleDefs) => void; styleId: string | null; onClose: () => void; onSetDefault: (defs: StyleDefs) => void }

/** Create New Style from Formatting / Modify Style. */
export function StyleDialog({ editor, defs, setDefs, styleId, onClose, onSetDefault }: Props) {
  const existing = styleId ? allStyles(defs).find((s) => s.id === styleId) : null
  const [name, setName] = useState(existing?.name ?? t('Style1'))
  const [kind, setKind] = useState<StyleKind>(existing?.kind ?? 'paragraph')
  const [basedOn, setBasedOn] = useState(existing?.basedOn ?? 'normal')
  const [f, setF] = useState<StyleFormat>(existing ? { ...existing.format } : formatOfSelection(editor))
  const [scope, setScope] = useState<'document' | 'default'>('document')
  const isBuiltin = !!(existing && builtin(existing.id))
  const set = (patch: Partial<StyleFormat>) => setF({ ...f, ...patch })
  const apply = () => {
    const id = existing?.id ?? newStyleId(name)
    const def: StyleDef = { id, name: isBuiltin ? existing!.name : name.trim() || t('Style'), kind: isBuiltin ? existing!.kind : kind, basedOn, custom: !isBuiltin, format: f }
    let next: StyleDefs = {}
    setDefs((d) => (next = { ...d, [id]: def }))
    if (!existing) {
      // A new style is applied to the selection, like the original's "Create a Style".
      if (def.kind === 'character') editor.chain().focus().setCharStyle(id as never).run()
      else editor.chain().focus().setParagraphStyle(id as never).run()
    }
    if (scope === 'default') onSetDefault({ ...next, [id]: def })
    onClose()
  }
  const preview = stylesCss({ preview: { id: 'preview', name, kind: 'paragraph', custom: true, basedOn, format: f } }, undefined).replace(/\.pages \.ProseMirror p\.ps-preview/g, '.style-dlg-preview p')
  return (
    <Modal title={existing ? t('Modify Style') : t('Create New Style from Formatting')} onClose={onClose} width={560} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="dlg-stack style-dlg">
        <fieldset className="dlg-fieldset dlg-two">
          <legend>{t('Properties')}</legend>
          <label className="dlg-inline">
            {t('Name:')}{' '}<input value={isBuiltin ? existing!.name : name} disabled={isBuiltin} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="dlg-inline">
            {t('Style type:')}<select value={kind} disabled={!!existing} onChange={(e) => setKind(e.target.value as StyleKind)}>
              <option value="paragraph">{t('Paragraph')}</option>
              <option value="character">{t('Character')}</option>
            </select>
          </label>
          <label className="dlg-inline">
            {t('Style based on:')}<select value={basedOn} onChange={(e) => setBasedOn(e.target.value)}>
              {allStyles(defs)
                .filter((s) => s.kind !== 'character' && s.id !== existing?.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.name)}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>{t('Formatting')}</legend>
          <div className="dlg-inline">
            <select aria-label={t('Font')} value={f.font ?? ''} onChange={(e) => set({ font: e.target.value || undefined })}>
              <option value="">{t('(Theme font)')}</option>
              {FONT_LIST.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
            <select aria-label={t('Size')} value={f.size ?? 11} onChange={(e) => set({ size: Number(e.target.value) })}>
              {[8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <label><input type="checkbox" checked={!!f.bold} onChange={(e) => set({ bold: e.target.checked })} /> <b>B</b></label>
            <label><input type="checkbox" checked={!!f.italic} onChange={(e) => set({ italic: e.target.checked })} /> <i>I</i></label>
            <label><input type="checkbox" checked={!!f.underline} onChange={(e) => set({ underline: e.target.checked })} /> <u>U</u></label>
            <input type="color" aria-label={t('Font color')} value={f.color ?? '#000000'} onChange={(e) => set({ color: e.target.value.toUpperCase() })} />
          </div>
          {kind !== 'character' && (
            <div className="dlg-inline">
              <select aria-label={t('Alignment')} value={f.align ?? 'left'} onChange={(e) => set({ align: e.target.value as StyleFormat['align'] })}>
                <option value="left">{t('Align Left')}</option>
                <option value="center">{t('Center')}</option>
                <option value="right">{t('Align Right')}</option>
                <option value="justify">{t('Justify')}</option>
              </select>
              <select aria-label={t('Line spacing')} value={f.lineHeight ?? '1.08'} onChange={(e) => set({ lineHeight: e.target.value })}>
                {['1', '1.08', '1.15', '1.5', '2'].map((l) => (
                  <option key={l} value={l}>
                    {t('Line spacing')}{' '}{l}
                  </option>
                ))}
              </select>
              <label>
                {t('Before')}{' '}<input type="number" min={0} max={200} value={f.spaceBefore ?? 0} onChange={(e) => set({ spaceBefore: Number(e.target.value) })} /> {t('pt')}</label>
              <label>
                {t('After')}{' '}<input type="number" min={0} max={200} value={f.spaceAfter ?? 8} onChange={(e) => set({ spaceAfter: Number(e.target.value) })} /> {t('pt')}</label>
              <label>
                {t('Indent')}{' '}<input type="number" min={0} max={5} step={0.25} value={f.indentLeft ?? 0} onChange={(e) => set({ indentLeft: Number(e.target.value) })} /> {t('in')}</label>
            </div>
          )}
        </fieldset>
        <style>{preview}</style>
        <div className="style-dlg-preview">
          <p className="ps-preview">{t('Sample Text Sample Text Sample Text Sample Text Sample Text Sample Text Sample Text.')}</p>
        </div>
        <div className="dlg-inline">
          <label><input type="radio" checked={scope === 'document'} onChange={() => setScope('document')} /> {t('Only in this document')}</label>
          <label><input type="radio" checked={scope === 'default'} onChange={() => setScope('default')} /> {t('New documents based on this template')}</label>
        </div>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { Modal } from '../ui'
import { t } from '../../i18n'
import { allStyles, builtin, type StyleDefs, type StyleFormat } from '../../editor/styleDefs'
import { pickFile } from '../../editor/commands'
import { downloadBlob } from '../../io/download'
import type { AppApi } from '../tabs/types'

/** A one-line description of a style's formatting. */
export function describeFormat(f: StyleFormat): string {
  const parts: string[] = []
  if (f.font) parts.push(f.font)
  if (f.size) parts.push(`${f.size} pt`)
  if (f.bold) parts.push(t('Bold'))
  if (f.italic) parts.push(t('Italic'))
  if (f.underline) parts.push(t('Underline'))
  if (f.color) parts.push(t('Font color: {value}', { value: f.color }))
  if (f.align && f.align !== 'left') parts.push(t('Alignment: {value}', { value: f.align }))
  if (f.spaceBefore != null) parts.push(t('Space before: {value} pt', { value: f.spaceBefore }))
  if (f.spaceAfter != null) parts.push(t('Space after: {value} pt', { value: f.spaceAfter }))
  if (f.lineHeight) parts.push(t('Line spacing: {value}', { value: f.lineHeight }))
  if (f.indentLeft) parts.push(t('Left indent: {value}', { value: `${f.indentLeft}"` }))
  return parts.join(', ')
}

/** Parses a style file written by Export (a JSON object of style definitions). */
export function parseStyleFile(text: string): StyleDefs | null {
  try {
    const data = JSON.parse(text) as { kontorStyles?: StyleDefs }
    const defs = data.kontorStyles
    if (!defs || typeof defs !== 'object') return null
    const out: StyleDefs = {}
    for (const [id, d] of Object.entries(defs)) {
      if (d && typeof d.name === 'string' && ['paragraph', 'character', 'heading'].includes(d.kind) && typeof d.format === 'object') out[id] = { ...d, id }
    }
    return out
  } catch {
    return null
  }
}

/** Styles pane › Manage Styles: every style with its description; modify, delete, new, import and export. */
export function ManageStylesDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [sort, setSort] = useState<'recommended' | 'alphabetical'>('recommended')
  const list = allStyles(app.styleDefs)
  const sorted = sort === 'alphabetical' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list
  const [selected, setSelected] = useState(sorted[0]?.id ?? 'normal')
  const style = list.find((s) => s.id === selected) ?? list[0]
  const isBuiltin = !!builtin(style.id)
  const changed = !!app.styleDefs[style.id]

  const remove = () => {
    if (isBuiltin ? !changed : !confirm(t('Delete the style “{name}”?', { name: style.name }))) return
    app.setStyleDefs((d) => {
      const next = { ...d }
      delete next[style.id]
      return next
    })
  }

  const exportStyles = () => {
    const blob = new Blob([JSON.stringify({ kontorStyles: app.styleDefs }, null, 2)], { type: 'application/json' })
    downloadBlob(blob, 'styles.json')
  }

  const importStyles = async () => {
    const file = await pickFile('.json,application/json')
    if (!file) return
    const defs = parseStyleFile(await file.text())
    if (!defs) return alert(t('This file does not contain styles.'))
    app.setStyleDefs((d) => ({ ...d, ...defs }))
  }

  return (
    <Modal
      title={t('Manage Styles')}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button type="button" className="btn" onClick={importStyles}>
            {t('Import…')}
          </button>
          <button type="button" className="btn" onClick={exportStyles}>
            {t('Export…')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('OK')}</button>
        </>
      }
    >
      <div className="manage-styles">
        <div className="dlg-col">
          <label className="dlg-inline">
            {t('Sort order:')}
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="recommended">{t('As Recommended')}</option>
              <option value="alphabetical">{t('Alphabetical')}</option>
            </select>
          </label>
          <div className="dlg-list" role="listbox" aria-label={t('Select a style to edit')}>
            {sorted.map((s) => (
              <button key={s.id} type="button" role="option" aria-selected={s.id === selected} className={`dlg-list-item${s.id === selected ? ' is-active' : ''}`} onClick={() => setSelected(s.id)}>
                {t(s.name)}
                {s.kind === 'character' ? ' (a)' : ' (¶)'}
              </button>
            ))}
          </div>
        </div>
        <div className="dlg-col">
          <div className="dlg-label">{t(style.name)}</div>
          <p className="dlg-hint">{describeFormat({ ...(builtin(style.id)?.format ?? {}), ...style.format }) || t('Default formatting')}</p>
          <p className="dlg-hint">{style.custom ? t('Style of this document') : changed ? t('Built-in style, modified') : t('Built-in style')}</p>
          <div className="dlg-inline">
            <button
              type="button"
              className="btn"
              onClick={() => {
                onClose()
                app.editStyle(style.id)
              }}
            >
              {t('Modify…')}
            </button>
            <button type="button" className="btn" disabled={isBuiltin && !changed} onClick={remove}>
              {isBuiltin ? t('Reset to Default') : t('Delete')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                onClose()
                app.editStyle(null)
              }}
            >
              {t('New Style…')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

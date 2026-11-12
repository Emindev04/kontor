import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { EMPTY_SOURCE, SOURCE_TYPES, bibliographyEntry, citationText, type Source, type SourceType } from '../../editor/Citations'
import { newId } from '../../editor/Review'
import { Modal, OkCancel, cls } from '../ui'
import type { AppApi } from '../tabs/types'
import { t, tx } from '../../i18n'

const FIELDS: { key: keyof Omit<Source, 'id' | 'type'>; label: string; types?: SourceType[]; hint?: string }[] = [
  { key: 'author', label: tx('Author'), hint: tx('Last, First; Last, First') },
  { key: 'title', label: tx('Title') },
  { key: 'year', label: tx('Year') },
  { key: 'publisher', label: tx('Publisher'), types: ['book', 'report'] },
  { key: 'city', label: tx('City'), types: ['book', 'report'] },
  { key: 'publisher', label: tx('Journal Name'), types: ['article'] },
  { key: 'volume', label: tx('Volume'), types: ['article'] },
  { key: 'pages', label: tx('Pages'), types: ['article'] },
  { key: 'publisher', label: tx('Name of Web Site'), types: ['website'] },
  { key: 'url', label: tx('URL'), types: ['website', 'article', 'report'] },
  { key: 'accessed', label: tx('Date Accessed'), types: ['website'] },
]

function SourceForm({ value, onChange }: { value: Omit<Source, 'id'>; onChange: (v: Omit<Source, 'id'>) => void }) {
  return (
    <div className="dlg-grid source-form">
      <label>
        {t('Type of Source')}<select value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as SourceType })}>
          {SOURCE_TYPES.map((item) => (
            <option key={item.id} value={item.id}>
              {t(item.label)}
            </option>
          ))}
        </select>
      </label>
      {FIELDS.filter((f) => !f.types || f.types.includes(value.type)).map((f) => (
        <label key={`${f.key}-${f.label}`}>
          {t(f.label)}
          <input value={value[f.key]} placeholder={f.hint && t(f.hint)} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} />
        </label>
      ))}
    </div>
  )
}

/** References › Insert Citation › Add New Source: create a source and cite it at the cursor. */
export function NewSourceDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const [source, setSource] = useState<Omit<Source, 'id'>>(EMPTY_SOURCE)
  const ok = () => {
    if (!source.author.trim() && !source.title.trim()) return
    const id = newId()
    app.setSources({ ...app.sources, [id]: { ...source, id } })
    onClose()
    // Cite after the new source is known to the fields.
    setTimeout(() => editor.chain().focus().insertCitation(id).run(), 0)
  }
  return (
    <Modal title={t('Create Source')} onClose={onClose} width={480} footer={<OkCancel onOk={ok} onCancel={onClose} okDisabled={!source.author.trim() && !source.title.trim()} />}>
      <SourceForm value={source} onChange={setSource} />
    </Modal>
  )
}

/** References › Manage Sources: the document's sources, with add, edit, delete and a preview. */
export function ManageSourcesDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const list = Object.values(app.sources).sort((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title))
  const [selected, setSelected] = useState<string | null>(list[0]?.id ?? null)
  const [editing, setEditing] = useState<Omit<Source, 'id'> & { id?: string } | null>(null)
  const current = selected ? app.sources[selected] : null
  const cited = new Set<string>()
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'citation') cited.add(n.attrs.sourceId)
  })
  if (editing)
    return (
      <Modal
        title={editing.id ? t('Edit Source') : t('Create Source')}
        onClose={() => setEditing(null)}
        width={480}
        footer={
          <OkCancel
            onOk={() => {
              const id = editing.id ?? newId()
              app.setSources({ ...app.sources, [id]: { ...editing, id } as Source })
              setSelected(id)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        }
      >
        <SourceForm value={editing} onChange={(v) => setEditing({ ...v, id: editing.id })} />
      </Modal>
    )
  return (
    <Modal title={t('Source Manager')} onClose={onClose} width={560} footer={<button type="button" className="btn btn-primary" onClick={onClose}>{t('Close')}</button>}>
      <div className="dlg-stack">
        <div className="sources-layout">
          <div className="dlg-list" role="listbox" aria-label={t('Sources')}>
            {list.length === 0 && <p className="dlg-hint">{t('No sources yet.')}</p>}
            {list.map((s) => (
              <button key={s.id} type="button" role="option" aria-selected={selected === s.id} className={cls('dlg-list-item', selected === s.id && 'is-active')} onClick={() => setSelected(s.id)} onDoubleClick={() => setEditing({ ...s })}>
                {cited.has(s.id) ? '✓ ' : ''}
                {s.author || t('(no author)')}; {s.title}
                {s.year ? ` (${s.year})` : ''}
              </button>
            ))}
          </div>
          <div className="sources-buttons">
            <button type="button" className="btn" onClick={() => setEditing({ ...EMPTY_SOURCE })}>
              {t('New…')}</button>
            <button type="button" className="btn" disabled={!current} onClick={() => current && setEditing({ ...current })}>
              {t('Edit…')}</button>
            <button
              type="button"
              className="btn"
              disabled={!current || cited.has(current.id)}
              title={current && cited.has(current.id) ? t('This source is cited in the document.') : undefined}
              onClick={() => {
                if (!current) return
                const next = { ...app.sources }
                delete next[current.id]
                app.setSources(next)
                setSelected(null)
              }}
            >
              {t('Delete')}</button>
            <button type="button" className="btn" disabled={!current} onClick={() => current && editor.chain().focus().insertCitation(current.id).run()}>
              {t('Cite')}</button>
          </div>
        </div>
        <fieldset className="dlg-fieldset">
          <legend>{t('Preview ({style})', { style: app.citationStyle.toUpperCase() })}</legend>
          {current ? (
            <>
              <p className="dlg-hint">{t('Citation:')}{' '}{citationText(current.id, '', app.citationStyle, app.sources)}</p>
              <p className="dlg-hint">
                {t('Bibliography entry:')}{' '}{bibliographyEntry(current, app.citationStyle).before}
                <em>{bibliographyEntry(current, app.citationStyle).italic}</em>
                {bibliographyEntry(current, app.citationStyle).after}
              </p>
            </>
          ) : (
            <p className="dlg-hint">{t('Select a source.')}</p>
          )}
        </fieldset>
      </div>
    </Modal>
  )
}

/** References › Mark Entry: an index entry for the selected text (or a typed term). */
export function MarkEntryDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { from, to, empty } = editor.state.selection
  const [term, setTerm] = useState(empty ? '' : editor.state.doc.textBetween(from, to, ' ').trim().slice(0, 80))
  const [sub, setSub] = useState('')
  const mark = (all: boolean) => {
    if (!term.trim()) return
    if (!all) editor.chain().focus().markIndexEntry(term.trim(), sub.trim()).run()
    else {
      // Mark All: every occurrence of the term in the document.
      const positions: number[] = []
      editor.state.doc.descendants((n, pos) => {
        if (!n.isText) return
        let i = n.text!.indexOf(term.trim())
        while (i >= 0) {
          positions.push(pos + i + term.trim().length)
          i = n.text!.indexOf(term.trim(), i + 1)
        }
      })
      const tr = editor.state.tr
      for (const p of positions.reverse()) tr.insert(p, editor.schema.nodes.indexEntry.create({ term: term.trim(), sub: sub.trim() }))
      editor.view.dispatch(tr)
    }
    onClose()
  }
  return (
    <Modal
      title={t('Mark Index Entry')}
      onClose={onClose}
      width={420}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!term.trim()} onClick={() => mark(false)}>
            {t('Mark')}</button>
          <button type="button" className="btn" disabled={!term.trim()} onClick={() => mark(true)}>
            {t('Mark All')}</button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}</button>
        </>
      }
    >
      <div className="dlg-grid">
        <label>
          {t('Main entry')}<input value={term} autoFocus onChange={(e) => setTerm(e.target.value)} />
        </label>
        <label>
          {t('Subentry')}<input value={sub} onChange={(e) => setSub(e.target.value)} />
        </label>
      </div>
      <p className="dlg-hint">{t('Index entries are hidden fields; show them with Show/Hide ¶. Insert the index with References › Insert Index.')}</p>
    </Modal>
  )
}

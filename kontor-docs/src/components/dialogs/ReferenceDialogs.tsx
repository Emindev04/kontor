import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel, cls } from '../ui'
import { t } from '../../i18n'
import { DEFAULT_TOC_OPTIONS, captionLabel, type TocLeader, type TocOptions } from '../../editor/TableOfContents'
import { TOA_CATEGORIES, collectAuthorities, type ToaOptions } from '../../editor/Authorities'
import { DEFAULT_INDEX_OPTIONS, type IndexOptions } from '../../editor/Citations'
import { computeTocEntries, refreshTables } from '../tabs/ReferencesTab'
import type { AppApi } from '../tabs/types'

const LEADERS: { id: TocLeader; sample: string }[] = [
  { id: 'none', sample: '(none)' },
  { id: 'dot', sample: '.......' },
  { id: 'dash', sample: '-------' },
  { id: 'underline', sample: '_______' },
]

function LeaderSelect({ value, onChange, disabled }: { value: TocLeader; onChange: (v: TocLeader) => void; disabled?: boolean }) {
  return (
    <label className="dlg-inline">
      {t('Tab leader:')}
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as TocLeader)}>
        {LEADERS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.id === 'none' ? t('(none)') : l.sample}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A small print preview of a table with the chosen page number options. */
function TocPreview({ lines, showPages, rightAlign, leader }: { lines: { text: string; level: number; page: string }[]; showPages: boolean; rightAlign: boolean; leader: TocLeader }) {
  const fill = { dot: '.', dash: '-', underline: '_', none: ' ' }[rightAlign ? leader : 'none']
  return (
    <div className="toc-preview" aria-label={t('Print Preview')}>
      {lines.map((l, i) => (
        <div key={i} className={cls('toc-preview-line', !rightAlign && 'is-inline')} style={{ paddingLeft: (l.level - 1) * 12, fontSize: l.level === 1 ? 12 : 11 }}>
          <span>{l.text}</span>
          {showPages && rightAlign && <span className="toc-preview-fill">{fill.repeat(80)}</span>}
          {showPages && <span>{rightAlign ? '' : ' '}{l.page}</span>}
        </div>
      ))}
    </div>
  )
}

/** References › Table of Contents › Custom Table of Contents. */
export function CustomTocDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const editor = app.mainEditor
  let current: Record<string, unknown> | null = null
  editor.state.doc.descendants((n) => {
    if (!current && n.type.name === 'tableOfContents' && (n.attrs.kind ?? 'toc') === 'toc') current = n.attrs
    return !current
  })
  const start = { ...DEFAULT_TOC_OPTIONS, levels: 3, ...((current ?? {}) as Partial<TocOptions & { levels: number }>) }
  const [showPages, setShowPages] = useState(start.showPages)
  const [rightAlign, setRightAlign] = useState(start.rightAlign)
  const [leader, setLeader] = useState<TocLeader>(start.leader)
  const [levels, setLevels] = useState(start.levels)
  const [useOutline, setUseOutline] = useState(start.useOutline)

  const apply = () => {
    const options: Partial<TocOptions> = { kind: 'toc', showPages, rightAlign, leader, useOutline }
    const attrs = { ...options, levels }
    if (current) editor.commands.removeTableOfContents()
    editor.chain().focus().insertTableOfContents(computeTocEntries(app, attrs), levels, options).run()
    // The table moves the headings down; refresh once the pages have been laid out again.
    setTimeout(() => refreshTables(app), 300)
    onClose()
  }

  return (
    <Modal title={t('Table of Contents')} onClose={onClose} width={480} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <TocPreview
        lines={[
          { text: t('Heading 1'), level: 1, page: '1' },
          ...(levels >= 2 ? [{ text: t('Heading 2'), level: 2, page: '3' }] : []),
          ...(levels >= 3 ? [{ text: t('Heading 3'), level: 3, page: '5' }] : []),
        ]}
        showPages={showPages}
        rightAlign={rightAlign}
        leader={leader}
      />
      <fieldset className="dlg-fieldset">
        <legend>{t('General')}</legend>
        <label>
          <input type="checkbox" checked={showPages} onChange={(e) => setShowPages(e.target.checked)} /> {t('Show page numbers')}
        </label>
        <label>
          <input type="checkbox" checked={rightAlign} disabled={!showPages} onChange={(e) => setRightAlign(e.target.checked)} /> {t('Right align page numbers')}
        </label>
        <LeaderSelect value={leader} onChange={setLeader} disabled={!showPages || !rightAlign} />
        <label className="dlg-inline">
          {t('Show levels:')}
          <input type="number" min={1} max={9} value={levels} onChange={(e) => setLevels(Math.max(1, Math.min(9, Number(e.target.value) || 1)))} style={{ width: 56 }} />
        </label>
        <label>
          <input type="checkbox" checked={useOutline} onChange={(e) => setUseOutline(e.target.checked)} /> {t('Outline levels (paragraphs with an outline level)')}
        </label>
      </fieldset>
    </Modal>
  )
}

/** References › Insert Table of Figures. */
export function TableOfFiguresDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const editor = app.mainEditor
  const labels = new Set<string>()
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'paragraph' && n.attrs.pStyle === 'caption') {
      const l = captionLabel(n.textContent.trim())
      if (l) labels.add(l)
    }
  })
  const choices = [...new Set(['Figure', 'Table', 'Equation', ...labels])]
  const [label, setLabel] = useState(labels.size ? [...labels][0] : 'Figure')
  const [includeLabel, setIncludeLabel] = useState(true)
  const [showPages, setShowPages] = useState(true)
  const [rightAlign, setRightAlign] = useState(true)
  const [leader, setLeader] = useState<TocLeader>('dot')

  const apply = () => {
    const options: Partial<TocOptions> = { kind: 'figures', label, includeLabel, showPages, rightAlign, leader }
    editor.chain().focus().insertTableOfContents(computeTocEntries(app, options), 1, options).run()
    setTimeout(() => refreshTables(app), 300)
    onClose()
  }

  return (
    <Modal title={t('Table of Figures')} onClose={onClose} width={460} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <TocPreview
        lines={[1, 2, 3].map((n) => ({ text: includeLabel ? `${label} ${n}: ${t('Text')}` : t('Text'), level: 1, page: String(n * 2 - 1) }))}
        showPages={showPages}
        rightAlign={rightAlign}
        leader={leader}
      />
      <fieldset className="dlg-fieldset">
        <legend>{t('General')}</legend>
        <label className="dlg-inline">
          {t('Caption label:')}
          <select value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="">{t('(all captions)')}</option>
            {choices.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={includeLabel} onChange={(e) => setIncludeLabel(e.target.checked)} /> {t('Include label and number')}
        </label>
        <label>
          <input type="checkbox" checked={showPages} onChange={(e) => setShowPages(e.target.checked)} /> {t('Show page numbers')}
        </label>
        <label>
          <input type="checkbox" checked={rightAlign} disabled={!showPages} onChange={(e) => setRightAlign(e.target.checked)} /> {t('Right align page numbers')}
        </label>
        <LeaderSelect value={leader} onChange={setLeader} disabled={!showPages || !rightAlign} />
      </fieldset>
    </Modal>
  )
}

/** References › Mark Citation (Alt+Shift+I). */
export function MarkCitationDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { from, to } = editor.state.selection
  const selected = editor.state.doc.textBetween(from, to, ' ').trim()
  const known = collectAuthorities(editor.state.doc).filter((e) => e.long)
  const [long, setLong] = useState(selected)
  const [short, setShort] = useState(selected)
  const [category, setCategory] = useState(1)
  const [done, setDone] = useState('')

  const mark = (all: boolean) => {
    if (!long.trim() && !short.trim()) return
    editor.chain().focus().markCitation({ long: long.trim(), short: (short || long).trim(), category }, all).run()
    setDone(t('Citation marked.'))
  }

  return (
    <Modal
      title={t('Mark Citation')}
      onClose={onClose}
      width={480}
      footer={
        <>
          {done && <span className="dlg-hint">{done}</span>}
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => mark(false)}>
            {t('Mark')}
          </button>
          <button type="button" className="btn" disabled={!selected} onClick={() => mark(true)}>
            {t('Mark All')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Close')}
          </button>
        </>
      }
    >
      <div className="dlg-stack">
        <label className="dlg-col">
          {t('Long citation:')}
          <textarea rows={3} value={long} onChange={(e) => setLong(e.target.value)} />
        </label>
        <label className="dlg-inline">
          {t('Category:')}
          <select value={category} onChange={(e) => setCategory(Number(e.target.value))}>
            {TOA_CATEGORIES.map((c, i) => (
              <option key={c} value={i + 1}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="dlg-col">
          {t('Short citation:')}
          <input value={short} onChange={(e) => setShort(e.target.value)} />
        </label>
        {known.length > 0 && (
          <div className="dlg-list" role="listbox" aria-label={t('Long citations marked so far')}>
            {[...new Map(known.map((k) => [k.long, k])).values()].map((k) => (
              <button key={k.long} type="button" className="dlg-list-item" onClick={() => (setLong(k.long), setShort(k.short), setCategory(k.category))}>
                {k.long}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** References › Insert Table of Authorities. */
export function TableOfAuthoritiesDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [category, setCategory] = useState(0)
  const [passim, setPassim] = useState(true)
  const [leader, setLeader] = useState<TocLeader>('dot')
  const apply = () => {
    const options: Partial<ToaOptions> = { category, passim, leader }
    editor.chain().focus().insertTableOfAuthorities(options).run()
    onClose()
  }
  return (
    <Modal title={t('Table of Authorities')} onClose={onClose} width={420} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>{t('General')}</legend>
        <label className="dlg-inline">
          {t('Category:')}
          <select value={category} onChange={(e) => setCategory(Number(e.target.value))}>
            <option value={0}>{t('All')}</option>
            {TOA_CATEGORIES.map((c, i) => (
              <option key={c} value={i + 1}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={passim} onChange={(e) => setPassim(e.target.checked)} /> {t('Use passim (for five or more pages)')}
        </label>
        <LeaderSelect value={leader} onChange={setLeader} />
      </fieldset>
    </Modal>
  )
}

/** References › Insert Index: the Index dialog. */
export function IndexDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [o, setO] = useState<IndexOptions>(DEFAULT_INDEX_OPTIONS)
  const set = (patch: Partial<IndexOptions>) => setO({ ...o, ...patch })
  const apply = () => {
    editor.chain().focus().insertIndex(o).run()
    onClose()
  }
  return (
    <Modal title={t('Index')} onClose={onClose} width={440} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>{t('Type')}</legend>
        <div className="dlg-inline">
          <label>
            <input type="radio" name="idx-type" checked={!o.runIn} onChange={() => set({ runIn: false })} /> {t('Indented')}
          </label>
          <label>
            <input type="radio" name="idx-type" checked={o.runIn} onChange={() => set({ runIn: true, rightAlign: false })} /> {t('Run-in')}
          </label>
        </div>
        <label className="dlg-inline">
          {t('Columns:')}
          <input type="number" min={1} max={4} value={o.columns} onChange={(e) => set({ columns: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })} style={{ width: 56 }} />
        </label>
        <label>
          <input type="checkbox" checked={o.headings} onChange={(e) => set({ headings: e.target.checked })} /> {t('Letter headings')}
        </label>
        <label>
          <input type="checkbox" checked={o.rightAlign} disabled={o.runIn} onChange={(e) => set({ rightAlign: e.target.checked })} /> {t('Right align page numbers')}
        </label>
        <LeaderSelect value={o.leader} onChange={(leader) => set({ leader })} disabled={!o.rightAlign || o.runIn} />
      </fieldset>
    </Modal>
  )
}

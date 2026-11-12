import { useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Modal, OkCancel, cls } from '../ui'
import { DEFAULT_CHART, chartSvg, type ChartData } from '../../editor/Chart'
import { CHART_TYPES } from '../tabs/ChartTab'
import { EQUATION_GALLERY, EQUATION_STRUCTURES, SYMBOL_PALETTE, mathMarkup } from '../../editor/math'
import { collectBookmarks, type CrossRefAttrs } from '../../editor/Objects'
import { collectNotes } from '../../editor/Notes'
import type { AppApi } from '../tabs/types'

const nodeAtPos = (editor: Editor, pos: number | null, type: string) => {
  if (pos == null) return null
  const node = editor.state.doc.nodeAt(pos)
  return node?.type.name === type ? node : null
}

const setAttrs = (editor: Editor, pos: number, attrs: Record<string, unknown>) => {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
  tr.setSelection(NodeSelection.create(tr.doc, pos))
  editor.view.dispatch(tr)
  editor.view.focus()
}

// ---- Charts ----

export function InsertChartDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const [pick, setPick] = useState(0)
  const type = CHART_TYPES[pick]
  const data: ChartData = { ...DEFAULT_CHART, chartType: type.id, stacking: type.stacking ?? 'none', ...(type.id === 'pie' || type.id === 'doughnut' ? { series: [{ name: 'Sales', values: [8.2, 3.2, 1.4, 1.2] }], categories: ['1st Qtr', '2nd Qtr', '3rd Qtr', '4th Qtr'], title: 'Sales', legend: 'bottom' as const } : {}) }
  const insert = () => {
    editor.chain().focus().insertChart(data).run()
    const pos = editor.state.selection.from - 1
    onClose()
    // Like the original: the data sheet opens right after inserting.
    setTimeout(() => {
      app.setObjectPos(pos)
      app.openDialog('chartData')
    }, 50)
  }
  return (
    <Modal title="Insert Chart" onClose={onClose} width={720} footer={<OkCancel onOk={insert} onCancel={onClose} />}>
      <div className="chart-picker">
        <div className="chart-types" role="listbox" aria-label="Chart types">
          {CHART_TYPES.map((t, i) => (
            <button key={t.label} type="button" role="option" aria-selected={pick === i} className={cls('menu-item', pick === i && 'is-active')} onClick={() => setPick(i)} onDoubleClick={insert}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="chart-preview" dangerouslySetInnerHTML={{ __html: chartSvg(data, 440, 280) }} />
      </div>
    </Modal>
  )
}

/** The chart's data sheet: categories down, series across, like a small spreadsheet. */
export function ChartDataDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const node = nodeAtPos(editor, app.objectPos, 'chart')
  const [d, setD] = useState<ChartData>(() => structuredClone((node?.attrs.data as ChartData) ?? DEFAULT_CHART))
  if (!node || app.objectPos == null) return null
  const pie = d.chartType === 'pie' || d.chartType === 'doughnut'
  const setCell = (r: number, c: number, text: string) => {
    const next = structuredClone(d)
    if (r === -1 && c >= 0) next.series[c].name = text
    else if (c === -1 && r >= 0) next.categories[r] = text
    else if (r >= 0 && c >= 0) {
      const v = text.trim() === '' ? null : Number(text.replace(/,/g, ''))
      next.series[c].values[r] = v == null || isNaN(v) ? null : v
    }
    setD(next)
  }
  const addRow = () => setD({ ...d, categories: [...d.categories, `Category ${d.categories.length + 1}`], series: d.series.map((s) => ({ ...s, values: [...s.values, null] })) })
  const addCol = () => setD({ ...d, series: [...d.series, { name: `Series ${d.series.length + 1}`, values: d.categories.map(() => null) }] })
  const removeRow = () => d.categories.length > 1 && setD({ ...d, categories: d.categories.slice(0, -1), series: d.series.map((s) => ({ ...s, values: s.values.slice(0, d.categories.length - 1) })) })
  const removeCol = () => d.series.length > 1 && setD({ ...d, series: d.series.slice(0, -1) })
  const apply = () => {
    setAttrs(editor, app.objectPos!, { data: d })
    onClose()
  }
  return (
    <Modal title="Chart Data" onClose={onClose} width={760} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="chart-data">
        <div>
          <label className="dlg-inline">
            Chart title: <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          </label>
          <div className="sheet-grid-wrap">
            <table className="sheet-grid">
              <thead>
                <tr>
                  <th />
                  {d.series.map((s, c) => (
                    <th key={c}>
                      <input aria-label={`Series ${c + 1} name`} value={s.name} onChange={(e) => setCell(-1, c, e.target.value)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.categories.map((cat, r) => (
                  <tr key={r}>
                    <th>
                      <input aria-label={`Category ${r + 1}`} value={cat} onChange={(e) => setCell(r, -1, e.target.value)} />
                    </th>
                    {d.series.map((s, c) => (
                      <td key={c}>
                        <input aria-label={`${s.name}, ${cat}`} inputMode="decimal" value={s.values[r] ?? ''} onChange={(e) => setCell(r, c, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dlg-inline">
            <button type="button" className="btn" onClick={addRow}>Add Category</button>
            <button type="button" className="btn" onClick={removeRow}>Remove Category</button>
            {!pie && <button type="button" className="btn" onClick={addCol}>Add Series</button>}
            {!pie && <button type="button" className="btn" onClick={removeCol}>Remove Series</button>}
          </div>
        </div>
        <div className="chart-preview" dangerouslySetInnerHTML={{ __html: chartSvg(d, 360, 240) }} />
      </div>
    </Modal>
  )
}

// ---- Equations ----

export function EquationDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const node = nodeAtPos(editor, app.objectPos, 'equation')
  const [latex, setLatex] = useState<string>(node?.attrs.latex ?? '')
  const [display, setDisplay] = useState<boolean>(node?.attrs.display ?? false)
  const input = useRef<HTMLTextAreaElement>(null)
  const insertAtCursor = (s: string) => {
    const el = input.current
    if (!el) return setLatex(latex + s)
    const start = el.selectionStart
    const next = latex.slice(0, start) + s + latex.slice(el.selectionEnd)
    setLatex(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + s.length
    })
  }
  const apply = () => {
    if (!latex.trim()) return onClose()
    if (node && app.objectPos != null) setAttrs(editor, app.objectPos, { latex, display })
    else editor.chain().focus().insertEquation(latex, display).run()
    onClose()
  }
  return (
    <Modal title={node ? 'Edit Equation' : 'Insert Equation'} onClose={onClose} width={680} footer={<OkCancel onOk={apply} onCancel={onClose} extra={<label><input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} /> Display (own line, centered)</label>} />}>
      <div className="eq-editor">
        <div className="eq-palettes">
          <select aria-label="Insert a built-in equation" value="" onChange={(e) => e.target.value && setLatex(e.target.value)}>
            <option value="">Built-in equations…</option>
            {EQUATION_GALLERY.map((g) => (
              <option key={g.label} value={g.latex}>
                {g.label}
              </option>
            ))}
          </select>
          {EQUATION_STRUCTURES.map((g) => (
            <select key={g.group} aria-label={g.group} value="" onChange={(e) => e.target.value && insertAtCursor(e.target.value)}>
              <option value="">{g.group}</option>
              {g.items.map((it) => (
                <option key={it.label} value={it.latex}>
                  {it.label}
                </option>
              ))}
            </select>
          ))}
        </div>
        <div className="eq-symbols">
          {SYMBOL_PALETTE.map((s) => (
            <button key={s} type="button" onClick={() => insertAtCursor(s)}>
              {s}
            </button>
          ))}
        </div>
        <textarea ref={input} autoFocus className="eq-input" rows={3} spellCheck={false} value={latex} onChange={(e) => setLatex(e.target.value)} aria-label="Equation (linear format)" />
        <div className="eq-preview" dangerouslySetInnerHTML={{ __html: mathMarkup(latex || '\\text{Type equation here.}', true) }} />
        <p className="dlg-hint">{'Linear format: x^2, x_i, \\frac{a}{b}, \\sqrt{x}, \\sum_{i=1}^{n}, \\int_a^b, \\alpha, \\left( … \\right). The preview updates as you type.'}</p>
      </div>
    </Modal>
  )
}

// ---- Signature line ----

export function SignatureDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const node = nodeAtPos(editor, app.objectPos, 'signatureLine')
  const a = node?.attrs ?? {}
  const [signer, setSigner] = useState<string>(a.signer ?? '')
  const [title, setTitle] = useState<string>(a.signerTitle ?? '')
  const [email, setEmail] = useState<string>(a.email ?? '')
  const [instructions, setInstructions] = useState<string>(a.instructions ?? 'Before signing this document, verify that the content you are signing is correct.')
  const [showDate, setShowDate] = useState<boolean>(a.showDate ?? true)
  const apply = () => {
    const attrs = { signer, signerTitle: title, email, instructions, showDate }
    if (node && app.objectPos != null) setAttrs(editor, app.objectPos, attrs)
    else editor.chain().focus().insertSignatureLine(attrs).run()
    onClose()
  }
  return (
    <Modal title="Signature Setup" onClose={onClose} width={420} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="dlg-stack">
        <label className="dlg-stack">Suggested signer (for example, John Doe):<input autoFocus value={signer} onChange={(e) => setSigner(e.target.value)} /></label>
        <label className="dlg-stack">Suggested signer's title (for example, Manager):<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="dlg-stack">Suggested signer's e-mail address:<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="dlg-stack">Instructions to the signer:<textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
        <label><input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} /> Show sign date in signature line</label>
      </div>
    </Modal>
  )
}

// ---- Bookmarks and cross-references ----

export function BookmarkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [name, setName] = useState('')
  const [sort, setSort] = useState<'name' | 'location'>('name')
  const [hidden, setHidden] = useState(false)
  const marks = collectBookmarks(editor.state.doc).filter((b) => hidden || !b.name.startsWith('_'))
  const sorted = sort === 'name' ? [...marks].sort((a, b) => a.name.localeCompare(b.name)) : marks
  const valid = /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)
  const existing = marks.find((b) => b.name === name)
  const add = () => {
    if (!valid) return
    if (existing) {
      editor.view.dispatch(editor.state.tr.delete(existing.pos, existing.pos + 1))
    }
    editor.chain().focus().insertBookmark(name).run()
    onClose()
  }
  const go = () => {
    if (!existing) return
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, existing.pos + 1)).scrollIntoView())
    editor.view.focus()
    onClose()
  }
  return (
    <Modal
      title="Bookmark"
      onClose={onClose}
      width={400}
      footer={
        <>
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={add}>
            Add
          </button>
          <button type="button" className="btn" disabled={!existing} onClick={() => existing && editor.view.dispatch(editor.state.tr.delete(existing.pos, existing.pos + 1))}>
            Delete
          </button>
          <button type="button" className="btn" disabled={!existing} onClick={go}>
            Go To
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="dlg-stack">
        <label className="dlg-stack">
          Bookmark name:
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </label>
        <select size={7} value={name} onChange={(e) => setName(e.target.value)} onDoubleClick={go} aria-label="Bookmarks">
          {sorted.map((b) => (
            <option key={`${b.name}-${b.pos}`} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="dlg-inline">
          Sort by:
          <label><input type="radio" checked={sort === 'name'} onChange={() => setSort('name')} /> Name</label>
          <label><input type="radio" checked={sort === 'location'} onChange={() => setSort('location')} /> Location</label>
        </div>
        <label><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden bookmarks</label>
        {name && !valid && <p className="dlg-error">Bookmark names start with a letter and contain only letters, numbers and underscores.</p>}
      </div>
    </Modal>
  )
}

type RefKind = 'heading' | 'bookmark' | 'footnote' | 'endnote' | 'figure' | 'table'

export function CrossRefDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const [kind, setKind] = useState<RefKind>('heading')
  const [show, setShow] = useState<CrossRefAttrs['show']>('text')
  const [index, setIndex] = useState(0)
  const doc = editor.state.doc
  const items = useMemo(() => {
    const out: { label: string; pos: number; id?: string }[] = []
    if (kind === 'heading') doc.descendants((n, pos) => void (n.type.name === 'heading' && n.textContent.trim() && out.push({ label: n.textContent.trim(), pos })))
    else if (kind === 'bookmark') collectBookmarks(doc).filter((b) => !b.name.startsWith('_')).forEach((b) => out.push({ label: b.name, pos: b.pos, id: b.name }))
    else if (kind === 'footnote' || kind === 'endnote')
      collectNotes(doc, app.noteSettings)
        .filter((n) => n.kind === kind && app.notes[n.id])
        .forEach((n) => out.push({ label: `${n.label} ${JSON.stringify(app.notes[n.id]).match(/"text":"([^"]*)"/)?.[1] ?? ''}`, pos: n.pos, id: n.id }))
    else {
      const label = kind === 'figure' ? 'Figure' : 'Table'
      doc.descendants((n, pos) => void (n.type.name === 'paragraph' && n.attrs.pStyle === 'caption' && n.textContent.startsWith(label) && out.push({ label: n.textContent, pos })))
    }
    return out
  }, [doc, kind, app.notes, app.noteSettings])
  const showOptions: { id: CrossRefAttrs['show']; label: string }[] =
    kind === 'footnote' || kind === 'endnote'
      ? [{ id: 'number', label: `${kind === 'footnote' ? 'Footnote' : 'Endnote'} number` }, { id: 'page', label: 'Page number' }, { id: 'aboveBelow', label: 'Above/below' }]
      : kind === 'figure' || kind === 'table'
        ? [{ id: 'text', label: 'Entire caption' }, { id: 'number', label: 'Only label and number' }, { id: 'page', label: 'Page number' }, { id: 'aboveBelow', label: 'Above/below' }]
        : [{ id: 'text', label: kind === 'heading' ? 'Heading text' : 'Bookmark text' }, { id: 'page', label: 'Page number' }, { id: 'aboveBelow', label: 'Above/below' }]
  const insert = () => {
    const item = items[index]
    if (!item) return
    let target = item.id
    let refPos = editor.state.selection.from
    if (!target) {
      // Headings and captions get a hidden bookmark to point at, like the original's _Ref bookmarks.
      target = `_Ref${Math.floor(Math.random() * 1e9)}`
      const at = item.pos + 1
      editor.view.dispatch(editor.state.tr.insert(at, editor.schema.nodes.bookmark.create({ name: target })))
      if (at <= refPos) refPos += 1
      editor.commands.setTextSelection(refPos)
    }
    const refType: CrossRefAttrs['refType'] = kind === 'figure' || kind === 'table' ? 'caption' : kind
    editor.chain().focus().insertCrossRef({ target, refType, show: showOptions.some((o) => o.id === show) ? show : showOptions[0].id }).run()
    onClose()
  }
  return (
    <Modal title="Cross-reference" onClose={onClose} width={480} footer={<OkCancel okLabel="Insert" onOk={insert} onCancel={onClose} />}>
      <div className="dlg-stack">
        <div className="dlg-two">
          <label className="dlg-stack">
            Reference type:
            <select value={kind} onChange={(e) => (setKind(e.target.value as RefKind), setIndex(0))}>
              <option value="heading">Heading</option>
              <option value="bookmark">Bookmark</option>
              <option value="footnote">Footnote</option>
              <option value="endnote">Endnote</option>
              <option value="figure">Figure</option>
              <option value="table">Table</option>
            </select>
          </label>
          <label className="dlg-stack">
            Insert reference to:
            <select value={show} onChange={(e) => setShow(e.target.value as CrossRefAttrs['show'])}>
              {showOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="dlg-stack">
          For which {kind}:
          <select size={8} value={index} onChange={(e) => setIndex(Number(e.target.value))} onDoubleClick={insert}>
            {items.map((it, i) => (
              <option key={i} value={i}>
                {it.label}
              </option>
            ))}
          </select>
        </label>
        {!items.length && <p className="dlg-hint">There are no items of this type in the document.</p>}
      </div>
    </Modal>
  )
}

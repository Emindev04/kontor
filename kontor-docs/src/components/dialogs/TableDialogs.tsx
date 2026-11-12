import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DialogTabs, Modal, OkCancel, cls } from '../ui'
import { currentTableAttrs } from '../../editor/TableStyles'
import { evaluateFormula, type BorderPen } from '../../editor/TableExtras'
import { formatLength, parseLength, PX_PER_IN, type Unit } from '../../units'
import type { AppApi } from '../tabs/types'
import type { PageBorder } from '../../pageSetup'

/** Table Properties: Table, Row, Cell and Alt Text tabs. */
export function TablePropertiesDialog({ editor, unit, onClose }: { editor: Editor; unit: Unit; onClose: () => void }) {
  const attrs = currentTableAttrs(editor.state) ?? {}
  const $from = editor.state.selection.$from
  let rowNode = null as import('@tiptap/pm/model').Node | null
  let cellNode = null as import('@tiptap/pm/model').Node | null
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (!cellNode && /table(Cell|Header)/.test(n.type.name)) cellNode = n
    if (!rowNode && n.type.name === 'tableRow') rowNode = n
  }
  const [tab, setTab] = useState<'table' | 'row' | 'cell' | 'alt'>('table')
  const [align, setAlign] = useState<string>((attrs.tableAlign as string) ?? 'left')
  const [height, setHeight] = useState(rowNode?.attrs.rowHeight ? formatLength(rowNode.attrs.rowHeight / PX_PER_IN, unit) : '')
  const [cantSplit, setCantSplit] = useState(!!rowNode?.attrs.cantSplit)
  const [repeat, setRepeat] = useState(!!attrs.repeatHeader)
  const [vAlign, setVAlign] = useState<string>(cellNode?.attrs.verticalAlign ?? 'top')
  const [title, setTitle] = useState<string>((attrs.tableTitle as string) ?? '')
  const apply = () => {
    const c = editor.chain().focus().setTableAlign(align as 'left').setTableAttribute('repeatHeader', repeat).setTableAttribute('tableTitle', title || null).setCellVerticalAlign(vAlign as 'top')
    const h = parseLength(height, unit)
    c.setRowHeight(h ? Math.round(h * PX_PER_IN) : null)
    c.run()
    // Row options apply to the cursor's row.
    const $f = editor.state.selection.$from
    for (let d = $f.depth; d > 0; d--) {
      if ($f.node(d).type.name === 'tableRow') {
        const pos = $f.before(d)
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...$f.node(d).attrs, cantSplit }))
        break
      }
    }
    onClose()
  }
  return (
    <Modal title="Table Properties" onClose={onClose} width={440} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <DialogTabs
        tabs={[
          { id: 'table', label: 'Table' },
          { id: 'row', label: 'Row' },
          { id: 'cell', label: 'Cell' },
          { id: 'alt', label: 'Alt Text' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'table' && (
        <fieldset className="dlg-fieldset">
          <legend>Alignment</legend>
          <div className="dlg-inline">
            {(['left', 'center', 'right'] as const).map((a) => (
              <label key={a}>
                <input type="radio" checked={align === a} onChange={() => setAlign(a)} /> {a[0].toUpperCase() + a.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {tab === 'row' && (
        <fieldset className="dlg-fieldset">
          <legend>Size</legend>
          <label className="dlg-inline">
            Specify height: <input placeholder="Auto" value={height} onChange={(e) => setHeight(e.target.value)} />
          </label>
          <label><input type="checkbox" checked={!cantSplit} onChange={(e) => setCantSplit(!e.target.checked)} /> Allow row to break across pages</label>
          <label><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeat as header row at the top of each page</label>
        </fieldset>
      )}
      {tab === 'cell' && (
        <fieldset className="dlg-fieldset">
          <legend>Vertical alignment</legend>
          <div className="dlg-inline">
            {(['top', 'middle', 'bottom'] as const).map((a) => (
              <label key={a}>
                <input type="radio" checked={vAlign === a} onChange={() => setVAlign(a)} /> {a === 'middle' ? 'Center' : a[0].toUpperCase() + a.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {tab === 'alt' && (
        <label className="dlg-stack">
          Title:
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      )}
    </Modal>
  )
}

/** Borders and Shading: paragraph borders, page border and shading. */
export function BordersShadingDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const inTable = editor.isActive('table')
  const para = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const [tab, setTab] = useState<'borders' | 'page' | 'shading'>('borders')
  const [setting, setSetting] = useState<'none' | 'box' | 'all' | 'custom'>(para.borders ? (para.borders.length === 4 ? 'box' : 'custom') : 'none')
  const [sides, setSides] = useState<string>((para.borders as string) ?? '')
  const [pen, setPen] = useState<BorderPen>(app.tablePen)
  const pb = app.design.pageBorder
  const [page, setPage] = useState<PageBorder | null>(pb)
  const [fill, setFill] = useState<string>((inTable ? (editor.isActive('tableHeader') ? editor.getAttributes('tableHeader') : editor.getAttributes('tableCell')).backgroundColor : para.shading) ?? '')
  const toggle = (s: string) => {
    setSetting('custom')
    setSides((cur) => (cur.includes(s) ? cur.replace(s, '') : cur + s))
  }
  const apply = () => {
    if (tab === 'page' || page !== pb) app.setDesign({ ...app.design, pageBorder: page })
    if (inTable) {
      const target = setting === 'none' ? 'none' : setting === 'box' ? 'outside' : 'all'
      const c = editor.chain().focus()
      if (setting !== 'custom') c.setCellBorders(target, pen)
      else for (const [k, side] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']] as const) if (sides.includes(k)) c.setCellBorders(side, pen)
      c.setCellBackground(fill || null).run()
      app.setTablePen(pen)
    } else {
      const borders = setting === 'none' ? null : setting === 'box' || setting === 'all' ? 'tblr' : sides || null
      editor.chain().focus().setParagraphFormat({ borders, shading: fill || null }).run()
    }
    onClose()
  }
  return (
    <Modal title="Borders and Shading" onClose={onClose} width={480} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <DialogTabs
        tabs={[
          { id: 'borders', label: 'Borders' },
          { id: 'page', label: 'Page Border' },
          { id: 'shading', label: 'Shading' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'borders' && (
        <div className="borders-dlg">
          <div className="dlg-stack">
            {(['none', 'box', 'all', 'custom'] as const).map((s) => (
              <label key={s}>
                <input type="radio" checked={setting === s} onChange={() => setSetting(s)} /> {s === 'all' ? (inTable ? 'All' : 'Shadow') : s[0].toUpperCase() + s.slice(1)}
              </label>
            ))}
          </div>
          <div className="dlg-stack">
            <label className="dlg-inline">
              Style:
              <select value={pen.style} onChange={(e) => setPen({ ...pen, style: e.target.value as BorderPen['style'] })}>
                <option value="solid">Single</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
                <option value="double">Double</option>
              </select>
            </label>
            <label className="dlg-inline">
              Color: <input type="color" value={pen.color} onChange={(e) => setPen({ ...pen, color: e.target.value.toUpperCase() })} />
            </label>
            <label className="dlg-inline">
              Width:
              <select value={pen.width} onChange={(e) => setPen({ ...pen, width: Number(e.target.value) })}>
                {[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => (
                  <option key={w} value={w}>
                    {w} pt
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="border-preview">
            <span className="dlg-hint">Click to apply borders</span>
            <div className="border-box" style={{ borderTop: sides.includes('t') || setting === 'box' || setting === 'all' ? `2px ${pen.style} ${pen.color}` : '1px dashed #ccc', borderBottom: sides.includes('b') || setting === 'box' || setting === 'all' ? `2px ${pen.style} ${pen.color}` : '1px dashed #ccc', borderLeft: sides.includes('l') || setting === 'box' || setting === 'all' ? `2px ${pen.style} ${pen.color}` : '1px dashed #ccc', borderRight: sides.includes('r') || setting === 'box' || setting === 'all' ? `2px ${pen.style} ${pen.color}` : '1px dashed #ccc' }}>
              {(['t', 'b', 'l', 'r'] as const).map((s) => (
                <button key={s} type="button" className={cls('border-side', `bs-${s}`, sides.includes(s) && 'is-active')} aria-label={`Toggle ${s === 't' ? 'top' : s === 'b' ? 'bottom' : s === 'l' ? 'left' : 'right'} border`} onClick={() => toggle(s)} />
              ))}
            </div>
            <span className="dlg-hint">Apply to: {inTable ? 'Cell' : 'Paragraph'}</span>
          </div>
        </div>
      )}
      {tab === 'page' && (
        <div className="dlg-stack">
          <label className="dlg-inline">
            Setting:
            <select value={page ? page.style : 'none'} onChange={(e) => setPage(e.target.value === 'none' ? null : { style: e.target.value as PageBorder['style'], color: page?.color ?? '#000000', widthPt: page?.widthPt ?? 0.5, offsetPt: page?.offsetPt ?? 24 })}>
              <option value="none">None</option>
              <option value="single">Box – Single</option>
              <option value="double">Box – Double</option>
              <option value="thick">Box – Thick</option>
              <option value="dotted">Box – Dotted</option>
              <option value="dashed">Box – Dashed</option>
            </select>
          </label>
          {page && (
            <>
              <label className="dlg-inline">
                Color: <input type="color" value={page.color} onChange={(e) => setPage({ ...page, color: e.target.value.toUpperCase() })} />
              </label>
              <label className="dlg-inline">
                Width:
                <select value={page.widthPt} onChange={(e) => setPage({ ...page, widthPt: Number(e.target.value) })}>
                  {[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => (
                    <option key={w} value={w}>
                      {w} pt
                    </option>
                  ))}
                </select>
              </label>
              <label className="dlg-inline">
                Distance from page edge: <input type="number" min={0} max={31} value={page.offsetPt} onChange={(e) => setPage({ ...page, offsetPt: Number(e.target.value) })} /> pt
              </label>
            </>
          )}
        </div>
      )}
      {tab === 'shading' && (
        <div className="dlg-stack">
          <label className="dlg-inline">
            Fill:
            <input type="color" value={fill || '#FFFFFF'} onChange={(e) => setFill(e.target.value.toUpperCase())} />
            <button type="button" className="btn" onClick={() => setFill('')}>
              No Color
            </button>
          </label>
          <span className="dlg-hint">Apply to: {inTable ? 'Cell' : 'Paragraph'}</span>
        </div>
      )}
    </Modal>
  )
}

const NUMBER_FORMATS = ['#,##0', '#,##0.00', '$#,##0.00', '0%', '0.00']

function formatNumber(n: number, f: string) {
  if (f === '0%') return `${Math.round(n)}%`
  if (f === '0.00') return n.toFixed(2)
  const digits = f.includes('.00') ? 2 : 0
  const s = n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return f.startsWith('$') ? `$${s}` : s
}

/** Table Layout > Formula: inserts the result of =SUM(ABOVE) and similar formulas. */
export function FormulaDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [formula, setFormula] = useState('=SUM(ABOVE)')
  const [format, setFormat] = useState('')
  const result = evaluateFormula(editor.state, formula)
  const insert = () => {
    if (result == null) return
    editor.chain().focus().insertContent(format ? formatNumber(result, format) : String(Math.round(result * 100) / 100)).run()
    onClose()
  }
  return (
    <Modal title="Formula" onClose={onClose} width={380} footer={<OkCancel onOk={insert} onCancel={onClose} />}>
      <div className="dlg-stack">
        <label className="dlg-stack">
          Formula:
          <input autoFocus value={formula} onChange={(e) => setFormula(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && insert()} />
        </label>
        <div className="dlg-inline">
          <select aria-label="Number format" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="">Number format…</option>
            {NUMBER_FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select
            aria-label="Paste function"
            value=""
            onChange={(e) => e.target.value && setFormula(`=${e.target.value}(ABOVE)`)}
          >
            <option value="">Paste function…</option>
            {['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'PRODUCT'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <p className="dlg-hint">{result == null ? 'Use FUNCTION(ABOVE | BELOW | LEFT | RIGHT), for example =SUM(ABOVE).' : `Result: ${format ? formatNumber(result, format) : Math.round(result * 100) / 100}`}</p>
      </div>
    </Modal>
  )
}

export function TextToTableDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [sep, setSep] = useState<'tab' | 'comma' | 'paragraph'>('tab')
  return (
    <Modal title="Convert Text to Table" onClose={onClose} width={360} footer={<OkCancel onOk={() => (editor.chain().focus().convertTextToTable(sep).run(), onClose())} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>Separate text at</legend>
        <label><input type="radio" checked={sep === 'tab'} onChange={() => setSep('tab')} /> Tabs</label>
        <label><input type="radio" checked={sep === 'comma'} onChange={() => setSep('comma')} /> Commas</label>
        <label><input type="radio" checked={sep === 'paragraph'} onChange={() => setSep('paragraph')} /> Paragraphs</label>
      </fieldset>
      <p className="dlg-hint">Each selected paragraph becomes a row.</p>
    </Modal>
  )
}

export function CellMarginsDialog({ editor, unit, onClose }: { editor: Editor; unit: Unit; onClose: () => void }) {
  const current = (currentTableAttrs(editor.state)?.cellPadding as number | null) ?? 0.08
  const [value, setValue] = useState(formatLength(current, unit))
  const apply = () => {
    const v = parseLength(value, unit)
    if (v != null) editor.chain().focus().setTableAttribute('cellPadding', Math.max(0, Math.min(2, v))).run()
    onClose()
  }
  return (
    <Modal title="Table Options" onClose={onClose} width={340} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>Default cell margins</legend>
        <label className="dlg-inline">
          Left and right: <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
      </fieldset>
    </Modal>
  )
}

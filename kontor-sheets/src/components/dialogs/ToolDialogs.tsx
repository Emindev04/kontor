// Dialogs for the data and view tools: Consolidate, Custom Views, Recommended PivotTables,
// Forecast Sheet, Get Data (navigator) and Insert Hyperlink with places in the workbook.
import { useMemo, useState } from 'react'
import { absRef } from '../../charts/chartData'
import { cellName, rangeName } from '../../model/address'
import { CellError } from '../../model/types'
import {
  CONSOLIDATE_FNS, addCustomView, consolidate, createForecastSheet, deleteCustomView, insertRecommendedPivot, loadDataSet, placeLink, previewPivot,
  recommendPivots, showCustomView, checkAccessibility, type A11yIssue, type ConsolidateFn, type DataSet,
} from '../../commands/tools'
import { currentRegion } from '../../commands/sort'
import { useApp } from '../appContext'
import { Modal, OkCancel, cls } from '../ui'

type P = { onClose: () => void }

const selectionRef = (app: ReturnType<typeof useApp>) => absRef(app.doc.sheet, app.doc.boundToUsed(app.doc.activeRange))

export function ConsolidateDialog({ onClose }: P) {
  const app = useApp()
  const [fn, setFn] = useState<ConsolidateFn>('sum')
  const [ref, setRef] = useState(selectionRef(app))
  const [refs, setRefs] = useState<string[]>([])
  const [pick, setPick] = useState(-1)
  const [top, setTop] = useState(true)
  const [left, setLeft] = useState(true)
  const ok = () => {
    const list = refs.length ? refs : ref.trim() ? [ref.trim()] : []
    const err = consolidate(app.doc, list, fn, top, left)
    if (err) return app.alert(err, 'Consolidate')
    onClose()
  }
  return (
    <Modal title="Consolidate" onClose={onClose} width={460} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>
          Function
          <select value={fn} onChange={(e) => setFn(e.target.value as ConsolidateFn)}>
            {CONSOLIDATE_FNS.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Reference
          <span className="row">
            <input value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Reference" />
            <button type="button" className="btn" onClick={() => setRef(selectionRef(app))} title="Use the selected cells">Selection</button>
          </span>
        </label>
        <div>
          All references
          <div className="list-box" role="listbox" aria-label="All references">
            {refs.map((r, i) => (
              <button key={r + i} type="button" role="option" aria-selected={pick === i} className={cls('list-item', pick === i && 'is-active')} onClick={() => { setPick(i); setRef(r) }}>
                {r}
              </button>
            ))}
          </div>
          <span className="row">
            <button type="button" className="btn" onClick={() => ref.trim() && !refs.includes(ref.trim()) && setRefs([...refs, ref.trim()])}>Add</button>
            <button type="button" className="btn" disabled={pick < 0} onClick={() => { setRefs(refs.filter((_, i) => i !== pick)); setPick(-1) }}>Delete</button>
          </span>
        </div>
        <fieldset>
          <legend>Use labels in</legend>
          <label className="check-item"><input type="checkbox" checked={top} onChange={(e) => setTop(e.target.checked)} /> Top row</label>
          <label className="check-item"><input type="checkbox" checked={left} onChange={(e) => setLeft(e.target.checked)} /> Left column</label>
        </fieldset>
        <p className="hint">The result is placed at the active cell ({cellName(app.doc.sel.active.r, app.doc.sel.active.c)}).</p>
      </div>
    </Modal>
  )
}

export function CustomViewsDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [pick, setPick] = useState(doc.wb.customViews[0]?.name ?? '')
  const [, force] = useState(0)
  const views = doc.wb.customViews
  return (
    <Modal title="Custom Views" onClose={onClose} width={420} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      <div className="form">
        <div className="list-box" role="listbox" aria-label="Views">
          {views.length === 0 && <span className="hint">No views yet.</span>}
          {views.map((v) => (
            <button key={v.name} type="button" role="option" aria-selected={pick === v.name} className={cls('list-item', pick === v.name && 'is-active')} onClick={() => setPick(v.name)} onDoubleClick={() => { showCustomView(doc, v.name); onClose() }}>
              {v.name}
            </button>
          ))}
        </div>
        <span className="row">
          <button type="button" className="btn btn-primary" disabled={!pick} onClick={() => { const e = showCustomView(doc, pick); if (e) app.alert(e); else onClose() }}>Show</button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              app.dialog({
                kind: 'prompt',
                title: 'Add View',
                message: 'Name:',
                onText: (name) => {
                  if (name.trim()) addCustomView(doc, name.trim())
                  app.dialog({ kind: 'customViews' })
                },
              })
            }
          >
            Add…
          </button>
          <button type="button" className="btn" disabled={!pick} onClick={() => { deleteCustomView(doc, pick); setPick(doc.wb.customViews[0]?.name ?? ''); force((n) => n + 1) }}>Delete</button>
        </span>
        <p className="hint">A view keeps the zoom, selection, frozen panes, gridlines and hidden rows and columns of its sheet.</p>
      </div>
    </Modal>
  )
}

export function RecommendedPivotsDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const source = useMemo(() => {
    const rg = doc.boundToUsed(doc.activeRange)
    const single = rg.r1 === rg.r2 && rg.c1 === rg.c2
    return absRef(doc.sheet, single ? currentRegion(doc, doc.sel.active) : rg)
  }, [doc])
  const list = useMemo(() => recommendPivots(doc, source), [doc, source])
  const [pick, setPick] = useState(0)
  const preview = useMemo(() => (list[pick] ? previewPivot(doc, source, list[pick]) : []), [doc, source, list, pick])
  const ok = () => {
    if (!list[pick]) return onClose()
    const err = insertRecommendedPivot(doc, source, list[pick])
    if (err) return app.alert(err)
    onClose()
    app.setPane('pivot')
  }
  return (
    <Modal title="Recommended PivotTables" onClose={onClose} width={640} footer={<OkCancel onOk={ok} onCancel={onClose} extra={<button type="button" className="btn" onClick={() => { onClose(); app.dialog({ kind: 'createPivot' }) }}>Blank PivotTable</button>} />}>
      {list.length === 0 ? (
        <p>No PivotTables can be recommended for {source}. The data needs a header row, a text column and a number column.</p>
      ) : (
        <div className="rec-pivots">
          <div className="list-box" role="listbox" aria-label="Recommendations">
            {list.map((s, i) => (
              <button key={s.title} type="button" role="option" aria-selected={pick === i} className={cls('list-item', pick === i && 'is-active')} onClick={() => setPick(i)} onDoubleClick={ok}>
                {s.title}
              </button>
            ))}
          </div>
          <div className="rec-preview" aria-label="Preview">
            <table>
              <tbody>
                {preview.slice(0, 14).map((row, i) => (
                  <tr key={i}>
                    {row.map((v, j) => (
                      <td key={j} className={typeof v === 'number' ? 'num' : undefined}>{v === null ? '' : v instanceof CellError ? v.code : typeof v === 'number' ? Math.round(v * 100) / 100 : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function ForecastDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const rg = doc.boundToUsed(doc.activeRange.r1 === doc.activeRange.r2 && doc.activeRange.c1 === doc.activeRange.c2 ? currentRegion(doc, doc.sel.active) : doc.activeRange)
  const [timeline, setTimeline] = useState(absRef(doc.sheet, { ...rg, c2: rg.c1 }))
  const [values, setValues] = useState(absRef(doc.sheet, { ...rg, c1: Math.min(rg.c1 + 1, rg.c2), c2: Math.min(rg.c1 + 1, rg.c2) }))
  const lastT = (() => {
    const v = doc.value(rg.r2, rg.c1)
    return typeof v === 'number' ? v : 0
  })()
  const [end, setEnd] = useState(String(lastT ? Math.round(lastT + Math.max(1, (rg.r2 - rg.r1) / 3) * Math.max(1, stepOf())) : ''))
  const [conf, setConf] = useState('95')
  const [season, setSeason] = useState('')
  function stepOf() {
    const a = doc.value(rg.r2 - 1, rg.c1)
    return typeof a === 'number' && lastT ? lastT - a : 1
  }
  const ok = () => {
    const e = createForecastSheet(doc, timeline, values, Number(end), Number(conf) / 100, season.trim() ? Number(season) : 1)
    if (e) return app.alert(e, 'Forecast Sheet')
    onClose()
  }
  return (
    <Modal title="Create Forecast Worksheet" onClose={onClose} width={440} footer={<OkCancel onOk={ok} onCancel={onClose} okLabel="Create" />}>
      <div className="form">
        <label>Timeline range<input value={timeline} onChange={(e) => setTimeline(e.target.value)} /></label>
        <label>Values range<input value={values} onChange={(e) => setValues(e.target.value)} /></label>
        <label>Forecast end (timeline value)<input value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label>Confidence interval (%)<input type="number" min={1} max={99} value={conf} onChange={(e) => setConf(e.target.value)} /></label>
        <label>Seasonality (empty = detect automatically, 0 = none)<input value={season} onChange={(e) => setSeason(e.target.value)} /></label>
        <p className="hint">Creates a new sheet with the data, FORECAST.ETS formulas, confidence bounds and a line chart.</p>
      </div>
    </Modal>
  )
}

export function GetDataDialog({ data, onClose }: P & { data: unknown }) {
  const app = useApp()
  const sets = (data as DataSet[]) ?? []
  const [pick, setPick] = useState(0)
  const set = sets[pick]
  const ok = () => {
    if (!set) return onClose()
    const e = loadDataSet(app.doc, set)
    if (e) return app.alert(e)
    onClose()
  }
  return (
    <Modal title="Navigator" onClose={onClose} width={680} footer={<OkCancel onOk={ok} onCancel={onClose} okLabel="Load" />}>
      {sets.length === 0 ? (
        <p>No tables were found in this file.</p>
      ) : (
        <div className="rec-pivots">
          <div className="list-box" role="listbox" aria-label="Tables">
            {sets.map((s, i) => (
              <button key={s.name + i} type="button" role="option" aria-selected={pick === i} className={cls('list-item', pick === i && 'is-active')} onClick={() => setPick(i)} onDoubleClick={ok}>
                {s.name} <small>({Math.max(0, s.rows.length - 1)} rows)</small>
              </button>
            ))}
          </div>
          <div className="rec-preview" aria-label="Preview">
            <table>
              <tbody>
                {set?.rows.slice(0, 16).map((row, i) => (
                  <tr key={i} className={i === 0 ? 'head' : undefined}>
                    {row.slice(0, 12).map((v, j) => <td key={j}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

type LinkTab = 'web' | 'place' | 'mail'

export function HyperlinkDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const a = doc.sel.active
  const cell = doc.sheet.get(a.r, a.c)
  const old = cell?.link ?? ''
  const [tab, setTab] = useState<LinkTab>(old.startsWith('#') ? 'place' : old.startsWith('mailto:') ? 'mail' : 'web')
  const [text, setText] = useState(cell?.v !== undefined ? String(cell.v) : '')
  const [url, setUrl] = useState(old.startsWith('#') || old.startsWith('mailto:') ? '' : old)
  const placeInit = old.startsWith('#') ? old.slice(1) : ''
  const [placeSheet, setPlaceSheet] = useState(() => {
    const bang = placeInit.lastIndexOf('!')
    return bang > 0 ? placeInit.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'") : doc.sheet.name
  })
  const [placeRef, setPlaceRef] = useState(() => {
    const bang = placeInit.lastIndexOf('!')
    return bang > 0 ? placeInit.slice(bang + 1) : placeInit && doc.wb.names.has(placeInit.toUpperCase()) ? '' : 'A1'
  })
  const [placeName, setPlaceName] = useState(placeInit && doc.wb.names.has(placeInit.toUpperCase()) ? placeInit : '')
  const mail = old.startsWith('mailto:') ? old.slice(7) : ''
  const [email, setEmail] = useState(mail.split('?')[0])
  const [subject, setSubject] = useState(decodeURIComponent(/subject=([^&]*)/.exec(mail)?.[1] ?? ''))
  const href = () => {
    if (tab === 'place') {
      if (placeName) return `#${placeName}`
      const sheet = doc.wb.sheetByName(placeSheet)
      return sheet ? placeLink(sheet, placeRef || 'A1') : ''
    }
    if (tab === 'mail') return email.trim() ? `mailto:${email.trim()}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}` : ''
    const u = url.trim()
    return u && !/^[a-z]+:/i.test(u) ? `https://${u}` : u
  }
  const write = (link: string) => {
    const sheet = doc.sheet
    doc.transact(link ? 'Insert Link' : 'Remove Link', () => {
      const cur = sheet.get(a.r, a.c)
      if (!link) doc.write(sheet, a.r, a.c, cur ? { ...cur, link: undefined } : undefined)
      else doc.write(sheet, a.r, a.c, { ...(cur ?? {}), v: text || (tab === 'place' ? (placeName || `${placeSheet}!${placeRef}`) : tab === 'mail' ? email : link), f: undefined, link })
    })
    onClose()
  }
  const tabs: [LinkTab, string][] = [['web', 'Existing Web Page'], ['place', 'Place in This Document'], ['mail', 'E-mail Address']]
  return (
    <Modal
      title={old ? 'Edit Hyperlink' : 'Insert Hyperlink'}
      onClose={onClose}
      width={520}
      footer={<OkCancel onOk={() => write(href())} onCancel={onClose} extra={old ? <button type="button" className="btn" onClick={() => write('')}>Remove Link</button> : undefined} />}
    >
      <div className="link-dialog">
        <div className="link-tabs" role="tablist" aria-label="Link to">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={cls('link-tab', tab === id && 'is-active')} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="form">
          <label>Text to display<input value={text} onChange={(e) => setText(e.target.value)} /></label>
          {tab === 'web' && <label>Address<input autoFocus value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && write(href())} /></label>}
          {tab === 'place' && (
            <>
              <label>Type the cell reference<input value={placeRef} disabled={!!placeName} onChange={(e) => setPlaceRef(e.target.value.toUpperCase())} /></label>
              <div className="list-box" role="listbox" aria-label="Place in this document">
                <div className="menu-heading">Cell Reference</div>
                {doc.wb.sheets.map((s) => (
                  <button key={s.id} type="button" role="option" aria-selected={!placeName && placeSheet === s.name} className={cls('list-item', !placeName && placeSheet === s.name && 'is-active')} onClick={() => { setPlaceSheet(s.name); setPlaceName('') }}>
                    {s.name}
                  </button>
                ))}
                {doc.wb.names.size > 0 && <div className="menu-heading">Defined Names</div>}
                {[...doc.wb.names.values()].map((n) => (
                  <button key={n.name} type="button" role="option" aria-selected={placeName === n.name} className={cls('list-item', placeName === n.name && 'is-active')} onClick={() => setPlaceName(n.name)}>
                    {n.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === 'mail' && (
            <>
              <label>E-mail address<input value={email} placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} /></label>
              <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function AccessibilityDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const issues = useMemo(() => checkAccessibility(doc), [doc])
  const go = (i: A11yIssue) => {
    if (!i.go) return
    const sheet = doc.wb.sheetById(i.go.sheet)
    if (!sheet) return
    doc.activeIndex = doc.wb.sheets.indexOf(sheet)
    if (i.go.obj) doc.selObj = i.go.obj
    else doc.select({ r: i.go.r, c: i.go.c })
    doc.emit()
  }
  const groups = (['Errors', 'Warnings', 'Tips'] as const).map((level) => ({ level, list: issues.filter((i) => i.level === level) }))
  return (
    <Modal title="Accessibility" onClose={onClose} width={520} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      {issues.length === 0 ? (
        <p>No accessibility issues found. People with disabilities should not have difficulty reading this workbook.</p>
      ) : (
        <div className="a11y">
          {groups.filter((g) => g.list.length).map((g) => (
            <details key={g.level} open>
              <summary>{g.level} ({g.list.length})</summary>
              {g.list.map((i, k) => (
                <button key={k} type="button" className="list-item a11y-item" onClick={() => go(i)} title={i.fix}>
                  <strong>{i.rule}</strong> <small>{i.sheet} · {i.where}</small>
                  <span className="hint">{i.fix}</span>
                </button>
              ))}
            </details>
          ))}
        </div>
      )}
    </Modal>
  )
}

/** Review > Spelling (F7): steps through the text cells; the browser's spell checker marks mistakes and offers suggestions (right-click). */
export function SpellingDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const cells = useMemo(() => {
    const out: { r: number; c: number; text: string }[] = []
    for (const [k, d] of doc.sheet.cells) if (typeof d.v === 'string' && d.f === undefined && /[A-Za-z]{2,}/.test(d.v)) out.push({ r: Math.floor(k / 16384), c: k % 16384, text: d.v })
    return out.sort((a, b) => a.r - b.r || a.c - b.c)
  }, [doc])
  const [i, setI] = useState(0)
  const [text, setText] = useState(cells[0]?.text ?? '')
  const go = (n: number) => {
    if (n >= cells.length) {
      onClose()
      return app.alert('The spelling check is complete for the entire sheet.', 'Spelling')
    }
    setI(n)
    setText(cells[n].text)
    doc.select({ r: cells[n].r, c: cells[n].c })
  }
  const cur = cells[i]
  if (!cur) return <Modal title="Spelling" onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}><p>This sheet has no text to check.</p></Modal>
  return (
    <Modal
      title={`Spelling: English (United States) – ${cellName(cur.r, cur.c)}`}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={() => go(i + 1)}>Ignore</button>
          <button type="button" className="btn btn-primary" onClick={() => { if (text !== cur.text) doc.transact('Spelling', () => doc.write(doc.sheet, cur.r, cur.c, { ...(doc.sheet.get(cur.r, cur.c) ?? {}), v: text })); go(i + 1) }}>Change</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </>
      }
    >
      <p className="hint">Words the browser does not know are underlined; right-click one for suggestions, then choose Change.</p>
      <textarea className="spell-text" spellCheck lang="en-US" value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      <p className="hint">Cell {i + 1} of {cells.length}</p>
    </Modal>
  )
}

const ERROR_HELP: Record<string, string> = {
  '#DIV/0!': 'The formula or function divides by zero or by an empty cell.',
  '#N/A': 'A value is not available to the formula or function (for example a lookup found no match).',
  '#NAME?': 'The formula contains text that is not recognized: a misspelled function or an undefined name.',
  '#REF!': 'The formula refers to a cell that is not valid, often because it was deleted.',
  '#VALUE!': 'A value used in the formula is of the wrong data type.',
  '#NUM!': 'The formula contains numbers that are not valid for the calculation.',
  '#NULL!': 'Two ranges in the formula do not intersect.',
  '#SPILL!': 'The result of this formula needs more cells than are empty.',
  '#CALC!': 'The calculation could not be completed (for example an empty array).',
}

/** Formulas > Error Checking: steps through the formulas that return errors. */
export function ErrorCheckingDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const list = useMemo(() => {
    const out: { r: number; c: number; f: string; code: string }[] = []
    for (const [k, d] of doc.sheet.cells) {
      if (d.f === undefined) continue
      const r = Math.floor(k / 16384)
      const c = k % 16384
      const v = doc.value(r, c)
      if (v instanceof CellError) out.push({ r, c, f: d.f, code: v.code })
    }
    return out.sort((a, b) => a.r - b.r || a.c - b.c)
  }, [doc])
  const [i, setI] = useState(0)
  const cur = list[i]
  const show = (n: number) => {
    setI(n)
    if (list[n]) doc.select({ r: list[n].r, c: list[n].c })
  }
  if (!cur) return <Modal title="Error Checking" onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>OK</button>}><p>The error check of the entire sheet is complete.</p></Modal>
  return (
    <Modal
      title="Error Checking"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" disabled={i === 0} onClick={() => show(i - 1)}>Previous</button>
          <button type="button" className="btn" disabled={i >= list.length - 1} onClick={() => show(i + 1)}>Next</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </>
      }
    >
      <div className="form">
        <p><strong>Error in cell {cellName(cur.r, cur.c)}</strong> ({i + 1} of {list.length})</p>
        <code className="err-formula">={cur.f}</code>
        <p><strong>{cur.code}</strong> – {ERROR_HELP[cur.code] ?? 'The formula returns an error.'}</p>
        <span className="row">
          <button type="button" className="btn" onClick={() => { doc.select({ r: cur.r, c: cur.c }); onClose(); app.dialog({ kind: 'evaluateFormula' }) }}>Show Calculation Steps…</button>
          <button type="button" className="btn" onClick={() => { doc.select({ r: cur.r, c: cur.c }); onClose(); doc.beginEdit('edit') }}>Edit in Formula Bar</button>
          <button type="button" className="btn" onClick={() => (i < list.length - 1 ? show(i + 1) : onClose())}>Ignore Error</button>
        </span>
      </div>
    </Modal>
  )
}

/** Review > Show Changes: the edits made in this session, newest first. */
export function ShowChangesDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const list = [...doc.undoStack].reverse()
  return (
    <Modal title="Changes" onClose={onClose} width={420} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      {list.length === 0 ? (
        <p>No changes in this session yet.</p>
      ) : (
        <div className="list-box changes">
          {list.map((e, k) => {
            const sheet = doc.wb.sheetById(e.sheetAfter)
            const rg = (e.selAfter as { ranges?: { r1: number; c1: number; r2: number; c2: number }[] } | undefined)?.ranges?.[0]
            return (
              <button key={k} type="button" className="list-item" onClick={() => { if (sheet) doc.activeIndex = doc.wb.sheets.indexOf(sheet); if (rg) doc.selectRange(rg); doc.emit() }}>
                <strong>{e.label}</strong> <small>{sheet?.name}{rg ? `!${cellName(rg.r1, rg.c1)}` : ''}</small>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export { rangeName }

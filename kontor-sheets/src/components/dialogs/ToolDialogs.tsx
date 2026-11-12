// Dialogs for the data and view tools: Consolidate, Custom Views, Recommended PivotTables,
// Forecast Sheet, Get Data (navigator) and Insert Hyperlink with places in the workbook.
import { getLanguage, t, tx } from '../../i18n'
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
  const [links, setLinks] = useState(false)
  const ok = () => {
    const list = refs.length ? refs : ref.trim() ? [ref.trim()] : []
    const err = consolidate(app.doc, list, fn, top, left, links)
    if (err) return app.alert(err, t('Consolidate'))
    onClose()
  }
  return (
    <Modal title={t('Consolidate')} onClose={onClose} width={460} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>
          {t('Function')}
          <select value={fn} onChange={(e) => setFn(e.target.value as ConsolidateFn)}>
            {CONSOLIDATE_FNS.map(([id, label]) => (
              <option key={id} value={id}>{t(label)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('Reference')}
          <span className="row">
            <input value={ref} onChange={(e) => setRef(e.target.value)} aria-label={t('Reference')} />
            <button type="button" className="btn" onClick={() => setRef(selectionRef(app))} title={t('Use the selected cells')}>{t('Selection')}</button>
          </span>
        </label>
        <div>
          {t('All references')}
          <div className="list-box" role="listbox" aria-label={t('All references')}>
            {refs.map((r, i) => (
              <button key={r + i} type="button" role="option" aria-selected={pick === i} className={cls('list-item', pick === i && 'is-active')} onClick={() => { setPick(i); setRef(r) }}>
                {r}
              </button>
            ))}
          </div>
          <span className="row">
            <button type="button" className="btn" onClick={() => ref.trim() && !refs.includes(ref.trim()) && setRefs([...refs, ref.trim()])}>{t('Add')}</button>
            <button type="button" className="btn" disabled={pick < 0} onClick={() => { setRefs(refs.filter((_, i) => i !== pick)); setPick(-1) }}>{t('Delete')}</button>
          </span>
        </div>
        <fieldset>
          <legend>{t('Use labels in')}</legend>
          <label className="check-item"><input type="checkbox" checked={top} onChange={(e) => setTop(e.target.checked)} />{' '}{t('Top row')}</label>
          <label className="check-item"><input type="checkbox" checked={left} onChange={(e) => setLeft(e.target.checked)} />{' '}{t('Left column')}</label>
          <label className="check-item"><input type="checkbox" checked={links} onChange={(e) => setLinks(e.target.checked)} /> {t('Create links to source data')}</label>
        </fieldset>
        <p className="hint">{t('The result is placed at the active cell ({cell}).', { cell: cellName(app.doc.sel.active.r, app.doc.sel.active.c) })}</p>
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
    <Modal title={t('Custom Views')} onClose={onClose} width={420} footer={<button type="button" className="btn" onClick={onClose}>{t('Close')}</button>}>
      <div className="form">
        <div className="list-box" role="listbox" aria-label={t('Views')}>
          {views.length === 0 && <span className="hint">{t('No views yet.')}</span>}
          {views.map((v) => (
            <button key={v.name} type="button" role="option" aria-selected={pick === v.name} className={cls('list-item', pick === v.name && 'is-active')} onClick={() => setPick(v.name)} onDoubleClick={() => { showCustomView(doc, v.name); onClose() }}>
              {v.name}
            </button>
          ))}
        </div>
        <span className="row">
          <button type="button" className="btn btn-primary" disabled={!pick} onClick={() => { const e = showCustomView(doc, pick); if (e) app.alert(e); else onClose() }}>{t('Show')}</button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              app.dialog({
                kind: 'prompt',
                title: t('Add View'),
                message: t('Name:'),
                onText: (name) => {
                  if (name.trim()) addCustomView(doc, name.trim())
                  app.dialog({ kind: 'customViews' })
                },
              })
            }
          >
            {t('Add…')}
          </button>
          <button type="button" className="btn" disabled={!pick} onClick={() => { deleteCustomView(doc, pick); setPick(doc.wb.customViews[0]?.name ?? ''); force((n) => n + 1) }}>{t('Delete')}</button>
        </span>
        <p className="hint">{t('A view keeps the zoom, selection, frozen panes, gridlines and hidden rows and columns of its sheet.')}</p>
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
    <Modal title={t('Recommended PivotTables')} onClose={onClose} width={640} footer={<OkCancel onOk={ok} onCancel={onClose} extra={<button type="button" className="btn" onClick={() => { onClose(); app.dialog({ kind: 'createPivot' }) }}>{t('Blank PivotTable')}</button>} />}>
      {list.length === 0 ? (
        <p>{t('No PivotTables can be recommended for {source}. The data needs a header row, a text column and a number column.', { source })}</p>
      ) : (
        <div className="rec-pivots">
          <div className="list-box" role="listbox" aria-label={t('Recommendations')}>
            {list.map((s, i) => (
              <button key={s.title} type="button" role="option" aria-selected={pick === i} className={cls('list-item', pick === i && 'is-active')} onClick={() => setPick(i)} onDoubleClick={ok}>
                {s.title}
              </button>
            ))}
          </div>
          <div className="rec-preview" aria-label={t('Preview')}>
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
    if (e) return app.alert(e, t('Forecast Sheet'))
    onClose()
  }
  return (
    <Modal title={t('Create Forecast Worksheet')} onClose={onClose} width={440} footer={<OkCancel onOk={ok} onCancel={onClose} okLabel={t('Create')} />}>
      <div className="form">
        <label>{t('Timeline range')}<input value={timeline} onChange={(e) => setTimeline(e.target.value)} /></label>
        <label>{t('Values range')}<input value={values} onChange={(e) => setValues(e.target.value)} /></label>
        <label>{t('Forecast end (timeline value)')}<input value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label>{t('Confidence interval (%)')}<input type="number" min={1} max={99} value={conf} onChange={(e) => setConf(e.target.value)} /></label>
        <label>{t('Seasonality (empty = detect automatically, 0 = none)')}<input value={season} onChange={(e) => setSeason(e.target.value)} /></label>
        <p className="hint">{t('Creates a new sheet with the data, FORECAST.ETS formulas, confidence bounds and a line chart.')}</p>
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
    <Modal title={t('Navigator')} onClose={onClose} width={680} footer={<OkCancel onOk={ok} onCancel={onClose} okLabel={t('Load')} />}>
      {sets.length === 0 ? (
        <p>{t('No tables were found in this file.')}</p>
      ) : (
        <div className="rec-pivots">
          <div className="list-box" role="listbox" aria-label={t('Tables')}>
            {sets.map((s, i) => (
              <button key={s.name + i} type="button" role="option" aria-selected={pick === i} className={cls('list-item', pick === i && 'is-active')} onClick={() => setPick(i)} onDoubleClick={ok}>
                {s.name} <small>{t('({n} rows)', { n: Math.max(0, s.rows.length - 1) })}</small>
              </button>
            ))}
          </div>
          <div className="rec-preview" aria-label={t('Preview')}>
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
    doc.transact(link ? t('Insert Link') : t('Remove Link'), () => {
      const cur = sheet.get(a.r, a.c)
      if (!link) doc.write(sheet, a.r, a.c, cur ? { ...cur, link: undefined } : undefined)
      else doc.write(sheet, a.r, a.c, { ...(cur ?? {}), v: text || (tab === 'place' ? (placeName || `${placeSheet}!${placeRef}`) : tab === 'mail' ? email : link), f: undefined, link })
    })
    onClose()
  }
  const tabs: [LinkTab, string][] = [['web', t('Existing Web Page')], ['place', t('Place in This Document')], ['mail', t('E-mail Address')]]
  return (
    <Modal
      title={old ? t('Edit Hyperlink') : t('Insert Hyperlink')}
      onClose={onClose}
      width={520}
      footer={<OkCancel onOk={() => write(href())} onCancel={onClose} extra={old ? <button type="button" className="btn" onClick={() => write('')}>{t('Remove Link')}</button> : undefined} />}
    >
      <div className="link-dialog">
        <div className="link-tabs" role="tablist" aria-label={t('Link to')}>
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={cls('link-tab', tab === id && 'is-active')} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="form">
          <label>{t('Text to display')}<input value={text} onChange={(e) => setText(e.target.value)} /></label>
          {tab === 'web' && <label>{t('Address')}<input autoFocus value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && write(href())} /></label>}
          {tab === 'place' && (
            <>
              <label>{t('Type the cell reference')}<input value={placeRef} disabled={!!placeName} onChange={(e) => setPlaceRef(e.target.value.toUpperCase())} /></label>
              <div className="list-box" role="listbox" aria-label={t('Place in this document')}>
                <div className="menu-heading">{t('Cell Reference')}</div>
                {doc.wb.sheets.map((s) => (
                  <button key={s.id} type="button" role="option" aria-selected={!placeName && placeSheet === s.name} className={cls('list-item', !placeName && placeSheet === s.name && 'is-active')} onClick={() => { setPlaceSheet(s.name); setPlaceName('') }}>
                    {s.name}
                  </button>
                ))}
                {doc.wb.names.size > 0 && <div className="menu-heading">{t('Defined Names')}</div>}
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
              <label>{t('E-mail address')}<input value={email} placeholder={t('name@example.com')} onChange={(e) => setEmail(e.target.value)} /></label>
              <label>{t('Subject')}<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
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
    if (i.go.obj) {
      doc.selObj = i.go.obj
      doc.selObjs = []
    }
    else doc.select({ r: i.go.r, c: i.go.c })
    doc.emit()
  }
  const groups = (['Errors', 'Warnings', 'Tips'] as const).map((level) => ({ level, list: issues.filter((i) => i.level === level) }))
  return (
    <Modal title={t('Accessibility')} onClose={onClose} width={520} footer={<button type="button" className="btn" onClick={onClose}>{t('Close')}</button>}>
      {issues.length === 0 ? (
        <p>{t('No accessibility issues found. People with disabilities should not have difficulty reading this workbook.')}</p>
      ) : (
        <div className="a11y">
          {groups.filter((g) => g.list.length).map((g) => (
            <details key={g.level} open>
              <summary>{t(g.level)} ({g.list.length})</summary>
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
      return app.alert(t('The spelling check is complete for the entire sheet.'), t('Spelling'))
    }
    setI(n)
    setText(cells[n].text)
    doc.select({ r: cells[n].r, c: cells[n].c })
  }
  const cur = cells[i]
  if (!cur) return <Modal title={t('Spelling')} onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>{t('Close')}</button>}><p>{t('This sheet has no text to check.')}</p></Modal>
  return (
    <Modal
      title={t('Spelling: English (United States) – {cell}', { cell: cellName(cur.r, cur.c) })}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={() => go(i + 1)}>{t('Ignore')}</button>
          <button type="button" className="btn btn-primary" onClick={() => { if (text !== cur.text) doc.transact(tx('Spelling'), () => doc.write(doc.sheet, cur.r, cur.c, { ...(doc.sheet.get(cur.r, cur.c) ?? {}), v: text })); go(i + 1) }}>{t('Change')}</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>{t('Close')}</button>
        </>
      }
    >
      <p className="hint">{t('Words the browser does not know are underlined; right-click one for suggestions, then choose Change.')}</p>
      <textarea className="spell-text" spellCheck lang="en-US" value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      <p className="hint">{t('Cell {n} of {total}', { n: i + 1, total: cells.length })}</p>
    </Modal>
  )
}

const ERROR_HELP: Record<string, string> = {
  '#DIV/0!': tx('The formula or function divides by zero or by an empty cell.'),
  '#N/A': tx('A value is not available to the formula or function (for example a lookup found no match).'),
  '#NAME?': tx('The formula contains text that is not recognized: a misspelled function or an undefined name.'),
  '#REF!': tx('The formula refers to a cell that is not valid, often because it was deleted.'),
  '#VALUE!': tx('A value used in the formula is of the wrong data type.'),
  '#NUM!': tx('The formula contains numbers that are not valid for the calculation.'),
  '#NULL!': tx('Two ranges in the formula do not intersect.'),
  '#SPILL!': tx('The result of this formula needs more cells than are empty.'),
  '#CALC!': tx('The calculation could not be completed (for example an empty array).'),
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
  if (!cur) return <Modal title={t('Error Checking')} onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>{t('OK')}</button>}><p>{t('The error check of the entire sheet is complete.')}</p></Modal>
  return (
    <Modal
      title={t('Error Checking')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" disabled={i === 0} onClick={() => show(i - 1)}>{t('Previous')}</button>
          <button type="button" className="btn" disabled={i >= list.length - 1} onClick={() => show(i + 1)}>{t('Next')}</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>{t('Close')}</button>
        </>
      }
    >
      <div className="form">
        <p><strong>{t('Error in cell {cell}', { cell: cellName(cur.r, cur.c) })}</strong> {t('({n} of {total})', { n: i + 1, total: list.length })}</p>
        <code className="err-formula">={cur.f}</code>
        <p><strong>{cur.code}</strong> – {t(ERROR_HELP[cur.code] ?? 'The formula returns an error.')}</p>
        <span className="row">
          <button type="button" className="btn" onClick={() => { doc.select({ r: cur.r, c: cur.c }); onClose(); app.dialog({ kind: 'evaluateFormula' }) }}>{t('Show Calculation Steps…')}</button>
          <button type="button" className="btn" onClick={() => { doc.select({ r: cur.r, c: cur.c }); onClose(); doc.beginEdit('edit') }}>{t('Edit in Formula Bar')}</button>
          <button type="button" className="btn" onClick={() => (i < list.length - 1 ? show(i + 1) : onClose())}>{t('Ignore Error')}</button>
        </span>
      </div>
    </Modal>
  )
}

/** Review > Show Changes: the edits made in this session, newest first. */
export function ShowChangesDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [onlySel, setOnlySel] = useState(false)
  const sel = doc.activeRange
  const list = [...doc.wb.changes].reverse().filter((e) => !onlySel || (e.sheet === doc.sheet.name && e.cells.some((c) => c.r >= sel.r1 && c.r <= sel.r2 && c.c >= sel.c1 && c.c <= sel.c2)))
  const when = (iso: string) => new Date(iso).toLocaleString(getLanguage(), { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <Modal title={t('Changes')} onClose={onClose} width={480} footer={<button type="button" className="btn" onClick={onClose}>{t('Close')}</button>}>
      <label className="check-item">
        <input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> {t('Only changes in the selected range')}
      </label>
      {list.length === 0 ? (
        <p>{t('No changes were recorded yet.')}</p>
      ) : (
        <div className="list-box changes">
          {list.map((e, k) => {
            const sheet = doc.wb.sheetByName(e.sheet)
            const first = e.cells[0]
            return (
              <button
                key={k}
                type="button"
                className="list-item change-item"
                onClick={() => {
                  if (sheet) doc.activeIndex = doc.wb.sheets.indexOf(sheet)
                  if (first) doc.select({ r: first.r, c: first.c })
                  doc.emit()
                }}
              >
                <span>
                  <strong>{e.author || t('Unknown author')}</strong> <small>{when(e.time)}</small>
                </span>
                <span>{e.label}</span>
                {e.cells.slice(0, 5).map((c, i) => (
                  <small key={i}>
                    {t('{cell}: "{old}" → "{new}"', { cell: `${e.sheet}!${cellName(c.r, c.c)}`, old: c.old, new: c.new })}
                  </small>
                ))}
                {e.count > 5 && <small>{t('and {n} more cells', { n: e.count - 5 })}</small>}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export { rangeName }

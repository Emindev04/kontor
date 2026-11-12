// Dialogs for tables, charts, diagrams, media and slide shows.
import { useEffect, useState, type ReactNode } from 'react'
import type { ChartGrouping, ChartType, CustomShow, DiagramLayout } from '../model/types'
import { mapCells, originOf, splitCell } from '../model/table'
import { CHART_TYPES, THREE_D_TYPES, chartToGrid, gridToChart, groupingLabel } from '../model/chart'
import { DIAGRAM_LAYOUTS, type DiagramCategory } from '../model/diagram'
import { DiagramThumb } from './tabs/DiagramTabs'
import { EffectOptionsDialogBody, effectLabel } from './tabs/AnimationsTab'
import * as AA from '../store/animActions'
import { TrimBody } from './tabs/MediaTabs'
import { APP_NAME } from '../brand'
import { beginTransaction, commit, endTransaction, store, useStore as useStoreSel } from '../store/store'
import { slideTitleText as slideTitle } from '../model/accessibility'
import * as A from '../store/actions'
import { Modal, NumberField } from './ui'
import { t, tx } from '../i18n'

export function OkCancel({ onOk, onClose, okLabel = 'OK', disabled }: { onOk: () => void; onClose: () => void; okLabel?: string; disabled?: boolean }) {
  return (
    <>
      <span className="spacer" />
      <button type="button" className="btn btn-primary" disabled={disabled} onClick={onOk}>
        {okLabel}
      </button>
      <button type="button" className="btn" onClick={onClose}>
        {t('Cancel')}
      </button>
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-row form-row">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function InsertTableDialog({ onClose }: { onClose: () => void }) {
  const [cols, setCols] = useState(5)
  const [rows, setRows] = useState(2)
  const ok = () => {
    onClose()
    A.insertTable(Math.round(rows), Math.round(cols))
  }
  return (
    <Modal title={t('Insert Table')} onClose={onClose} width={300} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="form">
        <Field label={t('Number of columns:')}>
          <NumberField label={t('Number of columns')} value={cols} min={1} max={75} step={1} decimals={0} onChange={setCols} />
        </Field>
        <Field label={t('Number of rows:')}>
          <NumberField label={t('Number of rows')} value={rows} min={1} max={75} step={1} decimals={0} onChange={setRows} />
        </Field>
      </div>
    </Modal>
  )
}

export function SplitCellsDialog({ onClose }: { onClose: () => void }) {
  const cur = A.currentTable()
  const [cols, setCols] = useState(2)
  const [rows, setRows] = useState(1)
  if (!cur) return null
  const ok = () => {
    onClose()
    const ts = store.get().tableSel
    const at = ts ? originOf(cur.t, ts.anchor.r, ts.anchor.c) : { r: cur.range.r0, c: cur.range.c0 }
    A.updateTable((t) => splitCell(t, at.r, at.c, Math.round(rows), Math.round(cols)))
    A.selectCells(cur.t.id, at)
  }
  return (
    <Modal title={t('Split Cells')} onClose={onClose} width={300} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="form">
        <Field label={t('Number of columns:')}>
          <NumberField label={t('Number of columns')} value={cols} min={1} max={20} step={1} decimals={0} onChange={setCols} />
        </Field>
        <Field label={t('Number of rows:')}>
          <NumberField label={t('Number of rows')} value={rows} min={1} max={20} step={1} decimals={0} onChange={setRows} />
        </Field>
      </div>
    </Modal>
  )
}

export function CellMarginsDialog({ onClose }: { onClose: () => void }) {
  const cur = A.currentTable()
  const first = cur ? cur.t.rows[cur.range.r0].cells[cur.range.c0].margins ?? [9.6, 4.8, 9.6, 4.8] : [9.6, 4.8, 9.6, 4.8]
  const [m, setM] = useState<[number, number, number, number]>([first[0] / 96, first[1] / 96, first[2] / 96, first[3] / 96])
  if (!cur) return null
  const set = (i: number, v: number) => setM((prev) => prev.map((x, j) => (j === i ? v : x)) as [number, number, number, number])
  const ok = () => {
    onClose()
    const px = m.map((v) => v * 96) as [number, number, number, number]
    A.updateTable((t, rg) => mapCells(t, rg, (c) => ({ ...c, margins: px })))
  }
  return (
    <Modal title={t('Cell Text Layout')} onClose={onClose} width={340} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="form">
        {([tx('Left'), tx('Top'), tx('Right'), tx('Bottom')] as const).map((label, i) => (
          <Field key={label} label={t('{name}:', { name: t(label) })}>
            <NumberField label={t('{name} margin', { name: t(label) })} value={m[i]} min={0} max={5} step={0.05} suffix='"' onChange={(v) => set(i, v)} />
          </Field>
        ))}
      </div>
    </Modal>
  )
}

// ---------- Charts ----------

export function ChartTypeIcon({ type, grouping = 'clustered', size = 40 }: { type: ChartType; grouping?: ChartGrouping; size?: number }) {
  const a = '#4472C4'
  const b = '#ED7D31'
  const c = '#A5A5A5'
  const g = (children: ReactNode) => (
    <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden="true">
      {children}
    </svg>
  )
  switch (type) {
    case 'column':
      return g(
        grouping === 'clustered' ? (
          <>
            <rect x="5" y="12" width="5" height="16" fill={a} />
            <rect x="10" y="18" width="5" height="10" fill={b} />
            <rect x="22" y="6" width="5" height="22" fill={a} />
            <rect x="27" y="14" width="5" height="14" fill={b} />
          </>
        ) : (
          <>
            <rect x="7" y={grouping === 'percent' ? 2 : 10} width="8" height={grouping === 'percent' ? 14 : 9} fill={b} />
            <rect x="7" y={grouping === 'percent' ? 16 : 19} width="8" height={grouping === 'percent' ? 12 : 9} fill={a} />
            <rect x="24" y={grouping === 'percent' ? 2 : 4} width="8" height={grouping === 'percent' ? 9 : 10} fill={b} />
            <rect x="24" y={grouping === 'percent' ? 11 : 14} width="8" height={grouping === 'percent' ? 17 : 14} fill={a} />
          </>
        ),
      )
    case 'bar':
      return g(
        <>
          <rect x="4" y="4" width="22" height="5" fill={a} />
          <rect x="4" y="9" width="14" height="5" fill={b} />
          <rect x="4" y="17" width="30" height="5" fill={a} />
          <rect x="4" y="22" width="18" height="5" fill={b} />
        </>,
      )
    case 'line':
      return g(
        <>
          <polyline points="3,22 13,12 23,17 37,5" fill="none" stroke={a} strokeWidth="2" />
          <polyline points="3,26 13,22 23,24 37,15" fill="none" stroke={b} strokeWidth="2" />
        </>,
      )
    case 'area':
      return g(
        <>
          <polygon points="3,28 3,14 13,8 23,13 37,4 37,28" fill={a} />
          <polygon points="3,28 3,22 13,19 23,23 37,16 37,28" fill={b} />
        </>,
      )
    case 'pie':
      return g(
        <>
          <circle cx="20" cy="15" r="12" fill={c} />
          <path d="M20 15 L20 3 A12 12 0 0 1 31 19 Z" fill={a} />
          <path d="M20 15 L31 19 A12 12 0 0 1 14 25.5 Z" fill={b} />
        </>,
      )
    case 'doughnut':
      return g(
        <>
          <circle cx="20" cy="15" r="12" fill="none" stroke={c} strokeWidth="7" />
          <path d="M20 3 A12 12 0 0 1 31 19" fill="none" stroke={a} strokeWidth="7" />
        </>,
      )
    case 'scatter':
      return g(
        <>
          {[
            [6, 22],
            [11, 16],
            [17, 19],
            [22, 10],
            [28, 13],
            [34, 5],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2" fill={i % 2 ? b : a} />
          ))}
        </>,
      )
    case 'combo':
      return g(
        <>
          <rect x="5" y="14" width="6" height="14" fill={a} />
          <rect x="17" y="10" width="6" height="18" fill={a} />
          <rect x="29" y="16" width="6" height="12" fill={a} />
          <polyline points="8,10 20,4 32,8" fill="none" stroke={b} strokeWidth="2" />
        </>,
      )
  }
}

export function InsertChartDialog({ onClose, change }: { onClose: () => void; change?: boolean }) {
  const existing = change ? A.currentChart() : null
  const [type, setType] = useState<ChartType>(existing?.chartType ?? 'column')
  const [grouping, setGrouping] = useState<ChartGrouping>(existing?.grouping ?? 'clustered')
  const [threeD, setThreeD] = useState(!!existing?.threeD)
  const def = CHART_TYPES.find((t) => t.type === type)!
  const can3d = THREE_D_TYPES.has(type)
  const ok = () => {
    onClose()
    const td = can3d && threeD ? true : undefined
    if (existing) A.updateChart((c) => ({ ...c, chartType: type, grouping: def.groupings ? grouping : 'clustered', threeD: td, series: type === 'combo' ? c.series.map((s, i) => ({ ...s, type: s.type ?? (i === 0 ? 'column' : 'line') })) : c.series }))
    else {
      A.insertChart(type, def.groupings ? grouping : 'clustered')
      if (td) A.updateChart((c) => ({ ...c, threeD: true }))
    }
  }
  return (
    <Modal title={change ? t('Change Chart Type') : t('Insert Chart')} onClose={onClose} width={620} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="chart-dialog">
        <div className="chart-type-list" role="listbox" aria-label={t('Chart types')}>
          {CHART_TYPES.map((ct) => (
            <button key={ct.type} type="button" role="option" aria-selected={ct.type === type} className={ct.type === type ? 'is-active' : undefined} onClick={() => setType(ct.type)} onDoubleClick={ok}>
              <ChartTypeIcon type={ct.type} size={28} /> {t(ct.label)}
            </button>
          ))}
        </div>
        <div className="chart-type-detail">
          <div className="chart-subtypes">
            {(def.groupings ?? ['clustered']).map((g) => (
              <button key={g} type="button" title={def.groupings ? groupingLabel(type, g) : t(def.label)} className={g === grouping || !def.groupings ? 'is-active' : undefined} onClick={() => setGrouping(g)} onDoubleClick={ok}>
                <ChartTypeIcon type={type} grouping={g} size={56} />
              </button>
            ))}
          </div>
          <p className="chart-type-name">
            {can3d && threeD ? `${t('3-D')} ` : ''}
            {def.groupings ? groupingLabel(type, grouping) : t(def.label)}
          </p>
          {can3d && (
            <label className="check">
              <input type="checkbox" checked={threeD} onChange={(e) => setThreeD(e.target.checked)} /> {t('3-D')}
            </label>
          )}
          <div className="chart-preview">
            <ChartTypeIcon type={type} grouping={grouping} size={260} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** The chart's worksheet: edit categories, series names and values; changes show live. */
export function ChartDataDialog({ onClose }: { onClose: () => void }) {
  const chart = A.currentChart()
  const [grid, setGrid] = useState<string[][]>(() => (chart ? chartToGrid(chart) : [['']]))
  useEffect(() => {
    beginTransaction()
    return () => endTransaction()
  }, [])
  if (!chart) return null
  const apply = (next: string[][]) => {
    setGrid(next)
    A.updateChart((c) => ({ ...c, ...gridToChart(next, c.series) }))
  }
  const set = (r: number, c: number, v: string) => apply(grid.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)))
  const cols = Math.max(...grid.map((r) => r.length))
  const colName = (i: number) => String.fromCharCode(65 + i)
  const onPaste = (e: React.ClipboardEvent, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const rows = text.replace(/\r/g, '').split('\n').filter((l, i, a) => l || i < a.length - 1).map((l) => l.split('\t'))
    const next = grid.map((row) => [...row])
    rows.forEach((row, i) =>
      row.forEach((v, j) => {
        while (next.length <= r + i) next.push(Array(cols).fill(''))
        while (next[r + i].length <= c + j) next[r + i].push('')
        next[r + i][c + j] = v
      }),
    )
    const w = Math.max(...next.map((x) => x.length))
    apply(next.map((x) => [...x, ...Array(w - x.length).fill('')]))
  }
  return (
    <Modal
      title={t('Chart in {app}', { app: APP_NAME })}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button type="button" className="btn" onClick={() => apply([...grid, Array(cols).fill('')])}>
            {t('Add Row')}
          </button>
          <button type="button" className="btn" onClick={() => apply(grid.map((r, i) => [...r, i === 0 ? t('Series {n}', { n: cols }) : '']))}>
            {t('Add Series')}
          </button>
          <button type="button" className="btn" disabled={grid.length <= 2} onClick={() => apply(grid.slice(0, -1))}>
            {t('Delete Row')}
          </button>
          <button type="button" className="btn" disabled={cols <= 2} onClick={() => apply(grid.map((r) => r.slice(0, -1)))}>
            {t('Delete Series')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('Close')}
          </button>
        </>
      }
    >
      <div className="chart-sheet-wrap">
        <table className="chart-sheet">
          <thead>
            <tr>
              <th />
              {Array.from({ length: cols }, (_, i) => (
                <th key={i}>{colName(i)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className={r === 0 && c > 0 ? 'is-series' : c === 0 && r > 0 ? 'is-cat' : undefined}>
                    <input value={row[c] ?? ''} aria-label={`${colName(c)}${r + 1}`} onChange={(e) => set(r, c, e.target.value)} onPaste={(e) => onPaste(e, r, c)} style={{ textAlign: r > 0 && c > 0 ? 'right' : 'left' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('Row 1 holds the series names and column A the categories. Paste cells from a spreadsheet to fill several at once.')}</p>
    </Modal>
  )
}

// ---------- Diagrams ----------

export function InsertDiagramDialog({ onClose }: { onClose: () => void }) {
  const [cat, setCat] = useState<DiagramCategory | 'All'>('All')
  const [layout, setLayout] = useState<DiagramLayout>('basicList')
  const cats: (DiagramCategory | 'All')[] = ['All', 'List', 'Process', 'Cycle', 'Hierarchy', 'Relationship', 'Matrix', 'Pyramid']
  const catLabels: Record<DiagramCategory | 'All', string> = { All: tx('All'), List: tx('List'), Process: tx('Process'), Cycle: tx('Cycle'), Hierarchy: tx('Hierarchy'), Relationship: tx('Relationship'), Matrix: tx('Matrix'), Pyramid: tx('Pyramid') }
  const def = DIAGRAM_LAYOUTS.find((l) => l.id === layout)!
  const ok = () => {
    onClose()
    A.insertDiagram(layout)
  }
  return (
    <Modal title={t('Choose a Diagram')} onClose={onClose} width={720} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="chart-dialog">
        <div className="chart-type-list" role="listbox" aria-label={t('Diagram types')}>
          {cats.map((c) => (
            <button key={c} type="button" role="option" aria-selected={c === cat} className={c === cat ? 'is-active' : undefined} onClick={() => setCat(c)}>
              {t(catLabels[c])}
            </button>
          ))}
        </div>
        <div className="diagram-choices">
          {DIAGRAM_LAYOUTS.filter((l) => cat === 'All' || l.category === cat).map((l) => (
            <button key={l.id} type="button" title={t(l.label)} className={l.id === layout ? 'is-active' : undefined} onClick={() => setLayout(l.id)} onDoubleClick={ok}>
              <DiagramThumb layout={l.id} width={84} height={64} />
            </button>
          ))}
        </div>
        <div className="diagram-detail">
          <DiagramThumb layout={layout} width={180} height={135} />
          <strong>{t(def.label)}</strong>
          <p>{t(def.description)}</p>
        </div>
      </div>
    </Modal>
  )
}

export function EffectOptionsDialog({ onClose }: { onClose: () => void }) {
  const entry = AA.selectedEntries()[0]
  const [draft, setDraft] = useState(entry)
  if (!entry || !draft) return null
  const ok = () => {
    onClose()
    const { id, ...patch } = draft
    AA.updateEntries(patch, [id])
  }
  return (
    <Modal title={effectLabel(entry)} onClose={onClose} width={420} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <EffectOptionsDialogBody entry={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
    </Modal>
  )
}

// ---------- Custom slide shows ----------

function DefineShow({ show, onDone, onCancel }: { show: CustomShow; onDone: (s: CustomShow) => void; onCancel: () => void }) {
  const slides = store.get().pres.slides
  const [name, setName] = useState(show.name)
  const [ids, setIds] = useState<string[]>(show.slideIds)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [cur, setCur] = useState<number | null>(null)
  const title = (id: string) => {
    const i = slides.findIndex((s) => s.id === id)
    return `${i + 1}. ${slideTitle(slides[i]) || t('Slide')}`
  }
  const move = (d: -1 | 1) => {
    if (cur === null) return
    const j = cur + d
    if (j < 0 || j >= ids.length) return
    const next = [...ids]
    ;[next[cur], next[j]] = [next[j], next[cur]]
    setIds(next)
    setCur(j)
  }
  return (
    <Modal title={t('Define Custom Show')} onClose={onCancel} width={640} footer={<OkCancel onOk={() => onDone({ ...show, name: name.trim() || t('Custom Show'), slideIds: ids })} onClose={onCancel} />}>
      <div className="form">
        <label className="field-row form-row">
          <span>{t('Slide show name:')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
      </div>
      <div className="define-show">
        <div>
          <div className="field-caption">{t('Slides in presentation:')}</div>
          <ul className="pick-list">
            {slides.map((s) => (
              <li key={s.id}>
                <label className="check">
                  <input type="checkbox" checked={pick.has(s.id)} onChange={(e) => setPick((p) => (e.target.checked ? new Set([...p, s.id]) : new Set([...p].filter((x) => x !== s.id))))} /> {title(s.id)}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="define-buttons">
          <button type="button" className="btn" disabled={!pick.size} onClick={() => (setIds([...ids, ...slides.filter((s) => pick.has(s.id)).map((s) => s.id)]), setPick(new Set()))}>
            {t('Add »')}
          </button>
          <button type="button" className="btn" disabled={cur === null} onClick={() => (cur !== null && setIds(ids.filter((_, i) => i !== cur)), setCur(null))}>
            {t('« Remove')}
          </button>
          <button type="button" className="btn" disabled={cur === null} onClick={() => move(-1)}>
            {t('Up')}
          </button>
          <button type="button" className="btn" disabled={cur === null} onClick={() => move(1)}>
            {t('Down')}
          </button>
        </div>
        <div>
          <div className="field-caption">{t('Slides in custom show:')}</div>
          <ul className="pick-list">
            {ids.map((id, i) => (
              <li key={`${id}-${i}`} className={cur === i ? 'is-selected' : undefined} onClick={() => setCur(i)}>
                {i + 1}. {title(id).replace(/^\d+\. /, '')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}

export function CustomShowsDialog({ onClose }: { onClose: () => void }) {
  const shows = useStoreSel((s) => s.pres.customShows ?? [])
  const [sel, setSel] = useState<string | null>(shows[0]?.id ?? null)
  const [editing, setEditing] = useState<CustomShow | null>(null)
  const save = (list: CustomShow[]) => commit((p) => ({ ...p, customShows: list }))
  if (editing)
    return (
      <DefineShow
        show={editing}
        onCancel={() => setEditing(null)}
        onDone={(s) => {
          save(shows.some((x) => x.id === s.id) ? shows.map((x) => (x.id === s.id ? s : x)) : [...shows, s])
          setSel(s.id)
          setEditing(null)
        }}
      />
    )
  const current = shows.find((s) => s.id === sel)
  return (
    <Modal
      title={t('Custom Shows')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" disabled={!current} onClick={() => (onClose(), store.set({ show: { start: 0, custom: current!.id } }))}>
            {t('Show')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('Close')}
          </button>
        </>
      }
    >
      <div className="custom-shows">
        <ul className="pick-list">
          {shows.map((s) => (
            <li key={s.id} className={s.id === sel ? 'is-selected' : undefined} onClick={() => setSel(s.id)} onDoubleClick={() => setEditing(s)}>
              {s.name}
            </li>
          ))}
          {!shows.length && <li className="hint">{t('No custom shows yet.')}</li>}
        </ul>
        <div className="define-buttons">
          <button type="button" className="btn" onClick={() => setEditing({ id: `cs${Date.now().toString(36)}`, name: t('Custom Show {n}', { n: shows.length + 1 }), slideIds: [] })}>
            {t('New…')}
          </button>
          <button type="button" className="btn" disabled={!current} onClick={() => current && setEditing(current)}>
            {t('Edit…')}
          </button>
          <button type="button" className="btn" disabled={!current} onClick={() => current && (save(shows.filter((s) => s.id !== current.id)), setSel(null))}>
            {t('Remove')}
          </button>
          <button type="button" className="btn" disabled={!current} onClick={() => current && save([...shows, { ...current, id: `cs${Date.now().toString(36)}`, name: t('Copy of {name}', { name: current.name }) }])}>
            {t('Copy')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function TrimMediaDialog({ onClose }: { onClose: () => void }) {
  const m = A.currentMedia()
  const duration = m?.duration ?? 0
  const [start, setStart] = useState(m?.trimStart ?? 0)
  const [end, setEnd] = useState(m?.trimEnd ?? duration)
  if (!m) return null
  const ok = () => {
    onClose()
    A.updateMedia({ trimStart: start, trimEnd: end >= duration - 0.01 ? null : end })
  }
  return (
    <Modal title={m.kind === 'video' ? t('Trim Video') : t('Trim Audio')} onClose={onClose} width={420} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      {m.kind === 'video' && <video className="trim-preview" src={m.src} poster={m.poster ?? undefined} controls preload="metadata" />}
      <TrimBody start={start} end={end} duration={duration} onChange={(s0, e0) => (setStart(s0), setEnd(e0))} />
    </Modal>
  )
}

// PivotTable dialogs: Grouping (dates by period, numbers by ranges) and Calculated Field.
import { useMemo, useState } from 'react'
import type { DateUnit, PivotDef } from '../../model/extras'
import { groupPivotField, readSource, setCalcField } from '../../commands/pivot'
import { insertSlicers, insertTimeline, slicerFields, timelineFields, type SlicerTarget } from '../../commands/slicers'
import { Modal, OkCancel } from '../ui'
import { useApp } from '../appContext'

type P = { onClose: () => void; data?: unknown }

const UNITS: [DateUnit, string][] = [['days', 'Days'], ['months', 'Months'], ['quarters', 'Quarters'], ['years', 'Years']]

function usePivot(id: unknown): PivotDef | undefined {
  const { doc } = useApp()
  return doc.wb.sheets.flatMap((s) => s.x.pivots).find((x) => x.id === id)
}

export function PivotGroupDialog({ onClose, data }: P) {
  const app = useApp()
  const doc = app.doc
  const p = usePivot(data)
  const src = useMemo(() => (p ? readSource(doc, { source: p.source }) : null), [doc, p])
  // fields that can be grouped: dates or numbers in the row/column area first
  const candidates = useMemo(() => {
    if (!p || !src) return []
    const numeric = (f: string) => src.rows.some((r) => typeof r.values[src.fields.indexOf(f)] === 'number')
    const placed = [...p.rows, ...p.cols].filter((f) => src.fields.includes(f))
    return [...placed, ...src.fields.filter((f) => !placed.includes(f))].filter(numeric)
  }, [p, src])
  const [field, setField] = useState(candidates[0] ?? '')
  const info = useMemo(() => {
    if (!src || !field) return null
    const i = src.fields.indexOf(field)
    const nums = src.rows.map((r) => r.values[i]).filter((v): v is number => typeof v === 'number')
    const fmt = src.fmts[i] ?? ''
    const isDate = /[dmy]/i.test(fmt.replace(/"[^"]*"/g, '')) && !/^\[?\$/.test(fmt)
    return { min: nums.length ? Math.min(...nums) : 0, max: nums.length ? Math.max(...nums) : 0, isDate }
  }, [src, field])
  const existing = p?.groups?.[field]
  const [units, setUnits] = useState<DateUnit[]>(existing?.kind === 'date' ? existing.units : ['months'])
  const [start, setStart] = useState(String(existing?.kind === 'number' ? existing.start : Math.floor(info?.min ?? 0)))
  const [end, setEnd] = useState(String(existing?.kind === 'number' ? existing.end : Math.ceil(info?.max ?? 0)))
  const [step, setStep] = useState(String(existing?.kind === 'number' ? existing.step : 10))
  if (!p) return null
  if (!candidates.length) {
    return (
      <Modal title="Grouping" onClose={onClose} width={360} footer={<OkCancel onOk={onClose} onCancel={onClose} />}>
        <p>Cannot group that selection. Only date and number fields can be grouped.</p>
      </Modal>
    )
  }
  const ok = () => {
    if (info?.isDate) {
      if (!units.length) return app.alert('Select at least one period.')
      groupPivotField(doc, p.id, field, { kind: 'date', units })
    } else {
      const s = Number(start)
      const e = Number(end)
      const b = Number(step)
      if (![s, e, b].every(Number.isFinite) || b <= 0 || e < s) return app.alert('The ending value must be greater than the starting value, and By must be greater than 0.')
      groupPivotField(doc, p.id, field, { kind: 'number', start: s, end: e, step: b })
    }
    onClose()
  }
  return (
    <Modal title="Grouping" onClose={onClose} width={360} footer={<OkCancel onOk={ok} onCancel={onClose} extra={existing ? <button type="button" className="btn" onClick={() => { groupPivotField(doc, p.id, field, null); onClose() }}>Ungroup</button> : undefined} />}>
      <div className="form">
        <label>
          Field:{' '}
          <select value={field} onChange={(e) => setField(e.target.value)}>
            {candidates.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        {info?.isDate ? (
          <fieldset className="dlg-fieldset">
            <legend>By</legend>
            <div className="list-box" role="listbox" aria-multiselectable="true">
              {UNITS.map(([u, label]) => (
                <label key={u} className="check-item">
                  <input type="checkbox" checked={units.includes(u)} onChange={(e) => setUnits(e.target.checked ? [...units, u] : units.filter((x) => x !== u))} /> {label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset className="dlg-fieldset">
            <legend>Auto</legend>
            <label>Starting at: <input value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Ending at: <input value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <label>By: <input value={step} onChange={(e) => setStep(e.target.value)} /></label>
          </fieldset>
        )}
      </div>
    </Modal>
  )
}

export function CalcFieldDialog({ onClose, data }: P) {
  const app = useApp()
  const doc = app.doc
  const p = usePivot(data)
  const src = useMemo(() => (p ? readSource(doc, { source: p.source, groups: p.groups }) : null), [doc, p])
  const list = p?.calcFields ?? []
  const [name, setName] = useState(`Field${list.length + 1}`)
  const [formula, setFormula] = useState('= 0')
  if (!p || !src) return null
  const known = list.find((c) => c.name.toUpperCase() === name.trim().toUpperCase())
  const insertField = (f: string) => setFormula((t) => `${t.replace(/\s*0$/, '')}${/^[A-Za-z_][\w.]*$/.test(f) ? f : `'${f}'`}`)
  const save = (close: boolean) => {
    const n = name.trim()
    if (!n) return app.alert('Enter a name for the calculated field.')
    const err = setCalcField(doc, p.id, n, formula)
    if (err) return app.alert(err)
    if (close) onClose()
  }
  return (
    <Modal
      title="Insert Calculated Field"
      onClose={onClose}
      width={420}
      footer={
        <OkCancel
          onOk={() => save(true)}
          onCancel={onClose}
          extra={
            <>
              <button type="button" className="btn" onClick={() => save(false)}>{known ? 'Modify' : 'Add'}</button>
              {known && <button type="button" className="btn" onClick={() => { setCalcField(doc, p.id, known.name, null); onClose() }}>Delete</button>}
            </>
          }
        />
      }
    >
      <div className="form">
        <label>
          Name:{' '}
          <input list="calc-fields" value={name} onChange={(e) => {
            setName(e.target.value)
            const hit = list.find((c) => c.name === e.target.value)
            if (hit) setFormula(hit.formula)
          }} />
          <datalist id="calc-fields">{list.map((c) => <option key={c.name} value={c.name} />)}</datalist>
        </label>
        <label>Formula: <input value={formula} onChange={(e) => setFormula(e.target.value)} /></label>
        <fieldset className="dlg-fieldset">
          <legend>Fields</legend>
          <div className="list-box">
            {src.fields.map((f) => (
              <button key={f} type="button" className="list-item" onDoubleClick={() => insertField(f)} onClick={() => insertField(f)}>
                {f}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  )
}

/** Insert Slicers: one checkbox per field of the table or PivotTable at the active cell. */
export function InsertSlicerDialog({ onClose, data }: P) {
  const app = useApp()
  const doc = app.doc
  const target = data as SlicerTarget & { timeline?: boolean }
  const timeline = !!target.timeline && target.type === 'pivot'
  const fields = useMemo(() => (timeline && target.type === 'pivot' ? timelineFields(doc, target.pivot) : slicerFields(doc, target)), [doc, target, timeline])
  const [picked, setPicked] = useState<string[]>([])
  const ok = () => {
    const chosen = fields.filter((f) => picked.includes(f))
    if (timeline && target.type === 'pivot') for (const f of chosen) insertTimeline(doc, target.pivot, f)
    else insertSlicers(doc, target, chosen)
    onClose()
  }
  return (
    <Modal title={timeline ? 'Insert Timelines' : 'Insert Slicers'} onClose={onClose} width={300} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      {timeline && !fields.length && <p>The PivotTable's source has no date fields.</p>}
      <div className="list-box slicer-pick">
        {fields.map((f) => (
          <label key={f} className="check-item">
            <input type="checkbox" checked={picked.includes(f)} onChange={(e) => setPicked(e.target.checked ? [...picked, f] : picked.filter((x) => x !== f))} /> {f}
          </label>
        ))}
      </div>
    </Modal>
  )
}

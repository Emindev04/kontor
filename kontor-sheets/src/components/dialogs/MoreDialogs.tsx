// Dialogs for protection, outlines, subtotals, what-if analysis, advanced filter, formula
// evaluation, headers/footers, sparklines, notes, alt text and icons.
import { toLocalFormula } from '../../engine/localize'
import { useMemo, useRef, useState } from 'react'
import {
  Heart, Star, Home, User, Users, Mail, Phone, Calendar, Clock, Camera, Car, Cloud, Coffee, DollarSign, Euro, Flag, Gift, Globe, Key, Lightbulb, Lock, MapPin,
  Music, Plane, Rocket, Search, Settings, ShoppingCart, Smile, Sun, Moon, ThumbsUp, Trophy, Truck, Wifi, Zap, Bell, Book, Briefcase, Building, ChartPie,
  CircleCheck, CircleX, CircleAlert, Info, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Leaf, Bike, Bus, Ship, Train, Laptop, Smartphone, Printer, Database,
  Shield, Target, TrendingUp, TrendingDown, Award, Package, Tag, Wrench, Hammer, Scissors, Paperclip, Pencil, Trash2, Eye, Battery, Anchor,
} from 'lucide-react'
import { cellKey, cellName, colName, parseCell, rangeName, type Range } from '../../model/address'
import type { Scenario, SheetPermission, Sparkline } from '../../model/extras'
import { CellError, type Scalar } from '../../model/types'
import { Matrix } from '../../model/matrix'
import { parseInput } from '../../model/parseInput'
import { numberSymbols } from '../../model/numberLocale'
import { resolveRef } from '../../charts/chartData'
import { PERMISSIONS, protectSheet, protectWorkbook, setEditRanges, setNote, noteAt, unprotectSheet, unprotectWorkbook, unlockRange } from '../../commands/review'
import { passwordHash } from '../../model/extras'
import { group, removeSubtotals, subtotal, ungroup, SUBTOTAL_FNS } from '../../commands/outline'
import { addObject, newPicture, updateObject } from '../../commands/objects'
import { addSheet } from '../../commands/ops'
import { detectHeader, currentRegion } from '../../commands/sort'
import { applyFilters } from '../../commands/filter'
import { tokenize } from '../../engine/tokenizer'
import { Modal, OkCancel, cls } from '../ui'
import { useApp } from '../appContext'
import { t, tx } from '../../i18n'

type P = { onClose: () => void }

function ref(app: ReturnType<typeof useApp>, text: string) {
  return resolveRef(app.doc.wb, text, app.doc.sheet)
}

const absName = (rg: Range) => rangeName(rg).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')

// ---------- protection ----------

export function ProtectSheetDialog({ onClose }: P) {
  const app = useApp()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [allow, setAllow] = useState<Partial<Record<SheetPermission, boolean>>>({ selectLocked: true, selectUnlocked: true })
  const ok = () => {
    if (pw && pw2 !== pw) return app.alert(t('Confirmation password is not identical.'))
    protectSheet(app.doc, pw, allow)
    onClose()
  }
  return (
    <Modal title={t('Protect Sheet')} onClose={onClose} width={380} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label className="check-item"><input type="checkbox" checked readOnly />{' '}{t('Protect worksheet and contents of locked cells')}</label>
        <label>{t('Password to unprotect sheet:')}{' '}<input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {pw && <label>{t('Reenter password to proceed:')}{' '}<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>}
        <div className="dlg-hint">{t('Allow all users of this worksheet to:')}</div>
        <div className="perm-list">
          {PERMISSIONS.map(([k, label]) => (
            <label key={k} className="check-item">
              <input type="checkbox" checked={!!allow[k]} onChange={(e) => setAllow({ ...allow, [k]: e.target.checked })} /> {t(label)}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export function PasswordDialog({ onClose, kind }: P & { kind: 'sheet' | 'workbook' | 'protectWorkbook' }) {
  const app = useApp()
  const [pw, setPw] = useState('')
  const ok = () => {
    if (kind === 'protectWorkbook') {
      protectWorkbook(app.doc, pw)
      onClose()
      return
    }
    const done = kind === 'sheet' ? unprotectSheet(app.doc, pw) : unprotectWorkbook(app.doc, pw)
    if (!done) return app.alert(t('The password you supplied is not correct. Verify that the CAPS LOCK key is off and be sure to use the correct capitalization.'))
    onClose()
  }
  const title = kind === 'sheet' ? t('Unprotect Sheet') : kind === 'workbook' ? t('Unprotect Workbook') : t('Protect Structure and Windows')
  return (
    <Modal title={title} onClose={onClose} width={340} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        {kind === 'protectWorkbook' && <label className="check-item"><input type="checkbox" checked readOnly />{' '}{t('Structure')}</label>}
        <label>{kind === 'protectWorkbook' ? t('Password (optional):') : t('Password:')} <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} /></label>
      </div>
    </Modal>
  )
}

export function AllowEditRangesDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [list, setList] = useState(doc.sheet.x.editRanges.map((e) => ({ ...e, pw: '' })))
  const [title, setTitle] = useState(`Range${list.length + 1}`)
  const [refText, setRef] = useState('=' + absName(doc.activeRange))
  const [pw, setPw] = useState('')
  const add = () => {
    const r = ref(app, refText)
    if (!r) return app.alert(t('The reference is not valid.'))
    setList([...list, { title, range: r.range, hash: passwordHash(pw), pw }])
    setTitle(`Range${list.length + 2}`)
    setPw('')
  }
  const ok = () => {
    setEditRanges(doc, list.map(({ title: t, range, hash }) => ({ title: t, range, hash })))
    for (const e of list) if (!e.hash) unlockRange(doc.sheet, e.title)
    onClose()
  }
  return (
    <Modal title={t('Allow Users to Edit Ranges')} onClose={onClose} width={480} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <table className="pane-table">
        <thead><tr><th>{t('Title')}</th><th>{t('Refers to cells')}</th><th>{t('Password')}</th><th /></tr></thead>
        <tbody>
          {list.map((e, i) => (
            <tr key={i}>
              <td>{e.title}</td>
              <td>{absName(e.range)}</td>
              <td>{e.hash ? '••••' : t('(none)')}</td>
              <td><button type="button" className="icon-btn" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!doc.sheet.x.protection && <p className="dlg-hint">{t('Ranges unlocked when a sheet is protected. Protect the sheet to make them take effect.')}</p>}
      <fieldset className="dlg-fieldset">
        <legend>{t('New Range')}</legend>
        <div className="form">
          <label>{t('Title:')}{' '}<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>{t('Refers to cells:')}{' '}<input value={refText} onChange={(e) => setRef(e.target.value)} /></label>
          <label>{t('Range password:')}{' '}<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <button type="button" className="btn" onClick={add}>{t('Add')}</button>
        </div>
      </fieldset>
    </Modal>
  )
}

// ---------- outline ----------

export function GroupDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const [axis, setAxis] = useState<'row' | 'col'>('row')
  const isUngroup = data === 'ungroup'
  const ok = () => {
    if (isUngroup) ungroup(app.doc, axis)
    else {
      const err = group(app.doc, axis)
      if (err) return app.alert(err)
    }
    onClose()
  }
  return (
    <Modal title={isUngroup ? t('Ungroup') : t('Group')} onClose={onClose} width={260} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label className="check-item"><input type="radio" checked={axis === 'row'} onChange={() => setAxis('row')} />{' '}{t('Rows')}</label>
        <label className="check-item"><input type="radio" checked={axis === 'col'} onChange={() => setAxis('col')} />{' '}{t('Columns')}</label>
      </div>
    </Modal>
  )
}

export function SubtotalDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const rg = useMemo(() => {
    let r = doc.activeRange
    if (r.r1 === r.r2 && r.c1 === r.c2) r = currentRegion(doc, doc.sel.active)
    return doc.boundToUsed(r)
  }, [doc])
  const headers = Array.from({ length: rg.c2 - rg.c1 + 1 }, (_, i) => String(doc.value(rg.r1, rg.c1 + i) ?? t('Column {name}', { name: colName(rg.c1 + i) })))
  const [by, setBy] = useState(rg.c1)
  const [fn, setFn] = useState(9)
  const [cols, setCols] = useState<number[]>([rg.c2])
  const [replace, setReplace] = useState(true)
  const [below, setBelow] = useState(true)
  const ok = () => {
    if (!detectHeader(doc, rg) && typeof doc.value(rg.r1, rg.c1) !== 'string') return app.alert(t('The first row of the selection must contain column labels.'))
    const err = subtotal(doc, rg, by, fn, cols, { replace, below })
    if (err) return app.alert(err)
    onClose()
  }
  return (
    <Modal
      title={t('Subtotal')}
      onClose={onClose}
      width={360}
      footer={<OkCancel onOk={ok} onCancel={onClose} extra={<button type="button" className="btn" onClick={() => { removeSubtotals(doc, rg); onClose() }}>{t('Remove All')}</button>} />}
    >
      <div className="form">
        <label>{t('At each change in:')}
          <select value={by} onChange={(e) => setBy(Number(e.target.value))}>
            {headers.map((h, i) => <option key={i} value={rg.c1 + i}>{h}</option>)}
          </select>
        </label>
        <label>{t('Use function:')}
          <select value={fn} onChange={(e) => setFn(Number(e.target.value))}>
            {SUBTOTAL_FNS.map(([n, l]) => <option key={n} value={n}>{t(l)}</option>)}
          </select>
        </label>
        <div className="dlg-hint">{t('Add subtotal to:')}</div>
        <div className="perm-list">
          {headers.map((h, i) => (
            <label key={i} className="check-item">
              <input type="checkbox" checked={cols.includes(rg.c1 + i)} onChange={(e) => setCols(e.target.checked ? [...cols, rg.c1 + i] : cols.filter((c) => c !== rg.c1 + i))} /> {h}
            </label>
          ))}
        </div>
        <label className="check-item"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />{' '}{t('Replace current subtotals')}</label>
        <label className="check-item"><input type="checkbox" checked={below} onChange={(e) => setBelow(e.target.checked)} />{' '}{t('Summary below data')}</label>
      </div>
    </Modal>
  )
}

// ---------- what-if ----------

/** Evaluates `cells` with `input` temporarily set to `value` (the substitution behind data tables and scenarios). */
function withInput<T>(app: ReturnType<typeof useApp>, input: { r: number; c: number }, value: Scalar, read: () => T): T {
  const doc = app.doc
  const sheet = doc.sheet
  const k = cellKey(input.r, input.c)
  const orig = sheet.cells.get(k)
  sheet.setRaw(k, { ...(orig ?? {}), v: value ?? undefined, f: undefined })
  doc.engine.cellsChanged(sheet, [k])
  doc.engine.recalc(true)
  try {
    return read()
  } finally {
    sheet.setRaw(k, orig)
    doc.engine.cellsChanged(sheet, [k])
    doc.engine.recalc(true)
  }
}

export function DataTableDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [rowIn, setRowIn] = useState('')
  const [colIn, setColIn] = useState('')
  const rg = doc.activeRange
  const ok = () => {
    const ri = rowIn ? parseCell(rowIn.replace(/\$/g, '')) : null
    const ci = colIn ? parseCell(colIn.replace(/\$/g, '')) : null
    if (!ri && !ci) return app.alert(t('Enter a row input cell, a column input cell, or both.'))
    if (rg.r2 <= rg.r1 && rg.c2 <= rg.c1) return app.alert(t('Select the whole data table range first (formula and input values).'))
    const sheet = doc.sheet
    const results: { r: number; c: number; v: Scalar }[] = []
    const val = (r: number, c: number) => doc.value(r, c)
    if (ri && ci) {
      // two-variable table: formula in the corner
      for (let r = rg.r1 + 1; r <= rg.r2; r++)
        for (let c = rg.c1 + 1; c <= rg.c2; c++) {
          const v = withInput(app, ri, val(rg.r1, c), () => withInput(app, ci, val(r, rg.c1), () => doc.engine.display(sheet, rg.r1, rg.c1)))
          results.push({ r, c, v })
        }
    } else if (ci) {
      // column input: values down the first column, formulas across the first row
      for (let r = rg.r1 + 1; r <= rg.r2; r++) {
        const vals = withInput(app, ci, val(r, rg.c1), () => Array.from({ length: rg.c2 - rg.c1 }, (_, i) => doc.engine.display(sheet, rg.r1, rg.c1 + 1 + i)))
        vals.forEach((v, i) => results.push({ r, c: rg.c1 + 1 + i, v }))
      }
    } else if (ri) {
      for (let c = rg.c1 + 1; c <= rg.c2; c++) {
        const vals = withInput(app, ri, val(rg.r1, c), () => Array.from({ length: rg.r2 - rg.r1 }, (_, i) => doc.engine.display(sheet, rg.r1 + 1 + i, rg.c1)))
        vals.forEach((v, i) => results.push({ r: rg.r1 + 1 + i, c, v }))
      }
    }
    doc.transact(tx('Data Table'), () => {
      for (const x of results) {
        const old = sheet.get(x.r, x.c)
        doc.write(sheet, x.r, x.c, { ...(old?.s ? { s: old.s } : {}), v: x.v ?? undefined })
      }
    })
    onClose()
  }
  return (
    <Modal title={t('Data Table')} onClose={onClose} width={340} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>{t('Row input cell:')}{' '}<input autoFocus value={rowIn} onChange={(e) => setRowIn(e.target.value)} /></label>
        <label>{t('Column input cell:')}{' '}<input value={colIn} onChange={(e) => setColIn(e.target.value)} /></label>
        <p className="dlg-hint">{t('Results are filled in as values. Recalculate by running Data Table again.')}</p>
      </div>
    </Modal>
  )
}

export function ScenarioDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const sheet = doc.sheet
  const [list, setList] = useState<Scenario[]>(sheet.x.scenarios)
  const [sel, setSel] = useState(0)
  const [editing, setEditing] = useState<Scenario | null>(null)
  const [results, setResults] = useState('')
  const cellsOf = (s: Scenario) => {
    const r = ref(app, s.cells)
    if (!r) return []
    const out: { r: number; c: number }[] = []
    for (let rr = r.range.r1; rr <= r.range.r2; rr++) for (let cc = r.range.c1; cc <= r.range.c2; cc++) out.push({ r: rr, c: cc })
    return out
  }
  const save = (next: Scenario[]) => {
    setList(next)
    doc.transact(tx('Scenario Manager'), () => {
      doc.noteProps(sheet)
      sheet.x.scenarios = next
    })
  }
  const show = (s: Scenario) => {
    const cells = cellsOf(s)
    doc.transact(t('Show Scenario "{name}"', { name: s.name }), () => {
      cells.forEach((cell, i) => {
        const old = sheet.get(cell.r, cell.c)
        doc.write(sheet, cell.r, cell.c, { ...(old?.s ? { s: old.s } : {}), v: s.values[i] ?? undefined })
      })
    })
  }
  const summary = () => {
    const res = ref(app, results)
    const resCells: { r: number; c: number }[] = []
    if (res) for (let r = res.range.r1; r <= res.range.r2; r++) for (let c = res.range.c1; c <= res.range.c2; c++) resCells.push({ r, c })
    const origSheet = sheet
    const rows: Scalar[][] = [['Scenario Summary', ...list.map((s) => s.name)]]
    if (list.length) {
      cellsOf(list[0]).forEach((cell, i) => rows.push([cellName(cell.r, cell.c), ...list.map((s) => s.values[i] ?? null)]))
      for (const rc of resCells) {
        const vals = list.map((s) => {
          const cells = cellsOf(s)
          // apply all changing cells, read the result
          const apply = (k: number): Scalar => (k >= cells.length ? doc.engine.display(origSheet, rc.r, rc.c) : withInput(app, cells[k], s.values[k], () => apply(k + 1)))
          return apply(0)
        })
        rows.push([`Result ${cellName(rc.r, rc.c)}`, ...vals])
      }
    }
    addSheet(doc)
    const out = doc.sheet
    doc.transact(tx('Scenario Summary'), () => {
      out.name = 'Scenario Summary'.slice(0, 31)
      rows.forEach((row, r) => row.forEach((v, c) => v !== null && doc.write(out, r + 1, c + 1, { v, ...(r === 0 ? { s: doc.wb.styles.intern({ bold: true, fill: '#DDEBF7' }) } : {}) })))
    })
    onClose()
  }
  if (editing) {
    return (
      <Modal title={sheet.x.scenarios.some((s) => s.name === editing.name) ? t('Edit Scenario') : t('Add Scenario')} onClose={() => setEditing(null)} width={420} footer={<OkCancel onOk={() => {
        const cells = cellsOf(editing)
        if (!editing.name || !cells.length) return app.alert(t('Enter a scenario name and changing cells.'))
        const values = cells.map((c, i) => editing.values[i] ?? doc.value(c.r, c.c))
        const idx = list.findIndex((s) => s.name === editing.name)
        save(idx >= 0 ? list.map((s, i) => (i === idx ? { ...editing, values } : s)) : [...list, { ...editing, values }])
        setEditing(null)
      }} onCancel={() => setEditing(null)} />}>
        <div className="form">
          <label>{t('Scenario name:')}{' '}<input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
          <label>{t('Changing cells:')}{' '}<input value={editing.cells} onChange={(e) => setEditing({ ...editing, cells: e.target.value, values: [] })} /></label>
          {cellsOf(editing).slice(0, 32).map((c, i) => (
            <label key={i}>{cellName(c.r, c.c)}: <input value={String(editing.values[i] ?? doc.value(c.r, c.c) ?? '')} onChange={(e) => {
              const values = cellsOf(editing).map((cc, j) => editing.values[j] ?? doc.value(cc.r, cc.c))
              const p = parseInput(e.target.value, numberSymbols())
              values[i] = p.kind === 'value' ? p.v : e.target.value
              setEditing({ ...editing, values })
            }} /></label>
          ))}
          <label>{t('Comment:')}{' '}<input value={editing.comment} onChange={(e) => setEditing({ ...editing, comment: e.target.value })} /></label>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title={t('Scenario Manager')} onClose={onClose} width={460} footer={<><span className="spacer" /><button type="button" className="btn" onClick={onClose}>{t('Close')}</button></>}>
      <div className="sd-cols">
        <select size={8} value={sel} onChange={(e) => setSel(Number(e.target.value))}>
          {list.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
        </select>
        <div className="dlg-stack">
          <button type="button" className="btn" onClick={() => setEditing({ name: t('Scenario {n}', { n: list.length + 1 }), cells: '=' + absName(doc.activeRange), values: [], comment: '' })}>{t('Add…')}</button>
          <button type="button" className="btn" disabled={!list[sel]} onClick={() => save(list.filter((_, i) => i !== sel))}>{t('Delete')}</button>
          <button type="button" className="btn" disabled={!list[sel]} onClick={() => setEditing({ ...list[sel] })}>{t('Edit…')}</button>
          <button type="button" className="btn" disabled={!list[sel]} onClick={() => show(list[sel])}>{t('Show')}</button>
          <input placeholder={t('Result cells, e.g. B10')} value={results} onChange={(e) => setResults(e.target.value)} />
          <button type="button" className="btn" disabled={!list.length} onClick={summary}>{t('Summary…')}</button>
        </div>
      </div>
      {list[sel] && <p className="dlg-hint">{t('Changing cells:')} {list[sel].cells}{list[sel].comment ? ` — ${list[sel].comment}` : ''}</p>}
    </Modal>
  )
}

// ---------- advanced filter ----------

function matchCriterion(v: Scalar, crit: Scalar): boolean {
  if (crit === null || crit === '') return true
  if (typeof crit === 'number') return v === crit
  const s = String(crit)
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s)!
  const op = m[1] ?? ''
  const rhs = m[2]
  const num = Number(rhs)
  if (op && rhs !== '' && Number.isFinite(num) && typeof v === 'number') {
    switch (op) {
      case '<': return v < num
      case '>': return v > num
      case '<=': return v <= num
      case '>=': return v >= num
      case '<>': return v !== num
      case '=': return v === num
    }
  }
  const text = v === null ? '' : String(v instanceof CellError ? v.code : v)
  const re = new RegExp('^' + rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + (op ? '$' : ''), 'i')
  if (op === '<>') return !re.test(text)
  return re.test(text)
}

export function AdvancedFilterDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const start = useMemo(() => doc.boundToUsed(currentRegion(doc, doc.sel.active)), [doc])
  const [list, setList] = useState('=' + absName(start))
  const [crit, setCrit] = useState('')
  const [copy, setCopy] = useState(false)
  const [dest, setDest] = useState('')
  const [unique, setUnique] = useState(false)
  const ok = () => {
    const L = ref(app, list)
    if (!L) return app.alert(t('The list range is not valid.'))
    const C = crit ? ref(app, crit) : null
    const sheet = doc.sheet
    const lr = L.range
    const header = Array.from({ length: lr.c2 - lr.c1 + 1 }, (_, i) => String(doc.value(lr.r1, lr.c1 + i) ?? '').toUpperCase())
    const rules: { col: number; v: Scalar }[][] = []
    if (C) {
      const cr = C.range
      for (let r = cr.r1 + 1; r <= cr.r2; r++) {
        const row: { col: number; v: Scalar }[] = []
        for (let c = cr.c1; c <= cr.c2; c++) {
          const name = String(doc.value(cr.r1, c, C.sheet) ?? '').toUpperCase()
          const col = header.indexOf(name)
          const v = doc.value(r, c, C.sheet)
          if (col >= 0 && v !== null && v !== '') row.push({ col, v })
        }
        rules.push(row)
      }
    }
    const keep: number[] = []
    const seen = new Set<string>()
    for (let r = lr.r1 + 1; r <= lr.r2; r++) {
      const ok = !rules.length || rules.some((row) => row.every((x) => matchCriterion(doc.value(r, lr.c1 + x.col), x.v)))
      if (!ok) continue
      if (unique) {
        const key = JSON.stringify(header.map((_, i) => doc.value(r, lr.c1 + i)))
        if (seen.has(key)) continue
        seen.add(key)
      }
      keep.push(r)
    }
    if (copy) {
      const D = ref(app, dest)
      if (!D) return app.alert(t('The Copy to reference is not valid.'))
      doc.transact(tx('Advanced Filter'), () => {
        const rows = [lr.r1, ...keep]
        rows.forEach((r, i) => {
          for (let c = lr.c1; c <= lr.c2; c++) {
            const v = doc.value(r, c)
            doc.write(D.sheet, D.range.r1 + i, D.range.c1 + c - lr.c1, v === null ? undefined : { v })
          }
        })
      })
    } else {
      doc.transact(tx('Advanced Filter'), () => {
        doc.noteProps(sheet)
        const hide: number[] = []
        for (let r = lr.r1 + 1; r <= lr.r2; r++) if (!keep.includes(r)) hide.push(r)
        applyFilters(doc, sheet)
        for (const r of hide) sheet.rows.hidden.add(r)
        sheet.x.filtered = [...new Set([...sheet.x.filtered, ...hide])].sort((a, b) => a - b)
        sheet.rows.touch()
      })
    }
    onClose()
  }
  return (
    <Modal title={t('Advanced Filter')} onClose={onClose} width={400} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label className="check-item"><input type="radio" checked={!copy} onChange={() => setCopy(false)} />{' '}{t('Filter the list, in-place')}</label>
        <label className="check-item"><input type="radio" checked={copy} onChange={() => setCopy(true)} />{' '}{t('Copy to another location')}</label>
        <label>{t('List range:')}{' '}<input value={list} onChange={(e) => setList(e.target.value)} /></label>
        <label>{t('Criteria range:')}{' '}<input value={crit} placeholder={t('Header row plus criteria rows')} onChange={(e) => setCrit(e.target.value)} /></label>
        {copy && <label>{t('Copy to:')}{' '}<input value={dest} onChange={(e) => setDest(e.target.value)} /></label>}
        <label className="check-item"><input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} />{' '}{t('Unique records only')}</label>
      </div>
    </Modal>
  )
}

// ---------- Evaluate Formula ----------

function literal(v: Scalar | Matrix): string {
  if (v instanceof Matrix) {
    const rows: string[] = []
    for (let r = 0; r < v.rows; r++) rows.push(Array.from({ length: v.cols }, (_, c) => literal(v.get(r, c))).join(','))
    return `{${rows.join(';')}}`
  }
  if (v === null) return '0'
  if (v instanceof CellError) return v.code
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`
  return String(+v.toPrecision(15))
}

/** One evaluation step: the leftmost reference becomes its value, else the innermost function call. */
export function evaluateStep(app: ReturnType<typeof useApp>, f: string, r: number, c: number): string | null {
  const doc = app.doc
  const sheet = doc.sheet
  const toks = tokenize(f)
  const refTok = toks.find((t) => t.type === 'ref' || t.type === 'name' || t.type === 'struct')
  if (refTok) {
    const v = doc.engine.evalFormula(refTok.text, sheet, r, c)
    const text = v instanceof Matrix ? (v.rows * v.cols > 200 ? null : literal(v)) : literal(v as Scalar)
    if (text === null) return null
    return f.slice(0, refTok.start) + text + f.slice(refTok.end)
  }
  // innermost function call
  let best = -1
  let depth = 0
  let bestDepth = -1
  toks.forEach((t, i) => {
    if (t.type === 'func') {
      if (depth >= bestDepth) {
        bestDepth = depth
        best = i
      }
    }
    if (t.type === 'lparen') depth++
    if (t.type === 'rparen') depth--
  })
  if (best >= 0) {
    const start = toks[best].start
    let d = 0
    let end = -1
    for (let i = best + 1; i < toks.length; i++) {
      if (toks[i].type === 'lparen') d++
      if (toks[i].type === 'rparen') {
        d--
        if (d === 0) {
          end = toks[i].end
          break
        }
      }
    }
    if (end < 0) return null
    const v = doc.engine.evalFormula(f.slice(start, end), sheet, r, c)
    return f.slice(0, start) + literal(v instanceof Matrix ? v : (v as Scalar)) + f.slice(end)
  }
  const v = doc.engine.evalFormula(f, sheet, r, c)
  const out = literal(v instanceof Matrix ? v : (v as Scalar))
  return out === f ? null : out
}

export function EvaluateFormulaDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const a = doc.sel.active
  const start = doc.sheet.get(a.r, a.c)?.f
  const [cur, setCur] = useState(start ?? '')
  const [done, setDone] = useState(!start)
  const step = () => {
    const next = evaluateStep(app, cur, a.r, a.c)
    if (next === null || next === cur) setDone(true)
    else setCur(next)
  }
  return (
    <Modal
      title={t('Evaluate Formula')}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn" disabled={done} onClick={step}>{t('Evaluate')}</button>
          <button type="button" className="btn" onClick={() => { setCur(start ?? ''); setDone(!start) }}>{t('Restart')}</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>{t('Close')}</button>
        </>
      }
    >
      <p className="dlg-hint">{t('Reference:')} {doc.sheet.name}!{cellName(a.r, a.c)}</p>
      {start === undefined ? <p>{t('The active cell does not contain a formula.')}</p> : <div className="eval-box mono">={toLocalFormula(cur)}</div>}
      <p className="dlg-hint">{t('To show the result of the next part of the formula, click Evaluate.')}</p>
    </Modal>
  )
}

// ---------- header & footer ----------

const CODES: [string, string][] = [['&P', tx('Page Number')], ['&N', tx('Number of Pages')], ['&D', tx('Current Date')], ['&T', tx('Current Time')], ['&F', tx('File Name')], ['&A', tx('Sheet Name')]]

function splitHF(s: string | undefined): [string, string, string] {
  const out: [string, string, string] = ['', '', '']
  if (!s) return out
  let cur = 1
  let i = 0
  if (!/&[LCR]/.test(s)) return ['', s, '']
  while (i < s.length) {
    if (s[i] === '&' && /[LCR]/.test(s[i + 1] ?? '')) {
      cur = s[i + 1] === 'L' ? 0 : s[i + 1] === 'C' ? 1 : 2
      i += 2
      continue
    }
    out[cur] += s[i++]
  }
  return out
}

const joinHF = (p: [string, string, string]) => (p[0] ? `&L${p[0]}` : '') + (p[1] ? `&C${p[1]}` : '') + (p[2] ? `&R${p[2]}` : '')

export function HeaderFooterDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const sheet = doc.sheet
  const [head, setHead] = useState(splitHF(sheet.page.header))
  const [foot, setFoot] = useState(splitHF(sheet.page.footer))
  const focus = useRef<{ part: 'head' | 'foot'; i: number }>({ part: 'head', i: 1 })
  const ins = (code: string) => {
    const { part, i } = focus.current
    if (part === 'head') setHead(head.map((x, j) => (j === i ? x + code : x)) as [string, string, string])
    else setFoot(foot.map((x, j) => (j === i ? x + code : x)) as [string, string, string])
  }
  const ok = () => {
    doc.transact(tx('Header & Footer'), () => {
      doc.noteProps(sheet)
      sheet.page = { ...sheet.page, header: joinHF(head) || undefined, footer: joinHF(foot) || undefined }
    })
    onClose()
  }
  const row = (part: 'head' | 'foot', vals: [string, string, string], set: (v: [string, string, string]) => void) => (
    <div className="hf-row">
      {([t('Left section'), t('Center section'), t('Right section')] as const).map((l, i) => (
        <label key={l}>
          {l}
          <textarea rows={3} value={vals[i]} onFocus={() => (focus.current = { part, i })} onChange={(e) => set(vals.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string])} />
        </label>
      ))}
    </div>
  )
  return (
    <Modal title={t('Header & Footer')} onClose={onClose} width={620} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="dlg-inline">
        <span>{t('Insert:')}</span>
        {CODES.map(([code, label]) => <button key={code} type="button" className="btn btn-small" onClick={() => ins(code)}>{t(label)}</button>)}
      </div>
      <div className="dlg-inline">
        <span>{t('Presets:')}</span>
        <select onChange={(e) => { const v = e.target.value; if (v) setFoot(splitHF(v)) }} defaultValue="">
          <option value="">{t('(choose a footer)')}</option>
          <option value="&CPage &P">{t('Page 1')}</option>
          <option value="&CPage &P of &N">{t('Page 1 of ?')}</option>
          <option value="&L&A&RPage &P">{t('Sheet name, Page 1')}</option>
          <option value="&L&F&R&D">{t('File name, date')}</option>
        </select>
      </div>
      <fieldset className="dlg-fieldset"><legend>{t('Header')}</legend>{row('head', head, setHead)}</fieldset>
      <fieldset className="dlg-fieldset"><legend>{t('Footer')}</legend>{row('foot', foot, setFoot)}</fieldset>
    </Modal>
  )
}

export { splitHF }

// ---------- sparklines ----------

export function SparklinesDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const doc = app.doc
  const type = (data as Sparkline['type']) ?? 'line'
  const [src, setSrc] = useState('=' + absName(doc.boundToUsed(doc.activeRange)))
  const [loc, setLoc] = useState('')
  const ok = () => {
    const S = ref(app, src)
    const L = ref(app, loc)
    if (!S || !L) return app.alert(t('The data range or location reference is not valid.'))
    const sr = S.range
    const lr = L.range
    const cells: { r: number; c: number }[] = []
    for (let r = lr.r1; r <= lr.r2; r++) for (let c = lr.c1; c <= lr.c2; c++) cells.push({ r, c })
    const rows = sr.r2 - sr.r1 + 1
    const cols = sr.c2 - sr.c1 + 1
    const vertical = lr.c1 === lr.c2
    const count = cells.length
    const parts: Range[] = []
    if (count === 1) parts.push(sr)
    else if (vertical && rows === count) for (let i = 0; i < rows; i++) parts.push({ r1: sr.r1 + i, r2: sr.r1 + i, c1: sr.c1, c2: sr.c2 })
    else if (!vertical && cols === count) for (let i = 0; i < cols; i++) parts.push({ r1: sr.r1, r2: sr.r2, c1: sr.c1 + i, c2: sr.c1 + i })
    else return app.alert(t('Location reference is not valid because the cells are not all in the same column or same row, or the data size does not match.'))
    const sheetName = S.sheet.name.replace(/'/g, "''")
    const group = doc.wb.newObjectId()
    const sheet = doc.sheet
    doc.transact(tx('Insert Sparklines'), () => {
      doc.noteProps(sheet)
      const list = sheet.x.sparklines.filter((sp) => !cells.some((c) => c.r === sp.r && c.c === sp.c))
      cells.forEach((cell, i) => {
        const p = parts[i]
        list.push({
          id: doc.wb.newObjectId(),
          group,
          type,
          source: `'${sheetName}'!${colName(p.c1)}${p.r1 + 1}:${colName(p.c2)}${p.r2 + 1}`,
          r: cell.r,
          c: cell.c,
          color: type === 'winloss' ? '#2E6FD8' : '#2E6FD8',
          negColor: '#E04B3A',
          markers: false,
          high: false,
          low: false,
          first: false,
          last: false,
          negative: type !== 'line',
        })
      })
      sheet.x.sparklines = list
    })
    onClose()
  }
  return (
    <Modal title={t('Create Sparklines')} onClose={onClose} width={380} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>{t('Data Range:')}{' '}<input value={src} onChange={(e) => setSrc(e.target.value)} /></label>
        <label>{t('Location Range:')}{' '}<input autoFocus value={loc} placeholder={t('e.g. $F$2:$F$10')} onChange={(e) => setLoc(e.target.value)} /></label>
      </div>
    </Modal>
  )
}

// ---------- notes, alt text, prompts ----------

export function NoteDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const a = doc.sel.active
  const existing = noteAt(doc.sheet, a.r, a.c)
  const [text, setText] = useState(existing?.text ?? '')
  const ok = () => {
    setNote(doc, a.r, a.c, text.trim() ? text : null)
    onClose()
  }
  return (
    <Modal title={existing ? t('Edit Note – {cell}', { cell: cellName(a.r, a.c) }) : t('New Note – {cell}', { cell: cellName(a.r, a.c) })} onClose={onClose} width={360} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <textarea className="note-edit" autoFocus rows={6} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ok() }} />
    </Modal>
  )
}

export function AltTextDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const o = app.doc.sheet.x.objects.find((x) => x.id === data)
  const [text, setText] = useState(o && o.kind === 'picture' ? o.alt ?? '' : '')
  if (!o) return null
  return (
    <Modal title={t('Alt Text')} onClose={onClose} width={360} footer={<OkCancel onOk={() => { updateObject(app.doc, o.id, { alt: text || undefined } as never, tx('Alt Text')); onClose() }} onCancel={onClose} />}>
      <p className="dlg-hint">{t('How would you describe this object and its context to someone who is blind or has low vision?')}</p>
      <textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  )
}

export function PromptDialog({ onClose, title, message, onText }: P & { title?: string; message?: string; onText?: (t: string) => void }) {
  const [text, setText] = useState('')
  return (
    <Modal title={title ?? t('Enter a value')} onClose={onClose} width={340} footer={<OkCancel onOk={() => { onClose(); onText?.(text) }} onCancel={onClose} />}>
      <div className="form">
        <label>{message} <input autoFocus value={text} onChange={(e) => setText(e.target.value)} /></label>
      </div>
    </Modal>
  )
}

// ---------- icons ----------

const ICONS = {
  Heart, Star, Home, User, Users, Mail, Phone, Calendar, Clock, Camera, Car, Cloud, Coffee, DollarSign, Euro, Flag, Gift, Globe, Key, Lightbulb, Lock, MapPin,
  Music, Plane, Rocket, Search, Settings, ShoppingCart, Smile, Sun, Moon, ThumbsUp, Trophy, Truck, Wifi, Zap, Bell, Book, Briefcase, Building, ChartPie,
  CircleCheck, CircleX, CircleAlert, Info, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Leaf, Bike, Bus, Ship, Train, Laptop, Smartphone, Printer, Database,
  Shield, Target, TrendingUp, TrendingDown, Award, Package, Tag, Wrench, Hammer, Scissors, Paperclip, Pencil, Trash2, Eye, Battery, Anchor,
}

export function InsertIconDialog({ onClose }: P) {
  const app = useApp()
  const [q, setQ] = useState('')
  const [color, setColor] = useState('#2E6FD8')
  const [picked, setPicked] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const ok = (name = picked) => {
    if (!name) return
    const svg = grid.current?.querySelector(`[data-icon="${name}"] svg`) as SVGElement | null
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGElement
    clone.setAttribute('width', '96')
    clone.setAttribute('height', '96')
    clone.setAttribute('stroke', color)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clone.outerHTML)))
    const id = app.doc.wb.addImage(url)
    addObject(app.doc, newPicture(app.doc, id, 96, 96, 'Graphic'), tx('Insert Icon'))
    onClose()
    app.setTab('shapeFormat')
  }
  const names = Object.keys(ICONS).filter((n) => n.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal title={t('Insert Icons')} onClose={onClose} width={560} footer={<OkCancel onOk={() => ok()} onCancel={onClose} okLabel={t('Insert')} />}>
      <div className="dlg-inline">
        <input placeholder={t('Search icons')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <label>{t('Color')}{' '}<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      </div>
      <div className="icon-grid" ref={grid}>
        {names.map((n) => {
          const Icon = ICONS[n as keyof typeof ICONS]
          return (
            <button key={n} type="button" data-icon={n} className={cls('icon-cell', picked === n && 'is-active')} title={n} onClick={() => setPicked(n)} onDoubleClick={() => ok(n)}>
              <Icon size={28} color={color} strokeWidth={1.6} />
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

void addSheet

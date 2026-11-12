import { t, tx } from '../../i18n'
import { DATE_ORDERS, convertPart, type ColumnFormat } from '../../commands/textColumns'
import { CUSTOM_LISTS } from '../../commands/sort'
import { useMemo, useState } from 'react'
import { MAX_COLS, MAX_ROWS, cellKey, cellName, colName, parseCell, parseRange, rangeName } from '../../model/address'
import { parseInput } from '../../model/parseInput'
import { DEFAULT_PASTE, type PasteOp, type PasteWhat, pasteInternal } from '../../commands/clipboard'
import { DEFAULT_FIND, findAll, findNext, goTo, goToSpecial, replaceAll, replaceCurrent, type FindOptions, type Hit, type SpecialKind } from '../../commands/find'
import { fillSeries, type SeriesOptions } from '../../commands/fill'
import {
  autofitRows, createNamesFromSelection, defineName, deleteCells, deleteName, duplicateSheet, insertCells, insertDelete, moveSheet, selectedIndexes, setDefaultColWidth, setSizes, unhideSheet, validateName,
} from '../../commands/ops'
import { currentRegion, detectHeader, removeDuplicates, sortRange, type SortKey } from '../../commands/sort'
import { CATEGORY_ORDER, FN_META, functionsIn, type FnCategory } from '../../engine/functions/meta'
import { localFunctionName, localSignature, toCanonicalFormula, toLocalFormula } from '../../engine/localize'
import { recentFunctions } from '../tabs/recent'
import { Modal, OkCancel, DialogTabs, cls } from '../ui'
import { useApp } from '../appContext'
import { APP_NAME } from '../../brand'
import { goToReference } from '../FormulaBar'
import { Engine } from '../../engine/engine'

type P = { onClose: () => void }

export function MessageDialog({ title, message, onClose, onYes }: P & { title?: string; message: string; onYes?: () => void }) {
  return (
    <Modal
      title={title ?? APP_NAME}
      onClose={onClose}
      footer={
        onYes ? (
          <OkCancel
            onOk={() => {
              onClose()
              onYes()
            }}
            onCancel={onClose}
          />
        ) : (
          <>
            <span className="spacer" />
            <button type="button" className="btn btn-primary" autoFocus onClick={onClose}>
              {t('OK')}
            </button>
          </>
        )
      }
    >
      <p className="dlg-message">{message}</p>
    </Modal>
  )
}

export function InsertDeleteCellsDialog({ onClose, insert }: P & { insert: boolean }) {
  const app = useApp()
  const doc = app.doc
  const [choice, setChoice] = useState(insert ? 'right' : 'left')
  const options = insert
    ? [['right', t('Shift cells right')], ['down', t('Shift cells down')], ['row', t('Entire row')], ['col', t('Entire column')]]
    : [['left', t('Shift cells left')], ['up', t('Shift cells up')], ['row', t('Entire row')], ['col', t('Entire column')]]
  const ok = () => {
    const rg = doc.activeRange
    const nr = rg.r2 - rg.r1 + 1
    const nc = rg.c2 - rg.c1 + 1
    if (choice === 'row') insertDelete(doc, 'row', rg.r1, insert ? nr : -nr)
    else if (choice === 'col') insertDelete(doc, 'col', rg.c1, insert ? nc : -nc)
    else if (insert) insertCells(doc, choice as 'down' | 'right')
    else deleteCells(doc, choice as 'up' | 'left')
    onClose()
  }
  return (
    <Modal title={insert ? t('Insert') : t('Delete')} onClose={onClose} width={300} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>{insert ? t('Insert') : t('Delete')}</legend>
        {options.map(([id, label]) => (
          <label key={id} className="check-item">
            <input type="radio" name="idc" checked={choice === id} onChange={() => setChoice(id)} /> {label}
          </label>
        ))}
      </fieldset>
    </Modal>
  )
}

export function SizeDialog({ onClose, kind }: P & { kind: 'rowHeight' | 'colWidth' | 'defaultWidth' }) {
  const app = useApp()
  const doc = app.doc
  const sheet = doc.sheet
  const a = doc.sel.active
  // row heights in points, column widths in characters like the original
  const initial = kind === 'rowHeight' ? (sheet.rows.size(a.r) * 72) / 96 : kind === 'colWidth' ? Math.max(0, (sheet.cols.size(a.c) - 5) / 7) : (sheet.cols.def - 5) / 7
  const [value, setValue] = useState(String(Math.round(initial * 100) / 100))
  const ok = () => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || (kind === 'rowHeight' ? n > 409 : n > 255)) return app.alert(kind === 'rowHeight' ? t('Row height must be between 0 and 409.') : t('Column width must be between 0 and 255.'))
    if (kind === 'rowHeight') setSizes(doc, 'row', selectedIndexes(doc, 'row'), (n * 96) / 72)
    else if (kind === 'colWidth') setSizes(doc, 'col', selectedIndexes(doc, 'col'), n === 0 ? 0 : Math.round(n * 7 + 5))
    else setDefaultColWidth(doc, Math.round(n * 7 + 5))
    onClose()
  }
  const label = kind === 'rowHeight' ? t('Row height:') : kind === 'colWidth' ? t('Column width:') : t('Standard column width:')
  return (
    <Modal title={kind === 'rowHeight' ? t('Row Height') : kind === 'colWidth' ? t('Column Width') : t('Standard Width')} onClose={onClose} width={300} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <label className="dlg-inline">
        {label}
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      </label>
    </Modal>
  )
}

export function PasteSpecialDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [what, setWhat] = useState<PasteWhat>('all')
  const [op, setOp] = useState<PasteOp>('none')
  const [skip, setSkip] = useState(false)
  const [transpose, setTranspose] = useState(false)
  const ok = (link = false) => {
    if (!doc.clip) {
      onClose()
      return app.alert(t('Copy cells in this workbook first, then use Paste Special.'))
    }
    const err = pasteInternal(doc, { ...DEFAULT_PASTE, what: link ? 'link' : what, op, skipBlanks: skip, transpose })
    onClose()
    if (err) app.alert(err)
  }
  const whats: [PasteWhat, string][] = [['all', t('All')], ['formulas', t('Formulas')], ['values', t('Values')], ['formats', t('Formats')], ['comments', t('Comments and notes')], ['validation', t('Validation')], ['allNoBorders', t('All except borders')], ['colWidths', t('Column widths')], ['formulasAndFormats', t('Formulas and number formats')], ['valuesAndFormats', t('Values and number formats')], ['allMergeCF', t('All merging conditional formats')]]
  const ops: [PasteOp, string][] = [['none', t('None')], ['add', t('Add')], ['subtract', t('Subtract')], ['multiply', t('Multiply')], ['divide', t('Divide')]]
  return (
    <Modal
      title={t('Paste Special')}
      onClose={onClose}
      width={460}
      footer={
        <OkCancel
          onOk={() => ok()}
          onCancel={onClose}
          extra={
            <button type="button" className="btn" onClick={() => ok(true)}>
              {t('Paste Link')}
            </button>
          }
        />
      }
    >
      <fieldset className="dlg-fieldset dlg-two">
        <legend>{t('Paste')}</legend>
        {whats.map(([id, label]) => (
          <label key={id} className="check-item">
            <input type="radio" name="psw" checked={what === id} onChange={() => setWhat(id)} /> {label}
          </label>
        ))}
      </fieldset>
      <fieldset className="dlg-fieldset dlg-two">
        <legend>{t('Operation')}</legend>
        {ops.map(([id, label]) => (
          <label key={id} className="check-item">
            <input type="radio" name="pso" checked={op === id} onChange={() => setOp(id)} /> {label}
          </label>
        ))}
      </fieldset>
      <div className="dlg-inline">
        <label className="check-item">
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />{' '}{t('Skip blanks')}
        </label>
        <label className="check-item">
          <input type="checkbox" checked={transpose} onChange={(e) => setTranspose(e.target.checked)} />{' '}{t('Transpose')}
        </label>
      </div>
    </Modal>
  )
}

export function FindReplaceDialog({ onClose, replace: startReplace, initial }: P & { replace: boolean; initial?: string }) {
  const app = useApp()
  const doc = app.doc
  const [tab, setTab] = useState<'find' | 'replace'>(startReplace ? 'replace' : 'find')
  const [o, setO] = useState<FindOptions>({ ...DEFAULT_FIND, query: initial ?? lastFind })
  const [repl, setRepl] = useState('')
  const [more, setMore] = useState(false)
  const [hits, setHits] = useState<Hit[] | null>(null)
  const set = (patch: Partial<FindOptions>) => setO({ ...o, ...patch })
  const remember = () => (lastFind = o.query)
  const next = (back = false) => {
    remember()
    if (!findNext(doc, o, back)) app.alert(t("We couldn't find what you were looking for."))
  }
  return (
    <Modal title={t('Find and Replace')} onClose={onClose} width={520}>
      <DialogTabs<'find' | 'replace'> tabs={[{ id: 'find', label: t('Find') }, { id: 'replace', label: t('Replace') }]} active={tab} onChange={setTab} />
      <div className="dlg-stack">
        <label className="dlg-inline find-field">
          {t('Find what:')}
          <input autoFocus value={o.query} onChange={(e) => set({ query: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && next(e.shiftKey)} />
        </label>
        {tab === 'replace' && (
          <label className="dlg-inline find-field">
            {t('Replace with:')}
            <input value={repl} onChange={(e) => setRepl(e.target.value)} />
          </label>
        )}
        {more && (
          <div className="fc-two">
            <div className="dlg-stack">
              <label className="dlg-inline">
                {t('Within:')}
                <select value={o.within} onChange={(e) => set({ within: e.target.value as FindOptions['within'] })}>
                  <option value="sheet">{t('Sheet')}</option>
                  <option value="workbook">{t('Workbook')}</option>
                </select>
              </label>
              <label className="dlg-inline">
                {t('Search:')}
                <select value={o.by} onChange={(e) => set({ by: e.target.value as FindOptions['by'] })}>
                  <option value="rows">{t('By Rows')}</option>
                  <option value="cols">{t('By Columns')}</option>
                </select>
              </label>
              <label className="dlg-inline">
                {t('Look in:')}
                <select value={o.lookIn} onChange={(e) => set({ lookIn: e.target.value as FindOptions['lookIn'] })}>
                  <option value="formulas">{t('Formulas')}</option>
                  <option value="values">{t('Values')}</option>
                </select>
              </label>
            </div>
            <div className="dlg-stack">
              <label className="check-item">
                <input type="checkbox" checked={o.matchCase} onChange={(e) => set({ matchCase: e.target.checked })} />{' '}{t('Match case')}
              </label>
              <label className="check-item">
                <input type="checkbox" checked={o.whole} onChange={(e) => set({ whole: e.target.checked })} />{' '}{t('Match entire cell contents')}
              </label>
            </div>
          </div>
        )}
        <div className="dlg-inline find-buttons">
          {tab === 'replace' && (
            <>
              <button type="button" className="btn" onClick={() => { remember(); const n = replaceAll(doc, o, repl); app.alert(n ? (n === 1 ? t('All done. We made 1 replacement.') : t('All done. We made {n} replacements.', { n })) : t("We couldn't find anything to replace.")) }}>
                {t('Replace All')}
              </button>
              <button type="button" className="btn" onClick={() => { remember(); if (!replaceCurrent(doc, o, repl)) app.alert(t("We couldn't find a match.")) }}>
                {t('Replace')}
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={() => { remember(); setHits(findAll(doc, o)) }}>
            {t('Find All')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => next()}>
            {t('Find Next')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => setMore(!more)}>
            {t('Options')}{' '}{more ? '<<' : '>>'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
        {hits && (
          <div className="find-results">
            <table>
              <thead>
                <tr>
                  <th>{t('Sheet')}</th>
                  <th>{t('Cell')}</th>
                  <th>{t('Value')}</th>
                  <th>{t('Formula')}</th>
                </tr>
              </thead>
              <tbody>
                {hits.slice(0, 500).map((h, i) => (
                  <tr key={i} onClick={() => goTo(doc, h.sheet, { r: h.r, c: h.c })}>
                    <td>{h.sheet.name}</td>
                    <td>${colName(h.c)}${h.r + 1}</td>
                    <td>{h.value}</td>
                    <td>{h.text.startsWith('=') ? h.text : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dlg-hint">{t('{n} cell(s) found', { n: hits.length })}</div>
          </div>
        )}
      </div>
    </Modal>
  )
}
let lastFind = ''

export function GoToDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [ref, setRef] = useState('')
  const names = [...doc.wb.names.values()]
  const ok = () => {
    const err = goToReference(doc, ref)
    if (err) return app.alert(err)
    onClose()
  }
  return (
    <Modal
      title={t('Go To')}
      onClose={onClose}
      width={340}
      footer={
        <OkCancel
          onOk={ok}
          onCancel={onClose}
          extra={
            <button type="button" className="btn" onClick={() => { onClose(); app.dialog({ kind: 'gotoSpecial' }) }}>
              {t('Special…')}
            </button>
          }
        />
      }
    >
      <div className="dlg-stack">
        {t('Go to:')}
        <select size={6} onChange={(e) => setRef(e.target.value)}>
          {names.map((n) => (
            <option key={n.name} value={n.name}>
              {n.name}
            </option>
          ))}
        </select>
        <label className="dlg-inline">
          {t('Reference:')}
          <input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
        </label>
      </div>
    </Modal>
  )
}

export function GoToSpecialDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [kind, setKind] = useState<SpecialKind>('constants')
  const kinds: [SpecialKind, string][] = [['constants', t('Constants')], ['formulas', t('Formulas')], ['blanks', t('Blanks')], ['currentRegion', t('Current region')], ['currentArray', t('Current array')], ['lastCell', t('Last cell')], ['visible', t('Visible cells only')], ['merged', t('Merged cells')], ['numbers', t('Numbers')], ['text', t('Text')], ['errors', t('Errors')], ['notes', t('Notes and comments')], ['cf', t('Conditional formats')], ['validation', t('Data validation')], ['objects', t('Objects')]]
  const ok = () => {
    onClose()
    if (kind === 'currentRegion') {
      doc.selectRange(currentRegion(doc, doc.sel.active), doc.sel.active)
      return
    }
    if (!goToSpecial(doc, kind)) app.alert(t('No cells were found.'))
  }
  return (
    <Modal title={t('Go To Special')} onClose={onClose} width={420} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset dlg-two">
        <legend>{t('Select')}</legend>
        {kinds.map(([id, label]) => (
          <label key={id} className="check-item">
            <input type="radio" name="gts" checked={kind === id} onChange={() => setKind(id)} /> {label}
          </label>
        ))}
      </fieldset>
    </Modal>
  )
}

export function InsertFunctionDialog({ onClose, onInsert }: P & { onInsert: (name: string) => void }) {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<'Most Recently Used' | 'All' | FnCategory>('Most Recently Used')
  const list = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      return [...FN_META.values()].filter((m) => m.name.toLowerCase().includes(q) || localFunctionName(m.name).toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || t(m.description).toLowerCase().includes(q)).map((m) => m.name)
    }
    if (cat === 'Most Recently Used') return recentFunctions()
    if (cat === 'All') return [...FN_META.keys()].sort((a, b) => localFunctionName(a).localeCompare(localFunctionName(b)))
    return functionsIn(cat).map((m) => m.name).sort((a, b) => localFunctionName(a).localeCompare(localFunctionName(b)))
  }, [query, cat])
  const [sel, setSel] = useState<string>('SUM')
  const current = list.includes(sel) ? sel : list[0]
  const meta = current ? FN_META.get(current) : undefined
  return (
    <Modal
      title={t('Insert Function')}
      onClose={onClose}
      width={520}
      footer={
        <OkCancel
          onOk={() => {
            if (current) {
              onClose()
              onInsert(current)
            }
          }}
          onCancel={onClose}
        />
      }
    >
      <div className="dlg-stack">
        <label className="dlg-inline find-field">
          {t('Search for a function:')}
          <input autoFocus value={query} placeholder={t('Type a short description and press Enter')} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="dlg-inline">
          {t('Or select a category:')}
          <select value={cat} onChange={(e) => { setCat(e.target.value as typeof cat); setQuery('') }}>
            <option value="Most Recently Used">{t('Most Recently Used')}</option>
            <option value="All">{t('All')}</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{t(c)}</option>
            ))}
          </select>
        </label>
        {t('Select a function:')}
        <select size={9} value={current} onChange={(e) => setSel(e.target.value)} onDoubleClick={() => { if (current) { onClose(); onInsert(current) } }}>
          {list.map((n) => (
            <option key={n} value={n}>{localFunctionName(n)}</option>
          ))}
        </select>
        {meta && (
          <div className="fn-help">
            <strong>{localSignature(meta.name)}</strong>
            <p>{t(meta.description)}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function NameManagerDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [, force] = useState(0)
  const [selName, setSelName] = useState<string | null>(null)
  const names = [...doc.wb.names.values()].sort((a, b) => a.name.localeCompare(b.name))
  const current = names.find((n) => `${n.scope ?? ''}!${n.name}` === selName)
  const [edit, setEdit] = useState<{ name: string; ref: string; comment: string } | null>(null)
  const valueOf = (ref: string) => {
    const m = /^(?:'?([^!']+)'?!)?(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)$/i.exec(ref)
    if (!m) return ''
    const sheet = m[1] ? doc.wb.sheetByName(m[1]) : doc.sheet
    const rg = parseRange(m[2])
    if (!sheet || !rg) return '#REF!'
    if (rg.r1 === rg.r2 && rg.c1 === rg.c2) return String(doc.value(rg.r1, rg.c1, sheet) ?? '')
    return `{${rangeName(rg)}}`
  }
  return (
    <Modal title={t('Name Manager')} onClose={onClose} width={640}>
      <div className="dlg-inline">
        <button type="button" className="btn" onClick={() => app.dialog({ kind: 'defineName' })}>
          {t('New…')}
        </button>
        <button type="button" className="btn" disabled={!current} onClick={() => current && setEdit({ name: current.name, ref: toLocalFormula(current.ref), comment: current.comment ?? '' })}>
          {t('Edit…')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!current}
          onClick={() => {
            if (!current) return
            deleteName(doc, current.name, current.scope)
            setSelName(null)
            force((n) => n + 1)
          }}
        >
          {t('Delete')}
        </button>
      </div>
      <div className="find-results names-table">
        <table>
          <thead>
            <tr>
              <th>{t('Name')}</th>
              <th>{t('Value')}</th>
              <th>{t('Refers To')}</th>
              <th>{t('Scope')}</th>
              <th>{t('Comment')}</th>
            </tr>
          </thead>
          <tbody>
            {names.map((n) => (
              <tr key={`${n.scope}-${n.name}`} className={cls(selName === `${n.scope ?? ''}!${n.name}` && 'is-active')} onClick={() => setSelName(`${n.scope ?? ''}!${n.name}`)}>
                <td>{n.name}</td>
                <td>{valueOf(n.ref)}</td>
                <td>={toLocalFormula(n.ref)}</td>
                <td>{n.scope !== undefined ? doc.wb.sheetById(n.scope)?.name : t('Workbook')}</td>
                <td>{n.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!names.length && <div className="dlg-hint">{t('No names are defined. Use New… to create one.')}</div>}
      </div>
      {edit && current && (
        <div className="dlg-stack name-edit">
          <label className="dlg-inline">
            {t('Name:')}{' '}<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label className="dlg-inline">
            {t('Refers to:')}{' '}<input value={edit.ref} onChange={(e) => setEdit({ ...edit, ref: e.target.value })} />
          </label>
          <label className="dlg-inline">
            {t('Comment:')}{' '}<input value={edit.comment} onChange={(e) => setEdit({ ...edit, comment: e.target.value })} />
          </label>
          <div className="dlg-inline">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const err = validateName(doc, edit.name, current.scope, current.name)
                if (err) return app.alert(err)
                defineName(doc, edit.name, toCanonicalFormula(edit.ref.replace(/^=/, '')), current.scope, edit.comment, { name: current.name, scope: current.scope })
                setEdit(null)
                setSelName(`${current.scope ?? ''}!${edit.name}`)
              }}
            >
              {t('Save')}
            </button>
            <button type="button" className="btn" onClick={() => setEdit(null)}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function DefineNameDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const rg = doc.activeRange
  const label = doc.value(rg.r1, Math.max(0, rg.c1 - 1))
  const q = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(doc.sheet.name) ? doc.sheet.name : `'${doc.sheet.name.replace(/'/g, "''")}'`
  const [name, setName] = useState(typeof label === 'string' ? label.replace(/[^A-Za-z0-9_.]/g, '_') : '')
  const [scope, setScope] = useState<number | 'wb'>('wb')
  const [comment, setComment] = useState('')
  const [ref, setRef] = useState(`=${q}!${rangeName(rg).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}`)
  const ok = () => {
    const sc = scope === 'wb' ? undefined : scope
    const err = validateName(doc, name, sc)
    if (err) return app.alert(err)
    defineName(doc, name, toCanonicalFormula(ref.replace(/^=/, '')), sc, comment || undefined)
    onClose()
  }
  return (
    <Modal title={t('New Name')} onClose={onClose} width={420} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="dlg-stack">
        <label className="dlg-inline find-field">
          {t('Name:')}{' '}<input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="dlg-inline">
          {t('Scope:')}
          <select value={scope} onChange={(e) => setScope(e.target.value === 'wb' ? 'wb' : Number(e.target.value))}>
            <option value="wb">{t('Workbook')}</option>
            {doc.wb.sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="dlg-stack">
          {t('Comment:')}
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <label className="dlg-inline find-field">
          {t('Refers to:')}{' '}<input value={ref} onChange={(e) => setRef(e.target.value)} />
        </label>
      </div>
    </Modal>
  )
}

export function CreateNamesDialog({ onClose }: P) {
  const app = useApp()
  const [o, setO] = useState({ top: true, left: true, bottom: false, right: false })
  return (
    <Modal
      title={t('Create Names from Selection')}
      onClose={onClose}
      width={320}
      footer={
        <OkCancel
          onOk={() => {
            createNamesFromSelection(app.doc, o)
            onClose()
          }}
          onCancel={onClose}
        />
      }
    >
      <fieldset className="dlg-fieldset">
        <legend>{t('Create names from values in the:')}</legend>
        {(['top', 'left', 'bottom', 'right'] as const).map((k) => (
          <label key={k} className="check-item">
            <input type="checkbox" checked={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.checked })} /> {k === 'top' ? t('Top row') : k === 'left' ? t('Left column') : k === 'bottom' ? t('Bottom row') : t('Right column')}
          </label>
        ))}
      </fieldset>
    </Modal>
  )
}

export function SortDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const initial = useMemo(() => {
    const rg = doc.activeRange
    return rg.r1 === rg.r2 && rg.c1 === rg.c2 ? currentRegion(doc, doc.sel.active) : doc.boundToUsed(rg)
  }, [doc])
  const [header, setHeader] = useState(detectHeader(doc, initial))
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [byColumns, setByColumns] = useState(false)
  const [levels, setLevels] = useState<SortKey[]>([{ index: byColumns ? initial.r1 : initial.c1, desc: false, by: 'value' }])
  const columns = byColumns ? Array.from({ length: initial.r2 - initial.r1 + 1 }, (_, i) => initial.r1 + i) : Array.from({ length: initial.c2 - initial.c1 + 1 }, (_, i) => initial.c1 + i)
  const label = (i: number) => {
    if (byColumns) return header ? String(doc.value(i, initial.c1) ?? t('Row {n}', { n: i + 1 })) : t('Row {n}', { n: i + 1 })
    return header ? String(doc.value(initial.r1, i) ?? t('Column {name}', { name: colName(i) })) : t('Column {name}', { name: colName(i) })
  }
  const ok = () => {
    sortRange(doc, initial, levels, { header, caseSensitive, byColumns })
    doc.selectRange(initial, doc.sel.active)
    onClose()
  }
  return (
    <Modal title={t('Sort')} onClose={onClose} width={600} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="dlg-inline">
        <button type="button" className="btn" onClick={() => setLevels([...levels, { index: columns[0], desc: false, by: 'value' }])}>
          {t('+ Add Level')}
        </button>
        <button type="button" className="btn" disabled={levels.length < 2} onClick={() => setLevels(levels.slice(0, -1))}>
          {t('Delete Level')}
        </button>
        <button type="button" className="btn" onClick={() => setLevels([...levels, { ...levels[levels.length - 1] }])}>
          {t('Copy Level')}
        </button>
        <span className="spacer" />
        <label className="check-item">
          <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />{' '}{t('My data has headers')}
        </label>
      </div>
      <table className="sort-levels">
        <thead>
          <tr>
            <th />
            {/* The plain word: the key "Column" alone means the column chart type. */}
            <th>{t('Column {name}', { name: '' }).trim()}</th>
            <th>{t('Sort On')}</th>
            <th>{t('Order')}</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((lv, i) => (
            <tr key={i}>
              <td>{i === 0 ? t('Sort by') : t('Then by')}</td>
              <td>
                <select value={lv.index} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, index: Number(e.target.value) } : x)))}>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select value={lv.by ?? 'value'} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, by: e.target.value as SortKey['by'] } : x)))}>
                  <option value="value">{t('Cell Values')}</option>
                  <option value="fill">{t('Cell Color')}</option>
                  <option value="color">{t('Font Color')}</option>
                </select>
              </td>
              <td>
                <select
                  value={lv.list ? `list${CUSTOM_LISTS.findIndex((l) => l.join() === lv.list!.join())}${lv.desc ? 'r' : ''}` : lv.desc ? 'desc' : 'asc'}
                  onChange={(e) => {
                    const v = e.target.value
                    const m = /^list(\d+)(r?)$/.exec(v)
                    setLevels(levels.map((x, j) => (j === i ? (m ? { ...x, list: CUSTOM_LISTS[Number(m[1])], desc: !!m[2] } : { ...x, list: undefined, desc: v === 'desc' }) : x)))
                  }}
                >
                  {CUSTOM_LISTS.map((l, k) => (
                    <option key={`l${k}`} value={`list${k}`}>{l.slice(0, 3).join(', ')}, …</option>
                  ))}
                  {CUSTOM_LISTS.map((l, k) => (
                    <option key={`r${k}`} value={`list${k}r`}>{[...l].reverse().slice(0, 3).join(', ')}, …</option>
                  ))}
                  <option value="asc">{t('A to Z / Smallest to Largest')}</option>
                  <option value="desc">{t('Z to A / Largest to Smallest')}</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dlg-inline">
        <label className="check-item">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />{' '}{t('Case sensitive')}
        </label>
        <label className="check-item">
          <input
            type="checkbox"
            checked={byColumns}
            onChange={(e) => {
              setByColumns(e.target.checked)
              setLevels([{ index: e.target.checked ? initial.r1 : initial.c1, desc: false, by: 'value' }])
            }}
          />{' '}
          {t('Sort left to right')}
        </label>
      </div>
    </Modal>
  )
}

export function SeriesDialog({ onClose }: P) {
  const app = useApp()
  const rg = app.doc.activeRange
  const [o, setO] = useState<SeriesOptions>({ byRows: rg.c2 - rg.c1 > rg.r2 - rg.r1, type: 'linear', unit: 'day', step: 1 })
  const [stop, setStop] = useState('')
  return (
    <Modal
      title={t('Series')}
      onClose={onClose}
      width={440}
      footer={
        <OkCancel
          onOk={() => {
            fillSeries(app.doc, { ...o, stop: stop.trim() ? Number(stop) : undefined })
            onClose()
          }}
          onCancel={onClose}
        />
      }
    >
      <div className="fc-two">
        <fieldset className="dlg-fieldset">
          <legend>{t('Series in')}</legend>
          <label className="check-item">
            <input type="radio" checked={o.byRows} onChange={() => setO({ ...o, byRows: true })} />{' '}{t('Rows')}
          </label>
          <label className="check-item">
            <input type="radio" checked={!o.byRows} onChange={() => setO({ ...o, byRows: false })} />{' '}{t('Columns')}
          </label>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>{t('Type')}</legend>
          {(['linear', 'growth', 'date', 'autofill'] as const).map((type) => (
            <label key={type} className="check-item">
              <input type="radio" checked={o.type === type} onChange={() => setO({ ...o, type })} /> {{ linear: t('Linear'), growth: t('Growth'), date: t('Date'), autofill: t('AutoFill') }[type]}
            </label>
          ))}
        </fieldset>
        <fieldset className="dlg-fieldset" disabled={o.type !== 'date'}>
          <legend>{t('Date unit')}</legend>
          {(['day', 'weekday', 'month', 'year'] as const).map((u) => (
            <label key={u} className="check-item">
              <input type="radio" checked={o.unit === u} onChange={() => setO({ ...o, unit: u })} /> {u[0].toUpperCase() + u.slice(1)}
            </label>
          ))}
        </fieldset>
        <div className="dlg-stack">
          <label className="dlg-inline">
            {t('Step value:')}{' '}<input value={o.step} onChange={(e) => setO({ ...o, step: Number(e.target.value) || 0 })} />
          </label>
          <label className="dlg-inline">
            {t('Stop value:')}{' '}<input value={stop} onChange={(e) => setStop(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  )
}

export function MoveCopyDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [before, setBefore] = useState(Math.min(doc.activeIndex + 1, doc.wb.sheets.length))
  const [copyIt, setCopyIt] = useState(false)
  const ok = () => {
    if (copyIt) duplicateSheet(doc, doc.activeIndex, before)
    else moveSheet(doc, doc.activeIndex, before)
    onClose()
  }
  return (
    <Modal title={t('Move or Copy')} onClose={onClose} width={340} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="dlg-stack">
        {t('Move selected sheets before sheet:')}
        <select size={8} value={before} onChange={(e) => setBefore(Number(e.target.value))}>
          {doc.wb.sheets.map((s, i) => (
            <option key={s.id} value={i}>
              {s.name}
            </option>
          ))}
          <option value={doc.wb.sheets.length}>{t('(move to end)')}</option>
        </select>
        <label className="check-item">
          <input type="checkbox" checked={copyIt} onChange={(e) => setCopyIt(e.target.checked)} />{' '}{t('Create a copy')}
        </label>
      </div>
    </Modal>
  )
}

export function UnhideSheetDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const hidden = doc.wb.sheets.map((s, i) => ({ s, i })).filter((x) => x.s.hidden)
  const [sel, setSel] = useState(hidden[0]?.i ?? -1)
  return (
    <Modal
      title={t('Unhide')}
      onClose={onClose}
      width={320}
      footer={
        <OkCancel
          onOk={() => {
            if (sel >= 0) unhideSheet(doc, sel)
            onClose()
          }}
          onCancel={onClose}
        />
      }
    >
      <div className="dlg-stack">
        {t('Unhide sheet:')}
        <select size={6} value={sel} onChange={(e) => setSel(Number(e.target.value))}>
          {hidden.map(({ s, i }) => (
            <option key={s.id} value={i}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  )
}

export function ZoomDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [z, setZ] = useState(String(doc.sheet.zoom))
  const presets = [200, 100, 75, 50, 25]
  const ok = () => {
    const n = Number(z)
    if (!(n >= 10 && n <= 400)) return app.alert(t('Enter a value between 10 and 400.'))
    doc.sheet.zoom = Math.round(n)
    doc.emit()
    onClose()
  }
  return (
    <Modal title={t('Zoom')} onClose={onClose} width={280} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>{t('Magnification')}</legend>
        {presets.map((p) => (
          <label key={p} className="check-item">
            <input type="radio" checked={Number(z) === p} onChange={() => setZ(String(p))} /> {p}%
          </label>
        ))}
        <label className="dlg-inline">
          {t('Custom:')}{' '}<input value={z} onChange={(e) => setZ(e.target.value)} />%
        </label>
      </fieldset>
    </Modal>
  )
}

export function RemoveDuplicatesDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const rg = useMemo(() => {
    const r = doc.activeRange
    return r.r1 === r.r2 && r.c1 === r.c2 ? currentRegion(doc, doc.sel.active) : doc.boundToUsed(r)
  }, [doc])
  const [header, setHeader] = useState(detectHeader(doc, rg))
  const cols = Array.from({ length: rg.c2 - rg.c1 + 1 }, (_, i) => rg.c1 + i)
  const [checked, setChecked] = useState<Set<number>>(new Set(cols))
  const ok = () => {
    const res = removeDuplicates(doc, rg, [...checked], header)
    onClose()
    app.alert(res.removed ? t('{removed} duplicate values found and removed; {remaining} unique values remain.', { removed: res.removed, remaining: res.remaining }) : t('No duplicate values found.'))
  }
  return (
    <Modal title={t('Remove Duplicates')} onClose={onClose} width={380} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="dlg-stack">
        <p className="dlg-hint">{t('To delete duplicate values, select one or more columns that contain duplicates.')}</p>
        <div className="dlg-inline">
          <button type="button" className="btn" onClick={() => setChecked(new Set(cols))}>{t('Select All')}</button>
          <button type="button" className="btn" onClick={() => setChecked(new Set())}>{t('Unselect All')}</button>
          <span className="spacer" />
          <label className="check-item">
            <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />{' '}{t('My data has headers')}
          </label>
        </div>
        <div className="dup-cols">
          {cols.map((c) => (
            <label key={c} className="check-item">
              <input
                type="checkbox"
                checked={checked.has(c)}
                onChange={(e) => {
                  const n = new Set(checked)
                  if (e.target.checked) n.add(c)
                  else n.delete(c)
                  setChecked(n)
                }}
              />{' '}
              {header ? String(doc.value(rg.r1, c) ?? t('Column {name}', { name: colName(c) })) : t('Column {name}', { name: colName(c) })}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export function StatsDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const sheet = doc.sheet
  let formulas = 0
  let total = 0
  for (const s of doc.wb.sheets) for (const d of s.cells.values()) if (d.f !== undefined) formulas++
  for (const s of doc.wb.sheets) total += s.cells.size
  const u = sheet.used()
  return (
    <Modal title={t('Workbook Statistics')} onClose={onClose} width={360} footer={<><span className="spacer" /><button type="button" className="btn btn-primary" onClick={onClose}>{t('OK')}</button></>}>
      <dl className="stats">
        <dt>{t('Current sheet')}</dt>
        <dd>{sheet.name}</dd>
        <dt>{t('End of sheet')}</dt>
        <dd>{u.r >= 0 ? cellName(u.r, u.c) : 'A1'}</dd>
        <dt>{t('Cells with data')}</dt>
        <dd>{sheet.cells.size.toLocaleString('en-US')}</dd>
        <dt>{t('Merged ranges')}</dt>
        <dd>{sheet.merges.length}</dd>
        <dt>{t('Sheets')}</dt>
        <dd>{doc.wb.sheets.length}</dd>
        <dt>{t('Cells with data (workbook)')}</dt>
        <dd>{total.toLocaleString('en-US')}</dd>
        <dt>{t('Formulas')}</dt>
        <dd>{formulas.toLocaleString('en-US')}</dd>
        <dt>{t('Defined names')}</dt>
        <dd>{doc.wb.names.size}</dd>
      </dl>
    </Modal>
  )
}

export function PageSetupDialog({ onClose, initialTab }: P & { initialTab?: string }) {
  const app = useApp()
  const doc = app.doc
  const sheet = doc.sheet
  const [tab, setTab] = useState<'page' | 'margins' | 'hf' | 'sheet'>((initialTab as 'page') ?? 'page')
  const [p, setP] = useState(structuredClone(sheet.page))
  const ok = () => {
    doc.transact(tx('Page Setup'), () => {
      doc.noteProps(sheet)
      sheet.page = p
    })
    onClose()
  }
  const m = p.margins
  const num = (v: number, set: (n: number) => void) => <input type="number" step={0.05} min={0} value={v} onChange={(e) => set(Number(e.target.value) || 0)} />
  return (
    <Modal title={t('Page Setup')} onClose={onClose} width={520} footer={<OkCancel onOk={ok} onCancel={onClose} extra={<button type="button" className="btn" onClick={() => { ok(); app.print() }}>{t('Print…')}</button>} />}>
      <DialogTabs tabs={[{ id: 'page', label: t('Page') }, { id: 'margins', label: t('Margins') }, { id: 'hf', label: t('Header/Footer') }, { id: 'sheet', label: t('Sheet') }]} active={tab} onChange={setTab} />
      {tab === 'page' && (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>{t('Orientation')}</legend>
            <div className="dlg-inline">
              <label className="check-item"><input type="radio" checked={p.orientation === 'portrait'} onChange={() => setP({ ...p, orientation: 'portrait' })} />{' '}{t('Portrait')}</label>
              <label className="check-item"><input type="radio" checked={p.orientation === 'landscape'} onChange={() => setP({ ...p, orientation: 'landscape' })} />{' '}{t('Landscape')}</label>
            </div>
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>{t('Scaling')}</legend>
            <label className="check-item"><input type="radio" checked={!p.fitToPage} onChange={() => setP({ ...p, fitToPage: false })} />{' '}{t('Adjust to:')}{' '}<input type="number" min={10} max={400} value={p.scale} onChange={(e) => setP({ ...p, scale: Number(e.target.value) || 100 })} />{t('% normal size')}</label>
            <label className="check-item">
              <input type="radio" checked={p.fitToPage} onChange={() => setP({ ...p, fitToPage: true })} /> {t('Fit to:')}{' '}
              <input type="number" min={0} max={99} value={p.fitWide ?? 1} onChange={(e) => setP({ ...p, fitToPage: true, fitWide: Math.max(0, Number(e.target.value) || 0) })} /> {t('page(s) wide by')}{' '}
              <input type="number" min={0} max={99} value={p.fitTall ?? 0} onChange={(e) => setP({ ...p, fitToPage: true, fitTall: Math.max(0, Number(e.target.value) || 0) })} /> {t('tall (0 = automatic)')}
            </label>
          </fieldset>
          <label className="dlg-inline">
            {t('Paper size:')}
            <select value={p.paper} onChange={(e) => setP({ ...p, paper: e.target.value as typeof p.paper })}>
              <option value="letter">{t('Letter')}</option>
              <option value="legal">{t('Legal')}</option>
              <option value="tabloid">{t('Tabloid')}</option>
              <option value="a4">A4</option>
              <option value="a3">A3</option>
            </select>
          </label>
        </div>
      )}
      {tab === 'margins' && (
        <div className="dlg-stack">
          <div className="margin-grid">
            <label>{t('Top')}{' '}{num(m.top, (n) => setP({ ...p, margins: { ...m, top: n } }))}</label>
            <label>{t('Header')}{' '}{num(m.header, (n) => setP({ ...p, margins: { ...m, header: n } }))}</label>
            <label>{t('Left')}{' '}{num(m.left, (n) => setP({ ...p, margins: { ...m, left: n } }))}</label>
            <label>{t('Right')}{' '}{num(m.right, (n) => setP({ ...p, margins: { ...m, right: n } }))}</label>
            <label>{t('Bottom')}{' '}{num(m.bottom, (n) => setP({ ...p, margins: { ...m, bottom: n } }))}</label>
            <label>{t('Footer')}{' '}{num(m.footer, (n) => setP({ ...p, margins: { ...m, footer: n } }))}</label>
          </div>
          <fieldset className="dlg-fieldset">
            <legend>{t('Center on page')}</legend>
            <label className="check-item"><input type="checkbox" checked={p.centerH} onChange={(e) => setP({ ...p, centerH: e.target.checked })} />{' '}{t('Horizontally')}</label>
            <label className="check-item"><input type="checkbox" checked={p.centerV} onChange={(e) => setP({ ...p, centerV: e.target.checked })} />{' '}{t('Vertically')}</label>
          </fieldset>
        </div>
      )}
      {tab === 'hf' && (
        <div className="dlg-stack">
          <label className="dlg-stack">{t('Header:')}{' '}<input value={p.header ?? ''} onChange={(e) => setP({ ...p, header: e.target.value || undefined })} placeholder={t('(none)')} /></label>
          <label className="dlg-stack">{t('Footer:')}{' '}<input value={p.footer ?? ''} onChange={(e) => setP({ ...p, footer: e.target.value || undefined })} placeholder={t('(none)')} /></label>
        </div>
      )}
      {tab === 'sheet' && (
        <div className="dlg-stack">
          <label className="dlg-inline find-field">{t('Print area:')}{' '}<input value={p.printArea ?? ''} onChange={(e) => setP({ ...p, printArea: e.target.value || undefined })} placeholder={t('e.g. A1:F40')} /></label>
          <fieldset className="dlg-fieldset">
            <legend>{t('Print titles')}</legend>
            <label className="dlg-inline find-field">{t('Rows to repeat at top:')}{' '}<input value={p.printTitleRows ?? ''} onChange={(e) => setP({ ...p, printTitleRows: e.target.value || undefined })} placeholder={t('e.g. $1:$1')} /></label>
            <label className="dlg-inline find-field">{t('Columns to repeat at left:')}{' '}<input value={p.printTitleCols ?? ''} onChange={(e) => setP({ ...p, printTitleCols: e.target.value || undefined })} placeholder={t('e.g. $A:$A')} /></label>
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>{t('Print')}</legend>
            <label className="check-item"><input type="checkbox" checked={p.printGridlines} onChange={(e) => setP({ ...p, printGridlines: e.target.checked })} />{' '}{t('Gridlines')}</label>
            <label className="check-item"><input type="checkbox" checked={p.printHeadings} onChange={(e) => setP({ ...p, printHeadings: e.target.checked })} />{' '}{t('Row and column headings')}</label>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}

const SYMBOLS = '€ £ ¥ ¢ © ® ™ § ¶ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ µ ½ ¼ ¾ ⅓ ⅔ … – — • → ← ↑ ↓ ↔ ✓ ✗ ★ ☆ ♠ ♣ ♥ ♦ Ω π Σ Δ α β γ δ θ λ σ φ √ ∑ ∏ ∫ ∂ ∆ ‰ ¹ ² ³ ¿ ¡ « » ‹ ›'.split(' ')

export function SymbolDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const insert = (s: string) => {
    if (doc.edit) {
      const e = doc.edit
      doc.updateEdit({ text: e.text.slice(0, e.caret) + s + e.text.slice(e.caret), caret: e.caret + s.length })
    } else {
      const a = doc.sel.active
      doc.select(a)
      doc.beginEdit('edit', doc.inputText(a.r, a.c) + s)
    }
    onClose()
  }
  return (
    <Modal title={t('Symbol')} onClose={onClose} width={440}>
      <div className="symbol-grid symbol-grid-wide">
        {SYMBOLS.map((s) => (
          <button key={s} type="button" title={`U+${s.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`} onClick={() => insert(s)}>
            {s}
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function GoalSeekDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const a = doc.sel.active
  const [setCell, setSetCell] = useState(cellName(a.r, a.c))
  const [target, setTarget] = useState('')
  const [changing, setChanging] = useState('')
  const ok = () => {
    const s = parseCell(setCell.replace(/\$/g, ''))
    const ch = parseCell(changing.replace(/\$/g, ''))
    const goal = Number(target)
    const sheet = doc.sheet
    if (!s || !ch || !Number.isFinite(goal)) return app.alert(t('Enter a cell, a target value and a changing cell.'))
    if (sheet.get(s.r, s.c)?.f === undefined) return app.alert(t('The "Set cell" must contain a formula.'))
    if (sheet.get(ch.r, ch.c)?.f !== undefined) return app.alert(t('The "By changing cell" must contain a value.'))
    const orig = sheet.get(ch.r, ch.c)
    const evalAt = (x: number) => {
      sheet.setRaw(cellKey(ch.r, ch.c), { ...orig, v: x })
      doc.engine.cellsChanged(sheet, [cellKey(ch.r, ch.c)])
      doc.engine.recalc(true)
      const v = doc.engine.display(sheet, s.r, s.c)
      return typeof v === 'number' ? v - goal : NaN
    }
    let x0 = typeof orig?.v === 'number' ? orig.v : 0
    let x1 = x0 === 0 ? 1 : x0 * 1.1
    let f0 = evalAt(x0)
    let found: number | null = Math.abs(f0) < 1e-9 ? x0 : null
    for (let i = 0; i < 100 && found === null; i++) {
      const f1 = evalAt(x1)
      if (!Number.isFinite(f1)) break
      if (Math.abs(f1) < 1e-9) {
        found = x1
        break
      }
      const d = f1 - f0
      if (d === 0) break
      const x2 = x1 - (f1 * (x1 - x0)) / d
      x0 = x1
      f0 = f1
      x1 = x2
    }
    sheet.setRaw(cellKey(ch.r, ch.c), orig)
    doc.engine.cellsChanged(sheet, [cellKey(ch.r, ch.c)])
    doc.engine.recalc(true)
    onClose()
    if (found === null) return app.alert(t('Goal Seek with cell {cell} may not have found a solution.', { cell: setCell }))
    doc.transact(tx('Goal Seek'), () => doc.write(sheet, ch.r, ch.c, { ...(orig ?? {}), v: Number(found!.toPrecision(15)) }))
    app.alert(t('Goal Seeking with cell {cell} found a solution.\nTarget value: {value}', { cell: setCell, value: goal }))
  }
  return (
    <Modal title={t('Goal Seek')} onClose={onClose} width={340} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>{t('Set cell:')}{' '}<input value={setCell} onChange={(e) => setSetCell(e.target.value)} /></label>
        <label>{t('To value:')}{' '}<input autoFocus value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <label>{t('By changing cell:')}{' '}<input value={changing} onChange={(e) => setChanging(e.target.value)} /></label>
      </div>
    </Modal>
  )
}

export function TextToColumnsDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const rg = doc.boundToUsed(doc.activeRange)
  const [delims, setDelims] = useState({ tab: true, semicolon: false, comma: true, space: false })
  const [other, setOther] = useState('')
  const [consecutive, setConsecutive] = useState(false)
  const [mode, setMode] = useState<'delimited' | 'fixed'>('delimited')
  const [breaks, setBreaks] = useState(() => {
    // suggest breaks where every sample line has a space
    const lines = Array.from({ length: Math.min(20, rg.r2 - rg.r1 + 1) }, (_, i) => String(doc.value(rg.r1 + i, rg.c1) ?? ''))
    const len = Math.max(0, ...lines.map((l) => l.length))
    const out: number[] = []
    for (let i = 1; i < len; i++) if (lines.every((l) => l[i - 1] === ' ' && l[i] !== ' ')) out.push(i)
    return out.join(', ')
  })
  const chars = [delims.tab && '\t', delims.semicolon && ';', delims.comma && ',', delims.space && ' ', other].filter(Boolean).join('')
  const split = (s: string) => {
    if (mode === 'fixed') {
      const pos = breaks.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
      const parts: string[] = []
      let last = 0
      for (const p of pos) {
        parts.push(s.slice(last, p).trim())
        last = p
      }
      parts.push(s.slice(last).trim())
      return parts
    }
    if (!chars) return [s]
    const re = new RegExp(`[${chars.replace(/[\]\\^-]/g, '\\$&')}]${consecutive ? '+' : ''}`)
    return s.split(re)
  }
  const preview = Array.from({ length: Math.min(5, rg.r2 - rg.r1 + 1) }, (_, i) => split(String(doc.value(rg.r1 + i, rg.c1) ?? '')))
  const [formats, setFormats] = useState<Record<number, ColumnFormat>>({})
  const [dest, setDest] = useState(cellName(rg.r1, rg.c1))
  const ok = () => {
    if (rg.c1 !== rg.c2) return app.alert(t('Text to Columns works on one column at a time.'))
    const start = parseCell(dest.replace(/\$/g, ''))
    if (!start) return app.alert(t('Enter a valid destination cell.'))
    const sheet = doc.sheet
    doc.transact(tx('Text to Columns'), () => {
      for (let r = rg.r1; r <= rg.r2; r++) {
        const v = doc.value(r, rg.c1)
        if (typeof v !== 'string') continue
        let c = start.c
        split(v).forEach((part, j) => {
          const format = formats[j] ?? 'general'
          if (format === 'skip' || c >= MAX_COLS) return
          const row = start.r + (r - rg.r1)
          const p = convertPart(part, format)
          const old = sheet.get(row, c)
          const s = p.fmt && p.fmt !== 'General' ? doc.wb.styles.patch(old?.s, { fmt: p.fmt }) : old?.s
          doc.write(sheet, row, c, { ...(s ? { s } : {}), v: p.v === null ? undefined : p.v })
          c++
        })
      }
    })
    onClose()
  }
  const columnCount = Math.max(1, ...preview.map((row) => row.length))
  void MAX_ROWS
  return (
    <Modal title={t('Convert Text to Columns')} onClose={onClose} width={520} footer={<OkCancel onOk={ok} onCancel={onClose} okLabel={t('Finish')} />}>
      <div className="dlg-inline">
        <label className="check-item"><input type="radio" checked={mode === 'delimited'} onChange={() => setMode('delimited')} />{' '}{t('Delimited')}</label>
        <label className="check-item"><input type="radio" checked={mode === 'fixed'} onChange={() => setMode('fixed')} />{' '}{t('Fixed width')}</label>
      </div>
      {mode === 'fixed' && (
        <label className="dlg-inline">
          {t('Break lines after character positions:')}{' '}<input value={breaks} onChange={(e) => setBreaks(e.target.value)} placeholder={t('e.g. 10, 18')} />
        </label>
      )}
      <fieldset className="dlg-fieldset dlg-two" disabled={mode === 'fixed'}>
        <legend>{t('Delimiters')}</legend>
        {(['tab', 'semicolon', 'comma', 'space'] as const).map((k) => (
          <label key={k} className="check-item">
            <input type="checkbox" checked={delims[k]} onChange={(e) => setDelims({ ...delims, [k]: e.target.checked })} /> {k[0].toUpperCase() + k.slice(1)}
          </label>
        ))}
        <label className="check-item">
          {t('Other:')}{' '}<input maxLength={1} value={other} onChange={(e) => setOther(e.target.value)} style={{ width: 30 }} />
        </label>
        <label className="check-item">
          <input type="checkbox" checked={consecutive} onChange={(e) => setConsecutive(e.target.checked)} />{' '}{t('Treat consecutive delimiters as one')}
        </label>
      </fieldset>
      <label className="dlg-inline">
        {t('Destination:')} <input value={dest} onChange={(e) => setDest(e.target.value)} style={{ width: 80 }} />
      </label>
      <div className="find-results">
        <table>
          <thead>
            <tr>
              {Array.from({ length: columnCount }, (_, j) => (
                <th key={j}>
                  <select aria-label={t('Column data format')} value={formats[j] ?? 'general'} onChange={(e) => setFormats({ ...formats, [j]: e.target.value as ColumnFormat })}>
                    <option value="general">{t('General')}</option>
                    <option value="text">{t('Text')}</option>
                    {DATE_ORDERS.map((o) => (
                      <option key={o} value={o}>
                        {t('Date: {order}', { order: o })}
                      </option>
                    ))}
                    <option value="skip">{t('Do not import column (skip)')}</option>
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

export function ShortcutsDialog({ onClose }: P) {
  const rows: [string, string][] = [
    ['Ctrl+N / Ctrl+O / Ctrl+S / F12', t('New, open, save, save as')], ['Ctrl+P', t('Print')], ['Ctrl+Z / Ctrl+Y', t('Undo / redo (F4 repeats)')], ['Ctrl+C / Ctrl+X / Ctrl+V', t('Copy, cut, paste')],
    ['Ctrl+Alt+V', t('Paste Special')], ['Ctrl+F / Ctrl+H', t('Find / replace')], ['Ctrl+G or F5', t('Go To')], ['Ctrl+1', t('Format Cells')], ['Ctrl+B / I / U / 5', t('Bold, italic, underline, strikethrough')],
    ['Ctrl+Shift+$ % # @ ! ~ ^', t('Currency, percent, date, time, number, general, scientific')], ['Ctrl+Shift+& / Ctrl+Shift+_', t('Outline border / remove borders')],
    ['F2', t('Edit the active cell')], ['Alt+Enter', t('New line in a cell')], ['Ctrl+Enter', t('Fill the selection with the entry')], ['Esc', t('Cancel the entry')],
    [t('F4 (while editing)'), t('Toggle absolute/relative references')], ['Shift+F3', t('Insert Function')], ['Alt+=', t('AutoSum')], ['Ctrl+; / Ctrl+Shift+;', t('Insert current date / time')],
    ["Ctrl+'", t('Copy the formula from the cell above')], ['Ctrl+`', t('Show formulas')], ['Ctrl+D / Ctrl+R', t('Fill down / right')], ['Ctrl+Shift++ / Ctrl+-', t('Insert / delete cells')],
    ['Ctrl+9 / Ctrl+0', t('Hide rows / columns')], ['Ctrl+Shift+( / Ctrl+Shift+)', t('Unhide rows / columns')], ['Ctrl+Space / Shift+Space', t('Select column / row')], ['Ctrl+A', t('Select current region, then all')],
    ['Ctrl+Arrow', t('Jump to the edge of the data')], ['Ctrl+Home / Ctrl+End', t('First cell / last used cell')], ['Ctrl+PgUp / Ctrl+PgDn', t('Previous / next sheet')], ['Shift+F11', t('Insert a sheet')],
    ['F9', t('Calculate now')], ['Ctrl+Shift+U', t('Expand the formula bar')], ['Ctrl+F1', t('Collapse the ribbon')], ['Ctrl+K', t('Insert link')], ['Ctrl+F3', t('Name Manager')],
  ]
  return (
    <Modal title={t('Keyboard Shortcuts')} onClose={onClose} width={560}>
      <table className="shortcut-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dlg-hint">{t('On a Mac, use Cmd instead of Ctrl.')}</p>
    </Modal>
  )
}

export function AboutDialog({ onClose }: P) {
  return (
    <Modal title={t('About {app}', { app: APP_NAME })} onClose={onClose} width={380} footer={<><span className="spacer" /><button type="button" className="btn btn-primary" onClick={onClose}>{t('OK')}</button></>}>
      <p>
        {t('{app} is a free, open-source spreadsheet that runs in your browser. It opens and saves .xlsx workbooks and CSV files and calculates {n} worksheet functions.', { app: APP_NAME, n: [...FN_META.keys()].length })}
      </p>
      <p className="dlg-hint">{t('Built with React, Vite and ExcelJS. Your data stays in this browser.')}</p>
    </Modal>
  )
}

void autofitRows
void Engine

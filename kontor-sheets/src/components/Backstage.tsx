import { useEffect, useState } from 'react'
import { ArrowLeft, FileDown, FilePlus, FolderOpen, Home, Info, Printer, Save, Settings } from 'lucide-react'
import { TEMPLATES } from '../templates'
import { canExportPdf, printDoc, printHtml, type PrintWhat } from '../io/print'
import { cls } from './ui'
import { useApp } from './appContext'
import { autoCorrectList, deleteAutoCorrectEntry, prefs, setAutoCorrectEntry, setPrefs, type Prefs } from '../model/prefs'
import { LANGUAGES, formatDate, formatNumber, getLanguage, setLanguage, t, type Language } from '../i18n'
import { inspectWorkbook, removeInspected } from '../commands/inspect'
import { CUSTOMIZABLE_TABS, tabLabel } from './Ribbon'
import { recentFiles } from '../io/recent'
import { AUTHOR_KEY, authorName } from '../commands/review'

type Section = 'home' | 'new' | 'open' | 'info' | 'save' | 'print' | 'export' | 'options'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening')
}

function TemplateTiles({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="templates">
      {TEMPLATES.map((tpl) => (
        <button key={tpl.id} type="button" className="template" onClick={() => onPick(tpl.id)}>
          <span className={`template-thumb sheet-thumb thumb-${tpl.id}`}>
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} />
            ))}
          </span>
          <span>{t(tpl.label)}</span>
        </button>
      ))}
    </div>
  )
}

export function Backstage({ onClose, onTemplate }: { onClose: () => void; onTemplate: (id: string) => void }) {
  const app = useApp()
  const doc = app.doc
  const [section, setSection] = useState<Section>('home')
  const [printWhat, setPrintWhat] = useState<PrintWhat>('active')
  const [, force] = useState(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const nav: { id: Section; label: string; icon: typeof Home }[] = [
    { id: 'home', label: t('Home'), icon: Home },
    { id: 'new', label: t('New'), icon: FilePlus },
    { id: 'open', label: t('Open'), icon: FolderOpen },
    { id: 'info', label: t('Info'), icon: Info },
    { id: 'save', label: t('Save As'), icon: Save },
    { id: 'print', label: t('Print'), icon: Printer },
    { id: 'export', label: t('Export'), icon: FileDown },
    { id: 'options', label: t('Options'), icon: Settings },
  ]

  let cells = 0
  let formulas = 0
  for (const s of doc.wb.sheets) {
    cells += s.cells.size
    for (const d of s.cells.values()) if (d.f !== undefined) formulas++
  }

  return (
    <div className="backstage" role="dialog" aria-label={t('File')}>
      <aside className="bs-nav">
        <button type="button" className="bs-back" aria-label={t('Back to the workbook')} onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        {nav.map((n) => (
          <button key={n.id} type="button" className={cls('bs-item', section === n.id && 'is-active')} onClick={() => setSection(n.id)}>
            <n.icon size={18} strokeWidth={1.6} />
            {n.label}
          </button>
        ))}
      </aside>
      <main className="bs-main">
        {section === 'home' && (
          <>
            <h1>{greeting()}</h1>
            <h2>{t('New')}</h2>
            <TemplateTiles onPick={onTemplate} />
            <h2>{t('Where your work is saved')}</h2>
            <p className="bs-hint">{t('Workbooks are saved automatically in this browser while AutoSave is on. Use Save As to download an .xlsx file you can open in any spreadsheet program.')}</p>
          </>
        )}
        {section === 'new' && (
          <>
            <h1>{t('New')}</h1>
            <TemplateTiles onPick={onTemplate} />
          </>
        )}
        {section === 'open' && (
          <>
            <h1>{t('Open')}</h1>
            <button type="button" className="bs-action" onClick={app.openFile}>
              <FolderOpen size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Browse')}</strong>
                <small>{t('Open an .xlsx, .xls, .xlsb, .ods, .csv or .txt file from this device')}</small>
              </span>
            </button>
            <RecentList />
          </>
        )}
        {section === 'info' && (
          <>
            <h1>{t('Info')}</h1>
            <div className="bs-info">
              <dl>
                <dt>{t('Title')}</dt>
                <dd>{doc.title}</dd>
                <dt>{t('Author')}</dt>
                <dd>
                  <input
                    value={doc.wb.props.author}
                    placeholder={t('Add an author')}
                    onChange={(e) => {
                      doc.wb.props.author = e.target.value
                      doc.modified = true
                      force((n) => n + 1)
                    }}
                  />
                </dd>
                <dt>{t('Sheets')}</dt>
                <dd>{doc.wb.sheets.length}</dd>
                <dt>{t('Cells with data')}</dt>
                <dd>{formatNumber(cells)}</dd>
                <dt>{t('Formulas')}</dt>
                <dd>{formatNumber(formulas)}</dd>
                <dt>{t('Defined names')}</dt>
                <dd>{doc.wb.names.size}</dd>
              </dl>
            </div>
            <InfoActions onChange={() => force((n) => n + 1)} />
          </>
        )}
        {section === 'save' && (
          <>
            <h1>{t('Save As')}</h1>
            <label className="bs-field">
              {t('File name')}
              <input
                value={doc.title}
                onChange={(e) => {
                  doc.title = e.target.value
                  doc.emit()
                  force((n) => n + 1)
                }}
              />
            </label>
            <div className="bs-buttons">
              <button type="button" className="bs-primary" onClick={() => app.saveAs('xlsx')}>
                {t('Save as workbook (.xlsx)')}
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('csv')}>
                {t('CSV (comma delimited)')}
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('ods')}>
                {t('OpenDocument Spreadsheet (.ods)')}
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('txt')}>
                {t('Text (tab delimited)')}
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('html')}>
                {t('Web Page (.html)')}
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('xls')}>
                {t('97-2003 Workbook (.xls)')}
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('xlsb')}>
                {t('Binary Workbook (.xlsb)')}
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('pdf')}>
                {t('PDF')}
              </button>
            </div>
            <p className="bs-hint">{t('.xls and .xlsb files keep values, formula results, number formats, merged cells and sizes; formulas and cell formatting are only kept in .xlsx and .ods.')}</p>
          </>
        )}
        {section === 'print' && (
          <>
            <h1>{t('Print')}</h1>
            <div className="bs-print">
              <label className="bs-field">
                {t('Settings')}
                <select value={printWhat} onChange={(e) => setPrintWhat(e.target.value as PrintWhat)}>
                  <option value="active">{t('Print Active Sheets')}</option>
                  <option value="workbook">{t('Print Entire Workbook')}</option>
                  <option value="selection">{t('Print Selection')}</option>
                </select>
              </label>
              <button type="button" className="bs-primary" onClick={() => { onClose(); printDoc(doc, printWhat) }}>
                <Printer size={16} />{' '}{t('Print')}
              </button>
              <button type="button" className="btn" onClick={() => app.dialog({ kind: 'pageSetup' })}>
                {t('Page Setup…')}
              </button>
            </div>
            <p className="bs-hint">{t('Opens the browser\'s print dialog. Choose "Save as PDF" there to create a PDF. Paper size, orientation, margins, gridlines and print titles come from Page Layout.')}</p>
            <iframe className="bs-preview" title={t('Print preview')} srcDoc={printHtml(doc, printWhat, true)} />
          </>
        )}
        {section === 'export' && (
          <>
            <h1>{t('Export')}</h1>
            <button type="button" className="bs-action" onClick={() => { if (!canExportPdf()) onClose(); app.saveAs('pdf') }}>
              <FileDown size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Create PDF Document')}</strong>
                <small>{canExportPdf() ? t('Saves the active sheet as a PDF file') : t('Choose "Save as PDF" in the print dialog')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('xlsx')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Workbook (.xlsx)')}</strong>
                <small>{t('Opens in all common spreadsheet programs')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('csv')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('CSV (.csv)')}</strong>
                <small>{t('The active sheet as comma-separated values')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('ods')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('OpenDocument Spreadsheet (.ods)')}</strong>
                <small>{t('Values, formulas, merged cells, sizes and basic formatting')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('html')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Web Page (.html)')}</strong>
                <small>{t('The active sheet as a formatted table')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('xls')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('97-2003 Workbook (.xls)')}</strong>
                <small>{t('For older spreadsheet programs: values, number formats, merged cells and sizes')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('xlsb')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Binary Workbook (.xlsb)')}</strong>
                <small>{t('A compact binary file: values, number formats, merged cells and sizes')}</small>
              </span>
            </button>
          </>
        )}
        {section === 'options' && <OptionsPage onChange={() => force((n) => n + 1)} />}
      </main>
    </div>
  )
}

/** File > Options: workbook calculation settings and program options kept in this browser. */
function OptionsPage({ onChange }: { onChange: () => void }) {
  const app = useApp()
  const doc = app.doc
  const p = prefs()
  const set = (patch: Partial<Prefs>) => {
    setPrefs(patch)
    onChange()
  }
  const iterate = doc.wb.iterate
  const setIterate = (patch: Partial<typeof iterate>) => {
    doc.wb.iterate = { ...iterate, ...patch }
    doc.modified = true
    doc.engine.recalcAll()
    doc.emit()
    onChange()
  }
  return (
    <>
      <h1>{t('Options')}</h1>
      {/* "{section}" is always empty: it gives the Options section its own key (the number format "General" is a different word in some languages). */}
      <h2>{t('General {section}', { section: '' }).trim()}</h2>
      <label className="bs-field">
        {t('Interface language')}
        <select value={getLanguage()} onChange={(e) => setLanguage(e.target.value as Language)}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="bs-field">
        {t('User name (shown on comments and notes)')}
        <input
          defaultValue={authorName()}
          onBlur={(e) => {
            try {
              localStorage.setItem(AUTHOR_KEY, e.target.value.trim())
            } catch {
              // storage unavailable
            }
          }}
        />
      </label>
      <h2>{t('Formulas')}</h2>
      <label className="check-item">
        <input type="radio" checked={doc.wb.calcMode === 'auto'} onChange={() => { doc.wb.calcMode = 'auto'; doc.engine.recalcAll(); doc.emit(); onChange() }} />{' '}{t('Automatic calculation')}
      </label>
      <label className="check-item">
        <input type="radio" checked={doc.wb.calcMode === 'manual'} onChange={() => { doc.wb.calcMode = 'manual'; doc.emit(); onChange() }} />{' '}{t('Manual calculation (press F9 to calculate)')}
      </label>
      <label className="check-item">
        <input type="checkbox" checked={iterate.on} onChange={(e) => setIterate({ on: e.target.checked })} />{' '}{t('Enable iterative calculation')}
      </label>
      <label className="check-item">
        <input type="checkbox" checked={p.r1c1} onChange={(e) => { set({ r1c1: e.target.checked }); doc.emit() }} /> {t('R1C1 reference style')}
      </label>
      <div className="bs-inline">
        <label>
          {t('Maximum Iterations')}
          <input type="number" min={1} max={32767} disabled={!iterate.on} value={iterate.max} onChange={(e) => setIterate({ max: Math.max(1, Math.min(32767, Number(e.target.value) || 1)) })} />
        </label>
        <label>
          {t('Maximum Change')}
          <input type="number" min={0} step={0.001} disabled={!iterate.on} value={iterate.change} onChange={(e) => setIterate({ change: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
      </div>
      <h2>{t('Editing')}</h2>
      <label className="check-item">
        <input type="checkbox" checked={p.moveAfterEnter} onChange={(e) => set({ moveAfterEnter: e.target.checked })} />{' '}{t('After pressing Enter, move selection')}
      </label>
      <label className="bs-field bs-indent">
        {t('Direction')}
        <select value={p.enterDir} disabled={!p.moveAfterEnter} onChange={(e) => set({ enterDir: e.target.value as Prefs['enterDir'] })}>
          <option value="down">{t('Down')}</option>
          <option value="right">{t('Right')}</option>
          <option value="up">{t('Up')}</option>
          <option value="left">{t('Left')}</option>
        </select>
      </label>
      <label className="check-item">
        <input type="checkbox" checked={p.autoComplete} onChange={(e) => set({ autoComplete: e.target.checked })} />{' '}{t('Enable AutoComplete for cell values')}
      </label>
      <label className="check-item">
        <input type="checkbox" checked={p.autoCorrect} onChange={(e) => set({ autoCorrect: e.target.checked })} />{' '}{t('Correct common typing mistakes as you type (AutoCorrect)')}
      </label>
      <h2>{t('Display')}</h2>
      <label className="check-item">
        <input type="checkbox" checked={app.showFormulaBar} onChange={(e) => app.setShowFormulaBar(e.target.checked)} />{' '}{t('Show formula bar')}
      </label>
      <label className="check-item">
        <input type="checkbox" checked={doc.sheet.showZeros} onChange={(e) => { doc.sheet.showZeros = e.target.checked; doc.emit(); onChange() }} />{' '}{t('Show a zero in cells that have zero value')}
      </label>
      <label className="check-item">
        <input type="checkbox" checked={doc.sheet.showGrid} onChange={(e) => { doc.sheet.showGrid = e.target.checked; doc.emit(); onChange() }} />{' '}{t('Show gridlines')}
      </label>
      <label className="check-item">
        <input type="checkbox" checked={doc.sheet.showHeadings} onChange={(e) => { doc.sheet.showHeadings = e.target.checked; doc.emit(); onChange() }} />{' '}{t('Show row and column headers')}
      </label>
      <h2>{t('Proofing')}</h2>
      <AutoCorrectEditor onChange={onChange} />
      <h2>{t('Customize the Ribbon')}</h2>
      <p className="bs-hint">{t('Choose which main tabs the ribbon shows. Home is always shown.')}</p>
      {CUSTOMIZABLE_TABS.map((tab) => (
        <label key={tab.id} className="check-item">
          <input
            type="checkbox"
            checked={!p.hiddenTabs.includes(tab.id)}
            onChange={(e) => {
              set({ hiddenTabs: e.target.checked ? p.hiddenTabs.filter((x) => x !== tab.id) : [...p.hiddenTabs, tab.id] })
              doc.emit()
            }}
          />{' '}
          {tabLabel(tab.label)}
        </label>
      ))}
      <h2>{t('Add-ins and Trust Center')}</h2>
      <p className="bs-hint">{t('Kontor Sheets runs no add-ins or macros from files, so there is nothing to trust or block.')}</p>
    </>
  )
}

function RecentList() {
  const app = useApp()
  const list = recentFiles()
  if (!list.length) return null
  return (
    <>
      <h2>{t('Recent')}</h2>
      <div className="bs-recent">
        {list.map((f) => (
          <button key={f.id} type="button" className="bs-recent-item" onClick={() => app.openRecent(f.id, f.name)}>
            <strong>{f.name}</strong>
            <small>{formatDate(new Date(f.date), { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </button>
        ))}
      </div>
    </>
  )
}

/** File > Options > Proofing: the AutoCorrect list, with entries that can be added, changed and deleted. */
function AutoCorrectEditor({ onChange }: { onChange: () => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const list = autoCorrectList()
  const add = () => {
    if (!from.trim() || !to) return
    setAutoCorrectEntry(from.trim(), to)
    setFrom('')
    setTo('')
    onChange()
  }
  return (
    <details>
      <summary>{t('AutoCorrect list ({n} entries)', { n: Object.keys(list).length })}</summary>
      <div className="bs-inline">
        <label>
          {t('Replace')}
          <input value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t('With')}
          <input value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </label>
        <button type="button" className="btn" disabled={!from.trim() || !to} onClick={add}>
          {from.trim() in list ? t('Replace') : t('Add')}
        </button>
      </div>
      <table className="ac-table">
        <tbody>
          {Object.entries(list).map(([k, v]) => (
            <tr key={k}>
              <td>
                <button type="button" className="link-button" onClick={() => { setFrom(k); setTo(v) }}>
                  {k}
                </button>
              </td>
              <td>{v}</td>
              <td>
                <button type="button" className="btn" aria-label={t('Delete')} onClick={() => { deleteAutoCorrectEntry(k); onChange() }}>
                  {t('Delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/** File > Info: Protect Workbook and Inspect Workbook. */
function InfoActions({ onChange }: { onChange: () => void }) {
  const app = useApp()
  const doc = app.doc
  const [inspected, setInspected] = useState<ReturnType<typeof inspectWorkbook> | null>(null)
  return (
    <>
      <h2>{t('Protect Workbook')}</h2>
      <p className="bs-hint">{doc.wb.protection ? t('The structure of this workbook is locked: sheets cannot be added, deleted, renamed or moved.') : t('Control what types of changes people can make to this workbook.')}</p>
      <div className="bs-buttons">
        <button type="button" className="btn" onClick={() => app.dialog({ kind: 'protectWorkbook', data: doc.wb.protection ? 'unprotect' : 'protect' })}>
          {doc.wb.protection ? t('Unprotect Workbook Structure') : t('Protect Workbook Structure')}
        </button>
        <button type="button" className="btn" onClick={() => app.dialog({ kind: 'protectSheet' })}>
          {t('Protect Current Sheet')}
        </button>
      </div>
      <h2>{t('Inspect Workbook')}</h2>
      <p className="bs-hint">{t('Before sharing this file, check it for hidden content and personal information.')}</p>
      <div className="bs-buttons">
        <button type="button" className="btn" onClick={() => setInspected(inspectWorkbook(doc))}>
          {t('Inspect Workbook')}
        </button>
        <button type="button" className="btn" onClick={() => app.dialog({ kind: 'accessibility' })}>
          {t('Check Accessibility')}
        </button>
      </div>
      {inspected && (
        <div className="bs-inspect">
          {!inspected.length && <p>{t('No hidden content or personal information was found.')}</p>}
          {inspected.map((item) => (
            <div key={item.kind} className="bs-inspect-item">
              <span>
                <strong>{t(item.label)}</strong>
                <small>{t(item.detail, { n: item.count })}</small>
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  removeInspected(doc, item.kind)
                  setInspected(inspectWorkbook(doc))
                  onChange()
                }}
              >
                {t('Remove All')}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

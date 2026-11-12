import { useEffect, useState } from 'react'
import { ArrowLeft, FileDown, FilePlus, FolderOpen, Home, Info, Printer, Save, Settings } from 'lucide-react'
import { TEMPLATES } from '../templates'
import { printDoc, printHtml, type PrintWhat } from '../io/print'
import { cls } from './ui'
import { useApp } from './appContext'
import { AUTOCORRECT, prefs, setPrefs, type Prefs } from '../model/prefs'
import { recentFiles } from '../io/recent'
import { AUTHOR_KEY, authorName } from '../commands/review'

type Section = 'home' | 'new' | 'open' | 'info' | 'save' | 'print' | 'export' | 'options'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function TemplateTiles({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="templates">
      {TEMPLATES.map((t) => (
        <button key={t.id} type="button" className="template" onClick={() => onPick(t.id)}>
          <span className={`template-thumb sheet-thumb thumb-${t.id}`}>
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} />
            ))}
          </span>
          <span>{t.label}</span>
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
    { id: 'home', label: 'Home', icon: Home },
    { id: 'new', label: 'New', icon: FilePlus },
    { id: 'open', label: 'Open', icon: FolderOpen },
    { id: 'info', label: 'Info', icon: Info },
    { id: 'save', label: 'Save As', icon: Save },
    { id: 'print', label: 'Print', icon: Printer },
    { id: 'export', label: 'Export', icon: FileDown },
    { id: 'options', label: 'Options', icon: Settings },
  ]

  let cells = 0
  let formulas = 0
  for (const s of doc.wb.sheets) {
    cells += s.cells.size
    for (const d of s.cells.values()) if (d.f !== undefined) formulas++
  }

  return (
    <div className="backstage" role="dialog" aria-label="File">
      <aside className="bs-nav">
        <button type="button" className="bs-back" aria-label="Back to the workbook" onClick={onClose}>
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
            <h2>New</h2>
            <TemplateTiles onPick={onTemplate} />
            <h2>Where your work is saved</h2>
            <p className="bs-hint">Workbooks are saved automatically in this browser while AutoSave is on. Use Save As to download an .xlsx file you can open in any spreadsheet program.</p>
          </>
        )}
        {section === 'new' && (
          <>
            <h1>New</h1>
            <TemplateTiles onPick={onTemplate} />
          </>
        )}
        {section === 'open' && (
          <>
            <h1>Open</h1>
            <button type="button" className="bs-action" onClick={app.openFile}>
              <FolderOpen size={28} strokeWidth={1.4} />
              <span>
                <strong>Browse</strong>
                <small>Open an .xlsx, .ods, .csv or .txt file from this device</small>
              </span>
            </button>
            <RecentList />
          </>
        )}
        {section === 'info' && (
          <>
            <h1>Info</h1>
            <div className="bs-info">
              <dl>
                <dt>Title</dt>
                <dd>{doc.title}</dd>
                <dt>Author</dt>
                <dd>
                  <input
                    value={doc.wb.props.author}
                    placeholder="Add an author"
                    onChange={(e) => {
                      doc.wb.props.author = e.target.value
                      doc.modified = true
                      force((n) => n + 1)
                    }}
                  />
                </dd>
                <dt>Sheets</dt>
                <dd>{doc.wb.sheets.length}</dd>
                <dt>Cells with data</dt>
                <dd>{cells.toLocaleString('en-US')}</dd>
                <dt>Formulas</dt>
                <dd>{formulas.toLocaleString('en-US')}</dd>
                <dt>Defined names</dt>
                <dd>{doc.wb.names.size}</dd>
              </dl>
            </div>
          </>
        )}
        {section === 'save' && (
          <>
            <h1>Save As</h1>
            <label className="bs-field">
              File name
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
                Save as workbook (.xlsx)
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('csv')}>
                CSV (comma delimited)
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('ods')}>
                OpenDocument Spreadsheet (.ods)
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('txt')}>
                Text (tab delimited)
              </button>
              <button type="button" className="btn" onClick={() => app.saveAs('html')}>
                Web Page (.html)
              </button>
            </div>
          </>
        )}
        {section === 'print' && (
          <>
            <h1>Print</h1>
            <div className="bs-print">
              <label className="bs-field">
                Settings
                <select value={printWhat} onChange={(e) => setPrintWhat(e.target.value as PrintWhat)}>
                  <option value="active">Print Active Sheets</option>
                  <option value="workbook">Print Entire Workbook</option>
                  <option value="selection">Print Selection</option>
                </select>
              </label>
              <button type="button" className="bs-primary" onClick={() => { onClose(); printDoc(doc, printWhat) }}>
                <Printer size={16} /> Print
              </button>
              <button type="button" className="btn" onClick={() => app.dialog({ kind: 'pageSetup' })}>
                Page Setup…
              </button>
            </div>
            <p className="bs-hint">Opens the browser's print dialog. Choose "Save as PDF" there to create a PDF. Paper size, orientation, margins, gridlines and print titles come from Page Layout.</p>
            <iframe className="bs-preview" title="Print preview" srcDoc={printHtml(doc, printWhat, true)} />
          </>
        )}
        {section === 'export' && (
          <>
            <h1>Export</h1>
            <button type="button" className="bs-action" onClick={() => { onClose(); printDoc(doc, 'active') }}>
              <FileDown size={28} strokeWidth={1.4} />
              <span>
                <strong>Create PDF Document</strong>
                <small>Choose "Save as PDF" in the print dialog</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('xlsx')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>Workbook (.xlsx)</strong>
                <small>Opens in all common spreadsheet programs</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('csv')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>CSV (.csv)</strong>
                <small>The active sheet as comma-separated values</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('ods')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>OpenDocument Spreadsheet (.ods)</strong>
                <small>Values, formulas, merged cells, sizes and basic formatting</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => app.saveAs('html')}>
              <Save size={28} strokeWidth={1.4} />
              <span>
                <strong>Web Page (.html)</strong>
                <small>The active sheet as a formatted table</small>
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
      <h1>Options</h1>
      <h2>General</h2>
      <label className="bs-field">
        User name (shown on comments and notes)
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
      <h2>Formulas</h2>
      <label className="check-item">
        <input type="radio" checked={doc.wb.calcMode === 'auto'} onChange={() => { doc.wb.calcMode = 'auto'; doc.engine.recalcAll(); doc.emit(); onChange() }} /> Automatic calculation
      </label>
      <label className="check-item">
        <input type="radio" checked={doc.wb.calcMode === 'manual'} onChange={() => { doc.wb.calcMode = 'manual'; doc.emit(); onChange() }} /> Manual calculation (press F9 to calculate)
      </label>
      <label className="check-item">
        <input type="checkbox" checked={iterate.on} onChange={(e) => setIterate({ on: e.target.checked })} /> Enable iterative calculation
      </label>
      <div className="bs-inline">
        <label>
          Maximum Iterations
          <input type="number" min={1} max={32767} disabled={!iterate.on} value={iterate.max} onChange={(e) => setIterate({ max: Math.max(1, Math.min(32767, Number(e.target.value) || 1)) })} />
        </label>
        <label>
          Maximum Change
          <input type="number" min={0} step={0.001} disabled={!iterate.on} value={iterate.change} onChange={(e) => setIterate({ change: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
      </div>
      <h2>Editing</h2>
      <label className="check-item">
        <input type="checkbox" checked={p.moveAfterEnter} onChange={(e) => set({ moveAfterEnter: e.target.checked })} /> After pressing Enter, move selection
      </label>
      <label className="bs-field bs-indent">
        Direction
        <select value={p.enterDir} disabled={!p.moveAfterEnter} onChange={(e) => set({ enterDir: e.target.value as Prefs['enterDir'] })}>
          <option value="down">Down</option>
          <option value="right">Right</option>
          <option value="up">Up</option>
          <option value="left">Left</option>
        </select>
      </label>
      <label className="check-item">
        <input type="checkbox" checked={p.autoComplete} onChange={(e) => set({ autoComplete: e.target.checked })} /> Enable AutoComplete for cell values
      </label>
      <label className="check-item">
        <input type="checkbox" checked={p.autoCorrect} onChange={(e) => set({ autoCorrect: e.target.checked })} /> Correct common typing mistakes as you type (AutoCorrect)
      </label>
      <h2>Display</h2>
      <label className="check-item">
        <input type="checkbox" checked={app.showFormulaBar} onChange={(e) => app.setShowFormulaBar(e.target.checked)} /> Show formula bar
      </label>
      <label className="check-item">
        <input type="checkbox" checked={doc.sheet.showZeros} onChange={(e) => { doc.sheet.showZeros = e.target.checked; doc.emit(); onChange() }} /> Show a zero in cells that have zero value
      </label>
      <label className="check-item">
        <input type="checkbox" checked={doc.sheet.showGrid} onChange={(e) => { doc.sheet.showGrid = e.target.checked; doc.emit(); onChange() }} /> Show gridlines
      </label>
      <label className="check-item">
        <input type="checkbox" checked={doc.sheet.showHeadings} onChange={(e) => { doc.sheet.showHeadings = e.target.checked; doc.emit(); onChange() }} /> Show row and column headers
      </label>
      <h2>Proofing</h2>
      <details>
        <summary>AutoCorrect list ({Object.keys(AUTOCORRECT).length} entries)</summary>
        <table className="ac-table">
          <tbody>
            {Object.entries(AUTOCORRECT).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}

function RecentList() {
  const app = useApp()
  const list = recentFiles()
  if (!list.length) return null
  return (
    <>
      <h2>Recent</h2>
      <div className="bs-recent">
        {list.map((f) => (
          <button key={f.id} type="button" className="bs-recent-item" onClick={() => app.openRecent(f.id, f.name)}>
            <strong>{f.name}</strong>
            <small>{new Date(f.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </button>
        ))}
      </div>
    </>
  )
}

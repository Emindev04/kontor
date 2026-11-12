import { useState } from 'react'
import { ArrowDownAZ, ArrowUpZA, ChevronDown, FilePlus, FolderOpen, Printer, Redo2, Save, ScanEye, Search, Undo2, type LucideIcon } from 'lucide-react'
import { APP_NAME } from '../brand'
import { Popup, cls, keepFocus, usePopover } from './ui'
import { useApp, useDocVersion } from './appContext'
import { quickSort } from '../commands/sort'
import { t, tx } from '../i18n'

/** Commands the Quick Access Toolbar can show (Customize Quick Access Toolbar). */
type QatId = 'autosave' | 'new' | 'open' | 'save' | 'undo' | 'redo' | 'quickPrint' | 'printPreview' | 'sortAsc' | 'sortDesc'
const QAT_ITEMS: [QatId, string][] = [
  ['autosave', tx('Automatically Save')], ['new', tx('New')], ['open', tx('Open')], ['save', tx('Save')], ['undo', tx('Undo')], ['redo', tx('Redo')],
  ['quickPrint', tx('Quick Print')], ['printPreview', tx('Print Preview and Print')], ['sortAsc', tx('Sort Ascending')], ['sortDesc', tx('Sort Descending')],
]
const QAT_KEY = 'kontor-sheets:qat'
const QAT_DEFAULT: QatId[] = ['autosave', 'save', 'undo', 'redo']

function loadQat(): QatId[] {
  try {
    const v = JSON.parse(localStorage.getItem(QAT_KEY) ?? 'null')
    return Array.isArray(v) ? v.filter((x) => QAT_ITEMS.some(([id]) => id === x)) : QAT_DEFAULT
  } catch {
    return QAT_DEFAULT
  }
}

/** The arrow next to Undo/Redo: pick how many actions to undo or redo at once. */
function HistoryMenu({ kind }: { kind: 'undo' | 'redo' }) {
  const app = useApp()
  const doc = app.doc
  const { open, setOpen, ref } = usePopover()
  const [upTo, setUpTo] = useState(0)
  const stack = kind === 'undo' ? doc.undoStack : doc.redoStack
  const labels = [...stack].reverse().map((e) => e.label)
  const run = (n: number) => {
    setOpen(false)
    for (let i = 0; i < n; i++) kind === 'undo' ? doc.undo() : doc.redo()
    app.focusGrid()
  }
  return (
    <div className="popover-anchor tb-history" ref={ref}>
      <button type="button" className="tb-btn tb-arrow" aria-haspopup="true" aria-label={kind === 'undo' ? t('Undo history') : t('Redo history')} disabled={!labels.length} onMouseDown={keepFocus} onClick={() => { setUpTo(0); setOpen(!open) }}>
        <ChevronDown size={11} />
      </button>
      {open && (
        <Popup anchor={ref} className="history-menu" role="menu">
          <div className="history-list">
            {labels.slice(0, 100).map((l, i) => (
              <button key={i} type="button" role="menuitem" className={cls('menu-item', i <= upTo && 'is-active')} onMouseEnter={() => setUpTo(i)} onFocus={() => setUpTo(i)} onMouseDown={keepFocus} onClick={() => run(i + 1)}>
                {t(l)}
              </button>
            ))}
          </div>
          <div className="history-foot">{kind === 'undo' ? (upTo ? t('Undo {n} Actions', { n: upTo + 1 }) : t('Undo 1 Action')) : upTo ? t('Redo {n} Actions', { n: upTo + 1 }) : t('Redo 1 Action')}</div>
        </Popup>
      )}
    </div>
  )
}

export function AppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#fff" />
      <path d="M8 9h16v14H8zM8 14h16M8 18.5h16M14 9v14M19.5 9v14" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

type Props = {
  autoSave: boolean
  setAutoSave: (on: boolean) => void
  status: string
  onSearch: (query: string) => void
  onPrintPreview: () => void
}

export function TitleBar({ autoSave, setAutoSave, status, onSearch, onPrintPreview }: Props) {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const [query, setQuery] = useState('')
  const [qat, setQat] = useState<QatId[]>(loadQat)
  const qatMenu = usePopover()
  const toggleQat = (id: QatId) => {
    const next = qat.includes(id) ? qat.filter((x) => x !== id) : QAT_ITEMS.map(([x]) => x).filter((x) => x === id || qat.includes(x))
    setQat(next)
    try {
      localStorage.setItem(QAT_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable
    }
  }
  const qatButton = (Icon: LucideIcon, title: string, label: string, onClick: () => void) => (
    <button type="button" className="tb-btn" title={title} aria-label={label} onMouseDown={keepFocus} onClick={onClick}>
      <Icon size={16} />
    </button>
  )
  const undoLabel = doc.undoStack[doc.undoStack.length - 1]?.label
  const redoLabel = doc.redoStack[doc.redoStack.length - 1]?.label
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <AppIcon />
        {qat.includes('autosave') && (
          <label className="autosave" title={t('Save automatically in this browser')}>
            <span>{t('AutoSave')}</span>
            <input type="checkbox" role="switch" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
            <span className="switch" aria-hidden="true" />
          </label>
        )}
        {qat.includes('new') && qatButton(FilePlus, t('New (Ctrl+Alt+N)'), t('New'), app.newBook)}
        {qat.includes('open') && qatButton(FolderOpen, t('Open (Ctrl+O)'), t('Open'), app.open)}
        {qat.includes('save') && qatButton(Save, t('Save as .xlsx (Ctrl+S)'), t('Save'), app.save)}
        {qat.includes('undo') && (
          <>
            <button type="button" className="tb-btn" title={undoLabel ? t('Undo {action} (Ctrl+Z)', { action: t(undoLabel) }) : t("Can't Undo")} aria-label={t('Undo')} disabled={!doc.canUndo} onMouseDown={keepFocus} onClick={() => { doc.undo(); app.focusGrid() }}>
              <Undo2 size={16} />
            </button>
            <HistoryMenu kind="undo" />
          </>
        )}
        {qat.includes('redo') && (
          <>
            <button type="button" className="tb-btn" title={redoLabel ? t('Redo {action} (Ctrl+Y)', { action: t(redoLabel) }) : t('Repeat (Ctrl+Y)')} aria-label={t('Redo')} disabled={!doc.canRedo} onMouseDown={keepFocus} onClick={() => { doc.redo(); app.focusGrid() }}>
              <Redo2 size={16} />
            </button>
            <HistoryMenu kind="redo" />
          </>
        )}
        {qat.includes('quickPrint') && qatButton(Printer, t('Quick Print'), t('Quick Print'), app.print)}
        {qat.includes('printPreview') && qatButton(ScanEye, t('Print Preview and Print (Ctrl+P)'), t('Print Preview and Print'), onPrintPreview)}
        {qat.includes('sortAsc') && qatButton(ArrowDownAZ, t('Sort Ascending'), t('Sort Ascending'), () => quickSort(doc, false))}
        {qat.includes('sortDesc') && qatButton(ArrowUpZA, t('Sort Descending'), t('Sort Descending'), () => quickSort(doc, true))}
        <div className="popover-anchor" ref={qatMenu.ref}>
          <button type="button" className="tb-btn tb-arrow" title={t('Customize Quick Access Toolbar')} aria-label={t('Customize Quick Access Toolbar')} aria-haspopup="true" onMouseDown={keepFocus} onClick={() => qatMenu.setOpen(!qatMenu.open)}>
            <ChevronDown size={12} />
          </button>
          {qatMenu.open && (
            <Popup anchor={qatMenu.ref} role="menu">
              <div className="menu-heading">{t('Customize Quick Access Toolbar')}</div>
              {QAT_ITEMS.map(([id, label]) => (
                <button key={id} type="button" role="menuitemcheckbox" aria-checked={qat.includes(id)} className="menu-item" onMouseDown={keepFocus} onClick={() => toggleQat(id)}>
                  <span className="menu-check">{qat.includes(id) ? '✓' : ''}</span>
                  <span className="menu-item-text">{t(label)}</span>
                </button>
              ))}
            </Popup>
          )}
        </div>
      </div>
      <div className="titlebar-center">
        <input
          className="doc-title"
          value={doc.title}
          aria-label={t('Workbook name')}
          onChange={(e) => {
            doc.title = e.target.value
            doc.modified = true
            doc.emit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
              app.focusGrid()
            }
          }}
        />
        {doc.grouped && <span className="doc-group">{t('[Group]')}</span>}
        <span className="doc-status">– {status}</span>
        <span className="app-name">– {APP_NAME}</span>
      </div>
      <div className="titlebar-right">
        <form
          className="tb-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            onSearch(query)
          }}
        >
          <Search size={14} />
          <input placeholder={t('Search')} aria-label={t('Search in the workbook')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
      </div>
    </header>
  )
}

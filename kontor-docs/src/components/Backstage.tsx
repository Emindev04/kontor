import { useEffect, useState } from 'react'
import { ArrowLeft, FileDown, FilePlus, FileText, FolderOpen, History, Home, Info, Pin, PinOff, Printer, Save, Settings } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { APP_NAME } from '../brand'
import { TEMPLATES } from '../templates'
import { documentStats } from '../editor/commands'
import { paperSize } from '../pageSetup'
import { cls } from './ui'
import { listDocuments, listVersions, removeDocument, setPinned, type VersionEntry } from '../library'
import { formatDate, formatNumber, t, tx } from '../i18n'
import { relativeDate } from './CommentsPane'
import type { AppApi } from './tabs/types'
import { parsePageRange, type PrintOptions } from '../io/print'

export type Section = 'home' | 'new' | 'open' | 'info' | 'save' | 'print' | 'export'
export type SaveFormat = 'docx' | 'odt' | 'rtf' | 'md' | 'html' | 'txt'

type Props = {
  title: string
  setTitle: (title: string) => void
  editor: Editor
  app: AppApi
  onClose: () => void
  onNew: (html: string) => void
  onOpen: () => void
  onSave: (format: SaveFormat) => void
  onPrint: (options?: PrintOptions) => void
  onOptions: () => void
  docId: string
  onOpenRecent: (id: string) => void
  onRestoreVersion: (data: unknown) => void
  initialSection?: Section
}

/** File › Print: copies, pages and collation; the printer is chosen in the system's print dialog. */
function PrintSection({ app, onPrint }: { app: AppApi; onPrint: (options?: PrintOptions) => void }) {
  const [copies, setCopies] = useState(1)
  const [which, setWhich] = useState<'all' | 'current' | 'custom'>('all')
  const [range, setRange] = useState('')
  const [only, setOnly] = useState<'all' | 'odd' | 'even'>('all')
  const [collate, setCollate] = useState(true)
  const invalid = which === 'custom' && (!range.trim() || !parsePageRange(range, app.pages)?.length)
  const print = () => onPrint({ copies, collate, only, range: which === 'all' ? '' : which === 'current' ? String(app.currentPage) : range })
  return (
    <>
      <h1>{t('Print')}</h1>
      <div className="bs-print-row">
        <button type="button" className="bs-primary" disabled={invalid} onClick={print}>
          <Printer size={16} /> {t('Print')}</button>
        <label className="bs-field bs-copies">
          {t('Copies:')}
          <input type="number" min={1} max={99} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
        </label>
      </div>
      <h2>{t('Settings')}</h2>
      <label className="bs-field">
        {t('Pages to print')}
        <select value={which} onChange={(e) => setWhich(e.target.value as typeof which)}>
          <option value="all">{t('Print All Pages')}</option>
          <option value="current">{t('Print Current Page')}</option>
          <option value="custom">{t('Custom Print')}</option>
        </select>
      </label>
      {which === 'custom' && (
        <label className="bs-field">
          {t('Pages:')}
          <input value={range} placeholder="1-3, 5" aria-invalid={invalid} onChange={(e) => setRange(e.target.value)} />
        </label>
      )}
      <label className="bs-field">
        {t('Print on')}
        <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
          <option value="all">{t('All pages')}</option>
          <option value="odd">{t('Only Odd Pages')}</option>
          <option value="even">{t('Only Even Pages')}</option>
        </select>
      </label>
      <label className="bs-field">
        {t('Collation')}
        <select value={collate ? 'yes' : 'no'} onChange={(e) => setCollate(e.target.value === 'yes')}>
          <option value="yes">{t('Collated: 1,2,3 1,2,3 1,2,3')}</option>
          <option value="no">{t('Uncollated: 1,1,1 2,2,2 3,3,3')}</option>
        </select>
      </label>
      <p className="bs-hint">
        {t('The printer, paper tray and two-sided printing are chosen in the system print dialog. Paper size, orientation and margins come from the Layout tab ({paper}, {orientation}); the pages print exactly as they appear on screen.', { paper: t(paperSize(app.setup).label), orientation: app.setup.orientation === 'landscape' ? t('Landscape') : t('Portrait') })}
      </p>
    </>
  )
}

/** File › Info › Version History: earlier states of this document kept on this device. */
function VersionHistory({ docId, onRestore }: { docId: string; onRestore: (data: unknown) => void }) {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  useEffect(() => {
    let live = true
    void listVersions(docId).then((v) => live && setVersions(v))
    return () => {
      live = false
    }
  }, [docId])
  return (
    <div>
      <h2>
        <History size={16} /> {t('Version History')}
      </h2>
      <p className="bs-hint">{t('A version is kept on every save and, while you work, every ten minutes. The newest 20 versions stay on this device.')}</p>
      {versions == null ? null : versions.length === 0 ? (
        <p className="bs-hint">{t('No earlier versions yet.')}</p>
      ) : (
        <div className="bs-recent-list">
          {versions.map((v) => (
            <div key={v.date} className="bs-recent-row">
              <span className="bs-recent">
                <FileText size={20} strokeWidth={1.4} />
                <span>
                  <strong>{formatDate(new Date(v.date), { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                  <small>{t('{n} words', { n: v.words })}</small>
                </span>
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (confirm(t('Restore this version? The current state is kept as a version first.'))) onRestore(v.data)
                }}
              >
                {t('Restore')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Documents kept in this browser, newest first (the open one marked). */
function RecentList({ current, title, onOpen, onClose }: { current: string; title: string; onOpen: (id: string) => void; onClose: () => void }) {
  const [, refresh] = useState(0)
  const docs = listDocuments()
  if (!docs.some((d) => d.id === current)) docs.unshift({ id: current, title, modified: new Date().toISOString() })
  return (
    <div className="bs-recent-list">
      {docs.map((d) => (
        <div key={d.id} className="bs-recent-row">
          <button type="button" className="bs-recent" onClick={() => (d.id === current ? onClose() : onOpen(d.id))}>
            <FileText size={20} strokeWidth={1.4} />
            <span>
              <strong>
                {d.pinned && <Pin size={12} aria-label={t('Pinned')} />} {d.id === current ? title : d.title}
              </strong>
              <small>
                {d.id === current ? t('Open now · ') : ''}
                {relativeDate(d.modified)}
                {d.words != null ? ' · ' + t('{n} words', { n: formatNumber(d.words) }) : ''}
              </small>
            </span>
          </button>
          <button
            type="button"
            className={cls('bs-recent-remove', d.pinned && 'is-pinned')}
            title={d.pinned ? t('Unpin from list') : t('Pin to list')}
            aria-label={d.pinned ? t('Unpin from list') : t('Pin to list')}
            aria-pressed={!!d.pinned}
            onClick={() => {
              setPinned(d.id === current ? { ...d, title } : d, !d.pinned)
              refresh((n) => n + 1)
            }}
          >
            {d.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          {d.id !== current && (
            <button
              type="button"
              className="bs-recent-remove"
              title={t('Remove from list (deletes the copy kept in this browser)')}
              aria-label={t('Remove {title} from the list', { title: d.title })}
              onClick={() => {
                if (confirm(t('Remove “{title}” from this browser?', { title: d.title }))) {
                  removeDocument(d.id)
                  refresh((n) => n + 1)
                }
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening')
}

function Templates({ onNew }: { onNew: (html: string) => void }) {
  return (
    <div className="templates">
      {TEMPLATES.map((tpl) => (
        <button key={tpl.id} type="button" className="template" onClick={() => onNew(tpl.html)}>
          <span className={`template-thumb thumb-${tpl.id}`}>
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>{t(tpl.label)}</span>
        </button>
      ))}
    </div>
  )
}

const FORMATS: { id: SaveFormat; label: string; detail: string }[] = [
  { id: 'docx', label: tx('DOCX Document (*.docx)'), detail: tx('Opens in most word processors') },
  { id: 'odt', label: tx('OpenDocument Text (*.odt)'), detail: tx('For office suites that use the OpenDocument format') },
  { id: 'rtf', label: tx('Rich Text Format (*.rtf)'), detail: tx('Basic formatting, opens almost everywhere') },
  { id: 'md', label: tx('Markdown (*.md)'), detail: tx('Plain text with headings, lists, emphasis and links') },
  { id: 'html', label: tx('Web Page (*.html)'), detail: tx('For browsers and websites') },
  { id: 'txt', label: tx('Plain Text (*.txt)'), detail: tx('Text only, no formatting') },
]

export function Backstage({ title, setTitle, editor, app, onClose, onNew, onOpen, onSave, onPrint, onOptions, docId, onOpenRecent, onRestoreVersion, initialSection = 'home' }: Props) {
  const [section, setSection] = useState<Section>(initialSection)
  const [format, setFormat] = useState<SaveFormat>('docx')
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
  ]
  const stats = section === 'info' ? documentStats(editor, app.pages) : null

  return (
    <div className="backstage" role="dialog" aria-label={t('File')}>
      <aside className="bs-nav">
        <button type="button" className="bs-back" aria-label={t('Back to document')} onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        {nav.map((n) => (
          <button key={n.id} type="button" className={cls('bs-item', section === n.id && 'is-active')} onClick={() => setSection(n.id)}>
            <n.icon size={18} strokeWidth={1.6} />
            {n.label}
          </button>
        ))}
        <span className="spacer" />
        <button type="button" className="bs-item" onClick={onOptions}>
          <Settings size={18} strokeWidth={1.6} />
          {t('Options')}</button>
      </aside>
      <main className="bs-main">
        {section === 'home' && (
          <>
            <h1>{greeting()}</h1>
            <h2>{t('New')}</h2>
            <Templates onNew={onNew} />
            <h2>{t('Recent')}</h2>
            <RecentList current={docId} title={title} onOpen={onOpenRecent} onClose={onClose} />
          </>
        )}
        {section === 'new' && (
          <>
            <h1>{t('New')}</h1>
            <Templates onNew={onNew} />
          </>
        )}
        {section === 'open' && (
          <>
            <h1>{t('Open')}</h1>
            <button type="button" className="bs-action" onClick={onOpen}>
              <FolderOpen size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Browse')}</strong>
                <small>{t('Open a .docx, .doc, .odt, .rtf, .md, .html or .txt file from this device')}</small>
              </span>
            </button>
            <h2>{t('Recent documents in this browser')}</h2>
            <RecentList current={docId} title={title} onOpen={onOpenRecent} onClose={onClose} />
          </>
        )}
        {section === 'info' && stats && (
          <>
            <h1>{t('Info')}</h1>
            <div className="bs-info">
              <div>
                <h2>{t('Properties')}</h2>
                <dl className="bs-props">
                  <dt>{t('Title')}</dt>
                  <dd>{title}</dd>
                  <dt>{t('Pages')}</dt>
                  <dd>{stats.pages}</dd>
                  <dt>{t('Words')}</dt>
                  <dd>{formatNumber(stats.words)}</dd>
                  <dt>{t('Characters')}</dt>
                  <dd>{formatNumber(stats.characters)}</dd>
                  <dt>{t('Paragraphs')}</dt>
                  <dd>{formatNumber(stats.paragraphs)}</dd>
                  <dt>{t('Paper')}</dt>
                  <dd>
                    {t(paperSize(app.setup).label)}, {app.setup.orientation === 'landscape' ? t('Landscape') : t('Portrait')}
                  </dd>
                  <dt>{t('Application')}</dt>
                  <dd>{APP_NAME}</dd>
                </dl>
              </div>
              <div>
                <h2>{t('Inspect Document')}</h2>
                <p className="bs-hint">{t('Check the document for accessibility issues before you share it.')}</p>
                <button
                  type="button"
                  className="bs-primary"
                  onClick={() => {
                    onClose()
                    app.openDialog('accessibility')
                  }}
                >
                  {t('Check Accessibility')}</button>
                <VersionHistory docId={docId} onRestore={onRestoreVersion} />
              </div>
            </div>
          </>
        )}
        {section === 'save' && (
          <>
            <h1>{t('Save As')}</h1>
            <label className="bs-field">
              {t('File name')}<input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="bs-field">
              {t('Save as type')}<select value={format} onChange={(e) => setFormat(e.target.value as SaveFormat)}>
                {FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {t(f.label)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="bs-primary" onClick={() => onSave(format)}>
              <Save size={16} /> {t('Save')}</button>
            <p className="bs-hint">{t('The file is downloaded to your device. Your work is also saved automatically in this browser.')}</p>
          </>
        )}
        {section === 'print' && <PrintSection app={app} onPrint={onPrint} />}
        {section === 'export' && (
          <>
            <h1>{t('Export')}</h1>
            <button type="button" className="bs-action" onClick={() => onPrint()}>
              <FileDown size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Create PDF Document')}</strong>
                <small>{t('Choose “Save as PDF” in the print dialog')}</small>
              </span>
            </button>
            {FORMATS.map((f) => (
              <button key={f.id} type="button" className="bs-action" onClick={() => onSave(f.id)}>
                <Save size={28} strokeWidth={1.4} />
                <span>
                  <strong>{t(f.label)}</strong>
                  <small>{t(f.detail)}</small>
                </span>
              </button>
            ))}
          </>
        )}
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ArrowLeft, FileDown, FilePlus, FileText, FolderOpen, Home, Info, Printer, Save, Settings } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { APP_NAME } from '../brand'
import { TEMPLATES } from '../templates'
import { documentStats } from '../editor/commands'
import { paperSize } from '../pageSetup'
import { cls } from './ui'
import { listDocuments, removeDocument } from '../library'
import { relativeDate } from './CommentsPane'
import type { AppApi } from './tabs/types'

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
  onPrint: () => void
  onOptions: () => void
  docId: string
  onOpenRecent: (id: string) => void
  initialSection?: Section
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
              <strong>{d.id === current ? title : d.title}</strong>
              <small>
                {d.id === current ? 'Open now · ' : ''}
                {relativeDate(d.modified)}
                {d.words != null ? ` · ${d.words.toLocaleString('en-US')} words` : ''}
              </small>
            </span>
          </button>
          {d.id !== current && (
            <button
              type="button"
              className="bs-recent-remove"
              title="Remove from list (deletes the copy kept in this browser)"
              aria-label={`Remove ${d.title} from the list`}
              onClick={() => {
                if (confirm(`Remove “${d.title}” from this browser?`)) {
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
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Templates({ onNew }: { onNew: (html: string) => void }) {
  return (
    <div className="templates">
      {TEMPLATES.map((t) => (
        <button key={t.id} type="button" className="template" onClick={() => onNew(t.html)}>
          <span className={`template-thumb thumb-${t.id}`}>
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

const FORMATS: { id: SaveFormat; label: string; detail: string }[] = [
  { id: 'docx', label: 'Word Document (*.docx)', detail: 'Opens in most word processors' },
  { id: 'odt', label: 'OpenDocument Text (*.odt)', detail: 'For office suites that use the OpenDocument format' },
  { id: 'rtf', label: 'Rich Text Format (*.rtf)', detail: 'Basic formatting, opens almost everywhere' },
  { id: 'md', label: 'Markdown (*.md)', detail: 'Plain text with headings, lists, emphasis and links' },
  { id: 'html', label: 'Web Page (*.html)', detail: 'For browsers and websites' },
  { id: 'txt', label: 'Plain Text (*.txt)', detail: 'Text only, no formatting' },
]

export function Backstage({ title, setTitle, editor, app, onClose, onNew, onOpen, onSave, onPrint, onOptions, docId, onOpenRecent, initialSection = 'home' }: Props) {
  const [section, setSection] = useState<Section>(initialSection)
  const [format, setFormat] = useState<SaveFormat>('docx')
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
  ]
  const stats = section === 'info' ? documentStats(editor, app.pages) : null

  return (
    <div className="backstage" role="dialog" aria-label="File">
      <aside className="bs-nav">
        <button type="button" className="bs-back" aria-label="Back to document" onClick={onClose}>
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
          Options
        </button>
      </aside>
      <main className="bs-main">
        {section === 'home' && (
          <>
            <h1>{greeting()}</h1>
            <h2>New</h2>
            <Templates onNew={onNew} />
            <h2>Recent</h2>
            <RecentList current={docId} title={title} onOpen={onOpenRecent} onClose={onClose} />
          </>
        )}
        {section === 'new' && (
          <>
            <h1>New</h1>
            <Templates onNew={onNew} />
          </>
        )}
        {section === 'open' && (
          <>
            <h1>Open</h1>
            <button type="button" className="bs-action" onClick={onOpen}>
              <FolderOpen size={28} strokeWidth={1.4} />
              <span>
                <strong>Browse</strong>
                <small>Open a .docx, .odt, .md, .html or .txt file from this device</small>
              </span>
            </button>
            <h2>Recent documents in this browser</h2>
            <RecentList current={docId} title={title} onOpen={onOpenRecent} onClose={onClose} />
          </>
        )}
        {section === 'info' && stats && (
          <>
            <h1>Info</h1>
            <div className="bs-info">
              <div>
                <h2>Properties</h2>
                <dl className="bs-props">
                  <dt>Title</dt>
                  <dd>{title}</dd>
                  <dt>Pages</dt>
                  <dd>{stats.pages}</dd>
                  <dt>Words</dt>
                  <dd>{stats.words.toLocaleString('en-US')}</dd>
                  <dt>Characters</dt>
                  <dd>{stats.characters.toLocaleString('en-US')}</dd>
                  <dt>Paragraphs</dt>
                  <dd>{stats.paragraphs.toLocaleString('en-US')}</dd>
                  <dt>Paper</dt>
                  <dd>
                    {paperSize(app.setup).label}, {app.setup.orientation}
                  </dd>
                  <dt>Application</dt>
                  <dd>{APP_NAME}</dd>
                </dl>
              </div>
              <div>
                <h2>Inspect Document</h2>
                <p className="bs-hint">Check the document for accessibility issues before you share it.</p>
                <button
                  type="button"
                  className="bs-primary"
                  onClick={() => {
                    onClose()
                    app.openDialog('accessibility')
                  }}
                >
                  Check Accessibility
                </button>
              </div>
            </div>
          </>
        )}
        {section === 'save' && (
          <>
            <h1>Save As</h1>
            <label className="bs-field">
              File name
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="bs-field">
              Save as type
              <select value={format} onChange={(e) => setFormat(e.target.value as SaveFormat)}>
                {FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="bs-primary" onClick={() => onSave(format)}>
              <Save size={16} /> Save
            </button>
            <p className="bs-hint">The file is downloaded to your device. Your work is also saved automatically in this browser.</p>
          </>
        )}
        {section === 'print' && (
          <>
            <h1>Print</h1>
            <button type="button" className="bs-primary" onClick={onPrint}>
              <Printer size={16} /> Print
            </button>
            <p className="bs-hint">
              Opens the browser's print dialog. Paper size, orientation and margins come from the Layout tab ({paperSize(app.setup).label}, {app.setup.orientation}), and the pages
              print exactly as they appear on screen, {app.pages} {app.pages === 1 ? 'page' : 'pages'}.
            </p>
          </>
        )}
        {section === 'export' && (
          <>
            <h1>Export</h1>
            <button type="button" className="bs-action" onClick={onPrint}>
              <FileDown size={28} strokeWidth={1.4} />
              <span>
                <strong>Create PDF Document</strong>
                <small>Choose “Save as PDF” in the print dialog</small>
              </span>
            </button>
            {FORMATS.map((f) => (
              <button key={f.id} type="button" className="bs-action" onClick={() => onSave(f.id)}>
                <Save size={28} strokeWidth={1.4} />
                <span>
                  <strong>{f.label}</strong>
                  <small>{f.detail}</small>
                </span>
              </button>
            ))}
          </>
        )}
      </main>
    </div>
  )
}

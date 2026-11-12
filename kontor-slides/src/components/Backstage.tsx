import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileDown, FileImage, FilePlus, FolderOpen, Home, Info, Printer, Save, X, FileText, Film, Images, User, Settings, Trash2, Presentation as PresentationIcon } from 'lucide-react'
import type { Presentation } from '../model/types'
import { createPresentation, SIZE_16_9 } from '../model/factory'
import { THEMES } from '../model/themes'
import { docFromText } from '../model/richtext'
import { SlideView, presProps } from '../render/SlideView'
import { commit, useStore, store } from '../store/store'
import { cls } from './ui'
import { downloadBlob, listRecent, removeRecent, safeFilename, type RecentEntry } from '../io/storage'
import { initialsOf, setOptions, useOptions } from '../io/options'
import { APP_NAME, SUITE_NAME } from '../brand'
import { SAVE_KINDS, type SaveKind } from '../io/formats'
import { t, tx, formatDate, formatNumber } from '../i18n'

type Section = 'home' | 'new' | 'open' | 'info' | 'save' | 'print' | 'export' | 'account'

export type PrintSettings = { range: 'all' | 'current' | 'selection'; layout: 'full' | 'notes' | 'handout3' | 'handout6' | 'outline'; frame: boolean }

type Props = {
  onClose: () => void
  onNew: (pres: Presentation) => void
  onOpen: () => void
  onSave: (kind?: SaveKind) => void
  onPrint: (settings: PrintSettings) => void
  onExportText: () => void
  onExportFile: (kind: 'pdf' | 'png' | 'jpeg', scope: 'current' | 'all') => Promise<void>
  onCloseDoc: () => void
  onOpenRecent: (id: string) => void
  onOptions: () => void
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening')
}

function sampleFor(themeId: string): Presentation {
  const p = createPresentation(themeId, 0, SIZE_16_9)
  const s = p.slides[0]
  s.elements = s.elements.map((e) => (e.type === 'shape' && e.placeholder?.style === 'ctrTitle' ? { ...e, text: { ...e.text!, doc: docFromText(themeId === 'kontor' ? t('Blank Presentation') : THEMES.find((th) => th.id === themeId)!.name) } } : e))
  return p
}

function Templates({ onNew }: { onNew: (pres: Presentation) => void }) {
  const samples = useMemo(() => THEMES.map((t) => ({ theme: t, pres: sampleFor(t.id) })), [])
  const scale = 200 / 1280
  return (
    <div className="templates">
      {samples.map(({ theme, pres }) => (
        <button key={theme.id} type="button" className="template" onClick={() => onNew(createPresentation(theme.id))}>
          <span className="template-thumb" style={{ width: 200, height: 112.5 }}>
            <SlideView slide={pres.slides[0]} index={0} {...presProps(pres)} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
          </span>
          <span>{theme.id === 'kontor' ? t('Blank Presentation') : theme.name}</span>
        </button>
      ))}
    </div>
  )
}

export function Backstage({ onClose, onNew, onOpen, onSave, onPrint, onExportText, onExportFile, onCloseDoc, onOpenRecent, onOptions }: Props) {
  const [section, setSection] = useState<Section>('home')
  const title = useStore((s) => s.title)
  const pres = useStore((s) => s.pres)
  const [print, setPrint] = useState<PrintSettings>({ range: 'all', layout: 'full', frame: false })
  const [scope, setScope] = useState<'current' | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [saveKind, setSaveKind] = useState<SaveKind>('pptx')
  const run = async (kind: 'pdf' | 'png' | 'jpeg') => {
    setBusy(kind)
    try {
      await onExportFile(kind, scope)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('The export failed.'))
    } finally {
      setBusy(null)
    }
  }
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
  const words = pres.slides.reduce((n, s) => n + s.elements.reduce((m, e) => m + (e.type === 'shape' && e.text ? e.text.doc.content.flatMap((p) => p.content ?? []).map((i) => (i.type === 'text' ? i.text : '')).join(' ').split(/\s+/).filter(Boolean).length : 0), 0), 0)

  return (
    <div className="backstage" role="dialog" aria-label={t('File')}>
      <aside className="bs-nav">
        <button type="button" className="bs-back" aria-label={t('Back to presentation')} onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        {nav.map((n) => (
          <button key={n.id} type="button" className={cls('bs-item', section === n.id && 'is-active')} onClick={() => setSection(n.id)}>
            <n.icon size={18} strokeWidth={1.6} />
            {n.label}
          </button>
        ))}
        <span className="spacer" />
        <button type="button" className="bs-item" onClick={onCloseDoc}>
          <X size={18} strokeWidth={1.6} /> {t('Close')}
        </button>
        <button type="button" className={cls('bs-item', section === 'account' && 'is-active')} onClick={() => setSection('account')}>
          <User size={18} strokeWidth={1.6} /> {t('Account')}
        </button>
        <button type="button" className="bs-item" onClick={onOptions}>
          <Settings size={18} strokeWidth={1.6} /> {t('Options')}
        </button>
      </aside>
      <main className="bs-main">
        {section === 'home' && (
          <>
            <h1>{greeting()}</h1>
            <h2>{t('New')}</h2>
            <Templates onNew={onNew} />
            <h2>{t('Recent')}</h2>
            <RecentList onOpenRecent={onOpenRecent} />
            <p className="bs-hint">{t('Presentations are saved automatically in this browser. Use Open to load a .pptx file and Save As to download one.')}</p>
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
                <small>{t('Open a presentation (.pptx, .ppsx, .potx, .odp) from this device')}</small>
              </span>
            </button>
            <h2>{t('Recent')}</h2>
            <RecentList onOpenRecent={onOpenRecent} />
          </>
        )}
        {section === 'account' && <AccountPage onOptions={onOptions} />}
        {section === 'info' && (
          <>
            <h1>{t('Info')}</h1>
            <dl className="bs-props">
              <dt>{t('Title')}</dt>
              <dd>
                <input value={title} aria-label={t('Title')} onChange={(e) => store.set({ title: e.target.value })} />
              </dd>
              <dt>{t('Author')}</dt>
              <dd>
                <input value={pres.author ?? ''} aria-label={t('Author')} placeholder={t('Add an author')} onChange={(e) => store.set((s) => ({ pres: { ...s.pres, author: e.target.value }, revision: s.revision + 1 }))} />
              </dd>
              <dt>{t('Slides')}</dt>
              <dd>{pres.slides.length}</dd>
              <dt>{t('Hidden slides')}</dt>
              <dd>{pres.slides.filter((s) => s.hidden).length}</dd>
              <dt>{t('Words')}</dt>
              <dd>{formatNumber(words)}</dd>
              <dt>{t('Slide size')}</dt>
              <dd>
                {t('{w} × {h} in', { w: formatNumber(pres.size.w / 96, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), h: formatNumber(pres.size.h / 96, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })} ({pres.size.name === 'custom' ? t('Custom') : pres.size.name})
              </dd>
            </dl>
            <InspectPresentation />
          </>
        )}
        {section === 'save' && (
          <>
            <h1>{t('Save As')}</h1>
            <label className="bs-field">
              {t('File name')}
              <input value={title} onChange={(e) => store.set({ title: e.target.value })} />
            </label>
            <label className="bs-field">
              {t('Save as type')}
              <select value={saveKind} onChange={(e) => setSaveKind(e.target.value as SaveKind)}>
                {SAVE_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {t(k.label)}
                  </option>
                ))}
              </select>
            </label>
            <p className="bs-hint">{t(SAVE_KINDS.find((k) => k.kind === saveKind)!.hint)}</p>
            <button type="button" className="bs-primary" onClick={() => onSave(saveKind)}>
              {t('Save')}
            </button>
          </>
        )}
        {section === 'print' && (
          <>
            <h1>{t('Print')}</h1>
            <div className="bs-print">
              <label className="bs-field">
                {t('Slides')}
                <select value={print.range} onChange={(e) => setPrint({ ...print, range: e.target.value as PrintSettings['range'] })}>
                  <option value="all">{t('Print All Slides')}</option>
                  <option value="selection">{t('Print Selection')}</option>
                  <option value="current">{t('Print Current Slide')}</option>
                </select>
              </label>
              <label className="bs-field">
                {t('Layout')}
                <select value={print.layout} onChange={(e) => setPrint({ ...print, layout: e.target.value as PrintSettings['layout'] })}>
                  <option value="full">{t('Full Page Slides')}</option>
                  <option value="notes">{t('Notes Pages')}</option>
                  <option value="outline">{t('Outline')}</option>
                  <option value="handout3">{t('Handouts: 3 Slides')}</option>
                  <option value="handout6">{t('Handouts: 6 Slides Horizontal')}</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={print.frame} onChange={(e) => setPrint({ ...print, frame: e.target.checked })} /> {t('Frame Slides')}
              </label>
              <button type="button" className="bs-primary" onClick={() => onPrint(print)}>
                <Printer size={16} /> {t('Print')}
              </button>
              <p className="bs-hint">{t('Opens the browser\'s print dialog. Choose "Save as PDF" there to create a PDF file.')}</p>
            </div>
          </>
        )}
        {section === 'export' && (
          <>
            <h1>{t('Export')}</h1>
            <button type="button" className="bs-action" onClick={() => onPrint({ range: 'all', layout: 'full', frame: false })}>
              <FileDown size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Create PDF Document')}</strong>
                <small>{t('Choose "Save as PDF" in the print dialog')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" disabled={!!busy} onClick={() => run('pdf')}>
              <FileDown size={28} strokeWidth={1.4} />
              <span>
                <strong>{busy === 'pdf' ? t('Creating PDF…') : t('Download PDF')}</strong>
                <small>{t('One page per slide (hidden slides left out), created right here')}</small>
              </span>
            </button>
            <VideoExport />
            <h2>{t('Change File Type')}</h2>
            <div className="bs-scope" role="radiogroup" aria-label={t('Slides to export')}>
              <label className="check">
                <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} /> {t('All slides (.zip)')}
              </label>
              <label className="check">
                <input type="radio" name="scope" checked={scope === 'current'} onChange={() => setScope('current')} /> {t('Just this slide')}
              </label>
            </div>
            <button type="button" className="bs-action" disabled={!!busy} onClick={() => run('png')}>
              <FileImage size={28} strokeWidth={1.4} />
              <span>
                <strong>{busy === 'png' ? t('Creating pictures…') : t('PNG Portable Network Graphics')}</strong>
                <small>{t('High-quality pictures of the slides (1920 × 1080 for widescreen)')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" disabled={!!busy} onClick={() => run('jpeg')}>
              <FileImage size={28} strokeWidth={1.4} />
              <span>
                <strong>{busy === 'jpeg' ? t('Creating pictures…') : t('JPEG File Interchange Format')}</strong>
                <small>{t('Smaller pictures for the web and e-mail')}</small>
              </span>
            </button>
            {SAVE_KINDS.map((k) => (
              <button key={k.kind} type="button" className="bs-action" onClick={() => onSave(k.kind)}>
                <Save size={28} strokeWidth={1.4} />
                <span>
                  <strong>{t(k.label)}</strong>
                  <small>{t(k.hint)}</small>
                </span>
              </button>
            ))}
            <button type="button" className="bs-action" onClick={onExportText}>
              <FileText size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Outline as Text (.txt)')}</strong>
                <small>{t('Slide titles, text and notes as plain text')}</small>
              </span>
            </button>
          </>
        )}
      </main>
    </div>
  )
}

const QUALITIES = [
  { label: tx('Full HD (1080p)'), width: 1920 },
  { label: tx('HD (720p)'), width: 1280 },
  { label: tx('Standard (480p)'), width: 852 },
]

/** Export > Create a Video / Animated GIF, with quality, seconds per slide and recorded timings. */
function VideoExport() {
  const [quality, setQuality] = useState(1280)
  const [seconds, setSeconds] = useState(5)
  const [timings, setTimings] = useState(true)
  const [job, setJob] = useState<{ kind: 'video' | 'gif'; progress: number; abort: AbortController } | null>(null)
  const start = async (kind: 'video' | 'gif') => {
    const abort = new AbortController()
    setJob({ kind, progress: 0, abort })
    const s = store.get()
    const onProgress = (progress: number) => setJob((j) => (j ? { ...j, progress } : j))
    try {
      const io = await import('../io/video')
      const name = safeFilename(s.title)
      if (kind === 'video') {
        const { blob, ext } = await io.slidesVideo(s.pres, { width: quality, secondsPerSlide: seconds, useTimings: timings, onProgress, signal: abort.signal })
        downloadBlob(blob, `${name}.${ext}`)
      } else downloadBlob(await io.slidesGif(s.pres, { width: Math.min(quality, 960), secondsPerSlide: seconds, onProgress, signal: abort.signal }), `${name}.gif`)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) window.alert(err instanceof Error ? err.message : t('The export failed.'))
    } finally {
      setJob(null)
    }
  }
  return (
    <>
      <h2>{t('Create a Video')}</h2>
      <div className="bs-video">
        <label className="bs-field">
          {t('Quality')}
          <select value={quality} onChange={(e) => setQuality(Number(e.target.value))} disabled={!!job}>
            {QUALITIES.map((q) => (
              <option key={q.width} value={q.width}>
                {t(q.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="bs-field">
          {t('Seconds spent on each slide')}
          <input type="number" min={1} max={600} step={0.5} value={seconds} disabled={!!job} onChange={(e) => setSeconds(Math.max(1, Number(e.target.value) || 5))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={timings} disabled={!!job} onChange={(e) => setTimings(e.target.checked)} /> {t('Use recorded timings and transitions')}
        </label>
        {job ? (
          <div className="bs-progress">
            <progress max={1} value={job.progress} /> {job.kind === 'video' ? t('Recording the video') : t('Creating the GIF')}… {Math.round(job.progress * 100)}%
            <button type="button" className="bs-secondary" onClick={() => job.abort.abort()}>
              {t('Cancel')}
            </button>
          </div>
        ) : (
          <div className="bs-row">
            <button type="button" className="bs-action" onClick={() => start('video')}>
              <Film size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Create Video')}</strong>
                <small>{t('Records the slides with their transitions in real time (animations show their end state)')}</small>
              </span>
            </button>
            <button type="button" className="bs-action" onClick={() => start('gif')}>
              <Images size={28} strokeWidth={1.4} />
              <span>
                <strong>{t('Create an Animated GIF')}</strong>
                <small>{t('A looping picture of all slides, for chats and web pages')}</small>
              </span>
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/** Recently opened or saved presentations (copies are kept in this browser). */
function RecentList({ onOpenRecent }: { onOpenRecent: (id: string) => void }) {
  const [items, setItems] = useState<RecentEntry[]>(listRecent)
  useEffect(() => {
    const refresh = () => setItems(listRecent())
    window.addEventListener('kontor:recent', refresh)
    return () => window.removeEventListener('kontor:recent', refresh)
  }, [])
  if (!items.length) return <p className="bs-hint">{t('Presentations you open or save appear here.')}</p>
  return (
    <ul className="bs-recent">
      {items.map((r) => (
        <li key={r.id}>
          <button type="button" className="bs-recent-item" onClick={() => onOpenRecent(r.id)}>
            <PresentationIcon size={22} strokeWidth={1.4} />
            <span>
              <strong>{r.title}</strong>
              <small>
                {r.slides === 1 ? t('1 slide') : t('{n} slides', { n: r.slides })} · {formatDate(new Date(r.openedAt), { dateStyle: 'medium', timeStyle: 'short' })}
              </small>
            </span>
          </button>
          <button type="button" className="bs-recent-remove" title={t('Remove from list')} aria-label={t('Remove {name} from the list', { name: r.title })} onClick={() => removeRecent(r.id)}>
            <Trash2 size={14} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function AccountPage({ onOptions }: { onOptions: () => void }) {
  const opts = useOptions()
  return (
    <>
      <h1>{t('Account')}</h1>
      <div className="bs-account">
        <span className="bs-avatar" aria-hidden="true">
          {opts.initials || initialsOf(opts.userName) || '?'}
        </span>
        <div className="bs-video">
          <label className="bs-field">
            {t('Your name (shown on comments)')}
            <input value={opts.userName} onChange={(e) => setOptions({ userName: e.target.value })} />
          </label>
          <label className="bs-field">
            {t('Initials')}
            <input value={opts.initials} maxLength={4} placeholder={initialsOf(opts.userName)} onChange={(e) => setOptions({ initials: e.target.value })} />
          </label>
          <label className="bs-field">
            {t('App theme')}
            <select value={opts.officeTheme} onChange={(e) => setOptions({ officeTheme: e.target.value as typeof opts.officeTheme })}>
              <option value="colorful">{t('Colorful')}</option>
              <option value="white">{t('White')}</option>
              <option value="dark">{t('Dark Gray')}</option>
            </select>
          </label>
        </div>
      </div>
      <h2>{t('Product Information')}</h2>
      <p className="bs-hint">
        <strong>{APP_NAME}</strong> — {t('part of the {suite} suite. Free and open source; everything runs in this browser and no account is needed.', { suite: SUITE_NAME })}
      </p>
      <button type="button" className="bs-secondary" onClick={onOptions}>
        {t('Options…')}
      </button>
    </>
  )
}

/** Info > Check for Issues > Inspect Presentation: find and remove hidden or personal content. */
function InspectPresentation() {
  const pres = useStore((s) => s.pres)
  const comments = pres.slides.reduce((n, sl) => n + (sl.comments?.length ?? 0), 0)
  const notes = pres.slides.filter((sl) => sl.notes.trim()).length
  const hidden = pres.slides.filter((sl) => sl.hidden).length
  const off = pres.slides.reduce((n, sl) => n + sl.elements.filter((e) => e.x + e.w < 0 || e.y + e.h < 0 || e.x > pres.size.w || e.y > pres.size.h).length, 0)
  const remove = (fn: (p: Presentation) => Presentation) => commit(fn)
  const rows: { label: string; found: string | null; run: () => void }[] = [
    { label: t('Comments'), found: comments ? t('{n} comment(s)', { n: comments }) : null, run: () => remove((p) => ({ ...p, slides: p.slides.map((sl) => ({ ...sl, comments: [] })) })) },
    { label: t('Presentation notes'), found: notes ? t('{n} slide(s) with notes', { n: notes }) : null, run: () => remove((p) => ({ ...p, slides: p.slides.map((sl) => ({ ...sl, notes: '' })) })) },
    { label: t('Hidden slides'), found: hidden ? t('{n} hidden slide(s)', { n: hidden }) : null, run: () => remove((p) => ({ ...p, slides: p.slides.filter((sl) => !sl.hidden) })) },
    {
      label: t('Off-slide content'),
      found: off ? t('{n} object(s) outside the slides', { n: off }) : null,
      run: () => remove((p) => ({ ...p, slides: p.slides.map((sl) => ({ ...sl, elements: sl.elements.filter((e) => !(e.x + e.w < 0 || e.y + e.h < 0 || e.x > p.size.w || e.y > p.size.h)) })) })),
    },
    { label: t('Document properties and personal information'), found: pres.author ? t('Author: {name}', { name: pres.author }) : null, run: () => remove((p) => ({ ...p, author: '' })) },
  ]
  return (
    <>
      <h2>{t('Inspect Presentation')}</h2>
      <p className="bs-hint">{t('Before sharing, check the presentation for hidden properties or personal information.')}</p>
      <ul className="bs-inspect">
        {rows.map((r) => (
          <li key={r.label}>
            <span>
              <strong>{r.label}</strong>
              <small>{r.found ?? t('None found')}</small>
            </span>
            {r.found && (
              <button type="button" className="bs-secondary" onClick={r.run}>
                {t('Remove All')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

import { useDeferredValue, useMemo } from 'react'
import { Accessibility, BookOpen, LayoutGrid, Maximize, Minus, MonitorPlay, NotebookText, Plus, Presentation as PresentationIcon, MessageSquare } from 'lucide-react'
import { checkAccessibility } from '../model/accessibility'
import { currentIndex, store, useStore } from '../store/store'
import { cls } from './ui'
import { masterViewLabel } from './MasterViews'
import { languageLabel } from '../model/languages'
import { t } from '../i18n'

export function StatusBar({ onZoomDialog, onAccessibility }: { onZoomDialog: () => void; onAccessibility: () => void }) {
  const s = useStore((x) => x)
  const pres = useStore((x) => x.pres)
  // Re-checked after edits settle (the check walks every slide).
  const deferred = useDeferredValue(pres)
  const issues = useMemo(() => checkAccessibility(deferred).filter((i) => i.level !== 'tip').length, [deferred])
  const index = currentIndex(s)
  const setZoom = (zoom: number) => store.set({ zoom: Math.max(10, Math.min(400, Math.round(zoom))), fit: false })
  return (
    <footer className="statusbar">
      <div className="sb-left">
        <span className="sb-count">{s.view === 'master' ? masterViewLabel(s.pres, s.slideId) : s.view === 'handoutMaster' ? t('Handout Master') : s.view === 'notesMaster' ? t('Notes Master') : s.pres.slides.length ? t('Slide {n} of {total}', { n: index + 1, total: s.pres.slides.length }) : t('No slides')}</span>
        <span className="sb-lang" title={t('Proofing language (Review › Language)')}>{languageLabel(s.pres.lang)}</span>
        <button type="button" className="sb-btn sb-a11y" title={t('Check Accessibility')} onClick={onAccessibility}>
          <Accessibility size={14} /> {issues ? t('Accessibility: Investigate') : t('Accessibility: Good to go')}
        </button>
      </div>
      <div className="sb-right">
        <button type="button" className={cls('sb-text', s.showNotes && 'is-active')} title={t('Notes')} onClick={() => store.set({ showNotes: !s.showNotes })}>
          <NotebookText size={14} /> <span className="sb-label">{t('Notes')}</span>
        </button>
        <button type="button" className={cls('sb-text', s.pane === 'comments' && 'is-active')} title={t('Comments')} onClick={() => store.set({ pane: s.pane === 'comments' ? null : 'comments' })}>
          <MessageSquare size={14} /> <span className="sb-label">{t('Comments')}</span>
        </button>
        <span className="sb-sep sb-views" />
        <button type="button" className={cls('sb-btn sb-views', s.view === 'normal' && 'is-active')} title={t('Normal')} aria-label={t('Normal')} onClick={() => store.set({ view: 'normal' })}>
          <PresentationIcon size={14} />
        </button>
        <button type="button" className={cls('sb-btn sb-views', s.view === 'sorter' && 'is-active')} title={t('Slide Sorter')} aria-label={t('Slide Sorter')} onClick={() => store.set({ view: 'sorter', editingId: null })}>
          <LayoutGrid size={14} />
        </button>
        <button type="button" className="sb-btn sb-views" title={t('Reading View')} aria-label={t('Reading View')} onClick={() => store.set({ show: { start: index, reading: true } })}>
          <BookOpen size={14} />
        </button>
        <button type="button" className="sb-btn" title={t('Slide Show (Shift+F5)')} aria-label={t('Slide Show')} onClick={() => store.set({ show: { start: index } })}>
          <MonitorPlay size={14} />
        </button>
        <span className="sb-sep" />
        <button type="button" className="sb-btn sb-zoomstep" aria-label={t('Zoom Out')} title={t('Zoom Out')} onClick={() => setZoom(s.zoom - 10)}>
          <Minus size={12} />
        </button>
        <input type="range" className="zoom-slider" min={10} max={400} step={1} value={s.zoom} aria-label={t('Zoom')} onChange={(e) => setZoom(Number(e.target.value))} />
        <button type="button" className="sb-btn sb-zoomstep" aria-label={t('Zoom In')} title={t('Zoom In')} onClick={() => setZoom(s.zoom + 10)}>
          <Plus size={12} />
        </button>
        <button type="button" className="sb-zoom" title={t('Zoom…')} onClick={onZoomDialog}>
          {s.zoom}%
        </button>
        <button type="button" className={cls('sb-btn', s.fit && 'is-active')} title={t('Fit slide to current window')} aria-label={t('Fit slide to current window')} onClick={() => store.set({ fit: true })}>
          <Maximize size={13} />
        </button>
      </div>
    </footer>
  )
}

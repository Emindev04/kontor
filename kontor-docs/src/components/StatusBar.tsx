import { BookCheck, BookOpen, Eye, FileText, Globe, Minus, Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { MenuList, Popup, cls, usePopover } from './ui'
import { LANGUAGES, languageLabel } from './languages'
import type { AppApi } from './tabs/types'
import { formatNumber, t, tx } from '../i18n'

type Props = { app: AppApi; editor: Editor; onWordCount: () => void; onGoTo: () => void }

// The zoom slider is not linear: its middle is 100 %, the left half covers 10–100 %, the right half 100–500 %.
const toSlider = (zoom: number) => (zoom <= 100 ? ((zoom - 10) / 90) * 50 : 50 + ((zoom - 100) / 400) * 50)
const fromSlider = (v: number) => Math.round(v <= 50 ? 10 + (v / 50) * 90 : 100 + ((v - 50) / 50) * 400)

/** Hides status bar items in `data-sb-hide` order (lowest first) until the bar fits on one line. */
function fitStatusBar(bar: HTMLElement) {
  const items = Array.from(bar.querySelectorAll<HTMLElement>('[data-sb-hide]')).sort((a, b) => Number(a.dataset.sbHide) - Number(b.dataset.sbHide))
  items.forEach((item) => item.classList.remove('sb-hidden'))
  for (const item of items) {
    if (bar.scrollWidth <= bar.clientWidth + 1) break
    item.classList.add('sb-hidden')
  }
}

/** Items of Customize Status Bar (right-click the status bar). */
const STATUS_ITEMS: { id: string; label: string }[] = [
  { id: 'page', label: tx('Formatted Page Number') },
  { id: 'words', label: tx('Word Count') },
  { id: 'spelling', label: tx('Spelling and Grammar Check') },
  { id: 'language', label: tx('Language') },
  { id: 'focus', label: tx('Focus') },
  { id: 'views', label: tx('View Shortcuts') },
  { id: 'slider', label: tx('Zoom Slider') },
  { id: 'zoom', label: tx('Zoom') },
]

const countWords = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

export function StatusBar({ app, editor, onWordCount, onGoTo }: Props) {
  const lang = usePopover()
  const barRef = useRef<HTMLElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const hidden = new Set(app.settings.hiddenStatus ?? [])
  const off = (id: string) => (hidden.has(id) ? 'sb-off' : '')
  const toggle = (id: string) => {
    const next = hidden.has(id) ? [...hidden].filter((h) => h !== id) : [...hidden, id]
    app.setSettings({ ...app.settings, hiddenStatus: next })
  }
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ro = new ResizeObserver(() => fitStatusBar(bar))
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])
  // The word count and language label change width while typing.
  useLayoutEffect(() => {
    if (barRef.current) fitStatusBar(barRef.current)
  })
  const total = editor.storage.characterCount.words() as number
  const { from, to, empty } = editor.state.selection
  const selected = empty ? 0 : countWords(editor.state.doc.textBetween(from, to, ' ', ' '))
  const words = selected ? t('{selected} of {total} words', { selected: formatNumber(selected), total: formatNumber(total) }) : total === 1 ? t('1 word') : t('{n} words', { n: formatNumber(total) })
  return (
    <footer
      className="statusbar"
      ref={barRef}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {menu && (
        <StatusMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <div className="menu-heading">{t('Customize Status Bar')}</div>
          {STATUS_ITEMS.map((item) => (
            <button key={item.id} type="button" role="menuitemcheckbox" aria-checked={!hidden.has(item.id)} className="menu-item" onClick={() => toggle(item.id)}>
              <span className="menu-check">{hidden.has(item.id) ? '' : '✓'}</span>
              <span className="menu-item-text">{t(item.label)}</span>
            </button>
          ))}
        </StatusMenu>
      )}
      <div className="sb-left">
        <button type="button" className={cls('sb-text', off('page'))} title={t('Go To (Ctrl+G)')} onClick={onGoTo}>
          {t('Page {n} of {total}', { n: app.currentPage, total: app.pages })}
        </button>
        <button type="button" className={cls('sb-text', off('words'))} title={t('Word Count')} data-sb-hide="5" onClick={onWordCount}>
          {words}
        </button>
        <button type="button" className={cls('sb-text sb-icon', off('spelling'))} data-sb-hide="3" title={app.spellcheck ? t('Spelling: on') : t('Spelling: off')} onClick={() => app.setSpellcheck(!app.spellcheck)}>
          <BookCheck size={14} className={app.spellcheck ? '' : 'is-off'} />
        </button>
        <div className={cls('popover-anchor', off('language'))} ref={lang.ref} data-sb-hide="1">
          <button type="button" className="sb-text" title={t('Language')} onClick={() => lang.setOpen(!lang.open)}>
            {languageLabel(app.language)}
          </button>
          {lang.open && (
            <Popup anchor={lang.ref} role="menu">
              <MenuList items={LANGUAGES.map((l) => ({ label: t(l.label), active: l.id === app.language, onClick: () => app.setLanguage(l.id) }))} close={() => lang.setOpen(false)} />
            </Popup>
          )}
        </div>
      </div>
      <div className="sb-right">
        <button type="button" className={cls('sb-text', off('focus'))} title={t('Focus')} data-sb-hide="2" onClick={() => app.setFocusMode(true)}>
          <Eye size={14} /> {t('Focus')}
        </button>
        <button type="button" data-sb-hide="4" className={cls('sb-btn', app.viewMode === 'read' && 'is-active', off('views'))} title={t('Read Mode')} aria-label={t('Read Mode')} onClick={() => app.setViewMode('read')}>
          <BookOpen size={14} />
        </button>
        <button type="button" className={cls('sb-btn', app.viewMode === 'print' && 'is-active', off('views'))} title={t('Print Layout')} aria-label={t('Print Layout')} onClick={() => app.setViewMode('print')}>
          <FileText size={14} />
        </button>
        <button type="button" data-sb-hide="4" className={cls('sb-btn', app.viewMode === 'web' && 'is-active', off('views'))} title={t('Web Layout')} aria-label={t('Web Layout')} onClick={() => app.setViewMode('web')}>
          <Globe size={14} />
        </button>
        <button type="button" className={cls('sb-btn', off('slider'))} aria-label={t('Zoom Out')} onClick={() => app.setZoom(app.zoom - 10)}>
          <Minus size={12} />
        </button>
        <input
          type="range"
          data-sb-hide="6"
          className={cls('zoom-slider', off('slider'))}
          min={0}
          max={100}
          step={0.5}
          value={toSlider(app.zoom)}
          aria-label={t('Zoom')}
          onChange={(e) => app.setZoom(fromSlider(Number(e.target.value)))}
        />
        <button type="button" className={cls('sb-btn', off('slider'))} aria-label={t('Zoom In')} onClick={() => app.setZoom(app.zoom + 10)}>
          <Plus size={12} />
        </button>
        <button type="button" className={cls('sb-zoom', off('zoom'))} title={t('Zoom to 100%')} onClick={() => app.setZoom(100)}>
          {app.zoom}%
        </button>
      </div>
    </footer>
  )
}

/** A small menu at the pointer that closes on any click outside or Esc. */
function StatusMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el) {
      const r = el.getBoundingClientRect()
      el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`
      el.style.top = `${Math.max(8, y - r.height - 4)}px`
    }
    const down = (e: MouseEvent) => !el?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [x, y, onClose])
  return (
    <div ref={ref} className="menu" role="menu" style={{ left: x, top: y }}>
      {children}
    </div>
  )
}

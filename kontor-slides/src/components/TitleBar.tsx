import { useState } from 'react'
import { ChevronDown, FilePlus, FolderOpen, MonitorPlay, Printer, Redo2, Save, Search, SpellCheck, Square, Type, Undo2, PlusSquare, type LucideIcon } from 'lucide-react'
import { APP_NAME } from '../brand'
import { keepFocus, MenuButton } from './ui'
import { QAT_COMMANDS, setOptions, useOptions, type QatId } from '../io/options'
import * as A from '../store/actions'
import { SHAPE_PRESETS } from '../model/shapes'
import { getActiveEditor, useEditorVersion } from '../editor/activeEditor'
import { redo, store, undo, useStore } from '../store/store'
import { t } from '../i18n'

export function AppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#fff" />
      <rect x="7" y="9" width="18" height="12" rx="1.5" fill="none" stroke="var(--brand)" strokeWidth="2.4" />
      <path d="M16 21v4M11 25h10" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 17l3-3 2 2 4-4" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export type QatHandlers = { onSave: () => void; onNew: () => void; onOpen: () => void; onPrint: () => void; onSpelling: () => void }

/** One Quick Access Toolbar button. */
function QatButton({ id, h }: { id: QatId; h: QatHandlers }) {
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  useEditorVersion()
  const ed = getActiveEditor()
  const defs: Record<QatId, { icon: LucideIcon; title: string; run: () => void; disabled?: boolean }> = {
    save: { icon: Save, title: t('Save as .pptx (Ctrl+S)'), run: h.onSave },
    undo: { icon: Undo2, title: t('Undo (Ctrl+Z)'), run: () => (ed?.can().undo() ? ed.commands.undo() : undo()), disabled: ed ? !ed.can().undo() && !canUndo : !canUndo },
    redo: { icon: Redo2, title: t('Redo (Ctrl+Y)'), run: () => (ed?.can().redo() ? ed.commands.redo() : redo()), disabled: ed ? !ed.can().redo() && !canRedo : !canRedo },
    startShow: { icon: MonitorPlay, title: t('Start From Beginning (F5)'), run: () => store.set({ show: { start: 0 } }) },
    new: { icon: FilePlus, title: t('New'), run: h.onNew },
    open: { icon: FolderOpen, title: t('Open'), run: h.onOpen },
    print: { icon: Printer, title: t('Print (Ctrl+P)'), run: h.onPrint },
    newSlide: { icon: PlusSquare, title: t('New Slide (Ctrl+M)'), run: () => A.newSlide() },
    shapes: { icon: Square, title: t('Rectangle: draw a shape'), run: () => store.set({ tool: { kind: 'shape', preset: SHAPE_PRESETS.find((p) => p.prst === 'rect') ?? SHAPE_PRESETS[0] } }) },
    textbox: { icon: Type, title: t('Draw Text Box'), run: () => store.set({ tool: { kind: 'textbox' } }) },
    spelling: { icon: SpellCheck, title: t('Spelling (F7)'), run: h.onSpelling },
  }
  const d = defs[id]
  if (!d) return null
  const label = t(QAT_COMMANDS.find((c) => c.id === id)?.label ?? id)
  return (
    <button type="button" className="tb-btn" title={d.title} aria-label={label} disabled={d.disabled} onMouseDown={keepFocus} onClick={d.run}>
      <d.icon size={16} />
    </button>
  )
}

/** The Quick Access Toolbar: the chosen commands plus a menu to customize it. */
export function QuickAccess({ h, onMore }: { h: QatHandlers; onMore: () => void }) {
  const opts = useOptions()
  return (
    <>
      {opts.qat.map((id) => (
        <QatButton key={id} id={id} h={h} />
      ))}
      <span className="qat-menu">
        <MenuButton
          icon={ChevronDown}
          label={t('Customize Quick Access Toolbar')}
          items={() => [
            { heading: t('Customize Quick Access Toolbar') },
            ...QAT_COMMANDS.map((c) => ({ label: t(c.label), active: opts.qat.includes(c.id), onClick: () => setOptions({ qat: opts.qat.includes(c.id) ? opts.qat.filter((x) => x !== c.id) : [...opts.qat, c.id] }) })),
            'separator' as const,
            { label: t('More Commands…'), onClick: onMore },
            { label: opts.qatBelow ? t('Show Above the Ribbon') : t('Show Below the Ribbon'), onClick: () => setOptions({ qatBelow: !opts.qatBelow }) },
          ]}
        />
      </span>
    </>
  )
}

export function TitleBar({ status, onSave, onSearch, qat, onMoreQat }: { status: string; onSave: () => void; onSearch: (q: string) => void; qat: QatHandlers; onMoreQat: () => void }) {
  const [query, setQuery] = useState('')
  const title = useStore((s) => s.title)
  const autoSave = useStore((s) => s.autoSave)
  const below = useOptions().qatBelow
  void onSave
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <AppIcon />
        <label className="autosave" title={t('Save automatically in this browser')}>
          <span>{t('AutoSave')}</span>
          <input type="checkbox" role="switch" checked={autoSave} onChange={(e) => store.set({ autoSave: e.target.checked })} />
          <span className="switch" aria-hidden="true" />
        </label>
        {!below && <QuickAccess h={qat} onMore={onMoreQat} />}
      </div>

      <div className="titlebar-center">
        <input className="doc-title" value={title} aria-label={t('Presentation name')} onChange={(e) => store.set({ title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
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
          <input placeholder={t('Search')} aria-label={t('Search in presentation')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
      </div>
    </header>
  )
}

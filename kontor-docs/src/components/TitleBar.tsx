import { useState } from 'react'
import {
  BookCheck, ChevronDown, FilePlus2, FolderOpen, MessageSquare, MessageSquarePlus, Printer, Redo2, Save, ScanEye, Search, Share2, Table, Undo2, Volume2, type LucideIcon,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { APP_NAME } from '../brand'
import { historyLabels } from '../editor/HistoryLabels'
import { Popup, cls, keepFocus, usePopover } from './ui'
import { t, tx } from '../i18n'

/** Commands the Quick Access Toolbar can show (Customize Quick Access Toolbar). */
export const QAT_COMMANDS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'new', label: tx('New'), icon: FilePlus2 },
  { id: 'open', label: tx('Open'), icon: FolderOpen },
  { id: 'save', label: tx('Save'), icon: Save },
  { id: 'undo', label: tx('Undo'), icon: Undo2 },
  { id: 'redo', label: tx('Redo'), icon: Redo2 },
  { id: 'print', label: tx('Quick Print'), icon: Printer },
  { id: 'printPreview', label: tx('Print Preview and Print'), icon: ScanEye },
  { id: 'spelling', label: tx('Spelling & Grammar'), icon: BookCheck },
  { id: 'readAloud', label: tx('Read Aloud'), icon: Volume2 },
  { id: 'insertTable', label: tx('Insert Table'), icon: Table },
  { id: 'comment', label: tx('New Comment'), icon: MessageSquarePlus },
]
export const DEFAULT_QAT = ['save', 'undo', 'redo']

export type TitleBarActions = Record<'new' | 'open' | 'print' | 'printPreview' | 'spelling' | 'readAloud' | 'insertTable' | 'comment' | 'share' | 'account' | 'comments', () => void>

type Props = {
  editor: Editor
  title: string
  setTitle: (title: string) => void
  autoSave: boolean
  setAutoSave: (on: boolean) => void
  status: string
  onSave: () => void
  onSearch: (query: string) => void
  qat: string[]
  setQat: (ids: string[]) => void
  actions: TitleBarActions
  user: { name: string; initials: string }
  commentsOpen: boolean
}

export function AppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#fff" />
      <path d="M9 10h14M9 15h14M9 20h9" stroke="var(--brand)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

/** Undo or Redo with a drop-down of the last actions; picking one undoes it and everything after it. */
function HistoryButton({ editor, kind }: { editor: Editor; kind: 'undo' | 'redo' }) {
  const { open, setOpen, ref } = usePopover()
  const [hover, setHover] = useState(0)
  const labels = historyLabels(editor.state)
  const list = [...(kind === 'undo' ? labels.undo : labels.redo)].reverse().slice(0, 30)
  const can = kind === 'undo' ? editor.can().undo() : editor.can().redo()
  const run = (times: number) => {
    setOpen(false)
    const chain = editor.chain().focus()
    for (let i = 0; i < times; i++) chain[kind]()
    chain.run()
  }
  const Icon = kind === 'undo' ? Undo2 : Redo2
  const label = kind === 'undo' ? t('Undo') : t('Redo')
  const last = list[0] ? t(list[0]) : ''
  return (
    <div className={cls('tb-split popover-anchor', open && 'is-open')} ref={ref}>
      <button type="button" className="tb-btn" title={kind === 'undo' ? t('Undo {action} (Ctrl+Z)', { action: last }) : t('Redo {action} (Ctrl+Y)', { action: last })} aria-label={label} disabled={!can} onMouseDown={keepFocus} onClick={() => run(1)}>
        <Icon size={16} />
      </button>
      <button type="button" className="tb-btn tb-arrow" aria-label={kind === 'undo' ? t('Undo history') : t('Redo history')} disabled={!can || !list.length} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={10} />
      </button>
      {open && (
        <Popup anchor={ref} className="history-menu" role="menu">
          {list.map((name, i) => (
            <button key={i} type="button" role="menuitem" className={cls('menu-item', i <= hover && 'is-active')} onMouseEnter={() => setHover(i)} onMouseDown={keepFocus} onClick={() => run(i + 1)}>
              {t(name)}
            </button>
          ))}
          <div className="history-footer">
            {kind === 'undo'
              ? hover ? t('Undo {n} Actions', { n: hover + 1 }) : t('Undo 1 Action')
              : hover ? t('Redo {n} Actions', { n: hover + 1 }) : t('Redo 1 Action')}
          </div>
        </Popup>
      )}
    </div>
  )
}

function CustomizeQat({ qat, setQat }: { qat: string[]; setQat: (ids: string[]) => void }) {
  const { open, setOpen, ref } = usePopover()
  const toggle = (id: string) => {
    const on = qat.includes(id)
    // Keep the commands in the order of the list, like the original.
    setQat(on ? qat.filter((q) => q !== id) : QAT_COMMANDS.map((c) => c.id).filter((c) => c === id || qat.includes(c)))
  }
  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="tb-btn tb-arrow" title={t('Customize Quick Access Toolbar')} aria-label={t('Customize Quick Access Toolbar')} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} />
      </button>
      {open && (
        <Popup anchor={ref} role="menu">
          <div className="menu-heading">{t('Customize Quick Access Toolbar')}</div>
          {QAT_COMMANDS.map((c) => (
            <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={qat.includes(c.id)} className="menu-item" onMouseDown={keepFocus} onClick={() => toggle(c.id)}>
              <span className="menu-check">{qat.includes(c.id) ? '✓' : ''}</span>
              <span className="menu-item-text">{t(c.label)}</span>
            </button>
          ))}
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onMouseDown={keepFocus} onClick={() => (setQat(DEFAULT_QAT), setOpen(false))}>
            <span className="menu-check" />
            <span className="menu-item-text">{t('Reset to Default')}</span>
          </button>
        </Popup>
      )}
    </div>
  )
}

export function TitleBar({ editor, title, setTitle, autoSave, setAutoSave, status, onSave, onSearch, qat, setQat, actions, user, commentsOpen }: Props) {
  const [query, setQuery] = useState('')
  const command = (id: string) => {
    if (id === 'undo' || id === 'redo') return <HistoryButton key={id} editor={editor} kind={id} />
    const c = QAT_COMMANDS.find((x) => x.id === id)
    if (!c) return null
    const run = id === 'save' ? onSave : actions[id as keyof TitleBarActions]
    return (
      <button key={id} type="button" className="tb-btn" title={id === 'save' ? t('Save as .docx (Ctrl+S)') : t(c.label)} aria-label={t(c.label)} onMouseDown={keepFocus} onClick={run}>
        <c.icon size={16} />
      </button>
    )
  }
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <AppIcon />
        <label className="autosave" title={t('Save automatically in this browser')}>
          <span>{t('AutoSave')}</span>
          <input type="checkbox" role="switch" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
        </label>
        {qat.map(command)}
        <CustomizeQat qat={qat} setQat={setQat} />
      </div>

      <div className="titlebar-center">
        <input className="doc-title" value={title} aria-label={t('Document name')} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
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
          <input
            id="tb-search"
            placeholder={t('Search (Alt+Q)')}
            aria-label={t('Search the document')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
          />
        </form>
        <button type="button" className={cls('tb-btn tb-text', commentsOpen && 'is-on')} title={t('Comments')} aria-label={t('Comments')} onMouseDown={keepFocus} onClick={actions.comments}>
          <MessageSquare size={15} />
          <span>{t('Comments')}</span>
        </button>
        <button type="button" className="tb-btn tb-share" title={t('Share a copy of this document')} aria-label={t('Share')} onMouseDown={keepFocus} onClick={actions.share}>
          <Share2 size={15} />
          <span>{t('Share')}</span>
        </button>
        <button type="button" className="tb-avatar" title={t('{name} (Options)', { name: user.name })} aria-label={t('Account: {name}', { name: user.name })} onMouseDown={keepFocus} onClick={actions.account}>
          {user.initials}
        </button>
      </div>
    </header>
  )
}

import { useState } from 'react'
import {
  BookCheck, ChevronDown, FilePlus2, FolderOpen, MessageSquare, MessageSquarePlus, Printer, Redo2, Save, ScanEye, Search, Share2, Table, Undo2, Volume2, type LucideIcon,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { APP_NAME } from '../brand'
import { historyLabels } from '../editor/HistoryLabels'
import { Popup, cls, keepFocus, usePopover } from './ui'

/** Commands the Quick Access Toolbar can show (Customize Quick Access Toolbar). */
export const QAT_COMMANDS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'new', label: 'New', icon: FilePlus2 },
  { id: 'open', label: 'Open', icon: FolderOpen },
  { id: 'save', label: 'Save', icon: Save },
  { id: 'undo', label: 'Undo', icon: Undo2 },
  { id: 'redo', label: 'Redo', icon: Redo2 },
  { id: 'print', label: 'Quick Print', icon: Printer },
  { id: 'printPreview', label: 'Print Preview and Print', icon: ScanEye },
  { id: 'spelling', label: 'Spelling & Grammar', icon: BookCheck },
  { id: 'readAloud', label: 'Read Aloud', icon: Volume2 },
  { id: 'insertTable', label: 'Insert Table', icon: Table },
  { id: 'comment', label: 'New Comment', icon: MessageSquarePlus },
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
  const label = kind === 'undo' ? 'Undo' : 'Redo'
  return (
    <div className={cls('tb-split popover-anchor', open && 'is-open')} ref={ref}>
      <button type="button" className="tb-btn" title={`${label}${list[0] ? ` ${list[0]}` : ''} (Ctrl+${kind === 'undo' ? 'Z' : 'Y'})`} aria-label={label} disabled={!can} onMouseDown={keepFocus} onClick={() => run(1)}>
        <Icon size={16} />
      </button>
      <button type="button" className="tb-btn tb-arrow" aria-label={`${label} history`} disabled={!can || !list.length} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={10} />
      </button>
      {open && (
        <Popup anchor={ref} className="history-menu" role="menu">
          {list.map((name, i) => (
            <button key={i} type="button" role="menuitem" className={cls('menu-item', i <= hover && 'is-active')} onMouseEnter={() => setHover(i)} onMouseDown={keepFocus} onClick={() => run(i + 1)}>
              {name}
            </button>
          ))}
          <div className="history-footer">
            {label} {hover + 1} Action{hover ? 's' : ''}
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
      <button type="button" className="tb-btn tb-arrow" title="Customize Quick Access Toolbar" aria-label="Customize Quick Access Toolbar" onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} />
      </button>
      {open && (
        <Popup anchor={ref} role="menu">
          <div className="menu-heading">Customize Quick Access Toolbar</div>
          {QAT_COMMANDS.map((c) => (
            <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={qat.includes(c.id)} className="menu-item" onMouseDown={keepFocus} onClick={() => toggle(c.id)}>
              <span className="menu-check">{qat.includes(c.id) ? '✓' : ''}</span>
              <span className="menu-item-text">{c.label}</span>
            </button>
          ))}
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onMouseDown={keepFocus} onClick={() => (setQat(DEFAULT_QAT), setOpen(false))}>
            <span className="menu-check" />
            <span className="menu-item-text">Reset to Default</span>
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
      <button key={id} type="button" className="tb-btn" title={id === 'save' ? 'Save as .docx (Ctrl+S)' : c.label} aria-label={c.label} onMouseDown={keepFocus} onClick={run}>
        <c.icon size={16} />
      </button>
    )
  }
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <AppIcon />
        <label className="autosave" title="Save automatically in this browser">
          <span>AutoSave</span>
          <input type="checkbox" role="switch" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
        </label>
        {qat.map(command)}
        <CustomizeQat qat={qat} setQat={setQat} />
      </div>

      <div className="titlebar-center">
        <input className="doc-title" value={title} aria-label="Document name" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
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
            placeholder="Search (Alt+Q)"
            aria-label="Search the document"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
          />
        </form>
        <button type="button" className={cls('tb-btn tb-text', commentsOpen && 'is-on')} title="Comments" aria-label="Comments" onMouseDown={keepFocus} onClick={actions.comments}>
          <MessageSquare size={15} />
          <span>Comments</span>
        </button>
        <button type="button" className="tb-btn tb-share" title="Share a copy of this document" aria-label="Share" onMouseDown={keepFocus} onClick={actions.share}>
          <Share2 size={15} />
          <span>Share</span>
        </button>
        <button type="button" className="tb-avatar" title={`${user.name} (Options)`} aria-label={`Account: ${user.name}`} onMouseDown={keepFocus} onClick={actions.account}>
          {user.initials}
        </button>
      </div>
    </header>
  )
}

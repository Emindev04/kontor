import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, MessageSquare, MoreHorizontal, RotateCcw, Send, Trash2, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { authorColor, commentRanges, newId, type CommentReply, type Comments, type CommentThread } from '../editor/Review'
import { MenuList, Popup, cls, usePopover } from './ui'
import { formatDate, t } from '../i18n'

/** "A few seconds ago", "5 minutes ago", "Yesterday", then a date – like the original's comment cards. */
export function relativeDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return t('A few seconds ago')
  if (s < 120) return t('1 minute ago')
  if (s < 3600) return t('{n} minutes ago', { n: Math.floor(s / 60) })
  if (s < 7200) return t('1 hour ago')
  if (s < 86400) return t('{n} hours ago', { n: Math.floor(s / 3600) })
  if (s < 172800) return t('Yesterday')
  return formatDate(d, { month: 'long', day: 'numeric', year: 'numeric' })
}

type Props = {
  editor: Editor
  comments: Comments
  setComments: (update: (c: Comments) => Comments) => void
  active: string | null
  setActive: (id: string | null) => void
  editing: string | null
  setEditing: (id: string | null) => void
  user: { name: string; initials: string }
  /** Left edge of the pane in page coordinates. */
  left: number
  showCards: boolean
  onShowCards: () => void
  /** Called when the scale between screen and page coordinates is needed. */
  pagesEl: HTMLElement | null
  pageWidth: number
}

function Avatar({ name, initials }: { name: string; initials: string }) {
  return (
    <span className="cmt-avatar" style={{ background: authorColor(name) }} aria-hidden="true">
      {initials}
    </span>
  )
}

function AutoText({ value, onChange, onSubmit, onCancel, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  useEffect(() => {
    if (!autoFocus) return
    ref.current?.focus()
    // The editor may take focus back a frame later (after the ribbon click); focus again then.
    const t = setTimeout(() => ref.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [autoFocus])
  return (
    <textarea
      ref={ref}
      rows={1}
      className="cmt-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          onSubmit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
    />
  )
}

function Card({
  thread,
  isActive,
  isEditing,
  top,
  user,
  onActivate,
  onUpdate,
  onDelete,
  onEdit,
  onStopEditing,
  innerRef,
}: {
  thread: CommentThread
  isActive: boolean
  isEditing: boolean
  top: number
  user: { name: string; initials: string }
  onActivate: () => void
  onUpdate: (t: CommentThread) => void
  onDelete: () => void
  onEdit: () => void
  onStopEditing: (cancelled: boolean) => void
  innerRef: (el: HTMLDivElement | null) => void
}) {
  const [draft, setDraft] = useState(thread.text)
  const [reply, setReply] = useState('')
  const menu = usePopover()
  useEffect(() => {
    if (isEditing) setDraft(thread.text)
  }, [isEditing, thread.text])

  const post = () => {
    if (!draft.trim()) return onStopEditing(true)
    onUpdate({ ...thread, text: draft.trim(), date: thread.text ? thread.date : new Date().toISOString() })
    onStopEditing(false)
  }
  const postReply = () => {
    if (!reply.trim()) return
    const r: CommentReply = { id: newId(), author: user.name, initials: user.initials, date: new Date().toISOString(), text: reply.trim() }
    onUpdate({ ...thread, resolved: false, replies: [...thread.replies, r] })
    setReply('')
  }

  return (
    <div
      ref={innerRef}
      className={cls('cmt-card', isActive && 'is-active', thread.resolved && 'is-resolved')}
      style={{ top }}
      role="article"
      aria-label={t('Comment by {author}', { author: thread.author })}
      onMouseDown={(e) => {
        e.stopPropagation()
        onActivate()
      }}
    >
      <div className="cmt-head">
        <Avatar name={thread.author} initials={thread.initials} />
        <div className="cmt-who">
          <strong>{thread.author}</strong>
          <small>{thread.resolved ? t('Resolved') : relativeDate(thread.date)}</small>
        </div>
        <div className="popover-anchor" ref={menu.ref}>
          <button type="button" className="cmt-icon" aria-label={t('More thread actions')} onClick={() => menu.setOpen(!menu.open)}>
            <MoreHorizontal size={14} />
          </button>
          {menu.open && (
            <Popup anchor={menu.ref} role="menu">
              <MenuList
                close={() => menu.setOpen(false)}
                items={[
                  { label: t('Edit comment'), onClick: onEdit, disabled: thread.resolved },
                  { label: t('Delete thread'), icon: Trash2, onClick: onDelete },
                  thread.resolved
                    ? { label: t('Reopen thread'), icon: RotateCcw, onClick: () => onUpdate({ ...thread, resolved: false }) }
                    : { label: t('Resolve thread'), icon: Check, onClick: () => onUpdate({ ...thread, resolved: true }) },
                ]}
              />
            </Popup>
          )}
        </div>
      </div>
      {isEditing ? (
        <div className="cmt-edit">
          <AutoText autoFocus value={draft} onChange={setDraft} onSubmit={post} onCancel={() => onStopEditing(true)} placeholder={t('Start a conversation')} />
          <div className="cmt-actions">
            <button type="button" className="cmt-icon is-primary" aria-label={t('Post comment (Ctrl+Enter)')} title={t('Post comment (Ctrl+Enter)')} disabled={!draft.trim()} onClick={post}>
              <Send size={14} />
            </button>
            <button type="button" className="cmt-icon" aria-label={t('Cancel')} title={t('Cancel')} onClick={() => onStopEditing(true)}>
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="cmt-text">{thread.text}</div>
      )}
      {(!thread.resolved || isActive) &&
        thread.replies.map((r) => (
          <div key={r.id} className="cmt-reply-item">
            <div className="cmt-head">
              <Avatar name={r.author} initials={r.initials} />
              <div className="cmt-who">
                <strong>{r.author}</strong>
                <small>{relativeDate(r.date)}</small>
              </div>
              <button
                type="button"
                className="cmt-icon cmt-hover"
                aria-label={t('Delete reply')}
                title={t('Delete reply')}
                onClick={() => onUpdate({ ...thread, replies: thread.replies.filter((x) => x.id !== r.id) })}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="cmt-text">{r.text}</div>
          </div>
        ))}
      {thread.resolved && thread.replies.length > 0 && !isActive && <div className="cmt-more">{t('{n} more', { n: thread.replies.length })}</div>}
      {isActive && !isEditing && thread.text && (
        <div className="cmt-reply">
          {thread.resolved ? (
            <button type="button" className="btn" onClick={() => onUpdate({ ...thread, resolved: false })}>
              <RotateCcw size={13} /> {t('Reopen')}</button>
          ) : (
            <>
              <AutoText value={reply} onChange={setReply} onSubmit={postReply} onCancel={() => setReply('')} placeholder={t('Reply')} />
              {reply.trim() ? (
                <button type="button" className="cmt-icon is-primary" aria-label={t('Post reply (Ctrl+Enter)')} title={t('Post reply (Ctrl+Enter)')} onClick={postReply}>
                  <Send size={14} />
                </button>
              ) : (
                <button type="button" className="cmt-icon" aria-label={t('Resolve thread')} title={t('Resolve thread')} onClick={() => onUpdate({ ...thread, resolved: true })}>
                  <Check size={14} />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The markup area to the right of the pages: one card per comment thread, lined up with its anchor
 * and pushed down when cards would overlap. With "Show Comments" off only small icons remain.
 */
export function CommentsPane(props: Props) {
  const { editor, comments, setComments, active, setActive, editing, setEditing, user, left, showCards, onShowCards, pagesEl, pageWidth } = props
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [layout, setLayout] = useState<{ anchors: Record<string, number>; tops: Record<string, number> }>({ anchors: {}, tops: {} })
  const [tick, setTick] = useState(0)

  const ranges = commentRanges(editor.state.doc)
  const threads = [...ranges.entries()]
    .filter(([id]) => comments[id])
    .sort((a, b) => a[1].from - b[1].from)
    .map(([id, r]) => ({ thread: comments[id], range: r }))

  // Pagination moves text after React has rendered; re-measure when the editor's size changes.
  useEffect(() => {
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(editor.view.dom)
    const t = setTimeout(() => setTick((n) => n + 1), 200)
    return () => {
      ro.disconnect()
      clearTimeout(t)
    }
  }, [editor, threads.length])

  useLayoutEffect(() => {
    if (!pagesEl) return
    const rect = pagesEl.getBoundingClientRect()
    const scale = rect.width / pageWidth || 1
    const anchors: Record<string, number> = {}
    for (const { thread, range } of threads) {
      try {
        anchors[thread.id] = (editor.view.coordsAtPos(range.from, 1).top - rect.top) / scale
      } catch {
        anchors[thread.id] = 0
      }
    }
    // The active card sits at its anchor; the others make room above and below it.
    const tops: Record<string, number> = {}
    const order = threads.map((t) => t.thread.id)
    const height = (id: string) => (cardRefs.current.get(id)?.offsetHeight ?? 60) + 8
    const activeIndex = active ? order.indexOf(active) : -1
    if (activeIndex >= 0) {
      tops[active!] = anchors[active!]
      for (let i = activeIndex + 1; i < order.length; i++) tops[order[i]] = Math.max(anchors[order[i]], tops[order[i - 1]] + height(order[i - 1]))
      for (let i = activeIndex - 1; i >= 0; i--) tops[order[i]] = Math.min(anchors[order[i]], tops[order[i + 1]] - height(order[i]))
      // Never above the top of the first page.
      let shift = 0
      if (order.length && tops[order[0]] < 0) shift = -tops[order[0]]
      if (shift) for (let i = 0; i < order.length; i++) tops[order[i]] = Math.max(tops[order[i]], i ? tops[order[i - 1]] + height(order[i - 1]) : 0)
    } else {
      let bottom = 0
      for (const id of order) {
        tops[id] = Math.max(anchors[id], bottom)
        bottom = tops[id] + height(id)
      }
    }
    setLayout((prev) => (JSON.stringify(prev) === JSON.stringify({ anchors, tops }) ? prev : { anchors, tops }))
  })
  void tick

  const update = (t: CommentThread) => setComments((c) => ({ ...c, [t.id]: t }))
  const remove = (id: string) => {
    editor.commands.removeComment(id)
    setComments((c) => {
      const next = { ...c }
      delete next[id]
      return next
    })
    if (active === id) setActive(null)
  }

  const activeAnchor = active != null ? layout.anchors[active] : undefined
  return (
    <div className={cls('markup-pane', !showCards && 'is-compact')} style={{ left }} onMouseDown={(e) => e.stopPropagation()}>
      {active && <style>{`.comment-anchor[data-comment="${active}"] { background: rgba(244, 177, 60, 0.55); }`}</style>}
      {showCards && active && activeAnchor != null && layout.tops[active] != null && (
        <svg className="cmt-connector" style={{ left: -(left - pageWidth) - 4, top: 0 }} width={left - pageWidth + 4} height={Math.max(activeAnchor, layout.tops[active]) + 20}>
          <path d={`M0 ${activeAnchor + 12} H${left - pageWidth - 16} L${left - pageWidth + 4} ${layout.tops[active] + 14}`} />
        </svg>
      )}
      {threads.map(({ thread }) =>
        showCards ? (
          <Card
            key={thread.id}
            thread={thread}
            isActive={active === thread.id}
            isEditing={editing === thread.id}
            top={layout.tops[thread.id] ?? 0}
            user={user}
            innerRef={(el) => (el ? cardRefs.current.set(thread.id, el) : cardRefs.current.delete(thread.id))}
            onActivate={() => setActive(thread.id)}
            onUpdate={update}
            onDelete={() => remove(thread.id)}
            onEdit={() => setEditing(thread.id)}
            onStopEditing={(cancelled) => {
              setEditing(null)
              if (cancelled && !thread.text) remove(thread.id)
              editor.commands.focus()
            }}
          />
        ) : (
          <button
            key={thread.id}
            type="button"
            className={cls('cmt-badge', active === thread.id && 'is-active')}
            style={{ top: layout.anchors[thread.id] ?? 0 }}
            title={`${thread.author}: ${thread.text}`}
            aria-label={t('Comment by {author}', { author: thread.author })}
            onClick={() => {
              setActive(thread.id)
              onShowCards()
            }}
          >
            <MessageSquare size={14} />
          </button>
        ),
      )}
    </div>
  )
}

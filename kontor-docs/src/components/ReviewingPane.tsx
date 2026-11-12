import { X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { authorColor, collectChanges, commentRanges, describeFormat, type Comments } from '../editor/Review'
import { relativeDate } from './CommentsPane'
import { t } from '../i18n'

type Props = { editor: Editor; comments: Comments; onClose: () => void; onNavigate: (pos: number) => void; onActivateComment: (id: string) => void }

/** Reviewing Pane: every insertion, deletion and comment in document order, with a summary. */
export function ReviewingPane({ editor, comments, onClose, onNavigate, onActivateComment }: Props) {
  const changes = collectChanges(editor.state.doc)
  const ranges = commentRanges(editor.state.doc)
  const items = [
    ...changes.map((c) => ({
      pos: c.from,
      kind: c.kind === 'insertion' ? t('Inserted') : c.kind === 'deletion' ? t('Deleted') : t('Formatted'),
      author: c.author,
      date: c.date,
      text: c.kind === 'format' ? `${describeFormat(c.old, editor.state.doc.nodeAt(c.from)?.marks ?? [])}: ${c.text}` : c.text,
      comment: null as string | null,
    })),
    ...[...ranges.entries()]
      .filter(([id]) => comments[id])
      .map(([id, r]) => ({ pos: r.from, kind: 'Commented', author: comments[id].author, date: comments[id].date, text: comments[id].text, comment: id })),
  ].sort((a, b) => a.pos - b.pos)
  const insertions = changes.filter((c) => c.kind === 'insertion').length
  const deletions = changes.filter((c) => c.kind === 'deletion').length
  const formats = changes.filter((c) => c.kind === 'format').length
  const commentCount = items.length - changes.length

  return (
    <aside className="nav-pane review-pane" aria-label={t('Revisions')}>
      <div className="nav-head">
        <strong>{t('Revisions')}</strong>
        <button type="button" className="sb-btn" aria-label={t('Close reviewing pane')} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="review-summary">
        <strong>{items.length === 1 ? t('1 revision') : t('{n} revisions', { n: items.length })}</strong>
        <span>
          {t('{insertions} insertions, {deletions} deletions, {formats} formatting, {comments} comments', { insertions, deletions, formats, comments: commentCount })}
        </span>
      </div>
      <div className="nav-list">
        {items.length ? (
          items.map((item, i) => (
            <button
              key={i}
              type="button"
              className="review-item"
              onClick={() => {
                onNavigate(item.pos + (item.comment ? 0 : 0))
                if (item.comment) onActivateComment(item.comment)
              }}
            >
              <span className="review-meta">
                <strong style={{ color: authorColor(item.author) }}>{item.author || t('Unknown')}</strong> {item.kind}
                <small>{relativeDate(item.date)}</small>
              </span>
              <span className={`review-text review-${item.kind.toLowerCase()}`}>{item.text.length > 140 ? `${item.text.slice(0, 140)}…` : item.text}</span>
            </button>
          ))
        ) : (
          <p className="nav-empty">{t('No revisions. Turn on Track Changes to record insertions and deletions, or add a comment.')}</p>
        )}
      </div>
    </aside>
  )
}

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import type { PaginationController } from '../editor/Pagination'
import { findMatches } from '../editor/Search'
import { cls } from './ui'

type Props = {
  editor: Editor
  controller: PaginationController
  pages: number
  onClose: () => void
  onNavigate: (pos: number) => void
  onSearch: (query: string) => void
}

type Tab = 'headings' | 'pages' | 'results'

/** Moves a heading's section (the heading and everything up to the next heading of the same or a higher level). */
function moveSection(editor: Editor, from: number, to: number) {
  const doc = editor.state.doc
  const sectionEnd = (pos: number) => {
    const level = doc.nodeAt(pos)?.attrs.level ?? 1
    let end = doc.content.size
    let offset = 0
    doc.forEach((n) => {
      if (offset > pos && end === doc.content.size && n.type.name === 'heading' && n.attrs.level <= level) end = offset
      offset += n.nodeSize
    })
    return end
  }
  const end = sectionEnd(from)
  if (to >= from && to < end) return
  const slice = doc.slice(from, end)
  const tr = editor.state.tr.delete(from, end)
  const target = to > from ? to - (end - from) : to
  tr.insert(target, slice.content)
  editor.view.dispatch(tr.scrollIntoView())
}

/** Navigation pane: Headings (click to jump, drag to reorganize), Pages and search Results. */
export function NavigationPane({ editor, controller, pages, onClose, onNavigate, onSearch }: Props) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('headings')
  const [drag, setDrag] = useState<number | null>(null)
  const headings: { pos: number; level: number; text: string; page: number }[] = []
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === 'heading' && node.textContent.trim()) headings.push({ pos, level: node.attrs.level, text: node.textContent.trim(), page: controller.pageOfPos(pos) + 1 })
  })
  const head = editor.state.selection.head
  const current = [...headings].reverse().find((h) => h.pos <= head)?.pos
  const results = useMemo(() => {
    if (!query.trim()) return []
    return findMatches(editor.state.doc, query).slice(0, 200).map((m) => {
      const $pos = editor.state.doc.resolve(m.from)
      const text = $pos.parent.textContent
      const offset = m.from - $pos.start()
      return { from: m.from, before: text.slice(Math.max(0, offset - 30), offset), match: text.slice(offset, offset + (m.to - m.from)), after: text.slice(offset + (m.to - m.from), offset + (m.to - m.from) + 40) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, editor.state.doc])
  const pageList = Array.from({ length: pages }, (_, k) => {
    const start = controller.pageStart(k, editor.state.doc.content.size)
    const end = k + 1 < pages ? controller.pageStart(k + 1, editor.state.doc.content.size) : editor.state.doc.content.size
    return { k, start, text: editor.state.doc.textBetween(Math.min(start, editor.state.doc.content.size), Math.min(end, editor.state.doc.content.size), ' ', ' ').slice(0, 90) }
  })
  return (
    <aside className="nav-pane" aria-label="Navigation">
      <div className="nav-head">
        <strong>Navigation</strong>
        <button type="button" className="sb-btn" aria-label="Close navigation pane" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <form
        className="nav-search"
        onSubmit={(e) => {
          e.preventDefault()
          setTab('results')
          onSearch(query)
        }}
      >
        <input placeholder="Search document" aria-label="Search document" value={query} onChange={(e) => (setQuery(e.target.value), e.target.value && setTab('results'))} />
        <Search size={14} />
      </form>
      <div className="nav-tabs" role="tablist">
        {(['headings', 'pages', 'results'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={cls(tab === t && 'is-active')} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="nav-list">
        {tab === 'headings' &&
          (headings.length ? (
            headings.map((h) => (
              <button
                key={h.pos}
                type="button"
                draggable
                className={cls('nav-item', current === h.pos && 'is-active', drag != null && drag !== h.pos && 'is-drop')}
                style={{ paddingLeft: 10 + (h.level - 1) * 14 }}
                title="Click to go to the heading; drag to move its section"
                onClick={() => onNavigate(h.pos + 1)}
                onDragStart={(e) => {
                  setDrag(h.pos)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => drag != null && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (drag != null && drag !== h.pos) moveSection(editor, drag, h.pos)
                  setDrag(null)
                }}
              >
                <span className="nav-text">{h.text}</span>
                <span className="nav-page">{h.page}</span>
              </button>
            ))
          ) : (
            <p className="nav-empty">Your outline appears here once headings use the Heading styles from the Home tab. Click a heading to jump to it; drag it to move its section.</p>
          ))}
        {tab === 'pages' &&
          pageList.map((p) => (
            <button key={p.k} type="button" className={cls('nav-page-item', controller.pageOfPos(head) === p.k && 'is-active')} onClick={() => onNavigate(p.start)}>
              <span className="nav-page-thumb">{p.k + 1}</span>
              <span className="nav-page-text">{p.text || '(empty page)'}</span>
            </button>
          ))}
        {tab === 'results' &&
          (results.length ? (
            <>
              <p className="nav-count">{results.length === 200 ? '200+' : results.length} result{results.length === 1 ? '' : 's'}</p>
              {results.map((r) => (
                <button key={r.from} type="button" className="nav-result" onClick={() => onNavigate(r.from)}>
                  {r.before}
                  <mark>{r.match}</mark>
                  {r.after}
                </button>
              ))}
            </>
          ) : (
            <p className="nav-empty">{query ? 'No results.' : 'Search for text in your document.'}</p>
          ))}
      </div>
    </aside>
  )
}

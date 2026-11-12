import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { expandReplacement, getSearchState, searchKey, type SearchOptions } from '../editor/Search'

type Props = { editor: Editor; initialQuery: string; withReplace: boolean; onClose: () => void }

function setSearch(editor: Editor, query: string, current: number, options: SearchOptions) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, current, options }))
  const s = getSearchState(editor.state)
  const match = s.matches[s.current]
  if (match) {
    const { node } = editor.view.domAtPos(match.from)
    const el = node instanceof HTMLElement ? node : node.parentElement
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

/** First match at or after the cursor. */
function indexFromCursor(editor: Editor, query: string, options: SearchOptions) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, current: 0, options }))
  const { matches } = getSearchState(editor.state)
  const head = editor.state.selection.from
  const i = matches.findIndex((m) => m.from >= head)
  return i === -1 ? 0 : i
}

export function FindPanel({ editor, initialQuery, withReplace, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(withReplace)
  const [options, setOptions] = useState<SearchOptions>({ matchCase: false, wholeWord: false })
  const inputRef = useRef<HTMLInputElement>(null)
  const state = getSearchState(editor.state)

  useEffect(() => setShowReplace(withReplace), [withReplace])
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [withReplace])
  useEffect(() => {
    setSearch(editor, query, indexFromCursor(editor, query, options), options)
  }, [editor, query, options])

  const close = () => {
    const match = state.matches[state.current]
    editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query: '' }))
    onClose()
    if (match) editor.chain().focus().setTextSelection(match).run()
    else editor.commands.focus()
  }

  const step = (dir: 1 | -1) => {
    const n = state.matches.length
    if (n) setSearch(editor, query, (state.current + dir + n) % n, options)
  }

  const replaceOne = () => {
    const match = state.matches[state.current]
    if (!match) return
    const found = editor.state.doc.textBetween(match.from, match.to)
    editor.view.dispatch(editor.state.tr.insertText(expandReplacement(replacement, found, query, options), match.from, match.to))
    setSearch(editor, query, state.current, options)
  }

  const replaceAll = () => {
    const count = state.matches.length
    const tr = editor.state.tr
    ;[...state.matches].reverse().forEach((m) => tr.insertText(expandReplacement(replacement, editor.state.doc.textBetween(m.from, m.to), query, options), m.from, m.to))
    editor.view.dispatch(tr)
    setSearch(editor, query, 0, options)
    alert(`All done. We made ${count} ${count === 1 ? 'replacement' : 'replacements'}.`)
  }

  const count = state.matches.length
  return (
    <div className="find-panel" role="search" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="find-row">
        <input
          ref={inputRef}
          value={query}
          placeholder="Search document"
          aria-label="Find what"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && step(e.shiftKey ? -1 : 1)}
        />
        <span className="find-count">{query ? (count ? `${state.current + 1} of ${count}` : 'No results') : ''}</span>
        <button type="button" className="sb-btn" title="Previous result" aria-label="Previous result" onClick={() => step(-1)}>
          <ChevronUp size={14} />
        </button>
        <button type="button" className="sb-btn" title="Next result" aria-label="Next result" onClick={() => step(1)}>
          <ChevronDown size={14} />
        </button>
        <button type="button" className="sb-btn" title="Close" aria-label="Close" onClick={close}>
          <X size={14} />
        </button>
      </div>
      <div className="find-options">
        <label>
          <input type="checkbox" checked={!!options.matchCase} onChange={(e) => setOptions({ ...options, matchCase: e.target.checked })} /> Match case
        </label>
        <label>
          <input type="checkbox" checked={!!options.wholeWord} onChange={(e) => setOptions({ ...options, wholeWord: e.target.checked })} /> Find whole words only
        </label>
        <label title="? any character, * any text, [a-z] sets, < > word start and end, {n,m} and @ repeats, ( ) groups for \1 in the replacement">
          <input type="checkbox" checked={!!options.wildcards} onChange={(e) => setOptions({ ...options, wildcards: e.target.checked })} /> Use wildcards
        </label>
        <select
          className="find-special"
          aria-label="Special characters"
          value=""
          onChange={(e) => {
            if (!e.target.value) return
            setQuery(query + e.target.value)
            inputRef.current?.focus()
          }}
        >
          <option value="">Special ▾</option>
          <option value="^t">Tab Character (^t)</option>
          <option value="^?">Any Character (^?)</option>
          <option value="^#">Any Digit (^#)</option>
          <option value="^$">Any Letter (^$)</option>
          <option value="^w">White Space (^w)</option>
          <option value="^s">Nonbreaking Space (^s)</option>
          <option value="^^">Caret Character (^^)</option>
        </select>
      </div>
      {showReplace ? (
        <div className="find-row">
          <input value={replacement} placeholder="Replace with" aria-label="Replace with" onChange={(e) => setReplacement(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && replaceOne()} />
          <button type="button" className="btn" disabled={!count} onClick={replaceOne}>
            Replace
          </button>
          <button type="button" className="btn" disabled={!count} onClick={replaceAll}>
            Replace All
          </button>
        </div>
      ) : (
        <button type="button" className="link-btn" onClick={() => setShowReplace(true)}>
          Replace…
        </button>
      )}
    </div>
  )
}

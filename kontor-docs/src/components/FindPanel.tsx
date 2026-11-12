import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { applyFormat, expandReplacement, getSearchState, hasFormat, searchKey, type FormatFilter, type SearchOptions } from '../editor/Search'
import { t, tx } from '../i18n'

const STYLE_CHOICES: { id: string; label: string }[] = [
  { id: 'normal', label: tx('Normal') },
  { id: 'h1', label: tx('Heading 1') },
  { id: 'h2', label: tx('Heading 2') },
  { id: 'h3', label: tx('Heading 3') },
  { id: 'h4', label: tx('Heading 4') },
  { id: 'h5', label: tx('Heading 5') },
  { id: 'h6', label: tx('Heading 6') },
  { id: 'title', label: tx('Title') },
  { id: 'subtitle', label: tx('Subtitle') },
  { id: 'quote', label: tx('Quote') },
  { id: 'noSpacing', label: tx('No Spacing') },
]

/** Find/Replace › Format: the formatting to look for or to apply. */
function FormatEditor({ value, onChange, label }: { value: FormatFilter; onChange: (f: FormatFilter) => void; label: string }) {
  const tri = (key: 'bold' | 'italic' | 'underline' | 'strike' | 'highlight', text: string) => (
    <label className="find-format-item">
      {text}
      <select value={value[key] === undefined ? '' : value[key] ? 'on' : 'off'} onChange={(e) => onChange({ ...value, [key]: e.target.value === '' ? undefined : e.target.value === 'on' })}>
        <option value="">{t('(any)')}</option>
        <option value="on">{t('Yes')}</option>
        <option value="off">{t('No')}</option>
      </select>
    </label>
  )
  return (
    <fieldset className="find-format">
      <legend>{label}</legend>
      {tri('bold', t('Bold'))}
      {tri('italic', t('Italic'))}
      {tri('underline', t('Underline'))}
      {tri('strike', t('Strikethrough'))}
      {tri('highlight', t('Highlight'))}
      <label className="find-format-item">
        {t('Font:')}
        <input value={value.fontFamily ?? ''} onChange={(e) => onChange({ ...value, fontFamily: e.target.value || undefined })} />
      </label>
      <label className="find-format-item">
        {t('Size:')}
        <input value={value.fontSize ?? ''} onChange={(e) => onChange({ ...value, fontSize: e.target.value || undefined })} style={{ width: 48 }} />
      </label>
      <label className="find-format-item">
        {t('Font color:')}
        <input type="checkbox" checked={!!value.color} onChange={(e) => onChange({ ...value, color: e.target.checked ? '#FF0000' : undefined })} />
        {value.color && <input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value.toUpperCase() })} />}
      </label>
      <label className="find-format-item">
        {t('Style:')}
        <select value={value.paragraphStyle ?? ''} onChange={(e) => onChange({ ...value, paragraphStyle: e.target.value || undefined })}>
          <option value="">{t('(any)')}</option>
          {STYLE_CHOICES.map((c) => (
            <option key={c.id} value={c.id}>
              {t(c.label)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn-small" onClick={() => onChange({})}>
        {t('No Formatting')}
      </button>
    </fieldset>
  )
}

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
  const [showFormat, setShowFormat] = useState(false)
  const [replaceFormat, setReplaceFormat] = useState<FormatFilter>({})
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

  // An empty Replace box with Replace › Format changes only the formatting of the found text.
  const formatOnly = !replacement && hasFormat(replaceFormat)
  const replaceIn = (tr: import('@tiptap/pm/state').Transaction, m: { from: number; to: number }) => {
    let end = m.to
    if (!formatOnly) {
      const text = expandReplacement(replacement, editor.state.doc.textBetween(m.from, m.to), query, options)
      tr.insertText(text, m.from, m.to)
      end = m.from + text.length
    }
    if (hasFormat(replaceFormat) && end > m.from) applyFormat(tr, m.from, end, replaceFormat, editor.schema)
  }

  const replaceOne = () => {
    const match = state.matches[state.current]
    if (!match) return
    const tr = editor.state.tr
    replaceIn(tr, match)
    editor.view.dispatch(tr)
    setSearch(editor, query, state.current, options)
  }

  const replaceAll = () => {
    const count = state.matches.length
    const tr = editor.state.tr
    ;[...state.matches].reverse().forEach((m) => replaceIn(tr, m))
    editor.view.dispatch(tr)
    setSearch(editor, query, 0, options)
    alert(count === 1 ? t('All done. We made 1 replacement.') : t('All done. We made {n} replacements.', { n: count }))
  }

  const count = state.matches.length
  return (
    <div className="find-panel" role="search" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="find-row">
        <input
          ref={inputRef}
          value={query}
          placeholder={t('Search document')}
          aria-label={t('Find what')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && step(e.shiftKey ? -1 : 1)}
        />
        <span className="find-count">{query || hasFormat(options.format) ? (count ? `${state.current + 1} of ${count}` : t('No results')) : ''}</span>
        <button type="button" className="sb-btn" title={t('Previous result')} aria-label={t('Previous result')} onClick={() => step(-1)}>
          <ChevronUp size={14} />
        </button>
        <button type="button" className="sb-btn" title={t('Next result')} aria-label={t('Next result')} onClick={() => step(1)}>
          <ChevronDown size={14} />
        </button>
        <button type="button" className="sb-btn" title={t('Close')} aria-label={t('Close')} onClick={close}>
          <X size={14} />
        </button>
      </div>
      <div className="find-options">
        <label>
          <input type="checkbox" checked={!!options.matchCase} onChange={(e) => setOptions({ ...options, matchCase: e.target.checked })} /> {t('Match case')}</label>
        <label>
          <input type="checkbox" checked={!!options.wholeWord} onChange={(e) => setOptions({ ...options, wholeWord: e.target.checked })} /> {t('Find whole words only')}</label>
        <label title={t('? any character, * any text, [a-z] sets, < > word start and end, {n,m} and @ repeats, ( ) groups for \\1 in the replacement')}>
          <input type="checkbox" checked={!!options.wildcards} onChange={(e) => setOptions({ ...options, wildcards: e.target.checked })} /> {t('Use wildcards')}</label>
        <select
          className="find-special"
          aria-label={t('Special characters')}
          value=""
          onChange={(e) => {
            if (!e.target.value) return
            setQuery(query + e.target.value)
            inputRef.current?.focus()
          }}
        >
          <option value="">{t('Special ▾')}</option>
          <option value="^t">{t('Tab Character (^t)')}</option>
          <option value="^?">{t('Any Character (^?)')}</option>
          <option value="^#">{t('Any Digit (^#)')}</option>
          <option value="^$">{t('Any Letter (^$)')}</option>
          <option value="^w">{t('White Space (^w)')}</option>
          <option value="^s">{t('Nonbreaking Space (^s)')}</option>
          <option value="^^">{t('Caret Character (^^)')}</option>
        </select>
        <button type="button" className={`link-btn${hasFormat(options.format) || hasFormat(replaceFormat) ? ' is-active' : ''}`} aria-expanded={showFormat} onClick={() => setShowFormat(!showFormat)}>
          {t('Format')} {showFormat ? '▴' : '▾'}
        </button>
      </div>
      {showFormat && (
        <div className="find-formats">
          <FormatEditor label={t('Find formatting')} value={options.format ?? {}} onChange={(format) => setOptions({ ...options, format })} />
          {showReplace && <FormatEditor label={t('Replace formatting')} value={replaceFormat} onChange={setReplaceFormat} />}
        </div>
      )}
      {showReplace ? (
        <div className="find-row">
          <input value={replacement} placeholder={t('Replace with')} aria-label={t('Replace with')} onChange={(e) => setReplacement(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && replaceOne()} />
          <button type="button" className="btn" disabled={!count} onClick={replaceOne}>
            {t('Replace')}</button>
          <button type="button" className="btn" disabled={!count} onClick={replaceAll}>
            {t('Replace All')}</button>
        </div>
      ) : (
        <button type="button" className="link-btn" onClick={() => setShowReplace(true)}>
          {t('Replace…')}</button>
      )}
    </div>
  )
}

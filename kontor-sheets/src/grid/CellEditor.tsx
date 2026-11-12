import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Doc } from '../commands/doc'
import { FN_META } from '../engine/functions/meta'
import { coloredRefs, functionContext, suggestions } from './formulaAssist'
import { acceptSuggestion, definedNames, handleEditKey } from './editKeys'
import { runStyle, type RichRun } from '../commands/richText'
import type { Style } from '../model/style'
import { autoCorrect, prefs } from '../model/prefs'
import { t } from '../i18n'

/** AutoComplete: the rest of the only text in the column that starts with what was typed. */
function completeFromColumn(doc: Doc, r: number, c: number, typed: string): string {
  if (!typed.trim() || /^[\d.,\-+$%/: ]+$/.test(typed)) return ''
  const low = typed.toLowerCase()
  const found = new Map<string, string>()
  for (const dir of [-1, 1]) {
    for (let i = r + dir, n = 0; i >= 0 && n < 2000; i += dir, n++) {
      const v = doc.sheet.get(i, c)?.v
      if (v === undefined || v === null || v === '') break
      if (typeof v !== 'string') continue
      if (v.length > typed.length && v.toLowerCase().startsWith(low)) found.set(v.toLowerCase(), v)
      if (found.size > 1) return ''
    }
  }
  const only = [...found.values()][0]
  return found.size === 1 && only ? only.slice(typed.length) : ''
}

/** Text with colored references, rendered behind a transparent textarea. */
export function FormulaMirror({ text, style }: { text: string; style?: CSSProperties }) {
  const refs = coloredRefs(text)
  const parts: React.ReactNode[] = []
  let at = 0
  refs.forEach((r, i) => {
    if (r.start > at) parts.push(text.slice(at, r.start))
    parts.push(
      <span key={i} style={{ color: r.color }}>
        {text.slice(r.start, r.end)}
      </span>,
    )
    at = r.end
  })
  parts.push(text.slice(at) + '​')
  return (
    <div className="fx-mirror" aria-hidden="true" style={style}>
      {parts}
    </div>
  )
}

/**
 * Formatted runs of a rich-text cell, rendered behind a transparent textarea. Sizes and fonts stay
 * uniform here so the caret lines up; the grid shows them for real.
 */
export function RichMirror({ runs, base, style }: { runs: RichRun[]; base: Style; style?: CSSProperties }) {
  return (
    <div className="fx-mirror" aria-hidden="true" style={style}>
      {runs.map((r, i) => {
        const st = runStyle(base, r.s)
        const deco = [st.underline ? 'underline' : '', st.strike ? 'line-through' : ''].filter(Boolean).join(' ')
        return (
          <span
            key={i}
            style={{
              fontWeight: st.bold ? 700 : 400,
              fontStyle: st.italic ? 'italic' : 'normal',
              textDecoration: deco || 'none',
              textDecorationStyle: st.underline === 'double' || st.underline === 'doubleAccounting' ? 'double' : undefined,
              color: st.color ?? '#000000',
              position: st.script ? 'relative' : undefined,
              top: st.script === 'superscript' ? '-0.35em' : st.script === 'subscript' ? '0.2em' : undefined,
            }}
          >
            {r.t}
          </span>
        )
      })}
      {'\u200b'}
    </div>
  )
}

/** Autocomplete list and function-argument tooltip below the active editor. */
export function FormulaAssist({ doc, anchor }: { doc: Doc; anchor: HTMLElement | null }) {
  const e = doc.edit
  if (!e || !anchor || !e.text.startsWith('=')) return null
  const rect = anchor.getBoundingClientRect()
  const sug = !e.acOff ? suggestions(e.text, e.caret, definedNames(doc)) : null
  const ctx = functionContext(e.text, e.caret)
  const meta = ctx ? FN_META.get(ctx.name) : undefined
  const top = rect.bottom + 2
  const left = Math.min(rect.left, window.innerWidth - 320)
  const index = Math.min(e.ac ?? 0, (sug?.items.length ?? 1) - 1)
  return createPortal(
    <div className="fx-assist" style={{ top, left }}>
      {meta && !sug && (
        <div className="fx-tip">
          {ctx!.name}(
          {meta.args.map((a, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <span className={i === Math.min(ctx!.arg, meta.args.length - 1) || (a.includes('…') && ctx!.arg >= i) ? 'fx-tip-cur' : undefined}>{a}</span>
            </span>
          ))}
          )
        </div>
      )}
      {sug && (
        <div className="fx-list" role="listbox">
          {sug.items.slice(0, 200).map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="option"
              aria-selected={i === index}
              className={i === index ? 'is-active' : undefined}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => doc.updateEdit({ ac: i })}
              onDoubleClick={() => acceptSuggestion(doc, i)}
              ref={(el) => {
                if (el && i === index) el.scrollIntoView({ block: 'nearest' })
              }}
            >
              <span className="fx-list-icon">{s.kind === 'function' ? 'fx' : 'N'}</span>
              {s.name}
            </button>
          ))}
          {sug.items[index] && <div className="fx-list-desc">{t(sug.items[index].description)}</div>}
        </div>
      )}
    </div>,
    document.body,
  )
}

type Props = {
  doc: Doc
  rect: { x: number; y: number; w: number; h: number; maxW: number }
  font: string
  color: string
  background: string
  wrap: boolean
  zoom: number
  alert: (m: string) => void
  focusGrid: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}

export function CellEditor({ doc, rect, font, color, background, wrap, zoom, alert, focusGrid, wrapperRef }: Props) {
  const e = doc.edit!
  const ref = useRef<HTMLTextAreaElement>(null)
  const measure = useRef<HTMLSpanElement>(null)
  const isFormula = e.text.startsWith('=')

  const pendingSelection = useRef<[number, number] | null>(null)
  useEffect(() => {
    if (e.source === 'cell') ref.current?.focus()
  }, [e.source])

  // keep the DOM caret in sync with the model (after pointing / autocomplete)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || document.activeElement !== el) return
    // a caret that came from the user's own selection (either end) leaves that selection alone
    if (el.selectionStart === e.caret || el.selectionEnd === e.caret) return
    el.setSelectionRange(e.caret, e.caret)
  }, [e.caret, e.text])

  // AutoComplete: select the suggested rest so typing on replaces it
  useLayoutEffect(() => {
    const sel = pendingSelection.current
    if (!sel || !ref.current) return
    pendingSelection.current = null
    ref.current.setSelectionRange(sel[0], sel[1])
  }, [e.text])

  // grow with the text
  let width = rect.w
  let height = rect.h
  if (measure.current) {
    measure.current.textContent = e.text + 'M'
    const w = measure.current.offsetWidth + 6
    const lines = wrap ? Math.max(1, Math.ceil(w / Math.max(20, rect.w))) + e.text.split('\n').length - 1 : e.text.split('\n').length
    if (!wrap) width = Math.min(Math.max(rect.w, w), Math.max(rect.w, rect.maxW))
    const lineH = parseFloat(font) * 1.22 || 18
    height = Math.max(rect.h, lines * lineH + 4 * zoom)
  }

  const textStyle: CSSProperties = { font, color: isFormula ? '#000' : color, padding: `${2 * zoom}px ${3 * zoom}px`, whiteSpace: wrap ? 'pre-wrap' : 'pre' }

  return (
    <div ref={wrapperRef} className="cell-editor" style={{ left: rect.x - 1, top: rect.y - 1, width: width + 2, height: height + 2, background }}>
      <span ref={measure} className="cell-editor-measure" style={{ font }} />
      {isFormula && <FormulaMirror text={e.text} style={textStyle} />}
      {!isFormula && e.rich && <RichMirror runs={e.rich} base={doc.style(e.r, e.c)} style={textStyle} />}
      <textarea
        ref={ref}
        className={isFormula || e.rich ? 'is-formula' : undefined}
        style={{ ...textStyle, color: isFormula || (e.rich && !isFormula) ? 'transparent' : color, caretColor: '#000' }}
        value={e.text}
        spellCheck={false}
        aria-label={t('Cell contents')}
        onChange={(ev) => {
          const before = e.text
          let text = ev.target.value
          let caret = ev.target.selectionStart ?? text.length
          const typedAtEnd = text.length > before.length && caret === text.length && !text.startsWith('=') && !e.rich
          if (typedAtEnd) {
            const fixed = autoCorrect(text)
            if (fixed !== text) {
              text = fixed
              caret = text.length
            }
          }
          const rest = typedAtEnd && prefs().autoComplete ? completeFromColumn(doc, e.r, e.c, text) : ''
          if (rest) pendingSelection.current = [text.length, text.length + rest.length]
          doc.updateEdit({ text: text + rest, caret, point: null, acOff: false, ac: 0, source: 'cell' })
        }}
        onSelect={(ev) => {
          const pos = ev.currentTarget.selectionStart ?? 0
          if (pos !== doc.edit?.caret) doc.updateEdit({ caret: pos })
        }}
        onFocus={() => doc.edit && doc.edit.source !== 'cell' && doc.updateEdit({ source: 'cell' })}
        onKeyDown={(ev) => {
          ev.stopPropagation()
          handleEditKey(ev, doc, alert, focusGrid)
        }}
        onMouseDown={() => doc.edit?.mode === 'enter' && doc.updateEdit({ mode: 'edit' })}
      />
      {e.source === 'cell' && <FormulaAssist doc={doc} anchor={wrapperRef.current} />}
    </div>
  )
}

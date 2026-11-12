import { useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { cellName, rangeName } from '../model/address'
import { prefs } from '../model/prefs'
import { refArea } from '../engine/parser'
import { matchRef } from '../engine/tokenizer'
import { validateName, defineName } from '../commands/ops'
import { goTo } from '../commands/find'
import type { Doc } from '../commands/doc'
import { FormulaAssist, FormulaMirror } from '../grid/CellEditor'
import { handleEditKey } from '../grid/editKeys'
import { canonicalFunctionName } from '../engine/localize'
import { useApp, useDocVersion } from './appContext'
import { usePopover, Popup, keepFocus } from './ui'
import { t } from '../i18n'

/** Name Box: jump to a cell, range or name; typing a new name defines it for the selection. */
export function goToReference(doc: Doc, text: string): string | null {
  const ref = text.trim()
  if (!ref) return null
  const m = matchRef(ref, 0)
  if (m && m.end === ref.length) {
    const sheet = m.parts.sheet !== undefined ? doc.wb.sheetByName(m.parts.sheet) : doc.sheet
    if (!sheet) return t('Reference isn’t valid.')
    const a = refArea(m.parts)
    goTo(doc, sheet, { r: a.r1, c: a.c1 })
    doc.selectRange(a, { r: a.r1, c: a.c1 })
    return null
  }
  const n = doc.wb.getName(ref, doc.sheet.id)
  if (n) {
    const mm = matchRef(n.ref, 0)
    if (mm) {
      const sheet = mm.parts.sheet !== undefined ? doc.wb.sheetByName(mm.parts.sheet) : doc.sheet
      if (sheet) {
        const a = refArea(mm.parts)
        goTo(doc, sheet, { r: a.r1, c: a.c1 })
        doc.selectRange(a, { r: a.r1, c: a.c1 })
        return null
      }
    }
    return t('That name does not refer to a range.')
  }
  const err = validateName(doc, ref)
  if (err) return t('Reference isn’t valid.')
  const q = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(doc.sheet.name) ? doc.sheet.name : `'${doc.sheet.name.replace(/'/g, "''")}'`
  const rg = doc.activeRange
  const abs = rangeName(rg).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')
  defineName(doc, ref, `${q}!${abs}`)
  return null
}

function NameBox() {
  const app = useApp()
  const doc = app.doc
  const [draft, setDraft] = useState<string | null>(null)
  const { open, setOpen, ref } = usePopover()
  const sel = doc.sel
  const rg = doc.activeRange
  let label = prefs().r1c1 ? `R${sel.active.r + 1}C${sel.active.c + 1}` : cellName(sel.active.r, sel.active.c)
  for (const n of doc.wb.names.values()) {
    const m = matchRef(n.ref, 0)
    if (!m || m.end !== n.ref.length) continue
    const a = refArea(m.parts)
    const sh = m.parts.sheet !== undefined ? doc.wb.sheetByName(m.parts.sheet) : doc.sheet
    if (sh === doc.sheet && a.r1 === rg.r1 && a.r2 === rg.r2 && a.c1 === rg.c1 && a.c2 === rg.c2 && (n.scope === undefined || n.scope === doc.sheet.id)) label = n.name
  }
  return (
    <div className="namebox popover-anchor" ref={ref}>
      <input
        aria-label={t('Name Box')}
        value={draft ?? label}
        onFocus={(e) => {
          setDraft(label)
          e.target.select()
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const err = goToReference(doc, draft ?? '')
            setDraft(null)
            if (err) app.alert(err)
            app.focusGrid()
          } else if (e.key === 'Escape') {
            setDraft(null)
            app.focusGrid()
          }
        }}
      />
      <button type="button" className="namebox-btn" aria-label={t('Defined names')} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} />
      </button>
      {open && (
        <Popup anchor={ref} className="combo-menu" role="listbox">
          {[...doc.wb.names.values()].length === 0 && <div className="menu-heading">{t('No defined names')}</div>}
          {[...doc.wb.names.values()].map((n) => (
            <button
              key={`${n.scope}-${n.name}`}
              type="button"
              className="menu-item"
              onMouseDown={keepFocus}
              onClick={() => {
                setOpen(false)
                const err = goToReference(doc, n.name)
                if (err) app.alert(err)
              }}
            >
              {n.name}
            </button>
          ))}
        </Popup>
      )}
    </div>
  )
}

export function FormulaBar() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const [expanded, setExpanded] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const ed = doc.edit
  const a = doc.sel.active
  const text = ed ? ed.text : doc.sheet.get(a.r, a.c)?.s && doc.style(a.r, a.c).hideFormula ? '' : doc.inputText(a.r, a.c)
  const isFormula = text.startsWith('=')
  return (
    <div className={`formula-bar${expanded ? ' is-expanded' : ''}`}>
      <NameBox />
      <div className="fx-buttons">
        <button type="button" className="fx-btn" title={t('Cancel')} aria-label={t('Cancel')} disabled={!ed} onMouseDown={keepFocus} onClick={() => { doc.cancelEdit(); app.focusGrid() }}>
          <X size={14} />
        </button>
        <button
          type="button"
          className="fx-btn"
          title={t('Enter')}
          aria-label={t('Enter')}
          disabled={!ed}
          onMouseDown={keepFocus}
          onClick={() => {
            const err = doc.commitEdit()
            if (err) app.alert(err)
            else app.focusGrid()
          }}
        >
          <Check size={14} />
        </button>
        <button type="button" className="fx-btn fx-insert" title={t('Insert Function (Shift+F3)')} aria-label={t('Insert Function')} onMouseDown={keepFocus} onClick={() => {
          // a formula that is one function call opens its arguments directly
          const a = doc.sel.active
          const f = doc.edit?.text ?? (doc.sheet.get(a.r, a.c)?.f !== undefined ? doc.inputText(a.r, a.c) : '')
          const m = /^=\s*([A-Za-zÀ-￿_][A-Za-z0-9_.À-￿]*)\s*\(/.exec(f)
          app.dialog(m ? { kind: 'functionArgs', fn: canonicalFunctionName(m[1]) } : { kind: 'insertFunction' })
        }}>
          <i>fx</i>
        </button>
      </div>
      <div className="fx-input" ref={wrap}>
        {isFormula && <FormulaMirror text={text} />}
        <textarea
          ref={input}
          aria-label={t('Formula Bar')}
          spellCheck={false}
          className={isFormula ? 'is-formula' : undefined}
          value={text}
          onFocus={(e) => {
            if (!doc.edit) {
              doc.beginEdit('edit', undefined, 'bar')
              const el = e.currentTarget
              requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
            } else if (doc.edit.source !== 'bar') doc.updateEdit({ source: 'bar', mode: 'edit' })
          }}
          onChange={(e) => {
            if (!doc.edit) doc.beginEdit('edit', e.target.value, 'bar')
            else doc.updateEdit({ text: e.target.value, caret: e.target.selectionStart ?? e.target.value.length, point: null, acOff: false, ac: 0, source: 'bar' })
          }}
          onSelect={(e) => {
            const pos = e.currentTarget.selectionStart ?? 0
            if (doc.edit && pos !== doc.edit.caret) doc.updateEdit({ caret: pos })
          }}
          onKeyDown={(e) => {
            if (!doc.edit) return
            handleEditKey(e, doc, app.alert, app.focusGrid)
          }}
        />
        {ed && ed.source === 'bar' && <FormulaAssist doc={doc} anchor={wrap.current} />}
      </div>
      <button type="button" className="fx-btn fx-expand" title={expanded ? t('Collapse Formula Bar (Ctrl+Shift+U)') : t('Expand Formula Bar (Ctrl+Shift+U)')} aria-label={t('Expand Formula Bar')} onMouseDown={keepFocus} onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
    </div>
  )
}

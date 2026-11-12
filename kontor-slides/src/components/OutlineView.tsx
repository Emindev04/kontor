import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Para, Presentation, ShapeElement, Slide } from '../model/types'
import { isTitleStyle } from '../model/layouts'
import { paraText } from '../model/richtext'
import { createSlide } from '../model/factory'
import { beginTransaction, commit, endTransaction, store, useStore } from '../store/store'
import * as A from '../store/actions'
import { cls } from './ui'

// Outline view: the titles and bullet text of every slide, edited like an indented list.

type Focus = { slideId: string; kind: 'title' | 'body'; idx: number; atStart?: boolean } | null

const BODY_STYLES = new Set(['body', 'subTitle', 'sectionText', 'captionBody', 'captionText', 'compHeader'])

function titleOf(s: Slide) {
  return s.elements.find((e): e is ShapeElement => e.type === 'shape' && !!e.placeholder && isTitleStyle(e.placeholder.style))
}

function bodyOf(s: Slide) {
  return s.elements.find((e): e is ShapeElement => e.type === 'shape' && !!e.placeholder && BODY_STYLES.has(e.placeholder.style) && !!e.text)
}

function withText(p: Para, text: string): Para {
  const marks = p.content?.find((n) => n.type === 'text')?.marks
  return { ...p, content: text ? [{ type: 'text', text, ...(marks ? { marks } : {}) }] : undefined }
}

function updateShape(pres: Presentation, slideId: string, elId: string, fn: (e: ShapeElement) => ShapeElement): Presentation {
  return { ...pres, slides: pres.slides.map((s) => (s.id !== slideId ? s : { ...s, elements: s.elements.map((e) => (e.id === elId && e.type === 'shape' ? fn(e) : e)) })) }
}

function setParas(pres: Presentation, slideId: string, elId: string, paras: Para[]) {
  return updateShape(pres, slideId, elId, (e) => ({ ...e, text: { ...e.text!, doc: { type: 'doc', content: paras.length ? paras : [{ type: 'paragraph' }] } } }))
}

function Line({ text, className, focusKey, onText, onKey, placeholder }: { text: string; className: string; focusKey: string; onText: (t: string) => void; onKey: (e: React.KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the DOM text in sync without resetting the caret while typing.
  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.textContent !== text) el.textContent = text
  }, [text])
  return (
    <div
      ref={ref}
      className={cls('ol-text', className)}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-focus={focusKey}
      data-placeholder={placeholder}
      spellCheck
      onFocus={() => beginTransaction()}
      onBlur={endTransaction}
      onInput={(e) => onText((e.target as HTMLDivElement).textContent ?? '')}
      onKeyDown={(e) => onKey(e, ref.current!)}
    />
  )
}

function caretAtStart(el: HTMLElement) {
  const sel = el.ownerDocument.getSelection()
  if (!sel || !sel.rangeCount) return true
  const r = sel.getRangeAt(0)
  if (!r.collapsed) return false
  const pre = el.ownerDocument.createRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.startContainer, r.startOffset)
  return pre.toString().length === 0
}

export function OutlinePane() {
  const pres = useStore((s) => s.pres)
  const slideId = useStore((s) => s.slideId)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<Focus>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focus) return
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-focus="${focus.slideId}:${focus.kind}:${focus.idx}"]`)
    if (!el) return
    el.focus()
    const sel = el.ownerDocument.getSelection()
    const r = el.ownerDocument.createRange()
    r.selectNodeContents(el)
    r.collapse(!!focus.atStart)
    sel?.removeAllRanges()
    sel?.addRange(r)
    setFocus(null)
  }, [focus, pres])

  const edit = (fn: (p: Presentation) => Presentation, next?: Focus) => {
    commit(fn)
    if (next) setFocus(next)
  }

  const onTitleKey = (s: Slide, i: number) => (e: React.KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    e.stopPropagation()
    const title = titleOf(s)
    const body = bodyOf(s)
    if (e.key === 'Enter') {
      e.preventDefault()
      // Enter after a title starts a new slide (Ctrl+Enter jumps into the body).
      if (e.ctrlKey && body) return setFocus({ slideId: s.id, kind: 'body', idx: 0 })
      const ns = createSlide(s.layout === 'title' ? 'titleContent' : s.layout, pres.size)
      edit((p) => ({ ...p, slides: [...p.slides.slice(0, i + 1), ns, ...p.slides.slice(i + 1)] }), { slideId: ns.id, kind: 'title', idx: 0 })
      store.set({ slideId: ns.id, selectedSlides: [ns.id] })
    } else if (e.key === 'Tab' && !e.shiftKey && i > 0) {
      // Demote: the slide becomes a bullet (with its text) on the previous slide.
      e.preventDefault()
      const prev = pres.slides[i - 1]
      const prevBody = bodyOf(prev)
      if (!prevBody) return
      const titleText = title?.text ? title.text.doc.content.map((p) => paraText(p)).join(' ') : ''
      const moved: Para[] = [{ type: 'paragraph', attrs: { level: 0 }, content: titleText ? [{ type: 'text', text: titleText }] : undefined }, ...(body?.text?.doc.content ?? []).filter((p) => p.content?.length).map((p) => ({ ...p, attrs: { ...p.attrs, level: Math.min(8, (p.attrs?.level ?? 0) + 1) } }))]
      const existing = prevBody.text!.doc.content.filter((p) => p.content?.length)
      edit((p) => ({ ...setParas(p, prev.id, prevBody.id, [...existing, ...moved]), slides: setParas(p, prev.id, prevBody.id, [...existing, ...moved]).slides.filter((x) => x.id !== s.id) }), { slideId: prev.id, kind: 'body', idx: existing.length })
      store.set({ slideId: prev.id, selectedSlides: [prev.id] })
    } else if (e.key === 'ArrowDown' && body && !collapsed.has(s.id)) {
      e.preventDefault()
      setFocus({ slideId: s.id, kind: 'body', idx: 0 })
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault()
      const prev = pres.slides[i - 1]
      const pb = bodyOf(prev)
      const n = pb?.text?.doc.content.length ?? 0
      setFocus(n && !collapsed.has(prev.id) ? { slideId: prev.id, kind: 'body', idx: n - 1 } : { slideId: prev.id, kind: 'title', idx: 0 })
    } else if (e.key === 'Backspace' && caretAtStart(el) && !(title && paraText(title.text!.doc.content[0] ?? { type: 'paragraph' })) && i > 0 && !bodyOf(s)?.text?.doc.content.some((p) => p.content?.length)) {
      e.preventDefault()
      const prev = pres.slides[i - 1]
      edit((p) => ({ ...p, slides: p.slides.filter((x) => x.id !== s.id) }), { slideId: prev.id, kind: 'title', idx: 0 })
      store.set({ slideId: prev.id, selectedSlides: [prev.id] })
    }
  }

  const onBodyKey = (s: Slide, i: number, body: ShapeElement, pi: number) => (e: React.KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    e.stopPropagation()
    // Read the latest text: typing may have been committed after this handler was created.
    const fresh = store.get().pres.slides.find((x) => x.id === s.id)?.elements.find((x) => x.id === body.id)
    const paras = (fresh?.type === 'shape' && fresh.text ? fresh.text : body.text!).doc.content
    const para = paras[pi]
    const level = para.attrs?.level ?? 0
    if (e.key === 'Enter') {
      e.preventDefault()
      const np: Para = { type: 'paragraph', attrs: { ...para.attrs, level } }
      edit((p) => setParas(p, s.id, body.id, [...paras.slice(0, pi + 1), np, ...paras.slice(pi + 1)]), { slideId: s.id, kind: 'body', idx: pi + 1 })
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      edit((p) => setParas(p, s.id, body.id, paras.map((x, j) => (j === pi ? { ...x, attrs: { ...x.attrs, level: Math.min(8, level + 1) } } : x))), { slideId: s.id, kind: 'body', idx: pi })
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      if (level > 0) {
        edit((p) => setParas(p, s.id, body.id, paras.map((x, j) => (j === pi ? { ...x, attrs: { ...x.attrs, level: level - 1 } } : x))), { slideId: s.id, kind: 'body', idx: pi })
        return
      }
      // Promote a first-level bullet to a new slide; the bullets after it move along.
      const ns = createSlide('titleContent', pres.size)
      const nt = titleOf(ns)!
      const nb = bodyOf(ns)!
      const rest = paras.slice(pi + 1).map((x) => ({ ...x, attrs: { ...x.attrs, level: Math.max(0, (x.attrs?.level ?? 0) - 1) } }))
      ns.elements = ns.elements.map((x) => (x.id === nt.id ? { ...nt, text: { ...nt.text!, doc: { type: 'doc', content: [{ type: 'paragraph', content: paraText(para) ? [{ type: 'text', text: paraText(para) }] : undefined }] } } } : x.id === nb.id ? { ...nb, text: { ...nb.text!, doc: { type: 'doc', content: rest.length ? rest : [{ type: 'paragraph' }] } } } : x))
      edit((p) => {
        const trimmed = setParas(p, s.id, body.id, paras.slice(0, pi))
        const idx = trimmed.slides.findIndex((x) => x.id === s.id)
        return { ...trimmed, slides: [...trimmed.slides.slice(0, idx + 1), ns, ...trimmed.slides.slice(idx + 1)] }
      }, { slideId: ns.id, kind: 'title', idx: 0 })
      store.set({ slideId: ns.id, selectedSlides: [ns.id] })
    } else if (e.key === 'Backspace' && caretAtStart(el) && !paraText(para)) {
      e.preventDefault()
      if (paras.length > 1) edit((p) => setParas(p, s.id, body.id, paras.filter((_, j) => j !== pi)), pi > 0 ? { slideId: s.id, kind: 'body', idx: pi - 1 } : { slideId: s.id, kind: 'title', idx: 0 })
      else setFocus({ slideId: s.id, kind: 'title', idx: 0 })
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (pi < paras.length - 1) setFocus({ slideId: s.id, kind: 'body', idx: pi + 1 })
      else if (pres.slides[i + 1]) setFocus({ slideId: pres.slides[i + 1].id, kind: 'title', idx: 0 })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocus(pi > 0 ? { slideId: s.id, kind: 'body', idx: pi - 1 } : { slideId: s.id, kind: 'title', idx: 0 })
    }
  }

  return (
    <aside className="outline-pane" ref={rootRef} aria-label="Outline">
      <div className="ol-tools">
        <button type="button" className="btn btn-small" onClick={() => setCollapsed(new Set(pres.slides.map((s) => s.id)))}>
          Collapse All
        </button>
        <button type="button" className="btn btn-small" onClick={() => setCollapsed(new Set())}>
          Expand All
        </button>
      </div>
      {pres.slides.map((s, i) => {
        const title = titleOf(s)
        const body = bodyOf(s)
        const isCollapsed = collapsed.has(s.id)
        return (
          <div key={s.id} className={cls('ol-slide', s.id === slideId && 'is-current', s.hidden && 'is-hidden')} onMouseDown={() => s.id !== store.get().slideId && A.goToSlide(s.id)}>
            <div className="ol-title-row">
              <span className="ol-num">{i + 1}</span>
              <button type="button" className="ol-toggle" aria-label={isCollapsed ? 'Expand' : 'Collapse'} onClick={() => setCollapsed((c) => (isCollapsed ? new Set([...c].filter((x) => x !== s.id)) : new Set([...c, s.id])))}>
                {body ? isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} /> : <span className="ol-icon" />}
              </button>
              {title ? (
                <Line
                  text={title.text ? title.text.doc.content.map((p) => paraText(p)).join(' ') : ''}
                  className="ol-title"
                  focusKey={`${s.id}:title:0`}
                  onText={(t) => commit((p) => updateShape(p, s.id, title.id, (e) => ({ ...e, text: { ...e.text!, doc: { type: 'doc', content: [withText(e.text!.doc.content[0] ?? { type: 'paragraph' }, t)] } } })))}
                  onKey={onTitleKey(s, i)}
                />
              ) : (
                <span className="ol-text ol-title is-empty">Slide {i + 1}</span>
              )}
            </div>
            {body &&
              !isCollapsed &&
              body.text!.doc.content.map((para, pi) => (
                <div key={pi} className="ol-body-row" style={{ paddingLeft: 40 + (para.attrs?.level ?? 0) * 20 }}>
                  <Line text={paraText(para)} className="ol-body" focusKey={`${s.id}:body:${pi}`} onText={(t) => commit((p) => setParas(p, s.id, body.id, body.text!.doc.content.map((x, j) => (j === pi ? withText(x, t) : x))))} onKey={onBodyKey(s, i, body, pi)} />
                </div>
              ))}
          </div>
        )
      })}
    </aside>
  )
}

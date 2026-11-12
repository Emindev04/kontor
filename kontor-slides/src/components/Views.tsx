import { useEffect, useRef, useState } from 'react'
import type { Slide } from '../model/types'
import { SlideView, presProps } from '../render/SlideView'
import { beginTransaction, currentIndex, currentSlide, endTransaction, store, useStore } from '../store/store'
import * as A from '../store/actions'
import { cls } from './ui'

const NOTES_KEY = 'kontor-slides:notes-height'
const NOTES_DEFAULT = 64

function readNotesHeight() {
  try {
    const v = Number(localStorage.getItem(NOTES_KEY))
    return v >= 32 ? v : NOTES_DEFAULT
  } catch {
    return NOTES_DEFAULT
  }
}

/** Notes under the slide in Normal view, with a draggable divider (its height is remembered). */
export function NotesPane() {
  const slide = useStore((s) => currentSlide(s))
  const spell = useStore((s) => s.spellcheck)
  const lang = useStore((s) => s.pres.lang || 'en-US')
  const [height, setHeight] = useState(readNotesHeight)
  const [colH, setColH] = useState(0)
  const paneRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ y: number; h: number } | null>(null)
  // The slide has priority: the notes never take more than a quarter of the column unless dragged larger.
  useEffect(() => {
    const col = paneRef.current?.parentElement
    if (!col) return
    const ro = new ResizeObserver(() => setColH(col.clientHeight))
    ro.observe(col)
    return () => ro.disconnect()
  }, [])
  const shown = colH ? Math.max(32, Math.min(height, Math.round(colH * (height > NOTES_DEFAULT ? 0.6 : 0.22)))) : height
  return (
    <div className="notes-pane" ref={paneRef} style={{ height: shown }}>
      <div
        className="notes-divider"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize notes"
        onPointerDown={(e) => {
          dragging.current = { y: e.clientY, h: shown }
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => dragging.current && setHeight(Math.max(32, Math.min(window.innerHeight * 0.6, dragging.current.h - (e.clientY - dragging.current.y))))}
        onPointerUp={() => {
          dragging.current = null
          try {
            localStorage.setItem(NOTES_KEY, String(Math.round(height)))
          } catch {
            /* storage unavailable */
          }
        }}
      />
      <textarea
        className="notes-text"
        aria-label="Notes"
        placeholder="Click to add notes"
        spellCheck={spell}
        lang={lang}
        value={slide.notes}
        onFocus={() => {
          if (store.get().editingId) A.exitEditing()
          store.set({ focus: 'notes', selection: [] })
          beginTransaction({ editingId: null })
        }}
        onChange={(e) => A.setNotes(e.target.value)}
        onBlur={endTransaction}
      />
    </div>
  )
}

export function SlideSorter() {
  const pres = useStore((s) => s.pres)
  const slideId = useStore((s) => s.slideId)
  const selected = useStore((s) => s.selectedSlides)
  const zoom = useStore((s) => s.zoom)
  const [drop, setDrop] = useState<number | null>(null)
  const width = Math.max(120, Math.min(480, 3.6 * zoom))
  const scale = width / pres.size.w
  return (
    <div
      className="sorter"
      tabIndex={0}
      onFocus={() => store.set({ focus: 'thumbs' })}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-kontor-slides')) return
        e.preventDefault()
        const items = [...e.currentTarget.querySelectorAll<HTMLElement>('.sorter-item')]
        let idx = items.length
        for (let i = 0; i < items.length; i++) {
          const r = items[i].getBoundingClientRect()
          if (e.clientY < r.bottom && e.clientX < r.left + r.width / 2 && e.clientY > r.top) {
            idx = i
            break
          }
          if (e.clientY < r.top) {
            idx = i
            break
          }
        }
        setDrop(idx)
      }}
      onDrop={(e) => {
        if (drop === null) return
        e.preventDefault()
        A.moveSlides(selected, drop)
        setDrop(null)
      }}
    >
      {pres.slides.map((slide: Slide, i) => (
        <div
          key={slide.id}
          className={cls('sorter-item', slide.id === slideId && 'is-current', selected.includes(slide.id) && 'is-selected', slide.hidden && 'is-hidden', drop === i && 'drop-before')}
          draggable
          onDragStart={(e) => {
            if (!selected.includes(slide.id)) A.goToSlide(slide.id)
            e.dataTransfer.setData('application/x-kontor-slides', slide.id)
          }}
          onDragEnd={() => setDrop(null)}
          onMouseDown={(e) => e.button === 0 && A.goToSlide(slide.id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })}
          onDoubleClick={() => store.set({ view: 'normal' })}
        >
          {slide.section && <div className="section-label">{slide.section}</div>}
          <div className="sorter-thumb" style={{ width: pres.size.w * scale, height: pres.size.h * scale }}>
            <SlideView slide={slide} index={i} {...presProps(pres)} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
          </div>
          <div className="sorter-meta">
            <span className="thumb-num">{i + 1}</span>
            {slide.transition && slide.transition.name !== 'none' && <span title="Transition">★</span>}
            {slide.transition?.advanceAfter != null && <span>{slide.transition.advanceAfter.toFixed(0)}s</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function NotesPage() {
  const pres = useStore((s) => s.pres)
  const slide = useStore((s) => currentSlide(s))
  const index = useStore((s) => currentIndex(s))
  const pageW = 720
  const slideW = pageW - 120
  const scale = slideW / pres.size.w
  return (
    <div className="notes-page-view">
      <div className="notes-page" style={{ width: pageW, height: pageW * (10 / 7.5) }}>
        <div className="np-slide" style={{ width: slideW, height: pres.size.h * scale }}>
          <SlideView slide={slide} index={index} {...presProps(pres)} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
        </div>
        <textarea className="np-notes" aria-label="Notes" placeholder="Click to add text" value={slide.notes} onFocus={() => beginTransaction({ editingId: null })} onChange={(e) => A.setNotes(e.target.value)} onBlur={endTransaction} />
        <span className="np-number">{index + 1}</span>
      </div>
    </div>
  )
}

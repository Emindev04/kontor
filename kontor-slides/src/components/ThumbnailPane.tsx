import { memo, useDeferredValue, useEffect, useRef, useState } from 'react'
import { ClipboardPaste, Copy, CopyPlus, EyeOff, FilePlus, LayoutTemplate, Scissors, Trash2, RotateCcw, Paintbrush, FolderPlus } from 'lucide-react'
import type { Presentation, Slide } from '../model/types'
import { SlideView, presProps } from '../render/SlideView'
import { setThumbWidth, store, useStore } from '../store/store'
import * as A from '../store/actions'
import { cls, ContextMenu, type MenuItem } from './ui'
import { LAYOUTS } from '../model/layouts'

const Thumb = memo(function Thumb({ slide, index, pres, scale }: { slide: Slide; index: number; pres: Presentation; scale: number }) {
  return (
    <div className="thumb-slide" style={{ width: pres.size.w * scale, height: pres.size.h * scale }}>
      <SlideView slide={slide} index={index} {...presProps(pres)} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
    </div>
  )
})

export function ThumbnailPane({ onFormatBackground, onSection }: { onFormatBackground: () => void; onSection: () => void }) {
  // Thumbnails update at low priority so dragging and typing on the slide stay smooth.
  const pres = useDeferredValue(useStore((s) => s.pres))
  const slideId = useStore((s) => s.slideId)
  const selected = useStore((s) => s.selectedSlides)
  const [drop, setDrop] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const width = useStore((s) => s.thumbWidth)
  // Number column, gaps and scrollbar take about 44 px of the pane.
  const scale = Math.max(40, width - 44) / pres.size.w
  const resizing = useRef<{ x: number; w: number } | null>(null)
  // Collapsed sections, by the id of their first slide.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const blocks = A.sectionBlocks(pres.slides)
  const hiddenByCollapse = new Set<number>()
  blocks.forEach((b) => {
    if (b.name && collapsed.has(pres.slides[b.start].id)) for (let i = b.start; i <= b.end; i++) hiddenByCollapse.add(i)
  })
  const toggleSection = (id: string, open?: boolean) =>
    setCollapsed((c) => {
      const n = new Set(c)
      if (open ?? n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  function openSectionMenu(e: React.MouseEvent, slide: Slide) {
    e.preventDefault()
    e.stopPropagation()
    const bi = blocks.findIndex((b) => pres.slides[b.start].id === slide.id)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Rename Section', onClick: () => (A.goToSlide(slide.id), onSection()) },
        { label: 'Remove Section', onClick: () => A.setSection(null, slide.id) },
        { label: 'Remove Section & Slides', icon: Trash2, onClick: () => A.removeSectionWithSlides(slide.id) },
        'separator',
        { label: 'Move Section Up', disabled: bi <= 0, onClick: () => A.moveSection(slide.id, -1) },
        { label: 'Move Section Down', disabled: bi < 0 || bi >= blocks.length - 1, onClick: () => A.moveSection(slide.id, 1) },
        'separator',
        { label: 'Collapse All', onClick: () => setCollapsed(new Set(blocks.filter((b) => b.name).map((b) => pres.slides[b.start].id))) },
        { label: 'Expand All', onClick: () => setCollapsed(new Set()) },
      ],
    })
  }

  useEffect(() => {
    listRef.current?.querySelector('.thumb.is-current')?.scrollIntoView({ block: 'nearest' })
  }, [slideId])

  function openMenu(e: React.MouseEvent, slide: Slide | null) {
    e.preventDefault()
    if (slide && !selected.includes(slide.id)) A.goToSlide(slide.id)
    store.set({ focus: 'thumbs' })
    const clip = A.getClipboard()
    const items: MenuItem[] = slide
      ? [
          { label: 'Cut', icon: Scissors, onClick: () => { store.set({ focus: 'thumbs', selection: [] }); A.cutSelection() } },
          { label: 'Copy', icon: Copy, onClick: () => { store.set({ focus: 'thumbs', selection: [] }); A.copySelection() } },
          { label: 'Paste', icon: ClipboardPaste, disabled: !clip, onClick: () => A.pasteClipboard() },
          'separator',
          { label: 'New Slide', icon: FilePlus, onClick: () => A.newSlide() },
          { label: 'Duplicate Slide', icon: CopyPlus, onClick: () => A.duplicateSlides() },
          { label: 'Delete Slide', icon: Trash2, onClick: () => A.deleteSlides() },
          'separator',
          { label: 'Add Section', icon: FolderPlus, onClick: onSection },
          'separator',
          { heading: 'Layout' },
          ...LAYOUTS.map((l) => ({ label: l.name, icon: LayoutTemplate, active: slide.layout === l.id, onClick: () => A.setLayout(l.id) })),
          { label: 'Reset Slide', icon: RotateCcw, onClick: () => A.resetSlides() },
          'separator',
          { label: 'Format Background…', icon: Paintbrush, onClick: onFormatBackground },
          { label: slide.hidden ? 'Unhide Slide' : 'Hide Slide', icon: EyeOff, onClick: () => A.toggleHideSlides() },
        ]
      : [
          { label: 'New Slide', icon: FilePlus, onClick: () => A.newSlide() },
          { label: 'Paste', icon: ClipboardPaste, disabled: !clip, onClick: () => A.pasteClipboard() },
        ]
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  function dropIndex(e: React.DragEvent) {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('.thumb') ?? [])]
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) return i
    }
    return items.length
  }

  return (
    <>
      <aside
        className="thumbs"
        aria-label="Slides"
        ref={listRef}
        style={{ width }}
        tabIndex={0}
        onFocus={() => store.set({ focus: 'thumbs' })}
        onContextMenu={(e) => e.target === e.currentTarget && openMenu(e, null)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('application/x-kontor-slides')) return
          e.preventDefault()
          setDrop(dropIndex(e))
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null)
        }}
        onDrop={(e) => {
          if (drop === null) return
          e.preventDefault()
          A.moveSlides(selected, drop)
          setDrop(null)
        }}
      >
        {pres.slides.map((slide, i) => (
          <div key={slide.id}>
            {slide.section && (
              <button
                type="button"
                className="section-label"
                title={collapsed.has(slide.id) ? 'Expand section' : 'Collapse section'}
                aria-expanded={!collapsed.has(slide.id)}
                onClick={() => toggleSection(slide.id)}
                onContextMenu={(e) => openSectionMenu(e, slide)}
              >
                {collapsed.has(slide.id) ? '▸' : '▾'} {slide.section}
                {collapsed.has(slide.id) && <span className="section-count"> ({(blocks.find((b) => b.start === i)?.end ?? i) - i + 1})</span>}
              </button>
            )}
            {drop === i && <div className="drop-line" />}
            <div
              className={cls('thumb', slide.id === slideId && 'is-current', selected.includes(slide.id) && 'is-selected', slide.hidden && 'is-hidden', hiddenByCollapse.has(i) && 'is-folded')}
              draggable
              onDragStart={(e) => {
                if (!selected.includes(slide.id)) A.goToSlide(slide.id)
                e.dataTransfer.setData('application/x-kontor-slides', slide.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => setDrop(null)}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                A.goToSlide(slide.id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
                store.set({ focus: 'thumbs' })
              }}
              onDoubleClick={() => store.set({ view: 'normal' })}
              onContextMenu={(e) => openMenu(e, slide)}
            >
              <span className="thumb-num">{i + 1}</span>
              <div className="thumb-col">
                <Thumb slide={slide} index={i} pres={pres} scale={scale} />
                {(slide.transition?.name ?? 'none') !== 'none' && <span className="thumb-star" title="Has transition">★</span>}
              </div>
            </div>
          </div>
        ))}
        {drop === pres.slides.length && <div className="drop-line" />}
        {menu && <ContextMenu at={menu} items={menu.items} onClose={() => setMenu(null)} />}
      </aside>
      <div
        className="thumbs-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize slide thumbnails"
        style={{ left: width - 3 }}
        onPointerDown={(e) => {
          e.preventDefault()
          resizing.current = { x: e.clientX, w: width }
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => resizing.current && setThumbWidth(resizing.current.w + e.clientX - resizing.current.x)}
        onPointerUp={() => (resizing.current = null)}
      />
    </>
  )
}

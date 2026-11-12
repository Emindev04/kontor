import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { ImageElement, RichDoc, ShapeElement, SlideElement, TableElement } from '../model/types'
import { cloneElement, createShape, createTextBox, findElement, parentOffset, topLevelOf, uid } from '../model/factory'
import { connectionSites, canGlueTo, nearestSite } from '../model/connectors'
import { recognizeInk } from '../model/inkShapes'
import { angleTo, bounds, center, frameFrom, frameFromEnds, HANDLE_DIR, HANDLES, isLineElement, lineEnds, normAngle, resizeTo, scaleGroup, scaleInk, snapBox, union, type Guide, type Handle, type Pt } from '../model/geometry'
import { beginTransaction, commit, currentIndex, currentSlide, endTransaction, silent, store, updateElements, updateSlide, useStore } from '../store/store'
import * as A from '../store/actions'
import { SlideView, presProps } from '../render/SlideView'
import { docToHtml } from '../model/richtext'

// The rich-text editor (and its editing engine) loads on first use and is prefetched when the browser is idle.
// Until it has arrived, text being edited is shown as it is and typed keys are queued.
let editors: { TextEditor: typeof import('./TextEditor').TextEditor; CellEditor: typeof import('./CellEditor').CellEditor } | null = null
let editorsLoading: Promise<void> | null = null
function loadEditors() {
  editorsLoading ??= Promise.all([import('./TextEditor'), import('./CellEditor')]).then(([t, c]) => {
    editors = { TextEditor: t.TextEditor, CellEditor: c.CellEditor }
  })
  return editorsLoading
}
import { DiagramTextPane } from '../components/tabs/DiagramTabs'
import { applyBorders, createTable, deleteCols, deleteRows, insertCol, insertRow, mergeCells, normRange, originOf, scaleTable, splitCell, syncSize } from '../model/table'
import { ContextMenu, pickFile, type MenuItem } from '../components/ui'
import { LAYOUTS } from '../model/layouts'
import type { TextCtx } from '../model/richtext'
import { paintElement, paintSelection } from './formatPainter'
import { pathEnd, retargetPath } from '../model/effects'
import * as AA from '../store/animActions'
import { ClipboardPaste, Copy, Group, Scissors, SendToBack, BringToFront, Paintbrush, Type, RotateCcw, Ungroup, Crop, MessageSquarePlus, Spline, Trash2 } from 'lucide-react'
import { DRAW_TOOLS, SHAPE_PRESETS } from '../model/shapes'
import { shapeOutline } from '../render/ElementView'
import { isCurved, moveHandle, moveVertex, nearestOnOutline, outlinePath, scaleOutline, smoothThrough } from '../model/outline'
import { t } from '../i18n'

type Drag =
  | { kind: 'move'; start: Pt; orig: Map<string, { x: number; y: number }>; moved: boolean; clickedId: string; wasSelected: boolean; client: Pt }
  | { kind: 'resize'; handle: Handle; primary: string; orig: Map<string, SlideElement> }
  | { kind: 'crop'; handle: Handle; orig: ImageElement }
  | { kind: 'lineEnd'; id: string; end: 0 | 1; orig: SlideElement }
  | { kind: 'rotate'; startAngle: number; orig: Map<string, number>; center: Pt }
  | { kind: 'marquee'; start: Pt; cur: Pt; additive: boolean }
  | { kind: 'create'; start: Pt; cur: Pt }
  | { kind: 'pen'; points: Pt[] }
  | { kind: 'erase' }
  | { kind: 'cells'; id: string; start: { r: number; c: number }; client: Pt; moved: boolean }
  | { kind: 'tableLine'; id: string; r: number; c: number; client: Pt; td: HTMLElement }
  | { kind: 'adj'; id: string; orig: ShapeElement }
  | { kind: 'freeform'; points: Pt[]; cur: Pt | null; down: boolean; smooth?: boolean }
  | { kind: 'scribble'; points: Pt[] }
  | { kind: 'vertex'; id: string; ring: number; index: number }
  | { kind: 'handle'; id: string; ring: number; index: number; which: 'i' | 'o' }
  | { kind: 'guide'; axis: 'x' | 'y'; index: number }

const PAD = 28

/** Point-in-polygon test (even-odd rule). */
function insidePolygon(p: Pt, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside
  }
  return inside
}

/** Space around the slide: shrinks in small windows so the slide keeps most of the room. */
function padFor(el: HTMLElement | null) {
  if (!el) return PAD
  return Math.round(Math.max(8, Math.min(PAD, el.clientHeight * 0.07, el.clientWidth * 0.04)))
}

export function SlideCanvas({ onFormatShape, onFormatBackground }: { onFormatShape: () => void; onFormatBackground: () => void }) {
  const s = useStore((x) => x)
  const slide = currentSlide(s)
  const index = currentIndex(s)
  const size = s.pres.size
  const scrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [, setTick] = useState(0)
  const [guides, setGuides] = useState<Guide[]>([])
  /** Connection sites shown while a connector end is dragged near objects. */
  const [sites, setSites] = useState<Pt[] | null>(null)
  const sitesNear = (p: Pt, excludeId?: string) => {
    const els = currentSlide().elements.filter((el) => el.id !== excludeId && canGlueTo(el) && connectionSites(el).some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 80 / z))
    return els.length ? els.flatMap((el) => connectionSites(el)) : null
  }
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [cropId, setCropId] = useState<string | null>(null)
  const [guideTip, setGuideTip] = useState<{ axis: 'x' | 'y'; pos: number } | null>(null)
  const z = s.zoom / 100

  // Fit to window keeps the zoom in sync with the available space.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      if (!store.get().fit) return
      const pad = padFor(el)
      const zw = (el.clientWidth - pad * 2) / size.w
      const zh = (el.clientHeight - pad * 2) / size.h
      const zoom = Math.max(10, Math.floor(Math.min(zw, zh) * 100))
      if (zoom !== store.get().zoom) store.set({ zoom })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size.w, size.h, s.fit])

  useEffect(() => {
    const onCrop = (e: Event) => setCropId((e as CustomEvent<string | null>).detail)
    window.addEventListener('kontor:crop', onCrop)
    return () => window.removeEventListener('kontor:crop', onCrop)
  }, [])

  useEffect(() => {
    if (cropId && !s.selection.includes(cropId)) setCropId(null)
  }, [cropId, s.selection])

  // ---------- Freeform tool ----------

  const finishFreeform = useCallback((closed: boolean) => {
    const d = dragRef.current
    if (d?.kind !== 'freeform') return
    dragRef.current = null
    const pts = d.points.map((q) => [q.x, q.y] as [number, number])
    if (pts.length >= 2) A.addFreeform(pts, closed, !!d.smooth, !!d.smooth)
    else store.set({ tool: { kind: 'select' } })
    setTick((t) => t + 1)
  }, [])

  // Enter or Esc finishes a freeform; switching tools or slides drops it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dragRef.current?.kind !== 'freeform') return
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finishFreeform(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [finishFreeform])

  useEffect(() => {
    const d = dragRef.current
    if (d?.kind === 'freeform' && (s.tool.kind !== 'shape' || (s.tool.preset.prst !== 'freeform' && s.tool.preset.prst !== 'curve'))) {
      dragRef.current = null
      setTick((t) => t + 1)
    }
  }, [s.tool, s.slideId])

  /** Pointer position in the (unrotated, unflipped) coordinates of a shape. */
  const toLocal = (el: SlideElement, p: Pt): Pt => {
    const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
    const a = (-el.rot * Math.PI) / 180
    const lx = Math.cos(a) * (p.x - c.x) - Math.sin(a) * (p.y - c.y) + el.w / 2
    const ly = Math.sin(a) * (p.x - c.x) + Math.cos(a) * (p.y - c.y) + el.h / 2
    return { x: el.flipH ? el.w - lx : lx, y: el.flipV ? el.h - ly : ly }
  }

  /** The shape being edited with Edit Points, in slide coordinates (grouped shapes are offset). */
  const pointsEl = (): ShapeElement | null => {
    const st = store.get()
    if (!st.editPointsId) return null
    const sl = currentSlide(st)
    const el = findElement(sl.elements, st.editPointsId)
    if (!el || el.type !== 'shape' || !el.rings) return null
    const off = parentOffset(sl.elements, el.id)
    return off && (off.x || off.y) ? { ...el, x: el.x + off.x, y: el.y + off.y } : el
  }

  /** Segment of the edited outline under a slide point (within a few pixels). */
  function segmentAt(el: ShapeElement, p: Pt) {
    const local = toLocal(el, p)
    const hit = nearestOnOutline(shapeOutline(el), [local.x, local.y], !!el.open)
    return hit.ring >= 0 && hit.dist <= 10 / z ? hit : null
  }

  function insertPointAt(el: ShapeElement, p: Pt) {
    const hit = segmentAt(el, p)
    if (hit) A.insertVertex(el.id, hit.ring, hit.seg, hit.t)
  }

  const toSlide = useCallback(
    (cx: number, cy: number): Pt => {
      const r = frameRef.current!.getBoundingClientRect()
      return { x: (cx - r.left) / z, y: (cy - r.top) / z }
    },
    [z],
  )

  const onAutofit = useCallback((id: string, patch: { fontScale?: number; lnSpcReduction?: number; h?: number; w?: number }) => {
    const sid = store.get().slideId
    silent((p) =>
      updateElements(p, sid, [id], (e) => {
        if (e.type !== 'shape' || !e.text) return e
        return { ...e, ...(patch.h !== undefined ? { h: patch.h } : {}), ...(patch.w !== undefined ? { w: patch.w } : {}), text: patch.fontScale !== undefined ? { ...e.text, fontScale: patch.fontScale, lnSpcReduction: patch.lnSpcReduction } : e.text }
      }),
    )
  }, [])

  const [editorsReady, setEditorsReady] = useState(!!editors)
  useEffect(() => {
    if (editors) return
    const start = () => loadEditors().then(() => setEditorsReady(true))
    if (s.editingId) start()
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (idle) idle(start)
    else window.setTimeout(start, 1200)
  }, [s.editingId])

  const renderEditor = useCallback(
    (el: ShapeElement, ctx: TextCtx) => {
      if (!editorsReady || !editors) return <div className="rt" dangerouslySetInnerHTML={{ __html: el.text ? docToHtml(el.text.doc, ctx) : '' }} />
      const { TextEditor } = editors
      return (
        <TextEditor
          key={el.id}
          el={el}
          ctx={ctx}
          entry={A.editEntry()}
          spellcheck={store.get().spellcheck}
          onAutofit={onAutofit}
          onChange={(doc) => {
            const sid = store.get().slideId
            commit((p) => updateElements(p, sid, [el.id], (e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, doc } } : e)))
          }}
        />
      )
    },
    [onAutofit, editorsReady],
  )

  const renderCellEditor = useCallback(
    (el: TableElement, r: number, c: number, ctx: TextCtx) => {
      if (!editorsReady || !editors) return <div className="rt" dangerouslySetInnerHTML={{ __html: docToHtml(el.rows[r].cells[c].doc, ctx) }} />
      const { CellEditor } = editors
      return (
        <CellEditor
          key={`${el.id}:${r}:${c}`}
          doc={el.rows[r].cells[c].doc}
          ctx={ctx}
          entry={A.editEntry()}
          spellcheck={store.get().spellcheck}
          onChange={(doc: RichDoc) => {
            const sid = store.get().slideId
            commit((p) =>
              updateElements(p, sid, [el.id], (e) =>
                e.type === 'table' ? { ...e, rows: e.rows.map((row, ri) => (ri !== r ? row : { ...row, cells: row.cells.map((cell, ci) => (ci === c ? { ...cell, doc } : cell)) })) } : e,
              ),
            )
          }}
        />
      )
    },
    [editorsReady],
  )

  const onTableMeasure = useCallback((id: string, heights: number[]) => {
    const sid = store.get().slideId
    silent((p) => updateElements(p, sid, [id], (e) => (e.type === 'table' ? syncSize({ ...e, rows: e.rows.map((row, i) => ({ ...row, h: heights[i] ?? row.h })) }) : e)))
  }, [])

  const onPicturePlaceholder = useCallback(async (id: string) => {
    const [file] = await pickFile('image/*')
    if (file) await A.insertImageFile(file, undefined, id)
  }, [])

  // ---------- Pointer handling ----------

  /** Drawing guides (View > Guides) in slide px. */
  const guideLines = () => {
    const st = store.get()
    return st.guides ?? { x: [size.w / 2], y: [size.h / 2] }
  }
  // Snap targets: other objects plus the visible drawing guides (as zero-width boxes).
  const otherBoxes = (exclude: Set<string>) => [
    ...(store.get().smartGuides ? slide.elements.filter((e) => !exclude.has(e.id) && !e.hidden).map(bounds) : []),
    ...(store.get().showGuides ? [...guideLines().x.map((x) => ({ x, y: 0, w: 0, h: size.h })), ...guideLines().y.map((y) => ({ x: 0, y, w: size.w, h: 0 }))] : []),
  ]

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const p = toSlide(e.clientX, e.clientY)
    const st = store.get()
    setMenu(null)
    if (target.closest('.ph-picture')) return

    const fd = dragRef.current
    if (fd?.kind === 'freeform') {
      const first = fd.points[0]
      if (fd.points.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) < 8 / z) {
        finishFreeform(true)
        return
      }
      fd.points.push(p)
      fd.down = true
      capture(e)
      setTick((t) => t + 1)
      return
    }

    if (st.tool.kind === 'transparentColor') {
      e.preventDefault()
      const node = target.closest<HTMLElement>('[data-el]')
      const img = node ? findElement(slide.elements, node.dataset.el!) : undefined
      store.set({ tool: { kind: 'select' } })
      if (img?.type === 'image') {
        const local = toLocal(img as unknown as ShapeElement, p)
        A.setTransparentColor(img.id, local.x / img.w, local.y / img.h)
      }
      return
    }
    const guideEl = target.closest<HTMLElement>('[data-guide]')
    if (guideEl) {
      const [axis, index] = guideEl.dataset.guide!.split(':')
      e.preventDefault()
      if (!st.guides) store.set({ guides: guideLines() })
      dragRef.current = { kind: 'guide', axis: axis as 'x' | 'y', index: Number(index) }
      capture(e)
      return
    }
    const vertex = target.closest<HTMLElement>('[data-vertex]')
    const pe = pointsEl()
    const bez = target.closest<HTMLElement>('[data-bez]')
    if (bez && pe) {
      const [ring, index, which] = bez.dataset.bez!.split(':')
      e.preventDefault()
      beginTransaction()
      dragRef.current = { kind: 'handle', id: pe.id, ring: Number(ring), index: Number(index), which: which as 'i' | 'o' }
      capture(e)
      return
    }
    if (vertex && pe) {
      const [ring, index] = vertex.dataset.vertex!.split(':').map(Number)
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        A.deleteVertex(pe.id, ring, index)
        return
      }
      store.set({ editVertex: `${ring}:${index}` })
      beginTransaction()
      dragRef.current = { kind: 'vertex', id: pe.id, ring, index }
      capture(e)
      return
    }
    if (pe && target.closest('.pts-path') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      insertPointAt(pe, p)
      return
    }

    if (st.tool.kind === 'shape' && DRAW_TOOLS.has(st.tool.preset.prst)) {
      if (st.editingId) A.exitEditing()
      dragRef.current = st.tool.preset.prst === 'scribble' ? { kind: 'scribble', points: [p] } : { kind: 'freeform', points: [p], cur: p, down: true, smooth: st.tool.preset.prst === 'curve' }
      capture(e)
      return
    }

    if (st.tool.kind === 'drawTable' || st.tool.kind === 'eraseTable') {
      const td = target.closest<HTMLElement>('td[data-cell]')
      const id = td?.closest<HTMLElement>('[data-el]')?.dataset.el
      if (td && id) {
        const [r, c] = td.dataset.cell!.split(':').map(Number)
        dragRef.current = { kind: 'tableLine', id, r, c, client: { x: e.clientX, y: e.clientY }, td }
        capture(e)
        return
      }
      if (st.tool.kind === 'drawTable') {
        if (st.editingId) A.exitEditing()
        dragRef.current = { kind: 'create', start: p, cur: p }
        capture(e)
      }
      return
    }

    if (st.tool.kind === 'shape' || st.tool.kind === 'textbox') {
      if (st.editingId) A.exitEditing()
      dragRef.current = { kind: 'create', start: p, cur: p }
      capture(e)
      return
    }
    if (st.tool.kind === 'pen' || st.tool.kind === 'motionPath' || st.tool.kind === 'lasso') {
      dragRef.current = { kind: 'pen', points: [p] }
      capture(e)
      return
    }
    if (st.tool.kind === 'eraser') {
      dragRef.current = { kind: 'erase' }
      eraseAt(target)
      capture(e)
      return
    }

    const handle = target.closest<HTMLElement>('[data-handle]')
    if (handle) {
      const kind = handle.dataset.handle!
      const ids = st.selection
      const sl = currentSlide(st)
      if (kind === 'adj') {
        const el = findElement(sl.elements, handle.dataset.id!)
        if (el?.type === 'shape') dragRef.current = { kind: 'adj', id: el.id, orig: el }
        beginTransaction()
        capture(e)
        e.preventDefault()
        return
      }
      if (kind === 'rotate') {
        const els = ids.map((id) => findElement(sl.elements, id)).filter(Boolean) as SlideElement[]
        const c = els.length === 1 ? center(els[0]) : center(union(els.map(bounds)))
        dragRef.current = { kind: 'rotate', startAngle: angleTo(c, p), orig: new Map(els.map((x) => [x.id, x.rot])), center: c }
      } else if (kind === 'start' || kind === 'end') {
        const id = handle.dataset.id!
        dragRef.current = { kind: 'lineEnd', id, end: kind === 'start' ? 0 : 1, orig: findElement(sl.elements, id)! }
      } else if (cropId) {
        dragRef.current = { kind: 'crop', handle: kind as Handle, orig: findElement(sl.elements, cropId) as ImageElement }
      } else {
        const primary = handle.dataset.id!
        dragRef.current = { kind: 'resize', handle: kind as Handle, primary, orig: new Map(ids.map((id) => [id, findElement(sl.elements, id)!]).filter(([, v]) => v) as [string, SlideElement][]) }
      }
      beginTransaction()
      capture(e)
      e.preventDefault()
      return
    }

    if (target.closest('.ProseMirror')) return

    const grab = target.closest<HTMLElement>('[data-grab]')
    if (grab) {
      const id = grab.dataset.grab!
      if (st.editingId) A.exitEditing()
      store.set({ tableSel: null })
      const t = findElement(currentSlide(st).elements, id)
      if (t && !t.locked) {
        dragRef.current = { kind: 'move', start: p, client: { x: e.clientX, y: e.clientY }, moved: false, clickedId: id, wasSelected: true, orig: new Map([[id, { x: t.x, y: t.y }]]) }
        capture(e)
        e.preventDefault()
      }
      return
    }

    const td = target.closest<HTMLElement>('td[data-cell]')
    const tableNode = td?.closest<HTMLElement>('[data-el]')
    if (td && tableNode && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const id = tableNode.dataset.el!
      const t = findElement(currentSlide(st).elements, id)
      if (t?.type === 'table' && !t.locked) {
        const [r, c] = td.dataset.cell!.split(':').map(Number)
        dragRef.current = { kind: 'cells', id, start: { r, c }, client: { x: e.clientX, y: e.clientY }, moved: false }
        capture(e)
        return
      }
    }
    const ts0 = st.tableSel
    if (td && tableNode && e.shiftKey && ts0 && ts0.id === tableNode.dataset.el) {
      const [r, c] = td.dataset.cell!.split(':').map(Number)
      A.selectCells(ts0.id, ts0.anchor, { r, c })
      e.preventDefault()
      return
    }

    const elNode = target.closest<HTMLElement>('[data-el]')
    if (elNode) {
      let id = elNode.dataset.el!
      // Objects inside a group: the first click selects the group, the next one the object.
      const top = topLevelOf(currentSlide(st).elements, id)
      if (top && top.id !== id) {
        const inside = st.selection.some((sid) => sid === top.id || (top.type === 'group' && findElement(top.children, sid)))
        if (!inside) id = top.id
      }
      const wasSelected = st.selection.includes(id)
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        A.select(wasSelected ? st.selection.filter((x) => x !== id) : [...st.selection, id])
        if (wasSelected) return
      } else if (!wasSelected) A.select([id])
      if (st.editingId && st.editingId !== id) A.exitEditing()
      const sel = store.get().selection
      const sl = currentSlide()
      dragRef.current = {
        kind: 'move',
        start: p,
        client: { x: e.clientX, y: e.clientY },
        moved: false,
        clickedId: id,
        wasSelected,
        orig: new Map(sel.map((sid) => findElement(sl.elements, sid)).filter((x): x is SlideElement => !!x && !x.locked).map((x) => [x.id, { x: x.x, y: x.y }])),
      }
      capture(e)
      e.preventDefault()
      return
    }

    if (st.editingId) A.exitEditing()
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) A.clearSelection()
    dragRef.current = { kind: 'marquee', start: p, cur: p, additive: e.shiftKey || e.ctrlKey || e.metaKey }
    capture(e)
  }

  function capture(e: React.PointerEvent) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    store.set({ focus: 'canvas' })
  }

  function eraseAt(target: Element | null) {
    const node = target?.closest<HTMLElement>('[data-el]')
    if (!node) return
    const el = findElement(currentSlide().elements, node.dataset.el!)
    if (el?.type === 'ink') {
      const sid = store.get().slideId
      commit((p) => updateSlide(p, sid, (sl) => ({ ...sl, elements: sl.elements.filter((x) => x.id !== el.id) })))
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const p = toSlide(e.clientX, e.clientY)
    const sid = store.get().slideId
    const threshold = 6 / z
    switch (d.kind) {
      case 'freeform': {
        // Dragging draws freehand; moving with the button up shows the next straight segment.
        const last = d.points[d.points.length - 1]
        if (d.down && Math.hypot(p.x - last.x, p.y - last.y) > 2 / z) d.points.push(p)
        d.cur = p
        setTick((t) => t + 1)
        return
      }
      case 'scribble': {
        const last = d.points[d.points.length - 1]
        if (Math.hypot(p.x - last.x, p.y - last.y) > 1 / z) d.points.push(p)
        setTick((t) => t + 1)
        return
      }
      case 'vertex': {
        const el = pointsEl()
        if (!el) return
        const local = toLocal(el, p)
        A.updateRings(d.id, (o) => moveVertex(o, d.ring, d.index, [local.x, local.y]), false)
        return
      }
      case 'handle': {
        const el = pointsEl()
        if (!el) return
        const local = toLocal(el, p)
        A.updateRings(d.id, (o) => moveHandle(o, d.ring, d.index, d.which, [local.x, local.y]), false)
        return
      }
      case 'guide': {
        const g = guideLines()
        const v = Math.round(d.axis === 'x' ? p.x : p.y)
        store.set({ guides: { ...g, [d.axis]: g[d.axis].map((q, i) => (i === d.index ? v : q)) } })
        setGuideTip({ axis: d.axis, pos: v })
        return
      }
      case 'move': {
        let dx = p.x - d.start.x
        let dy = p.y - d.start.y
        if (!d.moved && Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < 4) return
        if (!d.moved) {
          d.moved = true
          beginTransaction()
          if (store.get().editingId) A.exitEditing()
        }
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        const ids = [...d.orig.keys()]
        const sl = currentSlide()
        const moving = ids.map((id) => findElement(sl.elements, id)!).filter(Boolean)
        const box = union(moving.map((m) => bounds({ ...m, x: d.orig.get(m.id)!.x + dx, y: d.orig.get(m.id)!.y + dy })))
        let g: Guide[] = []
        if (!e.altKey) {
          const snap = snapBox(box, otherBoxes(new Set(ids)), size, threshold)
          if (snap.dx || snap.dy || snap.guides.length) {
            dx += snap.dx
            dy += snap.dy
            g = snap.guides
          }
          const gs = store.get().gridSpacing || 8
          if (store.get().snapToGrid && !snap.dx) dx += Math.round(box.x / gs) * gs - box.x
          if (store.get().snapToGrid && !snap.dy) dy += Math.round(box.y / gs) * gs - box.y
        }
        setGuides(g)
        const movingIds = new Set(ids)
        commit((pr) =>
          updateElements(pr, sid, ids, (el) => {
            const moved = { ...el, x: d.orig.get(el.id)!.x + dx, y: d.orig.get(el.id)!.y + dy }
            // A connector dragged on its own comes loose from objects that stay in place.
            if (moved.type === 'shape' && moved.conn) {
              const keep = (g: { id: string; site: number } | null | undefined) => (g && movingIds.has(g.id) ? g : null)
              const conn = { start: keep(moved.conn.start), end: keep(moved.conn.end) }
              return { ...moved, conn: conn.start || conn.end ? conn : undefined }
            }
            return moved
          }),
        )
        break
      }
      case 'resize': {
        const prim = d.orig.get(d.primary)
        if (!prim) return
        const isImage = prim.type === 'image'
        const corner = HANDLE_DIR[d.handle][0] !== 0 && HANDLE_DIR[d.handle][1] !== 0
        const keepRatio = prim.lockAspect ? true : e.shiftKey !== (isImage && corner)
        const off = parentOffset(currentSlide().elements, d.primary) ?? { x: 0, y: 0 }
        const frame = resizeTo(prim, d.handle, { x: p.x - off.x, y: p.y - off.y }, { keepRatio, fromCenter: e.ctrlKey || e.metaKey })
        const dw = frame.w - prim.w
        const dh = frame.h - prim.h
        const [hx, hy] = HANDLE_DIR[d.handle]
        commit((pr) =>
          updateElements(pr, sid, [...d.orig.keys()], (el) => {
            const o = d.orig.get(el.id)!
            const f = el.id === d.primary ? frame : frameFrom(o, hx, hy, Math.max(1, o.w + dw), Math.max(1, o.h + dh), e.ctrlKey || e.metaKey)
            if (o.type === 'group') return { ...scaleGroup(o, f.w, f.h), x: f.x, y: f.y }
            if (o.type === 'table') return { ...scaleTable(o, f.w, f.h), x: f.x, y: f.y }
            if (o.type === 'ink') return scaleInk(o, f)
            return { ...o, ...f }
          }),
        )
        break
      }
      case 'crop': {
        const o = d.orig
        const crop = o.crop ?? { l: 0, t: 0, r: 0, b: 0 }
        const iw = o.w / (1 - crop.l - crop.r)
        const ih = o.h / (1 - crop.t - crop.b)
        const fullX = o.x - crop.l * iw
        const fullY = o.y - crop.t * ih
        const f = resizeTo(o, d.handle, p, { keepRatio: e.shiftKey, fromCenter: false })
        const x = Math.max(fullX, f.x)
        const y = Math.max(fullY, f.y)
        const r = Math.min(fullX + iw, f.x + f.w)
        const b = Math.min(fullY + ih, f.y + f.h)
        if (r - x < 4 || b - y < 4) return
        const next = { l: (x - fullX) / iw, t: (y - fullY) / ih, r: (fullX + iw - r) / iw, b: (fullY + ih - b) / ih }
        commit((pr) => updateElements(pr, sid, [o.id], (el) => ({ ...el, x, y, w: r - x, h: b - y, crop: next }) as SlideElement))
        break
      }
      case 'lineEnd': {
        const [a, b] = lineEnds(d.orig)
        let q = p
        const fixed = d.end === 0 ? b : a
        if (e.shiftKey) {
          const ang = Math.atan2(q.y - fixed.y, q.x - fixed.x)
          const snapA = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
          const len = Math.hypot(q.x - fixed.x, q.y - fixed.y)
          q = { x: fixed.x + Math.cos(snapA) * len, y: fixed.y + Math.sin(snapA) * len }
        }
        // Ends dropped on a connection site of another object stay glued to it.
        const glue = e.altKey ? null : nearestSite(currentSlide().elements, q, threshold * 1.5, d.id)
        if (glue) q = glue.pt
        setSites(e.altKey ? null : sitesNear(q, d.id))
        const frame = d.end === 0 ? frameFromEnds(q, b) : frameFromEnds(a, q)
        const key = d.end === 0 ? 'start' : 'end'
        commit((pr) =>
          updateElements(pr, sid, [d.id], (el) => {
            if (el.type !== 'shape') return { ...el, ...frame }
            const conn = { ...el.conn, [key]: glue ? { id: glue.id, site: glue.site } : null }
            return { ...el, ...frame, conn: conn.start || conn.end ? conn : undefined }
          }),
        )
        break
      }
      case 'rotate': {
        const delta = angleTo(d.center, p) - d.startAngle
        commit((pr) =>
          updateElements(pr, sid, [...d.orig.keys()], (el) => {
            let rot = normAngle(d.orig.get(el.id)! + delta)
            if (e.shiftKey) rot = Math.round(rot / 15) * 15 % 360
            return { ...el, rot }
          }),
        )
        break
      }
      case 'marquee':
      case 'create': {
        d.cur = p
        const tl = store.get().tool
        if (tl.kind === 'shape' && tl.preset.open && (tl.preset.prst === 'line' || tl.preset.prst.includes('Connector'))) setSites(sitesNear(p))
        setTick((t) => t + 1)
        break
      }
      case 'pen':
        d.points.push(p)
        setTick((t) => t + 1)
        break
      case 'erase':
        eraseAt(document.elementFromPoint(e.clientX, e.clientY))
        break
      case 'adj': {
        const o = d.orig
        // Pointer in the shape's own (unrotated) coordinates.
        const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 }
        const a = (-o.rot * Math.PI) / 180
        const lx = Math.cos(a) * (p.x - c.x) - Math.sin(a) * (p.y - c.y) + o.w / 2
        const v = adjFromPoint(o, lx)
        if (v !== null) commit((pr) => updateElements(pr, sid, [o.id], (el) => (el.type === 'shape' ? { ...el, adj: [v, ...(el.adj ?? []).slice(1)] } : el)))
        break
      }
      case 'cells': {
        if (!d.moved && Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < 4) return
        const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('td[data-cell]')
        if (!hit || hit.closest<HTMLElement>('[data-el]')?.dataset.el !== d.id) return
        const [r, c] = hit.dataset.cell!.split(':').map(Number)
        if (!d.moved && r === d.start.r && c === d.start.c) return
        d.moved = true
        A.selectCells(d.id, d.start, { r, c })
        break
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current
    if (d?.kind === 'freeform') {
      d.down = false
      return
    }
    dragRef.current = null
    setGuides([])
    if (!d) return
    const st = store.get()
    const sl = currentSlide(st)
    switch (d.kind) {
      case 'scribble': {
        const pts = d.points.map((q) => [q.x, q.y] as [number, number])
        const first = d.points[0]
        const last = d.points[d.points.length - 1]
        if (pts.length >= 2) A.addFreeform(pts, d.points.length > 8 && Math.hypot(last.x - first.x, last.y - first.y) < 8 / z, true)
        else store.set({ tool: { kind: 'select' } })
        return
      }
      case 'guide': {
        // Dragging a guide off the slide removes it.
        const g = guideLines()
        const v = g[d.axis][d.index]
        if (v < 0 || v > (d.axis === 'x' ? size.w : size.h)) store.set({ guides: { ...g, [d.axis]: g[d.axis].filter((_, i) => i !== d.index) } })
        setGuideTip(null)
        return
      }
      case 'vertex':
      case 'handle':
        // Fit the shape's box around the edited outline.
        A.updateRings(d.id, (o) => o, true)
        endTransaction()
        return
      case 'move': {
        if (!d.moved && st.painter) {
          paintElement(d.clickedId)
          return
        }
        if (!d.moved && st.animPainter) {
          AA.paintAnimations(d.clickedId)
          return
        }
        if (!d.moved) {
          const el = findElement(sl.elements, d.clickedId)
          const isText = el?.type === 'shape' && (el.textBox || (el.placeholder && el.placeholder.style !== 'pic'))
          const canEdit = el?.type === 'shape' && !isLineElement(el)
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && canEdit && (isText || d.wasSelected) && st.editingId !== d.clickedId) {
            A.select([d.clickedId])
            A.enterEditing(d.clickedId, { kind: 'point', x: e.clientX, y: e.clientY })
          }
          return
        }
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+drag copies: keep the moved copies, put the originals back.
          const ids = [...d.orig.keys()]
          const moved = ids.map((id) => findElement(sl.elements, id)!).filter(Boolean)
          const copies = moved.map((m) => cloneElement(m))
          commit((pr) =>
            updateSlide(pr, st.slideId, (x) => ({
              ...x,
              elements: [...x.elements.map((el) => (d.orig.has(el.id) ? { ...el, ...d.orig.get(el.id)! } : el)), ...copies],
            })),
            { selection: copies.map((c) => c.id) },
          )
        }
        endTransaction()
        return
      }
      case 'lineEnd':
        setSites(null)
        endTransaction()
        return
      case 'resize':
      case 'crop':
      case 'rotate':
        endTransaction()
        return
      case 'marquee': {
        const r = rectOf(d.start, d.cur)
        if (r.w < 2 && r.h < 2) return
        const hits = sl.elements.filter((el) => !el.hidden && !el.locked && contains(r, bounds(el))).map((el) => el.id)
        A.select(d.additive ? [...new Set([...st.selection, ...hits])] : hits)
        return
      }
      case 'create':
        finishCreate(d.start, d.cur, e.shiftKey)
        return
      case 'adj':
        endTransaction()
        return
      case 'tableLine': {
        const t = findElement(sl.elements, d.id)
        if (t?.type !== 'table') return
        const dx = e.clientX - d.client.x
        const dy = e.clientY - d.client.y
        const r = d.td.getBoundingClientRect()
        const dist = { t: d.client.y - r.top, b: r.bottom - d.client.y, l: d.client.x - r.left, r: r.right - d.client.x }
        const side = (Object.keys(dist) as ('t' | 'b' | 'l' | 'r')[]).reduce((a, b) => (dist[a] <= dist[b] ? a : b))
        const near = dist[side] <= 8
        const o = originOf(t, d.r, d.c)
        let next = t
        if (st.tool.kind === 'eraseTable') {
          if (!near) return
          const other = side === 't' ? { r: o.r - 1, c: o.c } : side === 'b' ? { r: o.r + (t.rows[o.r].cells[o.c].rowSpan ?? 1), c: o.c } : side === 'l' ? { r: o.r, c: o.c - 1 } : { r: o.r, c: o.c + (t.rows[o.r].cells[o.c].colSpan ?? 1) }
          if (other.r < 0 || other.c < 0 || other.r >= t.rows.length || other.c >= t.cols.length) return
          next = mergeCells(t, normRange(o, other))
        } else if (Math.hypot(dx, dy) < 6) {
          if (!near) return
          const p = store.get().tablePen
          next = applyBorders(t, { r0: o.r, c0: o.c, r1: o.r, c1: o.c }, side === 't' ? 'top' : side === 'b' ? 'bottom' : side === 'l' ? 'left' : 'right', { color: p.color, width: p.width, dash: p.dash })
        } else next = Math.abs(dx) > Math.abs(dy) ? splitCell(t, o.r, o.c, 2, 1) : splitCell(t, o.r, o.c, 1, 2)
        if (next !== t) commit((pr) => updateElements(pr, st.slideId, [t.id], () => next), { selection: [t.id] })
        return
      }
      case 'cells': {
        if (d.moved) return
        if (st.painter) {
          paintElement(d.id)
          return
        }
        const ts = store.get().tableSel
        if (st.editingId === d.id && ts?.editing && ts.anchor.r === d.start.r && ts.anchor.c === d.start.c) return
        A.enterCellEditing(d.id, d.start.r, d.start.c, { kind: 'point', x: e.clientX, y: e.clientY })
        return
      }
      case 'pen': {
        if (d.points.length < 2) return
        if (st.tool.kind === 'motionPath') {
          const t = st.tool
          const p0 = d.points[0]
          const step = Math.max(1, Math.floor(d.points.length / 60))
          const pts = d.points.filter((_, i) => i % step === 0 || i === d.points.length - 1)
          const path = `M0 0 ${pts.slice(1).map((q) => `L${Math.round(q.x - p0.x)} ${Math.round(q.y - p0.y)}`).join(' ')}`
          AA.setCustomPath(t.targetId, t.entryId, path)
          store.set({ tool: { kind: 'select' } })
          return
        }
        if (st.tool.kind === 'lasso') {
          // Objects whose center lies inside the drawn loop are selected.
          const poly = d.points.map((q) => [q.x, q.y] as [number, number])
          const hits = sl.elements.filter((el) => !el.hidden && !el.locked && insidePolygon(center(bounds(el)), poly)).map((el) => el.id)
          A.select(e.shiftKey ? [...new Set([...st.selection, ...hits])] : hits)
          return
        }
        const tool = st.tool.kind === 'pen' ? st.tool : null
        if (!tool) return
        if (st.inkToShape && !tool.highlighter) {
          const found = recognizeInk(d.points.map((q) => [q.x, q.y]))
          if (found) {
            const preset = SHAPE_PRESETS.find((sp) => sp.prst === found.prst) ?? { id: found.prst, prst: found.prst, label: found.prst, category: 'Basic Shapes' as const }
            const shape = createShape(preset, { x: found.x, y: found.y, w: found.w, h: found.h, flipH: found.flipH, flipV: found.flipV }, sl.elements)
            const line = { color: tool.color, width: Math.max(0.75, Math.round(tool.width * 0.75 * 4) / 4), dash: 'solid' as const }
            const el = { ...shape, fill: { type: 'none' as const }, line }
            commit((pr) => updateSlide(pr, st.slideId, (x2) => ({ ...x2, elements: [...x2.elements, el] })))
            return
          }
        }
        const xs = d.points.map((q) => q.x)
        const ys = d.points.map((q) => q.y)
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        const ink: SlideElement = {
          id: uid(),
          type: 'ink',
          name: `Ink ${sl.elements.length + 1}`,
          x,
          y,
          w: Math.max(1, Math.max(...xs) - x),
          h: Math.max(1, Math.max(...ys) - y),
          rot: 0,
          points: d.points.map((q) => [q.x - x, q.y - y]),
          color: tool.color,
          width: tool.width,
          highlighter: tool.highlighter,
        }
        commit((pr) => updateSlide(pr, st.slideId, (x2) => ({ ...x2, elements: [...x2.elements, ink] })))
        return
      }
    }
  }

  function finishCreate(a: Pt, b: Pt, shift: boolean) {
    const st = store.get()
    const sl = currentSlide(st)
    const tool = st.tool
    let r = rectOf(a, b)
    const tiny = r.w < 3 && r.h < 3
    if (tool.kind === 'drawTable') {
      if (tiny) return
      const pen = st.tablePen
      const line = { color: pen.color, width: pen.width, dash: pen.dash }
      const t = createTable(1, 1, { x: r.x, y: r.y, w: Math.max(24, r.w) }, uid(), `Table ${sl.elements.length + 1}`, 'none')
      const drawn = syncSize(applyBorders({ ...t, opts: { ...t.opts, headerRow: false, bandedRows: false }, rows: [{ ...t.rows[0], h: Math.max(24, r.h) }] }, { r0: 0, c0: 0, r1: 0, c1: 0 }, 'outside', line))
      commit((p) => updateSlide(p, st.slideId, (x) => ({ ...x, elements: [...x.elements, drawn] })), { selection: [drawn.id] })
      return
    }
    if (tool.kind === 'textbox') {
      const tb = tiny ? createTextBox({ x: a.x, y: a.y, w: 40, h: 40 }, sl.elements, false) : createTextBox({ x: r.x, y: r.y, w: r.w, h: Math.max(r.h, 40) }, sl.elements, true)
      if (tool.vertical && tb.text) tb.text.vert = 'vert'
      A.addElements([tb], { kind: 'end' })
      return
    }
    if (tool.kind !== 'shape') return
    const preset = tool.preset
    if (preset.open && (preset.prst === 'line' || preset.prst.includes('Connector'))) {
      let end = tiny ? { x: a.x + 96, y: a.y } : b
      if (shift) {
        const ang = Math.atan2(end.y - a.y, end.x - a.x)
        const snapA = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
        const len = Math.hypot(end.x - a.x, end.y - a.y)
        end = { x: a.x + Math.cos(snapA) * len, y: a.y + Math.sin(snapA) * len }
      }
      // Connector ends that start or end on a connection site are glued to that object.
      const g0 = nearestSite(sl.elements, a, 9 / z)
      const g1 = nearestSite(sl.elements, end, 9 / z)
      const f = frameFromEnds(g0?.pt ?? a, g1?.pt ?? end)
      const shape = createShape(preset, f, sl.elements)
      if (g0 || g1) shape.conn = { start: g0 ? { id: g0.id, site: g0.site } : null, end: g1 ? { id: g1.id, site: g1.site } : null }
      setSites(null)
      A.addElements([shape])
      return
    }
    if (tiny) r = { x: a.x - 48, y: a.y - 48, w: 96, h: 96 }
    else if (shift) {
      const sz = Math.max(r.w, r.h)
      r = { x: b.x < a.x ? a.x - sz : a.x, y: b.y < a.y ? a.y - sz : a.y, w: sz, h: sz }
    }
    A.addElements([createShape(preset, r, sl.elements)])
  }

  function onDoubleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (dragRef.current?.kind === 'freeform') {
      finishFreeform(false)
      return
    }
    const pe = pointsEl()
    if (pe) {
      if (target.closest('.pts-path')) insertPointAt(pe, toSlide(e.clientX, e.clientY))
      return
    }
    if (target.closest('.ProseMirror')) return
    const node = target.closest<HTMLElement>('[data-el]')
    if (!node) return
    const el = findElement(slide.elements, node.dataset.el!)
    if (el?.type === 'table') return
    if (el?.type === 'diagram') {
      store.set({ diagramPane: true, tab: 'diagramDesign' })
      return
    }
    if (el?.type === 'shape' && !isLineElement(el)) A.enterEditing(el.id, { kind: 'point', x: e.clientX, y: e.clientY })
    if (el?.type === 'image') window.dispatchEvent(new CustomEvent('kontor:tab', { detail: 'pictureFormat' }))
  }

  function onContextMenu(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('.ProseMirror')) return
    e.preventDefault()
    const node = target.closest<HTMLElement>('[data-el]')
    const st = store.get()
    if (node && !st.selection.includes(node.dataset.el!)) A.select([node.dataset.el!])
    const sel = store.get().selection
    const one = sel.length === 1 ? findElement(currentSlide().elements, sel[0]) : undefined
    const vtx = target.closest<HTMLElement>('[data-vertex]')
    const pe = pointsEl()
    if (pe) {
      const [ring, index] = vtx ? vtx.dataset.vertex!.split(':').map(Number) : [-1, -1]
      const at = toSlide(e.clientX, e.clientY)
      const seg = vtx ? null : segmentAt(pe, at)
      const type = vtx ? (pe.handles?.[ring]?.[index]?.t ?? (pe.handles?.[ring]?.[index]?.i || pe.handles?.[ring]?.[index]?.o ? 'corner' : null)) : null
      if (vtx) store.set({ editVertex: `${ring}:${index}` })
      const curved = seg ? isCurved(shapeOutline(pe), seg.ring, seg.seg, !!pe.open) : false
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          ...(vtx
            ? ([
                { label: t('Delete Point'), icon: Trash2, onClick: () => A.deleteVertex(pe.id, ring, index) },
                'separator',
                { label: t('Smooth Point'), active: type === 'smooth', onClick: () => A.setVertexType(pe.id, ring, index, 'smooth') },
                { label: t('Straight Point'), active: type === 'straight', onClick: () => A.setVertexType(pe.id, ring, index, 'straight') },
                { label: t('Corner Point'), active: type === 'corner' || type === null, onClick: () => A.setVertexType(pe.id, ring, index, 'corner') },
              ] as MenuItem[])
            : ([
                { label: t('Add Point'), onClick: () => insertPointAt(pe, at) },
                ...(seg ? [{ label: curved ? t('Straight Segment') : t('Curved Segment'), onClick: () => A.setSegmentType(pe.id, seg.ring, seg.seg, !curved) }] : []),
              ] as MenuItem[])),
          'separator',
          { label: pe.open ? t('Close Path') : t('Open Path'), onClick: () => A.togglePathOpen(pe.id) },
          'separator',
          { label: t('Exit Edit Points'), onClick: () => A.exitEditPoints() },
        ],
      })
      return
    }
    const paste: MenuItem = { label: t('Paste'), icon: ClipboardPaste, shortcut: 'Ctrl+V', onClick: () => A.pasteClipboard(), disabled: !A.getClipboard() }
    const items: MenuItem[] = sel.length
      ? [
          { label: t('Cut'), icon: Scissors, shortcut: 'Ctrl+X', onClick: A.cutSelection },
          { label: t('Copy'), icon: Copy, shortcut: 'Ctrl+C', onClick: () => A.copySelection() },
          paste,
          'separator',
          ...(one?.type === 'shape' && !isLineElement(one) ? [{ label: t('Edit Text'), icon: Type, onClick: () => A.enterEditing(one.id, { kind: 'end' }) } as MenuItem] : []),
          ...(A.canEditPoints(one) ? [{ label: t('Edit Points'), icon: Spline, onClick: () => A.startEditPoints(one!.id) } as MenuItem] : []),
          ...(one?.type === 'image' && !one.rot ? [{ label: t('Crop'), icon: Crop, onClick: () => setCropId(one.id) } as MenuItem] : []),
          ...(one?.type === 'table' ? tableMenu() : []),
          sel.length > 1 ? { label: t('Group'), icon: Group, shortcut: 'Ctrl+G', onClick: A.groupSelection } : one?.type === 'group' ? { label: t('Ungroup'), icon: Ungroup, shortcut: 'Ctrl+Shift+G', onClick: A.ungroupSelection } : 'separator',
          { label: t('Bring to Front'), icon: BringToFront, onClick: A.bringToFront },
          { label: t('Send to Back'), icon: SendToBack, onClick: A.sendToBack },
          'separator',
          { label: one?.type === 'image' ? t('Format Picture…') : t('Format Shape…'), icon: Paintbrush, onClick: onFormatShape },
          ...(one ? [{ label: t('Edit Alt Text…'), onClick: () => window.dispatchEvent(new CustomEvent('kontor:dialog', { detail: 'altText' })) } as MenuItem] : []),
        ]
      : [
          paste,
          'separator',
          { heading: t('Layout') },
          ...LAYOUTS.map((l) => ({ label: l.name, active: slide.layout === l.id, onClick: () => A.setLayout(l.id) })),
          'separator',
          { label: t('Reset Slide'), icon: RotateCcw, onClick: () => A.resetSlides() },
          { label: t('Format Background…'), icon: Paintbrush, onClick: onFormatBackground },
          { label: st.showGrid ? t('Hide Gridlines') : t('Show Gridlines'), onClick: () => store.set({ showGrid: !st.showGrid }) },
          { label: st.showGuides ? t('Hide Guides') : t('Show Guides'), onClick: () => store.set({ showGuides: !st.showGuides }) },
          ...(st.showGuides
            ? ([
                { label: t('Add Vertical Guide'), onClick: () => store.set({ guides: { ...guideLines(), x: [...guideLines().x, Math.round(toSlide(e.clientX, e.clientY).x)] } }) },
                { label: t('Add Horizontal Guide'), onClick: () => store.set({ guides: { ...guideLines(), y: [...guideLines().y, Math.round(toSlide(e.clientX, e.clientY).y)] } }) },
              ] as MenuItem[])
            : []),
          { label: t('New Comment'), icon: MessageSquarePlus, onClick: () => window.dispatchEvent(new CustomEvent('kontor:new-comment')) },
        ]
    setMenu({ x: e.clientX, y: e.clientY, items: items.filter((it, i, arr) => !(it === 'separator' && (i === 0 || arr[i - 1] === 'separator'))) })
  }

  function onDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    const p = toSlide(e.clientX, e.clientY)
    files.forEach((f, i) => A.insertImageFile(f, { x: p.x + i * 16, y: p.y + i * 16 }))
  }

  // ---------- Overlays ----------

  const d = dragRef.current
  // Selection frames use slide coordinates (grouped objects are offset by their group).
  const selected = s.selection
    .map((id) => {
      const el = findElement(slide.elements, id)
      const off = el && parentOffset(slide.elements, id)
      return el && off && (off.x || off.y) ? ({ ...el, x: el.x + off.x, y: el.y + off.y } as SlideElement) : el
    })
    .filter((x): x is SlideElement => !!x)
  const cropEl = cropId ? (selected.find((x) => x.id === cropId) as ImageElement | undefined) : undefined
  const cursor = s.tool.kind === 'transparentColor' ? 'copy' : s.tool.kind === 'select' ? undefined : s.tool.kind === 'pen' || s.tool.kind === 'drawTable' ? 'crosshair' : s.tool.kind === 'eraser' || s.tool.kind === 'eraseTable' ? 'cell' : 'crosshair'
  const frameStyle: CSSProperties = { width: size.w * z, height: size.h * z, cursor }
  const filter = s.colorMode === 'grayscale' ? 'grayscale(1)' : s.colorMode === 'bw' ? 'grayscale(1) contrast(4)' : undefined

  return (
    <div className="canvas-scroll" ref={scrollRef} tabIndex={-1} aria-label={t('Slide')} onFocus={() => store.get().focus !== 'canvas' && store.set({ focus: 'canvas' })} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="canvas-inner" style={{ padding: padFor(scrollRef.current) }}>
        <div
          className="slide-frame"
          ref={frameRef}
          style={frameStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onMouseUp={(e) => {
            if (store.get().painter && (e.target as HTMLElement).closest('.ProseMirror')) setTimeout(paintSelection)
          }}
        >
          {s.showRuler && <Rulers w={size.w} h={size.h} z={z} />}
          <div className="slide-scale" style={{ transform: `scale(${z})`, filter }}>
            <SlideView
              slide={slide}
              index={index}
              {...presProps(s.pres)}
              mode="edit"
              editingId={s.editingId}
              renderEditor={renderEditor}
              onAutofit={onAutofit}
              onPicturePlaceholder={onPicturePlaceholder}
              renderCellEditor={renderCellEditor}
              cellSel={s.tableSel ? { id: s.tableSel.id, range: normRange(s.tableSel.anchor, s.tableSel.focus), editing: s.tableSel.editing } : null}
              onTableMeasure={onTableMeasure}
            />
            {s.showGrid && <div className="grid-overlay" style={{ width: size.w, height: size.h, backgroundSize: `${Math.max(4, s.gridSpacing * Math.max(1, Math.ceil(6 / (s.gridSpacing * z))))}px ${Math.max(4, s.gridSpacing * Math.max(1, Math.ceil(6 / (s.gridSpacing * z))))}px` }} />}
            {s.showGuides && (
              <>
                {(s.guides ?? { x: [size.w / 2], y: [size.h / 2] }).x.map((x, i) => (
                  <div key={`gx${i}`} className="static-guide sg-x" data-guide={`x:${i}`} title={t('Drag to move the guide; drag it off the slide to remove it')} style={{ left: x, height: size.h }} />
                ))}
                {(s.guides ?? { x: [size.w / 2], y: [size.h / 2] }).y.map((y, i) => (
                  <div key={`gy${i}`} className="static-guide sg-y" data-guide={`y:${i}`} title={t('Drag to move the guide; drag it off the slide to remove it')} style={{ top: y, width: size.w }} />
                ))}
                {guideTip && (
                  <div className="guide-tip" style={guideTip.axis === 'x' ? { left: guideTip.pos + 4, top: 4 } : { top: guideTip.pos + 4, left: 4 }}>
                    {(Math.abs(guideTip.pos - (guideTip.axis === 'x' ? size.w : size.h) / 2) / 96).toFixed(2)}″
                  </div>
                )}
              </>
            )}
            {(d?.kind === 'freeform' || d?.kind === 'scribble') && (
              <svg className="pen-preview" width={size.w} height={size.h}>
                <path
                  d={(() => {
                    const pts = [...d.points, ...(d.kind === 'freeform' && d.cur ? [d.cur] : [])].map((q) => [q.x, q.y] as [number, number])
                    return d.kind === 'freeform' && d.smooth ? outlinePath({ rings: [pts], handles: [smoothThrough(pts, false)] }, true) : pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ')
                  })()}
                  fill="none"
                  stroke="#2F5597"
                  strokeWidth={1.5 / z}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {d.kind === 'freeform' && d.points.length >= 3 && <circle cx={d.points[0].x} cy={d.points[0].y} r={5 / z} fill="none" stroke="#2F5597" strokeWidth={1 / z} />}
              </svg>
            )}
            {d?.kind === 'pen' && (
              <svg className="pen-preview" width={size.w} height={size.h}>
                <path
                  d={d.points.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' ')}
                  fill="none"
                  stroke={s.tool.kind === 'pen' ? s.tool.color : '#7a7a7a'}
                  strokeDasharray={s.tool.kind === 'motionPath' || s.tool.kind === 'lasso' ? '6 4' : undefined}
                  strokeOpacity={s.tool.kind === 'pen' && s.tool.highlighter ? 0.45 : 1}
                  strokeWidth={s.tool.kind === 'pen' ? s.tool.width : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>

          {cropEl && <CropGhost el={cropEl} z={z} />}
          {selected.map((el) =>
            s.editPointsId === el.id && el.type === 'shape' && el.rings ? (
              <PointsOverlay key={el.id} el={el} z={z} />
            ) : (
              <SelectionFrame key={el.id} el={el} z={z} editing={s.editingId === el.id} cropping={cropEl?.id === el.id} showRotate={selected.length >= 1 && !cropEl} />
            ),
          )}
          {s.tab === 'animations' && <AnimationOverlay slide={slide} z={z} selected={s.selection} animSel={s.animSel} />}
          {s.diagramPane &&
            selected.length === 1 &&
            selected[0].type === 'diagram' &&
            (() => {
              const d = selected[0]
              const left = d.x * z - 232
              return <DiagramTextPane d={d} style={{ left: left < 0 ? d.x * z + 12 : left, top: Math.max(0, d.y * z) }} />
            })()}
          {sites?.map((q, i) => <div key={`cs${i}`} className="conn-site" style={{ left: q.x * z, top: q.y * z }} />)}
          {guides.map((g, i) => (
            <div key={i} className={`smart-guide sg-${g.axis}`} style={g.axis === 'x' ? { left: g.pos * z, top: g.from * z, height: (g.to - g.from) * z } : { top: g.pos * z, left: g.from * z, width: (g.to - g.from) * z }} />
          ))}
          {d?.kind === 'marquee' && <div className="marquee" style={boxStyle(rectOf(d.start, d.cur), z)} />}
          {d?.kind === 'create' && <div className={`create-preview${s.tool.kind === 'textbox' ? ' is-text' : ''}`} style={boxStyle(rectOf(d.start, d.cur), z)} />}
        </div>
      </div>
      {menu && <ContextMenu at={menu} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** Animation numbers next to objects and motion paths, shown while the Animations tab is open. */
function AnimationOverlay({ slide, z, selected, animSel }: { slide: import('../model/types').Slide; z: number; selected: string[]; animSel: string | null }) {
  const list = (slide.animations ?? []).filter((a) => slide.elements.some((e) => e.id === a.targetId))
  const drag = useRef<{ id: string; start: Pt; end: { x: number; y: number }; path: string } | null>(null)
  let click = 0
  const badges = new Map<string, string[]>()
  list.forEach((a, i) => {
    const n = a.triggerId ? '⚡' : a.trigger === 'click' ? String(++click) : i === 0 ? '0' : String(click)
    badges.set(a.targetId, [...(badges.get(a.targetId) ?? []), n])
  })
  return (
    <>
      {[...badges.entries()].map(([id, nums]) => {
        const el = slide.elements.find((e) => e.id === id)!
        return (
          <span key={id} className="anim-badges" style={{ left: el.x * z - 4, top: el.y * z }}>
            {[...new Set(nums)].map((n, i) => (
              <span key={i} className="anim-badge">
                {n}
              </span>
            ))}
          </span>
        )
      })}
      {list
        .filter((a) => a.effect === 'path' && a.path)
        .map((a) => {
          const el = slide.elements.find((e) => e.id === a.targetId)!
          const cx = (el.x + el.w / 2) * z
          const cy = (el.y + el.h / 2) * z
          const end = pathEnd(a.path!)
          const active = animSel === a.id || selected.includes(a.targetId)
          return (
            <svg key={a.id} className={`motion-path${active ? ' is-active' : ''}`} style={{ left: cx, top: cy }} width="1" height="1" overflow="visible">
              <path d={a.path} transform={`scale(${z})`} fill="none" stroke="#6b6b6b" strokeWidth={1.25 / z} strokeDasharray={`${4 / z} ${3 / z}`} />
              <circle cx={0} cy={0} r={4} fill="#3FA34D" />
              <circle
                cx={end.x * z}
                cy={end.y * z}
                r={active ? 6 : 4}
                fill="#D9483B"
                className="motion-end"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture(e.pointerId)
                  drag.current = { id: a.id, start: { x: e.clientX, y: e.clientY }, end, path: a.path! }
                  store.set({ animSel: a.id })
                }}
                onPointerMove={(e) => {
                  const d = drag.current
                  if (!d) return
                  const x = d.end.x + (e.clientX - d.start.x) / z
                  const y = d.end.y + (e.clientY - d.start.y) / z
                  AA.updateEntries({ path: retargetPath(d.path, x, y) }, [d.id])
                }}
                onPointerUp={() => (drag.current = null)}
              />
            </svg>
          )
        })}
    </>
  )
}

// Yellow adjustment handles: the first adjust value of shapes whose geometry has an inset along the top edge.
const ADJ: Record<string, { def: number; rel: 'ss' | 'w'; max: (w: number, h: number) => number }> = {
  roundRect: { def: 16667, rel: 'ss', max: () => 50000 },
  triangle: { def: 50000, rel: 'w', max: () => 100000 },
  parallelogram: { def: 25000, rel: 'ss', max: (w, h) => (w / Math.min(w, h)) * 100000 },
  trapezoid: { def: 25000, rel: 'ss', max: (w, h) => (w / 2 / Math.min(w, h)) * 100000 },
}

function adjHandleX(el: ShapeElement): number | null {
  const a = ADJ[el.prst]
  if (!a) return null
  const v = el.adj?.[0] ?? a.def
  return ((a.rel === 'w' ? el.w : Math.min(el.w, el.h)) * v) / 100000
}

function adjFromPoint(el: ShapeElement, lx: number): number | null {
  const a = ADJ[el.prst]
  if (!a) return null
  const base = a.rel === 'w' ? el.w : Math.min(el.w, el.h)
  return Math.round(Math.max(0, Math.min(a.max(el.w, el.h), (lx / Math.max(1, base)) * 100000)))
}

function tableMenu(): MenuItem[] {
  const upd = (fn: Parameters<typeof A.updateTable>[0]) => () => A.updateTable(fn)
  return [
    { label: t('Insert Rows Above'), onClick: upd((t, rg) => insertRow(t, rg.r0, rg.r0)) },
    { label: t('Insert Rows Below'), onClick: upd((t, rg) => insertRow(t, rg.r1 + 1, rg.r1)) },
    { label: t('Insert Columns Left'), onClick: upd((t, rg) => insertCol(t, rg.c0, rg.c0)) },
    { label: t('Insert Columns Right'), onClick: upd((t, rg) => insertCol(t, rg.c1 + 1, rg.c1)) },
    { label: t('Delete Rows'), onClick: upd((t, rg) => deleteRows(t, rg.r0, rg.r1)) },
    { label: t('Delete Columns'), onClick: upd((t, rg) => deleteCols(t, rg.c0, rg.c1)) },
    { label: t('Merge Cells'), disabled: !A.currentTable()?.hasCellSel, onClick: upd((t, rg) => mergeCells(t, rg)) },
    { label: t('Split Cells…'), onClick: () => window.dispatchEvent(new CustomEvent('kontor:dialog', { detail: 'splitCells' })) },
    'separator',
  ]
}

function rectOf(a: Pt, b: Pt) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

function contains(o: { x: number; y: number; w: number; h: number }, i: { x: number; y: number; w: number; h: number }) {
  return i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h
}

function boxStyle(r: { x: number; y: number; w: number; h: number }, z: number): CSSProperties {
  return { left: r.x * z, top: r.y * z, width: r.w * z, height: r.h * z }
}

function SelectionFrame({ el, z, editing, cropping, showRotate }: { el: SlideElement; z: number; editing: boolean; cropping: boolean; showRotate: boolean }) {
  if (isLineElement(el)) {
    const [a, b] = lineEnds(el)
    return (
      <>
        <div className="line-handle" data-handle="start" data-id={el.id} style={{ left: a.x * z, top: a.y * z }} />
        <div className="line-handle" data-handle="end" data-id={el.id} style={{ left: b.x * z, top: b.y * z }} />
      </>
    )
  }
  return (
    <div
      className={`sel-frame${editing ? ' is-editing' : ''}${cropping ? ' is-cropping' : ''}${el.locked ? ' is-locked' : ''}`}
      style={{ left: el.x * z, top: el.y * z, width: el.w * z, height: el.h * z, transform: el.rot ? `rotate(${el.rot}deg)` : undefined }}
    >
      {el.type === 'table' && !el.locked && ['t', 'r', 'b', 'l'].map((side) => <div key={side} className={`table-grab tg-${side}`} data-grab={el.id} title={t('Drag to move the table')} />)}
      {!el.locked &&
        HANDLES.map((h) => <div key={h} className={`handle h-${h}${cropping ? ' crop-handle' : ''}`} data-handle={h} data-id={el.id} />)}
      {!el.locked && !cropping && el.type === 'shape' && adjHandleX(el) !== null && <div className="adj-handle" data-handle="adj" data-id={el.id} style={{ left: adjHandleX(el)! * z }} title={t('Drag to adjust the shape')} />}
      {showRotate && !el.locked && (
        <div className="rotate-handle" data-handle="rotate" data-id={el.id} title={t('Rotate')}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  )
}

/** Edit Points: the outline and a handle on every point (drag to move, Ctrl+click to delete, double-click the outline to add). */
function PointsOverlay({ el, z }: { el: ShapeElement; z: number }) {
  const outline = scaleOutline(shapeOutline(el), z, z)
  const selected = useStore((s) => s.editVertex)
  const flip = el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : ''
  const d = outlinePath(outline, !!el.open)
  const [sr, si] = selected ? selected.split(':').map(Number) : [-1, -1]
  const sel = outline.rings[sr]?.[si]
  const h = outline.handles[sr]?.[si]
  return (
    <div className="pts-frame" style={{ left: el.x * z, top: el.y * z, width: el.w * z, height: el.h * z, transform: `${el.rot ? `rotate(${el.rot}deg)` : ''} ${flip}`.trim() || undefined }}>
      <svg className="pts-svg" width={Math.max(1, el.w * z)} height={Math.max(1, el.h * z)} overflow="visible">
        <path className="pts-path" d={d} fill="none" stroke="transparent" strokeWidth={12} />
        <path d={d} fill="none" stroke="#C00000" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
        {sel &&
          (['i', 'o'] as const).map((k) => h?.[k] && <line key={k} x1={sel[0]} y1={sel[1]} x2={h[k]![0]} y2={h[k]![1]} stroke="#555" strokeWidth={1} pointerEvents="none" />)}
      </svg>
      {outline.rings.flatMap((r, ri) =>
        r.map(([x, y], i) => <div key={`${ri}:${i}`} className={`pts-handle${ri === sr && i === si ? ' is-selected' : ''}`} data-vertex={`${ri}:${i}`} style={{ left: x, top: y }} title={t('Drag to move the point; right-click for point types; Ctrl+click to delete it')} />),
      )}
      {sel && (['i', 'o'] as const).map((k) => h?.[k] && <div key={k} className="bez-handle" data-bez={`${sr}:${si}:${k}`} style={{ left: h[k]![0], top: h[k]![1] }} title={t('Drag to change the curve')} />)}
    </div>
  )
}

function CropGhost({ el, z }: { el: ImageElement; z: number }) {
  const crop = el.crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const iw = el.w / (1 - crop.l - crop.r)
  const ih = el.h / (1 - crop.t - crop.b)
  return <img className="crop-ghost" src={el.src} alt="" draggable={false} style={{ left: (el.x - crop.l * iw) * z, top: (el.y - crop.t * ih) * z, width: iw * z, height: ih * z }} />
}

/** Rulers in inches with 0 at the slide center, as in the original program. */
function Rulers({ w, h, z }: { w: number; h: number; z: number }) {
  const ticks = (len: number) => {
    const out: { pos: number; label?: string; major: boolean }[] = []
    const half = len / 2
    for (let v = -Math.floor(half / 12) * 12; v <= half; v += 12) {
      const inch = v / 96
      const major = Math.abs(v % 96) < 0.01
      out.push({ pos: half + v, major, label: major ? String(Math.abs(Math.round(inch))) : undefined })
    }
    return out
  }
  return (
    <>
      <svg className="ruler ruler-h" width={w * z} height={18} aria-hidden="true">
        {ticks(w).map((t, i) => (
          <g key={i}>
            <line x1={t.pos * z} x2={t.pos * z} y1={t.major ? 4 : t.pos % 48 === 0 ? 9 : 12} y2={18} />
            {t.label && <text x={t.pos * z + 2} y={10}>{t.label}</text>}
          </g>
        ))}
      </svg>
      <svg className="ruler ruler-v" width={18} height={h * z} aria-hidden="true">
        {ticks(h).map((t, i) => (
          <g key={i}>
            <line y1={t.pos * z} y2={t.pos * z} x1={t.major ? 4 : 12} x2={18} />
            {t.label && <text y={t.pos * z - 2} x={2}>{t.label}</text>}
          </g>
        ))}
      </svg>
    </>
  )
}

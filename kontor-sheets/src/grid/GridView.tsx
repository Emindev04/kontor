import { drillDown } from '../commands/pivot'
import { followLink } from '../commands/tools'
import { enterStep } from '../model/prefs'
import { QuickAnalysis } from './QuickAnalysis'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MAX_COLS, MAX_ROWS, cellKey, inRange, keyCol, keyRow, normalize, type Cell, type Range } from '../model/address'
import { DEFAULT_SIZE } from '../model/style'
import { copy, isOwnClipboard, pasteExternal, pasteInternal } from '../commands/clipboard'
import { fillRange } from '../commands/fill'
import { autofitColumns, autofitRows, selectedIndexes, setSizes } from '../commands/ops'
import { currentRegion } from '../commands/sort'
import { useApp, useDocVersion } from '../components/appContext'
import { CellEditor } from './CellEditor'
import { canPoint, coloredRefs } from './formulaAssist'
import { Geometry, scrollScale } from './geometry'
import { measureText } from './measure'
import { BRAND, canvasToSheet, fontFor, render, type Overlays } from './render'
import { ObjectLayer } from './ObjectLayer'
import { PageGeometry, computePageBreaks } from './pages'
import { addObject, deleteObject, duplicateObject, newShape, selectObject, selectedObject, updateObject } from '../commands/objects'
import type { SheetObject } from '../model/extras'
import { filterButtonAt, type FilterTarget } from '../commands/filter'
import { listItems, validationAt } from '../commands/validation'
import { noteAt, threadAt } from '../commands/review'
import { OUTLINE_STEP, outlineButtons, showLevel, toggleGroup } from '../commands/outline'

type Drag =
  | { kind: 'cells' }
  | { kind: 'cols'; anchor: number }
  | { kind: 'rows'; anchor: number }
  | { kind: 'resizeCol'; index: number; start: number; size: number }
  | { kind: 'resizeRow'; index: number; start: number; size: number }
  | { kind: 'fill'; src: Range; dst: Range }
  | { kind: 'point'; anchor: Cell }
  | { kind: 'move'; src: Range; grab: Cell; dst: Range }
  | { kind: 'shape'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'pbreak'; axis: 'row' | 'col'; from: number; at: number; manual: boolean }

type Hit =
  | { kind: 'outline'; axis: 'row' | 'col'; level?: number; at?: number }
  | { kind: 'corner' }
  | { kind: 'col'; c: number; border: number }
  | { kind: 'row'; r: number; border: number }
  | { kind: 'cell'; r: number; c: number; fill: boolean; edge: boolean }
  | { kind: 'none' }

 /** Which split pane the user worked in last (keeps the other pane from scrolling along). */
const activePane: { current: 'primary' | 'secondary' } = { current: 'primary' }

export type ContextKind = 'cell' | 'col' | 'row' | 'corner' | 'object'

export function GridView({
  onContextMenu,
  onSelectionEnd,
  onOpenFormat,
  onFilter,
  hidden,
  pane = 'primary',
}: {
  onContextMenu: (x: number, y: number, kind: ContextKind) => void
  onSelectionEnd: () => void
  onOpenFormat?: (id: number) => void
  onFilter?: (x: number, y: number, target: FilterTarget, col: number) => void
  hidden?: boolean
  /** Split window: the secondary pane has its own scroll position and no cell editor. */
  pane?: 'primary' | 'secondary'
}) {
  const secondary = pane === 'secondary'
  const scrollKey = (id: number) => (secondary ? id + 1_000_000 : id)
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const sheet = doc.sheet
  const scroller = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const spacer = useRef<HTMLDivElement>(null)
  const sink = useRef<HTMLTextAreaElement>(null)
  const editorWrap = useRef<HTMLDivElement>(null)
  const geom = useRef<Geometry | null>(null)
  const drag = useRef<Drag | null>(null)
  const last = useRef<{ x: number; y: number; ctrl: boolean } | null>(null)
  const auto = useRef(0)
  const scale = useRef({ x: 1, y: 1 })
  const phase = useRef(0)
  const lastSel = useRef('')
  const lastSheet = useRef(-1)
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [, force] = useState(0)
  const clipboardEventSeen = useRef(false)
  const inkDraft = useRef<{ points: number[]; color: string; width: number; highlighter: boolean } | null>(null)
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  const hoverTimer = useRef(0)
  const [listOpen, setListOpen] = useState(false)
  const layerUpdate = useRef<((g: Geometry) => void) | null>(null)
  const registerLayer = useCallback((fn: (g: Geometry) => void) => {
    layerUpdate.current = fn
    if (geom.current) fn(geom.current)
  }, [])

  doc.measure = measureText

  const geometry = useCallback((): Geometry => {
    const el = scroller.current
    const sx = (el?.scrollLeft ?? 0) * scale.current.x
    const sy = (el?.scrollTop ?? 0) * scale.current.y
    const probe = new Geometry(sheet, sheet.zoom, size.w, size.h, sx, sy, 3)
    const digits = Math.max(3, String(probe.visibleRows()[1] + 1).length)
    if (app.viewMode === 'pageLayout') return new PageGeometry(sheet, sheet.zoom, size.w, size.h, sx, sy, digits)
    return new Geometry(sheet, sheet.zoom, size.w, size.h, sx, sy, digits)
  }, [sheet, size, app.viewMode])

  const editorRect = (g: Geometry) => {
    const e = doc.edit
    if (!e || e.sheetId !== sheet.id) return null
    const m = sheet.mergeAt(e.r, e.c) ?? { r1: e.r, c1: e.c, r2: e.r, c2: e.c }
    const x = g.colX(m.c1)
    const y = g.rowY(m.r1)
    const w = g.colX(m.c2) + g.colW(m.c2) - x
    const h = g.rowY(m.r2) + g.rowH(m.r2) - y
    return { x, y, w, h, maxW: size.w - x - 4 }
  }

  const draw = () => {
    const el = scroller.current
    const cv = canvas.current
    if (!el || !cv) return
    const g = geometry()
    geom.current = g
    const dpr = window.devicePixelRatio || 1
    const W = Math.round(size.w * dpr)
    const H = Math.round(size.h * dpr)
    if (cv.width !== W || cv.height !== H) {
      cv.width = W
      cv.height = H
    }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const e = doc.edit
    const refs: Overlays['refs'] = []
    if (e && e.text.startsWith('=')) {
      const editSheet = doc.wb.sheetById(e.sheetId)
      for (const r of coloredRefs(e.text)) {
        const target = r.sheet ? doc.wb.sheetByName(r.sheet) : editSheet
        if (target === sheet) refs.push({ range: r.range, color: r.color })
      }
    }
    const d = drag.current
    const active = doc.sel.active
    const anchorKey = sheet.spills.has(cellKey(active.r, active.c)) ? cellKey(active.r, active.c) : sheet.spillOwner.get(cellKey(active.r, active.c))
    let spill: Range | null = null
    if (anchorKey !== undefined) {
      const sp = sheet.spills.get(anchorKey)
      if (sp) spill = { r1: keyRow(anchorKey), c1: keyCol(anchorKey), r2: keyRow(anchorKey) + sp.rows - 1, c2: keyCol(anchorKey) + sp.cols - 1 }
    }
    const o: Overlays = {
      sel: doc.sel,
      refs,
      clip: doc.clip && doc.clip.sheetId === sheet.id ? { range: doc.clip.range, phase: phase.current } : null,
      fillPreview: d?.kind === 'fill' ? d.dst : null,
      movePreview: d?.kind === 'move' ? d.dst : null,
      resize: d?.kind === 'resizeCol' ? { axis: 'col', pos: g.colX(d.index) + Math.max(0, d.size) * g.z } : d?.kind === 'resizeRow' ? { axis: 'row', pos: g.rowY(d.index) + Math.max(0, d.size) * g.z } : null,
      editing: e && e.sheetId === sheet.id ? { r: e.r, c: e.c } : null,
      spill,
      showSelection: true,
      pageBreaks: app.viewMode === 'normal' ? null : { ...pageBreaks(), drag: d?.kind === 'pbreak' ? { axis: d.axis, at: d.at } : null },
      ink: doc.hideInk ? [] : inkDraft.current ? [...sheet.ink, inkDraft.current] : sheet.ink,
      traces: doc.traces.filter((t) => t.sheetId === sheet.id),
      circles: doc.circles.length ? doc.circles : undefined,
      rubber: d?.kind === 'shape' ? { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) } : null,
    }
    render(ctx, g, doc, o)
    layerUpdate.current?.(g)
    // scrollable extent
    const used = sheet.used()
    const ext = g.extent(Math.max(used.r, doc.sel.head.r), Math.max(used.c, doc.sel.head.c))
    const totalW = ext.w + g.bodyX
    const totalH = ext.h + g.bodyY
    scale.current = { x: scrollScale(totalW), y: scrollScale(totalH) }
    if (spacer.current) {
      spacer.current.style.width = `${totalW / scale.current.x}px`
      spacer.current.style.height = `${totalH / scale.current.y}px`
    }
    const rect = editorRect(g)
    if (rect && editorWrap.current) {
      editorWrap.current.style.left = `${rect.x - 1}px`
      editorWrap.current.style.top = `${rect.y - 1}px`
    }
  }
  /** Page breaks from the page setup (shown in Page Break Preview), manual ones solid. */
  function pageBreaks() {
    const b = computePageBreaks(sheet)
    return { rows: b.rows, cols: b.cols, labels: app.viewMode === 'pageBreak', manualRows: b.manualRows, manualCols: b.manualCols }
  }
  const drawRef = useRef(draw)
  drawRef.current = draw

  // resize observer
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // restore scroll when switching sheets, keep the selection in view
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (lastSheet.current !== sheet.id) {
      lastSheet.current = sheet.id
      const s = doc.scroll.get(scrollKey(sheet.id)) ?? { x: 0, y: 0 }
      el.scrollLeft = s.x
      el.scrollTop = s.y
      lastSel.current = ''
    }
    const sel = doc.sel
    const key = `${sheet.id}:${sel.active.r}:${sel.active.c}:${sel.head.r}:${sel.head.c}`
    if (key !== lastSel.current && !drag.current && (secondary ? activePane.current === 'secondary' : activePane.current !== 'secondary')) {
      lastSel.current = key
      const g = geometry()
      const target = sel.ranges.length === 1 && (sel.head.r !== sel.active.r || sel.head.c !== sel.active.c) ? sel.head : sel.active
      const full = doc.activeRange
      const tr = full.r1 === 0 && full.r2 === MAX_ROWS - 1 ? -1 : target.r
      const tc = full.c1 === 0 && full.c2 === MAX_COLS - 1 ? -1 : target.c
      const want = g.scrollFor(Math.max(0, tr), Math.max(0, tc))
      if (tr >= 0 && want.sy !== g.sy) el.scrollTop = want.sy / scale.current.y
      if (tc >= 0 && want.sx !== g.sx) el.scrollLeft = want.sx / scale.current.x
    }
    draw()
  })

  // marching ants
  useEffect(() => {
    if (!doc.clip) return
    const id = setInterval(() => {
      phase.current = (phase.current + 1) % 14
      drawRef.current()
    }, 90)
    return () => clearInterval(id)
  }, [doc.clip])

  // repaint once web fonts are ready
  useEffect(() => {
    document.fonts?.ready.then(() => {
      force((n) => n + 1)
    })
  }, [])

  const focusSink = () => {
    if (!doc.edit) sink.current?.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (!doc.edit && document.activeElement === document.body) focusSink()
  })

  // ---------- hit testing ----------

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const hitTest = (x: number, y: number): Hit => {
    const g = geom.current
    if (!g) return { kind: 'none' }
    if ((g.ow && x < g.ow) || (g.oh && y < g.oh)) return outlineHit(g, x, y)
    if (y < g.headerH && x < g.headerW) return { kind: 'corner' }
    if (y < g.headerH) {
      const c = g.colAt(x)
      const left = g.colX(c)
      const right = left + g.colW(c)
      let border = -1
      if (Math.abs(x - right) <= 4) border = c
      else if (Math.abs(x - left) <= 3 && c > 0) border = sheet.cols.step(c, -1) === c ? -1 : c - 1
      return { kind: 'col', c, border }
    }
    if (x < g.headerW) {
      const r = g.rowAt(y)
      const top = g.rowY(r)
      const bottom = top + g.rowH(r)
      let border = -1
      if (Math.abs(y - bottom) <= 3) border = r
      else if (Math.abs(y - top) <= 2 && r > 0) border = r - 1
      return { kind: 'row', r, border }
    }
    const r = g.rowAt(y)
    const c = g.colAt(x)
    const rg = doc.activeRange
    let fill = false
    let edge = false
    if (!doc.edit && rg.r2 < MAX_ROWS && rg.c2 < MAX_COLS) {
      const hx = g.colX(rg.c2) + g.colW(rg.c2)
      const hy = g.rowY(rg.r2) + g.rowH(rg.r2)
      fill = Math.abs(x - hx) <= 5 && Math.abs(y - hy) <= 5 && doc.sel.ranges.length === 1
      if (!fill && doc.sel.ranges.length === 1) {
        const x1 = g.colX(rg.c1)
        const y1 = g.rowY(rg.r1)
        const nearV = (Math.abs(x - x1) <= 3 || Math.abs(x - hx) <= 3) && y >= y1 - 3 && y <= hy + 3
        const nearH = (Math.abs(y - y1) <= 3 || Math.abs(y - hy) <= 3) && x >= x1 - 3 && x <= hx + 3
        edge = (nearV || nearH) && !(rg.r1 === 0 && rg.r2 === MAX_ROWS - 1) && !(rg.c1 === 0 && rg.c2 === MAX_COLS - 1)
      }
    }
    return { kind: 'cell', r, c, fill, edge }
  }

  const outlineHit = (g: Geometry, x: number, y: number): Hit => {
    const step = OUTLINE_STEP * g.z
    const s = 12 * g.z
    if (x < g.ow && y >= g.oh && y < g.headerH) return { kind: 'outline', axis: 'row', level: Math.floor((x - 2) / step) + 1 }
    if (y < g.oh && x >= g.ow && x < g.headerW) return { kind: 'outline', axis: 'col', level: Math.floor((y - 2) / step) + 1 }
    if (x < g.ow && y >= g.headerH) {
      const [r0, r1] = g.visibleRows()
      for (const b of outlineButtons(sheet, 'row', r0, r1)) {
        const bx = (b.level - 1) * step + 3
        const by = g.rowY(b.at) + (g.rowH(b.at) - s) / 2
        if (x >= bx && x <= bx + s && y >= by && y <= by + s) return { kind: 'outline', axis: 'row', level: b.level, at: b.at }
      }
    }
    if (y < g.oh && x >= g.headerW) {
      const [c0, c1] = g.visibleCols()
      for (const b of outlineButtons(sheet, 'col', c0, c1)) {
        const by = (b.level - 1) * step + 3
        const bx = g.colX(b.at) + (g.colW(b.at) - s) / 2
        if (x >= bx && x <= bx + s && y >= by && y <= by + s) return { kind: 'outline', axis: 'col', level: b.level, at: b.at }
      }
    }
    return { kind: 'none' }
  }

  // ---------- pointer ----------

  const applyDrag = (x: number, y: number, ctrl: boolean) => {
    const d = drag.current
    const g = geom.current
    if (!d || !g) return
    const r = Math.max(0, g.rowAt(Math.max(g.headerH + 1, y)))
    const c = Math.max(0, g.colAt(Math.max(g.headerW + 1, x)))
    switch (d.kind) {
      case 'cells':
        doc.select({ r, c }, { extend: true })
        break
      case 'cols': {
        const top = g.visibleRows()[0]
        doc.sel = { ...doc.sel, ranges: [...doc.sel.ranges.slice(0, -1), { r1: 0, r2: MAX_ROWS - 1, c1: Math.min(d.anchor, c), c2: Math.max(d.anchor, c) }], head: { r: top, c } }
        doc.emit()
        break
      }
      case 'rows': {
        const left = g.visibleCols()[0]
        doc.sel = { ...doc.sel, ranges: [...doc.sel.ranges.slice(0, -1), { c1: 0, c2: MAX_COLS - 1, r1: Math.min(d.anchor, r), r2: Math.max(d.anchor, r) }], head: { r, c: left } }
        doc.emit()
        break
      }
      case 'resizeCol':
        d.size = Math.max(0, d.size + 0)
        drag.current = { ...d, size: Math.max(0, (x - g.colX(d.index)) / g.z) }
        drawRef.current()
        break
      case 'resizeRow':
        drag.current = { ...d, size: Math.max(0, (y - g.rowY(d.index)) / g.z) }
        drawRef.current()
        break
      case 'fill': {
        const s = d.src
        const dr = r > s.r2 ? r - s.r2 : r < s.r1 ? r - s.r1 : 0
        const dc = c > s.c2 ? c - s.c2 : c < s.c1 ? c - s.c1 : 0
        let dst: Range = s
        if (dr !== 0 && Math.abs(dr) >= Math.abs(dc)) dst = dr > 0 ? { ...s, r2: r } : { ...s, r1: r }
        else if (dc !== 0) dst = dc > 0 ? { ...s, c2: c } : { ...s, c1: c }
        else if (r < s.r2 && s.r2 > s.r1) dst = { ...s, r2: Math.max(s.r1, r) }
        else if (c < s.c2 && s.c2 > s.c1) dst = { ...s, c2: Math.max(s.c1, c) }
        drag.current = { ...d, dst }
        drawRef.current()
        break
      }
      case 'point':
        doc.pointAt({ r, c }, d.anchor)
        break
      case 'shape':
        drag.current = { ...d, x1: x, y1: y }
        drawRef.current()
        break
      case 'pbreak': {
        const at = d.axis === 'row' ? Math.max(1, g.rowAt(y + g.rowH(Math.max(0, r)) / 2)) : Math.max(1, g.colAt(x + g.colW(Math.max(0, c)) / 2))
        drag.current = { ...d, at }
        drawRef.current()
        break
      }
      case 'move': {
        const h = d.src.r2 - d.src.r1
        const w = d.src.c2 - d.src.c1
        const r1 = Math.max(0, Math.min(MAX_ROWS - 1 - h, r - d.grab.r))
        const c1 = Math.max(0, Math.min(MAX_COLS - 1 - w, c - d.grab.c))
        drag.current = { ...d, dst: { r1, c1, r2: r1 + h, c2: c1 + w } }
        drawRef.current()
        break
      }
    }
    void ctrl
  }

  const autoScroll = () => {
    cancelAnimationFrame(auto.current)
    const tick = () => {
      const p = last.current
      const g = geom.current
      const el = scroller.current
      if (!p || !g || !el || !drag.current || drag.current.kind === 'resizeCol' || drag.current.kind === 'resizeRow') return
      let dx = 0
      let dy = 0
      if (p.x > size.w) dx = Math.min(60, p.x - size.w)
      else if (p.x < g.bodyX && drag.current.kind !== 'rows') dx = -Math.min(60, g.bodyX - p.x)
      if (p.y > size.h) dy = Math.min(60, p.y - size.h)
      else if (p.y < g.bodyY && drag.current.kind !== 'cols') dy = -Math.min(60, g.bodyY - p.y)
      if (!dx && !dy) return
      el.scrollLeft += dx / 2
      el.scrollTop += dy / 2
      drawRef.current()
      applyDrag(Math.min(Math.max(p.x, g.bodyX), size.w - 1), Math.min(Math.max(p.y, g.bodyY), size.h - 1), p.ctrl)
      auto.current = requestAnimationFrame(tick)
    }
    auto.current = requestAnimationFrame(tick)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    activePane.current = pane
    if (e.button !== 0) return
    const { x, y } = local(e)
    if (doc.tool && geom.current && x > geom.current.headerW && y > geom.current.headerH) {
      e.preventDefault()
      const p = canvasToSheet(geom.current, x, y)
      if (doc.tool.kind === 'eraser') eraseAt(p.x, p.y)
      else inkDraft.current = { points: [p.x, p.y], color: doc.tool.color, width: doc.tool.width, highlighter: doc.tool.kind === 'highlighter' }
      canvas.current!.setPointerCapture(e.pointerId)
      return
    }
    if (doc.drawShape && geom.current && x > geom.current.headerW && y > geom.current.headerH) {
      e.preventDefault()
      drag.current = { kind: 'shape', x0: x, y0: y, x1: x, y1: y }
      canvas.current!.setPointerCapture(e.pointerId)
      last.current = { x, y, ctrl: false }
      return
    }
    const hit = hitTest(x, y)
    const ctrl = e.ctrlKey || e.metaKey
    const ed = doc.edit
    setHover(null)
    if (app.viewMode === 'pageBreak' && !ed && hit.kind === 'cell' && geom.current) {
      const g = geom.current
      const pb = pageBreaks()
      const nearC = pb.cols.find((c) => Math.abs(x - g.colX(c)) <= 4)
      const nearR = pb.rows.find((r) => Math.abs(y - g.rowY(r)) <= 4)
      if (nearC !== undefined || nearR !== undefined) {
        e.preventDefault()
        const axis = nearR !== undefined ? 'row' : 'col'
        const from = (nearR ?? nearC)!
        drag.current = { kind: 'pbreak', axis, from, at: from, manual: axis === 'row' ? pb.manualRows.has(from) : pb.manualCols.has(from) }
        canvas.current!.setPointerCapture(e.pointerId)
        last.current = { x, y, ctrl: false }
        return
      }
    }
    if (!ed && geom.current) {
      const g = geom.current
      // list validation drop-down button right of the active cell
      const a = doc.sel.active
      const v = validationAt(sheet, a.r, a.c)
      if (v?.type === 'list' && v.dropdown) {
        const m = sheet.mergeAt(a.r, a.c) ?? { r1: a.r, c1: a.c, r2: a.r, c2: a.c }
        const bx = g.colX(m.c2) + g.colW(m.c2) + 1
        const by = g.rowY(m.r2)
        const bh = g.rowH(m.r2)
        if (x >= bx && x <= bx + Math.min(bh, 17 * g.z) && y >= by && y <= by + bh) {
          e.preventDefault()
          setListOpen(true)
          return
        }
      }
      if (hit.kind === 'cell') {
        const fb = filterButtonAt(sheet, hit.r, hit.c)
        if (fb) {
          const sz = Math.min(g.rowH(hit.r) - 3, 15 * g.z)
          const bx = g.colX(hit.c) + g.colW(hit.c) - sz - 2
          const by = g.rowY(hit.r) + g.rowH(hit.r) - sz - 2
          if (x >= bx - 1 && x <= bx + sz + 1 && y >= by - 1 && y <= by + sz + 1) {
            e.preventDefault()
            const rect = canvas.current!.getBoundingClientRect()
            doc.select({ r: hit.r, c: hit.c })
            onFilter?.(rect.left + bx, rect.top + by + sz + 2, fb.target, fb.col)
            return
          }
        }
      }
    }
    setListOpen(false)
    if (ed) {
      if (hit.kind === 'cell' && ed.text.startsWith('=') && canPoint(ed.text, ed.caret, ed.point)) {
        e.preventDefault()
        const anchor = e.shiftKey && ed.pointAnchor ? ed.pointAnchor : { r: hit.r, c: hit.c }
        doc.pointAt({ r: hit.r, c: hit.c }, anchor)
        drag.current = { kind: 'point', anchor }
        canvas.current!.setPointerCapture(e.pointerId)
        return
      }
      if (hit.kind === 'cell' && ed.sheetId === sheet.id && ed.r === hit.r && ed.c === hit.c) return
      const err = doc.commitEdit()
      if (err) {
        e.preventDefault()
        app.alert(err)
        return
      }
    }
    e.preventDefault()
    sink.current?.focus({ preventScroll: true })
    switch (hit.kind) {
      case 'outline':
        if (hit.at !== undefined) toggleGroup(doc, hit.axis, hit.at, hit.level!)
        else if (hit.level) showLevel(doc, hit.axis, hit.level)
        return
      case 'corner':
        doc.selectAll()
        return
      case 'col':
        if (hit.border >= 0) {
          drag.current = { kind: 'resizeCol', index: hit.border, start: x, size: sheet.cols.size(hit.border) }
        } else {
          const g = geom.current!
          const top = g.visibleRows()[0]
          const anchor = e.shiftKey ? doc.sel.anchor.c : hit.c
          const rg = { r1: 0, r2: MAX_ROWS - 1, c1: Math.min(anchor, hit.c), c2: Math.max(anchor, hit.c) }
          if (e.shiftKey) doc.sel = { ...doc.sel, ranges: [...doc.sel.ranges.slice(0, -1), rg], head: { r: top, c: hit.c } }
          else {
            const ranges = ctrl ? [...doc.sel.ranges, rg] : [rg]
            doc.sel = { ranges, active: { r: top, c: hit.c }, anchor: { r: top, c: hit.c }, head: { r: top, c: hit.c } }
          }
          doc.emit()
          drag.current = { kind: 'cols', anchor }
        }
        break
      case 'row':
        if (hit.border >= 0) {
          drag.current = { kind: 'resizeRow', index: hit.border, start: y, size: sheet.rows.size(hit.border) }
        } else {
          const g = geom.current!
          const left = g.visibleCols()[0]
          const anchor = e.shiftKey ? doc.sel.anchor.r : hit.r
          const rg = { c1: 0, c2: MAX_COLS - 1, r1: Math.min(anchor, hit.r), r2: Math.max(anchor, hit.r) }
          if (e.shiftKey) doc.sel = { ...doc.sel, ranges: [...doc.sel.ranges.slice(0, -1), rg], head: { r: hit.r, c: left } }
          else {
            const ranges = ctrl ? [...doc.sel.ranges, rg] : [rg]
            doc.sel = { ranges, active: { r: hit.r, c: left }, anchor: { r: hit.r, c: left }, head: { r: hit.r, c: left } }
          }
          doc.emit()
          drag.current = { kind: 'rows', anchor }
        }
        break
      case 'cell': {
        if (hit.fill) {
          drag.current = { kind: 'fill', src: doc.activeRange, dst: doc.activeRange }
          break
        }
        if (hit.edge && !e.shiftKey) {
          const rg = doc.activeRange
          drag.current = { kind: 'move', src: rg, grab: { r: Math.min(Math.max(hit.r, rg.r1), rg.r2) - rg.r1, c: Math.min(Math.max(hit.c, rg.c1), rg.c2) - rg.c1 }, dst: rg }
          break
        }
        const link = sheet.get(hit.r, hit.c)?.link
        if (link && ctrl) {
          followLink(doc, link)
          return
        }
        doc.select({ r: hit.r, c: hit.c }, { extend: e.shiftKey, add: ctrl && !e.shiftKey })
        drag.current = { kind: 'cells' }
        break
      }
      default:
        return
    }
    canvas.current!.setPointerCapture(e.pointerId)
    last.current = { x, y, ctrl }
  }

  const eraseAt = (px: number, py: number) => {
    const hit = sheet.ink.findIndex((s) => {
      for (let i = 0; i < s.points.length; i += 2) if (Math.hypot(s.points[i] - px, s.points[i + 1] - py) < 8 + s.width) return true
      return false
    })
    if (hit < 0) return
    doc.transact('Erase Ink', () => {
      doc.noteProps(sheet)
      sheet.ink = sheet.ink.filter((_, i) => i !== hit)
    })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = local(e)
    const cv = canvas.current!
    if (doc.tool) {
      cv.style.cursor = doc.tool.kind === 'eraser' ? 'cell' : 'crosshair'
      if (!geom.current || !canvas.current?.hasPointerCapture(e.pointerId)) return
      const p = canvasToSheet(geom.current, x, y)
      if (doc.tool.kind === 'eraser') eraseAt(p.x, p.y)
      else if (inkDraft.current) {
        inkDraft.current.points.push(p.x, p.y)
        drawRef.current()
      }
      return
    }
    if (!drag.current && doc.drawShape) {
      cv.style.cursor = 'crosshair'
      return
    }
    if (!drag.current && app.viewMode === 'pageBreak' && geom.current) {
      const g = geom.current
      const pb = pageBreaks()
      if (pb.rows.some((r) => Math.abs(y - g.rowY(r)) <= 4)) {
        cv.style.cursor = 'row-resize'
        return
      }
      if (pb.cols.some((c) => Math.abs(x - g.colX(c)) <= 4)) {
        cv.style.cursor = 'col-resize'
        return
      }
    }
    if (!drag.current) {
      const hit = hitTest(x, y)
      if (hit.kind === 'cell' && (noteAt(sheet, hit.r, hit.c) || threadAt(sheet, hit.r, hit.c))) {
        if (!hover || hover.r !== hit.r || hover.c !== hit.c) {
          clearTimeout(hoverTimer.current)
          hoverTimer.current = window.setTimeout(() => setHover({ r: hit.r, c: hit.c }), 250)
        }
      } else if (hover || hoverTimer.current) {
        clearTimeout(hoverTimer.current)
        hoverTimer.current = 0
        if (hover) setHover(null)
      }
      cv.style.cursor =
        hit.kind === 'col' ? (hit.border >= 0 ? 'col-resize' : 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27><path d=%27M8 14 3 8h3V2h4v6h3z%27 fill=%27black%27 stroke=%27white%27/></svg>") 8 14, s-resize')
        : hit.kind === 'row' ? (hit.border >= 0 ? 'row-resize' : 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27><path d=%27M14 8 8 3v3H2v4h6v3z%27 fill=%27black%27 stroke=%27white%27/></svg>") 14 8, e-resize')
        : hit.kind === 'cell' ? (hit.fill ? 'crosshair' : hit.edge ? 'move' : sheet.get(hit.r, hit.c)?.link ? 'pointer' : 'cell')
        : 'default'
      return
    }
    last.current = { x, y, ctrl: e.ctrlKey || e.metaKey }
    applyDrag(x, y, e.ctrlKey || e.metaKey)
    const g = geom.current
    if (g && (x > size.w || y > size.h || x < g.bodyX || y < g.bodyY)) autoScroll()
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (inkDraft.current) {
      const stroke = inkDraft.current
      inkDraft.current = null
      if (canvas.current?.hasPointerCapture(e.pointerId)) canvas.current.releasePointerCapture(e.pointerId)
      if (stroke.points.length >= 4)
        doc.transact('Ink', () => {
          doc.noteProps(sheet)
          sheet.ink = [...sheet.ink, stroke]
        })
      return
    }
    const d = drag.current
    drag.current = null
    cancelAnimationFrame(auto.current)
    if (canvas.current?.hasPointerCapture(e.pointerId)) canvas.current.releasePointerCapture(e.pointerId)
    if (!d) return
    switch (d.kind) {
      case 'pbreak': {
        if (d.at === d.from) break
        doc.transact('Move Page Break', () => {
          doc.noteProps(sheet)
          const key = d.axis === 'row' ? 'rowBreaks' : 'colBreaks'
          const list = sheet.x[key].filter((b) => b !== d.from)
          if (!list.includes(d.at)) list.push(d.at)
          sheet.x[key] = list.sort((a, b) => a - b)
        })
        break
      }
      case 'shape': {
        const g = geom.current!
        const spec = doc.drawShape!
        doc.drawShape = null
        const a = canvasToSheet(g, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1))
        const shape = newShape(doc, spec.shape, spec.textBox)
        const isLine = spec.shape === 'line' || spec.shape === 'straightConnector1' || spec.shape === 'doubleArrowLine'
        const dw = (d.x1 - d.x0) / g.z
        const dh = (d.y1 - d.y0) / g.z
        if (Math.abs(dw) > 4 || Math.abs(dh) > 4) {
          if (isLine) {
            const s0 = canvasToSheet(g, d.x0, d.y0)
            shape.anchor = { x: s0.x, y: s0.y, w: dw, h: dh }
          } else shape.anchor = { x: a.x, y: a.y, w: Math.abs(dw), h: Math.abs(dh) }
        } else shape.anchor = { ...shape.anchor, x: a.x, y: a.y }
        addObject(doc, shape, spec.textBox ? 'Insert Text Box' : 'Insert Shape')
        break
      }
      case 'resizeCol': {
        const cols = isWholeSelected('col', d.index) ? selectedIndexes(doc, 'col') : [d.index]
        setSizes(doc, 'col', cols, d.size)
        break
      }
      case 'resizeRow': {
        const rows = isWholeSelected('row', d.index) ? selectedIndexes(doc, 'row') : [d.index]
        setSizes(doc, 'row', rows, d.size)
        break
      }
      case 'fill':
        if (d.dst.r1 !== d.src.r1 || d.dst.r2 !== d.src.r2 || d.dst.c1 !== d.src.c1 || d.dst.c2 !== d.src.c2) fillRange(doc, d.src, d.dst, e.ctrlKey || e.altKey ? 'copy' : 'auto')
        break
      case 'move':
        if (d.dst.r1 !== d.src.r1 || d.dst.c1 !== d.src.c1) {
          const prev = doc.clip
          const res = copy(doc, !(e.ctrlKey || e.altKey))
          if (typeof res !== 'string') {
            doc.selectRange(d.dst)
            const err = pasteInternal(doc)
            if (err) app.alert(err)
          }
          if (prev && !prev.cut) doc.clip = prev
          else doc.clip = null
          doc.emit()
        }
        break
      default:
        break
    }
    drawRef.current()
    if (d.kind === 'cells' || d.kind === 'cols' || d.kind === 'rows') onSelectionEnd()
  }

  const isWholeSelected = (axis: 'col' | 'row', i: number) =>
    doc.sel.ranges.some((rg) => (axis === 'col' ? rg.r1 === 0 && rg.r2 === MAX_ROWS - 1 && i >= rg.c1 && i <= rg.c2 : rg.c1 === 0 && rg.c2 === MAX_COLS - 1 && i >= rg.r1 && i <= rg.r2))

  const onDoubleClick = (e: React.MouseEvent) => {
    const { x, y } = local(e)
    const hit = hitTest(x, y)
    if (hit.kind === 'col' && hit.border >= 0) {
      autofitColumns(doc, isWholeSelected('col', hit.border) ? selectedIndexes(doc, 'col') : [hit.border])
      return
    }
    if (hit.kind === 'row' && hit.border >= 0) {
      autofitRows(doc, isWholeSelected('row', hit.border) ? selectedIndexes(doc, 'row') : [hit.border])
      return
    }
    if (hit.kind === 'cell') {
      if (hit.fill) {
        // fill down as far as the neighbouring column has data
        const rg = doc.activeRange
        const probe = rg.c1 > 0 && sheet.hasValue(rg.r2 + 1, rg.c1 - 1) ? rg.c1 - 1 : rg.c2 + 1
        let r = rg.r2
        while (r + 1 < MAX_ROWS && sheet.hasValue(r + 1, probe)) r++
        if (r > rg.r2) fillRange(doc, rg, { ...rg, r2: r })
        return
      }
      if (doc.edit) return
      // a PivotTable value shows the source rows behind it
      if (drillDown(doc, sheet, hit.r, hit.c)) return
      doc.select({ r: hit.r, c: hit.c })
      doc.beginEdit('edit')
    }
  }

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault()
    const { x, y } = local(e)
    const hit = hitTest(x, y)
    if (doc.edit) {
      const err = doc.commitEdit()
      if (err) return app.alert(err)
    }
    if (hit.kind === 'cell') {
      if (!doc.sel.ranges.some((rg) => inRange(rg, hit.r, hit.c))) doc.select({ r: hit.r, c: hit.c })
      onContextMenu(e.clientX, e.clientY, 'cell')
    } else if (hit.kind === 'col') {
      if (!isWholeSelected('col', hit.c)) {
        const top = geom.current!.visibleRows()[0]
        doc.sel = { ranges: [{ r1: 0, r2: MAX_ROWS - 1, c1: hit.c, c2: hit.c }], active: { r: top, c: hit.c }, anchor: { r: top, c: hit.c }, head: { r: top, c: hit.c } }
        doc.emit()
      }
      onContextMenu(e.clientX, e.clientY, 'col')
    } else if (hit.kind === 'row') {
      if (!isWholeSelected('row', hit.r)) {
        const left = geom.current!.visibleCols()[0]
        doc.sel = { ranges: [{ c1: 0, c2: MAX_COLS - 1, r1: hit.r, r2: hit.r }], active: { r: hit.r, c: left }, anchor: { r: hit.r, c: left }, head: { r: hit.r, c: left } }
        doc.emit()
      }
      onContextMenu(e.clientX, e.clientY, 'row')
    } else if (hit.kind === 'corner') onContextMenu(e.clientX, e.clientY, 'corner')
    sink.current?.focus({ preventScroll: true })
  }

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      // trackpad pinch sends small ctrl+wheel steps: zoom proportionally; a mouse wheel steps by 10%
      const step = Math.abs(e.deltaY) < 20 ? -e.deltaY : e.deltaY < 0 ? 10 : -10
      const z = Math.round(Math.max(10, Math.min(400, sheet.zoom + step)))
      sheet.zoom = z
      doc.emit()
    }
  }

  // ---------- keyboard ----------

  const visibleRowCount = () => {
    const g = geom.current
    if (!g) return 20
    const [a, b] = g.visibleRows()
    return Math.max(1, b - a - 1)
  }

  const onObjectKey = (e: React.KeyboardEvent, o: SheetObject) => {
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key
    const nudge = (dx: number, dy: number) => {
      e.preventDefault()
      const step = ctrl ? 1 : 8
      updateObject(doc, o.id, { anchor: { ...o.anchor, x: Math.max(0, o.anchor.x + dx * step), y: Math.max(0, o.anchor.y + dy * step) } }, 'Move Object')
    }
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault()
      deleteObject(doc, o.id)
    } else if (k === 'Escape') {
      e.preventDefault()
      selectObject(doc, null)
    } else if (k === 'ArrowLeft') nudge(-1, 0)
    else if (k === 'ArrowRight') nudge(1, 0)
    else if (k === 'ArrowUp') nudge(0, -1)
    else if (k === 'ArrowDown') nudge(0, 1)
    else if (ctrl && k.toLowerCase() === 'd') {
      e.preventDefault()
      duplicateObject(doc, o.id)
    } else if (k === 'Tab') {
      e.preventDefault()
      const list = sheet.x.objects
      const i = list.findIndex((x) => x.id === o.id)
      selectObject(doc, list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length].id)
    } else if (k === 'F2' && o.kind === 'chart') {
      e.preventDefault()
      onOpenFormat?.(o.id)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (doc.edit) return
    const selected = selectedObject(doc)
    if (selected) {
      if (!['c', 'x', 'v', 'z', 'y'].includes(e.key.toLowerCase()) || !(e.ctrlKey || e.metaKey)) return onObjectKey(e, selected)
    }
    if (e.key === 'Escape' && doc.drawShape) {
      doc.drawShape = null
      doc.emit()
      return
    }
    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const k = e.key
    const nav = (dr: number, dc: number) => {
      e.preventDefault()
      if (ctrl) doc.moveEdge(dr, dc, shift)
      else doc.move(dr, dc, shift)
    }
    if (e.altKey && k === 'ArrowDown') {
      const v = validationAt(sheet, doc.sel.active.r, doc.sel.active.c)
      if (v?.type === 'list') {
        e.preventDefault()
        setListOpen(true)
        return
      }
    }
    if (listOpen && k === 'Escape') {
      setListOpen(false)
      return
    }
    switch (k) {
      case 'ArrowUp': return nav(-1, 0)
      case 'ArrowDown': return nav(1, 0)
      case 'ArrowLeft': return nav(0, -1)
      case 'ArrowRight': return nav(0, 1)
      case 'Enter': {
        e.preventDefault()
        const step = enterStep(shift)
        if (!step.dr && !step.dc) return
        if (!doc.cycle(step.dr, step.dc)) doc.move(step.dr, step.dc)
        return
      }
      case 'Tab':
        e.preventDefault()
        if (!doc.cycle(0, shift ? -1 : 1)) doc.move(0, shift ? -1 : 1)
        return
      case 'Home':
        e.preventDefault()
        if (ctrl) doc.select({ r: sheet.freeze.rows, c: sheet.freeze.cols }, { extend: shift })
        else doc.select({ r: (shift ? doc.sel.head : doc.sel.active).r, c: sheet.freeze.cols }, { extend: shift })
        return
      case 'End':
        if (ctrl) {
          e.preventDefault()
          const u = sheet.used()
          doc.select({ r: Math.max(0, u.r), c: Math.max(0, u.c) }, { extend: shift })
        }
        return
      case 'PageDown':
      case 'PageUp': {
        e.preventDefault()
        const n = visibleRowCount() * (k === 'PageDown' ? 1 : -1)
        const from = shift ? doc.sel.head : doc.sel.active
        if (e.altKey) {
          const g = geom.current
          const w = g ? Math.max(1, g.visibleCols()[1] - g.visibleCols()[0]) : 8
          doc.select({ r: from.r, c: Math.max(0, Math.min(MAX_COLS - 1, from.c + (k === 'PageDown' ? w : -w))) }, { extend: shift })
        } else if (ctrl) app.doc.setActiveSheet(nextVisibleSheet(k === 'PageDown' ? 1 : -1))
        else {
          const el = scroller.current
          if (el) el.scrollTop += (n * sheet.rows.def * (sheet.zoom / 100)) / scale.current.y
          doc.select({ r: Math.max(0, Math.min(MAX_ROWS - 1, from.r + n)), c: from.c }, { extend: shift })
        }
        return
      }
      case 'F2':
        e.preventDefault()
        doc.beginEdit('edit')
        return
      case 'Delete':
        e.preventDefault()
        doc.clear('contents')
        return
      case 'Backspace': {
        e.preventDefault()
        const a = doc.sel.active
        doc.select(a)
        doc.beginEdit('enter', '')
        return
      }
      case 'Escape':
        if (doc.clip) {
          doc.clip = null
          doc.emit()
        }
        return
      default:
        break
    }
    if (ctrl && !e.altKey && ['c', 'x', 'v'].includes(k.toLowerCase())) {
      // Normally the native copy/cut/paste events follow; fall back when they do not fire.
      const kind = k.toLowerCase()
      clipboardEventSeen.current = false
      setTimeout(() => {
        if (clipboardEventSeen.current) return
        if (kind === 'v') {
          if (doc.clip) {
            const err = pasteInternal(doc)
            if (err) app.alert(err)
          } else navigator.clipboard?.readText().then((t) => t && pasteExternal(doc, t, ''), () => {})
        } else {
          const res = copy(doc, kind === 'x')
          if (typeof res === 'string') app.alert(res)
          else navigator.clipboard?.writeText(res.text).catch(() => {})
        }
      }, 30)
      return
    }
    if (ctrl && k === ' ') {
      e.preventDefault()
      const a = doc.sel.active
      doc.sel = { ...doc.sel, ranges: doc.sel.ranges.map((rg) => ({ ...rg, r1: 0, r2: MAX_ROWS - 1 })) }
      void a
      doc.emit()
      return
    }
    if (shift && k === ' ' && !ctrl) {
      e.preventDefault()
      doc.sel = { ...doc.sel, ranges: doc.sel.ranges.map((rg) => ({ ...rg, c1: 0, c2: MAX_COLS - 1 })) }
      doc.emit()
      return
    }
    if (ctrl && (k === 'a' || k === 'A') && !shift) {
      e.preventDefault()
      const rg = doc.activeRange
      const region = currentRegion(doc, doc.sel.active)
      const isRegion = rg.r1 === region.r1 && rg.r2 === region.r2 && rg.c1 === region.c1 && rg.c2 === region.c2
      if (isRegion || (region.r1 === region.r2 && region.c1 === region.c2 && !sheet.hasValue(region.r1, region.c1))) doc.selectAll()
      else doc.selectRange(region, doc.sel.active)
      return
    }
    if (ctrl && (k === '*' || (shift && k === '8'))) {
      e.preventDefault()
      doc.selectRange(currentRegion(doc, doc.sel.active), doc.sel.active)
      return
    }
    if (!ctrl && !e.altKey && k.length === 1 && !e.nativeEvent.isComposing) {
      e.preventDefault()
      doc.beginEdit('enter', k)
    }
  }

  const nextVisibleSheet = (dir: 1 | -1) => {
    const n = doc.wb.sheets.length
    let i = doc.activeIndex
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n
      if (!doc.wb.sheets[i].hidden) return i
    }
    return doc.activeIndex
  }

  // ---------- clipboard events ----------

  useEffect(() => {
    if (secondary) return
    const onCopy = (e: ClipboardEvent) => {
      if (doc.edit || document.activeElement !== sink.current) return
      clipboardEventSeen.current = true
      e.preventDefault()
      const res = copy(doc, e.type === 'cut')
      if (typeof res === 'string') return app.alert(res)
      e.clipboardData?.setData('text/plain', res.text)
      e.clipboardData?.setData('text/html', res.html)
    }
    const onPaste = (e: ClipboardEvent) => {
      if (doc.edit || document.activeElement !== sink.current) return
      clipboardEventSeen.current = true
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      const html = e.clipboardData?.getData('text/html') ?? ''
      if (isOwnClipboard(doc, text) || (!text && doc.clip)) {
        const err = pasteInternal(doc)
        if (err) app.alert(err)
      } else if (text || html) pasteExternal(doc, text, html)
    }
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
      document.removeEventListener('paste', onPaste)
    }
  }, [doc, app])

  // expose focus for the shell
  useEffect(() => {
    const el = sink.current
    if (secondary) return
    if (el) (window as unknown as { __focusGrid?: () => void }).__focusGrid = () => el.focus({ preventScroll: true })
    ;(window as unknown as { __openValidationList?: () => void }).__openValidationList = () => setListOpen(true)
  })

  // ---------- editor ----------

  const g0 = geometry()
  const rect = editorRect(g0)

  function renderPopups(g: Geometry) {
    const out: React.ReactNode[] = []
    const cellBox = (r: number, c: number) => {
      const m = sheet.mergeAt(r, c) ?? { r1: r, c1: c, r2: r, c2: c }
      const x = g.colX(m.c1)
      const y = g.rowY(m.r1)
      return { x, y, w: g.colX(m.c2) + g.colW(m.c2) - x, h: g.rowY(m.r2) + g.rowH(m.r2) - y }
    }
    const inView = (b: { x: number; y: number }) => b.x >= g.headerW - 2 && b.y >= g.headerH - 2 && b.x < size.w && b.y < size.h
    if (hover && !drag.current) {
      const note = noteAt(sheet, hover.r, hover.c)
      const thread = threadAt(sheet, hover.r, hover.c)
      const b = cellBox(hover.r, hover.c)
      if (inView(b) && (thread || (note && !note.visible)))
        out.push(
          <div key="hover" className={thread ? 'cell-pop comment-pop' : 'cell-pop note-pop'} style={{ left: b.x + b.w + 8, top: b.y }}>
            {thread ? (
              thread.items.map((it, i) => (
                <div key={i} className="comment">
                  <strong>{it.author}</strong>
                  <div>{it.text}</div>
                </div>
              ))
            ) : (
              <>
                <strong>{note!.author}:</strong>
                <div>{note!.text}</div>
              </>
            )}
          </div>,
        )
    }
    const a = doc.sel.active
    const v = validationAt(sheet, a.r, a.c)
    if (v && !doc.edit && !drag.current) {
      const b = cellBox(a.r, a.c)
      if (inView(b) && v.showInput && (v.inputTitle || v.inputMessage) && !listOpen)
        out.push(
          <div key="input" className="cell-pop input-pop" style={{ left: b.x + 12, top: b.y + b.h + 6 }}>
            {v.inputTitle && <strong>{v.inputTitle}</strong>}
            {v.inputMessage && <div>{v.inputMessage}</div>}
          </div>,
        )
      if (listOpen && v.type === 'list') {
        const items = listItems(doc, sheet, v, a.r, a.c)
        out.push(
          <div key="list" className="cell-list" style={{ left: b.x, top: b.y + b.h, minWidth: b.w + 18 }} onPointerDown={(e) => e.stopPropagation()}>
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                className="cell-list-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setListOpen(false)
                  try {
                    doc.setInput(a.r, a.c, it)
                  } catch (err) {
                    app.alert(String((err as Error).message))
                  }
                  sink.current?.focus({ preventScroll: true })
                }}
              >
                {it}
              </button>
            ))}
            {!items.length && <div className="cell-list-empty">(no items)</div>}
          </div>,
        )
      }
    }
    return out
  }
  const ed = doc.edit
  let editor: React.ReactNode = null
  if (ed && rect && !secondary) {
    const st = doc.style(ed.r, ed.c)
    editor = (
      <CellEditor
        doc={doc}
        rect={rect}
        font={fontFor(st, sheet.zoom / 100)}
        color={st.color ?? '#000'}
        background={st.fill ?? '#fff'}
        wrap={!!st.wrap}
        zoom={sheet.zoom / 100}
        alert={app.alert}
        focusGrid={() => sink.current?.focus({ preventScroll: true })}
        wrapperRef={editorWrap}
      />
    )
  }
  void DEFAULT_SIZE
  void normalize
  void BRAND

  return (
    <div
      className="grid-scroller"
      ref={scroller}
      style={hidden ? { visibility: 'hidden' } : undefined}
      onScroll={(e) => {
        const el = e.currentTarget
        doc.scroll.set(scrollKey(sheet.id), { x: el.scrollLeft, y: el.scrollTop })
        drawRef.current()
      }}
      onWheel={onWheel}
    >
      <div className="grid-sticky">
        <canvas
          ref={canvas}
          className="grid-canvas"
          style={{ width: size.w, height: size.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContext}
        />
        <textarea ref={sink} className="grid-sink" aria-label="Spreadsheet grid" onKeyDown={onKeyDown} onInput={(e) => {
            const v = e.currentTarget.value
            e.currentTarget.value = ''
            if (!v || (e.nativeEvent as InputEvent).isComposing) return
            if (doc.edit) doc.updateEdit({ text: doc.edit.text + v, caret: doc.edit.text.length + v.length })
            else doc.beginEdit('enter', v)
          }}
          onCompositionEnd={(e) => {
            const v = e.currentTarget.value
            e.currentTarget.value = ''
            if (v && !doc.edit) doc.beginEdit('enter', v)
          }} tabIndex={0} spellCheck={false} />
        {editor}
        {renderPopups(g0)}
        <QuickAnalysis g={g0} />
        <ObjectLayer
          doc={doc}
          register={registerLayer}
          onContext={(x, y) => onContextMenu(x, y, 'object')}
          onOpenFormat={(id) => onOpenFormat?.(id)}
        />
      </div>
      <div ref={spacer} className="grid-spacer" />
    </div>
  )
}

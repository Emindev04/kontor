// Floating objects drawn over the canvas: charts, pictures, shapes and text boxes, with
// selection handles for moving, resizing and rotating.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Anchor, ChartDef, ShapeObj, SheetObject, SlicerObj } from '../model/extras'
import { FilterX, ListChecks } from 'lucide-react'
import { clearSlicer, clickSlicerItem, setTimelineLevel, setTimelineRange, slicerItems, timelineSpan } from '../commands/slicers'
import type { Doc } from '../commands/doc'
import { selectObject, updateObject } from '../commands/objects'
import { chartData } from '../charts/chartData'
import { renderChartSVG } from '../charts/renderChart'
import { shapeSVG } from '../charts/shapes'
import type { Geometry } from './geometry'
import { sheetToCanvas } from './render'

type Drag = { id: number; mode: 'move' | 'resize' | 'rotate'; handle?: string; x0: number; y0: number; orig: Anchor; rot0: number; moved: boolean }

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

export function ChartSVG({ doc, chart, w, h }: { doc: Doc; chart: ChartDef; w: number; h: number }) {
  const v = doc.version
  const svg = useMemo(() => renderChartSVG(chart, chartData(doc.wb, doc.engine, chart), w, h), [doc, chart, w, h, v])
  return <div className="obj-svg" dangerouslySetInnerHTML={{ __html: svg }} />
}

function ShapeView({ o, w, h, editing, onDone }: { o: ShapeObj; w: number; h: number; editing: boolean; onDone: (text: string | null) => void }) {
  const svg = useMemo(() => shapeSVG(o, w, h), [o, w, h])
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing) ta.current?.focus()
  }, [editing])
  const textStyle: React.CSSProperties = {
    color: o.textColor,
    fontSize: `${o.fontSize}pt`,
    fontWeight: o.bold ? 700 : 400,
    fontStyle: o.italic ? 'italic' : undefined,
    textAlign: o.align,
    justifyContent: o.vAlign === 'top' ? 'flex-start' : o.vAlign === 'bottom' ? 'flex-end' : 'center',
    textShadow: o.effect === 'shadow' ? '2px 2px 3px rgba(0,0,0,.45)' : o.effect === 'glow' ? '0 0 6px #f2c12e, 0 0 10px #f2c12e' : o.effect === 'outline' ? '-1px -1px 0 #1f3b73, 1px -1px 0 #1f3b73, -1px 1px 0 #1f3b73, 1px 1px 0 #1f3b73' : undefined,
  }
  return (
    <>
      <div className="obj-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      {editing ? (
        <textarea
          ref={ta}
          className="obj-text obj-text-edit"
          style={textStyle}
          defaultValue={o.text}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onDone(e.currentTarget.value)
          }}
          onBlur={(e) => onDone(e.currentTarget.value)}
        />
      ) : (
        o.text && (
          <div className="obj-text" style={textStyle}>
            <span>{o.text}</span>
          </div>
        )
      )}
    </>
  )
}

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const toDate = (serial: number) => new Date(Math.round((serial - 25569) * 86400000))
const toSerial = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 86400000 + 25569

/** Periods of a timeline level between two dates: [start, end) serials with their labels. */
function periods(level: NonNullable<SlicerObj['timeline']>['level'], min: number, max: number) {
  const out: { start: number; end: number; label: string; year: number }[] = []
  const a = toDate(min)
  let y = a.getUTCFullYear()
  let m = level === 'years' ? 0 : level === 'quarters' ? Math.floor(a.getUTCMonth() / 3) * 3 : a.getUTCMonth()
  let d = level === 'days' ? a.getUTCDate() : 1
  while (out.length < 2000) {
    const start = toSerial(y, m, d)
    if (start > max) break
    const next = level === 'years' ? [y + 1, 0, 1] : level === 'quarters' ? [y, m + 3, 1] : level === 'months' ? [y, m + 1, 1] : [y, m, d + 1]
    const end = toSerial(next[0], next[1], next[2])
    const label = level === 'years' ? String(y) : level === 'quarters' ? `Q${m / 3 + 1}` : level === 'months' ? MON3[m] : String(toDate(start).getUTCDate())
    out.push({ start, end, label, year: toDate(start).getUTCFullYear() })
    const nd = toDate(end)
    ;[y, m, d] = [nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate()]
  }
  return out
}

function TimelineView({ doc, o }: { doc: Doc; o: SlicerObj }) {
  const t = o.timeline!
  const span = timelineSpan(doc, o)
  const list = span ? periods(t.level, span.min, span.max) : []
  const dragFrom = useRef<number | null>(null)
  const stop = (e: React.PointerEvent) => e.stopPropagation()
  const pick = (i: number, extend: boolean) => {
    const p = list[i]
    if (!p) return
    if (extend && t.start !== null && t.end !== null) setTimelineRange(doc, o.id, Math.min(t.start, p.start), Math.max(t.end, p.end))
    else setTimelineRange(doc, o.id, p.start, p.end)
  }
  const fmt = (serial: number) => {
    const dt = toDate(serial)
    return t.level === 'years' ? String(dt.getUTCFullYear()) : t.level === 'days' ? `${MON3[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}` : `${MON3[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`
  }
  const label = t.start === null || t.end === null ? 'All Periods' : (() => {
    const last = t.end - 1
    const a = fmt(t.start)
    const b = fmt(last)
    return a === b ? a : `${a} – ${b}`
  })()
  return (
    <div className="timeline">
      <div className="slicer-head">
        <span className="slicer-caption">{o.caption}</span>
        <button type="button" title="Clear Filter (Alt+C)" aria-label="Clear Filter" disabled={t.start === null} onPointerDown={stop} onClick={() => setTimelineRange(doc, o.id, null, null)}>
          <FilterX size={14} />
        </button>
      </div>
      <div className="tl-bar">
        <span className="tl-label">{label}</span>
        <select aria-label="Time level" value={t.level} onPointerDown={stop} onChange={(e) => setTimelineLevel(doc, o.id, e.target.value as typeof t.level)}>
          <option value="years">YEARS</option>
          <option value="quarters">QUARTERS</option>
          <option value="months">MONTHS</option>
          <option value="days">DAYS</option>
        </select>
      </div>
      <div className="tl-strip" onPointerDown={stop}>
        {list.map((p, i) => {
          const on = t.start !== null && t.end !== null && p.start >= t.start && p.end <= t.end
          const showYear = t.level !== 'years' && (i === 0 || list[i - 1].year !== p.year)
          return (
            <div key={p.start} className="tl-cell-wrap">
              <span className="tl-year">{showYear ? p.year : ''}</span>
              <button
                type="button"
                className={on ? 'tl-cell is-on' : 'tl-cell'}
                style={on ? { background: o.color, borderColor: o.color } : undefined}
                aria-pressed={on}
                aria-label={fmt(p.start)}
                onPointerDown={(e) => {
                  dragFrom.current = i
                  pick(i, e.shiftKey)
                }}
                onPointerEnter={(e) => {
                  const from = dragFrom.current
                  if (from === null || !(e.buttons & 1)) return
                  setTimelineRange(doc, o.id, list[Math.min(from, i)].start, list[Math.max(from, i)].end)
                }}
                onPointerUp={() => (dragFrom.current = null)}
              />
              <span className="tl-name">{p.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SlicerView({ doc, o }: { doc: Doc; o: SlicerObj }) {
  if (o.timeline) return <TimelineView doc={doc} o={o} />
  const { items, selected } = slicerItems(doc, o)
  const stop = (e: React.PointerEvent) => e.stopPropagation()
  return (
    <div className="slicer">
      <div className="slicer-head">
        <span className="slicer-caption">{o.caption}</span>
        <button type="button" className={o.multi ? 'is-active' : undefined} title="Multi-Select (Alt+S)" aria-label="Multi-Select" onPointerDown={stop} onClick={() => updateObject(doc, o.id, { multi: !o.multi } as Partial<SheetObject>, 'Multi-Select')}>
          <ListChecks size={14} />
        </button>
        <button type="button" title="Clear Filter (Alt+C)" aria-label="Clear Filter" disabled={o.selected === null} onPointerDown={stop} onClick={() => clearSlicer(doc, o.id)}>
          <FilterX size={14} />
        </button>
      </div>
      <div className="slicer-items" style={{ gridTemplateColumns: `repeat(${Math.max(1, o.columns)}, 1fr)` }}>
        {items.map((it) => {
          const on = selected.has(it)
          return (
            <button
              key={it}
              type="button"
              className={on ? 'is-on' : undefined}
              style={on ? { background: o.color, borderColor: o.color } : undefined}
              aria-pressed={on}
              onPointerDown={stop}
              onClick={(e) => clickSlicerItem(doc, o.id, it, e.ctrlKey || e.metaKey)}
            >
              {it}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ObjectLayer({
  doc,
  register,
  onContext,
  onOpenFormat,
}: {
  doc: Doc
  register: (fn: (g: Geometry) => void) => void
  onContext: (x: number, y: number) => void
  onOpenFormat: (id: number) => void
}) {
  const [g, setG] = useState<Geometry | null>(null)
  const [draft, setDraft] = useState<{ id: number; anchor: Anchor; rotation?: number } | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const sheet = doc.sheet
  const objects = sheet.x.objects

  useEffect(() => {
    register((geom) => setG(geom))
  }, [register])

  if (!g || !objects.length) return null
  const z = g.z

  const begin = (e: React.PointerEvent, o: SheetObject, mode: Drag['mode'], handle?: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    if (doc.edit) doc.commitEdit()
    if (doc.selObj !== o.id) selectObject(doc, o.id)
    ;(window as unknown as { __focusGrid?: () => void }).__focusGrid?.()
    drag.current = { id: o.id, mode, handle, x0: e.clientX, y0: e.clientY, orig: { ...o.anchor }, rot0: 'rotation' in o ? o.rotation : 0, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x0) / z
    const dy = (e.clientY - d.y0) / z
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2) return
    d.moved = true
    const a = d.orig
    if (d.mode === 'move') {
      setDraft({ id: d.id, anchor: { ...a, x: Math.max(0, a.x + dx), y: Math.max(0, a.y + dy) } })
      return
    }
    if (d.mode === 'rotate') {
      const box = (e.currentTarget as HTMLElement).closest('.obj')?.getBoundingClientRect()
      if (!box) return
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      let ang = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90
      if (e.shiftKey) ang = Math.round(ang / 15) * 15
      setDraft({ id: d.id, anchor: a, rotation: Math.round(((ang % 360) + 360) % 360) })
      return
    }
    const h = d.handle!
    let { x, y, w, h: hh } = a
    if (h.includes('e')) w = a.w + dx
    if (h.includes('s')) hh = a.h + dy
    if (h.includes('w')) {
      w = a.w - dx
      x = a.x + dx
    }
    if (h.includes('n')) {
      hh = a.h - dy
      y = a.y + dy
    }
    const o = objects.find((x) => x.id === d.id)
    const keepRatio = e.shiftKey !== (o?.kind === 'picture') && h.length === 2
    if (keepRatio) {
      const ratio = a.w / a.h
      if (Math.abs(w - a.w) / a.w > Math.abs(hh - a.h) / a.h) {
        const nh = w / ratio
        if (h.includes('n')) y = a.y + a.h - nh
        hh = nh
      } else {
        const nw = hh * ratio
        if (h.includes('w')) x = a.x + a.w - nw
        w = nw
      }
    }
    const isLine = o?.kind === 'shape' && (o.shape === 'line' || o.shape === 'straightConnector1' || o.shape === 'doubleArrowLine')
    if (!isLine) {
      if (w < 8) w = 8
      if (hh < 8) hh = 8
    }
    setDraft({ id: d.id, anchor: { x, y, w, h: hh } })
  }

  const end = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (!d || !d.moved || !draft) {
      setDraft(null)
      return
    }
    const patch: Partial<SheetObject> = d.mode === 'rotate' ? ({ rotation: draft.rotation ?? 0 } as Partial<SheetObject>) : { anchor: draft.anchor }
    setDraft(null)
    updateObject(doc, d.id, patch, d.mode === 'move' ? 'Move Object' : d.mode === 'rotate' ? 'Rotate Object' : 'Size Object')
  }

  return (
    <div className="obj-layer" style={{ left: g.headerW, top: g.headerH, width: Math.max(0, g.width - g.headerW), height: Math.max(0, g.height - g.headerH) }}>
      {objects.map((o) => {
        const anchor = draft?.id === o.id ? draft.anchor : o.anchor
        const rotation = draft?.id === o.id && draft.rotation !== undefined ? draft.rotation : 'rotation' in o ? o.rotation : 0
        const p = sheetToCanvas(g, anchor.x, anchor.y)
        const left = p.x - g.headerW
        const top = p.y - g.headerH
        const w = anchor.w * z
        const h = anchor.h * z
        const sel = doc.selObj === o.id
        const flipW = w < 0
        const flipH = h < 0
        const style: React.CSSProperties = {
          left: flipW ? left + w : left,
          top: flipH ? top + h : top,
          width: Math.abs(w),
          height: Math.abs(h),
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }
        return (
          <div
            key={o.id}
            className={`obj obj-${o.kind}${sel ? ' is-selected' : ''}`}
            style={style}
            onPointerDown={(e) => begin(e, o, 'move')}
            onPointerMove={move}
            onPointerUp={end}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (o.kind === 'shape' && !(o.shape === 'line' || o.shape.includes('Connector') || o.shape === 'doubleArrowLine')) setEditing(o.id)
              else if (o.kind !== 'slicer') onOpenFormat(o.id)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (doc.selObj !== o.id) selectObject(doc, o.id)
              onContext(e.clientX, e.clientY)
            }}
            role="img"
            aria-label={o.name}
          >
            {o.kind === 'chart' && <ChartSVG doc={doc} chart={o} w={Math.max(40, anchor.w)} h={Math.max(30, anchor.h)} />}
            {o.kind === 'slicer' && <SlicerView doc={doc} o={o} />}
            {o.kind === 'picture' && <img className="obj-img" src={doc.wb.images.get(o.image)} alt={o.alt ?? o.name} draggable={false} style={o.border ? { outline: `2px solid ${o.border}` } : undefined} />}
            {o.kind === 'shape' && (
              <ShapeView
                o={o}
                w={Math.max(1, Math.abs(anchor.w))}
                h={Math.max(1, Math.abs(anchor.h))}
                editing={editing === o.id}
                onDone={(text) => {
                  setEditing(null)
                  if (text !== null && text !== o.text) updateObject(doc, o.id, { text } as Partial<SheetObject>, 'Edit Text')
                }}
              />
            )}
            {sel && (
              <>
                {HANDLES.map((hd) => (
                  <span key={hd} className={`obj-handle h-${hd}`} onPointerDown={(e) => begin(e, o, 'resize', hd)} onPointerMove={move} onPointerUp={end} />
                ))}
                {o.kind !== 'chart' && o.kind !== 'slicer' && <span className="obj-rotate" title="Rotate" onPointerDown={(e) => begin(e, o, 'rotate')} onPointerMove={move} onPointerUp={end} />}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { paperDims, type PageSetup } from '../pageSetup'
import { PX_PER_IN, formatLength, type Unit } from '../units'
import type { TabAlign, TabStop } from '../editor/TabStops'

type Marker = 'firstLine' | 'hanging' | 'left' | 'right' | 'marginLeft' | 'marginRight' | 'tab'
type Drag = { marker: Marker; value: number; tab?: number; off?: boolean }

const TAB_TYPES: TabAlign[] = ['left', 'center', 'right', 'decimal', 'bar']
const TAB_LABEL: Record<TabAlign, string> = { left: 'Left Tab', center: 'Center Tab', right: 'Right Tab', decimal: 'Decimal Tab', bar: 'Bar Tab' }

/** Ruler glyph of a tab stop at x. */
function tabGlyph(align: TabAlign, x: number) {
  switch (align) {
    case 'left': return `M${x} 9 V15 H${x + 5}`
    case 'right': return `M${x} 9 V15 H${x - 5}`
    case 'center': return `M${x} 9 V15 M${x - 4} 15 H${x + 4}`
    case 'decimal': return `M${x} 9 V15 M${x - 4} 15 H${x + 4} M${x + 2.5} 11.5 h1`
    case 'bar': return `M${x} 8 V16`
  }
}

/**
 * Horizontal ruler. Numbers count from the left margin like the original. The indent markers show
 * the current paragraph and can be dragged; dragging the gray/white boundary changes the margins.
 */
export function Ruler({ editor, setup, setSetup, zoom, unit }: { editor: Editor; setup: PageSetup; setSetup: (s: PageSetup) => void; zoom: number; unit: Unit }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [tabType, setTabType] = useState<TabAlign>('left')
  const stops = ((editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')).tabStops as TabStop[] | null) ?? []
  const setStops = (next: TabStop[]) => editor.chain().focus().setParagraphFormat({ tabStops: next.length ? next.sort((a, b) => a.pos - b.pos) : null }).run()
  const { w } = paperDims(setup)
  const W = w * PX_PER_IN
  const ml = setup.margins.left * PX_PER_IN
  const mr = setup.margins.right * PX_PER_IN
  const para = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const L = ((para.indentLeft as number) ?? 0) * PX_PER_IN
  const F = ((para.indentFirstLine as number) ?? 0) * PX_PER_IN
  const R = ((para.indentRight as number) ?? 0) * PX_PER_IN

  const metric = unit === 'cm' || unit === 'mm'
  const major = metric ? PX_PER_IN / 2.54 : PX_PER_IN
  const minorCount = metric ? 4 : 8
  const snap = metric ? major / 4 : PX_PER_IN / 16

  // Positions in ruler pixels, with an active drag overriding its marker.
  const pos: Record<Marker, number> = {
    firstLine: ml + L + F,
    hanging: ml + L,
    left: ml + L,
    right: W - mr - R,
    marginLeft: ml,
    marginRight: W - mr,
    tab: 0,
  }
  if (drag) {
    pos[drag.marker] = drag.value
    if (drag.marker === 'left') pos.hanging = drag.value
    if (drag.marker === 'left') pos.firstLine = drag.value + F
    if (drag.marker === 'hanging') pos.left = drag.value
  }
  const marginLeft = drag?.marker === 'marginLeft' ? drag.value : ml
  const marginRight = drag?.marker === 'marginRight' ? drag.value : W - mr

  const toRuler = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * W
  }

  const start = (marker: Marker) => (e: React.PointerEvent) => {
    e.preventDefault()
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {
      // Synthetic events have no capturable pointer; dragging still works while over the ruler.
    }
    setDrag({ marker, value: pos[marker] })
  }

  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const raw = toRuler(e.clientX)
    if (drag.marker === 'tab') {
      // Dragging a tab stop down off the ruler removes it.
      const r = svgRef.current!.getBoundingClientRect()
      const off = e.clientY > r.bottom + 12 || e.clientY < r.top - 12
      const snappedTab = e.altKey ? raw : ml + Math.round((raw - ml) / snap) * snap
      setDrag({ ...drag, value: Math.min(W - mr, Math.max(ml, snappedTab)), off })
      return
    }
    const origin = drag.marker.startsWith('margin') ? 0 : ml
    const snapped = e.altKey ? raw : origin + Math.round((raw - origin) / snap) * snap
    const limits: Record<Marker, [number, number]> = {
      tab: [ml, W - mr],
      firstLine: [0, W - mr - R - 24],
      hanging: [0, W - mr - R - 24],
      left: [0, W - mr - R - 24 - Math.max(0, F)],
      right: [ml + L + 24, W],
      marginLeft: [0, W - mr - 72],
      marginRight: [ml + 72, W],
    }
    const [lo, hi] = limits[drag.marker]
    setDrag({ ...drag, value: Math.min(hi, Math.max(lo, snapped)) })
  }

  const end = () => {
    if (!drag) return
    const v = drag.value
    const toIn = (px: number) => Math.round((px / PX_PER_IN) * 10000) / 10000
    const chain = editor.chain().focus()
    switch (drag.marker) {
      case 'tab': {
        const rest = stops.filter((_, i) => i !== drag.tab)
        if (!drag.off) rest.push({ ...stops[drag.tab!], pos: toIn(v - ml) })
        setStops(rest)
        break
      }
      case 'firstLine':
        chain.setParagraphFormat({ indentFirstLine: toIn(v - ml - L) }).run()
        break
      case 'hanging':
        // Moves the left indent but keeps the first line where it is.
        chain.setParagraphFormat({ indentLeft: toIn(v - ml), indentFirstLine: toIn(ml + L + F - v) }).run()
        break
      case 'left':
        chain.setParagraphFormat({ indentLeft: toIn(v - ml) }).run()
        break
      case 'right':
        chain.setParagraphFormat({ indentRight: toIn(W - mr - v) }).run()
        break
      case 'marginLeft':
        setSetup({ ...setup, margins: { ...setup.margins, left: toIn(v) } })
        break
      case 'marginRight':
        setSetup({ ...setup, margins: { ...setup.margins, right: toIn(W - v) } })
        break
    }
    setDrag(null)
  }

  const ticks: React.ReactNode[] = []
  const step = major / minorCount
  for (let i = -Math.floor(marginLeft / step); marginLeft + i * step <= W + 0.01; i++) {
    const x = marginLeft + i * step
    if (x < -0.01) continue
    const n = i / minorCount
    if (i % minorCount === 0 && i !== 0) {
      ticks.push(
        <text key={i} x={x} y={13.2} textAnchor="middle">
          {Math.abs(n)}
        </text>,
      )
    } else if (i % (minorCount / 2) === 0) {
      ticks.push(<line key={i} x1={x} x2={x} y1={7} y2={13} />)
    } else if (i !== 0) {
      ticks.push(<line key={i} x1={x} x2={x} y1={9} y2={11} />)
    }
  }

  const title = (marker: Marker) =>
    ({
      firstLine: 'First Line Indent',
      hanging: 'Hanging Indent',
      left: 'Left Indent',
      right: 'Right Indent',
      marginLeft: 'Left Margin',
      marginRight: 'Right Margin',
      tab: 'Tab Stop',
    })[marker]

  /** A click on the ruler's white area sets a tab stop of the selected type. */
  const addTab = (e: React.PointerEvent) => {
    if (drag || e.button !== 0) return
    const x = toRuler(e.clientX)
    if (x <= ml || x >= W - mr) return
    const at = Math.round(((ml + Math.round((x - ml) / snap) * snap - ml) / PX_PER_IN) * 10000) / 10000
    if (stops.some((s) => Math.abs(s.pos - at) < 0.02)) return
    setStops([...stops, { pos: at, align: tabType, leader: 'none' }])
  }

  return (
    <div className="ruler" style={{ width: W, zoom: zoom / 100 }}>
      <button
        type="button"
        className="ruler-tab-type"
        title={`${TAB_LABEL[tabType]} – click to change, then click the ruler to set a tab`}
        aria-label={TAB_LABEL[tabType]}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setTabType(TAB_TYPES[(TAB_TYPES.indexOf(tabType) + 1) % TAB_TYPES.length])}
      >
        <svg viewBox="0 0 14 14" width="14" height="14">
          <path d={tabGlyph(tabType, 7)} transform="translate(0 -5)" className="ruler-tab" />
        </svg>
      </button>
      <svg ref={svgRef} viewBox={`0 0 ${W} 20`} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}>
        <rect x={0} y={3} width={marginLeft} height={14} className="ruler-margin" />
        <rect x={marginRight} y={3} width={W - marginRight} height={14} className="ruler-margin" />
        <rect x={marginLeft} y={3} width={marginRight - marginLeft} height={14} className="ruler-text" onPointerDown={addTab} />
        <g className="ruler-ticks">{ticks}</g>
        <rect x={marginLeft - 3} y={3} width={6} height={14} className="ruler-margin-handle" onPointerDown={start('marginLeft')}>
          <title>{title('marginLeft')}</title>
        </rect>
        <rect x={marginRight - 3} y={3} width={6} height={14} className="ruler-margin-handle" onPointerDown={start('marginRight')}>
          <title>{title('marginRight')}</title>
        </rect>
        <path d={`M${pos.firstLine - 4.5} 1.5 h9 l-4.5 5.5 z`} className="ruler-marker" onPointerDown={start('firstLine')}>
          <title>{title('firstLine')}</title>
        </path>
        <path d={`M${pos.hanging - 4.5} 14 h9 l-4.5 -5.5 z`} className="ruler-marker" onPointerDown={start('hanging')}>
          <title>{title('hanging')}</title>
        </path>
        <rect x={pos.left - 4.5} y={14} width={9} height={4.5} className="ruler-marker" onPointerDown={start('left')}>
          <title>{title('left')}</title>
        </rect>
        <path d={`M${pos.right - 4.5} 14 h9 l-4.5 -5.5 z`} className="ruler-marker" onPointerDown={start('right')}>
          <title>{title('right')}</title>
        </path>
        {stops.map((t, i) => {
          const x = drag?.marker === 'tab' && drag.tab === i ? drag.value : ml + t.pos * PX_PER_IN
          return (
            <g key={i} className={drag?.marker === 'tab' && drag.tab === i && drag.off ? 'ruler-tab-off' : undefined}>
              <path d={tabGlyph(t.align, x)} className="ruler-tab" />
              <rect
                x={x - 4}
                y={7}
                width={8}
                height={10}
                className="ruler-tab-hit"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  start('tab')(e)
                  setDrag({ marker: 'tab', value: x, tab: i })
                }}
                onDoubleClick={() => window.dispatchEvent(new CustomEvent('kontor:open-dialog', { detail: 'tabs' }))}
              >
                <title>{`${TAB_LABEL[t.align]} at ${formatLength(t.pos, unit)} – drag to move, drag off the ruler to remove`}</title>
              </rect>
            </g>
          )
        })}
      </svg>
      {drag && (
        <div className="ruler-tip" style={{ left: drag.value }}>
          {formatLength((drag.marker.startsWith('margin') ? (drag.marker === 'marginLeft' ? drag.value : W - drag.value) : drag.marker === 'right' ? W - mr - drag.value : drag.value - ml) / PX_PER_IN, unit)}
        </div>
      )}
    </div>
  )
}

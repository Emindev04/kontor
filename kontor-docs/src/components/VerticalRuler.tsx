import { useRef, useState } from 'react'
import { effectiveMargins, paperDims, type PageSetup } from '../pageSetup'
import { PX_PER_IN, formatLength, type Unit } from '../units'
import { t } from '../i18n'

type Drag = { edge: 'top' | 'bottom'; value: number }

/**
 * Vertical ruler beside the page with the cursor (View › Ruler, Print Layout). Numbers count from
 * the top margin like the horizontal ruler; dragging the gray/white boundaries changes the top and
 * bottom margins.
 */
export function VerticalRuler({ setup, setSetup, page, stride, unit }: { setup: PageSetup; setSetup: (s: PageSetup) => void; page: number; stride: number; unit: Unit }) {
  const ref = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const H = paperDims(setup).h * PX_PER_IN
  const m = effectiveMargins(setup)
  const gutterTop = setup.gutterPosition === 'top' ? (setup.gutter ?? 0) : 0
  const top = drag?.edge === 'top' ? drag.value : m.top * PX_PER_IN
  const bottom = drag?.edge === 'bottom' ? drag.value : H - m.bottom * PX_PER_IN
  const metric = unit === 'cm' || unit === 'mm'
  const major = metric ? PX_PER_IN / 2.54 : PX_PER_IN
  const minorCount = metric ? 4 : 8
  const step = major / minorCount

  const toRuler = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    return ((clientY - r.top) / r.height) * H
  }
  const start = (edge: Drag['edge']) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDrag({ edge, value: edge === 'top' ? top : bottom })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const y = Math.round(toRuler(e.clientY) / (step / 2)) * (step / 2)
    const value = drag.edge === 'top' ? Math.max(0, Math.min(y, bottom - PX_PER_IN)) : Math.min(H, Math.max(y, top + PX_PER_IN))
    setDrag({ ...drag, value })
  }
  const end = () => {
    if (!drag) return
    const inches = Math.round((drag.edge === 'top' ? drag.value / PX_PER_IN - gutterTop : (H - drag.value) / PX_PER_IN) * 1000) / 1000
    setSetup({ ...setup, margins: { ...setup.margins, [drag.edge]: Math.max(0, inches) } })
    setDrag(null)
  }

  const ticks: React.ReactNode[] = []
  for (let i = -Math.floor(top / step); top + i * step <= H + 0.01; i++) {
    const y = top + i * step
    if (y < -0.01) continue
    if (i % minorCount === 0 && i !== 0) {
      ticks.push(
        <text key={i} x={10} y={y + 3} textAnchor="middle">
          {Math.abs(i / minorCount)}
        </text>,
      )
    } else if (i % (minorCount / 2) === 0) ticks.push(<line key={i} x1={7} x2={13} y1={y} y2={y} />)
    else if (i !== 0) ticks.push(<line key={i} x1={9} x2={11} y1={y} y2={y} />)
  }

  return (
    <div className="vruler" style={{ top: page * stride, height: H }} aria-label={t('Vertical ruler')}>
      <svg ref={ref} viewBox={`0 0 20 ${H}`} preserveAspectRatio="none" onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}>
        <rect x={3} y={0} width={14} height={top} className="ruler-margin" />
        <rect x={3} y={bottom} width={14} height={H - bottom} className="ruler-margin" />
        <rect x={3} y={top} width={14} height={bottom - top} className="ruler-text" />
        <g className="ruler-ticks">{ticks}</g>
        <rect x={3} y={top - 3} width={14} height={6} className="vruler-handle" onPointerDown={start('top')}>
          <title>{t('Top Margin')}</title>
        </rect>
        <rect x={3} y={bottom - 3} width={14} height={6} className="vruler-handle" onPointerDown={start('bottom')}>
          <title>{t('Bottom Margin')}</title>
        </rect>
      </svg>
      {drag && (
        <div className="ruler-tip vruler-tip" style={{ top: drag.value }}>
          {formatLength(drag.edge === 'top' ? drag.value / PX_PER_IN : (H - drag.value) / PX_PER_IN, unit)}
        </div>
      )}
    </div>
  )
}

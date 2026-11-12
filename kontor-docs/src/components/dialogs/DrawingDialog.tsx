import { useEffect, useRef, useState } from 'react'
import { Eraser, Highlighter, Pen, Trash2, Undo2 } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel, cls } from '../ui'
import { t, tx } from '../../i18n'

type Tool = { id: string; label: string; kind: 'pen' | 'highlighter' | 'eraser'; color: string; width: number }
type Stroke = { tool: Tool; points: [number, number][] }

const TOOLS: Tool[] = [
  { id: 'black', label: tx('Pen: Black'), kind: 'pen', color: '#000000', width: 2.5 },
  { id: 'red', label: tx('Pen: Red'), kind: 'pen', color: '#E02020', width: 2.5 },
  { id: 'blue', label: tx('Pen: Blue'), kind: 'pen', color: '#1F5AA6', width: 2.5 },
  { id: 'green', label: tx('Pen: Green'), kind: 'pen', color: '#2E8B3C', width: 2.5 },
  { id: 'highlighter', label: tx('Highlighter: Yellow'), kind: 'highlighter', color: 'rgba(255, 230, 0, 0.45)', width: 14 },
  { id: 'eraser', label: tx('Eraser'), kind: 'eraser', color: '#fff', width: 18 },
]

const W = 760
const H = 420

function draw(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, W, H)
  for (const s of strokes) {
    ctx.save()
    ctx.globalCompositeOperation = s.tool.kind === 'eraser' ? 'destination-out' : s.tool.kind === 'highlighter' ? 'multiply' : 'source-over'
    ctx.strokeStyle = s.tool.kind === 'eraser' ? '#000' : s.tool.color
    ctx.lineWidth = s.tool.width
    ctx.lineCap = s.tool.kind === 'highlighter' ? 'square' : 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.1, s.points[0][1])
    ctx.stroke()
    ctx.restore()
  }
}

/** Drawing canvas (Draw tab): sketch with pens and a highlighter, insert the result as a picture. */
export function DrawingDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState(TOOLS[0])
  const [width, setWidth] = useState(TOOLS[0].width)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const current = useRef<Stroke | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx, current.current ? [...strokes, current.current] : strokes)
  }, [strokes])

  const point = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }

  const insert = () => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, W, H)
    let [x0, y0, x1, y1] = [W, H, 0, 0]
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    if (x1 < x0) return onClose()
    const pad = 6
    x0 = Math.max(0, x0 - pad)
    y0 = Math.max(0, y0 - pad)
    x1 = Math.min(W, x1 + pad)
    y1 = Math.min(H, y1 + pad)
    const out = document.createElement('canvas')
    out.width = x1 - x0
    out.height = y1 - y0
    out.getContext('2d')!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
    editor.chain().focus().setImage({ src: out.toDataURL('image/png'), alt: 'Ink' }).run()
    onClose()
  }

  return (
    <Modal title={t('Drawing Canvas')} onClose={onClose} width={820} footer={<OkCancel okLabel={t('Insert')} onOk={insert} onCancel={onClose} />}>
      <div className="draw-tools">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cls('rb', tool.id === item.id && 'is-active')}
            title={t(item.label)}
            aria-label={t(item.label)}
            onClick={() => {
              setTool(item)
              setWidth(item.width)
            }}
          >
            {item.kind === 'eraser' ? <Eraser size={18} /> : item.kind === 'highlighter' ? <Highlighter size={18} color="#d4b800" /> : <Pen size={18} color={item.color} />}
          </button>
        ))}
        <label className="draw-width">
          {t('Thickness')}{' '}<input type="range" min={1} max={30} step={0.5} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <span className="spacer" />
        <button type="button" className="rb" title={t('Undo stroke')} aria-label={t('Undo stroke')} disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>
          <Undo2 size={18} />
        </button>
        <button type="button" className="rb" title={t('Clear canvas')} aria-label={t('Clear canvas')} disabled={!strokes.length} onClick={() => setStrokes([])}>
          <Trash2 size={18} />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        width={W}
        height={H}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          current.current = { tool: { ...tool, width }, points: [point(e)] }
          setStrokes((s) => [...s])
        }}
        onPointerMove={(e) => {
          if (!current.current) return
          current.current.points.push(point(e))
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) draw(ctx, [...strokes, current.current])
        }}
        onPointerUp={() => {
          const stroke = current.current
          current.current = null
          if (stroke) setStrokes((s) => [...s, stroke])
        }}
      />
    </Modal>
  )
}

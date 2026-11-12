import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'

export type InkTool = { kind: 'pen' | 'highlighter' | 'eraser'; color: string; width: number }

/** Alt text of ink strokes (and of drawings from the drawing canvas): Hide Ink hides these pictures. */
export const INK_ALT = 'Ink'

type Point = [number, number]

/** Renders a stroke to a PNG data URL (twice the resolution, for print). */
export function strokeToPng(points: Point[], tool: InkTool): { src: string; x: number; y: number; w: number; h: number } {
  const pad = tool.width / 2 + 2
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  const w = Math.max(...xs) + pad - x
  const h = Math.max(...ys) + pad - y
  const canvas = document.createElement('canvas')
  const k = 2
  canvas.width = Math.max(1, Math.ceil(w * k))
  canvas.height = Math.max(1, Math.ceil(h * k))
  const ctx = canvas.getContext('2d')!
  ctx.scale(k, k)
  ctx.strokeStyle = tool.color
  ctx.lineWidth = tool.width
  ctx.lineCap = tool.kind === 'highlighter' ? 'square' : 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px - x, py - y) : ctx.moveTo(px - x, py - y)))
  if (points.length === 1) ctx.lineTo(points[0][0] - x + 0.1, points[0][1] - y)
  ctx.stroke()
  return { src: canvas.toDataURL('image/png'), x, y, w, h }
}

/** Places an ink stroke as a picture in front of the text, anchored to the paragraph under it. */
function placeInk(editor: Editor, pagesEl: HTMLElement, pageWidth: number, ink: ReturnType<typeof strokeToPng>) {
  const view = editor.view
  const pagesRect = pagesEl.getBoundingClientRect()
  const scale = pagesRect.width / pageWidth || 1
  const hit = view.posAtCoords({ left: pagesRect.left + (ink.x + ink.w / 2) * scale, top: pagesRect.top + (ink.y + ink.h / 2) * scale })
  const pos = Math.min(hit?.pos ?? editor.state.doc.content.size - 1, editor.state.doc.content.size)
  const $pos = editor.state.doc.resolve(pos)
  let depth = $pos.depth
  while (depth > 0 && !$pos.node(depth).isTextblock) depth--
  const blockPos = depth > 0 ? $pos.before(depth) : 0
  const blockDom = view.nodeDOM(blockPos) as HTMLElement | null
  const br = blockDom?.getBoundingClientRect() ?? pagesRect
  const anchor = depth > 0 ? $pos.start(depth) : pos
  editor
    .chain()
    .insertContentAt(anchor, {
      type: 'image',
      attrs: { src: ink.src, alt: INK_ALT, name: INK_ALT, width: Math.round(ink.w), height: Math.round(ink.h), wrap: 'front', offsetX: Math.round(ink.x - (br.left - pagesRect.left) / scale), offsetY: Math.round(ink.y - (br.top - pagesRect.top) / scale) },
    })
    .run()
}

/** Draw tab: pens and highlighters draw directly on the pages; the eraser removes whole strokes. */
export function InkOverlay({ editor, tool, pageWidth }: { editor: Editor; tool: InkTool; pageWidth: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<Point[] | null>(null)
  const scale = () => {
    const pages = ref.current?.parentElement
    return pages ? pages.getBoundingClientRect().width / pageWidth || 1 : 1
  }
  const toPage = (e: React.PointerEvent): Point => {
    const r = ref.current!.parentElement!.getBoundingClientRect()
    const s = scale()
    return [(e.clientX - r.left) / s, (e.clientY - r.top) / s]
  }
  const eraseAt = (e: React.PointerEvent) => {
    const overlay = ref.current
    if (!overlay) return
    overlay.style.pointerEvents = 'none'
    const el = document.elementFromPoint(e.clientX, e.clientY)
    overlay.style.pointerEvents = ''
    const img = el?.closest('.drawing')?.querySelector(`img[alt="${INK_ALT}"]`)
    const drawing = img?.closest('.drawing')
    if (!drawing) return
    const pos = editor.view.posAtDOM(drawing, 0)
    const $pos = editor.state.doc.resolve(pos)
    const node = editor.state.doc.nodeAt(pos) ?? $pos.nodeAfter
    const at = node?.type.name === 'image' ? pos : pos - 1
    const target = editor.state.doc.nodeAt(at)
    if (target?.type.name === 'image' && target.attrs.alt === INK_ALT) editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)).deleteSelection())
  }
  const path = points && points.length ? `M${points.map((p) => p.join(' ')).join(' L')}` : ''
  return (
    <div
      ref={ref}
      className={`ink-overlay is-${tool.kind}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        if (tool.kind === 'eraser') return eraseAt(e)
        setPoints([toPage(e)])
      }}
      onPointerMove={(e) => {
        if (tool.kind === 'eraser') {
          if (e.buttons === 1) eraseAt(e)
          return
        }
        if (points) setPoints([...points, toPage(e)])
      }}
      onPointerUp={() => {
        if (!points || tool.kind === 'eraser') return
        const pagesEl = ref.current?.parentElement
        setPoints(null)
        if (pagesEl) placeInk(editor, pagesEl, pageWidth, strokeToPng(points, tool))
      }}
    >
      {points && (
        <svg className="ink-live">
          <path d={path} fill="none" stroke={tool.color} strokeWidth={tool.width} strokeLinecap={tool.kind === 'highlighter' ? 'square' : 'round'} strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

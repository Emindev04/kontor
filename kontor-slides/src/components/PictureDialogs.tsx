// Picture dialogs loaded on demand: Remove Background.
import { useEffect, useRef, useState } from 'react'
import type { ImageElement } from '../model/types'
import { applyMask, backgroundMask, type Marks } from '../model/backgroundRemoval'
import { selectedElements } from '../store/store'
import * as A from '../store/actions'
import { Modal } from './ui'
import { t } from '../i18n'

const PREVIEW = 420
const MAX_EDGE = 2400

function loadPixels(src: string, maxEdge: number): Promise<{ canvas: HTMLCanvasElement; data: ImageData } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return resolve(null)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve({ canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height) })
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Marks stored as fractions of the picture, in pixels of a w×h copy. */
const scaled = (m: Marks, w: number, h: number): Marks => ({ keep: m.keep.map(([x, y]) => [x * w, y * h]), remove: m.remove.map(([x, y]) => [x * w, y * h]) })

/** Picture Format > Remove Background: preview, tolerance, areas to keep and to remove. */
export function RemoveBackgroundDialog({ onClose }: { onClose: () => void }) {
  const [img] = useState(() => selectedElements().find((e): e is ImageElement => e.type === 'image') ?? null)
  const [tolerance, setTolerance] = useState(25)
  const [mode, setMode] = useState<'keep' | 'remove'>('remove')
  const [marks, setMarks] = useState<Marks>({ keep: [], remove: [] })
  const [preview, setPreview] = useState<{ canvas: HTMLCanvasElement; data: ImageData } | null>(null)
  const [busy, setBusy] = useState(false)
  const view = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (img) loadPixels(img.src, PREVIEW).then(setPreview)
  }, [img])

  // Redraw the preview with the background removed (checkerboard shows through).
  useEffect(() => {
    const c = view.current
    if (!preview || !c) return
    const { width: w, height: h } = preview.data
    c.width = w
    c.height = h
    const data = new ImageData(new Uint8ClampedArray(preview.data.data), w, h)
    applyMask(data.data, w, h, backgroundMask(data.data, w, h, tolerance, scaled(marks, w, h)))
    c.getContext('2d')!.putImageData(data, 0, 0)
  }, [preview, tolerance, marks])

  const mark = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * (preview?.data.width ?? 1)
    const y = ((e.clientY - r.top) / r.height) * (preview?.data.height ?? 1)
    // Marks are stored as fractions so they apply at any resolution.
    setMarks((m) => ({ ...m, [mode]: [...m[mode], [x / (preview?.data.width ?? 1), y / (preview?.data.height ?? 1)]] }))
  }

  const keepChanges = async () => {
    if (!img) return
    setBusy(true)
    const full = await loadPixels(img.src, MAX_EDGE)
    if (full) {
      const { width: w, height: h } = full.data
      applyMask(full.data.data, w, h, backgroundMask(full.data.data, w, h, tolerance, scaled(marks, w, h)))
      full.canvas.getContext('2d')!.putImageData(full.data, 0, 0)
      A.replacePictureSource(img.id, full.canvas.toDataURL('image/png'))
    }
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      title={t('Remove Background')}
      width={520}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`btn${mode === 'keep' ? ' is-active' : ''}`} onClick={() => setMode('keep')}>
            {t('Mark Areas to Keep')}
          </button>
          <button type="button" className={`btn${mode === 'remove' ? ' is-active' : ''}`} onClick={() => setMode('remove')}>
            {t('Mark Areas to Remove')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!img || busy} onClick={keepChanges}>
            {t('Keep Changes')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Discard All Changes')}
          </button>
        </>
      }
    >
      <div className="form">
        {!img && <p>{t('Select a picture first.')}</p>}
        {img && (
          <>
            <div className="bg-removal-preview">
              <canvas ref={view} onClick={mark} style={{ cursor: 'crosshair', maxWidth: '100%', maxHeight: 340 }} aria-label={t('Picture preview')} />
            </div>
            <p className="hint">{mode === 'keep' ? t('Click the parts of the picture you want to keep.') : t('Click the parts of the picture you want to remove.')}</p>
            <label className="field-row">
              <span>{t('Sensitivity:')}</span>
              <input type="range" min={1} max={80} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} aria-label={t('Sensitivity')} />
              <span>{tolerance}</span>
            </label>
            <button type="button" className="btn" disabled={!marks.keep.length && !marks.remove.length} onClick={() => setMarks({ keep: [], remove: [] })}>
              {t('Clear Marks')}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

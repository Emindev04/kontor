// Less common dialogs, loaded on demand: Reuse Slides and Photo Album.
import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { Presentation } from '../model/types'
import { SlideView, presProps } from '../render/SlideView'
import * as A from '../store/actions'
import { Modal, pickFile } from './ui'
import { slideTitleText as slideTitle } from '../model/accessibility'

export function ReuseSlidesDialog({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState<{ pres: Presentation; title: string } | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const browse = async () => {
    const [file] = await pickFile('.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation')
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { importPptx } = await import('../io/pptxImport')
      const r = await importPptx(file)
      setSrc(r)
      setPicked(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be opened.')
    } finally {
      setBusy(false)
    }
  }
  const insert = (indices: number[]) => {
    if (!src || !indices.length) return
    A.insertSlidesFrom(src.pres, indices)
  }
  const scale = 0.14
  return (
    <Modal
      title="Reuse Slides"
      onClose={onClose}
      width={720}
      footer={
        <>
          <button type="button" className="btn" disabled={!src} onClick={() => src && (insert(src.pres.slides.map((_, i) => i)), onClose())}>
            Insert All Slides
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!picked.size} onClick={() => (insert([...picked].sort((a, b) => a - b)), onClose())}>
            Insert {picked.size > 1 ? `${picked.size} Slides` : 'Slide'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="reuse">
        <button type="button" className="bs-action" onClick={browse} disabled={busy}>
          <FolderOpen size={24} strokeWidth={1.4} />
          <span>
            <strong>{busy ? 'Opening…' : src ? src.title : 'Browse'}</strong>
            <small>Choose a .pptx presentation; click slides to pick them, double-click to insert one</small>
          </span>
        </button>
        {error && <p className="hint">{error}</p>}
        {src && (
          <div className="reuse-grid" role="listbox" aria-label="Slides" aria-multiselectable="true">
            {src.pres.slides.map((sl, i) => (
              <button
                key={sl.id}
                type="button"
                role="option"
                aria-selected={picked.has(i)}
                className={`reuse-item${picked.has(i) ? ' is-active' : ''}`}
                title={slideTitle(sl) || `Slide ${i + 1}`}
                onClick={() => setPicked((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])))}
                onDoubleClick={() => (insert([i]), onClose())}
              >
                <span className="reuse-thumb" style={{ width: src.pres.size.w * scale, height: src.pres.size.h * scale }}>
                  <SlideView slide={sl} index={i} {...presProps(src.pres)} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
                </span>
                <span className="reuse-label">
                  {i + 1}. {slideTitle(sl) || 'Slide'}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="hint">Inserted slides take on the design of this presentation.</p>
      </div>
    </Modal>
  )
}

export function PhotoAlbumDialog({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [opts, setOpts] = useState<A.AlbumOptions>({ perSlide: 1, titles: false, captions: false, grayscale: false, frame: 'none' })
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const picked = await pickFile('image/*', true)
    if (picked.length) setFiles((f) => [...f, ...picked])
  }
  const move = (i: number, d: -1 | 1) =>
    setFiles((f) => {
      const j = i + d
      if (j < 0 || j >= f.length) return f
      const next = [...f]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const create = async () => {
    setBusy(true)
    try {
      await A.createPhotoAlbum(files, opts)
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Photo Album"
      onClose={onClose}
      width={620}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!files.length || busy} onClick={create}>
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="album">
        <div>
          <div className="field-caption">Insert picture from:</div>
          <button type="button" className="btn" onClick={add}>
            File/Disk…
          </button>
          <div className="field-caption">Pictures in album:</div>
          <ol className="pick-list album-list">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <span>{f.name}</span>
                <button type="button" className="btn btn-small" aria-label={`Move ${f.name} up`} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btn-small" aria-label={`Move ${f.name} down`} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="btn btn-small" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, k) => k !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="form">
          <label className="check">
            <input type="checkbox" checked={opts.captions} disabled={!opts.perSlide} onChange={(e) => setOpts({ ...opts, captions: e.target.checked })} /> Captions below ALL pictures
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.grayscale} onChange={(e) => setOpts({ ...opts, grayscale: e.target.checked })} /> ALL pictures black and white
          </label>
          <label className="field-row form-row">
            <span>Picture layout:</span>
            <select value={`${opts.perSlide}${opts.titles ? 't' : ''}`} onChange={(e) => setOpts({ ...opts, perSlide: Number(e.target.value[0]) as A.AlbumOptions['perSlide'], titles: e.target.value.endsWith('t') })}>
              <option value="0">Fit to slide</option>
              <option value="1">1 picture</option>
              <option value="2">2 pictures</option>
              <option value="4">4 pictures</option>
              <option value="1t">1 picture with title</option>
              <option value="2t">2 pictures with title</option>
              <option value="4t">4 pictures with title</option>
            </select>
          </label>
          <label className="field-row form-row">
            <span>Frame shape:</span>
            <select value={opts.frame} disabled={!opts.perSlide} onChange={(e) => setOpts({ ...opts, frame: e.target.value as A.AlbumOptions['frame'] })}>
              <option value="none">Rectangle</option>
              <option value="rect">Simple Frame, Black</option>
              <option value="white">Simple Frame, White</option>
              <option value="rounded">Rounded Rectangle</option>
              <option value="shadow">Center Shadow Rectangle</option>
              <option value="soft">Soft Edge Rectangle</option>
            </select>
          </label>
          <p className="hint">The album is added after the current slide, starting with a title slide.</p>
        </div>
      </div>
    </Modal>
  )
}

// Less common dialogs, loaded on demand: Reuse Slides and Photo Album.
import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { Presentation } from '../model/types'
import { SlideView, presProps } from '../render/SlideView'
import * as A from '../store/actions'
import { Modal, pickFile } from './ui'
import { slideTitleText as slideTitle } from '../model/accessibility'
import { OPEN_ACCEPT, readPresentationFile } from '../io/formats'
import { EQUATION_GALLERY, parseEquation } from '../model/equation'
import { t } from '../i18n'

export function ReuseSlidesDialog({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState<{ pres: Presentation; title: string } | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const browse = async () => {
    const [file] = await pickFile(OPEN_ACCEPT)
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const r = await readPresentationFile(file)
      setSrc(r)
      setPicked(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('The file could not be opened.'))
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
      title={t('Reuse Slides')}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button type="button" className="btn" disabled={!src} onClick={() => src && (insert(src.pres.slides.map((_, i) => i)), onClose())}>
            {t('Insert All Slides')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!picked.size} onClick={() => (insert([...picked].sort((a, b) => a - b)), onClose())}>
            {picked.size > 1 ? t('Insert {n} Slides', { n: picked.size }) : t('Insert Slide')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Close')}
          </button>
        </>
      }
    >
      <div className="reuse">
        <button type="button" className="bs-action" onClick={browse} disabled={busy}>
          <FolderOpen size={24} strokeWidth={1.4} />
          <span>
            <strong>{busy ? t('Opening…') : src ? src.title : t('Browse')}</strong>
            <small>{t('Choose a .pptx presentation; click slides to pick them, double-click to insert one')}</small>
          </span>
        </button>
        {error && <p className="hint">{error}</p>}
        {src && (
          <div className="reuse-grid" role="listbox" aria-label={t('Slides')} aria-multiselectable="true">
            {src.pres.slides.map((sl, i) => (
              <button
                key={sl.id}
                type="button"
                role="option"
                aria-selected={picked.has(i)}
                className={`reuse-item${picked.has(i) ? ' is-active' : ''}`}
                title={slideTitle(sl) || t('Slide {n}', { n: i + 1 })}
                onClick={() => setPicked((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])))}
                onDoubleClick={() => (insert([i]), onClose())}
              >
                <span className="reuse-thumb" style={{ width: src.pres.size.w * scale, height: src.pres.size.h * scale }}>
                  <SlideView slide={sl} index={i} {...presProps(src.pres)} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />
                </span>
                <span className="reuse-label">
                  {i + 1}. {slideTitle(sl) || t('Slide')}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="hint">{t('Inserted slides take on the design of this presentation.')}</p>
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
      title={t('Photo Album')}
      onClose={onClose}
      width={620}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!files.length || busy} onClick={create}>
            {busy ? t('Creating…') : t('Create')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
        </>
      }
    >
      <div className="album">
        <div>
          <div className="field-caption">{t('Insert picture from:')}</div>
          <button type="button" className="btn" onClick={add}>
            {t('File/Disk…')}
          </button>
          <div className="field-caption">{t('Pictures in album:')}</div>
          <ol className="pick-list album-list">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <span>{f.name}</span>
                <button type="button" className="btn btn-small" aria-label={t('Move {name} up', { name: f.name })} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btn-small" aria-label={t('Move {name} down', { name: f.name })} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="btn btn-small" aria-label={t('Remove {name}', { name: f.name })} onClick={() => setFiles((x) => x.filter((_, k) => k !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="form">
          <label className="check">
            <input type="checkbox" checked={opts.captions} disabled={!opts.perSlide} onChange={(e) => setOpts({ ...opts, captions: e.target.checked })} /> {t('Captions below ALL pictures')}
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.grayscale} onChange={(e) => setOpts({ ...opts, grayscale: e.target.checked })} /> {t('ALL pictures black and white')}
          </label>
          <label className="field-row form-row">
            <span>{t('Picture layout:')}</span>
            <select value={`${opts.perSlide}${opts.titles ? 't' : ''}`} onChange={(e) => setOpts({ ...opts, perSlide: Number(e.target.value[0]) as A.AlbumOptions['perSlide'], titles: e.target.value.endsWith('t') })}>
              <option value="0">{t('Fit to slide')}</option>
              <option value="1">{t('1 picture')}</option>
              <option value="2">{t('2 pictures')}</option>
              <option value="4">{t('4 pictures')}</option>
              <option value="1t">{t('1 picture with title')}</option>
              <option value="2t">{t('2 pictures with title')}</option>
              <option value="4t">{t('4 pictures with title')}</option>
            </select>
          </label>
          <label className="field-row form-row">
            <span>{t('Frame shape:')}</span>
            <select value={opts.frame} disabled={!opts.perSlide} onChange={(e) => setOpts({ ...opts, frame: e.target.value as A.AlbumOptions['frame'] })}>
              <option value="none">{t('Rectangle')}</option>
              <option value="rect">{t('Simple Frame, Black')}</option>
              <option value="white">{t('Simple Frame, White')}</option>
              <option value="rounded">{t('Rounded Rectangle')}</option>
              <option value="shadow">{t('Center Shadow Rectangle')}</option>
              <option value="soft">{t('Soft Edge Rectangle')}</option>
            </select>
          </label>
          <p className="hint">{t('The album is added after the current slide, starting with a title slide.')}</p>
        </div>
      </div>
    </Modal>
  )
}

/** Insert > Equation: type an equation in the linear format and see it as it will appear. */
export function EquationDialog({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState('a^2+b^2=c^2')
  const pieces = parseEquation(src)
  return (
    <Modal
      title={t('Equation')}
      width={560}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!src.trim()} onClick={() => (A.insertEquation(src), onClose())}>
            {t('Insert')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          {t('Equation (linear format):')}
          <textarea rows={3} value={src} spellCheck={false} onChange={(e) => setSrc(e.target.value)} style={{ fontFamily: 'monospace' }} />
        </label>
        <p className="hint">{t('Use ^ for superscripts, _ for subscripts, braces to group, and commands such as \\frac, \\sqrt, \\sum, \\int, \\pi, \\alpha, \\le and \\pm.')}</p>
        <span className="field-caption">{t('Preview')}</span>
        <div className="equation-preview" aria-live="polite">
          {pieces.map((p, i) => {
            const node = p.italic ? <i>{p.text}</i> : p.text
            return p.pos === 1 ? <sup key={i}>{node}</sup> : p.pos === -1 ? <sub key={i}>{node}</sub> : <span key={i}>{node}</span>
          })}
        </div>
        <span className="field-caption">{t('Built-in')}</span>
        <div className="row wrap gap">
          {EQUATION_GALLERY.map((g) => (
            <button key={g.label} type="button" className="chip" title={g.source} onClick={() => setSrc(g.source)}>
              {t(g.label)}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

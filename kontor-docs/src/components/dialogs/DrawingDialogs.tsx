import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DialogTabs, Modal, OkCancel, cls } from '../ui'
import { WRAP_LABELS, isFloating, type DrawingAlign, type WrapMode } from '../../editor/Drawing'
import { selectedDrawing, updateDrawing } from '../tabs/DrawingGroups'
import { formatLength, parseLength, PX_PER_IN, type Unit } from '../../units'
import { t } from '../../i18n'

const WRAPS: WrapMode[] = ['inline', 'square', 'tight', 'through', 'topBottom', 'behind', 'front']

/** Layout dialog of drawing objects: Position, Text Wrapping and Size tabs. */
export function LayoutOptionsDialog({ editor, unit, onClose }: { editor: Editor; unit: Unit; onClose: () => void }) {
  const d = selectedDrawing(editor)
  const a = d?.node.attrs ?? {}
  const dom = d ? (editor.view.nodeDOM(d.pos) as HTMLElement | null) : null
  const fmt = (px: number) => formatLength(px / PX_PER_IN, unit)
  const [tab, setTab] = useState<'position' | 'wrap' | 'size'>('wrap')
  const [wrap, setWrap] = useState<WrapMode>((a.wrap as WrapMode) ?? 'inline')
  const [align, setAlign] = useState<DrawingAlign>((a.align as DrawingAlign) ?? 'left')
  const [x, setX] = useState(fmt(Number(a.offsetX) || 0))
  const [y, setY] = useState(fmt(Number(a.offsetY) || 0))
  const [w, setW] = useState(fmt((a.width as number) ?? dom?.offsetWidth ?? 96))
  const [h, setH] = useState(fmt((a.height as number) ?? dom?.offsetHeight ?? 96))
  const [rotation, setRotation] = useState(String(Number(a.rotation) || 0))
  const [lock, setLock] = useState(d?.node.type.name === 'image')
  const ratio = ((a.height as number) ?? dom?.offsetHeight ?? 1) / ((a.width as number) ?? dom?.offsetWidth ?? 1)
  if (!d) return null
  const px = (s: string) => {
    const v = parseLength(s, unit)
    return v == null ? null : Math.round(v * PX_PER_IN)
  }
  const apply = () => {
    const patch: Record<string, unknown> = { wrap, align }
    const ox = px(x)
    const oy = px(y)
    if (isFloating(wrap)) {
      if (ox != null) patch.offsetX = ox
      if (oy != null) patch.offsetY = oy
    }
    const ww = px(w)
    const hh = px(h)
    if (ww) patch.width = ww
    if (hh) patch.height = hh
    const r = Number(rotation)
    if (!isNaN(r)) patch.rotation = ((r % 360) + 360) % 360
    updateDrawing(editor, patch)
    onClose()
  }
  return (
    <Modal title={t('Layout')} onClose={onClose} width={480} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <DialogTabs
        tabs={[
          { id: 'position', label: t('Position') },
          { id: 'wrap', label: t('Text Wrapping') },
          { id: 'size', label: t('Size') },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'wrap' && (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>{t('Wrapping style')}</legend>
            <div className="wrap-grid">
              {WRAPS.map((m) => (
                <button key={m} type="button" className={cls('wrap-tile', wrap === m && 'is-active')} onClick={() => setWrap(m)}>
                  <span className={`wrap-icon wrap-${m}`} />
                  {t(WRAP_LABELS[m])}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="dlg-fieldset" disabled={wrap === 'inline' || isFloating(wrap)}>
            <legend>{t('Wrap text')}</legend>
            <label><input type="radio" checked={align === 'right'} onChange={() => setAlign('right')} /> {t('Left only (picture on the right)')}</label>
            <label><input type="radio" checked={align === 'left'} onChange={() => setAlign('left')} /> {t('Right only (picture on the left)')}</label>
            <label><input type="radio" checked={align === 'center'} disabled={wrap !== 'topBottom'} onChange={() => setAlign('center')} /> {t('Centered (top and bottom)')}</label>
          </fieldset>
        </div>
      )}
      {tab === 'position' && (
        <div className="dlg-stack">
          <p className="dlg-hint">{isFloating(wrap) ? t('Offsets from the paragraph the object is anchored to.') : t('Choose “Behind Text” or “In Front of Text” to place the object freely.')}</p>
          <fieldset className="dlg-fieldset" disabled={!isFloating(wrap)}>
            <legend>{t('Horizontal')}</legend>
            <label className="dlg-inline">
              {t('Absolute position:')}{' '}<input value={x} onChange={(e) => setX(e.target.value)} /> {t('to the right of the anchor')}</label>
          </fieldset>
          <fieldset className="dlg-fieldset" disabled={!isFloating(wrap)}>
            <legend>{t('Vertical')}</legend>
            <label className="dlg-inline">
              {t('Absolute position:')}{' '}<input value={y} onChange={(e) => setY(e.target.value)} /> {t('below the anchor')}</label>
          </fieldset>
        </div>
      )}
      {tab === 'size' && (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset dlg-two">
            <legend>{t('Size')}</legend>
            <label className="dlg-inline">
              {t('Height:')}{' '}
              <input
                value={h}
                onChange={(e) => {
                  setH(e.target.value)
                  const v = px(e.target.value)
                  if (lock && v) setW(fmt(v / ratio))
                }}
              />
            </label>
            <label className="dlg-inline">
              {t('Width:')}{' '}
              <input
                value={w}
                onChange={(e) => {
                  setW(e.target.value)
                  const v = px(e.target.value)
                  if (lock && v) setH(fmt(v * ratio))
                }}
              />
            </label>
            <label className="dlg-inline">
              {t('Rotation:')}{' '}<input type="number" value={rotation} onChange={(e) => setRotation(e.target.value)} /> °
            </label>
            <label>
              <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> {t('Lock aspect ratio')}</label>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}

/** Picture Format > Crop: how much of each side to cut off. */
export function CropDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const d = selectedDrawing(editor)
  const a = d?.node.attrs ?? {}
  const [c, setC] = useState({ top: Math.round((Number(a.cropTop) || 0) * 100), right: Math.round((Number(a.cropRight) || 0) * 100), bottom: Math.round((Number(a.cropBottom) || 0) * 100), left: Math.round((Number(a.cropLeft) || 0) * 100) })
  if (!d || d.node.type.name !== 'image') return null
  const apply = () => {
    const f = (v: number) => Math.max(0, Math.min(0.9, v / 100))
    // Keep the scale of the visible part: the box shrinks with the crop.
    const width = Number(a.width) || (editor.view.nodeDOM(d.pos) as HTMLElement | null)?.offsetWidth || 96
    const height = Number(a.height) || (editor.view.nodeDOM(d.pos) as HTMLElement | null)?.offsetHeight || 96
    const fullW = width / (1 - (Number(a.cropLeft) || 0) - (Number(a.cropRight) || 0))
    const fullH = height / (1 - (Number(a.cropTop) || 0) - (Number(a.cropBottom) || 0))
    const next = { cropTop: f(c.top), cropRight: f(c.right), cropBottom: f(c.bottom), cropLeft: f(c.left) }
    updateDrawing(editor, { ...next, width: Math.round(fullW * (1 - next.cropLeft - next.cropRight)), height: Math.round(fullH * (1 - next.cropTop - next.cropBottom)) })
    onClose()
  }
  const field = (k: keyof typeof c, label: string) => (
    <label className="dlg-inline">
      {label} <input type="number" min={0} max={90} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) || 0 })} /> %
    </label>
  )
  return (
    <Modal title={t('Crop')} onClose={onClose} width={340} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset dlg-two">
        <legend>{t('Crop from')}</legend>
        {field('top', t('Top:'))}
        {field('bottom', t('Bottom:'))}
        {field('left', t('Left:'))}
        {field('right', t('Right:'))}
      </fieldset>
    </Modal>
  )
}

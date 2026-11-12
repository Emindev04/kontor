import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel } from '../ui'
import { t, tx, formatNumber } from '../../i18n'
import { compressPicture, dataUrlBytes } from '../../editor/pictureTools'

const RESOLUTIONS = [
  { ppi: 330, label: tx('HD (330 ppi)') },
  { ppi: 220, label: tx('Print (220 ppi)') },
  { ppi: 150, label: tx('Web (150 ppi)') },
  { ppi: 96, label: tx('E-mail (96 ppi)') },
]

/** Picture Format › Compress Pictures. */
export function CompressDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const selected = editor.state.selection
  const selectedPos = 'node' in selected && (selected as unknown as { node: { type: { name: string } } }).node.type.name === 'image' ? selected.from : null
  const [onlySelected, setOnlySelected] = useState(selectedPos != null)
  const [deleteCrop, setDeleteCrop] = useState(true)
  const [ppi, setPpi] = useState(220)
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    setBusy(true)
    const targets: { pos: number; attrs: Record<string, unknown> }[] = []
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'image' && typeof n.attrs.src === 'string' && n.attrs.src.startsWith('data:') && (!onlySelected || pos === selectedPos)) targets.push({ pos, attrs: n.attrs })
    })
    let before = 0
    let after = 0
    const results: { pos: number; patch: Record<string, unknown> }[] = []
    for (const { pos, attrs } of targets) {
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null
      const img = dom?.querySelector('img') ?? (dom instanceof HTMLImageElement ? dom : null)
      const width = Number(attrs.width) || img?.naturalWidth || 300
      const height = Number(attrs.height) || img?.naturalHeight || 200
      const crop = deleteCrop ? { top: Number(attrs.cropTop) || 0, right: Number(attrs.cropRight) || 0, bottom: Number(attrs.cropBottom) || 0, left: Number(attrs.cropLeft) || 0 } : null
      const hasCrop = !!crop && (crop.top || crop.right || crop.bottom || crop.left)
      try {
        const src = String(attrs.src)
        const next = await compressPicture(src, width, height, { ppi, crop: hasCrop ? crop : null })
        before += dataUrlBytes(src)
        if (next) {
          after += dataUrlBytes(next)
          results.push({ pos, patch: { src: next, ...(hasCrop ? { cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 } : {}) } })
        } else after += dataUrlBytes(src)
      } catch {
        // A picture that cannot be read stays as it is.
      }
    }
    const tr = editor.state.tr
    for (const r of results) {
      const node = tr.doc.nodeAt(r.pos)
      if (node) tr.setNodeMarkup(r.pos, undefined, { ...node.attrs, ...r.patch })
    }
    if (results.length) editor.view.dispatch(tr)
    setBusy(false)
    onClose()
    alert(t('{n} pictures compressed: {before} KB → {after} KB.', { n: results.length, before: formatNumber(Math.round(before / 1024)), after: formatNumber(Math.round(after / 1024)) }))
  }

  return (
    <Modal title={t('Compress Pictures')} onClose={onClose} width={420} footer={<OkCancel onOk={() => void apply()} onCancel={onClose} okDisabled={busy} />}>
      <fieldset className="dlg-fieldset">
        <legend>{t('Compression options')}</legend>
        <label>
          <input type="checkbox" checked={onlySelected} disabled={selectedPos == null} onChange={(e) => setOnlySelected(e.target.checked)} /> {t('Apply only to this picture')}
        </label>
        <label>
          <input type="checkbox" checked={deleteCrop} onChange={(e) => setDeleteCrop(e.target.checked)} /> {t('Delete cropped areas of pictures')}
        </label>
      </fieldset>
      <fieldset className="dlg-fieldset">
        <legend>{t('Resolution')}</legend>
        {RESOLUTIONS.map((r) => (
          <label key={r.ppi}>
            <input type="radio" name="ppi" checked={ppi === r.ppi} onChange={() => setPpi(r.ppi)} /> {t(r.label)}
          </label>
        ))}
      </fieldset>
    </Modal>
  )
}

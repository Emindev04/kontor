// Review > Compare: pick another version of the presentation, review the differences slide by
// slide and accept the changes you want.
import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { Presentation } from '../model/types'
import { acceptChanges, comparePresentations, type Change } from '../model/compare'
import { slideTitleText } from '../model/accessibility'
import { commit, store } from '../store/store'
import { OPEN_ACCEPT, readPresentationFile } from '../io/formats'
import { Modal, pickFile } from './ui'
import { t } from '../i18n'

export function CompareDialog({ onClose }: { onClose: () => void }) {
  const [revised, setRevised] = useState<{ pres: Presentation; title: string } | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const base = store.get().pres

  const browse = async () => {
    const [file] = await pickFile(OPEN_ACCEPT)
    if (!file) return
    setError(null)
    try {
      const r = await readPresentationFile(file)
      const list = comparePresentations(store.get().pres, r.pres)
      setRevised(r)
      setChanges(list)
      setPicked(new Set(list.map((c) => c.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('The file could not be opened.'))
    }
  }

  const accept = (list: Change[]) => {
    if (!revised || !list.length) return
    commit((p) => acceptChanges(p, revised.pres, list))
    onClose()
  }

  const describe = (c: Change) => {
    if (c.kind === 'inserted') return t('Slide inserted: {title}', { title: slideTitleText(revised!.pres.slides[c.revised]) || t('(no title)') })
    if (c.kind === 'deleted') return t('Slide {n} deleted: {title}', { n: c.base + 1, title: slideTitleText(base.slides[c.base]) || t('(no title)') })
    return t('Slide {n} changed: {title}', { n: c.base + 1, title: slideTitleText(base.slides[c.base]) || t('(no title)') })
  }

  return (
    <Modal
      title={t('Compare')}
      width={600}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={browse}>
            <FolderOpen size={16} /> {t('Browse…')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn" disabled={!changes.length} onClick={() => accept(changes)}>
            {t('Accept All')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!picked.size} onClick={() => accept(changes.filter((c) => picked.has(c.id)))}>
            {t('Accept Selected')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('End Review')}
          </button>
        </>
      }
    >
      <div className="form">
        {!revised && <p>{t('Choose another version of this presentation. Its differences are listed here so you can accept them.')}</p>}
        {error && <p className="error">{error}</p>}
        {revised && !changes.length && <p>{t('No differences found.')}</p>}
        {revised && changes.length > 0 && (
          <>
            <p className="hint">{t('Changes in {file}', { file: revised.title })}</p>
            <ul className="compare-list">
              {changes.map((c) => (
                <li key={c.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={(e) =>
                        setPicked((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(c.id)
                          else n.delete(c.id)
                          return n
                        })
                      }
                    />
                    <strong>{describe(c)}</strong>
                  </label>
                  {c.kind === 'changed' && (
                    <ul>
                      {c.details.map((d, i) => (
                        <li key={i}>{t(d.text, d.vars)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  )
}

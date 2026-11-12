import { useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { icons } from 'lucide-react'
import { Modal, OkCancel, cls } from '../ui'
import { t } from '../../i18n'

// Insert > Icons: the bundled icon set, inserted as pictures. Loaded on demand (it is large).

const ICON_NAMES = Object.keys(icons)

export default function IconsDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const grid = useRef<HTMLDivElement>(null)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '')
    return (q ? ICON_NAMES.filter((n) => n.toLowerCase().includes(q)) : ICON_NAMES).slice(0, 240)
  }, [query])
  const insert = () => {
    const content = picked.flatMap((name) => {
      const svg = grid.current?.querySelector(`[data-icon="${name}"] svg`)
      if (!svg) return []
      const clone = svg.cloneNode(true) as SVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('width', '96')
      clone.setAttribute('height', '96')
      clone.setAttribute('stroke', '#1F1F1F')
      const src = `data:image/svg+xml,${encodeURIComponent(clone.outerHTML)}`
      return [{ type: 'image', attrs: { src, alt: name.replace(/([a-z])([A-Z])/g, '$1 $2'), width: 96, height: 96 } }]
    })
    if (content.length) editor.chain().focus().insertContent(content).run()
    onClose()
  }
  return (
    <Modal title={t('Insert Icons')} onClose={onClose} width={640} footer={<OkCancel okLabel={picked.length ? t('Insert ({n})', { n: picked.length }) : t('Insert')} onOk={insert} onCancel={onClose} />}>
      <input className="icon-search" autoFocus placeholder={t('Search icons')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('Search icons')} />
      <div className="icon-grid" ref={grid}>
        {list.map((name) => {
          const Icon = icons[name as keyof typeof icons]
          return (
            <button
              key={name}
              type="button"
              data-icon={name}
              title={name.replace(/([a-z])([A-Z])/g, '$1 $2')}
              className={cls('icon-tile', picked.includes(name) && 'is-active')}
              onClick={() => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]))}
            >
              <Icon size={28} strokeWidth={1.6} />
            </button>
          )
        })}
      </div>
      <p className="dlg-hint">{list.length === 240 ? t('Showing the first 240 matches. ') : ''}{t('Icons are inserted as pictures you can resize and recolor with Picture Format.')}</p>
    </Modal>
  )
}


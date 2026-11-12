import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { clonePage } from '../io/print'

type Props = {
  pagesEl: HTMLElement | null
  pages: number
  stride: number
  width: number
  height: number
  layout: 'multiple' | 'sideBySide'
  onPick: (page: number) => void
  onClose: () => void
}

/**
 * View > Multiple Pages and Side to Side: copies of the pages, several at a time or in a
 * horizontal strip. Clicking a page goes back to editing at that page.
 */
export function PageOverview({ pagesEl, pages, stride, width, height, layout, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const pick = useRef(onPick)
  pick.current = onPick
  useEffect(() => {
    const host = ref.current
    if (!host || !pagesEl) return
    host.innerHTML = ''
    const box = host.getBoundingClientRect()
    const scale = layout === 'sideBySide' ? Math.min(1, (box.height - 40) / height) : Math.min(0.5, (box.width - 48) / 2 / width - 0.02)
    for (let k = 0; k < pages; k++) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'overview-page'
      cell.style.width = `${width * scale}px`
      cell.style.height = `${height * scale}px`
      cell.title = `Page ${k + 1}`
      const copy = clonePage(pagesEl, k, stride, width, height)
      copy.style.transform = `scale(${scale})`
      copy.style.transformOrigin = '0 0'
      cell.appendChild(copy)
      const label = document.createElement('span')
      label.className = 'overview-label'
      label.textContent = String(k + 1)
      cell.appendChild(label)
      cell.addEventListener('click', () => pick.current(k))
      host.appendChild(cell)
    }
  }, [pagesEl, pages, stride, width, height, layout])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={`page-overview is-${layout}`} role="dialog" aria-label={layout === 'sideBySide' ? 'Side to Side' : 'Multiple Pages'}>
      <div className="overview-bar">
        <strong>{layout === 'sideBySide' ? 'Side to Side' : 'Multiple Pages'}</strong>
        <span className="dlg-hint">Click a page to edit it.</span>
        <button type="button" className="sb-btn" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div ref={ref} className="overview-grid" />
    </div>
  )
}
